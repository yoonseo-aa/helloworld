import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

/** 진입점은 main.tsx의 DEV 가드 안 — 여기서 start()를 부르지 않는다. */
export const worker = setupWorker(...handlers)
