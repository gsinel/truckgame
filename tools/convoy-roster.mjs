import puppeteer from 'puppeteer';

/**
 * Roster test at the protocol level: one rendered game plus synthetic peers that speak the
 * convoy protocol over the real BroadcastChannel at 10 Hz. This is how 3 and 4 rigs and the
 * player cap get verified here — the sandbox cannot hold four simultaneous WebGL renderers,
 * so two *real* full game tabs are exercised by tools/convoy-check.mjs instead.
 */
const launch = await puppeteer.launch({
  executablePath: '/tmp/chromium', headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib:/tmp', VK_ICD_FILENAMES: '/tmp/vk_swiftshader_icd.json' },
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await launch.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
await page.setViewport({ width: 900, height: 520 });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__game && window.__game.ready===true', { timeout: 300000 });

const res = await page.evaluate(async () => {
  const g = window.__game;
  g.start();
  await new Promise(r => setTimeout(r, 500));

  /** a synthetic rig: posts join once, then a pose every 100 ms, like the game does */
  function peer(id, since) {
    const ch = new BroadcastChannel('nordhaul-convoy-v1');
    let x = 40 + id.length * 90, dir = 1;
    ch.postMessage({ k: 'join', id, name: `RİG-${id}`, since });
    const t = setInterval(() => {
      x += dir * 3;
      ch.postMessage({ k: 'pose', id, name: `RİG-${id}`, since, p: { x, z: 120, yaw: 1.57, kmh: 52, trailer: true, cargo: 'Çimento', damage: 0, onFoot: false } });
    }, 100);
    return { ch, t, next: () => x };
  }

  const base = Math.floor(Date.now() / 1000) * 1000;
  const peers = [peer('P1', base - 4000), peer('P2', base - 3000), peer('P3', base - 2000)];
  await new Promise(r => setTimeout(r, 900));
  const three = { count: g.net.count, roster: g.net.roster.map(m => m.name), host: g.net.isHost };

  const fourth = peer('P4', base - 1000);
  await new Promise(r => setTimeout(r, 700));
  const four = { count: g.net.count, models: g.netPeers.size, moving: [...g.netPeers.values()].map(p => Math.round(p.x)) };
  const movedA = [...g.netPeers.values()].map(p => Math.round(p.x));
  await new Promise(r => setTimeout(r, 500));
  const movedB = [...g.netPeers.values()].map(p => Math.round(p.x));

  // cap: a fifth rig must not be admitted by the members already in the convoy
  const fifth = peer('P5', base + 1000);
  await new Promise(r => setTimeout(r, 700));
  const capped = { count: g.net.count, members: g.net.members.size };
  fifth.ch.postMessage({ k: 'leave', id: 'P5', name: 'RİG-P5', since: base });
  clearInterval(fifth.t); fifth.ch.close();

  // host election: the convoy leader is the earliest joiner, and it is us only if we are
  const hostTest = { hostName: g.net.roster[0]?.name ?? 'self', isHost: g.net.isHost };

  // P2 goes silent (crash, no goodbye). Staleness is wall-clock, but the drop is *observed*
  // on a rendered frame, and software rendering here can take seconds per frame — so poll.
  const until = async (fn, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await new Promise(r => setTimeout(r, 150)); } return false; };
  clearInterval(peers[1].t);
  const timedOut = await until(() => !g.net.members.has('P2'), 40000);
  const afterTimeout = { gone: timedOut, count: g.net.count };

  // P3 says goodbye properly: that is message driven and must be near-immediate
  peers[2].ch.postMessage({ k: 'leave', id: 'P3', name: 'RİG-P3', since: base - 2000 });
  const leftCleanly = await until(() => !g.net.members.has('P3'), 8000);
  const afterLeave = { gone: leftCleanly, count: g.net.count };

  for (const q of [...peers, fourth]) { clearInterval(q.t); q.ch.close(); }
  const drained = await until(() => g.net.count === 1, 40000);
  const empty = { drained, count: g.net.count, models: g.netPeers.size };
  return { three, four, movedA, movedB, capped, hostTest, afterTimeout, afterLeave, empty };
});
console.log(JSON.stringify(res, null, 1));
console.log('pageerrors', errs.slice(0, 3));
await launch.close();
