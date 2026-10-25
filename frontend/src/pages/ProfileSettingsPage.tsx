import ProfileSettingsForm from '@/features/profile/components/ProfileSettingsForm'

/**
 * 프로필 편집(생성·수정 겸용). 최초 로그인(회원가입 후 로그인, 소셜 신규가입) 온보딩과
 * ProfilePage의 "프로필 편집" 둘 다 이 화면을 쓴다. 저장하면 어느 쪽이든 내 프로필로 간다.
 *
 * 사이드바(AppLayout) 안에서 뜬다 — 온보딩 중에도 다른 화면으로 빠져나갈 길이 있어야 해서다.
 *
 * 레이아웃은 시안(handoff ProfileEditPage)을 따른다: 폭 720px, 상단에 "프로필로"
 * 돌아가기 링크, 제목 + 설명, 그 아래 카드형 섹션들, 하단 고정 저장 바.
 * 그 머리말·저장 바는 모두 ProfileSettingsForm이 그린다 — 시안이 제목 옆에 붙이는
 * "저장하지 않은 변경" 표시가 폼 상태여서, 페이지로 올리면 콜백으로 새어 나가야 한다.
 *
 * 시안의 6개 섹션 중 4개만 구현했다 — "공개 설정" 토글과 "계정 삭제"는 백엔드에
 * 대응하는 필드·엔드포인트가 없다(users에 visibility 컬럼 없음, DELETE /api/users/me 없음).
 * 눌러도 아무 일이 없는 UI를 두지 않으려고 뺐다.
 */
export default function ProfileSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-[22px] pb-32 md:px-6 md:py-[30px] md:pb-36">
      <ProfileSettingsForm />
    </div>
  )
}
