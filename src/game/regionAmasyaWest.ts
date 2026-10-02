import { tr } from './i18n';
import type { RoadType } from './roads';
import type { Industry, CargoContract } from './regions';
import { WORLD_SCALE } from './scale';

/**
 * Phase 3B — "Amasya batı" expansion (Suluova, Merzifon, Gümüşhacıköy).
 *
 * Pure data. regions.ts merges it into the province/city/location registries, the
 * existing RoadGraph builds its roads, and the existing CONTRACTS list builds its jobs.
 * All three places belong to the existing province 'amasya' (05), so no province is
 * added; this is the first province that owns more than one city.
 *
 * Positions are gameplay-scale, not survey-scale. Real bearings are kept: the D.100
 * corridor runs west from Amasya through Suluova to Merzifon.
 */

/** One flat elevation for every expansion site, so overlapping blend discs never step. */
export const EXPANSION_ELEVATION = 20;

/** Same 3x3 street grid the Phase 2 cities use (110 m spacing). */
export const CITY_GRID: [string, number, number][] = [
  ['center', 0, 0], ['north', 0, -110], ['south', 0, 110], ['west', -110, 0], ['east', 110, 0],
  ['nw', -110, -110], ['ne', 110, -110], ['sw', -110, 110], ['se', 110, 110],
];
export const CITY_STREETS: [string, string][] = [
  ['west', 'center'], ['center', 'east'], ['north', 'center'], ['center', 'south'],
  ['nw', 'north'], ['north', 'ne'], ['ne', 'east'], ['east', 'se'], ['se', 'south'], ['south', 'sw'], ['sw', 'west'], ['west', 'nw'],
];

export interface ExpansionCity {
  id: string; provinceId: string; displayName: string; x: number; z: number; elevation: number;
  populationScale: 'small' | 'medium' | 'large'; industries: Industry[];
  fuelStations: string[]; garages: string[]; restAreas: string[];
}
export interface ExpansionVillage {
  id: string; provinceId: string; displayName: string; x: number; z: number; elevation: number;
}
export interface ExpansionJunction { id: string; x: number; z: number }
export interface ExpansionRoad {
  id: string; routeCode?: string; from: string; to: string; type: RoadType; via: [number, number][];
  /** Text for traffic approaching the `to` / `from` end (settlement ends print the entrance sign instead). */
  signTo?: string; signFrom?: string;
}
export interface ExpansionLocation {
  id: string; name: string; type: 'industrial'; cityId: string; provinceId: string; industry: Industry;
}

/**
 * Authored on the original compressed grid; `EXPANSION` below stretches it to
 * gameplay scale exactly like the province records in regions.ts do.
 */
const SOURCE = {
  cities: [
    {
      id: 'amasya.merzifon', provinceId: 'amasya', displayName: tr.merzifon, x: -1560, z: -760, elevation: EXPANSION_ELEVATION,
      populationScale: 'medium', industries: ['machinery', 'food', 'agriculture'],
      fuelStations: ['amasya.merzifon.fuel'], garages: ['amasya.merzifon.garage'], restAreas: [],
    },
    {
      id: 'amasya.suluova', provinceId: 'amasya', displayName: tr.suluova, x: -1000, z: -560, elevation: EXPANSION_ELEVATION,
      populationScale: 'medium', industries: ['food', 'agriculture'],
      fuelStations: [], garages: [], restAreas: ['amasya.suluova.rest'],
    },
  ] as ExpansionCity[],
  villages: [
    { id: 'amasya.gumushacikoy', provinceId: 'amasya', displayName: tr.gumushacikoy, x: -1250, z: -800, elevation: EXPANSION_ELEVATION },
  ] as ExpansionVillage[],
  junctions: [
    { id: 'amasya.west.junction', x: -1250, z: -620 },
  ] as ExpansionJunction[],
  /**
   * Existing-network connection: the Amasya north-arm node ('amasya.northArm') -> Suluova.
   * Every road is built by the existing RoadGraph.connect(); route codes come from here.
   * Approach angles at each junction are kept >= 60 degrees apart for the junction surface.
   */
  roads: [
    {
      id: 'amasya-suluova', routeCode: 'D.100', from: 'amasya.northArm', to: 'amasya.suluova.east', type: 'rural',
      via: [[-330, -282], [-480, -352], [-640, -450], [-780, -548]], signTo: tr.suluova, signFrom: tr.amasya,
    },
    {
      id: 'suluova-merzifon.west', routeCode: 'D.100', from: 'amasya.suluova.west', to: 'amasya.west.junction', type: 'rural',
      via: [[-1180, -562], [-1215, -585]], signTo: tr.merzifon, signFrom: tr.suluova,
    },
    {
      id: 'suluova-merzifon.east', routeCode: 'D.100', from: 'amasya.west.junction', to: 'amasya.merzifon.east', type: 'rural',
      via: [[-1340, -638], [-1388, -705], [-1415, -758]], signTo: tr.merzifon, signFrom: tr.suluova,
    },
    {
      id: 'merzifon-gumushacikoy.access', from: 'amasya.west.junction', to: 'amasya.gumushacikoy.center', type: 'village',
      via: [[-1252, -710]], signTo: tr.gumushacikoy, signFrom: tr.merzifon,
    },
    {
      id: 'merzifon-gumushacikoy.return', from: 'amasya.gumushacikoy.center', to: 'amasya.merzifon.ne', type: 'rural',
      via: [[-1330, -835], [-1395, -862]], signTo: tr.merzifon, signFrom: tr.gumushacikoy,
    },
  ] as ExpansionRoad[],
  /** Location registry entries (id, name, type, cityId, provinceId). Built geometry lives in regionalExpansion.ts. */
  locations: [
    { id: 'merzifon.logistics', name: tr.merzifonSite, type: 'industrial', cityId: 'amasya.merzifon', provinceId: 'amasya', industry: 'machinery' },
    { id: 'suluova.food', name: tr.suluovaSite, type: 'industrial', cityId: 'amasya.suluova', provinceId: 'amasya', industry: 'food' },
  ] as ExpansionLocation[],
  /** Jobs for the existing mission system: existing->new, new->existing, new->new. */
  contracts: [
    { id: 'tr.food.merzifon', cargo: 'goods', title: tr.cargoGoods, cargoName: tr.cargoFood, weight: 7200, from: 'warehouse', to: 'merzifon.logistics', xp: 210, blurb: tr.jobMerzifon },
    { id: 'tr.food.market', cargo: 'goods', title: tr.cargoGoods, cargoName: tr.cargoFood, weight: 6600, from: 'suluova.food', to: 'market', xp: 190, blurb: tr.jobSuluova },
    { id: 'tr.grain.suluova', cargo: 'goods', appearance: 'grain', title: tr.cargoGrain, cargoName: tr.cargoWheat, weight: 9400, from: 'merzifon.logistics', to: 'suluova.food', xp: 170, blurb: tr.jobMerzifonSuluova },
    { id: 'tr.metal.merzifon', cargo: 'pallets', title: tr.cargoSteel, cargoName: tr.cargoFittings, weight: 11200, from: 'factory', to: 'merzifon.logistics', xp: 215, blurb: tr.jobMerzifonMetal },
  ] as CargoContract[],
};

const K = WORLD_SCALE;
const scalePt = ([x, z]: [number, number]): [number, number] => [x * K, z * K];
/** The same authored layout, stretched to the gameplay-scale map. */
export const EXPANSION = {
  cities: SOURCE.cities.map(c => ({ ...c, x: c.x * K, z: c.z * K })),
  villages: SOURCE.villages.map(v => ({ ...v, x: v.x * K, z: v.z * K })),
  junctions: SOURCE.junctions.map(j => ({ ...j, x: j.x * K, z: j.z * K })),
  roads: SOURCE.roads.map(r => ({ ...r, via: r.via.map(scalePt) })),
  locations: SOURCE.locations,
  contracts: SOURCE.contracts,
};
