import { useRef } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import { uploadFile } from '@/api/files'
import { useAuthStore } from '@/stores/useAuthStore'
import {
  analyzeProject,
  createComment,
  createPost,
  deleteComment,
  generateAiSummary,
  getGithubRepos,
  getLikedPosts,
  getPostComments,
  getPostDetail,
  getPostLikes,
  getPosts,
  toggleCommentLike,
  toggleLike,
} from './api'
import type {
  AnalyzeProjectRequest,
  FeedItem,
  FeedResponse,
  LikedPostsResponse,
  PostComment,
  PostCommentsResponse,
  PostCreateRequest,
  PostDetailResponse,
  PostType,
} from './types'

/** 피드 무한 스크롤 페이지 크기 (명세: 피드 10). */
const FEED_PAGE_SIZE = 10
/** 댓글 페이지 크기 (명세: 댓글 5). */
const COMMENT_PAGE_SIZE = 5
/** 좋아요 목록 페이지 크기 — 명세에 없어 댓글(5)과 같게 맞춤. */
const LIKE_PAGE_SIZE = 5
/** 좋아요한 게시물 페이지 크기 (백엔드 UserLikedPostController 기본값 20과 동일). */
const LIKED_POSTS_PAGE_SIZE = 20

/** 메인 피드 무한 스크롤. postType이 없으면 전체. */
export function useFeed(postType?: PostType) {
  return useInfiniteQuery({
    queryKey: ['posts', 'feed', postType ?? 'ALL'],
    queryFn: ({ pageParam }) =>
      getPosts({ cursor: pageParam, size: FEED_PAGE_SIZE, post_type: postType }),
    // 커서가 불투명 문자열 토큰이다 — 프론트는 해석하지 않고 그대로 echo만 한다(types.ts 주석).
    initialPageParam: undefined as string | undefined,
    // 피드만 페이징 정보가 page_info로 중첩돼 온다 (다른 목록은 최상위 next_cursor/has_next).
    getNextPageParam: (lastPage) =>
      lastPage.page_info.has_next
        ? (lastPage.page_info.next_cursor ?? undefined)
        : undefined,
  })
}

/** 업로드할 파일 하나. 이미 업로드에 성공했다면 uploadedUrl이 있다. */
export interface UploadTarget {
  file: File
  uploadedUrl?: string
}

export interface SubmitPostInput {
  /** 업로드 URL을 제외한 요청 본문 — 파일 업로드가 끝나면 합쳐서 보낸다. */
  base: Omit<PostCreateRequest, 'thumbnail_url' | 'image_urls'>
  /** PROJECT 썸네일 (선택). */
  thumbnail?: UploadTarget
  /** CARD_NEWS 이미지 — 배열 순서가 그대로 display_order다. */
  images?: UploadTarget[]
  /** 업로드가 끝난 파일의 URL을 폼 상태로 되돌린다 — 게시 실패 후 재시도 때 같은 파일을 다시 올리지 않기 위함. */
  onUploaded: (target: UploadTarget, url: string) => void
}

/**
 * 게시물 제출 — 파일 업로드부터 생성까지 한 뮤테이션.
 * 게시 확정 시에만 업로드한다 (시퀀스의 Orphan File 방지 흐름). 업로드 성공분은
 * onUploaded로 즉시 기록되므로, createPost가 실패해도 재시도에서 재업로드하지 않는다.
 *
 * 작성 직후 "본인 글 잠시 노출" (2026-08-05 팀 결정 — 백엔드 무변경, 프론트 낙관 처리):
 * 서버 피드(GET /api/posts)는 본인 글을 제외하므로, 피드를 invalidate하면 방금 쓴 글이
 * 화면에서 곧바로 사라진다. 대신 방금 만든 글을 피드 캐시 첫 페이지 맨 앞에 끼워
 * 넣고 **피드는 일부러 invalidate하지 않는다** — 다음 자연 refetch(새로고침·재방문) 때
 * 서버 응답으로 교체되며 조용히 사라지는 것이 의도된 동작이다.
 */
export function useSubmitPost() {
  const queryClient = useQueryClient()
  const myUserId = useAuthStore((s) => s.userId)
  return useMutation({
    mutationFn: async ({ base, thumbnail, images, onUploaded }: SubmitPostInput) => {
      const uploadOnce = async (target: UploadTarget) => {
        if (target.uploadedUrl) return target.uploadedUrl
        const url = await uploadFile(target.file)
        onUploaded(target, url)
        return url
      }
      const request: PostCreateRequest = { ...base }
      if (thumbnail) request.thumbnail_url = await uploadOnce(thumbnail)
      // Promise.all은 결과 순서를 보존한다 — 배열 순서 = display_order.
      if (images) request.image_urls = await Promise.all(images.map((i) => uploadOnce(i)))
      const created = await createPost(request)
      // 낙관적 피드 항목을 onSuccess에서 조립할 수 있게, 실제 전송한 request를 함께 돌려준다.
      // (variables의 UploadTarget은 업로드 URL 반영을 보장하지 않는다 — 폼 상태 콜백 몫이라.)
      return { created, request }
    },
    onSuccess: ({ created, request }) => {
      // 작성자 표시는 내 프로필 캐시에서 빌린다 (useCreateComment의 낙관 댓글과 같은 방식).
      const myProfile =
        myUserId !== null
          ? queryClient.getQueryData<{
              nickname: string | null
              profile_image_url: string | null
            }>(['users', myUserId])
          : undefined
      const optimistic: FeedItem = {
        post_id: created.post_id,
        post_type: request.post_type,
        author: {
          user_id: myUserId ?? -1,
          nickname: myProfile?.nickname ?? null,
          profile_image_url: myProfile?.profile_image_url ?? null,
        },
        content: request.content,
        // 피드 대표컷 규칙(서버 COALESCE)과 동일 — 썸네일 없으면 카드뉴스 첫 이미지.
        thumbnail_url: request.thumbnail_url ?? request.image_urls?.[0] ?? null,
        tech_stacks: request.tech_stacks ?? [],
        like_count: 0,
        comment_count: 0,
        is_liked: false,
        created_at: new Date().toISOString(),
      }
      // 전체 탭 + 해당 유형 탭의 캐시 첫 페이지 맨 앞에 끼운다 (없는 캐시는 건드리지 않음).
      for (const key of [
        ['posts', 'feed', 'ALL'],
        ['posts', 'feed', request.post_type],
      ]) {
        queryClient.setQueryData<InfiniteData<FeedResponse>>(
          key,
          (old) =>
            old && {
              ...old,
              pages: old.pages.map((page, index) =>
                index === 0 ? { ...page, feeds: [optimistic, ...page.feeds] } : page,
              ),
            },
        )
      }
      // 프로필 그리드는 서버가 본인 글을 포함하므로 기존대로 무효화가 정답이다 —
      // 글을 쓰고 내 프로필로 가면 새 글이 실려 온다.
      if (myUserId !== null) {
        void queryClient.invalidateQueries({ queryKey: ['users', myUserId, 'posts'] })
      }
    },
  })
}

/** 캐시된 모든 피드 페이지에서 해당 게시물만 patch로 갱신한 사본을 만든다. */
function patchFeedPost(
  data: InfiniteData<FeedResponse> | undefined,
  postId: number,
  patch: (post: FeedItem) => Partial<FeedItem>,
) {
  if (!data) return data
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      feeds: page.feeds.map((post) =>
        post.post_id === postId ? { ...post, ...patch(post) } : post,
      ),
    })),
  }
}

/**
 * 좋아요 토글 — 낙관적 업데이트 (명세 확정 UX: 응답 전 즉시 반영, 실패 시 롤백).
 * 같은 글이 여러 캐시에 살 수 있어 전부 함께 고친다:
 *  - 피드 캐시(['posts','feed',*]) — 전체 탭·타입 탭
 *  - 상세 캐시(['posts','detail',id]) — 상세 모달
 *  - 좋아요한 게시물 목록(['users',myId,'liked-posts']) — 취소하면 즉시 목록에서 빠지고,
 *    새로 누르면 서버가 만든 like_id(커서)를 모르므로 무효화로 다시 받아온다.
 */
export function useToggleLike() {
  const queryClient = useQueryClient()
  const myUserId = useAuthStore((s) => s.userId)
  const likedPostsKey = ['users', myUserId, 'liked-posts'] as const
  return useMutation({
    mutationFn: toggleLike,
    onMutate: async (postId) => {
      // 진행 중인 refetch가 낙관적 반영을 옛 서버 값으로 덮지 않게 멈춘다.
      await queryClient.cancelQueries({ queryKey: ['posts', 'feed'] })
      await queryClient.cancelQueries({ queryKey: ['posts', 'detail', postId] })
      await queryClient.cancelQueries({ queryKey: likedPostsKey })
      const previous = queryClient.getQueriesData<InfiniteData<FeedResponse>>({
        queryKey: ['posts', 'feed'],
      })
      const previousDetail = queryClient.getQueryData<PostDetailResponse>([
        'posts',
        'detail',
        postId,
      ])
      const previousLiked = queryClient.getQueryData<InfiniteData<LikedPostsResponse>>(
        likedPostsKey,
      )
      queryClient.setQueriesData<InfiniteData<FeedResponse>>(
        { queryKey: ['posts', 'feed'] },
        (old) =>
          patchFeedPost(old, postId, (post) => ({
            is_liked: !post.is_liked,
            like_count: post.like_count + (post.is_liked ? -1 : 1),
          })),
      )
      queryClient.setQueryData<PostDetailResponse>(
        ['posts', 'detail', postId],
        (old) =>
          old && {
            ...old,
            is_liked: !old.is_liked,
            like_count: old.like_count + (old.is_liked ? -1 : 1),
          },
      )
      // 좋아요 취소라면 목록에서 즉시 뺀다. (누르는 쪽은 like_id를 몰라 onSuccess에서 무효화)
      queryClient.setQueryData<InfiniteData<LikedPostsResponse>>(
        likedPostsKey,
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.filter((item) => item.post_id !== postId),
            })),
          },
      )
      return { previous, previousDetail, previousLiked }
    },
    onError: (_error, postId, context) => {
      for (const [queryKey, data] of context?.previous ?? [])
        queryClient.setQueryData(queryKey, data)
      if (context?.previousDetail) {
        queryClient.setQueryData(['posts', 'detail', postId], context.previousDetail)
      }
      if (context?.previousLiked) {
        queryClient.setQueryData(likedPostsKey, context.previousLiked)
      }
    },
    // 성공하면 서버가 계산한 최종 값으로 맞춘다 (다른 사용자의 좋아요와 경합 대비).
    onSuccess: (data, postId) => {
      queryClient.setQueriesData<InfiniteData<FeedResponse>>(
        { queryKey: ['posts', 'feed'] },
        (old) => patchFeedPost(old, postId, () => data),
      )
      queryClient.setQueryData<PostDetailResponse>(
        ['posts', 'detail', postId],
        (old) => old && { ...old, ...data },
      )
      // 새로 좋아요를 눌렀다면 목록 맨 앞에 들어가야 하는데, 커서인 like_id는 서버만
      // 안다 — 항목을 지어내는 대신 무효화로 정본을 다시 받는다.
      if (data.is_liked) {
        void queryClient.invalidateQueries({ queryKey: likedPostsKey })
      }
      // 좋아요 누른 사람 목록(모달)도 방금 누른/취소한 내가 반영돼야 한다. 여기도 커서
      // 목록이라 항목을 끼워 넣을 수 없어 무효화로 정본을 다시 받는다. 모달이 닫혀 있으면
      // stale 표시만 되고 다음에 열 때 새로 받아온다 — 안 그러면 staleTime(30초) 동안
      // 옛 명단이 그대로 떠서 "좋아요를 눌렀는데 목록에 내가 없는" 상태가 된다.
      void queryClient.invalidateQueries({ queryKey: ['posts', 'likes', postId] })
    },
  })
}

/** 좋아요 목록 모달이 열려 있는 동안만 마운트되므로, 마운트 = 조회 시작이다. */
export function usePostLikes(postId: number) {
  return useInfiniteQuery({
    queryKey: ['posts', 'likes', postId],
    queryFn: ({ pageParam }) =>
      getPostLikes(postId, { cursor: pageParam, size: LIKE_PAGE_SIZE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.has_next ? (lastPage.next_cursor ?? undefined) : undefined,
  })
}

/**
 * 댓글 목록 모달이 열려 있는 동안만 마운트되므로, 마운트 = 조회 시작이다.
 * 커서가 아니라 page 번호 기반 오프셋 페이징(백엔드 공통 PageResponse) — 0페이지부터 시작해서
 * total_pages에 닿을 때까지 다음 page를 요청한다.
 */
export function usePostComments(postId: number) {
  return useInfiniteQuery({
    queryKey: ['posts', 'comments', postId],
    queryFn: ({ pageParam }) =>
      getPostComments(postId, { page: pageParam, size: COMMENT_PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      allPages.length < lastPage.total_pages ? allPages.length : undefined,
  })
}

/** 내가 좋아요한 게시물 — 커서(like_id) 무한 스크롤, 좋아요 누른 최신순. */
export function useLikedPosts(userId: number | null) {
  return useInfiniteQuery({
    queryKey: ['users', userId, 'liked-posts'],
    queryFn: ({ pageParam }) =>
      getLikedPosts(userId!, { cursor: pageParam, size: LIKED_POSTS_PAGE_SIZE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.has_next ? (lastPage.next_cursor ?? undefined) : undefined,
    // 부팅 직후 userId가 아직 없을 수 있다(silent refresh 중) — 채워지면 자동 시작.
    enabled: userId !== null,
  })
}

/** 게시글 상세 — 상세 모달이 열려 있는 동안만 마운트되므로, 마운트 = 조회 시작이다. */
export function usePostDetail(postId: number) {
  return useQuery({
    queryKey: ['posts', 'detail', postId],
    queryFn: () => getPostDetail(postId),
    // URL 파라미터가 숫자가 아니면(NaN) 요청 자체를 보내지 않는다 — 아래 컴포넌트가 에러 UI를 그린다.
    enabled: Number.isFinite(postId),
  })
}

/**
 * 댓글 작성 — 낙관적 업데이트 (명세 확정 UX: 응답 전 즉시 반영, 실패 시 롤백).
 * 댓글이 작성순(오름차순)으로 오므로 새 댓글은 이미 불러온 마지막 페이지 끝에 붙인다
 * (최신순이던 예전과 반대). 피드·상세의 comment_count도 +1 한다.
 * 생성 응답은 comment_id만 오므로(전체 객체 아님), 성공하면 임시 항목의 id만 서버 값으로
 * 바꿔치기한다 — content/author/created_at은 이미 낙관적으로 넣은 값을 그대로 신뢰한다.
 */
export function useCreateComment(postId: number) {
  const queryClient = useQueryClient()
  const myUserId = useAuthStore((s) => s.userId)
  return useMutation({
    mutationFn: (content: string) => createComment(postId, { content }),
    onMutate: async (content) => {
      await queryClient.cancelQueries({ queryKey: ['posts', 'comments', postId] })
      await queryClient.cancelQueries({ queryKey: ['posts', 'feed'] })
      await queryClient.cancelQueries({ queryKey: ['posts', 'detail', postId] })
      const previousComments = queryClient.getQueryData<
        InfiniteData<PostCommentsResponse>
      >(['posts', 'comments', postId])
      const previousFeed = queryClient.getQueriesData<InfiniteData<FeedResponse>>({
        queryKey: ['posts', 'feed'],
      })
      const previousDetail = queryClient.getQueryData<PostDetailResponse>([
        'posts',
        'detail',
        postId,
      ])
      // 작성자 표시는 내 프로필 캐시에서 빌린다 — 서버 응답이 오면 어차피 교체된다.
      const myProfile =
        myUserId !== null
          ? queryClient.getQueryData<{
              nickname: string | null
              profile_image_url: string | null
            }>(['users', myUserId])
          : undefined
      const now = new Date().toISOString()
      const optimistic: PostComment = {
        // 음수 임시 id — 서버 id와 절대 겹치지 않고, React key로도 안전하다.
        comment_id: -Date.now(),
        author: {
          user_id: myUserId ?? -1,
          nickname: myProfile?.nickname ?? '나',
          profile_image_url: myProfile?.profile_image_url ?? null,
        },
        content,
        created_at: now,
        updated_at: now,
        is_mine: true,
        like_count: 0,
        is_liked: false,
      }
      // 낙관 삽입은 **마지막 페이지까지 다 받았을 때만** 한다.
      //
      // 이 목록은 커서가 아니라 page 번호 오프셋 페이징(getNextPageParam이 allPages.length)이라,
      // 아직 안 받은 페이지가 남아 있으면 "캐시의 마지막 페이지"와 "서버의 마지막 페이지"가
      // 다르다. 그 상태에서 끝에 심어 두면 나중에 뒤 페이지를 받을 때 서버가 같은 댓글을
      // 다시 실어 주고, onSuccess가 임시 id를 서버 id로 바꿔 놓은 뒤라 comment_id까지 겹쳐
      // 같은 댓글이 두 번 렌더되고 React key 경고가 났다.
      // 안 심은 경우는 아래 onSuccess의 무효화로 서버 정본을 받아 수렴시킨다.
      const isLastPageLoaded =
        previousComments !== undefined &&
        previousComments.pages.length >= (previousComments.pages[0]?.total_pages ?? 1)
      if (isLastPageLoaded) {
        queryClient.setQueryData<InfiniteData<PostCommentsResponse>>(
          ['posts', 'comments', postId],
          (old) =>
            old && {
              ...old,
              pages: old.pages.map((page, index) =>
                // 작성순(오름차순) 목록이라 마지막 페이지 끝이 "방금 단 댓글" 자리다.
                index === old.pages.length - 1
                  ? { ...page, items: [...page.items, optimistic] }
                  : page,
              ),
            },
        )
      }
      queryClient.setQueriesData<InfiniteData<FeedResponse>>(
        { queryKey: ['posts', 'feed'] },
        (old) =>
          patchFeedPost(old, postId, (post) => ({
            comment_count: post.comment_count + 1,
          })),
      )
      queryClient.setQueryData<PostDetailResponse>(
        ['posts', 'detail', postId],
        (old) => old && { ...old, comment_count: old.comment_count + 1 },
      )
      return {
        previousComments,
        previousFeed,
        previousDetail,
        optimisticId: optimistic.comment_id,
        didInsertOptimistic: isLastPageLoaded,
      }
    },
    onError: (_error, _content, context) => {
      if (!context) return
      queryClient.setQueryData(['posts', 'comments', postId], context.previousComments)
      for (const [queryKey, data] of context.previousFeed)
        queryClient.setQueryData(queryKey, data)
      queryClient.setQueryData(['posts', 'detail', postId], context.previousDetail)
    },
    onSuccess: (created, _content, context) => {
      if (!context.didInsertOptimistic) {
        // 낙관 삽입을 건너뛴 경우(뒤 페이지가 남아 있었다) — 서버 정본을 다시 받는다.
        // 그래야 방금 단 댓글이 제자리(마지막 페이지)에 한 번만 나타난다.
        void queryClient.invalidateQueries({ queryKey: ['posts', 'comments', postId] })
        return
      }
      queryClient.setQueryData<InfiniteData<PostCommentsResponse>>(
        ['posts', 'comments', postId],
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((comment) =>
                comment.comment_id === context.optimisticId
                  ? { ...comment, comment_id: created.comment_id }
                  : comment,
              ),
            })),
          },
      )
    },
  })
}

/**
 * 댓글 삭제 — 낙관적 제거. 서버가 소프트 삭제 후 목록 조회 쿼리에서 아예 제외하므로
 * (WHERE is_deleted = FALSE), 프론트도 "삭제됨" 표시가 아니라 목록에서 바로 뺀다.
 * 피드·상세의 comment_count도 -1. 실패하면 셋 다 롤백.
 */
export function useDeleteComment(postId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteComment,
    onMutate: async (commentId) => {
      await queryClient.cancelQueries({ queryKey: ['posts', 'comments', postId] })
      await queryClient.cancelQueries({ queryKey: ['posts', 'feed'] })
      await queryClient.cancelQueries({ queryKey: ['posts', 'detail', postId] })
      const previousComments = queryClient.getQueryData<InfiniteData<PostCommentsResponse>>([
        'posts',
        'comments',
        postId,
      ])
      const previousFeed = queryClient.getQueriesData<InfiniteData<FeedResponse>>({
        queryKey: ['posts', 'feed'],
      })
      const previousDetail = queryClient.getQueryData<PostDetailResponse>([
        'posts',
        'detail',
        postId,
      ])
      queryClient.setQueryData<InfiniteData<PostCommentsResponse>>(
        ['posts', 'comments', postId],
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.filter((comment) => comment.comment_id !== commentId),
            })),
          },
      )
      queryClient.setQueriesData<InfiniteData<FeedResponse>>(
        { queryKey: ['posts', 'feed'] },
        (old) =>
          patchFeedPost(old, postId, (post) => ({
            comment_count: Math.max(post.comment_count - 1, 0),
          })),
      )
      queryClient.setQueryData<PostDetailResponse>(
        ['posts', 'detail', postId],
        (old) => old && { ...old, comment_count: Math.max(old.comment_count - 1, 0) },
      )
      return { previousComments, previousFeed, previousDetail }
    },
    onError: (_error, _commentId, context) => {
      if (!context) return
      queryClient.setQueryData(['posts', 'comments', postId], context.previousComments)
      for (const [queryKey, data] of context.previousFeed)
        queryClient.setQueryData(queryKey, data)
      queryClient.setQueryData(['posts', 'detail', postId], context.previousDetail)
    },
    // 낙관적 제거 뒤에는 반드시 서버 정본으로 수렴시킨다.
    // 이 목록은 page 번호 오프셋 페이징이라, 서버에서 한 건이 빠지면 **페이지 경계가 한 칸
    // 밀린다.** 캐시만 고치고 무효화를 안 하면 다음 요청이 여전히 page=2를 달라 하고,
    // 서버는 이미 줄어든 목록의 page=2를 주므로 그 사이 한 건이 화면에 영영 안 나타났다.
    // (성공·실패 어느 쪽이든 다시 맞춰야 해서 onSettled에 둔다.)
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['posts', 'comments', postId] })
    },
  })
}

/**
 * 댓글 좋아요 토글 — 낙관적 업데이트, 실패 시 롤백 (게시물 좋아요와 같은 패턴).
 * 좋아요한 댓글 목록 같은 별도 화면이 없어 patchFeedPost류의 다중 캐시 동기화는 필요 없다 —
 * 이 게시물의 댓글 캐시(['posts','comments',postId]) 하나만 고치면 된다.
 */
export function useToggleCommentLike(postId: number) {
  const queryClient = useQueryClient()
  const queryKey = ['posts', 'comments', postId]

  const patchComment = (
    old: InfiniteData<PostCommentsResponse> | undefined,
    commentId: number,
    patch: (comment: PostComment) => Partial<PostComment>,
  ) =>
    old && {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        items: page.items.map((comment) =>
          comment.comment_id === commentId ? { ...comment, ...patch(comment) } : comment,
        ),
      })),
    }

  return useMutation({
    mutationFn: toggleCommentLike,
    onMutate: async (commentId) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<InfiniteData<PostCommentsResponse>>(queryKey)
      queryClient.setQueryData<InfiniteData<PostCommentsResponse>>(queryKey, (old) =>
        patchComment(old, commentId, (comment) => ({
          is_liked: !comment.is_liked,
          like_count: comment.like_count + (comment.is_liked ? -1 : 1),
        })),
      )
      return { previous }
    },
    onError: (_error, _commentId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
    },
    // 성공하면 서버가 계산한 최종 값으로 맞춘다 (다른 사용자의 좋아요와 경합 대비).
    onSuccess: (data, commentId) => {
      queryClient.setQueryData<InfiniteData<PostCommentsResponse>>(queryKey, (old) =>
        patchComment(old, commentId, () => data),
      )
    },
  })
}

/**
 * AI 요약 생성. 성공하면 상세 캐시의 summary(서버 키 기준)를 채운다 — 이후 버튼은
 * 접기/펼치기만 하고 다시 부르지 않는다 (usePostDetail의 데이터가 곧 버튼 상태).
 */
export function useGenerateAiSummary(postId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => generateAiSummary(postId),
    onSuccess: ({ summary }) => {
      queryClient.setQueryData<PostDetailResponse>(
        ['posts', 'detail', postId],
        (old) => old && { ...old, summary },
      )
    },
  })
}

/** 저장소 피커가 열려 있는 동안만 마운트되므로, 마운트 = 조회 시작이다. */
export function useGithubRepos() {
  return useQuery({
    queryKey: ['github', 'repos'],
    queryFn: getGithubRepos,
  })
}

/**
 * 저장소 분석. 앞선 요청은 끊는다 — 저장소를 연달아 바꾸면 요청이 쌓이는데
 * **호출 한 번마다 과금된다.** 끊긴 요청은 CanceledError로 떨어진다.
 */
export function useAnalyzeProject() {
  const controllerRef = useRef<AbortController | null>(null)
  return useMutation({
    mutationFn: (request: AnalyzeProjectRequest) => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      return analyzeProject(request, controller.signal)
    },
  })
}
