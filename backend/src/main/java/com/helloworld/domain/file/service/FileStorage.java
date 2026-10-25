package com.helloworld.domain.file.service;

import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.SetBucketPolicyArgs;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 파일 저장소(버킷) 준비 상태를 관리한다.
 *
 * <p><b>왜 기동 시 한 번으로 끝내지 않는가</b> (코드 리뷰 지적 반영):
 * 버킷 준비를 {@code ApplicationReadyEvent}에서만 하면, 그 순간 MinIO가 아직 안 떠 있으면
 * <b>재시작할 때까지 업로드가 영구히 실패</b>한다. compose의 {@code depends_on}은
 * {@code service_started}(컨테이너 시작)라서 "컨테이너는 떴지만 MinIO는 아직 준비 안 됨"이
 * 실제로 가능하다 — 느린 호스트나 콜드 스타트에서 일어난다.
 *
 * <p>그래서 준비 여부를 플래그로 들고, 아직 준비되지 않았으면 <b>업로드 시점에 다시 시도</b>한다.
 * 성공하면 플래그를 세워 이후 요청은 확인 비용을 치르지 않는다.
 * MinIO가 늦게 떠도 첫 업로드에서 스스로 회복한다.
 *
 * <p>모니터링 관점: 준비 실패는 기동 로그(WARN)와 업로드 시점 로그(ERROR) 양쪽에 남는다.
 * 별도 헬스체크 엔드포인트는 두지 않았다 — actuator가 아직 의존성에 없어 새로 추가해야 하고,
 * "업로드가 400/500으로 실패하는지"는 이미 응답과 로그로 드러난다. 필요해지면 그때 붙인다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FileStorage {

    private final ObjectProvider<MinioClient> minioClientProvider;

    @Value("${app.minio.bucket}")
    private String bucket;

    /** 버킷이 존재하고 정책까지 적용된 상태인가. 한 번 true가 되면 다시 확인하지 않는다. */
    private final AtomicBoolean ready = new AtomicBoolean(false);

    /** 기동 직후 미리 준비해 첫 업로드가 느려지지 않게 한다. 실패해도 기동을 막지 않는다. */
    @EventListener(ApplicationReadyEvent.class)
    public void prepareOnStartup() {
        prepare();
    }

    /**
     * 업로드 전에 호출한다. 이미 준비됐으면 아무것도 하지 않는다.
     *
     * @return 사용 가능한 클라이언트. 준비하지 못했으면 null
     */
    public MinioClient clientIfReady() {
        MinioClient client = minioClientProvider.getIfAvailable();
        if (client == null) {
            return null;   // 설정이 없어 클라이언트 자체가 없다. MinioConfig가 이미 경고를 남겼다.
        }
        if (ready.get() || prepare()) {
            return client;
        }
        return null;
    }

    /** @return 준비 성공 여부 */
    private boolean prepare() {
        MinioClient client = minioClientProvider.getIfAvailable();
        if (client == null) {
            return false;
        }
        try {
            if (!client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build())) {
                client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
                log.info("[minio] 버킷을 생성했습니다: {}", bucket);
            }
            client.setBucketPolicy(SetBucketPolicyArgs.builder()
                    .bucket(bucket)
                    .config(publicReadPolicy(bucket))
                    .build());
            if (ready.compareAndSet(false, true)) {
                log.info("[minio] 버킷 준비 완료: {} (공개 읽기)", bucket);
            }
            return true;
        } catch (Exception e) {
            // 업로드 기능만 실패하고 나머지 기능은 정상 동작해야 한다.
            // 다음 업로드 요청에서 다시 시도하므로, MinIO가 늦게 떠도 스스로 회복한다.
            log.warn("[minio] 버킷 준비 실패 — 다음 업로드 요청에서 다시 시도합니다. bucket={}", bucket, e);
            return false;
        }
    }

    /**
     * {@code s3:GetObject}만 익명 허용.
     *
     * <p>공개 읽기로 두는 이유: 프로필 사진과 게시물 이미지는 SNS에서 공개 콘텐츠다.
     * 비공개로 두면 이미지를 볼 때마다 presigned URL을 발급해야 하고, 그 URL은 만료돼서
     * 캐시도 안 되고 이미 렌더된 화면이 깨진다. <b>쓰기는 여전히 자격증명이 필요하다</b> —
     * 업로드는 백엔드만 하고 브라우저는 GET만 한다.
     *
     * <p>목록 조회({@code ListBucket})는 주지 않는다 — 키를 모르면 무엇이 있는지 뒤질 수 없다.
     */
    private String publicReadPolicy(String bucket) {
        return """
                {
                  "Version": "2012-10-17",
                  "Statement": [
                    {
                      "Effect": "Allow",
                      "Principal": {"AWS": ["*"]},
                      "Action": ["s3:GetObject"],
                      "Resource": ["arn:aws:s3:::%s/*"]
                    }
                  ]
                }
                """.formatted(bucket);
    }
}
