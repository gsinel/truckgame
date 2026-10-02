import * as THREE from 'three';
import { RoadGraph, REdge, RNode, SPEC, approachGroup } from './roads';
import { makeVehicle, CAR_COLORS, CarStyle, VehicleKind } from './vehicles';
import { trafficPhase } from './textures';
import { Circle, DynBody } from './physics';
import { Colliders } from './batch';
import { groundHeight, roadPitch } from './elevation';

interface Next { e: REdge; dir: number }
interface TV {
  kind: VehicleKind;
  model: THREE.Object3D;
  e: REdge; dir: number; s: number; next: Next | null;
  x: number; z: number; h: number; speed: number;
  laneIdx: number; limitMul: number;
  crashT: number; blockT: number; ghostT: number;
  vx: number; vz: number; mass: number;
  offs: [number, number][]; r: number; halfLen: number;
  body: DynBody;
}

const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export class Traffic {
  vehicles: TV[] = [];
  group = new THREE.Group();
  private protos: { kind: VehicleKind; g: THREE.Object3D }[] = [];
  time = 0;
  constructor(private g: RoadGraph, count = 26, private collisions?: Colliders) {
    const styles: CarStyle[] = ['hatch', 'sedan', 'suv', 'wagon'];
    for (let i = 0; i < 10; i++) this.protos.push({ kind: 'car', g: makeVehicle('car', CAR_COLORS[i % CAR_COLORS.length], styles[i % 4]) });
    for (const c of [0xf0f0ec, 0x2a5aa0, 0xd8a020]) this.protos.push({ kind: 'van', g: makeVehicle('van', c) });
    for (const [a, b] of [[0xc83828, 0xe8e8e4], [0x2a5aa0, 0xdcdcd0], [0x2f7d4f, 0xe8e8e4], [0xd8a020, 0x7a8ca0]])
      this.protos.push({ kind: 'truck', g: makeVehicle('truck', a, 'hatch', b) });
    this.protos.push({ kind: 'bus', g: makeVehicle('bus', 0x256c85) });
    this.protos.push({ kind: 'minibus', g: makeVehicle('minibus', 0xf1ede1) });
    for (let i = 0; i < count; i++) this.spawn(0, 0, 0, 1e9, true);
  }

  private pickKind(): VehicleKind {
    const r = Math.random();
    return r < 0.45 ? 'car' : r < 0.62 ? 'van' : r < 0.78 ? 'truck' : r < 0.90 ? 'minibus' : 'bus';
  }

  private spawn(px: number, pz: number, minD: number, maxD: number, initial = false, reuse?: TV) {
    const g = this.g;
    for (let tries = 0; tries < 30; tries++) {
      const e = g.edges[Math.floor(Math.random() * g.edges.length)];
      if (e.len < 30) continue;
      const w = e.type === 'highway' ? 1 : e.type === 'ring' ? 0.2 : 0.6;
      if (Math.random() > w) continue;
      const dir = e.oneWay ? 1 : Math.random() < 0.5 ? 1 : -1;
      const s = 12 + Math.random() * (e.len - 24);
      const p = g.sample(e, s);
      const d = Math.hypot(p.x - px, p.z - pz);
      if (!initial && (d < minD || d > maxD)) continue;
      if (initial && Math.hypot(p.x + 150, p.z + 105) < 90) continue;
      if (this.vehicles.some((v) => v !== reuse && Math.hypot(v.x - p.x, v.z - p.z) < 14)) continue;
      const kind: VehicleKind = reuse ? reuse.kind : initial ? (['car', 'van', 'truck', 'minibus', 'bus'] as VehicleKind[])[this.vehicles.length % 5] : this.pickKind();
      const heavy = kind === 'truck' || kind === 'bus';
      const small = kind === 'car';
      const choices = this.protos.filter((q) => q.kind === kind);
      const proto = choices[Math.floor(Math.random() * choices.length)];
      const lanes = SPEC[e.type].lanes;
      const laneIdx = e.oneWay ? 0 : heavy ? lanes.length - 1 : Math.floor(Math.random() * lanes.length);
      const v: TV = reuse || ({} as TV);
      if (!reuse) {
        v.model = proto.g.clone();
        this.group.add(v.model);
      }
      Object.assign(v, {
        kind, e, dir, s, next: null, speed: 0, laneIdx,
        limitMul: (heavy ? 0.82 : 0.95) * (0.9 + Math.random() * 0.2),
        crashT: 0, blockT: 0, ghostT: 0, vx: 0, vz: 0,
        mass: small ? 1500 : heavy ? 10000 : 3000,
        offs: small ? [[1.0, 1.15], [-1.0, 1.15]] : !heavy ? [[1.5, 1.25], [-1.5, 1.25]] : [[3.9, 1.4], [1.3, 1.4], [-1.3, 1.4], [-3.9, 1.4]],
        r: small ? 1.15 : heavy ? 1.4 : 1.25,
        halfLen: small ? 2.2 : heavy ? 5.2 : 2.7,
      });
      if (reuse && v.model.parent !== this.group) this.group.add(v.model);
      const off = this.offset(e, dir, laneIdx);
      v.x = p.x + -p.dz * dir * off;
      v.z = p.z + p.dx * dir * off;
      v.h = Math.atan2(p.dx * dir, p.dz * dir);
      v.speed = initial ? SPEC[e.type].limit * 0.6 : SPEC[e.type].limit * 0.7;
      v.body = { circles: [], vx: 0, vz: 0, mass: v.mass, onHit: (nx, nz, imp) => this.hit(v, nx, nz, imp) };
      if (!reuse) this.vehicles.push(v);
      this.sync(v);
      return;
    }
  }

  private hit(v: TV, nx: number, nz: number, imp: number) {
    v.crashT = 5 + Math.min(6, imp);
    void nx; void nz;
  }

  /** lateral offset (to the right of travel) for a lane */
  private offset(e: REdge, dir: number, laneIdx: number) {
    const lanes = SPEC[e.type].lanes;
    void dir;
    return lanes[Math.min(laneIdx, lanes.length - 1)];
  }

  private chooseNext(v: TV): Next {
    const node: RNode = v.dir > 0 ? v.e.b : v.e.a;
    const cur = this.g.sample(v.e, v.dir > 0 ? v.e.len - 0.5 : 0.5);
    const cdx = cur.dx * v.dir, cdz = cur.dz * v.dir;
    const cands: { n: Next; w: number }[] = [];
    for (const ne of node.edges) {
      if (ne === v.e) continue;
      let dir = 0;
      if (ne.a === node && ne.b !== node) dir = 1;
      else if (ne.b === node && ne.a !== node && !ne.oneWay) dir = -1;
      if (!dir) continue;
      const p = this.g.sample(ne, dir > 0 ? 0.5 : ne.len - 0.5);
      const ang = Math.acos(Math.max(-1, Math.min(1, cdx * p.dx * dir + cdz * p.dz * dir)));
      cands.push({ n: { e: ne, dir }, w: Math.exp(-ang * ang * 0.8) + 0.12 });
    }
    if (!cands.length) return { e: v.e, dir: -v.dir }; // dead end: U-turn
    let sum = cands.reduce((a, c) => a + c.w, 0), r = Math.random() * sum;
    for (const c of cands) {
      r -= c.w;
      if (r <= 0) return c.n;
    }
    return cands[0].n;
  }

  private pathPoint(v: TV, d: number) {
    const g = this.g;
    let e = v.e, dir = v.dir, s = v.s;
    const rem = dir > 0 ? e.len - s : s;
    let lane = v.laneIdx;
    if (d > rem) {
      if (!v.next) v.next = this.chooseNext(v);
      const n = v.next;
      e = n.e; dir = n.dir;
      const extra = d - rem;
      s = dir > 0 ? Math.min(e.len, extra) : Math.max(0, e.len - extra);
      lane = e.oneWay ? 0 : Math.min(lane, SPEC[e.type].lanes.length - 1);
    } else s = s + dir * d;
    const p = g.sample(e, s);
    const off = this.offset(e, dir, lane);
    return { x: p.x + -p.dz * dir * off, z: p.z + p.dx * dir * off };
  }

  update(dt: number, player: Circle[], px: number, pz: number, time: number) {
    this.time += dt;
    const g = this.g;
    const phase = trafficPhase(time);
    const others: { x: number; z: number; r: number; v?: TV }[] = [];
    for (const c of player) others.push({ x: c.x, z: c.z, r: c.r });
    for (const v of this.vehicles) for (const [o, r] of v.offs) others.push({ x: v.x + Math.sin(v.h) * o, z: v.z + Math.cos(v.h) * o, r, v });

    for (const v of this.vehicles) {
      const fx = Math.sin(v.h), fz = Math.cos(v.h);
      // ---- crashed / free body
      if (v.crashT > 0) {
        v.crashT -= dt;
        v.x += v.vx * dt; v.z += v.vz * dt;
        const k = Math.exp(-1.6 * dt);
        v.vx *= k; v.vz *= k;
        v.speed = 0;
        this.sync(v);
        if (Math.hypot(v.x - px, v.z - pz) > 700) this.respawn(v, px, pz);
        continue;
      }
      v.vx = fx * v.speed; v.vz = fz * v.speed;

      const e = v.e;
      const limit = SPEC[e.type].limit * v.limitMul;
      let vmax = limit;
      const remain = v.dir > 0 ? e.len - v.s : v.s;
      // upcoming node handling
      const node: RNode = v.dir > 0 ? e.b : e.a;
      if (remain < 45) {
        if (!v.next) v.next = this.chooseNext(v);
        const ne = v.next;
        const p0 = g.sample(e, v.dir > 0 ? e.len - 1 : 1);
        const p1 = g.sample(ne.e, ne.dir > 0 ? 1 : ne.e.len - 1);
        const ang = Math.abs(wrap(Math.atan2(p1.dx * ne.dir, p1.dz * ne.dir) - Math.atan2(p0.dx * v.dir, p0.dz * v.dir)));
        if (ang > 0.35) vmax = Math.min(vmax, 5.5 + (remain / 45) * 5);
        else if (node.edges.length >= 3 && node.R > 0) vmax = Math.min(vmax, 9 + (remain / 45) * 4);
        if (ang > 2.5) vmax = Math.min(vmax, 3);
        // traffic lights
        if (node.light) {
          const grp = approachGroup(p0.dx * v.dir, p0.dz * v.dir);
          const st = grp === 'A' ? phase[0] : phase[1];
          const stopD = node.R + 7.2;
          if (st !== 0 && remain > stopD - 1.5) {
            const dist = remain - stopD;
            const canGo = st === 1 && dist < v.speed * 1.4 + 3;
            if (!canGo) vmax = Math.min(vmax, Math.sqrt(2 * 3.2 * Math.max(0, dist - 0.25)));
          }
        }
      }
      // obstacles ahead
      let blocked = false;
      if (v.ghostT > 0) v.ghostT -= dt;
      else {
        const look = 7 + v.speed * 2.2;
        for (const o of others) {
          if (o.v === v) continue;
          const rx = o.x - v.x, rz = o.z - v.z;
          const ahead = rx * fx + rz * fz;
          if (ahead < 0.5 || ahead > look + o.r) continue;
          const lat = Math.abs(rx * fz - rz * fx);
          if (lat > o.r + 1.5) continue;
          if (o.v && Math.cos(o.v.h - v.h) < -0.3 && lat > 1.8) continue; // oncoming in other lane
          const gap = ahead - o.r - v.halfLen - 1.2;
          const allow = Math.sqrt(Math.max(0, 2 * 3.6 * Math.max(0, gap)));
          if (allow < vmax) vmax = allow;
          if (gap < 3) blocked = true;
        }
      }
      if (blocked && v.speed < 0.5) {
        v.blockT += dt;
        if (v.blockT > 7) { v.ghostT = 4; v.blockT = 0; }
      } else if (!blocked) v.blockT = 0;

      if (this.collisions) {
        const testDistance = v.halfLen + 2 + v.speed * 0.65;
        this.collisions.query(v.x + fx * testDistance, v.z + fz * testDistance, v.r * 0.8, () => { vmax = 0; });
      }
      const acc = v.kind === 'truck' || v.kind === 'bus' ? 1.0 : 1.9;
      if (v.speed < vmax) v.speed = Math.min(vmax, v.speed + acc * dt);
      else v.speed = Math.max(vmax, v.speed - 4.8 * dt);

      // ---- advance along path (pure pursuit)
      v.s += v.dir * v.speed * dt;
      if ((v.dir > 0 && v.s >= e.len) || (v.dir < 0 && v.s <= 0)) {
        const over = v.dir > 0 ? v.s - e.len : -v.s;
        const n = v.next || this.chooseNext(v);
        v.e = n.e; v.dir = n.dir;
        v.s = n.dir > 0 ? over : n.e.len - over;
        v.s = Math.max(0, Math.min(v.e.len, v.s));
        v.next = null;
      }
      const look = 4.5 + v.speed * 0.55;
      const t = this.pathPoint(v, look);
      const want = Math.atan2(t.x - v.x, t.z - v.z);
      const maxTurn = Math.max(0.2, v.speed / (v.kind === 'truck' || v.kind === 'bus' ? 6 : 3.2)) * 0.9;
      const dh = wrap(want - v.h);
      v.h = wrap(v.h + Math.max(-maxTurn * dt, Math.min(maxTurn * dt, dh * 3 * dt + Math.sign(dh) * 0)));
      v.x += Math.sin(v.h) * v.speed * dt;
      v.z += Math.cos(v.h) * v.speed * dt;
      // keep s consistent with actual position (re-project)
      let best = v.s, bd = 1e9;
      for (let k = -4; k <= 4; k++) {
        const ss = Math.max(0, Math.min(v.e.len, v.s + k * 1.5));
        const pp = g.sample(v.e, ss);
        const d = Math.hypot(pp.x - v.x, pp.z - v.z);
        if (d < bd) { bd = d; best = ss; }
      }
      v.s = best * 0.5 + v.s * 0.5;
      if (bd > 18) v.s = best;
      this.sync(v);
      if (Math.hypot(v.x - px, v.z - pz) > 700) this.respawn(v, px, pz);
    }
  }

  private respawn(v: TV, px: number, pz: number) {
    this.spawn(px, pz, 160, 480, false, v);
  }

  private sync(v: TV) {
    v.model.position.set(v.x, groundHeight(v.x, v.z) + 0.10, v.z);
    v.model.rotation.set(roadPitch(v.x, v.z, v.h), v.h, 0, 'YXZ');
  }

  dynBodies(): DynBody[] {
    const out: DynBody[] = [];
    for (const v of this.vehicles) {
      const fx = Math.sin(v.h), fz = Math.cos(v.h);
      v.body.circles = v.offs.map(([o, r]) => ({ x: v.x + fx * o, z: v.z + fz * o, r }));
      v.body.vx = v.vx; v.body.vz = v.vz;
      out.push(v.body);
    }
    return out;
  }
  /** called after physics (bodies may have been nudged / given velocity) */
  syncFromBodies() {
    for (const v of this.vehicles) {
      if (v.body.vx !== v.vx || v.body.vz !== v.vz) {
        v.vx = v.body.vx; v.vz = v.body.vz;
      }
      const c = v.body.circles[0];
      if (c && v.crashT > 0) {
        const fx = Math.sin(v.h), fz = Math.cos(v.h);
        v.x = c.x - fx * v.offs[0][0];
        v.z = c.z - fz * v.offs[0][0];
      }
    }
  }
}
