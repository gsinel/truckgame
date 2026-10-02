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
  province('samsun', '55', tr.samsun, 490, -1270, 41.29, 36.33, 6, 'coastal', 'karadeniz', ['food', 'textile', 'automotive'], ['samsun.distribution', 'samsun.port'], ['amasya-samsun'], 'large'),
  province('corum', '19', tr.corum, -1390, 520, 40.55, 34.95, 86, 'industrial', 'karadeniz', ['machinery', 'automotive', 'food'], ['corum.factory', 'corum.food'], ['amasya-corum', 'corum-yozgat']),
  province('tokat', '60', tr.tokat, 1290, 620, 40.32, 36.55, 46, 'agricultural', 'karadeniz', ['agriculture', 'textile', 'construction'], ['tokat.logistics', 'tokat.textile'], ['amasya-tokat', 'tokat-sivas']),
  province('sivas', '58', tr.sivas, 1950, 1660, 39.75, 37.02, 168, 'plateau', 'icAnadolu', ['metal', 'construction'], ['sivas.industry', 'sivas.cement'], ['tokat-sivas', 'yozgat-sivas']),
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
  landmark: 'port' | 'lighthouse' | 'clockTower' | 'castle' | 'railStation' | 'sugarFactory' | 'stoneGate' | 'medrese' | 'stoneBridge' | 'none';
  trees: ('poplar' | 'pine' | 'oak' | 'birch' | 'bush')[];
  wall: number; roof: number;
  wide: boolean;
}
const profile = (layout: CityProfile['layout'], landmark: CityProfile['landmark'], trees: CityProfile['trees'],
  wall: number, roof: number, wide = false): CityProfile => ({ layout, landmark, trees, wall, roof, wide });

export const CITY_PROFILES: Record<string, CityProfile> = {
  'amasya.center': profile('valley', 'none', ['poplar', 'oak'], 0xf2e6cc, 0xa04a34),
  'amasya.merzifon': profile('historic', 'medrese', ['oak', 'poplar'], 0xe9d8b8, 0xa8563a),
  'amasya.suluova': profile('industrial', 'sugarFactory', ['poplar'], 0xdfd6c4, 0x8a7a68),
  'amasya.gumushacikoy': profile('agricultural', 'stoneBridge', ['poplar', 'birch'], 0xe6dcc4, 0x8f5540),
  'samsun.center': profile('coastal', 'port', ['poplar'], 0xeef0ea, 0x5f6d78, true),
  'corum.center': profile('industrial', 'stoneGate', ['oak', 'pine'], 0xe4d9bd, 0x7d5a44),
  'tokat.center': profile('historic', 'castle', ['poplar', 'oak'], 0xf0e4c8, 0x9c4f36),
  'sivas.center': profile('plateau', 'railStation', ['poplar'], 0xe8e2d2, 0x6b6f78, true),
  'yozgat.center': profile('plateau', 'clockTower', ['pine', 'oak'], 0xe6ddc0, 0x8a6248),
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
  [...EXPANSION.cities, ...EXPANSION.villages];

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

export interface CargoContract {
  id: string; cargo: 'pallets' | 'machinery' | 'goods'; title: string; cargoName: string;
  weight: number; from: string; to: string; xp: number; blurb: string;
  appearance?: 'produce' | 'grain' | 'textile';
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
  ...EXPANSION.contracts,
];
