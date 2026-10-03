import { useUI } from '../game/store';
import { streamerState, describeProvider, type StreamerFact } from '../game/streamer';
import { tr } from '../game/i18n';
import { game } from '../game/Game';

/**
 * ALOSKE / ALOSKEGANG overlay.
 *
 * Layout rule: the right-hand column above it belongs to the minimap + navigation
 * strip and the bottom strip belongs to the control hints, so this panel is compact,
 * sits under the nav stack, never duplicates the dispatch panel on the left, and uses
 * an opaque panel fill so nothing shows through it. It is opt-in (F4) and the game is
 * identical with it closed.
 */
const TONE: Record<string, string> = { good: '#9dffc0', bad: '#ff8a70', info: '#9fc4ff' };

const clock = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function Fact({ f }: { f: StreamerFact }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', borderTop: '1px solid #2c3a4c', padding: '2px 0' }}>
      <span style={{ width: 7, height: 7, background: TONE[f.tone], display: 'inline-block', flex: '0 0 auto' }} />
      <span style={{ color: TONE[f.tone], fontSize: 17, lineHeight: 1.05, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.label}</span>
    </div>
  );
}

const FILLED = { background: 'rgba(8,13,21,0.94)' } as const;

export function StreamerOverlay() {
  const s = useUI();
  if (!s.streamerOn || !s.started) return null;
  const snap = streamerState.snapshot;
  const c = snap.counts;
  return (
    <div className="px" style={{ position: 'absolute', right: 14, bottom: 30, width: 336, pointerEvents: 'auto', display: 'grid', gap: 4 }}>
      <div className="panel" style={{ ...FILLED, borderColor: '#c23028', padding: '4px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ color: '#ffb030', fontSize: 19, letterSpacing: 2 }}>ALOSKE</span>
          <span style={{ color: '#e8e8e0', fontSize: 13, letterSpacing: 1, flex: 1 }}>ALOSKEGANG</span>
          <span className="dim" style={{ fontSize: 14 }}>{tr.streamerViewers} <b style={{ color: snap.providerConnected ? '#9dffc0' : '#8b98a8' }}>{snap.viewers}</b></span>
          <span className="dim" style={{ fontSize: 14 }}>{clock(snap.sessionSeconds)}</span>
          <button className="btn" style={{ fontSize: 13, padding: '0 6px' }} onClick={() => game.setStreamer(false)}>{tr.streamerOff}</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px 8px', fontSize: 14, marginTop: 3 }}>
          <span className="dim">{tr.streamerDeliveries} <b style={{ color: '#9dffc0' }}>{c.deliveries}</b></span>
          <span className="dim">{tr.parking} <b style={{ color: '#9dffc0' }}>{c.perfectParks}</b></span>
          <span className="dim">{tr.streamerDiscoveries} <b style={{ color: '#9dffc0' }}>{c.discoveries}</b></span>
          <span className="dim">{tr.streamerCrashes} <b style={{ color: '#ff8a70' }}>{c.crashes + c.accidents}</b></span>
          <span className="dim">{tr.streamerMeets} <b style={{ color: '#ffb030' }}>{c.meets}</b></span>
          <span className="dim">{tr.radar} <b style={{ color: c.speeding ? '#ff8a70' : '#8b98a8' }}>{c.speeding}</b></span>
        </div>
      </div>

      <div className="panel" style={{ ...FILLED, padding: '3px 8px 5px' }}>
        {snap.facts.length === 0 ? <div className="dim" style={{ fontSize: 15, padding: '2px 0' }}>{tr.streamerNoFacts}</div>
          : snap.facts.slice(0, 3).map((f, i) => <Fact key={`${f.time}-${i}`} f={f} />)}
        <div className="dim" style={{ fontSize: 13, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{describeProvider()}</div>
      </div>
    </div>
  );
}
