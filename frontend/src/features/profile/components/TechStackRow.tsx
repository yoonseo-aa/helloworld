import { memo, useState } from 'react'
import { useUserInterests } from '../hooks'
import { tagFit } from '../row-fit'
// 등장 애니메이션(hw-tagin) 키프레임.
import '../profile.css'

/**
 * 기술 스택 줄 — 프로필 상단, 한줄소개 아래·업적 배지 위 (명세 2절의 고정 순서).
 *
 * 명세(`프로필-화면-명세.md`)가 이 자리에 두는 `tags: string[]`, 즉 **사용자가 프로필
 * 설정에서 직접 고른 관심 태그**를 그린다(GET /api/users/{id}/interests).
 *
 * 한동안은 GitHub 연동 데이터의 언어명이 이 자리를 대신 채웠다. 태그 조회 API가 없어
 * 저장한 태그를 되읽을 방법이 아예 없었기 때문이다. API가 생기면서 시안 원안으로 돌렸다 —
 * 사용자가 고른 값과 화면에 뜨는 값이 이제야 일치한다.
 * (GitHub 언어 비율은 현재 어디에도 표시하지 않는다. 필요해지면 별도 자리를 만든다.)
 *
 * 남의 프로필에서도 그린다 — 조회 API가 본인 여부를 보지 않는다.
 *
 * 명세 2절 수치: 행 `gap 6 / max-width 520 / align-items center`,
 *   칩 `.tag.tag-neutral` + `font-mono 11px / padding 5px 12px / letter-spacing .04em / radius 999px`
 * radius는 handoff React 이식본의 .tag 클래스가 7.5px로 어긋나 있다 — 명세가 정본이라 pill.
 *
 * **폭(`rowW`)은 직접 재지 않고 페이지에서 받는다.** 배지 행과 같은 폭을 봐야 두 줄의
 * 오른쪽 끝이 맞기 때문이다(명세 4절, row-fit.ts 주석). 이 행을 감싼 max-w-520 박스가
 * 측정 대상이고 useProfileIntro가 ResizeObserver를 건다.
 */
/** 인트로 카운트업이 틱마다 부모를 리렌더해도 여기까지 번지지 않게 한다. */
function TechStackRow({
  userId,
  rowW,
  reduce,
}: {
  userId: number
  /** 페이지가 실측한 태그 행 폭. 0이면 tagFit이 기본값(520)을 쓴다. */
  rowW: number
  reduce: boolean
}) {
  const { data: interests } = useUserInterests(userId)
  // `+N`을 누르면 전체를 펼친다 (명세 3절 "전체 태그를 펼치는 핸들러").
  const [expanded, setExpanded] = useState(false)

  const tags = interests ?? []
  // 폭 근사는 화면에 실제로 그려지는 문자열 기준 — 칩에는 태그 이름만 들어간다.
  const labels = tags.map((tag) => tag.tag_name)
  const { shown, more } = tagFit(labels, rowW)
  const visibleCount = expanded ? tags.length : shown
  const hiddenCount = expanded ? 0 : more

  // 고른 태그가 없으면 아무것도 그리지 않는다 — 빈 상태 문구로 없는 걸 강조하지 않는 게
  // 이 화면의 규칙이다(GithubSummary와 동일).
  // 감싼 박스에 `empty:mt-0`이 걸려 있어 이때 위쪽 여백도 같이 사라진다.
  if (tags.length === 0) return null

  // 명세 5.1: 태그 i번째는 170 + i×95 ms에 등장, `+N` 칩은 그 뒤를 잇는다.
  //
  // 시안은 이 딜레이를 페이지 인트로에 묶지만(마운트 = 데이터 도착), 우리는 태그가 API로
  // 늦게 올 수 있다. 그래서 인트로 플래그가 아니라 **이 행이 처음 그려지는 순간**을 기준으로
  // 잡는다 — 데이터가 빠르면 시안과 같은 시각에, 늦으면 도착 직후에 같은 리듬으로 흐른다.
  const delayOf = (i: number) => 170 + i * 95
  const chipBase =
    'inline-flex items-center rounded-full px-3 py-[5px] text-[11px] tracking-[0.04em]'

  return (
    <ul className="flex list-none flex-wrap items-center gap-1.5 p-0">
      {tags.slice(0, visibleCount).map((tag, i) => (
        <li
          key={tag.tag_id}
          // 명세 .tag-neutral = 배경 neutral-100 / 글자 neutral-800.
          // 라이트 기준 neutral-100은 흰색이고 페이지 배경이 #f6f6f8 회색이라(우리 body도
          // 같은 값이다) "회색 위 흰 칩"이 된다. bg-surface가 그 흰색이다.
          className={`bg-surface text-ink ${chipBase}`}
          style={
            reduce
              ? undefined
              : { animation: `hw-tagin .5s cubic-bezier(.2,.85,.28,1) ${delayOf(i)}ms both` }
          }
        >
          {tag.tag_name}
        </li>
      ))}

      {hiddenCount > 0 && (
        <li className="inline-flex">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={`기술 스택 ${hiddenCount}개 더 보기`}
            // 명세 2절 `+N` 칩: 같은 메트릭 + dashed 테두리(text 26%) · 투명 배경 · 글자 55%,
            // hover에 accent 테두리 + accent-700(우리 토큰은 brand-strong).
            className={`${chipBase} border-ink/25 text-ink/55 hover:border-brand hover:text-brand-strong cursor-pointer border border-dashed bg-transparent transition-colors`}
            style={
              reduce
                ? undefined
                : {
                    animation: `hw-tagin .5s cubic-bezier(.2,.85,.28,1) ${delayOf(visibleCount)}ms both`,
                  }
            }
          >
            +{hiddenCount}
          </button>
        </li>
      )}
    </ul>
  )
}

export default memo(TechStackRow)
