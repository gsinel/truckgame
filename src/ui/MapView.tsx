import { useEffect, useRef } from 'react';
import { game } from '../game/Game';
import { riverC, WORLD } from '../game/terrain';
import { useUI } from '../game/store';
import { tr, upper } from '../game/i18n';
import { groundHeight } from '../game/elevation';
import { VILLAGES } from '../game/regions';

const S = 0.26, X0 = WORLD.x0, Z0 = WORLD.z0, W = Math.round((WORLD.x1 - X0) * S), H = Math.round((WORLD.z1 - Z0) * S);
const P = (x: number, z: number): [number, number] => [(x - X0) * S, (z - Z0) * S];

let bg: HTMLCanvasElement | null = null;
const ROAD: Record<string, [number, string]> = {
  highway: [9, '#f0c850'], town: [6, '#e4e4de'], rural: [4.5, '#d8d2bc'], industrial: [5.5, '#d0d0d0'],
  village: [4, '#e0dccc'], side: [4, '#d0ccc0'], ring: [5, '#e4e4de'],
};

function buildBg() {
  const w = game.world;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#5b8548';
  g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) {
    const wx = x / S + X0, wz = y / S + Z0, h = groundHeight(wx, wz);
    g.fillStyle = wz > 850 ? `hsl(48 24% ${Math.round(36 + h * 0.18)}%)` : `hsl(105 19% ${Math.round(29 + h * 0.16)}%)`;
    g.fillRect(x, y, 8, 8);
  }
  // fields
  for (const f of w.fields) {
    g.fillStyle = f.c; g.globalAlpha = 0.75;
    const [x, z] = P(f.x0, f.z0);
    g.fillRect(x, z, (f.x1 - f.x0) * S, (f.z1 - f.z0) * S);
  }
  g.globalAlpha = 1;
  // forests
  g.fillStyle = '#35603a';
  for (const r of w.forests) { const [x, z] = P(r[0], r[1]); g.fillRect(x, z, (r[2] - r[0]) * S, (r[3] - r[1]) * S); }
  // zones
  const zone = (x0: number, z0: number, x1: number, z1: number, col: string) => { g.fillStyle = col; const [x, z] = P(x0, z0); g.fillRect(x, z, (x1 - x0) * S, (z1 - z0) * S); };
  zone(-640, -170, -286, 168, '#a39e92'); zone(290, 190, 710, 420, '#9a9a94');
  for (const p of w.provinces.slice(1)) zone(p.x - 111, p.z - 111, p.x + 111, p.z + 111, '#989a8b');
  // cities that belong to an existing province (e.g. the Amasya-west expansion)
  const extraCities = w.cities.filter(c => !w.provinces.some(p => `${p.id}.center` === c.id));
  for (const c of extraCities) zone(c.x - 111, c.z - 111, c.x + 111, c.z + 111, '#989a8b');
  // river
  g.strokeStyle = '#3f7fb4'; g.lineWidth = 24 * S; g.lineCap = 'butt';
  g.beginPath();
  for (let z = WORLD.z0; z <= WORLD.z1 + 10; z += 10) { const [x, y] = P(riverC(z), z); if (z === WORLD.z0) g.moveTo(x, y); else g.lineTo(x, y); }
  g.stroke();
  // roads
  const draw = (col: (t: string) => string, wid: (t: number) => number) => {
    for (const e of w.graph.edges) {
      const [rw] = ROAD[e.type];
      g.strokeStyle = col(e.type); g.lineWidth = wid(rw); g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      e.pts.forEach((p, i) => { const [x, y] = P(p.x, p.z); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
      g.stroke();
    }
  };
  draw(() => '#20262f', (r) => r * S * 1.9 + 3);
  draw((t) => ROAD[t][1], (r) => r * S * 1.9 + 1);
  // buildings
  for (const f of w.foot) {
    g.save();
    const [x, z] = P(f.x, f.z);
    g.translate(x, z); g.rotate(-f.ry);
    g.fillStyle = f.kind === 'farmyard' ? 'rgba(0,0,0,0)' : f.kind === 'lorry' ? '#c8c8c8' : '#6c665c';
    g.fillRect((-f.w / 2) * S, (-f.d / 2) * S, f.w * S, f.d * S);
    g.restore();
  }
  // labels
  g.font = '11px monospace'; g.textAlign = 'center';
  const label = (t: string, x: number, z: number, col = '#fff') => {
    const [px, pz] = P(x, z);
    g.lineWidth = 3; g.strokeStyle = '#0a0e16'; g.strokeText(t, px, pz);
    g.fillStyle = col; g.fillText(t, px, pz);
  };
  for (const p of w.provinces) {
    g.font = 'bold 17px monospace';
    label(upper(p.displayName), p.x, p.z - 163, '#fff0c8');
  }
  g.font = 'bold 14px monospace';
  for (const c of extraCities) label(upper(c.displayName), c.x, c.z - 140, '#fff0c8');
  g.font = '10px monospace';
  const labelled = ['village', 'forest', 'farm', 'industrial', 'amasya.riverfront', ...w.villages.map(v => v.id)];
  for (const p of w.pois.filter(p => labelled.includes(p.id))) label(upper(p.name), p.x, p.z - 8, '#d4dcc8');
  for (const l of Object.values(w.locations)) {
    const [x, z] = P(l.x, l.z);
    g.fillStyle = '#ffb030'; g.fillRect(x - 3, z - 3, 6, 6);
    g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect(x - 3.5, z - 3.5, 7, 7);
  }
  for (const site of w.services) {
    const [x, z] = P(site.x, site.z);
    g.fillStyle = site.kind === 'fuel' ? '#66b4df' : site.kind === 'garage' ? '#eb7956' : '#ece2aa';
    g.fillRect(x - 3, z - 3, 6, 6); g.strokeStyle = '#192e30'; g.lineWidth = 1; g.strokeRect(x - 3.5, z - 3.5, 7, 7);
  }
  g.fillStyle = '#f0e8c8'; g.font = 'bold 16px monospace'; g.fillText(tr.north, W - 28, 26);
  g.strokeStyle = '#f0e8c8'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(24, H - 28); g.lineTo(24 + 500 * S, H - 28); g.stroke();
  g.font = '11px monospace'; g.textAlign = 'left'; g.fillText('500 m', 24, H - 35);
  return c;
}

function drawRoute(g: CanvasRenderingContext2D, st: ReturnType<typeof game.getMapState>, t: number) {
  if (st.route && st.route.pts.length > 1) {
    g.strokeStyle = '#1a60ff'; g.lineWidth = 5; g.lineJoin = 'round'; g.globalAlpha = 0.9;
    g.beginPath();
    st.route.pts.forEach((p, i) => { const [x, y] = P(p.x, p.z); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
    g.stroke();
    g.strokeStyle = '#8fd0ff'; g.lineWidth = 2; g.setLineDash([6, 6]); g.lineDashOffset = -t * 20;
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
  }
  if (st.target) {
    const [x, y] = P(st.target.x, st.target.z);
    const r = 6 + Math.sin(t * 5) * 1.5;
    g.fillStyle = '#44e08c'; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
  }
}
function arrow(g: CanvasRenderingContext2D, x: number, y: number, rot: number, s: number) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = '#ff3a2a'; g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.7, s * 0.8); g.lineTo(0, s * 0.4); g.lineTo(-s * 0.7, s * 0.8); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

export function MiniMap({ size = 210, span = 380 }: { size?: number; span?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const s = useUI();
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !game.ready) return;
    if (!bg) bg = buildBg();
    const g = cv.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const st = game.getMapState();
    g.fillStyle = '#0b1018'; g.fillRect(0, 0, size, size);
    g.save();
    g.beginPath(); g.rect(0, 0, size, size); g.clip();
    g.translate(size / 2, size / 2);
    g.rotate(st.heading - Math.PI);
    const k = size / span / S;
    g.scale(k, k);
    const [px, pz] = P(st.x, st.z);
    g.translate(-px, -pz);
    g.drawImage(bg, 0, 0);
    drawRoute(g, st, performance.now() / 1000);
    g.restore();
    arrow(g, size / 2, size / 2, 0, 8);
  });
  return <button type="button" aria-label={tr.map} className="minimap-button" onClick={() => game.openMenu('map')}>
    <canvas aria-label={tr.map} ref={ref} width={size} height={size} className="pixel panel" style={{ width: size, height: size, padding: 0 }} data-v={s.hour} />
  </button>;
}

export function FullMap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const s = useUI();
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    if (!bg) bg = buildBg();
    const g = cv.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, W, H);
    g.drawImage(bg, 0, 0);
    const st = game.getMapState();
    drawRoute(g, st, performance.now() / 1000);
    const [x, z] = P(st.x, st.z);
    arrow(g, x, z, Math.PI - st.heading, 9);
  });
  return <canvas aria-label={tr.map} ref={ref} width={W} height={H} className="pixel panel" style={{ width: `min(92vw, ${(W / H) * 65}vh)`, aspectRatio: `${W} / ${H}`, padding: 0 }} data-v={s.hour} />;
}
