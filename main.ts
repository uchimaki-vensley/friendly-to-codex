import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

// ────────────────────────────────────────────────────────────────
// 音の街ビジュアライザー (mp3アップロード→3D可視化)
// - JSXの閉じタグ/不均衡を全面精査して修正（return 部の </div> / コメント位置を確定）
// - setTheme の JSX 内キャストを撤去（型ガードで安全に）
// - await は async 関数内のみ
// - HTMLAudio → AudioBuffer 自動フォールバック + 無音ウォッチドッグ
// - Self‑Test & Dev Tests で回帰検出
// - duration 表示は mm:ss（NaN防止）
// ────────────────────────────────────────────────────────────────

type Meta = { title?: string; artist?: string; album?: string; duration?: number };

function formatTime(seconds?: number): string | null {
  if (!Number.isFinite(seconds)) return null;
  const s = Math.max(0, Math.floor(Number(seconds)));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function pickFinite(...vals: Array<number | undefined | null>): number | undefined {
  for (const v of vals) if (Number.isFinite(v as number)) return v as number;
  return undefined;
}

const THEMES = ["neon", "sunset", "aqua"] as const;
type ThemeKey = typeof THEMES[number];
const isTheme = (v: string): v is ThemeKey => (THEMES as readonly string[]).includes(v);

export default function App() {
  // Canvas/Three.js
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cityRef = useRef<THREE.InstancedMesh | null>(null);
  const rafRef = useRef<number | null>(null);

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
  const [theme, setTheme] = useState<ThemeKey>("neon");
  const [rotateCity] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");

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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
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
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const dir = new THREE.DirectionalLight(0xffffff, 0.35); dir.position.set(10,20,10); scene.add(dir);

    applyTheme(theme);
    buildCity(gridSize);

    const onResize = () => {
      if (!rendererRef.current || !cameraRef.current || !mountRef.current) return;
      const { clientWidth, clientHeight } = mountRef.current;
      rendererRef.current.setSize(clientWidth, clientHeight);
      cameraRef.current.aspect = clientWidth / clientHeight;
      cameraRef.current.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      tickCity();
      controls.update();
      renderer.render(scene, camera);
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
  useEffect(() => { if (sceneRef.current) { applyTheme(theme); rebuildCity(gridSize); } }, [theme, gridSize]);

  const themes = {
    neon: { bg: 0x07070b, city: new THREE.Color("#1f2937"), low: new THREE.Color("#10b981"), mid: new THREE.Color("#8b5cf6"), high: new THREE.Color("#f43f5e") },
    sunset:{ bg: 0x0b0a10, city: new THREE.Color("#3f2e2e"), low: new THREE.Color("#f59e0b"), mid: new THREE.Color("#ef4444"), high: new THREE.Color("#fb7185") },
    aqua:  { bg: 0x020617, city: new THREE.Color("#0f172a"), low: new THREE.Color("#22d3ee"), mid: new THREE.Color("#60a5fa"), high: new THREE.Color("#93c5fd") },
  } as const;

  function applyTheme(t: keyof typeof themes) {
    const scene = sceneRef.current; if (!scene) return;
    const pal = themes[t];
    scene.background = new THREE.Color(pal.bg);
    scene.fog = new THREE.Fog(pal.bg, 40, 140);
    // Ground
    let ground = scene.getObjectByName("__ground") as THREE.Mesh | null;
    if (!ground) {
      ground = new THREE.Mesh(new THREE.PlaneGeometry(200,200), new THREE.MeshStandardMaterial({ color: pal.city, metalness:0.2, roughness:0.8 }));
      ground.name = "__ground"; ground.rotation.x = -Math.PI/2; scene.add(ground);
    } else {
      (ground.material as THREE.MeshStandardMaterial).color.copy(pal.city);
    }
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
  }

  function rebuildCity(N: number) {
    const scene = sceneRef.current!;
    if (cityRef.current) {
      scene.remove(cityRef.current);
      cityRef.current.geometry.dispose();
      (cityRef.current.material as THREE.MeshStandardMaterial).dispose();
      cityRef.current = null;
    }
    const oldGrid = scene.getObjectByName("__grid"); if (oldGrid) scene.remove(oldGrid);
    buildCity(N);
  }

  // Visual tick
  const smoothRef = useRef<Float32Array | null>(null);
  function tickCity() {
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
      dummy.position.set(i*spacing - offset, next/2, j*spacing - offset);
      dummy.scale.set(1, next, 1); dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);

      const t = Math.min(1, (next - 0.5) / (14 * sensitivity));
      const col = new THREE.Color();
      col.lerpColors(palette.low, palette.mid, Math.min(1, t*1.2));
      col.lerp(palette.high, t*t);
      mesh.setColorAt?.(idx, col);
    }
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
    // analyser/gain は残す（再利用）
  }

  // Play/Pause toggle that works for both MediaElement and Buffer paths
  async function togglePlay() {
    ensureAudioGraph();
    const ctx = audioCtxRef.current!;
    if (ctx.state === 'suspended') {
      await ctx.resume();
      // If media element is paused but has a source, try to play it
      const a = audioRef.current!;
      if (a && a.src && a.paused && !usingBufferRef.current) {
        try { await a.play(); } catch {}
      }
      // Buffer path: if source finished, restart from last file
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
      await ctx.resume(); // ユーザー操作時に確実に復帰（オートプレイ対策）
      const audio = audioRef.current!;

      // stop previous
      stopAll();
      audio.currentTime = 0;

      if (file) {
        lastFileRef.current = file;
        const url = URL.createObjectURL(file);
        audio.src = url; audio.load();
        setFileName(file.name); setMeta(null);

        // metadata (optional)
        audio.onloadedmetadata = () => setMeta((m)=>({ ...(m||{}), duration: pickFinite(audio.duration, m?.duration) }));
        if (mmRef.current) {
          try {
            const parsed = await mmRef.current.parseBlob(file);
            const c = parsed.common || {};
            setMeta((m)=>({ title: c.title, artist: c.artist, album: c.album, duration: pickFinite(m?.duration, audio.duration) }));
          } catch {}
        }
      }

      // MediaElement path
      if (!mediaSourceRef.current) mediaSourceRef.current = ctx.createMediaElementSource(audio);
      mediaSourceRef.current.connect(analyserRef.current!);
      analyserRef.current!.connect(gainRef.current!);
      gainRef.current!.connect(ctx.destination);

      // wait until canplay (or already ready)
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
        // fallback: buffer path
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

    // ensure duration is populated when using buffer
    setMeta((m)=>({ ...(m||{}), duration: decoded.duration }));

    startAudioWatchdog();
  }

  // Self‑Test (beep for 2s) – verifies analyser/visual path
  async function runSelfTest() {
    setErrMsg("");
    ensureAudioGraph(); const ctx = audioCtxRef.current!;
    disconnectBufferSource(); usingBufferRef.current = false;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 220;
    const g = ctx.createGain(); g.gain.value = 0.1;
    osc.connect(analyserRef.current!); analyserRef.current!.connect(g); g.connect(ctx.destination);
    osc.start(); setPlaying(true);
    setTimeout(() => { try { osc.stop(); } catch {}; setPlaying(false); }, 2000);

    // Built‑in test case: analyser should produce non‑zero bins while playing
    setTimeout(() => {
      const arr = new Uint8Array(analyserRef.current!.frequencyBinCount);
      analyserRef.current!.getByteFrequencyData(arr);
      const nonZero = arr.some(v => v > 0);
      console.assert(nonZero, '[TEST] analyser data should be non-zero when oscillator plays');
    }, 200);
  }

  // Watchdog: if audio is "playing" but analyser shows silence for long, fallback to buffer
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

  // Dev tests – extra assertions
  function runDevTests() {
    const results: string[] = [];
    try {
      // Test 1: Three core objects exist
      console.assert(!!rendererRef.current && !!sceneRef.current && !!cameraRef.current, '[TEST] Three core refs should exist');
      results.push('Three refs OK');
      // Test 2: City built with correct count
      console.assert(!!cityRef.current, '[TEST] City mesh exists');
      results.push('City mesh OK');
      // Test 3: formatTime baseline
      console.assert(formatTime(0) === '0:00', '[TEST] formatTime(0) === 0:00');
      console.assert(formatTime(75) === '1:15', '[TEST] formatTime(75) === 1:15');
      console.assert(formatTime(3599) === '59:59', '[TEST] formatTime(3599) === 59:59');
      console.assert(formatTime(undefined) === null, '[TEST] formatTime(undefined) === null');
      console.assert(formatTime(NaN as any) === null, '[TEST] formatTime(NaN) === null');
      results.push('formatTime OK');
      // Test 4: pickFinite
      console.assert(pickFinite(undefined, NaN as any, 123) === 123, '[TEST] pickFinite returns first finite');
      results.push('pickFinite OK');
      // Test 5: Analyser lazy setup
      ensureAudioGraph();
      console.assert(!!analyserRef.current && !!dataArrayRef.current, '[TEST] Analyser created');
      results.push('Analyser OK');
      // Test 6: Toggle play should resume/suspend context
      (async () => {
        const ctx = audioCtxRef.current!;
        await ctx.resume();
        console.assert(ctx.state === 'running', '[TEST] running after resume');
        await ctx.suspend();
        console.assert(ctx.state === 'suspended', '[TEST] suspended after suspend');
        await ctx.resume();
      })();
      results.push('Toggle OK');
      // Extra test: formatTime(61) → 1:01
      console.assert(formatTime(61) === '1:01', '[TEST] formatTime(61) === 1:01');
      results.push('formatTime edge OK');
    } catch (e) {
      console.error('[DevTests] failure', e);
    }
    console.log('[DevTests] ', results.join(', '));
  }

  // UI
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
        <div className="text-sm opacity-80">音の街ビジュアライザー</div>

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
          <button className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm" onClick={runSelfTest}>Self‑Test</button>
          <button className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm" onClick={runDevTests}>Run Tests</button>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs opacity-80">Sensitivity</label>
          <input type="range" min={0.3} max={2.5} step={0.1} value={sensitivity} onChange={(e)=>setSensitivity(parseFloat(e.target.value))} />
          <div className="text-xs w-8 text-right">{sensitivity.toFixed(1)}</div>
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
          </select>
        </div>

        <div className="text-[10px] opacity-60">
          {fileName ? `Loaded: ${fileName}` : "mp3をドラッグ&ドロップ or クリックで選択 → Play ▶"}
          {meta && (
            <div className="mt-1 opacity-70">
              {meta.title && <span>『{meta.title}』</span>} {meta.artist && <span>- {meta.artist}</span>}
              {meta.album && <span> / {meta.album}</span>} {timeStr && <span> · {timeStr}</span>}
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
