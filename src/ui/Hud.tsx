import { useUI } from '../game/store';
import { game } from '../game/Game';
import { MiniMap } from './MapView';
import { RainOverlay } from './RainOverlay';
import { tr, t, money, number, distance, dur, eventName } from '../game/i18n';
import { PROVINCE_BY_ID } from '../game/regions';

export const eur = money;
const hh = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

function Key({ k }: { k: string }) {
  return <span className="key">{k}</span>;
}

export function Hud() {
  const s = useUI();
  if (!s.started || s.loading) return null;
  const now = performance.now();
  const toasts = s.toasts.filter((t: any) => now - t.t < 5200);
  const job = s.job;
  const fuelPct = (s.fuel / s.fuelCap) * 100;
  const low = fuelPct < 15;
  const loc = job ? game.world.locations[s.phase === 'toPickup' || s.phase === 'loading' ? job.from : job.to] : null;
  const toneCol: Record<string, string> = { info: '#9fc4ff', good: '#44e08c', bad: '#ff5242', warn: '#ffb030' };
  const park = s.parking;
  const parkCol = park ? (park.inZone ? '#44e08c' : park.score > 40 ? '#ffb030' : '#ff5242') : '#fff';

  return (
    <div className="px" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontSize: 22 }}>
      <RainOverlay />

      {/* top-left: money / level */}
      <div className="hud-left" style={{ position: 'absolute', left: 14, top: 12, width: 250 }}>
        <div className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 30, color: '#9dffc0' }}>{eur(s.money)}</span>
          <span style={{ color: '#ffb030' }}>{tr.level} {number(s.level)}</span>
        </div>
        <div className="bar" style={{ marginTop: 4 }}><i style={{ width: `${(s.xp / s.xpNext) * 100}%`, background: '#5aa8ff' }} /></div>
        <div className="dim" style={{ fontSize: 17 }}>{tr.xp} {number(s.xp)} / {number(s.xpNext)}</div>

        {job && (
          <div className="panel amber" style={{ marginTop: 8, lineHeight: 1.05 }}>
            <div style={{ color: '#ffb030', fontSize: 20 }}>{s.phase === 'toPickup' || s.phase === 'loading' ? tr.pickup : tr.delivery}</div>
            <div className="dim" style={{ fontSize: 16 }}>{tr.cargo}</div>
            <div>{job.cargoName} · {number(job.weight / 1000, 1)} t</div>
            <div className="dim" style={{ fontSize: 16, marginTop: 3 }}>{s.phase === 'toPickup' ? tr.pickupAt : tr.destination}</div>
            <div>{loc?.name}</div>
            <div className="dim" style={{ fontSize: 17 }}>{PROVINCE_BY_ID[game.world.locations[job.from].provinceId || 'amasya']?.displayName} &rarr; {PROVINCE_BY_ID[game.world.locations[job.to].provinceId || 'amasya']?.displayName}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
              <span><span className="dim" style={{ fontSize: 16 }}>{tr.distance} </span>{distance(s.distRemain)}</span>
              <span style={{ color: '#9dffc0' }}>{eur(job.reward)}</span>
            </div>
            {s.deadlineTotalMin > 0 && (
              <div style={{ marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17 }}>
                  <span className="dim">{tr.timeLeft}</span>
                  <span style={{ color: s.deadlineMin <= 0 ? '#ff8a70' : s.deadlineMin < s.deadlineTotalMin * 0.25 ? '#ffb030' : '#9dffc0' }}>
                    {s.deadlineMin > 0 ? dur(s.deadlineMin) : t('lateFor', { n: number(-s.deadlineMin) })}
                  </span>
                </div>
                <div className="bar" style={{ marginTop: 2 }}>
                  <i style={{ width: `${Math.max(0, Math.min(100, (s.deadlineMin / s.deadlineTotalMin) * 100))}%`,
                    background: s.deadlineMin <= 0 ? '#c23028' : s.deadlineMin < s.deadlineTotalMin * 0.25 ? '#ffb030' : '#40c878' }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* top-center objective */}
      <div className="hud-objective" style={{ position: 'absolute', left: '50%', top: 12, transform: 'translateX(-50%)', textAlign: 'center' }}>
        <div className="panel" style={{ padding: '3px 16px', fontSize: 22, maxWidth: '46vw' }}>
          {s.objective}
        </div>
        {s.job && (s.navInstruction || s.etaText) && (
          <div className="panel" style={{ marginTop: 5, fontSize: 18, display: 'inline-flex', gap: 8, alignItems: 'center', background: 'rgba(8,13,21,0.9)' }}>
            {s.navShield && <span style={{ background: '#155b91', color: '#fff', padding: '0 5px', fontSize: 16 }}>{s.navShield}</span>}
            <span style={{ color: s.navDir === 'arrive' ? '#9dffc0' : '#ffb030' }}>{s.navInstruction}</span>
            {s.etaText && <span className="dim" style={{ fontSize: 16 }}>{tr.eta} {s.etaText}</span>}
          </div>
        )}
        {s.netOn && (
          <div className="panel" style={{ marginTop: 5, fontSize: 16, display: 'inline-flex', gap: 10, alignItems: 'center', background: 'rgba(8,13,21,0.9)' }}>
            <span style={{ color: s.convoyCount > 1 ? '#9dffc0' : '#7f8ea3' }}>{tr.convoy}</span>
            <span>{s.convoyCount}/4</span>
            {s.convoy?.length ? s.convoy.map((c: any) => (
              <span key={c.name} className="dim">
                {c.name} {c.dist < 900 ? `${Math.round(c.dist)} m` : `${(c.dist / 1000).toFixed(1)} km`}
                {c.cargo ? <span style={{ color: '#ffb030' }}> · {c.cargo}</span> : null}
              </span>
            )) : <span className="dim">{tr.convoyAlone}</span>}
          </div>
        )}
        {s.parkHint && <div className="panel amber blink" style={{ marginTop: 6, fontSize: 20 }}>{s.parkHint}</div>}
      </div>

      {/* top-right: minimap */}
      <div className="hud-nav" style={{ position: 'absolute', right: 14, top: 12, textAlign: 'right' }}>
        <MiniMap />
        <div className="panel" style={{ marginTop: 4, display: 'flex', gap: 10, justifyContent: 'space-between', fontSize: 20 }}>
          <span>{hh(s.hour)}</span>
          <span style={{ color: s.weather === 'rain' ? '#7fb4ff' : '#ffd070' }}>{s.weather === 'rain' ? tr.rain : tr.clear}</span>
          <span className="dim">{s.mode === 'foot' ? tr.foot : tr[s.cam as 'cab' | 'chase' | 'far']}</span>
        </div>
        <div className="dim" style={{ fontSize: 18, marginTop: 2, textShadow: '2px 2px 0 #000' }}>{s.region}</div>
      </div>

      {/* toasts */}
      <div style={{ position: 'absolute', left: 14, top: '46%', width: 340, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {toasts.map((t: any) => (
          <div key={t.id} className="panel toast" style={{ borderColor: toneCol[t.kind], fontSize: 20, lineHeight: 1.05 }}>{t.text}</div>
        ))}
      </div>

      {/* bottom-left: speed/gear/fuel/damage */}
      {s.mode === 'cab' && (
        <div className="panel" style={{ position: 'absolute', left: 14, bottom: 14, width: 300 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <span className="big-num">{Math.round(s.speed)}</span>
              <span className="dim" style={{ marginLeft: 6 }}>{tr.speedUnit}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 40, color: s.gear === 'R' ? '#ff8a60' : '#9dffc0', lineHeight: 0.9 }}>{s.gear}</div>
              {s.speedLimit > 0 && (
                <div className={s.overLimit ? 'blink' : ''} style={{ marginTop: 4, display: 'inline-block', width: 38, height: 38, borderRadius: 19, border: `4px solid ${s.overLimit ? '#ff2a18' : '#e03020'}`, background: s.overLimit ? '#ffd8d0' : '#fff', color: '#111', fontSize: 22, lineHeight: '30px', textAlign: 'center' }}>{s.speedLimit}</div>
              )}
            </div>
          </div>
          <div className="bar tall" style={{ marginTop: 4 }}><i style={{ width: `${Math.min(100, ((s.rpm - 600) / 1700) * 100)}%`, background: s.rpm > 2000 ? '#ff5242' : '#ffb030' }} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span className={low ? 'blink' : ''} style={{ color: low ? '#ff5242' : '#9fc4ff' }}>{tr.fuel} {number(s.fuel)} L</span>
            <span style={{ color: s.damage > 50 ? '#ff5242' : '#ffd070' }}>{tr.damage}: %{s.damage}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, color: '#8aa0c0', marginTop: 3 }}>
            <span>{tr.odometer} {number(s.distanceKm || 0, 1)}</span>
            {s.job && s.distRemain > 0 && <span className="dim">{tr.remaining}: {number(s.distRemain / 1000, 1)} km</span>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div className="bar" style={{ flex: 1 }}><i style={{ width: `${fuelPct}%`, background: low ? '#ff5242' : '#44e08c' }} /></div>
            <div className="bar" style={{ flex: 1 }}><i style={{ width: `${s.damage}%`, background: s.damage > 50 ? '#ff5242' : '#ffb030' }} /></div>
          </div>
          <div style={{ marginTop: 4, fontSize: 17, display: 'flex', gap: 10, color: '#8aa0c0' }}>
            {s.handbrake && <span style={{ color: '#ff5242' }}>(P) {tr.handbrake}</span>}
            {s.headlights && <span style={{ color: '#6ab0ff' }}>{tr.lights}</span>}
            {s.indicator !== 0 && <span className="blink" style={{ color: '#44e08c' }}>{s.indicator === -1 ? '◄' : s.indicator === 1 ? '►' : '◄ ►'}</span>}
          </div>
        </div>
      )}

      {/* parking meter */}
      {park && (
        <div className="panel" style={{ position: 'absolute', left: '50%', bottom: 96, transform: 'translateX(-50%)', width: 320, borderColor: parkCol }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{tr.parking}</span><span style={{ color: parkCol }}>%{park.score}</span>
          </div>
          <div className="bar tall"><i style={{ width: `${park.score}%`, background: parkCol }} /></div>
          <div className="dim" style={{ fontSize: 17, display: 'flex', justifyContent: 'space-between' }}>
            <span>{tr.side} {number(park.lat, 1)} m</span><span>{tr.forward} {number(park.lon, 1)} m</span><span>{tr.angle} {number(park.ang)}°</span>
          </div>
          {park.contact && <div style={{ color: '#ffb030', fontSize: 18 }}>{tr.parkContact}</div>}
        </div>
      )}

      {/* load/unload progress */}
      {(s.phase === 'loading' || s.phase === 'unloading') && (
        <div className="panel amber" style={{ position: 'absolute', left: '50%', bottom: 150, transform: 'translateX(-50%)', width: 340, textAlign: 'center' }}>
          {s.phase === 'loading' ? tr.loadProgress : tr.unloadProgress}
          <div className="bar tall"><i style={{ width: `${s.loadProgress * 100}%`, background: '#ffb030' }} /></div>
        </div>
      )}
      {s.fueling && (
        <div className="panel green blink" style={{ position: 'absolute', left: '50%', bottom: 150, transform: 'translateX(-50%)', width: 300, textAlign: 'center' }}>
          {tr.fueling} {number(s.fuel)} / {number(s.fuelCap)} L
        </div>
      )}

      {/* interaction prompt */}
      {s.prompt && (
        <button type="button" className="panel amber interaction-prompt" onClick={() => game.interact()} style={{ position: 'absolute', left: '50%', bottom: 44, transform: 'translateX(-50%)', fontSize: 26, padding: '4px 18px', pointerEvents: 'auto' }}>
          <Key k={s.promptKey} /> {s.prompt}
        </button>
      )}

      {/* key hints */}
      <div className="dim hud-hints" style={{ position: 'absolute', right: 14, bottom: 10, fontSize: 17, textAlign: 'right', textShadow: '2px 2px 0 #000', lineHeight: 1.05 }}>
        <div>{tr.hintsDrive}</div>
        <div>{tr.hintsSystems}</div>
        {s.mode === 'cab' && s.cam === 'cab' && <div>{tr.hintsCab}</div>}
      </div>

      {/* event feed (F3) */}
      {s.showEvents && (
        <div className="panel" style={{ position: 'absolute', right: 14, top: 290, width: 330, fontSize: 16, lineHeight: 1.05 }}>
          <div style={{ color: '#ffb030' }}>{tr.eventFeed} (F3)</div>
          {s.events.length === 0 && <div className="dim">{tr.noEvents}</div>}
          {s.events.map((e: any, i: number) => (
            <div key={i}><span style={{ color: '#44e08c' }}>{eventName[e.type] || e.type}</span> <span className="dim">{number(e.t)} s</span></div>
          ))}
          <div style={{ marginTop: 6, color: '#ffb030' }}>{tr.diagnostics}</div>
          <div className="dim" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0 8px' }}>
            <span>{tr.fps}</span><span style={{ color: s.perf.fps >= 50 ? '#44e08c' : s.perf.fps >= 30 ? '#ffb030' : '#ff5242' }}>{number(s.perf.fps)} ({number(s.perf.ms, 1)} ms)</span>
            <span>{tr.calls}</span><span>{number(s.perf.calls)}</span>
            <span>{tr.triangles}</span><span>{number(s.perf.tris)}</span>
            <span>{tr.resolution}</span><span>{s.perf.res}</span>
            <span>{tr.gpu}</span><span style={{ fontSize: 13, wordBreak: 'break-all' }}>{s.gpu || tr.unavailable}</span>
            <span>{tr.truck}</span><span>{s.truckId}</span>
          </div>
        </div>
      )}
    </div>
  );
}
