/**
 * Delivery status markers for this build, kept next to the code they describe.
 *
 * MULTIPLAYER_STATUS = LOCAL_TRANSPORT_READY_NETWORK_TRANSPORT_NOT_CONNECTED
 *   src/game/net.ts is a real convoy layer: a pluggable ConvoyTransport plus one
 *   working implementation (BroadcastChannel), roster and host election, 10 Hz pose
 *   snapshots with 3.5 s loss detection, trailer/cargo/damage sync, shared dispatch
 *   offers and delivered-haul announcements. Two tabs of the same browser profile
 *   drive the same world as two rigs — that is verified by tools/state-check.mjs.
 *   Same-profile windows only: a hidden tab is frozen by the browser, so the layer
 *   re-announces on visibilitychange and the roster converges when you look at it.
 *   What is NOT here: a wide-area transport, a server, accounts or secrets. Socket
 *   transport would sit behind the same interface; Game.ts never learns the
 *   difference, so nothing in this build pretends to be online multiplayer.
 */
export const MULTIPLAYER_STATUS = 'LOCAL_TRANSPORT_READY_NETWORK_TRANSPORT_NOT_CONNECTED' as const;
export const CONVOY_MAX_PLAYERS = 4;
