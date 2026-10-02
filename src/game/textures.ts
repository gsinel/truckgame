import * as THREE from 'three';
import { tr } from './i18n';

/* ------------------------------------------------------------------ */
/*  Procedural PIXEL-ART textures. Everything uses nearest filtering   */
/*  so every texel stays crisp, however close the player gets.         */
/* ------------------------------------------------------------------ */

let _seed = 12345;
export function srand(s: number) {
  _seed = s;
}
/** Lets a builder run on its own stream and restore the caller's, leaving existing layouts untouched. */
export function getSeed() {
  return _seed;
}
export function rnd() {
  _seed |= 0;
  _seed = (_seed + 0x6d2b79f5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rr = (a: number, b: number) => a + rnd() * (b - a);
export const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

type Ctx = CanvasRenderingContext2D;
const clamp255 = (v: number) => Math.max(0, Math.min(255, v));

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

function toTex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noiseFill(g: Ctx, w: number, h: number, r: number, gr: number, b: number, amp: number) {
  const id = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const n = (rnd() - 0.5) * 2 * amp;
    id.data[i * 4] = clamp255(r + n);
    id.data[i * 4 + 1] = clamp255(gr + n);
    id.data[i * 4 + 2] = clamp255(b + n);
    id.data[i * 4 + 3] = 255;
  }
  g.putImageData(id, 0, 0);
}
const px = (g: Ctx, x: number, y: number, w: number, h: number, col: string) => {
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
};
const rgb = (r: number, g: number, b: number) => `rgb(${r | 0},${g | 0},${b | 0})`;

function make(w: number, h: number, draw: (g: Ctx, w: number, h: number) => void, srgb = true) {
  const [c, g] = canvas(w, h);
  draw(g, w, h);
  return toTex(c, srgb);
}

/* ------------------------------- base surfaces ------------------------------- */
const asphalt = () =>
  make(64, 64, (g, w, h) => {
    noiseFill(g, w, h, 66, 68, 72, 9);
    for (let i = 0; i < 90; i++) px(g, rnd() * w, rnd() * h, 1, 1, rgb(rr(95, 125), rr(95, 125), rr(95, 125)));
    for (let i = 0; i < 40; i++) px(g, rnd() * w, rnd() * h, 1, 1, rgb(36, 38, 42));
    // hairline cracks
    for (let k = 0; k < 2; k++) {
      let x = rnd() * w, y = rnd() * h;
      for (let i = 0; i < 14; i++) {
        px(g, x, y, 1, 1, rgb(30, 32, 36));
        x += Math.floor(rr(-1, 2));
        y += Math.floor(rr(0, 2));
      }
    }
  });
const asphaltLight = () =>
  make(64, 64, (g, w, h) => {
    noiseFill(g, w, h, 104, 106, 108, 10);
    for (let i = 0; i < 80; i++) px(g, rnd() * w, rnd() * h, 1, 1, rgb(140, 140, 140));
  });
const concrete = () =>
  make(64, 64, (g, w, h) => {
    noiseFill(g, w, h, 156, 155, 150, 8);
    px(g, 0, 31, w, 1, rgb(118, 118, 114));
    px(g, 31, 0, 1, h, rgb(118, 118, 114));
    for (let i = 0; i < 40; i++) px(g, rnd() * w, rnd() * h, 1, 1, rgb(120, 120, 116));
  });
const pavement = () =>
  make(64, 64, (g, w, h) => {
    for (let ty = 0; ty < 4; ty++)
      for (let tx = 0; tx < 4; tx++) {
        const v = rr(-10, 10);
        px(g, tx * 16, ty * 16, 16, 16, rgb(150 + v, 144 + v, 134 + v));
        for (let i = 0; i < 14; i++) px(g, tx * 16 + rnd() * 16, ty * 16 + rnd() * 16, 1, 1, rgb(135 + v, 130 + v, 120 + v));
        px(g, tx * 16, ty * 16, 16, 1, rgb(112, 108, 100));
        px(g, tx * 16, ty * 16, 1, 16, rgb(112, 108, 100));
      }
  });
const grass = () =>
  make(64, 64, (g, w, h) => {
    noiseFill(g, w, h, 78, 128, 52, 13);
    for (let i = 0; i < 140; i++) {
      const x = rnd() * w, y = rnd() * h;
      px(g, x, y, 1, 2, rgb(rr(48, 70), rr(100, 130), rr(34, 50)));
    }
    for (let i = 0; i < 60; i++) px(g, rnd() * w, rnd() * h, 1, 1, rgb(rr(110, 140), rr(160, 185), rr(70, 90)));
    for (let i = 0; i < 4; i++) px(g, rnd() * w, rnd() * h, 1, 1, rgb(240, 230, 120)); // tiny flowers
  });
// İç Anadolu steppe: the same pixel grass, dried out. Used for the plateau
// corridors (Sivas/Yozgat) so scenery changes with the region.
const grassDry = () =>
  make(64, 64, (g, w, h) => {
    noiseFill(g, w, h, 150, 138, 88, 14);
    for (let i = 0; i < 150; i++) px(g, rnd() * w, rnd() * h, 1, 2, rgb(rr(150, 178), rr(132, 158), rr(84, 104)));
    for (let i = 0; i < 70; i++) px(g, rnd() * w, rnd() * h, 1, 1, rgb(rr(176, 200), rr(164, 186), rr(112, 132)));
    for (let i = 0; i < 40; i++) px(g, rnd() * w, rnd() * h, 2, 1, rgb(rr(120, 140), rr(108, 126), rr(70, 88)));
  });
const dirt = () =>
  make(64, 64, (g, w, h) => {
    noiseFill(g, w, h, 112, 86, 58, 14);
    for (let i = 0; i < 40; i++) px(g, rnd() * w, rnd() * h, 2, 1, rgb(86, 64, 42));
  });
const gravel = () =>
  make(64, 64, (g, w, h) => {
    noiseFill(g, w, h, 140, 134, 124, 26);
    for (let i = 0; i < 120; i++) px(g, rnd() * w, rnd() * h, 2, 2, rgb(rr(100, 170), rr(95, 160), rr(90, 150)));
  });
const brickTex = () =>
  make(64, 64, (g, w, h) => {
    px(g, 0, 0, w, h, rgb(190, 180, 168));
    for (let r = 0; r < 8; r++) {
      const off = r % 2 ? 8 : 0;
      for (let c = -1; c < 5; c++) {
        const v = rr(-18, 18);
        px(g, c * 16 + off + 1, r * 8 + 1, 15, 7, rgb(168 + v, 84 + v * 0.6, 62 + v * 0.5));
        for (let i = 0; i < 6; i++) px(g, c * 16 + off + 1 + rnd() * 14, r * 8 + 1 + rnd() * 6, 1, 1, rgb(140 + v, 66, 50));
      }
    }
  });
const plasterTex = () =>
  make(32, 32, (g, w, h) => {
    noiseFill(g, w, h, 232, 228, 214, 7);
  });
const flatTex = () =>
  make(16, 16, (g, w, h) => {
    noiseFill(g, w, h, 236, 236, 236, 9);
  });
const rubberTex = () =>
  make(16, 16, (g, w, h) => {
    noiseFill(g, w, h, 34, 34, 36, 7);
  });
const metalTex = () =>
  make(32, 32, (g, w, h) => {
    noiseFill(g, w, h, 150, 154, 160, 8);
    for (let i = 0; i < 10; i++) px(g, rnd() * w, rnd() * h, rr(3, 9), 1, rgb(190, 194, 200));
  });
const woodTex = () =>
  make(32, 32, (g, w, h) => {
    for (let p = 0; p < 4; p++) {
      const v = rr(-14, 14);
      px(g, 0, p * 8, w, 8, rgb(150 + v, 108 + v, 66 + v));
      px(g, 0, p * 8, w, 1, rgb(90, 62, 36));
      for (let i = 0; i < 8; i++) px(g, rnd() * w, p * 8 + 1 + rnd() * 6, rr(3, 10), 1, rgb(128 + v, 90 + v, 52 + v));
    }
  });
const leavesTex = () =>
  make(32, 32, (g, w, h) => {
    noiseFill(g, w, h, 196, 196, 196, 26);
    for (let i = 0; i < 70; i++) px(g, rnd() * w, rnd() * h, 2, 2, rgb(rr(120, 160), rr(120, 160), rr(120, 160)));
    for (let i = 0; i < 50; i++) px(g, rnd() * w, rnd() * h, 2, 1, rgb(240, 240, 240));
  });
const corrugatedTex = () =>
  make(32, 32, (g, w, h) => {
    for (let x = 0; x < w; x++) {
      const m = x % 4;
      const v = [205, 190, 160, 175][m];
      px(g, x, 0, 1, h, rgb(v, v, v - 4));
    }
    for (let i = 0; i < 40; i++) px(g, rnd() * w, rnd() * h, 1, 2, rgb(150, 150, 146));
  });
const dockDoorTex = () =>
  make(32, 32, (g, w, h) => {
    for (let y = 0; y < h; y += 4) {
      px(g, 0, y, w, 3, rgb(205, 207, 212));
      px(g, 0, y + 3, w, 1, rgb(110, 112, 120));
    }
  });
const roofTileTex = () =>
  make(64, 64, (g, w, h) => {
    for (let r = 0; r < 8; r++) {
      const off = r % 2 ? 4 : 0;
      for (let c = -1; c < 9; c++) {
        const v = rr(-16, 16);
        px(g, c * 8 + off, r * 8, 8, 8, rgb(176 + v, 88 + v * 0.5, 62 + v * 0.4));
        px(g, c * 8 + off, r * 8 + 7, 8, 1, rgb(110, 50, 38));
        px(g, c * 8 + off, r * 8, 1, 8, rgb(130, 62, 44));
      }
    }
  });
const roofFlatTex = () =>
  make(32, 32, (g, w, h) => {
    noiseFill(g, w, h, 118, 118, 116, 14);
  });
const roofMetalTex = () =>
  make(32, 32, (g, w, h) => {
    for (let x = 0; x < w; x++) px(g, x, 0, 1, h, x % 8 < 2 ? rgb(190, 194, 198) : rgb(150, 156, 162));
  });
const hazardTex = () =>
  make(32, 32, (g, w, h) => {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) px(g, x, y, 1, 1, (x + y) % 16 < 8 ? rgb(240, 200, 20) : rgb(30, 30, 30));
  });
const cardboardTex = () =>
  make(32, 32, (g, w, h) => {
    noiseFill(g, w, h, 196, 152, 100, 8);
    px(g, 0, 0, w, 1, rgb(150, 112, 70));
    px(g, 0, h - 1, w, 1, rgb(150, 112, 70));
    px(g, 0, 14, w, 4, rgb(224, 200, 150));
    px(g, 4, 22, 10, 5, rgb(236, 236, 230));
    px(g, 6, 24, 6, 1, rgb(60, 60, 60));
  });
const crateTex = () =>
  make(32, 32, (g, w, h) => {
    px(g, 0, 0, w, h, rgb(160, 118, 72));
    for (let y = 0; y < h; y += 8) px(g, 0, y, w, 1, rgb(100, 70, 40));
    px(g, 0, 0, w, 3, rgb(120, 86, 50));
    px(g, 0, h - 3, w, 3, rgb(120, 86, 50));
    px(g, 0, 0, 3, h, rgb(120, 86, 50));
    px(g, w - 3, 0, 3, h, rgb(120, 86, 50));
    for (let i = 0; i < 20; i++) px(g, rnd() * w, rnd() * h, 3, 1, rgb(140, 100, 60));
  });
const fabricTex = () =>
  make(16, 16, (g, w, h) => {
    noiseFill(g, w, h, 82, 88, 100, 10);
    for (let y = 0; y < h; y += 2) px(g, 0, y, w, 1, rgb(72, 78, 90));
  });
const dashTex = () =>
  make(32, 32, (g, w, h) => {
    noiseFill(g, w, h, 58, 60, 64, 9);
    for (let i = 0; i < 60; i++) px(g, rnd() * w, rnd() * h, 1, 1, rgb(80, 82, 86));
  });
const treadTex = () =>
  make(32, 16, (g, w, h) => {
    noiseFill(g, w, h, 28, 28, 30, 6);
    for (let x = 0; x < w; x += 4) px(g, x, 0, 2, h, rgb(52, 52, 55));
  });
const waterTex = () =>
  make(64, 64, (g, w, h) => {
    noiseFill(g, w, h, 52, 104, 142, 8);
    for (let i = 0; i < 50; i++) px(g, rnd() * w, rnd() * h, rr(3, 10), 1, rgb(rr(110, 150), rr(160, 190), rr(190, 220)));
  });
const fieldTex = (a: [number, number, number], b: [number, number, number]) =>
  make(64, 64, (g, w, h) => {
    for (let y = 0; y < h; y++) {
      const c = Math.floor(y / 4) % 2 ? a : b;
      for (let x = 0; x < w; x++) {
        const n = (rnd() - 0.5) * 18;
        px(g, x, y, 1, 1, rgb(c[0] + n, c[1] + n, c[2] + n * 0.5));
      }
    }
  });

const fenceTex = () =>
  make(16, 16, (g) => {
    g.clearRect(0, 0, 16, 16);
    g.fillStyle = '#9aa0a8';
    for (let i = 0; i < 16; i++) {
      g.fillRect(i, i, 1, 1);
      g.fillRect(15 - i, i, 1, 1);
    }
  });

/* ---------------------------- facades (with night maps) ---------------------------- */
function facade(style: 'plaster' | 'brick' | 'concrete', lit: number) {
  const W = 160, H = 120;
  const [c, g] = canvas(W, H);
  const [ec, eg] = canvas(W, H);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, W, H);
  if (style === 'brick') {
    px(g, 0, 0, W, H, rgb(190, 180, 168));
    for (let r = 0; r < H / 6; r++) {
      const off = r % 2 ? 6 : 0;
      for (let cc = -1; cc < W / 12 + 1; cc++) {
        const v = rr(-14, 14);
        px(g, cc * 12 + off + 1, r * 6 + 1, 11, 5, rgb(176 + v, 92 + v * 0.6, 68 + v * 0.5));
      }
    }
  } else if (style === 'concrete') {
    noiseFill(g, W, H, 176, 176, 172, 8);
    for (let y = 0; y < H; y += 40) px(g, 0, y, W, 1, rgb(130, 130, 126));
    for (let x = 0; x < W; x += 40) px(g, x, 0, 1, H, rgb(150, 150, 146));
  } else {
    noiseFill(g, W, H, 238, 234, 220, 6);
  }
  const warm = ['#ffd68a', '#ffe6aa', '#ffc870', '#cfe6ff'];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 4; col++) {
      const x = col * 40 + 10, y = row * 40 + 7;
      // sill + lintel
      px(g, x - 2, y + 26, 24, 3, rgb(150, 146, 138));
      px(g, x - 1, y - 2, 22, 2, rgb(160, 156, 148));
      // frame
      px(g, x, y, 20, 26, rgb(236, 236, 232));
      // glass gradient
      for (let i = 0; i < 22; i++) {
        const t = i / 22;
        px(g, x + 2, y + 2 + i, 16, 1, rgb(38 + t * 40, 66 + t * 50, 104 + t * 50));
      }
      px(g, x + 4, y + 4, 2, 2, rgb(180, 210, 240));
      px(g, x + 6, y + 6, 2, 1, rgb(160, 195, 230));
      // mullion
      px(g, x + 9, y + 2, 2, 22, rgb(236, 236, 232));
      px(g, x + 2, y + 12, 16, 1, rgb(236, 236, 232));
      // interior light
      if (rnd() < lit) {
        eg.fillStyle = pick(warm);
        eg.fillRect(x + 2, y + 2, 7, 10);
        eg.fillRect(x + 11, y + 2, 7, 10);
        eg.globalAlpha = 0.65;
        eg.fillRect(x + 2, y + 13, 7, 11);
        eg.fillRect(x + 11, y + 13, 7, 11);
        eg.globalAlpha = 1;
      }
    }
  return { map: toTex(c), emi: toTex(ec) };
}
function shopfront() {
  const W = 160, H = 40;
  const [c, g] = canvas(W, H);
  const [ec, eg] = canvas(W, H);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, W, H);
  noiseFill(g, W, H, 200, 196, 188, 6);
  for (let i = 0; i < 3; i++) {
    const x = 6 + i * 50, w = i === 2 ? 40 : 42;
    px(g, x - 1, 6, w + 2, 30, rgb(60, 60, 64));
    for (let k = 0; k < 28; k++) px(g, x, 7 + k, w, 1, rgb(54 + k, 84 + k * 1.2, 120 + k));
    px(g, x + 3, 10, 3, 6, rgb(190, 220, 245));
    px(g, x + w / 2, 7, 1, 28, rgb(60, 60, 64));
    eg.fillStyle = i === 2 ? '#ffe2a0' : '#ffd890';
    eg.fillRect(x, 7, w, 28);
  }
  px(g, 0, 36, W, 4, rgb(110, 106, 100));
  return { map: toTex(c), emi: toTex(ec) };
}

/* --------------------------------- text/sign textures --------------------------------- */
export function signTex(kind: string, text = ''): THREE.CanvasTexture {
  if (kind === 'dir' || kind === 'local' || kind === 'shop' || kind === 'tourism' || kind === 'route') {
    const [c, g] = canvas(256, 96);
    const light = kind === 'local';
    g.fillStyle = kind === 'route' ? '#155b91' : light ? '#f4f0e5' : kind === 'tourism' ? '#704d32' : kind === 'shop' ? '#b63027' : '#16599b';
    g.fillRect(0, 0, 256, 96);
    g.strokeStyle = light ? '#27313a' : '#f8f4df'; g.lineWidth = 3; g.strokeRect(4, 4, 248, 88);
    g.fillStyle = g.strokeStyle; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = text.split('|');
    const len = Math.max(...lines.map(l => l.length));
    g.font = `bold ${Math.max(12, Math.min(lines.length === 1 ? 29 : 24, Math.floor(230 / (len * 0.64))))}px monospace`;
    lines.forEach((line, i) => g.fillText(line, 128, 48 + (i - (lines.length - 1) / 2) * 31));
    const texture = toTex(c); texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#9aa0a8';
  g.fillRect(0, 0, 64, 64);
  const circle = (r: number, col: string, x = 32, y = 32) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  g.font = 'bold 26px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (kind === 'speed') {
    circle(31, '#d02020');
    circle(23, '#fff');
    g.fillStyle = '#111';
    g.fillText(text, 32, 34);
  } else if (kind === 'stop') {
    g.fillStyle = '#c81818';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      g.lineTo(32 + Math.cos(a) * 31, 32 + Math.sin(a) * 31);
    }
    g.fill();
    g.font = 'bold 18px monospace';
    g.fillStyle = '#fff';
    g.fillText(tr.stop, 32, 33);
  } else if (kind === 'priority') {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(32, 1); g.lineTo(63, 32); g.lineTo(32, 63); g.lineTo(1, 32);
    g.fill();
    g.fillStyle = '#f0b800';
    g.beginPath();
    g.moveTo(32, 8); g.lineTo(56, 32); g.lineTo(32, 56); g.lineTo(8, 32);
    g.fill();
  } else if (kind === 'yield') {
    g.fillStyle = '#d02020';
    g.beginPath();
    g.moveTo(2, 8); g.lineTo(62, 8); g.lineTo(32, 60);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(14, 14); g.lineTo(50, 14); g.lineTo(32, 46);
    g.fill();
    g.fillStyle = '#c01818'; g.font = 'bold 7px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(tr.yield, 32, 30);
  } else if (kind === 'roundabout') {
    circle(31, '#1d5fb8');
    g.strokeStyle = '#fff';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(32, 32, 14, 0.4, Math.PI * 2 - 0.9);
    g.stroke();
    g.fillStyle = '#fff';
    g.fillRect(40, 14, 10, 4);
  } else if (kind === 'fuel') {
    g.fillStyle = '#1d5fb8';
    g.fillRect(2, 2, 60, 60);
    g.fillStyle = '#fff';
    g.fillRect(18, 14, 18, 34);
    g.fillRect(38, 20, 8, 4);
    g.fillRect(44, 20, 3, 20);
    g.fillStyle = '#1d5fb8';
    g.fillRect(22, 18, 10, 8);
  } else if (kind === 'parking') {
    g.fillStyle = '#1d5fb8';
    g.fillRect(2, 2, 60, 60);
    g.fillStyle = '#fff';
    g.font = 'bold 44px monospace';
    g.fillText('P', 32, 34);
  } else if (kind === 'hwy') {
    g.fillStyle = '#1d5fb8';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#fff';
    g.font = 'bold 15px monospace';
    g.fillText('D.100', 32, 22);
    g.fillRect(8, 38, 48, 3);
    g.fillRect(8, 46, 48, 3);
  } else {
    // direction sign (wide, drawn in 64x64 and stretched on a wide plane)
    g.fillStyle = '#1b5eac';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.strokeRect(2, 2, 60, 60);
    g.fillStyle = '#fff';
    const lines = text.split('|');
    const maxLen = Math.max(...lines.map((l) => l.length));
    g.font = `bold ${Math.max(7, Math.min(13, Math.floor(56 / (maxLen * 0.62))))}px monospace`;
    lines.forEach((l, i) => g.fillText(l, 32, 20 + i * 18 + (lines.length === 1 ? 12 : 0)));
  }
  const t = toTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function logoTex(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 48);
  g.fillStyle = '#f4f4f0';
  g.fillRect(0, 0, 128, 48);
  g.fillStyle = '#c8281e';
  g.fillRect(0, 36, 128, 4);
  g.fillStyle = '#1c3f7a';
  g.fillRect(0, 42, 128, 6);
  g.fillStyle = '#1c3f7a';
  g.font = 'bold 22px monospace';
  g.textAlign = 'center';
  g.fillText('NORDHAUL', 64, 20);
  g.font = 'bold 9px monospace';
  g.fillStyle = '#555';
  g.fillText(tr.freight, 64, 32);
  const t = toTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function glowTexture() {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,220,150,1)');
  grd.addColorStop(0.35, 'rgba(255,190,100,0.45)');
  grd.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------ materials ------------------------------------ */
export const M: Record<string, THREE.MeshStandardMaterial> = {};
export const extra: Record<string, any> = {};
const nightMats: { m: THREE.MeshStandardMaterial; k: number }[] = [];
const wetMats: { m: THREE.MeshStandardMaterial; r0: number; w: number }[] = [];

function sm(name: string, map: THREE.Texture | null, o: THREE.MeshStandardMaterialParameters = {}, wet = 0) {
  const m = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.92, metalness: 0, ...o });
  M[name] = m;
  if (wet) wetMats.push({ m, r0: m.roughness, w: wet });
  return m;
}
function night(m: THREE.MeshStandardMaterial, k: number) {
  nightMats.push({ m, k });
}

const labelCache = new Map<string, THREE.MeshStandardMaterial>();
export function labelMaterial(text: string, kind = 'dir') {
  const key = kind + ':' + text;
  let mat = labelCache.get(key);
  if (!mat) {
    const map = signTex(kind, text);
    mat = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff,
      emissiveIntensity: 0, roughness: 0.75, vertexColors: true });
    labelCache.set(key, mat); night(mat, 0.32);
  }
  return mat;
}

let built = false;
export function buildMaterials() {
  if (built) return;
  built = true;
  srand(777);
  /* ------------------------------------------------------------------ */
  /*  DEPTH LAYERING (anti z-fighting).                                  */
  /*  Coplanar ground layers are separated by polygonOffset. `units` is  */
  /*  measured in smallest-resolvable-depth-difference, so it scales     */
  /*  with distance and is the part that actually kills the distant      */
  /*  "texture flashing". Positive = pushed away (loses), negative =     */
  /*  pulled forward (wins). Order, bottom -> top:                       */
  /*    grass(4) < field/yard(1.5) < deck(1.5) < shoulder(0)             */
  /*    < road(-2) < kerb/pavement(-3) < junction(-4.5) < paint(-8)      */
  /* ------------------------------------------------------------------ */
  const po = (f: number) => ({ polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: f });
  sm('grass', grass(), { ...po(4) }, 0.3);
  sm('grassPad', grass(), { ...po(-1) }, 0.3); // grass used ABOVE road (roundabout island, patches)
  sm('grassDry', grassDry(), { ...po(4) }, 0.3); // plateau corridors: dry steppe grass
  sm('dirt', dirt(), {}, 0.4);
  sm('slab', concrete(), { ...po(1.5) }, 0.8);
  sm('pavement', pavement(), { ...po(1.5) }, 0.7);
  sm('deck', concrete(), { ...po(1.5) }, 0.9); // bridge deck: always loses to the road on top
  sm('asphalt', asphalt(), { ...po(-2) }, 1);
  sm('asphaltJunc', asphalt(), { ...po(-4.5) }, 1);
  sm('asphaltLight', asphaltLight(), { ...po(0) }, 1);
  sm('gravel', gravel(), { ...po(0) }, 0.2);
  sm('concrete', concrete(), {}, 0.7);
  sm('kerb', concrete(), { ...po(-3) }, 0.7);
  sm('pavementRaised', pavement(), { ...po(-3) }, 0.7);
  sm('brick', brickTex(), {}, 0.2);
  sm('plaster', plasterTex());
  sm('flat', flatTex(), { roughness: 0.8 });
  sm('rubber', rubberTex(), { roughness: 0.95 });
  sm('metal', metalTex(), { roughness: 0.38, metalness: 0.7 });
  sm('chrome', metalTex(), { roughness: 0.18, metalness: 0.95 });
  sm('wood', woodTex());
  sm('leaves', leavesTex());
  sm('corrugated', corrugatedTex());
  sm('dockDoor', dockDoorTex(), { roughness: 0.6, metalness: 0.3 });
  sm('roofTile', roofTileTex());
  sm('roofFlat', roofFlatTex());
  sm('roofMetal', roofMetalTex(), { roughness: 0.5, metalness: 0.4 });
  sm('hazard', hazardTex());
  sm('cardboard', cardboardTex());
  sm('crate', crateTex());
  sm('fabric', fabricTex());
  sm('dash', dashTex(), { roughness: 0.7 });
  sm('tread', treadTex(), { roughness: 0.95 });
  sm('fieldGreen', fieldTex([86, 148, 54], [64, 120, 42]), { ...po(-0.3) }, 0.3);
  sm('fieldGold', fieldTex([206, 176, 78], [176, 146, 56]), { ...po(-0.3) }, 0.3);
  sm('fieldBrown', fieldTex([104, 74, 48], [84, 58, 38]), { ...po(-0.3) }, 0.4);
  sm('paint', flatTex(), { roughness: 0.45, metalness: 0.25 });
  sm('fence', fenceTex(), { alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6, transparent: false });
  sm('markWhite', null, { roughness: 0.55, ...po(-4) });
  sm('markYellow', null, { roughness: 0.55, ...po(-4) });
  sm('glass', null, { roughness: 0.08, metalness: 0.6, color: 0x2a3d52, vertexColors: false });
  M.glass.vertexColors = true;

  const fp = facade('plaster', 0.4);
  const fb = facade('brick', 0.35);
  const fc = facade('concrete', 0.45);
  const sf = shopfront();
  for (const [n, f, k] of [['facPlaster', fp, 1.5], ['facBrick', fb, 1.5], ['facConcrete', fc, 1.6]] as const) {
    const m = sm(n, f.map, { emissive: 0xffffff, emissiveMap: f.emi, emissiveIntensity: 0 });
    night(m, k);
  }
  const shopM = sm('shopfront', sf.map, { emissive: 0xffffff, emissiveMap: sf.emi, emissiveIntensity: 0 });
  night(shopM, 1.3);

  // emissive-capable surfaces
  const bulb = sm('bulb', null, { emissive: 0xffd89a, emissiveIntensity: 0.2, color: 0xffffff });
  night(bulb, 5);
  const head = sm('carHead', null, { emissive: 0xfff2cc, emissiveIntensity: 0.1, color: 0xffffff });
  night(head, 4);
  const tail = sm('carTail', null, { emissive: 0xff2010, emissiveIntensity: 0.3, color: 0x881010 });
  night(tail, 1.4);
  const signal = sm('amber', null, { emissive: 0xffa020, emissiveIntensity: 0.2, color: 0xe08a10 });
  night(signal, 0.5);
  const station = sm('stationLight', null, { emissive: 0xfff4dd, emissiveIntensity: 0.3, color: 0xffffff });
  night(station, 4);
  sm('screen', null, { emissive: 0x66ffcc, emissiveIntensity: 1.0, color: 0x112222 });
  sm('ledGreen', null, { emissive: 0x30ff60, emissiveIntensity: 1.0, color: 0x103018 });
  sm('ledRed', null, { emissive: 0xff2820, emissiveIntensity: 1.0, color: 0x301010 });
  sm('ledAmber', null, { emissive: 0xffa020, emissiveIntensity: 1.0, color: 0x302008 });

  // traffic lights (groups A and B), 3 lamps each
  for (const g of ['A', 'B'])
    for (const [c, col] of [['r', 0xff2a20], ['y', 0xffb020], ['g', 0x30ff70]] as const) {
      const m = sm(`tl${g}${c}`, null, { emissive: col, emissiveIntensity: 0, color: 0x1a1a1a });
      m.userData.col = col;
    }

  // signs
  sm('sign50', signTex('speed', '50'), { roughness: 0.5, metalness: 0.2 });
  sm('sign70', signTex('speed', '70'), { roughness: 0.5, metalness: 0.2 });
  sm('sign90', signTex('speed', '90'), { roughness: 0.5, metalness: 0.2 });
  sm('signStop', signTex('stop'), { roughness: 0.5, metalness: 0.2 });
  sm('signPriority', signTex('priority'), { roughness: 0.5, metalness: 0.2 });
  sm('signYield', signTex('yield'), { roughness: 0.5, metalness: 0.2 });
  sm('signRound', signTex('roundabout'), { roughness: 0.5, metalness: 0.2 });
  sm('signFuel', signTex('fuel'), { roughness: 0.5, metalness: 0.2, emissive: 0xffffff, emissiveIntensity: 0 });
  night(M.signFuel, 0.6);
  M.signFuel.emissiveMap = M.signFuel.map;
  sm('signP', signTex('parking'), { roughness: 0.5, metalness: 0.2 });
  sm('signHwy', signTex('hwy'), { roughness: 0.5, metalness: 0.2 });
  for (const [k, t] of [
    ['dirTown', tr.dirTown],
    ['dirInd', tr.dirInd],
    ['dirVillage', tr.dirVillage],
    ['dirRest', tr.dirRest],
    ['dirFuel', tr.dirFuel],
    ['dirDepot', tr.dirDepot],
  ] as const)
    sm(k, signTex('dir', t), { roughness: 0.5, metalness: 0.2 });
  sm('logo', logoTex(), { roughness: 0.4, metalness: 0.2 });
  const flag = make(96, 64, (g, w, h) => {
    g.fillStyle = '#d4272c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(37, 32, 18, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d4272c'; g.beginPath(); g.arc(43, 30, 14, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 4 : 10; g.lineTo(62 + Math.cos(a) * r, 31 + Math.sin(a) * r); }
    g.closePath(); g.fill();
  });
  flag.wrapS = flag.wrapT = THREE.ClampToEdgeWrapping;
  sm('turkishFlag', flag, { side: THREE.DoubleSide, roughness: 1 });

  // non-batched specials
  const water = waterTex();
  water.repeat.set(1, 1);
  extra.water = water;
  extra.waterMat = new THREE.MeshStandardMaterial({
    map: water, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.88, color: 0xbbd6e8,
  });
  extra.glowTex = glowTexture();
  extra.glowMat = new THREE.MeshBasicMaterial({
    map: extra.glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5,
  });
  extra.tireMat = new THREE.MeshStandardMaterial({ map: treadTex(), color: 0xffffff, roughness: 0.95 });
  extra.cabGlass = new THREE.MeshStandardMaterial({
    color: 0x9eb6bd, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.FrontSide,
  });
  extra.tlLights = ['A', 'B'].flatMap((g) => ['r', 'y', 'g'].map((c) => M[`tl${g}${c}`]));
}

/** Updates all environment-reactive materials (night windows, wet roads...). */
export function updateMaterials(nightF: number, rain: number, time: number) {
  for (const n of nightMats) n.m.emissiveIntensity = n.k * nightF + (n.m === M.bulb ? 0.2 : 0);
  for (const w of wetMats) {
    w.m.roughness = THREE.MathUtils.lerp(w.r0, 0.18, rain * w.w);
    const k = 1 - 0.34 * rain * w.w;
    w.m.color.setScalar(k);
  }
  (extra.glowMat as THREE.MeshBasicMaterial).opacity = Math.min(1, nightF * 0.85);
  extra.water.offset.y = (time * 0.012) % 1;
  extra.water.offset.x = (time * 0.004) % 1;
}

/** Traffic light state: returns [A state, B state] 0=green 1=yellow 2=red */
export function trafficPhase(t: number): [number, number] {
  const c = t % 28;
  const a = c < 10 ? 0 : c < 12 ? 1 : 2;
  const b = c >= 14 && c < 24 ? 0 : c >= 24 && c < 26 ? 1 : 2;
  return [a, b];
}
export function updateTrafficLightMats(t: number) {
  const st = trafficPhase(t);
  ['A', 'B'].forEach((g, i) => {
    ['g', 'y', 'r'].forEach((c, k) => {
      const m = M[`tl${g}${c}`];
      m.emissiveIntensity = st[i] === k ? 2.4 : 0.03;
    });
  });
}
