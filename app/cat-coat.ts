import * as THREE from "three";

/** Rounded coat volumes with one shared, inexpensive mesh of groomed fibers. */
function addCoatFibers(surface: THREE.Mesh, count: number, length: number, seed: number) {
  const geometry = surface.geometry, positions = geometry.attributes.position;
  const normals = geometry.attributes.normal, index = geometry.index!;
  const areas: number[] = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  let total = 0;
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(positions, index.getX(i));
    b.fromBufferAttribute(positions, index.getX(i + 1));
    c.fromBufferAttribute(positions, index.getX(i + 2));
    total += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() * .5;
    areas.push(total);
  }
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const points: number[] = [], shades: number[] = [], directions: number[] = [], triangles: number[] = [];
  const root = new THREE.Vector3(), normal = new THREE.Vector3(), temp = new THREE.Vector3();
  const widthAxis = new THREE.Vector3(), tip = new THREE.Vector3(), midpoint = new THREE.Vector3();
  for (let strand = 0; strand < count; strand++) {
    const area = random() * total;
    let low = 0, high = areas.length - 1;
    while (low < high) { const mid = (low + high) >>> 1; if (areas[mid] < area) low = mid + 1; else high = mid; }
    const ia = index.getX(low * 3), ib = index.getX(low * 3 + 1), ic = index.getX(low * 3 + 2);
    const sample = Math.sqrt(random()), u = 1 - sample, v = sample * random(), w = 1 - u - v;
    root.fromBufferAttribute(positions, ia).multiplyScalar(u)
      .addScaledVector(temp.fromBufferAttribute(positions, ib), v)
      .addScaledVector(temp.fromBufferAttribute(positions, ic), w);
    normal.fromBufferAttribute(normals, ia).multiplyScalar(u)
      .addScaledVector(temp.fromBufferAttribute(normals, ib), v)
      .addScaledVector(temp.fromBufferAttribute(normals, ic), w).normalize();
    const angle = random() * Math.PI * 2;
    widthAxis.set(Math.cos(angle), .3, Math.sin(angle)).cross(normal).normalize();
    const size = length * (.45 + random() * .55), width = .0035 + random() * .0045;
    midpoint.copy(root).addScaledVector(normal, size * .55);
    tip.copy(root).addScaledVector(normal, size); tip.y -= size * .24;
    const shade = .91 + random() * .09, start = points.length / 3;
    for (const [point, spread] of [[root, -width], [root, width], [midpoint, -width * .5], [midpoint, width * .5], [tip, 0]] as const) {
      points.push(point.x + widthAxis.x * spread, point.y + widthAxis.y * spread, point.z + widthAxis.z * spread);
      directions.push(normal.x, normal.y, normal.z); shades.push(shade, shade * .993, shade * .968);
    }
    triangles.push(start, start + 1, start + 2, start + 1, start + 3, start + 2, start + 2, start + 3, start + 4);
  }
  const fibers = new THREE.BufferGeometry();
  fibers.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  fibers.setAttribute("normal", new THREE.Float32BufferAttribute(directions, 3));
  fibers.setAttribute("color", new THREE.Float32BufferAttribute(shades, 3));
  fibers.setIndex(triangles); fibers.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({color: "#fffefb", vertexColors: true, roughness: 1, side: THREE.DoubleSide});
  const coat = new THREE.Mesh(fibers, material);
  surface.add(coat);
}

export function createNeckRuff(material: THREE.Material, software: boolean) {
  // Keep this sculpted shape out of the renderer's generic sphere simplifier.
  const shell = new THREE.SphereGeometry(1, software ? 32 : 44, software ? 22 : 30);
  const geometry = new THREE.BufferGeometry().copy(shell); shell.dispose();
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const ripple = 1 + .025 * Math.cos(Math.atan2(z, x) * 9 + y * 3) * (1 - y * y);
    positions.setXYZ(i, x * .63 * ripple, y * .44 - Math.max(0, z) * .11, z * .55 * ripple);
  }
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const ruff = new THREE.Mesh(geometry, material); ruff.position.set(0, 1.32, .43);
  addCoatFibers(ruff, software ? 480 : 900, .115, 811);
  return ruff;
}

export function createPlumeTail(material: THREE.Material, software: boolean) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(.07, .31, -.3),
    new THREE.Vector3(.17, .83, -.46), new THREE.Vector3(.43, 1.28, -.37),
    new THREE.Vector3(.76, 1.4, -.15), new THREE.Vector3(.94, 1.24, .02),
  ]);
  const segments = software ? 36 : 48, sides = software ? 16 : 24;
  const geometry = new THREE.TubeGeometry(curve, segments, 1, sides, false);
  const positions = geometry.attributes.position, center = new THREE.Vector3(), point = new THREE.Vector3();
  for (let ring = 0; ring <= segments; ring++) {
    const t = ring / segments;
    const radius = .025 + .115 * (1 - t) + .245 * Math.pow(Math.sin(Math.PI * t), .8);
    curve.getPointAt(t, center);
    for (let side = 0; side <= sides; side++) {
      const i = ring * (sides + 1) + side;
      point.fromBufferAttribute(positions, i).sub(center).multiplyScalar(radius).add(center);
      positions.setXYZ(i, point.x, point.y, point.z);
    }
  }
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const tail = new THREE.Mesh(geometry, material);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.026, 12, 8), material); cap.position.copy(curve.getPointAt(1)); tail.add(cap);
  addCoatFibers(tail, software ? 650 : 1100, .09, 1447);
  return tail;
}
