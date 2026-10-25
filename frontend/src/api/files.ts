import { apiClient } from './client'
import type { ApiResponse, UploadFileResponse } from './types'

/**
 * 업로드 제약 — 백엔드 FileService(ALLOWED, MAX_SIZE)와 **같은 값**이어야 한다.
 * 한쪽만 바꾸면 "고를 땐 됐는데 올리면 실패"가 된다.
 */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const

/**
 * <input type="file">의 accept 값.
 *
 * `image/*`를 쓰면 서버가 안 받는 형식(svg·bmp·heic 등)까지 고를 수 있다 — 특히 아이폰
 * 기본 촬영 포맷이 heic라, 고를 땐 멀쩡하다가 업로드에서 400으로 떨어지는 일이 잦다.
 * 확장자까지 같이 적는 이유: 일부 브라우저·OS가 heic의 MIME을 image/*로 보고해 통과시킨다.
 */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif'

/**
 * 업로드 전에 파일을 검사한다. 문제가 없으면 null, 있으면 사용자에게 보여줄 메시지.
 *
 * 서버도 같은 검사를 하지만(400 FILE_TOO_LARGE / FILE_UNSUPPORTED_TYPE) 5MB를 다 올려보낸
 * 뒤에 거절당하는 것보다, 고르는 즉시 알려주는 편이 낫다. 서버 검사는 그대로 최종 방어선이다.
 */
export function validateImageFile(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXTENSIONS.includes(extension as (typeof ALLOWED_EXTENSIONS)[number])) {
    return '이미지 파일만 올릴 수 있어요. (jpg, png, webp, gif)'
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return '이미지 크기는 5MB를 넘을 수 없어요.'
  }
  return null
}

/**
 * 파일 1개 업로드 → 접근 URL 반환.
 *
 * 실제 백엔드(feature/be-file-upload, FileController/FileUploadResponse)로 확인 완료한
 * 진짜 계약 — multipart/form-data의 파트 이름은 `file`, 응답 data는 `{ file_url }`.
 * 반환 URL은 MinIO 공개 주소(로컬 http://localhost:9000/helloworld/..., 배포는 nginx의
 * /files 경로)라 <img src>에 그대로 넣으면 된다.
 *
 * Content-Type은 지정하지 않는다 — FormData를 주면 브라우저가 boundary까지 포함해
 * 자동으로 붙인다. 손으로 'multipart/form-data'만 적으면 boundary가 빠져 서버가 파싱에 실패한다.
 *
 * feed(게시물)·profile(프로필 이미지) 둘 이상이 쓰게 되어 api/(공유 인프라)로 승격했다.
 * "게시/저장 확정 시점에만" 호출하는 패턴을 호출하는 쪽에서 지킨다 (Orphan File 방지).
 */
export async function uploadFile(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await apiClient.post<ApiResponse<UploadFileResponse>>(
    '/api/files',
    formData,
  )
  return data.data.file_url
}
