import { bus, GAME_EVENT_TYPES, type GameEvent, type GameEventType } from './events';
import { ui, notify } from './store';
import { tr, eventName, money } from './i18n';

/**
 * ALOSKE / ALOSKEGANG live layer.
 *
 * Architecture (deliberately one-directional, so Game.ts never learns about streaming):
 *
 *   EventBus  ->  StreamerEventAdapter  ->  StreamerState  ->  StreamerOverlay (UI)
 *                                                    |
 *                                                    v
 *                                             StreamerProvider
 *                                     (MockStreamerProvider | KickStreamerProvider)
 *
 * The game is the only authority on gameplay facts: this layer subscribes to the same
 * typed events the rest of the game emits and derives presentation state from them.
 * Nothing here can change simulation state, and the game runs identically with the
 * overlay closed or with no provider configured.
 */

/** Event types the live layer mirrors. Kept as an explicit list so a new gameplay
 *  event is a deliberate decision, not an accidental overlay feed. */
export const STREAMED_EVENTS: readonly GameEventType[] = GAME_EVENT_TYPES.filter((t) =>
  ['PLAYER_CRASHED', 'DELIVERY_COMPLETED', 'DELIVERY_FAILED', 'FUEL_LOW', 'FUEL_EMPTY', 'PARKING_SUCCESS',
    'PARKING_FAILED', 'NEW_LOCATION_DISCOVERED', 'TRAFFIC_ACCIDENT', 'WEATHER_CHANGED', 'DELIVERY_ACCEPTED',
    'CARGO_LOADED', 'REFUELED', 'TRUCK_REPAIRED', 'LEVEL_UP', 'COMMUNITY_EVENT', 'JOB_EXPIRED', 'SPEEDING'].includes(t));

export interface StreamerFact { type: GameEventType; label: string; time: number; tone: 'good' | 'bad' | 'info'; data: any }

export interface ProviderConfig { channel?: string; token?: string }

/** Transport-agnostic seam. A provider receives derived facts and may push outbound
 *  activity; it never reads the simulation directly. */
export interface StreamerProvider {
  readonly kind: 'mock' | 'kick';
  readonly label: string;
  /** `false` until a live connection is proven. Never reported optimistically. */
  readonly connected: boolean;
  readonly note: string;
  start(cfg: ProviderConfig): void;
  stop(): void;
  publish(fact: StreamerFact): void;
  /** Community/chat input, if the provider can supply it. */
  onAction?(fn: (action: { kind: string; user: string; amount?: number }) => void): () => void;
}

/** Offline provider: everything works, no network, no credentials. It is also what the
 *  overlay falls back to when a Kick channel is configured but unreachable. */
export class MockStreamerProvider implements StreamerProvider {
  readonly kind = 'mock' as const;
  readonly label = 'YEREL / OFFLINE';
  connected = false;
  note = 'Ağ yok: overlay yalnızca yerel oyun olaylarını gösterir.';
  private out: StreamerFact[] = [];
  private listeners = new Set<(a: { kind: string; user: string; amount?: number }) => void>();
  start() { this.connected = true; }
  stop() { this.connected = false; }
  publish(fact: StreamerFact) { this.out.push(fact); if (this.out.length > 40) this.out.shift(); }
  get published() { return this.out.slice(); }
  onAction(fn: (a: { kind: string; user: string; amount?: number }) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  /** Test/debug entry point for the community action path (viewer -> gameplay). */
  simulateAction(a: { kind: string; user: string; amount?: number }) { this.listeners.forEach((l) => l(a)); }
}

/**
 * KICK adapter. Deliberately transport-only: no credentials are stored in the repo and
 * no fake "live" state is reported. Until a channel token is supplied through the
 * environment (never committed) the provider stays disconnected and the overlay shows
 * `READY_FOR_CREDENTIALS`.
 */
export class KickStreamerProvider implements StreamerProvider {
  readonly kind = 'kick' as const;
  readonly label = 'KICK';
  connected = false;
  note = 'KICK_PROVIDER = READY_FOR_CREDENTIALS';
  channel = '';
  /** Read from the environment seam only; there is no fallback secret in the repo. */
  static readEnv(): ProviderConfig {
    const env = (import.meta as any)?.env ?? {};
    return { channel: env.VITE_KICK_CHANNEL || '', token: env.VITE_KICK_CHANNEL_TOKEN || '' };
  }
  static get configured() { const e = KickStreamerProvider.readEnv(); return !!(e.channel && e.token); }
  start(cfg: ProviderConfig) {
    this.channel = cfg.channel || '';
    // A real implementation would open the channel here. Without a verified handshake
    // the status must not be optimistic, so `connected` stays false.
    this.note = cfg.token ? 'YAPILANDIRILDI — CANLI BAĞLANTI DOĞRULANMADI' : 'KICK_PROVIDER = READY_FOR_CREDENTIALS';
  }
  stop() { this.connected = false; }
  publish() { /* no transport bound yet */ }
}

export interface StreamerSnapshot {
  enabled: boolean;
  provider: 'mock' | 'kick';
  providerLabel: string;
  providerConnected: boolean;
  providerNote: string;
  facts: StreamerFact[];
  counts: { deliveries: number; crashes: number; accidents: number; discoveries: number; perfectParks: number; meets: number; speeding: number };
  /** Community counter placeholder: driven by the provider, never invented locally. */
  viewers: number;
  sessionSeconds: number;
}

const EMPTY_COUNTS = { deliveries: 0, crashes: 0, accidents: 0, discoveries: 0, perfectParks: 0, meets: 0, speeding: 0 };

class StreamerStateImpl {
  enabled = false;
  provider: StreamerProvider = new MockStreamerProvider();
  facts: StreamerFact[] = [];
  counts = { ...EMPTY_COUNTS };
  viewers = 0;
  sessionT0 = 0;

  get snapshot(): StreamerSnapshot {
    return {
      enabled: this.enabled,
      provider: this.provider.kind,
      providerLabel: this.provider.label,
      providerConnected: this.provider.connected,
      providerNote: this.provider.note,
      facts: this.facts.slice(0, 6),
      counts: { ...this.counts },
      viewers: this.viewers,
      sessionSeconds: this.sessionT0 ? Math.floor(performance.now() / 1000 - this.sessionT0) : 0,
    };
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) { this.sessionT0 = this.sessionT0 || performance.now() / 1000; this.provider.start(KickStreamerProvider.readEnv()); }
    else { this.provider.stop(); }
    ui.streamerOn = on;
    notify();
  }
  useProvider(p: StreamerProvider) {
    const wasOn = this.enabled;
    if (wasOn) this.provider.stop();
    this.provider = p;
    if (wasOn) p.start(KickStreamerProvider.readEnv());
    notify();
  }
  reset() { this.facts = []; this.counts = { ...EMPTY_COUNTS }; this.sessionT0 = performance.now() / 1000; }

  /** Session restore: counters and the viewer preference come back from the save; the
   *  fact feed itself is per-session (a log, not progression). */
  restore(enabled: boolean, provider: 'mock' | 'kick', counts?: Partial<typeof EMPTY_COUNTS>) {
    if (provider !== this.provider.kind) this.useProvider(provider === 'kick' ? new KickStreamerProvider() : new MockStreamerProvider());
    if (counts) this.counts = { ...EMPTY_COUNTS, ...counts };
    if (enabled !== this.enabled) this.setEnabled(enabled);
    notify();
  }

  /** Presentation only: label + tone per fact, newest first, capped. */
  push(e: GameEvent) {
    const d = e.data || {};
    let label = eventName[e.type] ?? e.type;
    let tone: StreamerFact['tone'] = 'info';
    switch (e.type) {
      case 'DELIVERY_COMPLETED': this.counts.deliveries++; tone = 'good'; label = `${tr.completed}${d.money ? ` · ${money(d.money)}` : ''}`; break;
      case 'DELIVERY_FAILED': tone = 'bad'; break;
      case 'PLAYER_CRASHED': this.counts.crashes++; tone = 'bad'; break;
      case 'TRAFFIC_ACCIDENT': this.counts.accidents++; tone = 'bad'; break;
      case 'NEW_LOCATION_DISCOVERED': this.counts.discoveries++; tone = 'good'; break;
      case 'PARKING_SUCCESS': if (d.grade === 'PERFECT') this.counts.perfectParks++; tone = 'good'; break;
      case 'PARKING_FAILED': tone = 'bad'; break;
      case 'COMMUNITY_EVENT': this.counts.meets++; tone = 'good'; break;
      case 'SPEEDING': this.counts.speeding++; tone = 'bad'; label = `${eventName.SPEEDING}${d.limit ? ` · ${d.kmh}/${d.limit}` : ''}`; break;
      case 'JOB_EXPIRED': tone = 'bad'; break;
      default: break;
    }
    this.facts.unshift({ type: e.type, label, time: e.time, tone, data: d });
    if (this.facts.length > 24) this.facts.pop();
    this.provider.publish(this.facts[0]);
    ui.streamerFacts = this.facts;
    notify();
  }
}

export const streamerState = new StreamerStateImpl();

/** The only place the live layer touches the game: a subscription. */
export class StreamerEventAdapter {
  private offs: (() => void)[] = [];
  constructor(private state: StreamerStateImpl = streamerState) {
    this.state = state;
  }
  connect() {
    if (this.offs.length) return;
    for (const type of STREAMED_EVENTS) this.offs.push(bus.on(type, (e) => this.state.push(e)));
  }
  disconnect() { this.offs.forEach((f) => f()); this.offs = []; }
}

export const streamerAdapter = new StreamerEventAdapter();

/* `viewers` stays a placeholder by design: a number without a live provider behind it
 * would be a false claim. The mock provider leaves it at zero. */
export function describeProvider(): string {
  const p = streamerState.provider;
  // A mock session is never described as "connected": only a real provider gets that word.
  if (p.kind === 'mock') return `${p.label} · ${p.connected ? 'YEREL AKTİF' : 'DURDU'}`;
  return p.connected ? `${p.label}: BAĞLI` : `${p.label}: ${p.note}`;
}
