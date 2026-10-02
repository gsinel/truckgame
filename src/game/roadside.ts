import { RoadGraph, REdge } from './roads';
import { ROADSIDE_STOPS, VILLAGES, PROVINCE_BY_ID, RoadsideStop } from './regions';
import { groundHeight } from './elevation';
import { tr, upper } from './i18n';
import { M } from './textures';
import {
  Ctx, warehouse, house, shop, tree, bench, bin, picnic, fenceLine, barrels, busStop,
  parkedCar, silo, haybale, vending, containerStack, tractor,
} from './props';
import { board, flagPole, mosque } from './turkishProps';
import { light, ServiceLocation } from './regionalWorld';
import type { Location, Poi } from './world';

/**
 * Roadside life on the long corridors.
 *
 * `ROADSIDE_STOPS` (regions.ts) and the corridor villages (`VILLAGES` with a
 * `road`/`at` anchor) are data; this module turns them into geometry, on the
 * exact road station they were authored against, so a sign can never point at
 * something that is not there. Fuel pumps and garages register with the same
 * `world.pumps` / `world.services` lists the core uses, so refuelling and repair
 * work identically out on the D-roads.
 *
 * Each site is built inside one vertical push (props place themselves with
 * real world x/z), which keeps colliders, footprints and lamps honest.
 */

export interface RoadsideOut {
  locations: Record<string, Location>;
  pumps: { x: number; z: number }[];
  services: ServiceLocation[];
  pois: Poi[];
}

/** Frame whose local +z points from (x,z) towards (tx,tz). */
const facing = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);

function groundAt(c: Ctx, x: number, z: number) { const y = groundHeight(x, z); c.B.push(0, y, 0); c.D.push(0, y, 0); }
function lift(c: Ctx) { c.B.pop(); c.D.pop(); }

/** Board planted on the ground at a world position (owns its own y offset). */
function groundBoard(c: Ctx, x: number, z: number, ry: number, text: string, w: number, h: number, y: number) {
  c.B.push(0, groundHeight(x, z), 0);
  board(c, x, z, ry, text, w, h, y, 'local');
  c.B.pop();
}

const edgeFor = (g: RoadGraph, key: string) => g.edges.find(q => q.key === key);

/**
 * Long edges carry guard rails through their curves. A yard needs a straight,
 * rail-free stretch, so walk outwards from the authored fraction until the road
 * runs straight for the whole approach.
 */
function straightSpot(g: RoadGraph, e: REdge, s0: number): number {
  const straight = (s: number) => {
    for (let d = -80; d <= 140; d += 20) {
      const a = g.station(e, Math.max(2, Math.min(e.len - 2, s + d)));
      const b = g.station(e, Math.max(3, Math.min(e.len - 1, s + d + 6)));
      if (Math.abs(a.dx * b.dz - a.dz * b.dx) > 0.010) return false;
    }
    return true;
  };
  for (let step = 0; step <= 12; step++) {
    for (const dir of step === 0 ? [0] : [1, -1]) {
      const s = Math.max(70, Math.min(e.len - 70, s0 + dir * step * 45));
      if (straight(s)) return s;
    }
  }
  return Math.max(70, Math.min(e.len - 70, s0));
}

/* ------------------------------------------------------------------ */
/*  Fuel station                                                       */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Fuel station                                                       */
/* ------------------------------------------------------------------ */

function fuelStation(c: Ctx, g: RoadGraph, stop: RoadsideStop, out: RoadsideOut) {
  const e = edgeFor(g, stop.road);
  if (!e) return;
  const s = straightSpot(g, e, e.len * stop.at);
  const p = g.station(e, s);
  const side = stop.side;
  const off = e.w / 2 + 22;
  const cx = p.x + p.rx * side * off, cz = p.z + p.rz * side * off;
  const toRoad = facing(cx, cz, p.x, p.z);
  const px = Math.sin(toRoad), pz = Math.cos(toRoad);   // +z points at the road
  const rx = Math.cos(toRoad), rz = -Math.sin(toRoad);  // +x runs along the road
  /** `d` m along the road, `zl` m from the yard centre (positive = towards the road). */
  const at = (d: number, zl: number) => ({ x: cx + rx * d + px * zl, z: cz + rz * d + pz * zl });
  groundAt(c, cx, cz);

  // forecourt and the apron that ties it to the shoulder
  c.B.plane(54, 42, M.asphaltLight, cx, 0.07, cz, 0x9fa1a3, { tu: 5, ry: toRoad });
  const ap = at(0, 15);
  c.B.plane(20, 14, M.concrete, ap.x, 0.05, ap.z, 0xa8a9a6, { tu: 3, ry: toRoad });
  c.B.plane(1.4, 6, M.markWhite, ap.x, 0.09, ap.z, 0xe8e8e0, { ry: toRoad });

  // canopy over two pump islands
  for (const dx of [-13.5, 13.5]) for (const dz of [0.5, 11.5]) {
    const q = at(dx, dz);
    c.B.cyl(0.26, 0.26, 6.4, 10, M.metal, q.x, 0, q.z, 0xd6d8d4);
    c.col.addCircle(q.x, q.z, 0.32, 'column');
  }
  const cnp = at(0, 6);
  c.B.box(32, 0.55, 17, M.paint, cnp.x, 6.4, cnp.z, 0xf2ede2, { ry: toRoad });
  const fascia = at(0, 14.7);
  c.B.box(32.3, 0.65, 0.5, M.paint, fascia.x, 6.1, fascia.z, 0xc5342d, { ry: toRoad });
  c.B.box(30, 0.34, 1.2, M.stationLight, cnp.x, 6.95, cnp.z, 0xffedd8, { ry: toRoad });
  for (const ix of [-7, 7]) {
    const isl = at(ix, 6);
    c.B.box(1.5, 0.18, 13, M.concrete, isl.x, 0.1, isl.z, 0xbfc2be, { ry: toRoad });
    for (const iz of [2, 10]) {
      const q = at(ix, iz);
      c.B.box(0.95, 2.0, 0.9, M.paint, q.x, 0.2, q.z, 0x2f6bb0, { ry: toRoad });
      c.B.box(1.15, 0.16, 1.1, M.concrete, q.x, 0.1, q.z, 0x9aa0a4, { ry: toRoad });
      c.B.box(0.06, 0.55, 0.75, M.screen, q.x + px * 0.6, 1.25, q.z + pz * 0.6, 0xffffff, { ry: toRoad });
      c.D.torus(0.26, 0.03, M.rubber, q.x + px * 1.2, 0.75, q.z + pz * 1.2, 0x222222, { ry: Math.PI / 2 });
      c.B.colBox(1.2, 1.2, q.x, q.z, toRoad, 'pump');
      out.pumps.push({ x: q.x, z: q.z });
    }
  }
  c.lamps.push({ x: cnp.x, y: groundHeight(cx, cz) + 6.6, z: cnp.z });

  // market at the back of the yard, facing the road
  const mk = at(0, -20);
  shop(c, mk.x, mk.z, toRoad, 18, 11, 1, 0xf0e6d0);
  c.B.box(20, 0.5, 13, M.concrete, mk.x, 3.5, mk.z, 0xc8c4b8, { ry: toRoad });
  const sb = at(0, -13.4);
  board(c, sb.x, sb.z, toRoad, tr.diesel, 5, 1.0, 4.2, 'shop');
  const wcb = at(5.8, -13.6);
  board(c, wcb.x, wcb.z, toRoad + Math.PI / 2, tr.toilet, 2.4, 0.9, 2.2, 'local');
  const v1 = at(-5.6, -13.4), v2 = at(-7.0, -13.4), bn = at(9.6, -13.6);
  vending(c, v1.x, v1.z, toRoad, 0xc82a2a);
  vending(c, v2.x, v2.z, toRoad, 0x2a5ea0);
  bin(c, bn.x, bn.z, toRoad, true);
  // truck bays on the far side of the forecourt
  for (let i = 0; i <= 5; i++) {
    const q = at(i * 4.8 - 12, -7);
    c.B.box(0.12, 0.02, 8, M.markWhite, q.x, 0.08, q.z, 0xe8e8e0, { ry: toRoad });
  }
  const f0 = at(-24, -20), f1 = at(24, -20);
  fenceLine(c, f0.x, f0.z, f1.x, f1.z, 'chain', false);
  for (let i = 0; i < 7; i++) { const q = at(i * 7 - 21, -26); tree(c, 'poplar', q.x, q.z, 1.15, false); }
  const l0 = at(-24, 8), l1 = at(24, 8);
  light(c, l0.x, l0.z, 9);
  light(c, l1.x, l1.z, 9);
  lift(c);

  // signage on the highway: advance board, then the station board
  const pa = g.station(e, Math.max(40, s - 340));
  groundBoard(c, pa.x + pa.rx * side * (e.w / 2 + 5), pa.z + pa.rz * side * (e.w / 2 + 5), toRoad + Math.PI, tr.fuelSign, 5.6, 1.5, 3.4);
  groundBoard(c, p.x + p.rx * side * (e.w / 2 + 4), p.z + p.rz * side * (e.w / 2 + 4), toRoad, tr.fuelSign, 6.4, 1.7, 4.2);

  out.services.push({ id: stop.id, provinceId: stop.provinceId, name: stop.name, kind: 'fuel', x: cx, z: cz, r: 30 });
  out.pois.push({ id: stop.id, name: stop.name, x: cx, z: cz, r: 70 });
}

/* ------------------------------------------------------------------ */
/*  Rest area                                                          */
/* ------------------------------------------------------------------ */

function restArea(c: Ctx, g: RoadGraph, stop: RoadsideStop, out: RoadsideOut) {
  const e = edgeFor(g, stop.road);
  if (!e) return;
  const s = straightSpot(g, e, e.len * stop.at);
  const p = g.station(e, s);
  const side = stop.side;
  const off = e.w / 2 + 26;
  const cx = p.x + p.rx * side * off, cz = p.z + p.rz * side * off;
  const toRoad = facing(cx, cz, p.x, p.z);
  const px = Math.sin(toRoad), pz = Math.cos(toRoad);   // +z points at the road
  const rx = Math.cos(toRoad), rz = -Math.sin(toRoad);  // +x runs along the road
  const at = (d: number, zl: number) => ({ x: cx + rx * d + px * zl, z: cz + rz * d + pz * zl });
  groundAt(c, cx, cz);

  c.B.plane(76, 44, M.asphaltLight, cx, 0.07, cz, 0x9b9d9f, { tu: 6, ry: toRoad });
  const ap = at(0, 16);
  c.B.plane(22, 16, M.concrete, ap.x, 0.05, ap.z, 0xa8a9a6, { tu: 3, ry: toRoad });
  c.B.plane(1.4, 8, M.markWhite, ap.x, 0.09, ap.z, 0xe8e8e0, { ry: toRoad });
  // truck bays
  for (let i = 0; i <= 8; i++) {
    const q = at(i * 4.6 - 18.4, -6);
    c.B.box(0.12, 0.02, 11, M.markWhite, q.x, 0.08, q.z, 0xe8e8e0, { ry: toRoad });
  }
  // diner, toilets, prayer room
  const dn = at(-24, -14);
  shop(c, dn.x, dn.z, toRoad, 22, 12, 1, 0xf1e9d6);
  c.B.box(24, 0.55, 14, M.concrete, dn.x, 4.2, dn.z, 0xc8c4b8, { ry: toRoad });
  const dnb = at(-24, -7.4);
  board(c, dnb.x, dnb.z, toRoad, tr.restFacility, 8, 1.5, 4.4, 'shop');
  const wc = at(20, -12);
  c.B.box(4.4, 2.9, 3.4, M.concrete, wc.x, 0, wc.z, 0xc4c0b4, { ry: toRoad });
  const wcb = at(20, -10);
  board(c, wcb.x, wcb.z, toRoad, tr.toilet, 2.6, 1.0, 3.6, 'local');
  const pr = at(27, -13);
  c.B.box(9, 4.4, 7, M.plaster, pr.x, 0, pr.z, 0xefe8d4, { ry: toRoad });
  c.B.box(9.5, 0.5, 7.5, M.concrete, pr.x, 4.4, pr.z, 0xc0bcb0, { ry: toRoad });
  const prb = at(27, -9.3);
  board(c, prb.x, prb.z, toRoad, tr.prayerRoom, 3.6, 1.1, 3.7, 'shop');
  const fp = at(33, -13);
  flagPole(c, fp.x, fp.z, 10);
  // fountain (çeşme)
  const fw = at(12, -13);
  c.B.box(3.6, 1.7, 1.8, M.concrete, fw.x, 0, fw.z, 0xcfcabc, { ry: toRoad });
  c.B.box(4.0, 0.32, 2.2, M.concrete, fw.x, 1.7, fw.z, 0xb8b4a8, { ry: toRoad });
  c.B.box(0.5, 0.45, 0.45, M.metal, fw.x - px * 1.8, 1.15, fw.z - pz * 1.8, 0x8a9094, { ry: toRoad });
  // picnic terrace and playground behind the parking, under the trees
  for (let i = 0; i < 5; i++) { const q = at(i * 7 - 14, -28); picnic(c, q.x, q.z, toRoad); }
  for (let i = 0; i < 10; i++) { const q = at(i * 6.4 - 28, -34); tree(c, i % 3 === 0 ? 'oak' : 'pine', q.x, q.z, 1.15, false); }
  const pg = at(-10, -30);
  c.B.box(9, 0.3, 0.3, M.metal, pg.x, 2.7, pg.z, 0x4a7fb0, { ry: toRoad + Math.PI / 2 });
  for (const dz of [-4, 4]) c.B.box(0.24, 2.7, 0.24, M.metal, pg.x, 0, pg.z + dz, 0x4a7fb0);
  c.B.box(2.8, 1.3, 1.6, M.paint, pg.x, 0, pg.z, 0xd2a02a, { ry: toRoad });
  for (let i = 0; i < 3; i++) { const q = at(-14 - i * 3, -30); c.B.cyl(0.5, 0.5, 0.3, 10, M.rubber, q.x, 0.12, q.z, 0x303030); }
  const b0 = at(-6, -24), b1 = at(6, -24), bn = at(16, -22);
  bench(c, b0.x, b0.z, toRoad + Math.PI / 2);
  bench(c, b1.x, b1.z, toRoad - Math.PI / 2);
  bin(c, bn.x, bn.z, toRoad, true);
  const l0 = at(-32, 6), l1 = at(32, 6);
  light(c, l0.x, l0.z, 9);
  light(c, l1.x, l1.z, 9);
  for (let i = 0; i < 3; i++) { const q = at(-34 + i * 5.2, 3); parkedCar(c, q.x, q.z, toRoad + Math.PI / 2); }
  const f0 = at(-38, -22), f1 = at(38, -22);
  fenceLine(c, f0.x, f0.z, f1.x, f1.z, 'wire', false);
  lift(c);

  const pa = g.station(e, Math.max(40, s - 340));
  groundBoard(c, pa.x + pa.rx * side * (e.w / 2 + 5), pa.z + pa.rz * side * (e.w / 2 + 5), toRoad + Math.PI, tr.restSign, 5.6, 1.5, 3.4);
  groundBoard(c, p.x + p.rx * side * (e.w / 2 + 4), p.z + p.rz * side * (e.w / 2 + 4), toRoad, tr.restSign, 6.4, 1.7, 4.2);

  out.services.push({ id: stop.id, provinceId: stop.provinceId, name: stop.name, kind: 'rest', x: cx, z: cz, r: 34 });
  out.pois.push({ id: stop.id, name: stop.name, x: cx, z: cz, r: 70 });
}

/* ------------------------------------------------------------------ */
/*  Roadside garage                                                    */
/* ------------------------------------------------------------------ */

function roadGarage(c: Ctx, g: RoadGraph, stop: RoadsideStop, out: RoadsideOut) {
  const e = edgeFor(g, stop.road);
  if (!e) return;
  const s = straightSpot(g, e, e.len * stop.at);
  const p = g.station(e, s);
  const side = stop.side;
  const off = e.w / 2 + 20;
  const cx = p.x + p.rx * side * off, cz = p.z + p.rz * side * off;
  const toRoad = facing(cx, cz, p.x, p.z);
  const px = Math.sin(toRoad), pz = Math.cos(toRoad);   // +z points at the road
  const rx = Math.cos(toRoad), rz = -Math.sin(toRoad);  // +x runs along the road
  const at = (d: number, zl: number) => ({ x: cx + rx * d + px * zl, z: cz + rz * d + pz * zl });
  groundAt(c, cx, cz);

  c.B.plane(50, 34, M.slab, cx, 0.07, cz, 0xb0b1ab, { tu: 4, ry: toRoad });
  const ap = at(0, 13);
  c.B.plane(20, 12, M.concrete, ap.x, 0.05, ap.z, 0xa8a9a6, { tu: 3, ry: toRoad });
  c.B.plane(1.4, 6, M.markWhite, ap.x, 0.09, ap.z, 0xe8e8e0, { ry: toRoad });
  const gb = at(0, -16);
  warehouse(c, gb.x, gb.z, toRoad, 25, 14, 6.6, 0xc9c5b8, 2);
  const gbd = at(0, -8.6);
  board(c, gbd.x, gbd.z, toRoad, tr.serviceSign, 7.4, 1.3, 5.2, 'shop');
  for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) {
    const q = at(i * 1.5 - 9, -8);
    c.D.cyl(0.55, 0.55, 0.34, 12, M.rubber, q.x, 0.34 * j, q.z, 0x282828);
  }
  const bl = at(13, -8), cs = at(18, -9), bn = at(20, -10);
  barrels(c, bl.x, bl.z, 4);
  containerStack(c, cs.x, cs.z, toRoad, 1, 1);
  bin(c, bn.x, bn.z, toRoad, true);
  for (let i = 0; i < 2; i++) { const q = at(i ? 18 : -18, 6); light(c, q.x, q.z, 8); }
  lift(c);

  const pa = g.station(e, Math.max(40, s - 300));
  groundBoard(c, pa.x + pa.rx * side * (e.w / 2 + 5), pa.z + pa.rz * side * (e.w / 2 + 5), toRoad + Math.PI, tr.serviceSign, 5.6, 1.5, 3.4);
  groundBoard(c, p.x + p.rx * side * (e.w / 2 + 4), p.z + p.rz * side * (e.w / 2 + 4), toRoad, tr.serviceSign, 6.4, 1.7, 4.2);

  out.services.push({ id: stop.id, provinceId: stop.provinceId, name: stop.name, kind: 'garage', x: cx, z: cz, r: 18 });
  out.pois.push({ id: stop.id, name: stop.name, x: cx, z: cz, r: 70 });
}

function corridorVillage(c: Ctx, g: RoadGraph, v: { id: string; displayName: string; provinceId: string; road?: string; at?: number }, out: RoadsideOut) {
  if (!v.road || v.at === undefined) return;
  const e = edgeFor(g, v.road);
  if (!e) return;
  const s = straightSpot(g, e, e.len * v.at);
  const p = g.station(e, s);
  const side = v.id.length % 2 === 0 ? 1 : -1;
  const plate = PROVINCE_BY_ID[v.provinceId]?.plateCode || '05';
  const along = (d: number) => ({ x: p.x + p.dx * d, z: p.z + p.dz * d });
  const lat = (a: { x: number; z: number }, off: number) => ({ x: a.x + p.rx * off, z: a.z + p.rz * off });
  const wall = [0xf2e6cc, 0xe6c8a2, 0xd6e2c8, 0xf4eeda, 0xcdbcab][v.id.length % 5];
  const roof = [0xc0603f, 0xa04a34, 0x80604c, 0xb8704a][v.id.length % 4];
  groundAt(c, p.x, p.z);
  // houses on both sides of the through road, village centre, school, co-op yard
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const a = along(i * 27 + 9);
    const back = lat(a, side * (27 + (i % 2 ? 5 : 0)));
    house(c, back.x, back.z, facing(back.x, back.z, a.x, a.z), 10 + (i % 3), 8.5, i % 2 ? 2 : 1, wall, roof);
    const front = lat(along(i * 27 + 9), -side * (25 + (i % 3) * 4));
    house(c, front.x, front.z, facing(front.x, front.z, a.x, a.z), 9.5 + ((i + 1) % 3), 8, ((i + 1) % 2) + 1, wall, roof);
    if (i % 2 === 0) tree(c, 'poplar', lat(a, side * 44).x, lat(a, side * 44).z, 1.15, false);
  }
  const cA = along(-6), cB = lat(cA, side * 34);
  mosque(c, cB.x, cB.z, facing(cB.x, cB.z, cA.x, cA.z));
  const shA = along(23), shP = lat(shA, side * 32);
  shop(c, shP.x, shP.z, facing(shP.x, shP.z, shA.x, shA.z), 13, 9, 1, 0xefe3c8);
  const scA = along(-44), scP = lat(scA, -side * 32);
  warehouse(c, scP.x, scP.z, facing(scP.x, scP.z, scA.x, scA.z), 19, 11, 4.6, 0xdcd6c2, 0);
  board(c, scP.x + Math.sin(facing(scP.x, scP.z, scA.x, scA.z)) * 6, scP.z + Math.cos(facing(scP.x, scP.z, scA.x, scA.z)) * 6,
    facing(scP.x, scP.z, scA.x, scA.z), tr.villageSchool, 5.6, 1.2, 4.0, 'local');
  flagPole(c, scP.x - side * 9, scP.z - side * 4, 10);
  const coA = along(58), coP = lat(coA, side * 40);
  silo(c, coP.x, coP.z, 2.4, 12);
  silo(c, coP.x + 5.4, coP.z, 2.4, 12);
  haybale(c, coP.x - 6, coP.z + 3);
  haybale(c, coP.x - 6, coP.z + 6.4);
  tractor(c, coP.x + 9, coP.z + 5, 0.4);
  fenceLine(c, coP.x - 4, coP.z - 6, coP.x + 14, coP.z - 6, 'wire', false);
  const sh2 = lat(along(-30), side * 8.5);
  busStop(c, sh2.x, sh2.z, facing(sh2.x, sh2.z, along(-30).x, along(-30).z));
  bin(c, sh2.x, sh2.z + 2, 0);
  const inA = along(-88);
  groundBoard(c, inA.x + p.rx * side * (e.w / 2 + 5), inA.z + p.rz * side * (e.w / 2 + 5),
    facing(inA.x + p.rx * side * (e.w / 2 + 5), inA.z + p.rz * side * (e.w / 2 + 5), inA.x, inA.z), `${upper(v.displayName)}|${plate}`, 5.8, 1.6, 3.2);
  for (let i = 0; i < 4; i++) {
    const f = lat(along(-64 + i * 48), side * (74 + (i % 2) * 16));
    c.B.plane(36, 26, i % 2 ? M.fieldGold : M.fieldGreen, f.x, 0.05, f.z, 0xffffff, { tu: 6, ry: facing(f.x, f.z, cA.x, cA.z) });
  }
  for (let i = 0; i < 10; i++) {
    const t = lat(along(-72 + i * 19), -side * (62 + (i % 3) * 13));
    tree(c, i % 2 ? 'oak' : 'poplar', t.x, t.z, 1.1, false);
  }
  lift(c);
  out.pois.push({ id: v.id, name: v.displayName, x: p.x, z: p.z, r: 90 });
}

/* ------------------------------------------------------------------ */
/*  Entry point                                                        */
/* ------------------------------------------------------------------ */
export function buildRoadside(c: Ctx, g: RoadGraph): RoadsideOut {
  const out: RoadsideOut = { locations: {}, pumps: [], services: [], pois: [] };
  for (const stop of ROADSIDE_STOPS) {
    if (stop.kind === 'fuel') fuelStation(c, g, stop, out);
    else if (stop.kind === 'rest') restArea(c, g, stop, out);
    else roadGarage(c, g, stop, out);
  }
  for (const v of VILLAGES) corridorVillage(c, g, v, out);
  return out;
}
