import { tr } from './i18n';
import type { RoadType } from './roads';
import { EXPANSION } from './regionAmasyaWest';
import { WORLD_SCALE } from './scale';

export type EnvironmentType = 'valley' | 'coastal' | 'agricultural' | 'plateau' | 'industrial';
export type Industry = 'machinery' | 'agriculture' | 'food' | 'textile' | 'metal' | 'construction' | 'automotive';
/** Turkish statistical region a province belongs to. */
export type RegionId = 'karadeniz' | 'icAnadolu';
export interface Province {
  id: string; name: string; displayName: string; plateCode: string; region: RegionId;
  latitude: number; longitude: number; x: number; z: number; elevation: number;
  populationScale: 'small' | 'medium' | 'large'; environment: EnvironmentType;
  industries: Industry[]; connectedRoads: string[];
  cities: string[]; districts: { id: string; displayName: string }[];
  cargoOrigins: string[]; cargoDestinations: string[];
  fuelStations: string[]; garages: string[]; restAreas: string[];
}
export const CORE_BOUNDS = { x0: -740, x1: 740, z0: -490, z1: 510 };

const province = (id: string, code: string, name: string, x: number, z: number, latitude: number, longitude: number,
  elevation: number, environment: EnvironmentType, region: RegionId, industries: Industry[], cargo: string[], roads: string[], populationScale: Province['populationScale'] = 'medium'): Province => ({
    // Amasya is the hand-authored core, so it stays where world.ts builds it.
    id, name: id, displayName: name, plateCode: code, region,
    x: id === 'amasya' ? x : x * WORLD_SCALE, z: id === 'amasya' ? z : z * WORLD_SCALE,
    latitude, longitude, elevation, environment, industries,
    populationScale, connectedRoads: roads, cities: [`${id}.center`], districts: [{ id: `${id}.merkez`, displayName: tr.centerDistrict }],
    cargoOrigins: cargo, cargoDestinations: cargo, fuelStations: [`${id}.fuel`], garages: [`${id}.garage`], restAreas: [`${id}.rest`],
  });

// Coordinates preserve regional bearings at compressed gameplay scale, not real-world distances.
export const PROVINCES: Province[] = [
  province('amasya', '05', tr.amasya, -350, 0, 40.65, 35.83, 0, 'valley', 'karadeniz', ['agriculture', 'machinery', 'food'], ['warehouse', 'factory', 'farm', 'village', 'market', 'depot'], ['amasya-samsun', 'amasya-tokat', 'amasya-corum']),
  province('samsun', '55', tr.samsun, 490, -1270, 41.29, 36.33, 6, 'coastal', 'karadeniz', ['food', 'textile', 'automotive'], ['samsun.distribution', 'samsun.port'], ['amasya-samsun', 'samsun-corum'], 'large'),
  province('corum', '19', tr.corum, -1390, 520, 40.55, 34.95, 86, 'industrial', 'karadeniz', ['machinery', 'automotive', 'food'], ['corum.factory', 'corum.food'], ['amasya-corum', 'corum-yozgat', 'samsun-corum', 'corum-sivas']),
  province('tokat', '60', tr.tokat, 1290, 620, 40.32, 36.55, 46, 'agricultural', 'karadeniz', ['agriculture', 'textile', 'construction'], ['tokat.logistics', 'tokat.textile'], ['amasya-tokat', 'tokat-sivas']),
  province('sivas', '58', tr.sivas, 1950, 1660, 39.75, 37.02, 168, 'plateau', 'icAnadolu', ['metal', 'construction'], ['sivas.industry', 'sivas.cement'], ['tokat-sivas', 'yozgat-sivas', 'corum-sivas']),
  province('yozgat', '66', tr.yozgat, -1500, 1680, 39.82, 34.8, 138, 'plateau', 'icAnadolu', ['agriculture', 'food'], ['yozgat.coop'], ['corum-yozgat', 'yozgat-sivas']),
];
// Phase 3B: the Amasya-west expansion belongs to the existing province, so it extends that record.
// (cargoOrigins and cargoDestinations share one array in province(), so both are reassigned.)
{
  const amasya = PROVINCES[0];
  const siteIds = EXPANSION.locations.map(l => l.id);
  amasya.cities = [...amasya.cities, ...EXPANSION.cities.map(c => c.id)];
  amasya.cargoOrigins = [...amasya.cargoOrigins, ...siteIds];
  amasya.cargoDestinations = [...amasya.cargoDestinations, ...siteIds];
  amasya.fuelStations = [...amasya.fuelStations, ...EXPANSION.cities.flatMap(c => c.fuelStations)];
  amasya.garages = [...amasya.garages, ...EXPANSION.cities.flatMap(c => c.garages)];
  amasya.restAreas = [...amasya.restAreas, ...EXPANSION.cities.flatMap(c => c.restAreas)];
  amasya.connectedRoads = [...amasya.connectedRoads, ...EXPANSION.roads.map(r => r.id)];
}
export const PROVINCE_BY_ID = Object.fromEntries(PROVINCES.map(p => [p.id, p])) as Record<string, Province>;
export interface City {
  id: string; provinceId: string; displayName: string; x: number; z: number; elevation: number;
  populationScale: Province['populationScale']; districts: Province['districts']; industries: Industry[];
  profile: CityProfile;
}
/**
 * Per-city identity. Every regional city is built from the same block vocabulary
 * but not from the same layout: the profile picks the street rhythm, the
 * landmark, the skyline and the vegetation that make the city recognisable
 * from the road.
 */
export interface CityProfile {
  layout: 'valley' | 'coastal' | 'plateau' | 'industrial' | 'agricultural' | 'historic';
  landmark: 'port' | 'lighthouse' | 'clockTower' | 'castle' | 'railStation' | 'sugarFactory' | 'stoneGate' | 'medrese' | 'stoneBridge' | 'rockTombs' | 'none';
  trees: ('poplar' | 'pine' | 'oak' | 'birch' | 'bush')[];
  wall: number; roof: number;
  wide: boolean;
}
const profile = (layout: CityProfile['layout'], landmark: CityProfile['landmark'], trees: CityProfile['trees'],
  wall: number, roof: number, wide = false): CityProfile => ({ layout, landmark, trees, wall, roof, wide });

export const CITY_PROFILES: Record<string, CityProfile> = {
  // Amasya finally gets its own silhouette: the Harşena rock tombs above the valley.
  'amasya.center': profile('valley', 'rockTombs', ['poplar', 'oak'], 0xf2e6cc, 0xa04a34),
  'amasya.merzifon': profile('historic', 'medrese', ['oak', 'poplar'], 0xe9d8b8, 0xa8563a),
  'amasya.suluova': profile('industrial', 'sugarFactory', ['poplar'], 0xdfd6c4, 0x8a7a68),
  'amasya.gumushacikoy': profile('agricultural', 'stoneBridge', ['poplar', 'birch'], 0xe6dcc4, 0x8f5540),
  'samsun.center': profile('coastal', 'port', ['poplar'], 0xeef0ea, 0x5f6d78, true),
  'corum.center': profile('industrial', 'stoneGate', ['oak', 'pine'], 0xe4d9bd, 0x7d5a44),
  'tokat.center': profile('historic', 'castle', ['poplar', 'oak'], 0xf0e4c8, 0x9c4f36),
  'sivas.center': profile('plateau', 'railStation', ['poplar'], 0xe8e2d2, 0x6b6f78, true),
  'yozgat.center': profile('plateau', 'clockTower', ['pine', 'oak'], 0xe6ddc0, 0x8a6248),
};

/* ------------------------------------------------------------------ */
/*  City street rhythm                                                 */
/* ------------------------------------------------------------------ */
/**
 * Every provincial centre used to be the same 3x3 grid, so the cities differed by
 * palette only. Each one now gets its own outer pattern: a valley terrace, a quay,
 * a freight apron, an old-town ring, a plateau ring road, a bypass avenue.
 *
 * The vocabulary is a *chamfer*: the corner of the grid is cut off by a short arc
 * (axis node -> A -> B -> the other axis node). Arcs only ever live inside a
 * quadrant, so they never run along an corridor axis and never lay a lane on top of
 * a guard rail — which is what the lane-clearance validator enforces.
 */
export interface CityBelt { nodes: [string, number, number][]; edges: [string, string][] }
type Quad = [number, number];   // [x side, z side]; -z is north, as in CITY_GRID

const CORNER: Record<string, Quad> = { nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1] };

function chamfer(q: Quad): CityBelt {
  const [sx, sz] = q;
  const name = (sz < 0 ? 'n' : 's') + (sx < 0 ? 'w' : 'e');
  const axisX = sx > 0 ? 'east' : 'west';
  const axisZ = sz < 0 ? 'north' : 'south';
  return {
    nodes: [[`belt-${name}-a`, 272 * sx, 152 * sz], [`belt-${name}-b`, 152 * sx, 272 * sz]],
    edges: [[axisX, `belt-${name}-a`], [`belt-${name}-a`, `belt-${name}-b`], [`belt-${name}-b`, axisZ]],
  };
}

function belt(quads: (keyof typeof CORNER)[], extra: CityBelt = { nodes: [], edges: [] }): CityBelt {
  const parts = quads.map((q) => chamfer(CORNER[q]));
  return {
    nodes: [...parts.flatMap((p) => p.nodes), ...extra.nodes],
    edges: [...parts.flatMap((p) => p.edges), ...extra.edges],
  };
}

export const CITY_BELTS: Record<string, CityBelt> = {
  // Amasya: the terraced road climbing the valley side above the Yeşilırmak
  'amasya.center': belt(['nw', 'sw']),
  // Samsun: a quay street along the shore, tied into both coastal corners
  'samsun.center': belt(['nw', 'ne']),
  // Çorum: a work yard on the industrial corner, reached by a dead-end spur
  'corum.center': belt(['se'], {
    nodes: [['belt-yard', 350, 196]],
    edges: [['belt-se-a', 'belt-yard']],
  }),
  // Tokat: two opposite old quarters, each with its own gate street
  'tokat.center': belt(['nw', 'se']),
  // Sivas: a ring road on three sides; the fourth is left to the rail yard, which the
  // landmark clearance picks as the quietest corner exactly because of this gap.
  'sivas.center': belt(['nw', 'ne', 'sw']),
  // Yozgat: a southern bypass avenue plus the co-op grain spur
  'yozgat.center': belt(['sw', 'se'], {
    nodes: [['belt-silo', -222, 404]],
    edges: [['belt-sw-b', 'belt-silo']],
  }),
};

export const CITIES: City[] = [
  ...PROVINCES.map(p => ({ id: `${p.id}.center`, provinceId: p.id, displayName: p.displayName,
    x: p.x, z: p.z, elevation: p.elevation, populationScale: p.populationScale, districts: p.districts, industries: p.industries,
    profile: CITY_PROFILES[`${p.id}.center`] })),
  ...EXPANSION.cities.map(c => ({ id: c.id, provinceId: c.provinceId, displayName: c.displayName, x: c.x, z: c.z,
    elevation: c.elevation, populationScale: c.populationScale, industries: c.industries,
    profile: CITY_PROFILES[c.id] ?? CITY_PROFILES['amasya.center'],
    districts: [{ id: `${c.id}.merkez`, displayName: tr.centerDistrict }] })),
];
export const CITY_BY_ID = Object.fromEntries(CITIES.map(c => [c.id, c])) as Record<string, City>;
export const REGION_NAMES: Record<RegionId, string> = { karadeniz: tr.regionKaradeniz, icAnadolu: tr.regionIcAnadolu };
export interface Village {
  id: string; provinceId: string; districtId: string; displayName: string; x: number; z: number; cargoLocation?: string;
  /** Road the settlement lines, when it is a corridor village rather than a city edge. */
  road?: string; at?: number;
}
export const VILLAGES: Village[] = [
  { id: 'amasya.yesiloz', provinceId: 'amasya', districtId: 'amasya.merkez', displayName: tr.villageName, x: 460, z: -300, cargoLocation: 'village' },
  // Corridor settlements: they exist so long hauls are not empty kilometres.
  { id: 'amasya.kirikvadi', provinceId: 'amasya', districtId: 'amasya.merkez', displayName: tr.villageKirikvadi, x: 1980, z: -2620, road: 'amasya-samsun', at: 0.28 },
  { id: 'corum.bayat', provinceId: 'corum', districtId: 'corum.merkez', displayName: tr.villageBayat, x: -3780, z: -330, road: 'amasya-corum', at: 0.34 },
  { id: 'tokat.gokdere', provinceId: 'tokat', districtId: 'tokat.merkez', displayName: tr.villageGokdere, x: 4260, z: 1420, road: 'amasya-tokat', at: 0.42 },
  { id: 'yozgat.sorgun', provinceId: 'yozgat', districtId: 'yozgat.merkez', displayName: tr.villageSorgun, x: -5300, z: 10890, road: 'yozgat-sivas.west', at: 0.46 },
  ...EXPANSION.villages.map(v => ({ id: v.id, provinceId: v.provinceId, districtId: `${v.provinceId}.merkez`, displayName: v.displayName, x: v.x, z: v.z })),
];
/** Expansion sites whose surroundings the elevation field flattens (and scatter keeps clear). */
export const EXPANSION_SITES: { id: string; provinceId: string; x: number; z: number; elevation: number }[] =
  [...EXPANSION.cities, ...EXPANSION.villages,
   ...(EXPANSION.flat ?? []).map((f, i) => ({ id: `amasya.flat${i}`, provinceId: 'amasya', x: f.x, z: f.z, elevation: f.elevation }))];

/**
 * Playable bounds, derived from the placed sites so a new city or village can
 * never fall outside the terrain mesh or the boundary clamp.
 */
export const WORLD_BOUNDS = (() => {
  const xs: number[] = [], zs: number[] = [];
  const add = (x: number, z: number, r: number) => { xs.push(x - r, x + r); zs.push(z - r, z + r); };
  add(0, 0, 1500); // the hand-authored Amasya core plus its valley
  for (const p of PROVINCES.slice(1)) add(p.x, p.z, 900);
  for (const s of EXPANSION_SITES) add(s.x, s.z, 900);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
})();

/**
 * Location registry, derived from the provinces that already declare their cargo
 * sites — one source of truth, so a future province adds its locations by declaring
 * them. Amasya declares the six original Phase 1 sites; the others declare their own.
 */
/** One entry per province declaration; a repeat here means two provinces claim one site. */
export const DECLARED_LOCATION_IDS: string[] = PROVINCES.flatMap(p => [...new Set([...p.cargoOrigins, ...p.cargoDestinations])]);
export const LOCATION_IDS: string[] = [...new Set(DECLARED_LOCATION_IDS)];
/** Explicit location -> city links for locations that declare one (the Phase 3B expansion). */
const LOCATION_CITY: Record<string, string> = Object.fromEntries(EXPANSION.locations.map(l => [l.id, l.cityId]));
/** Mirrors the cityId assigned at build time by regionalWorld / localizeCoreLocations. */
export const cityIdForLocation = (locationId: string): string =>
  LOCATION_CITY[locationId] ?? (locationId.includes('.') ? `${locationId.split('.')[0]}.center` : 'amasya.center');
export const provinceIdForLocation = (locationId: string): string =>
  CITY_BY_ID[cityIdForLocation(locationId)]?.provinceId ?? 'amasya';
export const REGIONAL_SITE_NAMES: Record<string, string> = {
  'tokat.logistics': tr.tokatSite, 'corum.factory': tr.corumSite, 'samsun.distribution': tr.samsunSite,
  'sivas.industry': tr.sivasSite, 'yozgat.coop': tr.yozgatSite,
  'samsun.port': tr.samsunPort, 'corum.food': tr.corumFood, 'tokat.textile': tr.tokatTextile, 'sivas.cement': tr.sivasCement,
};
export const CORE_NAMES: Record<string, string> = {
  warehouse: tr.warehouseName, factory: tr.factoryName, village: tr.villageNameFull,
  market: tr.marketName, farm: tr.farmName, depot: tr.depotName,
};

export interface RegionalRoad {
  id: string; routeCode: string; from: string; to: string; type: RoadType;
  via: [number, number][]; environment: EnvironmentType;
  /** Optional display name for the corridor (used by the map and the event feed). */
  name?: string;
}

/**
 * Corridors. `via` points are authored in FINAL world metres (already stretched by
 * WORLD_SCALE) because they are designed against the terrain: each one is a real
 * route with bends, a pass or a river crossing, never a straight line between two
 * city squares. Endpoints are graph ports, so they follow the cities automatically.
 */
export const REGIONAL_ROADS: RegionalRoad[] = [
  // Amasya (Yeşilırmak valley) -> Samsun: climbs out of the valley, crosses the
  // coastal range at Kırıkvadi and descends to the Black Sea plain.
  { id: 'amasya-samsun', routeCode: 'D.795 / D.100', from: 'amasya.north', to: 'samsun.south', type: 'highway', environment: 'coastal', name: tr.roadSamsun,
    via: [[700, -900], [1150, -1250], [1700, -1500], [2100, -1950], [2000, -2650], [1750, -3300], [2050, -4100], [2600, -4900], [3100, -5800], [3350, -6700], [3250, -7500]] },
  // Amasya -> Tokat: D.180 following the valley east, with the Gökdere pass.
  { id: 'amasya-tokat', routeCode: 'D.180', from: 'amasya.east', to: 'tokat.north', type: 'rural', environment: 'valley', name: tr.roadTokat,
    via: [[1050, 500], [1500, 800], [1900, 600], [2400, 300], [3000, 450], [3600, 900], [4200, 1400], [4800, 1650], [5400, 1500], [6000, 1700], [6600, 2200], [7200, 2800], [7800, 3400], [8100, 3800]] },
  // Amasya -> Çorum: west out of the valley, then north onto the Anatolian plateau.
  { id: 'amasya-corum', routeCode: 'D.180', from: 'amasya.west', to: 'corum.north', type: 'rural', environment: 'agricultural', name: tr.roadCorum,
    via: [[-1100, -150], [-1700, -120], [-2400, 60], [-3100, -100], [-3800, -420], [-4500, -350], [-5200, 0], [-5900, 300], [-6600, 700], [-7300, 1100], [-8000, 1700], [-8600, 2500], [-8900, 3100]] },
  // Samsun -> Çorum over the Canik range. The port's second outlet: until this road
  // existed every haul in or out of Samsun had to double back through the Yeşilırmak
  // valley, which made the whole network a chain with a dead end at the sea.
  { id: 'samsun-corum', routeCode: 'D.010 / D.170', from: 'samsun.west', to: 'corum.east', type: 'rural', environment: 'coastal', name: tr.roadCanik,
    via: [[2450, -7850], [1700, -7600], [900, -7350], [150, -6950], [-560, -6400], [-1250, -5750], [-1980, -5350], [-2700, -5650],
      [-3380, -5200], [-4050, -4500], [-4700, -3850], [-5350, -3150], [-6050, -2600], [-6750, -1950], [-7400, -1200], [-7950, -350],
      [-7750, -200], [-7250, 700], [-6900, 1700], [-6850, 2700], [-7400, 3300]] },
  // Çorum -> Sivas on the old Sungurlu track, straight across the plateau. It closes the
  // chain into a loop: a Sivas haul can now be run as a circuit instead of a there-and-back.
  // It arrives at the city's own east gate (see extendRegionalNetwork), because the Yozgat
  // corridor already owns every other approach to Sivas.
  { id: 'corum-sivas', routeCode: 'D.200', from: 'corum.south', to: 'sivas.sungurlu', type: 'rural', environment: 'plateau', name: tr.roadSungurlu,
    via: [[-8200, 3900], [-7200, 4500], [-6100, 5100], [-5000, 5700], [-3900, 6300], [-2700, 6900], [-1500, 7400], [-300, 7900],
      [1000, 8400], [2300, 8900], [3600, 9300], [4900, 9700], [6200, 10000], [7500, 10250], [8800, 10300], [10200, 10420],
      [11400, 10400], [12300, 10450], [13050, 10450], [13300, 10750], [13250, 10950]] },
  // Çorum -> Yozgat: plateau road over the Bozok hills.
  { id: 'corum-yozgat', routeCode: 'D.200', from: 'corum.south', to: 'yozgat.north', type: 'rural', environment: 'plateau', name: tr.roadYozgat,
    via: [[-9200, 3900], [-9600, 4400], [-9400, 5000], [-8900, 5500], [-8700, 6200], [-9000, 6900], [-9600, 7400], [-9800, 8100], [-9400, 8700], [-9100, 9400], [-9500, 10000], [-9700, 10600]] },
  // Tokat -> Sivas: long climb onto the dry Sivas plateau, past the cement works.
  { id: 'tokat-sivas', routeCode: 'D.850', from: 'tokat.south', to: 'sivas.north', type: 'rural', environment: 'plateau', name: tr.roadSivas,
    via: [[8700, 4500], [9200, 5000], [9800, 5400], [10400, 5900], [10800, 6500], [11200, 7200], [11500, 7900], [11900, 8600], [12300, 9200], [12500, 9900], [12650, 10400]] },
  // Yozgat -> Sivas: the long plateau haul. Split by the Yeşilırmak crossing.
  { id: 'yozgat-sivas.west', routeCode: 'D.200', from: 'yozgat.east', to: 'plateau.bridgeWest', type: 'rural', environment: 'plateau', name: tr.roadSivas,
    via: [[-8600, 11150], [-7600, 10850], [-6500, 10980], [-5400, 10890], [-4300, 11050], [-3200, 10940], [-2100, 10780], [-1100, 10950], [-300, 10860]] },
  { id: 'yozgat-sivas.east', routeCode: 'D.200', from: 'plateau.bridgeEast', to: 'sivas.west', type: 'rural', environment: 'plateau', name: tr.roadSivas,
    via: [[900, 10980], [1900, 10850], [2900, 11020], [3900, 10870], [4900, 11010], [6000, 10760], [7000, 10980], [8100, 10820], [9200, 11000], [10300, 10850], [11400, 10950]] },
];
/** The long D.200 crossing: bridge node pair (river centre is 79 m at this z). */
export const PLATEAU_BRIDGE = { z: 10920, west: { x: 49, z: 10920 }, east: { x: 109, z: 10920 } };

/**
 * Roadside services on the long corridors. Placement is data, geometry is built by
 * roadside.ts from the graph, so a sign can never point at a stop that is not there.
 */
export interface RoadsideStop {
  id: string; kind: 'fuel' | 'rest' | 'garage'; name: string; provinceId: string;
  road: string; at: number; side: 1 | -1;
}
export const ROADSIDE_STOPS: RoadsideStop[] = [
  { id: 'road.samsun.fuel', kind: 'fuel', name: tr.stopKirikvadi, provinceId: 'amasya', road: 'amasya-samsun', at: 0.34, side: 1 },
  { id: 'road.samsun.rest', kind: 'rest', name: tr.stopHavza, provinceId: 'samsun', road: 'amasya-samsun', at: 0.72, side: 1 },
  { id: 'road.tokat.fuel', kind: 'fuel', name: tr.stopGokdere, provinceId: 'tokat', road: 'amasya-tokat', at: 0.55, side: -1 },
  { id: 'road.corum.fuel', kind: 'fuel', name: tr.stopBayat, provinceId: 'corum', road: 'amasya-corum', at: 0.62, side: 1 },
  { id: 'road.corum.rest', kind: 'rest', name: tr.stopMecitozu, provinceId: 'corum', road: 'amasya-corum', at: 0.3, side: -1 },
  { id: 'road.yozgat.fuel', kind: 'fuel', name: tr.stopSorgun, provinceId: 'yozgat', road: 'yozgat-sivas.west', at: 0.5, side: 1 },
  { id: 'road.canik.fuel', kind: 'fuel', name: tr.stopCakiralan, provinceId: 'corum', road: 'samsun-corum', at: 0.44, side: 1 },
  { id: 'road.sungurlu.rest', kind: 'rest', name: tr.stopOsmancik, provinceId: 'corum', road: 'corum-sivas', at: 0.36, side: -1 },
  { id: 'road.sivas.rest', kind: 'rest', name: tr.stopYildizeli, provinceId: 'sivas', road: 'tokat-sivas', at: 0.66, side: -1 },
  { id: 'road.sivas.garage', kind: 'garage', name: tr.stopSivasServis, provinceId: 'sivas', road: 'yozgat-sivas.east', at: 0.45, side: 1 },
];

export function provinceAt(x: number, z: number): Province {
  if (x >= CORE_BOUNDS.x0 && x <= CORE_BOUNDS.x1 && z >= CORE_BOUNDS.z0 && z <= CORE_BOUNDS.z1) return PROVINCES[0];
  for (const s of EXPANSION_SITES) if ((s.x - x) ** 2 + (s.z - z) ** 2 < 240 * 240) return PROVINCE_BY_ID[s.provinceId];
  let found = PROVINCES[0], best = Infinity;
  for (const p of PROVINCES) {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < best) { best = d; found = p; }
  }
  return found;
}

export type CargoRisk = 'normal' | 'fragile' | 'hazmat';
export interface CargoContract {
  id: string; cargo: 'pallets' | 'machinery' | 'goods'; title: string; cargoName: string;
  weight: number; from: string; to: string; xp: number; blurb: string;
  appearance?: 'produce' | 'grain' | 'textile';
  /** how badly the load reacts to a rough handling / crash: see missions.finishUnloading */
  risk?: CargoRisk;
}
export const CONTRACTS: CargoContract[] = [
  { id: 'j1', cargo: 'machinery', title: tr.cargoMachinery, cargoName: tr.cargoCnc, weight: 9400, from: 'warehouse', to: 'village', xp: 160, blurb: tr.jobLocalMachine },
  { id: 'j2', cargo: 'goods', title: tr.cargoGoods, cargoName: tr.cargoFood, weight: 6200, from: 'warehouse', to: 'market', xp: 130, blurb: tr.jobLocalFood },
  { id: 'j3', cargo: 'pallets', title: tr.cargoSteel, cargoName: tr.cargoFittings, weight: 11800, from: 'factory', to: 'farm', xp: 190, blurb: tr.jobLocalSteel },
  { id: 'j4', cargo: 'goods', appearance: 'produce', title: tr.cargoProduce, cargoName: tr.cargoApples, weight: 5400, from: 'village', to: 'market', xp: 120, blurb: tr.jobLocalProduce },
  { id: 'j5', cargo: 'machinery', title: tr.cargoPress, cargoName: tr.cargoHydraulic, weight: 12600, from: 'factory', to: 'warehouse', xp: 110, blurb: tr.jobLocalPress },
  { id: 'tr.machine.tokat', cargo: 'machinery', title: tr.cargoMachinery, cargoName: tr.cargoCnc, weight: 9800, from: 'warehouse', to: 'tokat.logistics', xp: 240, blurb: tr.jobTokat },
  { id: 'tr.apples.samsun', cargo: 'goods', appearance: 'produce', title: tr.cargoProduce, cargoName: tr.cargoApples, weight: 6200, from: 'farm', to: 'samsun.distribution', xp: 260, blurb: tr.jobSamsun },
  { id: 'tr.parts.amasya', cargo: 'pallets', title: tr.cargoParts, cargoName: tr.cargoAuto, weight: 8600, from: 'corum.factory', to: 'warehouse', xp: 250, blurb: tr.jobCorum },
  { id: 'tr.metal.amasya', cargo: 'pallets', title: tr.cargoSteel, cargoName: tr.cargoFittings, weight: 12000, from: 'sivas.industry', to: 'warehouse', xp: 370, blurb: tr.jobSivas },
  { id: 'tr.grain.tokat', cargo: 'goods', appearance: 'grain', title: tr.cargoGrain, cargoName: tr.cargoWheat, weight: 10500, from: 'yozgat.coop', to: 'tokat.logistics', xp: 330, blurb: tr.jobYozgat },
  { id: 'tr.textile.corum', cargo: 'goods', appearance: 'textile', title: tr.cargoTextile, cargoName: tr.cargoFabric, weight: 4800, from: 'tokat.textile', to: 'corum.factory', xp: 310, blurb: tr.jobTextile },
  { id: 'tr.building.sivas', cargo: 'pallets', title: tr.cargoBuilding, cargoName: tr.cargoCement, weight: 13800, from: 'tokat.logistics', to: 'sivas.industry', xp: 290, blurb: tr.jobBuilding },
  { id: 'tr.cement.amasya', cargo: 'pallets', title: tr.cargoBuilding, cargoName: tr.cargoCement, weight: 14200, from: 'sivas.cement', to: 'warehouse', xp: 400, blurb: tr.jobCement },
  { id: 'tr.textile.samsun', cargo: 'goods', appearance: 'textile', title: tr.cargoTextile, cargoName: tr.cargoFabric, weight: 5600, from: 'tokat.textile', to: 'samsun.port', xp: 340, blurb: tr.jobTextilePort },
  { id: 'tr.food.tokat', cargo: 'goods', title: tr.cargoGoods, cargoName: tr.cargoFood, weight: 7400, from: 'corum.food', to: 'tokat.logistics', xp: 280, blurb: tr.jobFoodTokat },
  { id: 'tr.container.corum', cargo: 'pallets', title: tr.cargoParts, cargoName: tr.cargoAuto, weight: 9800, from: 'samsun.port', to: 'corum.factory', xp: 380, blurb: tr.jobContainer },
  { id: 'tr.grain.samsun', cargo: 'goods', appearance: 'grain', title: tr.cargoGrain, cargoName: tr.cargoWheat, weight: 11200, from: 'yozgat.coop', to: 'samsun.port', xp: 420, blurb: tr.jobGrainPort },
  { id: 'tr.machine.corum', cargo: 'machinery', title: tr.cargoMachinery, cargoName: tr.cargoCnc, weight: 10400, from: 'corum.factory', to: 'sivas.industry', xp: 360, blurb: tr.jobMachineSivas },
  { id: 'tr.glass.tokat', cargo: 'pallets', title: tr.cargoBuilding, cargoName: tr.cargoGlass, weight: 7600, from: 'corum.food', to: 'tokat.textile', xp: 300, blurb: tr.jobGlassTokat, risk: 'fragile' },
  { id: 'tr.fuel.sivas', cargo: 'goods', title: tr.cargoGoods, cargoName: tr.cargoFuel, weight: 13400, from: 'samsun.port', to: 'sivas.cement', xp: 430, blurb: tr.jobFuelSivas, risk: 'hazmat' },
  ...EXPANSION.contracts,
];

/* ------------------------------------------------------------------ */
/*  Generated offers                                                   */
/* ------------------------------------------------------------------ */
/* The authored contracts above carry hand-written blurbs; the market beyond them is
 * generated from the same data the rest of the world uses: real cargo sites, real
 * cargo templates, weight and risk per commodity. Distances, pay and the delivery
 * window are NOT invented here — buildJobs() measures every offer on the navigation
 * graph, so a generated job can never promise a route that does not exist.
 * Deterministic (fixed LCG) so two runs of the same build see the same board. */

const OFFER_TEMPLATES: { cargo: CargoContract['cargo']; title: string; cargoName: string; appearance?: CargoContract['appearance']; risk: CargoRisk; kg: [number, number] }[] = [
  { cargo: 'pallets', title: tr.cargoParts, cargoName: tr.cargoAuto, risk: 'normal', kg: [7200, 10800] },
  { cargo: 'pallets', title: tr.cargoBuilding, cargoName: tr.cargoCement, risk: 'normal', kg: [12400, 15200] },
  { cargo: 'pallets', title: tr.cargoSteel, cargoName: tr.cargoFittings, risk: 'normal', kg: [9800, 13600] },
  { cargo: 'goods', appearance: 'produce', title: tr.cargoProduce, cargoName: tr.cargoApples, risk: 'fragile', kg: [4600, 7400] },
  { cargo: 'goods', appearance: 'grain', title: tr.cargoGrain, cargoName: tr.cargoWheat, risk: 'normal', kg: [9200, 12800] },
  { cargo: 'goods', appearance: 'textile', title: tr.cargoTextile, cargoName: tr.cargoFabric, risk: 'fragile', kg: [3800, 6200] },
  { cargo: 'machinery', title: tr.cargoMachinery, cargoName: tr.cargoCnc, risk: 'fragile', kg: [9400, 12600] },
  { cargo: 'machinery', title: tr.cargoPress, cargoName: tr.cargoHydraulic, risk: 'normal', kg: [11200, 14400] },
  { cargo: 'goods', title: tr.cargoGoods, cargoName: tr.cargoFuel, risk: 'hazmat', kg: [12600, 15800] },
];

export const OFFER_SITE_IDS: string[] = LOCATION_IDS;

/** `gen` counts the roll, so a re-roll of the board produces a different market. */
export function generateContracts(count = 12, gen = 0): CargoContract[] {
  const ids = OFFER_SITE_IDS;
  if (ids.length < 4) return [];
  let seed = (20261003 + gen * 7919) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out: CargoContract[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const a = ids[Math.floor(rnd() * ids.length)];
    let b = ids[Math.floor(rnd() * ids.length)];
    if (a === b || seen.has(`${a}>${b}`)) continue;
    // an offer only makes sense between different kinds of site
    const kindA = a.split('.')[a.split('.').length - 1], kindB = b.split('.')[b.split('.').length - 1];
    if (kindA === kindB) continue;
    seen.add(`${a}>${b}`);
    const t = OFFER_TEMPLATES[Math.floor(rnd() * OFFER_TEMPLATES.length)];
    const weight = Math.round((t.kg[0] + rnd() * (t.kg[1] - t.kg[0])) / 100) * 100;
    out.push({
      id: `gen${gen}.${a}->${b}`, cargo: t.cargo, appearance: t.appearance, title: t.title, cargoName: t.cargoName,
      weight, from: a, to: b, xp: 120 + Math.round(rnd() * 9) * 15,
      blurb: `${a.split('.').pop()} → ${b.split('.').pop()} · ${t.cargoName}`, risk: t.risk,
    });
  }
  return out;
}
