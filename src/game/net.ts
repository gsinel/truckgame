import { bus } from './events';

/**
 * Convoy layer — the 2–4 player foundation.
 *
 * What ships and what does not (MULTIPLAYER_STATUS in ./status states this in one line):
 *  - A transport *interface* (`ConvoyTransport`) plus one real implementation:
 *    `BroadcastConvoyTransport`, which syncs the tabs/windows of a single browser
 *    profile through the BroadcastChannel API. Two tabs on one machine is a working
 *    convoy: positions, rigs, trailers, cargo and deliveries stay in sync.
 *  - No server, no signalling, no accounts, no secrets. A wide-area transport would be
 *    the same interface with a WebSocket behind it; nothing in the game layer knows the
 *    difference, which is why this is a seam and not a demo.
 *
 * The layer is deliberately dumb: it never touches physics, money or XP. It shares *state
 * announcements*. The local simulation is authoritative for its own rig; peers are driven
 * by interpolated snapshots, exactly like `./traffic` is driven by the AI.
 */

export const NET_CHANNEL = 'nordhaul-convoy-v1';
/** snapshot rate in Hz — 10 Hz is what the HUD already runs at, so it costs nothing */
export const CONVOY_HZ = 10;
export const CONVOY_MAX_PLAYERS = 4;
/** a rig that has not been heard from for this long has left (crash, tab close, sleep) */
export const CONVOY_TIMEOUT = 3.5;

export interface ConvoyPose {
  x: number; z: number; yaw: number;
  kmh: number;
  /** dolly is part of the rig's identity: a peer must show whether it is hauling */
  trailer: boolean;
  /** which job the rig is carrying, for the roster and the map (title, not the whole job) */
  cargo: string;
  damage: number;
  onFoot: boolean;
}

/**
 * What a peer needs to be able to run the same job: the whole dispatch entry, not a
 * summary. Ids stay local — the wire carries `offerId` so both sides can dedupe.
 */
export interface ConvoyJobOffer {
  title: string; cargo: string; cargoName: string; weight: number; from: string; to: string;
  km: number; reward: number; xp: number; blurb: string; hours: number; risk: string; appearance?: string;
}
export interface ConvoyHaul { cargo: string; km: number; reward: number; ok: boolean }

export type ConvoyMessage =
  | { k: 'join'; id: string; name: string; since: number }
  | { k: 'pose'; id: string; name: string; since: number; p: ConvoyPose }
  | { k: 'job'; id: string; name: string; since: number; offerId: string; offer: ConvoyJobOffer }
  | { k: 'haul'; id: string; name: string; since: number; haul: ConvoyHaul }
  | { k: 'leave'; id: string; name: string; since: number };

export interface ConvoyTransport {
  readonly kind: string;
  readonly supported: boolean;
  post(m: ConvoyMessage): void;
  subscribe(fn: (m: ConvoyMessage) => void): () => void;
  close(): void;
}

/** Same-profile tabs. No network stack, so there is nothing to misconfigure or to leak. */
export class BroadcastConvoyTransport implements ConvoyTransport {
  readonly kind = 'broadcast-channel';
  readonly supported = typeof BroadcastChannel !== 'undefined';
  private ch: BroadcastChannel | null = null;
  private subs = new Set<(m: ConvoyMessage) => void>();
  private onMessage = (ev: MessageEvent) => {
    const m = ev.data as ConvoyMessage;
    if (m && typeof m.id === 'string') for (const fn of this.subs) fn(m);
  };
  constructor() {
    if (this.supported) {
      this.ch = new BroadcastChannel(NET_CHANNEL);
      this.ch.addEventListener('message', this.onMessage);
    }
  }
  post(m: ConvoyMessage) { this.ch?.postMessage(m); }
  subscribe(fn: (m: ConvoyMessage) => void) {
    this.subs.add(fn);
    return () => { this.subs.delete(fn); };
  }
  close() {
    if (this.ch) { this.ch.removeEventListener('message', this.onMessage); this.ch.close(); this.ch = null; }
    this.subs.clear();
  }
}

export interface ConvoyMember {
  id: string; name: string; since: number;
  pose: ConvoyPose;
  /** ms since the last snapshot (wall clock: a slow frame budget must not keep a dead rig) */
  age: number;
  seen: number;
}

/**
 * The roster. Host is not a server: it is simply the longest-present rig, and every
 * member computes the same answer from the same announcements, so a convoy never has to
 * negotiate and never splits when one tab closes.
 */
export class Convoy {
  selfId = Math.random().toString(36).slice(2, 8).toUpperCase();
  name = 'RİG';
  active = false;
  members = new Map<string, ConvoyMember>();
  lastSend = 0;
  onJob: ((from: string, offer: ConvoyJobOffer, offerId: string) => void) | null = null;
  onHaul: ((from: string, haul: ConvoyHaul) => void) | null = null;
  private off: (() => void) | null = null;
  private onVisible: (() => void) | null = null;
  private seq = 0;

  constructor(private transport: ConvoyTransport) {}

  get transportKind() { return this.transport.kind; }
  get supported() { return this.transport.supported; }
  /** everyone in the convoy, self included, ordered by join time — the host first */
  get roster(): ConvoyMember[] {
    const list: ConvoyMember[] = [...this.members.values()];
    return list.sort((a, b) => (a.since - b.since) || (a.id < b.id ? -1 : 1));
  }
  get count() { return this.members.size + 1; }
  get isHost() { const r = this.roster; return !r.length || r[0].since >= this.since; }
  private since = 0;

  join(name: string) {
    if (this.active || !this.transport.supported) return;
    this.name = name;
    this.since = Math.floor(Date.now() / 1000) * 1000 + (this.seq++);
    this.active = true;
    this.off = this.transport.subscribe((m) => this.receive(m));
    this.transport.post({ k: 'join', id: this.selfId, name: this.name, since: this.since });
    /* A backgrounded tab is frozen by the browser, so its convoy goes quiet and the other
       rigs time it out. Re-announce the moment the tab is looked at again: the roster
       converges in one frame instead of waiting for the timeout. */
    if (typeof document !== 'undefined') {
      this.onVisible = () => { if (!document.hidden) this.transport.post({ k: 'pose', id: this.selfId, name: this.name, since: this.since, p: this.last }); };
      document.addEventListener('visibilitychange', this.onVisible);
    }
  }

  leave() {
    if (!this.active) return;
    this.transport.post({ k: 'leave', id: this.selfId, name: this.name, since: this.since });
    this.off?.(); this.off = null;
    if (this.onVisible && typeof document !== 'undefined') { document.removeEventListener('visibilitychange', this.onVisible); this.onVisible = null; }
    for (const m of this.members.values()) bus.emit('PEER_LEFT', { name: m.name });
    this.members.clear();
    this.active = false;
  }

  private receive(m: ConvoyMessage) {
    if (!m || m.id === this.selfId) return;
    if (this.count >= CONVOY_MAX_PLAYERS && !this.members.has(m.id) && m.k !== 'leave') return;
    const known = this.members.get(m.id);
    if (m.k === 'leave') {
      if (known) { this.members.delete(m.id); bus.emit('PEER_LEFT', { name: known.name }); }
      return;
    }
    if (m.k === 'job') { this.onJob?.(m.name, m.offer, m.offerId); return; }
    if (m.k === 'haul') { this.onHaul?.(m.name, m.haul); return; }
    // A join is answered with our own snapshot, so the newcomer sees the convoy at once
    // and every tab reaches the same roster without any negotiation.
    if (m.k === 'join') {
      // the cap is the whole convoy including us: 4 rigs total, not 4 guests
      if (!known && this.count < CONVOY_MAX_PLAYERS) {
        this.members.set(m.id, { id: m.id, name: m.name, since: Math.min(m.since, Date.now()), pose: { ...this.last }, age: 0, seen: performance.now() });
        bus.emit('PEER_JOINED', { name: m.name, count: this.count });
      }
      this.transport.post({ k: 'pose', id: this.selfId, name: this.name, since: this.since, p: this.last });
      return;
    }
    const member: ConvoyMember = known ?? { id: m.id, name: m.name, since: Date.now(), pose: m.p, age: 0, seen: performance.now() };
    member.name = m.name;
    member.pose = m.p;
    member.age = 0;
    member.seen = performance.now();
    if (!known) {
      member.since = Math.min(m.since, Date.now());
      this.members.set(m.id, member);
      bus.emit('PEER_JOINED', { name: m.name, count: this.count });
    }
  }

  private last: ConvoyPose = { x: 0, z: 0, yaw: 0, kmh: 0, trailer: false, cargo: '', damage: 0, onFoot: true };

  /** publish at CONVOY_HZ, age the roster, drop rigs that went quiet */
  tick(dt: number, pose: ConvoyPose) {
    if (!this.active) return;
    this.last = pose;
    this.lastSend += dt;
    if (this.lastSend >= 1 / CONVOY_HZ) {
      this.lastSend = 0;
      this.transport.post({ k: 'pose', id: this.selfId, name: this.name, since: this.since, p: pose });
    }
    const now = performance.now();
    let dropped = false;
    for (const [id, m] of this.members) {
      m.age = (now - m.seen) / 1000;
      if (m.age > CONVOY_TIMEOUT) { this.members.delete(id); bus.emit('PEER_LEFT', { name: m.name }); dropped = true; }
    }
    if (dropped) this.transport.post({ k: 'pose', id: this.selfId, name: this.name, since: this.since, p: pose });
  }

  shareJob(offer: ConvoyJobOffer) {
    if (!this.active) return;
    this.transport.post({ k: 'job', id: this.selfId, name: this.name, since: this.since, offerId: `${this.selfId}-${this.seq++}`, offer });
  }
  announceHaul(haul: ConvoyHaul) {
    if (!this.active) return;
    this.transport.post({ k: 'haul', id: this.selfId, name: this.name, since: this.since, haul });
  }
}
