# NORDHAUL Türkiye — final implementation report

Existing game finished and polished in place. No rewrite, no new project, no regenerated world.

## Build status

| Item | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm run build` | OK — `dist/index.html` 1 039 kB (gzip 306 kB), 2.8 s |
| Production bundle boot | OK — booted `vite preview` and re-ran the probe against it |
| `window.__validateWorldData` | passed, 0 issues |
| `window.__validatePhase2` | **17 / 17 OK** (structural regressions only) |

World after this pass: 114 nodes / 159 edges, 99.3 km of road, 17 cargo locations,
29 services, 34 discovery regions, 22 priced jobs, 913 draw calls / ~426 k triangles
(SwiftShader software rasterizer).

## What was completed / repaired / preserved

**Preserved (KEEP)** — Amasya core (`world.ts`), truck model and physics, audio
synthesis, i18n architecture (`tr` + `money`), save schema v1 with migration, event
bus, terrain/collision/batch/LOD systems, road graph and navigator, traffic,
day/night/weather.

**Repaired (REPAIR)**
- Corridor elevation: grade limiter with per-node height averaging and endpoint
  pinning. Worst long-edge grade is now **9.0 %** (was 22.7 % at the Suluova–Merzifon
  junction); the short Amasya-west accesses are 8.3–8.8 %. `amasya-tokat` is 0.1 %
  over its core span; the depot still sits at exactly 0 m.
- Roadside yards: the Samsun rest area's diner had been built 30 m past the yard
  centre and therefore stood **on the `amasya-samsun` carriageway**, and the fuel/
  rest/garage layouts mixed their along-road and depth axes. All three yard types
  were rebuilt on one verified local frame (`at(d, zl)`: `d` along the road,
  `zl` toward it); zones now sit 20–27 m back and only the apron reaches the shoulder.
- Landmark compounds: the diagonal site is now chosen by measured clearance to the
  road graph, which fixed the Tokat castle rock and terraced approach that sat in the
  `amasya-tokat` lane.
- Amasya industrial gate: the chain fence crossed the east-corridor carriageway; it
  now has a real gate opening with an OSB board, ÇIKIŞ sign and DİKKAT board.
- City belt trees and corridor poplars are rejected within 22–24 m of any road, and
  the planted offset is validated against the graph instead of trusted (inside of a
  bend used to push trees back onto the road).
- `Regional lane clearance samples`: **0** static collider overlaps (was 20).
- Cities physically registered: each province now has a matching city record and
  discovery region (`missing amasya:no-discovery-region` resolved).
- Fuel economy: consumption re-derived from the real distances this world uses —
  ~0.2 L/h idle and ~40–46 L/100 km loaded, instead of a scripted-era burn that ran
  the tank dry in ~20 minutes. Pump price ₺46.90/L so a refill costs a sensible
  share of a job payout. Measured: 0.03 L for the 400-step throttle run.
- Map canvas: the schematic had a fixed 0.26 px/m scale, i.e. a ~6 000 × 4 400 px
  canvas for the 24 km world; now capped at 3 072 px.

**Extended (EXTEND)**
- Outer provinces stretched (`WORLD_SCALE = 6.5`) so intercity hauls are 8–31 km /
  ~8–25 minutes instead of 1–3 minutes; Amasya core untouched at 1 unit = 1 m.
- Second declared cargo facility per province (`tokat.textile`, `corum.food`,
  `samsun.port`, `sivas.cement`) moved from a 12–15 km suburb into the city's own
  industrial block, so measured city-to-city distances (8.3–31.1 km) are real.
- Eight roadside stops (fuel / rest / garage) and five corridor villages on the
  D-roads, all built from the same graph traffic and GPS use; pumps and garage radii
  register with the same `world.pumps` / `world.services` the core uses.
- City identity: 11 landmark compounds (castle, port, medrese, sugar factory, rail
  station, clock tower, stone bridge, stone gate, textile mill, cement plant, food
  plant) placed per city profile, each with its ring streets, entrance boards and
  service infrastructure.
- Dry-steppe ground material for the İç Anadolu plateau (Sivas/Yozgat) with a noise
  fringe, so the scenery changes with the region instead of carpeting everything green.
- i18n keys for the new signage (`OSB`, `KANTAR`, `24 SAAT AÇIK`, `ÇEKİCİ`, …); all
  signs use the existing `board()` / `tr` pipeline.

**Removed** — no gameplay was deleted; only scratch debug tools (`tools/_dbg*.mjs`)
were dropped. `.gitignore` added so `node_modules`, `dist` and the probe screenshot
cache stay out of the repository.

## Multiplayer

`MULTIPLAYER_STATUS = REMOVED_UNSUPPORTED` (`src/game/status.ts`). The repository
contains no network layer — no sockets, signalling, lobbies or session code — and
none was added. Single-player is the product; `src/game/events.ts` remains the only
seam a future Aloske / AloskeGang live layer would subscribe to. The ten required
event identifiers are intact and all of them are emitted.

## Runtime-tested (headless Chromium 153, SwiftShader)

- Boot and world build, both dev server and production bundle; no page errors.
- All 17 structural validators and the expansion data validator.
- Physics-only drivetrain harness (no rendering): 0 → 32.4 km/h with shifts to gear 4,
  25 m travelled, 60° of steering, braking back to 4.2 km/h, reverse 2.1 km/h over
  11 m, 0.03 L of fuel used.
- Screenshot pass over 18 authored viewpoints (cab, chase, far; day, night, rain) plus
  one approach shot per roadside stop, used to check layout, signage and composition.

## `RUNTIME_TEST_REQUIRED` (could not be verified here)

- **Audio** — no audio device in the headless sandbox; the synthesis paths were only
  exercised structurally, never heard. Engine/road/horn/UI mix needs a human listen.
- **Frame rate on real hardware** — SwiftShader gives ~1 fps at 640 × 360; the numbers
  that matter (draw calls ~913, triangles ~426 k) look healthy but a GPU run is needed.
- **A human-driven delivery loop** — Find Job → Load → Drive → Park → Deliver, parking
  scoring feel, mirrors/wipers/cabin, traffic behaviour over a long session.
- **Save/load across a real browser reload** (the validator covers the serializer with
  simulated storage only).

## Known limitations

- Intercity grades sit at the 8.2 % design cap for long stretches; that is deliberate
  (real Anadolu corridors), but a driver who ignores the gearbox will feel them.
- The 24 km map uses a compressed scale, not real geography; bearings and connections
  are preserved, distances are game distance.
- Two of the eight roadside stops share a corridor with a village; they are 3–4 km
  apart, which is close for Turkish D-roads but keeps the corridor served.

## Suggested next work (not started)

1. GPU frame-time profile and any draw-call merging it suggests.
2. Audio pass with a real listener; then traffic behaviour tuning (density slider is
   the natural entry point, `Traffic` count is constructor-driven).
3. More landmarks/villages on the Sivas–Yozgat plateau, which is the thinnest region.
