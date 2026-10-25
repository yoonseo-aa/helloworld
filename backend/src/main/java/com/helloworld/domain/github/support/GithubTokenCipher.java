package com.helloworld.domain.github.support;

import com.helloworld.domain.github.client.GithubOAuthProperties;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * GitHub access token 암/복호화 (AES-256-GCM).
 *
 * <p>토큰은 사용자를 대신해 GitHub API를 호출할 수 있는 자격증명이다. DB가 유출됐을 때
 * 그대로 쓰일 수 있으므로 평문으로 저장하지 않는다.
 *
 * <p><b>GCM을 쓰는 이유</b> — CBC 같은 모드는 암호문이 조작돼도 복호화가 그냥 성공한다.
 * GCM은 인증 태그를 함께 검증해서, 값이 한 바이트라도 바뀌면 복호화가 실패한다.
 *
 * <p><b>IV는 매번 새로 만들어 암호문 앞에 붙인다.</b> 같은 키 + 같은 IV로 두 번 암호화하면
 * GCM은 키가 사실상 노출되는 수준으로 취약해진다. 저장 형식은
 * {@code Base64(IV 12바이트 || 암호문+태그)} 한 덩어리라 컬럼도 하나면 된다.
 */
@Component
public class GithubTokenCipher {

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_LENGTH = 12;      // GCM 권장 IV 길이(바이트)
    private static final int TAG_LENGTH_BIT = 128;

    /** 키가 설정되지 않았으면 null. GitHub 기능을 실제로 쓸 때만 문제가 되도록 의도한 것이다. */
    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    /**
     * <b>키가 없어도 기동은 막지 않는다.</b> 여기서 예외를 던지면 GITHUB_TOKEN_ENC_KEY를
     * 설정하지 않은 팀원은 GitHub과 무관한 작업을 하려 해도 앱이 아예 뜨지 않는다.
     * (구글 OAuth 설정도 같은 이유로 빈 값을 기본으로 둔다.)
     * 대신 실제로 토큰을 암/복호화하려는 순간 아래 {@link #requireKey}가 원인을 명확히 알려준다.
     */
    public GithubTokenCipher(GithubOAuthProperties props) {
        String encoded = props.getTokenEncryptionKey();
        if (!StringUtils.hasText(encoded)) {
            this.key = null;
            return;
        }
        byte[] raw = Base64.getDecoder().decode(encoded);
        if (raw.length != 16 && raw.length != 24 && raw.length != 32) {
            // 이건 "설정을 안 한 것"이 아니라 "잘못 설정한 것"이라 즉시 알리는 편이 낫다.
            throw new IllegalStateException(
                    "oauth.github.token-encryption-key 길이가 잘못됐습니다: " + raw.length +
                    "바이트. AES 키는 16/24/32바이트여야 합니다. (생성: openssl rand -base64 32)");
        }
        this.key = new SecretKeySpec(raw, "AES");
    }

    private SecretKeySpec requireKey() {
        if (key == null) {
            throw new IllegalStateException(
                    "oauth.github.token-encryption-key 가 비어 있어 GitHub 연동을 사용할 수 없습니다. " +
                    "GITHUB_TOKEN_ENC_KEY 환경변수에 Base64 인코딩된 32바이트 키를 넣으세요. " +
                    "(생성: openssl rand -base64 32)");
        }
        return key;
    }

    /** 평문 토큰 → Base64(IV || 암호문+태그) */
    public String encrypt(String plainText) {
        SecretKeySpec key = requireKey();
        try {
            byte[] iv = new byte[IV_LENGTH];
            random.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BIT, iv));
            byte[] cipherText = cipher.doFinal(plainText.getBytes(java.nio.charset.StandardCharsets.UTF_8));

            byte[] merged = ByteBuffer.allocate(iv.length + cipherText.length)
                    .put(iv).put(cipherText).array();
            return Base64.getEncoder().encodeToString(merged);
        } catch (Exception e) {
            // 여기까지 오면 JCE 환경 문제다. 원인 문자열 노출 없이 서버 오류로 처리한다.
            throw new BusinessException(ErrorCode.COMMON_SERVER_ERROR);
        }
    }

    /** Base64(IV || 암호문+태그) → 평문 토큰 */
    public String decrypt(String encoded) {
        SecretKeySpec key = requireKey();
        try {
            byte[] merged = Base64.getDecoder().decode(encoded);
            ByteBuffer buffer = ByteBuffer.wrap(merged);

            byte[] iv = new byte[IV_LENGTH];
            buffer.get(iv);
            byte[] cipherText = new byte[buffer.remaining()];
            buffer.get(cipherText);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BIT, iv));
            return new String(cipher.doFinal(cipherText), java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            // 키를 교체했거나 저장값이 손상된 경우. 재연동을 유도한다.
            throw new BusinessException(ErrorCode.GITHUB_TOKEN_EXPIRED);
        }
    }
}
