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
