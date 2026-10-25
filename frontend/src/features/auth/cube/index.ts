/**
 * 큐브 — 이 오브젝트의 전부를 import 하나로.
 *
 * ```ts
 * import { createCubeStage, isWebGL2Available } from './cube';
 *
 * const stage = await createCubeStage({ canvas });
 * stage.start();
 * ```
 *
 * 이 폴더가 통째로 이식 가능한 건 의도한 것이다. 그걸 성립시키는 성질이 세 가지이고,
 * 셋 다 대가를 치르고 얻었으므로 적어 둘 만하다.
 *
 *   · **에셋이 0개다.** 돌, 먼지 스프라이트, 접지 그림자는 시작할 때 캔버스에 그려서
 *     만들고(`objects/textures.ts`), 환경광 프로브는 메모리에서 생성해 PMREM을 돌린다
 *     (`scene/environment.ts`). 호스팅할 것도, `public/`에 복사할 것도, 로딩 순서를
 *     맞출 것도 없다. 의존성은 `three` 하나뿐이다.
 *
 *   · **프레임워크가 없다.** 여기서 React를 import하는 파일은 하나도 없고, 넘겨받은
 *     캔버스 말고는 document를 건드리지 않는다. 호스트는 이펙트에서 붙이고 정리에서
 *     놓으면 된다 — 정확히 그 일을 하는 래퍼가 `README.md`에 있다.
 *
 *   · **페이지에 대한 전제가 없다.** 자기 캔버스를 스스로 측정하고, 테마는 이름으로 받고,
 *     자기가 그리지 않은 배경 위에 합성하며, 캔버스 밖 제스처는 건드리지 않게 만들 수 있다.
 *
 * 다만 이건 범용 3D 컴포넌트가 **아니다.** 구도, 3점 조명 리그, 등장 타이밍, 모든 제스처의
 * 감각은 사람이 잡은 값이고 그게 핵심이다. `LOOK`과 `CAMERA`를 export하는 건 의도적으로
 * 읽고 조정하라는 뜻이지, 테마 시스템에 넘기라는 뜻이 아니다.
 */

export { createCubeStage } from './scene/stage';
export type { CubeStage, CubeStageOptions, StageStats } from './scene/stage';

/**
 * 성능·기능 판정.
 *
 * 호스트가 반드시 불러야 하는 건 `isWebGL2Available` 하나다. 이 모듈은 WebGL2가 없는
 * 기기에서 쓸 만한 에러를 던지지 않으므로, 대체 화면 판단은 `createCubeStage`를 감싼
 * catch 안이 아니라 그 **앞**에 있어야 한다.
 */
export { isWebGL2Available, prefersReducedMotion, detectDeviceTier, tierFor } from './lib/deviceTier';
export type { DeviceTier, TierName } from './lib/deviceTier';

/** 조명. 가변이고 매 프레임 읽힌다 — `story/look.ts` 맨 위 주석 참고. */
export { LOOK } from './story/look';
export type { Look } from './story/look';

/** 구도. 스테이지의 기본값은 `CAMERA.offset`에서 가져온다. */
export { CAMERA, CAMERA_FOV } from './story/state';
export { createSubjectState, evaluateSubject } from './story/state';
export type { SubjectState } from './story/state';

/** 색 표와, 테마를 직접 다루는 호스트만 필요한 리졸버. */
export {
  CUBE_TOKENS,
  CUBE_BACKDROPS,
  CUBE_THEME_NAMES,
  resolveCubeTheme,
  applyCubeTheme,
} from './theme';
export type { CubeTokens, CubeThemeName, ResolvedTheme } from './theme';

/**
 * 스테이지 없이 오브젝트만.
 *
 * 이미 씬과 카메라와 렌더 루프를 가진 호스트가 — 피드 카드나 프로필 헤더처럼 — 페이지에
 * 렌더러를 하나 더 두는 대신 자기 것 안에 큐브를 넣고 싶을 때 쓴다. `hero.object3d`를
 * 씬에 추가하고, 기존 루프에서 `update`를 돌리고, `dispose`로 놓아주면 된다. 3점 조명
 * 리그가 오브젝트에 딸려 다니므로 스스로를 밝힌다.
 */
export { createHeroRelic } from './objects/heroRelic';
export type { HeroRelic, HeroRelicOptions } from './objects/heroRelic';
export { createTextureSet, disposeTextureSet } from './objects/textures';
export type { TextureSet } from './objects/textures';

/** 하늘 프로브 설정. 룩 개발 패널용. */
export { SKY_DEFAULTS } from './scene/environment';
export type { Environment, SkySettings } from './scene/environment';
