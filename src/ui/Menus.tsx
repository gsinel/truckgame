import { useMemo } from 'react';
import { useUI } from '../game/store';
import { game } from '../game/Game';
import { FullMap } from './MapView';
import { eur } from './Hud';
import { tr, controls, money, number, distance, upper, gradeName } from '../game/i18n';
import { PROVINCE_BY_ID } from '../game/regions';

const Overlay = ({ children, onClose }: { children: any; onClose?: () => void }) => (
  <div
    className="ui-block px"
    onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    style={{ position: 'absolute', inset: 0, background: 'rgba(3,6,12,0.66)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto', fontSize: 22 }}
  >
    {children}
  </div>
);

/* ------------------------------ title / loading ------------------------------ */
export function StartScreen() {
  const s = useUI();
  if (s.started) return null;
  return (
    <div className="ui-block px start-screen">
      <header className="start-header"><span className="brand-mark" aria-hidden="true">N</span><span>{tr.freight}</span><span className="phase-tag">{tr.phase}</span></header>
      <main className="start-content">
        <div className="start-eyebrow">05 / {upper(tr.amasya)}</div>
        <h1 className="start-brand">{tr.brand}<span>{tr.country}<i aria-hidden="true" /></span></h1>
        <h2 className="start-tagline">{tr.tagline}</h2>
        <p className="start-intro">{tr.intro}</p>
        <div className="start-actions">
          <button className="btn primary start-button" disabled={s.loading} onClick={() => game.start()}>
            {s.loading ? tr.loading : tr.start}<span aria-hidden="true">&rarr;</span>
          </button>
          <details className="controls-disclosure">
            <summary className="btn">{tr.controls}</summary>
            <div className="panel controls-grid">{controls.map(([key, label]) => <div key={key}><kbd className="key">{key}</kbd><span>{label}</span></div>)}</div>
          </details>
        </div>
        <p className="start-help">{s.loading ? s.loadText : tr.desktopNote}</p>
      </main>
      <footer className="start-footer"><span>{tr.scaleNote}</span><span>{tr.brand} / 02</span></footer>
      </div>
  );
}

/* ------------------------------ job board ------------------------------ */
export function JobBoard() {
  const s = useUI();
  const pickupDistances = useMemo(() => {
    if (s.menu !== 'jobs' || !game.ready) return {} as Record<string, number>;
    const result: Record<string, number> = {};
    for (const job of s.jobs) if (result[job.from] === undefined) {
      result[job.from] = game.nav.route({ x: game.sim.x, z: game.sim.z }, game.world.locations[job.from]).length;
    }
    return result;
  }, [s.menu, s.jobs]);
  if (s.menu !== 'jobs') return null;
  const w = game.world;
  const sim = game.sim;
  return (
    <Overlay onClose={() => game.closeMenu()}>
      <div className="panel amber job-board" style={{ width: 'min(1120px, 94vw)', maxHeight: '88vh', overflow: 'auto', padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="h1">{tr.dispatch}</div>
          <button className="btn" onClick={() => game.closeMenu()}>{tr.close} (J)</button>
        </div>
        <div className="dim" style={{ marginBottom: 12 }}>{tr.jobHelp}</div>
        {s.job && (
          <div className="panel green" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><span style={{ color: '#44e08c' }}>{tr.active}:</span> {s.job.title} / {s.job.cargoName} &rarr; {w.locations[s.job.to].name}</div>
            <button className="btn danger" onClick={() => { game.cancelJob(); }}>{tr.cancel}</button>
          </div>
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {s.jobs.map((j: any) => {
            const a = w.locations[j.from], b = w.locations[j.to];
            const dp = pickupDistances[j.from] || 0;
            return (
              <div key={j.id} className="panel job-row">
                <div>
                  <div style={{ color: '#ffb030', fontSize: 26 }}>{upper(j.title)}</div>
                  <div className="dim" style={{ fontSize: 17 }}>{j.blurb}</div>
                </div>
                <div style={{ fontSize: 19, lineHeight: 1.05 }}>
                  <div><span className="dim">{tr.cargo} </span>{j.cargoName}</div>
                  <div><span className="dim">{tr.origin} </span>{a.name}</div>
                  <div><span className="dim">{tr.destination} </span>{b.name}</div>
                  <div className="job-region-route">{PROVINCE_BY_ID[a.provinceId || 'amasya']?.displayName} &rarr; {PROVINCE_BY_ID[b.provinceId || 'amasya']?.displayName}</div>
                </div>
                <div style={{ fontSize: 19, lineHeight: 1.05 }}>
                  <div><span className="dim">{tr.weight} </span>{number(j.weight / 1000, 1)} t</div>
                  <div><span className="dim">{tr.distance} </span>{distance(j.km * 1000)}</div>
                  <div><span className="dim">{tr.pickupDistance} </span>{distance(dp)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#9dffc0', fontSize: 30 }}>{eur(j.reward)}</div>
                  <div style={{ color: '#7fb4ff' }}>+{number(j.xp)} {tr.xp}</div>
                </div>
                <button className="btn primary" disabled={!!s.job} onClick={() => game.acceptJob(j.id)}>{tr.accept}</button>
              </div>
            );
          })}
        </div>
      </div>
    </Overlay>
  );
}

/* ------------------------------ full map ------------------------------ */
export function MapModal() {
  const s = useUI();
  if (s.menu !== 'map') return null;
  return (
    <Overlay onClose={() => game.closeMenu()}>
      <div style={{ textAlign: 'center' }}>
        <div className="h1" style={{ marginBottom: 6 }}>{tr.map} / {upper(s.region)}</div>
        <FullMap />
        <div className="dim" style={{ marginTop: 6 }}>
          <span style={{ color: '#ff3a2a' }}>▲</span> {tr.you} · <span style={{ color: '#4aa0ff' }}>━</span> {tr.route} · <span style={{ color: '#44e08c' }}>●</span> {tr.destination} · <span style={{ color: '#ffb030' }}>■</span> {tr.jobSites}
        </div>
        <div className="dim" style={{ fontSize: 17, marginTop: 4 }}>
          <span style={{ color: '#66b4df' }}>■ {tr.fuelStation}</span> · <span style={{ color: '#eb7956' }}>■ {tr.service}</span> · <span style={{ color: '#ece2aa' }}>■ {tr.restSign}</span>
        </div>
        {s.navTarget && <div style={{ fontSize: 20, color: '#a6ddaa', marginTop: 4 }}>{tr.destination}: {s.navTarget} / {distance(s.distRemain)}</div>}
        <div className="dim" style={{ fontSize: 17 }}>{tr.scaleNote} / {tr.mapClose}</div>
        <button className="btn" style={{ marginTop: 8 }} onClick={() => game.closeMenu()}>{tr.close} (M)</button>
      </div>
    </Overlay>
  );
}

/* ------------------------------ pause / settings ------------------------------ */
export function PauseMenu() {
  const s = useUI();
  if (s.menu !== 'pause') return null;
  return (
    <Overlay onClose={() => game.closeMenu()}>
      <div className="panel" style={{ width: 'min(620px, 94vw)', padding: 16 }}>
        <div className="h1">{tr.paused}</div>
        <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          <div><span className="dim">{tr.weather} </span>
            <button className={'btn ' + (s.weather === 'clear' ? 'on' : '')} onClick={() => game.setWeather('clear')}>{tr.clear}</button>{' '}
            <button className={'btn ' + (s.weather === 'rain' ? 'on' : '')} onClick={() => game.setWeather('rain')}>{tr.rain}</button>{' '}
            <button className={'btn ' + (s.autoWeather ? 'on' : '')} onClick={() => game.setAutoWeather(!s.autoWeather)}>{tr.auto}</button>
          </div>
          <div><span className="dim">{tr.time} </span>{String(Math.floor(s.hour)).padStart(2, '0')}:{String(Math.floor((s.hour % 1) * 60)).padStart(2, '0')}
            <div><input aria-label={tr.time} type="range" min={0} max={23.9} step={0.1} value={s.hour} onChange={(e) => game.setHour(parseFloat(e.target.value))} /></div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {[['06:30', 6.5], ['12:00', 12], ['18:00', 18], ['21:30', 21.5], ['00:00', 0]].map(([l, h]: any) => <button key={l} className="btn" style={{ fontSize: 18 }} onClick={() => game.setHour(h)}>{l}</button>)}
            </div>
          </div>
          <div><span className="dim">{tr.clockSpeed} </span>
            {[[tr.frozen, 0], ['1×', 1], ['5×', 5], ['20×', 20]].map(([l, v]: any) => <button key={l} className={'btn ' + (s.timeScale === v ? 'on' : '')} style={{ marginRight: 6, fontSize: 18 }} onClick={() => game.setTimeScale(v)}>{l}</button>)}
          </div>
          <div><span className="dim">{tr.pixelSize} </span>
            {[[tr.fine, 1.5], [tr.normal, 2], [tr.chunky, 3]].map(([l, v]: any) => <button key={l} className={'btn ' + (s.pixel === v ? 'on' : '')} style={{ marginRight: 6, fontSize: 18 }} onClick={() => game.setPixel(v)}>{l}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" disabled={s.mode !== 'cab'} onClick={() => { game.closeMenu(); game.recover(false); }}>{tr.recovery} ({money(250)})</button>
            <button className="btn" onClick={() => game.toggleMute()}>{game.audio.muted ? tr.soundOff : tr.soundOn}</button>
            <button className="btn" onClick={() => { game.closeMenu(); game.openMenu('jobs'); }}>{tr.jobs}</button>
            <button className="btn" onClick={() => { s.showEvents = !s.showEvents; game.closeMenu(); }}>{tr.diagnostics} (F3)</button>
          </div>
          <button className="btn primary" style={{ fontSize: 28 }} onClick={() => game.closeMenu()}>{tr.resume}</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ------------------------------ delivery complete ------------------------------ */
export function Completion() {
  const s = useUI();
  const c = s.completion;
  if (!c) return null;
  const col = c.grade === 'PERFECT' ? '#44e08c' : c.grade === 'GOOD' ? '#9dffc0' : c.grade === 'OK' ? '#ffb030' : '#ff5242';
  return (
    <Overlay onClose={() => game.dismissCompletion()}>
      <div className="panel green pop" style={{ width: 'min(560px, 92vw)', padding: 18, textAlign: 'center' }}>
        <div className="h1" style={{ fontSize: 44 }}>{tr.completed}</div>
        <div className="dim">{c.cargoName} → {c.to}</div>
        <div style={{ fontSize: 66, color: '#9dffc0', margin: '6px 0 0', textShadow: '3px 3px 0 #000' }}>+{eur(c.money)}</div>
        <div style={{ fontSize: 40, color: '#7fb4ff', textShadow: '3px 3px 0 #000' }}>+{number(c.xp)} {tr.xp}</div>
        <div className="panel" style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, fontSize: 21, textAlign: 'left' }}>
          <span className="dim">{tr.parking}</span><span style={{ color: col }}>{gradeName(c.grade)} · %{c.score}</span>
          <span className="dim">{tr.basePay}</span><span>{eur(c.base)}</span>
          <span className="dim">{tr.cargoDamage}</span><span>{c.damage > 0 ? `%${c.damage} (%${c.penalty} ${tr.payPenalty})` : tr.none}</span>
          <span className="dim">{tr.manoeuvre}</span><span>{c.contact ? tr.contact : tr.clean}</span>
        </div>
        <button className="btn primary" style={{ marginTop: 12, fontSize: 28 }} onClick={() => game.dismissCompletion()}>{tr.continue}</button>
      </div>
    </Overlay>
  );
}
