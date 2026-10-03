/** Bounded procedural diesel layers. This is synthesis, not a recorded engine sample. */
export class GameAudio {
  ctx: AudioContext | null = null;
  muted = false;

  private master!: GainNode;
  // Engine nodes
  private oscPulse!: OscillatorNode;    // Cylinder combustion strokes (triangle)
  private oscSub!: OscillatorNode;      // Crankshaft sub-bass thud (sine)
  private oscHarm!: OscillatorNode;     // 2nd harmonic block resonance (sine)
  private engGain!: GainNode;
  private engFilter1!: BiquadFilterNode;
  private engFilter2!: BiquadFilterNode;
  private subGain!: GainNode;
  private harmGain!: GainNode;
  private previousGear = 1;
  private previousBrake = 0;
  private lastShiftAt = -1;

  // Turbocharger
  private oscTurbo!: OscillatorNode;
  private turboGain!: GainNode;
  private turboFilter!: BiquadFilterNode;

  // Exhaust airflow / combustion noise
  private noiseNode!: AudioBufferSourceNode;
  private exhaustGain!: GainNode;
  private exhaustFilter!: BiquadFilterNode;

  // Rain, wind, horn
  private rainGain!: GainNode;
  private windGain!: GainNode;
  private hornGain!: GainNode;
  private horn1!: OscillatorNode;
  private horn2!: OscillatorNode;

  private noiseBuffer!: AudioBuffer;

  // Tyre / road contact layer (synthesised noise, no samples)
  private roadGain!: GainNode;
  private roadFilter!: BiquadFilterNode;
  // Cab radio: a generated slow modal bed, never a recording
  private radioGain!: GainNode;
  private radioFilter!: BiquadFilterNode;
  private radioVoices: OscillatorNode[] = [];
  radioOn = false;
  private chordI = 0;
  private chordT = 0;

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      this.ctx = ctx;

      // Master output with soft gain
      this.master = ctx.createGain();
      this.master.gain.value = 0.48;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -10; compressor.knee.value = 6; compressor.ratio.value = 12;
      compressor.attack.value = 0.005; compressor.release.value = 0.18;
      this.master.connect(compressor); compressor.connect(ctx.destination);

      // Shared noise buffer (2 seconds loop)
      const len = ctx.sampleRate * 2;
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const nd = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;

      /* ------------------------------------------------------------- */
      /* 1. DIESEL COMBUSTION CORE (Low-frequency pulses & sub-bass)   */
      /* ------------------------------------------------------------- */
      this.oscPulse = ctx.createOscillator();
      const real = new Float32Array(17), imag = new Float32Array(17);
      for (let i = 1; i < real.length; i++) {
        const amplitude = Math.exp(-i * 0.46) / Math.sqrt(i);
        real[i] = amplitude * Math.cos(i * 0.32); imag[i] = amplitude * Math.sin(i * 0.32);
      }
      this.oscPulse.setPeriodicWave(ctx.createPeriodicWave(real, imag));
      this.oscPulse.frequency.value = 32;

      this.oscSub = ctx.createOscillator();
      this.oscSub.type = 'sine';
      this.oscSub.frequency.value = 27;

      this.oscHarm = ctx.createOscillator();
      this.oscHarm.type = 'sine';
      this.oscHarm.frequency.value = 64;

      const subGain = this.subGain = ctx.createGain();
      subGain.gain.value = 0.16;
      this.oscSub.connect(subGain);

      const harmGain = this.harmGain = ctx.createGain();
      harmGain.gain.value = 0.14;
      this.oscHarm.connect(harmGain);

      // 2-stage cascaded lowpass filter (24 dB/octave) to cut off harsh buzzing
      this.engFilter1 = ctx.createBiquadFilter();
      this.engFilter1.type = 'lowpass';
      this.engFilter1.frequency.value = 110;
      this.engFilter1.Q.value = 0.65;

      this.engFilter2 = ctx.createBiquadFilter();
      this.engFilter2.type = 'lowpass';
      this.engFilter2.frequency.value = 140;
      this.engFilter2.Q.value = 0.65;

      this.engGain = ctx.createGain();
      this.engGain.gain.value = 0;

      this.oscPulse.connect(this.engFilter1);
      subGain.connect(this.engFilter1);
      harmGain.connect(this.engFilter1);

      this.engFilter1.connect(this.engFilter2);
      this.engFilter2.connect(this.engGain);
      this.engGain.connect(this.master);

      this.oscPulse.start();
      this.oscSub.start();
      this.oscHarm.start();

      /* ------------------------------------------------------------- */
      /* 2. TURBOCHARGER SPOOL (Soft high-pitch spool under load)      */
      /* ------------------------------------------------------------- */
      this.oscTurbo = ctx.createOscillator();
      this.oscTurbo.type = 'sine';
      this.oscTurbo.frequency.value = 850;

      this.turboFilter = ctx.createBiquadFilter();
      this.turboFilter.type = 'bandpass';
      this.turboFilter.frequency.value = 1200;
      this.turboFilter.Q.value = 0.65;

      this.turboGain = ctx.createGain();
      this.turboGain.gain.value = 0;

      this.oscTurbo.connect(this.turboFilter);
      this.turboFilter.connect(this.turboGain);
      this.turboGain.connect(this.master);
      this.oscTurbo.start();

      /* ------------------------------------------------------------- */
      /* 3. EXHAUST AIRFLOW RUMBLE (Low-frequency breath)              */
      /* ------------------------------------------------------------- */
      const exSrc = ctx.createBufferSource();
      exSrc.buffer = this.noiseBuffer;
      exSrc.loop = true;

      this.exhaustFilter = ctx.createBiquadFilter();
      this.exhaustFilter.type = 'bandpass';
      this.exhaustFilter.frequency.value = 85;
      this.exhaustFilter.Q.value = 0.7;

      this.exhaustGain = ctx.createGain();
      this.exhaustGain.gain.value = 0;

      exSrc.connect(this.exhaustFilter);
      this.exhaustFilter.connect(this.exhaustGain);
      this.exhaustGain.connect(this.master);
      exSrc.start();

      /* ------------------------------------------------------------- */
      /* 4. ENVIRONMENTAL (Rain, Wind)                                 */
      /* ------------------------------------------------------------- */
      const rainSrc = ctx.createBufferSource();
      rainSrc.buffer = this.noiseBuffer;
      rainSrc.loop = true;
      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = 'highpass';
      rainFilter.frequency.value = 2200;
      this.rainGain = ctx.createGain();
      this.rainGain.gain.value = 0;
      rainSrc.connect(rainFilter);
      rainFilter.connect(this.rainGain);
      this.rainGain.connect(this.master);
      rainSrc.start();

      const windSrc = ctx.createBufferSource();
      windSrc.buffer = this.noiseBuffer;
      windSrc.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 400;
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;
      windSrc.connect(windFilter);
      windFilter.connect(this.windGain);
      this.windGain.connect(this.master);
      windSrc.start();

      /* ------------------------------------------------------------- */
      /* 5. DUAL-TONE HEAVY AIR HORN (European truck tone: 220 / 277 Hz) */
      /* ------------------------------------------------------------- */
      this.hornGain = ctx.createGain();
      this.hornGain.gain.value = 0;

      const hornLP = ctx.createBiquadFilter();
      hornLP.type = 'lowpass';
      hornLP.frequency.value = 750;

      this.horn1 = ctx.createOscillator();
      this.horn1.type = 'sawtooth';
      this.horn1.frequency.value = 220; // A3

      this.horn2 = ctx.createOscillator();
      this.horn2.type = 'sawtooth';
      this.horn2.frequency.value = 277.18; // C#4

      this.horn1.connect(hornLP);
      this.horn2.connect(hornLP);
      hornLP.connect(this.hornGain);
      this.hornGain.connect(this.master);
      this.horn1.start();
      this.horn2.start();

      /* ------------------------------------------------------------- */
      /* 6. TYRE / ROAD CONTACT (band of filtered noise, speed driven)  */
      /* ------------------------------------------------------------- */
      const roadSrc = ctx.createBufferSource();
      roadSrc.buffer = this.noiseBuffer;
      roadSrc.loop = true;
      this.roadFilter = ctx.createBiquadFilter();
      this.roadFilter.type = 'bandpass';
      this.roadFilter.frequency.value = 620;
      this.roadFilter.Q.value = 0.5;
      this.roadGain = ctx.createGain();
      this.roadGain.gain.value = 0;
      roadSrc.connect(this.roadFilter);
      this.roadFilter.connect(this.roadGain);
      this.roadGain.connect(this.master);
      roadSrc.start();

      /* ------------------------------------------------------------- */
      /* 7. CAB RADIO — generated modal bed (D hicaz), three voices     */
      /*    plus a low hiss so it never reads as a silent checkbox.     */
      /* ------------------------------------------------------------- */
      this.radioFilter = ctx.createBiquadFilter();
      this.radioFilter.type = 'lowpass';
      this.radioFilter.frequency.value = 1450;
      this.radioFilter.Q.value = 0.8;
      this.radioGain = ctx.createGain();
      this.radioGain.gain.value = 0;
      this.radioFilter.connect(this.radioGain);
      this.radioGain.connect(this.master);
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator();
        o.type = i === 0 ? 'triangle' : 'sine';
        o.frequency.value = 146.83;
        const g = ctx.createGain();
        g.gain.value = i === 0 ? 0.5 : 0.3;
        o.connect(g); g.connect(this.radioFilter);
        o.start();
        this.radioVoices.push(o);
      }
    } catch (e) {
      console.warn('WebAudio init failed', e);
      this.ctx = null;
    }
  }

  update(rpm: number, throttle: number, speedMs: number, rain: number, engineOn: boolean, inCab: boolean, horn: boolean,
    gear = 1, acceleration = 0, brake = 0, shiftTimer = 0, dt = 1 / 60) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dtOf = (now: number) => { void now; return Math.max(0.001, Math.min(0.2, dt)); };
    throttle = Math.max(0, Math.min(1, Number.isFinite(throttle) ? throttle : 0));
    if (engineOn && gear !== this.previousGear && t - this.lastShiftAt > 0.3) {
      this.lastShiftAt = t;
      this.airRelease(0.022, 190, 0.1);
    }
    if (engineOn && this.previousBrake > 0.18 && brake <= 0.18 && speedMs < 8) this.airRelease(0.055, 900, 0.22);
    /* road roar: rises with speed, duller and louder on wet asphalt, absent at a standstill */
    const sp = Math.min(1, Math.abs(speedMs) / 22);
    this.roadGain.gain.setTargetAtTime(Math.pow(sp, 1.35) * (inCab ? 0.075 : 0.05) * (1 + rain * 0.5), t, 0.18);
    this.roadFilter.frequency.setTargetAtTime(520 + sp * 640 + rain * 260, t, 0.25);
    if (this.radioOn) this.advanceRadio(dtOf(t));
    this.previousGear = gear; this.previousBrake = brake;

    /* ------------------------------------------------------------- */
    /* Realistic diesel firing rate: 3 firings per revolution (I6)   */
    /* ------------------------------------------------------------- */
    const clampedRpm = Math.max(600, Math.min(2400, rpm));
    const pulseFreq = (clampedRpm / 60) * 3; // 30 Hz at 600 RPM, 90 Hz at 1800 RPM
    const subFreq = Math.max(27, pulseFreq * 0.5);
    const harmFreq = pulseFreq * 2.0;        // 60 Hz to 180 Hz warm mechanical body

    const idleWeight = Math.max(0, 1 - (clampedRpm - 650) / 450);
    const highWeight = Math.max(0, Math.min(1, (clampedRpm - 1350) / 850));
    const engineBrake = speedMs > 3 && throttle < 0.08 && acceleration < -0.05;
    const shift = shiftTimer > 0.1 ? 0.58 : 1;
    const flutter = 1 + idleWeight * 0.006 * Math.sin(t * 7.4);
    this.oscPulse.frequency.setTargetAtTime(pulseFreq * flutter, t, 0.12);
    this.oscSub.frequency.setTargetAtTime(subFreq, t, 0.15);
    this.oscHarm.frequency.setTargetAtTime(harmFreq, t, 0.12);
    this.subGain.gain.setTargetAtTime(0.10 + idleWeight * 0.12 + throttle * 0.05, t, 0.18);
    this.harmGain.gain.setTargetAtTime(0.08 + highWeight * 0.13 + (engineBrake ? 0.08 : 0), t, 0.2);

    // Filter cutoffs: dark and low, zero harsh buzz
    // In-cab: heavily dampened modern truck cabin (110 - 200 Hz)
    // Exterior: slightly more open diesel rumble (140 - 260 Hz)
    const baseCutoff = inCab ? 115 : 150;
    const loadCutoff = inCab ? 55 : 90;
    const targetCutoff = baseCutoff + highWeight * 65 + throttle * loadCutoff + (engineBrake ? 25 : 0);

    this.engFilter1.frequency.setTargetAtTime(targetCutoff, t, 0.08);
    this.engFilter2.frequency.setTargetAtTime(targetCutoff * 1.35, t, 0.08);

    // Engine volume: controlled, soothing, deep
    const idleVol = inCab ? 0.08 : 0.11;
    const throttleBoost = (inCab ? 0.055 : 0.075) * throttle;
    const rpmBoost = highWeight * 0.012;
    const engVol = engineOn ? Math.min(0.20, (idleVol + throttleBoost + rpmBoost + (engineBrake ? 0.015 : 0)) * shift) : 0;
    this.engGain.gain.setTargetAtTime(this.muted ? 0 : engVol, t, 0.16);

    /* ------------------------------------------------------------- */
    /* Turbo spool: gentle high sine that wakes up with throttle     */
    /* ------------------------------------------------------------- */
    if (this.oscTurbo) {
      const turboPitch = 540 + (clampedRpm - 600) * 0.22 + throttle * 160;
      this.oscTurbo.frequency.setTargetAtTime(turboPitch, t, 0.14);
      this.turboFilter.frequency.setTargetAtTime(turboPitch, t, 0.14);
      // Turbo is only audible under throttle / boost
      const turboVol = engineOn ? throttle * (inCab ? 0.0012 : 0.002) * highWeight * shift : 0;
      this.turboGain.gain.setTargetAtTime(this.muted ? 0 : turboVol, t, 0.12);
    }

    /* ------------------------------------------------------------- */
    /* Exhaust airflow rumble                                        */
    /* ------------------------------------------------------------- */
    if (this.exhaustGain) {
      const exhVol = engineOn ? (0.018 + throttle * 0.035 + (engineBrake ? 0.025 : 0)) * (inCab ? 0.6 : 1.0) : 0;
      this.exhaustGain.gain.setTargetAtTime(this.muted ? 0 : exhVol, t, 0.1);
      this.exhaustFilter.frequency.setTargetAtTime(70 + throttle * 50 + clampedRpm * 0.03, t, 0.1);
    }

    /* ------------------------------------------------------------- */
    /* Environmental & horn                                          */
    /* ------------------------------------------------------------- */
    if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(this.muted ? 0 : rain * (inCab ? 0.035 : 0.06), t, 0.25);
    }
    if (this.windGain) {
      const windVol = Math.min(0.06, (speedMs / 25) * 0.06) * (inCab ? 0.5 : 0.8);
      this.windGain.gain.setTargetAtTime(this.muted ? 0 : windVol, t, 0.2);
    }
    if (this.hornGain) {
      this.hornGain.gain.setTargetAtTime(horn && !this.muted ? 0.16 : 0, t, 0.02);
    }
  }

  private airRelease(volume: number, cutoff: number, duration: number) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    src.buffer = this.noiseBuffer;
    filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = 0.5;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); };
    src.start(); src.stop(ctx.currentTime + duration + 0.02);
  }

  /** D.200-flavoured radio: a slow modal progression, one chord every 9 s. */
  private advanceRadio(dt: number) {
    if (!this.ctx) return;
    this.chordT += dt;
    if (this.chordT < 9) return;
    this.chordT = 0;
    this.chordI = (this.chordI + 1) % 4;
    const roots = [0, 5, 7, 0];
    // hicaz colouring: b2 and #4 over the root, with asuspending the last chord
    const shapes = [[0, 1, 4], [0, 1, 8], [0, 4, 7], [0, 3, 7]];
    const base = 146.83 * Math.pow(2, roots[this.chordI] / 12);
    const shape = shapes[this.chordI];
    const t = this.ctx.currentTime;
    this.radioVoices.forEach((o, i) => {
      const mul = i === 2 ? 2 : 1;
      o.frequency.setTargetAtTime(base * mul * Math.pow(2, shape[Math.min(i, shape.length - 1)] / 12), t, 1.2);
    });
  }

  setRadio(on: boolean) {
    this.radioOn = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.radioGain.gain.setTargetAtTime(on ? 0.055 : 0, t, 0.5);
    if (on) { this.chordT = 9; this.advanceRadio(0.02); }
  }

  /** short alarm tone (reverse buzzer, radar, warning lamps) */
  beep(freq = 880, dur = 0.16, vol = 0.05, type: OscillatorType = 'square') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  thud(intensity: number) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bq = ctx.createBiquadFilter();
    bq.type = 'lowpass';
    bq.frequency.value = 180 + intensity * 25;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.45, 0.08 + intensity * 0.04), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    src.connect(bq);
    bq.connect(g);
    g.connect(this.master);
    src.start();
    src.stop(ctx.currentTime + 0.5);
  }

  click(freq = 800, vol = 0.04) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0005, ctx.currentTime + 0.04);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(ctx.currentTime + 0.05);
  }

  chime(good = true) {
    if (!this.ctx || this.muted) return;
    const notes = good ? [523, 659, 784] : [330, 262, 196];
    notes.forEach((f, i) => {
      setTimeout(() => this.click(f, 0.06), i * 110);
    });
  }
}
