package com.helloworld.global.config;

import io.minio.MinioClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

/**
 * MinIO 클라이언트 배선.
 *
 * <p>버킷 준비·상태 관리는 {@link com.helloworld.domain.file.service.FileStorage}가 맡는다 —
 * 설정 클래스는 "무엇을 주입할지"만 정하고, "저장소가 쓸 준비가 됐는지"는 그 저장소를 쓰는
 * 도메인의 관심사다. 버킷 준비를 기동 시 한 번만 하면 MinIO가 늦게 뜬 경우 재시작까지
 * 업로드가 영구 실패하므로, 재시도 판단이 필요한 그 로직을 도메인 쪽에 두었다.
 */
@Slf4j
@Configuration
public class MinioConfig {

    @Value("${app.minio.endpoint}")
    private String endpoint;

    @Value("${app.minio.access-key}")
    private String accessKey;

    @Value("${app.minio.secret-key}")
    private String secretKey;

    /**
     * MinIO 클라이언트. <b>설정이 없거나 잘못되면 예외를 던지지 않고 null을 돌려준다.</b>
     *
     * <p>여기서 예외를 던지면 안 되는 이유 (2026-08-04 운영 장애로 확인):
     * 자격증명이 빈 값이면 {@code MinioClient.builder()}가
     * "AccessKey and SecretKey must not be empty"로 예외를 던진다. 그러면 이 빈을 주입받는
     * 쪽의 생성이 실패하고 스프링 컨텍스트가 통째로 취소되어 <b>앱이 크래시 루프에 빠진다</b> —
     * 파일 업로드와 무관한 로그인·피드·채팅까지 전부 멈춘다.
     * 실제로 환경변수를 잘못된 {@code .env}에 넣었다가 운영이 내려갔다.
     *
     * <p>null을 돌려주면 스프링은 NullBean으로 등록하고, {@code ObjectProvider}로 받는 쪽은
     * "없음"으로 처리할 수 있다. 팔로우·좋아요가 {@code SqsTemplate}에 쓰는 것과 같은 패턴이다.
     * <b>부가 기능의 설정 실패는 그 기능만 실패해야 한다.</b>
     */
    @Bean
    public MinioClient minioClient() {
        if (!StringUtils.hasText(accessKey) || !StringUtils.hasText(secretKey)) {
            log.warn("[minio] 자격증명(app.minio.access-key/secret-key)이 비어 있어 파일 업로드를 사용할 수 없습니다. "
                    + "앱은 정상 기동합니다. 배포라면 compose 프로젝트 디렉터리의 .env 를 확인하세요.");
            return null;
        }
        try {
            return MinioClient.builder()
                    .endpoint(endpoint)
                    .credentials(accessKey, secretKey)
                    .build();
        } catch (Exception e) {
            log.warn("[minio] 클라이언트 생성 실패 — 파일 업로드를 사용할 수 없습니다(앱은 정상 기동). endpoint={}",
                    endpoint, e);
            return null;
        }
    }
}
