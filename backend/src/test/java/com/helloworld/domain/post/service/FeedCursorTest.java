package com.helloworld.domain.post.service;

import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * FeedCursor(불투명 base64 커서) 코덱 단위 테스트.
 * encode↔decode 왕복·널·형식오류 처리를 검증한다(순수 Java, DB/스프링 불필요).
 */
class FeedCursorTest {

    @Test
    @DisplayName("encode→decode 왕복: 다섯 필드(pinned·createdAt·postId·asOf·followingIds)가 그대로 복원된다")
    void roundTrip() {
        FeedCursor original = new FeedCursor(
                true,
                LocalDateTime.of(2026, 8, 6, 11, 20, 30),
                1234L,
                LocalDateTime.of(2026, 8, 6, 12, 0, 0),
                List.of(2L, 3L, 5L));

        FeedCursor decoded = FeedCursor.decodeOrNull(FeedCursor.encode(original));

        assertThat(decoded).isNotNull();
        assertThat(decoded.pinned()).isTrue();
        assertThat(decoded.createdAt()).isEqualTo(original.createdAt());
        assertThat(decoded.postId()).isEqualTo(1234L);
        assertThat(decoded.asOf()).isEqualTo(original.asOf());
        assertThat(decoded.followingIds()).containsExactly(2L, 3L, 5L);
    }

    @Test
    @DisplayName("pinned=false도 정확히 왕복된다 (팔로잉 스냅샷 포함)")
    void roundTripNotPinned() {
        FeedCursor original = new FeedCursor(
                false,
                LocalDateTime.of(2026, 1, 1, 0, 0, 0),
                7L,
                LocalDateTime.of(2026, 1, 1, 0, 30, 0),
                List.of(9L));

        FeedCursor decoded = FeedCursor.decodeOrNull(FeedCursor.encode(original));

        assertThat(decoded.pinned()).isFalse();
        assertThat(decoded.postId()).isEqualTo(7L);
        assertThat(decoded.followingIds()).containsExactly(9L);
    }

    @Test
    @DisplayName("팔로잉 0명(빈 리스트)도 왕복 후 빈 리스트로 복원된다")
    void roundTripEmptyFollowing() {
        FeedCursor original = new FeedCursor(
                false,
                LocalDateTime.of(2026, 8, 6, 10, 0, 0),
                100L,
                LocalDateTime.of(2026, 8, 6, 12, 0, 0),
                List.of());

        FeedCursor decoded = FeedCursor.decodeOrNull(FeedCursor.encode(original));

        assertThat(decoded).isNotNull();
        assertThat(decoded.followingIds()).isEmpty();
    }

    @Test
    @DisplayName("토큰이 null이거나 빈 문자열이면 null(첫 페이지)을 반환한다")
    void nullOrBlankIsFirstPage() {
        assertThat(FeedCursor.decodeOrNull(null)).isNull();
        assertThat(FeedCursor.decodeOrNull("")).isNull();
        assertThat(FeedCursor.decodeOrNull("   ")).isNull();
    }

    @Test
    @DisplayName("base64가 아니거나 형식이 깨진 토큰이면 COMMON_INVALID_PARAM")
    void malformedTokenThrows() {
        // base64url에 없는 문자(@) 포함 → 디코딩 자체 실패
        assertThatThrownBy(() -> FeedCursor.decodeOrNull("not_a_valid_@@@_token"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMON_INVALID_PARAM);
    }

    @Test
    @DisplayName("base64는 유효하나 구분자·필드 수가 맞지 않으면 COMMON_INVALID_PARAM")
    void validBase64ButWrongStructureThrows() {
        // "1|2026-08-06T12:00:00" (필드 3개 부족) 를 base64url로 인코딩한 값
        String badStructure = java.util.Base64.getUrlEncoder().withoutPadding()
                .encodeToString("1|2026-08-06T12:00:00".getBytes(java.nio.charset.StandardCharsets.UTF_8));

        assertThatThrownBy(() -> FeedCursor.decodeOrNull(badStructure))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMON_INVALID_PARAM);
    }
}
