/**
 * Gameplay scale.
 *
 * The Amasya core (world.ts) is authored at 1 unit = 1 metre and is left exactly
 * as it was. The surrounding provinces were originally authored on a strongly
 * compressed grid (~1.3–5 km between the big cities, i.e. 1–3 minutes of
 * driving). WORLD_SCALE stretches only that outer layer so an intercity haul
 * takes roughly 8–25 minutes of real driving, while every corridor, city block
 * and service keeps its authored shape.
 *
 * Roads already exist at 1 unit = 1 m (`SPEC[...].limit` is m/s), so this is a
 * pure layout change: no physics, camera or audio constant depends on it.
 */
export const WORLD_SCALE = 6.5;
