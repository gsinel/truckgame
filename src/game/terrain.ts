import * as THREE from 'three';
import { M, extra, rnd, rr, pick } from './textures';
import { Ctx, tree } from './props';
import { groundHeight, riverCenter } from './elevation';
import { WORLD_BOUNDS, PLATEAU_BRIDGE } from './regions';
import { registerLOD } from './batch';
import { tr } from './i18n';

/** River centre line (x as function of z) */
export const riverC = riverCenter;
export const RIVER_HALF = 11.4;
export const BRIDGES = [
  { z: 0, w: 15, deck: 20, name: tr.bridgeName },
  { z: -320, w: 7.4, deck: 10.4, name: tr.millBridge },
  { z: 350, w: 7.4, deck: 10.4, name: tr.southBridge },
  // D.200 crossing on the Yozgat–Sivas plateau run: the deck is centred on the river.
  { z: PLATEAU_BRIDGE.z, w: 7.4, deck: 10.4, name: tr.plateauBridge },
];
export const BRIDGE_HALF_LEN = 32;
export const WORLD = WORLD_BOUNDS;

export function onBridge(x: number, z: number) {
  for (const b of BRIDGES)
    if (Math.abs(z - b.z) < b.deck / 2 && Math.abs(x - riverC(b.z)) < BRIDGE_HALF_LEN) return true;
  return false;
}
export function inWater(x: number, z: number) {
  return Math.abs(x - riverC(z)) < RIVER_HALF + 0.2 && !onBridge(x, z);
}

const BED: [number, number][] = [
  [11.4, 0], [11.0, -0.9], [10.5, -2.2], [9, -3], [6, -3.2], [0, -3.2],
];
function hAt(u: number) {
  const a = Math.abs(u);
  if (a >= 11.4) return 0;
  for (let i = 0; i < BED.length - 1; i++) {
    const [x0, y0] = BED[i], [x1, y1] = BED[i + 1];
    if (a <= x0 && a >= x1) return y0 + ((y1 - y0) * (x0 - a)) / (x0 - x1);
  }
  return -3.2;
}

/**
 * Variable-resolution terrain grid.
 *
 * The Amasya valley (and everything the player reads up close) keeps the original
 * 12 m sampling; the outlying corridors only ever appear through fog, so their rows
 * and columns widen to 34 m and then 90 m. Grid vertices stay shared between bands
 * (the bands are contiguous, never overlapping), so there are no seams, and the
 * whole map costs roughly what the original 4 km square did.
 */
function band(step: number, limit: number, from: number, to: number, out: number[]) {
  for (let v = Math.max(from, -limit); v <= Math.min(to, limit); v += step) out.push(v);
}
function gridAxis(from: number, to: number): number[] {
  const out: number[] = [];
  band(12, 900, from, to, out);
  band(45, 7000, from, to, out);
  band(130, Math.max(Math.abs(from), Math.abs(to)) + 400, from, to, out);
  out.sort((a, b) => a - b);
  return [...new Set(out.map(v => Math.round(v * 100) / 100))];
}

/** Dry steppe ground: the İç Anadolu plateau and its noise-driven fringe. */
function dryAt(x: number, z: number) {
  if (z > 900) return true;
  if (z < 260) return false;
  return Math.sin(x * 0.0016) * Math.cos(z * 0.0013) + Math.sin(x * 0.0007 + z * 0.0009) > 0.55;
}

export function buildTerrain(parent: THREE.Object3D) {
  const U: number[] = [];
  for (const x of gridAxis(WORLD.x0 - 180, -34)) U.push(x);
  U.push(-32, -24, -18, -14, -11.4, -11, -10.5, -9, -6, 6, 9, 10.5, 11, 11.4, 14, 18, 24, 32);
  for (const x of gridAxis(44, WORLD.x1 + 120)) U.push(x);
  const rows = gridAxis(WORLD.z0 - 60, WORLD.z1 + 120);
  const nu = U.length, nz = rows.length;
  const pos = new Float32Array(nu * nz * 3), uv = new Float32Array(nu * nz * 2), col = new Float32Array(nu * nz * 3);
  const c = new THREE.Color();
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nu; i++) {
      const z = rows[j], x = riverC(z) + U[i], y = hAt(U[i]) + groundHeight(x, z);
      const k = j * nu + i;
      pos.set([x, y, z], k * 3);
      uv.set([x / 4, z / 4], k * 2);
      const n = Math.sin(x * 0.011) * Math.cos(z * 0.013) + Math.sin(x * 0.037 + z * 0.021) * 0.5;
      const bank = Math.abs(U[i]) < 11.5;
      if (bank) c.setRGB(0.5, 0.42, 0.34);
      else if (dryAt(x, z)) c.setRGB(1.02 + n * 0.06, 0.99 + n * 0.05, 0.94 + n * 0.05);
      else c.setRGB(0.86 + n * 0.1, 1.0 + n * 0.08, 0.82 + n * 0.1);
      col.set([c.r, c.g, c.b], k * 3);
    }
  // Shared border samples, small independently culled terrain chunks.
  for (let j0 = 0; j0 < nz - 1; j0 += 24) for (let i0 = 0; i0 < nu - 1; i0 += 24) {
    const j1 = Math.min(nz - 1, j0 + 24), i1 = Math.min(nu - 1, i0 + 24), row = i1 - i0 + 1;
    const cp: number[] = [], cu: number[] = [], cc: number[] = [], indices: number[] = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * nu + i;
      cp.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
      cu.push(uv[k * 2], uv[k * 2 + 1]); cc.push(col[k * 3], col[k * 3 + 1], col[k * 3 + 2]);
      if (j < j1 && i < i1) { const a = (j - j0) * row + i - i0; indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    geo.setIndex(indices); geo.computeVertexNormals(); geo.computeBoundingSphere();
    // Plateau corridors read as steppe, the Yeşilırmak valley stays green, and a
    // little patchwork noise keeps the transition from being a hard line.
    const km = (j0 + j1) >> 1, im = (i0 + i1) >> 1;
    const mesh = new THREE.Mesh(geo, dryAt(pos[(km * nu + im) * 3], pos[(km * nu + im) * 3 + 2]) ? M.grassDry : M.grass);
    mesh.receiveShadow = true; parent.add(mesh);
    const center = geo.boundingSphere!.center;
    registerLOD(mesh, center.x, center.z, 1900);
  }

  // water
  const wp: number[] = [], wu: number[] = [], wi: number[] = [];
  rows.forEach((z, j) => {
    const cx = riverC(z);
    const waterY = groundHeight(cx, z) - 1.35;
    wp.push(cx - 20, waterY, z, cx + 20, waterY, z);
    wu.push(-20 / 8, z / 8, 20 / 8, z / 8);
    if (j < rows.length - 1) {
      const a = j * 2;
      wi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2));
  wg.setIndex(wi);
  wg.computeVertexNormals();
  const water = new THREE.Mesh(wg, extra.waterMat);
  parent.add(water);
}

/** Bridges: deck, parapets, piers, steel arches, collision */
export function buildBridges(c: Ctx) {
  const { B, D, col } = c;
  for (const br of BRIDGES) {
    const cx = riverC(br.z), z = br.z;
    const L = BRIDGE_HALF_LEN * 2;
    const deckTop = (x: number, zz: number) => groundHeight(x, zz) + 0.10;
    // Segmented, terrain-referenced deck: every entrance vertex matches the road surface.
    const segments = 32;
    const x0 = cx - BRIDGE_HALF_LEN, dx = L / segments, z0 = z - br.deck / 2, z1 = z + br.deck / 2;
    for (let i = 0; i < segments; i++) {
      const xa = x0 + i * dx, xb = xa + dx;
      const top = [[xa, deckTop(xa, z0), z0], [xb, deckTop(xb, z0), z0],
        [xb, deckTop(xb, z1), z1], [xa, deckTop(xa, z1), z1]];
      const bottom = top.map(p => [p[0], p[1] - 1.02, p[2]]);
      const uv = [[xa / 4, z0 / 4], [xb / 4, z0 / 4], [xb / 4, z1 / 4], [xa / 4, z1 / 4]];
      B.quad(M.deck, top, uv, 0xaaa8a0);
      B.quad(M.concrete, [top[0], top[1], bottom[1], bottom[0]], [[0, 0], [1, 0], [1, 1], [0, 1]], 0xaaa8a0);
      B.quad(M.concrete, [top[2], top[3], bottom[3], bottom[2]], [[0, 0], [1, 0], [1, 1], [0, 1]], 0xaaa8a0);
      B.quad(M.concrete, bottom, uv, 0x96948c);
    }
    const topA = deckTop(x0, z), topB = deckTop(x0 + L, z);
    B.quad(M.concrete, [[x0, deckTop(x0, z0), z0], [x0, deckTop(x0, z1), z1], [x0, topA - 1.02, z1], [x0, topA - 1.02, z0]], [[0, 0], [1, 0], [1, 1], [0, 1]], 0xaaa8a0);
    B.quad(M.concrete, [[x0 + L, deckTop(x0 + L, z1), z1], [x0 + L, deckTop(x0 + L, z0), z0], [x0 + L, topB - 1.02, z0], [x0 + L, topB - 1.02, z1]], [[0, 0], [1, 0], [1, 1], [0, 1]], 0xaaa8a0);
    for (const s of [-1, 1]) {
      const zz = z + s * (br.deck / 2 - 0.25);
      for (let i = 0; i < segments; i++) {
        const xa = x0 + i * dx, xb = xa + dx, mid = (xa + xb) / 2, base = deckTop(mid, zz);
        B.box(dx + 0.012, 0.95, 0.5, M.concrete, mid, base, zz, 0xc4c4bc, { tu: 2 });
        B.box(dx + 0.012, 0.14, 0.3, M.metal, mid, base + 0.95, zz, 0x7a8086);
      }
      col.addBox(cx, zz, BRIDGE_HALF_LEN, 0.28, 0, 'bridge');
      // posts every 4 m
      for (let x = -BRIDGE_HALF_LEN + 1; x <= BRIDGE_HALF_LEN; x += 4) {
        const px = cx + x, base = deckTop(px, zz);
        D.box(0.2, 0.35, 0.34, M.concrete, px, base + 0.95, zz, 0xb4b4ac);
      }
    }
    // piers
    for (const px of br.w > 10 ? [-18, 0, 18] : [-8, 8]) {
      const x = cx + px, base = groundHeight(x, z), deckBottom = base + 0.10 - 1.02;
      const pierBottom = base - 4.4, pierHeight = Math.max(1.2, deckBottom - 0.5 - pierBottom);
      B.box(2.2, pierHeight, br.deck - 2.5, M.concrete, x, pierBottom, z, 0x9a9890, { tu: 2 });
      B.box(2.6, 0.5, br.deck - 1.5, M.concrete, x, deckBottom - 0.5, z, 0xaaa8a0);
    }
    if (br.w > 10) {
      // steel arches + hangers
      const N = 14, span = 54, h = 11;
      const bridgeBase = groundHeight(cx, z) + 0.10;
      for (const s of [-1, 1]) {
        const zz = z + s * (br.deck / 2 - 0.6);
        let prev: [number, number] | null = null;
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          const px = cx - span / 2 + span * t, py = bridgeBase + h * 4 * t * (1 - t);
          if (prev) {
            const dx = px - prev[0], dy = py - prev[1];
            const len = Math.hypot(dx, dy);
            B.box(len + 0.2, 0.55, 0.55, M.metal, (px + prev[0]) / 2, (py + prev[1]) / 2, zz, 0x2f5f9a, { rz: Math.atan2(dy, dx), c: true });
          }
          if (i > 0 && i < N) D.box(0.14, Math.max(0.08, py - bridgeBase - 0.05), 0.14, M.metal, px, bridgeBase, zz, 0x9aa4b0);
          prev = [px, py];
        }
        B.box(0.9, 1.0, 0.9, M.concrete, cx - span / 2, bridgeBase, zz, 0x9a9890);
        B.box(0.9, 1.0, 0.9, M.concrete, cx + span / 2, bridgeBase, zz, 0x9a9890);
      }
      for (let i = 2; i < N - 1; i += 3) {
        const t = i / N, px = cx - span / 2 + span * t, py = groundHeight(cx, z) + 0.10 + h * 4 * t * (1 - t);
        B.box(0.4, 0.4, br.deck - 1.2, M.metal, px, py - 0.2, z, 0x2f5f9a);
      }
    }
  }
}

export function riverDecor(c: Ctx) {
  for (let z = -580; z < 580; z += 11) {
    if (BRIDGES.some((b) => Math.abs(z - b.z) < 20)) continue;
    for (const s of [-1, 1]) {
      if (rnd() < 0.55) {
        const x = riverC(z) + s * rr(13, 20);
        tree(c, pick(['rock', 'bush', 'bush', 'birch'] as const), x, z + rr(-4, 4), rr(0.8, 1.3), false);
      }
    }
  }
}
