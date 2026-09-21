import * as THREE from "three";

/** Batch repeated garden parts without changing their geometry or materials. */
export function prepareStaticGarden(scene: THREE.Scene, animated: Set<THREE.Object3D>, software: boolean) {
  scene.updateMatrixWorld(true);
  const batches = new Map<string, THREE.Mesh[]>();
  let before = 0;
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    let parent: THREE.Object3D | null = object;
    while (parent) { if (animated.has(parent)) return; parent = parent.parent; }
    object.userData.staticGarden = true;
    object.updateMatrix(); object.matrixAutoUpdate = false;
    if (software || Array.isArray(object.material) || object.material.transparent || !object.visible) return;
    before++;
    const key = `${object.geometry.id}:${object.material.id}:${object.castShadow}:${object.receiveShadow}`;
    const batch = batches.get(key) ?? [];
    batch.push(object); batches.set(key, batch);
  });
  let saved = 0;
  for (const meshes of batches.values()) {
    if (meshes.length < 3) continue;
    const first = meshes[0];
    const batch = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
    batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
    batch.userData.staticGarden = true;
    meshes.forEach((mesh, index) => { batch.setMatrixAt(index, mesh.matrixWorld); mesh.removeFromParent(); });
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingSphere(); scene.add(batch);
    saved += meshes.length - 1;
  }
  return { before, after: before - saved };
}

/** Keep detail and antialiasing; adjust only pixel density on busy GPUs. */
export function createAdaptiveResolution(renderer: THREE.WebGLRenderer, width: () => number, height: () => number) {
  const maximum = Math.min(window.devicePixelRatio, 1.5);
  let ratio = maximum, total = 0, samples = 0, lastChange = 0;
  return (frameMs: number, now: number) => {
    if (document.hidden || frameMs > 180) return;
    total += frameMs; samples++;
    if (samples < 75 || now - lastChange < 2500) return;
    const average = total / samples;
    const next = average > 27 ? Math.max(.85, ratio - .15) : average < 18 ? Math.min(maximum, ratio + .1) : ratio;
    total = 0; samples = 0;
    if (next === ratio) return;
    ratio = next; lastChange = now;
    renderer.setPixelRatio(ratio); renderer.setSize(width(), height());
  };
}
