import { useSyncExternalStore } from 'react';
import { tr } from './i18n';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'warn';
  t: number;
}

/** Shared mutable UI state. The game writes, React reads (throttled). */
export const ui: any = {
  started: false,
  loading: true,
  loadText: tr.building,
  paused: false,
  menu: null as null | 'jobs' | 'map' | 'pause',
  mode: 'foot' as 'foot' | 'cab',
  cam: 'cab' as 'cab' | 'chase' | 'far',
  speed: 0,
  rpm: 700,
  gear: 'N',
  fuel: 60,
  fuelCap: 250,
  damage: 0,
  money: 2500,
  xp: 0,
  level: 1,
  xpNext: 450,
  truckOwned: true,
  truckId: 'NH-1348-VT',
  hour: 9.0,
  weather: 'clear' as 'clear' | 'rain',
  headlights: false,
  indicator: 0, // -1 left, 1 right, 2 hazard
  handbrake: true,
  prompt: '' as string,
  parkHint: '',
  promptKey: 'E',
  netOn: false,
  convoyCount: 1,
  convoy: [] as { name: string; dist: number; cargo: string; kmh: number }[],
  objective: tr.enterObjective,
  phase: 'none' as string,
  job: null as any,
  jobs: [] as any[],
  distRemain: 0,
  navTarget: '' as string,
  parking: null as null | { score: number; lat: number; lon: number; ang: number; inZone: boolean },
  completion: null as any,
  toasts: [] as Toast[],
  loadProgress: 0,
  fueling: false,
  events: [] as any[],
  showEvents: false,
  perf: { fps: 0, ms: 0, calls: 0, tris: 0, res: '' },
  gpu: '',
  timeScale: 1,
  autoWeather: false,
  pixel: 2,
  region: tr.depotName,
  province: tr.amasya,
  speedLimit: 0,
  /* --- live layer (ALOSKE / ALOSKEGANG) --- */
  streamerOn: false,
  streamerFacts: [] as any[],
  /* --- discovery + navigation + network (populated by their own systems) --- */
  discoveries: [] as { id: string; name: string; at: number }[],
  navInstruction: '',
  navShield: '',
  etaText: '',
  net: { status: 'OFF', players: [] as { id: string; name: string; kmh: number }[] },
  audioMix: { master: 0.48, engine: 1, road: 0.9, ui: 1, ambience: 0.8, radio: 0.55 },
  trafficDensity: 1,
  /* --- persistence + job deadline --- */
  deadlineMin: 0, deadlineTotalMin: 0, distanceKm: 0, hasSave: false, savedAt: 0, overLimit: 0, radioOn: false,
};

let version = 0;
const listeners = new Set<() => void>();
export function notify() {
  version++;
  listeners.forEach((l) => l());
}
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function useUI() {
  useSyncExternalStore(subscribe, () => version);
  return ui;
}

let toastId = 1;
export function toast(text: string, kind: Toast['kind'] = 'info') {
  ui.toasts.push({ id: toastId++, text, kind, t: performance.now() });
  if (ui.toasts.length > 5) ui.toasts.shift();
  notify();
}
