import { Outlet, useMatch } from 'react-router-dom'
import ChatRoomList from '@/features/chat/components/ChatRoomList'
import { useToastStore } from '@/stores/useToastStore'

/**
 * 채팅 화면 레이아웃 — 시안 Chat.dc.html의 2패널 그리드.
 * 데스크톱: 목록 268px(1280 이상 320px) + 대화(Outlet), 전체 max 1320px 중앙.
 * 모바일: 목록 ↔ 방 라우트 전환 (한 번에 한 패널만 — 시안과 동일).
 * 높이는 시안 공식 그대로 — 100svh에서 스티키 헤더(60/66px)와 모바일 탭바(56px)를 뺀다.
 */
export default function ChatListPage() {
  const isInRoom = useMatch('/chat/:roomId') !== null
  // 토스트는 전역 1개(ToastContainer)라 라우트가 바뀌어도 살아남는다 — 모달이 닫히고
  // 방으로 이동한 뒤에도 보여야 해서 예전엔 이 레이아웃이 직접 들고 있었다.
  const showToast = useToastStore((state) => state.show)

  return (
    <div className="border-line bg-surface-muted mx-auto flex h-[calc(100svh-116px)] max-w-[1320px] md:h-[calc(100svh-66px)] min-[1500px]:border-r">
      <aside
        className={[
          'border-line bg-surface-muted w-full min-w-0 shrink-0 md:w-[268px] md:border-r xl:w-[320px]',
          isInRoom ? 'hidden md:block' : '',
        ].join(' ')}
      >
        <ChatRoomList onToast={(message) => showToast('success', message)} />
      </aside>
      <main
        className={[
          'bg-surface-muted min-w-0 flex-1',
          isInRoom ? '' : 'hidden md:block',
        ].join(' ')}
      >
        <Outlet />
      </main>
    </div>
  )
}
