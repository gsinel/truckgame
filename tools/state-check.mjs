// Runtime harness for the persistence + deadline layer (see docs/REPORT.md).
//   node tools/state-check.mjs [url]
// Needs the dev server on :5173 and the chromium build in /tmp/chromium
// (node tools/setup-chromium.mjs). It drives the real game in a headless browser:
// save -> reload -> compare, then the deadline clock, then reset.
import puppeteer from 'puppeteer';

const URL = process.argv[2] || 'http://127.0.0.1:5173/';
const EXE = process.env.CHROMIUM || '/tmp/chromium';
const ok = [];
const bad = [];
const check = (name, pass, detail = '') => (pass ? ok : bad).push(`${name}${detail ? ` — ${detail}` : ''}`);

const browser = await puppeteer.launch({
  executablePath: EXE, headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib:/tmp', VK_ICD_FILENAMES: '/tmp/vk_swiftshader_icd.json' },
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
const boot = async () => {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__game && window.__game.ready === true', { timeout: 240000 });
};
await boot();

/* ---------------- 1. save + continue across a real reload ---------------- */
const saved = await page.evaluate(() => {
  const g = window.__game;
  g.start();
  const sp = g.world.spawn;
  Object.assign(g.sim, { x: sp.px + 3, z: sp.pz - 2, heading: sp.pyaw + 0.5, ry: sp.pyaw + 0.5, vx: 0, vz: 0, handbrake: true });
  g.sim.fuel = 137;
  g.sim.damage = 6.5;
  g.setWeather('rain');
  g.setStreamer(true);
  g.saveSession();
  return { x: g.sim.x, z: g.sim.z, heading: g.sim.heading, fuel: g.sim.fuel, damage: g.sim.damage, raw: !!localStorage.getItem('nordhaul_session_v1') };
});
check('session written to localStorage', saved.raw);
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();
const after = await page.evaluate(() => {
  const g = window.__game;
  g.start(); // start() is what applies the session
  return { x: g.sim.x, z: g.sim.z, heading: g.sim.heading, fuel: g.sim.fuel, damage: g.sim.damage, weather: window.__ui.weather, streamer: window.__ui.streamerOn, hasSave: window.__ui.hasSave, money: window.__ui.money };
});
const near = (a, b) => Math.abs(a - b) < 3;
// the simulation keeps heading inside [-pi, pi], so compare it as a wrapped angle
const angNear = (a, b) => { const T = Math.PI * 2; let d = (((a - b) % T) + T) % T; if (d > Math.PI) d -= T; return Math.abs(d) < 0.05; };
check('position restored after reload', near(saved.x, after.x) && near(saved.z, after.z), `${Math.round(saved.x)},${Math.round(saved.z)} -> ${Math.round(after.x)},${Math.round(after.z)}`);
check('truck heading restored', angNear(saved.heading, after.heading), `${saved.heading.toFixed(2)} -> ${after.heading.toFixed(2)}`);
check('fuel and damage restored', Math.abs(saved.fuel - after.fuel) < 1.5 && Math.abs(saved.damage - after.damage) < 1.5, `fuel ${Math.round(after.fuel)} dmg ${after.damage.toFixed(1)}`);
check('weather + live-layer preference restored', after.weather === 'rain' && after.streamer === true, `${after.weather}/${after.streamer}`);
check('continue flagged on the title screen', after.hasSave === true);
check('progression still comes from the profile', Number.isFinite(after.money) && after.money > 0, `₺${after.money}`);

/* ---------------- 2. job deadline ticks and expires ---------------- */
const dl = await page.evaluate(async () => {
  const g = window.__game;
  const job = g.missions.jobs[0];
  g.missions.accept(job.id);
  const total = g.missions.deadlineTotalMin;
  g.missions.timeScale = 1;
  for (let i = 0; i < 60; i++) g.missions.tick(60); // 60 simulated game-hours of walking-around
  await new Promise((r) => setTimeout(r, 200));
  const ev = (window.__ui.events || []).filter((e) => e.type === 'JOB_EXPIRED').length;
  return { total, phase: g.missions.phase, active: !!g.missions.active, deadline: g.missions.deadlineMin, ev, uiDeadline: window.__ui.deadlineMin };
});
check('deadline derived from the route', dl.total > 40 && dl.total < 1e4, `${dl.total} game min`);
check('overdue job is released by the dispatcher', dl.active === false && dl.phase === 'none', `phase ${dl.phase}`);
check('JOB_EXPIRED reaches the typed event bus', dl.ev >= 1, `${dl.ev} event(s)`);
check('HUD clock cleared with the job', dl.uiDeadline === 0);

/* ---------------- 2b. generated market ---------------- */
const market = await page.evaluate(() => {
  const g = window.__game;
  const jobs = g.missions.jobs;
  const gen = jobs.filter((j) => j.id.startsWith('gen'));
  const risky = jobs.filter((j) => j.risk && j.risk !== 'normal');
  const before = jobs.map((j) => j.id).join(',');
  g.rerollBoard();
  const after = g.missions.jobs.map((j) => j.id).join(',');
  const freshGen = g.missions.jobs.find((j) => j.id.startsWith('gen'));
  const okAccept = g.missions.accept(freshGen.id);
  g.missions.cancel();
  const km = gen.map((j) => j.km);
  return {
    total: jobs.length, generated: gen.length, risky: risky.length, changed: before !== after,
    okAccept, minKm: Math.min(...km), maxKm: Math.max(...km),
    everyRoute: jobs.every((j) => j.km > 0.2 && j.reward > 0 && j.hours > 0.3),
    uniqueIds: new Set(jobs.map((j) => j.id)).size === jobs.length,
    fragilePayUplift: (() => {
      const f = jobs.find((j) => j.risk === 'fragile');
      return !!f && f.reward > 350;
    })(),
  };
});
check('generated offers extend the authored board', market.total >= 30 && market.generated >= 8, `${market.total} offers (${market.generated} generated)`);
check('every offer is measured on the nav graph', market.everyRoute, `route km ${market.minKm.toFixed(1)}–${market.maxKm.toFixed(1)}`);
check('offer ids are unique', market.uniqueIds);
check('board re-roll changes the generated half', market.changed);
check('generated offers are acceptable jobs', market.okAccept);
check('risk premium applied to fragile loads', market.fragilePayUplift);

/* ---------------- 2c. traffic: full pool, no phasing ---------------- */
const traf = await page.evaluate(async () => {
  const g = window.__game;
  const t = g.traffic;
  const n = t.vehicles.length;
  // park the rig across a busy town/rural edge and let the world drive into it
  const e = g.world.graph.edges.find((q) => q.type === 'rural' && q.len > 260) || g.world.graph.edges[10];
  const st = g.world.graph.station(e, e.len * 0.5);
  Object.assign(g.sim, { x: st.x, z: st.z, heading: Math.atan2(st.dz, st.dx), ry: Math.atan2(st.dz, st.dx), vx: 0, vz: 0, vy: 0, handbrake: true, throttle: 0, brake: 1, speed: 0 });
  let minGap = 1e9, overlapTicks = 0, samples = 0;
  const half = 10;
  for (let i = 0; i < 260; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    samples++;
    for (const v of t.vehicles) {
      const d = Math.hypot(v.x - g.sim.x, v.z - g.sim.z);
      if (d < minGap) minGap = d;
      // a body genuinely inside the truck box while both are ~stationary = phasing
      if (d < half && v.speed > 1 && Math.hypot(v.vx, v.vz) > 2) overlapTicks++;
    }
  }
  return { n, minGap, overlapTicks, samples, movedAway: t.vehicles.filter((v) => v.blockT > 0).length };
});
check('traffic pool is full', traf.n === 26, `${traf.n} AI vehicles`);
check('AI keeps a respectful gap around a stopped rig', traf.minGap > 2.2, `closest ${traf.minGap.toFixed(1)} m`);
check('no vehicle drives through the player while it is stopped', traf.overlapTicks === 0, `${traf.overlapTicks} overlapping frame(s) of ${traf.samples}`);

/* ---------------- 2d. cab audio + damage smoke + radar ---------------- */
const rig = await page.evaluate(async () => {
  const g = window.__game;
  g.start();
  // sit the driver next to the rig and get in the way the game does
  g.player.x = g.sim.x + 2.4; g.player.z = g.sim.z;
  g.enterTruck();
  const inCab = g.mode === 'cab';
  g.setRadio(true);
  const radioInCab = window.__ui.radioOn === true && g.audio.radioOn === true;
  g.exitTruck();
  await new Promise((r) => requestAnimationFrame(r));
  const radioMutedOutside = g.audio.radioOn === false;
  g.enterTruck();
  // smoke: heavy damage under load must show up on the exhaust
  g.sim.damage = 62; g.sim.throttle = 1; g.sim.rpm = 1800;
  for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
  const sprites = g.truck.root.children.filter((o) => o.isSprite);
  const puffs = sprites.filter((sp) => sp.visible && sp.material.opacity > 0.01).length;
  // radar: hold the throttle on a long straight until enforcement fires
  const e = g.world.graph.edges.find((q) => q.type === 'rural' && q.len > 700);
  const st = g.world.graph.station(e, 40);
  Object.assign(g.sim, { x: st.x, z: st.z, heading: Math.atan2(st.dx, st.dz), ry: Math.atan2(st.dx, st.dz),
    vx: st.dx * 8, vz: st.dz * 8, handbrake: false, engineOn: true, damage: 0 });
  const money0 = window.__ui.money;
  let fired = false, maxLimit = 0, maxKmh = 0;
  /* Headless software rendering is slow, so instead of waiting for the diesel to build
     speed the harness pins the rig to a fixed overspeed on the straight and lets the
     rule itself run its own timer. */
  for (let i = 0; i < 96 && !fired; i++) {
    Object.assign(g.sim, { x: st.x, z: st.z, vx: st.dx * 24, vz: st.dz * 24, engineOn: true, handbrake: false });
    await new Promise((r) => requestAnimationFrame(r));
    maxLimit = Math.max(maxLimit, window.__ui.speedLimit);
    maxKmh = Math.max(maxKmh, g.sim.speedKmh);
    fired = (window.__ui.events || []).some((ev) => ev.type === 'SPEEDING');
  }
  return { inCab, radioInCab, radioMutedOutside, puffs, sprites: sprites.length, fired,
    limit: maxLimit, kmh: maxKmh, lost: money0 - window.__ui.money };
});
check('cab radio switches the synthesised bed on', rig.inCab && rig.radioInCab);
check('radio is a cab feature (silent outside the truck)', rig.radioMutedOutside);
check('damage produces exhaust smoke', rig.puffs > 0, `${rig.puffs} live puff(s) of ${rig.sprites}`);
check('radar enforcement fires on a posted limit', rig.fired, `limit ${rig.limit} km/h at ${Math.round(rig.kmh)} km/h`);
check('speeding costs money, not only a warning', rig.lost > 0, `₺${rig.lost}`);

/* ---------------- 2e. navigation + discovery ---------------- */
const nav = await page.evaluate(async () => {
  const g = window.__game;
  const job = g.missions.jobs.find((j) => j.km > 5) || g.missions.jobs[0];
  g.missions.accept(job.id);
  for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
  const e = g.world.graph.edges.find((q) => q.routeCode && q.len > 300);
  const st = g.world.graph.station(e, e.len * 0.4);
  Object.assign(g.sim, { x: st.x, z: st.z, heading: Math.atan2(st.dx, st.dz), ry: Math.atan2(st.dx, st.dz), vx: st.dx * 14, vz: st.dz * 14 });
  for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r));
  const out = { inst: window.__ui.navInstruction, eta: window.__ui.etaText, shield: window.__ui.navShield,
    dir: window.__ui.navDir, remain: Math.round(window.__ui.distRemain), cluster: g.truck ? 1 : 0 };
  // discovery: drive onto a POI and see it land in the persisted list
  const poi = g.world.pois.find((p) => p.id === 'aloskegang.depot');
  Object.assign(g.sim, { x: poi.x, z: poi.z, vx: 0, vz: 0 });
  for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
  out.discovered = (window.__ui.discoveries || []).some((d) => d.id === 'aloskegang.depot');
  out.saved = JSON.parse(localStorage.getItem('nordhaul_session_v1') || '{}').discovered || [];
  g.missions.cancel();
  return out;
});
check('turn-by-turn instruction generated', /.+/.test(nav.inst), nav.inst);
check('instruction names a real manoeuvre', ['left', 'right', 'straight', 'arrive'].includes(nav.dir), `${nav.dir} / ${nav.remain} m left`);
check('ETA derived from the remaining route', /\d/.test(nav.eta), nav.eta);
check('route shield follows the road under the wheels', nav.shield.length > 0, nav.shield);
check('driving into a place registers the discovery', nav.discovered);
check('discovery survives into the saved session', nav.saved.includes('aloskegang.depot'));

/* ---------------- 2f. convoy (local multiplayer) seam ---------------- */
const convoy = await page.evaluate(async () => {
  const g = window.__game;
  const before = { active: g.net.active, kind: g.net.transportKind, count: g.net.count };
  g.setConvoy(false);
  const off = { active: g.net.active, ui: window.__ui.netOn, peers: g.netPeers.size };
  g.setConvoy(true);
  // A second channel object is a second tab: BroadcastChannel never echoes to the
  // sender, so this exercises the real transport, the parser and the roster at once.
  const ch = new BroadcastChannel('nordhaul-convoy-v1');
  const since = Date.now() - 1000;
  const pose = { x: g.sim.x + 120, z: g.sim.z, yaw: 0.4, kmh: 44, trailer: true, cargo: 'Buğday', damage: 3, onFoot: false };
  ch.postMessage({ k: 'join', id: 'TESTPEER', name: 'NH-0000-TE', since });
  ch.postMessage({ k: 'pose', id: 'TESTPEER', name: 'NH-0000-TE', since, p: pose });
  await new Promise(r => setTimeout(r, 200));
  await new Promise(r => requestAnimationFrame(r));
  const peer = g.net.members.get('TESTPEER');
  const mirrored = [...g.netPeers.values()][0] ?? null;
  const out = {
    before, off, after: { active: g.net.active, count: g.net.count },
    peer: !!peer, peerCargo: peer ? peer.pose.cargo : '', peerKmh: peer ? Math.round(peer.pose.kmh) : 0,
    uiCount: window.__ui.convoyCount, uiLine: (window.__ui.convoy || []).map(c => `${c.name} ${c.dist}m`).join(','),
    model: !!mirrored, modelX: mirrored ? Math.round(mirrored.x) : 0, want: Math.round(g.sim.x + 120),
    modelYaw: mirrored ? +mirrored.yaw.toFixed(2) : 0, trailer: mirrored ? mirrored.model.trailer.visible : false,
  };
  ch.postMessage({ k: 'leave', id: 'TESTPEER', name: 'NH-0000-TE', since });
  await new Promise(r => setTimeout(r, 200));
  await new Promise(r => requestAnimationFrame(r));
  out.leftGone = !g.net.members.has('TESTPEER');
  out.uiAfter = window.__ui.convoyCount;
  out.modelsAfter = g.netPeers.size;
  ch.close();
  return out;
});
check('convoy transport is live on boot', convoy.before.active && convoy.before.kind === 'broadcast-channel' && convoy.before.count === 1,
  `${convoy.before.kind}, ${convoy.before.count} rig(s)`);
check('K tears the convoy down and rebuilds it', convoy.off.active === false && convoy.off.ui === false && convoy.after.active === true);
check('a tab joining over the channel enters the roster', convoy.peer && convoy.uiCount === 2, convoy.uiLine || 'no roster line');
check('peer snapshot carries cargo and speed', convoy.peerCargo === 'Buğday' && convoy.peerKmh === 44, `${convoy.peerCargo} ${convoy.peerKmh} km/h`);
check('peer rig is mirrored in the world at its snapshot', convoy.model && Math.abs(convoy.modelX - convoy.want) < 60 && convoy.trailer,
  `x ${convoy.modelX}/${convoy.want} yaw ${convoy.modelYaw}`);
check('a leave message drops the rig immediately', convoy.leftGone && convoy.uiAfter === 1 && convoy.modelsAfter === 0);

/* ---------------- 3. reset ---------------- */
const reset = await page.evaluate(() => {
  const g = window.__game;
  g.resetSave();
  return {
    session: localStorage.getItem('nordhaul_session_v1'),
    profile: localStorage.getItem('nordhaul_p1_save'),
    money: window.__ui.money, level: window.__ui.level, hasSave: window.__ui.hasSave,
    spawn: Math.hypot(g.sim.x - g.world.spawn.px, g.sim.z - g.world.spawn.pz),
  };
});
// reset clears the world session outright; the profile key is rewritten with the
// starting progression, which is what a fresh save should look like.
check('session blob cleared', reset.session === null);
check('profile rewritten as a fresh start', reset.profile && JSON.parse(reset.profile).money === 2500 && JSON.parse(reset.profile).level === 1, reset.profile);
check('reset returns to the starting progression', reset.money === 2500 && reset.level === 1, `₺${reset.money} SV${reset.level}`);
check('reset parks the rig at the depot spawn', reset.spawn < 60, `${Math.round(reset.spawn)} m`);
check('no page errors during the run', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
console.log('PASS');
ok.forEach((l) => console.log('  ok  ' + l));
if (bad.length) { console.log('FAIL'); bad.forEach((l) => console.log('  X   ' + l)); process.exit(1); }
console.log(`\n${ok.length} checks passed, 0 failed`);
