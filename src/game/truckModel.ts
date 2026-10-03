import * as THREE from 'three';
import { Batcher } from './batch';
import { M, extra, labelMaterial } from './textures';
import { tr, number } from './i18n';

/* ------------------------------------------------------------------ */
/*  Original European-style heavy tractor + flatbed semi-trailer.      */
/*  Origin = centre of rear axle on the ground, +z forward, +x = left  */
/*  (driver side, left-hand drive).                                    */
/* ------------------------------------------------------------------ */
export const TRUCK = {
  wheelbase: 3.6,
  fifth: 0.2, // fifth wheel offset from rear axle
  trailerPivot: 10.3, // kingpin -> effective trailer axle distance
  eye: new THREE.Vector3(0.55, 2.61, 3.06),
  tank: new THREE.Vector3(1.4, 0, 1.4), // fuel tank filler point (local x left, z fwd)
  wheelR: 0.5,
};

export interface TruckVisualState {
  speed: number; // km/h
  rpm: number;
  fuel: number; // 0..1
  damage: number; // 0..100
  gear: string;
  steer: number; // -1..1 input (visual wheel)
  steerAngle: number; // radians (front wheels)
  throttle: number;
  brake: number;
  handbrake: boolean;
  headlights: boolean;
  indicator: number; // -1 left, 1 right, 2 hazard
  reversing: boolean;
  wiper: boolean;
  /** wheel slip ratio — the ABS lamp is a real warning, not decoration */
  slip: number;
  radio: boolean;
  overspeed: boolean;
  night: number;
  rain: number;
  pitch: number;
  roll: number;
  bounce: number;
  trailerRoll: number;
  wheelSpin: number; // radians (accumulated)
  distKm: number;
  time: number;
  hourText: string;
  navText: string;
  dt: number;
}

function mkMat(color: number, emissive: number, ei: number) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, vertexColors: true, roughness: 0.4 });
}

export class TruckModel {
  root = new THREE.Group();
  body = new THREE.Group();
  trailer = new THREE.Group();
  trailerBody = new THREE.Group();
  cargo = new THREE.Group();
  interior = new THREE.Group();
  frontPivots: THREE.Group[] = [];
  spinners: THREE.Group[] = [];
  trailerSpinners: THREE.Group[] = [];
  steerGroup = new THREE.Group();
  steerSpin = new THREE.Group();
  wipers: THREE.Group[] = [];
  /* Damage smoke: billboards behind the cab, spawned from the exhaust side. Emitted
     by the truck's own state, so it also exists in a replay of the cab camera. */
  private smoke: { sp: THREE.Sprite; t: number; life: number; vx: number; vy: number; vz: number }[] = [];
  private smokeT = 0;
  pedals: { acc: THREE.Object3D; brk: THREE.Object3D } = { acc: new THREE.Object3D(), brk: new THREE.Object3D() };
  handbrake = new THREE.Group();
  pendant = new THREE.Group();
  heads: THREE.SpotLight[] = [];
  cabLight = new THREE.PointLight(0xffe8c8, 0, 4, 2);
  matBrake = mkMat(0xffffff, 0xff1a10, 0.3);
  matRev = mkMat(0xffffff, 0xffffff, 0.0);
  matHead = mkMat(0xffffff, 0xfff0cc, 0.2);
  matIndL = mkMat(0xffffff, 0xffa020, 0.2);
  matIndR = mkMat(0xffffff, 0xffa020, 0.2);
  matDash = mkMat(0xffffff, 0x40ffd0, 0);
  mirrors: { mesh: THREE.Mesh; rt: THREE.WebGLRenderTarget; cam: THREE.PerspectiveCamera; anchor: THREE.Object3D; side: number }[] = [];
  clusterCanvas = document.createElement('canvas');
  clusterTex: THREE.CanvasTexture;
  infoCanvas = document.createElement('canvas');
  infoTex: THREE.CanvasTexture;
  wiperPhase = 0;
  wiperActive = false;
  private blink = 0;
  private lastCluster = 0;
  private odo = 128430;
  constructor() {
    const { root, body } = this;
    root.add(body);
    this.buildChassis();
    this.buildCab();
    this.buildInterior();
    this.buildWheels();
    this.buildTrailer();
    this.buildLights();
    body.add(this.interior);
    this.clusterCanvas.width = 256;
    this.clusterCanvas.height = 128;
    this.infoCanvas.width = 128;
    this.infoCanvas.height = 64;
    this.clusterTex = new THREE.CanvasTexture(this.clusterCanvas);
    this.infoTex = new THREE.CanvasTexture(this.infoCanvas);
    for (const t of [this.clusterTex, this.infoTex]) {
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.colorSpace = THREE.SRGBColorSpace;
    }
    const cl = new THREE.Mesh(
      new THREE.PlaneGeometry(0.54, 0.27),
      new THREE.MeshBasicMaterial({ map: this.clusterTex, toneMapped: false }),
    );
    cl.position.set(0.55, 2.12, 3.995);
    cl.rotation.y = Math.PI;
    cl.rotation.x = 0.0;
    this.interior.add(cl);
    const info = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.15),
      new THREE.MeshBasicMaterial({ map: this.infoTex, toneMapped: false }),
    );
    info.position.set(-0.2, 1.93, 3.985);
    info.rotation.y = Math.PI;
    this.interior.add(info);
    this.buildMirrors();
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.trailer.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : 0));
    // interior is always well lit (sun leaks in on purpose) and does not self-shadow
    this.interior.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
  }

  /* ----------------------------- chassis ----------------------------- */
  private buildChassis() {
    const b = new Batcher(1e9, 0, true, null);
    const dark = 0x1c1e22;
    for (const s of [-1, 1]) {
      b.box(0.14, 0.28, 6.6, M.metal, s * 0.48, 0.62, 1.7, dark);
      b.box(0.22, 0.16, 0.5, M.paint, s * 1.08, 0.42, 2.1, 0x1a1a1c);
    }
    for (const z of [-0.5, 1.2, 2.8, 4.1]) b.box(1.0, 0.1, 0.12, M.metal, 0, 0.7, z, dark);
    b.box(2.4, 0.3, 0.45, M.paint, 0, 0.58, 4.5, 0x404448); // front bumper
    // plate overlaps the bumper face instead of resting exactly on it (z 4.725)
    b.box(0.7, 0.14, 0.04, labelMaterial('05 NH 348', 'local'), 0, 0.62, 4.736, 0xffffff, { tu: 0.7, tv: 0.14 });
    for (const s of [-1, 1]) {
      b.box(0.36, 0.06, 0.5, M.metal, s * 1.35, 0.66, 3.9, 0x9aa0a8);
      b.box(0.36, 0.06, 0.5, M.metal, s * 1.35, 1.0, 3.9, 0x9aa0a8);
      b.box(0.1, 0.4, 0.1, M.metal, s * 1.5, 0.64, 3.98, 0x9aa0a8);
    }
    // fifth wheel
    b.box(1.7, 0.1, 1.5, M.metal, 0, 1.05, 0.2, 0x2a2c30);
    b.box(0.5, 0.12, 0.5, M.metal, 0, 1.15, 0.45, 0x55585e);
    b.box(1.5, 0.35, 0.1, M.metal, 0, 0.8, 0.92, 0x2a2c30, { rx: -0.3 });
    // tanks
    b.cyl(0.4, 0.4, 1.9, 16, M.chrome, 1.05, 0.55, 0.5, 0xc4c8cc, { rx: Math.PI / 2 });
    b.cyl(0.14, 0.14, 0.08, 8, M.paint, 1.05, 0.55 + 0.4, 1.7, 0x222222);
    b.cyl(0.3, 0.3, 1.3, 14, M.chrome, -1.05, 0.55, 0.6, 0xb8bcc0, { rx: Math.PI / 2 });
    b.cyl(0.1, 0.1, 0.06, 8, M.paint, -1.05, 0.85, 1.5, 0x1a4ea8);
    for (const z of [0.9, 1.5, 2.1]) b.box(0.06, 0.8, 0.1, M.metal, 1.05, 0.15, z, 0x2a2c30);
    // exhaust
    b.cyl(0.11, 0.11, 3.6, 12, M.chrome, -1.18, 0.8, 1.55, 0xd0d4d8);
    b.cyl(0.13, 0.13, 0.5, 12, M.chrome, -1.18, 3.5, 1.55, 0xd0d4d8);
    b.box(0.22, 1.2, 0.5, M.metal, -1.28, 1.2, 1.55, 0x2a2c30);
    b.box(0.5, 0.5, 0.4, M.metal, -1.1, 0.85, 0.85, 0x3a3c40); // scr / dpf
    // air hoses between cab & trailer (decoration)
    b.cyl(0.03, 0.03, 0.6, 6, M.paint, 0.25, 1.1, -0.2, 0xd8302a);
    b.cyl(0.03, 0.03, 0.6, 6, M.paint, -0.25, 1.1, -0.2, 0xe8c020);
    // rear mudguards + flaps
    for (const s of [-1, 1]) {
      b.box(0.55, 0.05, 1.3, M.paint, s * 0.95, 1.12, 0, 0x2a2c30);
      b.box(0.5, 0.45, 0.04, M.rubber, s * 0.95, 0.12, -0.85, 0x151515);
      b.box(0.06, 0.4, 0.06, M.metal, s * 0.95, 0.75, 0, 0x2a2c30);
    }
    // front mudguard arches
    for (const s of [-1, 1]) b.box(0.45, 0.05, 1.2, M.paint, s * 1.0, 1.08, 3.6, 0xe6e6e2);
    this.body.add(b.toGroup());
  }

  /* ------------------------------- cab -------------------------------- */
  private buildCab() {
    const b = new Batcher(1e9, 0, true, null);
    const white = 0xf0f0ec, blue = 0x1c3f7a, red = 0xc8281e;

    /* --------------------------------------------------------------
     * ANTI Z-FIGHTING LAYER PLAN (half-widths, right side; mirrored).
     * Every panel that can overlap another ends on its OWN x plane, so
     * no two faces are ever coplanar. These parts all share M.paint in
     * one merged mesh, which means polygonOffset cannot separate them —
     * only geometry can.
     *   shell (floor/skirt)      1.200   (buried behind the door skin)
     *   bulkhead (front/rear)    1.240
     *   door skin                1.250
     *   stripe / blue trim       1.258
     *   seam                     1.265
     *   pillars                  1.264
     *   cap                      1.260
     *   roof (overhang)          1.272
     * Longitudinal spans likewise only ever touch, never overlap.
     * ------------------------------------------------------------ */
    const SHELL = 1.200, BULK = 1.240, SKIN = 1.250, TRIM = 1.258, PILLAR = 1.264, CAP = 1.260, ROOF = 1.272;
    const SKIN_IN = 1.165;                 // inner face of the door skin
    const Z_BACK = 1.70, Z_FRONT = 4.60;   // cab envelope
    const DZ0 = 1.80, DZ1 = 4.42;          // door skin span (meets the bulkheads)
    const zc = (Z_BACK + Z_FRONT) / 2, L = Z_FRONT - Z_BACK;

    /** axis-aligned panel from explicit bounds — makes overlaps easy to audit */
    const panel = (x0: number, x1: number, y0: number, y1: number, za: number, zb: number, mat: THREE.Material, color: number, o: any = {}) =>
      b.box(x1 - x0, y1 - y0, zb - za, mat, (x0 + x1) / 2, y0, (za + zb) / 2, color, o);

    /* ---- structural shell (hidden behind the skins) ---- */
    panel(-SHELL, SHELL, 1.35, 1.47, Z_BACK, Z_FRONT, M.paint, 0x2a2c30); // floor
    panel(-SHELL, SHELL, 1.10, 1.35, Z_BACK, Z_FRONT, M.paint, white);    // skirt

    /* ---- bulkheads: rear wall + front face (own x plane) ---- */
    panel(-BULK, BULK, 1.35, 3.45, 1.62, 1.80, M.paint, white);           // rear wall
    panel(-BULK, BULK, 1.10, 2.15, DZ1, Z_FRONT, M.paint, white);         // front lower
    panel(-BULK, BULK, 2.15, 2.33, DZ1, Z_FRONT, M.paint, 0xe0e0dc);      // front upper band

    for (const s of [-1, 1]) {
      const xi = s > 0 ? SKIN_IN : -SKIN, xo = s > 0 ? SKIN : -SKIN_IN;   // door skin bounds
      const lo = Math.min(xi, xo), hi = Math.max(xi, xo);
      panel(lo, hi, 1.10, 2.15, DZ0, DZ1, M.paint, white);                // door skin
      panel(lo, hi, 3.08, 3.45, DZ0, DZ1, M.paint, white);                // upper beam
      // stripes sit proud of the skin
      panel(Math.min(s * SKIN_IN, s * TRIM), Math.max(s * SKIN_IN, s * TRIM), 1.10, 1.40, DZ0, DZ1, M.paint, blue);
      panel(Math.min(s * SKIN_IN, s * TRIM), Math.max(s * SKIN_IN, s * TRIM), 3.33, 3.45, DZ0, DZ1, M.paint, blue);
      // pillars — proud of both skin and glass, so nothing is coplanar
      const pl = Math.min(s * 1.15, s * PILLAR), ph = Math.max(s * 1.15, s * PILLAR);
      panel(pl, ph, 2.13, 3.12, 4.30, 4.44, M.paint, white);              // A pillar
      panel(pl, ph, 2.13, 3.12, 1.80, 1.94, M.paint, white);              // rear pillar
      panel(pl, ph, 2.13, 3.12, 2.66, 2.76, M.paint, 0xc8c8c4);           // B pillar
      // door seams, handle, kick rail, logo — each on its own plane
      b.box(0.018, 1.85, 0.02, M.rubber, s * 1.265, 1.25, 2.60, 0x222222);
      b.box(0.018, 1.85, 0.02, M.rubber, s * 1.265, 1.25, 4.26, 0x222222);
      b.box(0.05, 0.05, 0.22, M.chrome, s * 1.278, 2.20, 2.86, 0xdddddd);
      b.box(0.08, 0.04, 0.9, M.paint, s * 1.284, 1.95, 3.40, 0xd8d8d4);
      b.box(0.016, 0.55, 1.45, M.logo, s * 1.270, 1.50, 3.45, 0xffffff, { tu: 1.45, tv: 0.55 });
      b.box(0.06, 0.08, 0.12, M.amber, s * 1.272, 1.12, 4.18, 0xffffff);
      b.box(0.06, 0.08, 0.12, M.amber, s * 1.272, 1.12, 1.98, 0xffffff);
      // side glass: recessed well inside the pillars
      b.box(0.03, 0.95, 1.62, extra.cabGlass, s * 1.224, 2.15, 3.52, 0xffffff);
    }

    /* ---- roof stack (each layer its own x plane, stacked in y) ---- */
    panel(-ROOF, ROOF, 3.45, 3.58, 1.68, 4.62, M.paint, white);
    panel(-CAP, CAP, 3.58, 3.64, Z_BACK, Z_FRONT, M.paint, 0xe4e4e0);
    b.box(2.30, 0.80, 0.60, M.paint, 0, 3.64, 2.0, white, { rx: 0.5 });   // deflector
    for (const s of [-1, 1]) b.box(0.05, 0.60, 1.00, M.paint, s * 1.12, 3.64, 2.4, white);
    for (const x of [-0.7, -0.35, 0, 0.35, 0.7]) b.box(0.14, 0.08, 0.1, M.amber, x, 3.66, 4.44, 0xffffff);
    b.box(2.40, 0.06, 0.40, M.paint, 0, 3.47, 4.78, 0x20262e);            // sun visor

    /* ---- front detailing: parts interpenetrate (no gaps, no shared planes) ---- */
    b.box(1.70, 0.75, 0.10, M.rubber, 0, 1.18, 4.600, 0x16181a);          // grille recess
    for (let i = 0; i < 6; i++) b.box(1.60, 0.03, 0.04, M.chrome, 0, 1.28 + i * 0.1, 4.664, 0xd8dce0);
    b.box(0.34, 0.20, 0.06, M.metal, 0, 1.55, 4.676, 0x1c3f7a);           // badge plate
    b.box(0.20, 0.20, 0.04, M.chrome, 0, 1.55, 4.712, 0xe0e0e0);          // badge face
    b.box(0.50, 0.06, 0.05, M.paint, 0, 1.10, 4.648, 0x2a2c30);
    for (const s of [-1, 1]) {
      b.box(0.50, 0.30, 0.16, M.metal, s * 0.98, 1.50, 4.600, 0x2a2c30);  // lamp housing
      b.box(0.44, 0.24, 0.05, this.matHead, s * 0.98, 1.52, 4.672, 0xffffff);
      b.box(0.30, 0.12, 0.10, s > 0 ? this.matIndL : this.matIndR, s * 1.00, 1.20, 4.626, 0xffffff);
      b.box(0.18, 0.10, 0.05, M.carHead, s * 0.50, 0.66, 4.732, 0xffffff);
    }
    // windshield: glass recessed, frames narrower than the bulkhead
    b.box(2.28, 1.10, 0.04, extra.cabGlass, 0, 2.22, 4.508, 0xffffff);
    panel(-1.232, 1.232, 3.32, 3.44, 4.44, 4.58, M.paint, 0x2a2c30);      // header
    panel(-1.224, 1.224, 2.33, 2.40, 4.46, 4.56, M.paint, 0x2a2c30);      // cowl lip
    b.box(1.50, 0.50, 0.03, extra.cabGlass, 0, 2.50, 1.835, 0xffffff);    // rear window
    // red accent band — stands 8 mm proud of the front bulkhead
    b.box(2.504, 0.08, 0.10, M.paint, 0, 1.55, 4.608, red);
    this.body.add(b.toGroup());
  }

  /* ----------------------------- interior ----------------------------- */
  private buildInterior() {
    const b = new Batcher(1e9, 0, true, null);
    const dash = M.dash, plastic = 0x3a3c40, light = 0xb8b4aa;
    // lining
    for (const s of [-1, 1]) {
      b.box(0.04, 0.8, 2.4, dash, s * 1.16, 1.4, 3.1, 0x4a4c50);
      b.box(0.05, 0.1, 2.3, M.fabric, s * 1.15, 2.1, 3.1, 0x6a6a6a);
    }
    b.box(2.4, 0.03, 2.8, M.fabric, 0, 3.4, 3.1, light);
    // cabin floor: narrower than the structural floor (±1.20) and resting on top of it
    b.box(2.32, 0.03, 2.8, M.fabric, 0, 1.47, 3.1, 0x3a3a3e);
    b.box(1.2, 0.02, 1.0, M.fabric, 0.55, 1.48, 3.7, 0x282a2e); // floor mat
    // dashboard body
    b.box(2.3, 0.77, 0.55, dash, 0, 1.35, 4.275, 0x44464a);
    b.box(2.3, 0.1, 0.5, dash, 0, 2.12, 4.3, plastic);
    b.box(2.3, 0.05, 0.5, M.rubber, 0, 2.2, 4.32, 0x2a2c30, { rx: 0.1 });
    // cluster binnacle
    b.box(0.68, 0.05, 0.3, dash, 0.55, 2.26, 4.14, 0x202226);
    b.box(0.04, 0.3, 0.2, dash, 0.55 - 0.32, 1.98, 4.1, 0x202226);
    b.box(0.04, 0.3, 0.2, dash, 0.55 + 0.32, 1.98, 4.1, 0x202226);
    // centre console between seats
    b.box(0.4, 0.5, 1.1, dash, 0, 1.35, 3.5, 0x44464a);
    b.box(0.34, 0.04, 0.5, M.rubber, 0, 1.85, 3.4, 0x222222);
    b.cyl(0.04, 0.04, 0.09, 10, M.metal, 0.08, 1.85, 3.6, 0x888888); // cup holder rim
    b.cyl(0.035, 0.032, 0.09, 10, M.paint, 0.08, 1.86, 3.6, 0xeeeeee); // mug
    // gear selector (stalk style knob on console)
    b.box(0.07, 0.3, 0.07, M.metal, -0.04, 1.85, 3.2, 0x222222);
    b.box(0.12, 0.08, 0.14, M.rubber, -0.04, 2.13, 3.2, 0x111111);
    for (let i = 0; i < 4; i++) b.box(0.05, 0.015, 0.05, i === 2 ? M.ledGreen : M.metal, -0.15 + i * 0.07, 1.865, 3.5, 0xffffff);
    // centre stack on dash face (z=4.0): radio, climate, vents, switches
    b.box(0.4, 0.14, 0.06, M.metal, -0.2, 1.88, 3.97, 0x1c1e22); // radio body
    b.box(0.3, 0.07, 0.01, M.screen, -0.2, 1.915, 3.935, 0xffffff);
    for (const x of [-0.36, -0.04]) b.cyl(0.02, 0.02, 0.03, 8, M.metal, x, 1.95, 3.97, 0xaaaaaa, { rx: -Math.PI / 2 });
    for (let i = 0; i < 5; i++) b.box(0.04, 0.025, 0.02, M.paint, -0.36 + i * 0.08, 1.835, 3.94, 0x888888);
    b.box(0.46, 0.2, 0.05, M.rubber, -0.2, 1.63, 3.98, 0x1a1c1e); // climate panel
    for (let i = 0; i < 3; i++) b.cyl(0.032, 0.032, 0.04, 10, M.metal, -0.34 + i * 0.14, 1.66, 3.97, 0x999999, { rx: -Math.PI / 2 });
    for (let i = 0; i < 4; i++) b.box(0.06, 0.03, 0.02, i < 2 ? M.ledAmber : M.ledGreen, -0.35 + i * 0.1, 1.58, 3.94, 0xffffff);
    // vents (3D slats)
    for (const x of [1.0, -0.65, -1.0]) {
      b.box(0.2, 0.1, 0.05, M.rubber, x, 1.98, 3.975, 0x15171a);
      for (let k = 0; k < 4; k++) b.box(0.18, 0.012, 0.03, M.metal, x, 1.945 + k * 0.022, 3.95, 0x666a70, { rx: 0.4 });
    }
    b.box(0.3, 0.08, 0.05, M.rubber, 0.55, 1.78, 3.975, 0x15171a);
    // switch panel (left)
    b.box(0.34, 0.5, 0.04, M.rubber, 1.0, 1.5, 3.99, 0x1a1c1e);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 3; c++) {
        b.box(0.07, 0.07, 0.03, c === 2 && r === 0 ? M.ledRed : M.paint, 0.88 + c * 0.12, 1.32 + r * 0.11, 3.96, c === 2 && r === 0 ? 0xffffff : 0x55585e);
        if (r > 0) b.box(0.03, 0.01, 0.01, M.ledGreen, 0.88 + c * 0.12, 1.37 + r * 0.11, 3.945, 0xffffff);
      }
    b.box(0.1, 0.1, 0.03, M.ledRed, 0.3, 1.78, 3.96, 0xffffff); // hazard
    // steering column + stalks
    b.box(0.12, 0.12, 0.45, dash, 0.55, 1.78, 3.95, 0x1c1e22, { rx: 0.5 });
    b.box(0.26, 0.025, 0.025, M.rubber, 0.78, 1.9, 3.8, 0x111111);
    b.box(0.26, 0.025, 0.025, M.rubber, 0.33, 1.9, 3.8, 0x111111);
    // seats
    for (const x of [0.55, -0.55]) {
      b.box(0.5, 0.25, 0.5, M.metal, x, 1.38, 3.0, 0x2a2c30);
      b.box(0.56, 0.16, 0.56, M.fabric, x, 1.63, 3.0, 0x545a68);
      b.box(0.56, 0.78, 0.14, M.fabric, x, 1.74, 2.72, 0x545a68, { rx: -0.18 });
      b.box(0.34, 0.22, 0.1, M.fabric, x, 2.55, 2.66, 0x4a505e, { rx: -0.18 });
      for (const s of [-1, 1]) b.box(0.08, 0.04, 0.4, M.rubber, x + s * 0.3, 1.97, 3.0, 0x222222);
    }
    // bunk
    b.box(2.3, 0.4, 1.0, dash, 0, 1.35, 2.2, 0x44464a);
    b.box(2.3, 0.14, 1.0, M.fabric, 0, 1.75, 2.2, 0x2a4a7a);
    b.box(0.5, 0.1, 0.3, M.fabric, -0.7, 1.89, 1.95, 0xe4e0d8);
    b.box(0.9, 0.04, 0.9, M.fabric, 0.4, 1.89, 2.2, 0x9a3a3a);
    b.box(2.3, 0.08, 0.9, M.fabric, 0, 2.9, 2.2, 0x3a3e4a);
    // curtains
    for (const s of [-1, 1]) b.box(0.45, 1.4, 0.04, M.fabric, s * 1.0, 1.9, 2.72, 0x4a3a5a);
    // overhead console
    b.box(0.9, 0.12, 0.3, dash, 0, 3.28, 3.7, 0x303236);
    b.box(0.12, 0.02, 0.1, M.bulb, 0, 3.27, 3.7, 0xffffff);
    // A-pillar trim
    for (const s of [-1, 1]) b.box(0.1, 1.15, 0.1, dash, s * 1.12, 2.17, 4.45, 0x1c1e22);
    // Cabin decorations retain the original geometry and use the regional material set.
    b.cyl(0.006, 0.006, 0.18, 4, M.metal, -0.9, 2.2, 4.3, 0x888888);
    b.box(0.18, 0.12, 0.008, M.turkishFlag, -0.9, 2.36, 4.3, 0xffffff, { tu: 0.18, tv: 0.12 });
    b.box(0.16, 0.14, 0.14, M.fabric, -0.62, 2.2, 4.25, 0xe08a2a);
    b.box(0.12, 0.11, 0.12, M.fabric, -0.62, 2.34, 4.25, 0xe8a040);
    b.box(0.03, 0.05, 0.03, M.fabric, -0.67, 2.45, 4.25, 0xe08a2a);
    b.box(0.03, 0.05, 0.03, M.fabric, -0.57, 2.45, 4.25, 0xe08a2a);
    b.box(0.13, 0.17, 0.02, M.wood, 0.1, 2.25, 4.3, 0x6a4a2a, { rx: -0.3 });
    b.box(0.1, 0.13, 0.01, M.flat, 0.1, 2.26, 4.29, 0xd0e0f0, { rx: -0.3 });
    b.box(0.1, 0.1, 0.005, M.paint, 0.95, 2.9, 4.5, 0xe03a5a);
    // pedals
    this.pedals.acc.position.set(0.28, 1.5, 3.85);
    this.pedals.brk.position.set(0.55, 1.5, 3.85);
    // handbrake lever
    this.handbrake.position.set(0.22, 1.85, 3.35);
    const hbG = new Batcher(1e9, 0, true, null);
    hbG.box(0.04, 0.22, 0.05, M.metal, 0, 0, 0, 0x222222);
    hbG.box(0.07, 0.07, 0.09, M.paint, 0, 0.2, 0, 0xf2c418);
    this.handbrake.add(hbG.toGroup());
    this.interior.add(this.handbrake);
    const pb = new Batcher(1e9, 0, true, null);
    pb.box(0.1, 0.22, 0.03, M.rubber, 0, -0.05, 0, 0x1a1a1c, { rx: 0.0 });
    this.pedals.acc.add(pb.toGroup());
    const pb2 = new Batcher(1e9, 0, true, null);
    pb2.box(0.2, 0.2, 0.03, M.rubber, 0, -0.05, 0, 0x1a1a1c);
    this.pedals.brk.add(pb2.toGroup());
    this.interior.add(this.pedals.acc, this.pedals.brk);

    // steering wheel
    this.steerGroup.position.set(0.55, 1.96, 3.72);
    this.steerGroup.rotation.x = -(Math.PI - 0.58);
    const sw = new Batcher(1e9, 0, true, null);
    sw.torus(0.2, 0.022, M.rubber, 0, 0, 0, 0x181a1c);
    for (let k = 0; k < 3; k++) sw.box(0.19, 0.03, 0.02, M.rubber, 0, 0, 0, 0x202226, { rz: (k * Math.PI * 2) / 3 + Math.PI / 2 });
    sw.cyl(0.06, 0.06, 0.04, 10, M.rubber, 0, 0, -0.02, 0x262a2e, { rx: Math.PI / 2 });
    sw.box(0.05, 0.02, 0.01, M.chrome, 0, 0, -0.035, 0xdddddd);
    // wheel thumbs
    sw.box(0.04, 0.02, 0.02, M.paint, -0.06, 0.0, -0.03, 0x666a70);
    sw.box(0.04, 0.02, 0.02, M.paint, 0.06, 0.0, -0.03, 0x666a70);
    this.steerSpin.add(sw.toGroup());
    this.steerGroup.add(this.steerSpin);
    this.interior.add(this.steerGroup);

    // hanging pendant + dice (sway)
    const pg = new Batcher(1e9, 0, true, null);
    pg.cyl(0.004, 0.004, 0.25, 4, M.metal, 0, -0.25, 0, 0xaaaaaa);
    pg.box(0.08, 0.08, 0.08, M.flat, 0, -0.33, 0, 0xf4f4f0);
    pg.box(0.09, 0.012, 0.012, M.flat, 0, -0.33, 0.04, 0x111111);
    pg.box(0.06, 0.06, 0.06, M.flat, 0.1, -0.2, 0.02, 0xd02828);
    pg.cyl(0.004, 0.004, 0.14, 4, M.metal, 0.1, -0.14, 0.02, 0xaaaaaa);
    this.pendant.position.set(0.1, 3.4, 4.25);
    this.pendant.add(pg.toGroup());
    this.interior.add(this.pendant);

    // wipers
    for (const x of [1.0, 0.05]) {
      const wg = new THREE.Group();
      wg.position.set(x, 2.2, 4.57);
      const wb = new Batcher(1e9, 0, true, null);
      wb.box(0.9, 0.025, 0.02, M.rubber, 0.45, 0, 0, 0x151515);
      wb.box(0.5, 0.025, 0.02, M.rubber, 0.62, 0.04, 0.005, 0x151515, { rz: 0.04 });
      wb.box(0.06, 0.06, 0.04, M.metal, 0, 0, 0, 0x444444);
      wg.add(wb.toGroup());
      this.interior.add(wg);
      this.wipers.push(wg);
    }

    this.interior.add(b.toGroup());
    this.cabLight.position.set(0.3, 3.0, 3.4);
    this.interior.add(this.cabLight);
  }

  /* -------------------------------- wheels -------------------------------- */
  private wheel(w: number, hubColor = 0xb8bcc2) {
    const r = TRUCK.wheelR;
    const g = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 22).rotateZ(Math.PI / 2), extra.tireMat);
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.02, 14).rotateZ(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: hubColor, roughness: 0.35, metalness: 0.8 }),
    );
    g.add(tire, rim);
    const lm = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.8 });
    for (let k = 0; k < 8; k++) {
      const nut = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.06, 0.06), lm);
      const a = (k / 8) * Math.PI * 2;
      nut.position.set(0, Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36);
      g.add(nut);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, w + 0.08, 8).rotateZ(Math.PI / 2), lm);
    g.add(cap);
    return g;
  }
  private buildWheels() {
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 1.0, TRUCK.wheelR, 3.6);
      const spin = this.wheel(0.32);
      pivot.add(spin);
      this.body.parent?.add(pivot);
      this.root.add(pivot);
      this.frontPivots.push(pivot);
      this.spinners.push(spin);
      for (const dx of [0.78, 1.1]) {
        const rs = this.wheel(0.3);
        rs.position.set(s * dx, TRUCK.wheelR, 0);
        this.root.add(rs);
        this.spinners.push(rs);
      }
    }
  }

  /* ------------------------------ flatbed trailer ------------------------------ */
  private buildTrailer() {
    const b = new Batcher(1e9, 0, true, null);
    const frame = 0x23262a, blue = 0x1c3f7a;
    // rails run up INTO the deck (1.22..1.34) so their top face is never coplanar with it
    for (const s of [-1, 1]) b.box(0.18, 0.44, 12.9, M.metal, s * 0.8, 0.82, -7.0, frame);
    for (let z = -1.5; z > -13; z -= 1.6) b.box(2.2, 0.12, 0.16, M.metal, 0, 0.9, z, frame);
    b.box(2.55, 0.12, 13.2, M.wood, 0, 1.22, -7.0, 0xffffff, { tu: 2.5 });
    // blue nose band sits ON the deck (own width + own y band)
    b.box(2.52, 0.10, 0.2, M.paint, 0, 1.34, -0.7, blue);
    b.box(2.5, 1.5, 0.12, M.paint, 0, 1.34, -0.55, 0xdadad6); // headboard
    for (let k = 0; k < 4; k++) b.box(2.3, 0.08, 0.14, M.metal, 0, 1.6 + k * 0.3, -0.55, 0x9a9ea4);
    for (const s of [-1, 1]) {
      b.box(0.05, 0.42, 13.2, M.paint, s * 1.26, 1.34, -7.0, 0xdadad6);
      b.box(0.06, 0.07, 13.2, M.metal, s * 1.272, 1.76, -7.0, 0x9a9ea4);
      for (let z = -1.1; z > -13.2; z -= 1.66) b.box(0.08, 0.5, 0.08, M.metal, s * 1.27, 1.34, z, 0x6a6e74);
      b.box(0.04, 0.28, 8.6, M.metal, s * 1.15, 0.55, -5.6, 0x2a2c30); // side guard
      b.box(0.04, 0.05, 13.2, M.flat, s * 1.285, 1.4, -7.0, 0xe0a010); // marker strip
    }
    // landing gear
    for (const s of [-1, 1]) {
      b.box(0.1, 0.8, 0.1, M.metal, s * 0.9, 0.2, -2.8, 0x44484e);
      b.box(0.3, 0.05, 0.3, M.metal, s * 0.9, 0.18, -2.8, 0x44484e);
    }
    b.box(1.9, 0.08, 0.1, M.metal, 0, 0.55, -2.8, 0x44484e);
    // kingpin plate
    b.box(1.4, 0.06, 1.2, M.metal, 0, 1.0, -0.6, 0x55585e);
    // axles + fenders + underrun bar
    for (const z of [-9.5, -10.8, -12.1]) b.box(2.0, 0.14, 0.14, M.metal, 0, 0.5, z, 0x2a2c30);
    for (const s of [-1, 1]) b.box(0.95, 0.06, 3.5, M.paint, s * 0.95, 1.1, -10.8, 0x2a2c30);
    b.box(2.3, 0.2, 0.08, M.paint, 0, 0.5, -13.5, 0xe8e8e4);
    // hazard blocks interpenetrate the bar (own y band + own z span)
    for (let k = 0; k < 6; k++) b.box(0.18, 0.18, 0.10, M.paint, -1.0 + k * 0.4, 0.51, -13.56, k % 2 ? 0xd02a20 : 0xf4f4f0);
    for (const s of [-1, 1]) {
      b.box(0.3, 0.2, 0.08, this.matBrake, s * 1.08, 1.0, -13.5, 0xffffff);
      b.box(0.18, 0.12, 0.08, s > 0 ? this.matIndL : this.matIndR, s * 1.08, 0.82, -13.5, 0xffffff);
      b.box(0.14, 0.12, 0.08, this.matRev, s * 0.86, 0.82, -13.5, 0xffffff);
    }
    b.box(0.6, 0.15, 0.03, M.flat, 0, 0.74, -13.55, 0xf2f2ee);
    this.trailerBody.add(b.toGroup());
    for (const z of [-9.5, -10.8, -12.1])
      for (const s of [-1, 1])
        for (const dx of [0.78, 1.1]) {
          const w = this.wheel(0.3);
          w.position.set(s * dx, TRUCK.wheelR, z);
          this.trailerBody.add(w);
          this.trailerSpinners.push(w);
        }
    this.trailerBody.add(this.cargo);
    this.cargo.position.set(0, 1.345, 0); // deck top is 1.34 — cargo rests on it, not sunk into it
    this.trailer.add(this.trailerBody);
    this.root.add(this.trailer);
  }

  /* ------------------------------- lights ------------------------------- */
  private buildLights() {
    for (const s of [-1, 1]) {
      const sp = new THREE.SpotLight(0xfff0d8, 0, 110, 0.52, 0.55, 1.4);
      sp.position.set(s * 0.95, 1.5, 4.7);
      sp.target.position.set(s * 0.6, 0.6, 40);
      this.body.add(sp, sp.target);
      this.heads.push(sp);
    }
  }

  /* ------------------------------- mirrors ------------------------------- */
  private buildMirrors() {
    for (const s of [1, -1]) {
      const b = new Batcher(1e9, 0, true, null);
      b.box(0.08, 0.5, 0.06, M.paint, s * 1.34, 2.2, 4.38, 0x2a2c30);
      b.box(0.34, 0.04, 0.04, M.metal, s * 1.42, 2.62, 4.38, 0x2a2c30);
      b.box(0.13, 0.46, 0.26, M.paint, s * 1.62, 2.55, 4.3, 0x1c1e22);
      b.box(0.1, 0.18, 0.16, M.paint, s * 1.58, 2.14, 4.36, 0x1c1e22); // lower wide mirror housing
      this.body.add(b.toGroup());
      const rt = new THREE.WebGLRenderTarget(96, 192, { type: THREE.HalfFloatType });
      const geo = new THREE.PlaneGeometry(0.2, 0.4);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: rt.texture, fog: false, toneMapped: false }));
      mesh.rotation.y = Math.PI;
      mesh.position.set(s * 1.62, 2.57, 4.3 - 0.135);
      mesh.rotation.y = Math.PI + s * 0.12;
      this.body.add(mesh);
      const cam = new THREE.PerspectiveCamera(48, 0.5, 0.3, 700);
      const anchor = new THREE.Object3D();
      anchor.position.set(s * 1.62, 2.57, 4.1);
      this.body.add(anchor);
      this.mirrors.push({ mesh, rt, cam, anchor, side: s });
    }
  }

  /* ------------------------------- update ------------------------------- */
  private updateSmoke(s: TruckVisualState, dt: number) {
    if (!this.smoke.length) {
      for (let i = 0; i < 10; i++) {
        const mat = new THREE.SpriteMaterial({
          map: extra.glowTex, transparent: true, opacity: 0, depthWrite: false, fog: true,
          color: 0x2b2b2b, blending: THREE.NormalBlending,
        });
        const sp = new THREE.Sprite(mat);
        sp.scale.setScalar(0.4);
        sp.visible = false;
        this.root.add(sp);
        this.smoke.push({ sp, t: 0, life: 1, vx: 0, vy: 0, vz: 0 });
      }
    }
    const wear = Math.max(0, (s.damage - 22) / 78);
    const load = s.throttle * 0.7 + Math.min(1, Math.abs(s.rpm) / 2400) * 0.3;
    const rate = wear > 0 ? 0.34 - wear * 0.2 : 1e9;
    this.smokeT += dt;
    if (wear > 0 && this.smokeT > rate) {
      this.smokeT = 0;
      const p = this.smoke.find((q) => q.t >= q.life);
      if (p) {
        p.t = 0; p.life = 0.9 + wear * 1.1;
        p.sp.visible = true;
        p.sp.position.set(1.12, 4.0 + Math.random() * 0.2, 2.3);
        p.sp.scale.setScalar(0.3 + load * 0.25);
        (p.sp.material as THREE.SpriteMaterial).color.setHex(wear > 0.55 ? 0x1a1a1a : 0x4a4a48);
        p.vx = (Math.random() - 0.5) * 0.5;
        p.vy = 1.5 + load * 1.6;
        p.vz = -0.6 - Math.abs(s.speed) * 0.045;
      }
    }
    for (const p of this.smoke) {
      if (p.t >= p.life) { if (p.sp.visible) { p.sp.visible = false; (p.sp.material as THREE.SpriteMaterial).opacity = 0; } continue; }
      p.t += dt;
      const k = p.t / p.life;
      p.sp.position.x += p.vx * dt; p.sp.position.y += p.vy * dt; p.sp.position.z += p.vz * dt;
      p.sp.scale.setScalar(0.3 + k * (1.5 + wear * 1.2));
      (p.sp.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.42 * (1 - k) * (0.35 + wear));
    }
  }

  update(s: TruckVisualState, fp: boolean) {
    const dt = s.dt;
    this.updateSmoke(s, dt);
    // body suspension
    this.body.rotation.x = s.pitch;
    this.body.rotation.z = s.roll;
    this.body.position.y = s.bounce;
    this.trailerBody.rotation.z = s.trailerRoll;
    for (const p of this.frontPivots) p.rotation.y = s.steerAngle;
    for (const w of this.spinners) w.rotation.x = s.wheelSpin;
    for (const w of this.trailerSpinners) w.rotation.x = s.wheelSpin;
    // steering wheel
    this.steerSpin.rotation.z = s.steer * Math.PI * 1.4;
    this.pedals.acc.rotation.x = -s.throttle * 0.35;
    this.pedals.brk.rotation.x = -s.brake * 0.4;
    this.handbrake.rotation.x = s.handbrake ? 0 : 0.7;
    this.pendant.rotation.z = -s.roll * 6 + Math.sin(s.time * 2) * 0.02;
    this.pendant.rotation.x = s.pitch * 4;
    // wipers
    const active = s.wiper || s.rain > 0.2;
    if (active || this.wiperPhase > 0) {
      this.wiperPhase += dt * 1.4;
      if (!active && this.wiperPhase >= 1) this.wiperPhase = 0;
      if (this.wiperPhase >= 1) this.wiperPhase -= 1;
    }
    const ph = this.wiperPhase;
    const ang = ph < 0.5 ? ph * 2 : 2 - ph * 2;
    const a = Math.sin(ang * Math.PI * 0.5) * 1.75;
    this.wipers.forEach((w) => (w.rotation.z = a));
    this.wiperActive = active;
    // lights
    this.blink += dt;
    const on = Math.floor(this.blink * 2.6) % 2 === 0;
    const ind = s.indicator;
    this.matIndL.emissiveIntensity = (ind === -1 || ind === 2) && on ? 3.2 : 0.15;
    this.matIndR.emissiveIntensity = (ind === 1 || ind === 2) && on ? 3.2 : 0.15;
    this.matBrake.emissiveIntensity = (s.brake > 0.05 ? 3.5 : 0.4) + (s.headlights ? 1.0 : 0) * 0.6;
    this.matRev.emissiveIntensity = s.reversing ? 3.0 : 0.0;
    this.matHead.emissiveIntensity = s.headlights ? 4.0 : 0.15;
    for (const h of this.heads) h.intensity = s.headlights ? 1500 : 0;
    this.cabLight.intensity = fp ? 3.5 + s.night * 4 : 0;
    // cluster
    if (fp && s.time - this.lastCluster > 0.05) {
      this.lastCluster = s.time;
      this.drawCluster(s, on);
    }
    this.mirrors.forEach((m) => (m.mesh.visible = true));
  }

  private drawCluster(s: TruckVisualState, blinkOn: boolean) {
    const g = this.clusterCanvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#05080a';
    g.fillRect(0, 0, 256, 128);
    const gauge = (cx: number, cy: number, r: number, v: number, max: number, label: string, redFrom: number, ticks: number, unit: string) => {
      g.fillStyle = '#0c1418';
      g.beginPath(); g.arc(cx, cy, r + 4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#2b3a40'; g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy, r + 3, 0, Math.PI * 2); g.stroke();
      const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
      for (let i = 0; i <= ticks; i++) {
        const t = i / ticks, a = a0 + (a1 - a0) * t;
        const red = t * max >= redFrom;
        g.strokeStyle = red ? '#ff4a3a' : '#cfe8e8';
        g.lineWidth = i % 2 === 0 ? 2 : 1;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * (r - (i % 2 === 0 ? 8 : 5)), cy + Math.sin(a) * (r - (i % 2 === 0 ? 8 : 5)));
        g.lineTo(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1));
        g.stroke();
      }
      const t = Math.max(0, Math.min(1, v / max)), a = a0 + (a1 - a0) * t;
      g.strokeStyle = '#ffb030'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4)); g.stroke();
      g.fillStyle = '#e8e8e8';
      g.fillRect(cx - 2, cy - 2, 4, 4);
      g.fillStyle = '#7fe8d8'; g.font = '8px monospace'; g.textAlign = 'center';
      g.fillText(label, cx, cy + r * 0.55);
      g.fillStyle = '#8aa'; g.fillText(unit, cx, cy + r * 0.8);
    };
    gauge(52, 62, 46, s.speed, 120, number(s.speed), 200, 12, tr.speedUnit);
    gauge(204, 62, 46, s.rpm, 2500, number(Math.round(s.rpm / 10) * 10), 2100, 10, tr.rpm);
    // centre digital display
    g.fillStyle = '#071a1a'; g.fillRect(96, 8, 64, 62);
    g.strokeStyle = '#1f5a5a'; g.lineWidth = 1; g.strokeRect(96.5, 8.5, 63, 61);
    g.fillStyle = '#40ffd0'; g.font = 'bold 22px monospace'; g.textAlign = 'center';
    g.fillText(s.gear, 128, 34);
    g.font = '8px monospace'; g.fillStyle = '#7fe8d8';
    g.fillText(s.hourText, 128, 46);
    g.fillText(`${tr.odometer} ${number(this.odo + s.distKm)}`, 128, 56);
    g.fillText(s.navText, 128, 66);
    // fuel + damage bars
    const bar = (x: number, y: number, v: number, col: string, label: string) => {
      g.fillStyle = '#10181c'; g.fillRect(x, y, 56, 8);
      g.fillStyle = col; g.fillRect(x + 1, y + 1, Math.round(54 * Math.max(0, Math.min(1, v))), 6);
      g.fillStyle = '#9ab'; g.font = '7px monospace'; g.textAlign = 'left';
      g.fillText(label, x, y - 2);
    };
    bar(76, 84, s.fuel, s.fuel < 0.15 ? '#ff4a3a' : '#40d070', tr.fuel);
    bar(76, 102, 1 - s.damage / 100, s.damage > 60 ? '#ff4a3a' : s.damage > 25 ? '#ffb030' : '#40a0ff', tr.engine);
    // warning lights
    const lamp = (x: number, y: number, on: boolean, col: string, t: string) => {
      g.fillStyle = on ? col : '#142024';
      g.fillRect(x, y, 14, 9);
      g.fillStyle = on ? '#000' : '#2c3a3e';
      g.font = '7px monospace'; g.textAlign = 'center';
      g.fillText(t, x + 7, y + 7);
    };
    lamp(8, 114, s.indicator === -1 || s.indicator === 2 ? blinkOn : false, '#40ff60', '◄');
    lamp(24, 114, s.headlights, '#4aa0ff', 'HB');
    lamp(40, 114, s.handbrake, '#ff4a3a', 'P');
    lamp(56, 114, s.fuel < 0.15, '#ffb030', 'F');
    lamp(72, 114, s.damage > 50, '#ffb030', '!');
    lamp(88, 114, s.slip > 0.14, '#ffb030', 'ABS');
    lamp(120, 114, s.overspeed, '#ff4a3a', '120');
    lamp(104, 114, s.wiper || s.rain > 0.2, '#40e0ff', 'W');
    lamp(220, 114, s.indicator === 1 || s.indicator === 2 ? blinkOn : false, '#40ff60', '►');
    this.clusterTex.needsUpdate = true;
    // info screen
    const h = this.infoCanvas.getContext('2d')!;
    h.imageSmoothingEnabled = false;
    h.fillStyle = '#06131a'; h.fillRect(0, 0, 128, 64);
    h.fillStyle = '#1e5a78'; h.fillRect(0, 0, 128, 10);
    h.fillStyle = '#d8f4ff'; h.font = '8px monospace'; h.textAlign = 'left';
    h.fillText(tr.radioTitle, 3, 8);
    h.fillStyle = '#40ffd0'; h.font = '9px monospace';
    h.fillText(s.radio ? tr.radioStation : tr.radioIdle, 4, 24);
    h.fillStyle = '#7aa'; h.fillText(s.navText, 4, 38);
    h.fillStyle = '#ffb030'; h.fillText(`${s.hourText}   ${s.rain > 0.2 ? tr.rain : tr.clear}`, 4, 54);
    this.infoTex.needsUpdate = true;
  }
}
