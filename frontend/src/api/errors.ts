import axios from 'axios'
import type { ApiErrorResponse } from './types'

/**
 * 서버가 내려준 에러 메시지를 꺼낸다. 못 꺼내면 fallback을 쓴다.
 *
 * 서버는 실패를 `{ status: "ERROR" | "FAIL", code, message }`로 주지만(ERROR는 비즈니스
 * 예외, FAIL은 @Valid 검증 실패 — 백엔드 GlobalExceptionHandler 참고), 네트워크가 끊기거나
 * 프록시가 502를 내면 응답 자체가 없다. 그 경우까지 여기서 흡수해서 화면 코드가
 * axios를 몰라도 되게 한다.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    return error.response?.data?.message ?? fallback
  }
  return fallback
}
