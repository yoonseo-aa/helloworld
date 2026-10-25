package com.helloworld.domain.post.service;

import com.helloworld.domain.follow.service.FollowService;
import com.helloworld.domain.like.service.PostLikeQueryService;
import com.helloworld.domain.like.service.PostLikeQueryService.PostLikeStatus;
import com.helloworld.domain.post.dto.response.FeedItemResponse;
import com.helloworld.domain.post.dto.response.FeedListResponse;
import com.helloworld.domain.post.dto.response.PostAuthorResponse;
import com.helloworld.domain.post.dto.response.PostDetailResponse;
import com.helloworld.domain.post.dto.response.UserPostResponse;
import com.helloworld.domain.post.entity.PostMedia;
import com.helloworld.domain.post.mapper.PostMapper;
import com.helloworld.domain.post.mapper.PostTagRow;
import com.helloworld.domain.user.service.UserService;
import com.helloworld.global.common.CursorResponse;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * PostService 메인 피드 조회 단위 테스트.
 * Mapper·FollowService·PostLikeQueryService는 목으로 대체하고 조합 로직만 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class PostServiceTest {

    private static final Long ME = 1L;
    /** 첫 페이지 고정 기준시각(selectDbNow() 대체값). 커서에 실려 다음 페이지가 재사용한다. */
    private static final LocalDateTime AS_OF = LocalDateTime.of(2026, 8, 6, 12, 0, 0);

    @Mock
    private PostMapper postMapper;

    @Mock
    private FollowService followService;

    @Mock
    private PostLikeQueryService postLikeQueryService;

    @Mock
    private UserService userService;

    @InjectMocks
    private PostService postService;

    @Test
    @DisplayName("피드: 전체 공개글을 조회하고 좋아요·태그를 채운다 (팔로잉은 상단 고정 판단용으로만 조회)")
    void feedReturnsPublicRecency() {
        given(followService.getFollowingUserIds(ME)).willReturn(List.of());
        given(postMapper.selectDbNow()).willReturn(AS_OF);
        given(postMapper.selectPublicFeed(isNull(), isNull(), isNull(), eq(AS_OF), eq(11), eq(ME), isNull(), eq(List.of())))
                .willReturn(new ArrayList<>(List.of(feedItem(50L), feedItem(49L))));
        given(postMapper.selectPostTechStacksByPostIds(List.of(50L, 49L)))
                .willReturn(List.of(tagRow(50L, "Spring"), tagRow(50L, "Redis")));
        given(postLikeQueryService.getLikeStatuses(List.of(50L, 49L), ME))
                .willReturn(Map.of(50L, new PostLikeStatus(true, 7L)));

        FeedListResponse res = postService.getFeed(ME, null, null, 10);

        assertThat(res.getFeeds()).hasSize(2);

        FeedItemResponse first = res.getFeeds().get(0);
        assertThat(first.getPostId()).isEqualTo(50L);
        assertThat(first.getThumbnailUrl()).isEqualTo("thumb-50.jpg"); // 조회 SQL이 내려준 값
        assertThat(first.getTechStacks()).containsExactly("Spring", "Redis");
        assertThat(first.getLikeCount()).isEqualTo(7L);
        assertThat(first.getIsLiked()).isTrue();

        // 좋아요/태그 없는 글은 0 / false / 빈 배열
        FeedItemResponse second = res.getFeeds().get(1);
        assertThat(second.getLikeCount()).isEqualTo(0L);
        assertThat(second.getIsLiked()).isFalse();
        assertThat(second.getTechStacks()).isEmpty();

        assertThat(res.getPageInfo().getHasNext()).isFalse();
        assertThat(res.getPageInfo().getNextCursor()).isNull();
    }

    @Test
    @DisplayName("피드: 상단 고정 판단을 위해 팔로잉 목록을 조회해 매퍼에 전달한다")
    void feedConsultsFollowingForPinning() {
        List<Long> following = List.of(2L, 3L);
        given(followService.getFollowingUserIds(ME)).willReturn(following);
        given(postMapper.selectDbNow()).willReturn(AS_OF);
        given(postMapper.selectPublicFeed(isNull(), isNull(), isNull(), eq(AS_OF), eq(11), eq(ME), isNull(), eq(following)))
                .willReturn(new ArrayList<>(List.of(feedItem(9L))));
        given(postMapper.selectPostTechStacksByPostIds(List.of(9L))).willReturn(List.of());
        given(postLikeQueryService.getLikeStatuses(List.of(9L), ME)).willReturn(Map.of());

        FeedListResponse res = postService.getFeed(ME, null, null, 10);

        assertThat(res.getFeeds()).hasSize(1);
        verify(followService).getFollowingUserIds(ME);
        verify(postMapper).selectPublicFeed(isNull(), isNull(), isNull(), eq(AS_OF), eq(11), eq(ME), isNull(), eq(following));
    }

    @Test
    @DisplayName("size+1개가 오면 has_next=true, 마지막을 잘라내고 next_cursor(불투명 토큰)를 채운다")
    void hasNextTrimsAndSetsCursor() {
        // size=2 인데 3개 반환 → 다음 페이지 있음
        given(followService.getFollowingUserIds(ME)).willReturn(List.of());
        given(postMapper.selectDbNow()).willReturn(AS_OF);
        given(postMapper.selectPublicFeed(isNull(), isNull(), isNull(), eq(AS_OF), eq(3), eq(ME), isNull(), eq(List.of())))
                .willReturn(new ArrayList<>(List.of(feedItem(30L), feedItem(29L), feedItem(28L))));
        given(postMapper.selectPostTechStacksByPostIds(List.of(30L, 29L))).willReturn(List.of());
        given(postLikeQueryService.getLikeStatuses(List.of(30L, 29L), ME)).willReturn(Map.of());

        FeedListResponse res = postService.getFeed(ME, null, null, 2);

        assertThat(res.getFeeds()).extracting(FeedItemResponse::getPostId).containsExactly(30L, 29L);
        assertThat(res.getPageInfo().getHasNext()).isTrue();
        // next_cursor는 불투명 토큰 → 디코딩하면 마지막 항목(29)과 고정 기준시각(AS_OF)을 담는다
        FeedCursor decoded = FeedCursor.decodeOrNull(res.getPageInfo().getNextCursor());
        assertThat(decoded).isNotNull();
        assertThat(decoded.postId()).isEqualTo(29L);
        assertThat(decoded.asOf()).isEqualTo(AS_OF);        // 첫 페이지 기준시각이 커서에 실린다
        assertThat(decoded.followingIds()).isEmpty();       // 첫 페이지 팔로잉 스냅샷(여기선 0명)도 커서에 실린다
    }

    @Test
    @DisplayName("피드: post_type이 오면 해당 유형만 매퍼로 필터한다")
    void feedFiltersByPostType() {
        given(followService.getFollowingUserIds(ME)).willReturn(List.of());
        given(postMapper.selectDbNow()).willReturn(AS_OF);
        given(postMapper.selectPublicFeed(isNull(), isNull(), isNull(), eq(AS_OF), eq(11), eq(ME), eq("PROJECT"), eq(List.of())))
                .willReturn(new ArrayList<>(List.of(feedItem(7L))));
        given(postMapper.selectPostTechStacksByPostIds(List.of(7L))).willReturn(List.of());
        given(postLikeQueryService.getLikeStatuses(List.of(7L), ME)).willReturn(Map.of());

        postService.getFeed(ME, null, "PROJECT", 10);

        verify(postMapper).selectPublicFeed(isNull(), isNull(), isNull(), eq(AS_OF), eq(11), eq(ME), eq("PROJECT"), eq(List.of()));
    }

    @Test
    @DisplayName("피드: 알 수 없는 post_type이면 COMMON_INVALID_PARAM, 조회는 하지 않는다")
    void feedRejectsInvalidPostType() {
        assertThatThrownBy(() -> postService.getFeed(ME, null, "WRONG", 10))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMON_INVALID_PARAM);

        // 검증이 먼저라 팔로잉 조회·기준시각·피드 조회 모두 하지 않음
        verify(followService, never()).getFollowingUserIds(anyLong());
        verify(postMapper, never()).selectDbNow();
        verify(postMapper, never()).selectPublicFeed(any(), any(), any(), any(), anyInt(), any(), any(), any());
    }

    @Test
    @DisplayName("피드: 다음 페이지는 커서의 asOf·팔로잉 스냅샷을 재사용하고 DB now()·팔로잉을 다시 읽지 않는다 (드리프트·팔로우변경 중복/누락 방지)")
    void feedNextPageReusesCursorSnapshot() {
        // 첫 페이지의 기준시각·팔로잉을 담은 커서 토큰(=2페이지 요청). 이후 페이지는 이 스냅샷을 그대로 써야 한다.
        LocalDateTime cursorAsOf = LocalDateTime.of(2026, 8, 6, 11, 30, 0);
        LocalDateTime cursorCreatedAt = LocalDateTime.of(2026, 8, 6, 11, 20, 0);
        List<Long> following = List.of(2L);
        String token = FeedCursor.encode(new FeedCursor(true, cursorCreatedAt, 50L, cursorAsOf, following));
        given(postMapper.selectPublicFeed(eq(true), eq(cursorCreatedAt), eq(50L), eq(cursorAsOf),
                eq(11), eq(ME), isNull(), eq(following)))
                .willReturn(new ArrayList<>(List.of(feedItem(40L))));
        given(postMapper.selectPostTechStacksByPostIds(List.of(40L))).willReturn(List.of());
        given(postLikeQueryService.getLikeStatuses(List.of(40L), ME)).willReturn(Map.of());

        postService.getFeed(ME, token, null, 10);

        verify(postMapper, never()).selectDbNow();                        // asOf는 커서 재사용 → DB now() 재조회 안 함
        verify(followService, never()).getFollowingUserIds(anyLong());    // 팔로잉도 커서 스냅샷 재사용 → 재조회 안 함
        verify(postMapper).selectPublicFeed(eq(true), eq(cursorCreatedAt), eq(50L), eq(cursorAsOf),
                eq(11), eq(ME), isNull(), eq(following));
    }

    @Test
    @DisplayName("피드: 커서 토큰이 깨졌으면 COMMON_INVALID_PARAM, 조회는 하지 않는다")
    void feedRejectsMalformedCursor() {
        assertThatThrownBy(() -> postService.getFeed(ME, "not_a_valid_@@@_token", null, 10))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMON_INVALID_PARAM);

        verify(postMapper, never()).selectPublicFeed(any(), any(), any(), any(), anyInt(), any(), any(), any());
    }

    @Test
    @DisplayName("상세: 공개 글이면 파생값을 채우고 조회수를 1 증가시킨다")
    void detailSuccess() {
        given(postMapper.selectPostDetail(100L)).willReturn(detail(100L, 5L, true, 10));
        given(postMapper.selectPostTechStacks(100L)).willReturn(List.of("Spring", "Redis"));
        given(postMapper.selectPostImages(List.of(100L))).willReturn(List.of(image(100L, "u1.png")));
        given(postLikeQueryService.getLikeStatuses(List.of(100L), ME))
                .willReturn(Map.of(100L, new PostLikeStatus(true, 9L)));
        given(followService.isFollowing(ME, 5L)).willReturn(true);

        PostDetailResponse r = postService.getPostDetail(ME, 100L);

        assertThat(r.getTechStacks()).containsExactly("Spring", "Redis");
        assertThat(r.getImageUrls()).containsExactly("u1.png");
        assertThat(r.getLikeCount()).isEqualTo(9L);
        assertThat(r.getIsLiked()).isTrue();
        assertThat(r.getViewCount()).isEqualTo(11); // 10 + 1
        assertThat(r.getAuthor().getIsFollowing()).isTrue();
        verify(postMapper).increaseViewCount(100L);
    }

    @Test
    @DisplayName("상세: 없는 게시물이면 POST_NOT_FOUND, 조회수도 안 올린다")
    void detailNotFound() {
        given(postMapper.selectPostDetail(100L)).willReturn(null);

        assertThatThrownBy(() -> postService.getPostDetail(ME, 100L))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.POST_NOT_FOUND);

        verify(postMapper, never()).increaseViewCount(100L);
    }

    @Test
    @DisplayName("상세: 비공개 글을 작성자가 아닌 사람이 보면 POST_FORBIDDEN")
    void detailPrivateForbidden() {
        given(postMapper.selectPostDetail(100L)).willReturn(detail(100L, 5L, false, 10)); // 작성자 5, 조회자 ME(1)

        assertThatThrownBy(() -> postService.getPostDetail(ME, 100L))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.POST_FORBIDDEN);

        verify(postMapper, never()).increaseViewCount(100L);
    }

    @Test
    @DisplayName("상세: 비공개 글이라도 작성자 본인은 열람 가능")
    void detailPrivateOwnerAllowed() {
        given(postMapper.selectPostDetail(100L)).willReturn(detail(100L, ME, false, 10)); // 작성자 == ME
        given(postMapper.selectPostTechStacks(100L)).willReturn(List.of());
        given(postMapper.selectPostImages(List.of(100L))).willReturn(List.of());
        given(postLikeQueryService.getLikeStatuses(List.of(100L), ME)).willReturn(Map.of());
        given(followService.isFollowing(ME, ME)).willReturn(false);

        PostDetailResponse r = postService.getPostDetail(ME, 100L);

        assertThat(r.getViewCount()).isEqualTo(11);
        verify(postMapper).increaseViewCount(100L);
    }

    private static final Long TARGET = 9L;

    @Test
    @DisplayName("유저 그리드: 타인 프로필은 공개글만(onlyPublic=true)으로 조회한다")
    void userPostsOthersPublicOnly() {
        given(postMapper.selectUserPosts(TARGET, true, null, 16))
                .willReturn(new ArrayList<>(List.of(userPost(30L), userPost(29L))));

        CursorResponse<UserPostResponse> res = postService.getUserPosts(ME, TARGET, null, 15);

        assertThat(res.getItems()).hasSize(2);
        assertThat(res.isHasNext()).isFalse();
        assertThat(res.getNextCursor()).isNull();
        verify(userService).ensureExists(TARGET);
    }

    @Test
    @DisplayName("유저 그리드: 본인 프로필은 비공개 포함(onlyPublic=false)으로 조회한다")
    void userPostsOwnerIncludesPrivate() {
        given(postMapper.selectUserPosts(ME, false, null, 16))
                .willReturn(new ArrayList<>(List.of(userPost(5L))));

        CursorResponse<UserPostResponse> res = postService.getUserPosts(ME, ME, null, 15);

        assertThat(res.getItems()).hasSize(1);
        verify(postMapper).selectUserPosts(ME, false, null, 16);
    }

    @Test
    @DisplayName("유저 그리드: size+1개가 오면 has_next=true, 마지막을 잘라 next_cursor를 채운다")
    void userPostsHasNext() {
        given(postMapper.selectUserPosts(TARGET, true, null, 3))
                .willReturn(new ArrayList<>(List.of(userPost(30L), userPost(29L), userPost(28L))));

        CursorResponse<UserPostResponse> res = postService.getUserPosts(ME, TARGET, null, 2);

        assertThat(res.getItems()).extracting(UserPostResponse::getPostId).containsExactly(30L, 29L);
        assertThat(res.isHasNext()).isTrue();
        assertThat(res.getNextCursor()).isEqualTo(29L);
    }

    @Test
    @DisplayName("유저 그리드: 없는 유저면 USER_NOT_FOUND, 조회는 하지 않는다")
    void userPostsUserNotFound() {
        willThrow(new BusinessException(ErrorCode.USER_NOT_FOUND))
                .given(userService).ensureExists(TARGET);

        assertThatThrownBy(() -> postService.getUserPosts(ME, TARGET, null, 15))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.USER_NOT_FOUND);

        verify(postMapper, never()).selectUserPosts(any(), anyBoolean(), any(), anyInt());
    }

    @Test
    @DisplayName("유저 그리드: cursor를 매퍼로 그대로 전달하고 다음 페이지 커서를 잇는다")
    void userPostsForwardsCursor() {
        given(postMapper.selectUserPosts(TARGET, true, 100L, 3))
                .willReturn(new ArrayList<>(List.of(userPost(99L), userPost(98L), userPost(97L))));

        CursorResponse<UserPostResponse> res = postService.getUserPosts(ME, TARGET, 100L, 2);

        assertThat(res.getItems()).extracting(UserPostResponse::getPostId).containsExactly(99L, 98L);
        assertThat(res.getNextCursor()).isEqualTo(98L);
        verify(postMapper).selectUserPosts(TARGET, true, 100L, 3);
    }

    @Test
    @DisplayName("유저 그리드: 결과가 비면 items 빈 배열·has_next=false·next_cursor=null")
    void userPostsEmpty() {
        given(postMapper.selectUserPosts(TARGET, true, null, 16))
                .willReturn(new ArrayList<>());

        CursorResponse<UserPostResponse> res = postService.getUserPosts(ME, TARGET, null, 15);

        assertThat(res.getItems()).isEmpty();
        assertThat(res.isHasNext()).isFalse();
        assertThat(res.getNextCursor()).isNull();
    }

    /* ===================== 픽스처 ===================== */

    private UserPostResponse userPost(long postId) {
        UserPostResponse item = new UserPostResponse();
        item.setPostId(postId);
        return item;
    }

    private PostDetailResponse detail(long postId, long authorId, boolean isPublic, int viewCount) {
        PostAuthorResponse author = new PostAuthorResponse();
        author.setUserId(authorId);
        PostDetailResponse d = new PostDetailResponse();
        d.setPostId(postId);
        d.setAuthor(author);
        d.setIsPublic(isPublic);
        d.setViewCount(viewCount);
        return d;
    }

    private FeedItemResponse feedItem(long postId) {
        FeedItemResponse item = new FeedItemResponse();
        item.setPostId(postId);
        item.setContent("content-" + postId);
        item.setThumbnailUrl("thumb-" + postId + ".jpg"); // 조회 SQL이 채우는 값 모사
        item.setCommentCount(0);
        item.setCreatedAt(LocalDateTime.of(2026, 8, 6, 12, 0, 0)); // 커서 인코딩에 필요
        return item;
    }

    private PostTagRow tagRow(long postId, String tagName) {
        PostTagRow row = new PostTagRow();
        row.setPostId(postId);
        row.setTagName(tagName);
        return row;
    }

    private PostMedia image(long postId, String url) {
        PostMedia media = new PostMedia();
        media.setPostId(postId);
        media.setMediaUrl(url);
        return media;
    }
}
