import axios from 'axios'
import { apiClient } from '@/api/client'
import type { ApiErrorResponse, ApiResponse } from '@/api/types'
import type {
  BadgeResponse,
  CreateProfileRequest,
  CreateProfileResponse,
  FollowerCountResponse,
  FollowingCountResponse,
  FollowListResponse,
  FollowToggleResponse,
  ProfilePostListResponse,
  ProfileResponse,
  TagResponse,
  UserGithubResponse,
} from './types'

export async function getUserProfile(userId: number) {
  const { data } = await apiClient.get<ApiResponse<ProfileResponse>>(
    `/api/users/${userId}`,
  )
  return data.data
}

export async function createProfile(request: CreateProfileRequest) {
  const { data } = await apiClient.post<ApiResponse<CreateProfileResponse>>(
    '/api/profiles',
    request,
  )
  return data.data
}

export async function followUser(userId: number) {
  const { data } = await apiClient.post<ApiResponse<FollowToggleResponse>>(
    `/api/users/${userId}/follow`,
  )
  return data.data
}

export async function unfollowUser(userId: number) {
  const { data } = await apiClient.delete<ApiResponse<FollowToggleResponse>>(
    `/api/users/${userId}/follow`,
  )
  return data.data
}

/** 팔로우 상태 단건 조회 — 프로필 페이지의 FollowButton 초기 상태용. */
export async function getFollowStatus(userId: number) {
  const { data } = await apiClient.get<ApiResponse<FollowToggleResponse>>(
    `/api/users/${userId}/follow`,
  )
  return data.data
}

export async function getFollowerCount(userId: number) {
  const { data } = await apiClient.get<ApiResponse<FollowerCountResponse>>(
    `/api/users/${userId}/followers/count`,
  )
  return data.data.follower_count
}

export async function getFollowingCount(userId: number) {
  const { data } = await apiClient.get<ApiResponse<FollowingCountResponse>>(
    `/api/users/${userId}/following/count`,
  )
  return data.data.following_count
}

export async function getFollowingList(userId: number, cursor?: number) {
  const { data } = await apiClient.get<ApiResponse<FollowListResponse>>(
    `/api/users/${userId}/following`,
    { params: { cursor, size: 20 } },
  )
  return data.data
}

export async function getFollowerList(userId: number, cursor?: number) {
  const { data } = await apiClient.get<ApiResponse<FollowListResponse>>(
    `/api/users/${userId}/followers`,
    { params: { cursor, size: 20 } },
  )
  return data.data
}

/** 프로필 게시글 그리드 — 커서(post_id 내림차순) 페이지네이션. */
export async function getUserPosts(
  userId: number,
  params: { cursor?: number; size: number },
) {
  const { data } = await apiClient.get<ApiResponse<ProfilePostListResponse>>(
    `/api/users/${userId}/posts`,
    { params },
  )
  return data.data
}

/**
 * 프로필 업적 배지 — 축별 최고 등급 하나씩, 최대 4개.
 * 활동이 없으면 빈 배열이 정상이라 별도 분기가 필요 없다.
 */
export async function getUserBadges(userId: number) {
  const { data } = await apiClient.get<ApiResponse<BadgeResponse[]>>(
    `/api/users/${userId}/badges`,
  )
  return data.data
}

/**
 * GitHub 인증 화면 URL — client_id·scope·state(CSRF 방지)를 전부 백엔드가 만들어서
 * 내려준다(2026-08-05 백엔드 설계 변경). 프론트는 이 URL을 받아 브라우저를 통째로
 * 이동시키기만 한다 — code 교환·콜백 수신은 이제 전부 백엔드 몫이라 프론트엔 관련
 * 코드가 없다(features/profile/github-oauth.ts 참고).
 */
export async function getGithubAuthorizeUrl() {
  const { data } = await apiClient.get<ApiResponse<{ authorize_url: string }>>(
    '/api/github/authorize',
  )
  return data.data.authorize_url
}

/**
 * GitHub 연동 해제. 서버가 저장해 둔 액세스 토큰과 잔디·통계 데이터를 함께 지운다.
 * 다시 연동하면 스케줄러가 1년치를 새로 받아오므로 되돌릴 수 있는 동작이다.
 */
export async function disconnectGithub() {
  await apiClient.delete<ApiResponse<null>>('/api/github/connect')
}

/**
 * userId의 GitHub 미연동(404 GITHUB_NOT_CONNECTED)이면 에러로 던지지 않고 null을
 * 돌려준다 — 프로필 화면에서는 "연동 안 함"이 오류가 아니라 정상적인 상태라서다.
 */
export async function getUserGithub(userId: number) {
  try {
    const { data } = await apiClient.get<ApiResponse<UserGithubResponse>>(
      `/api/users/${userId}/github`,
    )
    return data.data
  } catch (error) {
    if (
      axios.isAxiosError<ApiErrorResponse>(error) &&
      error.response?.data?.code === 'GITHUB_NOT_CONNECTED'
    ) {
      return null
    }
    throw error
  }
}

/**
 * 사용자가 고른 관심 태그. 편집 화면이 기존 선택을 복원하는 데 쓴다.
 *
 * 이게 없던 동안은 편집 화면이 늘 빈 상태로 시작했고, 그 상태로 저장하면 서버가
 * user_interests를 통째로 갈아끼워 **과거 선택이 사라졌다**. 닉네임만 고치려던
 * 사용자가 태그를 잃는 문제였다.
 *
 * 항목이 없으면 빈 배열이며 오류가 아니다.
 */
export async function getUserInterests(userId: number) {
  const { data } = await apiClient.get<ApiResponse<TagResponse[]>>(
    `/api/users/${userId}/interests`,
  )
  return data.data
}

/**
 * 관심 태그 마스터 목록. type을 주면 그 종류만 (TECH / POSITION / DOMAIN).
 * 사용자가 고른 값은 프로필 저장 시 interest_tag_ids로 보낸다.
 */
export async function getTags(type?: 'TECH' | 'POSITION' | 'DOMAIN') {
  const { data } = await apiClient.get<ApiResponse<TagResponse[]>>('/api/tags', {
    params: type ? { type } : undefined,
  })
  return data.data
}
