import { RoadGraph, RNode } from './roads';
import { EXPANSION, CITY_GRID, CITY_STREETS, EXPANSION_ELEVATION, ExpansionCity, ExpansionVillage } from './regionAmasyaWest';
import { PROVINCE_BY_ID } from './regions';
import { groundHeight } from './elevation';
import { tr, upper } from './i18n';
import { M, srand, getSeed } from './textures';
import {
  Ctx, apartment, shop, warehouse, house, bin, bench, picnic, pallet, containerStack, barrels, parkedCar,
  silo, busStop, tree, fenceLine, tractor, haybale, vending, poleLine,
} from './props';
import { lorryInto } from './vehicles';
import { board, flagPole, mosque } from './turkishProps';
import { loadingMark, light, ServiceLocation } from './regionalWorld';
import type { Location, Poi } from './world';

/**
 * Phase 3B builder. Everything here consumes the data in regionAmasyaWest.ts and the
 * existing primitives (RoadGraph.connect, props, loadingMark, pump/garage conventions).
 */

/** Adds the expansion's nodes and roads to the existing road graph (before g.finalize()). */
export function extendExpansionNetwork(g: RoadGraph, ports: Record<string, RNode>) {
  for (const city of EXPANSION.cities) {
    for (const [key, dx, dz] of CITY_GRID) ports[`${city.id}.${key}`] = g.node(city.x + dx, city.z + dz, `${city.id}.${key}`);
    for (const [a, b] of CITY_STREETS) {
      const e = g.connect(ports[`${city.id}.${a}`], ports[`${city.id}.${b}`], 'town');
      e.key = `${city.id}.street.${a}.${b}`; e.provinceIds = [city.provinceId];
    }
    ports[`${city.id}.center`].light = true;
  }
  for (const v of EXPANSION.villages) ports[`${v.id}.center`] = g.node(v.x, v.z, `${v.id}.center`);
  for (const j of EXPANSION.junctions) ports[j.id] = g.node(j.x, j.z, j.id);
  for (const r of EXPANSION.roads) {
    const a = ports[r.from], b = ports[r.to];
    if (!a || !b) throw new Error(`Expansion road '${r.id}' references a missing node (${r.from} / ${r.to})`);
    const e = g.connect(a, b, r.type, r.via);
    e.key = r.id; e.provinceIds = [PROVINCE_BY_ID.amasya.id];
    if (r.routeCode) e.routeCode = r.routeCode;
  }
}

type Pump = { x: number; z: number };
interface Out { locations: Record<string, Location>; pumps: Pump[]; services: ServiceLocation[]; pois: Poi[] }

export function buildExpansion(c: Ctx, g: RoadGraph) {
  // Own random stream: the expansion must not re-roll the layout of the existing world.
  const saved = getSeed();
  srand(31337);
  const out: Out = { locations: {}, pumps: [], services: [], pois: [] };
  try {
    for (const city of EXPANSION.cities) buildCity(c, g, city, out);
    for (const v of EXPANSION.villages) buildVillage(c, g, v, out);
    buildRoadSigns(c, g);
    // Pole lines only where the terrain is the shared flat expansion elevation.
    for (const key of ['suluova-merzifon.west', 'suluova-merzifon.east']) poleRun(c, g, key, 1);
  } finally {
    srand(saved);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Cities                                                              */
/* ------------------------------------------------------------------ */
function buildCity(c: Ctx, g: RoadGraph, city: ExpansionCity, out: Out) {
  const def = EXPANSION.locations.find(l => l.cityId === city.id);
  if (!def) throw new Error(`Expansion city '${city.id}' has no cargo location`);
  const x = city.x, z = city.z, h = groundHeight(x, z);
  const food = def.industry === 'food';
  const hasFuel = city.fuelStations.length > 0, hasRest = city.restAreas.length > 0;
  const loc: Location = {
    id: def.id, name: def.name, short: city.displayName, x: x + 52, z: z - 48, heading: Math.PI / 2,
    stack: { x: x + 52, z: z - 64 }, kind: def.type, provinceId: def.provinceId, cityId: def.cityId,
    districtId: `${city.id}.merkez`, industry: def.industry,
  };

  c.B.push(0, h, 0); c.D.push(0, h, 0);
  c.B.plane(222, 222, M.pavement, x, 0.018, z, 0xb8b9b1, { tu: 4 });

  /* ---- NE block: cargo yard (same footprint family as the Phase 2 yards) ---- */
  c.B.plane(90, 96, M.slab, x + 57, 0.035, z - 55, 0xbbb8ae, { tu: 4 });
  warehouse(c, x + 55, z - 84, 0, 70, 24, 8.5, food ? 0xc9bd9c : 0x9da1a6, 3);
  board(c, x + 55, z - 71.85, 0, upper(def.name), 12, 1.3, 6.5);
  for (let i = 0; i < 4; i++) pallet(c, x + 20 + i * 1.8, z - 68, 0, i % 3);
  if (food) { silo(c, x + 98, z - 92, 2.5, 16); silo(c, x + 98, z - 84, 2.5, 16); }
  else containerStack(c, x + 90, z - 38, 0, 1, 2);
  bin(c, x + 89, z - 63, 0, true);
  barrels(c, x + 23, z - 85, 3);
  light(c, x + 18, z - 23); light(c, x + 96, z - 100);
  flagPole(c, x + 91, z - 12, 11);

  /* ---- NW block: shops and apartments ---- */
  shop(c, x - 37, z - 24, 0, 22, 12, 3, 0xf1ddba);
  shop(c, x - 79, z - 24, 0, 23, 12, 2, 0xe2ddd0);
  apartment(c, x - 30, z - 74, 0, 28, 16, food ? 5 : 6, 2);
  apartment(c, x - 80, z - 76, 0, 26, 16, 4, 1);
  parkedCar(c, x - 38, z - 42, Math.PI / 2); parkedCar(c, x - 50, z - 42, Math.PI / 2);
  busStop(c, x - 45, z + 8.5, Math.PI);
  bench(c, x - 93, z + 20, Math.PI / 2); bin(c, x - 89, z + 20);

  /* ---- SW block: rest area (if the city has one) or neighbourhood ---- */
  if (hasRest) {
    c.B.plane(70, 40, M.asphaltLight, x - 45, 0.05, z + 60, 0xb8b8b8, { tu: 4 });
    for (let k = 0; k < 6; k++) c.B.box(0.12, 0.02, 11, M.markWhite, x - 76 + k * 5.4, 0.06, z + 66, 0xe8e8e0);
    const lorry = (px: number, pz: number, cab: number, box: number) => {
      c.B.push(px, 0, pz, 0); lorryInto(c.B, cab, box); c.B.pop();
      c.col.addBox(px, pz, 1.3, 4.6, 0, 'lorry');
      c.foot.push({ x: px, z: pz, w: 2.6, d: 9.2, ry: 0, kind: 'lorry' });
    };
    lorry(x - 73.3, z + 66, 0xc83828, 0xe8e8e4); lorry(x - 67.9, z + 66, 0x2a5aa0, 0xdcdcd0); lorry(x - 62.5, z + 66, 0x2f7d4f, 0x7a8ca0);
    parkedCar(c, x - 57.1, z + 66, 0); parkedCar(c, x - 51.7, z + 66, 0);
    for (let i = 0; i < 3; i++) picnic(c, x - 42 + i * 12, z + 30, 0.2 * i);
    vending(c, x - 70, z + 22, 0, 0x2a5ea0); vending(c, x - 67.5, z + 22, 0, 0xc82a2a);
    bench(c, x - 20, z + 22, Math.PI); bin(c, x - 14, z + 30);
    shop(c, x - 31, z + 88, Math.PI, 20, 11, 1, 0xe0d8c4);
    board(c, x - 60, z + 36, Math.PI, tr.restBoard, 5, 1.2, 3.2);
    c.D.cyl(0.05, 0.06, 2.2, 6, M.metal, x - 24, 0, z + 24, 0x858b8e);
    c.D.box(0.8, 0.8, 0.04, M.signP, x - 24, 2.0, z + 24, 0xffffff, { ry: Math.PI });
    c.col.addCircle(x - 24, z + 24, 0.12, 'sign');
    for (const lx of [-70, -45, -20]) light(c, x + lx, z + 42);
    out.services.push({ id: city.restAreas[0], provinceId: city.provinceId, name: `${city.displayName} / ${tr.restSign}`, kind: 'rest', x: x - 45, z: z + 60, r: 22 });
  } else {
    mosque(c, x - 70, z + 57, -Math.PI / 2);
    house(c, x - 27, z + 28, Math.PI, 11, 9, 2, 0xe6d9be, 0xba6848);
    shop(c, x - 31, z + 80, Math.PI, 18, 11, 1, 0xebdec0);
    for (let i = 0; i < 2; i++) picnic(c, x - 31 + i * 11, z + 62, 0);
  }

  /* ---- SE block: fuel + garage, or houses and a mosque ---- */
  if (hasFuel) {
    const fx = x + 39, fz = z + 33;
    c.B.box(31, 0.38, 28, M.paint, fx, 5.7, fz, 0xf4eee2);
    c.B.box(31.1, 0.46, 0.25, M.paint, fx, 5.48, fz + 14, 0xc5342d);
    for (const dx of [-13, 13]) for (const dz of [-11, 11]) {
      c.B.cyl(0.18, 0.18, 5.7, 8, M.metal, fx + dx, 0, fz + dz, 0xd6d6cc);
      c.col.addCircle(fx + dx, fz + dz, 0.25, 'column');
    }
    c.B.box(1.1, 0.14, 10, M.concrete, fx + 4.5, 0, fz, 0xb8b8af);
    c.B.box(0.9, 1.8, 0.8, M.paint, fx + 4.5, 0.14, fz, 0xc72f29);
    c.B.box(0.05, 0.44, 0.6, M.screen, fx + 4.0, 1.18, fz, 0xffffff);
    c.B.box(0.05, 0.44, 0.6, M.screen, fx + 5.0, 1.18, fz, 0xffffff);
    c.D.torus(0.24, 0.025, M.rubber, fx + 3.9, 0.8, fz, 0x222222, { ry: Math.PI / 2 });
    c.col.addBox(fx + 4.5, fz, 0.55, 5, 0, 'pump'); out.pumps.push({ x: fx + 4.5, z: fz });
    board(c, fx, fz - 14.15, Math.PI, tr.fuelSign, 7, 1.15, 5.3, 'shop');
    board(c, fx - 14, fz - 15, Math.PI, tr.entry, 2.2, 0.75, 1.7, 'local');
    board(c, fx - 14, fz + 15, Math.PI, tr.exitSign, 2.2, 0.75, 1.7, 'local');
    c.B.box(20, 0.06, 18, M.stationLight, fx, 5.58, fz, 0xffedd8);
    c.lamps.push({ x: fx, y: h + 5.2, z: fz });
    out.services.push({ id: city.fuelStations[0], provinceId: city.provinceId, name: `${city.displayName} / ${tr.fuelName}`, kind: 'fuel', x: fx, z: fz, r: 18 });
    warehouse(c, x + 76, z + 88, Math.PI, 31, 15, 6, 0xaaaeb2, 2);
    board(c, x + 76, z + 80.2, Math.PI, tr.serviceSign, 7, 1.2, 4.2);
    for (let i = 0; i < 3; i++) c.D.cyl(0.5, 0.5, 0.32, 12, M.rubber, x + 95, 0.32 * i, z + 78, 0x303030);
    out.services.push({ id: city.garages[0], provinceId: city.provinceId, name: `${city.displayName} / ${tr.service}`, kind: 'garage', x: x + 76, z: z + 63, r: 10 });
  } else {
    house(c, x + 30, z + 30, Math.PI, 10, 8, 2);
    house(c, x + 58, z + 30, Math.PI, 11, 9, 2);
    house(c, x + 86, z + 34, Math.PI, 9, 8, 1);
    mosque(c, x + 62, z + 75, 0);
  }

  /* ---- agricultural edge: plain fields inside the flat disc ---- */
  c.B.plane(120, 46, food ? M.fieldGold : M.fieldGreen, x, 0.045, z + 168, 0xffffff, { tu: 8 });
  c.B.plane(96, 40, food ? M.fieldGreen : M.fieldGold, x - 10, 0.045, z - 168, 0xffffff, { tu: 8 });
  haybale(c, x + 50, z + 150); haybale(c, x + 53.5, z + 150);
  for (let i = 0; i < 14; i++) {
    const a = (i * Math.PI * 2) / 14, px = x + Math.cos(a) * 198, pz = z + Math.sin(a) * 198;
    if (g.nearest(px, pz).d > 14) tree(c, 'poplar', px, pz, 1.2);
  }

  c.B.pop(); c.D.pop();
  loadingMark(c, loc);
  out.locations[def.id] = loc;
  out.pois.push({ id: city.id, name: city.displayName, x, z, r: 240 });
}

/* ------------------------------------------------------------------ */
/*  Smaller settlement                                                  */
/* ------------------------------------------------------------------ */
function buildVillage(c: Ctx, g: RoadGraph, v: ExpansionVillage, out: Out) {
  const x = v.x, z = v.z, h = groundHeight(x, z);
  c.B.push(0, h, 0); c.D.push(0, h, 0);

  mosque(c, x + 32, z - 22, 0);
  c.B.plane(64, 50, M.fieldGold, x + 96, 0.045, z - 40, 0xffffff, { tu: 8 });
  for (let i = 0; i < 6; i++) tree(c, 'poplar', x + 135, z - 62 + i * 14, 1.2);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
    const px = x + 60 + i * 9, pz = z + 45 + j * 9;
    c.I.add('apple', px, groundHeight(px, pz), pz, (i + j) * 0.43, 1);
    c.col.addCircle(px, pz, 0.28, 'tree');
  }
  haybale(c, x + 30, z + 30); haybale(c, x + 33.5, z + 30); haybale(c, x + 31.5, z + 30, false);
  tractor(c, x - 26, z + 30, 0.6);
  fenceLine(c, x + 16, z + 14, x + 50, z + 14, 'wood');
  barrels(c, x - 22, z + 36, 3);

  // Houses and a bus shelter follow the two village roads, facing them.
  const row = (key: string, s0: number, step: number, tail: number) => {
    const e = g.edges.find(q => q.key === key);
    if (!e) return;
    let k = 0;
    for (let s = s0; s < e.len - tail; s += step, k++) {
      const st = g.station(e, s), side = k % 2 ? 1 : -1, off = side * (e.w / 2 + 12);
      house(c, st.x + st.rx * off, st.z + st.rz * off, Math.atan2(-st.rx * side, -st.rz * side), 8 + (k % 3), 8, 1 + (k % 2));
    }
  };
  row('merzifon-gumushacikoy.access', 40, 28, 40);
  row('merzifon-gumushacikoy.return', 50, 30, 70);
  const access = g.edges.find(q => q.key === 'merzifon-gumushacikoy.access');
  if (access) {
    const st = g.station(access, access.len * 0.45), off = access.w / 2 + 5;
    busStop(c, st.x + st.rx * off, st.z + st.rz * off, Math.atan2(-st.rx, -st.rz));
  }

  c.B.pop(); c.D.pop();
  out.pois.push({ id: v.id, name: v.displayName, x, z, r: 150 });
}

/* ------------------------------------------------------------------ */
/*  Road signs and furniture (all driven by the road data)              */
/* ------------------------------------------------------------------ */
/**
 * One board per approach: a city/village entrance sign where the road reaches a
 * settlement, otherwise a direction sign. Route numbers are the edge's own routeCode.
 */
function buildRoadSigns(c: Ctx, g: RoadGraph) {
  const settlements: { id: string; displayName: string; provinceId: string }[] = [...EXPANSION.cities, ...EXPANSION.villages];
  for (const r of EXPANSION.roads) {
    const e = g.edges.find(q => q.key === r.id);
    if (!e) continue;
    for (const dir of [1, -1]) {
      const endId = dir > 0 ? r.to : r.from;
      const label = dir > 0 ? r.signTo : r.signFrom;
      const settlement = settlements.find(s => endId.startsWith(`${s.id}.`));
      const d = Math.min(90, e.len * 0.5 - 8);
      const p = g.station(e, dir > 0 ? e.len - d : d);
      const x = p.x + p.rx * dir * (e.w / 2 + 4), z = p.z + p.rz * dir * (e.w / 2 + 4);
      let text: string, kind: string;
      if (settlement) {
        text = `${upper(settlement.displayName)}|${PROVINCE_BY_ID[settlement.provinceId].plateCode}`; kind = 'local';
      } else if (label) {
        text = r.routeCode ? `${upper(label)}|${r.routeCode}` : upper(label); kind = 'dir';
      } else continue;
      c.B.push(0, groundHeight(x, z), 0);
      board(c, x, z, Math.atan2(-p.dx * dir, -p.dz * dir), text, 6, 2, 3.4, kind);
      c.B.pop();
    }
  }
}

/** Utility poles beside a road. Only used where terrain equals the flat expansion elevation. */
function poleRun(c: Ctx, g: RoadGraph, key: string, side: number) {
  const e = g.edges.find(q => q.key === key);
  if (!e) return;
  const pts: number[][] = [];
  for (let s = 40; s <= e.len - 40; s += 44) {
    const p = g.station(e, s), off = side * (e.w / 2 + 7);
    pts.push([p.x + p.rx * off, p.z + p.rz * off]);
  }
  if (pts.length < 2) return;
  const first = c.cables.length;
  c.D.push(0, EXPANSION_ELEVATION, 0);
  poleLine(c, pts, 60, 0); // 60 > sample spacing: exactly one pole per sample
  c.D.pop();
  for (let i = first + 1; i < c.cables.length; i += 3) c.cables[i] += EXPANSION_ELEVATION; // cable y values
}
