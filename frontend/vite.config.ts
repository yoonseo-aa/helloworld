import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 백엔드 WebConfig의 CORS 허용 오리진(http://localhost:3000)에 맞춘다.
    // POST 등 비안전 메서드는 same-origin이어도 브라우저가 Origin 헤더를 붙이고,
    // 프록시가 그 헤더를 그대로 8080에 넘기므로 서버 쪽 허용 목록과 어긋나면 403이 난다.
    port: 3000,
    // 3000이 이미 사용 중이면 Vite가 조용히 3001로 옮겨가는데, 그러면 위 CORS가 다시 깨진다.
    // 옮겨가지 말고 실패하게 해서 원인이 바로 보이게 한다.
    strictPort: true,
    proxy: {
      // 개발 서버도 배포(nginx 리버스 프록시)와 같은 오리진으로 맞춘다.
      // 브라우저 입장에서 3000 한 곳만 보이므로 CORS·SameSite 쿠키 문제가 생기지 않고,
      // "로컬에선 되는데 배포에서 안 됨"이 원천 차단된다.
      // API 호출은 항상 상대경로('/api/...')로 한다. 절대 URL을 쓰면 이 프록시를 우회한다.
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // STOMP WebSocket 핸드셰이크.
      '/ws': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
