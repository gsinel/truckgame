import { useEffect, useRef } from 'react';
import { game } from '../game/Game';
import { ui } from '../game/store';

interface Drop { x: number; y: number; r: number; v: number; a: number }

/** Rain on the windshield: droplets on a low-res canvas, wiped by the synchronised wiper blades. */
export function RainOverlay() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const g = cv.getContext('2d')!;
    const W = 480, H = 270;
    cv.width = W; cv.height = H;
    const drops: Drop[] = [];
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      g.clearRect(0, 0, W, H);
      if (!game.ready) return;
      const visible = ui.mode === 'cab' && ui.cam === 'cab';
      const rain = game.atm.rain;
      if (!visible) { drops.length = 0; return; }
      if (rain > 0.05 && ui.started) {
        const n = rain * dt * 130;
        for (let i = 0; i < n + (Math.random() < n % 1 ? 1 : 0); i++)
          drops.push({ x: Math.random() * W, y: Math.random() * H * 0.95, r: 1 + Math.random() * 2.6, v: 0, a: 0.6 + Math.random() * 0.4 });
        if (drops.length > 650) drops.splice(0, drops.length - 650);
      }
      const tr = game.truck;
      const wipe = tr.wiperActive || tr.wiperPhase > 0;
      const ph = tr.wiperPhase;
      const ang = ph < 0.5 ? ph * 2 : 2 - ph * 2;
      const bandX = (0.05 + 0.9 * Math.sin(ang * Math.PI * 0.5)) * W;
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        if (d.r > 2.2) { d.v += dt * 6 * (d.r - 2); d.y += d.v * dt * 6; }
        if (d.y > H) { drops.splice(i, 1); continue; }
        if (wipe && Math.abs(d.x - bandX) < 22 && d.y > H * 0.12) { drops.splice(i, 1); continue; }
        // drop body
        g.globalAlpha = d.a * 0.55;
        g.fillStyle = '#9fb6c8';
        g.fillRect(Math.round(d.x), Math.round(d.y), Math.ceil(d.r), Math.ceil(d.r * 1.15));
        g.globalAlpha = d.a * 0.9;
        g.fillStyle = '#ffffff';
        g.fillRect(Math.round(d.x), Math.round(d.y), 1, 1);
        g.globalAlpha = d.a * 0.35;
        g.fillStyle = '#1a2430';
        g.fillRect(Math.round(d.x), Math.round(d.y + d.r), Math.ceil(d.r), 1);
      }
      g.globalAlpha = 1;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="pixel" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', imageRendering: 'pixelated' }} />;
}
