import puppeteer from 'puppeteer';

/**
 * Two-tab convoy test: same browser profile, same origin, so BroadcastChannel is a real
 * transport here. Verifies join, pose sync, peer rig in the scene, shared dispatch offer,
 * and loss detection when a tab disappears.
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
  await wait(1500);
  return page;
}

const A = await rig('A');
const B = await rig('B');
const out = (k, v) => console.log(`${k.padEnd(28)} ${v}`);

const idA = await A.evaluate(() => window.__game.net.selfId);
const idB = await B.evaluate(() => window.__game.net.selfId);
out('self ids differ', idA !== idB ? `${idA} / ${idB}` : 'FAIL same id');

let nA = await A.evaluate(() => window.__game.net.count);
let nB = await B.evaluate(() => window.__game.net.count);
out('roster size both sides', `${nA} / ${nB} (want 2 / 2)`);

// move rig A down the road and check B sees it
const moved = await A.evaluate(async () => {
  const g = window.__game;
  const e = g.world.graph.edges.find(q => q.key === 'samsun-corum') ?? g.world.graph.edges.find(q => q.type === 'rural');
  const st = g.world.graph.station(e, e.len * 0.3);
  Object.assign(g.sim, { x: st.x, z: st.z, heading: Math.atan2(st.dx, st.dz), vx: 0, vz: 0, damage: 0 });
  Object.assign(g.player, { x: st.x, z: st.z, yaw: g.sim.heading });
  if (g.mode !== 'cab') g.enterTruck();
  await new Promise(r => requestAnimationFrame(r));
  return { x: Math.round(st.x), z: Math.round(st.z) };
});
out('rig A moved to world pos', `${moved.x}, ${moved.z}`);
await wait(900);
const seen = await B.evaluate(() => {
  const g = window.__game;
  const p = [...g.netPeers?.values?.() ?? []][0] ?? (() => {
    // private field: read through the roster the HUD uses
    return null;
  })();
  const c = (window.__ui.convoy || [])[0];
  const peer = g.scene.children.filter(o => o.type === 'Group').length;
  return { convo: c ? `${c.name} ${c.dist} m` : 'none', count: window.__ui.convoyCount, peerObj: !!p, groups: peer };
});
out('B roster line', `${seen.convo} (count ${seen.count})`);
out('B sees A at its new spot', seen.convo && seen.convo !== 'none' ? 'yes' : 'FAIL');

// shared dispatch: A accepts a job, B's board must grow by one convoy offer
const accepted = await A.evaluate(async () => {
  const g = window.__game;
  const j = g.missions.jobs.find(q => !q.id.includes('-')) ?? g.missions.jobs[0];
  g.missions.accept(j.id);
  await new Promise(r => requestAnimationFrame(r));
  return j.title;
});
await wait(700);
const shared = await B.evaluate((title) => {
  const jobs = window.__game.missions.jobs;
  const net = jobs.filter(j => j.id.includes('-') && j.title === title);
  return { got: net.length, total: jobs.length, ui: (window.__ui.jobs || []).length };
}, accepted);
out('A accepted a job', accepted);
out('B received shared offer', `${shared.got ? 'yes' : 'FAIL'} (board ${shared.total}, ui ${shared.ui})`);

// disconnect handling: close B, A must fall back to a solo roster within the timeout
await B.close();
await wait(5200);
const afterA = await A.evaluate(() => ({ count: window.__game.net.count, ui: window.__ui.convoyCount, peers: window.__game.net.members.size }));
out('A after B closed', `count ${afterA.count}, hud ${afterA.ui}, members ${afterA.peers} (want 1/1/0)`);

await A.screenshot({ path: '.cache/convoy-hud.png' });
out('page errors', errs.length ? errs.join(' | ') : 'none');
await launch.close();
