/**
 * URL 경로의 숫자 파라미터를 안전하게 읽는다 (`/chat/:roomId`, `/users/:userId`, ...).
 *
 * `Number(param)`을 그냥 쓰면 잘못된 주소가 조용히 안쪽까지 흘러간다:
 *   Number('abc')       → NaN
 *   Number('Infinity')  → Infinity
 *   Number('')          → 0
 *   Number('3.5')       → 3.5
 * 이 값들이 쿼리 키·요청 경로에 그대로 박히면 `/api/chat/rooms/NaN` 같은 요청이 나가거나,
 * `enabled: Number.isFinite(id)` 같은 절반짜리 가드에 걸려 로딩이 끝나지 않는 화면이 된다.
 * 술어를 호출부마다 손으로 적다 보니 파일마다 기준이 달라진 것이 원인이었다.
 *
 * 유효하지 않으면 NaN을 돌려준다 — 화면은 이미 "id가 없으면 못 그린다"를 다루고 있고,
 * 쿼리 훅들도 `Number.isFinite` 가드로 요청을 막는다.
 */
export function toRouteId(param: string | undefined): number {
  if (param === undefined) return Number.NaN
  const parsed = Number(param)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN
}
