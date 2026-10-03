import * as THREE from 'three';
import { Batcher } from './batch';
import { M, extra, labelMaterial } from './textures';
import { groundHeight } from './elevation';
import { buildRoadSurface, roadHalfWidth, sweepBarrier } from './roadSurface';

/* ------------------------------------------------------------------ */
/*  Road graph: nodes + edges (polylines). Used for rendering,         */
/*  AI traffic and navigation – one single source of truth.            */
/* ------------------------------------------------------------------ */
export type RoadType = 'town' | 'village' | 'rural' | 'highway' | 'industrial' | 'side' | 'ring';

export interface RoadSpec {
  w: number; lanes: number[]; limit: number; rank: number;
}
export const SPEC: Record<RoadType, RoadSpec> = {
  town: { w: 11, lanes: [1.75], limit: 12, rank: 3 },
  village: { w: 7, lanes: [1.75], limit: 10, rank: 2 },
  rural: { w: 7.4, lanes: [1.85], limit: 17, rank: 3 },
  highway: { w: 15, lanes: [1.75, 5.25], limit: 23, rank: 5 },
  industrial: { w: 10, lanes: [2.3], limit: 10, rank: 2 },
  side: { w: 8, lanes: [2], limit: 9, rank: 1 },
  ring: { w: 10, lanes: [0], limit: 8, rank: 4 },
};

export interface RNode {
  id: number; x: number; z: number; edges: REdge[]; R: number;
  light: boolean; ring: boolean; name?: string;
}
export interface REdge {
  id: number; a: RNode; b: RNode; pts: { x: number; z: number }[]; cum: number[]; len: number;
  type: RoadType; w: number; oneWay: boolean; bridge: boolean;
  /** Sampling distance of `pts` — renderers use it to scale their own segment length. */
  step?: number;
  key?: string; routeCode?: string; provinceIds?: string[];
}
export interface Pt { x: number; z: number; dx: number; dz: number }

export function approachGroup(dx: number, dz: number): 'A' | 'B' {
  return Math.abs(dx) > Math.abs(dz) ? 'A' : 'B';
}

function catmull(P: number[][], step = 1.2): { x: number; z: number }[] {
  if (P.length < 2) return P.map((p) => ({ x: p[0], z: p[1] }));
  if (P.length === 2) {
    const l = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]);
    const n = Math.max(1, Math.ceil(l / step));
    const out: { x: number; z: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      out.push({ x: P[0][0] + (P[1][0] - P[0][0]) * t, z: P[0][1] + (P[1][1] - P[0][1]) * t });
    }
    return out;
  }
  // Centripetal Catmull-Rom (alpha = 0.5) eliminates cusps and overshoot on curves
  const pts: number[][] = [];
  pts.push([2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]]);
  for (const p of P) pts.push([p[0], p[1]]);
  const last = P.length - 1;
  pts.push([2 * P[last][0] - P[last - 1][0], 2 * P[last][1] - P[last - 1][1]]);

  const out: { x: number; z: number }[] = [];
  const alpha = 0.5;
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2];
    const d01 = Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1e-4, alpha);
    const d12 = Math.pow(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1e-4, alpha);
    const d23 = Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]) || 1e-4, alpha);

    const t0 = 0;
    const t1 = t0 + d01;
    const t2 = t1 + d12;
    const t3 = t2 + d23;

    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(1, Math.ceil(segLen / step));
    for (let k = 0; k < n; k++) {
      const t = t1 + (t2 - t1) * (k / n);
      const a1x = ((t1 - t) * p0[0] + (t - t0) * p1[0]) / (t1 - t0);
      const a1z = ((t1 - t) * p0[1] + (t - t0) * p1[1]) / (t1 - t0);
      const a2x = ((t2 - t) * p1[0] + (t - t1) * p2[0]) / (t2 - t1);
      const a2z = ((t2 - t) * p1[1] + (t - t1) * p2[1]) / (t2 - t1);
      const a3x = ((t3 - t) * p2[0] + (t - t2) * p3[0]) / (t3 - t2);
      const a3z = ((t3 - t) * p2[1] + (t - t2) * p3[1]) / (t3 - t2);

      const b1x = ((t2 - t) * a1x + (t - t0) * a2x) / (t2 - t0);
      const b1z = ((t2 - t) * a1z + (t - t0) * a2z) / (t2 - t0);
      const b2x = ((t3 - t) * a2x + (t - t1) * a3x) / (t3 - t1);
      const b2z = ((t3 - t) * a2z + (t - t1) * a3z) / (t3 - t1);

      const cx = ((t2 - t) * b1x + (t - t1) * b2x) / (t2 - t1);
      const cz = ((t2 - t) * b1z + (t - t1) * b2z) / (t2 - t1);
      out.push({ x: cx, z: cz });
    }
  }
  const end = P[P.length - 1];
  out.push({ x: end[0], z: end[1] });
  return out;
}

export class RoadGraph {
  nodes: RNode[] = [];
  edges: REdge[] = [];
  /** Segment index: 40 m cells -> (edge, segment) pairs, so nearest() never scans the whole graph. */
  private seg = new Map<number, { e: REdge; i: number }[]>();
  private static SEG_CELL = 40;
  private static segKey(ix: number, iz: number) { return (ix + 8192) * 32768 + (iz + 8192); }
  private indexSegments() {
    this.seg.clear();
    for (const e of this.edges) {
      for (let i = 0; i < e.pts.length - 1; i++) {
        const p = e.pts[i], q = e.pts[i + 1];
        const x0 = Math.floor(Math.min(p.x, q.x) / RoadGraph.SEG_CELL), x1 = Math.floor(Math.max(p.x, q.x) / RoadGraph.SEG_CELL);
        const z0 = Math.floor(Math.min(p.z, q.z) / RoadGraph.SEG_CELL), z1 = Math.floor(Math.max(p.z, q.z) / RoadGraph.SEG_CELL);
        for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
          const k = RoadGraph.segKey(ix, iz);
          let a = this.seg.get(k);
          if (!a) this.seg.set(k, (a = []));
          a.push({ e, i });
        }
      }
    }
  }
  node(x: number, z: number, name?: string): RNode {
    const n: RNode = { id: this.nodes.length, x, z, edges: [], R: 0, light: false, ring: false, name };
    this.nodes.push(n);
    return n;
  }
  /**
   * `mids` are Catmull-Rom controls. `opts.step` is the sampling distance: the core
   * keeps the original 1.2 m (it is dense, hand-authored geometry), while the long
   * intercity corridors are sampled every few metres — chords stay far below a tyre
   * width on their curve radii, and the mesh stays a fraction of the size.
   */
  connect(a: RNode, b: RNode, type: RoadType, mids: number[][] = [],
    opts: { oneWay?: boolean; pts?: { x: number; z: number }[]; bridge?: boolean; step?: number } = {}) {
    const step = opts.step ?? 1.2;
    let pts = opts.pts;
    if (!pts) pts = mids.length ? catmull([[a.x, a.z], ...mids, [b.x, b.z]], step) : [{ x: a.x, z: a.z }, { x: b.x, z: b.z }];
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const e: REdge = {
      id: this.edges.length, a, b, pts, cum, len: cum[cum.length - 1], type, w: SPEC[type].w, step,
      oneWay: !!opts.oneWay || type === 'ring', bridge: !!opts.bridge,
    };
    this.edges.push(e);
    a.edges.push(e);
    b.edges.push(e);
    return e;
  }
  finalize() {
    this.indexSegments();
    for (const n of this.nodes) {
      if (n.edges.length >= 3) {
        let maxR = Math.max(...n.edges.map((e) => e.w / 2)) + 1.2;
        // Compute corner extent between any pair of intersecting edges to avoid gaps
        for (let i = 0; i < n.edges.length; i++) {
          for (let j = i + 1; j < n.edges.length; j++) {
            const e1 = n.edges[i], e2 = n.edges[j];
            const p1 = e1.a === n ? e1.pts[Math.min(1, e1.pts.length - 1)] : e1.pts[Math.max(0, e1.pts.length - 2)];
            const p2 = e2.a === n ? e2.pts[Math.min(1, e2.pts.length - 1)] : e2.pts[Math.max(0, e2.pts.length - 2)];
            const d1x = p1.x - n.x, d1z = p1.z - n.z;
            const d2x = p2.x - n.x, d2z = p2.z - n.z;
            const l1 = Math.hypot(d1x, d1z) || 1, l2 = Math.hypot(d2x, d2z) || 1;
            const cosA = (d1x * d2x + d1z * d2z) / (l1 * l2);
            const ang = Math.acos(Math.max(-1, Math.min(1, cosA)));
            if (ang > 0.12 && ang < Math.PI - 0.12) {
              const halfW = Math.max(e1.w, e2.w) / 2;
              const ext = halfW / Math.sin(Math.max(0.2, ang / 2)) + 0.6;
              if (ext > maxR && ext < 25) maxR = ext;
            }
          }
        }
        n.R = maxR;
      } else if (n.edges.length === 2) {
        const halfW = Math.max(n.edges[0].w, n.edges[1].w) / 2;
        n.R = halfW + 0.4;
      }
    }
  }
  sample(e: REdge, s: number, out: Pt = { x: 0, z: 0, dx: 0, dz: 1 }): Pt {
    s = Math.max(0, Math.min(e.len, s));
    const c = e.cum;
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (c[mid] <= s) lo = mid; else hi = mid;
    }
    const seg = c[hi] - c[lo] || 1;
    const t = (s - c[lo]) / seg;
    const p0 = e.pts[lo], p1 = e.pts[hi];
    out.x = p0.x + (p1.x - p0.x) * t;
    out.z = p0.z + (p1.z - p0.z) * t;
    const l = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1;
    out.dx = (p1.x - p0.x) / l;
    out.dz = (p1.z - p0.z) / l;
    return out;
  }
  /** smoothed station (position + right normal) at s */
  station(e: REdge, s: number) {
    const p = this.sample(e, s);
    const a = this.sample(e, s - 0.75), b = this.sample(e, s + 0.75);
    let dx = b.x - a.x, dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    return { x: p.x, z: p.z, dx, dz, rx: -dz, rz: dx };
  }
  /** Closest point on the network. Grid-accelerated: the corridor graph is far too large to scan. */
  nearest(x: number, z: number) {
    const cell = RoadGraph.SEG_CELL;
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    let best = { e: this.edges[0], s: 0, d: 1e9 };
    const test = (e: REdge, i: number) => {
      const p = e.pts[i], q = e.pts[i + 1];
      const vx = q.x - p.x, vz = q.z - p.z;
      const l2 = vx * vx + vz * vz || 1;
      let t = ((x - p.x) * vx + (z - p.z) * vz) / l2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(p.x + vx * t - x, p.z + vz * t - z);
      if (d < best.d) best = { e, s: e.cum[i] + t * Math.sqrt(l2), d };
    };
    for (let ring = 0; ring <= 12; ring++) {
      let found = false;
      for (let ix = cx - ring; ix <= cx + ring; ix++) for (let iz = cz - ring; iz <= cz + ring; iz++) {
        if (ring > 0 && Math.max(Math.abs(ix - cx), Math.abs(iz - cz)) !== ring) continue;
        const arr = this.seg.get(RoadGraph.segKey(ix, iz));
        if (!arr) continue;
        found = true;
        for (const s of arr) test(s.e, s.i);
      }
      // Anything outside the scanned ring is at least `ring * cell` away.
      if (found && best.d <= ring * cell) return best;
      if (ring === 12) break;
    }
    // Off-network query (scenery placement, recovery): prune by edge bounding box.
    for (const e of this.edges) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const p of e.pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z; }
      const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
      const dz = z < z0 ? z0 - z : z > z1 ? z - z1 : 0;
      if (Math.hypot(dx, dz) >= best.d) continue;
      for (let i = 0; i < e.pts.length - 1; i++) test(e, i);
    }
    return best;
  }
  part(e: REdge, s0: number, s1: number, step = 8) {
    const out: { x: number; z: number }[] = [];
    const n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / step));
    for (let i = 0; i <= n; i++) {
      const p = this.sample(e, s0 + ((s1 - s0) * i) / n);
      out.push({ x: p.x, z: p.z });
    }
    return out;
  }
}

/* ------------------------------------------------------------------ */
/*  Mesh builders                                                      */
/* ------------------------------------------------------------------ */
/* Vertical ground layer plan. Gaps are deliberately generous: with a 0.12 m near
 * plane a 24-bit depth buffer only resolves ~3 cm at 200 m, so coplanar layers
 * closer than that flicker in and out. The polygonOffset values in textures.ts
 * are distance-independent; these heights add physical margin. */
const Y_ROAD = 0.10, Y_MARK = 0.15, Y_WALK = 0.20, Y_SHOULDER = 0.06, Y_JUNC = 0.115;
const WHITE = 0xf0f0ea, YELLOW = 0xf2c418;

export interface RoadBuildResult {
  lamps: { x: number; y: number; z: number }[];
  signals: { x: number; z: number; node: RNode }[];
  routeSigns: string[];
}

export function buildRoads(g: RoadGraph, B: Batcher, D: Batcher, GL: Batcher): RoadBuildResult {
  const lamps: { x: number; y: number; z: number }[] = [];
  const signals: { x: number; z: number; node: RNode }[] = [];
  const routeSigns: string[] = [];
  const surfaceRanges = buildRoadSurface(g, B);

  const strip = (e: REdge, la: number, lb: number, y: number, s0: number, s1: number, mat: THREE.Material, color: number, tile = 4, step = 1.2) => {
    if (y === Y_MARK) {
      const range = surfaceRanges.get(e.id)!;
      s0 = Math.max(s0, range.start); s1 = Math.min(s1, range.end);
    }
    if (s1 - s0 < 0.05) return;
    // Follow the edge's own sampling: corridor polylines are metres apart, the core
    // grid is 1.2 m. Sampling markings below the source resolution only burns triangles.
    if (e.pts.length > 2) step = Math.min(step, Math.max(1.2, e.step ?? 1.2));
    const n = Math.max(1, Math.ceil((s1 - s0) / step));
    let prev = g.station(e, s0);
    for (let i = 1; i <= n; i++) {
      const sb = s0 + ((s1 - s0) * i) / n;
      const cu = g.station(e, sb);
      const sa = s0 + ((s1 - s0) * (i - 1)) / n;
      const va = roadHalfWidth(e, sa) / (e.w / 2), vb = roadHalfWidth(e, sb) / (e.w / 2);
      const points = [
        [prev.x + prev.rx * la * va, y, prev.z + prev.rz * la * va],
        [prev.x + prev.rx * lb * va, y, prev.z + prev.rz * lb * va],
        [cu.x + cu.rx * lb * vb, y, cu.z + cu.rz * lb * vb],
        [cu.x + cu.rx * la * vb, y, cu.z + cu.rz * la * vb],
      ];
      points.forEach(p => p[1] += groundHeight(p[0], p[2]));
      B.quad(mat, points,
        [[la / tile, sa / tile], [lb / tile, sa / tile], [lb / tile, sb / tile], [la / tile, sb / tile]],
        color,
      );
      prev = cu;
    }
  };
  const dashed = (e: REdge, lat: number, hw: number, s0: number, s1: number, dash: number, gap: number, color: number) => {
    for (let s = s0; s < s1; s += dash + gap) strip(e, lat - hw, lat + hw, Y_MARK, s, Math.min(s + dash, s1), M.markWhite, color, 4, 1.0);
  };
  const vface = (e: REdge, lat: number, y0: number, y1: number, s0: number, s1: number, toRoad: number, mat: THREE.Material, color: number) => {
    const n = Math.max(1, Math.ceil((s1 - s0) / 1.5));
    for (let i = 0; i < n; i++) {
      const a = g.station(e, s0 + ((s1 - s0) * i) / n), b = g.station(e, s0 + ((s1 - s0) * (i + 1)) / n);
      const A = [a.x + a.rx * lat, y0, a.z + a.rz * lat], Bp = [b.x + b.rx * lat, y0, b.z + b.rz * lat];
      const C = [Bp[0], y1, Bp[2]], Dd = [A[0], y1, A[2]];
      [A, Bp, C, Dd].forEach(p => p[1] += groundHeight(p[0], p[2]));
      const uv = [[0, 0], [1, 0], [1, 0.1], [0, 0.1]];
      // A,B,C faces +r ; flip when we need the face looking to -r
      const flip = toRoad > 0 ? false : true;
      B.tri(mat, [A, Bp, C], [uv[0], uv[1], uv[2]], color, flip);
      B.tri(mat, [A, C, Dd], [uv[0], uv[2], uv[3]], color, flip);
    }
  };

  /* ---------------- per edge ---------------- */
  for (const e of g.edges) {
    const hw = e.w / 2;
    const ta = e.a.edges.length >= 3 ? e.a.R + (e.a.light || e.a.ring ? 4.5 : 1.2) : 0.3;
    const tb = e.b.edges.length >= 3 ? e.b.R + (e.b.light || e.b.ring ? 4.5 : 1.2) : 0.3;
    const L = e.len;
    // Asphalt, shoulders and junctions are authored once in buildRoadSurface.

    /* Markings. The old `if (!e.bridge || true)` guard was dead code: a deck does keep
       its lane paint, it simply has no painted edge line — the kerb and parapet take
       over that job (built in terrain.ts, together with the deck colliders). */
    {
      const s0 = ta, s1 = L - tb;
      if (s1 > s0 + 1) {
        if (e.type === 'highway') {
          strip(e, -0.35, -0.2, Y_MARK, s0, s1, M.markWhite, WHITE, 4, 3);
          strip(e, 0.2, 0.35, Y_MARK, s0, s1, M.markWhite, WHITE, 4, 3);
          dashed(e, 3.5, 0.08, s0, s1, 3, 6, WHITE);
          dashed(e, -3.5, 0.08, s0, s1, 3, 6, WHITE);
          if (!e.bridge) {
            strip(e, hw - 0.5, hw - 0.35, Y_MARK, s0, s1, M.markWhite, WHITE, 4, 3);
            strip(e, -hw + 0.35, -hw + 0.5, Y_MARK, s0, s1, M.markWhite, WHITE, 4, 3);
          }
        } else if (e.type === 'town') {
          dashed(e, 0, 0.08, s0, s1, 3, 6, WHITE);
          strip(e, hw - 2.1, hw - 1.96, Y_MARK, s0, s1, M.markWhite, WHITE, 4, 3);
          strip(e, -hw + 1.96, -hw + 2.1, Y_MARK, s0, s1, M.markWhite, WHITE, 4, 3);
        } else if (e.type === 'rural') {
          dashed(e, 0, 0.08, s0, s1, 3, 9, WHITE);
          if (!e.bridge) {
            strip(e, hw - 0.4, hw - 0.27, Y_MARK, s0, s1, M.markWhite, WHITE, 4, 3);
            strip(e, -hw + 0.27, -hw + 0.4, Y_MARK, s0, s1, M.markWhite, WHITE, 4, 3);
          }
        } else if (e.type === 'village' || e.type === 'industrial') {
          dashed(e, 0, 0.08, s0, s1, 3, 6, WHITE);
        } else if (e.type === 'ring') {
          strip(e, hw - 0.4, hw - 0.27, Y_MARK, s0, s1, M.markWhite, WHITE, 4, 3);
          strip(e, -hw + 0.27, -hw + 0.4, Y_MARK, s0, s1, M.markWhite, WHITE, 4, 3);
        }
      }
      // zebra crossings & stop lines at signalised / roundabout nodes
      for (const [node, atEnd] of [[e.a, false], [e.b, true]] as [RNode, boolean][]) {
        if (node.edges.length < 3 || !(node.light || (node.ring && e.type !== 'ring'))) continue;
        const R = node.R;
        const zs0 = atEnd ? L - (R + 4) : R + 1.2;
        const zs1 = atEnd ? L - (R + 1.2) : R + 4;
        for (let k = -hw + 0.5; k < hw - 0.5; k += 1.0) strip(e, k, k + 0.5, Y_MARK, zs0, zs1, M.markWhite, WHITE, 4, 3);
        if (node.light) {
          const sl = atEnd ? L - (R + 6) : R + 6;
          if (atEnd) strip(e, 0.2, hw - 0.3, Y_MARK, sl - 0.2, sl + 0.2, M.markWhite, WHITE);
          else strip(e, -hw + 0.3, -0.2, Y_MARK, sl - 0.2, sl + 0.2, M.markWhite, WHITE);
        }
      }
    }

    /* Village streets: a single-side paving band. Village edges are narrower and the
       houses sit closer than in a town, so they get one flat walk (no kerb face, no
       collider) instead of the town's raised pair — that is what makes a village read
       differently from a town once you are outside the truck. */
    if (e.type === 'village') {
      const sa = g.sample(e, 1);
      const side = (e.id % 2) * 2 - 1;
      const cl = side * hw;
      const x0 = e.a.edges.length >= 3 ? e.a.R + 1 : 0, x1 = L - (e.b.edges.length >= 3 ? e.b.R + 1 : 0);
      if (x1 > x0 + 6) {
        strip(e, Math.min(cl, cl + side * 1.5), Math.max(cl, cl + side * 1.5), Y_WALK - 0.02, x0, x1, M.pavementRaised, 0xffffff, 4, 4);
        strip(e, Math.min(cl, cl + side * 0.14), Math.max(cl, cl + side * 0.14), Y_WALK, x0, x1, M.kerb, 0xd8d8d0, 2, 4);
        for (let s = x0 + 6; s < x1 - 4; s += 34) {
          const st = g.station(e, s);
          const px = st.x + st.rx * (side * (hw + 2.2)), pz = st.z + st.rz * (side * (hw + 2.2));
          D.box(0.12, 0.5, 0.12, M.metal, px, groundHeight(px, pz) + 0.25, pz, 0x9a9ea2, { tu: 1 });
        }
      }
    }
    /* sidewalks (town) */
    if (e.type === 'town') {
      const crossHalf = 5.5;
      const endTrim = (node: RNode, dirDx: number, dirDz: number) => {
        if (node.edges.length < 2) return 0;
        const horiz = Math.abs(dirDx) > Math.abs(dirDz);
        const base = Math.max(node.R, crossHalf) + 0.2;
        return horiz ? base : base + 3.2;
      };
      const sa = g.sample(e, 1), sb = g.sample(e, L - 1);
      const w0 = endTrim(e.a, sa.dx, sa.dz), w1 = endTrim(e.b, sb.dx, sb.dz);
      const x0 = w0, x1 = L - w1;
      if (x1 > x0 + 1) {
        for (const side of [1, -1]) {
          const cl = side * hw;
          strip(e, Math.min(cl, cl + side * 0.3), Math.max(cl, cl + side * 0.3), Y_WALK, x0, x1, M.kerb, 0xd8d8d0, 2, 4);
          const a1 = cl + side * 0.3, b1 = cl + side * 3.0;
          strip(e, Math.min(a1, b1), Math.max(a1, b1), Y_WALK, x0, x1, M.pavementRaised, 0xffffff, 4, 4);
          vface(e, cl, Y_ROAD, Y_WALK, x0, x1, side > 0 ? -1 : 1, M.kerb, 0xbdbdb5);
        }
      }
    }

    /* guard rails + median (highway) */
    if (e.type === 'highway') {
      const tA = e.a.edges.length >= 3 ? e.a.R + 28 : 2, tB = e.b.edges.length >= 3 ? e.b.R + 28 : 2;
      if (!e.bridge) {
        sweepBarrier(g, B, e, tA, L - tB, () => 0, 0.55, Y_ROAD, 0.85, M.concrete, 0xcfcfc8);
        sweepBarrier(g, B, e, tA, L - tB, () => 0, 0.3, Y_ROAD + 0.85, 0.3, M.concrete, 0xcfcfc8);
        for (const side of [-1, 1]) sweepBarrier(g, B, e, tA, L - tB, s => side * (roadHalfWidth(e, s) + 2.7), 0.07, 0.5, 0.32, M.metal, 0xb8bcc0);
        for (let s = tA; s < L - tB; s += 4) {
          const st = g.station(e, s + 2);
          const ry = Math.atan2(st.dx, st.dz);
          const sy = groundHeight(st.x, st.z);
          // median
          B.col!.addBox(st.x, st.z, 0.3, 2.0, ry, 'median');
          for (const side of [1, -1]) {
            const o = side * (roadHalfWidth(e, s + 2) + 2.7);
            const cx = st.x + st.rx * o, cz = st.z + st.rz * o;
            D.box(0.12, 0.8, 0.12, M.metal, cx + st.dx * -1.9, groundHeight(cx, cz), cz + st.dz * -1.9, 0x9a9ea2, { tu: 1 });
            B.col!.addBox(cx, cz, 0.15, 2.0, ry, 'rail');
          }
        }
      }
      // Central lamps light the city approaches; out on the open corridor they would
      // be fiction (and hundreds of poles), so only the ends of a long edge get them.
      if (!e.bridge) {
        const reach = L > 1400 ? 520 : L;
        for (let s = tA + 20; s < L - tB - 10; s += 64) {
          if (s > reach && s < L - reach) continue;
          const st = g.station(e, s);
          lamp(st.x, st.z, st.rx, st.rz, true);
        }
      }
    }
    /* street lamps */
    if (e.type === 'town' || e.type === 'industrial' || e.type === 'village') {
      const sp = e.type === 'town' ? 38 : e.type === 'industrial' ? 44 : 60;
      let k = 0;
      for (let s = 14 + (e.id % 3) * 4; s < L - 12; s += sp, k++) {
        const st = g.station(e, s);
        // skip close to junction centres
        const side = k % 2 ? 1 : -1;
        const off = (e.type === 'town' ? hw + 1.6 : hw + 1.2) * side;
        if (e.a.edges.length >= 3 && s < e.a.R + 8) continue;
        if (e.b.edges.length >= 3 && s > L - e.b.R - 8) continue;
        lamp(st.x + st.rx * off, st.z + st.rz * off, -st.rx * side, -st.rz * side, false);
      }
    }
    /* Deck transitions: limit signs live on the approach edges (a sign post cannot stand
       on the span), but the abutments get reflective bollards so the entry reads at night. */
    if (e.bridge && L > 24) {
      for (const [s0, dir] of [[ta + 1.6, 1], [L - tb - 1.6, -1]] as [number, number][]) {
        for (const side of [-1, 1]) {
          const st = g.station(e, s0);
          const off = side * (roadHalfWidth(e, s0) + 0.42);
          const x = st.x + st.rx * off, z = st.z + st.rz * off;
          const y = groundHeight(x, z);
          D.box(0.13, 0.72, 0.13, M.metal, x, y + 0.36, z, 0xd8d8d0, { tu: 1 });
          D.box(0.15, 0.2, 0.15, M.hazard, x, y + 0.62, z, 0xffffff);
          void dir;
        }
      }
    }
    /* speed limit signs */
    if (!e.bridge && (e.type === 'rural' || e.type === 'highway' || e.type === 'town')) {
      const mat = e.type === 'highway' ? M.sign90 : e.type === 'rural' ? M.sign70 : M.sign50;
      if (L > 60) {
        const sA = Math.min(L - 10, ta + 22), sB = Math.max(10, L - tb - 22);
        roadSign(e, sA, 1, mat);
        roadSign(e, sB, -1, mat);
      }
    }
    if (e.routeCode && !e.key?.includes('.street.')) {
      const range = surfaceRanges.get(e.id)!;
      for (const dir of [1, -1]) {
        const s = dir > 0 ? Math.min(range.end - 18, range.start + 48) : Math.max(range.start + 18, range.end - 48);
        routeMarker(e, s, dir);
      }
    }
  }

  /* ---------------- per node ---------------- */
  for (const n of g.nodes) {
    // priority signs + traffic lights
    if (n.edges.length >= 3) {
      const maxRank = Math.max(...n.edges.map((e) => SPEC[e.type].rank));
      for (const e of n.edges) {
        const atEnd = e.b === n;
        const rank = SPEC[e.type].rank;
        const s = atEnd ? e.len - (n.R + 3.5) : n.R + 3.5;
        if (e.len < n.R + 10) continue;
        const dir = atEnd ? 1 : -1; // direction of travel in edge frame
        if (n.light) {
          signal(e, s, dir, n);
        } else if (n.ring && e.type !== 'ring') {
          roadSign(e, s - dir * 6, dir, M.signRound);
        } else if (!n.ring && rank < maxRank && e.type !== 'ring') {
          roadSign(e, s, dir, rank <= 1 ? M.signYield : M.signStop);
        } else if (!n.ring && rank === maxRank && maxRank <= 3 && !n.light) {
          roadSign(e, s, dir, M.signPriority);
        }
      }
    }
  }

  /* ---------------- helpers ---------------- */
  function lamp(x: number, z: number, ax: number, az: number, median: boolean) {
    // (ax,az) = unit vector from pole towards the road (arm direction)
    const ry = Math.atan2(ax, az);
    const y = groundHeight(x, z);
    B.push(x, y, z, ry);
    D.push(x, y, z, ry);
    D.cyl(0.09, 0.13, 8.2, 8, M.metal, 0, 0, 0, 0x6e747a);
    D.cyl(0.2, 0.2, 0.3, 8, M.metal, 0, 0, 0, 0x555a60);
    if (median) {
      D.box(0.12, 0.12, 4.4, M.metal, 0, 8.1, 0, 0x6e747a, { c: true });
      for (const s of [-1, 1]) {
        B.box(0.4, 0.14, 0.9, M.metal, 0, 7.94, s * 2.2, 0x777c82);
        B.box(0.3, 0.06, 0.7, M.bulb, 0, 7.9, s * 2.2, 0xffffff);
      }
    } else {
      D.box(0.1, 0.1, 2.0, M.metal, 0, 8.05, 1.0, 0x6e747a);
      B.box(0.4, 0.14, 0.9, M.metal, 0, 7.98, 1.95, 0x777c82);
      B.box(0.3, 0.06, 0.7, M.bulb, 0, 7.94, 1.95, 0xffffff);
    }
    B.pop();
    D.pop();
    B.col!.addCircle(x, z, 0.3, 'pole');
    const heads = median ? [-2.2, 2.2] : [1.95];
    for (const wp of heads) {
      const lx = x + Math.sin(ry) * wp, lz = z + Math.cos(ry) * wp;
      lamps.push({ x: lx, y: y + 7.6, z: lz });
      GL.plane(15, 15, extra.glowMat, lx, groundHeight(lx, lz) + 0.16, lz, 0xffffff, { tu: 15 });
    }
  }
  function roadSign(e: REdge, s: number, dir: number, mat: THREE.Material) {
    const st = g.station(e, s);
    const side = dir > 0 ? 1 : -1; // right side of travel
    const off = side * (e.w / 2 + (e.type === 'highway' ? 3.4 : e.type === 'town' ? 1.2 : 1.6));
    const x = st.x + st.rx * off, z = st.z + st.rz * off;
    const ry = Math.atan2(-st.dx * dir, -st.dz * dir);
    D.push(x, groundHeight(x, z), z, ry);
    D.cyl(0.04, 0.04, 2.5, 6, M.metal, 0, 0, 0, 0x8a8e92);
    D.box(0.82, 0.82, 0.03, M.metal, 0, 2.0, -0.025, 0x7c8084);
    D.box(0.8, 0.8, 0.012, mat, 0, 2.01, 0.0, 0xffffff, { tu: 0.8, tv: 0.8 });
    D.pop();
    B.col!.addCircle(x, z, 0.12, 'sign');
  }
  /** Actual route-number plaques are placed from graph edge metadata, never from decorative text. */
  function routeMarker(e: REdge, s: number, dir: number) {
    const st = g.station(e, s), side = dir > 0 ? 1 : -1;
    const off = side * (e.w / 2 + (e.type === 'highway' ? 3.2 : 2.2));
    const x = st.x + st.rx * off, z = st.z + st.rz * off;
    const ry = Math.atan2(-st.dx * dir, -st.dz * dir);
    const codes = [...new Set((e.routeCode || '').split('/').map(v => v.trim()).filter(Boolean))];
    if (!codes.length) return;
    D.push(x, groundHeight(x, z), z, ry);
    D.cyl(0.055, 0.065, 3.45, 6, M.metal, 0, 0, 0, 0x8a8e92);
    const h = codes.length > 1 ? 0.48 : 0.7, total = codes.length * h + 0.16;
    D.box(1.28, total, 0.1, M.metal, 0, 2.55, 0, 0x283239);
    codes.forEach((code, i) => {
      routeSigns.push(code);
      const mat = code === 'D.100' ? M.signHwy : labelMaterial(code, 'route');
      D.box(1.18, h - 0.08, 0.018, mat, 0, 2.55 + ((codes.length - 1) / 2 - i) * h, 0.064, 0xffffff,
        { tu: 1.18, tv: h - 0.08 });
    });
    D.pop();
    B.col!.addCircle(x, z, 0.13, 'route-sign');
  }
  function signal(e: REdge, s: number, dir: number, node: RNode) {
    const st = g.station(e, s);
    const side = dir > 0 ? 1 : -1;
    const off = side * (e.w / 2 + 0.8);
    const x = st.x + st.rx * off, z = st.z + st.rz * off;
    const grp = approachGroup(st.dx, st.dz);
    const ry = Math.atan2(-st.dx * dir, -st.dz * dir);
    D.push(x, groundHeight(x, z), z, ry);
    D.cyl(0.07, 0.09, 4.3, 8, M.metal, 0, 0, 0, 0x3a3e42);
    D.box(0.34, 1.05, 0.3, M.metal, 0, 3.3, 0, 0x202225);
    D.box(0.3, 0.3, 0.02, M[`tl${grp}r`], 0, 4.0, 0.16, 0xffffff);
    D.box(0.3, 0.3, 0.02, M[`tl${grp}y`], 0, 3.65, 0.16, 0xffffff);
    D.box(0.3, 0.3, 0.02, M[`tl${grp}g`], 0, 3.3, 0.16, 0xffffff);
    D.box(0.46, 0.5, 0.03, M.metal, 0, 3.1, 0.0, 0x202225);
    D.pop();
    B.col!.addCircle(x, z, 0.2, 'pole');
    signals.push({ x, z, node });
  }

  return { lamps, signals, routeSigns: [...new Set(routeSigns)] };
}
