import * as THREE from 'three';
import { RoadGraph, RNode, REdge } from './roads';
import { PROVINCES, REGIONAL_ROADS, REGIONAL_SITE_NAMES, CORE_NAMES, Province } from './regions';
import { groundHeight } from './elevation';
import { tr, upper } from './i18n';
import { M, extra, labelMaterial } from './textures';
import { Ctx, apartment, shop, warehouse, house, bin, bench, picnic, pallet, containerStack, barrels, parkedCar, silo, busStop, tree, fenceLine } from './props';
import { board, flagPole, yaliHouse, mosque, ridge } from './turkishProps';
import type { Location, Poi } from './world';

export interface ServiceLocation {
  id: string; provinceId: string; name: string; kind: 'fuel' | 'garage' | 'rest';
  x: number; z: number; r: number;
}

export function extendRegionalNetwork(g: RoadGraph, anchors: Record<string, RNode>) {
  const ports = { ...anchors };
  for (const p of PROVINCES.slice(1)) {
    const nodes: Record<string, RNode> = {};
    for (const [key, dx, dz] of [
      ['center', 0, 0], ['north', 0, -110], ['south', 0, 110], ['west', -110, 0], ['east', 110, 0],
      ['nw', -110, -110], ['ne', 110, -110], ['sw', -110, 110], ['se', 110, 110],
    ] as [string, number, number][]) {
      nodes[key] = g.node(p.x + dx, p.z + dz, `${p.id}.${key}`);
      ports[`${p.id}.${key}`] = nodes[key];
    }
    for (const [a, b] of [['west', 'center'], ['center', 'east'], ['north', 'center'], ['center', 'south'],
      ['nw', 'north'], ['north', 'ne'], ['ne', 'east'], ['east', 'se'], ['se', 'south'], ['south', 'sw'], ['sw', 'west'], ['west', 'nw']]) {
      const e = g.connect(nodes[a], nodes[b], 'town');
      e.key = `${p.id}.street.${a}.${b}`; e.provinceIds = [p.id];
    }
    nodes.center.light = true;
  }
  ports['plateau.bridgeWest'] = g.node(-10, 1620, 'plateau.bridgeWest');
  ports['plateau.bridgeEast'] = g.node(150, 1620, 'plateau.bridgeEast');
  const bridge = g.connect(ports['plateau.bridgeWest'], ports['plateau.bridgeEast'], 'rural', [], { bridge: true });
  bridge.key = 'yozgat-sivas.bridge'; bridge.routeCode = 'D.200'; bridge.provinceIds = ['yozgat', 'sivas'];
  const corridors: REdge[] = [];
  for (const r of REGIONAL_ROADS) {
    const e = g.connect(ports[r.from], ports[r.to], r.type, r.via);
    e.key = r.id; e.routeCode = r.routeCode;
    e.provinceIds = r.id.startsWith('yozgat-sivas') ? ['yozgat', 'sivas'] : [r.from.split('.')[0], r.to.split('.')[0]];
    corridors.push(e);
  }
  // An actual riverside street, joined to the existing northern and southern crossings.
  const riverNorth = g.node(38, 85, 'amasya.yaliboyu.north');
  const riverSouth = g.node(38, 240, 'amasya.yaliboyu.south');
  g.connect(anchors['amasya.riverNorth'], riverNorth, 'town', [[11, 35], [27, 58]]).key = 'amasya.riverfront.entry';
  g.connect(riverNorth, riverSouth, 'town').key = 'amasya.riverfront';
  g.connect(riverSouth, anchors['amasya.riverSouth'], 'town', [[38, 275], [25, 316], [10, 336]]).key = 'amasya.riverfront.exit';
  return { ports, corridors };
}

export function light(c: Ctx, x: number, z: number, height = 7) {
  c.B.cyl(0.07, 0.11, height, 8, M.metal, x, 0, z, 0x485159);
  c.B.box(0.8, 0.14, 0.45, M.metal, x, height, z, 0x485159);
  c.B.box(0.6, 0.04, 0.35, M.bulb, x, height - 0.04, z, 0xffffff);
  c.col.addCircle(x, z, 0.18, 'pole');
  const p = c.B.worldPos(x, height - 0.15, z); c.lamps.push({ x: p.x, y: p.y, z: p.z });
}

export function loadingMark(c: Ctx, loc: Location) {
  c.B.push(loc.x, groundHeight(loc.x, loc.z), loc.z, loc.heading);
  const y = 0.09, w = 5.4, len = 15, line = 0.16;
  c.B.plane(w, line, M.markYellow, 0, y, -len / 2, 0xf2bd36);
  c.B.plane(w, line, M.markYellow, 0, y, len / 2, 0xf2bd36);
  for (const s of [-1, 1]) c.B.plane(line, len - line, M.markYellow, s * (w - line) / 2, y, 0, 0xf2bd36);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) c.B.plane(w - 0.6, line, M.markYellow, 0, y, s * (len / 2 - 1 - i * 0.6), 0xf2bd36);
  c.B.pop();
}

export function buildRegionalSettlements(c: Ctx, root: THREE.Group, g: RoadGraph, corridors: REdge[]) {
  const locations: Record<string, Location> = {}, pumps: { x: number; z: number }[] = [], services: ServiceLocation[] = [], pois: Poi[] = [];
  for (const p of PROVINCES.slice(1)) {
    const x = p.x, z = p.z, h = groundHeight(p.x, p.z);
    c.B.push(0, h, 0); c.D.push(0, h, 0);
    c.B.plane(222, 222, M.pavement, x, 0.018, z, p.environment === 'plateau' ? 0xc4b594 : 0xb8b9b1, { tu: 4 });
    c.B.plane(90, 96, M.slab, x + 57, 0.035, z - 55, 0xbbb8ae, { tu: 4 });
    warehouse(c, x + 55, z - 84, 0, 70, 24, 8.5, p.id === 'tokat' ? 0xc4ad92 : p.id === 'samsun' ? 0x819faa : 0x9da1a6, 3);
    const id = p.cargoOrigins[0];
    const loc: Location = { id, name: REGIONAL_SITE_NAMES[id], short: p.displayName, x: x + 52, z: z - 48,
      heading: Math.PI / 2, stack: { x: x + 52, z: z - 64 }, kind: 'industrial', provinceId: p.id,
      cityId: `${p.id}.center`, districtId: `${p.id}.merkez`, industry: p.industries[0] };
    locations[id] = loc;
    board(c, x + 55, z - 71.85, 0, upper(loc.name), 12, 1.3, 6.5);
    for (let i = 0; i < 4; i++) pallet(c, x + 20 + i * 1.8, z - 68, 0, i % 3);
    containerStack(c, x + 90, z - 38, 0, 1, 2); bin(c, x + 89, z - 63, 0, true);
    barrels(c, x + 23, z - 85, 3); light(c, x + 18, z - 23); light(c, x + 96, z - 92);
    flagPole(c, x + 91, z - 12, 11);
    // Dense, varied residential and commercial blocks, leaving the streets unobstructed.
    shop(c, x - 37, z - 24, 0, 22, 12, 3, 0xf1ddba);
    shop(c, x - 79, z - 24, 0, 23, 12, 2, 0xe2ddd0);
    apartment(c, x - 30, z - 74, 0, 28, 16, p.populationScale === 'large' ? 6 : 4, 2);
    apartment(c, x - 80, z - 76, 0, 26, 16, 4, 0);
    parkedCar(c, x - 38, z - 42, Math.PI / 2); parkedCar(c, x - 50, z - 42, Math.PI / 2);
    mosque(c, x - 70, z + 57, -Math.PI / 2);
    house(c, x - 27, z + 28, Math.PI, 11, 9, 2, 0xe6d9be, 0xba6848);
    shop(c, x - 31, z + 80, Math.PI, 18, 11, 1, 0xebdec0);
    for (let i = 0; i < 2; i++) picnic(c, x - 31 + i * 11, z + 62, 0);
    bench(c, x - 93, z + 20, Math.PI / 2); bin(c, x - 89, z + 20);
    busStop(c, x - 45, z + 8.5, Math.PI);
    services.push({ id: `${p.id}.rest`, provinceId: p.id, name: `${p.displayName} / ${tr.restSign}`, kind: 'rest', x: x - 30, z: z + 64, r: 18 });

    // Drive-through fuel bay. Pump is to the driver's left when travelling north.
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
    c.col.addBox(fx + 4.5, fz, 0.55, 5, 0, 'pump'); pumps.push({ x: fx + 4.5, z: fz });
    board(c, fx, fz - 14.15, Math.PI, tr.fuelSign, 7, 1.15, 5.3, 'shop');
    board(c, fx - 14, fz - 15, Math.PI, tr.entry, 2.2, 0.75, 1.7, 'local');
    board(c, fx - 14, fz + 15, Math.PI, tr.exitSign, 2.2, 0.75, 1.7, 'local');
    c.B.box(20, 0.06, 18, M.stationLight, fx, 5.58, fz, 0xffedd8);
    c.lamps.push({ x: fx, y: h + 5.2, z: fz });
    services.push({ id: `${p.id}.fuel`, provinceId: p.id, name: `${p.displayName} / ${tr.fuelName}`, kind: 'fuel', x: fx, z: fz, r: 18 });
    warehouse(c, x + 76, z + 88, Math.PI, 31, 15, 6, 0xaaaeb2, 2);
    board(c, x + 76, z + 80.2, Math.PI, tr.serviceSign, 7, 1.2, 4.2);
    for (let i = 0; i < 3; i++) c.D.cyl(0.5, 0.5, 0.32, 12, M.rubber, x + 95, 0.32 * i, z + 78, 0x303030);
    services.push({ id: `${p.id}.garage`, provinceId: p.id, name: `${p.displayName} / ${tr.service}`, kind: 'garage', x: x + 76, z: z + 63, r: 10 });
    if (p.id === 'yozgat') { silo(c, x + 100, z - 94, 2.5, 16); silo(c, x + 100, z - 84, 2.5, 16); }
    if (p.id === 'corum') {
      // Compact unfinished concrete frame, pallets, drums and a fenced work yard.
      const cx = x - 45, cz = z + 62, y0 = groundHeight(cx, cz);
      c.B.push(0, y0 - h, 0); c.D.push(0, y0 - h, 0);
      c.B.plane(38, 28, M.slab, cx, 0.03, cz, 0xaaa79e, { tu: 4 });
      for (const level of [0, 3.8]) {
        for (const px of [-16, -5, 5, 16]) for (const pz of [-11, 11])
          c.B.box(0.32, 3.82, 0.32, M.concrete, cx + px, level, cz + pz, 0xbeb7a8);
        for (const pz of [-11, 11]) c.B.box(33, 0.28, 0.34, M.concrete, cx, level + 3.65, cz + pz, 0xb4ad9c);
        for (const px of [-16, -5, 5, 16]) c.B.box(0.30, 0.28, 22, M.concrete, cx + px, level + 3.65, cz, 0xb4ad9c);
      }
      for (const px of [-16, 16]) c.B.box(0.14, 7.4, 0.14, M.metal, cx + px, 0, cz + 11, 0x687473);
      c.B.box(33, 0.16, 0.16, M.metal, cx, 6.2, cz + 11, 0x687473);
      for (let i = 0; i < 5; i++) pallet(c, cx - 10 + i * 1.45, cz + 18, 0, i % 3);
      containerStack(c, cx + 22, cz + 18, 0, 1, 1); barrels(c, cx - 22, cz + 17, 3);
      board(c, cx, cz + 16, Math.PI, tr.construction, 4.2, 1.1, 2.1, 'local');
      fenceLine(c, cx - 21, cz - 16, cx + 21, cz - 16, 'chain');
      fenceLine(c, cx - 21, cz - 16, cx - 21, cz + 12, 'chain');
      fenceLine(c, cx + 21, cz - 16, cx + 21, cz + 12, 'chain');
      fenceLine(c, cx - 21, cz + 12, cx - 12, cz + 12, 'chain');
      fenceLine(c, cx + 12, cz + 12, cx + 21, cz + 12, 'chain');
      c.B.colBox(34, 2.0, cx, cz - 12, 0, 'construction-frame');
      c.B.colBox(2.0, 24, cx - 16, cz, 0, 'construction-frame');
      c.B.colBox(2.0, 24, cx + 16, cz, 0, 'construction-frame');
      c.foot.push({ x: cx, z: cz, w: 38, d: 28, ry: 0, kind: 'construction' });
      c.B.pop(); c.D.pop();
    }
    if (p.id === 'corum') board(c, x - 37, z - 17.45, 0, tr.shopTire, 5, 0.72, 4.8, 'shop');
    for (const [sx, sz, ry] of [[-9, -129, Math.PI], [9, 129, 0], [-129, 9, -Math.PI / 2], [129, -9, Math.PI / 2]]) {
      board(c, x + sx, z + sz, ry, `${upper(p.displayName)}|${p.plateCode}`, 4.5, 1.7, 2.4, 'local');
    }
    c.B.pop(); c.D.pop();
    loadingMark(c, loc);
    pois.push({ id: p.id, name: p.displayName, x, z, r: 240 });
    for (let i = 0; i < 14; i++) {
      const a = i * Math.PI * 2 / 14;
      tree(c, p.environment === 'plateau' ? 'poplar' : 'oak', x + Math.cos(a) * 160, z + Math.sin(a) * 160, 1.15);
    }
  }

  // Advance direction signs come from the very graph used by traffic and GPS.
  for (const e of corridors) {
    for (const dir of [-1, 1]) {
      const s = dir > 0 ? 45 : e.len - 45, p = g.station(e, s);
      const provinceId = e.provinceIds?.[dir > 0 ? 1 : 0] || 'amasya';
      const province = PROVINCES.find(q => q.id === provinceId) || PROVINCES[0];
      const x = p.x + p.rx * dir * (e.w / 2 + 4), z = p.z + p.rz * dir * (e.w / 2 + 4);
      c.B.push(0, groundHeight(x, z), 0);
      board(c, x, z, Math.atan2(-p.dx * dir, -p.dz * dir), `${upper(province.displayName)}|${e.routeCode}`, 6, 2, 3.4);
      c.B.pop();
    }
    for (let s = 80; s < e.len - 80; s += 48) {
      const p = g.station(e, s);
      for (const side of [-1, 1]) {
        const x = p.x + p.rx * side * 28, z = p.z + p.rz * side * 28;
        if (PROVINCES.some(q => Math.hypot(x - q.x, z - q.z) < 190) || g.nearest(x, z).d < 18) continue;
        tree(c, z > 900 ? 'poplar' : 'pine', x, z, 1.25);
      }
    }
    if (e.type === 'rural') {
      for (let s = 40; s < e.len - 40; s += 6) {
        const a = g.station(e, s), b = g.station(e, Math.min(s + 6, e.len - 40));
        const curvature = Math.abs(a.dx * b.dz - a.dz * b.dx);
        if (curvature < 0.012 && Math.abs(groundHeight(a.x, a.z) - groundHeight(b.x, b.z)) < 0.22) continue;
        for (const side of [-1, 1]) {
          const off = side * (e.w / 2 + 1.8);
          const ax = a.x + a.rx * off, az = a.z + a.rz * off, bx = b.x + b.rx * off, bz = b.z + b.rz * off;
          const ay = groundHeight(ax, az), by = groundHeight(bx, bz);
          const near = [[ax, ay + 0.53, az], [bx, by + 0.53, bz], [bx, by + 0.82, bz], [ax, ay + 0.82, az]];
          const far = near.map((p, i) => [p[0] + (i === 0 || i === 3 ? a.rx : b.rx) * 0.07, p[1], p[2] + (i === 0 || i === 3 ? a.rz : b.rz) * 0.07]);
          const uv = [[0, 0], [3, 0], [3, 0.3], [0, 0.3]];
          c.B.quad(M.metal, near, uv, 0xc0c3bd); c.B.quad(M.metal, [...far].reverse(), uv, 0xc0c3bd);
          c.B.quad(M.metal, [near[3], near[2], far[2], far[3]], uv, 0xcbd0c8);
          c.D.box(0.09, 0.83, 0.1, M.metal, ax, ay, az, 0x737b7d);
          c.D.box(0.12, 0.13, 0.06, M.carTail, ax, ay + 0.63, az, 0xffffff);
          c.col.addBox((ax + bx) / 2, (az + bz) / 2, 0.09, Math.hypot(bx - ax, bz - az) / 2, Math.atan2(bx - ax, bz - az), 'rail');
        }
      }
      const st = g.station(e, Math.min(95, e.len / 4));
      const x = st.x + st.rx * 7, z = st.z + st.rz * 7;
      c.B.push(0, groundHeight(x, z), 0);
      board(c, x, z, Math.atan2(-st.dx, -st.dz), tr.caution, 3, 1, 2.3, 'local');
      c.B.pop();
    }
  }

  // Amasya identity: riverside timber houses, promenade, valley ridges and Turkish signage.
  c.B.plane(20, 178, M.pavement, 56, 0.03, 158, 0xcfc4ad);
  for (let i = 0; i < 8; i++) {
    yaliHouse(c, 20, 77 + i * 22, -Math.PI / 2);
    light(c, 51, 76 + i * 22);
    if (i % 2 === 0) bench(c, 55, 82 + i * 22, Math.PI / 2);
  }
  board(c, 58, 69, Math.PI, upper(tr.riverfront), 4, 1.3, 2.5, 'tourism');
  board(c, -220, -99, -Math.PI / 2, tr.depotSign, 8, 2, 4.4);
  flagPole(c, -225, -117, 13);
  board(c, -221, 61, Math.PI, tr.fuelSign, 6, 1.5, 3);
  board(c, -216, 101, -Math.PI / 2, tr.diesel, 3, 0.9, 2.3, 'shop');
  mosque(c, 498, -342, 0);
  mosque(c, -64, -84, -Math.PI / 2);
  for (let i = 0; i < 7; i++) for (let j = 0; j < 5; j++) {
    const x = 122 + i * 10, z = -278 + j * 10;
    c.I.add('apple', x, 0, z, (i + j) * 0.43, 1);
    c.col.addCircle(x, z, 0.28, 'tree');
  }
  ridge(root, c, -840, -225, 145, 145);
  ridge(root, c, 190, 193, 108, 100);
  ridge(root, c, 130, -605, 165, 155);
  ridge(root, c, 978, -770, 138, 145);
  ridge(root, c, 1640, 1450, 150, 155);
  c.B.push(190, groundHeight(190, 193) + 94, 193);
  c.B.box(21, 5, 8, M.brick, 0, 0, 0, 0xb49b78);
  for (const x of [-9, 9]) c.B.cyl(3.3, 3.3, 9, 10, M.brick, x, 0, 0, 0xbca37f);
  c.B.pop();
  pois.push({ id: 'amasya.riverfront', name: tr.riverfront, x: 38, z: 160, r: 55 });
  return { locations, pumps, services, pois };
}

export function localizeCoreLocations(locations: Record<string, Location>) {
  for (const [id, loc] of Object.entries(locations)) {
    loc.name = CORE_NAMES[id] || loc.name; loc.short = loc.name;
    loc.provinceId = 'amasya'; loc.cityId = 'amasya.center'; loc.districtId = 'amasya.merkez';
  }
}