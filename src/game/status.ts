/**
 * Delivery status markers for this build, kept next to the code they describe.
 *
 * MULTIPLAYER_STATUS = REMOVED_UNSUPPORTED
 *   The repository contains no network layer (no sockets, no signalling, no
 *   lobby or session code) and none was added. The game is single-player; the
 *   event bus in ./events is the only seam a future live/community layer would
 *   subscribe to.
 */
export const MULTIPLAYER_STATUS = 'REMOVED_UNSUPPORTED' as const;
