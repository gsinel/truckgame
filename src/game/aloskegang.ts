import { RoadGraph } from './roads';
import { EXPANSION } from './regionAmasyaWest';
import { groundHeight } from './elevation';
import { tr, upper } from './i18n';
import { M } from './textures';
import { Ctx, warehouse, shop, bin, bench, vending, pallet, tree, fenceLine, containerStack } from './props';
import { board, flagPole } from './turkishProps';
import { lorryInto } from './vehicles';
import { loadingMark, light, ServiceLocation } from './regionalWorld';
import type { Location, Poi } from './world';

/**
 * ALOSKEGANG community depot — the physical, drivable half of the live layer.
 *
 * The anchor coordinates are NOT duplicated here: they come from the same
 * `EXPANSION` records the road graph, the validators and the job list use, so the
 * building can never drift away from the road it is supposed to sit on. Everything is
 * authored in final world metres, exactly like the other expansion geometry.
 *
 * What the player can do here:
 *  - drive in off the D.100 spur and park on the loading apron (real zone, real scoring),
 *  - refuel (2 pumps) and get the truck serviced (community garage),
 *  - open the community job board,
 *  - weigh the load on the scale (KANTAR) for a small inspection fee,
 *  - call a meetup (COMMUNITY_EVENT) which feeds the streamer overlay,
 *  - discover the site (it is a registered POI, so it lands in the discovery list).
 */

export const ALOSKEGANG = {
  locationId: 'aloskegang.depot',
  garageId: 'aloskegang.garage',
  fuelId: 'aloskegang.fuel',
  poiId: 'aloskegang.depot',
  roadId: 'merzifon-aloskegang.access',
  gateId: 'aloskegang.gate',
} as const;

interface Anchor { gx: number; gz: number }

/** Gate node of the spur, straight from the expansion data (already scaled). */
function anchor(): Anchor {
  const j = EXPANSION.junctions.find((q) => q.id === ALOSKEGANG.gateId);
  if (!j) throw new Error(`ALOSKEGANG: missing junction '${ALOSKEGANG.gateId}' in EXPANSION data`);
  return { gx: j.x, gz: j.z };
}

type Pump = { x: number; z: number };
export interface GangOut { locations: Record<string, Location>; pumps: Pump[]; services: ServiceLocation[]; pois: Poi[] }

/**
 * Local frame: `d` runs along the spur (away from the town), `n` is the lateral axis.
 * The gate is the origin, so the whole compound follows the road instead of a number.
 */
export function buildAloskeGang(c: Ctx, g: RoadGraph, out: GangOut) {
  const { gx, gz } = anchor();
  const dir = (() => {
    // Bearing of the spur at the gate, so apron/bays/docks line up with the road.
    const e = g.edges.find((q) => q.key === ALOSKEGANG.roadId);
    if (!e) throw new Error(`ALOSKEGANG: road '${ALOSKEGANG.roadId}' was not built into the graph`);
    const a = g.station(e, e.len - 8), b = g.station(e, e.len);
    return Math.atan2(b.x - a.x, -(b.z - a.z));
  })();
  /** point at (along, lateral) metres from the gate, in the spur's frame */
  const at = (along: number, lat: number) => ({
    x: gx + Math.sin(dir) * along + Math.cos(dir) * lat,
    z: gz - Math.cos(dir) * along + Math.sin(dir) * lat,
  });

  const centre = at(96, 0);
  const h = groundHeight(centre.x, centre.z);
  // Nothing may sit on a carriageway: measure against the graph, never trust the offset.
  const clear = g.nearest(centre.x, centre.z).d;
  if (clear < 24) throw new Error(`ALOSKEGANG: depot centre is ${clear.toFixed(1)} m from a road — move the gate node`);

  c.B.push(0, h, 0); c.D.push(0, h, 0);

  /* ------------------------------ apron + forecourt ------------------------------ */
  c.B.plane(150, 122, M.pavement, centre.x, 0.02, centre.z, 0xb3b4ac, { tu: 4 });
  c.B.plane(150, 4, M.asphaltLight, centre.x, 0.028, centre.z + 61, 0x9a9b95, { tu: 2 });
  // painted lane into the docks
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
    const p = at(14 + i * 14, s * 9);
    c.B.push(0, h, 0); c.B.plane(4.4, 0.2, M.markYellow, p.x, 0.05, p.z, 0xf2bd36); c.B.pop();
  }

  /* ------------------------------ main hall + docks ------------------------------ */
  const hall = at(150, 0);
  const hallH = groundHeight(hall.x, hall.z);
  warehouse(c, hall.x, hall.z, dir + Math.PI / 2, 84, 30, 10, 0x3d4c55, 4);
  c.B.push(hall.x, hallH, hall.z, dir + Math.PI / 2);
  // ALOSKEGANG band across the shed face + the community mark
  c.B.plane(64, 5.2, M.concrete, 0, 7.4, -15.4, 0xc23028);
  c.B.plane(64, 1.6, M.concrete, 0, 4.4, -15.4, 0x1c3f7a);
  c.D.push(hall.x, hallH, hall.z, dir + Math.PI / 2);
  c.D.plane(22, 8.4, M.gangLogo, 0, 6.0, -15.62, 0xffffff);
  c.D.pop();
  c.B.pop();
  c.B.colBox(84, 30, hall.x, hall.z, dir + Math.PI / 2, 'building');
  c.foot.push({ x: hall.x, z: hall.z, w: 84, d: 30, ry: dir + Math.PI / 2, kind: 'landmark' });
  board(c, hall.x, hall.z, dir + Math.PI / 2, upper(tr.aloskegangDepot), 13, 1.4, 7.4);

  /* ------------------------------ loading bay (job site) ------------------------------ */
  const loc: Location = {
    id: ALOSKEGANG.locationId, name: tr.aloskegangDepot, short: tr.aloskegangShort,
    x: at(120, 0).x, z: at(120, 0).z, heading: dir + Math.PI / 2,
    stack: { x: at(134, 0).x, z: at(134, 0).z }, kind: 'industrial',
    provinceId: 'amasya', cityId: 'amasya.merzifon', districtId: 'amasya.merzifon.merkez', industry: 'automotive',
  };
  loadingMark(c, loc);
  out.locations[loc.id] = loc;

  /* ------------------------------ community garage bays ------------------------------ */
  const gar = at(96, -52);
  shop(c, gar.x, gar.z, dir + Math.PI / 2, 34, 16, 1, 0xd9cdb2);
  for (let i = 0; i < 3; i++) {
    const p = at(70 + i * 0.2, -34 - i * 11);
    c.B.plane(9.6, 0.18, M.markWhite, p.x, 0.048, p.z, 0xe8e8e0);
  }
  for (let i = 0; i < 3; i++) { const p = at(78, -30 - i * 12); lorryBay(c, p.x, p.z, dir); }
  board(c, gar.x, gar.z, dir + Math.PI / 2, upper(tr.aloskegangGarage), 9, 1.2, 5.2, 'local');
  c.B.colBox(34, 16, gar.x, gar.z, dir + Math.PI / 2, 'building');
  c.foot.push({ x: gar.x, z: gar.z, w: 34, d: 16, ry: dir + Math.PI / 2, kind: 'landmark' });
  out.services.push({ id: ALOSKEGANG.garageId, provinceId: 'amasya', name: `${upper(tr.merzifon)} / ${tr.aloskegangGarage}`, kind: 'garage', x: gar.x, z: gar.z, r: 20 });

  /* ------------------------------ fuel island ------------------------------ */
  const fuel = at(66, 44);
  c.B.plane(40, 22, M.asphaltLight, fuel.x, 0.03, fuel.z, 0xa9aaa4, { tu: 2 });
  for (const s of [-1, 1]) {
    const p = at(66, 44 + s * 7);
    c.B.box(1.1, 1.5, 0.5, M.metal, p.x, groundHeight(p.x, p.z) + 0.75, p.z, 0x2c3a44, { ry: dir });
    c.B.box(0.8, 0.1, 0.8, M.concrete, p.x, groundHeight(p.x, p.z) + 1.62, p.z, 0xc23028, { ry: dir });
    c.col.addBox(p.x, p.z, 0.9, 0.9, dir, 'pump');
    out.pumps.push({ x: p.x, z: p.z });
  }
  c.B.push(fuel.x, h, fuel.z, dir);
  c.B.box(24, 0.5, 20, M.metal, 0, 5.6, 0, 0x36474f);
  for (const sx of [-10.5, 10.5]) for (const sz of [-8.5, 8.5]) c.B.cyl(0.22, 0.22, 5.4, 8, M.metal, sx, 2.7, sz, 0x6d7a80);
  c.B.pop();
  board(c, fuel.x, fuel.z, dir + Math.PI / 2, tr.fuelSign, 7, 1.15, 5.4, 'shop');
  out.services.push({ id: ALOSKEGANG.fuelId, provinceId: 'amasya', name: `${upper(tr.merzifon)} / ${tr.aloskegangFuel}`, kind: 'fuel', x: fuel.x, z: fuel.z, r: 20 });

  /* ------------------------------ weighbridge (KANTAR) ------------------------------ */
  const scale = at(40, 40);
  c.B.push(scale.x, groundHeight(scale.x, scale.z), scale.z, dir);
  c.B.plane(13, 4.2, M.asphaltLight, 0, 0.06, 0, 0xd6d6cf);
  c.B.plane(13.6, 4.8, M.concrete, 0, 0.03, 0, 0x8f9189);
  c.B.box(0.6, 1.1, 0.4, M.metal, -6.9, 0.6, 0, 0x2c3a44);
  c.B.pop();
  c.col.addBox(scale.x, scale.z, 7, 2.6, dir, 'scale');
  board(c, scale.x, scale.z, dir, tr.weighing, 4.2, 1.0, 3.4, 'local');
  out.pois.push({ id: `${ALOSKEGANG.poiId}.scale`, name: tr.weighing, x: scale.x, z: scale.z, r: 14 });

  /* ------------------------------ meetup yard ------------------------------ */
  const stage = at(96, 46);
  c.B.push(stage.x, groundHeight(stage.x, stage.z), stage.z, dir);
  c.B.plane(26, 16, M.slab, 0, 0.05, 0, 0xbdb6a4, { tu: 2 });
  c.B.box(14, 0.5, 6, M.wood, 0, 0.28, -4, 0x8a6a48);
  c.B.box(0.35, 5.2, 0.35, M.metal, -7, 2.6, -2.5, 0x555f63);
  c.B.box(0.35, 5.2, 0.35, M.metal, 7, 2.6, -2.5, 0x555f63);
  c.B.plane(14.2, 3.4, M.gangLogo, 0, 4.2, -2.4, 0xffffff);
  c.B.pop();
  for (let i = 0; i < 4; i++) { const p = at(96 + (i - 1.5) * 3.4, 34); bench(c, p.x, p.z, dir); }
  board(c, stage.x, stage.z, dir, upper(tr.aloskegangMeetup), 8, 1.3, 4.6, 'tourism');
  flagPole(c, at(120, 46).x, at(120, 46).z, 12);

  /* ------------------------------ fence, lamps, props, greening ------------------------------ */
  const corners = [at(20, -66), at(20, 66), at(182, 66), at(182, -66)];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i], b = corners[(i + 1) % corners.length];
    if (i === 0) continue; // open side faces the apron edge, kept as the gate
    fenceLine(c, a.x, a.z, b.x, b.z, 'chain');
  }
  for (const s of [-1, 1]) { const p = at(30, s * 66); c.col.addCircle(p.x, p.z, 0.2, 'pole'); }
  for (const d of [34, 96, 152]) { const p = at(d, -60); light(c, p.x, p.z, 8); }
  for (const d of [34, 96, 152]) { const p = at(d, 60); light(c, p.x, p.z, 8); }
  for (let i = 0; i < 6; i++) { const p = at(120 + (i % 3) * 8, 24 + Math.floor(i / 3) * 8); pallet(c, p.x, p.z, dir, i % 3); }
  { const p = at(150, 44); containerStack(c, p.x, p.z, dir, 2, 2); }
  { const p = at(52, -56); bin(c, p.x, p.z, 0, true); const q = at(58, -56); bin(c, q.x, q.z, 0); }
  for (const d of [40, 74]) { const p = at(d, 58); vending(c, p.x, p.z, dir + Math.PI / 2, d === 40 ? 0x2a5ea0 : 0xc82a2a); }
  // Tree screen outside the fence line; the yard itself stays driveable.
  for (let i = 0; i < 14; i++) {
    const p = at(6 + i * 13, i % 2 ? -84 : 84);
    tree(c, i % 3 === 0 ? 'pine' : 'poplar', p.x, p.z, 0.9 + (i % 3) * 0.12, true);
  }
  for (let i = 0; i < 5; i++) { const p = at(196 + i * 12, -30 + i * 15); tree(c, 'oak', p.x, p.z, 1, true); }

  // The apron is flat paint, not a collider, so it registers as a footprint: that is the
  // same mechanism the scatter pass uses to keep trees out of yards.
  c.foot.push({ x: at(96, 0).x, z: at(96, 0).z, w: 150, d: 122, ry: dir, kind: 'yard' });
  out.pois.push({ id: ALOSKEGANG.poiId, name: tr.aloskegangDepot, x: centre.x, z: centre.z, r: 84 });
  c.B.pop(); c.D.pop();
  return { centre, loc, dir, h };
}

/** A parked lorry in a bay — the same primitive the Merzifon rest yard uses. */
function lorryBay(c: Ctx, x: number, z: number, dir: number) {
  const y = groundHeight(x, z);
  c.B.push(x, y, z, dir);
  lorryInto(c.B, 0x1c3f7a, 0xe8e8e4);
  c.B.pop();
  c.col.addBox(x, z, 1.3, 4.6, dir, 'lorry');
  c.foot.push({ x, z, w: 2.6, d: 9.2, ry: dir, kind: 'lorry' });
}
