import { useMemo } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { expandAchievements, sortAchievements, type Achievement } from './achievements'
import {
  createProfile,
  disconnectGithub,
  followUser,
  getFollowerCount,
  getFollowerList,
  getFollowingCount,
  getFollowingList,
  getFollowStatus,
  getUserBadges,
  getUserGithub,
  getUserInterests,
  getUserPosts,
  getTags,
  getUserProfile,
  unfollowUser,
} from './api'
import { useAuthStore } from '@/stores/useAuthStore'

export function useUserProfile(userId: number | undefined) {
  return useQuery({
    queryKey: ['users', userId],
    queryFn: () => getUserProfile(userId!),
    enabled: userId !== undefined,
  })
}

export function useCreateProfile() {
  const queryClient = useQueryClient()
  const myUserId = useAuthStore((s) => s.userId)

  return useMutation({
    mutationFn: createProfile,
    // 저장 성공 후 ProfilePage가 보던 캐시(['users', myUserId])가 그대로 남아있어서
    // 새로 저장한 내용이 화면에 반영이 안 되는 문제가 있었다. staleTime(30초) 안에는
    // 재요청을 안 하므로, 저장 직후 그 쿼리를 무효화해서 다음에 보일 때 새로 받아오게 한다.
    //
    // 게시물 쪽 캐시(['posts', ...])도 같이 무효화한다. 피드 카드·좋아요 목록·댓글은
    // 작성자 정보(PostAuthor: nickname, profile_image_url)를 응답에 복사해 들고 있어서,
    // 프로필만 무효화하면 게시물에 찍힌 옛 닉네임·프로필 사진이 그대로 남는다
    // ("이름을 바꿔도 내 게시물의 이름이 안 바뀐다" 증상).
    onSuccess: () => {
      if (myUserId !== null) {
        queryClient.invalidateQueries({ queryKey: ['users', myUserId] })
      }
      queryClient.invalidateQueries({ queryKey: ['posts'] })
    },
  })
}

/**
 * GitHub 연동 해제. 성공하면 내 GitHub 쿼리와 업적 배지를 무효화한다 —
 * 잔디가 사라지면 커밋 축 배지 진행도도 같이 달라지기 때문.
 */
export function useDisconnectGithub() {
  const queryClient = useQueryClient()
  const myUserId = useAuthStore((s) => s.userId)

  return useMutation({
    mutationFn: disconnectGithub,
    onSuccess: () => {
      if (myUserId === null) return
      queryClient.invalidateQueries({ queryKey: ['users', myUserId, 'github'] })
      queryClient.invalidateQueries({ queryKey: ['users', myUserId, 'badges'] })
    },
  })
}

export function useFollowerCount(userId: number | undefined) {
  return useQuery({
    queryKey: ['users', userId, 'followers', 'count'],
    queryFn: () => getFollowerCount(userId!),
    enabled: userId !== undefined,
  })
}

export function useFollowingCount(userId: number | undefined) {
  return useQuery({
    queryKey: ['users', userId, 'following', 'count'],
    queryFn: () => getFollowingCount(userId!),
    enabled: userId !== undefined,
  })
}

/**
 * 팔로우 상태 단건 조회 (GET /api/users/{id}/follow).
 * FollowButton이 호출하는 쪽에서 이미 아는 상태(목록 항목의 is_following)를 못 받았을
 * 때만(enabled) 직접 조회한다 — 목록에서는 항목마다 이 쿼리가 또 나가지 않게 하기 위해서다.
 */
export function useFollowStatus(userId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['users', userId, 'follow', 'status'],
    queryFn: () => getFollowStatus(userId!),
    enabled: enabled && userId !== undefined,
  })
}

/**
 * 팔로우/언팔로우 토글. userId는 토글 대상(target)이고, 실행하는 사람(viewer)은
 * useAuthStore에서 가져온다.
 *
 * 토글 하나가 실제로 바꾸는 숫자·목록은 두 사람 몫이다 — 대상(target)의 팔로워 수·
 * 팔로워 목록, 그리고 나(viewer)의 팔로잉 수·팔로잉 목록. 예전엔 target의 팔로워 수만
 * 낙관적으로 갱신하고 나머지(내 팔로잉 수, 양쪽 목록)는 아예 손대지 않아서, 새로고침
 * 전엔 안 바뀌어 보이는 버그가 있었다.
 * 목록(무한 스크롤)까지 낙관적으로 스플라이스하면 페이지 경계·커서가 꼬이기 쉬워서,
 * 목록은 onSettled에서 invalidate로 다시 받아온다 — 카운트만 onMutate로 즉시 반영.
 */
export function useToggleFollow(userId: number) {
  const queryClient = useQueryClient()
  const viewerId = useAuthStore((s) => s.userId)
  const targetFollowerCountKey = ['users', userId, 'followers', 'count']
  const viewerFollowingCountKey = viewerId !== null ? ['users', viewerId, 'following', 'count'] : null

  return useMutation({
    mutationFn: (nextIsFollowing: boolean) =>
      nextIsFollowing ? followUser(userId) : unfollowUser(userId),
    onMutate: async (nextIsFollowing) => {
      const delta = nextIsFollowing ? 1 : -1

      await queryClient.cancelQueries({ queryKey: targetFollowerCountKey })
      const previousFollowerCount = queryClient.getQueryData<number>(targetFollowerCountKey)
      queryClient.setQueryData<number>(targetFollowerCountKey, (count) =>
        count === undefined ? count : count + delta,
      )

      let previousFollowingCount: number | undefined
      if (viewerFollowingCountKey) {
        await queryClient.cancelQueries({ queryKey: viewerFollowingCountKey })
        previousFollowingCount = queryClient.getQueryData<number>(viewerFollowingCountKey)
        queryClient.setQueryData<number>(viewerFollowingCountKey, (count) =>
          count === undefined ? count : count + delta,
        )
      }

      return { previousFollowerCount, previousFollowingCount }
    },
    onError: (_err, _nextIsFollowing, context) => {
      if (context?.previousFollowerCount !== undefined) {
        queryClient.setQueryData(targetFollowerCountKey, context.previousFollowerCount)
      }
      if (viewerFollowingCountKey && context?.previousFollowingCount !== undefined) {
        queryClient.setQueryData(viewerFollowingCountKey, context.previousFollowingCount)
      }
    },
    // 응답이 서버 확정값(is_following, follower_count)을 주므로 그대로 캐시에 반영한다.
    // 낙관적 ±1은 "내 클릭 하나만 반영된" 추정치라, 그 사이 다른 사람이 팔로우했거나
    // 서버가 멱등 처리(이미 같은 상태여서 수가 안 변함)한 경우와 어긋난다. 서버 값을
    // 덮어써 두면 이어지는 재조회 전에도 화면이 정답을 보여준다.
    onSuccess: (data) => {
      queryClient.setQueryData<number>(targetFollowerCountKey, data.follower_count)
      queryClient.setQueryData(['users', userId, 'follow', 'status'], data)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: targetFollowerCountKey })
      queryClient.invalidateQueries({ queryKey: ['users', userId, 'followers', 'list'] })
      queryClient.invalidateQueries({ queryKey: ['users', userId, 'follow', 'status'] })
      if (viewerFollowingCountKey) {
        queryClient.invalidateQueries({ queryKey: viewerFollowingCountKey })
        queryClient.invalidateQueries({ queryKey: ['users', viewerId, 'following', 'list'] })
      }
    },
  })
}

export function useFollowingList(userId: number | undefined) {
  return useInfiniteQuery({
    queryKey: ['users', userId, 'following', 'list'],
    queryFn: ({ pageParam }) => getFollowingList(userId!, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.has_next ? (lastPage.next_cursor ?? undefined) : undefined,
    enabled: userId !== undefined,
  })
}

export function useFollowerList(userId: number | undefined) {
  return useInfiniteQuery({
    queryKey: ['users', userId, 'followers', 'list'],
    queryFn: ({ pageParam }) => getFollowerList(userId!, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.has_next ? (lastPage.next_cursor ?? undefined) : undefined,
    enabled: userId !== undefined,
  })
}

/** 프로필 그리드 페이지 크기 — 백엔드 기본값(15)과 동일. 3열 그리드라 딱 5줄씩 늘어난다. */
const USER_POSTS_PAGE_SIZE = 15

/** 프로필 게시글 그리드 — 커서(post_id) 무한 스크롤. */
export function useUserPosts(userId: number | undefined) {
  return useInfiniteQuery({
    queryKey: ['users', userId, 'posts'],
    queryFn: ({ pageParam }) =>
      getUserPosts(userId!, { cursor: pageParam, size: USER_POSTS_PAGE_SIZE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.has_next ? (lastPage.next_cursor ?? undefined) : undefined,
    enabled: userId !== undefined,
  })
}

export function useUserGithub(userId: number | undefined) {
  return useQuery({
    queryKey: ['users', userId, 'github'],
    queryFn: () => getUserGithub(userId!),
    enabled: userId !== undefined,
  })
}

/**
 * GitHub 활동 섹션이 실제로 뭔가를 그리는가 — GithubSummary의 렌더 분기와 같은 규칙이다.
 *
 * ProfilePage가 **위쪽 구분선을 그릴지** 정하는 데 쓴다. 섹션이 비는데 구분선만 남으면
 * 선 두 줄이 26px 간격으로 나란히 서 버린다. 판정을 페이지에 복사해 두면 두 곳이 어긋나므로
 * 훅으로 뺐다(같은 쿼리라 요청은 늘지 않는다).
 */
export function useGithubSectionVisible(userId: number) {
  const { data, isLoading } = useUserGithub(userId)

  // 판정은 쿼리 상태 플래그가 아니라 **data 값 자체**로 한다. getUserGithub이 세 결과를
  // 명확히 구분해 주기 때문이다:
  //   객체      → 연동됨
  //   null      → 미연동 (404 GITHUB_NOT_CONNECTED를 정상 상태로 변환)
  //   undefined → 아직 못 받음 (조회 중이거나 실패)
  // isPending/isError를 보다가 실제로 당했다: 서버가 500을 주면 재시도가 끝난 뒤에도
  // 쿼리가 pending에 머물러 isError가 켜지지 않았고, 그 탓에 섹션이 통째로 사라졌다.
  // 연동됨(객체)이든 미연동(null)이든 그릴 게 있다 — 미연동 안내는 내 프로필이든 남의
  // 프로필이든 나오고, 주어와 연동 버튼 유무만 다르다(GithubSummary 참고).
  if (data !== undefined) return true
  // undefined — 첫 조회 중이면 비워 두고, 그게 아니면 실패한 것이므로 오류 안내를 띄운다.
  return !isLoading
}

/** 프로필 업적 배지 원본 — 축별 최고 등급 하나씩, 최대 4개(GET /api/users/{id}/badges). */
export function useUserBadges(userId: number | undefined) {
  return useQuery({
    queryKey: ['users', userId, 'badges'],
    queryFn: () => getUserBadges(userId!),
    enabled: userId !== undefined,
  })
}

/**
 * 프로필 업적 배지 목록 — 서버 응답을 **보유한 배지 전부**로 펼치고 티어 내림차순으로 세운다.
 * (서버는 축별 최고 등급만 주므로 하위 등급은 achievements.ts가 되살린다.)
 *
 * ProfilePage와 AchievementBadges가 **같은 목록**을 봐야 해서 훅으로 뺐다. 페이지는
 * 개수만 필요한데(접힌 배지 수 = 인트로 카운트업 목표치, useProfileIntro 참고) 그 개수를
 * 배지 컴포넌트 안에서만 알 수 있으면 타임라인을 못 맞춘다.
 * 두 곳에서 불러도 TanStack Query가 같은 키의 요청을 합쳐 주므로 호출은 늘지 않는다.
 */
export function useProfileAchievements(userId: number | undefined): Achievement[] {
  const { data: badges } = useUserBadges(userId)

  return useMemo(() => sortAchievements(expandAchievements(badges ?? [])), [badges])
}

/**
 * 사용자가 고른 관심 태그 — 편집 화면이 기존 선택을 복원하는 데 쓴다(api.ts 주석 참고).
 * 저장 후에는 무효화해서 다음 진입 때 새 값을 받는다(useCreateProfile).
 */
export function useUserInterests(userId: number | undefined) {
  return useQuery({
    queryKey: ['users', userId, 'interests'],
    queryFn: () => getUserInterests(userId!),
    enabled: userId !== undefined,
  })
}

/**
 * 관심 태그 마스터 목록. 프로필 설정 화면에서만 쓰고 자주 바뀌지 않는 정적 데이터라
 * staleTime을 길게 둔다.
 */
export function useTags(type?: 'TECH' | 'POSITION' | 'DOMAIN') {
  return useQuery({
    queryKey: ['tags', type ?? 'ALL'],
    queryFn: () => getTags(type),
    staleTime: 30 * 60_000,
  })
}
