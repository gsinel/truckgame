import * as THREE from 'three';
import { Batcher, Colliders, Instancer } from './batch';
import { M, rnd, rr, pick, labelMaterial } from './textures';
import { carInto, CAR_COLORS, tractorInto, CarStyle } from './vehicles';
import { groundHeight } from './elevation';
import { tr } from './i18n';

export interface Foot { x: number; z: number; w: number; d: number; ry: number; kind: string }
export interface Ctx {
  B: Batcher; D: Batcher; GL: Batcher; I: Instancer; col: Colliders;
  lamps: { x: number; y: number; z: number }[]; cables: number[]; foot: Foot[];
}

export const PLASTER = [0xf2e6cc, 0xe6c8a2, 0xd6e2c8, 0xecd0d0, 0xd8e2f2, 0xf4eeda, 0xcdbcab, 0xb0bfcf, 0xf6dcac, 0xe9d3a8];
export const ROOFS = [0xc0603f, 0xa04a34, 0x6e7280, 0x80604c, 0xb8704a];
const GREENS = [0x5aa040, 0x4c9038, 0x68ac48, 0x3f8a3e, 0x74b04c];

function P(c: Ctx, x: number, z: number, ry = 0) {
  c.B.push(x, 0, z, ry);
  c.D.push(x, 0, z, ry);
}
function Q(c: Ctx) {
  c.B.pop();
  c.D.pop();
}
function foot(c: Ctx, w: number, d: number, kind: string) {
  const p = c.B.worldPos(0, 0, 0);
  c.foot.push({ x: p.x, z: p.z, w, d, ry: c.B.worldRy(), kind });
}

/* ------------------------------------ trees ------------------------------------ */
export function registerTrees(I: Instancer) {
  const mk = (fn: (b: Batcher) => void) => {
    const b = new Batcher(1e9, 0, true, null);
    fn(b);
    return b.toGeometry();
  };
  const L = M.leaves;
  I.model('oak', mk((b) => {
    b.cyl(0.22, 0.34, 3.0, 7, L, 0, 0, 0, 0x6b4a2b);
    b.ico(2.3, 1, L, 0, 4.4, 0, 0x5aa040);
    b.ico(1.8, 1, L, 1.4, 3.7, 0.5, 0x4c9038);
    b.ico(1.7, 1, L, -1.2, 4.0, -0.7, 0x68ac48);
    b.ico(1.5, 1, L, 0.2, 5.8, 0.2, 0x74b04c);
  }), L);
  I.model('birch', mk((b) => {
    b.cyl(0.14, 0.2, 3.4, 6, L, 0, 0, 0, 0xe4e0d2);
    b.ico(1.7, 1, L, 0, 4.4, 0, 0x8cc060);
    b.ico(1.3, 1, L, 0.8, 3.7, 0.3, 0x7ab456);
    b.ico(1.2, 1, L, -0.7, 5.3, -0.3, 0x98c868);
  }), L);
  I.model('pine', mk((b) => {
    b.cyl(0.18, 0.28, 2.0, 6, L, 0, 0, 0, 0x5a3c24);
    b.cyl(0.0, 2.1, 2.8, 8, L, 0, 1.2, 0, 0x2d6a3c);
    b.cyl(0.0, 1.75, 2.5, 8, L, 0, 2.7, 0, 0x2a6238);
    b.cyl(0.0, 1.35, 2.3, 8, L, 0, 4.1, 0, 0x2f6e40);
    b.cyl(0.0, 0.9, 2.0, 8, L, 0, 5.4, 0, 0x34784a);
  }), L);
  I.model('poplar', mk((b) => {
    b.cyl(0.15, 0.22, 2.4, 6, L, 0, 0, 0, 0x6b4a2b);
    b.ico(1.1, 1, L, 0, 5.2, 0, 0x6aa63c, {}, 3.3);
  }), L);
  I.model('bush', mk((b) => {
    b.ico(0.95, 1, L, 0, 0.55, 0, 0x4f9a3a, {}, 0.75);
    b.ico(0.7, 1, L, 0.7, 0.4, 0.3, 0x5aa840, {}, 0.8);
  }), L);
  I.model('apple', mk((b) => {
    b.cyl(0.10, 0.20, 1.8, 7, L, 0, 0, 0, 0x765037);
    b.ico(1.75, 1, L, 0, 2.65, 0, 0x8bad50, {}, 0.9);
    b.ico(1.12, 1, L, 0.65, 3.25, 0.4, 0x799f47);
    for (let i = 0; i < 12; i++) {
      const a = i * 2.4;
      b.ico(0.12, 1, L, Math.cos(a) * 1.45, 2.2 + (i % 3) * 0.5, Math.sin(a) * 1.45, i % 3 ? 0xcb5033 : 0xcbd477);
    }
  }), L);
  I.model('rock', mk((b) => {
    b.ico(0.9, 0, M.concrete, 0, 0.35, 0, 0x8a8a84, {}, 0.7);
    b.ico(0.55, 0, M.concrete, 0.8, 0.2, 0.3, 0x7c7c76, {}, 0.7);
  }), M.concrete);
}
export function tree(c: Ctx, kind: 'oak' | 'birch' | 'pine' | 'poplar' | 'bush' | 'rock', x: number, z: number, s = 1, collide = true) {
  const sc = s * rr(0.85, 1.25);
  const tint = kind === 'pine' || kind === 'rock' ? 0xffffff : pick(GREENS);
  c.I.add(kind, x, groundHeight(x, z), z, rnd() * 6.28, sc, kind === 'pine' || kind === 'rock' ? pick([0xffffff, 0xe8f0e8, 0xf4f4ec]) : pick([0xffffff, 0xeeeeee, 0xf6fff0, 0xfff8e0]) | 0 * tint);
  if (collide && kind !== 'bush') c.col.addCircle(x, z, kind === 'rock' ? 0.8 * sc : 0.4 * sc, 'tree');
}

/* ----------------------------------- houses etc ----------------------------------- */
export function house(c: Ctx, x: number, z: number, ry: number, w = 9, d = 8, floors = 2, wall = pick(PLASTER), roof = pick(ROOFS)) {
  const { B, D } = c;
  P(c, x, z, ry);
  const h = floors * 3.2;
  const rh = d * 0.32;
  B.box(w + 0.3, 0.45, d + 0.3, M.concrete, 0, 0, 0, 0xa8a49a);
  B.box(w, h, d, M.facPlaster, 0, 0, 0, wall, { tu: 12.8, tv: 9.6, uo: rnd() });
  B.gable(d + 1.0, rh, w + 0.8, M.roofTile, 0, h, 0, roof, { ry: Math.PI / 2, tu: 2 });
  B.box(0.7, rh + 1.2, 0.7, M.brick, w * 0.25, h, -d * 0.15, 0xffffff);
  B.box(0.9, 0.12, 0.9, M.concrete, w * 0.25, h + rh + 1.2, -d * 0.15, 0x888880);
  const dx = rnd() < 0.5 ? -w * 0.22 : w * 0.22;
  B.box(1.1, 2.1, 0.12, M.wood, dx, 0.45, d / 2 + 0.02, pick([0x7a4a2a, 0x2c5a4a, 0x8a2a2a, 0x2a3e6a]));
  B.box(1.5, 0.2, 0.7, M.concrete, dx, 0.0, d / 2 + 0.35, 0xb0aca0);
  B.box(2.2, 0.12, 1.1, M.roofFlat, dx, 2.7, d / 2 + 0.55, roof);
  D.box(0.1, 2.3, 0.1, M.wood, dx - 0.9, 0.3, d / 2 + 1.0, 0xeeeeee);
  D.box(0.1, 2.3, 0.1, M.wood, dx + 0.9, 0.3, d / 2 + 1.0, 0xeeeeee);
  // gutter & window boxes
  B.box(w + 0.9, 0.1, 0.1, M.metal, 0, h - 0.1, d / 2 + 0.55, 0x777777);
  for (const s of [-1, 1]) D.box(1.3, 0.25, 0.3, M.leaves, s * w * 0.3, 1.1, d / 2 + 0.2, pick([0xd04a6a, 0xe0a030, 0x7a60c0]));
  if (rnd() < 0.5) D.box(0.9, 0.08, 0.6, M.metal, -w * 0.3, h + 0.5, 0.5, 0xcccccc, { rx: -0.8 }); // satellite dish
  // front hedge
  D.box(w * 0.5 - 1.4, 0.9, 0.7, M.leaves, dx > 0 ? -w * 0.25 : w * 0.25, 0, d / 2 + 3.6, 0x4a8a3a);
  D.box(0.4, 0.5, 0.3, M.paint, dx + 1.6, 0.5, d / 2 + 3.6, 0xc03030);
  B.colBox(w, d);
  foot(c, w, d, 'house');
  Q(c);
}

export function apartment(c: Ctx, x: number, z: number, ry: number, w = 20, d = 12, floors = 5, kind = 0) {
  const { B, D } = c;
  P(c, x, z, ry);
  const h = floors * 3.2;
  const mat = [M.facConcrete, M.facBrick, M.facPlaster][kind % 3];
  const tint = kind === 0 ? pick([0xf0f0ea, 0xe0e6ee, 0xeee8da]) : kind === 1 ? pick([0xffffff, 0xf0d8c8]) : pick(PLASTER);
  B.box(w + 0.2, 0.5, d + 0.2, M.concrete, 0, 0, 0, 0x9a9890);
  B.box(w, h, d, mat, 0, 0, 0, tint, { tu: 12.8, tv: 9.6 });
  B.box(w + 0.5, 0.3, d + 0.5, M.concrete, 0, h, 0, 0xb4b4ac);
  for (const [bw, bd, bx, bz] of [[w + 0.5, 0.3, 0, d / 2 + 0.1], [w + 0.5, 0.3, 0, -d / 2 - 0.1], [0.3, d + 0.5, w / 2 + 0.1, 0], [0.3, d + 0.5, -w / 2 - 0.1, 0]])
    B.box(bw, 0.7, bd, M.concrete, bx, h + 0.3, bz, 0xb8b8b0);
  // roof clutter
  B.box(3.2, 2.6, 3.2, M.concrete, -w * 0.25, h + 0.3, 0, 0xaaaaa2);
  for (let i = 0; i < 3; i++) {
    D.box(1.1, 0.8, 1.1, M.metal, w * 0.1 + i * 2.0, h + 0.3, d * 0.2, 0xb8bcc0);
    D.cyl(0.35, 0.35, 0.15, 8, M.metal, w * 0.1 + i * 2.0, h + 1.1, d * 0.2, 0x444444);
  }
  D.cyl(0.04, 0.04, 4.0, 4, M.metal, w * 0.35, h + 0.3, -d * 0.2, 0x888888);
  D.box(1.2, 0.04, 0.04, M.metal, w * 0.35, h + 3.5, -d * 0.2, 0x888888);
  D.cyl(1.2, 1.2, 1.8, 10, M.metal, w * 0.3, h + 0.3, d * 0.28, 0x6a7078);
  D.box(3.0, 0.08, 1.8, M.glass, -w * 0.22, h + 0.65, d * 0.12, 0x36577d, { rx: -0.35 });
  D.cyl(0.27, 0.27, 1.8, 12, M.chrome, -w * 0.22, h + 1.25, d * 0.12 - 0.6, 0xc5c4b9, { rz: Math.PI / 2 });
  // balconies on every other window of front face
  for (let f = 1; f < floors; f++)
    for (let k = 1; k < Math.floor(w / 3.2); k += 2) {
      const bx = -w / 2 + 1.6 + 3.2 * k;
      if (Math.abs(bx) > w / 2 - 1.2) continue;
      B.box(2.4, 0.14, 1.1, M.concrete, bx, f * 3.2 - 0.1, d / 2 + 0.55, 0xb0b0a8);
      B.box(2.4, 0.9, 0.05, M.metal, bx, f * 3.2 + 0.04, d / 2 + 1.07, 0x384048);
      B.box(0.05, 0.9, 1.0, M.metal, bx - 1.2, f * 3.2 + 0.04, d / 2 + 0.55, 0x384048);
      B.box(0.05, 0.9, 1.0, M.metal, bx + 1.2, f * 3.2 + 0.04, d / 2 + 0.55, 0x384048);
    }
  // entrance
  B.box(2.4, 2.3, 0.1, M.glass, 0, 0.5, d / 2 + 0.03, 0x4a6a88);
  B.box(4.0, 0.2, 1.6, M.concrete, 0, 2.9, d / 2 + 0.8, 0xc0c0b8);
  D.box(0.15, 2.6, 0.15, M.metal, -1.8, 0.3, d / 2 + 1.5, 0x555555);
  D.box(0.15, 2.6, 0.15, M.metal, 1.8, 0.3, d / 2 + 1.5, 0x555555);
  B.colBox(w, d);
  foot(c, w, d, 'apartment');
  Q(c);
}

export function shop(c: Ctx, x: number, z: number, ry: number, w = 14, d = 11, floors = 2, wall = pick(PLASTER)) {
  const { B, D } = c;
  P(c, x, z, ry);
  const h = floors * 3.2;
  B.box(w, 3.2, d, M.shopfront, 0, 0, 0, 0xffffff, { tu: 12.8, tv: 3.2 });
  if (floors > 1) B.box(w, h - 3.2, d, M.facPlaster, 0, 3.2, 0, wall, { tu: 12.8, tv: 9.6, vo: 1 / 3, uo: rnd() });
  B.box(w + 0.4, 0.3, d + 0.4, M.concrete, 0, h, 0, 0xb4b4ac);
  B.box(w + 0.4, 0.5, 0.3, M.concrete, 0, h + 0.3, d / 2 + 0.1, 0xb8b8b0);
  const col = pick([0xc03030, 0x2a5ea0, 0x2f8a4a, 0xd88a1a]);
  for (let i = 0; i < 6; i++) {
    const aw = (w * 0.9) / 6;
    B.box(aw, 0.07, 1.5, M.flat, -w * 0.45 + aw * (i + 0.5), 2.7, d / 2 + 0.7, i % 2 ? 0xf2f2ee : col, { rx: 0.25 });
  }
  B.box(w * 0.74, 0.78, 0.14, labelMaterial(pick([tr.shopBakery, tr.shopMarket, tr.shopCafe, tr.shopHardware, tr.shopFood]), 'shop'),
    0, 3.35, d / 2 + 0.13, 0xffffff, { tu: w * 0.74, tv: 0.78 });
  D.box(0.5, 0.5, 0.5, M.leaves, -w * 0.4, 0, d / 2 + 1.4, 0x3a7a30);
  D.box(0.5, 0.5, 0.5, M.leaves, w * 0.4, 0, d / 2 + 1.4, 0x3a7a30);
  B.colBox(w, d);
  foot(c, w, d, 'shop');
  Q(c);
}

export function warehouse(c: Ctx, x: number, z: number, ry: number, w: number, d: number, h: number, color: number, docks = 0, doorFront = true) {
  const { B, D } = c;
  P(c, x, z, ry);
  B.box(w, h, d, M.corrugated, 0, 0, 0, color, { tu: 2 });
  B.box(w + 0.1, 1.1, d + 0.1, M.concrete, 0, 0, 0, 0xb0b0aa);
  B.gable(d + 0.6, 1.6, w + 0.6, M.roofMetal, 0, h, 0, 0x8a9096, { ry: Math.PI / 2 });
  for (const s of [-1, 1]) B.box(w * 0.8, 0.9, 0.1, M.glass, 0, h - 2.0, s * (d / 2 + 0.03), 0x4a6a88);
  for (let i = 0; i < Math.max(1, Math.floor(w / 18)); i++) {
    D.cyl(0.5, 0.5, 0.9, 8, M.metal, -w / 2 + 6 + i * 9, h + 1.0, 0, 0xaaaaaa);
    D.box(1.4, 0.7, 1.4, M.metal, -w / 2 + 9 + i * 9, h + 1.0, d * 0.2, 0xbbbbbb);
  }
  if (docks && doorFront) {
    const sp = w / (docks + 1);
    for (let i = 1; i <= docks; i++) {
      const xi = -w / 2 + sp * i;
      B.box(3.2, 3.7, 0.15, M.dockDoor, xi, 0, d / 2 + 0.03, 0xffffff, { tu: 3.2 });
      B.box(3.7, 0.3, 0.22, M.metal, xi, 3.7, d / 2 + 0.05, 0x555a60);
      B.box(0.25, 3.8, 0.22, M.metal, xi - 1.75, 0, d / 2 + 0.05, 0x555a60);
      B.box(0.25, 3.8, 0.22, M.metal, xi + 1.75, 0, d / 2 + 0.05, 0x555a60);
      B.box(0.45, 0.9, 0.3, M.rubber, xi - 2.0, 1.0, d / 2 + 0.2, 0x222222);
      B.box(0.45, 0.9, 0.3, M.rubber, xi + 2.0, 1.0, d / 2 + 0.2, 0x222222);
      B.box(4.4, 0.2, 1.8, M.metal, xi, 4.4, d / 2 + 0.9, 0x6a7076);
      B.box(0.3, 0.14, 0.4, M.bulb, xi, 4.2, d / 2 + 0.3, 0xffffff);
      B.box(0.5, 0.5, 0.05, M.hazard, xi, 3.9, d / 2 + 0.2, 0xffffff);
      D.cyl(0.12, 0.12, 1.1, 8, M.hazard, xi - 2.5, 0, d / 2 + 2.6, 0xffffff);
      D.cyl(0.12, 0.12, 1.1, 8, M.hazard, xi + 2.5, 0, d / 2 + 2.6, 0xffffff);
      c.lamps.push({ ...c.B.worldPos(xi, 4.2, d / 2 + 0.5) });
    }
  }
  B.box(1.1, 2.2, 0.12, M.metal, w / 2 - 3, 0, d / 2 + 0.03, 0x3a5a7a);
  B.colBox(w, d);
  foot(c, w, d, 'warehouse');
  Q(c);
}

export function factory(c: Ctx, x: number, z: number, ry: number, w: number, d: number) {
  const { B, D } = c;
  warehouse(c, x, z, ry, w, d, 9, 0xb4bcc4, 5, true);
  P(c, x, z, ry);
  // sawtooth skylights
  for (let i = 0; i < 4; i++) B.gable(d / 4 + 0.2, 2.2, w * 0.6, M.roofMetal, -w * 0.15, 9.5, -d / 2 + (i + 0.5) * (d / 4), 0x9aa0a6, { ry: Math.PI / 2 });
  // chimney with bands
  for (let i = 0; i < 6; i++) B.cyl(1.0 - i * 0.04, 1.04 - i * 0.04, 5, 10, M.flat, w / 2 + 3, i * 5, -d / 2 + 4, i % 2 ? 0xf0f0ea : 0xc83020);
  B.colCircle(1.5, w / 2 + 3, -d / 2 + 4);
  // tanks + pipes
  for (let i = 0; i < 2; i++) {
    B.cyl(3.0, 3.0, 8, 14, M.metal, w / 2 + 8, 0, -d / 4 + i * 8, 0xc8ccd0);
    B.ico(3.0, 1, M.metal, w / 2 + 8, 8, -d / 4 + i * 8, 0xc8ccd0, {}, 0.45);
    B.colCircle(3.1, w / 2 + 8, -d / 4 + i * 8);
    D.box(0.5, 8.4, 0.08, M.metal, w / 2 + 11.1, 0, -d / 4 + i * 8, 0x555555);
  }
  B.cyl(0.4, 0.4, 8, 8, M.metal, w / 2 + 8, 7.0, -d / 4, 0x8a9096, { rz: Math.PI / 2 });
  B.cyl(0.3, 0.3, 8, 8, M.metal, w / 2 + 8, 6.2, -d / 4 + 8, 0xb06040, { rz: Math.PI / 2 });
  // office annex
  B.box(14, 6.4, 9, M.facConcrete, -w / 2 - 7, 0, d / 2 - 4.5, 0xe8e8e0, { tu: 12.8, tv: 9.6 });
  B.box(14.4, 0.3, 9.4, M.concrete, -w / 2 - 7, 6.4, d / 2 - 4.5, 0xb0b0a8);
  B.colBox(14, 9, -w / 2 - 7, d / 2 - 4.5);
  foot(c, 14, 9, 'factory');
  Q(c);
}

export function barn(c: Ctx, x: number, z: number, ry: number, w = 16, d = 22) {
  const { B, D } = c;
  P(c, x, z, ry);
  B.box(w, 6.5, d, M.plaster, 0, 0, 0, 0xe1d5b5, { tu: 4 });
  B.gable(w + 1.2, 4.2, d + 1.2, M.roofTile, 0, 6.5, 0, 0xb57655);
  B.box(5.0, 5.0, 0.2, M.wood, 0, 0, d / 2 + 0.05, 0x596b6c, { tu: 2.5 });
  B.box(5.4, 0.3, 0.3, M.flat, 0, 5.0, d / 2 + 0.1, 0xf0ece0);
  B.box(0.3, 5.0, 0.3, M.flat, -2.6, 0, d / 2 + 0.1, 0xf0ece0);
  B.box(0.3, 5.0, 0.3, M.flat, 2.6, 0, d / 2 + 0.1, 0xf0ece0);
  B.box(0.3, 6.0, 0.15, M.flat, 0, 0, d / 2 + 0.2, 0xf0ece0, { rz: 0.7, c: false });
  B.box(1.6, 1.8, 0.15, M.wood, 0, 7.2, d / 2 + 0.05, 0x5a1c16);
  B.colBox(w, d);
  foot(c, w, d, 'barn');
  Q(c);
}
export function silo(c: Ctx, x: number, z: number, r = 2.6, h = 14) {
  const { B } = c;
  B.cyl(r, r, h, 14, M.metal, x, 0, z, 0xc8ccd0);
  for (let i = 1; i < 5; i++) B.cyl(r + 0.05, r + 0.05, 0.15, 14, M.metal, x, (h * i) / 5, z, 0x8a9096);
  B.ico(r, 1, M.metal, x, h, z, 0xb8bcc0, {}, 0.5);
  B.box(0.4, h, 0.06, M.metal, x + r + 0.03, 0, z, 0x444444);
  B.col.addCircle(x, z, r + 0.2, 'silo');
}
export function church(c: Ctx, x: number, z: number, ry: number) {
  const { B, D } = c;
  P(c, x, z, ry);
  B.box(9, 7, 18, M.facPlaster, 0, 0, -2, 0xece4d0, { tu: 12.8, tv: 9.6 });
  B.gable(10.4, 5.2, 19.4, M.roofTile, 0, 7, -2, 0x5c606c);
  B.box(5.2, 15, 5.2, M.brick, 0, 0, 8.4, 0xe0c8b8);
  B.cyl(0.02, 3.8, 9.5, 4, M.roofMetal, 0, 15, 8.4, 0x424850, { ry: Math.PI / 4 });
  B.box(0.15, 1.4, 0.15, M.metal, 0, 24.3, 8.4, 0xd8b040);
  B.box(0.7, 0.15, 0.15, M.metal, 0, 25.2, 8.4, 0xd8b040);
  B.box(1.6, 1.6, 0.1, M.flat, 0, 11, 11.02, 0xf4f4ee);
  B.box(2.0, 3.2, 0.14, M.wood, 0, 0.3, 11.03, 0x4a2c1a);
  for (const s of [-1, 1]) B.box(0.9, 2.4, 0.1, M.glass, s * 4.52, 2.0, -2, 0x6a58a0);
  B.colBox(9, 18, 0, -2);
  B.colBox(5.2, 5.2, 0, 8.4);
  foot(c, 9, 18, 'church');
  Q(c);
}

export function container(c: Ctx, x: number, y: number, z: number, ry: number, color: number) {
  const { B } = c;
  B.push(x, y, z, ry);
  B.box(2.44, 2.6, 12.2, M.corrugated, 0, 0, 0, color, { tu: 2 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(0.18, 2.62, 0.18, M.metal, sx * 1.22, 0, sz * 6.1, 0x555a60);
  B.box(2.4, 0.12, 12.2, M.metal, 0, 2.58, 0, 0x555a60);
  B.box(0.06, 2.3, 0.1, M.metal, -0.4, 0.15, 6.12, 0x44484e);
  B.box(0.06, 2.3, 0.1, M.metal, 0.4, 0.15, 6.12, 0x44484e);
  B.pop();
}
export function containerStack(c: Ctx, x: number, z: number, ry: number, cols = 2, high = 2) {
  const colors = [0xb8402a, 0x2e5fa0, 0x3b8a52, 0xd89a20, 0x7a7e84, 0x8a3a6a, 0xc8c8c0];
  for (let i = 0; i < cols; i++)
    for (let h = 0; h < high; h++) {
      const ox = Math.cos(ry) * i * 2.6, oz = -Math.sin(ry) * i * 2.6;
      if (h > 0 && rnd() < 0.25) continue;
      container(c, x + ox, h * 2.6, z + oz, ry, pick(colors));
    }
  const hl = 6.1, hw = 1.3 * cols;
  const cx = x + Math.cos(ry) * (cols - 1) * 1.3, cz = z - Math.sin(ry) * (cols - 1) * 1.3;
  c.col.addBox(cx, cz, hw, hl, ry, 'container');
  c.foot.push({ x: cx, z: cz, w: hw * 2, d: hl * 2, ry, kind: 'container' });
}

export function pallet(c: Ctx, x: number, z: number, ry: number, mode = 0) {
  const { D } = c;
  D.push(x, 0, z, ry);
  D.box(1.2, 0.14, 0.8, M.wood, 0, 0, 0, 0xc8a070);
  if (mode === 0) {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++)
      D.box(0.55, 0.45, 0.38, M.cardboard, -0.3 + i * 0.6, 0.14 + k * 0.46, -0.2 + j * 0.4, 0xffffff);
  } else if (mode === 1) {
    D.box(1.1, 1.3, 0.72, M.flat, 0, 0.14, 0, 0xdce4ec);
    D.box(1.12, 0.12, 0.74, M.flat, 0, 0.7, 0, 0x7a9ac0);
  } else {
    D.box(1.1, 0.9, 0.72, M.flat, 0, 0.14, 0, pick([0xc8a050, 0x6a8aa8, 0xa86a50]));
  }
  D.pop();
}

export function tank(c: Ctx, x: number, z: number, r: number, h: number, color = 0xc8ccd0) {
  c.B.cyl(r, r, h, 16, M.metal, x, 0, z, color);
  c.B.ico(r, 1, M.metal, x, h, z, color, {}, 0.4);
  c.col.addCircle(x, z, r + 0.1, 'tank');
}

/* ---------------------------------- street furniture ---------------------------------- */
export function bench(c: Ctx, x: number, z: number, ry: number) {
  const { D } = c;
  D.push(x, 0, z, ry);
  D.box(1.6, 0.08, 0.45, M.wood, 0, 0.45, 0, 0xb08050);
  D.box(1.6, 0.4, 0.06, M.wood, 0, 0.6, -0.22, 0xb08050, { rx: -0.2 });
  D.box(0.08, 0.45, 0.4, M.metal, -0.7, 0, 0, 0x333333);
  D.box(0.08, 0.45, 0.4, M.metal, 0.7, 0, 0, 0x333333);
  D.pop();
  c.col.addCircle(x, z, 0.6, 'bench');
}
export function bin(c: Ctx, x: number, z: number, ry = 0, big = false) {
  const { D } = c;
  D.push(x, 0, z, ry);
  if (big) {
    const col = pick([0x2f6e3a, 0x2a4a8a, 0x8a2a2a]);
    D.box(2.2, 1.35, 1.3, M.paint, 0, 0.1, 0, col);
    D.box(2.3, 0.1, 1.4, M.paint, 0, 1.45, 0, 0x333333, { rx: -0.08 });
    D.box(0.2, 0.2, 0.2, M.rubber, -0.9, 0, 0.5, 0x111111);
    D.box(0.2, 0.2, 0.2, M.rubber, 0.9, 0, 0.5, 0x111111);
    c.col.addBox(x, z, 1.1, 0.65, ry + 0, 'bin');
  } else {
    D.cyl(0.28, 0.24, 0.9, 8, M.paint, 0, 0, 0, pick([0x3a3a3e, 0x2f6e3a, 0x2a4a8a]));
    D.cyl(0.3, 0.3, 0.08, 8, M.paint, 0, 0.9, 0, 0x222222);
    c.col.addCircle(x, z, 0.3, 'bin');
  }
  D.pop();
}
export function busStop(c: Ctx, x: number, z: number, ry: number) {
  const { D } = c;
  D.push(x, 0, z, ry);
  D.box(3.4, 0.1, 1.5, M.metal, 0, 2.5, 0, 0x4a5058);
  D.box(0.08, 2.5, 0.08, M.metal, -1.6, 0, 0.6, 0x3a3e44);
  D.box(0.08, 2.5, 0.08, M.metal, 1.6, 0, 0.6, 0x3a3e44);
  D.box(3.2, 1.9, 0.05, M.glass, 0, 0.5, -0.7, 0x6a8aa4);
  D.box(3.0, 0.1, 0.5, M.wood, 0, 0.5, -0.4, 0x9a7048);
  D.box(0.9, 0.4, 0.06, labelMaterial(tr.busStop, 'local'), 1.9, 2.3, 0.6, 0xffffff, { tu: 0.9, tv: 0.4 });
  D.pop();
  c.col.addBox(x, z, 1.7, 0.8, ry, 'busstop');
}
export function picnic(c: Ctx, x: number, z: number, ry: number) {
  const { D } = c;
  D.push(x, 0, z, ry);
  D.box(2.0, 0.07, 0.8, M.wood, 0, 0.76, 0, 0xb08050);
  D.box(2.0, 0.07, 0.3, M.wood, 0, 0.45, 0.65, 0xb08050);
  D.box(2.0, 0.07, 0.3, M.wood, 0, 0.45, -0.65, 0xb08050);
  D.box(0.1, 0.78, 1.5, M.wood, -0.8, 0, 0, 0x9a7048, { rx: 0 });
  D.box(0.1, 0.78, 1.5, M.wood, 0.8, 0, 0, 0x9a7048);
  D.pop();
  c.col.addBox(x, z, 1.0, 1.0, ry, 'table');
}
export function vending(c: Ctx, x: number, z: number, ry: number, col = 0xc82a2a) {
  const { D } = c;
  D.push(x, 0, z, ry);
  D.box(1.0, 1.9, 0.8, M.paint, 0, 0, 0, col);
  D.box(0.7, 1.1, 0.04, M.stationLight, -0.05, 0.6, 0.41, 0xdfeaff);
  D.pop();
  c.col.addBox(x, z, 0.5, 0.4, ry, 'vend');
}
export function barrels(c: Ctx, x: number, z: number, n = 3) {
  for (let i = 0; i < n; i++) {
    const bx = x + (i % 2) * 0.7, bz = z + Math.floor(i / 2) * 0.7;
    c.D.cyl(0.3, 0.3, 0.9, 10, M.paint, bx, 0, bz, pick([0x2a5ea0, 0xc03030, 0x3a3a3e, 0xd8a020]));
    c.D.cyl(0.31, 0.31, 0.05, 10, M.metal, bx, 0.9, bz, 0x888888);
  }
  c.col.addCircle(x + 0.35, z + 0.35, 1.0, 'barrels');
}
export function haybale(c: Ctx, x: number, z: number, round = true) {
  if (round) {
    c.D.cyl(0.9, 0.9, 1.2, 12, M.fieldGold, x, 0.9, z, 0xffffff, { rz: Math.PI / 2 });
    c.col.addCircle(x, z, 1.0, 'bale');
  } else {
    c.D.box(1.2, 0.7, 0.8, M.fieldGold, x, 0, z, 0xe0c060);
  }
}
export function parkedCar(c: Ctx, x: number, z: number, ry: number) {
  const style = pick(['hatch', 'sedan', 'suv', 'wagon']) as CarStyle;
  c.D.push(x, 0, z, ry);
  carInto(c.D, pick(CAR_COLORS), style);
  c.D.pop();
  c.col.addBox(x, z, 0.95, 2.1, ry, 'car');
}
export function tractor(c: Ctx, x: number, z: number, ry: number) {
  c.D.push(x, 0, z, ry);
  tractorInto(c.D);
  c.D.pop();
  c.col.addBox(x, z, 1.4, 2.3, ry, 'tractor');
}

export function fence(c: Ctx, x0: number, z0: number, x1: number, z1: number, kind: 'chain' | 'wood' | 'wire' = 'chain', collide = true) {
  const { D, B } = c;
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.5) return;
  const ry = Math.atan2(dx, dz);
  const n = Math.max(1, Math.round(len / 3));
  const seg = len / n;
  const h = kind === 'chain' ? 2.0 : kind === 'wood' ? 1.1 : 1.0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    D.box(0.1, h + 0.1, 0.1, kind === 'wood' ? M.wood : M.metal, x0 + dx * t, 0, z0 + dz * t, kind === 'wood' ? 0xa07848 : 0x8a8e94, { tu: 1 });
  }
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const cx = x0 + dx * t, cz = z0 + dz * t;
    if (kind === 'chain') D.box(0.03, h - 0.1, seg, M.fence, cx, 0.1, cz, 0xffffff, { ry: 0, tu: 1.5, tv: 1.5 });
    else if (kind === 'wood') {
      D.box(0.05, 0.12, seg, M.wood, cx, 0.35, cz, 0xb08850, { tu: 1 });
      D.box(0.05, 0.12, seg, M.wood, cx, 0.8, cz, 0xb08850, { tu: 1 });
    } else D.box(0.02, 0.8, seg, M.fence, cx, 0.1, cz, 0xcccccc, { tu: 1.2, tv: 1.2 });
    // orient panel along segment
  }
  void B;
  if (collide) c.col.addBox((x0 + x1) / 2, (z0 + z1) / 2, 0.15, len / 2, ry, 'fence');
}
/** rotate-aware fence panels: since panels above are axis aligned on local z, we wrap them */
export function fenceLine(c: Ctx, x0: number, z0: number, x1: number, z1: number, kind: 'chain' | 'wood' | 'wire' = 'chain', collide = true) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.5) return;
  const ry = Math.atan2(dx, dz);
  c.D.push(x0, 0, z0, ry);
  const n = Math.max(1, Math.round(len / 3));
  const seg = len / n;
  const h = kind === 'chain' ? 2.0 : kind === 'wood' ? 1.1 : 1.0;
  for (let i = 0; i <= n; i++)
    c.D.box(0.1, h + 0.1, 0.1, kind === 'wood' ? M.wood : M.metal, 0, 0, i * seg, kind === 'wood' ? 0xa07848 : 0x8a8e94, { tu: 1 });
  for (let i = 0; i < n; i++) {
    const cz = (i + 0.5) * seg;
    if (kind === 'chain') c.D.box(0.03, h - 0.1, seg, M.fence, 0, 0.1, cz, 0xffffff, { tu: 1.5, tv: 1.5 });
    else if (kind === 'wood') {
      c.D.box(0.05, 0.12, seg, M.wood, 0, 0.35, cz, 0xb08850, { tu: 1 });
      c.D.box(0.05, 0.12, seg, M.wood, 0, 0.8, cz, 0xb08850, { tu: 1 });
    } else c.D.box(0.02, 0.8, seg, M.fence, 0, 0.1, cz, 0xcccccc, { tu: 1.2, tv: 1.2 });
  }
  c.D.pop();
  if (collide) c.col.addBox((x0 + x1) / 2, (z0 + z1) / 2, 0.15, len / 2, ry, 'fence');
}

/** Utility poles along a polyline with sagging cables */
export function poleLine(c: Ctx, pts: number[][], spacing = 42, side = 8) {
  const poles: THREE.Vector3[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / L, dz = (bz - az) / L;
    for (let s = 0; s < L; s += spacing) {
      const px = ax + dx * s + -dz * side, pz = az + dz * s + dx * side;
      c.D.push(px, 0, pz, Math.atan2(dx, dz));
      c.D.cyl(0.13, 0.17, 9.5, 6, M.wood, 0, 0, 0, 0x7a5a3a);
      c.D.box(2.4, 0.12, 0.12, M.wood, 0, 8.7, 0, 0x6a4a2a);
      for (const k of [-1, 0, 1]) c.D.cyl(0.04, 0.04, 0.2, 4, M.metal, k * 1.0, 8.8, 0, 0xdddddd);
      c.D.pop();
      c.col.addCircle(px, pz, 0.25, 'pole');
      poles.push(new THREE.Vector3(px, 0, pz).set(px, Math.atan2(dx, dz), pz));
    }
  }
  for (let i = 0; i < poles.length - 1; i++) {
    const a = poles[i], b = poles[i + 1];
    if (Math.hypot(b.x - a.x, b.z - a.z) > spacing * 1.6) continue;
    for (const k of [-1, 0, 1]) {
      const oa = k * 1.0;
      const ax = a.x + Math.cos(a.y) * oa, az = a.z - Math.sin(a.y) * oa;
      const bx = b.x + Math.cos(b.y) * oa, bz = b.z - Math.sin(b.y) * oa;
      let px = ax, py = 8.8, pz = az;
      for (let t = 1; t <= 8; t++) {
        const u = t / 8;
        const nx = ax + (bx - ax) * u, nz = az + (bz - az) * u, ny = 8.8 - 1.1 * (1 - Math.pow(2 * u - 1, 2));
        c.cables.push(px, py, pz, nx, ny, nz);
        px = nx; py = ny; pz = nz;
      }
    }
  }
}
