export interface ApiResponse<T> {
  status: 'SUCCESS'
  message: string
  data: T
}

export interface ApiErrorResponse {
  /** ERROR는 비즈니스 예외, FAIL은 @Valid 파라미터 검증 실패(400) — 서버 GlobalExceptionHandler가 나눠 내려준다. */
  status: 'ERROR' | 'FAIL'
  code: string
  message: string
}

/** POST /api/files 의 data. feed(게시물 이미지)·profile(프로필 이미지) 둘 다 쓰는 공용 계약. */
export interface UploadFileResponse {
  file_url: string
}
