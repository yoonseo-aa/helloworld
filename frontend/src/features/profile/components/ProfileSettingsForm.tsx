import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { IMAGE_ACCEPT, uploadFile, validateImageFile } from '@/api/files'
import Modal from '@/components/Modal'
import {
  useCreateProfile,
  useDisconnectGithub,
  useTags,
  useUserGithub,
  useUserInterests,
  useUserProfile,
} from '../hooks'
import { useAuthStore } from '@/stores/useAuthStore'
import { useToastStore } from '@/stores/useToastStore'
import { getErrorMessage } from '@/api/errors'
import { redirectToGithubAuthorize } from '../github-oauth'
import type { ApiErrorResponse } from '@/api/types'
import type { TagResponse } from '../types'

/** 백엔드 ProfileCreateRequest의 @Size 제약과 같은 값. 한쪽만 바꾸면 조용히 어긋난다. */
const MAX_NICKNAME_LENGTH = 30
const MAX_INTRODUCE_LENGTH = 255
/** 시안 기준 상한. 서버 제약은 아니라서 넘겨도 저장은 되지만 화면이 넘친다. */
const MAX_TAGS = 12
/** 시안의 스택 이름 길이 제한. */
const MAX_TAG_LENGTH = 20
/** 입력 중 띄우는 후보 개수 상한 — 목록이 길어지면 입력창을 덮어 버린다. */
const MAX_TAG_SUGGESTIONS = 6

/** 시안(handoff ProfileEditPage)의 카드형 섹션. */
function Section({
  title,
  meta,
  children,
}: {
  title: string
  meta?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-line bg-surface rounded-xl border p-5 md:p-6">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-ink text-[15px] font-bold tracking-tight">{title}</h2>
        {meta && (
          <span className="text-ink-subtle font-mono text-[10.5px] tracking-[0.1em] tabular-nums">
            {meta}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

/**
 * 프로필 설정(생성·수정 겸용) 폼 — 시안(handoff ProfileEditPage)의 섹션 구성을 따른다.
 *
 * 항상 "내" 프로필만 다룬다. 진입 시 현재 값(닉네임·한줄소개·이미지)을 불러와 채워둔다.
 *
 * 프로필 이미지는 파일을 골라둬도 즉시 업로드하지 않는다 — "저장"을 눌러 확정하는
 * 시점에만 업로드한다(게시물 작성 모달과 같은 패턴, Orphan File 방지).
 *
 * 기술 스택은 GET /api/users/{id}/interests로 기존 선택을 복원한다. 이 API가 생기기 전에는
 * 편집 화면이 늘 빈 상태로 시작했고, 그대로 저장하면 서버가 user_interests를 통째로
 * 갈아끼워 과거 선택이 사라졌다 — 닉네임만 고치려던 사용자가 태그를 잃는 문제였다.
 */
function ProfileSettingsForm() {
  const myUserId = useAuthStore((state) => state.userId)
  const { data: profile } = useUserProfile(myUserId ?? undefined)
  // 3상태다 — 객체(연동됨) / null(미연동) / undefined(조회 중이거나 실패).
  // GithubSummary와 같은 계약이라 판정도 같은 방식으로 한다(hooks.ts 주석 참고).
  const {
    data: github,
    isLoading: isGithubLoading,
    isFetching: isGithubFetching,
    refetch: refetchGithub,
  } = useUserGithub(myUserId ?? undefined)
  // 마스터 목록은 **전체 타입**을 받는다. TECH만 받으면 서버가 돌려준 관심 태그 중
  // DOMAIN·POSITION(예: Backend, DevOps)을 이름으로 풀지 못해 칩이 통째로 사라졌다 —
  // "4 / 12"인데 칩은 하나만 뜨던 원인. 이 화면이 저장하는 값(interest_tag_ids)과
  // 프로필 화면의 태그 행(TechStackRow)이 둘 다 타입을 가리지 않으므로 여기도 맞춘다.
  const { data: tags } = useTags()
  const { data: interests } = useUserInterests(myUserId ?? undefined)
  const showToast = useToastStore((state) => state.show)

  const [nickname, setNickname] = useState('')
  const [introduce, setIntroduce] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [tagDraft, setTagDraft] = useState('')
  const [tagError, setTagError] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [newImagePreviewUrl, setNewImagePreviewUrl] = useState<string | null>(null)
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null)
  const [nicknameError, setNicknameError] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  /**
   * 저장할 거리가 있는가. 시안은 이 값으로 제목 옆 "저장하지 않은 변경" 표시와
   * 하단 바 문구·저장 버튼 활성을 한꺼번에 정한다.
   *
   * 초기값 주입(아래 두 useEffect)은 여기에 잡히면 안 된다 — 그래서 setDirty는
   * **사용자 조작 핸들러에서만** 부른다. GitHub 연동/해제는 저장을 거치지 않고
   * 곧바로 서버에 반영되므로 dirty가 아니다.
   */
  const [isDirty, setDirty] = useState(false)
/**
   * 저장 안 한 입력이 있는 채로 GitHub 연동/해제를 눌러 확인을 기다리는 중.
   * 두 동작 다 이 화면을 떠나므로(연동은 GitHub 인증으로, 해제는 프로필로) 같은 처리를 받는다.
   */
  const [pendingGithubAction, setPendingGithubAction] = useState<'connect' | 'disconnect' | null>(
    null,
  )
  const navigate = useNavigate()
  const { mutate, isPending } = useCreateProfile()
  const { mutate: disconnect, isPending: isDisconnecting } = useDisconnectGithub()

  // 프로필이 로딩되면 현재 값으로 폼을 딱 한 번만 채운다. 매번 반영하면, 저장 중
  // 백그라운드 refetch가 편집 중이던 입력을 덮어써버릴 수 있다.
  /** 이번에 고른 파일을 이미 업로드했다면 그 URL — 저장 재시도 시 중복 업로드를 막는다. */
  const uploadedImageUrlRef = useRef<string | undefined>(undefined)
  const hasInitialized = useRef(false)
  useEffect(() => {
    if (hasInitialized.current || !profile) return
    // 사용자가 이미 입력을 시작했으면 주입하지 않는다. cold cache로 들어와 곧바로
    // 타이핑하면 수백 ms 뒤 도착한 응답이 그 입력을 서버 값으로 덮어썼다 —
    // isDirty는 true로 남아 '저장하지 않은 변경' 표시만 뜬 채 옛 값을 저장하게 된다.
    if (isDirty) {
      hasInitialized.current = true
      return
    }
    hasInitialized.current = true
    setNickname(profile.nickname ?? '')
    setIntroduce(profile.introduce ?? '')
    setExistingImageUrl(profile.profile_image_url)
    // isDirty가 deps에 있어도 hasInitialized 가드 때문에 주입은 한 번뿐이다.
  }, [profile, isDirty])

  /**
   * 관심 태그 복원 — 프로필과 **별개 쿼리**라 도착 시점이 달라 초기화도 따로 한다.
   * 빈 배열도 정상 응답이므로(태그를 하나도 안 고른 사용자) 값 자체가 있으면 완료로 본다.
   *
   * 이 플래그는 저장 시에도 쓴다: 복원에 실패한 상태로 빈 배열을 보내면 서버가
   * 기존 선택을 지워 버리기 때문이다(아래 handleSubmit 주석).
   */
  const hasInitializedTags = useRef(false)
  useEffect(() => {
    if (hasInitializedTags.current || !interests) return
    hasInitializedTags.current = true
    setSelectedTagIds(interests.map((tag) => tag.tag_id))
  }, [interests])

  /**
   * 이 화면에만 있는 하단 고정 저장 바(약 70px) 위로 토스트를 올린다 — 시안
   * ProfileEditPage도 이 페이지에서만 토스트 bottom을 92px로 올린다.
   * 토스트는 전역 1개(ToastContainer)라 페이지가 위치를 직접 넘길 수 없어 CSS 변수로 준다.
   */
  useEffect(() => {
    const { style } = document.documentElement
    style.setProperty('--hw-toast-bottom', '92px')
    return () => {
      style.removeProperty('--hw-toast-bottom')
    }
  }, [])

  // 미리보기용 blob URL은 다음 파일 선택 시·언마운트 시 반드시 해제한다.
  useEffect(() => {
    return () => {
      if (newImagePreviewUrl) URL.revokeObjectURL(newImagePreviewUrl)
    }
  }, [newImagePreviewUrl])

  const displayedImageUrl = newImagePreviewUrl ?? existingImageUrl
  const canSubmit =
    nickname.trim().length > 0 &&
    nickname.length <= MAX_NICKNAME_LENGTH &&
    introduce.length <= MAX_INTRODUCE_LENGTH

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    // 서버가 거절할 파일은 고르는 즉시 알려준다 — 저장 버튼을 누르고 업로드까지 간 뒤에
    // 실패하면 원인이 이미지였다는 걸 알기 어렵다.
    const invalidReason = file ? validateImageFile(file) : null
    if (invalidReason) {
      setErrorMessage(invalidReason)
      e.target.value = ''
      return
    }
    setErrorMessage('')
    setImageFile(file)
    uploadedImageUrlRef.current = undefined // 다른 파일이므로 이전 업로드 결과는 못 쓴다
    setDirty(true)
    setNewImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return file ? URL.createObjectURL(file) : null
    })
  }

  /**
   * 시안의 "기본값으로" — 이니셜 표시로 되돌린다.
   * 서버는 안 보낸 필드를 유지하므로(updateProfile의 `<if test="... != null">`) 지우려면
   * **빈 문자열을 명시적으로** 보내야 한다. 그 표식이 existingImageUrl === ''이다.
   */
  function resetAvatar() {
    setImageFile(null)
    uploadedImageUrlRef.current = undefined
    setNewImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setExistingImageUrl('')
    setErrorMessage('')
    setDirty(true)
    showToast('success', '기본 이미지로 되돌렸어요.')
  }

  const tagList = tags ?? []
  /**
   * id → 태그 조회표. 마스터 목록 하나만 보면 안 된다 — 마스터가 아직 안 왔거나 거기 없는
   * 태그를 고른 상태면 그 칩만 조용히 사라지고, 선택 id는 남아 카운터(`N / 12`)와 어긋난다.
   * 복원 응답(`interests`)이 tag_name을 직접 들고 오므로 두 출처를 합쳐 둔다.
   */
  const tagById = new Map<number, TagResponse>()
  for (const tag of interests ?? []) tagById.set(tag.tag_id, tag)
  for (const tag of tagList) tagById.set(tag.tag_id, tag)
  /** 선택한 순서를 그대로 보여준다 — 마스터 순서로 정렬하면 방금 추가한 칩이 중간에 끼어든다. */
  const selectedTags = selectedTagIds
    .map((id) => tagById.get(id))
    .filter((t): t is TagResponse => t !== undefined)

  const draft = tagDraft.trim()
  /**
   * 입력 중 후보. 우리 백엔드는 **등록된 tag_id만** 받으므로(ProfileService가 없는 태그를
   * 거절한다) 아무 이름이나 새로 만들 수 없다. 그래서 시안의 자유 입력에 후보 목록을
   * 붙여, 뭘 칠 수 있는지 입력하면서 바로 보이게 했다 — 없는 이름은 추가 시점에 막힌다.
   */
  const tagSuggestions = draft
    ? tagList
        .filter(
          (t) =>
            !selectedTagIds.includes(t.tag_id) &&
            t.tag_name.toLowerCase().includes(draft.toLowerCase()),
        )
        .slice(0, MAX_TAG_SUGGESTIONS)
    : []

  function addTagById(tagId: number) {
    setSelectedTagIds((prev) => (prev.includes(tagId) ? prev : prev.concat(tagId)))
    setTagDraft('')
    setTagError('')
    setDirty(true)
  }

  function removeTag(tagId: number) {
    setSelectedTagIds((prev) => prev.filter((id) => id !== tagId))
    setTagError('')
    setDirty(true)
  }

  /** 입력창의 이름을 마스터에서 찾아 추가한다 (시안 addTag의 검증 문구를 그대로 따른다). */
  function addTagFromDraft() {
    if (!draft) return
    if (draft.length > MAX_TAG_LENGTH) {
      setTagError(`스택 이름은 ${MAX_TAG_LENGTH}자까지 쓸 수 있어요.`)
      return
    }
    const matched = tagList.find((t) => t.tag_name.toLowerCase() === draft.toLowerCase())
    if (!matched) {
      // 자유 입력으로 새 스택을 만들 수 없는 건 백엔드 제약이다(등록된 태그만 허용).
      // 사용자가 "왜 안 되지"로 끝나지 않게 이유와 다음 행동을 같이 알린다.
      setTagError('아직 등록되지 않은 스택이에요. 입력하면 뜨는 목록에서 골라주세요.')
      return
    }
    if (selectedTagIds.includes(matched.tag_id)) {
      setTagError('이미 추가한 스택이에요.')
      return
    }
    if (selectedTagIds.length >= MAX_TAGS) {
      setTagError(`스택은 ${MAX_TAGS}개까지 추가할 수 있어요.`)
      return
    }
    addTagById(matched.tag_id)
  }

  /**
   * 연동/해제 버튼의 진입점. 저장 안 한 입력이 있으면 확인을 거친다 —
   * 두 동작 다 끝나면 이 화면을 떠나므로 그대로 두면 입력이 사라진다.
   * 특히 가입 직후 온보딩에서 닉네임만 채워 두고 연동부터 누르면, 돌아와도 입력은 없고
   * 프로필은 여전히 미생성 상태다.
   */
  function requestGithubAction(action: 'connect' | 'disconnect') {
    if (isDirty) {
      setPendingGithubAction(action)
      return
    }
    runGithubAction(action)
  }

  function runGithubAction(action: 'connect' | 'disconnect') {
    if (action === 'connect') void startGithubAuthorize()
    else disconnectGithubNow()
  }

  /**
   * 확인 모달의 실행 버튼. "그래도 갈래?"를 묻고 그대로 보내면 입력은 똑같이 사라진다 —
   * 물어보는 대신 **저장을 먼저 끝내고** 넘긴다. 저장이 실패하면(닉네임 중복 등)
   * 모달만 닫히고 화면에 남아 오류를 보여준다 — 이때는 이동하지 않는다.
   */
  function handleSaveAndRun() {
    const action = pendingGithubAction
    setPendingGithubAction(null)
    if (!action) return
    void saveProfile(() => runGithubAction(action))
  }

  async function startGithubAuthorize() {
    try {
      await redirectToGithubAuthorize()
    } catch (error) {
      showToast('error', getErrorMessage(error, 'GitHub 연동을 시작하지 못했습니다.'))
    }
  }

  /**
   * 연동 해제 — 즉시 서버에 반영하고 프로필로 돌려보낸다. 연동하기가 OAuth를 마치고
   * 프로필로 복귀하는 것과 같은 자리다. 잔디가 사라진 결과도 거기서 바로 보인다.
   *
   * 이 폼의 "변경사항 저장"과는 아무 관계가 없는 동작이다 — 다른 엔드포인트라 저장
   * payload에 GitHub 필드 자체가 없다. 그래서 해제만으로는 dirty가 되지 않는다.
   *
   * 서버가 잔디까지 지우지만 다시 연동하면 스케줄러가 1년치를 새로 받아오므로
   * 되돌릴 수 있는 동작이다. 그래서 "정말 해제할까요" 확인은 두지 않는다(시안도 없다).
   * 확인이 붙는 건 저장 안 한 입력이 있을 때뿐이고, 그건 해제가 아니라 이동 때문이다.
   */
  function disconnectGithubNow() {
    disconnect(undefined, {
      onSuccess: () => {
        showToast('success', 'GitHub 연동을 해제했어요.')
        navigate('/users/me', { replace: true })
      },
      onError: (error) =>
        showToast('error', getErrorMessage(error, 'GitHub 연동 해제에 실패했습니다.')),
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await saveProfile()
  }

  /**
   * 프로필 저장. 성공 후 갈 곳을 호출자가 정한다 —
   * 기본은 내 프로필, "저장하고 연동하기"는 GitHub 인증 화면이다.
   */
  async function saveProfile(afterSave?: () => void) {
    setErrorMessage('')
    setNicknameError('')

    let profileImageUrl: string | undefined
    if (imageFile) {
      // 이미 올린 파일이면 다시 올리지 않는다. 저장이 닉네임 중복 등으로 실패한 뒤
      // 재시도하면 같은 이미지가 또 업로드돼, 아무 레코드도 가리키지 않는 고아 파일이
      // 스토리지에 쌓였다(프로필이 참조하는 건 마지막 것 하나뿐이다).
      if (uploadedImageUrlRef.current) {
        profileImageUrl = uploadedImageUrlRef.current
      } else {
        setIsUploading(true)
        try {
          profileImageUrl = await uploadFile(imageFile)
          uploadedImageUrlRef.current = profileImageUrl
        } catch (error) {
          setErrorMessage(getErrorMessage(error, '이미지 업로드에 실패했습니다.'))
          return
        } finally {
          setIsUploading(false)
        }
      }
    } else if (existingImageUrl === '') {
      // "기본값으로"를 눌러 비운 상태 — 빈 문자열을 보내야 서버 값이 실제로 지워진다.
      profileImageUrl = ''
    }
    // 새로 고른 파일이 없으면 profile_image_url을 아예 안 보낸다 — 명세상 부분 갱신이라
    // 안 보낸 필드는 서버가 기존 값을 그대로 유지한다.
    //
    // 태그는 **복원이 끝났을 때만** 보낸다. 서버는 배열이 오면 기존 user_interests를
    // 통째로 갈아끼우므로, 아직 기존 선택을 못 받아온 상태에서 빈 배열을 보내면 사용자가
    // 고른 태그가 전부 지워진다. 복원이 끝났다면 빈 배열도 그대로 보낸다 — 그래야 태그를
    // 모두 빼는 것도 저장된다.
    //
    // introduce는 반대로 **비어 있어도 반드시 보낸다.** 서버가 "안 보낸 필드는 유지"라서
    // 비었을 때 undefined로 빼면 한 번 적은 소개를 영영 지울 수 없다(빈 문자열은 보내지면
    // 그대로 저장돼 화면에서 사라진다).
    mutate(
      {
        nickname: nickname.trim(),
        introduce: introduce.trim(),
        profile_image_url: profileImageUrl,
        interest_tag_ids: hasInitializedTags.current ? selectedTagIds : undefined,
      },
      {
        // 최초 생성이든 수정이든 저장하면 바로 내 프로필로 간다.
        // 예전엔 최초 생성일 때만 GitHub 연동 페이지(/settings/github)를 한 단계 더 끼웠는데,
        // 가입 직후에 강제로 거치게 할 만큼 중요한 단계가 아니라 뺐다 — 연동은 선택이고,
        // 미연동이면 프로필의 잔디 자리에 안내와 연동 버튼이 그대로 뜬다(GithubSummary).
        onSuccess: () => {
          if (afterSave) {
            // 이어서 화면을 떠나는 경우(GitHub 인증) — 토스트는 리다이렉트에 묻히므로 생략한다.
            afterSave()
            return
          }
          showToast('success', '프로필을 저장했어요.')
          navigate('/users/me', { replace: true })
        },
        onError: (error) => {
          // 닉네임 중복은 저장 시도 시점에만 알 수 있다 (사전 확인 API 없음).
          const isDuplicateNickname =
            axios.isAxiosError<ApiErrorResponse>(error) &&
            error.response?.data.code === 'USER_DUPLICATE_NICKNAME'
          if (isDuplicateNickname) setNicknameError('이미 사용 중인 닉네임입니다.')
          else setErrorMessage(getErrorMessage(error, '프로필 저장에 실패했습니다.'))
        },
      },
    )
  }

  const isSubmitting = isUploading || isPending
  /** 하단 바 왼쪽 안내 (시안 문구 4종). */
  const barMessage = isUploading
    ? '이미지를 올리는 중이에요.'
    : isPending
      ? '저장하는 중이에요.'
      : isDirty
        ? '변경한 내용을 저장하세요.'
        : '변경된 내용이 없어요.'

  return (
    <form onSubmit={handleSubmit}>
      {/* 제목 줄이 폼 안에 있는 이유: 시안은 제목 옆에 "저장하지 않은 변경"을 붙이는데
          그 판단(isDirty)이 폼 상태다. 페이지로 올리려면 콜백으로 새어 나가야 한다. */}
      <Link
        to="/users/me"
        className="border-line text-ink/60 hover:bg-surface-muted mb-[18px] inline-flex min-h-9 items-center gap-2 rounded-full border pr-[13px] pl-2.5 text-[13px] transition-colors"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        프로필로
      </Link>

      <div className="mb-1.5 flex flex-wrap items-baseline gap-3">
        <h1 className="text-ink m-0 text-[26px] font-bold tracking-[-0.02em]">프로필 편집</h1>
        {isDirty && (
          <span className="text-brand-strong inline-flex items-center gap-1.5 text-[12px]">
            <span aria-hidden className="bg-brand h-[5px] w-[5px] rounded-full" />
            저장하지 않은 변경
          </span>
        )}
      </div>
      <p className="text-ink/60 mt-0 mb-[26px] text-sm leading-[1.7] break-keep">
        여기서 바꾼 내용은 다른 개발자에게 보이는 프로필에 그대로 반영돼요.
      </p>

      <div className="flex flex-col gap-4">
        {/* 시안 섹션명은 "아바타"지만 이 서비스에서는 안 쓰는 말이라 "프로필 사진"으로 둔다.
            서버 필드도 profile_image_url이고, 미리보기 alt·프로필 화면 문구와도 이 말이 맞다. */}
        <Section title="프로필 사진">
          <div className="flex flex-wrap items-center gap-5">
            {displayedImageUrl ? (
              <img
                src={displayedImageUrl}
                alt="프로필 이미지 미리보기"
                className="border-line h-[84px] w-[84px] flex-none rounded-full border object-cover"
              />
            ) : (
              // 이니셜 폴백 — 공용 UserAvatar와 같은 중립색이다(주황 틴트 금지, 78cbd44).
              // 채움은 surface-sunken: surface-muted는 페이지 배경과 같은 색이라 묻힌다.
              <div className="border-line bg-surface-sunken text-ink flex h-[84px] w-[84px] flex-none items-center justify-center rounded-full border text-[34px] font-bold">
                {nickname.trim().charAt(0) || '?'}
              </div>
            )}
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap gap-2">
                <label
                  htmlFor="profileImage"
                  className="border-line text-ink hover:bg-ink/[.07] active:bg-ink/[.14] inline-flex min-h-[38px] w-fit cursor-pointer items-center gap-2 rounded-md border px-4 text-[13.5px] font-bold transition-colors"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  이미지 올리기
                </label>
                <input
                  id="profileImage"
                  type="file"
                  accept={IMAGE_ACCEPT}
                  onChange={handleImageChange}
                  className="hidden"
                />
                {/* 이미 이니셜이면 되돌릴 게 없으니 띄우지 않는다. */}
                {displayedImageUrl && (
                  <button
                    type="button"
                    onClick={resetAvatar}
                    className="text-brand hover:bg-brand/10 active:bg-brand/[.18] inline-flex min-h-[38px] items-center rounded-md px-3.5 text-[13.5px] font-bold transition-colors"
                  >
                    기본값으로
                  </button>
                )}
              </div>
              <p className="text-ink/[.55] text-[12.5px] leading-[1.6] break-keep">
                JPG·PNG·WebP·GIF, 5MB 이하. 정사각형을 권장해요. 없으면 이름 첫 글자로 표시돼요.
              </p>
            </div>
          </div>
        </Section>

        <Section title="기본 정보">
          <div className="flex flex-col gap-[18px]">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="nickname" className="text-ink-muted text-[12.5px] tracking-[0.04em]">
                표시 이름
              </label>
              <input
                id="nickname"
                required
                maxLength={MAX_NICKNAME_LENGTH}
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value)
                  setNicknameError('')
                  setDirty(true)
                }}
                placeholder="다른 개발자에게 보일 이름"
                className="border-line focus:border-brand min-h-[46px] rounded-lg border px-3 text-sm transition-colors outline-none"
              />
              {nicknameError && <p className="text-danger text-[12.5px]">{nicknameError}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="introduce" className="text-ink-muted text-[12.5px] tracking-[0.04em]">
                한 줄 소개
              </label>
              <textarea
                id="introduce"
                rows={3}
                maxLength={MAX_INTRODUCE_LENGTH}
                value={introduce}
                onChange={(e) => {
                  setIntroduce(e.target.value)
                  setDirty(true)
                }}
                placeholder="무엇을 만드는 사람인지 적어보세요"
                className="border-line focus:border-brand resize-y rounded-lg border p-3 text-sm leading-[1.7] transition-colors outline-none"
              />
              {/* 상한은 시안(160)이 아니라 서버 제약(255)을 따른다 — 넘기면 저장이 거절된다. */}
              <p className="text-ink/[.48] text-right font-mono text-[11.5px] tabular-nums">
                {introduce.length} / {MAX_INTRODUCE_LENGTH}
              </p>
            </div>
          </div>
        </Section>

        <Section title="기술 스택" meta={`${selectedTagIds.length} / ${MAX_TAGS}`}>
          {/* 추가한 스택 — 시안대로 칩에 제거(×) 버튼이 붙는다. */}
          <div className="mb-3.5 flex flex-wrap gap-2">
            {selectedTags.map((tag) => (
              <span
                key={tag.tag_id}
                className="border-line bg-surface-muted text-ink hw-chipin inline-flex items-center gap-[7px] rounded-full border py-1.5 pr-2.5 pl-3 text-[12px]"
              >
                {tag.tag_name}
                <button
                  type="button"
                  aria-label={`${tag.tag_name} 제거`}
                  onClick={() => removeTag(tag.tag_id)}
                  className="text-ink/60 hover:text-ink -mr-1 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </span>
            ))}
            {selectedTags.length === 0 && (
              <span className="text-ink/50 text-[13px]">아직 추가한 스택이 없어요.</span>
            )}
          </div>

          {/* 입력 + 추가. 이 폼 안에 또 form을 둘 수 없어(중첩 form은 무효) Enter를 직접 받는다. */}
          <div className="flex items-start gap-2">
            <div className="relative min-w-0 flex-1">
              <input
                type="text"
                value={tagDraft}
                onChange={(e) => {
                  setTagDraft(e.target.value)
                  setTagError('')
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  // 바깥 폼이 submit되어 프로필이 저장돼 버리는 걸 막는다.
                  e.preventDefault()
                  addTagFromDraft()
                }}
                disabled={selectedTagIds.length >= MAX_TAGS}
                placeholder="스택 이름을 입력하고 Enter"
                aria-label="기술 스택 입력"
                className="border-line focus:border-brand min-h-[42px] w-full rounded-lg border px-3 text-[13.5px] transition-colors outline-none disabled:opacity-50"
              />
              {/* 등록된 스택만 저장할 수 있어서, 입력 중 고를 수 있는 것을 바로 보여준다. */}
              {tagSuggestions.length > 0 && (
                <ul className="border-line bg-surface absolute inset-x-0 top-[46px] z-20 flex list-none flex-col overflow-hidden rounded-lg border p-0 shadow-lg">
                  {tagSuggestions.map((tag) => (
                    <li key={tag.tag_id}>
                      <button
                        type="button"
                        onClick={() => addTagById(tag.tag_id)}
                        className="hover:bg-surface-muted text-ink block w-full px-3 py-2 text-left text-[13px] transition-colors"
                      >
                        {tag.tag_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {tagError && (
                <p
                  role="alert"
                  className="text-danger mt-1.5 flex items-center gap-1.5 text-[12.5px] break-keep"
                >
                  <AlertCircleIcon />
                  {tagError}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={addTagFromDraft}
              disabled={!draft || selectedTagIds.length >= MAX_TAGS}
              className="border-line text-ink hover:bg-ink/[.07] active:bg-ink/[.14] min-h-[42px] flex-none rounded-lg border px-[18px] text-[13.5px] font-bold transition-colors disabled:opacity-45"
            >
              추가
            </button>
          </div>
        </Section>

        <Section title="GitHub 연동">
          <div className="border-line bg-surface-muted flex flex-wrap items-center gap-3.5 rounded-lg border px-4 py-[15px]">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="text-ink/[.62] flex-none"
            >
              <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
              <path d="M9 18c-4.51 2-5-2-7-2" />
            </svg>
            <div className="min-w-0 flex-1">
              {/* undefined를 '연동되지 않음'으로 접으면 안 된다. 조회가 실패한 계정은 대개
                  연동돼 있는데 "연동하세요"가 뜨고, 그 화면에서는 **연동 해제 버튼에 닿을
                  방법이 아예 없어진다.** 그래서 null(미연동)과 별개로 다룬다. */}
              {github === undefined ? (
                <>
                  <p className="text-ink text-[13.5px]">
                    {isGithubLoading ? '연동 상태를 확인하는 중...' : '연동 상태를 불러오지 못했어요.'}
                  </p>
                  <p className="text-ink/[.55] mt-[3px] text-[12px]">
                    {isGithubLoading
                      ? '잠시만 기다려 주세요.'
                      : '잠시 후 다시 시도해 주세요.'}
                  </p>
                </>
              ) : github ? (
                <>
                  <p className="text-ink truncate font-mono text-[13px]">
                    github.com/{github.github_login}
                  </p>
                  <p className="text-success mt-[3px] flex items-center gap-1.5 text-[12px]">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    연동됨 · 성장 초원에 커밋이 표시돼요
                  </p>
                </>
              ) : (
                <>
                  <p className="text-ink text-[13.5px]">연동되지 않음</p>
                  <p className="text-ink/[.55] mt-[3px] text-[12px]">
                    연동하면 프로필에 성장 초원이 생겨요.
                  </p>
                </>
              )}
            </div>
            {/* 시안의 알약 버튼 — 연동됨이면 흐린 테두리 '연동 해제', 아니면 주황 테두리 '연동하기'.
                상태를 모르는 동안(undefined)에는 연동/해제 중 무엇을 눌러야 할지 알 수 없으므로
                '다시 시도'로 바꿔 조회부터 끝내게 한다. */}
            {github === undefined ? (
              <button
                type="button"
                onClick={() => void refetchGithub()}
                disabled={isGithubFetching}
                className="border-line text-ink/[.62] hover:bg-ink/[.07] min-h-9 flex-none rounded-full border px-[15px] text-[13px] transition-colors disabled:opacity-45"
              >
                {isGithubFetching ? '확인 중...' : '다시 시도'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => requestGithubAction(github ? 'disconnect' : 'connect')}
                disabled={isDisconnecting}
                className={[
                  'min-h-9 flex-none rounded-full border px-[15px] text-[13px] transition-colors disabled:opacity-45',
                  github
                    ? 'border-line text-ink/[.62] hover:bg-ink/[.07]'
                    : 'border-brand text-brand-strong hover:bg-brand/10',
                ].join(' ')}
              >
                {github ? (isDisconnecting ? '해제하는 중...' : '연동 해제') : '연동하기'}
              </button>
            )}
          </div>
        </Section>

        {errorMessage && <p className="text-danger text-sm">{errorMessage}</p>}
      </div>

      {/* 시안의 하단 고정 저장 바. 섹션이 길어 스크롤해도 저장 버튼이 늘 닿는 곳에 있다.
          배경은 카드(surface)가 아니라 **페이지 배경(surface-muted)** 94% + 블러다 —
          흰 바를 깔면 카드와 같은 색이라 바가 콘텐츠처럼 붙어 보인다(시안 값 그대로).

          이 화면이 셸(AppLayout) 안으로 들어오면서 셸을 피해 자리를 잡아야 한다:
            데스크톱 — 콘텐츠와 같은 200px 오프셋에서 시작(안 그러면 좌측 레일 위로 깔린다)
            모바일   — 하단 탭바 바로 위. 탭바 높이는 항목 min-h 58px + 상단 border 1px
                       = 59px다(58로 잡으면 1px 겹친다). safe-area는 탭바가 이미
                       먹으므로 여기서는 데스크톱에서만 그 여백을 더한다. */}
      <div className="border-line bg-surface-muted/[.94] fixed inset-x-0 bottom-[calc(59px+env(safe-area-inset-bottom))] z-40 border-t backdrop-blur-[10px] md:bottom-0 md:left-[200px] md:pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-[720px] items-center gap-2.5 px-4 py-3 md:px-6 md:py-3.5">
          <span className="text-ink/[.55] flex-1 text-[12.5px]">{barMessage}</span>
          <Link
            to="/users/me"
            className="text-brand hover:bg-brand/10 active:bg-brand/[.18] inline-flex min-h-[42px] items-center rounded-md px-4 text-[13.5px] font-bold transition-colors"
          >
            취소
          </Link>
          <button
            type="submit"
            disabled={!canSubmit || isSubmitting || !isDirty}
            className="bg-brand hover:bg-brand-hover border-brand inline-flex min-h-[42px] items-center gap-2 rounded-md border px-[22px] text-sm font-bold text-white transition-colors disabled:opacity-45"
          >
            {isSubmitting ? (
              <>
                <SpinnerIcon />
                저장 중...
              </>
            ) : (
              '변경사항 저장'
            )}
          </button>
        </div>
      </div>

      {/* 연동하기로 화면을 떠나기 전 확인. "무엇이 사라지는지"를 먼저 말한다 —
          되돌릴 수 없는 건 연동이 아니라 입력이다. */}
      {pendingGithubAction && (
        <Modal
          onClose={() => setPendingGithubAction(null)}
          label="저장하지 않은 변경"
          className="max-w-[420px]"
        >
          <h2 className="text-ink text-[19px] leading-[1.35] font-bold tracking-[-0.015em]">
            저장하지 않은 변경이 있어요
          </h2>
          <p className="text-ink/[.78] mt-3 text-sm leading-[1.7] break-keep">
            {pendingGithubAction === 'connect'
              ? '연동을 시작하면 GitHub 인증 화면으로 이동해요.'
              : '연동을 해제하면 프로필 화면으로 이동해요.'}{' '}
            표시 이름·한 줄 소개·기술 스택에 방금 고친 내용을 먼저 저장하고 넘어갈게요.
          </p>
          {!canSubmit && (
            <p className="text-danger mt-2.5 text-[12.5px] break-keep">
              저장하려면 표시 이름이 필요해요. 채운 뒤에 다시 눌러주세요.
            </p>
          )}
          <div className="mt-[26px] flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setPendingGithubAction(null)}
              className="border-line-strong hover:bg-surface-muted rounded-lg border px-5 py-2.5 text-sm transition-colors"
            >
              계속 편집
            </button>
            {/* "그래도 갈래?"가 아니라 저장까지 끝내고 보낸다 — 그냥 보내면 확인을 받은
                의미 없이 입력이 똑같이 사라진다. */}
            <button
              type="button"
              onClick={handleSaveAndRun}
              disabled={!canSubmit || isSubmitting}
              className="bg-brand-subtle text-brand-strong border-brand-hover rounded-lg border px-6 py-2.5 text-sm font-semibold transition-colors disabled:opacity-45"
            >
              {pendingGithubAction === 'connect' ? '저장하고 연동하기' : '저장하고 해제하기'}
            </button>
          </div>
        </Modal>
      )}
    </form>
  )
}

/** 시안 AlertCircle — 태그 입력 오류 문구 앞에 붙는다. */
function AlertCircleIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="flex-none"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  )
}

/** 시안 Spinner — 저장 중 버튼 안에서 돈다. */
function SpinnerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden className="animate-spin">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        opacity="0.3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default ProfileSettingsForm
