import { useEffect, useRef, useState } from 'react'

/** 이 시간 안에 load 이벤트가 없으면 실패로 간주한다 — 무한 스켈레톤 방지. */
const LOAD_TIMEOUT_MS = 12_000

/**
 * 게시글 상세 좌측 체험 영역 — 배포된 프로젝트(deploy_url)를 iframe으로 띄운다.
 *
 * deploy_url은 깃허브 주소가 아니라 아무 배포 사이트나 된다 (posts.project_link).
 *
 * sandbox에 allow-same-origin을 **반드시 포함**해야 한다. 빼면 iframe이 주인 없는
 * 오리진(opaque origin)이 되어 안의 페이지가 localStorage/쿠키에 손대는 순간
 * SecurityError로 죽는다 — 요즘 SPA 대부분이 시작할 때 localStorage를 읽어서,
 * 실제로 hextris.io가 초기화 단계에서 즉사해 "정적 화면만 뜨고 게임이 안 나오는"
 * 버그가 있었다. deploy_url은 항상 외부 오리진이라 allow-same-origin을 줘도
 * 그 페이지는 자기 오리진으로 돌아갈 뿐, 우리 앱과는 동일 출처 정책으로 격리된다.
 *
 * 한계: 배포 사이트가 X-Frame-Options로 삽입을 거부해도 브라우저는 load 이벤트를
 * 정상적으로 쏘고 교차 출처라 내용 확인도 불가능하다 — 즉 "차단됐음"을 코드로 알 수 없다.
 * 그래서 실패 화면은 타임아웃(load 자체가 안 오는 경우)만 잡고, 차단으로 흰 화면이
 * 보이는 경우는 상단바의 '새 창에서 열기'가 우회로다.
 */
/**
 * 프레임에 띄워도 되는 주소인가.
 *
 * (1) http/https가 아니면 거른다 — javascript:·data: 같은 스킴이 iframe src나
 *     window.open으로 그대로 넘어가면 안 된다.
 * (2) 우리 오리진은 거른다 — 같은 출처가 되면 sandbox의 allow-same-origin과 맞물려
 *     프레임이 부모 문서에 접근할 수 있게 되어 격리 전제가 무너진다.
 * 값은 작성자가 입력한 deploy_url이라 서버 검증만 믿지 않는다.
 */
function isSafeDemoUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    return parsed.origin !== window.location.origin
  } catch {
    return false
  }
}

export default function DemoStage({ url, title }: { url: string; title: string }) {
  const safe = isSafeDemoUrl(url)
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  // key를 바꿔 iframe을 다시 만든다 — src만 다시 넣으면 브라우저가 재시도하지 않을 수 있다.
  const [frameKey, setFrameKey] = useState(0)

  useEffect(() => {
    if (status !== 'loading') return
    const timer = setTimeout(() => setStatus('error'), LOAD_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [status, frameKey])

  const retry = () => {
    setStatus('loading')
    setFrameKey((key) => key + 1)
  }

  /**
   * 데모가 연 창(소셜 로그인 팝업 등)에서 돌아오면 **새로고침 안내를 띄운다.**
   *
   * <p>팝업에서 로그인에 성공해도 프레임 안 페이지는 그 사실을 모른다. 새로 불러와야
   * 로그인된 화면이 뜬다. 그런데 팝업은 <b>프레임이</b> 연 창이라 교차 출처인 우리는
   * 그 창을 볼 수도, 닫힘을 감지할 수도 없다.
   *
   * <p>그래서 포커스로 추론한다: <b>프레임에 포커스가 있는 상태에서</b> 창이 포커스를
   * 잃었다면 프레임이 새 창을 열었다는 뜻이다(사용자가 우리 UI를 누른 게 아니다).
   * 그 뒤 포커스가 돌아오면 다시 불러온다.
   *
   * <p><b>자동으로 다시 불러오지는 않는다.</b> 이 추론은 알트탭과 구별되지 않는다 —
   * 데모를 클릭해 조작하던 중 다른 앱에 갔다 오면 팝업을 연 적이 없어도 같은 조건이 된다.
   * 자동 새로고침으로 두면 로그인이 없는 데모(게임 등)에서 진행이 그냥 날아간다.
   * 안내만 띄우고 다시 불러올지는 사용자가 정한다.
   */
  const [refreshHint, setRefreshHint] = useState(false)
  const openedWindowRef = useRef(false)
  useEffect(() => {
    const onBlur = () => {
      openedWindowRef.current = document.activeElement?.tagName === 'IFRAME'
    }
    const onFocus = () => {
      if (!openedWindowRef.current) return
      openedWindowRef.current = false
      setRefreshHint(true)
    }
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return (
    <div className="absolute inset-0">
      {refreshHint && status !== 'error' && (
        // 데모 위에 얇게 얹는다 — 프레임을 가리지 않으면서 눈에는 걸리는 자리.
        <div className="hw-drop absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b border-[#141210]/[.12] bg-[#141210]/[.82] px-3 py-2 text-[12.5px] text-white">
          <span className="min-w-0 flex-1 truncate">로그인하셨나요? 새로 불러오면 반영됩니다.</span>
          <button
            type="button"
            onClick={() => {
              setRefreshHint(false)
              retry()
            }}
            className="flex-none rounded-md border border-white/40 px-2.5 py-1 font-semibold hover:bg-white/15"
          >
            새로고침
          </button>
          <button
            type="button"
            onClick={() => setRefreshHint(false)}
            aria-label="안내 닫기"
            className="flex-none rounded-md px-1.5 py-1 text-white/70 hover:text-white"
          >
            ×
          </button>
        </div>
      )}
      {!safe && (
        <div className="bg-surface-muted absolute inset-0 flex items-center justify-center p-6">
          <p className="text-ink-muted text-center text-sm break-keep">
            이 프로젝트의 배포 주소는 미리보기로 열 수 없어요.
          </p>
        </div>
      )}

      {safe && status !== 'error' && (
        <iframe
          key={frameKey}
          src={url}
          title={`${title} 라이브 데모`}
          // allow-popups-to-escape-sandbox: 프레임이 연 팝업이 sandbox를 물려받지 않게 한다.
          // 이게 없으면 데모 사이트의 소셜 로그인 팝업까지 샌드박스에 갇혀 로그인 제공자가 거부한다.
          // (리디렉션 방식 구글 로그인은 이걸 켜도 안 된다 — accounts.google.com이
          //  X-Frame-Options: DENY로 프레임 표시 자체를 막는다. 그건 상단바 '새 창에서 열기'로 간다.)
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
          onLoad={() => setStatus('ok')}
          className="h-full w-full border-0 bg-white"
        />
      )}

      {status === 'loading' && (
        <div className="bg-surface-muted absolute inset-0 flex flex-col gap-3 p-5">
          <div className="bg-surface min-h-12 flex-1 animate-pulse rounded-lg" />
          <div className="flex min-h-0 flex-[2] gap-3">
            <div className="bg-surface flex-1 animate-pulse rounded-lg" />
            <div className="bg-surface flex-1 animate-pulse rounded-lg" />
          </div>
          <p className="text-ink-subtle py-1 text-center text-sm">
            배포된 프로젝트를 불러오는 중...
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-surface-muted absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-ink font-semibold">미리보기를 불러오지 못했어요</p>
          <p className="text-ink-muted max-w-sm text-sm leading-relaxed break-keep">
            배포 사이트가 응답하지 않았어요. 새 창에서 열면 정상적으로 확인할 수
            있어요.
          </p>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={retry}
              className="border-line hover:bg-surface rounded-lg border px-4 py-2 text-sm"
            >
              다시 시도
            </button>
            <button
              type="button"
              onClick={() => safe && window.open(url, '_blank', 'noopener')}
              className="bg-brand rounded-lg px-4 py-2 text-sm font-semibold text-white"
            >
              새 창에서 열기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
