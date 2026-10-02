import * as THREE from 'three';
import { World, Location } from './world';
import { TruckModel } from './truckModel';
import { TruckSim } from './physics';
import { Navigator, Route } from './nav';
import { Batcher } from './batch';
import { M, rnd, pick } from './textures';
import { bus } from './events';
import { ui, toast, notify } from './store';
import { tr, t, money as formatMoney, number } from './i18n';
import { CONTRACTS } from './regions';
import { groundHeight } from './elevation';
import { readProfile, writeProfile, PLAYER_TRUCK } from './profile';
export { PLAYER_TRUCK } from './profile';

export type CargoType = 'pallets' | 'machinery' | 'goods';
export interface Job {
  id: string; title: string; cargo: CargoType; cargoName: string; weight: number;
  from: string; to: string; km: number; reward: number; xp: number; blurb: string;
  appearance?: 'produce' | 'grain' | 'textile';
}

/* ------------------------------ economy ------------------------------ */
/** AC-26 — persistence. Money, XP/level and truck ownership survive a restart.
 *  Position, active job, fuel and damage are intentionally NOT persisted (Phase 1). */
export function loadProfile() {
  try {
    const s = readProfile(localStorage);
    if (s) {
      ui.money = typeof s.money === 'number' ? s.money : 2500;
      ui.xp = s.xp || 0;
      ui.level = s.level || 1;
      ui.xpNext = 300 + ui.level * 150;
      ui.truckOwned = s.truckOwned !== false;
      ui.truckId = s.truckId || PLAYER_TRUCK;
    }
  } catch { toast(tr.saveError, 'warn'); }
}
export function saveProfile() {
  try {
    writeProfile(localStorage, { money: ui.money, xp: ui.xp, level: ui.level,
      truckOwned: ui.truckOwned, truckId: ui.truckId || PLAYER_TRUCK, v: 1 });
  } catch { toast(tr.saveError, 'warn'); }
}
export function addMoney(v: number) { ui.money = Math.round(ui.money + v); saveProfile(); }
export function addXP(v: number) {
  ui.xp += v;
  while (ui.xp >= ui.xpNext) {
    ui.xp -= ui.xpNext;
    ui.level++;
    ui.xpNext = 300 + ui.level * 150;
    bus.emit('LEVEL_UP', { level: ui.level });
    toast(t('levelUp', { level: number(ui.level) }), 'good');
  }
  saveProfile();
}

/* ------------------------------ job board ------------------------------ */
const DEFS: Omit<Job, 'km' | 'reward'>[] = CONTRACTS;

export function buildJobs(world: World, nav: Navigator): Job[] {
  return DEFS.map((d) => {
    const a = world.locations[d.from], b = world.locations[d.to];
    if (!a || !b) throw new Error(`Invalid contract endpoints: ${d.id}`);
    const r = nav.route(a, b);
    const km = r.length / 1000;
    const reward = Math.round((350 + km * 780 + d.weight / 1000 * 58) / 10) * 10;
    return { ...d, km, reward };
  });
}

/* ------------------------------ cargo visuals ------------------------------ */
function makePiece(type: CargoType, appearance?: Job['appearance']): THREE.Group {
  const b = new Batcher(1e9, 0, true, null);
  if (type === 'pallets') {
    b.box(1.2, 0.14, 0.8, M.wood, 0, 0, 0, 0xc8a070);
    for (let i = 0; i < 3; i++) b.box(1.2, 0.04, 0.12, M.wood, 0, 0.14, -0.3 + i * 0.3, 0xb89060);
    const col = pick([0x8a8e94, 0x6a7078, 0x7a6a58, 0x9a9ea4]);
    b.box(1.12, 1.15, 0.74, M.metal, 0, 0.16, 0, col);
    b.box(1.14, 0.05, 0.76, M.flat, 0, 0.5, 0, 0x2a6ab0);
    b.box(1.14, 0.05, 0.76, M.flat, 0, 0.95, 0, 0x2a6ab0);
    b.box(0.5, 0.25, 0.02, M.flat, 0, 0.7, 0.38, 0xf4f4ee);
    b.box(1.16, 1.18, 0.78, M.flat, 0, 0.15, 0, 0xdfe8f0, {});
  } else if (type === 'machinery') {
    b.box(1.7, 0.3, 2.3, M.wood, 0, 0, 0, 0x9a7a50);
    b.box(1.6, 0.4, 2.2, M.metal, 0, 0.3, 0, 0x30343a);
    b.box(1.5, 1.2, 1.6, M.paint, 0, 0.7, -0.2, 0xe0a812);
    b.box(1.52, 0.2, 1.62, M.hazard, 0, 0.7, -0.2, 0xffffff, { tu: 1 });
    b.box(1.2, 0.5, 0.7, M.paint, 0, 1.9, -0.3, 0xd09a10);
    b.cyl(0.35, 0.45, 0.5, 10, M.metal, 0.2, 2.0, 0.6, 0x8a9096);
    b.box(0.5, 0.7, 0.3, M.paint, -0.5, 0.7, 1.0, 0x30343a);
    b.box(0.3, 0.2, 0.02, M.screen, -0.5, 1.1, 1.16, 0xffffff);
    b.box(0.1, 0.8, 0.1, M.metal, 0.7, 1.9, 0.8, 0x30343a);
    b.box(1.7, 0.03, 0.05, M.flat, 0, 0.3, 0, 0x1a3a7a);
  } else if (appearance === 'produce') {
    b.box(1.2, 0.14, 1.1, M.wood, 0, 0, 0, 0xc8a070);
    for (let level = 0; level < 3; level++) {
      const y = 0.14 + level * 0.35;
      b.box(1.1, 0.04, 1.05, M.wood, 0, y, 0, 0xc9a06c);
      for (const s of [-1, 1]) {
        b.box(1.1, 0.3, 0.045, M.crate, 0, y, s * 0.50, 0xd3ad76);
        b.box(0.045, 0.3, 1.05, M.crate, s * 0.53, y, 0, 0xd3ad76);
      }
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        b.ico(0.10, 1, M.paint, -0.38 + i * 0.25, y + 0.18, -0.33 + j * 0.30, (i + j) % 3 ? 0xae3d28 : 0xb8be57);
      }
    }
  } else if (appearance === 'grain') {
    b.box(1.2, 0.14, 1.1, M.wood, 0, 0, 0, 0xc8a070);
    for (let k = 0; k < 2; k++) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      b.ico(0.26, 1, M.fabric, -0.29 + i * 0.58, 0.4 + k * 0.52, -0.27 + j * 0.54, 0xf0d59e, {}, 1.16);
    }
  } else if (appearance === 'textile') {
    b.box(1.2, 0.14, 1.1, M.wood, 0, 0, 0, 0xc8a070);
    b.box(1.1, 1.1, 1.03, M.fabric, 0, 0.14, 0, 0xbac5d9);
    for (const x of [-0.3, 0.3]) b.box(0.045, 1.12, 1.06, M.flat, x, 0.14, 0, 0x71877a);
  } else {
    b.box(1.2, 0.14, 1.1, M.wood, 0, 0, 0, 0xc8a070);
    for (let k = 0; k < 3; k++) {
      b.box(1.1, 0.42, 1.05, M.cardboard, 0, 0.14 + k * 0.43, 0, 0xffffff, { tu: 1.05, ry: k * 0.12 });
    }
    b.box(1.14, 0.03, 1.09, M.flat, 0, 0.6, 0, 0xe0e8ee);
  }
  const g = b.toGroup();
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : 0));
  return g;
}
const COUNT: Record<CargoType, number> = { pallets: 12, machinery: 3, goods: 8 };

function trailerSlots(type: CargoType, n: number) {
  const out: { x: number; z: number; ry: number }[] = [];
  if (type === 'machinery') for (let i = 0; i < n; i++) out.push({ x: 0, z: -3.6 - i * 3.5, ry: 0 });
  else {
    const rows = Math.ceil(n / 2), sp = type === 'pallets' ? 1.0 : 1.25;
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / 2), c = i % 2;
      out.push({ x: c ? 0.64 : -0.64, z: -7.0 + ((rows - 1) / 2 - r) * sp, ry: type === 'pallets' ? Math.PI / 2 : 0 });
    }
  }
  return out;
}
function stackSlots(loc: Location, type: CargoType, n: number) {
  const a = { x: Math.sin(loc.heading), z: Math.cos(loc.heading) }, l = { x: Math.cos(loc.heading), z: -Math.sin(loc.heading) };
  const out: { x: number; z: number; ry: number }[] = [];
  if (type === 'machinery') {
    for (let i = 0; i < n; i++) {
      const lon = (i - (n - 1) / 2) * 3.4;
      out.push({ x: loc.stack.x + a.x * lon, z: loc.stack.z + a.z * lon, ry: loc.heading });
    }
  } else {
    const rows = Math.ceil(n / 2), sp = type === 'pallets' ? 1.3 : 1.35;
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / 2), c = i % 2, lon = (r - (rows - 1) / 2) * sp, lat = c ? 0.75 : -0.75;
      out.push({ x: loc.stack.x + a.x * lon + l.x * lat, z: loc.stack.z + a.z * lon + l.z * lat, ry: loc.heading + (type === 'pallets' ? Math.PI / 2 : 0) });
    }
  }
  return out;
}

/* --------------------------- parking evaluation --------------------------- */
const wrapPi = (a: number) => {
  while (a > Math.PI / 2) a -= Math.PI;
  while (a < -Math.PI / 2) a += Math.PI;
  return a;
};
export function evaluateParking(loc: Location, sim: TruckSim) {
  const c = sim.trailerCenter;
  const dx = c.x - loc.x, dz = c.z - loc.z;
  const ax = Math.sin(loc.heading), az = Math.cos(loc.heading);
  const lon = dx * ax + dz * az;
  const lat = dx * az - dz * ax; // lateral
  const ang = Math.abs(wrapPi(sim.trailerYaw - loc.heading));
  const tractorAng = Math.abs(wrapPi(sim.heading - loc.heading));
  const score = Math.max(0, Math.min(100, 100 - Math.abs(lat) * 17 - Math.abs(lon) * 7 - ang * 57 * 1.1 - tractorAng * 57 * 0.25));
  const inZone = Math.abs(lat) < 3.3 && Math.abs(lon) < 5.6 && ang < 0.5;
  return { score, lat, lon, ang: ang * 57.3, inZone, dist: Math.hypot(dx, dz) };
}

interface Anim {
  piece: THREE.Group; from: THREE.Vector3; to: () => THREE.Vector3; yawFrom: number; yawTo: number;
  t0: number; dur: number; done: boolean; slot: { x: number; z: number; ry: number }; toTrailer: boolean;
}

function disposeCargo(piece: THREE.Group) {
  piece.parent?.remove(piece);
  piece.traverse(object => { if ((object as THREE.Mesh).isMesh) (object as THREE.Mesh).geometry.dispose(); });
}

export class Missions {
  jobs: Job[] = [];
  active: Job | null = null;
  phase: 'none' | 'toPickup' | 'loading' | 'toDest' | 'unloading' = 'none';
  route: Route | null = null;
  routeTimer = 0;
  pieces: THREE.Group[] = [];
  anims: Anim[] = [];
  animT = 0;
  beacon = new THREE.Group();
  ropes: THREE.Mesh[] = [];
  private dmgStart = 0;
  /** damage accumulated while manoeuvring inside the target zone (AC-13: collision is scored) */
  private approachDmg = 0;
  private approachTime = 0;
  private approachArmed = false;
  private hadContact = false;
  private pendingResult: any = null;
  private cleanup: { t: number; pieces: THREE.Group[] }[] = [];
  private beaconRing: THREE.Mesh;
  private beaconBeam: THREE.Mesh;

  constructor(private world: World, private scene: THREE.Scene, private truck: TruckModel, private sim: TruckSim, private nav: Navigator) {
    this.jobs = buildJobs(world, nav);
    ui.jobs = this.jobs;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 70, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }),
    );
    beam.position.y = 35;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.4, 0.12, 6, 28),
      new THREE.MeshBasicMaterial({ color: 0xffb020, fog: false }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    this.beacon.add(beam, ring);
    this.beaconBeam = beam;
    this.beaconRing = ring;
    this.beacon.visible = false;
    scene.add(this.beacon);
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 5), new THREE.MeshBasicMaterial({ color: 0x222222 }));
      r.visible = false;
      scene.add(r);
      this.ropes.push(r);
    }
  }

  get pickup() { return this.active ? this.world.locations[this.active.from] : null; }
  get dest() { return this.active ? this.world.locations[this.active.to] : null; }
  get target(): Location | null {
    if (this.phase === 'toPickup' || this.phase === 'loading') return this.pickup;
    if (this.phase === 'toDest' || this.phase === 'unloading') return this.dest;
    return null;
  }

  accept(id: string) {
    if (this.active) { toast(tr.finishFirst, 'warn'); return false; }
    const job = this.jobs.find((j) => j.id === id);
    if (!job) return false;
    this.active = job;
    this.phase = 'toPickup';
    this.dmgStart = this.sim.damage;
    this.approachArmed = false; this.hadContact = false;
    this.spawnStack(job);
    ui.job = job;
    ui.phase = this.phase;
    bus.emit('DELIVERY_ACCEPTED', { job: job.id, cargo: job.cargoName, from: job.from, to: job.to, reward: job.reward });
    toast(t('jobAccepted', { cargo: job.title, location: this.pickup!.short }), 'good');
    this.setBeacon(0xffb020);
    this.routeTimer = 0;
    notify();
    return true;
  }

  private spawnStack(job: Job) {
    const loc = this.world.locations[job.from];
    const n = COUNT[job.cargo];
    this.pieces = [];
    for (const s of stackSlots(loc, job.cargo, n)) {
      const p = makePiece(job.cargo, job.appearance);
      p.position.set(s.x, groundHeight(s.x, s.z) + 0.045, s.z);
      p.rotation.y = s.ry;
      this.scene.add(p);
      this.pieces.push(p);
    }
  }

  cancel() {
    if (!this.active) return;
    const loaded = this.phase === 'toDest' || this.phase === 'unloading';
    bus.emit('DELIVERY_FAILED', { job: this.active.id, reason: 'cancelled' });
    toast(loaded ? t('jobCancelledLoaded', { cost: formatMoney(300) }) : tr.jobCancelled, 'bad');
    if (loaded) addMoney(-300);
    this.clearPieces();
    this.sim.cargoKg = 0;
    this.active = null;
    this.phase = 'none';
    this.route = null;
    this.beacon.visible = false;
    ui.job = null; ui.phase = 'none'; ui.parking = null; ui.distRemain = 0; ui.navTarget = ''; ui.parkHint = ''; ui.loadProgress = 0;
    this.approachArmed = false; this.hadContact = false;
    notify();
  }

  private clearPieces() {
    for (const p of this.pieces) disposeCargo(p);
    this.pieces = [];
    this.anims = [];
    this.ropes.forEach((r) => (r.visible = false));
  }

  private setBeacon(color: number) {
    (this.beaconBeam.material as THREE.MeshBasicMaterial).color.setHex(color);
    (this.beaconRing.material as THREE.MeshBasicMaterial).color.setHex(color);
  }

  /** returns an interaction prompt (and optionally action) for the HUD */
  update(dt: number, time: number): { text: string; run: () => void } | null {
    // cleanup fading pieces
    for (const c of this.cleanup) {
      c.t -= dt;
      if (c.t < 1) c.pieces.forEach((p) => p.scale.setScalar(Math.max(0.001, c.t)));
      if (c.t <= 0) c.pieces.forEach(disposeCargo);
    }
    this.cleanup = this.cleanup.filter((c) => c.t > 0);

    const tgt = this.target;
    if (!tgt || !this.active) { this.beacon.visible = false; ui.parking = null; return null; }
    this.beacon.visible = true;
    this.beacon.position.set(tgt.x, groundHeight(tgt.x, tgt.z), tgt.z);
    this.beacon.rotation.y = time * 0.8;
    this.beaconRing.scale.setScalar(1 + Math.sin(time * 3) * 0.04);
    (this.beaconBeam.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.sin(time * 2) * 0.05;

    // navigation
    this.routeTimer -= dt;
    if (this.routeTimer <= 0) {
      this.routeTimer = 1.2;
      this.route = this.nav.route({ x: this.sim.x, z: this.sim.z }, { x: tgt.x, z: tgt.z });
    }
    if (this.route) ui.distRemain = Navigator.remaining(this.route, this.sim.x, this.sim.z);
    ui.navTarget = tgt.name;

    const pe = evaluateParking(tgt, this.sim);
    const slow = Math.abs(this.sim.vf) < 1.0 && Math.hypot(this.sim.vx, this.sim.vz) < 1.0;
    ui.parking = pe.dist < 45 && (this.phase === 'toPickup' || this.phase === 'toDest') ? { score: Math.round(pe.score), lat: pe.lat, lon: pe.lon, ang: pe.ang, inZone: pe.inZone } : null;

    // AC-13 — arm a contact baseline when the truck starts manoeuvring near the zone,
    // so any collision during the approach/penalty is reflected in the parking grade.
    if (pe.dist < 48) {
      if (!this.approachArmed) { this.approachArmed = true; this.approachDmg = this.sim.damage; this.approachTime = this.sim.time; }
      if (this.sim.damage - this.approachDmg > 0.4 || this.sim.lastContactTime >= this.approachTime) this.hadContact = true;
    } else if (pe.dist > 70) {
      this.approachArmed = false;
    }
    if (ui.parking) { ui.parking.contact = this.hadContact; if (this.hadContact) ui.parking.score = Math.min(52, ui.parking.score); }

    if (this.phase === 'loading' || this.phase === 'unloading') {
      this.runAnims(dt);
      return null;
    }
    if (pe.inZone && slow) {
      ui.parkHint = '';
      if (this.phase === 'toPickup') return { text: t('loadCargo', { cargo: this.active.cargoName }), run: () => this.startLoading() };
      return { text: t('unloadCargo', { score: Math.round(this.hadContact ? Math.min(52, pe.score) : pe.score) }), run: () => this.startUnloading() };
    }
    if (pe.dist < 22 && !(pe.inZone && slow)) {
      if (!pe.inZone) {
        const hint = Math.abs(pe.lat) > 3.3 ? tr.parkAlign : pe.ang > 28 ? tr.parkStraighten : tr.parkCenter;
        ui.prompt = '';
        ui.parkHint = hint;
      } else ui.parkHint = tr.parkStop;
    } else ui.parkHint = '';
    return null;
  }

  private startLoading() {
    this.phase = 'loading';
    ui.phase = 'loading';
    const job = this.active!;
    const slots = trailerSlots(job.cargo, this.pieces.length);
    this.anims = this.pieces.map((p, i) => {
      const slot = slots[i];
      return {
        piece: p, from: p.position.clone(),
        to: () => this.truck.cargo.localToWorld(new THREE.Vector3(slot.x, 0, slot.z)),
        yawFrom: p.rotation.y, yawTo: slot.ry + this.sim.trailerYaw,
        t0: i * 0.7, dur: 2.0, done: false, slot, toTrailer: true,
      };
    });
    this.animT = 0;
    this.sim.handbrake = true;
    toast(tr.loadProgress, 'info');
  }

  private startUnloading() {
    const job = this.active!;
    const dest = this.dest!;
    const pe = evaluateParking(dest, this.sim);
    this.pendingResult = { pe };
    this.phase = 'unloading';
    ui.phase = 'unloading';
    const slots = stackSlots(dest, job.cargo, this.pieces.length);
    // pieces currently in trailer: detach into world space
    this.anims = this.pieces.map((p, i) => {
      const wp = new THREE.Vector3();
      p.getWorldPosition(wp);
      this.scene.attach(p);
      const s = slots[i];
      return {
        piece: p, from: wp, to: () => new THREE.Vector3(s.x, groundHeight(s.x, s.z) + 0.045, s.z),
        yawFrom: p.rotation.y, yawTo: s.ry, t0: (this.pieces.length - 1 - i) * 0.7, dur: 2.0, done: false, slot: s, toTrailer: false,
      };
    });
    this.animT = 0;
    this.sim.handbrake = true;
    toast(tr.unloadProgress, 'info');
  }

  private runAnims(dt: number) {
    this.animT += dt;
    let doneCount = 0;
    let ropeI = 0;
    for (const a of this.anims) {
      if (a.done) { doneCount++; continue; }
      const k = (this.animT - a.t0) / a.dur;
      if (k < 0) continue;
      if (k >= 1) {
        a.done = true;
        doneCount++;
        if (a.toTrailer) {
          this.truck.cargo.add(a.piece);
          a.piece.position.set(a.slot.x, 0, a.slot.z);
          a.piece.rotation.set(0, a.slot.ry, 0);
        } else {
          a.piece.position.copy(a.to());
          a.piece.rotation.y = a.yawTo;
        }
        continue;
      }
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const to = a.to();
      const lift = Math.sin(Math.min(1, k) * Math.PI) * 4.2;
      a.piece.position.set(a.from.x + (to.x - a.from.x) * e, a.from.y + (to.y - a.from.y) * e + lift, a.from.z + (to.z - a.from.z) * e);
      let dy = a.yawTo - a.yawFrom;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      a.piece.rotation.y = a.yawFrom + dy * e;
      if (ropeI < this.ropes.length) {
        const r = this.ropes[ropeI++];
        r.visible = true;
        const top = groundHeight(a.piece.position.x, a.piece.position.z) + 16;
        const h = Math.max(0.5, top - a.piece.position.y - 1.6);
        r.scale.set(1, h, 1);
        r.position.set(a.piece.position.x, a.piece.position.y + 1.6 + h / 2, a.piece.position.z);
      }
    }
    for (let i = ropeI; i < this.ropes.length; i++) this.ropes[i].visible = false;
    ui.loadProgress = this.anims.length ? doneCount / this.anims.length : 1;
    if (doneCount === this.anims.length) {
      this.ropes.forEach((r) => (r.visible = false));
      if (this.phase === 'loading') this.finishLoading();
      else this.finishUnloading();
    }
  }

  private finishLoading() {
    const job = this.active!;
    this.sim.cargoKg = job.weight;
    this.phase = 'toDest';
    this.approachArmed = false; this.hadContact = false;
    ui.phase = 'toDest';
    this.routeTimer = 0;
    this.setBeacon(0x40ff80);
    bus.emit('CARGO_LOADED', { job: job.id, cargo: job.cargoName, weight: job.weight });
    toast(t('loaded', { weight: number(job.weight / 1000, 1), location: this.dest!.name }), 'good');
    ui.loadProgress = 0;
    notify();
  }

  private finishUnloading() {
    const job = this.active!;
    const pe = this.pendingResult.pe;
    const score = pe.score as number;
    const dmg = Math.max(0, this.sim.damage - this.dmgStart);
    // collision during the parking manoeuvre caps the achievable grade
    const contact = this.hadContact;
    // a collision during the manoeuvre can never grade higher than "OK"
    const finalScore = contact ? Math.min(score, 52) : score;
    const finalGrade = finalScore >= 85 ? 'PERFECT' : finalScore >= 65 ? 'GOOD' : finalScore >= 40 ? 'OK' : 'POOR';
    const mult = finalGrade === 'PERFECT' ? 1.3 : finalGrade === 'GOOD' ? 1.1 : finalGrade === 'OK' ? 0.9 : 0.65;
    const xpMult = finalGrade === 'PERFECT' ? 1.4 : finalGrade === 'GOOD' ? 1.15 : finalGrade === 'OK' ? 1 : 0.7;
    const dmgPenalty = Math.min(0.5, dmg * 0.012);
    const money = Math.round((job.reward * mult * (1 - dmgPenalty)) / 10) * 10;
    const xp = Math.round(job.xp * xpMult * (1 - dmgPenalty * 0.5));
    addMoney(money);
    addXP(xp);
    if (finalScore >= 40) bus.emit('PARKING_SUCCESS', { score: finalScore, grade: finalGrade, lat: pe.lat, lon: pe.lon, contact });
    else bus.emit('PARKING_FAILED', { score: finalScore, grade: finalGrade, contact });
    bus.emit('DELIVERY_COMPLETED', { job: job.id, money, xp, grade: finalGrade, damage: dmg });
    ui.completion = {
      title: job.title, cargoName: job.cargoName, to: this.dest!.name, money, xp, grade: finalGrade, score: Math.round(finalScore),
      damage: Math.round(dmg), base: job.reward, penalty: Math.round(dmgPenalty * 100), contact,
    };
    this.cleanup.push({ t: 14, pieces: [...this.pieces] });
    this.pieces = [];
    this.anims = [];
    this.approachArmed = false;
    this.hadContact = false;
    this.sim.cargoKg = 0;
    this.active = null;
    this.phase = 'none';
    this.route = null;
    this.beacon.visible = false;
    ui.job = null; ui.phase = 'none'; ui.parking = null; ui.distRemain = 0; ui.navTarget = ''; ui.loadProgress = 0; ui.parkHint = '';
    notify();
  }
}
