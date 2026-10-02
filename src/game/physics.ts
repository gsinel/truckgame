import { Colliders } from './batch';
import { TRUCK } from './truckModel';
import { bus } from './events';

export interface Circle { x: number; z: number; r: number }
export interface DynBody {
  circles: Circle[];
  vx: number; vz: number; mass: number;
  onHit?: (nx: number, nz: number, impact: number) => void;
}
export interface DriveInput { up: boolean; down: boolean; left: boolean; right: boolean; handbrake: boolean }

const G = [0, 3.4, 5.6, 8.4, 12, 16, 20.5, 24.5, 28]; // speed (m/s) at 2000 rpm
const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const sgn = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);

export class TruckSim {
  x = 0; z = 0; heading = 0;
  vx = 0; vz = 0; yawRate = 0;
  steerIn = 0; steerAngle = 0;
  throttle = 0; brake = 0;
  handbrake = true;
  reverse = false;
  gear = 1; rpm = 700; shiftTimer = 0; stillTimer = 0;
  trailerYaw = 0;
  trailerMass = 7000; cargoKg = 0;
  fuel = 150; fuelCap = 250; damage = 0;
  distance = 0;
  wheelSpin = 0;
  pitch = 0; pitchV = 0; roll = 0; rollV = 0; bounce = 0; trailerRoll = 0; trailerRollV = 0;
  vf = 0; vl = 0; aLong = 0; aLat = 0; slip = 0;
  crashCooldown = 0; wet = 0;
  lastImpact = 0;
  lastContactTime = -Infinity;
  fuelEmptyFired = false; fuelLowFired = false;
  time = 0;
  engineOn = true;

  get mass() { return 8500 + this.trailerMass + this.cargoKg; }
  get speedKmh() { return Math.abs(this.vf) * 3.6; }
  get fwd() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }
  get right() { return { x: -Math.cos(this.heading), z: Math.sin(this.heading) }; }
  get left() { return { x: Math.cos(this.heading), z: -Math.sin(this.heading) }; }
  get hitch() {
    const f = this.fwd;
    return { x: this.x + f.x * TRUCK.fifth, z: this.z + f.z * TRUCK.fifth };
  }
  get trailerFwd() { return { x: Math.sin(this.trailerYaw), z: Math.cos(this.trailerYaw) }; }
  get trailerCenter() {
    const h = this.hitch, t = this.trailerFwd;
    return { x: h.x - t.x * 6.7, z: h.z - t.z * 6.7 };
  }
  get tankPoint() {
    const f = this.fwd, l = this.left;
    return { x: this.x + f.x * TRUCK.tank.z + l.x * TRUCK.tank.x, z: this.z + f.z * TRUCK.tank.z + l.z * TRUCK.tank.x };
  }

  reset(x: number, z: number, heading: number) {
    this.x = x; this.z = z; this.heading = heading; this.trailerYaw = heading;
    this.vx = this.vz = 0; this.yawRate = 0; this.steerIn = 0; this.steerAngle = 0;
    this.throttle = this.brake = 0; this.vf = 0; this.vl = 0; this.gear = 1; this.reverse = false;
  }

  circles(): Circle[] {
    const f = this.fwd, h = this.hitch, t = this.trailerFwd;
    const out: Circle[] = [];
    for (const [o, r] of [[4.15, 1.3], [2.8, 1.35], [1.4, 1.35], [0.0, 1.3]]) out.push({ x: this.x + f.x * o, z: this.z + f.z * o, r });
    for (const o of [1.6, 4.2, 6.8, 9.4, 12.0]) out.push({ x: h.x - t.x * o, z: h.z - t.z * o, r: 1.3 });
    return out;
  }

  update(dt: number, inp: DriveInput, col: Colliders, dyn: DynBody[], frozen: boolean) {
    this.time += dt;
    const m = this.mass;
    const fwd = this.fwd, right = this.right;
    let vf = this.vx * fwd.x + this.vz * fwd.z;
    let vl = this.vx * right.x + this.vz * right.z;

    /* ---------- driver intent (automatic direction) ---------- */
    let thr = 0, brk = 0;
    if (frozen) {
      brk = 1;
    } else {
      if (Math.abs(vf) < 0.4) this.stillTimer += dt;
      else this.stillTimer = 0;
      if (inp.up) {
        if (vf < -0.7) brk = 1;
        else { thr = 1; this.reverse = false; }
      }
      if (inp.down) {
        if (vf > 0.7) brk = 1;
        else if (Math.abs(vf) < 0.7) {
          if (this.stillTimer > 0.25 || this.reverse) { thr = 1; this.reverse = true; }
          else brk = 1;
        } else { thr = 1; this.reverse = true; }
      }
      if (inp.up && inp.down) { thr = 0; brk = 1; }
      if (thr > 0 && this.handbrake) this.handbrake = false;
    }
    this.throttle += (thr - this.throttle) * Math.min(1, dt * (thr > this.throttle ? 1.6 : 4));
    this.brake += (brk - this.brake) * Math.min(1, dt * 4);

    /* ---------- engine & gearbox ---------- */
    const vAbs = Math.abs(vf);
    if (this.reverse) this.gear = 0;
    else if (this.gear === 0) this.gear = 1;
    const g = this.reverse ? 1 : this.gear;
    this.rpm = Math.max(650, Math.min(2300, (vAbs / G[g]) * 2000));
    if (this.engineOn && this.fuel > 0) this.rpm = Math.max(this.rpm, 680 + this.throttle * 120);
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    if (!this.reverse && this.shiftTimer <= 0) {
      if (this.gear < 8 && this.rpm > 1760 && this.throttle > 0.1) { this.gear++; this.shiftTimer = 0.55; }
      else if (this.gear > 1 && this.rpm < 880 && vAbs > 0.2) { this.gear--; this.shiftTimer = 0.35; }
      else if (this.gear > 1 && vAbs < 2.5) this.gear = 1;
    }
    const sh = this.rpm < 1100 ? 0.55 + 0.45 * ((this.rpm - 650) / 450) : this.rpm < 1800 ? 1 : Math.max(0.5, 1 - (this.rpm - 1800) / 1100);
    let fDrive = 0;
    const canDrive = this.fuel > 0 && this.engineOn;
    if (canDrive) {
      if (this.reverse) fDrive = this.throttle * Math.min(36000, 150000 / Math.max(vAbs, 1.5)) * (vAbs > 5.5 ? 0 : 1);
      else {
        fDrive = this.throttle * Math.min(40000 * sh, (270000 * sh) / Math.max(vAbs, 1.5));
        if (vAbs > 25.5) fDrive *= Math.max(0, 1 - (vAbs - 25.5) / 2);
      }
      if (this.shiftTimer > 0.1) fDrive *= 0.1;
      fDrive *= 1 - 0.4 * (this.damage / 100);
      // wet traction cap
      const tractionCap = m * 9.81 * 0.28 * (this.wet > 0.5 ? 0.7 : 1);
      fDrive = Math.min(fDrive, tractionCap * 1.8);
    }
    const dirSign = this.reverse ? -1 : 1;
    const aDrive = (dirSign * fDrive) / m;
    const roll = 0.008 * 9.81;
    const aero = (3.42 * vf * vf) / m;
    let resist = roll + aero + (this.throttle < 0.02 ? 0.28 : 0.0) * (canDrive ? 1 : 0.4);
    const brakeDecel = this.brake * (4.8 - this.wet * 1.3) + (this.handbrake ? 3.2 : 0);
    const aRes = -sgn(vf) * (resist + brakeDecel);
    let vfNew = vf + (aDrive + aRes) * dt;
    if (vf !== 0 && sgn(vfNew) !== sgn(vf) && Math.abs(aDrive) < Math.abs(aRes)) vfNew = 0;
    if (Math.abs(vfNew) < 0.05 && this.throttle < 0.02) vfNew = 0;
    this.aLong = (vfNew - vf) / Math.max(dt, 1e-4);

    /* ---------- steering ---------- */
    const target = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
    const rate = target === 0 ? 2.4 : 1.5;
    if (frozen) this.steerIn += (0 - this.steerIn) * Math.min(1, dt * 3);
    else this.steerIn += Math.max(-rate * dt, Math.min(rate * dt, target - this.steerIn));
    const maxSteer = 0.07 + 0.62 / (1 + Math.pow(vAbs / 7, 2));
    const wantAngle = this.steerIn * maxSteer;
    this.steerAngle += Math.max(-1.1 * dt, Math.min(1.1 * dt, wantAngle - this.steerAngle));
    let yawT = (vfNew / TRUCK.wheelbase) * Math.tan(this.steerAngle);
    const aLatMax = 4.4 - this.wet * 1.4;
    this.slip = 0;
    if (Math.abs(vfNew * yawT) > aLatMax) {
      yawT = (sgn(yawT) * aLatMax) / Math.max(Math.abs(vfNew), 0.1);
      this.slip = Math.min(1, Math.abs(vfNew) / 12);
    }
    this.yawRate += (yawT - this.yawRate) * Math.min(1, dt * 3.2);
    const oldFwd = { x: fwd.x, z: fwd.z };
    this.heading = wrap(this.heading + this.yawRate * dt);

    /* ---------- velocity (momentum, tyre grip) ---------- */
    let vx = this.vx + oldFwd.x * (vfNew - vf);
    let vz = this.vz + oldFwd.z * (vfNew - vf);
    const nf = this.fwd, nr = this.right;
    let vf2 = vx * nf.x + vz * nf.z;
    let vl2 = vx * nr.x + vz * nr.z;
    const grip = (5.2 - this.wet * 2.0) * (this.handbrake ? 0.35 : 1) * (1 - this.slip * 0.4);
    vl2 *= Math.exp(-grip * dt);
    vx = nf.x * vf2 + nr.x * vl2;
    vz = nf.z * vf2 + nr.z * vl2;
    this.vx = vx; this.vz = vz;
    this.vf = vf2; this.vl = vl2;
    this.aLat = this.yawRate * vf2;

    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.distance += Math.hypot(this.vx, this.vz) * dt;
    this.wheelSpin += (vf2 * dt) / TRUCK.wheelR;

    /* ---------- trailer (kingpin articulation) ---------- */
    const steps = 2;
    for (let i = 0; i < steps; i++) {
      const f = this.fwd, l = this.left;
      const vhx = this.vx + l.x * this.yawRate * TRUCK.fifth;
      const vhz = this.vz + l.z * this.yawRate * TRUCK.fifth;
      const lt = { x: Math.cos(this.trailerYaw), z: -Math.sin(this.trailerYaw) };
      const dpsi = ((vhx * lt.x + vhz * lt.z) / TRUCK.trailerPivot) * (dt / steps);
      this.trailerYaw = wrap(this.trailerYaw + dpsi);
      void f;
    }
    const rel = wrap(this.trailerYaw - this.heading);
    if (Math.abs(rel) > 1.45) this.trailerYaw = wrap(this.heading + Math.sign(rel) * 1.45);

    /* ---------- fuel ---------- */
    if (this.engineOn && this.fuel > 0) {
      // Phase 1 gameplay consumption is retained; the compressed map is not a real fuel-economy test.
      const used = (0.0008 + (0.0035 + 0.006 * this.throttle) * Math.abs(vf2)) * dt;
      this.fuel = Math.max(0, this.fuel - used);
    }
    const fr = this.fuel / this.fuelCap;
    if (fr < 0.15 && !this.fuelLowFired && this.fuel > 0) { this.fuelLowFired = true; bus.emit('FUEL_LOW', { fuel: this.fuel }); }
    if (fr > 0.25) this.fuelLowFired = false;
    if (this.fuel <= 0 && !this.fuelEmptyFired) { this.fuelEmptyFired = true; bus.emit('FUEL_EMPTY', {}); }
    if (this.fuel > 5) this.fuelEmptyFired = false;

    /* ---------- collisions ---------- */
    this.crashCooldown = Math.max(0, this.crashCooldown - dt);
    this.collide(col, dyn);

    /* ---------- suspension springs ---------- */
    const pT = -this.aLong * 0.011, rT = this.aLat * 0.0125;
    this.pitchV += (-46 * (this.pitch - pT) - 7.5 * this.pitchV) * dt;
    this.pitch += this.pitchV * dt;
    this.rollV += (-46 * (this.roll - rT) - 7.5 * this.rollV) * dt;
    this.roll += this.rollV * dt;
    const tAcc = vf2 * ((this.trailerYaw - this.heading) * 0.0 + this.yawRate) * 0.0095;
    this.trailerRollV += (-34 * (this.trailerRoll - tAcc) - 6 * this.trailerRollV) * dt;
    this.trailerRoll += this.trailerRollV * dt;
    const sp = Math.min(1, vAbs / 12);
    this.bounce = Math.sin(this.time * 17) * 0.004 * sp + Math.sin(this.time * 5.3) * 0.006 * sp + Math.sin(this.time * 31) * 0.0015 * (this.engineOn && this.fuel > 0 ? 1 : 0);
    this.pitch = Math.max(-0.08, Math.min(0.08, this.pitch));
    this.roll = Math.max(-0.1, Math.min(0.1, this.roll));
  }

  private collide(col: Colliders, dyn: DynBody[]) {
    for (let pass = 0; pass < 2; pass++) {
      const cs = this.circles();
      cs.forEach((c, idx) => {
        const trailer = idx >= 4;
        col.query(c.x, c.z, c.r, (h) => {
          if (h.pen > 0.005 && Math.hypot(this.vx, this.vz) > 0.25) this.lastContactTime = this.time;
          const k = trailer ? 0.7 : 1.0;
          this.x += h.nx * h.pen * k;
          this.z += h.nz * h.pen * k;
          const vn = this.vx * h.nx + this.vz * h.nz;
          if (vn < 0) {
            this.vx -= vn * h.nx * 1.12;
            this.vz -= vn * h.nz * 1.12;
            this.vx *= 0.985; this.vz *= 0.985;
            this.impact(-vn, h.c.tag || 'object', h.nx, h.nz, 1);
          }
        });
        for (const d of dyn) {
          for (const dc of d.circles) {
            const dx = c.x - dc.x, dz = c.z - dc.z;
            const dist = Math.hypot(dx, dz);
            const rr = c.r + dc.r;
            if (dist < rr && dist > 1e-4) {
              if (rr - dist > 0.005) this.lastContactTime = this.time;
              const nx = dx / dist, nz = dz / dist, pen = rr - dist;
              const wp = d.mass / (d.mass + this.mass); // player moves a bit too
              this.x += nx * pen * (0.25 + wp * 0.5);
              this.z += nz * pen * (0.25 + wp * 0.5);
              const rvx = this.vx - d.vx, rvz = this.vz - d.vz;
              const vn = rvx * nx + rvz * nz;
              if (vn < 0) {
                const j = (-(1.15) * vn) / (1 / this.mass + 1 / d.mass);
                this.vx += (j * nx) / this.mass; this.vz += (j * nz) / this.mass;
                d.vx -= (j * nx) / d.mass; d.vz -= (j * nz) / d.mass;
                const lightness = Math.min(1, d.mass / 9000);
                this.impact(-vn * (0.35 + 0.4 * lightness), 'vehicle', nx, nz, 0.7);
                d.onHit?.(-nx, -nz, -vn);
              }
              dc.x -= nx * pen * 0.7; dc.z -= nz * pen * 0.7;
            }
          }
        }
      });
    }
  }

  private impact(v: number, what: string, nx: number, nz: number, scale: number) {
    this.lastImpact = v;
    if (v < 1.6) return;
    const dmg = Math.pow(v - 1.0, 1.4) * 0.7 * scale;
    this.damage = Math.min(100, this.damage + dmg);
    if (v > 4 && this.crashCooldown <= 0) {
      this.crashCooldown = 1.5;
      bus.emit('PLAYER_CRASHED', { speed: v * 3.6, what, damage: this.damage });
      if (what === 'vehicle') bus.emit('TRAFFIC_ACCIDENT', { speed: v * 3.6 });
    }
    void nx; void nz;
  }
}
