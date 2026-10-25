package com.helloworld.domain.post.mapper;

import com.helloworld.domain.post.dto.response.FeedItemResponse;
import com.helloworld.domain.post.dto.response.PostDetailResponse;
import com.helloworld.domain.post.dto.response.UserPostResponse;
import com.helloworld.domain.post.entity.Post;
import com.helloworld.domain.post.entity.PostMedia;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * 게시물 DB 접근 (MyBatis). SQL은 resources/mapper/post/PostMapper.xml 에 작성.
 * namespace가 이 인터페이스 FQCN과 일치해야 한다.
 *
 * tags 는 여러 도메인이 공유하는 마스터 테이블이라, 태그 find-or-create는
 * INSERT IGNORE(중복 무시) + SELECT 로 동시성에 안전하게 처리한다.
 */
@Mapper
public interface PostMapper {

    /** 게시물 등록. 성공 시 post.postId 채워짐 */
    int insertPost(Post post);

    /** 게시물 단건 조회 (좋아요 토글 시 존재 확인 + 작성자 id 확인용) */
    Optional<Post> selectById(@Param("postId") Long postId);

    /**
     * 프로젝트 요약(JSON) 저장. 게시물 작성 뒤 비동기로 만들어져 나중에 채워진다.
     *
     * <p>{@code updated_at}은 건드리지 않는다 — 사용자가 글을 고친 게 아니라 시스템이
     * 부가 정보를 채운 것이라, 여기서 갱신하면 목록의 "수정됨" 표시가 잘못 뜬다.
     */
    int updateAiSummary(@Param("postId") Long postId, @Param("aiSummary") String aiSummary);

    /** 미디어(이미지 등) 목록 일괄 등록 */
    int insertPostMedias(@Param("medias") List<PostMedia> medias);

    /** 태그가 없으면 생성(있으면 무시). tag_type=TECH 로 저장 */
    int insertTagIfAbsent(@Param("tagName") String tagName);

    /** 태그명으로 tag_id 조회 (없으면 null) */
    Long selectTagIdByName(@Param("tagName") String tagName);

    /** 게시물-태그 연결 일괄 등록 */
    int insertPostTags(@Param("postId") Long postId, @Param("tagIds") List<Long> tagIds);

    /**
     * 메인 피드: 전체 공개 게시물을 조회하되, 팔로우한 유저의 최근 30분 글을 상단에 고정한다(본인 글 제외).
     * 정렬 = is_pinned DESC(고정 먼저), created_at DESC, post_id DESC. 커서는 이 3-키 복합 커서다.
     * thumbnail_url·is_pinned는 이 SQL이 직접 내려주고(CARD_NEWS 등 null이면 첫 이미지 폴백),
     * tech_stacks/like_count/is_liked는 여기서 채우지 않는다(Service가 post_tags·Redis로 보완).
     *
     * <p>고정 조건: {@code user_id IN (followingIds) AND created_at >= #{asOf} - INTERVAL 30 MINUTE}.
     * followingIds가 비면 is_pinned는 항상 false → 순수 최신순(팔로우해도 피드가 붕괴하지 않는다).
     * asOf는 첫 페이지에서 고정한 기준시각(커서에 실려 다음 페이지가 재사용) — NOW() 재계산 시
     * 30분 경계를 넘긴 글이 재등장하는 중복을 막는다.
     *
     * @param cursorPinned    직전 마지막 항목의 is_pinned (첫 페이지는 null)
     * @param cursorCreatedAt 직전 마지막 항목의 created_at (첫 페이지는 null)
     * @param cursorPostId    직전 마지막 항목의 post_id (첫 페이지는 null → 커서 조건 미적용)
     * @param asOf            고정 판정 기준시각 (첫 페이지는 selectDbNow(), 이후는 커서의 asOf)
     * @param limit           가져올 개수 (has_next 판단 위해 보통 size+1)
     * @param viewerId        로그인 사용자 id (본인 글 제외용)
     * @param postType        유형 필터 (PROJECT/CARD_NEWS, null이면 전체)
     * @param followingIds    뷰어가 팔로우하는 user_id 목록 (고정 tier 판단용, 비면 고정 없음)
     */
    List<FeedItemResponse> selectPublicFeed(@Param("cursorPinned") Boolean cursorPinned,
                                            @Param("cursorCreatedAt") LocalDateTime cursorCreatedAt,
                                            @Param("cursorPostId") Long cursorPostId,
                                            @Param("asOf") LocalDateTime asOf,
                                            @Param("limit") int limit,
                                            @Param("viewerId") Long viewerId,
                                            @Param("postType") String postType,
                                            @Param("followingIds") List<Long> followingIds);

    /** 피드 고정 기준시각 고정용 DB 현재시각(NOW()). 첫 페이지에서 한 번 읽어 커서에 싣는다. */
    LocalDateTime selectDbNow();

    /** 여러 게시물의 이미지(post_medias, IMAGE)를 post_id·display_order 순으로 배치 조회. */
    List<PostMedia> selectPostImages(@Param("postIds") List<Long> postIds);

    /**
     * 게시물 상세 1건 조회(작성자 조인). 없으면 null.
     * like_count/is_liked/image_urls/tech_stacks/author.is_following은 여기서 채우지 않는다(Service 보완).
     * is_public은 접근 제어용으로 함께 내려받는다(응답 미노출).
     */
    PostDetailResponse selectPostDetail(@Param("postId") Long postId);

    /** 게시물의 기술 스택 태그명 목록(post_tags→tags). 상세 조회 단건용. */
    List<String> selectPostTechStacks(@Param("postId") Long postId);

    /**
     * 여러 게시물의 기술 스택 태그를 배치 조회(post_tags→tags). 피드 목록용(N+1 방지).
     * (post_id, tag_name) 행을 post_id·post_tag_id 순으로 내려주면 Service가 post별로 그룹핑한다.
     *
     * @param postIds 대상 post_id 목록 (비어 있으면 호출하지 않는다)
     */
    List<PostTagRow> selectPostTechStacksByPostIds(@Param("postIds") List<Long> postIds);

    /** 조회수 1 증가. */
    int increaseViewCount(@Param("postId") Long postId);

    /**
     * 유저 프로필 그리드: 특정 유저의 게시물을 썸네일 3필드만 post_id 내림차순 커서로 조회.
     * 본인 프로필이면 비공개 글까지 보이도록 onlyPublic=false로 호출한다(타인은 true → 공개글만).
     *
     * @param userId     대상 유저 id
     * @param onlyPublic true면 공개글만(is_public=TRUE), false면 비공개 포함
     * @param cursor     직전 페이지 마지막 post_id (첫 페이지는 null)
     * @param limit      가져올 개수 (has_next 판단 위해 보통 size+1)
     */
    List<UserPostResponse> selectUserPosts(@Param("userId") Long userId,
                                           @Param("onlyPublic") boolean onlyPublic,
                                           @Param("cursor") Long cursor,
                                           @Param("limit") int limit);
}
