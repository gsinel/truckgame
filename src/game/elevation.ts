import { CORE_BOUNDS, PROVINCES, EXPANSION_SITES } from './regions';
import type { RoadGraph, REdge } from './roads';

const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
export const riverCenter = (z: number) => 70 + 18 * Math.sin(z / 140);

/** Mountain chains: lines of gaussian ridges that frame the corridors. */
const CHAINS: { x0: number; z0: number; x1: number; z1: number; h: number; w: number }[] = [
  // Canik range between the Yeşilırmak valley and the Black Sea coast.
  { x0: 1150, z0: -2200, x1: 2750, z1: -4400, h: 135, w: 520 },
  { x0: 2950, z0: -5200, x1: 3900, z1: -6900, h: 110, w: 500 },
  // Akdağ / Gökdere highlands east of Amasya.
  { x0: 5200, z0: 2600, x1: 7000, z1: 3900, h: 120, w: 520 },
  { x0: 7600, z0: 4600, x1: 9800, z1: 6400, h: 140, w: 560 },
  // Yıldızeli plateau ridges on the Sivas run.
  { x0: 10800, z0: 8400, x1: 12400, z1: 10200, h: 130, w: 540 },
  // Bozok hills between Çorum and Yozgat.
  { x0: -7200, z0: 3600, x1: -8200, z1: 6400, h: 105, w: 520 },
  // Northern hills above the Çorum road.
  { x0: -5400, z0: -1400, x1: -8600, z1: -300, h: 120, w: 560 },
  // Southern Yozgat–Sivas plateau rim.
  { x0: -6000, z0: 12600, x1: -1500, z1: 12200, h: 115, w: 560 },
  { x0: 3200, z0: 12400, x1: 8600, z1: 12700, h: 120, w: 560 },
];

function chainHeight(x: number, z: number): number {
  let h = 0;
  for (const c of CHAINS) {
    const dx = c.x1 - c.x0, dz = c.z1 - c.z0;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((x - c.x0) * dx + (z - c.z0) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = c.x0 + dx * t, pz = c.z0 + dz * t;
    const d2 = (x - px) ** 2 + (z - pz) ** 2;
    h += c.h * Math.exp(-d2 / (c.w * c.w));
  }
  return h;
}

/** Terrain before the road corridors are carved into it. */
export function baseHeight(x: number, z: number): number {
  const outside = Math.max(CORE_BOUNDS.x0 - x, x - CORE_BOUNDS.x1, CORE_BOUNDS.z0 - z, z - CORE_BOUNDS.z1, 0);
  if (outside === 0) return 0;
  const fade = smooth(outside / 420);
  let h = 22 + 11 * Math.sin(x / 900) * Math.cos(z / 1050) + 6 * Math.sin(x / 260 + z / 310)
    + chainHeight(x, z);
  h *= smooth((Math.abs(x - riverCenter(z)) - 40) / 280);
  h *= fade;
  for (const p of PROVINCES.slice(1)) {
    const de = p.elevation - h;
    const w = 300 + Math.abs(de) * 9;
    const blend = 1 - smooth((Math.hypot(x - p.x, z - p.z) - 280) / w);
    h += de * blend;
  }
  // Phase 3B expansion sites share one elevation, so overlapping discs cannot create a step.
  for (const s of EXPANSION_SITES) {
    const de = s.elevation - h;
    const w = 300 + Math.abs(de) * 9;
    const blend = 1 - smooth((Math.hypot(x - s.x, z - s.z) - 280) / w);
    h += de * blend;
  }
  return h;
}

/* ------------------------------------------------------------------ */
/*  Road corridor profile                                              */
/*                                                                     */
/*  Long corridors are carved into the terrain: the ground near a road */
/*  is blended towards a height that has been smoothed ALONG that road */
/*  (a ±600 m moving average) with a hard cap on cut depth. That is    */
/*  what gives a designed, drivable gradient instead of whatever the   */
/*  procedural ridges happened to do, and it keeps the rendered road   */
/*  surface and the terrain mesh within a few centimetres of each other */
/*  because both read the same function.                               */
/* ------------------------------------------------------------------ */
const CELL = 64;
const SAMPLE = 22;
/** Half-width of the smoothing window along the road (metres). */
const PROFILE_WINDOW = 620;
/** Largest cut / fill the corridor may impose on the terrain (metres). */
const PROFILE_CAP = 60;
/**
 * A road never exceeds this gradient once the profile is graded. Real Anatolian
 * D-roads sit around 6-9 %, and a heavy truck has to be able to hold its gear on
 * every one of them, so the profile is passed through a forward/backward grade
 * limiter after smoothing: the pass becomes a cutting, the valley a fill.
 */
const MAX_GRADE = 0.082;
/**
 * The carve fades out between 40 m and 420 m from the road centre line: wide enough
 * that the variable-resolution terrain grid (45–130 m out of the valley) resolves it
 * instead of poking through the asphalt, and capped so a corridor can never turn
 * into a canyon.
 */
const CARVE_IN = 40, CARVE_OUT = 420;

let profileGrid: Map<number, { x: number; z: number; y: number }[]> | null = null;
const key = (ix: number, iz: number) => (ix + 4096) * 16384 + (iz + 4096);

/** Distance outside the hand-authored core rect (0 inside). */
const outsideCore = (x: number, z: number) =>
  Math.max(CORE_BOUNDS.x0 - x, x - CORE_BOUNDS.x1, CORE_BOUNDS.z0 - z, z - CORE_BOUNDS.z1, 0);
const inCore = (x: number, z: number) => outsideCore(x, z) === 0;

interface ProfileRow { a: number; b: number; pts: { x: number; z: number }[]; y: number[] }

export function initRoadProfile(g: RoadGraph) {
  const grid = new Map<number, { x: number; z: number; y: number }[]>();
  const rows: ProfileRow[] = [];
  for (const e of g.edges) {
    // Only the long open-road corridors need a designed profile; town grids sit on
    // flat city discs and junctions are handled by the blend itself.
    if (e.len < 420 || (e.type !== 'rural' && e.type !== 'highway' && e.type !== 'village')) continue;
    const n = Math.max(2, Math.ceil(e.len / SAMPLE));
    const pts: { x: number; z: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const p = g.sample(e, (e.len * i) / n);
      pts.push({ x: p.x, z: p.z });
    }
    rows.push({ a: e.a.id, b: e.b.id, pts, y: [] });
  }
  const span = Math.max(1, Math.round(PROFILE_WINDOW / SAMPLE));
  const maxStep = SAMPLE * MAX_GRADE;
  for (const row of rows) {
    const pts = row.pts;
    // The hand-authored core is a level plane: its roads must not be graded away.
    const raw = pts.map(p => (inCore(p.x, p.z) ? 0 : baseHeight(p.x, p.z)));
    const pre = [0];
    for (let i = 0; i < raw.length; i++) pre.push(pre[i] + raw[i]);
    const avg = (i: number) => {
      const a = Math.max(0, i - span), b = Math.min(raw.length - 1, i + span);
      return (pre[b + 1] - pre[a]) / (b - a + 1);
    };
    const y = raw.map((base, i) => base + Math.max(-PROFILE_CAP, Math.min(PROFILE_CAP, avg(i) - base)));
    // grade limiter: two forward and two backward sweeps pin every sample inside
    // +-maxStep of its neighbours, so the finished profile is a drivable road.
    for (const dir of [1, -1, 1, -1]) {
      if (dir > 0) for (let i = 1; i < y.length; i++) y[i] = Math.max(y[i - 1] - maxStep, Math.min(y[i - 1] + maxStep, y[i]));
      else for (let i = y.length - 2; i >= 0; i--) y[i] = Math.max(y[i + 1] - maxStep, Math.min(y[i + 1] + maxStep, y[i]));
    }
    // keep the core level, then let the constraint relax outwards
    let clamped = false;
    for (let i = 0; i < pts.length; i++) if (inCore(pts[i].x, pts[i].z) && y[i] !== 0) { y[i] = 0; clamped = true; }
    if (clamped) for (const dir of [1, -1]) {
      if (dir > 0) for (let i = 1; i < y.length; i++) y[i] = Math.max(y[i - 1] - maxStep, Math.min(y[i - 1] + maxStep, y[i]));
      else for (let i = y.length - 2; i >= 0; i--) y[i] = Math.max(y[i + 1] - maxStep, Math.min(y[i + 1] + maxStep, y[i]));
    }
    row.y = y;
  }
  // Roads that meet at a node must agree there, or the blended surface steps at the
  // junction. Average every road's node height, pin the endpoints, re-limit inside.
  const nodeY = new Map<number, number[]>();
  const addNode = (id: number, y: number) => {
    const arr = nodeY.get(id);
    if (arr) arr.push(y); else nodeY.set(id, [y]);
  };
  for (const row of rows) { addNode(row.a, row.y[0]); addNode(row.b, row.y[row.y.length - 1]); }
  const mean = (id: number) => {
    const arr = nodeY.get(id)!;
    let sum = 0;
    for (const v of arr) sum += v;
    return sum / arr.length;
  };
  for (const row of rows) {
    const y = row.y, last = y.length - 1;
    y[0] = mean(row.a);
    y[last] = mean(row.b);
    for (const dir of [1, -1, 1, -1]) {
      if (dir > 0) for (let i = 1; i < last; i++) y[i] = Math.max(y[i - 1] - maxStep, Math.min(y[i - 1] + maxStep, y[i]));
      else for (let i = last - 1; i > 0; i--) y[i] = Math.max(y[i + 1] - maxStep, Math.min(y[i + 1] + maxStep, y[i]));
    }
    for (let i = 0; i <= last; i++) {
      const p = row.pts[i];
      const k = key(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
      let arr = grid.get(k);
      if (!arr) grid.set(k, (arr = []));
      arr.push({ x: p.x, z: p.z, y: y[i] });
    }
  }
  profileGrid = grid;
}

interface ProfileSample { y: number; d: number }
/** Designed corridor height near (x,z), or null when the point is far from any corridor. */
export function profileNear(x: number, z: number): ProfileSample | null {
  if (!profileGrid) return null;
  const ix = Math.floor(x / CELL), iz = Math.floor(z / CELL);
  let sum = 0, wsum = 0, best = Infinity;
  const reach = Math.ceil(CARVE_OUT / CELL) + 1;
  for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) {
    const arr = profileGrid.get(key(ix + dx, iz + dz));
    if (!arr) continue;
    for (const s of arr) {
      const d2 = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d2 > CARVE_OUT * CARVE_OUT) continue;
      const d = Math.sqrt(d2);
      if (d < best) best = d;
      const w = 1 / (d2 + 1);
      sum += s.y * w; wsum += w;
    }
  }
  if (!wsum || !Number.isFinite(best) || best > CARVE_OUT) return null;
  return { y: sum / wsum, d: best };
}

/** Shared by terrain, roads and vehicle presentation. The hand-authored depot stays level. */
export function groundHeight(x: number, z: number): number {
  const base = baseHeight(x, z);
  const near = profileNear(x, z);
  if (!near) return base;
  // Inside the authored core the profile is pinned level (see initRoadProfile), so the
  // carve blends the corridor into the valley without touching the hand-built plane.
  const w = 1 - smooth((near.d - CARVE_IN) / (CARVE_OUT - CARVE_IN));
  const target = near.y;
  const delta = Math.max(-PROFILE_CAP, Math.min(PROFILE_CAP, target - base));
  return base + delta * w;
}

export function roadPitch(x: number, z: number, heading: number, span = 5): number {
  const dx = Math.sin(heading) * span / 2, dz = Math.cos(heading) * span / 2;
  return -Math.atan2(groundHeight(x + dx, z + dz) - groundHeight(x - dx, z - dz), span);
}

export type { REdge };
