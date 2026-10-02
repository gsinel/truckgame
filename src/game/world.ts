import * as THREE from 'three';
import { Batcher, Colliders, Instancer } from './batch';
import { buildMaterials, M, extra, rnd, rr, pick, srand, signTex } from './textures';
import { RoadGraph, buildRoads, RNode } from './roads';
import {
  Ctx, Foot, registerTrees, tree, house, apartment, shop, warehouse, factory, barn, silo, church,
  containerStack, pallet, tank, bench, bin, busStop, picnic, vending, barrels, haybale, parkedCar,
  tractor, fenceLine, poleLine,
} from './props';
import { lorryInto, makeForklift } from './vehicles';
import { buildTerrain, buildBridges, riverDecor, riverC, BRIDGES } from './terrain';
import { tr, t } from './i18n';
import { PROVINCES, CITIES, City, Industry, Province, EXPANSION_SITES } from './regions';
import { groundHeight } from './elevation';
import { extendRegionalNetwork, buildRegionalSettlements, localizeCoreLocations, ServiceLocation, loadingMark } from './regionalWorld';
import { extendExpansionNetwork, buildExpansion } from './regionalExpansion';

export interface Location {
  id: string; name: string; short: string; x: number; z: number; heading: number;
  stack: { x: number; z: number }; kind: string;
  provinceId?: string; cityId?: string; districtId?: string; industry?: Industry;
}
export interface Poi { id: string; name: string; x: number; z: number; r: number }
export interface World {
  root: THREE.Group; graph: RoadGraph; col: Colliders;
  lamps: { x: number; y: number; z: number }[];
  locations: Record<string, Location>;
  pumps: { x: number; z: number }[];
  garage: { x: number; z: number; r: number };
  terminal: { x: number; z: number };
  spawn: { x: number; z: number; heading: number; px: number; pz: number; pyaw: number };
  foot: Foot[]; fields: { x0: number; z0: number; x1: number; z1: number; c: string }[];
  forests: number[][]; forklifts: any[]; turbines: THREE.Group[]; pois: Poi[];
  signalNodes: RNode[];
  provinces: Province[]; cities: City[]; services: ServiceLocation[]; garages: ServiceLocation[];
  routeSignCodes: string[];
}

export function buildWorld(): World {
  buildMaterials();
  srand(2024);
  const root = new THREE.Group();
  const col = new Colliders();
  const B = new Batcher(160, 1500, true, col);
  const D = new Batcher(100, 280, true, col);
  const GL = new Batcher(120, 450, false, null);
  const I = new Instancer(160, 560);
  registerTrees(I);
  const c: Ctx = { B, D, GL, I, col, lamps: [], cables: [], foot: [] };

  /* ------------------------------ road graph ------------------------------ */
  const g = new RoadGraph();
  const xs = [-620, -510, -400, -300], zs = [-140, 0, 140];
  const T: RNode[][] = xs.map((x) => zs.map((z) => g.node(x, z)));
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) g.connect(T[i][j], T[i + 1][j], 'town');
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) g.connect(T[i][j], T[i][j + 1], 'town');
  T[1][1].light = true; T[2][1].light = true; T[2][2].light = true;

  const HC = { x: -240, z: 0 }, HR = 18;
  const ringNodes = [0, 1, 2, 3].map((k) => {
    const a = (k * Math.PI) / 2;
    const n = g.node(HC.x + HR * Math.cos(a), HC.z - HR * Math.sin(a));
    n.ring = true;
    return n;
  });
  for (let k = 0; k < 4; k++) {
    const pts: { x: number; z: number }[] = [];
    const segs = 24;
    for (let s = 0; s <= segs; s++) {
      const a = ((k + s / segs) * Math.PI) / 2;
      pts.push({ x: HC.x + HR * Math.cos(a), z: HC.z - HR * Math.sin(a) });
    }
    g.connect(ringNodes[k], ringNodes[(k + 1) % 4], 'ring', [], { pts });
  }
  const [RE, RN, RW, RS] = ringNodes;
  g.connect(T[3][1], RW, 'town');
  // highway
  const H1 = g.node(-100, 0), H2 = g.node(0, 0), H3 = g.node(140, 0), HA = g.node(180, 0), HB = g.node(260, 0);
  const HJ1 = g.node(330, -30), HJ2 = g.node(470, -90);
  g.connect(RE, H1, 'highway'); g.connect(H1, H2, 'highway');
  g.connect(H2, H3, 'highway', [], { bridge: true });
  g.connect(H3, HA, 'highway'); g.connect(HA, HB, 'highway');
  g.connect(HB, HJ1, 'highway', [[298, -12]]);
  g.connect(HJ1, HJ2, 'highway', [[400, -60]]);
  // rest area loop
  const RA1 = g.node(180, 40), RA2 = g.node(260, 40);
  g.connect(HA, RA1, 'side'); g.connect(RA1, RA2, 'side'); g.connect(RA2, HB, 'side');
  // industrial
  const I1 = g.node(330, 250), I2 = g.node(470, 250), I3 = g.node(620, 250);
  const I4 = g.node(470, 370), I5 = g.node(330, 370), I6 = g.node(620, 370);
  g.connect(HJ1, I1, 'industrial'); g.connect(HJ2, I2, 'rural');
  g.connect(I1, I2, 'industrial'); g.connect(I2, I3, 'industrial');
  g.connect(I5, I4, 'industrial'); g.connect(I4, I6, 'industrial');
  g.connect(I1, I5, 'industrial'); g.connect(I2, I4, 'industrial'); g.connect(I3, I6, 'industrial');
  I2.light = true;
  // truck-stop arm (south) + south bridge road
  const S1 = g.node(-240, 230), SB0 = g.node(0, 350), SB1 = g.node(160, 350);
  g.connect(RS, S1, 'industrial');
  g.connect(S1, SB0, 'rural', [[-200, 320], [-120, 345], [-50, 352]]);
  g.connect(SB0, SB1, 'rural', [], { bridge: true });
  g.connect(SB1, I5, 'rural', [[250, 360]]);
  // north arm + rural + village
  const NA = g.node(-240, -250), RJ1 = g.node(-10, -320), RJ2 = g.node(125, -320), RJ3 = g.node(300, -300);
  g.connect(RN, NA, 'industrial');
  g.connect(NA, RJ1, 'rural', [[-200, -292], [-120, -312]]);
  g.connect(RJ1, RJ2, 'rural', [], { bridge: true });
  g.connect(RJ2, RJ3, 'rural', [[215, -312]]);
  const V1 = g.node(380, -300), V2 = g.node(460, -300), V3 = g.node(540, -300);
  const VN = g.node(460, -380), VS = g.node(460, -230);
  g.connect(RJ3, V1, 'rural'); g.connect(V1, V2, 'village'); g.connect(V2, V3, 'village');
  g.connect(V2, VN, 'village'); g.connect(V2, VS, 'village');
  g.connect(VS, HJ2, 'rural', [[466, -160]]);
  const F1 = g.node(300, -210);
  g.connect(RJ3, F1, 'side');
  const MK = g.node(-400, 172);
  g.connect(T[2][2], MK, 'side');
  // loop closures: the farm access and the village east end must not be dead ends
  g.connect(F1, VS, 'rural', [[318, -224], [350, -223], [390, -215], [430, -214]]);
  g.connect(V3, HJ2, 'rural', [[618, -304], [630, -200], [588, -112]]);
  const anchors = { 'amasya.west': T[0][1], 'amasya.north': VN, 'amasya.east': I6,
    'amasya.riverNorth': H2, 'amasya.riverSouth': SB0, 'amasya.northArm': NA };
  for (const [key, node] of Object.entries(anchors)) node.name = key;
  const regionalNetwork = extendRegionalNetwork(g, anchors);
  extendExpansionNetwork(g, regionalNetwork.ports);
  g.finalize();

  const rb = buildRoads(g, B, D, GL);
  c.lamps.push(...rb.lamps);

  /* ----------------------------- terrain & bridges ----------------------------- */
  buildTerrain(root);
  buildBridges(c);
  riverDecor(c);

  /* ------------------------------- helpers ------------------------------- */
  const slab = (x0: number, z0: number, x1: number, z1: number, mat: THREE.Material = M.slab, color = 0xb8b6ae, y = 0.03) =>
    B.plane(x1 - x0, z1 - z0, mat, (x0 + x1) / 2, y, (z0 + z1) / 2, color, { tu: 4 });
  const standLamp = (x: number, z: number, ry: number) => {
    B.push(x, 0, z, ry); D.push(x, 0, z, ry);
    D.cyl(0.08, 0.12, 8, 8, M.metal, 0, 0, 0, 0x6e747a);
    D.box(0.1, 0.1, 1.8, M.metal, 0, 7.9, 0.9, 0x6e747a);
    B.box(0.4, 0.14, 0.8, M.metal, 0, 7.8, 1.7, 0x777c82);
    B.box(0.3, 0.06, 0.6, M.bulb, 0, 7.74, 1.7, 0xffffff);
    B.pop(); D.pop();
    col.addCircle(x, z, 0.3, 'pole');
    const lx = x + Math.sin(ry) * 1.7, lz = z + Math.cos(ry) * 1.7;
    c.lamps.push({ x: lx, y: 7.5, z: lz });
    GL.plane(16, 16, extra.glowMat, lx, 0.12, lz, 0xffffff, { tu: 16 });
  };
  const lorry = (x: number, z: number, ry: number, cab: number, box: number) => {
    B.push(x, 0, z, ry);
    lorryInto(B, cab, box);
    B.pop();
    col.addBox(x, z, 1.3, 4.6, ry, 'lorry');
    c.foot.push({ x, z, w: 2.6, d: 9.2, ry, kind: 'lorry' });
  };
  const nameBoard = (x: number, y: number, z: number, ry: number, text: string, w = 5, h = 1.6) => {
    const m = new THREE.MeshStandardMaterial({ map: signTex('dir', text), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.0 });
    m.emissiveMap = m.map;
    B.push(x, y, z, ry);
    B.box(w + 0.2, h + 0.2, 0.15, M.metal, 0, 0, 0, 0x30363c);
    B.box(w, h, 0.05, m, 0, 0.1, 0.1, 0xffffff, { tu: w, tv: h });
    B.pop();
    (m as any).userData.night = true;
    nightExtra.push(m);
  };
  const nightExtra: THREE.MeshStandardMaterial[] = [];
  const zoneMark = (L: Location) => loadingMark(c, L);

  const blocked: number[][] = [
    [300, -345, 570, -250], [255, -230, 355, -165], [290, 185, 710, 425], [-245, -155, -110, -55],
    [-245, 55, -160, 130], [-295, 140, -235, 195], [165, 30, 275, 95], [-640, -175, -285, 165], [-495, 160, -370, 240],
    [-262, -24, -218, 24],
    [-36, 60, 54, 272],
  ];
  const isBlocked = (x: number, z: number, pad = 0) => {
    if (PROVINCES.slice(1).some(p => Math.hypot(x - p.x, z - p.z) < 190 + pad)) return true;
    if (EXPANSION_SITES.some(s => Math.hypot(x - s.x, z - s.z) < 190 + pad)) return true;
    for (const r of blocked) if (x > r[0] - pad && x < r[2] + pad && z > r[1] - pad && z < r[3] + pad) return true;
    return false;
  };
  const nearFoot = (x: number, z: number, pad: number) => {
    for (const f of c.foot) if (Math.hypot(f.x - x, f.z - z) < Math.hypot(f.w, f.d) / 2 + pad) return true;
    return false;
  };
  const scatter = (rect: number[], n: number, kinds: string[], minD: number, s = 1, checkFoot = true) => {
    let placed = 0;
    for (let tries = 0; tries < n * 4 && placed < n; tries++) {
      const x = rr(rect[0], rect[2]), z = rr(rect[1], rect[3]);
      if (Math.abs(x - riverC(z)) < 16) continue;
      if (isBlocked(x, z, 2)) continue;
      if (g.nearest(x, z).d < minD) continue;
      if (checkFoot && nearFoot(x, z, 4)) continue;
      tree(c, pick(kinds) as any, x, z, s);
      placed++;
    }
  };

  /* ============================ GROUND ZONES ============================ */
  slab(-640, -170, -286, 168, M.pavement, 0xc4c0b8, 0.02);
  slab(-234, -150, -120, -60, M.slab, 0xb0aea6);          // depot
  slab(-236, 62, -165, 128, M.slab, 0xaaa8a0);            // fuel
  slab(-262, 148, -236, 190, M.slab, 0xb0aea6);           // garage
  slab(290, 190, 710, 420, M.slab, 0xb4b2aa, 0.02);       // industrial
  slab(385, -293, 455, -232, M.slab, 0xb4b2aa);           // co-op yard
  slab(270, -216, 346, -172, M.slab, 0xb0ae9e);           // farm yard
  slab(-426, 172, -372, 238, M.slab, 0xb4b2aa);           // market yard
  slab(184, 44, 256, 84, M.asphaltLight, 0xb8b8b8, 0.04); // rest area lot
  // grassPad: must NOT share M.grass with the terrain mesh below it — same material
  // means the same polygon offset, so only real height separates them.
  slab(-262, -24, -218, 24, M.grassPad, 0xdddddd, 0.06);

  /* ================================ HUB ================================ */
  B.cyl(12, 12, 0.22, 30, M.concrete, HC.x, 0, HC.z, 0xc8c8c0);
  B.cyl(11.4, 11.4, 0.03, 30, M.grassPad, HC.x, 0.22, HC.z, 0xd8e8c8);
  col.addCircle(HC.x, HC.z, 12.2, 'island');
  tree(c, 'oak', HC.x - 3, HC.z + 2, 1.3, false); tree(c, 'birch', HC.x + 3, HC.z - 3, 1.1, false);
  tree(c, 'bush', HC.x + 5, HC.z + 4, 1.2, false); tree(c, 'bush', HC.x - 6, HC.z - 3, 1.3, false);
  B.box(3.0, 1.2, 1.0, M.concrete, HC.x, 0.25, HC.z + 8, 0xa8a8a0);
  nameBoard(HC.x, 1.6, HC.z + 7.3, 0, tr.welcomeSign, 2.8, 1.0);
  busStop(c, -278, -10.2, 0);
  bench(c, -270, 9.6, Math.PI); bin(c, -272, -9.8, 0);
  for (const [sx, sz, sr, m] of [[-205, 11, Math.PI / 2, 'dirTown'], [-262, -22, 0, 'dirInd'], [-228, -34, Math.PI, 'dirVillage'], [-228, 34, 0, 'dirFuel'], [-60, -14, Math.PI / 2, 'dirRest']] as const) {
    D.push(sx, 0, sz, sr);
    D.box(0.12, 4.2, 0.12, M.metal, -0.9, 0, 0, 0x6e747a);
    D.box(0.12, 4.2, 0.12, M.metal, 0.9, 0, 0, 0x6e747a);
    D.box(2.6, 1.3, 0.08, M[m as string], 0, 3.0, 0.1, 0xffffff, { tu: 2.6, tv: 1.3 });
    D.pop();
    col.addCircle(sx, sz, 1.2, 'sign');
  }

  /* ================================ TOWN ================================ */
  const inset = 8.6;
  const fillSide = (axis: 'x' | 'z', fixed: number, start: number, end: number, inward: number, ry: number, main: boolean) => {
    let cur = start;
    let guard = 0;
    while (cur < end - 7 && guard++ < 20) {
      const r = rnd();
      const type = main && r < 0.6 ? 'shop' : r < 0.45 ? 'house' : 'apt';
      let w = type === 'house' ? rr(8, 11) : type === 'shop' ? rr(10, 15) : rr(15, 24);
      const d = type === 'house' ? 9 : type === 'shop' ? 11 : 13;
      if (cur + w > end) w = end - cur;
      if (w < 7) break;
      const mid = cur + w / 2, off = fixed + (inward * d) / 2;
      const cx = axis === 'x' ? mid : off, cz = axis === 'x' ? off : mid;
      if (type === 'house') house(c, cx, cz, ry, w, d, pick([2, 2, 3]));
      else if (type === 'shop') shop(c, cx, cz, ry, w, d, pick([2, 2, 3]));
      else apartment(c, cx, cz, ry, w, d, pick([4, 5, 5, 6]), pick([0, 1, 2]));
      cur += w + (type === 'house' ? rr(0.5, 2) : 0.8);
    }
  };
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++) {
      const x0 = xs[i], x1 = xs[i + 1], z0 = zs[j], z1 = zs[j + 1];
      fillSide('x', z0 + inset, x0 + inset, x1 - inset, 1, Math.PI, z0 === 0);
      fillSide('x', z1 - inset, x0 + inset, x1 - inset, -1, 0, z1 === 0);
      fillSide('z', x0 + inset, z0 + inset + 14, z1 - inset - 14, 1, -Math.PI / 2, false);
      fillSide('z', x1 - inset, z0 + inset + 14, z1 - inset - 14, -1, Math.PI / 2, false);
      // courtyard
      for (let k = 0; k < 7; k++) {
        const tx = rr(x0 + inset + 17, x1 - inset - 17), tz = rr(z0 + inset + 17, z1 - inset - 17);
        tree(c, pick(['oak', 'birch', 'bush']) as any, tx, tz, 1.0);
      }
      bin(c, (x0 + x1) / 2, (z0 + z1) / 2, 0, true);
      for (let k = 0; k < 3; k++) parkedCar(c, (x0 + x1) / 2 - 8 + k * 3, (z0 + z1) / 2 + 6, 0);
    }
  fillSide('x', -140 - inset, -620, -300, -1, 0, false);
  // Leave a genuine road corridor for the new westbound inter-city connection.
  fillSide('z', -620 - inset, -140, -20, -1, Math.PI / 2, false);
  fillSide('z', -620 - inset, 20, 140, -1, Math.PI / 2, false);
  fillSide('x', 140 + inset, -620, -490, 1, Math.PI, false);
  // street trees + parked cars along town streets
  for (const e of g.edges) {
    if (e.type !== 'town') continue;
    const hw = e.w / 2;
    for (let s = 9; s < e.len - 9; s += 19) {
      const st = g.station(e, s + 9);
      for (const side of [1, -1]) {
        const off = side * (hw + 2.2);
        if (e.a.edges.length >= 3 && s < e.a.R + 10) continue;
        if (e.b.edges.length >= 3 && s > e.len - e.b.R - 10) continue;
        if (rnd() < 0.75) tree(c, 'birch', st.x + st.rx * off, st.z + st.rz * off, 0.85);
      }
    }
    for (let s = 12; s < e.len - 12; s += 6.2) {
      const st = g.station(e, s);
      if (e.a.edges.length >= 3 && s < e.a.R + 12) continue;
      if (e.b.edges.length >= 3 && s > e.len - e.b.R - 12) continue;
      for (const side of [1, -1]) {
        if (rnd() < 0.38) {
          const off = side * (hw - 1.0);
          parkedCar(c, st.x + st.rx * off, st.z + st.rz * off, Math.atan2(st.dx, st.dz) + (side > 0 ? 0 : Math.PI));
        }
      }
    }
    // benches & bins
    for (let s = 30; s < e.len - 30; s += 70) {
      const st = g.station(e, s);
      const off = (hw + 2.7) * (rnd() < 0.5 ? 1 : -1);
      if (rnd() < 0.6) bench(c, st.x + st.rx * off, st.z + st.rz * off, Math.atan2(st.rx, st.rz) * (off > 0 ? 1 : 1) + (off > 0 ? Math.PI : 0));
      else bin(c, st.x + st.rx * off, st.z + st.rz * off);
    }
  }
  nameBoard(-400, 7.4, 4, 0, t('citySign', { cityCenter: tr.cityCenter }), 4, 1.2);

  /* ============================= DEPOT (spawn) ============================= */
  apartment(c, -190, -142, 0, 22, 10, 2, 0);
  warehouse(c, -137, -138, 0, 28, 14, 7, 0xaab6c2, 2);
  nameBoard(-190, 7.2, -136.6, 0, tr.depotSign, 6, 1.8);
  for (const [fx0, fz0, fx1, fz1] of [[-232, -150, -120, -150], [-120, -150, -120, -60], [-120, -60, -232, -60], [-232, -150, -232, -112], [-232, -98, -232, -60]])
    fenceLine(c, fx0, fz0, fx1, fz1, 'chain');
  D.push(-232, 0, -105, -Math.PI / 2);
  D.box(0.4, 5.5, 0.4, M.metal, -8, 0, 0, 0x3a4048);
  D.box(0.4, 5.5, 0.4, M.metal, 8, 0, 0, 0x3a4048);
  D.pop();
  B.push(-232, 0, -105, -Math.PI / 2);
  B.box(17, 1.4, 0.3, M.logo, 0, 5.0, 0, 0xffffff, { tu: 17, tv: 1.4 });
  B.pop();
  col.addCircle(-232, -113, 0.4, 'pole'); col.addCircle(-232, -97, 0.4, 'pole');
  for (let i = 0; i < 4; i++) lorry(-127.5, -120 + i * 15, 0, pick([0xc83828, 0x2a5aa0, 0xe0e0dc]), pick([0xe8e8e4, 0xdcdcd0, 0xb8c4d0]));
  containerStack(c, -226, -78, 0, 1, 2);
  for (const [lx, lz] of [[-205, -128], [-170, -128], [-205, -78], [-165, -78], [-135, -78]]) standLamp(lx, lz, lz < -100 ? 0 : Math.PI);
  for (let i = 0; i < 6; i++) pallet(c, -214 + (i % 3) * 1.4, -140 + Math.floor(i / 3) * 1.1, 0, i % 3);
  barrels(c, -150, -62.5 + 4, 4);
  const terminal = { x: -158.5, z: -98.5 };
  D.push(terminal.x, 0, terminal.z, Math.PI);
  D.box(1.0, 2.0, 0.8, M.paint, 0, 0, 0, 0x2a3a5a);
  D.box(0.8, 0.6, 0.04, M.screen, 0, 1.2, 0.42, 0xffffff, { rx: 0.0 });
  D.box(1.2, 0.2, 1.0, M.metal, 0, 2.0, 0, 0x2a3a5a);
  D.pop();
  col.addBox(terminal.x, terminal.z, 0.5, 0.4, 0, 'kiosk');
  tree(c, 'oak', -225, -140, 1.1); tree(c, 'birch', -224, -64, 1);

  /* ============================== FUEL STATION ============================== */
  const pumps: { x: number; z: number }[] = [];
  {
    const cx = -200, cz = 95;
    B.box(36, 0.5, 44, M.paint, cx, 6.0, cz, 0xe8e8e8);
    B.box(34, 0.08, 40, M.stationLight, cx, 5.92, cz, 0xfff4dd);
    for (const s of [-1, 1]) {
      B.box(36.2, 0.9, 0.3, M.paint, cx, 5.7, cz + s * 22, 0xc82020);
      B.box(0.3, 0.9, 44, M.paint, cx + s * 18, 5.7, cz, 0xc82020);
    }
    for (const ix of [-210, -190]) {
      B.box(1.7, 0.25, 26, M.concrete, ix, 0, cz, 0xc8c8c0);
      col.addBox(ix, cz, 0.85, 13, 0, 'island');
      for (const pz of [-8, 0, 8]) {
        const px = ix, pzz = cz + pz;
        B.box(0.8, 1.6, 0.55, M.paint, px, 0.25, pzz, 0xe8e8e8, { ry: Math.PI / 2 });
        B.box(0.82, 0.4, 0.57, M.paint, px, 1.3, pzz, 0xc82020, { ry: Math.PI / 2 });
        for (const s of [-1, 1]) {
          B.box(0.05, 0.3, 0.5, M.screen, px + s * 0.42, 1.45, pzz, 0xffffff);
          D.box(0.12, 0.5, 0.1, M.rubber, px + s * 0.45, 0.8, pzz + 0.2, 0x111111);
        }
        pumps.push({ x: px, z: pzz });
      }
      for (const zz of [-12, 12]) {
        B.cyl(0.45, 0.45, 6, 10, M.concrete, ix, 0.25, cz + zz, 0xd8d8d0);
        B.cyl(0.3, 0.3, 0.9, 10, M.hazard, ix, 0.0, cz + zz + (zz > 0 ? 1.6 : -1.6), 0xffffff);
        col.addCircle(ix, cz + zz, 0.5, 'column');
      }
    }
    for (const [ex, ez] of [[-200, 69.5], [-200, 120.5]]) c.lamps.push({ x: ex, y: 5.5, z: ez });
    c.lamps.push({ x: -205, y: 5.5, z: 88 }, { x: -195, y: 5.5, z: 102 });
    GL.plane(30, 40, extra.glowMat, cx, 0.12, cz, 0xffffff, { tu: 30, tv: 40 });
    shop(c, -167, 95, -Math.PI / 2, 22, 9, 1, 0xe8e0d0);
    B.push(-167, 0, 95, -Math.PI / 2);
    B.box(8, 0.9, 0.2, M.stationLight, 0, 3.7, 4.55, 0xe83030);
    B.pop();
    // price pylon
    B.push(-233, 0, 70, Math.PI / 2);
    B.box(0.5, 7.5, 0.5, M.metal, 0, 0, 0, 0x30363c);
    B.box(2.8, 2.8, 0.3, M.signFuel, 0, 6.4, 0, 0xffffff, { tu: 2.8, tv: 2.8 });
    B.box(2.8, 1.4, 0.3, M.stationLight, 0, 4.7, 0, 0xffe070);
    B.pop();
    col.addCircle(-233, 70, 0.5, 'pylon');
    c.lamps.push({ x: -231, y: 6, z: 70 });
    bin(c, -172, 78, 0); bin(c, -172, 112, 0);
    vending(c, -161.5, 100, -Math.PI / 2);
    parkedCar(c, -176, 118, Math.PI / 2); parkedCar(c, -176, 122, Math.PI / 2);
    standLamp(-232, 122, Math.PI / 2); standLamp(-170, 66, -Math.PI / 2);
    barrels(c, -172, 126, 3);
    tree(c, 'oak', -160, 70, 1.2); tree(c, 'oak', -160, 125, 1.1);
  }

  /* ================================= GARAGE ================================= */
  warehouse(c, -272, 167, Math.PI / 2, 34, 26, 7, 0xb8c0cc, 3);
  nameBoard(-258.4, 5.6, 167, Math.PI / 2, tr.serviceSign, 5, 1.5);
  B.push(-252, 0, 167, 0);
  B.box(8, 0.02, 0.2, M.markYellow, 0, 0.04, -9.5, 0xf2c418); B.box(8, 0.02, 0.2, M.markYellow, 0, 0.04, 9.5, 0xf2c418);
  B.box(0.2, 0.02, 19, M.markYellow, -4, 0.04, 0, 0xf2c418); B.box(0.2, 0.02, 19, M.markYellow, 4, 0.04, 0, 0xf2c418);
  B.pop();
  for (let i = 0; i < 3; i++) D.cyl(0.6, 0.6, 0.3, 10, M.rubber, -250 + (i % 2) * 0.1, 0.3 * i, 190 - 4, 0x222222);
  barrels(c, -255, 150, 4);
  standLamp(-236, 150, Math.PI / 2); standLamp(-236, 186, Math.PI / 2);
  parkedCar(c, -250, 187, 0);
  tree(c, 'oak', -290, 145, 1.1); tree(c, 'bush', -265, 146, 1);

  /* ============================== INDUSTRIAL ============================== */
  warehouse(c, 400, 316, Math.PI, 100, 48, 11, 0x9fb0c4, 5);
  nameBoard(400, 8.0, 291.6, Math.PI, tr.warehouseSign, 9, 2.4);
  factory(c, 540, 330, Math.PI, 80, 44);
  nameBoard(540, 7.6, 307.6, Math.PI, tr.factorySign, 9, 2.4);
  warehouse(c, 668, 316, -Math.PI / 2, 56, 40, 9, 0xa8b49a, 4);
  for (const [sx, sz] of [[355, 347], [388, 347], [421, 347]]) containerStack(c, sx, sz, 0, 3, 2);
  containerStack(c, 492, 383, 0, 6, 2); containerStack(c, 525, 383, 0, 5, 2); containerStack(c, 565, 383, 0, 4, 1);
  for (let i = 0; i < 4; i++) tank(c, 350 + i * 14, 400, 5.5, 9);
  for (let i = 0; i < 4; i++) lorry(588 + i * 4.4, 276, 0, pick([0xc83828, 0x2a5aa0, 0x2f7d4f, 0xd8a020]), pick([0xe8e8e4, 0xdcdcd0, 0x7a8ca0]));
  for (let i = 0; i < 6; i++) parkedCar(c, 338 + (i % 2) * 5, 262 + Math.floor(i / 2) * 6, Math.PI / 2);
  for (let i = 0; i < 8; i++) pallet(c, 352 + (i % 4) * 1.5, 270 + Math.floor(i / 4) * 1.2, 0, i % 3);
  for (let i = 0; i < 6; i++) pallet(c, 500 + (i % 3) * 1.5, 262 + Math.floor(i / 3) * 1.2, 0, (i + 1) % 3);
  barrels(c, 462, 262, 5);
  bin(c, 480, 262, 0, true);
  for (const [lx, lz, lr] of [[360, 262, 0], [440, 262, 0], [500, 262, 0], [580, 262, 0], [360, 378, Math.PI], [440, 378, Math.PI], [520, 378, Math.PI], [640, 262, 0], [640, 360, Math.PI]])
    standLamp(lx, lz, lr);
  for (const [fx0, fz0, fx1, fz1] of [[330, 420, 602, 420], [638, 420, 700, 420], [700, 190, 700, 420], [640, 380, 700, 380], [330, 385, 330, 420]]) fenceLine(c, fx0, fz0, fx1, fz1, 'chain');
  fenceLine(c, 625, 255, 625, 372, 'chain');
  const forklifts: any[] = [];
  for (const [ax, az, bx, bz] of [[358, 289, 385, 289], [508, 302.5, 528, 302.5], [372, 349, 372, 364]]) {
    const f = makeForklift();
    f.position.set(ax, 0, az);
    root.add(f);
    forklifts.push({ g: f, ax, az, bx, bz, t: rnd(), dir: 1, spd: rr(0.05, 0.08), pause: 0 });
  }

  /* ================================= VILLAGE ================================= */
  const northX = [335, 352, 369, 386, 404, 421, 440, 478, 520, 538, 556];
  for (const x of northX) house(c, x + rr(-1, 1), -317 + rr(-1.5, 1.5), 0, rr(8, 10), 8, pick([1, 2, 2]));
  for (const x of [330, 348, 366, 478, 534, 552]) house(c, x, -282 + rr(-1, 1), Math.PI, rr(8, 10), 8, pick([1, 2]));
  shop(c, 505, -282, Math.PI, 11, 9, 1);
  nameBoard(498, 5.0, -330.9, 0, tr.villageSign, 3.2, 0.9);
  busStop(c, 400, -306.4, 0); bench(c, 428, -305.5, 0); bin(c, 432, -305.5, 0);
  // well
  B.cyl(1.0, 1.0, 1.0, 10, M.brick, 445, 0, -308, 0xffffff);
  B.box(0.1, 1.8, 0.1, M.wood, 444.2, 1.0, -308, 0x7a5a3a); B.box(0.1, 1.8, 0.1, M.wood, 445.8, 1.0, -308, 0x7a5a3a);
  B.gable(2.4, 0.7, 1.6, M.roofTile, 445, 2.8, -308, 0xa04a34, { ry: Math.PI / 2 });
  col.addCircle(445, -308, 1.1, 'well');
  // co-op
  warehouse(c, 418, -246, Math.PI, 46, 24, 7, 0xd0c090, 3);
  nameBoard(418, 5.4, -258.4, Math.PI, tr.coopSign, 6, 1.8);
  silo(c, 449, -248, 2.6, 14); silo(c, 449, -240, 2.6, 14);
  for (let i = 0; i < 6; i++) pallet(c, 392 + (i % 3) * 1.4, -262 + Math.floor(i / 3) * 1.1, 0, 2);
  standLamp(396, -290, Math.PI); standLamp(440, -290, Math.PI);
  // north boundary stops short of x=430 to leave a road corridor for the farm link (F1→VS)
  fenceLine(c, 385, -232, 425, -232, 'wood'); fenceLine(c, 385, -293, 385, -232, 'wood');
  for (const x of [320, 340, 360]) fenceLine(c, x, -296, x + 14, -296, 'wood', false);

  /* ================================== FARM ================================== */
  barn(c, 332, -190, -Math.PI / 2, 16, 22);
  house(c, 268, -200, Math.PI / 2, 11, 9, 2);
  silo(c, 352, -208, 2.8, 16); silo(c, 352, -200, 2.8, 16);
  haybale(c, 310, -177); haybale(c, 313.5, -177); haybale(c, 311.5, -177, false);
  haybale(c, 286, -178);
  tractor(c, 282, -180, 0.6);
  nameBoard(300, 2.6, -250, Math.PI, tr.farmSign, 2.4, 0.9);
  fenceLine(c, 270, -172, 346, -172, 'wood'); fenceLine(c, 346, -172, 346, -196, 'wood');
  barrels(c, 280, -214, 3);
  c.foot.push({ x: 300, z: -192, w: 76, d: 44, ry: 0, kind: 'farmyard' });

  /* ================================== FIELDS ================================== */
  const fields: { x0: number; z0: number; x1: number; z1: number; c: string }[] = [
    { x0: 115, z0: -290, x1: 200, z1: -222, c: '#6a9a3a' }, { x0: 205, z0: -290, x1: 288, z1: -226, c: '#b8a040' },
    { x0: 115, z0: -216, x1: 200, z1: -150, c: '#6a4a30' }, { x0: 205, z0: -218, x1: 262, z1: -150, c: '#6a9a3a' },
    { x0: 310, z0: -165, x1: 440, z1: -110, c: '#b8a040' }, { x0: 484, z0: -200, x1: 570, z1: -120, c: '#6a9a3a' },
    { x0: -200, z0: -250, x1: -60, z1: -150, c: '#b8a040' },
  ];
  const fm = [M.fieldGreen, M.fieldGold, M.fieldBrown, M.fieldGreen, M.fieldGold, M.fieldGreen, M.fieldGold];
  fields.forEach((f, i) => B.plane(f.x1 - f.x0, f.z1 - f.z0, fm[i], (f.x0 + f.x1) / 2, 0.03, (f.z0 + f.z1) / 2, 0xffffff, { tu: 8 }));
  for (const f of fields) {
    for (let x = f.x0; x < f.x1; x += 9) {
      tree(c, 'bush', x, f.z0 - 1.5, 1, false); tree(c, 'bush', x + 4, f.z1 + 1.5, 1, false);
    }
    for (let k = 0; k < 3; k++) haybale(c, rr(f.x0 + 6, f.x1 - 6), rr(f.z0 + 6, f.z1 - 6), rnd() < 0.7);
  }
  const turbines: THREE.Group[] = [];
  for (const [tx, tz] of [[160, -250], [250, -190], [380, -75], [-130, -200]]) {
    const gr = new THREE.Group();
    const tb = new Batcher(1e9, 0, true, null);
    tb.cyl(0.6, 1.1, 3, 10, M.flat, 0, 0, 0, 0xf0f0ee);
    tb.cyl(0.5, 0.9, 55, 10, M.flat, 0, 3, 0, 0xf0f0ee);
    tb.box(2.0, 2.0, 5.6, M.flat, 0, 58, 0, 0xe0e0e0);
    const tower = tb.toGroup();
    tower.position.set(tx, 0, tz);
    root.add(tower);
    const rb2 = new Batcher(1e9, 0, true, null);
    for (let k = 0; k < 3; k++) {
      rb2.push(0, 0, 0, 0);
      rb2.box(1.0, 28, 0.35, M.flat, 0, 1.0, 0, 0xf4f4f2, { rz: 0, c: false, ry: 0 });
      rb2.pop();
    }
    const blades = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const bb = new Batcher(1e9, 0, true, null);
      bb.box(0.9, 27, 0.3, M.flat, 0, 1.2, 0, 0xf4f4f2);
      const m = bb.toGroup();
      m.rotation.z = (k * Math.PI * 2) / 3;
      blades.add(m);
    }
    blades.position.set(tx, 58, tz + 3.2);
    root.add(blades);
    col.addCircle(tx, tz, 1.6, 'turbine');
    turbines.push(blades);
    void gr;
  }

  /* ================================= REST AREA ================================= */
  shop(c, 220, 22, 0, 12, 7, 1, 0xe0d8c4);
  nameBoard(220, 4.2, 25, 0, tr.restBoard, 4, 1.0);
  D.push(183, 0, 38, Math.PI);
  D.cyl(0.05, 0.06, 2.2, 6, M.metal, 0, 0, 0, 0x858b8e);
  D.box(0.8, 0.8, 0.04, M.signP, 0, 2.0, 0, 0xffffff);
  D.pop();
  col.addCircle(183, 38, 0.12, 'sign');
  for (let k = 0; k < 3; k++) picnic(c, 196 + k * 22, 31, 0.3 * k);
  bench(c, 236, 14, Math.PI); bin(c, 212, 30, 0); bin(c, 248, 30, 0); vending(c, 208, 18.5, 0, 0x2a5ea0); vending(c, 210.5, 18.5, 0, 0xc82a2a);
  for (let x = 186; x <= 254; x += 5.4) B.box(0.12, 0.02, 11, M.markWhite, x, 0.045, 65, 0xe8e8e0);
  for (let i = 0; i < 5; i++) lorry(189 + i * 5.4, 67, 0, pick([0xc83828, 0x2a5aa0, 0xe0e0dc, 0x2f7d4f]), pick([0xe8e8e4, 0xdcdcd0, 0x7a8ca0]));
  for (let i = 0; i < 3; i++) parkedCar(c, 232 + i * 5.4, 66, 0);
  for (const lx of [198, 222, 246]) standLamp(lx, 41.5, 0);
  for (let k = 0; k < 10; k++) tree(c, pick(['oak', 'birch', 'bush']) as any, rr(190, 252), rr(10, 17), 1);
  for (let k = 0; k < 8; k++) tree(c, pick(['oak', 'birch', 'pine']) as any, rr(178, 262), rr(88, 100), 1.1);
  nameBoard(182, 4.5, 36, 0, tr.parkingSign, 3, 1.0);

  const regional = buildRegionalSettlements(c, root, g, regionalNetwork.corridors);
  const expansion = buildExpansion(c, g);

  /* ================================= SCATTER ================================= */
  const forests: number[][] = [[-215, -460, 5, -345], [-120, -300, -20, -262]];
  scatter(forests[0], 520, ['pine', 'pine', 'pine', 'oak', 'birch', 'bush', 'rock'], 11, 1.1);
  scatter(forests[1], 60, ['pine', 'birch', 'oak'], 11, 1.0);
  scatter([-900, -600, -250, -440], 150, ['pine', 'oak', 'birch', 'bush'], 14, 1.2);
  scatter([-700, 180, -300, 560], 140, ['oak', 'birch', 'pine', 'bush'], 14, 1.1);
  scatter([100, 100, 330, 330], 90, ['oak', 'birch', 'bush', 'rock'], 14, 1.0);
  scatter([100, -110, 320, 200], 50, ['oak', 'bush', 'poplar'], 14);
  scatter([620, -340, 880, 150], 110, ['oak', 'pine', 'birch', 'bush'], 14, 1.1);
  scatter([700, 180, 880, 560], 60, ['pine', 'oak'], 14, 1.2);
  scatter([300, 430, 700, 590], 90, ['pine', 'oak', 'birch'], 14, 1.2);
  scatter([-200, 250, 300, 590], 120, ['pine', 'oak', 'birch', 'bush', 'rock'], 14, 1.1);
  scatter([-900, -160, -640, 300], 70, ['pine', 'oak'], 14, 1.2);
  scatter([300, -590, 700, -390], 90, ['pine', 'oak', 'birch'], 14, 1.2);
  scatter([-60, -600, 300, -470], 90, ['pine', 'oak'], 14, 1.2);
  scatter([320, -380, 620, -345], 40, ['oak', 'birch'], 12);
  scatter([320, -255, 380, -170], 20, ['oak', 'birch'], 12);
  // roadside trees along open roads
  for (const e of g.edges) {
    if (!(e.type === 'rural' || e.type === 'highway' || e.type === 'side' || e.type === 'industrial') || e.bridge) continue;
    const hw = e.w / 2;
    for (let s = 20; s < e.len - 20; s += 20) {
      const st = g.station(e, s);
      const side = rnd() < 0.5 ? 1 : -1;
      const off = side * (hw + (e.type === 'highway' ? 7 : 4.5) + rr(0, 8));
      const x = st.x + st.rx * off, z = st.z + st.rz * off;
      if (isBlocked(x, z, 4) || Math.abs(x - riverC(z)) < 18 || rnd() < 0.3 || nearFoot(x, z, 4)) continue;
      if (g.nearest(x, z).d < hw + 3) continue;
      tree(c, pick(['oak', 'birch', 'poplar', 'bush', 'pine']) as any, x, z, 1);
    }
  }
  // utility poles
  poleLine(c, [[-250, -200], [-250, -262], [-210, -303], [-120, -322], [-20, -331]], 44, 0);
  poleLine(c, [[130, -308], [300, -290]], 44, 8);
  poleLine(c, [[-110, 19], [-30, 19]], 48, 0);
  poleLine(c, [[30, 19], [140, 19]], 60, 0);
  poleLine(c, [[307, -295], [307, -215]], 40, 0);
  poleLine(c, [[-240, 30], [-240, 140]], 44, 10);
  const cableGeo = new THREE.BufferGeometry();
  cableGeo.setAttribute('position', new THREE.Float32BufferAttribute(c.cables, 3));
  const cables = new THREE.LineSegments(cableGeo, new THREE.LineBasicMaterial({ color: 0x15181c }));
  cables.frustumCulled = false;
  root.add(cables);

  /* ================================ LOCATIONS ================================ */
  const locations: Record<string, Location> = {
    warehouse: { id: 'warehouse', name: tr.warehouseName, short: tr.warehouseName, x: 400, z: 279.5, heading: Math.PI / 2, stack: { x: 400, z: 287.2 }, kind: 'industrial' },
    factory: { id: 'factory', name: tr.factoryName, short: tr.factoryName, x: 540, z: 296.5, heading: Math.PI / 2, stack: { x: 540, z: 304.2 }, kind: 'industrial' },
    village: { id: 'village', name: tr.villageNameFull, short: tr.villageNameFull, x: 418, z: -270, heading: Math.PI / 2, stack: { x: 418, z: -262.2 }, kind: 'village' },
    market: { id: 'market', name: tr.marketName, short: tr.marketName, x: -413.5, z: 200, heading: 0, stack: { x: -421.2, z: 200 }, kind: 'town' },
    farm: { id: 'farm', name: tr.farmName, short: tr.farmName, x: 298, z: -192, heading: 0, stack: { x: 306, z: -192 }, kind: 'farm' },
    depot: { id: 'depot', name: tr.depotName, short: tr.depotName, x: -170, z: -105, heading: 0, stack: { x: -170, z: -105 }, kind: 'depot' },
  };
  for (const k of ['warehouse', 'factory', 'village', 'market', 'farm']) zoneMark(locations[k]);
  // market building (after zone marks, yard slab is there)
  warehouse(c, -453, 200, Math.PI / 2, 50, 54, 8, 0xd8dccf, 3);
  nameBoard(-425.4, 6.4, 200, Math.PI / 2, tr.marketSign, 6, 1.8);
  for (let i = 0; i < 5; i++) parkedCar(c, -383, 178 + i * 5.2, Math.PI);
  for (let i = 0; i < 6; i++) pallet(c, -418 + (i % 2) * 1.4, 224 + Math.floor(i / 2) * 1.2, 0, 1);
  standLamp(-376, 176, -Math.PI / 2); standLamp(-376, 228, -Math.PI / 2); standLamp(-420, 236, Math.PI);
  bin(c, -386, 225, 0, true);
  fenceLine(c, -372, 238, -372, 192, 'chain'); fenceLine(c, -428, 238, -372, 238, 'chain');

  localizeCoreLocations(locations);
  Object.assign(locations, regional.locations, expansion.locations); pumps.push(...regional.pumps, ...expansion.pumps);
  const services: ServiceLocation[] = [
    { id: 'amasya.fuel', provinceId: 'amasya', name: tr.fuelName, kind: 'fuel', x: -200, z: 95, r: 40 },
    { id: 'amasya.garage', provinceId: 'amasya', name: tr.garageName, kind: 'garage', x: -251, z: 167, r: 12 },
    { id: 'amasya.rest', provinceId: 'amasya', name: tr.restName, kind: 'rest', x: 220, z: 40, r: 50 }, ...regional.services, ...expansion.services,
  ];
  const pois: Poi[] = [
    { id: 'town', name: tr.amasya, x: -430, z: 0, r: 180 }, { id: 'village', name: tr.villageName, x: 470, z: -300, r: 90 },
    { id: 'industrial', name: tr.industrialArea, x: 480, z: 310, r: 130 }, { id: 'fuel', name: tr.fuelName, x: -200, z: 95, r: 45 },
    { id: 'garage', name: tr.garageName, x: -260, z: 167, r: 35 }, { id: 'rest', name: tr.restName, x: 220, z: 40, r: 50 },
    { id: 'bridge', name: tr.bridgeName, x: 70, z: 0, r: 55 }, { id: 'forest', name: tr.forestName, x: -110, z: -400, r: 90 },
    { id: 'farm', name: tr.farmArea, x: 270, z: -190, r: 70 }, { id: 'hub', name: tr.junctionName, x: -240, z: 0, r: 40 },
    { id: 'mill', name: tr.millBridge, x: 56, z: -320, r: 40 }, { id: 'south', name: tr.southBridge, x: 80, z: 350, r: 40 }, ...regional.pois, ...expansion.pois,
  ];

  /* -------------------------------- finalize -------------------------------- */
  B.build(root);
  D.build(root);
  GL.build(root, false);
  I.build(root);
  GL.meshes.forEach((m) => (m.renderOrder = 2));
  void BRIDGES;
  (root as any).userData.nightExtra = nightExtra;

  return {
    root, graph: g, col, lamps: c.lamps, locations, pumps, garage: { x: -251, z: 167, r: 12 }, terminal,
    spawn: { x: -150, z: -105, heading: -Math.PI / 2, px: -153.4, pz: -101.0, pyaw: Math.PI },
    foot: c.foot, fields, forests, forklifts, turbines, pois,
    signalNodes: g.nodes.filter((n) => n.light),
    provinces: PROVINCES, cities: CITIES, services, garages: services.filter(s => s.kind === 'garage'),
    routeSignCodes: rb.routeSigns,
  };
}
