import * as THREE from 'three';
import type { RoadGraph, REdge } from './roads';
import type { Batcher } from './batch';
import { groundHeight } from './elevation';
import { M } from './textures';

type P = { x: number; z: number };
export interface RoadRange { start: number; end: number }

export function sweepBarrier(g: RoadGraph, batch: Batcher, e: REdge, s0: number, s1: number,
  offset: (s: number) => number, width: number, bottom: number, height: number, mat: THREE.Material, color: number) {
  if (s1 <= s0) return;
  const count = Math.max(1, Math.ceil((s1 - s0) / 3));
  const section = (s: number) => {
    const p = g.station(e, s), lateral = offset(s);
    const x = p.x + p.rx * lateral, z = p.z + p.rz * lateral, y = groundHeight(x, z) + bottom;
    return [[x - p.rx * width / 2, y, z - p.rz * width / 2], [x + p.rx * width / 2, y, z + p.rz * width / 2]];
  };
  const top = (p: number[]) => [p[0], p[1] + height, p[2]];
  const uv = [[0, 0], [1.5, 0], [1.5, height], [0, height]];
  let a = section(s0);
  batch.quad(mat, [a[0], a[1], top(a[1]), top(a[0])], uv, color);
  for (let i = 1; i <= count; i++) {
    const b = section(s0 + (s1 - s0) * i / count);
    batch.quad(mat, [top(a[0]), top(a[1]), top(b[1]), top(b[0])], uv, color);
    batch.quad(mat, [a[0], top(a[0]), top(b[0]), b[0]], uv, color);
    batch.quad(mat, [a[1], b[1], top(b[1]), top(a[1])], uv, color);
    a = b;
  }
  batch.quad(mat, [a[1], a[0], top(a[0]), top(a[1])], uv, color);
}

export function roadHalfWidth(e: REdge, s: number): number {
  const base = e.w / 2;
  const shared = (n: REdge['a']) => n.edges.length === 2 ? Math.max(...n.edges.map(r => r.w)) / 2 : base;
  const ease = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
  const taper = Math.min(32, e.len / 3);
  return base + (shared(e.a) - base) * (1 - ease(s / taper))
    + (shared(e.b) - base) * (1 - ease((e.len - s) / taper));
}

/** Road mouths and their junction use the very same vertices, not overlapping discs. */
export function buildRoadSurface(g: RoadGraph, batch: Batcher): Map<number, RoadRange> {
  const ranges = new Map<number, RoadRange>();
  // A two-edge fillet is only about half-width radius; cutting it back by
  // intersection margins would leave an asphalt gap at bridge approaches H2/SB0.
  const cut = (e: REdge, n: REdge['a']) => n.edges.length < 2 ? 0 : Math.min(e.len * 0.28,
    n.edges.length === 2 ? Math.max(n.R, e.w / 2 + 0.4) : Math.max(n.R + 2, e.w));
  const at = (e: REdge, s: number, side: number): P => {
    const p = g.station(e, s);
    return { x: p.x + p.rx * side, z: p.z + p.rz * side };
  };
  const vertex = (p: P, y: number) => [p.x, groundHeight(p.x, p.z) + y, p.z];
  const uv = (p: P) => [p.x / 4, p.z / 4];
  const triangle = (a: P, b: P, c: P, y: number, mat: THREE.Material, color = 0xffffff) => {
    const area = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    if (Math.abs(area) < 1e-8) return;
    batch.tri(mat, [vertex(a, y), vertex(b, y), vertex(c, y)], [uv(a), uv(b), uv(c)], color, area > 0);
  };
  const quad = (p: P[], y: number, mat: THREE.Material, color = 0xffffff) => {
    triangle(p[0], p[1], p[2], y, mat, color); triangle(p[0], p[2], p[3], y, mat, color);
  };
  for (const e of g.edges) {
    const start = cut(e, e.a), end = e.len - cut(e, e.b);
    ranges.set(e.id, { start, end });
    // Two source samples per quad: the core keeps its 2.5 m quads, the corridors get
    // quads that match their own polyline resolution instead of 1.25 m slivers.
    const quadLen = Math.max(1.25, Math.min(9, (e.step ?? 1.2) * 2));
    const count = Math.max(1, Math.ceil((end - start) / quadLen));
    for (let i = 0; i < count; i++) {
      const sa = start + (end - start) * i / count, sb = start + (end - start) * (i + 1) / count;
      const wa = roadHalfWidth(e, sa), wb = roadHalfWidth(e, sb);
      const p = [at(e, sa, -wa), at(e, sa, wa), at(e, sb, wb), at(e, sb, -wb)];
      quad(p, 0.10, M.asphalt);
      const shoulder = e.bridge ? 0 : e.type === 'highway' ? 2.5 : e.type === 'town' ? 0 : 0.9;
      for (const side of [-1, 1]) {
        const a = at(e, sa, side * wa), b = at(e, sb, side * wb);
        if (shoulder) quad([a, at(e, sa, side * (wa + shoulder)), at(e, sb, side * (wb + shoulder)), b], 0.05,
          e.type === 'highway' ? M.asphaltLight : M.gravel, 0xe0d8c8);
        const edge = [vertex(a, 0.10), vertex(b, 0.10), vertex(b, 0.015), vertex(a, 0.015)];
        if (side < 0) edge.reverse();
        batch.quad(M.asphalt, edge, [[0, 0], [1, 0], [1, 0.08], [0, 0.08]]);
      }
    }
  }

  for (const node of g.nodes) {
    if (node.edges.length < 2) continue;
    const arms = node.edges.map(e => {
      const outward = e.a === node ? 1 : -1;
      const range = ranges.get(e.id)!;
      const s = outward > 0 ? range.start : range.end;
      const p = g.station(e, s), w = roadHalfWidth(e, s);
      const dx = p.dx * outward, dz = p.dz * outward;
      return { dx, dz, angle: Math.atan2(dz, dx),
        first: { x: p.x + dz * w, z: p.z - dx * w },
        last: { x: p.x - dz * w, z: p.z + dx * w } };
    }).sort((a, b) => a.angle - b.angle);
    const boundary: P[] = [];
    for (let i = 0; i < arms.length; i++) {
      const a = arms[i], b = arms[(i + 1) % arms.length];
      boundary.push(a.first, a.last);
      const den = a.dx * b.dz - a.dz * b.dx;
      if (Math.abs(den) < 0.05) continue;
      const t = ((b.first.x - a.last.x) * b.dz - (b.first.z - a.last.z) * b.dx) / den;
      const control = { x: a.last.x + a.dx * t, z: a.last.z + a.dz * t };
      if (Math.hypot(control.x - node.x, control.z - node.z) > node.R * 2 + 5) continue;
      for (let k = 1; k < 8; k++) {
        const u = k / 8, v = 1 - u;
        boundary.push({ x: v * v * a.last.x + 2 * v * u * control.x + u * u * b.first.x,
          z: v * v * a.last.z + 2 * v * u * control.z + u * u * b.first.z });
      }
    }
    const contour = boundary.map(p => new THREE.Vector2(p.x, p.z));
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
      triangle(boundary[a], boundary[b], boundary[c], 0.10, M.asphalt);
    }
  }
  return ranges;
}