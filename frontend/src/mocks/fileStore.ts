/**
 * 목 업로드 파일 저장소 (IndexedDB) — 개발/테스트 전용.
 *
 * main.tsx의 DEV 가드 안에서 동적 import되는 mocks/ 트리에만 속하므로
 * 프로덕션 번들에는 포함되지 않는다 (CLAUDE.md 규칙 7).
 *
 * ── 왜 sessionStorage가 아니라 IndexedDB인가 ──
 * sessionStorage는 문자열만 담는다. File을 넣으려면 base64로 바꿔야 하는데
 * 몸집이 약 1.33배로 불고, 오리진당 용량이 5MB 남짓이라 요즘 사진 한두 장이면
 * QuotaExceededError가 난다. 게다가 그 5MB를 mockProfiles·mockFollowGraph가
 * 같이 쓰고 있어서, 이미지가 꽉 채우면 팔로우 목록 저장까지 함께 깨진다.
 *
 * IndexedDB는 Blob을 변환 없이 그대로 담고 용량도 훨씬 크다. 대신 Promise가 아니라
 * 이벤트(onsuccess/onerror) 기반 구식 API라, 아래처럼 Promise로 감싸서 쓴다.
 *
 * 주의: IndexedDB는 탭을 닫아도 남는다(sessionStorage와 수명이 다르다). 그래서 세션이
 * 끝나면 게시물 목록(sessionStorage)은 사라지는데 그 글이 쓰던 이미지는 여기 남는다.
 * 목 전용 저장소라 방치해도 무해해서 따로 청소하지 않는다.
 */

const DB_NAME = 'msw:mockFiles'
const DB_VERSION = 1
const STORE_NAME = 'files'

/**
 * 커넥션은 한 번만 연다. 요청마다 열면 매번 핸드셰이크 비용이 들고,
 * onupgradeneeded가 동시에 여러 번 걸릴 수 있다.
 */
let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      // DB가 처음 만들어질 때(또는 버전이 오를 때)만 불린다 — 여기서만 스토어를 만들 수 있다.
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    }).catch((error: unknown) => {
      // 실패한 프로미스를 캐시에 남기면 이후 모든 호출이 같은 거부를 그대로 돌려받아
      // 재시도 경로가 영영 사라진다. 캐시를 비워 다음 호출이 다시 열어보게 한다.
      dbPromise = null
      throw error
    })
  }
  return dbPromise
}

/** 업로드된 파일 저장. key는 목이 발급한 file_id. */
export async function putFile(fileId: string, file: File): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(file, fileId)
    // put의 onsuccess가 아니라 트랜잭션 완료를 기다린다 — 요청이 성공해도
    // 트랜잭션이 커밋되기 전에는 다른 트랜잭션에서 아직 안 보일 수 있다.
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/** 저장된 파일 조회. 없으면 undefined (핸들러가 404로 바꾼다). */
export async function getFile(fileId: string): Promise<Blob | undefined> {
  const db = await openDB()
  return new Promise<Blob | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(fileId)
    request.onsuccess = () => resolve(request.result as Blob | undefined)
    request.onerror = () => reject(request.error)
  })
}
