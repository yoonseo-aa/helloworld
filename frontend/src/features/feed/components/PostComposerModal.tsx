import { useCallback, useEffect, useRef, useState } from 'react'
import { getErrorMessage } from '@/api/errors'
import { IMAGE_ACCEPT, validateImageFile } from '@/api/files'
import Modal from '@/components/Modal'
import { useToastStore } from '@/stores/useToastStore'
import { useAnalyzeProject, useSubmitPost } from '../hooks'
import type { UploadTarget } from '../hooks'
import GithubRepoPicker from './GithubRepoPicker'
import type { GithubRepo, PostType } from '../types'

/**
 * 게시물 작성 모달 — 시안(front.zip handoff ComposerModal) 이식.
 *
 * URL을 주지 않는다 — 뒤로가기로 작성 중인 내용이 날아가는 게 더 나쁘기 때문.
 * 그래서 라우트가 아니라 AppLayout의 로컬 상태로 연다.
 *
 * 셸은 시안대로 **헤더 / 본문 / 푸터 3단**이다.
 *
 * 높이는 **고정**이고 패널은 `self-start`로 위에 붙여 둔다. 고정이라 탭을 바꾸든
 * 이미지를 몇 장 넣든 모달 크기가 변하지 않고, 위에 붙어 있어 (가운데 정렬과 달리)
 * 크기가 변하는 상황에서도 헤더가 위아래로 튀지 않는다.
 * 값은 **프로젝트 탭 좌측 컬럼이 딱 들어가는 높이**다 — 저장소 목록은 떠서 덮으므로
 * 계산에 넣지 않는다. 더 키우면 그만큼 좌측 컬럼 아래가 빈칸으로 남는다.
 *
 * 넓은 화면(xl)에서는 좌 46% 타입별 입력 / 우 54% 본문·태그 2컬럼이고,
 * **본문 영역 자체는 스크롤하지 않는다**. 여기가 스크롤되면 좌측이 길어질 때 폼 전체가
 * 늘어나 오른쪽 본문 입력창까지 같이 커진다. 넘칠 수 있는 쪽(좌측 컬럼, 카드뉴스
 * 이미지 박스)만 각자 안에서 스크롤한다. 1컬럼(태블릿 이하)은 위아래로 길게 쌓이는 게
 * 정상이라 본문 영역이 그대로 스크롤된다.
 *
 * PROJECT는 GitHub 저장소를 선택하면 분석 API가 기술 스택 태그와 본문(README)을
 * 자동으로 채운다 (사용자가 수정한 값이 그대로 저장됨 — 명세 확정). 이미지는 파일 선택 후
 * 게시 확정 시에만 업로드한다 (시퀀스의 Orphan File 방지 흐름).
 * 업로드(POST /api/files)는 실제 백엔드가 붙었다(feature/be-file-upload → MinIO).
 * 저장소 목록·분석 API는 아직 백엔드 미구현이라 msw 목으로 동작한다.
 * 수정(PATCH /api/posts/{post_id})도 백엔드 미구현이라 지금은 작성 전용이다.
 * AI 요약은 이 화면이 아니라 게시글 상세에서 동작한다 (2026-07-27 확정).
 *
 * 시안과 다른 점:
 * - 태그 자동완성(TAG_POOL 추천 목록·최대 5개): 시안은 하드코딩 배열이고 우리는
 *   GET /api/tags 연동이 아직 없다. 개수 상한도 제품 결정이라 이번 라운드는 제외.
 * - 유효성: 시안은 "프로젝트=저장소 URL 필수"지만 우리는 본문 필수를 기본으로,
 *   카드뉴스는 이미지 1장 이상, 프로젝트는 배포 URL·썸네일을 요구한다(canSubmit 참고).
 * - 탭 전환 시 폼 전체 초기화(+확인)는 우리 확정 사항이라 시안(값 유지)과 다르게 남긴다.
 */

/** 백엔드 schema.sql의 github_url·project_link VARCHAR(500)과 같은 값. 서버 측 길이 검증이 없어 초과분은 500 에러로 돌아온다. */
const MAX_URL_LENGTH = 500
/** 백엔드 schema.sql의 tags.tag_name VARCHAR(50)과 같은 값. */
const MAX_TAG_LENGTH = 50

const labelClassName = 'text-ink mb-[7px] block text-[13px] font-semibold tracking-[-0.01em]'
const hintClassName = 'text-ink/[.52] mt-[7px] text-[11.5px]'
const inputClassName =
  'border-line bg-surface text-ink placeholder:text-ink-subtle focus:border-brand min-h-10 w-full rounded-lg border px-3 py-2 text-[13.5px] outline-none'
const ghostButtonClassName =
  'border-line hover:bg-surface-muted min-h-10 flex-none rounded-lg border px-3.5 text-[13px] whitespace-nowrap disabled:opacity-50'
/** 미리보기 위에 얹는 원형 버튼(제거 등) — 시안 값. */
const overlayButtonClassName =
  'absolute flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#141210]/[.62] text-[13px] leading-none text-white'

/** 선택한 파일 + 미리보기 objectURL 쌍. URL은 제거·언마운트 시 revoke한다. 업로드에 성공하면 uploadedUrl이 기록된다. */
interface PickedImage extends UploadTarget {
  previewUrl: string
}

function pickImage(file: File): PickedImage {
  return { file, previewUrl: URL.createObjectURL(file) }
}

/** 분석 응답의 태그 정리 — trim·빈 값·자체 중복·길이 초과 제거 (addTag와 같은 기준). */
function sanitizeTags(tags: string[]): string[] {
  const result: string[] = []
  for (const raw of tags) {
    const tag = raw.trim()
    if (tag.length === 0 || tag.length > MAX_TAG_LENGTH || result.includes(tag))
      continue
    result.push(tag)
  }
  return result
}

export default function PostComposerModal({ onClose }: { onClose: () => void }) {
  // 게시 완료 알림은 전역 토스트로 띄운다 — 모달이 닫히며 사라지는 자리라
  // 여기서 직접 그리면 문구를 볼 새도 없이 언마운트된다.
  const showToast = useToastStore((state) => state.show)
  const [postType, setPostType] = useState<PostType>('PROJECT')
  // 탭 전환 방향 — 새 패널이 어느 쪽에서 밀려들어올지 정한다 (프로젝트→카드뉴스면 오른쪽에서).
  const [swapDirection, setSwapDirection] = useState<'left' | 'right'>('right')
  const [content, setContent] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [deployUrl, setDeployUrl] = useState('')
  const [techStacks, setTechStacks] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [thumbnail, setThumbnail] = useState<PickedImage | null>(null)
  const [images, setImages] = useState<PickedImage[]>([])
  const [isRepoPickerOpen, setRepoPickerOpen] = useState(false)
  /**
   * 저장소 안내 줄에 띄울 메시지. 기본 안내·진행·결과가 **같은 한 줄**을 나눠 쓴다 —
   * 상황마다 줄을 새로 만들면 폼이 위아래로 밀리고, 안내와 결과가 따로 놀아 보인다.
   * tone은 색만 가른다: 분석 실패는 빨강, "요약만 못 만듦"은 정상 경로라 평소 색.
   */
  const [analyzeNotice, setAnalyzeNotice] = useState<{
    text: string
    tone: 'muted' | 'error'
  } | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  // 크게 보기 — 고른 이미지가 잘린 썸네일로만 보여 확인이 안 되는 문제 때문에 둔다.
  const [zoomedImage, setZoomedImage] = useState<PickedImage | null>(null)
  const { mutate: submitPost, isPending: isSubmitting } = useSubmitPost()
  const {
    mutate: analyze,
    isPending: isAnalyzing,
    reset: resetAnalyze,
  } = useAnalyzeProject()

  // 진행 중 분석 응답 무효화용 시퀀스 — 탭 전환(resetForm)마다 올려 이전 응답을 버린다.
  // 모달은 탭을 바꿔도 마운트가 유지되므로, 가드가 없으면 뒤늦은 onSuccess가
  // 방금 초기화한 다른 탭의 폼을 README·태그로 다시 채운다.
  const analyzeSeqRef = useRef(0)
  // 직전 분석이 자동 입력한 값 — 저장소를 다시 고르면 이 값들만 새 결과로 교체하고,
  // 사용자가 직접 쓴 본문·태그는 건드리지 않는다.
  const lastAutoAnalysisRef = useRef<{ readme: string; tags: string[] }>({
    readme: '',
    tags: [],
  })

  const hasDraft =
    content.trim().length > 0 ||
    githubUrl.trim().length > 0 ||
    deployUrl.trim().length > 0 ||
    techStacks.length > 0 ||
    thumbnail !== null ||
    images.length > 0

  /**
   * 게시 가능 조건 — 유형마다 "이게 없으면 게시물이 성립하지 않는" 것들.
   *  - 카드뉴스: 이미지가 곧 본문이라 최소 1장.
   *  - 프로젝트: 배포 URL과 썸네일. 배포 URL은 상세의 iframe 시연이, 썸네일은 피드 카드의
   *    대표컷이 그 값에 걸려 있다. 비면 피드에서 글자만 있는 빈 카드가 되고 시연도 못 연다.
   *
   * 서버는 유형과 본문(+카드뉴스 이미지)만 요구하므로 이 둘은 **클라이언트 규칙**이다.
   * 다른 경로로 만든 게시물에는 여전히 비어 있을 수 있어, 조회 화면의 폴백은 그대로 둔다.
   */
  const canSubmit =
    content.trim().length > 0 &&
    (postType === 'PROJECT'
      ? deployUrl.trim().length > 0 && thumbnail !== null
      : images.length > 0)

  const requestClose = useCallback(() => {
    // 게시 진행 중엔 닫지 않는다 — 사용자 모르게 게시가 성공(유령 게시물)하거나
    // 실패(에러 미표시)로 갈리는 걸 막는다.
    if (isSubmitting) return
    if (hasDraft && !window.confirm('작성 중인 내용이 사라집니다. 닫을까요?')) return
    onClose()
  }, [isSubmitting, hasDraft, onClose])

  // 언마운트 시 남아 있는 미리보기 objectURL을 모두 해제한다.
  const previewsRef = useRef<PickedImage[]>([])
  previewsRef.current = thumbnail ? [thumbnail, ...images] : images
  useEffect(
    () => () => {
      for (const image of previewsRef.current) URL.revokeObjectURL(image.previewUrl)
    },
    [],
  )

  /** 탭 전환 시 모든 입력을 초기화한다 (전체 초기화로 확정). 미리보기 objectURL도 함께 해제. */
  function resetForm() {
    // 진행 중인 저장소 분석 응답이 초기화된 폼을 다시 채우지 못하게 무효화한다.
    analyzeSeqRef.current += 1
    lastAutoAnalysisRef.current = { readme: '', tags: [] }
    resetAnalyze()
    if (thumbnail) URL.revokeObjectURL(thumbnail.previewUrl)
    for (const image of images) URL.revokeObjectURL(image.previewUrl)
    setContent('')
    setGithubUrl('')
    setDeployUrl('')
    setTechStacks([])
    setTagInput('')
    setThumbnail(null)
    setImages([])
    setRepoPickerOpen(false)
    setAnalyzeNotice(null)
    setErrorMessage('')
    setZoomedImage(null)
  }

  function selectTab(type: PostType) {
    if (type === postType || isSubmitting) return
    // 닫기와 동일한 초안 보호 — 탭 미스클릭 한 번에 작성물이 날아가지 않게.
    if (hasDraft && !window.confirm('탭을 바꾸면 작성 중인 내용이 사라집니다. 계속할까요?'))
      return
    setSwapDirection(type === 'CARD_NEWS' ? 'right' : 'left')
    setPostType(type)
    resetForm()
  }

  function runAnalyze(url: string) {
    setAnalyzeNotice(null)
    const seq = ++analyzeSeqRef.current
    analyze(
      { github_url: url },
      {
        onSuccess: (data) => {
          if (seq !== analyzeSeqRef.current) return // 탭 전환 등으로 무효화된 응답
          const prevAuto = lastAutoAnalysisRef.current
          const incoming = sanitizeTags(data.tech_stacks)
          // 이전 저장소가 자동으로 넣은 태그는 새 결과로 교체하고, 사용자 수동 태그만 유지한다.
          setTechStacks((prev) => {
            const manual = prev.filter((tag) => !prevAuto.tags.includes(tag))
            return [...manual, ...incoming.filter((tag) => !manual.includes(tag))]
          })
          // 본문도 마찬가지 — 손대지 않은 자동 초안만 새 초안으로 교체한다.
          //
          // ?? '' 가 꼭 있어야 한다. 서버가 요약을 만들지 못하면(README가 짧거나 LLM 미설정)
          // 초안이 빈 문자열이 되고, 전역 non_null 직렬화라 **readme 키 자체가 빠진다.**
          // 그대로 넣으면 content가 undefined가 되어 이후 content.trim()에서 화면이 통째로
          // 죽는다("Cannot read properties of undefined (reading 'trim')").
          const draft = data.readme ?? ''
          // 초안이 비었으면 본문을 건드리지 않는다 — 사용자가 쓰던 내용을 지우면 안 된다.
          if (draft) {
            setContent((prev) => (prev.trim() && prev !== prevAuto.readme ? prev : draft))
          }
          lastAutoAnalysisRef.current = { readme: draft, tags: incoming }
          if (!draft) {
            setAnalyzeNotice({
              text: '요약을 만들지 못해 기술 스택만 채웠어요. 본문은 직접 작성해 주세요.',
              tone: 'muted',
            })
          }
        },
        onError: () => {
          if (seq !== analyzeSeqRef.current) return
          setAnalyzeNotice({
            text: '저장소 분석에 실패했습니다. 직접 입력해주세요.',
            tone: 'error',
          })
        },
      },
    )
  }

  function handleRepoSelect(repo: GithubRepo) {
    setGithubUrl(repo.html_url)
    setRepoPickerOpen(false)
    runAnalyze(repo.html_url)
  }

  function handleThumbnailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일을 다시 골라도 change가 나가게 리셋
    if (!file) return
    // 서버 제약(5MB·jpg/png/webp/gif)을 고르는 즉시 확인한다 — 게시 버튼을 누른 뒤
    // 업로드 단계에서 실패하면 작성하던 흐름이 통째로 끊긴다.
    const invalidReason = validateImageFile(file)
    if (invalidReason) {
      setErrorMessage(invalidReason)
      return
    }
    setErrorMessage('')
    if (thumbnail) URL.revokeObjectURL(thumbnail.previewUrl)
    setThumbnail(pickImage(file))
  }

  function removeThumbnail() {
    if (!thumbnail) return
    if (zoomedImage === thumbnail) setZoomedImage(null)
    URL.revokeObjectURL(thumbnail.previewUrl)
    setThumbnail(null)
  }

  function handleImagesChange(e: React.ChangeEvent<HTMLInputElement>) {
    // FileList는 라이브 객체다 — value를 리셋하면 이미 받아둔 참조까지 비워지므로
    // 리셋 전에 배열로 복사해야 한다.
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    // 여러 장을 한 번에 고를 수 있어, 문제 있는 것만 빼고 나머지는 받아준다
    // (한 장 때문에 전부 다시 고르게 하지 않는다).
    const rejected = files.filter((file) => validateImageFile(file) !== null)
    const accepted = files.filter((file) => validateImageFile(file) === null)
    setErrorMessage(
      rejected.length > 0
        ? `${rejected.length}장은 제외했어요 — 이미지 5MB 이하(jpg, png, webp, gif)만 올릴 수 있어요.`
        : '',
    )
    if (accepted.length === 0) return
    setImages((prev) => [...prev, ...accepted.map(pickImage)])
  }

  function removeImage(index: number) {
    const target = images[index]
    if (zoomedImage === target) setZoomedImage(null)
    URL.revokeObjectURL(target.previewUrl)
    setImages(images.filter((_, i) => i !== index))
  }

  /** 배열 순서 = 노출 순서(display_order)라서 순서 이동이 곧 순서 지정이다. */
  function moveImage(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= images.length) return
    const next = [...images]
    ;[next[index], next[target]] = [next[target], next[index]]
    setImages(next)
  }

  function addTag() {
    const tag = tagInput.trim()
    // 중복 태그는 서버 uk_post_tags UNIQUE 제약에 걸려 500이 나므로 추가 단계에서 막는다.
    if (tag.length === 0 || tag.length > MAX_TAG_LENGTH || techStacks.includes(tag))
      return
    setTechStacks([...techStacks, tag])
    setTagInput('')
  }

  /** 태그 입력의 Enter를 추가 동작으로 돌린다. IME 조합 중 Enter는 무시. */
  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (!e.nativeEvent.isComposing) addTag()
  }

  /**
   * 한 줄 입력(GitHub URL 등)의 Enter가 HTML 암묵 제출로 새서 게시되지 않게
   * form 레벨에서 막는다. textarea 줄바꿈·버튼 활성화·파일 선택 열기는 그대로 둔다.
   */
  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (
      e.key === 'Enter' &&
      e.target instanceof HTMLInputElement &&
      e.target.type !== 'file'
    )
      e.preventDefault()
  }

  /** 업로드 성공한 파일의 URL을 폼 상태에 기록한다 — 게시 재시도 시 재업로드(고아 파일)를 막는다. */
  function markUploaded(target: UploadTarget, url: string) {
    setThumbnail((prev) =>
      prev && prev.file === target.file ? { ...prev, uploadedUrl: url } : prev,
    )
    setImages((prev) =>
      prev.map((image) =>
        image.file === target.file ? { ...image, uploadedUrl: url } : image,
      ),
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isSubmitting) return
    setErrorMessage('')
    // 서버는 post_type별 필드를 구분하지 않고 온 것을 전부 저장하므로,
    // 현재 탭에 맞는 필드만 담아 보낸다 (탭 전환 시 폼이 초기화되지만 이중 방어).
    submitPost(
      postType === 'PROJECT'
        ? {
            base: {
              post_type: 'PROJECT',
              content,
              github_url: githubUrl.trim() || undefined,
              deploy_url: deployUrl.trim() || undefined,
              tech_stacks: techStacks.length > 0 ? techStacks : undefined,
            },
            thumbnail: thumbnail ?? undefined,
            onUploaded: markUploaded,
          }
        : {
            base: {
              post_type: 'CARD_NEWS',
              content,
              tech_stacks: techStacks.length > 0 ? techStacks : undefined,
            },
            images,
            onUploaded: markUploaded,
          },
      {
        onSuccess: () => {
          showToast(
            'success',
            postType === 'CARD_NEWS' ? '카드뉴스를 게시했어요.' : '프로젝트를 게시했어요.',
          )
          onClose()
        },
        onError: (error) =>
          setErrorMessage(getErrorMessage(error, '게시물 등록에 실패했습니다.')),
      },
    )
  }

  return (
    <Modal
      onClose={requestClose}
      label="게시물 작성"
      bare
      className="mt-[3svh] flex h-[min(622px,86svh)] max-w-[680px] flex-col self-start overflow-hidden xl:max-w-[1080px]"
    >
      {/* 헤더 — 고정. 탭을 바꿔도 이 줄은 절대 움직이지 않는다 (시안 값). */}
      <div className="border-line flex flex-none items-center gap-3.5 border-b py-3.5 pr-2.5 pl-6">
        <h2 className="text-ink flex-none text-[19px] font-bold tracking-[-0.02em]">
          게시물 작성
        </h2>
        <div
          role="tablist"
          aria-label="게시물 종류"
          className="border-line relative flex max-w-[330px] flex-1 gap-1.5 rounded-lg border p-1"
        >
          {/*
            활성 표시는 각 버튼에 칠하지 않고 **하나의 판**이 미끄러져 옮겨간다 —
            좌측 패널이 옆에서 밀려들어오는 연출과 방향이 맞아 전환이 한 동작으로 읽힌다.
            폭 calc(50% - 7px): 안쪽 여백 4+4, 버튼 사이 간격 6을 뺀 버튼 하나의 폭.
            이동 거리 calc(100% + 6px): 자기 폭 + 간격.
          */}
          <span
            aria-hidden
            style={{
              transform: postType === 'CARD_NEWS' ? 'translateX(calc(100% + 6px))' : 'none',
            }}
            className="border-brand bg-brand/[8%] pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-7px)] rounded-md border transition-transform duration-[240ms] ease-[cubic-bezier(0.2,0.8,0.25,1)] motion-reduce:transition-none"
          />
          {(['PROJECT', 'CARD_NEWS'] as const).map((type) => {
            const isActive = postType === type
            return (
              <button
                key={type}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => selectTab(type)}
                className={[
                  'relative z-10 min-h-10 flex-1 rounded-md text-sm font-semibold tracking-[-0.01em] transition-colors',
                  isActive ? 'text-brand-strong' : 'text-ink/[.55] hover:text-ink',
                ].join(' ')}
              >
                {type === 'PROJECT' ? '프로젝트' : '카드뉴스'}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={requestClose}
          aria-label="닫기"
          className="text-ink/[.55] hover:text-ink ml-auto flex h-11 w-11 flex-none items-center justify-center rounded-lg"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      {/*
        본문 영역.
        2컬럼(xl)에서는 이 영역 자체를 스크롤시키지 않는다(overflow-hidden) — 여기가 스크롤되면
        저장소 목록을 펼치거나 이미지를 여러 장 넣었을 때 폼 전체가 길어지면서 오른쪽 본문
        입력창까지 같이 늘어난다. 대신 넘칠 수 있는 쪽(좌측 컬럼)만 자기 안에서 스크롤한다.
        1컬럼(모바일·태블릿)은 위아래로 길게 쌓이는 게 정상이라 이 영역이 그대로 스크롤된다.
      */}
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable] px-5 py-4 xl:overflow-hidden xl:px-6 xl:py-[18px]">
        <form
          id="post-composer-form"
          onSubmit={handleSubmit}
          onKeyDown={handleFormKeyDown}
          className="flex min-h-full flex-col gap-5 xl:h-full xl:min-h-0 xl:flex-row xl:gap-[26px]"
        >
          {/* 좌측 — 게시물 종류별 입력. key로 탭마다 다시 마운트돼 등장 애니메이션이 재생된다. */}
          <div
            key={postType}
            // 스크롤은 **좌측 컬럼 전체**가 맡는다. 안쪽 박스(이미지 그리드)만 따로 스크롤시키면
            // 그 박스만 스크롤바 폭을 빼앗겨 타일 오른쪽 끝이 위 버튼·아래 안내문과 어긋난다.
            // scrollbar-gutter:stable — 스크롤바가 생겨도 자리를 미리 비워 둬 내용이 밀리지 않는다.
            // -mr-3 + pr-[22px] — 스크롤 박스를 컬럼 사이 여백 쪽으로 12px 밀어내 스크롤바를
            // 오른쪽 구분선에 가깝게 붙이고, 그만큼 padding으로 되돌려 내용 폭은 그대로 둔다.
            className={`flex min-h-0 min-w-0 flex-col gap-4 [scrollbar-gutter:stable] xl:-mr-3 xl:flex-[1_1_46%] xl:overflow-y-auto xl:pr-[22px] hw-swap-${swapDirection}`}
          >
            {postType === 'PROJECT' ? (
              <>
                <div className="flex min-w-0 flex-col">
                  <label htmlFor="githubUrl" className={labelClassName}>
                    GitHub 저장소
                  </label>
                  {/* 저장소 목록은 아래를 밀어내지 않고 **떠서 덮는다**.
                      밀어내는 구조면 좌측 컬럼이 목록 높이만큼 길어지는데, 화면 세로가
                      조금만 짧아도 그만큼이 안 들어가 목록을 열 때마다 스크롤이 생긴다.
                      모달 높이를 키워도 svh 상한에 먼저 걸려 근본 해결이 안 된다. */}
                  <div className="relative flex gap-2">
                    <input
                      id="githubUrl"
                      type="url"
                      maxLength={MAX_URL_LENGTH}
                      placeholder="https://github.com/user/repo"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      className={inputClassName}
                    />
                    <button
                      type="button"
                      onClick={() => setRepoPickerOpen((open) => !open)}
                      className={ghostButtonClassName}
                    >
                      저장소 선택
                    </button>
                    {isRepoPickerOpen && (
                      <div className="bg-surface absolute top-full right-0 left-0 z-20 mt-1.5 rounded-lg shadow-md">
                        <GithubRepoPicker onSelect={handleRepoSelect} />
                      </div>
                    )}
                  </div>
                  {/* 기본 안내 · 분석 중 · 결과가 같은 자리·같은 크기를 나눠 쓴다.
                      상황마다 줄을 새로 띄우면 폼이 밀려 내려가고 둘이 따로 놀아 보인다. */}
                  <p
                    className={
                      !isAnalyzing && analyzeNotice?.tone === 'error'
                        ? `${hintClassName} text-danger`
                        : hintClassName
                    }
                  >
                    {isAnalyzing
                      ? '저장소 분석 중... 기술 스택과 본문을 채우고 있습니다'
                      : (analyzeNotice?.text ??
                        '선택하면 기술 스택과 본문(README)이 자동 입력됩니다')}
                  </p>
                </div>

                <div className="flex min-w-0 flex-col">
                  <label htmlFor="deployUrl" className={labelClassName}>
                    배포 URL (필수)
                  </label>
                  <input
                    id="deployUrl"
                    type="url"
                    maxLength={MAX_URL_LENGTH}
                    placeholder="https://my-app.vercel.app"
                    value={deployUrl}
                    onChange={(e) => setDeployUrl(e.target.value)}
                    className={inputClassName}
                  />
                  {/* 안내 문구는 비워 두되 자리는 남긴다 — 없애면 아래 썸네일 블록이
                      그만큼 올라붙어 두 입력의 간격이 다른 줄과 어긋난다. */}
                  <p className={hintClassName} aria-hidden>
                    &nbsp;
                  </p>
                </div>

                <div className="flex min-w-0 flex-col">
                  <span className={labelClassName}>썸네일 이미지 (필수)</span>
                  {/* 카드뉴스 타일과 완전히 같은 형태 — 같은 3열 그리드의 한 칸, 정사각.
                      폭이 바뀌어도 두 탭의 미리보기 크기가 자동으로 일치한다.
                      비어 있어도 자리를 잡아둬서, 썸네일을 넣어도 모달이 커지지 않는다. */}
                  <div className="mb-[9px] grid grid-cols-3 gap-2.5">
                    {thumbnail ? (
                      <span className="border-line bg-surface-muted relative block aspect-square overflow-hidden rounded-lg border">
                        <button
                          type="button"
                          onClick={() => setZoomedImage(thumbnail)}
                          aria-label="썸네일 크게 보기"
                          className="block h-full w-full cursor-zoom-in"
                        >
                          <img
                            src={thumbnail.previewUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={removeThumbnail}
                          aria-label="썸네일 제거"
                          className={`${overlayButtonClassName} top-1.5 right-1.5`}
                        >
                          ×
                        </button>
                      </span>
                    ) : (
                      <div
                        aria-hidden
                        className="aspect-square rounded-lg border border-dashed"
                        style={{
                          borderColor: 'color-mix(in srgb, var(--color-ink) 20%, transparent)',
                        }}
                      />
                    )}
                  </div>
                  <div className="flex min-w-0 items-center gap-3">
                    <label
                      className={`${ghostButtonClassName} has-[:focus-visible]:ring-brand inline-flex cursor-pointer items-center has-[:focus-visible]:ring-2`}
                    >
                      이미지 선택
                      {/* display:none(hidden)은 포커스 순서에서 빠진다 — sr-only로 숨겨 키보드 접근을 유지한다. */}
                      <input
                        type="file"
                        accept={IMAGE_ACCEPT}
                        onChange={handleThumbnailChange}
                        className="sr-only"
                      />
                    </label>
                    <span className="text-ink/[.52] min-w-0 flex-1 truncate text-[11.5px]">
                      {thumbnail
                        ? `${thumbnail.file.name} · 클릭하면 잘리는 범위를 볼 수 있어요`
                        : '피드 카드에 쓰일 대표 이미지'}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center justify-between gap-2.5">
                  <span className={labelClassName}>이미지 — 위에서부터 순서대로 노출</span>
                  <label
                    className={`${ghostButtonClassName} has-[:focus-visible]:ring-brand mb-[7px] inline-flex cursor-pointer items-center has-[:focus-visible]:ring-2`}
                  >
                    이미지 선택
                    <input
                      type="file"
                      accept={IMAGE_ACCEPT}
                      multiple
                      onChange={handleImagesChange}
                      className="sr-only"
                    />
                  </label>
                </div>

                {/* 그리드 자체에는 높이를 주지 않는다 — 확정 높이를 주면 행이 눌려
                    정사각 타일이 제 행을 넘어 위아래로 겹친다. 넘치는 만큼은 좌측 컬럼이 스크롤한다. */}
                <div className="mt-3">
                  {images.length > 0 ? (
                  <ul className="grid grid-cols-3 gap-2.5">
                    {images.map((image, index) => (
                      <li
                        key={image.previewUrl}
                        className="border-line bg-surface-muted relative aspect-square overflow-hidden rounded-lg border"
                      >
                        <button
                          type="button"
                          onClick={() => setZoomedImage(image)}
                          aria-label={`${index + 1}번째 이미지 크게 보기`}
                          className="block h-full w-full cursor-zoom-in"
                        >
                          <img
                            src={image.previewUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </button>
                        <span className="absolute top-1.5 left-1.5 rounded-full bg-[#141210]/[.66] px-[7px] py-0.5 font-mono text-[10px] tracking-[0.06em] text-white">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          aria-label={`${index + 1}번째 이미지 제거`}
                          className={`${overlayButtonClassName} top-1.5 right-1.5`}
                        >
                          ×
                        </button>
                        {/* 순서 이동 — 시안대로 좌우 화살표를 이미지 하단 그라디언트 위에 얹는다
                            (버튼 자체는 배경 없이 흰 아이콘만, 가독성은 이 그라디언트가 책임진다). */}
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-[5px] py-1">
                          <button
                            type="button"
                            onClick={() => moveImage(index, -1)}
                            disabled={index === 0}
                            aria-label={`${index + 1}번째 이미지 앞으로`}
                            className="flex h-6 w-6 items-center justify-center rounded text-white disabled:opacity-30"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="m15 18-6-6 6-6" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => moveImage(index, 1)}
                            disabled={index === images.length - 1}
                            aria-label={`${index + 1}번째 이미지 뒤로`}
                            className="flex h-6 w-6 items-center justify-center rounded text-white disabled:opacity-30"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="m9 18 6-6-6-6" />
                            </svg>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  ) : (
                    // 빈 상태도 같은 자리를 차지한다 — 첫 장을 넣어도 모달이 안 커지게(시안).
                    <div aria-hidden className="grid grid-cols-3 gap-2.5">
                      {[20, 14, 9].map((opacity) => (
                        <div
                          key={opacity}
                          className="aspect-square rounded-lg border border-dashed"
                          style={{ borderColor: `color-mix(in srgb, var(--color-ink) ${opacity}%, transparent)` }}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <p className={hintClassName}>
                  {images.length > 0
                    ? `${images.length}장 · 화살표로 순서를 바꿀 수 있어요`
                    : '이미지를 1장 이상 추가해야 게시할 수 있습니다'}
                </p>
              </div>
            )}
          </div>

          {/* 우측 — 본문·태그는 두 탭이 공유한다. 탭을 바꿔도 자리가 그대로라 시선이 튀지 않는다. */}
          <div className="border-line flex min-w-0 flex-col gap-[18px] xl:min-h-0 xl:flex-[1_1_54%] xl:border-l xl:pl-[26px]">
            <div className="flex min-w-0 flex-col xl:min-h-0 xl:flex-1">
              <label htmlFor="content" className={labelClassName}>
                본문 (Markdown)
              </label>
              <textarea
                id="content"
                required
                placeholder="내용을 입력해주세요"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                // xl에서는 남는 높이를 그대로 채운다(flex-1). 좌측에 이미지를 아무리 많이
                // 넣어도 모달 높이가 고정이라 이 입력창 크기는 변하지 않는다.
                className={`${inputClassName} min-h-[150px] resize-none text-[12.5px] leading-relaxed xl:min-h-0 xl:flex-1`}
              />
            </div>

            <div className="flex min-w-0 flex-col">
              <label htmlFor="tagInput" className={labelClassName}>
                기술 스택 태그
              </label>
              <div className="flex gap-2">
                <input
                  id="tagInput"
                  type="text"
                  autoComplete="off"
                  maxLength={MAX_TAG_LENGTH}
                  placeholder="입력 후 Enter (예: React)"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  className={inputClassName}
                />
                <button
                  type="button"
                  onClick={addTag}
                  disabled={tagInput.trim().length === 0}
                  className={ghostButtonClassName}
                >
                  추가
                </button>
              </div>
              {techStacks.length > 0 && (
                <div className="mt-[11px] flex flex-wrap gap-[7px]">
                  {techStacks.map((tag) => (
                    <span
                      key={tag}
                      className="border-line text-ink/[.72] inline-flex items-center gap-1.5 rounded-full border py-1 pr-1.5 pl-[11px] text-[11.5px]"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => setTechStacks(techStacks.filter((t) => t !== tag))}
                        aria-label={`${tag} 태그 삭제`}
                        className="text-ink/[.46] hover:text-danger flex h-[18px] w-[18px] items-center justify-center rounded-full text-[13px] leading-none"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* 푸터 — 고정. 본문이 아무리 길어져도 게시 버튼을 찾아 스크롤할 일이 없다. */}
      <div className="border-line bg-surface-muted flex flex-none items-center justify-end gap-2.5 border-t px-6 py-3">
        {errorMessage && (
          <span role="alert" className="text-danger mr-auto text-[12.5px] break-keep">
            {errorMessage}
          </span>
        )}
        <button
          type="button"
          onClick={requestClose}
          className="text-ink-muted hover:text-ink min-h-[42px] rounded-lg px-3.5 text-[13.5px]"
        >
          취소
        </button>
        {/* 폼은 스크롤 영역 안에 있어 form 속성으로 연결한다 (푸터는 셸에 고정돼 있어야 해서). */}
        <button
          type="submit"
          form="post-composer-form"
          disabled={!canSubmit || isSubmitting}
          className="bg-brand hover:bg-brand-hover min-h-[42px] rounded-lg px-[22px] text-[13.5px] font-semibold text-white transition-colors disabled:opacity-50"
        >
          {isSubmitting ? '게시 중...' : '게시'}
        </button>
      </div>

      {zoomedImage && (
        // 모달 위 모달 — Modal이 스택을 추적해 ESC·포커스는 이쪽만 반응한다.
        <Modal
          onClose={() => setZoomedImage(null)}
          label={`${zoomedImage.file.name} 미리보기`}
          bare
          className="max-w-[min(92vw,560px)] p-2"
        >
          <ThumbnailPreview
            image={zoomedImage}
            // 피드 카드가 대표컷으로 쓰는 건 썸네일과 카드뉴스 첫 장뿐이다(PostCard.tsx).
            // 나머지 장은 잘리지 않고 전체가 보이므로 잘림 안내를 띄우면 거짓말이 된다.
            showCropGuide={zoomedImage === thumbnail || zoomedImage === images[0]}
          />
        </Modal>
      )}
    </Modal>
  )
}

/**
 * 썸네일 확대 미리보기 — **원본 전체를 보여주고, 피드에서 잘려 나갈 부분을 어둡게 덮는다.**
 *
 * <p>전에는 타일과 똑같이 정사각으로 잘라서 크게만 보여줬다. 잘린 결과는 정확했지만
 * 정작 <b>무엇이 잘려 나갔는지</b>를 볼 수 없어서, 확대해도 "이 사진을 써도 되는지"를
 * 판단할 수 없었다. 대표컷을 고르는 일은 남는 영역만큼이나 잘리는 영역을 보고 정하는 일이다.
 *
 * <p>피드 카드는 대표컷을 1:1 object-cover로 자른다(PostCard.tsx) — 즉 가운데 정사각만
 * 남고 긴 쪽의 양끝이 잘린다. 그 규칙을 그대로 계산해 밝은 영역으로 표시한다.
 *
 * <p>원본 비율을 컨테이너에 그대로 주는 이유: object-contain으로 여백을 만들면 이미지가
 * 실제로 그려진 상자와 컨테이너가 어긋나서, 덮개 위치를 %로 잡을 기준이 사라진다.
 * 컨테이너가 곧 이미지 상자면 % 계산이 언제나 정확하다.
 */
function ThumbnailPreview({
  image,
  showCropGuide,
}: {
  image: PickedImage
  showCropGuide: boolean
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  // 자를 영역은 짧은 변 기준의 가운데 정사각. 가로 사진이면 좌우가, 세로 사진이면 위아래가 잘린다.
  const crop = (() => {
    if (!size) return null
    const { width, height } = size
    if (width === height) return null // 이미 정사각이면 잘리는 게 없다 — 덮개를 그릴 이유도 없다
    return width > height
      ? { left: `${((width - height) / 2 / width) * 100}%`, top: '0%', size: `${(height / width) * 100}%`, vertical: false }
      : { left: '0%', top: `${((height - width) / 2 / height) * 100}%`, size: `${(width / height) * 100}%`, vertical: true }
  })()

  return (
    <>
      <div
        className="bg-surface-muted relative mx-auto overflow-hidden rounded-[10px]"
        style={{
          aspectRatio: size ? `${size.width} / ${size.height}` : '1 / 1',
          maxHeight: '70vh',
        }}
      >
        <img
          src={image.previewUrl}
          alt={image.file.name}
          onLoad={(e) =>
            setSize({
              width: e.currentTarget.naturalWidth,
              height: e.currentTarget.naturalHeight,
            })
          }
          className="h-full w-full object-fill"
        />
        {showCropGuide && crop && (
          // 잘리는 바깥쪽을 덮는다. 사각형 하나에 거대한 box-shadow를 씌우면 상자 네 개를
          // 따로 배치하지 않고도 "바깥 전부"가 어두워진다(부모의 overflow-hidden이 잘라 준다).
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-[2px] ring-1 ring-white/70 ring-inset"
            style={{
              left: crop.left,
              top: crop.top,
              width: crop.vertical ? '100%' : crop.size,
              height: crop.vertical ? crop.size : '100%',
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.58)',
            }}
          />
        )}
      </div>
      <p className="text-ink-subtle mt-2 px-1 pb-1 text-center text-[12px] break-keep">
        {showCropGuide && crop
          ? '밝은 영역만 피드 카드에 보입니다. 어두운 부분은 잘립니다.'
          : image.file.name}
      </p>
    </>
  )
}
