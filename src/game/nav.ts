import { RoadGraph, REdge, RNode } from './roads';

export interface Route { pts: { x: number; z: number }[]; length: number }

/** Turn-by-turn hint derived from the planned polyline only — no extra world state. */
export interface Guidance {
  dir: 'left' | 'right' | 'straight' | 'arrive';
  /** metres to the manoeuvre point, 0 when the destination is the next thing */
  dist: number;
  remain: number;
  etaMin: number;
}

/** Dijkstra route planner on the road graph (respects one-way roundabouts). */
export class Navigator {
  constructor(private g: RoadGraph) {}

  route(from: { x: number; z: number }, to: { x: number; z: number }): Route {
    const g = this.g;
    const a = g.nearest(from.x, from.z);
    const b = g.nearest(to.x, to.z);
    const N = g.nodes.length;
    const dist = new Array(N).fill(Infinity);
    const prev: ({ n: RNode | null; e: REdge | null; dir: number } | null)[] = new Array(N).fill(null);
    const done = new Array(N).fill(false);
    const seed = (n: RNode, d: number) => {
      if (d < dist[n.id]) { dist[n.id] = d; prev[n.id] = { n: null, e: a.e, dir: n === a.e.b ? 1 : -1 }; }
    };
    seed(a.e.b, a.e.len - a.s);
    if (!a.e.oneWay) seed(a.e.a, a.s);
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = true;
      const node = g.nodes[u];
      for (const e of node.edges) {
        let other: RNode | null = null, dir = 0;
        if (e.a === node && e.b !== node) { other = e.b; dir = 1; }
        else if (e.b === node && e.a !== node && !e.oneWay) { other = e.a; dir = -1; }
        if (!other) continue;
        const nd = dist[u] + e.len;
        if (nd < dist[other.id]) { dist[other.id] = nd; prev[other.id] = { n: node, e, dir }; }
      }
    }
    // finish: choose best end node
    let bestTotal = Infinity, endNode: RNode | null = null, endDir = 0;
    const cand = (n: RNode, extra: number, dir: number) => {
      if (dist[n.id] + extra < bestTotal) { bestTotal = dist[n.id] + extra; endNode = n; endDir = dir; }
    };
    cand(b.e.a, b.s, 1);
    if (!b.e.oneWay) cand(b.e.b, b.e.len - b.s, -1);
    // same edge shortcut
    let direct = Infinity;
    if (a.e === b.e && (!a.e.oneWay || b.s >= a.s)) direct = Math.abs(b.s - a.s);
    const pts: { x: number; z: number }[] = [{ x: from.x, z: from.z }];
    let length = 0;
    if (direct <= bestTotal) {
      pts.push(...g.part(a.e, a.s, b.s, 6));
      length = direct;
    } else if (endNode) {
      // reconstruct backwards
      const chain: { e: REdge; dir: number }[] = [];
      let n: RNode | null = endNode;
      while (n) {
        const p = prev[n.id];
        if (!p) break;
        chain.unshift({ e: p.e!, dir: p.dir });
        n = p.n;
      }
      // first element is the start edge partial
      chain.forEach((c, i) => {
        if (i === 0) {
          const endS = c.dir > 0 ? c.e.len : 0;
          pts.push(...g.part(c.e, a.s, endS, 6));
        } else pts.push(...g.part(c.e, c.dir > 0 ? 0 : c.e.len, c.dir > 0 ? c.e.len : 0, 6));
      });
      pts.push(...g.part(b.e, endDir > 0 ? 0 : b.e.len, b.s, 6));
      length = bestTotal;
    }
    pts.push({ x: to.x, z: to.z });
    // recompute accurate length from polyline
    length = 0;
    for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    return { pts, length };
  }

  /**
   * Walk the polyline forward from the vehicle, looking for the next meaningful heading
   * change. This is deliberately geometry-based: it works for every route the planner
   * can produce, including ones through the expansion, without a separate sign dataset.
   */
  static guidance(route: Route, x: number, z: number, avgKmh = 46, lookahead = 900): Guidance {
    const pts = route.pts;
    if (pts.length < 2) return { dir: 'arrive', dist: 0, remain: 0, etaMin: 0 };
    let best = Infinity, idx = 0, tAt = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const vx = q.x - p.x, vz = q.z - p.z;
      const l2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - p.x) * vx + (z - p.z) * vz) / l2));
      const d = Math.hypot(p.x + vx * t - x, p.z + vz * t - z);
      if (d < best) { best = d; idx = i; tAt = t; }
    }
    const seg = (i: number) => {
      const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)];
      return { vx: q.x - p.x, vz: q.z - p.z, len: Math.hypot(q.x - p.x, q.z - p.z) };
    };
    let remain = 0;
    for (let i = idx; i < pts.length - 1; i++) {
      const s = seg(i);
      remain += s.len * (i === idx ? 1 - tAt : 1);
    }
    const cur = seg(idx);
    const clen = Math.max(0.001, cur.len * (1 - tAt));
    const chx = cur.vx / Math.max(0.001, cur.len), chz = cur.vz / Math.max(0.001, cur.len);
    let walked = clen, turnDist = 0;
    for (let i = idx + 1; i < pts.length - 1; i++) {
      const s = seg(i);
      if (s.len < 0.2) { walked += s.len; turnDist += s.len; continue; }
      const hx = s.vx / s.len, hz = s.vz / s.len;
      const dot = Math.max(-1, Math.min(1, chx * hx + chz * hz));
      const ang = Math.acos(dot);
      if (ang > 0.42) {
        const cross = chx * hz - chz * hx;   // > 0 -> the path bends to the left
        return { dir: turnDist > 42 ? (cross > 0 ? 'left' : 'right') : 'straight', dist: Math.round(turnDist), remain: walked + remain - turnDist, etaMin: remain / 1000 / Math.max(6, avgKmh) * 60 };
      }
      turnDist += s.len;
      walked += s.len;
      if (turnDist > lookahead) break;
    }
    const arrive = remain < 90;
    return { dir: arrive ? 'arrive' : 'straight', dist: arrive ? 0 : Math.round(remain), remain, etaMin: remain / 1000 / Math.max(6, avgKmh) * 60 };
  }

  /** distance remaining along a route given the player's position */
  static remaining(route: Route, x: number, z: number) {
    let best = Infinity, idx = 0, tAt = 0;
    for (let i = 0; i < route.pts.length - 1; i++) {
      const p = route.pts[i], q = route.pts[i + 1];
      const vx = q.x - p.x, vz = q.z - p.z;
      const l2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - p.x) * vx + (z - p.z) * vz) / l2));
      const d = Math.hypot(p.x + vx * t - x, p.z + vz * t - z);
      if (d < best) { best = d; idx = i; tAt = t; }
    }
    let rem = 0;
    const p = route.pts[idx], q = route.pts[idx + 1];
    if (!p || !q) return 0;
    rem += Math.hypot(q.x - p.x, q.z - p.z) * (1 - tAt);
    for (let i = idx + 1; i < route.pts.length - 1; i++) rem += Math.hypot(route.pts[i + 1].x - route.pts[i].x, route.pts[i + 1].z - route.pts[i].z);
    return rem + best;
  }
}
