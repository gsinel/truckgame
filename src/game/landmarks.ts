import type { RoadGraph } from './roads';
import { Ctx, tree, bench, bin, pallet, containerStack, silo, fenceLine, parkedCar, warehouse } from './props';
import { M, extra, labelMaterial } from './textures';
import { groundHeight } from './elevation';
import { tr, upper } from './i18n';
import { board, flagPole } from './turkishProps';
import { CITY_PROFILES } from './regions';

/**
 * Landmarks — the architecture that makes each regional city read from the cab.
 *
 * Conventions:
 *  - `ground()` lifts the *y axis only*, so every coordinate below is a real
 *    world x/z. Props that register colliders or map footprints therefore stay
 *    correct, and the landmark sits on the local terrain.
 *  - Rotated sub-frames (`frame`) carry raw geometry only.
 *  - Every compound is kept inside ~130 x 100 m so it fits the flat terrain disc
 *    (280 m) of its city and stays clear of the ring streets at +-110 m.
 *
 * The buildings are *inspired by* their real counterparts, not replicas.
 */

const STONE = 0xc9bda2, STONE_D = 0xb2a68c, STONE_L = 0xdcd2bb;

function ground(c: Ctx, x: number, z: number) {
  const y = groundHeight(x, z);
  c.B.push(0, y, 0);
  c.D.push(0, y, 0);
}
function unground(c: Ctx) { c.B.pop(); c.D.pop(); }
function frame(c: Ctx, x: number, z: number, ry = 0) {
  c.B.push(x, 0, z, ry);
  c.D.push(x, 0, z, ry);
}
function unframe(c: Ctx) { c.B.pop(); c.D.pop(); }

/** Crenellations along a run of x inside the current frame. */
function crenelsX(c: Ctx, x0: number, x1: number, y: number, z: number, step = 1.9) {
  for (let x = x0; x <= x1; x += step) c.B.box(0.9, 0.8, 0.6, M.concrete, x, y, z, STONE_L);
}
function crenelsZ(c: Ctx, z0: number, z1: number, y: number, x: number, step = 1.9) {
  for (let z = z0; z <= z1; z += step) c.B.box(0.6, 0.8, 0.9, M.concrete, x, y, z, STONE_L);
}

/* ================================================================== */
/*  YOZGAT — Saat Kulesi                                              */
/* ================================================================== */
export function clockTower(c: Ctx, x: number, z: number) {
  const { B, D } = c;
  ground(c, x, z);
  B.plane(30, 30, M.pavement, x, 0.05, z, 0xd8cfb6, { tu: 7 });
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    B.plane(9, 9, M.grassPad, x + Math.cos(a) * 11.5, 0.06, z + Math.sin(a) * 11.5, 0xb9c9a4, { ry: a });
  }
  B.box(5.0, 1.0, 5.0, M.concrete, x, 0, z, STONE_D);
  for (let i = 0; i < 4; i++) {
    const w = 3.8 - i * 0.28;
    B.box(w, 3.5, w, M.brick, x, 1.0 + i * 3.5, z, STONE, { tu: 4, tv: 4 });
    B.box(w + 0.4, 0.3, w + 0.4, M.concrete, x, 1.0 + (i + 1) * 3.5 - 0.3, z, STONE_L);
    for (let s = 0; s < 4; s++) {
      const a = (s * Math.PI) / 2;
      D.box(0.7, 1.5, 0.16, M.glass, x + Math.sin(a) * (w / 2 + 0.04), 2.4 + i * 3.5, z + Math.cos(a) * (w / 2 + 0.04), 0x24405c, { ry: a });
    }
  }
  const cy = 16.2;
  for (let s = 0; s < 4; s++) {
    const a = (s * Math.PI) / 2, nx = Math.sin(a), nz = Math.cos(a);
    B.box(2.2, 2.2, 0.16, M.metal, x + nx * 1.72, cy - 1.1, z + nz * 1.72, 0x2d3238, { ry: a });
    B.box(1.7, 1.7, 0.06, M.flat, x + nx * 1.82, cy - 0.95, z + nz * 1.82, 0xf6f4e8, { ry: a });
    D.box(0.13, 0.66, 0.04, M.metal, x + nx * 1.87, cy - 0.66, z + nz * 1.87, 0x1c1f22, { ry: a });
    D.box(0.48, 0.13, 0.04, M.metal, x + nx * 1.87 + Math.cos(a) * 0.2, cy - 0.95, z + nz * 1.87 - Math.sin(a) * 0.2, 0x1c1f22, { ry: a });
  }
  B.box(2.9, 2.2, 2.9, M.brick, x, cy, z, STONE, { tu: 4, tv: 4 });
  B.cyl(0.0, 1.7, 3.4, 8, M.roofMetal, x, cy + 2.2, z, 0x6f7a72);
  B.cyl(0.05, 0.05, 1.8, 6, M.chrome, x, cy + 5.6, z, 0xc6a455);
  B.quad(M.turkishFlag, [[x, cy + 7.4, z], [x + 1.5, cy + 7.3, z + 0.2], [x + 1.5, cy + 6.4, z + 0.2], [x, cy + 6.5, z]],
    [[0, 0], [1, 0], [1, 1], [0, 1]]);
  c.B.colBox(5.0, 5.0, x, z, 0, 'tower');
  c.foot.push({ x, z, w: 7, d: 7, ry: 0, kind: 'landmark' });
  c.lamps.push({ x, y: groundHeight(x, z) + 18.4, z });
  for (let i = 0; i < 3; i++) bench(c, x - 9 + i * 9, z + 12, Math.PI);
  bin(c, x + 13, z + 12, 0);
  bin(c, x - 13, z + 12, 0);
  board(c, x, z + 16, Math.PI, upper(tr.yozgatClock), 6, 1.5, 2.6, 'tourism');
  unground(c);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI * 2) / 8 + 0.3;
    tree(c, i % 2 ? 'pine' : 'bush', x + Math.cos(a) * 23, z + Math.sin(a) * 23, 1.15, i % 2 === 1);
  }
}

/* ================================================================== */
/*  TOKAT — kale                                                      */
/* ================================================================== */
export function castle(c: Ctx, x: number, z: number, scale = 1) {
  const { B, D } = c;
  const s = scale;
  const base = groundHeight(x, z);
  for (let i = 0; i < 5; i++) {
    const r = (15 - i * 2.3) * s;
    B.cyl(r * 0.88, r, 2.9 * s, 10, M.concrete, x, base + i * 2.8 * s, z, i % 2 ? 0x8d8778 : 0x7a7466);
    c.B.colCircle(r, x, z, 'rock');
  }
  ground(c, x, z);
  const y0 = 14 * s;
  B.box(19 * s, 3.4 * s, 12 * s, M.brick, x, y0, z, STONE, { tu: 8, tv: 4 });
  for (const zs of [-1, 1]) crenelsX(c, x - 9.4 * s, x + 9.4 * s, y0 + 3.4 * s, z + zs * 6 * s, 2.0 * s);
  for (const xs of [-1, 1]) crenelsZ(c, z - 5.6 * s, z + 5.6 * s, y0 + 3.4 * s, x + xs * 9.4 * s, 2.0 * s);
  for (const [tx, tz] of [[-9.4, -5.7], [9.4, -5.7], [-9.4, 5.7], [9.4, 5.7]] as [number, number][]) {
    const ax = x + tx * s, az = z + tz * s;
    B.cyl(2.6 * s, 3.0 * s, 9.4 * s, 12, M.brick, ax, y0, az, STONE_L, { tu: 4 });
    B.cyl(0.0, 3.1 * s, 2.5 * s, 12, M.roofMetal, ax, y0 + 9.4 * s, az, 0x74564a);
    c.B.colCircle(3.1 * s, ax, az, 'tower');
  }
  B.box(8 * s, 7 * s, 8 * s, M.plaster, x, y0, z, 0xe6d9bb, { tu: 6, tv: 6 });
  B.box(8.7 * s, 0.55 * s, 8.7 * s, M.concrete, x, y0 + 7 * s, z, STONE_L);
  for (const zs of [-1, 1]) crenelsX(c, x - 3.9 * s, x + 3.9 * s, y0 + 7.5 * s, z + zs * 3.9 * s, 1.5 * s);
  D.box(1.4 * s, 2.3 * s, 0.2 * s, M.wood, x, y0, z + 4.1 * s, 0x6a452c);
  for (let i = 0; i < 3; i++) D.box(0.5 * s, 1.3 * s, 0.2 * s, M.glass, x - 2.3 * s + i * 2.3 * s, y0 + 4.4 * s, z + 4.1 * s, 0x2c4a66);
  c.B.colBox(8 * s, 8 * s, x, z, 0, 'keep');
  c.foot.push({ x, z, w: 21 * s, d: 14 * s, ry: 0, kind: 'landmark' });
  // terraced approach climbing the outcrop
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const sx = x + 16 * s + t * 9 * s, sz = z + 21 * s - t * 12 * s;
    B.box(12 * s - i * 0.7 * s, 2.0 * s, 4.4 * s, M.concrete, sx, t * 12.5 * s, sz, STONE_D, { ry: -0.75 });
  }
  unground(c);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.4;
    tree(c, i % 3 === 0 ? 'oak' : 'pine', x + Math.cos(a) * 34 * s, z + Math.sin(a) * 30 * s, 1.2, false);
  }
  tree(c, 'rock', x - 24 * s, z + 24 * s, 1.5, false);
  tree(c, 'rock', x + 27 * s, z + 19 * s, 1.2, false);
}

/* ================================================================== */
/*  SAMSUN — liman                                                    */
/* ================================================================== */
export function portTerminal(c: Ctx, x: number, z: number) {
  const { B, D } = c;
  ground(c, x, z);
  B.plane(200, 130, M.slab, x, 0.06, z + 8, 0xb6b7ae, { tu: 9 });
  const bz = z - 30, bw = 120, bd = 40;
  B.plane(bw, bd, extra.waterMat, x, -1.1, bz);
  for (const [w, d, ox, oz] of [[bw + 4, 2.6, 0, -bd / 2 - 0.9], [bw + 4, 2.6, 0, bd / 2 + 0.9], [2.6, bd + 5, -bw / 2 - 0.9, 0], [2.6, bd + 5, bw / 2 + 0.9, 0]] as [number, number, number, number][]) {
    B.box(w, 3.4, d, M.concrete, x + ox, -3.4, bz + oz, 0x9ea49c);
    B.box(w + 0.4, 0.4, d + 0.4, M.concrete, x + ox, -0.2, bz + oz, 0xc6c9c0);
    c.B.colBox(w, d, x + ox, bz + oz, 0, 'quay');
  }
  for (let i = -4; i <= 4; i++) D.cyl(0.3, 0.36, 0.75, 8, M.metal, x + i * 12, 0.15, bz + bd / 2 + 2.2, 0x3f4548);
  // gantry cranes
  for (const cx of [x - 38, x, x + 38]) {
    for (const [px, pz] of [[-7, -11], [7, -11], [-7, 8], [7, 8]] as [number, number][]) {
      B.box(1.0, 22, 1.0, M.metal, cx + px, 0, bz + pz, 0x2f6d8c);
      c.B.colBox(1.3, 1.3, cx + px, bz + pz, 0, 'crane-leg');
    }
    B.box(22, 1.5, 2.2, M.metal, cx, 22, bz - 11, 0x2f6d8c);
    B.box(2.2, 1.4, 28, M.metal, cx, 22, bz - 11, 0x2f6d8c);
    D.box(1.6, 1.6, 1.8, M.hazard, cx, 19, bz - 22, 0xffffff);
    D.cyl(0.1, 0.1, 8, 6, M.metal, cx, 15, bz - 22, 0x555b5e);
    D.box(2.4, 1.0, 2.4, M.hazard, cx, 12.4, bz - 22, 0xffffff);
    c.lamps.push({ x: cx, y: groundHeight(x, z) + 21, z: bz - 22 });
  }
  unground(c);
  // container yard, sheds and moored ships (each grounded on its own spot)
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
    const cx = x + 26 + i * 13, cz = z + 22 + j * 15;
    ground(c, cx, cz); containerStack(c, cx, cz, 0, 2, 2); unground(c);
  }
  for (let i = 0; i < 3; i++) {
    const cx = x - 30 - i * 13, cz = z + 26 + (i % 2) * 15;
    ground(c, cx, cz); containerStack(c, cx, cz, 0, 1, 2); unground(c);
  }
  ground(c, x, z);
  for (let i = 0; i < 6; i++) pallet(c, x - 12 + i * 3.2, z + 50, 0, i % 3);
  warehouse(c, x - 74, z + 30, Math.PI / 2, 34, 18, 8.5, 0x9fb0b8, 3);
  warehouse(c, x + 76, z + 34, -Math.PI / 2, 32, 17, 8, 0xa8b4ba, 2);
  unground(c);
  for (const [sx, sz, hull, band] of [[-34, -32, 0x2f4f6a, 0xc0392b], [36, -33, 0x35586f, 0x1f6f4a]] as [number, number, number, number][]) {
    ground(c, x + sx, z + sz);
    frame(c, x + sx, z + sz, 0.02);
    B.box(14, 6, 46, M.metal, 0, -1.2, 0, hull);
    B.box(15, 1.1, 47, M.metal, 0, 5.2, 0, band);
    B.box(10, 7, 11, M.metal, 0, 7.9, -12, 0xd8dce0, { tu: 4 });
    B.box(6, 4.5, 5, M.metal, 0, 14.9, -13, 0xe8e8e2);
    D.cyl(1.1, 1.3, 4.5, 10, M.metal, 0, 19.4, -13, 0xb03028);
    for (let i = 0; i < 4; i++) D.box(1.9, 2.3, 1.8, M.flat, -0.9 + (i % 2) * 1.9, 6.4, 6 - (i >> 1) * 4.2, [0xb8402a, 0x2e5fa0, 0x3b8a52, 0xd89a20][i % 4]);
    unframe(c);
    unground(c);
  }
  // lighthouse at the basin mouth
  const lx = x + 48, lz = z + 52;
  ground(c, lx, lz);
  B.cyl(2.4, 3.3, 3.0, 12, M.concrete, lx, 0, lz, 0xd8d4c6);
  for (let i = 0; i < 5; i++) {
    const r = 2.15 - i * 0.26;
    B.cyl(r, r + 0.13, 3.5, 12, M.flat, lx, 3.0 + i * 3.5, lz, i % 2 ? 0xe8e4d8 : 0xc4382c);
  }
  B.cyl(2.6, 2.6, 1.1, 12, M.metal, lx, 20.5, lz, 0x3d4246);
  B.box(2.4, 2.3, 2.4, M.glass, lx, 21.6, lz, 0xfff0c0);
  B.box(3.0, 0.75, 3.0, M.metal, lx, 23.9, lz, 0x3d4246);
  c.lamps.push({ x: lx, y: groundHeight(lx, lz) + 22.6, z: lz });
  c.B.colCircle(3.5, lx, lz, 'lighthouse');
  c.foot.push({ x: lx, z: lz, w: 8, d: 8, ry: 0, kind: 'landmark' });
  unground(c);
  ground(c, x + 88, z + 62);
  flagPole(c, x + 88, z + 62, 13);
  unground(c);
  ground(c, x, z - 66);
  board(c, x, z - 66, 0, `${upper(tr.samsun)}|${upper(tr.samsunPort)}`, 10, 2.2, 4.6, 'dir');
  unground(c);
  for (let i = 0; i < 10; i++) tree(c, 'pine', x - 92 + i * 8, z + 66, 1.1, false);
}

/* ================================================================== */
/*  SİVAS — Gar                                                       */
/* ================================================================== */
export function railStation(c: Ctx, x: number, z: number) {
  const { B, D } = c;
  ground(c, x, z);
  B.plane(130, 84, M.slab, x, 0.04, z - 2, 0xb4b0a4, { tu: 6 });
  B.box(44, 8, 14, M.brick, x, 0, z + 20, 0xe0c9a4, { tu: 8, tv: 4 });
  B.box(45, 0.6, 15, M.concrete, x, 8, z + 20, 0xd8cfb8);
  B.gable(16, 3.0, 46, M.roofTile, x, 8.6, z + 20, 0xa8563a, { ry: Math.PI / 2, tu: 2 });
  for (let i = -3; i <= 3; i++) D.box(1.7, 3.0, 0.2, M.glass, x + i * 5.6, 2.2, z + 27.1, 0x4a6a88);
  D.box(2.8, 3.4, 0.25, M.wood, x, 0.4, z + 27.15, 0x5a3a24);
  B.box(4.2, 4.2, 0.16, M.flat, x, 6.2, z + 27.12, 0xf2ecd6);
  D.box(0.18, 1.5, 0.05, M.metal, x, 4.9, z + 27.24, 0x22262a);
  D.box(1.1, 0.18, 0.05, M.metal, x + 0.45, 6.2, z + 27.24, 0x22262a);
  c.B.colBox(44, 14, x, z + 20, 0, 'station');
  board(c, x, z + 13, 0, `${upper(tr.sivas)}|${upper(tr.sivasStation)}`, 9, 2, 4.0, 'tourism');
  // platform and canopy
  B.box(104, 0.6, 11, M.concrete, x, 0, z + 4, 0xc8c4b6);
  for (let i = -2; i <= 2; i++) {
    D.cyl(0.16, 0.2, 6.2, 8, M.metal, x + i * 23, 0.6, z + 1.6, 0x5a6166);
    B.box(28, 0.3, 6, M.roofMetal, x + i * 23, 6.8, z + 4, 0x7d6f5e);
    D.box(1.5, 0.5, 0.08, M.flat, x + i * 23, 5.4, z + 2.4, 0xf0ead4);
    c.lamps.push({ x: x + i * 23, y: groundHeight(x, z) + 6.3, z: z + 4 });
  }
  // ballast, rails, sleepers
  B.box(130, 0.4, 7, M.gravel, x, 0, z - 8, 0xb0a898);
  for (const rx of [-0.78, 0.78]) {
    B.box(130, 0.24, 0.16, M.metal, x, 0.4, z - 8 + rx, 0xb9bec2);
    D.box(130, 0.1, 0.1, M.metal, x, 0.48, z - 8 + rx, 0xd0d4d8);
  }
  for (let i = -28; i <= 28; i++) D.box(0.95, 0.18, 2.4, M.wood, x + i * 2.2, 0.2, z - 8, 0x6a5236);
  unground(c);
  const car = (ox: number, kind: 'loco' | 'wagon', hull: number) => {
    ground(c, x + ox, z - 8);
    frame(c, x + ox, z - 8, 0);
    if (kind === 'loco') {
      B.box(18, 3.4, 3.0, M.metal, 0, 1.0, 0, hull);
      B.box(6, 3.6, 2.9, M.metal, 5.4, 4.2, 0, 0xe8e4d8);
      B.box(5.2, 1.4, 0.14, M.glass, 5.6, 4.8, 1.5, 0x27384a);
      B.box(5.2, 1.4, 0.14, M.glass, 5.6, 4.8, -1.5, 0x27384a);
      D.cyl(1.5, 1.5, 3.4, 10, M.flat, -3.9, 4.5, 0, 0x2a2e32);
      D.box(0.55, 1.1, 0.4, M.bulb, 9.1, 1.6, 1.8, 0xffffff);
      D.box(0.55, 1.1, 0.4, M.bulb, 9.1, 1.6, -1.8, 0xffffff);
    } else {
      B.box(20, 4.6, 3.0, M.corrugated, 0, 0.9, 0, hull, { tu: 4 });
      B.box(20.4, 0.4, 3.2, M.metal, 0, 5.5, 0, 0x3a3f43);
      for (let i = 0; i < 4; i++) D.box(0.9, 3.0, 0.1, M.flat, -7.5 + i * 5, 1.1, 1.52, 0x9a6242);
    }
    for (const [wx, wz] of [[-6.5, -1.35], [-6.5, 1.35], [0, -1.35], [0, 1.35], [6.5, -1.35], [6.5, 1.35]] as [number, number][]) {
      D.cyl(0.52, 0.52, 0.3, 10, M.metal, wx, 0.72, wz, 0x2c3034, { rx: Math.PI / 2 });
      D.cyl(0.26, 0.26, 0.34, 8, M.metal, wx, 0.72, wz, 0x4a5054, { rx: Math.PI / 2 });
    }
    unframe(c);
    unground(c);
  };
  car(26, 'loco', 0xb03028);
  [-4, -27].forEach((ox, i) => car(ox, 'wagon', [0x2e6f4f, 0x2e5f8f][i]));
  ground(c, x, z - 8);
  for (const sx of [-60, 60]) {
    D.cyl(0.18, 0.22, 7.5, 8, M.metal, x + sx, 0, z - 8, 0x3c4145);
    D.box(1.7, 0.55, 0.32, M.metal, x + sx, 7.0, z - 8, 0x2a2e32);
    D.box(0.42, 0.42, 0.08, M.ledGreen, x + sx, 7.0, z - 7.8, 0xffffff);
  }
  unground(c);
  for (let i = 0; i < 7; i++) tree(c, 'poplar', x + 72, z - 24 + i * 9, 1.1, false);
}

/* ================================================================== */
/*  ÇORUM — taş kapı                                                  */
/* ================================================================== */
export function stoneGate(c: Ctx, x: number, z: number, ry = 0) {
  const { B, D } = c;
  ground(c, x, z);
  frame(c, x, z, ry);
  B.plane(44, 28, M.gravel, 0, 0.05, 0, 0xcfc5ae, { tu: 6 });
  for (let i = -5; i <= 5; i++) {
    if (i === -1 || i === 0) continue; // passage
    const bw = 3.2 + (i % 2) * 0.5, bh = 6.4 + (i % 3) * 0.9;
    B.box(bw, bh, 7.2, M.brick, i * 3.6, 0, -3, i % 2 ? STONE : STONE_D, { tu: 3, tv: 3 });
  }
  for (const px of [-5.2, 5.2]) {
    B.box(6.2, 9.4, 8.4, M.brick, px, 0, 0, STONE_L, { tu: 4, tv: 4 });
    for (let k = 0; k < 3; k++) B.box(6.6, 0.42, 8.8, M.concrete, px, 2.4 + k * 3.0, 0, STONE_D);
    B.cyl(0.0, 3.5, 2.5, 6, M.concrete, px, 9.4, 0, STONE);
    c.B.colBox(6.2, 8.4, px, 0, 0, 'gate');
    c.foot.push({ x: px * Math.cos(ry) + x, z: -px * Math.sin(ry) + z, w: 7, d: 9, ry, kind: 'landmark' });
  }
  B.box(16.6, 1.5, 8.0, M.brick, 0, 11.4, 0, STONE_L, { tu: 4 });
  crenelsX(c, -7.9, 7.9, 12.9, 0, 2.1);
  const relief = labelMaterial(upper(tr.corumGate), 'tourism');
  for (const px of [-5.2, 5.2]) {
    const fx = px + (px < 0 ? 3.14 : -3.14);
    B.quad(relief, [[fx, 2.9, -4.1], [fx, 2.9, 4.1], [fx, 7.1, 4.1], [fx, 7.1, -4.1]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  for (let i = 0; i < 9; i++) {
    const bx = -16 + i * 4.0, bz = 12 + (i % 3) * 2.4;
    B.box(2.6, 1.25 + (i % 2) * 0.55, 2.0, M.brick, bx, 0, bz, i % 2 ? STONE : STONE_D, { tu: 2, tv: 2 });
  }
  for (let i = 0; i < 5; i++) D.cyl(0.5, 0.6, 4.4, 8, M.brick, -11.5 + i * 5.8, 0, 19.5, STONE_D);
  for (let i = 0; i < 4; i++) D.box(1.4, 2.1, 0.3, M.wood, -5.6 + i * 3.8, 3.2, -6.6, 0x6a452c);
  unframe(c);
  c.B.colBox(44, 28, x, z, ry, 'site');
  c.foot.push({ x, z, w: 46, d: 30, ry, kind: 'landmark' });
  board(c, x, z + 25, Math.PI + ry, upper(tr.corumGate), 7, 1.7, 3.0, 'tourism');
  unground(c);
  for (let i = 0; i < 7; i++) {
    const a = (i * Math.PI) / 6;
    tree(c, 'oak', x + Math.cos(a) * 30, z + Math.sin(a) * 24, 1.25, true);
  }
  tree(c, 'rock', x - 24, z + 16, 1.4, false);
  tree(c, 'rock', x + 26, z + 12, 1.1, false);
}

/* ================================================================== */
/*  MERZİFON — medrese                                                */
/* ================================================================== */
export function medrese(c: Ctx, x: number, z: number) {
  const { B, D } = c;
  ground(c, x, z);
  B.plane(40, 32, M.pavement, x, 0.05, z, 0xd6cdb4, { tu: 5 });
  B.box(26, 6.4, 20, M.plaster, x, 0, z, 0xefe0be, { tu: 6, tv: 3 });
  for (let i = -3; i <= 3; i++) {
    D.cyl(0.55, 0.65, 4.6, 10, M.brick, x + i * 3.8, 0, z + 11.6, STONE_L);
    D.cyl(0.0, 1.15, 1.3, 8, M.brick, x + i * 3.8, 4.6, z + 11.6, STONE);
  }
  B.box(29, 1.1, 2.7, M.brick, x, 5.9, z + 11.6, STONE_L, { tu: 6 });
  for (const [dx, dz, r] of [[-7.2, -2, 5.4], [7.2, -2, 5.4], [0, 2.5, 4.2]] as [number, number, number][]) {
    B.cyl(0.0, r, r * 0.9, 14, M.roofMetal, x + dx, 6.4, z + dz, 0x5f7a70);
    D.cyl(0.22, 0.3, 1.3, 8, M.chrome, x + dx, 6.4 + r * 0.9, z + dz, 0xc6a455);
  }
  for (let i = -2; i <= 2; i++) D.box(1.6, 2.8, 0.16, M.glass, x + i * 4.2, 2.0, z + 10.1, 0x3d6076);
  D.box(2.6, 3.2, 0.22, M.wood, x, 0.3, z + 10.2, 0x5c3a22);
  B.cyl(1.1, 1.4, 9.5, 10, M.brick, x + 15, 0, z - 8, STONE_D);
  c.B.colBox(26, 20, x, z, 0, 'medrese');
  c.foot.push({ x, z, w: 28, d: 22, ry: 0, kind: 'landmark' });
  board(c, x, z + 17, Math.PI, upper(tr.merzifonCastle), 6, 1.5, 2.6, 'tourism');
  c.lamps.push({ x, y: groundHeight(x, z) + 8.5, z: z + 12 });
  unground(c);
  ground(c, x + 8, z + 16);
  flagPole(c, x + 8, z + 16, 12);
  unground(c);
  for (let i = 0; i < 5; i++) tree(c, 'oak', x - 19 + i * 10, z - 17, 1.2, true);
}

/* ================================================================== */
/*  GÜMÜŞHACIKÖY — taş köprü                                          */
/* ================================================================== */
export function stoneBridge(c: Ctx, x: number, z: number, ry = 0) {
  const { B, D } = c;
  ground(c, x, z);
  frame(c, x, z, ry);
  const len = 64;
  B.box(2.0, 1.7, len, M.concrete, -8.4, -1.6, 0, 0x8f8874);
  B.box(2.0, 1.7, len, M.concrete, 8.4, -1.6, 0, 0x8f8874);
  B.plane(15, len, extra.waterMat, 0, -0.65, 0, 0xffffff, { tu: 6 });
  for (const ax of [-11.5, 0, 11.5]) {
    B.box(5.8, 6.8, 14.6, M.brick, ax, 0, 0, STONE_D, { tu: 3, tv: 3 });
    B.cyl(0.0, 3.4, 3.0, 12, M.brick, ax, 6.8, 0, STONE_L);
  }
  B.box(41, 1.2, 14.6, M.brick, 0, 6.4, 0, STONE, { tu: 5 });
  for (let i = 0; i < 4; i++) {
    B.box(5.8, 0.55, 14.6, M.brick, -17.4 + i * 4.4, 5.9 + i * 0.55, 0, STONE);
    B.box(5.8, 0.55, 14.6, M.brick, 17.4 - i * 4.4, 5.9 + i * 0.55, 0, STONE);
  }
  for (const s of [-1, 1]) {
    B.box(41, 0.9, 0.5, M.brick, 0, 7.2, s * 7.0, STONE_L);
    for (let i = -3; i <= 3; i++) D.cyl(0.3, 0.38, 1.0, 8, M.brick, i * 6.2, 7.2, s * 7.0, STONE);
  }
  c.B.colBox(41, 14.6, 0, 0, 0, 'bridge');
  for (const s of [-1, 1]) {
    D.cyl(0.42, 0.5, 3.4, 8, M.brick, 0, 0, s * 9.8, STONE_D);
    D.box(1.0, 0.12, 1.0, M.metal, 0, 3.4, s * 9.8, 0x2e3336);
    D.box(0.55, 0.35, 0.55, M.bulb, 0, 3.75, s * 9.8, 0xffffff);
  }
  unframe(c);
  c.foot.push({ x, z, w: 41, d: 15, ry, kind: 'landmark' });
  c.lamps.push({ x, y: groundHeight(x, z) + 3, z });
  unground(c);
  ground(c, x, z + 24);
  board(c, x, z + 24, Math.PI + ry, upper(tr.gumushBridge), 6, 1.4, 2.5, 'tourism');
  unground(c);
  for (let i = 0; i < 6; i++) tree(c, 'birch', x - 28 + i * 11, z + 14 + (i % 2) * 5, 1.15, true);
}

/* ================================================================== */
/*  SULUOVA — şeker fabrikası                                         */
/* ================================================================== */
export function sugarFactory(c: Ctx, x: number, z: number) {
  const { B, D } = c;
  ground(c, x, z);
  B.plane(170, 118, M.slab, x, 0.06, z, 0xb8b6a8, { tu: 8 });
  warehouse(c, x - 26, z - 10, 0, 58, 30, 11.5, 0xe0dccb, 4);
  for (let i = 0; i < 6; i++) B.gable(8.2, 2.7, 38, M.roofMetal, x - 26, 12.5, z - 22 + i * 8.2, 0xa9aeb2, { ry: Math.PI / 2 });
  for (let i = 0; i < 4; i++) silo(c, x + 46 + (i % 2) * 9, z - 26 + Math.floor(i / 2) * 9, 3.2, 20);
  for (let i = 0; i < 9; i++) B.cyl(1.5 - i * 0.06, 1.6 - i * 0.06, 4.6, 10, M.flat, x + 48, i * 4.6, z + 30, i % 3 === 2 ? 0xc0392b : 0xeceae0);
  D.cyl(1.2, 1.2, 1.0, 10, M.metal, x + 48, 42.4, z + 30, 0x9aa0a4);
  c.B.colCircle(1.85, x + 48, z + 30, 'chimney');
  c.lamps.push({ x: x + 48, y: groundHeight(x, z) + 40, z: z + 30 });
  for (const [px, py, pz] of [[-52, 8.6, -18], [-52, 11.2, -18], [18, 8.2, -18]] as [number, number, number][]) B.cyl(0.34, 0.34, 50, 8, M.metal, x + px, py, z + pz, 0xc2c6ca, { rz: Math.PI / 2 });
  for (let i = 0; i < 5; i++) D.cyl(0.22, 0.22, 5.0, 6, M.metal, x - 24 + i * 12, 11.8, z + 12, 0x9aa0a4);
  B.ico(6.5, 1, M.fieldBrown, x + 4, 0.5, z + 44, 0xc8a878, {}, 0.32);
  B.ico(4.8, 1, M.fieldBrown, x + 15, 0.4, z + 42, 0xb89868, {}, 0.3);
  unground(c);
  ground(c, x - 16, z + 40);
  fenceLine(c, x - 40, z + 34, x + 6, z + 34, 'wire');
  fenceLine(c, x - 40, z + 34, x - 40, z + 48, 'wire');
  for (let i = 0; i < 5; i++) pallet(c, x - 58 + i * 3.0, z + 24, 0, i % 3);
  parkedCar(c, x + 22, z + 36, Math.PI / 2);
  parkedCar(c, x + 26, z + 40, Math.PI / 2);
  B.box(3.2, 3.4, 12, M.corrugated, x - 70, 0, z + 4, 0x9aa8ad);
  board(c, x - 26, z - 44, 0, `${upper(tr.suluova)}|${upper(tr.suluovaSugar)}`, 9.5, 2.1, 4.5, 'shop');
  unground(c);
  for (let i = 0; i < 9; i++) tree(c, 'poplar', x - 78, z - 52 + i * 11, 1.15, true);
}

/* ================================================================== */
/*  YILDIZELİ — çimento fabrikası                                     */
/* ================================================================== */
export function cementPlant(c: Ctx, x: number, z: number) {
  const { B, D } = c;
  ground(c, x, z);
  B.plane(180, 124, M.slab, x, 0.06, z, 0xb9b7ac, { tu: 8 });
  B.cyl(2.6, 2.6, 46, 12, M.metal, x, 9.0, z - 22, 0xa8adb2, { rz: Math.PI / 2, rx: 0.06 });
  for (let i = 0; i < 6; i++) D.cyl(3.0, 3.0, 0.55, 12, M.metal, x - 19 + i * 7.6, 9.0 + i * 0.55, z - 22, 0x8a9094, { rz: Math.PI / 2 });
  B.box(9, 14, 9, M.concrete, x - 25, 0, z - 22, 0xc2beae);
  B.box(9, 18, 9, M.concrete, x + 25, 0, z - 22, 0xc2beae);
  for (let i = 0; i < 6; i++) B.box(9.2 - i * 0.32, 6.0, 9.2 - i * 0.32, M.flat, x, i * 6.0, z + 8, i % 2 ? 0xd8d4c4 : 0xb8b4a4);
  for (let i = 0; i < 10; i++) B.cyl(1.3 - i * 0.05, 1.4 - i * 0.05, 4.6, 10, M.flat, x + 20, i * 4.6, z + 8, i % 3 === 1 ? 0xd8d4c8 : 0xc4c0b4);
  c.B.colCircle(1.65, x + 20, z + 8, 'stack');
  for (let i = 0; i < 3; i++) silo(c, x - 40 + i * 10, z + 34, 4.0, 22);
  warehouse(c, x + 46, z + 24, 0, 44, 26, 12, 0xbfc3c6, 3);
  for (let i = 0; i < 4; i++) {
    D.cyl(0.55, 0.55, 0.45, 8, M.rubber, x + 46 + 6 * i - 9, 0.2, z + 37, 0x303030);
    D.cyl(0.55, 0.55, 0.45, 8, M.rubber, x + 46 + 6 * i - 9, 4.3, z + 37, 0x303030);
  }
  B.box(3.0, 2.6, 34, M.metal, x - 66, 12, z - 12, 0x8f9598, { ry: 0.42, rz: 0.16 });
  for (let i = 0; i < 3; i++) {
    const t = i / 2, qx = x - 96 + t * 14, qz = z - 40 + t * 40;
    B.box(52 - i * 10, 5.0, 30, M.concrete, qx, -i * 1.4, qz, i % 2 ? 0xa9a294 : 0xbcb5a5, { tu: 4 });
  }
  for (let i = 0; i < 3; i++) B.ico(5.8, 1, M.gravel, x - 46 + i * 20, 0.4, z + 52, 0xb0aa9a, {}, 0.35);
  c.lamps.push({ x: x + 20, y: groundHeight(x, z) + 42, z: z + 8 });
  unground(c);
  ground(c, x - 16, z + 40);
  board(c, x - 16, z + 40, 0, `${upper(tr.sivas)}|${upper(tr.sivasCement)}`, 9.5, 2.1, 4.5, 'shop');
  unground(c);
  for (let i = 0; i < 10; i++) tree(c, 'pine', x - 84 + i * 18, z + 58, 1.15, false);
}

/* ================================================================== */
/*  TOKAT — tekstil fabrikası                                         */
/* ================================================================== */
export function textileMill(c: Ctx, x: number, z: number) {
  const { B, D } = c;
  ground(c, x, z);
  B.plane(164, 104, M.slab, x, 0.06, z, 0xb6b8ae, { tu: 8 });
  warehouse(c, x - 16, z, 0, 62, 30, 10.5, 0xdfe3e2, 5);
  for (let i = 0; i < 7; i++) B.gable(7.6, 2.2, 40, M.roofMetal, x - 16, 11, z - 22 + i * 7.6, 0xa9b0b4, { ry: Math.PI / 2 });
  D.cyl(2.5, 2.9, 3.2, 12, M.metal, x + 44, 13.8, z - 26, 0xb9bec2);
  for (let i = 0; i < 4; i++) B.box(0.95, 15.5, 0.95, M.concrete, x + 44 + (i < 2 ? -3.1 : 3.1), 0, z - 26 + (i % 2 ? -3.1 : 3.1), 0xb0aca0);
  for (let i = 0; i < 4; i++) {
    const hx = x - 48 + i * 14;
    B.box(11.5, 8.6, 10, M.facPlaster, hx, 0, z + 38, i % 2 ? 0xe8ddc4 : 0xdfd6c0, { tu: 12.8, tv: 9.6 });
    B.box(12, 0.4, 10.5, M.concrete, hx, 8.6, z + 38, 0xb4b0a4);
    for (const bz of [-4.4, 0, 4.4]) D.box(1.3, 1.6, 0.14, M.glass, hx, 3.1, z + 38 + bz, 0x43607a);
  }
  for (let i = 0; i < 3; i++) D.cyl(1.6, 1.6, 0.9, 12, M.fabric, x + 30, 0.3 + i * 0.9, z + 28, 0xdfe4ee);
  c.lamps.push({ x: x - 16, y: groundHeight(x, z) + 10, z: z + 17 });
  unground(c);
  ground(c, x - 16, z + 21);
  board(c, x - 16, z + 21, 0, `${upper(tr.tokat)}|${upper(tr.tokatTextile)}`, 9.5, 2.1, 4.5, 'shop');
  for (let i = 0; i < 6; i++) pallet(c, x + 40 + (i % 3) * 1.9, z + 22 + Math.floor(i / 3) * 1.7, 0, i % 3);
  unground(c);
  for (let i = 0; i < 8; i++) tree(c, 'poplar', x - 74, z - 40 + i * 11, 1.15, true);
}

/* ================================================================== */
/*  ÇORUM — gıda fabrikası                                            */
/* ================================================================== */
export function foodPlant(c: Ctx, x: number, z: number) {
  const { B, D } = c;
  ground(c, x, z);
  B.plane(152, 104, M.pavement, x, 0.06, z, 0xc0bcae, { tu: 6 });
  B.box(56, 10.5, 30, M.plaster, x, 0, z, 0xf1eee4, { tu: 6, tv: 3 });
  B.box(57, 0.5, 31, M.concrete, x, 10.5, z, 0xd2cec2);
  for (let i = 0; i < 6; i++) {
    D.box(2.0, 1.6, 2.0, M.metal, x - 22 + i * 9, 11, z - 7, 0xc4c8cb);
    D.cyl(0.9, 1.1, 0.85, 10, M.metal, x - 22 + i * 9, 12.6, z - 7, 0x9aa0a4);
    if (i % 2 === 0) D.cyl(0.9, 1.1, 0.85, 10, M.metal, x - 22 + i * 9, 12.6, z + 7, 0x9aa0a4);
  }
  for (let i = 0; i < 3; i++) silo(c, x - 44 + i * 9, z - 24, 2.9, 16);
  for (let i = 0; i < 4; i++) {
    B.box(4.0, 3.6, 0.22, M.dockDoor, x - 20 + i * 13.5, 0, z + 15.1, 0xffffff, { tu: 3.2 });
    D.box(4.6, 0.32, 1.5, M.metal, x - 20 + i * 13.5, 4.4, z + 16, 0x6a7074);
    D.box(0.55, 0.45, 0.55, M.bulb, x - 20 + i * 13.5, 4.0, z + 15.6, 0xffffff);
    c.lamps.push({ x: x - 20 + i * 13.5, y: groundHeight(x, z) + 4.3, z: z + 15.5 });
  }
  B.box(19, 6.4, 11.5, M.facConcrete, x + 44, 0, z + 24, 0xe6e2d4, { tu: 12.8, tv: 9.6 });
  B.box(19.5, 0.4, 12, M.concrete, x + 44, 6.4, z + 24, 0xc0bcb0);
  for (let i = 0; i < 3; i++) D.box(1.6, 1.5, 0.14, M.glass, x + 39 + i * 5, 3.3, z + 29.1, 0x43607a);
  unground(c);
  for (let i = 0; i < 4; i++) {
    const cx = x + 34 + i * 7.6, cz = z - 32;
    ground(c, cx, cz); containerStack(c, cx, cz, 0, 1, 2); unground(c);
  }
  ground(c, x, z + 20);
  board(c, x, z + 20, 0, `${upper(tr.corum)}|${upper(tr.corumFood)}`, 9, 2.1, 4.4, 'shop');
  unground(c);
  for (let i = 0; i < 8; i++) tree(c, 'oak', x - 70 + i * 13, z - 46, 1.2, true);
}

/* ================================================================== */
/*  Placement                                                          */
/* ================================================================== */

/**
 * Places the identity landmark(s) of a city at a diagonal offset.
 *
 * Every city has its ring streets on the x/z axes at +-110 m and the flat
 * terrain disc inside 280 m, so the diagonals are the only room wide enough for
 * a compound: `k` keeps the inner edge clear of the ring and the outer corner
 * inside the disc.
 */
const K = 180;
const DIAG: [number, number][] = [[-K, -K], [K, K], [-K, K], [K, -K]];

/**
 * Distance from a point to the nearest sampled corridor point. Landmark
 * compounds are big (up to 130 x 100 m) and the corridors are what the player
 * actually drives, so a compound that lands on a carriageway is a real
 * collision bug, not a cosmetic one.
 */
function clearance(x: number, z: number, roads: number[][]) {
  let best = Infinity;
  for (const p of roads) {
    const d = Math.hypot(p[0] - x, p[1] - z);
    if (d < best) best = d;
  }
  return best;
}

/** Corridor centreline samples, thinned to ~20 m, used to place landmarks clear of the road. */
function roadSamples(g?: RoadGraph) {
  const out: number[][] = [];
  if (!g) return out;
  for (const e of g.edges) {
    if (!e.key || e.type === 'ring') continue;
    for (let i = 0; i < e.pts.length; i += 4) out.push([e.pts[i].x, e.pts[i].z]);
  }
  return out;
}

export function buildCityLandmark(c: Ctx, cityId: string, x: number, z: number, g?: RoadGraph) {
  const prof = CITY_PROFILES[cityId];
  const roads = roadSamples(g);
  // Diagonals ordered by how much room they leave to the road network, so the
  // landmark compound always lands on the quiet side of the city.
  const order = DIAG.map((_, i) => i);
  if (roads.length) order.sort((a, b) =>
    clearance(x + DIAG[b][0], z + DIAG[b][1], roads) - clearance(x + DIAG[a][0], z + DIAG[a][1], roads));
  const at = (i: number) => [x + DIAG[order[i]][0], z + DIAG[order[i]][1]] as [number, number];
  if (prof) {
    switch (prof.landmark) {
      case 'port': { const [px, pz] = at(0); portTerminal(c, px, pz); break; }
      case 'castle': { const [px, pz] = at(0); castle(c, px, pz); break; }
      case 'railStation': { const [px, pz] = at(0); railStation(c, px, pz); break; }
      case 'clockTower': { const [px, pz] = at(1); clockTower(c, px, pz); break; }
      case 'stoneGate': { const [px, pz] = at(1); stoneGate(c, px, pz); break; }
      case 'medrese': { const [px, pz] = at(0); medrese(c, px, pz); break; }
      case 'sugarFactory': { const [px, pz] = at(0); sugarFactory(c, px, pz); break; }
      case 'stoneBridge': { const [px, pz] = at(1); stoneBridge(c, px, pz); break; }
      default: break;
    }
  }
  // Second landmark: the province's signature industry.
  switch (cityId) {
    case 'tokat.center': { const [px, pz] = at(1); textileMill(c, px, pz); break; }
    case 'sivas.center': { const [px, pz] = at(1); cementPlant(c, px, pz); break; }
    case 'corum.center': { const [px, pz] = at(1); foodPlant(c, px, pz); break; }
    default: break;
  }
}
