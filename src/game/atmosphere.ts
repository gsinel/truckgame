import * as THREE from 'three';
import { bus } from './events';
import { updateMaterials, updateTrafficLightMats, extra } from './textures';

const sstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const C = (h: number) => new THREE.Color(h);

const SKY_VERT = `
varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKY_FRAG = `
precision highp float;
varying vec3 vDir;
uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 cloudColor;
uniform float night; uniform float rain; uniform float time;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0., 1.);
  vec3 col = mix(horizon, zenith, pow(h, 0.5));
  if (d.y < 0.) col = mix(horizon, horizon*0.55, clamp(-d.y*4., 0., 1.));
  float sd = max(dot(d, sunDir), 0.);
  col += sunColor * (pow(sd, 900.) * 8. + pow(sd, 10.) * 0.32 * (1.-rain));
  if (night > 0.02 && d.y > 0.) {
    vec3 q = floor(d * 260.);
    float s = hash3(q);
    float tw = 0.6 + 0.4*sin(time*2. + s*50.);
    col += vec3(step(0.9972, s)) * night * (1.-rain) * smoothstep(0., 0.25, d.y) * tw * 1.3;
    // moon glow
    col += vec3(0.5,0.6,0.9) * pow(max(dot(d, -sunDir),0.), 300.) * 2. * night * (1.-rain);
  }
  if (d.y > 0.01) {
    vec2 uv = d.xz / (d.y + 0.18) * 1.6 + vec2(time*0.006, time*0.002);
    uv = floor(uv * 28.) / 28.;
    float c = fbm(uv * 1.3);
    float cov = mix(0.52, 0.2, rain);
    c = smoothstep(cov, cov + 0.28, c);
    float fade = smoothstep(0.01, 0.2, d.y);
    col = mix(col, cloudColor, c * fade * (0.78 + 0.22 * rain));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export class Atmosphere {
  hour = 9.5;
  timeScale = 1; // 1 game hour = 60 s
  rain = 0;
  rainTarget = 0;
  night = 0;
  day = 1;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  skyMesh: THREE.Mesh;
  skyMat: THREE.ShaderMaterial;
  rainLines: THREE.LineSegments;
  rainPos: Float32Array;
  rainVel: Float32Array;
  lampLights: THREE.PointLight[] = [];
  lamps: { x: number; y: number; z: number }[] = [];
  private lampTimer = 0;
  time = 0;
  exposure = 1;
  autoWeather = false;
  private weatherTimer = 120;
  sunDirV = new THREE.Vector3();
  constructor(public scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 320;
    sc.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.12;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xaac8ff, 0x555044, 1.2);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xa8cdea, 0.0008);

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: new THREE.Color() }, cloudColor: { value: new THREE.Color() }, night: { value: 0 }, rain: { value: 0 }, time: { value: 0 },
      },
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1700, 32, 20), this.skyMat);
    this.skyMesh.frustumCulled = false;
    this.skyMesh.renderOrder = -10;
    scene.add(this.skyMesh);

    // environment map for reflections (gradient sky sphere)
    const envScene = new THREE.Scene();
    const eg = new THREE.SphereGeometry(50, 24, 16);
    const cols: number[] = [];
    const pos = eg.attributes.position;
    const top = C(0x6aa0e0), hor = C(0xd8e4f0), bot = C(0x6a6a60);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 50;
      const c = y > 0 ? hor.clone().lerp(top, Math.pow(y, 0.6)) : hor.clone().lerp(bot, Math.min(1, -y * 2));
      cols.push(c.r, c.g, c.b);
    }
    eg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    envScene.add(new THREE.Mesh(eg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envScene, 0.02).texture;
    pm.dispose();

    // rain
    const N = 2200;
    this.rainPos = new Float32Array(N * 6);
    this.rainVel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.rainVel[i] = 26 + Math.random() * 12;
      const x = (Math.random() - 0.5) * 60, y = Math.random() * 32, z = (Math.random() - 0.5) * 60;
      this.rainPos.set([x, y, z, x, y + 0.7, z], i * 6);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rainLines = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xb8c8d8, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.rainLines.frustumCulled = false;
    scene.add(this.rainLines);

    for (let i = 0; i < 6; i++) {
      const pl = new THREE.PointLight(0xffc880, 0, 30, 2);
      scene.add(pl);
      this.lampLights.push(pl);
    }
  }

  setWeather(w: 'clear' | 'rain', announce = true) {
    const nv = w === 'rain' ? 1 : 0;
    if (nv !== this.rainTarget) {
      this.rainTarget = nv;
      if (announce) bus.emit('WEATHER_CHANGED', { weather: w });
    }
  }
  get weather(): 'clear' | 'rain' {
    return this.rainTarget > 0.5 ? 'rain' : 'clear';
  }

  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3, playerLightsOn: boolean) {
    this.time += dt;
    this.hour = (this.hour + (dt * this.timeScale) / 60) % 24;
    this.rain += (this.rainTarget - this.rain) * Math.min(1, dt * 0.35);
    if (Math.abs(this.rain - this.rainTarget) < 0.002) this.rain = this.rainTarget;
    const rain = this.rain;

    if (this.autoWeather) {
      this.weatherTimer -= dt;
      if (this.weatherTimer < 0) {
        this.weatherTimer = 90 + Math.random() * 150;
        this.setWeather(Math.random() < 0.4 ? 'rain' : 'clear');
      }
    }

    const a = ((this.hour - 6) / 12) * Math.PI;
    const e = Math.sin(a);
    const dayF = sstep(-0.1, 0.22, e);
    const nightF = 1 - sstep(-0.14, 0.14, e);
    const warm = Math.exp(-Math.pow(e / 0.17, 2)) * (1 - rain * 0.65);
    this.day = dayF;
    this.night = nightF;
    this.sunDirV.set(Math.cos(a), Math.sin(a), 0.3).normalize();

    const zen = C(0x040814).lerp(C(0x3c78c8), dayF).lerp(C(0x34406e), warm * 0.5);
    const hor = C(0x0e1830).lerp(C(0xa8cdea), dayF).lerp(C(0xff9a58), warm * 0.85);
    const gz = C(0x2a3038).lerp(C(0x707c88), dayF), gh = C(0x3a424a).lerp(C(0x929ca6), dayF);
    zen.lerp(gz, rain * 0.85);
    hor.lerp(gh, rain * 0.8);
    const u = this.skyMat.uniforms;
    u.zenith.value.copy(zen);
    u.horizon.value.copy(hor);
    u.sunDir.value.copy(this.sunDirV);
    u.sunColor.value.copy(C(0xfff0d0).lerp(C(0xff8a40), warm)).multiplyScalar(1 - rain * 0.9);
    u.cloudColor.value.copy(C(0x1a2236).lerp(C(0xf4f4f6), dayF).lerp(C(0xffb890), warm * 0.5)).lerp(C(0x4a5058).multiplyScalar(0.3 + 0.7 * dayF), rain * 0.8);
    u.night.value = nightF;
    u.rain.value = rain;
    u.time.value = this.time;
    this.skyMesh.position.copy(camera.position);

    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(hor);
    fog.density = 0.00085 + rain * 0.0026 + nightF * 0.0002;

    // sun / moon
    const sunUp = e > 0;
    const snap = (v: number) => Math.round(v * 0.5) / 0.5;
    const fx = snap(focus.x), fz = snap(focus.z);
    this.sun.target.position.set(fx, focus.y, fz);
    if (sunUp) {
      this.sun.position.set(fx + this.sunDirV.x * 150, focus.y + this.sunDirV.y * 150, fz + this.sunDirV.z * 150);
      this.sun.color.copy(C(0xffffff).lerp(C(0xffa060), warm));
      this.sun.intensity = 4.4 * sstep(0.0, 0.2, e) * (1 - 0.72 * rain);
    } else {
      this.sun.position.set(fx - this.sunDirV.x * 150, focus.y - this.sunDirV.y * 150, fz - this.sunDirV.z * 150);
      this.sun.color.copy(C(0x7a9aff));
      this.sun.intensity = 0.7 * sstep(0.0, 0.3, -e) * (1 - 0.5 * rain);
    }
    this.hemi.color.copy(zen).lerp(C(0xffffff), 0.35);
    this.hemi.groundColor.copy(C(0x252a30).lerp(C(0x5c5848), dayF));
    this.hemi.intensity = (0.32 + 0.95 * dayF) * (1 - 0.18 * rain) + warm * 0.15;
    this.scene.environmentIntensity = 0.1 + 0.75 * dayF * (1 - 0.45 * rain) + 0.05;
    this.exposure = 1 + nightF * 0.35 + rain * 0.1;

    // lamp light pool
    this.lampTimer -= dt;
    if (this.lampTimer <= 0 && this.lamps.length) {
      this.lampTimer = 0.35;
      const c = this.lamps
        .map((l) => ({ l, d: (l.x - focus.x) ** 2 + (l.z - focus.z) ** 2 }))
        .filter((o) => o.d < 90 * 90)
        .sort((p, q) => p.d - q.d)
        .slice(0, this.lampLights.length);
      this.lampLights.forEach((pl, i) => {
        if (c[i]) pl.position.set(c[i].l.x, c[i].l.y, c[i].l.z);
        pl.userData.on = !!c[i];
      });
    }
    this.lampLights.forEach((pl) => (pl.intensity = pl.userData.on ? nightF * 420 : 0));

    // rain streaks around camera
    const rl = this.rainLines;
    (rl.material as THREE.LineBasicMaterial).opacity = rain * 0.5;
    rl.visible = rain > 0.03;
    if (rl.visible) {
      const N = this.rainVel.length;
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      const p = this.rainPos;
      for (let i = 0; i < N; i++) {
        const k = i * 6;
        p[k + 1] -= this.rainVel[i] * dt;
        p[k + 4] = p[k + 1] + 0.75;
        p[k] += 1.2 * dt; p[k + 3] = p[k] - 0.05;
        if (p[k + 1] < cy - 6) {
          const x = cx + (Math.random() - 0.5) * 60, z = cz + (Math.random() - 0.5) * 60, y = cy + 10 + Math.random() * 18;
          p[k] = x; p[k + 1] = y; p[k + 2] = z; p[k + 3] = x - 0.05; p[k + 4] = y + 0.75; p[k + 5] = z;
        }
        // keep within box
        if (Math.abs(p[k] - cx) > 32) { p[k] = cx + (Math.random() - 0.5) * 60; p[k + 3] = p[k]; }
        if (Math.abs(p[k + 2] - cz) > 32) { p[k + 2] = cz + (Math.random() - 0.5) * 60; p[k + 5] = p[k + 2]; }
      }
      rl.geometry.attributes.position.needsUpdate = true;
    }

    updateMaterials(nightF, rain, this.time);
    updateTrafficLightMats(this.time);
    void playerLightsOn;
    void extra;
  }

  hourText() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

/* ------------------------------------------------------------------ */
/*  Pixel-art post process: low-res target, filmic tone-map, palette   */
/*  quantisation + dithering. Canvas is upscaled with nearest filter.  */
/* ------------------------------------------------------------------ */
export class PostFX {
  rt: THREE.WebGLRenderTarget;
  quad: THREE.Mesh;
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene = new THREE.Scene();
  mat: THREE.ShaderMaterial;
  constructor(private renderer: THREE.WebGLRenderer, w: number, h: number) {
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true,
    });
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.rt.texture }, exposure: { value: 1 }, rain: { value: 0 }, night: { value: 0 }, res: { value: new THREE.Vector2(w, h) }, time: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        varying vec2 vUv; uniform sampler2D tDiffuse; uniform float exposure; uniform float rain; uniform float night; uniform vec2 res; uniform float time;
        vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.); }
        float dith(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb * exposure;
          c = aces(c);
          c = pow(c, vec3(1.0/2.2));
          float l = dot(c, vec3(0.299,0.587,0.114));
          c = mix(vec3(l), c, 1.12 - rain*0.3);
          c = (c - 0.5) * 1.06 + 0.5;
          vec2 q = vUv - 0.5;
          c *= 1.0 - 0.32 * dot(q, q);
          float lv = 36.0;
          c = floor(c * lv + dith(floor(vUv * res)) ) / lv;
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }
  setSize(w: number, h: number) {
    this.rt.setSize(w, h);
    this.mat.uniforms.res.value.set(w, h);
  }
  render(scene: THREE.Scene, camera: THREE.Camera, exposure: number, rain: number, night: number) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(null);
    this.mat.uniforms.exposure.value = exposure;
    this.mat.uniforms.rain.value = rain;
    this.mat.uniforms.night.value = night;
    r.render(this.scene, this.cam);
  }
}
