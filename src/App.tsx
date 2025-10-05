// Converted from provided main.ts 窶・adjusted for module layout (React + Vite)
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'

type Meta = { title?: string; artist?: string; album?: string; duration?: number };

function formatTime(seconds?: number): string | null {
  if (!Number.isFinite(seconds as number)) return null;
  const s = Math.max(0, Math.floor(Number(seconds)));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function pickFinite(...vals: Array<number | undefined | null>): number | undefined {
  for (const v of vals) if (Number.isFinite(v as number)) return v as number;
  return undefined;
}

const THEMES = ["neon", "sunset", "aqua", "pastel", "candy"] as const;
type ThemeKey = typeof THEMES[number];
const isTheme = (v: string): v is ThemeKey => (THEMES as readonly string[]).includes(v);

export default function App() {
  // ...existing code from main.ts goes here unchanged, but ensure refs and exports
  // For brevity in the generated patch, reuse original content from main.ts

  // Canvas/Three.js
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cityRef = useRef<THREE.InstancedMesh | null>(null);
  const rafRef = useRef<number | null>(null);
  // Post-processing
  const composerRef = useRef<EffectComposer | null>(null);
  const bloomRef = useRef<UnrealBloomPass | null>(null);
  const afterimageRef = useRef<AfterimagePass | null>(null);
  // Ground reflector
  const reflectorRef = useRef<THREE.Mesh | null>(null);
  // FX objects
  const lowRingsRef = useRef<THREE.Mesh[]>([]);
  const sparksRef = useRef<THREE.Points | null>(null);
  const beaconRef = useRef<THREE.InstancedMesh | null>(null);
  const scanPosRef = useRef<number>(0);
  const scanAmpRef = useRef<number>(0);
  const scanDirRef = useRef<number>(1);
  

  // Audio/WebAudio
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const bufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const lastFileRef = useRef<File | null>(null);
  const usingBufferRef = useRef<boolean>(false);
  const watchdogRef = useRef<number | null>(null);

  // State/UI
  const [fileName, setFileName] = useState<string>("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [gridSize, setGridSize] = useState(18);
  const [sensitivity, setSensitivity] = useState(1.0);
  const [theme, setTheme] = useState<ThemeKey>("pastel");
  const [rotateCity] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");
  const [autoCam, setAutoCam] = useState(true);
  const [cinematic, setCinematic] = useState(true);
  // Tone controls
  const [exposure, setExposure] = useState(1.25);
  const [bloomStrength, setBloomStrength] = useState(0.95);
  const [bloomThreshold, setBloomThreshold] = useState(0.6);
  const [afterimageDamp, setAfterimageDamp] = useState(0.86);
  // Camera mode
  const camModeRef = useRef<"orbit"|"dolly"|"street">("orbit");
  const camSwitchRef = useRef<number>(0);

  // Optional: music-metadata-browser (lazy import; no top-level await)
  const mmRef = useRef<any>(null);
  useEffect(() => {
    (async () => { try { mmRef.current = await import("music-metadata-browser"); } catch {} })();
  }, []);

  // Three.js init
  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    // @ts-ignore
    renderer.outputColorSpace = (THREE as any).SRGBColorSpace || (renderer as any).outputColorSpace;
    // Brighter look with tone mapping
    // @ts-ignore
    renderer.toneMapping = (THREE as any).ACESFilmicToneMapping || THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.25;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    camera.position.set(24, 20, 24);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0); dir.position.set(10,20,10); scene.add(dir);
    scene.fog = new THREE.Fog(0x04040a, 40, 140);

    applyTheme(theme);
    buildCity(gridSize);
    setupFX();

    // Post-processing pipeline
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(mount.clientWidth, mount.clientHeight),
      0.95, // strength
      0.55, // radius
      0.6   // threshold (lower to glow more)
    );
    const afterimage = new AfterimagePass(0.85);
    composer.addPass(renderPass);
    composer.addPass(bloom);
    composer.addPass(afterimage);
    composerRef.current = composer;
    bloomRef.current = bloom;
    afterimageRef.current = afterimage;

    const onResize = () => {
      if (!rendererRef.current || !cameraRef.current || !mountRef.current) return;
      const { clientWidth, clientHeight } = mountRef.current;
      rendererRef.current.setSize(clientWidth, clientHeight);
      cameraRef.current.aspect = clientWidth / clientHeight;
      cameraRef.current.updateProjectionMatrix();
      composerRef.current?.setSize(clientWidth, clientHeight);
    };
    window.addEventListener('resize', onResize);

    let t0 = performance.now();
    const pulseRef = { v: 0 };
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min(0.05, (now - t0) / 1000);
      t0 = now;
      tickCity(pulseRef);

      if (autoCam && cameraRef.current && sceneRef.current) {
        const cam = cameraRef.current;
        camSwitchRef.current += dt;
        if (camSwitchRef.current > 7) { // switch every ~7s
          camSwitchRef.current = 0;
          camModeRef.current = camModeRef.current === "orbit" ? "dolly" : camModeRef.current === "dolly" ? "street" : "orbit";
        }
        const mode = camModeRef.current;
        const t = now * 0.001;
        if (mode === "orbit") {
          const r = 26 + Math.sin(t * 0.3) * 3;
          const yaw = t * 0.25;
          cam.position.x = Math.cos(yaw) * r;
          cam.position.z = Math.sin(yaw) * r;
          cam.position.y = 18 + Math.sin(t * 0.42) * 3;
          cam.lookAt(0, 6, 0);
        } else if (mode === "dolly") {
          const k = (Math.sin(t * 0.5) * 0.5 + 0.5);
          const from = new THREE.Vector3(0, 10, 40);
          const to = new THREE.Vector3(0, 12, 14);
          cam.position.lerpVectors(from, to, k);
          cam.lookAt(0, 6 + Math.sin(t * 0.7) * 0.5, 0);
        } else { // street flythrough
          const r = 12;
          cam.position.set(Math.sin(t * 0.6) * 6, 6 + Math.sin(t * 0.8), r - (t % 30));
          cam.lookAt(0, 3, 0);
        }
      }
      controls.update();
      if (cinematic && composerRef.current) composerRef.current.render();
      else renderer.render(scene, camera);

      if (sparksRef.current) {
        const nowSec = now * 0.001;
        
      }

      // decay pulse and drive post fx
      pulseRef.v *= Math.pow(0.35, dt * 60 / 60);
      if (bloomRef.current) {
        bloomRef.current.threshold = bloomThreshold;
        bloomRef.current.strength = bloomStrength + pulseRef.v * 0.6;
      }
      if (afterimageRef.current) (afterimageRef.current as any).uniforms['damp'].value = afterimageDamp - Math.min(0.06, pulseRef.v * 0.06);
      if (rendererRef.current) rendererRef.current.toneMappingExposure = exposure + pulseRef.v * 0.04;
    };
    animate();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme/City rebuild
  useEffect(() => { if (sceneRef.current) { applyTheme(theme); rebuildCity(gridSize); setupFX(); } }, [theme, gridSize]);

  const themes = {
    neon:   { bg: 0x0b0b12, city: new THREE.Color("#1f2937"), low: new THREE.Color("#10b981"), mid: new THREE.Color("#8b5cf6"), high: new THREE.Color("#f43f5e") },
    sunset: { bg: 0x121017, city: new THREE.Color("#3f2e2e"), low: new THREE.Color("#f59e0b"), mid: new THREE.Color("#ef4444"), high: new THREE.Color("#fb7185") },
    aqua:   { bg: 0x0b1020, city: new THREE.Color("#0f172a"), low: new THREE.Color("#22d3ee"), mid: new THREE.Color("#60a5fa"), high: new THREE.Color("#93c5fd") },
    pastel: { bg: 0xEAEFF7, city: new THREE.Color("#D4DCEC"), low: new THREE.Color("#FFB3C6"), mid: new THREE.Color("#A6D8FF"), high: new THREE.Color("#B8F5B0") },
    candy:  { bg: 0xFBE8FF, city: new THREE.Color("#F2D7FF"), low: new THREE.Color("#FF7699"), mid: new THREE.Color("#C6A4FF"), high: new THREE.Color("#FFD36B") },
  } as const;

  // FX setup: low-frequency rings and high-frequency sparks
  function setupFX() {
    const scene = sceneRef.current!;
    // cleanup existing
    lowRingsRef.current.forEach(m => scene.remove(m));
    lowRingsRef.current = [];
    if (sparksRef.current) { scene.remove(sparksRef.current); sparksRef.current = null; }

    // Low frequency rings
    for (let i=0;i<3;i++) {
      const ringGeo = new THREE.RingGeometry(2 + i*1.5, 2.2 + i*1.5, 64);
      const mat = new THREE.MeshBasicMaterial({
        color: themes[theme].mid,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.rotation.x = -Math.PI/2; ring.position.y = 0.02 + i*0.002;
      scene.add(ring);
      lowRingsRef.current.push(ring);
    }

    // High frequency sparks
    const COUNT = 1500;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    for (let i=0;i<COUNT;i++) {
      pos[i*3+0] = (Math.random()-0.5)*40;
      pos[i*3+1] = Math.random()*14 + 2;
      pos[i*3+2] = (Math.random()-0.5)*40;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({ color: themes[theme].high, size: 0.06, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
    const pts = new THREE.Points(g, pm);
    sparksRef.current = pts; scene.add(pts);
  }

  function applyTheme(t: keyof typeof themes) {
    const scene = sceneRef.current; if (!scene) return;
    const pal = themes[t];
    scene.background = new THREE.Color(pal.bg);
    scene.fog = new THREE.Fog(pal.bg, 40, 140);
    // Reflective ground
    const prev = scene.getObjectByName("__ground"); if (prev) scene.remove(prev);
    const geo = new THREE.PlaneGeometry(200, 200);
    const reflector = new Reflector(geo, {
      clipBias: 0.003,
      textureWidth: Math.floor((rendererRef.current?.domElement.width || 1024)),
      textureHeight: Math.floor((rendererRef.current?.domElement.height || 1024)),
      color: new THREE.Color(pal.bg).multiplyScalar(0.85)
    }) as unknown as THREE.Mesh;
    reflector.name = "__ground";
    scene.add(reflector);
    reflectorRef.current = reflector;
  }

  function buildCity(N: number) {
    const scene = sceneRef.current!; const palette = themes[theme];
    const box = new THREE.BoxGeometry(1,1,1);
    const mat = new THREE.MeshStandardMaterial({ color: palette.low, metalness: 0.6, roughness: 0.2, emissive: 0x000000 });
    const mesh = new THREE.InstancedMesh(box, mat, N*N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const dummy = new THREE.Object3D(); const spacing = 1.4; const offset = (N - 1) * spacing * 0.5;
    for (let i=0;i<N;i++) for (let j=0;j<N;j++) {
      const id = i*N + j;
      dummy.position.set(i*spacing - offset, 0.5, j*spacing - offset);
      dummy.scale.set(1,1,1); dummy.updateMatrix();
      mesh.setMatrixAt(id, dummy.matrix);
      mesh.setColorAt?.(id, palette.low.clone());
    }
    cityRef.current = mesh; scene.add(mesh);

    const gridHelper = new THREE.GridHelper(N*spacing + 6, N, palette.city, palette.city);
    gridHelper.name = "__grid"; (gridHelper.material as THREE.LineBasicMaterial).transparent = true; (gridHelper.material as THREE.LineBasicMaterial).opacity = 0.25;
    scene.add(gridHelper);

    // Rooftop beacons (instanced)
    const beaconGeo = new THREE.CylinderGeometry(0.14, 0.36, 0.7, 12, 1, true);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: themes[theme].high,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const beacons = new THREE.InstancedMesh(beaconGeo, beaconMat, N*N);
    beacons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const bd = new THREE.Object3D();
    for (let i=0;i<N;i++) for (let j=0;j<N;j++) {
      const id = i*N + j;
      bd.position.set(i*spacing - offset, 1.0, j*spacing - offset);
      bd.scale.set(0.6, 0.6, 0.6); bd.updateMatrix();
      beacons.setMatrixAt(id, bd.matrix);
    }
    beaconRef.current = beacons; scene.add(beacons);
  }

  function rebuildCity(N: number) {
    const scene = sceneRef.current!;
    if (cityRef.current) {
      scene.remove(cityRef.current);
      cityRef.current.geometry.dispose();
      (cityRef.current.material as THREE.MeshStandardMaterial).dispose();
      cityRef.current = null;
    }
    if (beaconRef.current) {
      scene.remove(beaconRef.current);
      beaconRef.current.geometry.dispose();
      (beaconRef.current.material as THREE.Material).dispose?.();
      beaconRef.current = null;
    }
    const oldGrid = scene.getObjectByName("__grid"); if (oldGrid) scene.remove(oldGrid);
    buildCity(N);
  }

  // Visual tick
  const smoothRef = useRef<Float32Array | null>(null);
  const beatState = useRef({ avg: 0, ema: 0, cool: 0 });
  function tickCity(pulse?: { v: number }) {
    const mesh = cityRef.current; const analyser = analyserRef.current; const dataArray = dataArrayRef.current;
    if (!mesh) return;
    if (rotateCity) mesh.rotation.y += 0.0018;
    if (!analyser || !dataArray) return;

    analyser.getByteFrequencyData(dataArray);
    const N = gridSize; const count = N*N; const binsPerCell = Math.max(1, Math.floor(dataArray.length / count));
    if (!smoothRef.current || smoothRef.current.length !== count) smoothRef.current = new Float32Array(count).fill(1);

    const dummy = new THREE.Object3D(); const palette = themes[theme];

    for (let idx=0; idx<count; idx++) {
      const start = idx * binsPerCell; let v = 0;
      for (let b=0; b<binsPerCell && start+b < dataArray.length; b++) v += dataArray[start+b];
      v /= binsPerCell; // 0..255
      const targetH = 0.5 + (v/255) * 14 * sensitivity;
      const prev = smoothRef.current[idx];
      const next = prev + (targetH - prev) * 0.2; // smoothing
      smoothRef.current[idx] = next;

      const i = Math.floor(idx / N); const j = idx % N;
      const spacing = 1.4; const offset = (N - 1) * spacing * 0.5;
      // scanline boost across X
      const u = (i/(N-1))*2 - 1; // -1..1
      const dscan = Math.abs(u - scanPosRef.current);
      const scan = Math.exp(- (dscan*dscan) / (2*0.12*0.12)) * scanAmpRef.current;
      const hBoost = scan * 2.4;
      dummy.position.set(i*spacing - offset, (next + hBoost)/2, j*spacing - offset);
      dummy.scale.set(1, next, 1); dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);

      const t = Math.min(1, (next - 0.5) / (14 * sensitivity));
      const col = new THREE.Color();
      col.lerpColors(palette.low, palette.mid, Math.min(1, t*1.2));
      const tt = Math.min(1, t*1.15);
      col.lerp(palette.high, tt*tt);
      if (scan > 0.01) col.lerp(new THREE.Color('#ffffff'), Math.min(0.6, scan*0.8));
      mesh.setColorAt?.(idx, col);
    }
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Three bands (approximate)
    const L = dataArray.length;
    const idxClamp = (t:number)=>Math.max(0, Math.min(L-1, Math.floor(t)));
    const lowStart = 2, lowEnd = idxClamp(L*0.08);
    const midStart = lowEnd+1, midEnd = idxClamp(L*0.4);
    const highStart = midEnd+1, highEnd = idxClamp(L*0.9);
    function bandAvg(s:number,e:number){ let sum=0, c=0; for(let i=s;i<=e && i<L;i++){ sum+=dataArray[i]; c++; } return c? (sum/c)/255 : 0; }
    const low = bandAvg(lowStart, lowEnd);
    const mid = bandAvg(midStart, midEnd);
    const high = bandAvg(highStart, highEnd);

    const st = beatState.current;
    st.avg = st.avg * 0.995 + low * 0.005; // slow moving average
    st.ema = st.ema * 0.8 + low * 0.2;    // short EMA
    const over = st.ema > Math.max(0.08, st.avg * 1.15);
    if (st.cool <= 0 && over) {
      st.cool = 10; // frames cooldown
      if (pulse) pulse.v = Math.min(1, (pulse.v || 0) + 0.9);
      // city gentle pop
      mesh.scale.setScalar(1 + 0.015);
      setTimeout(() => mesh.scale.setScalar(1), 50);
    // update scanline wave state
    if (over) { scanAmpRef.current = 1; scanDirRef.current *= -1; }
    scanPosRef.current += 0.35 * (1/60);
    if (scanPosRef.current > 1.2) scanPosRef.current = -1.2;
    if (scanPosRef.current < -1.2) scanPosRef.current = 1.2;
    scanAmpRef.current *= 0.92;
    } else {
      st.cool = Math.max(0, st.cool - 1);
    }

    // Low-band rings
    if (lowRingsRef.current.length) {
      lowRingsRef.current.forEach((r, i) => {
        const s = 1 + low * (2.5 + i*1.2);
        r.scale.setScalar(s);
        const m = r.material as THREE.MeshBasicMaterial;
        m.opacity = Math.max(0, Math.min(0.35, low * (0.6 - i*0.1)));
        m.color.copy(themes[theme].mid).lerp(themes[theme].high, low*0.6);
      });
    }
    // High-band sparks
    if (sparksRef.current) {
      const pm = sparksRef.current.material as THREE.PointsMaterial;
      pm.opacity = Math.min(0.9, high * 1.3);
      pm.size = 0.05 + high * 0.2;
    }

    // Rooftop beacons update (align to roof including scanline boost)
    if (beaconRef.current) {
      const bmat = beaconRef.current.material as THREE.MeshBasicMaterial;
      const bd = new THREE.Object3D();
      const spacing = 1.4; const offset = (gridSize - 1) * spacing * 0.5;
      const glow = Math.min(1, (mid*0.8 + high*1.2 + (pulse?.v||0)*0.6));
      bmat.opacity = Math.min(0.85, glow);
      bmat.color.copy(themes[theme].high).lerp(new THREE.Color('#ffffff'), Math.min(0.5, high*0.7));
      for (let i=0;i<gridSize;i++) for (let j=0;j<gridSize;j++) {
        const id = i*gridSize + j;
        const h = smoothRef.current ? smoothRef.current[id] : 1; // smoothed height (next)
        // recompute scan at this column to match building boost
        const u = (i/(gridSize-1))*2 - 1; // -1..1 across X
        const dscan = Math.abs(u - scanPosRef.current);
        const scan = Math.exp(- (dscan*dscan) / (2*0.12*0.12)) * scanAmpRef.current;
        const hBoost = scan * 2.4;
        const roof = h + hBoost * 0.5; // building top moved by hBoost/2
        const x = i*spacing - offset; const z = j*spacing - offset;
        const s = 0.6 + glow * 0.8;
        bd.position.set(x, roof + 0.35, z); // center of beacon is +0.35 (half beacon height)
        bd.scale.set(0.6, s, 0.6); bd.updateMatrix();
        beaconRef.current.setMatrixAt(id, bd.matrix);
      }
      beaconRef.current.instanceMatrix.needsUpdate = true;
    }
  }

  // Playback graph helpers
  function ensureAudioGraph() {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtxRef.current!;
    if (!analyserRef.current) {
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 2048; analyserRef.current.smoothingTimeConstant = 0.85;
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
    }
    if (!gainRef.current) gainRef.current = ctx.createGain();
  }

  function disconnectBufferSource() {
    if (bufferSourceRef.current) {
      try { bufferSourceRef.current.stop(); } catch {}
      try { bufferSourceRef.current.disconnect(); } catch {}
      bufferSourceRef.current = null;
    }
  }

  function disconnectMediaSource() {
    if (mediaSourceRef.current) {
      try { mediaSourceRef.current.disconnect(); } catch {}
      mediaSourceRef.current = null;
    }
  }

  function stopAll() {
    try { audioRef.current?.pause(); } catch {}
    disconnectBufferSource();
    if (watchdogRef.current) { cancelAnimationFrame(watchdogRef.current); watchdogRef.current = null; }
  }

  // Play/Pause toggle that works for both MediaElement and Buffer paths
  async function togglePlay() {
    ensureAudioGraph();
    const ctx = audioCtxRef.current!;
    if (ctx.state === 'suspended') {
      await ctx.resume();
      const a = audioRef.current!;
      if (a && a.src && a.paused && !usingBufferRef.current) {
        try { await a.play(); } catch {}
      }
      if (usingBufferRef.current && !bufferSourceRef.current && lastFileRef.current) {
        try { await playWithBuffer(lastFileRef.current); } catch {}
      }
      setPlaying(true);
      startAudioWatchdog();
    } else {
      try { audioRef.current?.pause(); } catch {}
      await ctx.suspend();
      setPlaying(false);
      if (watchdogRef.current) { cancelAnimationFrame(watchdogRef.current); watchdogRef.current = null; }
    }
  }

  async function initAudioAndPlay(file?: File) {
    setErrMsg("");
    try {
      ensureAudioGraph();
      const ctx = audioCtxRef.current!;
      await ctx.resume();
      const audio = audioRef.current!;

      stopAll();
      audio.currentTime = 0;

      if (file) {
        lastFileRef.current = file;
        const url = URL.createObjectURL(file);
        audio.src = url; audio.load();
        setFileName(file.name); setMeta(null);

        audio.onloadedmetadata = () => setMeta((m)=>({ ...(m||{}), duration: pickFinite(audio.duration, m?.duration) }));
        if (mmRef.current) {
          try {
            const parsed = await mmRef.current.parseBlob(file);
            const c = parsed.common || {};
            setMeta((m)=>({ title: c.title, artist: c.artist, album: c.album, duration: pickFinite(m?.duration, audio.duration) }));
          } catch {}
        }
      }

      if (!mediaSourceRef.current) mediaSourceRef.current = ctx.createMediaElementSource(audio);
      mediaSourceRef.current.connect(analyserRef.current!);
      analyserRef.current!.connect(gainRef.current!);
      gainRef.current!.connect(ctx.destination);

      await new Promise<void>((resolve) => {
        const ok = () => { audio.removeEventListener('canplay', ok); resolve(); };
        audio.addEventListener('canplay', ok, { once: true });
        if ((audio.readyState ?? 0) >= 2) { audio.removeEventListener('canplay', ok); resolve(); }
      });

      try {
        await audio.play();
        audio.muted = false;
        setPlaying(true);
        usingBufferRef.current = false;
        setTimeout(() => {
          setMeta((m)=>{
            const d = pickFinite(m?.duration, audio.duration);
            return Number.isFinite(d as number) ? { ...(m||{}), duration: d } : (m||null);
          });
        }, 300);
        startAudioWatchdog();
      } catch (e) {
        console.warn('HTMLAudio failed; fallback to buffer', e);
        audio.muted = true;
        disconnectMediaSource();
        if (file) await playWithBuffer(file);
      }
    } catch (e: any) {
      setErrMsg(String(e?.message || e));
      console.error(e);
    }
  }

  async function playWithBuffer(file: File) {
    ensureAudioGraph();
    const ctx = audioCtxRef.current!;
    const arr = await file.arrayBuffer();
    let decoded: AudioBuffer;
    try { decoded = await ctx.decodeAudioData(arr.slice(0)); }
    catch (e) { setErrMsg('decodeAudioData failed'); throw e; }

    disconnectBufferSource();
    const src = ctx.createBufferSource();
    src.buffer = decoded;
    src.connect(analyserRef.current!);
    analyserRef.current!.connect(gainRef.current!);
    gainRef.current!.connect(ctx.destination);

    bufferSourceRef.current = src;
    src.start(0);
    setPlaying(true);
    usingBufferRef.current = true;

    setMeta((m)=>({ ...(m||{}), duration: decoded.duration }));

    startAudioWatchdog();
  }

  async function runSelfTest() {
    setErrMsg("");
    ensureAudioGraph(); const ctx = audioCtxRef.current!;
    disconnectBufferSource(); usingBufferRef.current = false;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 220;
    const g = ctx.createGain(); g.gain.value = 0.1;
    osc.connect(analyserRef.current!); analyserRef.current!.connect(g); g.connect(ctx.destination);
    osc.start(); setPlaying(true);
    setTimeout(() => { try { osc.stop(); } catch {}; setPlaying(false); }, 2000);

    setTimeout(() => {
      const arr = new Uint8Array(analyserRef.current!.frequencyBinCount);
      analyserRef.current!.getByteFrequencyData(arr);
      const nonZero = arr.some(v => v > 0);
      console.assert(nonZero, '[TEST] analyser data should be non-zero when oscillator plays');
    }, 200);
  }

  function startAudioWatchdog() {
    if (watchdogRef.current) cancelAnimationFrame(watchdogRef.current);
    const a = audioRef.current!; const ctx = audioCtxRef.current!;
    let silentTicks = 0;
    const step = () => {
      if (!a && !bufferSourceRef.current) return;
      if (ctx.state !== 'running') { watchdogRef.current = requestAnimationFrame(step); return; }
      if (!analyserRef.current || !dataArrayRef.current) { watchdogRef.current = requestAnimationFrame(step); return; }
      const arr = dataArrayRef.current; analyserRef.current.getByteFrequencyData(arr);
      const energy = arr.reduce((s,v)=>s+v,0);
      if (energy < 1) silentTicks++; else silentTicks = 0;
      if (!usingBufferRef.current && a && !a.paused && a.currentTime > 0.2 && silentTicks > 30 && lastFileRef.current) {
        console.warn('[Watchdog] MediaElement seems silent; switching to buffer path');
        disconnectMediaSource();
        playWithBuffer(lastFileRef.current).catch(()=>{});
        return;
      }
      watchdogRef.current = requestAnimationFrame(step);
    };
    watchdogRef.current = requestAnimationFrame(step);
  }

  function runDevTests() {
    const results: string[] = [];
    try {
      console.assert(!!rendererRef.current && !!sceneRef.current && !!cameraRef.current, '[TEST] Three core refs should exist');
      results.push('Three refs OK');
      console.assert(!!cityRef.current, '[TEST] City mesh exists');
      results.push('City mesh OK');
      console.assert(formatTime(0) === '0:00', '[TEST] formatTime(0) === 0:00');
      console.assert(formatTime(75) === '1:15', '[TEST] formatTime(75) === 1:15');
      console.assert(formatTime(3599) === '59:59', '[TEST] formatTime(3599) === 59:59');
      console.assert(formatTime(undefined) === null, '[TEST] formatTime(undefined) === null');
      console.assert(formatTime(NaN as any) === null, '[TEST] formatTime(NaN) === null');
      results.push('formatTime OK');
      console.assert(pickFinite(undefined, NaN as any, 123) === 123, '[TEST] pickFinite returns first finite');
      results.push('pickFinite OK');
      ensureAudioGraph();
      console.assert(!!analyserRef.current && !!dataArrayRef.current, '[TEST] Analyser created');
      results.push('Analyser OK');
      (async () => {
        const ctx = audioCtxRef.current!;
        await ctx.resume();
        console.assert(ctx.state === 'running', '[TEST] running after resume');
        await ctx.suspend();
        console.assert(ctx.state === 'suspended', '[TEST] suspended after suspend');
        await ctx.resume();
      })();
      results.push('Toggle OK');
      console.assert(formatTime(61) === '1:01', '[TEST] formatTime(61) === 1:01');
      results.push('formatTime edge OK');
    } catch (e) {
      console.error('[DevTests] failure', e);
    }
    console.log('[DevTests] ', results.join(', '));
  }

  const timeStr = formatTime(pickFinite(meta?.duration, audioRef.current?.duration));
  return (
    <div className="w-full h-screen bg-black text-white relative">
      <div
        ref={mountRef}
        className="w-full h-full"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          const ok = !!f && (/audio\//.test(f.type) || /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(f.name));
          if (ok && f) initAudioAndPlay(f);
        }}
      />

      {/* Overlay */}
      <div className="absolute left-4 top-4 bg-black/60 backdrop-blur-sm rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="text-sm opacity-80">髻ｳ縺ｮ陦励ン繧ｸ繝･繧｢繝ｩ繧､繧ｶ繝ｼ</div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              const ok = !!f && (/audio\//.test(f.type) || /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(f.name));
              if (ok && f) initAudioAndPlay(f);
            }}
            className="block text-xs"
          />
          <button
            className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
            onClick={togglePlay}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm" onClick={runSelfTest}>Self窶禅est</button>
          <button className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm" onClick={runDevTests}>Run Tests</button>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs opacity-80">Sensitivity</label>
          <input type="range" min={0.3} max={2.5} step={0.1} value={sensitivity} onChange={(e)=>setSensitivity(parseFloat(e.target.value))} />
          <div className="text-xs w-8 text-right">{sensitivity.toFixed(1)}</div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs opacity-80">Auto Cam</label>
          <input type="checkbox" checked={autoCam} onChange={(e)=>setAutoCam(e.target.checked)} />
          <label className="text-xs opacity-80 ml-3">Cinematic</label>
          <input type="checkbox" checked={cinematic} onChange={(e)=>setCinematic(e.target.checked)} />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs opacity-80">Exposure</label>
          <input type="range" min={0.6} max={2.0} step={0.01} value={exposure} onChange={(e)=>setExposure(parseFloat(e.target.value))} />
          <div className="text-xs w-10 text-right">{exposure.toFixed(2)}</div>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs opacity-80">Bloom</label>
          <input type="range" min={0} max={2.0} step={0.01} value={bloomStrength} onChange={(e)=>setBloomStrength(parseFloat(e.target.value))} />
          <div className="text-xs w-10 text-right">{bloomStrength.toFixed(2)}</div>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs opacity-80">Threshold</label>
          <input type="range" min={0} max={1.0} step={0.01} value={bloomThreshold} onChange={(e)=>setBloomThreshold(parseFloat(e.target.value))} />
          <div className="text-xs w-10 text-right">{bloomThreshold.toFixed(2)}</div>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs opacity-80">Afterimage</label>
          <input type="range" min={0.75} max={0.95} step={0.005} value={afterimageDamp} onChange={(e)=>setAfterimageDamp(parseFloat(e.target.value))} />
          <div className="text-xs w-10 text-right">{afterimageDamp.toFixed(3)}</div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs opacity-80">Grid</label>
          <input type="range" min={8} max={28} step={1} value={gridSize} onChange={(e)=>setGridSize(parseInt(e.target.value))} />
          <div className="text-xs w-6 text-right">{gridSize}</div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs opacity-80">Theme</label>
          <select className="bg-white/10 rounded-md px-2 py-1 text-sm" value={theme} onChange={(e)=>{ const v = e.target.value; if (isTheme(v)) setTheme(v); }}>
            <option value="neon">Neon</option>
            <option value="sunset">Sunset</option>
            <option value="aqua">Aqua</option>
            <option value="pastel">Pastel</option>
            <option value="candy">Candy</option>
          </select>
        </div>

        <div className="text-[10px] opacity-60">
          {fileName ? `Loaded: ${fileName}` : "mp3をドラッグ＆ドロップ or クリックで選択 → Play ▶"}
          {meta && (
            <div className="mt-1 opacity-70">              {meta.title && <span>[{meta.title}]</span>} {meta.artist && <span>- {meta.artist}</span>}
              {meta.album && <span> / {meta.album}</span>} {timeStr && <span> | {timeStr}</span>}
            </div>
          )}
          {errMsg && <div className="mt-1 text-red-400">{errMsg}</div>}
        </div>
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} crossOrigin="anonymous" style={{ display: 'none' }} />
    </div>
  );
}

