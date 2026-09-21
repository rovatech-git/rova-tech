import * as THREE from "three";
import { Tree, TreePreset } from "@dgreenheck/ez-tree";

/** Branches and alpha-cut leaf clusters, with no solid canopy primitives. */
export function createTree(seed: number, height: number, kind: "oak" | "ash" | "bush", software: boolean) {
  const tree = new Tree();
  const preset = TreePreset[kind === "oak" ? "Oak Medium" : kind === "ash" ? "Ash Small" : "Bush 1"];
  tree.options.copy(preset as typeof tree.options);
  const options = tree.options;
  options.seed = seed;
  options.bark.tint = 0xf2eee1;
  options.bark.flatShading = false;
  options.branch.segments = software ? { 0: 10, 1: 7, 2: 4, 3: 3 } : { 0: 14, 1: 10, 2: 6, 3: 4 };
  options.branch.sections = software ? { 0: 10, 1: 5, 2: 3, 3: 2 } : { 0: 12, 1: 7, 2: 4, 3: 3 };
  options.leaves.tint = kind === "ash" ? 0xdbe5ba : 0xd9e5c4;
  options.leaves.alphaTest = .46;
  options.leaves.count = kind === "bush" ? 9 : kind === "oak" ? 18 : 23;
  if (kind === "bush") {
    options.branch.children = { 0: 5, 1: 3, 2: 2 };
    options.branch.sections = { 0: 3, 1: 4, 2: 3, 3: 2 };
  }
  tree.generate();
  const size = new THREE.Box3().setFromObject(tree).getSize(new THREE.Vector3());
  tree.scale.setScalar(height / size.y);

  // Keep the library's detailed bark maps, with physically based shading.
  const original = tree.branchesMesh.material as THREE.MeshPhongMaterial & { roughnessMap?: THREE.Texture };
  tree.branchesMesh.material = new THREE.MeshStandardMaterial({
    color: original.color, map: original.map, normalMap: original.normalMap,
    normalScale: new THREE.Vector2(.8, .8), roughnessMap: original.roughnessMap,
    roughness: .97, aoMap: original.aoMap, aoMapIntensity: .75,
  });
  original.dispose();
  const leafMaterial = tree.leavesMesh.material as THREE.MeshPhongMaterial;
  leafMaterial.shininess = 5;
  leafMaterial.specular.set("#18251a");
  leafMaterial.alphaToCoverage = !software;
  // A little baked canopy occlusion also works without a graphics card.
  const geometry = tree.leavesMesh.geometry;
  geometry.userData.doubleLeaves = true;
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = bounds.getSize(new THREE.Vector3()).length() * .32;
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const distance = Math.hypot(positions.getX(i) - center.x, positions.getY(i) - center.y, positions.getZ(i) - center.z);
    const shade = .67 + .33 * Math.min(1, distance / radius);
    colors.set([shade, shade, shade * .97], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  leafMaterial.vertexColors = true;
  return tree;
}

/** Curved, tapered blades merged into one mesh; paths stay clear for play. */
export function createMeadow(software: boolean) {
  let seed = 1941;
  const random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
  const vertices: number[] = [], colors: number[] = [], indices: number[] = [];
  const bladeCount = software ? 9500 : 23000;
  const base = new THREE.Color();
  for (let i = 0; i < bladeCount; i++) {
    const x = (random() - .5) * 40, z = (random() - .5) * 40;
    const r = Math.hypot(x, z), angle = Math.atan2(z, x);
    if (r > 20 || Math.abs(r - (10.4 + Math.sin(angle * 3) * .5)) < .55 || (x - 5) ** 2 / 12 + (z + 1.3) ** 2 / 8 < 1.12) continue;
    if (Math.abs(x + 2) < .8 && z > -7 && z < 10) continue;
    const a = random() * Math.PI * 2, w = .028 + random() * .025;
    const h = (r > 12 ? .21 : .09) + random() * (r > 12 ? .33 : .17);
    const bend = .09 + random() * .14, dx = Math.cos(a), dz = Math.sin(a), n = vertices.length / 3;
    vertices.push(x-dx*w,.034,z-dz*w,x+dx*w,.034,z+dz*w,
      x-dx*w*.5+dz*bend*.3,h*.6,z-dz*w*.5-dx*bend*.3,
      x+dx*w*.5+dz*bend*.3,h*.6,z+dz*w*.5-dx*bend*.3,
      x+dz*bend,h,z-dx*bend);
    indices.push(n,n+1,n+2,n+1,n+3,n+2,n+2,n+3,n+4);
    base.setHSL(.21 + random() * .055, .26 + random() * .2, .23 + random() * .1);
    for (let j = 0; j < 5; j++) {
      const light = j < 2 ? .68 : j === 4 ? 1.38 : 1;
      colors.push(base.r * light, base.g * light, base.b * light);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }));
  mesh.receiveShadow = true;
  return mesh;
}

/** Soft irregular leaf shadows support the software rendering path as well. */
export function canopyShadowTexture() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  let seed = 92;
  const random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 280; i++) {
    const a = random() * Math.PI * 2, distance = Math.sqrt(random()) * 104;
    const x = 128 + Math.cos(a) * distance, y = 128 + Math.sin(a) * distance;
    const radius = 7 + random() * 14;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, "rgba(21,34,16,.13)"); gradient.addColorStop(1, "rgba(21,34,16,0)");
    ctx.fillStyle = gradient; ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
