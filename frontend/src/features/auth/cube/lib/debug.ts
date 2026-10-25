/**
 * 진단용 훅이 살아 있는지 여부.
 *
 * `import.meta.env.DEV`가 아니라 평범한 가변 플래그다. 큐브가 Vite 프로젝트 하나 안에서만
 * 돌던 시절에는 그쪽이었다. `import.meta.env`는 언어 기능이 아니라 **번들러가 주입하는
 * 값**이라, Webpack·Rollup·esbuild 위에 올린 호스트에서는 구문 오류가 나거나 런타임에
 * undefined가 된다. 어느 쪽이든 이 폴더는 "복사해서 쓸 수 있는 것"이 아니게 되는데,
 * 그게 이 폴더가 존재하는 유일한 이유다.
 *
 * 대가는 프로덕션 빌드가 이 분기를 정적 분석으로 제거하지 못한다는 것 — 값이 런타임에만
 * 정해지기 때문이다. 여기서는 거의 손해가 없다. 분기가 감싸는 게 `window`에 대한
 * `Reflect.set` 네 번뿐이고, 대안은 모든 사용처가 같은 빌드타임 상수를 정의하는 것이다.
 *
 * `createCubeStage({ debug: true })`가 설정한다.
 */
export const debug = { enabled: false };
