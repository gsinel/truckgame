/** Headless screenshot pass: places the camera at authored spots and saves PNGs to /tmp/shots. */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
const OUT = process.env.SHOT_DIR || '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/tmp/chromium', headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib:/tmp', VK_ICD_FILENAMES: '/tmp/vk_swiftshader_icd.json' },
  args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio','--no-zygote'] });
const page = await browser.newPage();
await page.setViewport({ width: 640, height: 360 });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__game && window.__game.ready === true', { timeout: 180000 });
await page.evaluate(() => {
  const g = window.__game;
  g.start(); g.mode = 'cab'; g.sim.engineOn = true; g.sim.handbrake = true;
  // Hide the HUD so the screenshots show the world, not the overlays.
  document.head.insertAdjacentHTML('beforeend', '<style>#root > div > *:not(:first-child){display:none !important}</style>');
});
const spots = await page.evaluate(() => {
  const g = window.__game, gr = g.world.graph;
  const st = (key, s, off = 0) => { const e = gr.edges.find(q => q.key === key); const p = gr.sample(e, Math.min(s, e.len - 10)); return { x: p.x + p.rx * off, z: p.z + p.rz * off, h: Math.atan2(p.dx, p.dz) }; };
  const cityView = (id, ang = 3.9, dist = 430) => {
    const c = g.world.cities.find(q => q.id === id);
    const x = c.x + Math.cos(ang) * dist, z = c.z + Math.sin(ang) * dist;
    return { x, z, h: Math.atan2(c.x - x, c.z - z) };
  };
  const at = (key, s, off = 0) => { const e = gr.edges.find(q => q.key === key); const p = gr.sample(e, Math.min(s, e.len - 10)); return { x: p.x + p.rx * off, z: p.z + p.rz * off, h: 0 }; };
  const look = (key, s, off, tx, tz) => { const p = at(key, s, off); p.h = Math.atan2(tx - p.x, tz - p.z); return p; };
  const fuel = g.world.services.find(q => q.kind === 'fuel' && q.id.startsWith('road.'));
  const rest = g.world.services.find(q => q.kind === 'rest');
  const vil = g.world.pois.find(q => q.id.includes('kirikvadi') || q.id.includes('bayat') || q.id.includes('gokdere'));
  return [
    { name: '01-amasya-depot-cab', ...st('amasya.riverfront', 20), cam: 'cab' },
    { name: '02-amasya-center', ...cityView('amasya.center', 2.4, 470), cam: 'chase' },
    { name: '03-amasya-industrial', ...cityView('amasya.center', 0.6, 520), cam: 'chase' },
    { name: '04-tokat-corridor', ...st('amasya-tokat', 2600), cam: 'chase' },
    { name: '05-tokat-city', ...cityView('tokat.center', 0.8), cam: 'chase' },
    { name: '06-samsun-city', ...cityView('samsun.center', 2.6), cam: 'chase' },
    { name: '07-corum-city', ...cityView('corum.center', 0.7), cam: 'chase' },
    { name: '08-sivas-city', ...cityView('sivas.center', 2.5), cam: 'chase' },
    { name: '09-yozgat-city', ...cityView('yozgat.center', 0.9), cam: 'chase' },
    { name: '10-merzifon-city', ...cityView('amasya.merzifon', 3.6), cam: 'chase' },
    { name: '11-suluova-city', ...cityView('amasya.suluova', 0.7), cam: 'chase' },
    { name: '12-fuel-stop', ...look('amasya-samsun', 3100, -14, fuel.x, fuel.z), cam: 'chase' },
    { name: '13-rest-area', ...look('amasya-samsun', 3500, -16, rest.x, rest.z), cam: 'chase' },
    { name: '14-corridor-village', ...look('amasya-corum', 3500, -12, vil.x, vil.z), cam: 'chase' },
    { name: '15-night-road', ...st('amasya-tokat', 5200), cam: 'cab', hour: 22.5 },
    { name: '16-rain-road', ...st('tokat-sivas', 3000), cam: 'chase', hour: 17, rain: true },
    { name: '17-plateau-bridge', ...st('yozgat-sivas.west', 9000), cam: 'chase' },
    { name: '18-corum-fuel', ...at('amasya-corum', 6200, 30), cam: 'chase' },
  ];
});
// Optional: one wide view of every authored roadside stop, from the road, in the
// game's own far camera (the runtime drives the camera, so hand-placed cameras
// are overwritten each frame).
const stopName = process.env.SHOT_STOPS;
if (stopName) {
  const stops = await page.evaluate(() => window.__game.world.services
    .filter((s) => s.id.startsWith('road.'))
    .map((s) => { const e = window.__game.world.graph.nearest(s.x, s.z); return { id: s.id, x: s.x, z: s.z, road: e.e.key, s: e.s }; }));
  for (const st of stops) {
    await page.evaluate((st) => {
      const g = window.__game;
      const gr = g.world.graph;
      const e = gr.edges.find((q) => q.key === st.road);
      const s0 = Math.max(20, st.s - 95);
      const p = gr.sample(e, s0);
      g.mode = 'cab'; g.camMode = 'far';
      g.sim.x = p.x; g.sim.z = p.z; g.sim.heading = Math.atan2(st.x - p.x, st.z - p.z);
      g.sim.vf = 0; g.sim.vx = 0; g.sim.vz = 0; g.sim.handbrake = true;
      g.setHour(10.5); g.setWeather('clear'); g.setAutoWeather(false);
    }, st);
    await new Promise((r) => setTimeout(r, 4000));
    await page.screenshot({ path: `${OUT}/stop-${st.id}.png` });
    console.log('shot stop', st.id);
  }
  await browser.close();
  process.exit(0);
}

const only = process.env.SHOT_ONLY;
for (const s of spots.filter((q) => !only || q.name.includes(only))) {
  await page.evaluate((s) => {
    const g = window.__game;
    g.mode = 'cab'; g.camMode = s.cam;
    g.sim.x = s.x; g.sim.z = s.z; g.sim.heading = s.h; g.sim.vf = 0; g.sim.vx = 0; g.sim.vz = 0;
    g.setHour(s.hour ?? 11); g.setWeather(s.rain ? 'rain' : 'clear'); g.setAutoWeather(false);
  }, s);
  await new Promise((r) => setTimeout(r, 4500));
  await page.screenshot({ path: `${OUT}/${s.name}.png` });
  console.log('shot', s.name);
}
await browser.close();
