/**
 * Gameplay event bus.
 *
 * Phase 1 exposes gameplay events so that a FUTURE live-stream layer
 * (ALOSKE streaming + the ALOSKEGANG community chat) can subscribe to them and
 * react without touching the core driving code:
 *
 *   import { bus } from './events';
 *   bus.on('PLAYER_CRASHED', e => streamer.react(e));
 *   bus.on('*', e => chatSimulation.feed(e));
 *
 * The bus is also published on `window.gameEvents` for debugging.
 */
export const GAME_EVENT_TYPES = [
  'PLAYER_CRASHED', 'DELIVERY_ACCEPTED', 'CARGO_LOADED', 'DELIVERY_COMPLETED', 'DELIVERY_FAILED',
  'FUEL_LOW', 'FUEL_EMPTY', 'REFUELED', 'TRUCK_REPAIRED', 'PARKING_SUCCESS', 'PARKING_FAILED',
  'NEW_LOCATION_DISCOVERED', 'TRAFFIC_ACCIDENT', 'WEATHER_CHANGED', 'LEVEL_UP', 'TRUCK_ENTERED', 'TRUCK_EXITED',
  'COMMUNITY_EVENT', 'JOB_EXPIRED', 'SPEEDING',
  'PEER_JOINED', 'PEER_LEFT', 'CONVOY_HAUL',
] as const;
export type GameEventType = (typeof GAME_EVENT_TYPES)[number];

export interface GameEvent {
  type: GameEventType;
  time: number;
  data: any;
}

type Handler = (e: GameEvent) => void;

class EventBus {
  private handlers = new Map<string, Set<Handler>>();
  history: GameEvent[] = [];

  on(type: GameEventType | '*', fn: Handler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  emit(type: GameEventType, data: any = {}) {
    const e: GameEvent = { type, time: performance.now() / 1000, data };
    this.history.push(e);
    if (this.history.length > 60) this.history.shift();
    this.handlers.get(type)?.forEach((h) => h(e));
    this.handlers.get('*')?.forEach((h) => h(e));
  }
}

export const bus = new EventBus();
(window as any).gameEvents = bus;
