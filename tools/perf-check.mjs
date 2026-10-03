import puppeteer from 'puppeteer';

/**
 * Performance census: what the renderer is actually asked for, and how long the world
 * takes to build. SwiftShader in headless is not a GPU, so frame times are only used
 * comparatively (same script before/after a change); calls, triangles, objects and
 * boot cost are hardware independent.
 */
const launch = await puppeteer.launch({
  executablePath: '/tmp/chromium', headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib:/tmp', VK_ICD_FILENAMES: '/tmp/vk_swiftshader_icd.json' },
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await launch.newPage();
await page.setViewport({ width: 1280, height: 720 });
const t0 = Date.now();
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__game && window.__game.ready===true', { timeout: 300000 });
const bootMs = Date.now() - t0;

const census = await page.evaluate(() => {
  const g = window.__game, info = g.renderer.info;
  let objects = 0; g.scene.traverse(() => objects++);
  return {
    bootMs: Math.round(performance.now()),
    calls: info.render.calls, tris: info.render.triangles, geometries: info.memory.geometries,
    textures: info.memory.textures, programs: info.programs?.length ?? -1,
    objects, colliders: g.world.col.all.length, edges: g.world.graph.edges.length, nodes: g.world.graph.nodes.length,
    traffic: g.traffic.count ?? g.traffic.vehicles?.length ?? -1,
    pixelRatio: g.renderer.getPixelRatio(), shadows: g.renderer.shadowMap.enabled,
    shadowMapSize: g.atm?.sun?.shadow?.mapSize ? `${g.atm.sun.shadow.mapSize.width}px` : 'n/a',
  };
});

// worst case: rolling down a corridor with the full traffic pool in the rain
const perf = await page.evaluate(async () => {
  const g = window.__game;
  g.start();
  const e = g.world.graph.edges.find(q => q.key === 'amasya-samsun');
  const st = g.world.graph.station(e, e.len * 0.5);
  Object.assign(g.sim, { x: st.x, z: st.z, heading: Math.atan2(st.dx, st.dz), vx: st.dx * 18, vz: st.dz * 18, engineOn: true });
  if (g.mode !== 'cab') g.enterTruck();
  g.setWeather?.('rain');
  const times = [], calls = [], tris = [];
  let last = performance.now();
  for (let i = 0; i < 90; i++) {
    await new Promise(r => requestAnimationFrame(r));
    const t = performance.now(); times.push(t - last); last = t;
    calls.push(g.renderer.info.render.calls); tris.push(g.renderer.info.render.triangles);
  }
  const stat = (a) => { const b = [...a].sort((x, y) => x - y); return { min: b[0], med: b[b.length >> 1], max: b[b.length - 1] }; };
  times.sort((a, b) => a - b);
  return { median: +times[Math.floor(times.length / 2)].toFixed(1), p95: +times[Math.floor(times.length * 0.95)].toFixed(1),
    calls: stat(calls), tris: stat(tris), speed: Math.round(g.sim.speedKmh),
    shadowFlip: g.shadowFlip, boot: { geometries: g.renderer.info.memory.geometries, textures: g.renderer.info.memory.textures } };
});

console.log(JSON.stringify({ bootMs, ...census, drive: perf }, null, 1));
await launch.close();
