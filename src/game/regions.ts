import { tr } from './i18n';
import type { RoadType } from './roads';
import { EXPANSION } from './regionAmasyaWest';

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
export const WORLD_BOUNDS = { x0: -1960, x1: 2470, z0: -1710, z1: 2270 };
export const CORE_BOUNDS = { x0: -740, x1: 740, z0: -490, z1: 510 };

const province = (id: string, code: string, name: string, x: number, z: number, latitude: number, longitude: number,
  elevation: number, environment: EnvironmentType, region: RegionId, industries: Industry[], cargo: string[], roads: string[], populationScale: Province['populationScale'] = 'medium'): Province => ({
  id, name: id, displayName: name, plateCode: code, region, x, z, latitude, longitude, elevation, environment, industries,
  populationScale, connectedRoads: roads, cities: [`${id}.center`], districts: [{ id: `${id}.merkez`, displayName: tr.centerDistrict }],
  cargoOrigins: cargo, cargoDestinations: cargo, fuelStations: [`${id}.fuel`], garages: [`${id}.garage`], restAreas: [`${id}.rest`],
});

// Coordinates preserve regional bearings, not real-world scale or cadastral boundaries.
export const PROVINCES: Province[] = [
  province('amasya', '05', tr.amasya, -350, 0, 40.65, 35.83, 0, 'valley', 'karadeniz', ['agriculture', 'machinery', 'food'], ['warehouse', 'factory', 'farm', 'village', 'market', 'depot'], ['amasya-samsun', 'amasya-tokat', 'amasya-corum']),
  province('samsun', '55', tr.samsun, 490, -1270, 41.29, 36.33, 0, 'coastal', 'karadeniz', ['food', 'textile', 'automotive'], ['samsun.distribution'], ['amasya-samsun'], 'large'),
  province('corum', '19', tr.corum, -1390, 520, 40.55, 34.95, 16, 'industrial', 'karadeniz', ['machinery', 'automotive', 'food'], ['corum.factory'], ['amasya-corum', 'corum-yozgat']),
  province('tokat', '60', tr.tokat, 1290, 620, 40.32, 36.55, 20, 'agricultural', 'karadeniz', ['agriculture', 'textile', 'construction'], ['tokat.logistics'], ['amasya-tokat', 'tokat-sivas']),
  province('sivas', '58', tr.sivas, 1950, 1660, 39.75, 37.02, 42, 'plateau', 'icAnadolu', ['metal', 'construction'], ['sivas.industry'], ['tokat-sivas', 'yozgat-sivas']),
  province('yozgat', '66', tr.yozgat, -1500, 1680, 39.82, 34.8, 30, 'plateau', 'icAnadolu', ['agriculture', 'food'], ['yozgat.coop'], ['corum-yozgat', 'yozgat-sivas']),
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
}
export const CITIES: City[] = [
  ...PROVINCES.map(p => ({ id: `${p.id}.center`, provinceId: p.id, displayName: p.displayName,
    x: p.x, z: p.z, elevation: p.elevation, populationScale: p.populationScale, districts: p.districts, industries: p.industries })),
  ...EXPANSION.cities.map(c => ({ id: c.id, provinceId: c.provinceId, displayName: c.displayName, x: c.x, z: c.z,
    elevation: c.elevation, populationScale: c.populationScale, industries: c.industries,
    districts: [{ id: `${c.id}.merkez`, displayName: tr.centerDistrict }] })),
];
export const CITY_BY_ID = Object.fromEntries(CITIES.map(c => [c.id, c])) as Record<string, City>;
export const REGION_NAMES: Record<RegionId, string> = { karadeniz: tr.regionKaradeniz, icAnadolu: tr.regionIcAnadolu };
export interface Village {
  id: string; provinceId: string; districtId: string; displayName: string; x: number; z: number; cargoLocation?: string;
}
export const VILLAGES: Village[] = [
  { id: 'amasya.yesiloz', provinceId: 'amasya', districtId: 'amasya.merkez', displayName: tr.villageName, x: 460, z: -300, cargoLocation: 'village' },
  ...EXPANSION.villages.map(v => ({ id: v.id, provinceId: v.provinceId, districtId: `${v.provinceId}.merkez`, displayName: v.displayName, x: v.x, z: v.z })),
];
/** Expansion sites whose surroundings the elevation field flattens (and scatter keeps clear). */
export const EXPANSION_SITES: { id: string; provinceId: string; x: number; z: number; elevation: number }[] =
  [...EXPANSION.cities, ...EXPANSION.villages];

/**
 * Location registry, derived from the provinces that already declare their cargo
 * sites — one source of truth, so a future province adds its locations by declaring
 * them. Amasya declares the six original Phase 1 sites; the others declare one each.
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
};
export const CORE_NAMES: Record<string, string> = {
  warehouse: tr.warehouseName, factory: tr.factoryName, village: tr.villageNameFull,
  market: tr.marketName, farm: tr.farmName, depot: tr.depotName,
};

export interface RegionalRoad {
  id: string; routeCode: string; from: string; to: string; type: RoadType;
  via: [number, number][]; environment: EnvironmentType;
}
export const REGIONAL_ROADS: RegionalRoad[] = [
  { id: 'amasya-samsun', routeCode: 'D.100 / D.795', from: 'amasya.north', to: 'samsun.south', type: 'highway', environment: 'valley',
    via: [[460, -490], [570, -630], [710, -780], [660, -960], [490, -1080]] },
  { id: 'amasya-corum', routeCode: 'D.180', from: 'amasya.west', to: 'corum.north', type: 'rural', environment: 'agricultural',
    via: [[-780, 0], [-1030, 95], [-1260, 235], [-1390, 330]] },
  { id: 'amasya-tokat', routeCode: 'D.180', from: 'amasya.east', to: 'tokat.north', type: 'rural', environment: 'valley',
    via: [[620, 440], [790, 530], [1010, 465], [1240, 395], [1290, 440]] },
  { id: 'corum-yozgat', routeCode: 'D.795 / D.200', from: 'corum.south', to: 'yozgat.north', type: 'rural', environment: 'plateau',
    via: [[-1390, 760], [-1510, 1010], [-1370, 1260], [-1500, 1450]] },
  { id: 'tokat-sivas', routeCode: 'D.850', from: 'tokat.south', to: 'sivas.north', type: 'rural', environment: 'plateau',
    via: [[1290, 845], [1430, 1040], [1690, 1130], [1810, 1350], [1950, 1460]] },
  { id: 'yozgat-sivas.west', routeCode: 'D.200', from: 'yozgat.east', to: 'plateau.bridgeWest', type: 'rural', environment: 'plateau',
    via: [[-1190, 1680], [-830, 1650], [-490, 1620], [-90, 1620]] },
  { id: 'yozgat-sivas.east', routeCode: 'D.200', from: 'plateau.bridgeEast', to: 'sivas.west', type: 'rural', environment: 'plateau',
    via: [[360, 1620], [730, 1670], [1180, 1750], [1540, 1730], [1710, 1660]] },
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
  { id: 'tr.textile.corum', cargo: 'goods', appearance: 'textile', title: tr.cargoTextile, cargoName: tr.cargoFabric, weight: 4800, from: 'samsun.distribution', to: 'corum.factory', xp: 310, blurb: tr.jobTextile },
  { id: 'tr.building.sivas', cargo: 'pallets', title: tr.cargoBuilding, cargoName: tr.cargoCement, weight: 13800, from: 'tokat.logistics', to: 'sivas.industry', xp: 290, blurb: tr.jobBuilding },
  ...EXPANSION.contracts,
];