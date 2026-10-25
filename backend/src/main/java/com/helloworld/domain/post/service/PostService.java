package com.helloworld.domain.post.service;

import com.helloworld.domain.follow.service.FollowService;
import com.helloworld.domain.like.service.PostLikeQueryService;
import com.helloworld.domain.like.service.PostLikeQueryService.PostLikeStatus;
import com.helloworld.domain.post.dto.request.PostCreateRequest;
import com.helloworld.domain.post.dto.response.FeedItemResponse;
import com.helloworld.domain.post.dto.response.FeedListResponse;
import com.helloworld.domain.post.dto.response.PageInfoResponse;
import com.helloworld.domain.post.dto.response.PostCreateResponse;
import com.helloworld.domain.post.dto.response.PostDetailResponse;
import com.helloworld.domain.post.dto.response.UserPostResponse;
import com.helloworld.domain.post.entity.Post;
import com.helloworld.domain.post.entity.PostMedia;
import com.helloworld.domain.post.mapper.PostMapper;
import com.helloworld.domain.post.mapper.PostTagRow;
import com.helloworld.domain.post.summary.service.PostSummaryService;
import com.helloworld.domain.post.summary.support.RepoSummaryCodec;
import com.helloworld.domain.user.service.UserService;
import com.helloworld.global.common.CursorResponse;
import com.helloworld.global.common.PageSize;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 게시물 비즈니스 로직 (서비스 계층).
 *
 * [학습 포인트] 왜 트랜잭션을 Service에 두는가?
 *  - 게시물 생성은 posts / post_medias / post_tags 등 여러 테이블 INSERT가 "모두 성공하거나
 *    모두 실패"해야 한다(원자성). 중간에 예외가 나면 앞선 INSERT도 롤백되어야 데이터가 깨지지 않는다.
 *  - @Transactional을 이 메서드에 붙이면, 메서드가 정상 종료하면 커밋 / RuntimeException이 터지면 롤백.
 *  - 이 경계를 Controller/Mapper가 아니라 "여러 Mapper 호출을 조율하는 Service"에 두는 이유가 이것.
 *
 * [주의] @Transactional은 스프링 AOP 프록시로 동작한다 → 같은 클래스 내부 메서드 호출(self-invocation)엔
 *        적용되지 않는다. 아래 saveImages/saveTechStacks는 private 헬퍼일 뿐, 이미 createPost의
 *        트랜잭션 안에서 실행되므로 문제없다(별도 @Transactional 불필요).
 */
@Service
@RequiredArgsConstructor
public class PostService {

    private final PostMapper postMapper;
    private final FollowService followService;              // 팔로잉 user_id 목록 (Redis 정본, 피드 기준)
    private final PostLikeQueryService postLikeQueryService; // 좋아요 배치 읽기 (Redis 정본)
    private final UserService userService;                  // 대상 유저 존재 확인 (그리드 조회 시 USER_NOT_FOUND)
    private final RepoSummaryCodec repoSummaryCodec;        // ai_summary JSON ↔ 객체 변환
    private final PostSummaryService postSummaryService;    // 미리보기 때 만들어둔 요약을 꺼내온다

    /**
     * 메인 피드 조회 — 전체 공개 게시물을 보여주되, 팔로우한 유저의 최근 30분 글을 상단에 고정한다(본인 글 제외).
     * 정렬 = is_pinned DESC(고정 먼저), created_at DESC, post_id DESC. 커서는 이 3-키 복합 커서(불투명 토큰)다.
     *
     * <p>과거엔 "팔로잉만" 보여줘 글 적은 유저 팔로우 시 피드가 붕괴했고, 이후 통합 최신순으로 바꿨다.
     * 이번엔 "붕괴 없이 상단만 잠깐 고정" — 팔로우 글은 30분간 위로 올리고, 그 뒤엔 전체 최신순에 자연히 섞인다.
     * 고정 판단은 뷰어의 팔로잉 목록(Redis)으로 계산한다(팔로우 0명이면 고정 없음 = 순수 최신순).
     *
     * thumbnail_url·is_pinned는 조회 SQL이 직접 내려주고(CARD_NEWS 등 null이면 첫 이미지 폴백),
     * tech_stacks(post_tags)와 like_count/is_liked(Redis 정본)는 조회 후 배치로 채운다.
     *
     * @param loginUserId 로그인 사용자 id (인증 필수, 본인 글 제외·팔로잉 조회에 사용)
     * @param cursorToken 직전 페이지 마지막 항목의 불투명 커서 토큰 (첫 페이지는 널·빈값)
     * @param postType    유형 필터 (PROJECT/CARD_NEWS, 널·빈값이면 전체). 그 외 값이면 400.
     * @param size        페이지 크기 ([1, PageSize.MAX]로 보정됨)
     */
    @Transactional(readOnly = true)
    public FeedListResponse getFeed(Long loginUserId, String cursorToken, String postType, int size) {
        String type = validatePostTypeOrNull(postType); // null이면 전체, 값이 있으면 해당 유형만(탭 필터)
        size = PageSize.clamp(size); // 과대/음수 요청 방어 (컨트롤러와 무관하게 서비스가 보장)

        FeedCursor cursor = FeedCursor.decodeOrNull(cursorToken); // 널이면 첫 페이지, 깨졌으면 400
        // 상단 고정 판단용 팔로잉. 첫 페이지는 최신 조회 후 커서에 스냅샷으로 고정하고, 이후 페이지는
        // 그 스냅샷을 재사용한다 → 스크롤 중 팔로우 변경으로 고정 여부가 뒤집혀 생기는 중복/누락 방지.
        List<Long> followingIds = (cursor != null)
                ? cursor.followingIds()
                : followService.getFollowingUserIds(loginUserId);

        // 고정 판정 기준시각: 첫 페이지는 DB NOW()로 고정하고 커서에 실어, 이후 페이지가 재사용한다
        // (페이지마다 NOW() 재계산 시 30분 경계 글이 재등장하는 중복 방지).
        LocalDateTime asOf = (cursor != null) ? cursor.asOf() : postMapper.selectDbNow();

        // 커서 3키는 "있으면 셋 다, 없으면(첫 페이지) 셋 다 null" — 한곳에서 함께 풀어 일관성을 보장한다.
        Boolean cursorPinned = (cursor == null) ? null : cursor.pinned();
        LocalDateTime cursorCreatedAt = (cursor == null) ? null : cursor.createdAt();
        Long cursorPostId = (cursor == null) ? null : cursor.postId();

        int fetch = size + 1; // has_next 판단용으로 1개 더 가져온다
        List<FeedItemResponse> rows = postMapper.selectPublicFeed(
                cursorPinned, cursorCreatedAt, cursorPostId,
                asOf, fetch, loginUserId, type, followingIds);

        boolean hasNext = rows.size() > size;
        List<FeedItemResponse> feeds = hasNext ? new ArrayList<>(rows.subList(0, size)) : rows;

        enrichFeed(feeds, loginUserId);

        String nextCursor = null;
        if (hasNext) {
            FeedItemResponse last = feeds.get(feeds.size() - 1);
            nextCursor = FeedCursor.encode(new FeedCursor(
                    Boolean.TRUE.equals(last.getPinned()), last.getCreatedAt(), last.getPostId(),
                    asOf, followingIds));
        }
        return FeedListResponse.of(feeds, PageInfoResponse.of(nextCursor, hasNext));
    }

    /**
     * 게시물 상세 조회. 조회 시 view_count를 1 증가시킨다(그래서 readOnly 아님).
     * 비공개 글은 작성자 본인만 열람 가능하며, 아니면 POST_FORBIDDEN.
     *
     * like_count/is_liked는 Redis 정본, image_urls는 post_medias, tech_stacks는 post_tags,
     * author.is_following은 팔로우 정본에서 각각 조회해 채운다.
     *
     * @param loginUserId 로그인 사용자 id (인증 필수)
     * @param postId      대상 게시물 id
     */
    @Transactional
    public PostDetailResponse getPostDetail(Long loginUserId, Long postId) {
        PostDetailResponse detail = postMapper.selectPostDetail(postId);
        if (detail == null) {
            throw new BusinessException(ErrorCode.POST_NOT_FOUND);
        }

        // 비공개 글은 작성자만 열람 가능
        boolean mine = detail.getAuthor().getUserId().equals(loginUserId);
        if (Boolean.FALSE.equals(detail.getIsPublic()) && !mine) {
            throw new BusinessException(ErrorCode.POST_FORBIDDEN);
        }

        // 조회수 증가(원자적) 후 반영된 값을 응답에 노출
        postMapper.increaseViewCount(postId);
        detail.setViewCount(detail.getViewCount() + 1);

        // ai_summary 컬럼 값을 그대로 내보낸다(마크다운). 렌더링은 프론트가 맡는다.
        // 파싱해서 구조화하지 않는 이유는 PostDetailResponse.summary 주석 참고 —
        // 형식이 다른 옛 값이 통째로 사라지는 문제가 있었다.
        detail.setSummary(detail.getAiSummary());

        // DB/Redis에서 오는 파생 값들을 채운다
        detail.setTechStacks(postMapper.selectPostTechStacks(postId));
        detail.setImageUrls(postMapper.selectPostImages(List.of(postId)).stream()
                .map(PostMedia::getMediaUrl)
                .toList());

        PostLikeStatus like = postLikeQueryService.getLikeStatuses(List.of(postId), loginUserId).get(postId);
        detail.setLikeCount(like != null ? like.likeCount() : 0L);
        detail.setIsLiked(like != null && like.liked());

        detail.getAuthor().setIsFollowing(
                followService.isFollowing(loginUserId, detail.getAuthor().getUserId()));

        return detail;
    }

    /**
     * 유저 프로필 그리드 조회 (특정 유저 글의 썸네일만, post_id 내림차순 커서).
     * 본인 프로필이면 비공개 글까지, 타인 프로필이면 공개 글만 보인다.
     *
     * @param viewerId     로그인 사용자 id (인증 필수, 본인/타인 판별용)
     * @param targetUserId 그리드 주인 user_id (path)
     * @param cursor       직전 페이지 마지막 post_id (첫 페이지는 null)
     * @param size         페이지 크기 ([1, PageSize.MAX]로 보정됨)
     */
    @Transactional(readOnly = true)
    public CursorResponse<UserPostResponse> getUserPosts(Long viewerId, Long targetUserId, Long cursor, int size) {
        size = PageSize.clamp(size); // 과대/음수 요청 방어 (컨트롤러와 무관하게 서비스가 보장)
        userService.ensureExists(targetUserId); // 없는 유저면 USER_NOT_FOUND (엔티티 로딩 없이 존재만 확인)

        boolean onlyPublic = !targetUserId.equals(viewerId); // 본인이면 비공개 포함
        List<UserPostResponse> fetched = postMapper.selectUserPosts(targetUserId, onlyPublic, cursor, size + 1);
        return CursorResponse.of(fetched, size, UserPostResponse::getPostId);
    }

    /**
     * 피드 유형 필터 값을 검증한다. 널·빈값이면 전체(null 반환), PROJECT/CARD_NEWS면 그 값,
     * 그 외 값이면 COMMON_INVALID_PARAM(400). 게시물 생성과 같은 유형 상수를 참조해 표기를 일치시킨다.
     */
    private String validatePostTypeOrNull(String postType) {
        if (postType == null || postType.isBlank()) {
            return null;
        }
        String type = postType.trim();
        if (!PostCreateRequest.TYPE_PROJECT.equals(type) && !PostCreateRequest.TYPE_CARD_NEWS.equals(type)) {
            throw new BusinessException(ErrorCode.COMMON_INVALID_PARAM);
        }
        return type;
    }

    /**
     * 피드 항목에 기술스택 태그(post_tags→tags)와 좋아요(Redis 정본)를 배치로 채운다.
     * thumbnail_url은 조회 SQL이 직접 내려주므로 여기서 채우지 않는다.
     */
    private void enrichFeed(List<FeedItemResponse> feeds, Long loginUserId) {
        if (feeds.isEmpty()) {
            return;
        }
        List<Long> postIds = feeds.stream().map(FeedItemResponse::getPostId).toList();

        Map<Long, List<String>> tagsByPost = new HashMap<>();
        for (PostTagRow row : postMapper.selectPostTechStacksByPostIds(postIds)) {
            tagsByPost.computeIfAbsent(row.getPostId(), k -> new ArrayList<>()).add(row.getTagName());
        }
        Map<Long, PostLikeStatus> likeStatuses = postLikeQueryService.getLikeStatuses(postIds, loginUserId);

        for (FeedItemResponse feed : feeds) {
            feed.setTechStacks(tagsByPost.getOrDefault(feed.getPostId(), List.of()));
            PostLikeStatus status = likeStatuses.get(feed.getPostId());
            feed.setLikeCount(status != null ? status.likeCount() : 0L);
            feed.setIsLiked(status != null && status.liked());
        }
    }

    /**
     * 게시물 생성 (본문 + 이미지 + 기술스택 태그를 한 트랜잭션에 저장).
     *
     * @param userId  작성자 id (컨트롤러가 인증 토큰에서 추출해 전달)
     * @param request 게시물 생성 요청 DTO
     * @return 생성된 게시물 id를 담은 응답 DTO
     */
    @Transactional
    public PostCreateResponse createPost(Long userId, PostCreateRequest request) {
        // 1) 게시물 본문 저장 (deploy_url→project_link)
        //
        // ai_summary 에는 GitHub 주소가 있을 때만 자리표시자를 넣는다.
        // 이 INSERT에 함께 실려 나가므로 추가 쿼리가 없고, 조회 시 status=PENDING 이 보여
        // 화면이 "요약 생성 중"을 표시할 수 있다. 없으면 몇 초 동안 빈 화면이라
        // 사용자에게는 고장으로 읽힌다.
        //
        // 요청의 summary(사용자 작성 요약)는 더 이상 쓰지 않는다 — 이 컬럼은 이제
        // AI가 만든 구조화 JSON 전용이다.
        Post post = Post.builder()
                .userId(userId)
                .postType(request.getPostType())
                .content(request.getContent())
                .thumbnailUrl(request.getThumbnailUrl())
                .githubUrl(request.getGithubUrl())
                .projectLink(request.getDeployUrl())
                .aiSummary(summaryJson(userId, request))
                .build();
        // [학습 포인트] INSERT 후 자동 생성된 PK(post_id) 회수
        //  - MyBatis의 useGeneratedKeys 설정(XML 참고)이 DB의 AUTO_INCREMENT 값을
        //    방금 넘긴 post 객체의 postId 필드에 다시 채워준다. 그래서 아래서 바로 꺼내 쓸 수 있다.
        postMapper.insertPost(post);

        Long postId = post.getPostId();

        // 2) 이미지(카드뉴스) 저장 → post_medias
        saveImages(postId, request.getImageUrls());

        // 3) 기술 스택 저장 → tags(find-or-create) + post_tags
        saveTechStacks(postId, request.getTechStacks());

        return PostCreateResponse.of(postId);
    }


    /**
     * 게시물 단건 조회 (없으면 예외).
     * 다른 도메인(좋아요 등)이 "게시물이 실제로 존재하는지"를 확인할 때 이걸 쓴다.
     * (Controller가 아니라 Service끼리 호출하므로 계층 규약 위반 아님)
     */
    @Transactional(readOnly = true)
    public Post getPostOrThrow(Long postId) {
        return postMapper.selectById(postId)
                .orElseThrow(() -> new BusinessException(ErrorCode.POST_NOT_FOUND));
    }

    /**
     * image_urls를 순번과 함께 post_medias(IMAGE)로 저장.
     *
     * <p>빈 문자열을 걸러내는 이유: 그대로 넣으면 media_url이 빈 값인 행이 생겨
     * 목록에서 깨진 이미지로 보인다. 걸러낸 뒤 순번을 다시 매겨 display_order에
     * 구멍이 생기지 않게 한다(0,1,2...). 기술스택 저장도 같은 방식으로 빈 값을 건너뛴다.
     *
     * <p><b>걸러내는 판정은 요청 검증과 같은 {@code StringUtils.hasText}다</b>
     * ({@code PostCreateRequest.isCardNewsImageValid}). 같은 술어를 쓰기 때문에
     * "카드뉴스 검증은 통과했는데 저장할 이미지가 없다"가 나올 수 없다.
     * 한쪽 판정만 바꾸면 그 대응이 깨지므로 두 곳을 함께 고쳐야 한다.
     */
    private void saveImages(Long postId, List<String> imageUrls) {
        if (CollectionUtils.isEmpty(imageUrls)) {
            return;
        }
        List<PostMedia> medias = new ArrayList<>();
        int order = 0;
        for (String url : imageUrls) {
            if (!StringUtils.hasText(url)) {
                continue;
            }
            medias.add(PostMedia.builder()
                    .postId(postId)
                    .mediaType("IMAGE")
                    .mediaUrl(url.trim())
                    .displayOrder(order++)
                    .build());
        }
        if (medias.isEmpty()) {
            return;
        }
        postMapper.insertPostMedias(medias);
    }

    /** tech_stacks를 태그로 저장(없으면 생성)하고 게시물과 연결 */
    private void saveTechStacks(Long postId, List<String> techStacks) {
        if (CollectionUtils.isEmpty(techStacks)) {
            return;
        }
        List<Long> tagIds = new ArrayList<>();
        for (String rawName : techStacks) {
            if (rawName == null || rawName.isBlank()) {
                continue;
            }
            String tagName = rawName.trim();
            postMapper.insertTagIfAbsent(tagName); // 없으면 생성, 있으면 무시
            tagIds.add(postMapper.selectTagIdByName(tagName));
        }
        if (!tagIds.isEmpty()) {
            postMapper.insertPostTags(postId, tagIds);
        }
    }

    /**
     * 저장할 요약을 확정해 JSON 문자열로 돌려준다.
     *
     * <p>사용자가 작성 폼에서 고친 요약이 요청에 실려 온다. 그대로 쓰되 출처 정보
     * (생성 시각·모델·수정 여부)는 서버가 채운다 — 판단은
     * {@link com.helloworld.domain.post.summary.service.PostSummaryService#resolveForSave} 가 한다.
     *
     * <p>여기서 <b>요약을 다시 만들지 않는다.</b> 만들면 게시물 작성이 5~15초 멈추고
     * 비용도 한 번 더 든다. 분석을 거치지 않았으면 요약 없이 저장한다 —
     * 요약은 게시물의 부가 정보다.
     */
    private String summaryJson(Long userId, PostCreateRequest request) {
        return postSummaryService
                .resolveForSave(userId, request.getGithubUrl(), request.getSummary())
                .map(repoSummaryCodec::encode)
                .orElse(null);
    }
}
