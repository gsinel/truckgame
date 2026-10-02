import * as THREE from 'three';
import type { Ctx } from './props';
import { house } from './props';
import { M, labelMaterial } from './textures';
import { groundHeight } from './elevation';
import { registerLOD } from './batch';

export function board(c: Ctx, x: number, z: number, ry: number, text: string, w = 5, h = 1.7, y = 3, kind = 'dir') {
  c.B.push(x, 0, z, ry);
  c.B.box(w + 0.12, h + 0.12, 0.12, M.metal, 0, y - 0.06, -0.04, 0x8b9194);
  c.B.quad(labelMaterial(text, kind), [[-w / 2, y, 0.03], [w / 2, y, 0.03], [w / 2, y + h, 0.03], [-w / 2, y + h, 0.03]],
    [[0, 0], [1, 0], [1, 1], [0, 1]]);
  if (y <= 4) for (const s of [-1, 1]) {
    c.B.cyl(0.06, 0.06, y + 0.35, 6, M.metal, s * w * 0.3, 0, -0.04, 0x969c9e);
    c.B.colCircle(0.12, s * w * 0.3, -0.04, 'sign');
  }
  c.B.pop();
}

export function flagPole(c: Ctx, x: number, z: number, height = 12) {
  c.B.cyl(0.045, 0.1, height, 8, M.chrome, x, 0, z, 0xe0e0dd);
  c.B.quad(M.turkishFlag, [[x, height - 2.4, z], [x + 3.1, height - 2.2, z + 0.35],
    [x + 3.1, height - 0.2, z + 0.35], [x, height, z]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  c.col.addCircle(x, z, 0.16, 'pole');
}

export function yaliHouse(c: Ctx, x: number, z: number, ry: number) {
  house(c, x, z, ry, 10, 8, 2, 0xfff3da, 0xbd6a45);
  c.B.push(x, 0, z, ry);
  for (const s of [-1, 1]) {
    c.B.box(0.16, 6.4, 8.1, M.wood, s * 4.96, 0, 0, 0x785034);
    c.B.box(10.1, 0.22, 0.16, M.wood, 0, 3.2, s * 4.04, 0x785034);
    c.B.box(10.1, 0.18, 0.16, M.wood, 0, 6.2, s * 4.04, 0x785034);
  }
  for (const px of [-3.3, 0, 3.3]) c.B.box(0.12, 6.2, 0.13, M.wood, px, 0, 4.08, 0x735036);
  c.B.box(5.3, 2.7, 0.8, M.facPlaster, 0, 3.4, 4.3, 0xf6ead0, { tu: 12.8, tv: 9.6 });
  c.B.box(5.5, 0.15, 1.0, M.wood, 0, 3.3, 4.35, 0x805537);
  c.B.pop();
}

export function mosque(c: Ctx, x: number, z: number, ry = 0) {
  c.B.push(x, 0, z, ry); c.D.push(x, 0, z, ry);
  c.B.box(14, 7.8, 17, M.plaster, 0, 0, 0, 0xe8d7b6);
  const dome = new THREE.SphereGeometry(6.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  c.B.addGeo(dome.toNonIndexed(), M.roofMetal, 0, 7.8, 0, 0x6e8278);
  c.B.cyl(0.7, 1, 24, 12, M.plaster, 9.3, 0, -4.5, 0xe8d7b6);
  c.B.cyl(1.25, 1.25, 0.22, 16, M.concrete, 9.3, 16.5, -4.5, 0xddd0b4);
  c.B.cyl(0, 0.75, 4.5, 16, M.roofMetal, 9.3, 24, -4.5, 0x687d75);
  c.B.cyl(0.025, 0.025, 1.0, 6, M.chrome, 0, 14, 0, 0xc6a455);
  c.B.torus(0.3, 0.04, M.chrome, 0, 15, 0, 0xc6a455);
  for (const px of [-5, -2.5, 2.5, 5]) {
    c.B.box(1.0, 2.5, 0.05, M.glass, px, 2, 8.54, 0x769ea6);
    c.B.box(1.2, 0.12, 0.16, M.concrete, px, 1.9, 8.55, 0xccba95);
  }
  c.B.box(2.0, 3.5, 0.10, M.wood, 0, 0.12, 8.54, 0x6a452c);
  c.B.colBox(14, 17, 0, 0, 0, 'building'); c.B.colCircle(1.3, 9.3, -4.5, 'building');
  const p = c.B.worldPos(0, 0, 0);
  c.foot.push({ x: p.x, z: p.z, w: 22, d: 17, ry: c.B.worldRy(), kind: 'mosque' });
  c.B.pop(); c.D.pop();
}

/** Textured ridges outside the road corridors, with a detailed irregular silhouette. */
export function ridge(parent: THREE.Object3D, c: Ctx, x: number, z: number, radius: number, height: number) {
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  const rings = 16, segments = 80;
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2, r = j / rings;
    const jitter = 1 + 0.11 * Math.sin(a * 7) + 0.04 * Math.cos(a * 13);
    const px = x + Math.cos(a) * r * radius * jitter, pz = z + Math.sin(a) * r * radius * 0.7 * jitter;
    const py = groundHeight(px, pz) + height * Math.pow(Math.max(0, 1 - r), 1.15) * (0.88 + 0.1 * Math.cos(a * 9 + r * 15));
    positions.push(px, py, pz); uvs.push(px / 9, pz / 9);
    const rock = r < 0.65; colors.push(rock ? 0.64 : 0.36, rock ? 0.58 : 0.45, rock ? 0.47 : 0.26);
    if (j < rings && i < segments) { const k = j * (segments + 1) + i; indices.push(k, k + 1, k + segments + 1, k + 1, k + segments + 2, k + segments + 1); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, M.concrete);
  mesh.receiveShadow = true; mesh.castShadow = true; parent.add(mesh); registerLOD(mesh, x, z, 2100);
  c.col.addCircle(x, z, radius * 0.55, 'rock');
}