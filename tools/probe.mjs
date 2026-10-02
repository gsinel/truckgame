/**
 * Headless runtime probe for the truck game.
 *
 * Boots the running dev server in Chromium (SwiftShader WebGL), waits for the
 * game to finish building the world, then reports:
 *   - page errors / console errors
 *   - build timings and world statistics
 *   - validation reports exposed by the game (window.__validateWorldData ...)
 *   - a short scripted drive (throttle for N seconds) to prove the sim advances
 *
 * Usage:  node tools/probe.mjs [url] [--drive=SECONDS] [--json]
 * Chromium is not part of the repo: set CHROME_PATH or use the sandbox path.
 */
import puppeteer from 'puppeteer';
import process from 'node:process';

const url = (process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:5173/').replace(/\/$/, '/');
const driveArg = process.argv.find((a) => a.startsWith('--drive='));
const driveSeconds = driveArg ? Number(driveArg.split('=')[1]) : 0;
const jsonOnly = process.argv.includes('--json');
const exe = process.env.CHROME_PATH || '/tmp/chromium';
const libDir = process.env.CHROME_LIB_DIR || '/tmp/al2023/lib';

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: `${libDir}:/tmp`, VK_ICD_FILENAMES: '/tmp/vk_swiftshader_icd.json' },
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-gpu-sandbox', '--window-size=1280,720', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', '--no-zygote',
  ],
});

const out = { url, errors: [], consoleErrors: [], build: {}, world: null, drive: null };
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (e) => out.errors.push(String(e && e.message ? e.message : e)));
  page.on('console', (m) => {
    if (m.type() === 'error') out.consoleErrors.push(m.text());
  });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__game && window.__game.ready === true', { timeout: 120000 });
  out.build.ms = Date.now() - t0;
  out.build.loadingFinished = await page.evaluate(() => !window.__game.ui?.loading);
  out.world = await page.evaluate(() => {
    const g = window.__game;
    const world = g.world;
    const groundHeightProbe = (x, z) => window.__elevation.groundHeight(x, z);
    const nav = g.nav;
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const lens = world.graph.edges.map((e) => e.len);
    const cityRoutes = {};
    for (const a of world.cities) {
      for (const b of world.cities) {
        if (a.id >= b.id) continue;
        const ra = nav.route(a, b);
        let km = 0;
        for (let i = 1; i < ra.pts.length; i++) km += Math.hypot(ra.pts[i].x - ra.pts[i - 1].x, ra.pts[i].z - ra.pts[i - 1].z);
        cityRoutes[`${a.id}->${b.id}`] = Math.round(km);
      }
    }
    return {
      nodes: world.graph.nodes.length,
      edges: world.graph.edges.length,
      roadKm: Math.round(sum(lens) / 100) / 10,
      edgeMin: Math.round(Math.min(...lens)),
      edgeMax: Math.round(Math.max(...lens)),
      locations: Object.keys(world.locations).length,
      services: world.services.length,
      pois: world.pois.length,
      cities: world.cities.map((c) => c.id),
      provinces: world.provinces.map((p) => p.id),
      jobs: (g.missions?.jobs || []).map((j) => ({ id: j.id, km: Math.round(j.km * 10) / 10, reward: j.reward })),
      grades: (() => {
        const out = [];
        for (const e of world.graph.edges) {
          if (e.len < 400) continue;
          let max = 0, at = 0;
          const step = 20;
          for (let s = 0; s + step <= e.len; s += step) {
            const a = world.graph.sample(e, s), b = world.graph.sample(e, s + step);
            const dh = Math.abs(groundHeightProbe(b.x, b.z) - groundHeightProbe(a.x, a.z));
            const g = dh / step;
            if (g > max) { max = g; at = s; }
          }
          out.push({ key: e.key || e.id, len: Math.round(e.len), maxGradePct: Math.round(max * 1000) / 10 });
        }
        out.sort((a, b) => b.maxGradePct - a.maxGradePct);
        return out.slice(0, 14);
      })(),
      cityRoutes,
      sceneChildren: world.root.children.length,
      renderInfo: { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles },
      memory: g.renderer.info.memory,
      spawn: world.spawn,
    };
  });

  // Boot into the cab and drive for a while under scripted input.
  await page.evaluate(() => {
    const g = window.__game;
    g.start();
    g.mode = 'cab';
    g.camMode = 'chase';
    g.sim.handbrake = false;
    g.sim.engineOn = true;
    g.keys.add('KeyW');
  });
  if (driveSeconds > 0) {
    await new Promise((r) => setTimeout(r, driveSeconds * 1000));
  }
  out.drive = await page.evaluate(() => {
    const g = window.__game;
    return {
      x: Math.round(g.sim.x), z: Math.round(g.sim.z),
      speedKmh: Math.round(g.sim.speedKmh), gear: g.sim.gear,
      fuel: Math.round(g.sim.fuel * 10) / 10, damage: Math.round(g.sim.damage),
      distanceKm: Math.round(g.sim.distance / 100) / 10,
      fps: window.__ui.perf.fps, ms: window.__ui.perf.ms, calls: window.__ui.perf.calls,
      tris: window.__ui.perf.tris, res: window.__ui.perf.res,
      mode: g.mode, cam: g.camMode,
    };
  });
  // Physics-only drivetrain/steering/brake check: not a rendering test, but it
  // proves the sim advances under throttle, steers, brakes and reverses.
  out.simStep = await page.evaluate(() => {
    const g = window.__game;
    const sim = g.sim;
    const step = (n, inp) => {
      for (let i = 0; i < n; i++) sim.update(0.02, inp, g.world.col, [], false);
    };
    const idle = { up: false, down: false, left: false, right: false, handbrake: false };
    sim.reset(g.world.spawn.px, g.world.spawn.pz, g.world.spawn.heading);
    sim.handbrake = false; sim.engineOn = true; sim.damage = 0;
    const x0 = sim.x, z0 = sim.z, h0 = sim.heading;
    step(300, { ...idle, up: true });
    const afterThrottle = { kmh: Math.round(sim.speedKmh * 10) / 10, gear: sim.gear, moved: Math.round(Math.hypot(sim.x - x0, sim.z - z0)) };
    step(150, { ...idle, up: true, left: true });
    const turned = Math.round((Math.abs(sim.heading - h0) * 180) / Math.PI);
    step(200, { ...idle, down: true });
    const afterBrake = { kmh: Math.round(sim.speedKmh * 10) / 10 };
    sim.reset(x0, z0, h0);
    step(240, { ...idle, down: true });
    const reverse = { kmh: Math.round(sim.speedKmh * 10) / 10, moved: Math.round(Math.hypot(sim.x - x0, sim.z - z0)) };
    const fuel0 = sim.fuel;
    step(400, { ...idle, up: true });
    return { afterThrottle, turnedDeg: turned, afterBrake, reverse, fuelUsed: Math.round((fuel0 - sim.fuel) * 100) / 100 };
  });
  out.valid = await page.evaluate(() => {
    const g = window.__game;
    const res = { data: null, phase2: null };
    try { res.data = window.__validateWorldData(); } catch (e) { res.dataError = String(e); }
    try {
      const r = window.__validatePhase2();
      res.phase2 = { checks: r.structuralChecks.map((c) => ({ name: c.name, passed: c.passed, detail: c.detail })) };
    } catch (e) { res.phase2Error = String(e); }
    void g;
    return res;
  });
} catch (e) {
  out.fatal = String(e && e.stack ? e.stack : e);
} finally {
  await browser.close();
}

if (jsonOnly) {
  console.log(JSON.stringify(out, null, 1));
} else {
  const p = (k, v) => console.log(String(k).padEnd(22), v);
  console.log('=== PROBE ===');
  p('url', out.url);
  p('build ms', out.build.ms);
  if (out.world) {
    console.log('steepest grades (long edges):');
    for (const g of out.world.grades || []) console.log('   ', String(g.key).padEnd(28), String(g.len).padStart(6), 'm', String(g.maxGradePct).padStart(6), '%');
    p('nodes / edges', `${out.world.nodes} / ${out.world.edges}`);
    p('road network km', out.world.roadKm);
    p('edge len min/max', `${out.world.edgeMin} / ${out.world.edgeMax}`);
    p('locations', out.world.locations);
    p('services / pois', `${out.world.services} / ${out.world.pois}`);
    p('jobs', out.world.jobs.length);
    p('terrain mem', JSON.stringify(out.world.memory));
    p('draw calls / tris', `${out.world.renderInfo.calls} / ${out.world.renderInfo.tris}`);
    console.log('city-to-city route km:');
    for (const [k, v] of Object.entries(out.world.cityRoutes)) console.log('   ', k.padEnd(42), (v / 1000).toFixed(1), 'km');
    console.log('jobs:');
    for (const j of out.world.jobs) console.log('   ', j.id.padEnd(24), String(j.km).padStart(6), 'km', String(j.reward).padStart(7), 'TRY');
  }
  if (out.drive) { console.log('--- drive ---'); for (const [k, v] of Object.entries(out.drive)) p(k, v); }
  if (out.simStep) { console.log('--- sim step (physics only, no render) ---'); for (const [k, v] of Object.entries(out.simStep)) p(k, JSON.stringify(v)); }
  if (out.valid) {
    const v = out.valid;
    console.log('--- validators ---');
    if (v.dataError) p('__validateWorldData', 'THREW: ' + v.dataError);
    else if (v.data) p('__validateWorldData', `passed=${v.data.passed} issues=${(v.data.expansionIssues || []).length}`);
    if (v.phase2Error) p('__validatePhase2', 'THREW: ' + v.phase2Error);
    else {
      const checks = v.phase2?.checks || [];
      p('__validatePhase2', checks.map((c) => `${c.passed ? 'OK' : 'FAIL'} ${c.name}`).join(' | '));
      for (const c of checks) if (!c.passed) console.log('    FAIL', c.name, '::', String(c.detail).slice(0, 300));
    }
  }
  p('page errors', out.errors.length);
  out.errors.forEach((e) => console.log('    !', e.split('\n')[0]));
  p('console errors', out.consoleErrors.length);
  out.consoleErrors.slice(0, 10).forEach((e) => console.log('    !', e.slice(0, 200)));
  if (out.fatal) console.log('FATAL', out.fatal);
}
