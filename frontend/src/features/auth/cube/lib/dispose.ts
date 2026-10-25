import * as THREE from 'three';

/**
 * 정리(teardown) 헬퍼. GL 리소스를 할당하거나 리스너를 붙이는 것은 전부 여기에 등록하므로,
 * `disposer.run()` 한 번이면 남는 게 없다.
 */
export class Disposer {
  private readonly tasks: (() => void)[] = [];

  add(task: () => void): void {
    this.tasks.push(task);
  }

  /** DOM 리스너 등록과 해제를 한 번에 처리한다. */
  listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    handler: (event: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  listen<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    handler: (event: DocumentEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  listen(
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options);
    this.tasks.push(() => target.removeEventListener(type, handler, options));
  }

  /** MediaQueryList 변경 리스너를 최신·구형 API 양쪽으로 등록한다. */
  listenMedia(query: MediaQueryList, handler: (event: MediaQueryListEvent) => void): void {
    query.addEventListener('change', handler);
    this.tasks.push(() => query.removeEventListener('change', handler));
  }

  run(): void {
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      const task = this.tasks[i];
      if (task) task();
    }
    this.tasks.length = 0;
  }
}

/**
 * `root`에서 도달 가능한 모든 지오메트리·재질·텍스처를 해제한 뒤 부모에서 떼어낸다.
 * 재질은 여러 메시가 공유하므로 중복을 제거하고 나서 해제한다.
 */
export function disposeObject(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();

  root.traverse((node) => {
    const mesh = node as Partial<THREE.Mesh>;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const m of material) materials.add(m);
    } else if (material) {
      materials.add(material);
    }
  });

  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();

  root.removeFromParent();
}
