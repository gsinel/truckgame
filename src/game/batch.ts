import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  Collision world (static boxes & circles in a spatial hash)         */
/* ------------------------------------------------------------------ */
export interface Collider {
  t: 0 | 1; // 0 box, 1 circle
  cx: number; cz: number;
  hw: number; hd: number; r: number;
  cos: number; sin: number;
  stamp: number;
  tag?: string;
}
export interface Hit { nx: number; nz: number; pen: number; c: Collider }

export class Colliders {
  cell = 16;
  grid = new Map<number, Collider[]>();
  stamp = 0;
  all: Collider[] = [];
  private k(ix: number, iz: number) {
    return (ix + 2048) * 8192 + (iz + 2048);
  }
  private insert(c: Collider, rad: number) {
    const x0 = Math.floor((c.cx - rad) / this.cell), x1 = Math.floor((c.cx + rad) / this.cell);
    const z0 = Math.floor((c.cz - rad) / this.cell), z1 = Math.floor((c.cz + rad) / this.cell);
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const k = this.k(ix, iz);
        let a = this.grid.get(k);
        if (!a) this.grid.set(k, (a = []));
        a.push(c);
      }
    this.all.push(c);
  }
  addBox(cx: number, cz: number, hw: number, hd: number, ry: number, tag?: string) {
    const c: Collider = { t: 0, cx, cz, hw, hd, r: 0, cos: Math.cos(ry), sin: Math.sin(ry), stamp: 0, tag };
    this.insert(c, Math.hypot(hw, hd));
  }
  addCircle(cx: number, cz: number, r: number, tag?: string) {
    const c: Collider = { t: 1, cx, cz, hw: 0, hd: 0, r, cos: 1, sin: 0, stamp: 0, tag };
    this.insert(c, r);
  }
  /** Calls fn(hit) for every collider overlapping circle (x,z,r) */
  query(x: number, z: number, r: number, fn: (h: Hit) => void) {
    this.stamp++;
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell);
    const z0 = Math.floor((z - r) / this.cell), z1 = Math.floor((z + r) / this.cell);
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const a = this.grid.get(this.k(ix, iz));
        if (!a) continue;
        for (const c of a) {
          if (c.stamp === this.stamp) continue;
          c.stamp = this.stamp;
          const h = testCircle(c, x, z, r);
          if (h) fn(h);
        }
      }
  }
}

function testCircle(c: Collider, x: number, z: number, r: number): Hit | null {
  if (c.t === 1) {
    const dx = x - c.cx, dz = z - c.cz;
    const d = Math.hypot(dx, dz);
    const rr = r + c.r;
    if (d >= rr) return null;
    if (d < 1e-5) return { nx: 1, nz: 0, pen: rr, c };
    return { nx: dx / d, nz: dz / d, pen: rr - d, c };
  }
  const dx = x - c.cx, dz = z - c.cz;
  const lx = dx * c.cos - dz * c.sin;
  const lz = dx * c.sin + dz * c.cos;
  const qx = Math.max(-c.hw, Math.min(c.hw, lx));
  const qz = Math.max(-c.hd, Math.min(c.hd, lz));
  let ddx = lx - qx, ddz = lz - qz;
  const d = Math.hypot(ddx, ddz);
  let nlx: number, nlz: number, pen: number;
  if (d > 1e-5) {
    if (d >= r) return null;
    nlx = ddx / d; nlz = ddz / d; pen = r - d;
  } else {
    const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
    if (px < pz) { nlx = Math.sign(lx) || 1; nlz = 0; pen = px + r; }
    else { nlx = 0; nlz = Math.sign(lz) || 1; pen = pz + r; }
  }
  return { nx: nlx * c.cos + nlz * c.sin, nz: -nlx * c.sin + nlz * c.cos, pen, c };
}

/* ------------------------------------------------------------------ */
/*  Coplanar-face auditor (z-fighting detector)                        */
/*                                                                     */
/*  Walks finished geometry and reports pairs of triangles that are    */
/*  (a) on the same plane, (b) facing the SAME way (opposite-facing    */
/*  pairs are removed by back-face culling and never fight), and       */
/*  (c) actually overlapping in that plane. Run from the console:      */
/*      __auditCoplanar()                                              */
/* ------------------------------------------------------------------ */
export interface CoplanarHit {
  mat: string; nx: number; ny: number; nz: number; plane: number;
  area: number; x: number; y: number; z: number;
}

export function auditCoplanar(root: THREE.Object3D, planeTol = 0.0025): CoplanarHit[] {
  interface Tri { u0: number; u1: number; v0: number; v1: number; cx: number; cy: number; cz: number; area: number }
  const groups = new Map<string, Tri[]>();
  const hits: CoplanarHit[] = [];

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const g = mesh.geometry as THREE.BufferGeometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute;
    if (!pos || !nor || g.index) return;
    const matName = Array.isArray(mesh.material) ? 'multi' : (mesh.material as THREE.Material).uuid.slice(0, 8);
    mesh.updateMatrixWorld();
    const mw = mesh.matrixWorld;
    const a = new THREE.Vector3(), b2 = new THREE.Vector3(), c2 = new THREE.Vector3(), n = new THREE.Vector3();

    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i).applyMatrix4(mw);
      b2.fromBufferAttribute(pos, i + 1).applyMatrix4(mw);
      c2.fromBufferAttribute(pos, i + 2).applyMatrix4(mw);
      n.fromBufferAttribute(nor, i).transformDirection(mw).normalize();
      // only axis-aligned faces: that is where authored props actually collide
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      const domv = Math.max(ax, ay, az);
      if (domv < 0.999) continue;
      const dom = ax === domv ? 0 : ay === domv ? 1 : 2;
      const sign = (dom === 0 ? n.x : dom === 1 ? n.y : n.z) > 0 ? 1 : -1;
      const plane = dom === 0 ? a.x : dom === 1 ? a.y : a.z;
      // in-plane axes
      const pu = (p: THREE.Vector3) => (dom === 0 ? p.z : p.x);
      const pv = (p: THREE.Vector3) => (dom === 1 ? p.z : p.y);
      const u0 = Math.min(pu(a), pu(b2), pu(c2)), u1 = Math.max(pu(a), pu(b2), pu(c2));
      const v0 = Math.min(pv(a), pv(b2), pv(c2)), v1 = Math.max(pv(a), pv(b2), pv(c2));
      const area = (u1 - u0) * (v1 - v0);
      if (area < 0.02) continue; // ignore slivers
      const key = `${matName}|${dom}|${sign}|${Math.round(plane / planeTol)}`;
      let arr = groups.get(key);
      if (!arr) groups.set(key, (arr = []));
      arr.push({ u0, u1, v0, v1, cx: (a.x + b2.x + c2.x) / 3, cy: (a.y + b2.y + c2.y) / 3, cz: (a.z + b2.z + c2.z) / 3, area });
    }
  });

  for (const [key, arr] of groups) {
    if (arr.length < 2 || arr.length > 600) continue;
    const [matName, domS, signS, planeS] = key.split('|');
    const dom = +domS;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const A = arr[i], B = arr[j];
        const ou = Math.min(A.u1, B.u1) - Math.max(A.u0, B.u0);
        const ov = Math.min(A.v1, B.v1) - Math.max(A.v0, B.v0);
        if (ou <= 0.05 || ov <= 0.05) continue; // touching edges are fine
        // same triangle pair of one quad? they share the plane legitimately
        hits.push({
          mat: matName, nx: dom === 0 ? +signS : 0, ny: dom === 1 ? +signS : 0, nz: dom === 2 ? +signS : 0,
          plane: +planeS * planeTol, area: ou * ov, x: A.cx, y: A.cy, z: A.cz,
        });
        j = arr.length; // one report per triangle is enough
      }
    }
  }
  hits.sort((p, q) => q.area - p.area);
  return hits;
}

/* ------------------------------------------------------------------ */
/*  LOD registry (chunk meshes are hidden beyond their range)          */
/* ------------------------------------------------------------------ */
interface LodItem { mesh: THREE.Object3D; cx: number; cz: number; range: number }
const lodList: LodItem[] = [];
export function registerLOD(mesh: THREE.Object3D, cx: number, cz: number, range: number) {
  lodList.push({ mesh, cx, cz, range });
}
export function updateLOD(x: number, z: number) {
  for (const it of lodList) {
    const d = Math.hypot(it.cx - x, it.cz - z);
    it.mesh.visible = d < it.range;
  }
}

/* ------------------------------------------------------------------ */
/*  Batcher: authors boxes/cylinders/etc. into merged chunk meshes     */
/* ------------------------------------------------------------------ */
interface Bucket {
  mat: THREE.Material;
  cx: number; cz: number;
  pos: number[]; nor: number[]; uv: number[]; col: number[];
}
export interface BoxOpts {
  ry?: number; rx?: number; rz?: number;
  tu?: number; tv?: number; uo?: number; vo?: number;
  c?: boolean; // y is center instead of bottom
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const geoCache = new Map<string, THREE.BufferGeometry>();

// face definitions: [normal, a-axis(half unit), b-axis(half unit)]
const FACES: [number[], number[], number[]][] = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
];

export class Batcher {
  buckets = new Map<string, Bucket>();
  stack: THREE.Matrix4[] = [];
  cur = new THREE.Matrix4();
  meshes: THREE.Mesh[] = [];
  constructor(
    public chunk = 200,
    public range = 1200,
    public cast = true,
    public col: Colliders | null = null,
  ) {}

  push(x = 0, y = 0, z = 0, ry = 0) {
    this.stack.push(this.cur.clone());
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    this.cur.multiply(m);
    return this;
  }
  pop() {
    this.cur = this.stack.pop()!;
    return this;
  }

  private bucket(mat: THREE.Material, wx: number, wz: number): Bucket {
    const cx = this.chunk > 1e8 ? 0 : Math.floor(wx / this.chunk);
    const cz = this.chunk > 1e8 ? 0 : Math.floor(wz / this.chunk);
    const key = mat.uuid + '|' + cx + '|' + cz;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { mat, cx, cz, pos: [], nor: [], uv: [], col: [] }));
    return b;
  }

  private local(x: number, y: number, z: number, o: BoxOpts) {
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ');
    _m.makeRotationFromEuler(_e).setPosition(x, y, z);
    _m.premultiply(this.cur);
    return _m;
  }

  /**
   * Deterministic sub-millimetre "coplanar break".
   *
   * Props are authored on round numbers (a wall and the panel bolted to it both
   * end at x = 1.25), so overlapping parts constantly produce perfectly coplanar
   * faces. Inside one merged mesh they also share a material, which makes
   * polygonOffset useless — the depth test then flips per frame and the surface
   * flickers. Inflating each box by a hash-derived epsilon guarantees two parts
   * never land on the exact same plane. Inflation (never deflation) also means
   * seams can only close, never open.
   *
   * The epsilon is capped at 2% of the box's smallest dimension so thin trims
   * and seams do not visibly fatten.
   */
  private eps(w: number, h: number, d: number, x: number, y: number, z: number) {
    let k = Math.imul((x * 7919) | 0, 0x9e3779b1) ^ Math.imul((y * 6271) | 0, 0x85ebca6b) ^ Math.imul((z * 4591) | 0, 0xc2b2ae35);
    k ^= Math.imul((w * 3301) | 0, 0x27d4eb2f) ^ Math.imul((d * 2753) | 0, 0x165667b1);
    k = (k ^ (k >>> 15)) >>> 0;
    const unit = 0.00012 + (k / 4294967296) * 0.00108; // 0.12 mm … 1.2 mm
    const cap = Math.max(1e-5, Math.min(w, h, d) * 0.02);
    return Math.min(unit, cap);
  }

  private vert(b: Bucket, m: THREE.Matrix4, px: number, py: number, pz: number, nx: number, ny: number, nz: number, u: number, v: number, c: THREE.Color) {
    _v.set(px, py, pz).applyMatrix4(m);
    _n.set(nx, ny, nz).transformDirection(m);
    b.pos.push(_v.x, _v.y, _v.z);
    b.nor.push(_n.x, _n.y, _n.z);
    b.uv.push(u, v);
    b.col.push(c.r, c.g, c.b);
  }

  box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, color = 0xffffff, o: BoxOpts = {}) {
    const yy = o.c ? y - h / 2 : y;
    const m = this.local(x, yy + h / 2, z, o);
    const e = m.elements;
    const b = this.bucket(mat, e[12], e[14]);
    _c.set(color);
    const c = _c.clone();
    const tu = o.tu ?? 2, tv = o.tv ?? tu;
    const uo = o.uo || 0, vo = o.vo || 0;
    const q = this.eps(w, h, d, x, yy, z);
    const half = [w / 2 + q, h / 2 + q, d / 2 + q];
    for (let f = 0; f < 6; f++) {
      const [n, a, bb] = FACES[f];
      const ca = [a[0] * half[0], a[1] * half[1], a[2] * half[2]];
      const cb = [bb[0] * half[0], bb[1] * half[1], bb[2] * half[2]];
      const cn = [n[0] * half[0], n[1] * half[1], n[2] * half[2]];
      const la = Math.hypot(ca[0], ca[1], ca[2]) * 2, lb = Math.hypot(cb[0], cb[1], cb[2]) * 2;
      const vertical = f < 4;
      const su = la / tu, sv = lb / (vertical ? tv : tu);
      const pts: number[][] = [
        [cn[0] - ca[0] - cb[0], cn[1] - ca[1] - cb[1], cn[2] - ca[2] - cb[2]],
        [cn[0] + ca[0] - cb[0], cn[1] + ca[1] - cb[1], cn[2] + ca[2] - cb[2]],
        [cn[0] + ca[0] + cb[0], cn[1] + ca[1] + cb[1], cn[2] + ca[2] + cb[2]],
        [cn[0] - ca[0] + cb[0], cn[1] - ca[1] + cb[1], cn[2] - ca[2] + cb[2]],
      ];
      const uvs = [[uo, vo], [uo + su, vo], [uo + su, vo + sv], [uo, vo + sv]];
      for (const i of [0, 1, 2, 0, 2, 3])
        this.vert(b, m, pts[i][0], pts[i][1], pts[i][2], n[0], n[1], n[2], uvs[i][0], uvs[i][1], c);
    }
    return this;
  }

  /** arbitrary triangle list in local coords (flat normal computed) */
  tri(mat: THREE.Material, p: number[][], uv: number[][], color = 0xffffff, flip = false) {
    const m = this.cur;
    const b = this.bucket(mat, _v.set(p[0][0], p[0][1], p[0][2]).applyMatrix4(m).x, _v.z);
    _c.set(color);
    const c = _c.clone();
    const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
    const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    const order = flip ? [0, 2, 1] : [0, 1, 2];
    for (const i of order) this.vert(b, m, p[i][0], p[i][1], p[i][2], nx, ny, nz, uv[i][0], uv[i][1], c);
    return this;
  }
  quad(mat: THREE.Material, p: number[][], uv: number[][], color = 0xffffff) {
    this.tri(mat, [p[0], p[1], p[2]], [uv[0], uv[1], uv[2]], color);
    this.tri(mat, [p[0], p[2], p[3]], [uv[0], uv[2], uv[3]], color);
    return this;
  }
  /** flat up-facing quad strip piece between 4 world/local points with explicit up normal */
  upQuad(mat: THREE.Material, p: number[][], uv: number[][], color = 0xffffff) {
    const m = this.cur;
    const b = this.bucket(mat, p[0][0], p[0][2]);
    _c.set(color);
    const c = _c.clone();
    for (const i of [0, 1, 2, 0, 2, 3]) this.vert(b, m, p[i][0], p[i][1], p[i][2], 0, 1, 0, uv[i][0], uv[i][1], c);
    return this;
  }

  /** gable roof: width w across x, ridge height h, length d along z. bottom at y */
  gable(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, color = 0xffffff, o: BoxOpts = {}) {
    const m = this.local(x, y, z, o);
    const e = m.elements;
    const b = this.bucket(mat, e[12], e[14]);
    _c.set(color);
    const c = _c.clone();
    const hw = w / 2, hd = d / 2;
    const tu = o.tu ?? 2;
    const sl = Math.hypot(hw, h);
    const nl = [h / sl, hw / sl];
    const V = (px: number, py: number, pz: number, nx: number, ny: number, nz: number, u: number, v: number) =>
      this.vert(b, m, px, py, pz, nx, ny, nz, u, v, c);
    // left slope (-x side): normal (-nl0, nl1, 0)
    for (const s of [-1, 1]) {
      const n = [s * nl[0], nl[1], 0];
      const A = [s * hw, 0, -hd], B = [s * hw, 0, hd], C = [0, h, hd], D = [0, h, -hd];
      const quadV = s < 0 ? [A, B, C, D] : [A, D, C, B];
      const uvq = [[0, 0], [d / tu, 0], [d / tu, sl / tu], [0, sl / tu]];
      const uvr = s < 0 ? uvq : [uvq[0], uvq[3], uvq[2], uvq[1]];
      for (const i of [0, 1, 2, 0, 2, 3]) V(quadV[i][0], quadV[i][1], quadV[i][2], n[0], n[1], n[2], uvr[i][0], uvr[i][1]);
    }
    // gable ends
    for (const s of [-1, 1]) {
      const zz = s * hd;
      const pts = s > 0 ? [[-hw, 0, zz], [hw, 0, zz], [0, h, zz]] : [[hw, 0, zz], [-hw, 0, zz], [0, h, zz]];
      for (const p of pts) V(p[0], p[1], p[2], 0, 0, s, p[0] / tu, p[1] / tu);
    }
    return this;
  }

  /** flat horizontal plane (up facing) centred at x,z */
  plane(w: number, d: number, mat: THREE.Material, x: number, y: number, z: number, color = 0xffffff, o: BoxOpts = {}) {
    const m = this.local(x, y, z, o);
    const e = m.elements;
    const b = this.bucket(mat, e[12], e[14]);
    _c.set(color);
    const c = _c.clone();
    const tu = o.tu ?? 4, tv = o.tv ?? tu;
    const uo = o.uo || 0, vo = o.vo || 0;
    const P = [[-w / 2, 0, d / 2], [w / 2, 0, d / 2], [w / 2, 0, -d / 2], [-w / 2, 0, -d / 2]];
    const U = [[uo, vo], [uo + w / tu, vo], [uo + w / tu, vo + d / tv], [uo, vo + d / tv]];
    for (const i of [0, 1, 2, 0, 2, 3]) this.vert(b, m, P[i][0], P[i][1], P[i][2], 0, 1, 0, U[i][0], U[i][1], c);
    return this;
  }

  private geom(kind: string, make: () => THREE.BufferGeometry, flat: boolean) {
    let g = geoCache.get(kind);
    if (!g) {
      g = make().toNonIndexed();
      if (flat) g.computeVertexNormals();
      geoCache.set(kind, g);
    }
    return g;
  }
  addGeo(g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, color = 0xffffff, o: BoxOpts = {}) {
    const m = this.local(x, y, z, o);
    const e = m.elements;
    const b = this.bucket(mat, e[12], e[14]);
    _c.set(color);
    const c = _c.clone();
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++)
      this.vert(b, m, p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, c);
    return this;
  }
  cyl(rt: number, rb: number, h: number, seg: number, mat: THREE.Material, x: number, y: number, z: number, color = 0xffffff, o: BoxOpts = {}) {
    const g = this.geom(`cyl${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1).translate(0, h / 2, 0), false);
    return this.addGeo(g, mat, x, o.c ? y - h / 2 : y, z, color, o);
  }
  ico(r: number, detail: number, mat: THREE.Material, x: number, y: number, z: number, color = 0xffffff, o: BoxOpts = {}, sy = 1) {
    const g = this.geom(`ico${r}|${detail}|${sy}`, () => new THREE.IcosahedronGeometry(r, detail).scale(1, sy, 1), true);
    return this.addGeo(g, mat, x, y, z, color, o);
  }
  torus(r: number, tube: number, mat: THREE.Material, x: number, y: number, z: number, color = 0xffffff, o: BoxOpts = {}) {
    const g = this.geom(`tor${r}|${tube}`, () => new THREE.TorusGeometry(r, tube, 6, 18), false);
    return this.addGeo(g, mat, x, y, z, color, o);
  }

  /* collision registration in current local frame */
  colBox(w: number, d: number, x = 0, z = 0, ry = 0, tag?: string) {
    if (!this.col) return this;
    const e = this.cur.elements;
    const wx = e[0] * x + e[8] * z + e[12];
    const wz = e[2] * x + e[10] * z + e[14];
    const base = Math.atan2(e[8], e[0]);
    this.col.addBox(wx, wz, w / 2, d / 2, base + ry, tag);
    return this;
  }
  colCircle(r: number, x = 0, z = 0, tag?: string) {
    if (!this.col) return this;
    const e = this.cur.elements;
    this.col.addCircle(e[0] * x + e[8] * z + e[12], e[2] * x + e[10] * z + e[14], r, tag);
    return this;
  }

  /** world position of a local point (for registering lamps etc.) */
  worldPos(x: number, y: number, z: number) {
    return _v.set(x, y, z).applyMatrix4(this.cur).clone();
  }
  worldRy() {
    const e = this.cur.elements;
    return Math.atan2(e[8], e[0]);
  }

  build(parent: THREE.Object3D, receive = true) {
    for (const b of this.buckets.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, b.mat);
      mesh.castShadow = this.cast;
      mesh.receiveShadow = receive;
      parent.add(mesh);
      this.meshes.push(mesh);
      if (this.chunk < 1e8) {
        const cx = (b.cx + 0.5) * this.chunk, cz = (b.cz + 0.5) * this.chunk;
        lodList.push({ mesh, cx, cz, range: this.range + this.chunk });
      }
    }
    this.buckets.clear();
  }
  /** Build into a single Group (for reusable vehicle/prop models) */
  toGroup() {
    const gr = new THREE.Group();
    this.build(gr);
    return gr;
  }
  /** Merge everything into one geometry (single material models, for instancing) */
  toGeometry(): THREE.BufferGeometry {
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [];
    for (const b of this.buckets.values()) {
      pos.push(...b.pos); nor.push(...b.nor); uv.push(...b.uv); col.push(...b.col);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/* ------------------------------------------------------------------ */
/*  Instancer: reusable models (trees...) instanced per chunk          */
/* ------------------------------------------------------------------ */
interface Inst { x: number; y: number; z: number; ry: number; s: number; c: number }
export class Instancer {
  models = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material }>();
  data = new Map<string, Inst[]>();
  constructor(public chunk = 160, public range = 520) {}
  model(key: string, geo: THREE.BufferGeometry, mat: THREE.Material) {
    this.models.set(key, { geo, mat });
  }
  add(key: string, x: number, y: number, z: number, ry = 0, s = 1, color = 0xffffff) {
    const k = `${key}|${Math.floor(x / this.chunk)}|${Math.floor(z / this.chunk)}`;
    let a = this.data.get(k);
    if (!a) this.data.set(k, (a = []));
    a.push({ x, y, z, ry, s, c: color });
  }
  build(parent: THREE.Object3D) {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [k, arr] of this.data) {
      const [key, ix, iz] = k.split('|');
      const mod = this.models.get(key)!;
      const im = new THREE.InstancedMesh(mod.geo, mod.mat, arr.length);
      arr.forEach((it, i) => {
        q.setFromAxisAngle(up, it.ry);
        m4.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.s, it.s, it.s));
        im.setMatrixAt(i, m4);
        im.setColorAt(i, _c.set(it.c));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      parent.add(im);
      lodList.push({ mesh: im, cx: (+ix + 0.5) * this.chunk, cz: (+iz + 0.5) * this.chunk, range: this.range + this.chunk });
    }
    this.data.clear();
  }
}
