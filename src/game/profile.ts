export const SAVE_KEY = 'nordhaul_p1_save';
export const PLAYER_TRUCK = 'NH-1348-VT';
export interface Profile {
  v: 1; money: number; xp: number; level: number; truckOwned: boolean; truckId: string;
  worldVersion?: number; locale?: string;
}

/** Accept both Phase 1 schemas without converting or resetting any numeric progression. */
export function decodeProfile(raw: string | null): Profile | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object' || (s.v !== undefined && s.v !== 1)) return null;
    if (!Number.isFinite(s.money) || !Number.isFinite(s.xp) || !Number.isFinite(s.level)) return null;
    return { ...s, v: 1, money: s.money, xp: Math.max(0, s.xp), level: Math.max(1, Math.floor(s.level)),
      truckOwned: typeof s.truckOwned === 'boolean' ? s.truckOwned : true,
      truckId: typeof s.truckId === 'string' && s.truckId.trim() ? s.truckId : PLAYER_TRUCK };
  } catch { return null; }
}

export function readProfile(storage: Pick<Storage, 'getItem' | 'setItem'>): Profile | null {
  const current = storage.getItem(SAVE_KEY);
  const decoded = decodeProfile(current);
  if (decoded) return decoded;
  const legacy = storage.getItem('nordhaul_p1');
  const fallback = decodeProfile(storage.getItem(SAVE_KEY + '_backup')) || decodeProfile(legacy);
  if (fallback) {
    try {
      if (current) storage.setItem(SAVE_KEY + '_unreadable', current);
      storage.setItem(SAVE_KEY, JSON.stringify({ ...fallback, worldVersion: 2, locale: 'tr-TR' }));
    } catch { /* Readable progression must survive even if migration writes are denied. */ }
  }
  return fallback;
}

export function writeProfile(storage: Pick<Storage, 'getItem' | 'setItem'>, state: Profile) {
  const previous = storage.getItem(SAVE_KEY);
  if (previous && decodeProfile(previous)) storage.setItem(SAVE_KEY + '_backup', previous);
  storage.setItem(SAVE_KEY, JSON.stringify({ ...state, v: 1, worldVersion: 2, locale: 'tr-TR' }));
}