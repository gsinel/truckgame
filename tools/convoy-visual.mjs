import puppeteer from 'puppeteer';

/**
 * Convoy render check: does the mirrored rig actually exist in the receiving world, at
 * the sender's position, and does it look like a truck? Two tabs, one browser profile.
 */
const launch = await puppeteer.launch({
  executablePath: '/tmp/chromium', headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib:/tmp', VK_ICD_FILENAMES: '/tmp/vk_swiftshader_icd.json' },
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const errs = [];
async function rig(tag) {
  const page = await launch.newPage();
  page.on('pageerror', e => errs.push(`${tag}: ${String(e).slice(0, 160)}`));
  await page.setViewport({ width: 1100, height: 620 });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__game && window.__game.ready===true', { timeout: 300000 });
  await page.evaluate(() => window.__game.start());
  await wait(1200);
  return page;
}
const A = await rig('A');
const B = await rig('B');

// park A on the new Canik corridor, then look at it from B
const spot = await A.evaluate(() => {
  const g = window.__game;
  const e = g.world.graph.edges.find(q => q.key === 'samsun-corum');
  const st = g.world.graph.station(e, e.len * 0.5);
  Object.assign(g.sim, { x: st.x, z: st.z, heading: Math.atan2(st.dx, st.dz), vx: 0, vz: 0, damage: 0 });
  Object.assign(g.player, { x: st.x, z: st.z, yaw: g.sim.heading });
  if (g.mode !== 'cab') g.enterTruck();
  return { x: st.x, z: st.z, yaw: Math.atan2(st.dx, st.dz) };
});
await wait(700);

const bView = await B.evaluate(async (s) => {
  const g = window.__game;
  // stand a little behind and beside the peer rig so its mirrored model fills the frame
  const px = s.x - Math.sin(s.yaw) * 16 + Math.cos(s.yaw) * 9;
  const pz = s.z - Math.cos(s.yaw) * 16 - Math.sin(s.yaw) * 9;
  Object.assign(g.sim, { x: px, z: pz, heading: s.yaw, vx: 0, vz: 0 });
  Object.assign(g.player, { x: px, z: pz, yaw: s.yaw });
  if (g.mode !== 'cab') g.enterTruck();
  await new Promise(r => setTimeout(r, 1500));
  const peers = [...(g.netPeers ? g.netPeers.values() : [])];
  const p = peers[0];
  const inScene = p ? g.scene.children.some(o => o === p.model.root) : false;
  return {
    peers: peers.length, inScene,
    pos: p ? [Math.round(p.model.root.position.x), Math.round(p.model.root.position.z)] : null,
    want: [Math.round(s.x), Math.round(s.z)],
    meshes: p ? (() => { let n = 0; p.model.root.traverse(() => n++); return n; })() : 0,
    pose: (() => { const m = [...g.net.members.values()][0]; return m ? [Math.round(m.pose.x), Math.round(m.pose.z)] : null; })(),
    trailer: p ? p.model.trailer.visible : null,
    convoy: (window.__ui.convoy || []).map(c => `${c.name} ${c.dist}m ${c.kmh}km/h ${c.cargo || '-'}`),
    count: window.__ui.convoyCount,
  };
}, spot);
console.log(JSON.stringify(bView, null, 1));
await wait(400);
await B.screenshot({ path: '.cache/convoy-two-rigs.png' });
console.log('pageerrors', errs.slice(0, 3));
await launch.close();
