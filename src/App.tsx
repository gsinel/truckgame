import { useEffect, useRef } from 'react';
import { game } from './game/Game';
import { Hud } from './ui/Hud';
import { StartScreen, JobBoard, MapModal, PauseMenu, Completion } from './ui/Menus';
import { StreamerOverlay } from './ui/StreamerOverlay';

export default function App() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) game.attach(ref.current);
  }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#05080e', overflow: 'hidden' }}>
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
      <Hud />
      <JobBoard />
      <MapModal />
      <PauseMenu />
      <Completion />
      <StreamerOverlay />
      <StartScreen />
    </div>
  );
}
