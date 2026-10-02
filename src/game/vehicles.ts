import * as THREE from 'three';
import { Batcher } from './batch';
import { M, labelMaterial } from './textures';
import { tr } from './i18n';

export type VehicleKind = 'car' | 'van' | 'truck' | 'minibus' | 'bus';
export type CarStyle = 'hatch' | 'sedan' | 'suv' | 'wagon';

export function wheelInto(b: Batcher, x: number, y: number, z: number, r: number, w: number, rimColor = 0xb8bcc2) {
  const side = Math.sign(x) || 1;
  // cylinder rotated about z: spans from x to x - w (for +) ; shift so it is centred at x
  b.cyl(r, r, w, 14, M.rubber, x + w / 2, y, z, 0x202022, { rz: Math.PI / 2 });
  b.cyl(r * 0.55, r * 0.55, w + 0.03, 10, M.metal, x + (w + 0.03) / 2 + side * 0.004, y, z, rimColor, { rz: Math.PI / 2 });
}

export const CAR_COLORS = [0xc0392b, 0x2c5aa0, 0xe8e8e4, 0x1e1e22, 0x6e7a82, 0xd9a21b, 0x2e7d4f, 0x8e3b8f, 0xb8b8b4, 0xe06a1c];

export function carInto(b: Batcher, color: number, style: CarStyle = 'hatch') {
  const len = style === 'sedan' ? 4.6 : style === 'suv' ? 4.5 : style === 'wagon' ? 4.7 : 4.0;
  const hh = style === 'suv' ? 0.78 : 0.62;
  const cabH = style === 'suv' ? 0.68 : 0.55;
  const cabL = style === 'sedan' ? 2.0 : style === 'hatch' ? 2.0 : 2.5;
  const cabZ = style === 'sedan' ? -0.1 : -0.35;
  const f = len / 2;
  b.box(1.78, hh, len, M.paint, 0, 0.3, 0, color);
  b.box(1.64, cabH, cabL, M.glass, 0, 0.3 + hh, cabZ, 0x2e4358);
  b.box(1.6, 0.06, cabL - 0.25, M.paint, 0, 0.3 + hh + cabH, cabZ, color);
  // hood / trunk decks
  b.box(1.7, 0.05, 1.1, M.paint, 0, 0.3 + hh, f - 0.75, color);
  b.box(1.5, 0.35, 0.05, M.paint, 0, 0.3 + hh + 0.02, f - 1.28, color, { rx: -0.5 });
  // bumpers / lower trim
  b.box(1.82, 0.22, 0.14, M.rubber, 0, 0.18, f, 0x2a2a2c);
  b.box(1.82, 0.22, 0.14, M.rubber, 0, 0.18, -f, 0x2a2a2c);
  b.box(1.8, 0.1, len - 0.3, M.rubber, 0, 0.22, 0, 0x28282a);
  // lights
  for (const s of [-1, 1]) {
    b.box(0.4, 0.14, 0.07, M.carHead, s * 0.62, 0.62, f + 0.005, 0xffffff);
    b.box(0.4, 0.13, 0.07, M.carTail, s * 0.62, 0.66, -f - 0.005, 0xffffff);
    b.box(0.14, 0.2, 0.2, M.paint, s * 1.0, 0.3 + hh + 0.05, f - 1.3, 0x222222);
  }
  b.box(0.9, 0.16, 0.04, M.rubber, 0, 0.48, f + 0.01, 0x18181a);
  b.box(0.5, 0.12, 0.03, M.flat, 0, 0.36, f + 0.04, 0xf0f0e0);
  b.box(0.5, 0.12, 0.03, M.flat, 0, 0.5, -f - 0.04, 0xf0f0e0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheelInto(b, sx * 0.88, 0.33, sz * (f - 0.82), 0.33, 0.24);
}

export function vanInto(b: Batcher, color: number) {
  // sill is narrower than the body shell, otherwise both side faces land on x=±1.0
  b.box(1.96, 0.5, 5.4, M.rubber, 0, 0.3, 0, 0x2c2c30);
  b.box(2.0, 1.75, 3.5, M.paint, 0, 0.6, -0.95, color);
  b.box(1.95, 0.8, 1.2, M.paint, 0, 0.6, 1.4, color);
  b.box(1.9, 0.82, 1.3, M.glass, 0, 1.4, 1.0, 0x2e4358);
  b.box(1.94, 0.06, 1.2, M.paint, 0, 2.22, 1.0, color);
  for (const s of [-1, 1]) {
    b.box(0.4, 0.16, 0.07, M.carHead, s * 0.7, 0.85, 2.0, 0xffffff);
    b.box(0.3, 0.3, 0.07, M.carTail, s * 0.8, 0.9, -2.7, 0xffffff);
    b.box(0.16, 0.34, 0.2, M.paint, s * 1.08, 1.5, 1.7, 0x222222);
  }
  b.box(2.04, 0.2, 0.14, M.rubber, 0, 0.35, 2.05, 0x2a2a2c);
  b.box(2.04, 0.2, 0.14, M.rubber, 0, 0.35, -2.72, 0x2a2a2c);
  b.box(0.04, 1.2, 2.6, M.flat, 1.0, 0.9, -0.95, 0xe8e8e8);
  for (const sx of [-1, 1]) for (const sz of [-1.6, 1.5]) wheelInto(b, sx * 0.98, 0.38, sz, 0.38, 0.26);
}

export function lorryInto(b: Batcher, cabColor: number, boxColor: number) {
  b.box(2.3, 0.4, 9.0, M.rubber, 0, 0.6, 0, 0x232326);
  // cab
  b.box(2.4, 1.1, 2.0, M.paint, 0, 1.0, 3.5, cabColor);
  b.box(2.36, 0.85, 1.7, M.glass, 0, 2.1, 3.55, 0x2e4358);
  b.box(2.4, 0.08, 2.0, M.paint, 0, 2.95, 3.5, cabColor);
  b.box(2.2, 0.5, 0.1, M.rubber, 0, 0.9, 4.53, 0x1a1a1c);
  for (const s of [-1, 1]) {
    b.box(0.5, 0.2, 0.08, M.carHead, s * 0.85, 1.35, 4.52, 0xffffff);
    b.box(0.2, 0.3, 0.1, M.carTail, s * 1.15, 0.9, -4.52, 0xffffff);
    b.box(0.14, 0.4, 0.2, M.paint, s * 1.3, 2.4, 4.0, 0x222222);
  }
  b.box(2.5, 2.7, 6.1, M.paint, 0, 1.05, -1.1, boxColor);
  b.box(2.52, 0.12, 6.1, M.flat, 0, 2.2, -1.1, 0x1c3f7a);
  b.box(2.5, 0.2, 0.1, M.rubber, 0, 0.7, -4.55, 0x1a1a1c);
  for (const sx of [-1, 1]) {
    wheelInto(b, sx * 1.0, 0.5, 3.4, 0.5, 0.3);
    wheelInto(b, sx * 1.0, 0.5, -2.4, 0.5, 0.3);
    wheelInto(b, sx * 1.0, 0.5, -3.6, 0.5, 0.3);
  }
}

export function busInto(b: Batcher, color = 0x23667b) {
  b.box(2.5, 1.35, 10.5, M.paint, 0, 0.5, 0, color);
  b.box(2.42, 1.18, 9.9, M.glass, 0, 1.85, 0, 0x526c7a);
  b.box(2.5, 0.15, 10.5, M.paint, 0, 3.03, 0, 0xebe9db);
  b.box(2.52, 0.10, 10.5, M.flat, 0, 1.57, 0, 0xf1d78f);
  for (const s of [-1, 1]) for (let i = 0; i < 8; i++) b.box(0.055, 1.16, 0.10, M.paint, s * 1.23, 1.87, -4.6 + i * 1.3, 0xe3e3d9);
  for (const s of [-1, 1]) {
    b.box(0.38, 0.18, 0.05, M.carHead, s * 0.87, 0.9, 5.27, 0xffffff);
    b.box(0.28, 0.3, 0.05, M.carTail, s * 1.02, 0.92, -5.27, 0xffffff);
    b.box(0.18, 0.45, 0.22, M.paint, s * 1.40, 2.45, 4.95, 0x323538);
    wheelInto(b, s * 1.10, 0.5, 3.3, 0.5, 0.32);
    wheelInto(b, s * 1.10, 0.5, -3.2, 0.5, 0.32);
  }
  b.box(1.8, 0.33, 0.03, labelMaterial(tr.busDestination, 'local'), 0, 2.64, 5.28, 0xffffff, { tu: 1.8, tv: 0.33 });
  b.box(1.1, 0.25, 2.5, M.metal, 0, 3.18, -1.5, 0xb5b9b6);
}

export function minibusInto(b: Batcher, color: number) {
  vanInto(b, color);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    b.box(0.026, 0.64, 0.79, M.glass, s * 1.03, 1.46, -2.14 + i * 0.88, 0x466078);
  }
  b.box(1.3, 0.25, 0.03, labelMaterial(tr.minibus, 'local'), 0, 2.00, 1.67, 0xffffff, { tu: 1.3, tv: 0.25 });
  b.box(2.04, 0.1, 5.35, M.paint, 0, 1.14, 0, 0xe2b433);
}

export function tractorInto(b: Batcher, color = 0x2f8a3a) {
  b.box(1.1, 1.0, 2.8, M.paint, 0, 0.7, 0.8, color);
  b.box(1.5, 0.15, 1.5, M.metal, 0, 1.95, -0.7, 0x333333);
  b.box(0.08, 1.4, 0.08, M.metal, -0.7, 1.7, -1.4, 0x333333);
  b.box(0.08, 1.4, 0.08, M.metal, 0.7, 1.7, -1.4, 0x333333);
  b.box(0.08, 1.4, 0.08, M.metal, -0.7, 1.7, 0.1, 0x333333);
  b.box(0.08, 1.4, 0.08, M.metal, 0.7, 1.7, 0.1, 0x333333);
  b.box(1.5, 1.2, 1.5, M.glass, 0, 0.9, -0.7, 0x38586a);
  b.box(0.35, 0.8, 0.35, M.metal, 0.3, 1.7, 1.9, 0x222222);
  b.box(0.3, 0.2, 0.05, M.carHead, 0.4, 1.0, 2.2, 0xffffff);
  b.box(0.3, 0.2, 0.05, M.carHead, -0.4, 1.0, 2.2, 0xffffff);
  for (const s of [-1, 1]) {
    wheelInto(b, s * 1.05, 0.9, -1.0, 0.9, 0.5, 0xd8a020);
    wheelInto(b, s * 0.9, 0.55, 2.1, 0.55, 0.3, 0xd8a020);
  }
}

export function makeVehicle(kind: VehicleKind, color: number, style: CarStyle = 'hatch', color2 = 0xe8e8e4) {
  const b = new Batcher(1e9, 0, true, null);
  if (kind === 'car') carInto(b, color, style);
  else if (kind === 'van') vanInto(b, color);
  else if (kind === 'minibus') minibusInto(b, color);
  else if (kind === 'bus') busInto(b, color);
  else lorryInto(b, color, color2);
  return b.toGroup();
}

/** animated forklift (kept as its own Group) */
export function makeForklift() {
  const b = new Batcher(1e9, 0, true, null);
  b.box(1.1, 0.7, 2.0, M.paint, 0, 0.35, -0.2, 0xf0b400);
  b.box(1.1, 0.5, 0.7, M.metal, 0, 0.9, -0.8, 0x333333);
  b.box(0.1, 1.3, 0.1, M.metal, -0.5, 1.0, 0.05, 0x222222);
  b.box(0.1, 1.3, 0.1, M.metal, 0.5, 1.0, 0.05, 0x222222);
  b.box(1.1, 0.06, 1.2, M.metal, 0, 2.28, -0.3, 0x222222);
  b.box(0.1, 1.3, 0.1, M.metal, -0.5, 1.0, -0.95, 0x222222);
  b.box(0.1, 1.3, 0.1, M.metal, 0.5, 1.0, -0.95, 0x222222);
  b.box(0.5, 0.06, 0.4, M.fabric, 0, 1.15, -0.4, 0x333333);
  b.box(0.12, 2.6, 0.12, M.metal, -0.35, 0.2, 1.0, 0x444444);
  b.box(0.12, 2.6, 0.12, M.metal, 0.35, 0.2, 1.0, 0x444444);
  b.box(0.8, 0.1, 0.1, M.metal, 0, 1.6, 1.0, 0x444444);
  b.box(0.35, 0.06, 0.08, M.amber, 0, 2.34, -0.3, 0xffffff);
  b.box(0.3, 0.2, 0.06, M.carTail, 0, 0.7, -1.22, 0xffffff);
  for (const s of [-1, 1]) {
    wheelInto(b, s * 0.55, 0.3, 0.45, 0.3, 0.25);
    wheelInto(b, s * 0.5, 0.25, -0.85, 0.25, 0.22);
  }
  const body = b.toGroup();
  const fb = new Batcher(1e9, 0, true, null);
  for (const s of [-1, 1]) fb.box(0.12, 0.05, 1.1, M.metal, s * 0.3, 0, 0.1, 0x333333);
  fb.box(0.9, 0.5, 0.05, M.metal, 0, 0, -0.05, 0x333333);
  const forks = fb.toGroup();
  forks.position.set(0, 0.15, 1.1);
  const g = new THREE.Group();
  g.add(body);
  g.add(forks);
  g.userData.forks = forks;
  return g;
}
