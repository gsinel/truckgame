import * as THREE from 'three';
import { bus } from './events';
import { ui, notify, toast } from './store';
import { updateLOD, auditCoplanar } from './batch';
import { buildWorld, World } from './world';
import { TruckModel, TRUCK, TruckVisualState } from './truckModel';
import { TruckSim } from './physics';
import { Traffic } from './traffic';
import { Atmosphere, PostFX } from './atmosphere';
import { Navigator } from './nav';
import { Missions, loadProfile, addMoney, addXP, saveProfile } from './missions';
import { GameAudio } from './audio';
import { streamerState, streamerAdapter, MockStreamerProvider, KickStreamerProvider, type StreamerProvider } from './streamer';
import { ALOSKEGANG } from './aloskegang';
import { Convoy, BroadcastConvoyTransport, type ConvoyJobOffer } from './net';
import { writeSession, readSession, clearSession, peekSession, SESSION_WORLD, type SessionSave } from './session';
import { inWater, WORLD } from './terrain';
import { extra } from './textures';
import { tr as text, t, money, number, distance, dur } from './i18n';

/** hh:mm from a fractional hour (the ETA readout uses the same clock as the cluster) */
function clockAt(h: number) {
  const norm = ((h % 24) + 24) % 24;
  return `${String(Math.floor(norm)).padStart(2, '0')}:${String(Math.floor((norm % 1) * 60)).padStart(2, '0')}`;
}
import { provinceAt } from './regions';
import { groundHeight, roadPitch } from './elevation';
import { validatePhase2, validateWorldData } from './validation';

const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
/** Turkish pump price per litre (game economy keeps its original job payouts). */
const FUEL_PRICE = 46.9;
const REPAIR_PER_PT = 22;
/** cab camera limits: eye height offset (m) and head turn (rad) */
const CAM_RISE_MIN = -0.10, CAM_RISE_MAX = 0.28;
const HEAD_TURN = Math.PI / 3; // 60°
const LIMIT_KMH: Record<string, number> = { town: 50, village: 50, rural: 70, highway: 90, industrial: 40, side: 30, ring: 30 };

export class Game {
  container: HTMLElement | null = null;
  renderer!: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 2300);
  post!: PostFX;
  atm!: Atmosphere;
  world!: World;
  truck!: TruckModel;
  sim = new TruckSim();
  traffic!: Traffic;
  nav!: Navigator;
  missions!: Missions;
  audio = new GameAudio();
  keys = new Set<string>();
  ready = false;
  private lastT = 0;
  private hudT = 0;
  private slowT = 0;
  mode: 'foot' | 'cab' = 'foot';
  camMode: 'cab' | 'chase' | 'far' = 'cab';
  player = { x: 0, z: 0, yaw: 0, pitch: 0 };
  look = { yaw: 0, pitch: 0, drag: false };
  orbit = 0;
  chaseDist = 1;
  private camAngle = 0;
  private camPos = new THREE.Vector3();
  private mirrorIdx = 0;
  /** staggered shadow pass (see render()) — dirty forces the next frame to refresh */
  private shadowFlip = 0; private shadowDirty = true;
  /** peer dressings run at snapshot rate; netDress carries the dt they were given */
  private netDressT = 0; private netDress = 0.1;
  /** cab camera: seat/eye height offset in metres (NUMPAD 8 / 2) */
  private camRise = 0;
  /** cab camera: head turn in radians (NUMPAD 4 / 6, springs back to 0) */
  private headYaw = 0;
  private prompt: { text: string; key: string; run: () => void } | null = null;
  private discovered = new Set<string>();
  private lastInd = 0;
  private repairT = 0;
  private fuelCost = 0;
  private fuelLiters = 0;
  private lightHint = false;
  wiperOn = false;
  hornOn = false;
  private lastCrash = 0;
  /** meetup cooldown (s) so the community action cannot be farmed by tapping E */
  private gangT = 0;
  /** session autosave countdown (real seconds) */
  private saveT = 45;
  /** radar: seconds the rig has been over the posted limit, plus the re-arm timer */
  private speedT = 0; private radarT = 0;
  /** dispatch board re-roll cooldown */
  private rerollT = 0;
  /** indicator / reverse alarm timers (s) */
  private indT = 0; private revT = 0;
  /** convoy (local 2-4 rig layer): the transport, the mirrored rigs, the last hauled job */
  net = new Convoy(new BroadcastConvoyTransport());
  private netPeers = new Map<string, { model: TruckModel; x: number; z: number; yaw: number }>();
  private netWired = false;
  private netHaul: { cargo: string; km: number; reward: number } | null = null;
  private eventFeed: any[] = [];
  private frames = 0;
  private perfT = 0;
  private actualFrameTime = 0;
  private introTime = 0;

  /* ------------------------------------------------------------- */
  attach(el: HTMLElement) {
    if (this.container === el) return;
    this.container = el;
    if (this.renderer) {
      el.appendChild(this.renderer.domElement);
      return;
    }
    setTimeout(() => this.init(el), 30);
  }

  private init(el: HTMLElement) {
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    } catch (e) {
      ui.loadText = text.webglError;
      notify();
      return;
    }
    const r = this.renderer;
    try {
      const gl = r.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      ui.gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    } catch { /* ignore */ }
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false;
    r.toneMapping = THREE.NoToneMapping;
    r.setPixelRatio(1);
    r.autoClear = true;
    r.info.autoReset = false;
    const cv = r.domElement;
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges;display:block;';
    el.appendChild(cv);
    ui.loadText = text.building;
    notify();
    setTimeout(() => {
      try {
        this.build();
      } catch (err: any) {
        console.error(err);
        ui.loadText = text.startupError;
        notify();
      }
    }, 40);
  }

  private build() {
    const sc = this.scene;
    this.atm = new Atmosphere(sc, this.renderer);
    this.atm.hour = 16.25;
    this.world = buildWorld();
    sc.add(this.world.root);
    this.atm.lamps = this.world.lamps;
    this.truck = new TruckModel();
    sc.add(this.truck.root);
    sc.add(this.truck.trailer); // trailer lives in world space (articulated)
    this.nav = new Navigator(this.world.graph);
    // Traffic's own sizing; a smaller pool here used to leave the corridor quieter than
    // the simulation was built for.
    this.traffic = new Traffic(this.world.graph, 26, this.world.col);
    sc.add(this.traffic.group);
    const sp = this.world.spawn;
    this.sim.reset(sp.x, sp.z, sp.heading);
    this.sim.fuel = 150;
    this.player = { x: sp.px, z: sp.pz, yaw: sp.pyaw, pitch: 0 };
    this.missions = new Missions(this.world, sc, this.truck, this.sim, this.nav);
    // Pure province/city/location data integrity — runs without a built world.
    (window as any).__validateWorldData = () => {
      const report = validateWorldData();
      console.log('World data integrity:', report);
      return report;
    };
    (window as any).__validatePhase2 = () => {
      const report = validatePhase2(this.world, this.missions.jobs);
      console.log('Phase 2 structural validation (no runtime acceptance):', report);
      console.table(report.structuralChecks);
      if (report.roadSurfaceClearanceSamples.length) console.table(report.roadSurfaceClearanceSamples);
      return report;
    };
    loadProfile();
    this.post = new PostFX(this.renderer, 640, 360);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pagehide', () => { if (this.ready) saveProfile(); });
    this.bindInput();
    this.bindEvents();
    this.camPos.set(sp.x, 8, sp.z);
    // z-fighting detector — run `__auditCoplanar()` in the console
    (window as any).__auditCoplanar = (tol = 0.0025) => {
      const world = auditCoplanar(this.world.root, tol);
      const truck = auditCoplanar(this.truck.root, tol).concat(auditCoplanar(this.truck.trailer, tol));
      const fmt = (h: any[]) => h.slice(0, 15).map((x) => ({
        area: +x.area.toFixed(2), at: `${x.x.toFixed(1)}, ${x.y.toFixed(2)}, ${x.z.toFixed(1)}`,
      }));
      console.log(`coplanar overlaps — world: ${world.length}, truck: ${truck.length}`);
      if (world.length) console.table(fmt(world));
      if (truck.length) console.table(fmt(truck));
      return { world: world.length, truck: truck.length };
    };
    this.ready = true;
    ui.loading = false;
    ui.region = text.depotName;
    (window as any).__game = this;
    (window as any).__ui = ui; // diagnostics: same object the HUD renders
    // the browser tab closing is the last honest save point
    window.addEventListener('pagehide', () => this.saveSession());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.saveSession(); });
    ui.hasSave = !!peekSession();
    // ALOSKE/ALOSKEGANG live layer: one subscription, no gameplay coupling.
    streamerAdapter.connect();
    streamerState.useProvider(KickStreamerProvider.configured ? new KickStreamerProvider() : new MockStreamerProvider());
    notify();
    this.lastT = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  /* ---------------------------- public API for UI ---------------------------- */
  start() {
    ui.started = true;
    this.audio.start();
    saveProfile();
    // "continue": world position, load, settings and discoveries come back from the
    // session blob; progression (money/xp/level) already came from the profile.
    const s = readSession(localStorage);
    if (s) this.applySession(s, true);
    this.netJoin();
    notify();
  }

  /**
   * Convoy. The transport is BroadcastChannel, so this is 2-4 rigs in one world across
   * the tabs/windows of one browser profile — see src/game/net.ts and MULTIPLAYER_STATUS
   * in ./status for what is deliberately not here (no server, no accounts, no wide area).
   */
  private netJoin() {
    const net = this.net;
    if (!net.supported) { ui.netOn = false; return; }
    if (!net.active) net.join(`${ui.truckId}-${net.selfId.slice(0, 3)}`);
    ui.netOn = net.active;
    if (this.netWired) { notify(); return; }
    this.netWired = true;
    window.addEventListener('pagehide', () => net.leave());
    bus.on('DELIVERY_ACCEPTED', () => {
      const j = this.missions.active as any;
      if (!j) return;
      this.netHaul = { cargo: j.cargoName, km: j.km, reward: j.reward };
      const offer: ConvoyJobOffer = { title: j.title, cargo: j.cargo, cargoName: j.cargoName, weight: j.weight,
        from: j.from, to: j.to, km: j.km, reward: j.reward, xp: j.xp, blurb: j.blurb, hours: j.hours, risk: j.risk, appearance: j.appearance };
      net.shareJob(offer);
    });
    bus.on('DELIVERY_COMPLETED', (e) => net.announceHaul({ cargo: this.netHaul?.cargo ?? '', km: this.netHaul?.km ?? 0, reward: Number(e.data?.money ?? 0), ok: true }));
    bus.on('DELIVERY_FAILED', (e) => net.announceHaul({ cargo: this.netHaul?.cargo ?? '', km: this.netHaul?.km ?? 0, reward: 0, ok: e.data?.reason !== 'cancelled' }));
    net.onJob = (from, offer, offerId) => {
      if (this.missions.jobs.some((j) => j.id === offerId)) return;
      // same dispatch entry, local id: the route is computed from the local nav graph
      const job = { id: offerId, ...offer } as unknown as (typeof this.missions.jobs)[number];
      this.missions.jobs.push(job);
      notify();
      toast(t('convoyOffer', { name: from, title: offer.title }), 'info');
    };
    net.onHaul = (from, haul) => {
      bus.emit('CONVOY_HAUL', { name: from, cargo: haul.cargo, km: haul.km, reward: haul.reward, ok: haul.ok });
      toast(t(haul.ok ? 'convoyHaul' : 'convoyHaulFail', { name: from, cargo: haul.cargo, reward: money(haul.reward) }), haul.ok ? 'good' : 'bad');
    };
  }

  private setConvoy(on: boolean) {
    if (on) this.netJoin();
    else {
      this.net.leave();
      for (const p of this.netPeers.values()) this.scene.remove(p.model.root);
      this.netPeers.clear();
    }
    ui.netOn = this.net.active;
    this.shadowDirty = true;
    ui.convoyCount = this.net.count;
    ui.convoy = [];
    toast(ui.netOn ? text.convoyOn : text.convoyOff, 'info');
    notify();
  }

  /** Snapshot of the *gameplay* state only — no generated scenery, ever. */
  saveSession() {
    if (!ui.started) return;
    const sim = this.sim;
    const job = this.missions.active;
    const s: SessionSave = {
      v: 1, worldVersion: SESSION_WORLD, savedAt: Date.now(),
      pos: { x: sim.x, z: sim.z, heading: sim.heading },
      fuel: sim.fuel, damage: sim.damage, distance: sim.distance,
      hour: this.atm.hour, weather: this.atm.weather, pixel: ui.pixel || 2,
      streamerOn: streamerState.enabled, streamerProvider: streamerState.provider.kind,
      discovered: [...this.discovered],
      stats: streamerState.snapshot.counts,
      job: job && (this.missions.phase === 'toPickup' || this.missions.phase === 'loading' || this.missions.phase === 'toDest' || this.missions.phase === 'unloading')
        ? { id: job.id, phase: this.missions.phase } : null,
    };
    if (writeSession(localStorage, s)) { ui.savedAt = s.savedAt; ui.hasSave = true; }
  }

  applySession(s: SessionSave, announce: boolean) {
    if (s.worldVersion !== SESSION_WORLD) { if (announce) toast(text.saveWorldMismatch, 'warn'); return; }
    const sim = this.sim;
    if (!inWater(s.pos.x, s.pos.z)) {
      Object.assign(sim, { x: s.pos.x, z: s.pos.z, heading: s.pos.heading, ry: s.pos.heading, trailerYaw: 0,
        vx: 0, vz: 0, vy: 0, yawRate: 0, throttle: 0, brake: 0, handbrake: true, engineOn: false });
      this.player.x = s.pos.x; this.player.z = s.pos.z;
    }
    sim.fuel = Math.min(sim.fuelCap, s.fuel);
    sim.damage = s.damage;
    sim.distance = s.distance;
    this.atm.hour = s.hour;
    this.setWeather(s.weather);
    ui.pixel = s.pixel; this.resize();
    for (const id of s.discovered) this.discovered.add(id);
    ui.discoveries = s.discovered.map((id, i) => ({ id, name: this.world.pois.find(p => p.id === id)?.name ?? id, at: i }));
    streamerState.restore(s.streamerOn, s.streamerProvider, s.stats);
    ui.savedAt = s.savedAt; ui.hasSave = true;
    if (s.job) {
      if (this.missions.accept(s.job.id) && s.job.phase !== 'toPickup') this.missions.restoreInTransit();
    }
    if (announce) {
      toast(t('saveLoaded', { money: money(ui.money), level: number(ui.level) }), 'good');
    }
    notify();
  }

  /** New game: session cleared, progression rewritten to the starting values. */
  newGame() {
    clearSession(localStorage);
    if (this.missions.active) this.missions.cancel();
    const sim = this.sim, sp = this.world.spawn;
    Object.assign(sim, { x: sp.px, z: sp.pz, heading: sp.pyaw, ry: sp.pyaw, trailerYaw: 0, vx: 0, vz: 0, vy: 0,
      fuel: sim.fuelCap, damage: 0, distance: 0, handbrake: true, engineOn: false, cargoKg: 0 });
    this.player.x = sp.px; this.player.z = sp.pz;
    ui.money = 2500; ui.xp = 0; ui.level = 1; ui.xpNext = 450; ui.truckOwned = true;
    saveProfile();
    this.discovered.clear(); ui.discoveries = [];
    streamerState.reset();
    this.atm.hour = 8; this.setWeather('clear');
    this.mode = 'foot';
    ui.hasSave = false; ui.savedAt = 0;
    toast(text.newGame, 'info');
    notify();
  }

  resetSave() {
    clearSession(localStorage);
    try {
      localStorage.removeItem('nordhaul_p1_save');
      localStorage.removeItem('nordhaul_p1_save_backup');
      localStorage.removeItem('nordhaul_p1');
    } catch { /* storage may be denied; the in-memory state is still reset */ }
    ui.hasSave = false; ui.savedAt = 0;
    this.newGame();
    toast(text.saveReset, 'warn');
  }

  /** used by the title screen to decide between DEVAM ET and BAŞLA */
  hasSession() { return !!peekSession(); }
  openMenu(m: 'jobs' | 'map' | 'pause' | null) {
    ui.menu = ui.menu === m ? null : m;
    if (ui.menu) { this.keys.clear(); if (ui.menu === 'pause') this.saveSession(); }
    notify();
  }
  closeMenu() { ui.menu = null; this.keys.clear(); notify(); }
  acceptJob(id: string) { if (this.missions.accept(id)) { ui.menu = null; this.audio.chime(true); notify(); } }
  cancelJob() { this.missions.cancel(); notify(); }
  /** PİYASAYI YENİLE — re-rolls the generated offers (a 45 s cooldown keeps it honest). */
  rerollBoard() {
    if (this.rerollT > 0) { toast(t('rerollWait', { n: number(Math.ceil(this.rerollT)) }), 'warn'); return; }
    this.rerollT = 45;
    const n = this.missions.rerollBoard();
    this.audio.chime(true);
    toast(`${text.dispatch}: ${n}`, 'info');
    notify();
  }
  dismissCompletion() { ui.completion = null; this.saveSession(); notify(); }
  /** pause-menu action: writing the blob is cheap, so the button always works */
  manualSave() { this.saveSession(); toast(text.saveWritten, 'good'); notify(); }
  setWeather(w: 'clear' | 'rain') { this.atm.setWeather(w); ui.weather = w; notify(); }
  setHour(h: number) { this.atm.hour = h; notify(); }
  setTimeScale(s: number) { this.atm.timeScale = s; ui.timeScale = s; notify(); }
  setAutoWeather(b: boolean) { this.atm.autoWeather = b; ui.autoWeather = b; notify(); }
  setPixel(p: number) { ui.pixel = p; this.resize(); notify(); }
  /** the cab radio is a synthesised modal bed, not a recording — and it is cab-only */
  setRadio(on: boolean) {
    ui.radioOn = on;
    this.audio.setRadio(on && this.mode === 'cab');
    notify();
  }
  /** F4 — the live layer is opt-in; nothing renders when it is off. */
  setStreamer(on: boolean) { this.shadowDirty = true; streamerState.setEnabled(on); toast(on ? text.streamerEnabled : text.streamerDisabled, 'info'); }
  setStreamerProvider(kind: 'mock' | 'kick') {
    streamerState.useProvider(kind === 'kick' ? new KickStreamerProvider() : new MockStreamerProvider());
    if (streamerState.enabled) streamerState.setEnabled(true);
    notify();
  }
  /** ALOSKEGANG meetup: an in-world community action, not a UI button. */
  callCommunityMeetup() {
    if (this.gangT > 0) return;
    this.gangT = 60;
    const count = 6 + Math.floor(Math.random() * 9);
    addXP(25);
    bus.emit('COMMUNITY_EVENT', { place: ALOSKEGANG.locationId, drivers: count, xp: 25 });
    toast(t('aloskegangMet', { count }), 'good');
    notify();
  }
  /** Certified weigh ticket at the depot scale — small money, real reason to stop on it. */
  weighTruck() {
    const kg = this.sim.cargoKg;
    if (kg <= 0) { toast(text.aloskegangWeighEmpty, 'warn'); return; }
    const fee = Math.round(40 + kg / 1000 * 6);
    addMoney(fee);
    toast(t('aloskegangWeigh', { weight: number(kg / 1000, 1), cost: money(fee) }), 'good');
    bus.emit('COMMUNITY_EVENT', { place: 'aloskegang.scale', weight: kg, fee });
    notify();
  }
  toggleMute() { this.audio.muted = !this.audio.muted; notify(); }

  getMapState() {
    return {
      x: this.mode === 'cab' ? this.sim.x : this.player.x,
      z: this.mode === 'cab' ? this.sim.z : this.player.z, heading: this.mode === 'cab' ? this.sim.heading : this.player.yaw,
      route: this.missions?.route, target: this.missions?.target, locations: this.world.locations,
    };
  }

  /* ------------------------------- setup helpers ------------------------------- */
  private resize() {
    if (!this.renderer || !this.container) return;
    const W = this.container.clientWidth || window.innerWidth, H = this.container.clientHeight || window.innerHeight;
    const ps = ui.pixel || 2;
    const h = Math.max(180, Math.round(H / ps));
    const w = Math.max(240, Math.round((W / H) * h));
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
  }

  private bindEvents() {
    const feedTypes = new Set(['PLAYER_CRASHED']);
    bus.on('*', (e) => {
      this.eventFeed.unshift({ type: e.type, data: JSON.stringify(e.data).slice(0, 70), t: Math.round(e.time) });
      if (this.eventFeed.length > 9) this.eventFeed.pop();
      ui.events = this.eventFeed;
    });
    bus.on('PLAYER_CRASHED', (e) => {
      if (performance.now() - this.lastCrash > 800) {
        this.lastCrash = performance.now();
        toast(t('crashed', { damage: number(this.sim.damage) }), 'bad');
        this.audio.thud(e.data.speed / 3);
      }
    });
    bus.on('FUEL_LOW', () => toast(text.fuelLow, 'warn'));
    bus.on('FUEL_EMPTY', () => toast(text.fuelEmpty, 'bad'));
    bus.on('WEATHER_CHANGED', (e) => toast(e.data.weather === 'rain' ? text.rainStarts : text.rainStops, 'info'));
    bus.on('NEW_LOCATION_DISCOVERED', (e) => toast(t('discovered', { location: e.data.name }), 'good'));
    bus.on('DELIVERY_COMPLETED', () => { this.audio.chime(true); this.saveSession(); });
    bus.on('JOB_EXPIRED', () => this.saveSession());
    bus.on('PARKING_FAILED', () => this.audio.chime(false));
    void feedTypes;
  }

  private bindInput() {
    const prevent = new Set([
      'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F4',
      // cab camera numpad controls (these also fire when NumLock is off)
      'Numpad8', 'Numpad2', 'Numpad4', 'Numpad6',
    ]);
    window.addEventListener('keydown', (e) => {
      if (prevent.has(e.code)) e.preventDefault();
      if (!ui.started || ui.loading) return;
      if (e.repeat) { if (!ui.menu) this.keys.add(e.code); return; }
      if (e.code === 'Escape') { if (ui.menu) this.closeMenu(); else if (ui.completion) this.dismissCompletion(); else this.openMenu('pause'); return; }
      if (e.code === 'KeyJ') { this.openMenu('jobs'); return; }
      if (e.code === 'KeyM') { this.openMenu('map'); return; }
      if (ui.menu) return;
      this.keys.add(e.code);
      this.onKeyDown(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyH') this.hornOn = false;
    });
    window.addEventListener('blur', () => this.keys.clear());
    let lx = 0, ly = 0;
    window.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button,.ui-block')) return;
      this.look.drag = true; lx = e.clientX; ly = e.clientY;
    });
    window.addEventListener('pointerup', () => (this.look.drag = false));
    window.addEventListener('pointermove', (e) => {
      if (!this.look.drag || ui.menu) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      const s = 0.0042;
      if (this.mode === 'foot') {
        this.player.yaw -= dx * s;
        this.player.pitch = Math.max(-1.2, Math.min(1.2, this.player.pitch - dy * s));
      } else if (this.camMode === 'cab') {
        this.look.yaw = Math.max(-2.3, Math.min(2.3, this.look.yaw - dx * s));
        this.look.pitch = Math.max(-0.8, Math.min(0.9, this.look.pitch - dy * s));
      } else {
        this.orbit -= dx * s * 1.2;
        this.look.pitch = Math.max(-0.5, Math.min(0.9, this.look.pitch + dy * s));
      }
    });
    window.addEventListener('wheel', (e) => {
      if (ui.menu) return;
      this.chaseDist = Math.max(0.6, Math.min(2.2, this.chaseDist + e.deltaY * 0.0008));
    }, { passive: true });
  }

  private onKeyDown(code: string) {
    switch (code) {
      case 'KeyC':
        if (this.mode === 'cab') {
          this.camMode = this.camMode === 'cab' ? 'chase' : this.camMode === 'chase' ? 'far' : 'cab';
          ui.cam = this.camMode;
          this.look.yaw = 0; this.look.pitch = 0; this.orbit = 0;
        }
        break;
      case 'KeyE': if (this.prompt && this.prompt.key === 'E') this.prompt.run(); break;
      case 'KeyF':
        if (this.prompt && this.prompt.key === 'F') this.prompt.run();
        break;
      case 'KeyL': ui.headlights = !ui.headlights; this.audio.click(500); break;
      case 'KeyH': this.hornOn = true; break;
      case 'KeyZ': ui.indicator = ui.indicator === -1 ? 0 : -1; this.audio.click(700); break;
      case 'KeyX': ui.indicator = ui.indicator === 1 ? 0 : 1; this.audio.click(700); break;
      case 'KeyB': ui.indicator = ui.indicator === 2 ? 0 : 2; this.audio.click(700); break;
      case 'KeyV': this.wiperOn = !this.wiperOn; this.audio.click(600); break;
      case 'KeyN': this.setRadio(!ui.radioOn); break;
      case 'KeyT': this.setWeather(this.atm.weather === 'rain' ? 'clear' : 'rain'); this.shadowDirty = true; break;
      case 'KeyR': this.recover(false); break;
      case 'F4': this.setStreamer(!ui.streamerOn); break;
      case 'Space': if (this.mode === 'cab') { this.sim.handbrake = !this.sim.handbrake; this.audio.click(300, 0.08); } break;
      case 'F3': ui.showEvents = !ui.showEvents; notify(); break;
      case 'KeyK': this.setConvoy(!ui.netOn); break;
    }
  }

  /* ------------------------------- gameplay actions ------------------------------- */
  private doorPos() {
    const f = this.sim.fwd, l = this.sim.left;
    return { x: this.sim.x + f.x * 3.4 + l.x * 2.0, z: this.sim.z + f.z * 3.4 + l.z * 2.0 };
  }
  private enterTruck() {
    this.mode = 'cab';
    this.camMode = 'cab';
    this.look.yaw = 0; this.look.pitch = 0;
    ui.mode = 'cab'; ui.cam = 'cab';
    this.sim.engineOn = true;
    bus.emit('TRUCK_ENTERED', {});
    this.headYaw = 0;
    toast(text.welcome, 'info');
    if (this.atm.night > 0.5) toast(text.darkHint, 'warn');
    notify();
  }
  private exitTruck() {
    if (Math.abs(this.sim.vf) > 1.5) { toast(text.stopBeforeExit, 'warn'); return; }
    this.sim.handbrake = true;
    const d = this.doorPos();
    this.player.x = d.x; this.player.z = d.z;
    this.player.yaw = this.sim.heading - Math.PI / 2;
    this.player.pitch = 0;
    this.mode = 'foot';
    ui.mode = 'foot';
    ui.indicator = 0;
    bus.emit('TRUCK_EXITED', {});
    notify();
  }

  recover(auto: boolean) {
    if (this.mode !== 'cab') return;
    if (this.missions.phase === 'loading' || this.missions.phase === 'unloading') return;
    const n = this.world.graph.nearest(this.sim.x, this.sim.z);
    const g = this.world.graph;
    let e = n.e, s = n.s;
    if (n.d < 4 && !auto && this.sim.fuel > 0) { toast(text.onRoad, 'info'); return; }
    // avoid bridges / junction centres
    const margin = Math.min(30, e.len / 3);
    s = Math.max(margin, Math.min(e.len - margin, s));
    const p = g.sample(e, s);
    let h = Math.atan2(p.dx, p.dz);
    if (Math.abs(wrap(h - this.sim.heading)) > Math.PI / 2) h += Math.PI;
    const off = e.oneWay ? 0 : 1.8;
    const rx = -Math.cos(h), rz = Math.sin(h);
    this.sim.reset(p.x + rx * off, p.z + rz * off, wrap(h));
    this.sim.handbrake = true;
    const fee = Math.max(0, Math.min(ui.money, 250));
    addMoney(-fee);
    if (this.sim.fuel <= 0) { this.sim.fuel = 15; this.sim.fuelEmptyFired = false; }
    this.sim.damage = Math.min(100, this.sim.damage + (auto ? 12 : 0));
    toast(t('recovered', { cost: money(fee) }), 'warn');
    this.camAngle = wrap(h);
    notify();
  }

  /** POI-relative proximity, used for the ALOSKEGANG yard actions. */
  private nearGangPoint(id: string, r: number) {
    const p = this.world.pois.find(q => q.id === id);
    if (!p) return false;
    const x = this.mode === 'cab' ? this.sim.x : this.player.x, z = this.mode === 'cab' ? this.sim.z : this.player.z;
    return Math.hypot(p.x - x, p.z - z) < r;
  }

  private fuelNearPump() {
    const t = this.sim.tankPoint;
    for (const p of this.world.pumps) if (Math.hypot(t.x - p.x, t.z - p.z) < 3.9) return true;
    return false;
  }

  private updateInteractions(dt: number) {
    const stopped = Math.abs(this.sim.vf) < 1.2 && Math.hypot(this.sim.vx, this.sim.vz) < 1.5;
    this.prompt = null;
    ui.prompt = '';
    if (this.mode === 'foot') {
      const d = this.doorPos();
      const dd = Math.hypot(this.player.x - d.x, this.player.z - d.z);
      const tk = this.world.terminal;
      if (dd < 3.6) this.prompt = { text: text.enter, key: 'F', run: () => this.enterTruck() };
      else if (Math.hypot(this.player.x - tk.x, this.player.z - tk.z) < 3.2) this.prompt = { text: text.openJobs, key: 'E', run: () => this.openMenu('jobs') };
      else if (this.nearGangPoint(ALOSKEGANG.poiId, 34)) this.prompt = { text: text.aloskegangBoard, key: 'E', run: () => this.openMenu('jobs') };
    } else {
      const m = this.missions.update(dt, this.atm.time);
      if (m) this.prompt = { text: m.text, key: 'E', run: m.run };
      else if (this.missions.phase === 'loading' || this.missions.phase === 'unloading') this.prompt = null;
      else if (ui.fueling) this.prompt = { text: text.stopFuel, key: 'E', run: () => this.stopFueling() };
      else if (stopped && this.fuelNearPump() && this.sim.fuel < this.sim.fuelCap - 1) this.prompt = { text: t('refuel', { price: money(FUEL_PRICE, 2) }), key: 'E', run: () => this.startFueling() };
      else if (stopped && this.world.garages.some(g => Math.hypot(this.sim.x - g.x, this.sim.z - g.z) < g.r) && this.sim.damage > 0.5)
        this.prompt = { text: t('repair', { cost: money(this.sim.damage * REPAIR_PER_PT) }), key: 'E', run: () => this.startRepair() };
      else if (stopped && this.nearGangPoint(`${ALOSKEGANG.poiId}.scale`, 7))
        this.prompt = { text: text.aloskegangWeighGo, key: 'E', run: () => this.weighTruck() };
      else if (stopped && this.nearGangPoint(ALOSKEGANG.poiId, 42) && !this.missions.active)
        this.prompt = { text: text.aloskegangMeet, key: 'E', run: () => this.callCommunityMeetup() };
      else if (stopped) this.prompt = { text: text.exit, key: 'F', run: () => this.exitTruck() };
    }
    if (this.mode === 'foot') this.missions.update(dt, this.atm.time);
    ui.prompt = this.prompt ? this.prompt.text : '';
    ui.promptKey = this.prompt ? this.prompt.key : 'E';
  }

  interact() {
    if (ui.started && !ui.menu && !ui.completion) this.prompt?.run();
  }

  private startFueling() {
    if (ui.money < 1) { toast(text.noMoney, 'warn'); return; }
    ui.fueling = true;
    this.fuelCost = 0; this.fuelLiters = 0;
    toast(text.fueling, 'info');
  }
  private stopFueling() {
    if (!ui.fueling) return;
    ui.fueling = false;
    saveProfile();
    if (this.fuelLiters > 0.5) {
      bus.emit('REFUELED', { liters: this.fuelLiters, cost: this.fuelCost });
      toast(t('refueled', { liters: number(this.fuelLiters), cost: money(this.fuelCost) }), 'good');
    }
  }
  private startRepair() {
    if (this.repairT > 0) return;
    if (ui.money <= 0) { toast(text.noMoney, 'warn'); return; }
    this.repairT = 3.0;
    toast(text.repairing, 'info');
  }

  /* -------------------------------------- frame -------------------------------------- */
  private frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    this.actualFrameTime = Math.max(0, (now - this.lastT) / 1000);
    const dt = Math.min(0.05, this.actualFrameTime);
    this.lastT = now;
    const live = ui.started && !ui.menu && !ui.completion;
    this.update(live ? dt : 0, dt);
    this.render(dt);
  }

  private update(sdt: number, rdt: number) {
    const sim = this.sim;
    const k = this.keys;
    const up = k.has('KeyW') || k.has('ArrowUp'), down = k.has('KeyS') || k.has('ArrowDown');
    const left = k.has('KeyA') || k.has('ArrowLeft'), right = k.has('KeyD') || k.has('ArrowRight');

    // atmosphere (also runs in menus with dt=0 to keep sky consistent)
    sim.wet = this.atm.rain;
    if (sdt > 0) {
      /* ---- on foot ---- */
      if (this.mode === 'foot') {
        const sp = (k.has('ShiftLeft') ? 6 : 3.4) * sdt;
        const fx = Math.sin(this.player.yaw), fz = Math.cos(this.player.yaw);
        const lx = Math.cos(this.player.yaw), lz = -Math.sin(this.player.yaw);
        let mx = 0, mz = 0;
        if (k.has('KeyW') || k.has('ArrowUp')) { mx += fx; mz += fz; }
        if (k.has('KeyS') || k.has('ArrowDown')) { mx -= fx; mz -= fz; }
        if (k.has('KeyA')) { mx += lx; mz += lz; }
        if (k.has('KeyD')) { mx -= lx; mz -= lz; }
        if (k.has('ArrowLeft')) this.player.yaw += 1.8 * sdt;
        if (k.has('ArrowRight')) this.player.yaw -= 1.8 * sdt;
        const l = Math.hypot(mx, mz) || 1;
        this.player.x += (mx / l) * sp * (mx || mz ? 1 : 0);
        this.player.z += (mz / l) * sp * (mx || mz ? 1 : 0);
        const col = this.world.col;
        for (let i = 0; i < 2; i++) {
          col.query(this.player.x, this.player.z, 0.4, (h) => { this.player.x += h.nx * h.pen; this.player.z += h.nz * h.pen; });
          for (const c of sim.circles()) {
            const dx = this.player.x - c.x, dz = this.player.z - c.z, d = Math.hypot(dx, dz);
            if (d < c.r + 0.4 && d > 1e-4) { this.player.x += (dx / d) * (c.r + 0.4 - d); this.player.z += (dz / d) * (c.r + 0.4 - d); }
          }
        }
        if (inWater(this.player.x, this.player.z)) { const sp0 = this.world.spawn; this.player.x = sp0.px; this.player.z = sp0.pz; toast(text.footWater, 'warn'); }
      }

      /* ---- vehicle ---- */
      const transferring = this.missions.phase === 'loading' || this.missions.phase === 'unloading';
      const frozen = this.mode === 'foot' || this.repairT > 0 || transferring;
      const inp = { up: this.mode === 'cab' && up, down: this.mode === 'cab' && down, left: this.mode === 'cab' && left, right: this.mode === 'cab' && right, handbrake: false };
      if (this.mode === 'foot') sim.handbrake = true;
      if (ui.fueling) { inp.up = inp.down = false; sim.handbrake = true; }
      if (transferring) sim.handbrake = true;
      if (!frozen && !sim.handbrake && Math.abs(sim.vf) > 0.1) {
        const gradeForce = Math.sin(roadPitch(sim.x, sim.z, sim.heading)) * 9.81 * sdt;
        sim.vx += sim.fwd.x * gradeForce; sim.vz += sim.fwd.z * gradeForce;
      }
      const steps = sdt > 0.026 ? 2 : 1;
      this.traffic.update(sdt, sim.circles(), sim.x, sim.z, this.atm.time);
      for (let i = 0; i < steps; i++) {
        const dyn = this.traffic.dynBodies();
        sim.update(sdt / steps, inp, this.world.col, dyn, frozen);
        this.traffic.syncFromBodies();
      }
      // forklifts + turbines
      for (const f of this.world.forklifts) {
        f.t += sdt * f.spd * f.dir;
        if (f.t > 1) { f.t = 1; f.dir = -1; }
        if (f.t < 0) { f.t = 0; f.dir = 1; }
        const e = f.t < 0.5 ? 2 * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 2) / 2;
        f.g.position.set(f.ax + (f.bx - f.ax) * e, 0, f.az + (f.bz - f.az) * e);
        f.g.rotation.y = Math.atan2(f.bx - f.ax, f.bz - f.az) + (f.dir > 0 ? 0 : Math.PI);
        f.g.userData.forks.position.y = 0.15 + (Math.sin(this.atm.time * 0.7 + f.ax) * 0.5 + 0.5) * 1.1;
      }
      for (const b of this.world.turbines) b.rotation.z += sdt * (0.5 + this.atm.rain * 0.3);

      // world limits / water
      if (this.mode === 'cab') {
        if (inWater(sim.x, sim.z)) { toast(text.fellInWater, 'bad'); this.recover(true); }
        if (sim.x < WORLD.x0 + 30 || sim.x > WORLD.x1 - 30 || sim.z < WORLD.z0 + 30 || sim.z > WORLD.z1 - 30) {
          sim.x = Math.max(WORLD.x0 + 30, Math.min(WORLD.x1 - 30, sim.x));
          sim.z = Math.max(WORLD.z0 + 30, Math.min(WORLD.z1 - 30, sim.z));
          sim.vx *= 0.5; sim.vz *= 0.5;
          if (this.slowT <= 0) { toast(text.boundary, 'warn'); this.slowT = 3; }
        }
      }
      this.slowT -= sdt;

      /* ---- fuel station / garage ---- */
      if (ui.fueling) {
        const stopped = Math.abs(sim.vf) < 1.5;
        if (!stopped || !this.fuelNearPump() || ui.money < 1 || sim.fuel >= sim.fuelCap - 0.01) this.stopFueling();
        else {
          const add = Math.min(sim.fuelCap - sim.fuel, 16 * sdt, ui.money / FUEL_PRICE);
          sim.fuel += add;
          this.fuelLiters += add;
          this.fuelCost += add * FUEL_PRICE;
          ui.money -= add * FUEL_PRICE;
          ui.money = Math.max(0, ui.money);
          sim.fuelLowFired = false;
          if (sim.fuel >= sim.fuelCap - 0.01) toast(text.tankFull, 'info');
        }
      }
      if (this.repairT > 0) {
        this.repairT -= sdt;
        if (this.repairT <= 0) {
          const pts = Math.min(sim.damage, ui.money / REPAIR_PER_PT);
          const cost = Math.round(pts * REPAIR_PER_PT);
          sim.damage = Math.max(0, sim.damage - pts);
          addMoney(-cost);
          bus.emit('TRUCK_REPAIRED', { cost, remaining: sim.damage });
          toast(t(sim.damage < 0.5 ? 'repaired' : 'partialRepair', { cost: money(cost) }), 'good');
        }
      }

      // indicators cancel after turn
      if (ui.indicator === -1 || ui.indicator === 1) {
        if (Math.abs(sim.steerIn) > 0.45) this.lastInd = 1;
        if (this.lastInd && Math.abs(sim.steerIn) < 0.08 && Math.abs(sim.yawRate) < 0.03) { ui.indicator = 0; this.lastInd = 0; }
      } else this.lastInd = 0;

      /* ---- speed-limit enforcement (EDS) ----
         The limit comes from the edge under the wheels (ui.speedLimit, set in the
         discovery/province tick). Two thirds of the posted limit is the tolerance a
         fixed camera in Türkiye actually uses, then a tiered administrative fine. */
      if (this.mode === 'cab' && ui.speedLimit > 0) {
        const kmh = Math.abs(sim.speedKmh);
        const over = kmh - ui.speedLimit;
        ui.overLimit = over > 0 ? 1 : 0;
        if (over > Math.max(4, ui.speedLimit * 0.18)) {
          this.speedT += sdt;
          if (this.speedT > 2.2 && this.radarT <= 0 && ui.started) {
            this.radarT = 75; this.speedT = 0;
            const heavy = sim.cargoKg > 12000 ? 1.25 : 1;
            const fine = Math.round((over > ui.speedLimit * 0.4 ? 951 : 442) * heavy);
            addMoney(-fine);
            bus.emit('SPEEDING', { kmh: Math.round(kmh), limit: ui.speedLimit, fine, over: Math.round(over) });
            toast(t('speedingFine', { limit: number(ui.speedLimit), kmh: number(Math.round(kmh)), fine: money(fine) }), 'bad');
            notify();
          }
        } else this.speedT = Math.max(0, this.speedT - sdt * 2);
      } else if (ui.overLimit) { ui.overLimit = 0; this.speedT = 0; }
      if (this.radarT > 0) this.radarT = Math.max(0, this.radarT - sdt);
      if (this.rerollT > 0) this.rerollT = Math.max(0, this.rerollT - sdt);
      /* ---- audible state the truck already knows about ---- */
      if (this.mode === 'cab') {
        if (ui.indicator) {
          this.indT -= sdt;
          if (this.indT <= 0) { this.indT = ui.indicator === 2 ? 0.5 : 0.92; this.audio.click(ui.indicator === 2 ? 980 : 840, 0.028); }
        } else this.indT = 0;
        if (sim.reverse && Math.abs(sim.vf) > 0.6) {
          this.revT -= sdt;
          if (this.revT <= 0) { this.revT = 0.85; this.audio.beep(920, 0.17, 0.05); }
        } else this.revT = 0;
        if (this.radarT > 70) this.audio.beep(1320, 0.1, 0.05);
        if (ui.radioOn !== this.audio.radioOn) this.audio.setRadio(ui.radioOn);
      } else if (this.audio.radioOn) this.audio.setRadio(false);

      // job deadline + community cooldown + autosave
      this.missions.timeScale = this.atm.timeScale;
      this.missions.tick(sdt);
      if (this.gangT > 0) this.gangT = Math.max(0, this.gangT - sdt);
      this.saveT -= sdt;
      if (this.saveT <= 0) { this.saveT = 45; this.saveSession(); }

      // interactions
      this.updateInteractions(sdt);
      if (this.hornOn && this.mode !== 'cab') this.hornOn = false;

      // POI discovery
      if (Math.floor(this.atm.time * 2) !== Math.floor((this.atm.time - sdt) * 2)) {
        const px = this.mode === 'cab' ? sim.x : this.player.x, pz = this.mode === 'cab' ? sim.z : this.player.z;
        const province = provinceAt(px, pz);
        ui.province = province.displayName;
        let region = province.displayName;
        for (const p of this.world.pois) {
          const d = Math.hypot(p.x - px, p.z - pz);
          if (d < p.r) {
            region = p.name;
            if (!this.discovered.has(p.id)) {
              this.discovered.add(p.id);
              ui.discoveries = [...this.discovered].map((id) => ({ id, name: this.world.pois.find(q => q.id === id)?.name ?? id, at: Date.now() }));
              bus.emit('NEW_LOCATION_DISCOVERED', { id: p.id, name: p.name });
              this.saveSession();
            }
          }
        }
        ui.region = region;
        // speed limit
        if (this.mode === 'cab') {
          const ne = this.world.graph.nearest(sim.x, sim.z);
          ui.speedLimit = ne.d < 12 ? LIMIT_KMH[ne.e.type] : 0;
        }
        // dusk hint
        if (this.atm.night > 0.6 && !ui.headlights && this.mode === 'cab' && !this.lightHint) { this.lightHint = true; toast(text.darkHint, 'warn'); }
        if (this.atm.night < 0.2) this.lightHint = false;
      }
    }

    const focusX = this.mode === 'cab' ? sim.x : this.player.x, focusZ = this.mode === 'cab' ? sim.z : this.player.z;
    this.atm.update(sdt, this.camera, new THREE.Vector3(focusX, groundHeight(focusX, focusZ), focusZ), ui.headlights);
    if (sdt > 0 && this.atm.autoWeather) ui.weather = this.atm.weather;

    /* ---- apply visuals ---- */
    const tr = this.truck;
    tr.root.position.set(sim.x, groundHeight(sim.x, sim.z) + 0.10, sim.z);
    tr.root.rotation.set(roadPitch(sim.x, sim.z, sim.heading), sim.heading, 0, 'YXZ');
    const h = sim.hitch;
    tr.trailer.position.set(h.x, groundHeight(h.x, h.z) + 0.10, h.z);
    tr.trailer.rotation.set(roadPitch(h.x - Math.sin(sim.trailerYaw) * 5, h.z - Math.cos(sim.trailerYaw) * 5, sim.trailerYaw, 10), sim.trailerYaw, 0, 'YXZ');
    const gear = sim.reverse ? 'R' : sim.handbrake && Math.abs(sim.vf) < 0.3 ? 'P' : Math.abs(sim.vf) < 0.3 && sim.throttle < 0.05 ? 'N' : `D${sim.gear}`;
    /* ---- turn-by-turn + ETA: derived from the planned polyline, refreshed with the
       same half-second tick that already updates region / speed limit ---- */
    const rt = this.missions.route;
    if (rt && this.missions.active) {
      const gd = Navigator.guidance(rt, sim.x, sim.z, Math.max(18, Math.abs(sim.speedKmh)));
      ui.navDir = gd.dir;
      ui.navInstruction = gd.dir === 'arrive' ? text.navArrive
        : gd.dist <= 0 ? (gd.dir === 'left' ? text.navLeft : gd.dir === 'right' ? text.navRight : text.navStraight)
        : `${distance(gd.dist)} · ${gd.dir === 'left' ? text.navLeft : gd.dir === 'right' ? text.navRight : text.navStraight}`;
      ui.etaText = `${dur(gd.etaMin)} · ${clockAt(this.atm.hour + gd.etaMin / 60)}`;
      const ne = this.world.graph.nearest(sim.x, sim.z);
      ui.navShield = ne.d < 40 ? (ne.e.routeCode || '') : '';
    } else if (ui.navInstruction) { ui.navInstruction = ''; ui.etaText = ''; ui.navShield = ''; ui.navDir = ''; }
    const navText = this.missions.active ? (ui.navInstruction || distance(ui.distRemain)) : text.noJob;
    const vs: TruckVisualState = {
      speed: sim.speedKmh, rpm: sim.rpm, fuel: sim.fuel / sim.fuelCap, damage: sim.damage, gear,
      steer: sim.steerIn, steerAngle: sim.steerAngle, throttle: sim.throttle, brake: sim.brake, handbrake: sim.handbrake,
      headlights: ui.headlights, indicator: ui.indicator, reversing: sim.reverse && sim.throttle > 0.05,
      slip: Math.abs(sim.slip ?? 0), radio: ui.radioOn, overspeed: ui.overLimit === 1,
      wiper: this.wiperOn, night: this.atm.night, rain: this.atm.rain, pitch: sim.pitch, roll: sim.roll, bounce: sim.bounce,
      trailerRoll: sim.trailerRoll, wheelSpin: sim.wheelSpin, distKm: sim.distance / 1000, time: this.atm.time,
      hourText: this.atm.hourText(), navText, dt: rdt,
    };
    this.netTick(sdt, rdt, sim, vs);
    const fp = this.mode === 'cab' && this.camMode === 'cab';
    tr.update(vs, fp);
    tr.root.updateMatrixWorld(true);
    tr.trailer.updateMatrixWorld(true);
    this.audio.update(sim.rpm, sim.throttle, Math.abs(sim.vf), this.atm.rain,
      this.mode === 'cab' && sim.fuel > 0 && ui.started && !ui.menu, fp, this.hornOn,
      sim.reverse ? -1 : sim.gear, sim.aLong, sim.brake, sim.shiftTimer);

    // HUD sync (10 Hz)
    this.hudT -= rdt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      ui.speed = sim.speedKmh; ui.rpm = sim.rpm; ui.gear = gear; ui.fuel = sim.fuel; ui.fuelCap = sim.fuelCap;
      ui.damage = Math.round(sim.damage); ui.hour = this.atm.hour; ui.weather = this.atm.weather;
      ui.handbrake = sim.handbrake; ui.mode = this.mode; ui.cam = this.camMode; ui.phase = this.missions.phase;
      ui.distanceKm = sim.distance / 1000;
      if (!this.missions.active) ui.objective = this.mode === 'foot' ? text.enterObjective : text.freeObjective;
      else ui.objective = this.missions.phase === 'toPickup' ? t('pickupObjective', { location: this.missions.pickup!.short })
        : this.missions.phase === 'toDest' ? t('deliveryObjective', { location: this.missions.dest!.short }) : this.missions.phase === 'loading' ? text.loadProgress : text.unloadProgress;
      notify();
    }
  }

  /**
   * Publish this rig's snapshot and mirror the peers. Remote rigs are interpolated
   * between snapshots (10 Hz) exactly like AI traffic is smoothed, never simulated —
   * two tabs cannot share one physics clock, and pretending otherwise would desync.
   */
  private netTick(sdt: number, rdt: number, sim: TruckSim, vs: TruckVisualState) {
    const net = this.net;
    if (!net.active) {
      if (this.netPeers.size) {
        for (const p of this.netPeers.values()) this.scene.remove(p.model.root);
        this.netPeers.clear();
        ui.convoy = []; ui.convoyCount = 1;
      }
      return;
    }
    const job = this.missions.active;
    net.tick(sdt, { x: sim.x, z: sim.z, yaw: sim.heading, kmh: Math.abs(sim.speedKmh), trailer: true,
      cargo: job ? job.cargoName : '', damage: sim.damage, onFoot: this.mode === 'foot' });
    this.netDressT += sdt;
    const dress = this.netDressT >= 0.1;
    if (dress) { this.netDressT = 0; this.netDress = 0.1; }
    const seen = new Set<string>();
    for (const m of net.roster) {
      seen.add(m.id);
      let p = this.netPeers.get(m.id);
      if (!p) {
        const model = new TruckModel();
        this.scene.add(model.root);
        p = { model, x: m.pose.x, z: m.pose.z, yaw: m.pose.yaw };
        model.root.position.set(p.x, groundHeight(p.x, p.z) + 0.02, p.z);
        model.root.rotation.set(0, p.yaw, 0);
        this.netPeers.set(m.id, p);
      }
      // Interpolate the small deltas; a gap over 60 m is a stall (a backgrounded tab, a
      // respawn, a lost snapshot) so the rig is placed outright instead of sliding.
      const dx = m.pose.x - p.x, dz = m.pose.z - p.z;
      const k = (dx * dx + dz * dz) > 3600 ? 1 : Math.min(1, rdt * 7);
      p.x += dx * k;
      p.z += dz * k;
      p.yaw += wrap(m.pose.yaw - p.yaw) * k;
      p.model.root.position.set(p.x, groundHeight(p.x, p.z) + 0.02, p.z);
      p.model.root.rotation.set(0, p.yaw, 0);
      p.model.trailer.visible = m.pose.trailer && !m.pose.onFoot;
      if (!dress) { p.model.root.updateMatrixWorld(true); continue; }
      p.model.update({ ...vs, speed: m.pose.kmh, rpm: 700 + Math.abs(m.pose.kmh) * 24, gear: m.pose.kmh > 1 ? 'D' : 'N',
        damage: m.pose.damage, indicator: m.pose.onFoot ? 2 : 0, handbrake: m.pose.onFoot, throttle: 0, brake: 0,
        slip: 0, steer: 0, steerAngle: 0, reversing: false, radio: false, overspeed: false, dt: this.netDress }, false);
      p.model.root.updateMatrixWorld(true);
    }
    for (const [id, p] of this.netPeers) if (!seen.has(id)) { this.scene.remove(p.model.root); this.netPeers.delete(id); }
    ui.convoyCount = net.count;
    ui.convoy = net.roster.map((m) => ({ name: m.name, dist: Math.round(Math.hypot(m.pose.x - sim.x, m.pose.z - sim.z)), cargo: m.pose.cargo, kmh: Math.round(m.pose.kmh) }));
  }

  /* ---------------------------------- camera ---------------------------------- */
  private updateCamera(rdt: number) {
    const cam = this.camera, sim = this.sim, tr = this.truck;
    if (!ui.started) {
      this.introTime += rdt;
      cam.fov = 55; cam.near = 0.6;
      cam.position.set(sim.x - 24 + Math.sin(this.introTime * 0.08) * 3, 9.5, sim.z + 25);
      cam.lookAt(sim.x - 4, 2.8, sim.z - 12);
      return;
    }
    if (this.mode === 'foot') {
      cam.fov = 72;
      cam.near = 0.1;
      cam.position.set(this.player.x, groundHeight(this.player.x, this.player.z) + 1.7, this.player.z);
      cam.rotation.set(this.player.pitch, this.player.yaw + Math.PI, 0, 'YXZ');
      return;
    }
    if (this.camMode === 'cab') {
      cam.fov = 80;
      cam.near = 0.12;
      if (!this.look.drag) {
        this.look.yaw *= Math.exp(-rdt * 2.5);
        this.look.pitch *= Math.exp(-rdt * 2.5);
      }
      /* ---- NUMPAD cab camera (seat height + head turn) ---- */
      const k = this.keys;
      const rise = (k.has('Numpad8') ? 1 : 0) - (k.has('Numpad2') ? 1 : 0);
      if (rise !== 0) this.camRise = Math.max(CAM_RISE_MIN, Math.min(CAM_RISE_MAX, this.camRise + rise * rdt * 0.30));
      // hold = look to the side, release = spring back to centre
      const headWant = ((k.has('Numpad4') ? 1 : 0) - (k.has('Numpad6') ? 1 : 0)) * HEAD_TURN;
      this.headYaw += (headWant - this.headYaw) * Math.min(1, rdt * 7);
      if (headWant === 0 && Math.abs(this.headYaw) < 0.0008) this.headYaw = 0;

      const eye = TRUCK.eye.clone();
      eye.y += this.camRise;
      // a turned head also moves the eye slightly towards that window
      eye.x += Math.sin(this.headYaw) * 0.1;
      tr.body.localToWorld(eye);
      cam.position.copy(eye);
      const q = new THREE.Quaternion();
      tr.body.getWorldQuaternion(q);
      const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      const lk = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(this.look.pitch - 0.12, this.look.yaw + this.headYaw - sim.steerIn * 0.035, 0, 'YXZ'),
      );
      cam.quaternion.copy(q).multiply(flip).multiply(lk);
      return;
    }
    cam.fov = 62;
    cam.near = 0.6;
    const far = this.camMode === 'far';
    const f = sim.fwd;
    const tx = sim.x - f.x * 3.5, tz = sim.z - f.z * 3.5;
    const target = (wrap(sim.heading) + wrap(sim.trailerYaw)) / 2;
    const tgtAngle = Math.abs(wrap(sim.trailerYaw - sim.heading)) > 0.01 ? sim.heading + wrap(sim.trailerYaw - sim.heading) * 0.2 : target;
    this.camAngle += wrap(tgtAngle - this.camAngle) * Math.min(1, rdt * 2.0);
    if (!this.look.drag) { this.orbit *= Math.exp(-rdt * 0.6); }
    const a = this.camAngle + this.orbit;
    const dist = (far ? 40 : 22) * this.chaseDist;
    const hgt = (far ? 20 : 7.2) * this.chaseDist + this.look.pitch * 10 + Math.abs(sim.vf) * 0.04;
    const want = new THREE.Vector3(tx - Math.sin(a) * dist, groundHeight(tx, tz) + Math.max(1.5, hgt), tz - Math.cos(a) * dist);
    want.y = Math.max(want.y, groundHeight(want.x, want.z) + 2.5);
    this.camPos.lerp(want, Math.min(1, rdt * 6));
    if (this.camPos.distanceTo(want) > 60) this.camPos.copy(want);
    cam.position.copy(this.camPos);
    cam.lookAt(tx + f.x * 5, groundHeight(tx, tz) + 2.4, tz + f.z * 5);
  }

  private renderMirrors() {
    const m = this.truck.mirrors[this.mirrorIdx];
    this.mirrorIdx = (this.mirrorIdx + 1) % this.truck.mirrors.length;
    const wp = new THREE.Vector3();
    m.anchor.getWorldPosition(wp);
    const q = new THREE.Quaternion();
    this.truck.root.getWorldQuaternion(q);
    const dir = new THREE.Vector3(m.side * 0.16, -0.05, -1).applyQuaternion(q);
    m.cam.position.copy(wp);
    m.cam.lookAt(wp.clone().add(dir));
    m.cam.updateMatrixWorld();
    const r = this.renderer;
    m.mesh.visible = false;
    r.setRenderTarget(m.rt);
    r.clear();
    r.render(this.scene, m.cam);
    r.setRenderTarget(null);
    m.mesh.visible = true;
  }

  private render(rdt: number) {
    if (!this.ready) return;
    this.updateCamera(rdt);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    updateLOD(this.camera.position.x, this.camera.position.z);
    this.renderer.info.reset();
    /* Shadow pass every other frame. It is a full 2048 render of every caster inside the
       sun frustum — by far the most expensive thing this scene does — and the shadow
       camera is a box that a rig at 80 km/h crosses 22 cm per frame at 60 fps: the
       aliasing is invisible, the saving is not. Anything that changes the light or drops
       new geometry in sets shadowDirty and refreshes immediately. */
    this.shadowFlip = (this.shadowFlip + 1) % 2;
    if (this.shadowFlip === 0 || this.shadowDirty) { this.renderer.shadowMap.needsUpdate = true; this.shadowDirty = false; }
    if (this.mode === 'cab' && this.camMode === 'cab') this.renderMirrors();
    this.post.render(this.scene, this.camera, this.atm.exposure, this.atm.rain, this.atm.night);
    // night-reactive name boards
    const ne: THREE.MeshStandardMaterial[] = (this.world.root as any).userData.nightExtra || [];
    for (const m of ne) m.emissiveIntensity = this.atm.night * 0.7;

    // AC-25 — measured performance baseline (shown in the F3 diagnostics panel)
    this.frames++;
    this.perfT += this.actualFrameTime;
    if (this.perfT >= 0.5) {
      const i = this.renderer.info.render;
      const ms = (this.perfT / this.frames) * 1000;
      ui.perf.fps = Math.round(1000 / Math.max(0.5, ms));
      ui.perf.ms = Math.round(ms * 10) / 10;
      ui.perf.calls = i.calls;
      ui.perf.tris = i.triangles;
      ui.perf.res = `${this.renderer.domElement.width}×${this.renderer.domElement.height}`;
      this.frames = 0;
      this.perfT = 0;
    }
    void extra;
  }
}

export const game = new Game();
