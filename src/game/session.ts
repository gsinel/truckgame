/**
 * Session (world-state) persistence — the "kaydet / devam et / sıfırla" layer.
 *
 * Deliberately separate from `profile.ts`: the profile is the *progression* record
 * (money / XP / level / truck, v:1 schema, already covered by the save-migration
 * validators) and this file is the *position in the world* record: where the rig
 * stands, what it is hauling, what has been discovered, and the player's settings.
 *
 * Only gameplay state is stored here. Nothing about generated scenery, road
 * geometry, traffic or audio is serialised — the world is deterministic and is
 * rebuilt from the data files on every load.
 */

export const SESSION_KEY = 'nordhaul_session_v1';
/** a session from a different world build is never applied (positions would be meaningless) */
export const SESSION_WORLD = 2;

export interface SessionJob { id: string; phase: 'toPickup' | 'toDest' | 'unloading' | 'loading' }
export interface SessionStats {
  deliveries: number; perfectParks: number; crashes: number; accidents: number; meets: number; discoveries: number;
  speeding: number;
}

export interface SessionSave {
  v: 1;
  worldVersion: number;
  savedAt: number;
  pos: { x: number; z: number; heading: number };
  fuel: number;
  damage: number;
  distance: number;
  hour: number;
  weather: 'clear' | 'rain';
  pixel: number;
  streamerOn: boolean;
  streamerProvider: 'mock' | 'kick';
  discovered: string[];
  stats: SessionStats;
  job: SessionJob | null;
}

const num = (v: any, min: number, max: number, dflt: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;

/** Strict decode: a malformed or foreign-world blob degrades to "no save", never to a broken start. */
export function decodeSession(raw: string | null): SessionSave | null {
  if (!raw) return null;
  let s: any;
  try { s = JSON.parse(raw); } catch { return null; }
  if (!s || typeof s !== 'object' || s.v !== 1) return null;
  if (s.worldVersion !== SESSION_WORLD) return null;
  if (!Number.isFinite(s.pos?.x) || !Number.isFinite(s.pos?.z)) return null;
  const st = s.stats || {};
  const job = s.job && typeof s.job.id === 'string' &&
    (s.job.phase === 'toPickup' || s.job.phase === 'loading' || s.job.phase === 'toDest' || s.job.phase === 'unloading')
    ? { id: s.job.id, phase: s.job.phase } : null;
  return {
    v: 1,
    worldVersion: SESSION_WORLD,
    savedAt: num(s.savedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
    pos: { x: num(s.pos.x, -40000, 40000, 0), z: num(s.pos.z, -40000, 40000, 0), heading: num(s.pos.heading, -20, 20, 0) },
    fuel: num(s.fuel, 0, 1000, 160),
    damage: num(s.damage, 0, 100, 0),
    distance: num(s.distance, 0, 1e7, 0),
    hour: num(s.hour, 0, 24, 8),
    weather: s.weather === 'rain' ? 'rain' : 'clear',
    pixel: num(s.pixel, 1, 6, 2),
    streamerOn: !!s.streamerOn,
    streamerProvider: s.streamerProvider === 'kick' ? 'kick' : 'mock',
    discovered: Array.isArray(s.discovered) ? s.discovered.filter((p: any) => typeof p === 'string' && p.length < 48) : [],
    stats: {
      deliveries: num(st.deliveries, 0, 1e6, 0), perfectParks: num(st.perfectParks, 0, 1e6, 0),
      crashes: num(st.crashes, 0, 1e6, 0), accidents: num(st.accidents, 0, 1e6, 0),
      meets: num(st.meets, 0, 1e6, 0), discoveries: num(st.discoveries, 0, 1e6, 0), speeding: num(st.speeding, 0, 1e6, 0),
    },
    job,
  };
}

export function writeSession(storage: Pick<Storage, 'setItem'>, s: SessionSave) {
  try { storage.setItem(SESSION_KEY, JSON.stringify(s)); return true; } catch { return false; }
}

export function readSession(storage: Pick<Storage, 'getItem'>): SessionSave | null {
  try { return decodeSession(storage.getItem(SESSION_KEY)); } catch { return null; }
}

export function clearSession(storage: Pick<Storage, 'removeItem'>) {
  try { storage.removeItem(SESSION_KEY); return true; } catch { return false; }
}

export function peekSession(): SessionSave | null { return readSession(localStorage); }
