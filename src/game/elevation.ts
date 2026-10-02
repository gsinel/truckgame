import { CORE_BOUNDS, PROVINCES, EXPANSION_SITES } from './regions';

const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
export const riverCenter = (z: number) => 70 + 18 * Math.sin(z / 140);

/** Shared by terrain, roads and vehicle presentation. The tested depot remains level. */
export function groundHeight(x: number, z: number): number {
  const outside = Math.max(CORE_BOUNDS.x0 - x, x - CORE_BOUNDS.x1, CORE_BOUNDS.z0 - z, z - CORE_BOUNDS.z1, 0);
  if (outside === 0) return 0;
  const fade = smooth(outside / 470);
  const ridge = (cx: number, cz: number, width: number, h: number) => h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (width * width));
  let h = (16 + 7 * Math.sin(x / 450) * Math.cos(z / 500)
    + ridge(-1150, -420, 570, 55) + ridge(1080, -700, 480, 48)
    + ridge(1710, 1240, 560, 40) + ridge(-520, 1100, 570, 32)) * fade;
  h *= smooth((Math.abs(x - riverCenter(z)) - 35) / 260);
  for (const p of PROVINCES.slice(1)) {
    const blend = 1 - smooth((Math.hypot(x - p.x, z - p.z) - 220) / 280);
    h += (p.elevation - h) * blend;
  }
  // Phase 3B expansion sites share one elevation, so overlapping discs cannot create a step.
  for (const s of EXPANSION_SITES) {
    const blend = 1 - smooth((Math.hypot(x - s.x, z - s.z) - 220) / 280);
    h += (s.elevation - h) * blend;
  }
  return h;
}

export function roadPitch(x: number, z: number, heading: number, span = 5): number {
  const dx = Math.sin(heading) * span / 2, dz = Math.cos(heading) * span / 2;
  return -Math.atan2(groundHeight(x + dx, z + dz) - groundHeight(x - dx, z - dz), span);
}