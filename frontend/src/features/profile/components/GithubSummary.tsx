import { lazy, memo, Suspense } from 'react'
import { useUserGithub } from '../hooks'
import { getErrorMessage } from '@/api/errors'
import { useToastStore } from '@/stores/useToastStore'
import { redirectToGithubAuthorize } from '../github-oauth'
import GithubConnectButton from './GithubConnectButton'

const MeadowSection = lazy(() => import('./MeadowSection'))

/**
 * 프로필의 GitHub 활동 섹션 진입점 — 연동됨이면 "성장 초원"(MeadowSection: 캔버스 +
 * 잔디 토글, handoff meadow/* 이식), 미연동이면 그 자리에 안내를 놓는다(내 프로필은
 * 연동 버튼까지, 남의 프로필은 "아직 연동하지 않았어요"라는 상태만).
 * field-defs.ts가 219KB라 번들에 안 얹히게 lazy import로 코드 스플리팅한다.
 *
 * 제목 줄("GitHub 활동" + 키커 + 메타 + 보기 토글)은 **MeadowSection이 그린다** —
 * 명세 7절이 넷을 baseline 정렬된 한 줄로 두는데, 제목만 여기서 그리면 메타가 아래 줄로
 * 밀려 시안과 어긋난다. 미연동 안내에는 메타·토글이 없으므로 그쪽만 제목을 따로 그린다.
 *
 * 기술스택은 여기 있다가 TechStackRow로 떨어져 나가 **업적 배지 위로 올라갔다** —
 * 시안(handoff ProfilePage)이 그 자리에 태그 줄을 두기 때문이다. 데이터 출처는 그대로
 * 이 컴포넌트와 같은 useUserGithub다.
 *
 * 응답의 badge(커밋 등급 "골드/실버/브론즈")도 일부러 안 그린다 — 업적 배지 타일이
 * GitHub 축을 이미 티어까지 표현해서 같은 정보가 두 번 나온다. 필드는 계약대로 유지.
 */

/** 연동 안내·오류 화면 전용 제목 줄 (연동됐을 땐 MeadowSection이 같은 자리를 그린다). */
function SectionHeading() {
  return (
    <div className="flex flex-wrap items-baseline gap-x-[14px] gap-y-2">
      <h2 className="text-ink m-0 text-[17px] font-bold tracking-[-0.01em]">GitHub 활동</h2>
      <span className="text-ink/[.48] font-mono text-[10.5px] tracking-[0.14em]">
        LAST 12 MONTHS
      </span>
    </div>
  )
}

/**
 * 잔디·초원이 들어갈 자리를 그대로 차지하는 점선 박스 — 미연동 안내와 조회 실패가 같이 쓴다.
 * 연동되면 이 박스가 그 시각화로 바뀌니까 "여기에 잔디가 생긴다"가 위치로도 읽힌다.
 *
 * 스페이서와 내용을 같은 그리드 칸에 겹쳐 둬서 **둘 중 큰 쪽이 높이를 정한다**: 넓은 화면에선
 * 스페이서의 21.25%(MeadowSection 캔버스와 같은 1600×340 비율)가, 문구가 여러 줄로 접히는
 * 좁은 화면에선 내용 높이가 이긴다. min-height를 눈대중으로 잡으면 폰트 폴백이나 문구 수정
 * 한 번에 잘려서, 아예 잘릴 수 없는 구조로 뒀다.
 */
function SlotBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-line grid overflow-hidden rounded-lg border border-dashed">
      <div
        aria-hidden
        className="col-start-1 row-start-1"
        style={{ width: '100%', paddingTop: '21.25%', pointerEvents: 'none' }}
      />
      <div className="col-start-1 row-start-1 flex flex-col items-center justify-center gap-3 p-5 text-center">
        {children}
      </div>
    </div>
  )
}

/**
 * props가 같으면 리렌더를 건너뛴다.
 *
 * 프로필 진입 인트로에서 업적 +N 카운트업이 틱마다 부모(ProfilePage)를 리렌더하는데,
 * 그때마다 이 섹션과 그 아래 초원(캔버스)까지 React가 다시 훑을 이유가 없다.
 * props는 userId·isOwnProfile·active뿐이라 비교가 싸고, 데이터는 각자 쿼리로 받는다.
 */
function GithubSummary({
  userId,
  isOwnProfile = false,
  active = true,
}: {
  userId: number
  /** 미연동 안내의 주어를 가른다 — 내 프로필에만 연동 버튼이 붙는다. */
  isOwnProfile?: boolean
  /** 페이지 인트로가 이 섹션을 공개했는가 — 초원 성장 시작 신호로 넘긴다. */
  active?: boolean
}) {
  const { data, isLoading, refetch, isFetching } = useUserGithub(userId)
  const showToast = useToastStore((state) => state.show)

  async function handleConnect() {
    try {
      await redirectToGithubAuthorize()
    } catch (error) {
      showToast('error', getErrorMessage(error, 'GitHub 연동을 시작하지 못했습니다.'))
    }
  }

  // 상태 판정은 쿼리 플래그가 아니라 data 값으로 한다 — 이유는 hooks.ts의
  // useGithubSectionVisible 주석 참고(500일 때 isError가 안 켜지는 경우가 있다).
  //   객체 → 연동됨 / null → 미연동 / undefined → 조회 중이거나 실패

  // 첫 조회가 도는 동안만 조용히 비운다.
  if (isLoading) return null

  // 조회 실패 — 미연동과 **다른 상태**다. 500이 나는 계정은 대개 연동은 되어 있으므로
  // "연동하세요"를 띄우면 거짓말이 된다. 사실대로 말하고 다시 시도할 길만 준다.
  if (data === undefined) {
    return (
      <section aria-label="깃허브 활동" className="flex flex-col gap-2.5">
        <SectionHeading />
        <SlotBox>
          <p className="text-ink text-sm font-medium">GitHub 활동을 불러오지 못했어요.</p>
          <p className="text-ink-muted max-w-md text-[13px] leading-relaxed break-keep">
            잠시 후 다시 시도해 주세요. 계속 같은 화면이 보이면 서버 상태를 확인해 주세요.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="border-line text-ink hover:bg-ink/5 inline-flex min-h-10 items-center rounded-md border px-4 text-[13.5px] transition-colors disabled:opacity-50"
          >
            {isFetching ? '불러오는 중...' : '다시 시도'}
          </button>
        </SlotBox>
      </section>
    )
  }

  // 미연동(404 → null). 남의 프로필에서도 **자리와 상태는 보여준다** — 예전엔 통째로
  // 감췄는데, 그러면 보는 쪽에서 "이 사람이 연동을 안 한 건지 / 안 불러와진 건지"를
  // 구분할 수가 없다. 대신 눌러 줄 수 없는 연동 버튼만 빼고 문구를 가른다.
  if (!data) {
    return (
      <section aria-label="깃허브 활동" className="flex flex-col gap-2.5">
        <SectionHeading />
        <SlotBox>
          <p className="text-ink text-sm font-medium">
            {isOwnProfile
              ? 'GitHub을 연동하면 잔디를 볼 수 있어요.'
              : '아직 GitHub을 연동하지 않았어요.'}
          </p>
          <p className="text-ink-muted max-w-md text-[13px] leading-relaxed break-keep">
            {isOwnProfile
              ? '최근 1년 커밋이 이 자리에 잔디와 성장 초원으로 그려지고, 주로 쓰는 언어와 활동 배지도 프로필에 함께 표시됩니다.'
              : '이 사용자가 GitHub을 연동하면 최근 1년 커밋이 이 자리에 잔디와 성장 초원으로 그려집니다.'}
          </p>
          {isOwnProfile && <GithubConnectButton onClick={handleConnect} />}
        </SlotBox>
      </section>
    )
  }

  // 연동돼 있으면 **커밋이 하나도 없어도 잔디를 그린다.** 예전엔 여기서
  // contributions가 비면 null을 돌려줬는데, 그러면 연동은 했는데 화면에는 제목도 구분선도
  // 없이 통째로 사라져 "왜 아무것도 안 뜨지"가 된다. 빈 잔디는 렌더가 깨지지도 않는다 —
  // contributions.ts의 mapToWindow가 최근 53주 371칸을 스스로 만들어 없는 날짜를 0으로
  // 채우므로, 빈 배열이 와도 전부 0인 정상 격자가 나온다.
  // (백엔드도 같은 입장이다: 연동 후 아직 동기화 전이면 404가 아니라 0으로 채운 잔디를 준다.)
  return (
    <Suspense
      fallback={<div className="text-ink-subtle py-6 text-center text-xs">초원을 준비하는 중...</div>}
    >
      <MeadowSection userId={userId} githubData={data} active={active} />
    </Suspense>
  )
}

export default memo(GithubSummary)
