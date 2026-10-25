package com.helloworld.domain.file.service;

import com.helloworld.domain.file.dto.response.FileUploadResponse;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * 파일 업로드. 지금은 이미지(프로필 사진·게시물 이미지)만 다룬다.
 *
 * <p>DB에 기록을 남기지 않는 이유: 프론트는 업로드 결과 URL만 필요하고, 그 URL은
 * 게시물·프로필 저장 시점에 각 테이블에 들어간다. 파일 테이블을 따로 두면 같은 정보를
 * 두 곳에서 관리하게 되고 정합성 문제가 생긴다. 어디서도 참조되지 않는 파일(orphan)은
 * 프론트가 "게시·저장 확정 시점에만 업로드"하는 규칙으로 줄이고 있다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FileService {

    /**
     * 허용 확장자와 그에 대응하는 Content-Type.
     *
     * <p>Content-Type을 우리가 정해서 저장하는 이유: 클라이언트가 보낸 값을 그대로 믿으면
     * {@code text/html}로 올려 저장소 도메인에서 스크립트를 실행시킬 수 있다(저장형 XSS).
     * 확장자를 화이트리스트로 걸러 우리가 아는 타입만 지정한다.
     */
    private static final Map<String, String> ALLOWED = Map.of(
            "jpg", "image/jpeg",
            "jpeg", "image/jpeg",
            "png", "image/png",
            "webp", "image/webp",
            "gif", "image/gif");

    /** 앱에서도 한 번 더 막는다 — nginx·Spring 설정이 환경마다 어긋날 수 있다 */
    private static final long MAX_SIZE = 5L * 1024 * 1024;

    private static final DateTimeFormatter KEY_PREFIX = DateTimeFormatter.ofPattern("yyyy/MM");

    /**
     * 저장소 준비 상태를 아는 협력자. {@code MinioClient}를 직접 주입받지 않는다.
     *
     * <p>직접 주입하면 안 되는 이유 (2026-08-04 운영 장애): 자격증명이 비어 있으면 클라이언트
     * 빈이 만들어지지 않고(null), 그때 이 서비스 생성이 실패해 스프링 컨텍스트가 통째로 취소된다
     * → <b>앱 크래시 루프</b>. 업로드와 무관한 로그인·피드·채팅까지 멈춘다.
     *
     * <p>{@link FileStorage}가 "쓸 수 있으면 클라이언트를, 아니면 null"을 돌려주므로
     * 업로드 요청만 실패하고 앱은 정상 동작한다. 버킷이 아직 없으면 그쪽에서 다시 준비를 시도한다.
     */
    private final FileStorage fileStorage;

    @Value("${app.minio.bucket}")
    private String bucket;

    @Value("${app.minio.public-base-url}")
    private String publicBaseUrl;

    public FileUploadResponse upload(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.FILE_EMPTY);
        }
        if (file.getSize() > MAX_SIZE) {
            throw new BusinessException(ErrorCode.FILE_TOO_LARGE);
        }

        String extension = extensionOf(file.getOriginalFilename());
        String contentType = ALLOWED.get(extension);
        if (contentType == null) {
            throw new BusinessException(ErrorCode.FILE_UNSUPPORTED_TYPE);
        }

        // 설정이 없거나 버킷을 준비하지 못한 상태. 원인은 기동/준비 시점 로그에 남아 있다.
        MinioClient minioClient = fileStorage.clientIfReady();
        if (minioClient == null) {
            log.error("[minio] 저장소가 준비되지 않아 업로드를 처리할 수 없습니다. app.minio.* 설정과 MinIO 상태를 확인하세요.");
            throw new BusinessException(ErrorCode.FILE_UPLOAD_FAILED);
        }

        String key = buildKey(extension);

        try (InputStream in = file.getInputStream()) {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(key)
                    .stream(in, file.getSize(), -1)
                    .contentType(contentType)
                    .build());
        } catch (Exception e) {
            // 원인을 로그에 남긴다 — 사용자에게는 원인을 노출하지 않지만(내부 주소·자격증명 힌트),
            // 서버에서는 이것 없이 진단이 불가능하다.
            log.error("[minio] 업로드 실패 (bucket={}, key={})", bucket, key, e);
            throw new BusinessException(ErrorCode.FILE_UPLOAD_FAILED);
        }

        return FileUploadResponse.of(publicBaseUrl + "/" + key);
    }

    /**
     * 저장 키. {@code 2026/08/{uuid}.jpg} 형태로 만든다.
     *
     * <p>원본 파일명을 쓰지 않는 이유가 세 가지 있다.
     * <ul>
     *   <li>같은 이름을 올리면 남의 파일을 덮어쓴다(MinIO는 같은 키면 덮어쓴다).</li>
     *   <li>{@code ../} 같은 경로 조작 문자가 섞일 수 있다.</li>
     *   <li>한글·공백·특수문자가 URL에서 깨진다.</li>
     * </ul>
     * 년/월로 나누는 것은 나중에 오래된 파일을 정리하거나 옮길 때 범위를 잡기 쉽게 하려는 것이다.
     */
    private String buildKey(String extension) {
        return LocalDate.now().format(KEY_PREFIX) + "/" + UUID.randomUUID() + "." + extension;
    }

    /** 확장자만 소문자로 추출. 점이 없거나 이름이 없으면 빈 문자열이라 화이트리스트에서 걸린다. */
    private String extensionOf(String originalFilename) {
        if (!StringUtils.hasText(originalFilename)) {
            return "";
        }
        int dot = originalFilename.lastIndexOf('.');
        if (dot < 0 || dot == originalFilename.length() - 1) {
            return "";
        }
        return originalFilename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }
}
