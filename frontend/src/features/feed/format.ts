/**
 * 목록 미리보기용 발췌 — Markdown 문법 기호를 걷어낸 평문.
 * 피드 카드(PostCard)와 검색 결과(features/search)가 같이 쓴다.
 * 컴포넌트가 아니라 components/ 승격 대상은 아니고, 공용 유틸 폴더는 폴더 구조에 없어
 * 원 소속(feed)에 둔 채 search가 import한다 — 세 번째 사용처가 생기면 팀과 위치를 합의한다.
 */
export function toExcerpt(markdown: string): string {
  if (!markdown) return ''
  return (
    markdown
      .replace(/```[\s\S]*?```/g, ' ') // 코드 블록
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 이미지
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 링크 → 텍스트만
      .replace(/^#{1,6}\s+/gm, '') // 헤딩
      /*
       * 강조 기호는 **쌍으로 감싼 것만** 벗긴다.
       *
       * 예전엔 `[*_`>~]`를 통째로 지웠는데, 문자 클래스가 너무 넓어 본문 어디에 있든
       * 모든 밑줄·꺾쇠를 삭제했다. 개발자 SNS라 본문에 식별자가 그대로 등장하는 일이
       * 잦아서 `user_id` → `userid`, `List<String>` → `List<String`처럼 뜻이 달라진
       * 발췌가 카드에 그대로 노출됐다.
       *
       * 순서가 중요하다: 인라인 코드를 먼저 벗겨 내용을 남긴 뒤(백틱만 제거),
       * 쌍으로 된 강조를 벗기고, 줄머리 인용(`>`)만 지운다.
       */
      .replace(/`([^`]*)`/g, '$1') // 인라인 코드 — 백틱만 벗기고 내용은 남긴다
      .replace(/\*\*(?!\s)(.+?)(?<!\s)\*\*/g, '$1') // 굵게 **
      .replace(/(?<!\w)__(?!\s)(.+?)(?<!\s)__(?!\w)/g, '$1') // 굵게 __
      .replace(/\*(?!\s)(.+?)(?<!\s)\*/g, '$1') // 기울임 *
      .replace(/(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)/g, '$1') // 기울임 _
      .replace(/~~(.+?)~~/g, '$1') // 취소선
      .replace(/^\s*>+\s?/gm, '') // 줄머리 인용 — 본문 중간의 `>`는 건드리지 않는다
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * 본문 첫 헤딩을 제목으로 분리 — 시안 피드 카드(제목 + 요약) 매핑용.
 * 서버에 title 컬럼이 없어 마크다운 첫 헤딩을 제목으로 쓴다. 헤딩이 없으면 title은 null이고
 * 카드는 요약문만 그린다. body는 헤딩을 뺀 나머지 원문(발췌는 toExcerpt로 이어서).
 */
export function splitContent(markdown: string): { title: string | null; body: string } {
  /*
   * 헤딩은 **코드펜스 밖에서만** 인정한다. 원문에 정규식을 바로 돌리면 ```bash 블록 안의
   * `# 프로젝트 실행` 같은 셸 주석이 첫 헤딩으로 잡혀 카드 제목이 되어 버린다.
   * 실행 방법을 코드블록으로 먼저 적는 글이 흔해 실제로 자주 걸렸다.
   *
   * 본문에서 제목 줄을 뺄 때도 문자열 치환이 아니라 **찾은 위치**를 잘라낸다. 문자열
   * 치환은 문서에서 처음 나오는 같은 문자열을 지우므로 엉뚱한 줄이 사라질 수 있다.
   */
  const lines = markdown.split('\n')
  let inFence = false
  let offset = 0
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    else if (!inFence) {
      const match = line.match(/^#{1,6}\s+(.+)$/)
      if (match) {
        const body = markdown.slice(0, offset) + markdown.slice(offset + line.length)
        return { title: toExcerpt(match[1]), body }
      }
    }
    offset += line.length + 1 // +1은 split으로 사라진 개행
  }
  return { title: null, body: markdown }
}

/**
 * 작성자 표시명 — 닉네임 미설정 유저(가입 직후) 폴백.
 * 서버 non_null 직렬화라 nickname이 null이면 키 자체가 생략된다 (types.ts PostAuthor).
 */
export function displayNickname(author: { nickname?: string | null }): string {
  return author.nickname ?? '이름 미설정'
}

/** "방금 전 / n분 전 / n시간 전 / n일 전 / 날짜" — 피드 카드·댓글 공용. */
export function formatRelativeTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일 전`
  return new Date(iso).toLocaleDateString('ko-KR')
}
