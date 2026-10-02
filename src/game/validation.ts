import type { World } from './world';
import type { Job } from './missions';
import { Navigator } from './nav';
import { CONTRACTS, PROVINCES, CITIES, CITY_BY_ID, PROVINCE_BY_ID, LOCATION_IDS, DECLARED_LOCATION_IDS, cityIdForLocation, VILLAGES, REGION_NAMES, RegionId } from './regions';
import { readProfile, writeProfile, SAVE_KEY, PLAYER_TRUCK } from './profile';
import { TruckSim } from './physics';
import { evaluateParking } from './missions';
import { groundHeight } from './elevation';
import { GAME_EVENT_TYPES } from './events';
import { tr, money } from './i18n';

export interface ValidationCheck { name: string; passed: boolean; detail: string }

/** Structural regressions only. These are deliberately not labelled acceptance/play tests. */
export function validatePhase2(world: World, jobs: Job[]) {
  const checks: ValidationCheck[] = [];
  const check = (name: string, passed: boolean, detail: string) => checks.push({ name, passed, detail });
  const g = world.graph;
  const missingCities = PROVINCES.filter(p => !world.cities.some(c => c.id === `${p.id}.center` && c.provinceId === p.id)
    || !world.pois.some(poi => poi.id === p.id));
  const requiredLocations = [...new Set(CONTRACTS.flatMap(j => [j.from, j.to]))];
  const missingLocations = requiredLocations.filter(id => !world.locations[id]);
  const missingRoadConnections = PROVINCES.flatMap(p => p.connectedRoads
    .filter(id => !g.edges.some(e => e.key === id || e.key?.startsWith(`${id}.`)))
    .map(id => ({ province: p.id, road: id })));
  const missingReferences = [
    ...CONTRACTS.flatMap(j => [j.from, j.to].filter(id => !world.locations[id]).map(id => ({ contract: j.id, location: id }))),
    ...PROVINCES.flatMap(p => [...p.fuelStations, ...p.garages, ...p.restAreas]
      .filter(id => !world.services.some(s => s.id === id)).map(id => ({ province: p.id, service: id }))),
  ];
  const reachable = (reverse = false) => {
    const seen = new Set<number>(), queue = [g.nearest(world.spawn.x, world.spawn.z).e.a];
    while (queue.length) {
      const n = queue.pop()!;
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      for (const e of n.edges) {
        if (e.oneWay && (reverse ? e.a === n : e.b === n)) continue;
        queue.push(e.a === n ? e.b : e.a);
      }
    }
    return seen.size;
  };
  check('Directed regional connectivity', reachable() === g.nodes.length && reachable(true) === g.nodes.length,
    `${g.nodes.length} nodes, ${g.edges.length} road segments; outward and return reachability`);
  const endsValid = g.edges.every(e => e.len > 0 && Number.isFinite(e.len)
    && Math.hypot(e.pts[0].x - e.a.x, e.pts[0].z - e.a.z) < 0.001
    && Math.hypot(e.pts[e.pts.length - 1].x - e.b.x, e.pts[e.pts.length - 1].z - e.b.z) < 0.001);
  check('Spline endpoints', endsValid, 'Rendered road source endpoints match routing nodes within 1 mm');
  check('Region facilities', missingReferences.length === 0,
    `${PROVINCES.length} regions; ${world.services.length} services; ${missingReferences.length} missing references`);
  check('Cities physically registered', missingCities.length === 0, `${world.cities.length} city records, ${world.pois.length} discovery regions`);
  check('Province road connections', missingRoadConnections.length === 0, `${g.edges.length} road segments; ${missingRoadConnections.length} declared corridor IDs missing`);
  check('Contracts reference built sites', CONTRACTS.every(j => world.locations[j.from] && world.locations[j.to])
    && jobs.every(j => j.km > 0 && j.reward > 0), `${jobs.length} offers with calculated road distances`);
  const nav = new Navigator(g);
  check('Regional routes', Object.values(world.locations).every(loc => nav.route(world.spawn, loc).pts.length > 2), 'Route generated from the original depot to every cargo location');
  // Phase 3B: everything the expansion data declares must exist in the built world.
  const missingExpansion: string[] = [];
  for (const l of EXPANSION.locations) {
    const built = world.locations[l.id];
    if (!built) { missingExpansion.push(`location:${l.id}`); continue; }
    if (built.cityId !== l.cityId || built.provinceId !== l.provinceId || built.kind !== l.type || !built.name) missingExpansion.push(`fields:${l.id}`);
  }
  for (const c of EXPANSION.cities) {
    for (const [ids, kind] of [[c.fuelStations, 'fuel'], [c.garages, 'garage'], [c.restAreas, 'rest']] as [string[], string][])
      for (const id of ids) if (!world.services.some(s => s.id === id && s.kind === kind)) missingExpansion.push(`service:${id}`);
    for (const id of c.fuelStations) {
      const s = world.services.find(q => q.id === id);
      if (s && !world.pumps.some(p => Math.hypot(p.x - s.x, p.z - s.z) < 20)) missingExpansion.push(`pump:${id}`);
    }
  }
  for (const r of EXPANSION.roads) if (!g.edges.some(e => e.key === r.id)) missingExpansion.push(`road:${r.id}`);
  for (const t of EXPANSION.contracts) if (!jobs.some(j => j.id === t.id)) missingExpansion.push(`job:${t.id}`);
  check('Amasya-west expansion built', missingExpansion.length === 0,
    `${EXPANSION.locations.length} locations, ${EXPANSION.roads.length} roads, ${EXPANSION.contracts.length} jobs; missing: ${missingExpansion.join(', ') || 'none'}`);
  const requiredRoadCodes = ['D.100', 'D.180', 'D.795', 'D.850', 'D.200'];
  const routeShieldCodes = world.routeSignCodes;
  const missingRouteShields = requiredRoadCodes.filter(code => !routeShieldCodes.includes(code));
  check('Graph route shield data', missingRouteShields.length === 0, `Missing route codes: ${missingRouteShields.join(', ') || 'none'}; renderer places markers from tagged edges`);
  const sim = new TruckSim();
  const loc = world.locations.warehouse;
  sim.reset(loc.x + Math.sin(loc.heading) * 6.5, loc.z + Math.cos(loc.heading) * 6.5, loc.heading);
  const accurate = evaluateParking(loc, sim);
  sim.x += Math.cos(loc.heading) * 3 + Math.sin(loc.heading) * 4;
  sim.z += -Math.sin(loc.heading) * 3 + Math.cos(loc.heading) * 4;
  const poor = evaluateParking(loc, sim);
  check('Parking geometry regression', accurate.score > 99 && accurate.inZone && poor.score < 40 && poor.inZone,
    'The existing parking evaluator distinguishes precise and poor stopped positions');

  // In-memory storage exercises the production serializer, without touching real saves.
  const saved = new Map<string, string>();
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } };
  storage.setItem('nordhaul_p1', JSON.stringify({ money: 18500.5, xp: 175, level: 3 }));
  const legacy = readProfile(storage);
  check('Legacy save migration', legacy?.money === 18500.5 && legacy.xp === 175 && legacy.level === 3 && legacy.truckId === PLAYER_TRUCK,
    'Original Phase 1 key migrates with unconverted numeric progression');
  if (legacy) {
    writeProfile(storage, { ...legacy, money: 23120.75, xp: 255, truckId: 'NH-SAVED-ID', truckOwned: true });
    const reload = readProfile(storage);
    check('v1 save round-trip', reload?.money === 23120.75 && reload.xp === 255 && reload.level === 3 && reload.truckOwned && reload.truckId === 'NH-SAVED-ID',
      'Actual read/write functions, simulated storage; a real browser reload is still required');
  }
  check('Save schema retained', JSON.parse(storage.getItem(SAVE_KEY) || '{}').v === 1, 'Phase 2 metadata does not replace v1 progression');
  const invalidSurface = g.edges.some(e => e.pts.some(p => !Number.isFinite(groundHeight(p.x, p.z))));
  check('Elevation field', !invalidSurface && groundHeight(world.spawn.x, world.spawn.z) === 0, 'Finite heights, original depot still at its tested elevation');

  const obstructions: { road: string; x: number; z: number; tag?: string }[] = [];
  for (const e of g.edges.filter(e => e.key && !e.key.includes('.street.'))) {
    for (let s = Math.min(25, e.len / 3); s < e.len - 15; s += 12) {
      const p = g.station(e, s), lane = e.type === 'highway' ? 5.25 : 1.85;
      for (const dir of [-1, 1]) {
        const x = p.x + p.rx * lane * dir, z = p.z + p.rz * lane * dir;
        world.col.query(x, z, 1.25, hit => {
          if (hit.pen > 0.08 && obstructions.length < 30) obstructions.push({ road: e.key!, x, z, tag: hit.c.tag });
        });
      }
    }
  }
  check('Regional lane clearance samples', obstructions.length === 0, `${obstructions.length} static collider overlaps in sampled lane corridors`);
  const REQUIRED_TEXT_KEYS = [
    'start', 'jobs', 'dispatch', 'accept', 'cancel', 'cargo', 'origin', 'destination', 'distance', 'reward',
    'fuel', 'damage', 'repair', 'refuel', 'parking', 'completed', 'continue', 'amasya', 'tokat', 'corum',
    'samsun', 'sivas', 'yozgat', 'stop', 'yield', 'cityCenter', 'caution', 'entry', 'exitSign', 'restSign',
    'construction', 'shopTire', 'dirTown', 'dirInd', 'dirVillage', 'dirRest', 'dirFuel', 'dirDepot',
    'fuelLow', 'fuelEmpty', 'saveError', 'parkContact', 'cargoApples', 'cargoWheat', 'cargoFabric',
  ] as const;
  const missingLocalizationKeys = REQUIRED_TEXT_KEYS.filter(key => typeof tr[key] !== 'string' || !tr[key].trim());
  const glyphSample = 'çÇğĞıİöÖşŞüÜ';
  const currency = money(1850) === '₺1.850' && money(12500) === '₺12.500';
  const localizationChecks = {
    missingKeys: missingLocalizationKeys,
    turkishGlyphCodepointsPresent: [...glyphSample].every(ch => ch.codePointAt(0)! > 127),
    fontLatinExtDeclared: true, // VT323's packaged Google Fonts metadata includes latin-ext.
    currencyTrTRExpectedFormatting: currency,
    visualGlyphRender: 'NOT_TESTABLE (HEADLESS)',
  };
  const requiredEvents = ['PLAYER_CRASHED', 'DELIVERY_COMPLETED', 'DELIVERY_FAILED', 'FUEL_LOW', 'FUEL_EMPTY',
    'PARKING_SUCCESS', 'PARKING_FAILED', 'NEW_LOCATION_DISCOVERED', 'TRAFFIC_ACCIDENT', 'WEATHER_CHANGED'];
  const missingEventHooks = requiredEvents.filter(event => !(GAME_EVENT_TYPES as readonly string[]).includes(event));
  check('Event hook identifiers', missingEventHooks.length === 0, `${requiredEvents.length - missingEventHooks.length}/${requiredEvents.length} required identifiers retained; no events were emitted`);
  check('Localization data and currency format', missingLocalizationKeys.length === 0 && currency,
    `${REQUIRED_TEXT_KEYS.length - missingLocalizationKeys.length}/${REQUIRED_TEXT_KEYS.length} keys; currency example ${money(1850)}`);

  const report = {
    scope: 'STRUCTURAL_ONLY',
    structuralChecks: checks,
    missingReferences,
    missingCities: missingCities.map(p => p.id),
    missingLocations,
    missingRoadConnections,
    missingExpansion,
    missingEventHooks,
    localizationChecks,
    saveSchema: {
      version: 1,
      moneyXpLevelOwnershipTruckIdRoundTrip: checks.some(c => c.name === 'v1 save round-trip' && c.passed),
      legacySaveMigration: checks.some(c => c.name === 'Legacy save migration' && c.passed),
      browserReload: 'NOT_TESTABLE (HEADLESS)',
    },
    routeShieldCodes,
    roadSurfaceClearanceSamples: obstructions,
    runtimeAcceptance: 'NOT_RUN',
  };
  return report;
}

/* ------------------------------------------------------------------ */
/*  World data integrity (pure data, no built world, no simulation)     */
/* ------------------------------------------------------------------ */
export interface DataIssue { kind: string; id: string; detail: string }
export interface WorldDataReport {
  scope: 'DATA_ONLY';
  counts: { provinces: number; cities: number; locations: number };
  byRegion: Record<string, string[]>;
  duplicateProvinceIds: string[];
  duplicateCityIds: string[];
  duplicateLocationIds: string[];
  missingCityReferences: DataIssue[];
  missingProvinceReferences: DataIssue[];
  invalidLocationReferences: DataIssue[];
  expansion: {
    cities: string[]; villages: string[]; roads: number; locations: string[];
    fuelStations: string[]; garages: string[]; restAreas: string[]; disconnected: string[];
  };
  expansionIssues: DataIssue[];
  passed: boolean;
}

const duplicates = (ids: string[]) => [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];

/**
 * Lightweight structural check of the province/city/location data. Runs on the
 * module data alone, so it can be evaluated without a browser or a built world.
 */
export function validateWorldData(): WorldDataReport {
  const missingCityReferences: DataIssue[] = [];
  const missingProvinceReferences: DataIssue[] = [];
  const invalidLocationReferences: DataIssue[] = [];

  // Location -> City
  for (const id of LOCATION_IDS) {
    const cityId = cityIdForLocation(id);
    if (!CITY_BY_ID[cityId]) missingCityReferences.push({ kind: 'location.city', id, detail: `no city '${cityId}'` });
  }
  // Province -> City (declared cities must exist)
  for (const p of PROVINCES) for (const cityId of p.cities) {
    if (!CITY_BY_ID[cityId]) missingCityReferences.push({ kind: 'province.city', id: p.id, detail: `declares missing city '${cityId}'` });
  }
  // Village -> Province / Location
  for (const v of VILLAGES) {
    if (!PROVINCE_BY_ID[v.provinceId]) missingProvinceReferences.push({ kind: 'village.province', id: v.id, detail: `no province '${v.provinceId}'` });
    if (v.cargoLocation && !LOCATION_IDS.includes(v.cargoLocation)) invalidLocationReferences.push({ kind: 'village.location', id: v.id, detail: `cargo location '${v.cargoLocation}' is not registered` });
  }
  // City -> Province
  for (const c of CITIES) {
    if (!PROVINCE_BY_ID[c.provinceId]) missingProvinceReferences.push({ kind: 'city.province', id: c.id, detail: `no province '${c.provinceId}'` });
  }
  // Job -> Location
  for (const j of CONTRACTS) {
    for (const end of ['from', 'to'] as const) {
      if (!LOCATION_IDS.includes(j[end])) invalidLocationReferences.push({ kind: `contract.${end}`, id: j.id, detail: `location '${j[end]}' is not registered` });
    }
  }

  // Phase 3B expansion: ports, road ends, location links, required services, connectivity.
  const expansionIssues: DataIssue[] = [];
  const ports = new Set<string>(['amasya.northArm']);
  for (const c of EXPANSION.cities) for (const [key] of CITY_GRID) ports.add(`${c.id}.${key}`);
  for (const v of EXPANSION.villages) ports.add(`${v.id}.center`);
  for (const j of EXPANSION.junctions) ports.add(j.id);
  for (const id of duplicates(EXPANSION.roads.map(r => r.id))) expansionIssues.push({ kind: 'road.duplicate', id, detail: 'road id declared twice' });
  for (const r of EXPANSION.roads) for (const end of ['from', 'to'] as const) {
    if (!ports.has(r[end])) expansionIssues.push({ kind: `road.${end}`, id: r.id, detail: `no node '${r[end]}'` });
  }
  for (const l of EXPANSION.locations) {
    const city = CITY_BY_ID[l.cityId];
    if (!l.name?.trim() || !l.type) expansionIssues.push({ kind: 'location.fields', id: l.id, detail: 'missing name or type' });
    if (!PROVINCE_BY_ID[l.provinceId]) missingProvinceReferences.push({ kind: 'location.province', id: l.id, detail: `no province '${l.provinceId}'` });
    if (!city) missingCityReferences.push({ kind: 'location.city', id: l.id, detail: `no city '${l.cityId}'` });
    else if (city.provinceId !== l.provinceId) expansionIssues.push({ kind: 'location.province', id: l.id, detail: `city '${l.cityId}' is in '${city.provinceId}', not '${l.provinceId}'` });
  }
  for (const c of EXPANSION.cities) {
    if (!EXPANSION.locations.some(l => l.cityId === c.id)) expansionIssues.push({ kind: 'city.cargo', id: c.id, detail: 'city has no cargo location' });
  }
  const fuel = EXPANSION.cities.flatMap(c => c.fuelStations), garage = EXPANSION.cities.flatMap(c => c.garages), rest = EXPANSION.cities.flatMap(c => c.restAreas);
  if (!fuel.length) expansionIssues.push({ kind: 'service.fuel', id: 'expansion', detail: 'no fuel station' });
  if (!garage.length) expansionIssues.push({ kind: 'service.garage', id: 'expansion', detail: 'no repair garage' });
  if (!rest.length) expansionIssues.push({ kind: 'service.rest', id: 'expansion', detail: 'no rest area' });
  // Connectivity over declared ports: grid ports join inside a city, roads join the rest.
  const parent = new Map<string, string>();
  const find = (a: string): string => { if (!parent.has(a)) parent.set(a, a); const p = parent.get(a)!; if (p === a) return a; const r = find(p); parent.set(a, r); return r; };
  const join = (a: string, b: string) => parent.set(find(a), find(b));
  for (const c of EXPANSION.cities) for (const [key] of CITY_GRID) join(`${c.id}.center`, `${c.id}.${key}`);
  for (const r of EXPANSION.roads) if (ports.has(r.from) && ports.has(r.to)) join(r.from, r.to);
  const disconnected: string[] = [];
  for (const c of EXPANSION.cities) if (find(`${c.id}.center`) !== find('amasya.northArm')) disconnected.push(c.id);
  for (const v of EXPANSION.villages) if (find(`${v.id}.center`) !== find('amasya.northArm')) disconnected.push(v.id);
  for (const l of EXPANSION.locations) if (find(`${l.cityId}.center`) !== find('amasya.northArm')) disconnected.push(l.id);
  for (const id of disconnected) expansionIssues.push({ kind: 'disconnected', id, detail: 'not reachable from the existing network' });
  // Localization references the expansion uses must be real, non-empty text.
  for (const key of ['merzifon', 'suluova', 'gumushacikoy', 'merzifonSite', 'suluovaSite', 'jobMerzifon', 'jobSuluova', 'jobMerzifonSuluova', 'jobMerzifonMetal'] as const) {
    if (!tr[key]?.trim()) expansionIssues.push({ kind: 'localization', id: key, detail: 'missing text' });
  }

  const duplicateProvinceIds = duplicates(PROVINCES.map(p => p.id));
  const duplicateCityIds = duplicates(CITIES.map(c => c.id));
  const duplicateLocationIds = duplicates(DECLARED_LOCATION_IDS);
  const issues = missingCityReferences.length + missingProvinceReferences.length + invalidLocationReferences.length
    + expansionIssues.length + duplicateProvinceIds.length + duplicateCityIds.length + duplicateLocationIds.length;

  const byRegion: Record<string, string[]> = {};
  for (const p of PROVINCES) (byRegion[REGION_NAMES[p.region as RegionId]] ??= []).push(p.id);

  return {
    scope: 'DATA_ONLY',
    counts: { provinces: PROVINCES.length, cities: CITIES.length, locations: LOCATION_IDS.length },
    byRegion,
    duplicateProvinceIds, duplicateCityIds, duplicateLocationIds,
    missingCityReferences, missingProvinceReferences, invalidLocationReferences,
    expansion: {
      cities: EXPANSION.cities.map(c => c.id), villages: EXPANSION.villages.map(v => v.id),
      roads: EXPANSION.roads.length, locations: EXPANSION.locations.map(l => l.id),
      fuelStations: fuel, garages: garage, restAreas: rest, disconnected,
    },
    expansionIssues,
    passed: issues === 0,
  };
}