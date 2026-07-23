// Motor de audio del Reproductor — portado del prototipo standalone
// (synthplayer.html) de Qwen. Encapsula Web Audio, generador procedural,
// escaneo de archivos locales y visualizador. Es deliberadamente imperativo
// (no signals/preact) porque el grafo de audio y el canvas ya son estado
// mutable por naturaleza; la vista se suscribe vía subscribe()/notify().

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10], pentMajor: [0, 2, 4, 7, 9], pentMinor: [0, 3, 5, 7, 10] };
const SCALE_NAMES = Object.keys(SCALES);
const PROGRESSIONS = [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 4, 4], [5, 3, 0, 4], [0, 4, 1, 5], [0, 1, 3, 4]];
export const INST_NAMES = ['piano', 'bass', 'pad', 'lead', 'pluck'];
const STEPS_PER_BAR = 16, LOOKAHEAD = 0.1, TICK_MS = 25;
const SECTIONS = [
  { name: 'intro', bars: 4, energy: .3, inst: ['pad', 'hatC'] },
  { name: 'verse', bars: 8, energy: .6, inst: ['pad', 'bass', 'piano', 'kick', 'snare', 'hatC'] },
  { name: 'chorus', bars: 8, energy: 1, inst: ['pad', 'bass', 'lead', 'piano', 'kick', 'snare', 'hatC', 'hatO', 'clap'] },
  { name: 'verse', bars: 8, energy: .65, inst: ['pad', 'bass', 'piano', 'kick', 'snare', 'hatC'] },
  { name: 'chorus', bars: 8, energy: 1, inst: ['pad', 'bass', 'lead', 'pluck', 'kick', 'snare', 'hatC', 'hatO', 'clap'] },
  { name: 'outro', bars: 4, energy: .35, inst: ['pad', 'piano', 'hatC'] },
];
let TOTAL_BARS = 0; const BAR_SECTION = [];
SECTIONS.forEach(s => { for (let b = 0; b < s.bars; b++) BAR_SECTION.push(SECTIONS.indexOf(s)); TOTAL_BARS += s.bars; });
const TOTAL_STEPS = TOTAL_BARS * STEPS_PER_BAR;
const ADJ = ['Neon', 'Velvet', 'Crystal', 'Amber', 'Cobalt', 'Ember', 'Lunar', 'Solar', 'Violet', 'Echo', 'Drift', 'Hollow', 'Bright', 'Quiet', 'Wild'];
const NOUN = ['Dreams', 'Tides', 'Pulse', 'Horizon', 'Garden', 'Signal', 'Mirage', 'Cascade', 'Orbit', 'Static', 'Bloom', 'Engine', 'River', 'Comet', 'Glass'];
export const AUDIO_EXT = new Set(['mp3', 'flac', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'opus', 'webm']);
const IMG_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp']);
export const EQ_FREQS = [60, 230, 910, 3600, 14000];
export const EQ_PRESETS = { Flat: [0, 0, 0, 0, 0], 'Bass Boost': [6, 4, 0, 0, 0], Vocal: [-2, 0, 3, 3, 1], Treble: [0, 0, 0, 3, 6], Loudness: [5, 2, 0, 2, 5] };
export const VIZ_MODES = ['barras', 'onda', 'particulas', 'tunel', 'circular'];
export const ROLL_ROWS = 12, ROLL_COLS = 16;

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashSeed(s) { s = String(s); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function toSeed(v) { if (v === '' || v == null) return (Math.random() * 4294967296) >>> 0; if (typeof v === 'number') return v >>> 0; const n = Number(v); if (!isNaN(n) && String(n) === String(v).trim()) return n >>> 0; return hashSeed(v); }
function pick(rng, a) { return a[(rng() * a.length) | 0]; }
function rint(rng, a, b) { return a + ((rng() * (b - a + 1)) | 0); }
function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
export function fmtTime(s) { if (!isFinite(s) || s < 0) s = 0; s = s | 0; return ((s / 60) | 0) + ':' + String(s % 60).padStart(2, '0'); }
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
export function extOf(name) { const i = name.lastIndexOf('.'); return i < 0 ? '' : name.slice(i + 1).toLowerCase(); }
function titleFromName(name) { let t = name.replace(/\.[^.]+$/, ''); t = t.replace(/[_]+/g, ' '); t = t.replace(/\s+/g, ' ').trim(); return t || name; }

export function crearMotor({ audioEl }) {
  let listeners = new Set();
  const notify = () => listeners.forEach(fn => fn());

  let ctx = null, master = null, analyser = null, freqData = null, timeData = null, noiseBuffer = null;
  let eqNodes = [], dryGain = null, revGain = null, delNode = null, delFb = null, delGain = null, distNode = null, distGain = null;
  let mediaSrc = null, audioDirect = false;

  let library = [];       // {seed,title,fav}
  let localTracks = [];   // {rel,name,folder,ext,size,fav,_file,_handle}
  let fileFavs = {};      // rel -> true
  let settings = { vol: .8, eq: [0, 0, 0, 0, 0], fx: { rev: false, del: false, dist: false }, bpm: 110, _repeat: 0, _shuffle: false, view: 'grid', tab: 'all', viz: 0 };
  let queue = [];
  let curViewIndex = -1;
  let isPlaying = false, muted = false;
  let curItem = null, curSong = null;
  let currentStep = 0, nextNoteTime = 0, schedTimer = null;
  let vizMode = 0;
  let editorPattern = {}; INST_NAMES.forEach(k => editorPattern[k] = new Set());
  let edInst = 'piano', edPlaying = false, edStep = 0, edNext = 0, edTimer = null;
  let viewList = [];
  const BATCH = 60;
  let renderedCount = BATCH;
  let listView = false, search = '', tab = 'all';
  let folderCoverCache = {};
  let currentObjectURL = null;
  let scanning = false, scanCount = 0;
  let persist = null; // inyectado en init()

  function stepDur() { return 60 / settings.bpm / 4; }
  function procDuration() { return TOTAL_STEPS * stepDur(); }

  function buildSong(seed) {
    const rng = mulberry32(seed); const root = rint(rng, 0, 11); const scaleName = pick(rng, SCALE_NAMES);
    const scale = SCALES[scaleName]; const prog = pick(rng, PROGRESSIONS);
    const title = pick(rng, ADJ) + ' ' + pick(rng, NOUN);
    const h1 = seed % 360, h2 = (h1 + rint(rng, 40, 160)) % 360, h3 = (h1 + rint(rng, 180, 260)) % 360;
    return { seed: seed >>> 0, title, scaleName, scale, root, prog, colors: [h1, h2, h3] };
  }
  function scaleNote(scale, root, base, deg) { const len = scale.length; const oct = Math.floor(deg / len); const idx = ((deg % len) + len) % len; return base + root + scale[idx] + 12 * oct; }

  // ---- audio graph ----
  function ensureAudio() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : settings.vol;
    eqNodes = EQ_FREQS.map((f, i) => { const b = ctx.createBiquadFilter(); b.type = 'peaking'; b.frequency.value = f; b.Q.value = 1; b.gain.value = settings.eq[i] || 0; return b; });
    for (let i = 0; i < eqNodes.length - 1; i++) eqNodes[i].connect(eqNodes[i + 1]);
    const eqOut = eqNodes[eqNodes.length - 1];
    const dryGain = ctx.createGain(); dryGain.gain.value = 1;
    revGain = ctx.createGain(); revGain.gain.value = 0;
    delGain = ctx.createGain(); delGain.gain.value = 0;
    distGain = ctx.createGain(); distGain.gain.value = 0;
    const revNode = ctx.createConvolver(); revNode.buffer = makeImpulse(1.6, 2.2);
    delNode = ctx.createDelay(1.0); delNode.delayTime.value = 0.3;
    delFb = ctx.createGain(); delFb.gain.value = 0.32;
    delNode.connect(delFb); delFb.connect(delNode);
    distNode = ctx.createWaveShaper(); distNode.curve = makeDistCurve(40); distNode.oversample = '2x';
    master.connect(eqNodes[0]);
    eqOut.connect(dryGain); eqOut.connect(revNode); revNode.connect(revGain);
    eqOut.connect(delNode); delNode.connect(delGain); eqOut.connect(distNode); distNode.connect(distGain);
    analyser = ctx.createAnalyser();
    const hc = navigator.hardwareConcurrency || 4;
    analyser.fftSize = (hc < 4) ? 1024 : 2048;
    analyser.smoothingTimeConstant = 0.82;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    timeData = new Uint8Array(analyser.fftSize);
    dryGain.connect(analyser); revGain.connect(analyser); delGain.connect(analyser); distGain.connect(analyser);
    analyser.connect(ctx.destination);
    try { mediaSrc = ctx.createMediaElementSource(audioEl); mediaSrc.connect(master); audioDirect = false; }
    catch (e) { audioDirect = true; }
    applyFx();
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuffer.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }
  function makeImpulse(dur, decay) { const len = ctx.sampleRate * dur, imp = ctx.createBuffer(2, len, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = imp.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); } return imp; }
  function makeDistCurve(amount) { const n = 1024, c = new Float32Array(n), k = amount; for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); } return c; }
  function applyFx() { if (!ctx) return; revGain.gain.value = settings.fx.rev ? 0.35 : 0; delGain.gain.value = settings.fx.del ? 0.3 : 0; distGain.gain.value = settings.fx.dist ? 0.4 : 0; }

  const PAN = { piano: -.1, bass: 0, pad: .15, lead: .25, pluck: -.2 };
  function panNode(pan) { const p = ctx.createStereoPanner(); p.pan.value = pan || 0; p.connect(master); return p; }
  function adsr(g, t, vel, a, d, s, r, peak) { peak = peak == null ? vel : peak; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * s), t + a + d); g.gain.setValueAtTime(Math.max(0.0001, peak * s), t + a + d); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + r); }
  function playNote(t, midi, vel, dur, inst) {
    const f = midiToFreq(midi); const pan = PAN[inst] || 0;
    if (inst === 'piano') {
      const g = ctx.createGain(); g.gain.value = 0; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4000; g.connect(lp); lp.connect(panNode(pan));
      [1, 2, 3].forEach((mult, i) => { const o = ctx.createOscillator(); o.type = i === 0 ? 'triangle' : 'sine'; o.frequency.value = f * mult; const og = ctx.createGain(); og.gain.value = i === 0 ? 1 : 0.3 / i; o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.4); });
      adsr(g, t, vel, 0.005, 0.25, 0.5, 0.3, vel * 0.5);
    } else if (inst === 'bass') {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(panNode(pan));
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = f / 2;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1200, t); lp.frequency.exponentialRampToValueAtTime(300, t + dur);
      o.connect(lp); sub.connect(lp); lp.connect(g); o.start(t); sub.start(t); o.stop(t + dur + 0.1); sub.stop(t + dur + 0.1);
      adsr(g, t, vel, 0.01, 0.1, 0.7, 0.08, vel * 0.6);
    } else if (inst === 'pad') {
      const g = ctx.createGain(); g.gain.value = 0; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.connect(g); g.connect(panNode(pan));
      for (let i = 0; i < 5; i++) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (i - 2) * 6; const og = ctx.createGain(); og.gain.value = 0.2; o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 1.2); }
      adsr(g, t, vel, 0.5, 0.2, 0.8, 1.0, vel * 0.35);
    } else if (inst === 'lead') {
      const g = ctx.createGain(); g.gain.value = 0; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(900, t + dur); lp.connect(g); g.connect(panNode(pan));
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f * 2.01; const og = ctx.createGain(); og.gain.value = 0.3; o2.connect(og);
      o.connect(lp); og.connect(lp); o.start(t); o2.start(t); o.stop(t + dur + 0.3); o2.stop(t + dur + 0.3);
      adsr(g, t, vel, 0.01, 0.1, 0.6, 0.2, vel * 0.4);
    } else if (inst === 'pluck') {
      const g = ctx.createGain(); g.gain.value = 0; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(600, t + 0.2); lp.connect(g); g.connect(panNode(pan));
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.connect(lp); o.start(t); o.stop(t + dur + 0.3);
      adsr(g, t, vel, 0.002, 0.15, 0.2, 0.15, vel * 0.5);
    }
  }
  function playDrum(t, type, vel) {
    if (type === 'kick') { const o = ctx.createOscillator(); o.type = 'sine'; const g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.08); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.32); }
    else if (type === 'snare') { const ns = ctx.createBufferSource(); ns.buffer = noiseBuffer; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; const ng = ctx.createGain(); ng.gain.setValueAtTime(vel * 0.7, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12); ns.connect(bp); bp.connect(ng); ng.connect(master); ns.start(t); ns.stop(t + 0.13); const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 180; const og = ctx.createGain(); og.gain.setValueAtTime(vel * 0.4, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1); o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.11); }
    else if (type === 'hatC' || type === 'hatO') { const ns = ctx.createBufferSource(); ns.buffer = noiseBuffer; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000; const g = ctx.createGain(); const dec = type === 'hatO' ? 0.2 : 0.04; g.gain.setValueAtTime(vel * 0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + dec); ns.connect(hp); hp.connect(g); g.connect(master); ns.start(t); ns.stop(t + dec + 0.02); }
    else if (type === 'clap') { for (let k = 0; k < 3; k++) { const ns = ctx.createBufferSource(); ns.buffer = noiseBuffer; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; const g = ctx.createGain(); const st = t + k * 0.012; g.gain.setValueAtTime(vel * 0.5, st); g.gain.exponentialRampToValueAtTime(0.001, st + 0.08); ns.connect(bp); bp.connect(g); g.connect(master); ns.start(st); ns.stop(st + 0.09); } }
  }
  function scheduleStep(step, t) {
    const bar = (step / STEPS_PER_BAR) | 0, s = step % STEPS_PER_BAR;
    const sec = SECTIONS[BAR_SECTION[bar]]; const song = curSong; const scale = song.scale, root = song.root;
    const deg = song.prog[bar % song.prog.length]; const inst = sec.inst; const E = sec.energy;
    const rng = mulberry32((song.seed * 1009 >>> 0) ^ (bar * 131 + 7) ^ (s * 17));
    if (s === 0 && inst.indexOf('pad') >= 0) { [0, 2, 4].forEach(d => playNote(t, scaleNote(scale, root, 48, deg + d), 0.5, STEPS_PER_BAR * stepDur(), 'pad')); }
    if (inst.indexOf('bass') >= 0) { const bs = E > 0.8 ? [0, 4, 8, 10, 12] : [0, 8]; if (bs.indexOf(s) >= 0) playNote(t, scaleNote(scale, root, 36, deg), 0.7, stepDur() * 3, 'bass'); }
    if ((inst.indexOf('lead') >= 0 || inst.indexOf('piano') >= 0 || inst.indexOf('pluck') >= 0) && rng() < 0.35 + E * 0.3) { const useLead = inst.indexOf('lead') >= 0 && E > 0.7; const mInst = useLead ? 'lead' : (inst.indexOf('pluck') >= 0 && rng() < 0.5 ? 'pluck' : 'piano'); let md = deg; if (rng() < 0.5) md = deg + pick(rng, [0, 2, 4]); else md = deg + rint(rng, -2, 4); const note = scaleNote(scale, root, 60, md) + (useLead ? 12 : 0); const len = pick(rng, [1, 1, 2, 2, 3]); playNote(t, note, 0.5, stepDur() * len * 0.9, mInst); }
    if (inst.indexOf('kick') >= 0) { let ks = [0, 8]; if (E > 0.7 && rng() < 0.5) ks.push(rng() < 0.5 ? 6 : 10); if (ks.indexOf(s) >= 0) playDrum(t, 'kick', 0.9); }
    if (inst.indexOf('snare') >= 0 && (s === 4 || s === 12)) playDrum(t, 'snare', 0.7);
    if (inst.indexOf('hatC') >= 0 && s % 2 === 0 && rng() < 0.6 + E * 0.4) playDrum(t, 'hatC', 0.4);
    if (inst.indexOf('hatO') >= 0 && s === 14 && rng() < 0.6) playDrum(t, 'hatO', 0.4);
    if (inst.indexOf('clap') >= 0 && s === 12 && E > 0.8 && rng() < 0.5) playDrum(t, 'clap', 0.6);
  }

  // ---- transporte ----
  function scheduler() { while (nextNoteTime < ctx.currentTime + LOOKAHEAD) { if (currentStep >= TOTAL_STEPS) { endOfSong(); return; } scheduleStep(currentStep, nextNoteTime); nextNoteTime += stepDur(); currentStep++; } }
  function play() {
    ensureAudio(); if (ctx.state === 'suspended') ctx.resume();
    if (curViewIndex < 0 && viewList.length) loadItem(0);
    if (!curItem) return;
    if (isPlaying) return;
    isPlaying = true;
    if (curItem.kind === 'proc') { nextNoteTime = ctx.currentTime + 0.06; if (schedTimer) clearInterval(schedTimer); schedTimer = setInterval(scheduler, TICK_MS); }
    else startFilePlayback();
    notify();
  }
  function startFilePlayback() {
    if (audioDirect) audioEl.volume = muted ? 0 : settings.vol;
    const p = audioEl.play();
    if (p && p.catch) p.catch(() => { isPlaying = false; notify(); });
  }
  function pause() { isPlaying = false; if (schedTimer) { clearInterval(schedTimer); schedTimer = null; } if (curItem && curItem.kind === 'file') audioEl.pause(); notify(); }
  function stop() { pause(); currentStep = 0; if (curItem && curItem.kind === 'file') { audioEl.pause(); audioEl.currentTime = 0; } notify(); }
  function togglePlay() { if (isPlaying) pause(); else play(); }
  function endOfSong() {
    pause();
    if (settings._repeat === 2) { currentStep = 0; if (curItem && curItem.kind === 'file') audioEl.currentTime = 0; play(); return; }
    const nx = nextTrackIndex();
    if (nx >= 0) { loadItem(nx); currentStep = 0; play(); }
    else { currentStep = 0; notify(); }
  }
  audioEl.addEventListener('ended', () => { if (curItem && curItem.kind === 'file') endOfSong(); });
  function nextTrackIndex() {
    if (queue.length) return queue.shift();
    if (!viewList.length) return -1;
    let i = curViewIndex + 1;
    if (i >= viewList.length) { if (settings._repeat === 1) i = 0; else return -1; }
    return i;
  }
  function prevTrackIndex() { if (!viewList.length) return -1; let i = curViewIndex - 1; if (i < 0) i = viewList.length - 1; return i; }
  function sameItem(a, b) { if (!a || !b) return false; if (a.kind !== b.kind) return false; if (a.kind === 'proc') return a.idx === b.idx && a.seed === b.seed; return a.rel === b.rel; }
  function loadItem(i) {
    if (i < 0 || i >= viewList.length) return;
    curViewIndex = i; curItem = viewList[i];
    if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
    if (curItem.kind === 'proc') { curSong = buildSong(curItem.seed); audioEl.pause(); }
    else { curSong = null; audioEl.pause(); loadFileIntoAudio(curItem); }
    notify();
  }
  function loadFileIntoAudio(item) {
    if (currentObjectURL) { URL.revokeObjectURL(currentObjectURL); currentObjectURL = null; }
    const blobOrFile = item._file;
    if (blobOrFile) { currentObjectURL = URL.createObjectURL(blobOrFile); audioEl.src = currentObjectURL; }
    else if (item._handle) { item._handle.getFile().then(f => { item._file = f; currentObjectURL = URL.createObjectURL(f); audioEl.src = currentObjectURL; if (isPlaying) startFilePlayback(); }).catch(() => {}); }
  }
  function seek(frac) {
    if (!curItem) return;
    if (curItem.kind === 'proc') { currentStep = clamp(Math.floor(frac * TOTAL_STEPS), 0, TOTAL_STEPS); if (isPlaying) nextNoteTime = ctx.currentTime + 0.06; }
    else if (isFinite(audioEl.duration)) audioEl.currentTime = frac * audioEl.duration;
    notify();
  }

  // ---- carátulas ----
  const coverCache = {};
  function makeCover(seed, colors) {
    if (coverCache[seed]) return coverCache[seed];
    if (!colors) { const rng = mulberry32(seed); colors = [seed % 360, (seed * 7 + rint(rng, 40, 160)) % 360, (seed * 13 + 180) % 360]; }
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 256, 256);
    g.addColorStop(0, 'hsl(' + colors[0] + ' 70% 45%)'); g.addColorStop(0.5, 'hsl(' + colors[1] + ' 65% 35%)'); g.addColorStop(1, 'hsl(' + colors[2] + ' 60% 25%)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const rng = mulberry32(seed ^ 0x9e37);
    for (let i = 0; i < 14; i++) { x.globalAlpha = 0.08 + rng() * 0.18; x.fillStyle = 'hsl(' + colors[(rng() * 3) | 0] + ' 80% ' + (50 + rng() * 30) + '%)'; const sh = (rng() * 3) | 0, px = rng() * 256, py = rng() * 256, sz = 20 + rng() * 70; if (sh === 0) { x.beginPath(); x.arc(px, py, sz / 2, 0, 7); x.fill(); } else if (sh === 1) { x.fillRect(px - sz / 2, py - sz / 2, sz, sz); } else { x.beginPath(); x.moveTo(px, py - sz / 2); x.lineTo(px + sz / 2, py + sz / 2); x.lineTo(px - sz / 2, py + sz / 2); x.closePath(); x.fill(); } }
    x.globalAlpha = 1; const url = c.toDataURL(); coverCache[seed] = url; return url;
  }
  function procCoverForFile(title) { return makeCover(hashSeed(title) || 1, null); }
  function coverURLForFolder(folder, title) {
    const e = folderCoverCache[folder];
    if (e && e.url) return e.url;
    if (!e) folderCoverCache[folder] = { url: null, loading: false, proc: procCoverForFile(title || folder) };
    return folderCoverCache[folder].proc;
  }
  function ensureFolderCover(folder) {
    const e = folderCoverCache[folder]; if (!e || e.loading || e.url || !e.getter) return;
    e.loading = true;
    Promise.resolve(e.getter()).then(file => {
      if (!file) { e.loading = false; return; }
      e.url = URL.createObjectURL(file); notify();
    }).catch(() => { e.loading = false; });
  }
  function coverFor(item) {
    if (item.kind === 'proc') { const song = buildSong(item.seed); return makeCover(item.seed, song.colors); }
    return coverURLForFolder(item.folder, item.title);
  }

  // ---- visualizador ----
  let particles = []; let tunnelR = 0; let energyHist = []; let beatFlash = 0;
  function curColors() { if (curSong) return curSong.colors; if (curItem) return [hashSeed(curItem.title) % 360, (hashSeed(curItem.folder || 'x') + 120) % 360, (hashSeed(curItem.ext || 'y') + 240) % 360]; return [210, 280, 330]; }
  function detectBeat() { if (!analyser) return false; let bass = 0; for (let i = 0; i < 10; i++) bass += freqData[i]; bass /= 10; energyHist.push(bass); if (energyHist.length > 43) energyHist.shift(); const avg = energyHist.reduce((a, b) => a + b, 0) / energyHist.length; return bass > avg * 1.35 && bass > 120; }
  function drawViz(canvas) {
    if (!canvas) return;
    const vx = canvas.getContext('2d'); const W = canvas.width, H = canvas.height;
    vx.fillStyle = 'rgba(8,9,13,0.28)'; vx.fillRect(0, 0, W, H);
    if (!analyser) return;
    analyser.getByteFrequencyData(freqData); analyser.getByteTimeDomainData(timeData);
    if (detectBeat()) beatFlash = 1; beatFlash *= 0.9;
    const cols = curColors();
    vx.globalAlpha = 0.06 + beatFlash * 0.12; const g = vx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) / 1.2); g.addColorStop(0, 'hsl(' + cols[0] + ' 70% 50%)'); g.addColorStop(1, 'rgba(0,0,0,0)'); vx.fillStyle = g; vx.fillRect(0, 0, W, H); vx.globalAlpha = 1;
    const mode = VIZ_MODES[vizMode];
    if (mode === 'barras') drawBars(vx, W, H, cols); else if (mode === 'onda') drawWave(vx, W, H, cols); else if (mode === 'particulas') drawParticles(vx, W, H, cols); else if (mode === 'tunel') drawTunnel(vx, W, H, cols); else drawCircular(vx, W, H, cols);
  }
  function drawBars(vx, W, H, cols) { const N = 64, bw = W / N; for (let i = 0; i < N; i++) { const v = freqData[i * 2] / 255; const h = v * H * 0.8; vx.fillStyle = 'hsl(' + ((cols[0] + i * 2) % 360) + ' 80% ' + (45 + v * 25) + '%)'; vx.fillRect(i * bw + 1, H - h, bw - 2, h); } }
  function drawWave(vx, W, H, cols) { vx.lineWidth = 2 + beatFlash * 3; vx.strokeStyle = 'hsl(' + cols[1] + ' 90% 65%)'; vx.shadowBlur = 12; vx.shadowColor = vx.strokeStyle; vx.beginPath(); for (let i = 0; i < timeData.length; i++) { const x = i / (timeData.length - 1) * W, y = (timeData[i] / 255) * H; if (i === 0) vx.moveTo(x, y); else vx.lineTo(x, y); } vx.stroke(); vx.shadowBlur = 0; }
  function drawParticles(vx, W, H, cols) { if (particles.length < 140) for (let i = 0; i < 3; i++) particles.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, band: (Math.random() * 64) | 0, life: 1 }); for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; const v = freqData[p.band * 2] / 255; p.vy += (v - 0.3) * 0.6; p.vx += (Math.random() - 0.5) * 0.4; p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.life -= 0.004; if (p.x < 0) p.x += W; if (p.x > W) p.x -= W; if (p.y < 0) p.y += H; if (p.y > H) p.y -= H; if (p.life <= 0) { particles.splice(i, 1); continue; } const r = 1 + v * 6; vx.globalAlpha = p.life; vx.fillStyle = 'hsl(' + cols[p.band % 3] + ' 90% ' + (50 + v * 30) + '%)'; vx.beginPath(); vx.arc(p.x, p.y, r, 0, 7); vx.fill(); } vx.globalAlpha = 1; }
  function drawTunnel(vx, W, H, cols) { tunnelR = (tunnelR + 1 + beatFlash * 6) % 60; const cx = W / 2, cy = H / 2; for (let i = 0; i < 14; i++) { const v = freqData[i * 4] / 255; const r = ((i * 60 + tunnelR) % (Math.max(W, H))) + v * 30; vx.strokeStyle = 'hsl(' + ((cols[0] + i * 8) % 360) + ' 80% ' + (40 + v * 30) + '%)'; vx.lineWidth = 2 + v * 5; vx.globalAlpha = 0.7; vx.beginPath(); vx.arc(cx, cy, r, 0, 7); vx.stroke(); } vx.globalAlpha = 1; }
  function drawCircular(vx, W, H, cols) { const cx = W / 2, cy = H / 2, N = 96, baseR = Math.min(W, H) * 0.18; for (let i = 0; i < N; i++) { const v = freqData[i] / 255; const a = i / N * Math.PI * 2 + performance.now() * 0.0002; const r1 = baseR, r2 = baseR + v * Math.min(W, H) * 0.3; vx.strokeStyle = 'hsl(' + ((cols[1] + i * 2) % 360) + ' 85% ' + (45 + v * 30) + '%)'; vx.lineWidth = 2; vx.beginPath(); vx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); vx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); vx.stroke(); } }

  // ---- escaneo de archivos locales ----
  function normalizeTrack(rel, name, size, ext, fileRef, handleRef) {
    const folder = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    return { kind: 'file', rel, name, title: titleFromName(name), folder, ext, size: size || 0, fav: !!fileFavs[rel], _file: fileRef || null, _handle: handleRef || null };
  }
  async function pickFolder() {
    if (window.showDirectoryPicker && location.protocol !== 'file:') {
      try { const root = await window.showDirectoryPicker({ mode: 'read' }); await scanHandle(root); return true; }
      catch (e) { if (e && e.name === 'AbortError') return true; return null; } // cancelado por el usuario vs. bloqueado (iframe cross-origin, permissions policy) → fallback
    }
    return null; // el caller debe abrir el <input webkitdirectory> como fallback
  }
  const MAX_SCAN_FILES = 20000; // tope duro — una carpeta gigante (home entero, Steam library) no debe colgar/crashear el tab
  async function scanHandle(root) {
    localTracks = []; folderCoverCache = {};
    const folderCovers = {}; let count = 0;
    scanning = true; scanCount = 0; notify();
    async function walk(dirHandle, path) {
      if (count >= MAX_SCAN_FILES) return;
      for await (const [name, h] of dirHandle.entries()) {
        if (count >= MAX_SCAN_FILES) return; // corta una carpeta gigante en vez de colgar/crashear el tab
        if (h.kind === 'directory') await walk(h, path ? path + '/' + name : name);
        else {
          const ext = extOf(name); const rel = path ? path + '/' + name : name;
          if (IMG_EXT.has(ext)) { const folder = path || ''; if (!folderCovers[folder]) folderCovers[folder] = h; }
          else if (AUDIO_EXT.has(ext)) {
            localTracks.push(normalizeTrack(rel, name, 0, ext, null, h)); // tamaño se lee al reproducir, no en el escaneo (evita un await por archivo en carpetas grandes)
            count++; if (count % 120 === 0) { scanCount = count; notify(); }
          }
        }
      }
    }
    await walk(root, '');
    for (const f in folderCovers) { const h = folderCovers[f]; folderCoverCache[f] = { url: null, loading: false, proc: procCoverForFile(f || 'album'), getter: () => h.getFile() }; }
    sortLocal(); finishScan(count);
  }
  function scanInputFiles(fileList) {
    localTracks = []; folderCoverCache = {}; const folderCovers = {};
    scanning = true; notify();
    const arr = Array.from(fileList).slice(0, MAX_SCAN_FILES);
    for (const f of arr) {
      const rel = f.webkitRelativePath || f.name; const name = f.name; const ext = extOf(name);
      const folder = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
      if (IMG_EXT.has(ext)) { if (!folderCovers[folder]) folderCovers[folder] = f; }
      else if (AUDIO_EXT.has(ext)) localTracks.push(normalizeTrack(rel, name, f.size, ext, f, null));
    }
    for (const f in folderCovers) { const file = folderCovers[f]; folderCoverCache[f] = { url: null, loading: false, proc: procCoverForFile(f || 'album'), getter: () => Promise.resolve(file) }; }
    sortLocal(); finishScan(localTracks.length);
  }
  function sortLocal() { localTracks.sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true, sensitivity: 'base' })); }
  function finishScan(n) { scanning = false; scanCount = n; rebuildView(); }

  // ---- vista combinada ----
  function procItems() { return library.map((it, i) => ({ kind: 'proc', idx: i, seed: it.seed, title: it.title, fav: it.fav })); }
  function fileItems() { return localTracks.map((t, i) => ({ kind: 'file', idx: i, rel: t.rel, name: t.name, title: t.title, folder: t.folder, ext: t.ext, fav: t.fav, _file: t._file, _handle: t._handle })); }
  function rebuildView() {
    let procs = tab === 'file' ? [] : procItems();
    let files = tab === 'proc' ? [] : fileItems();
    let all = procs.concat(files);
    const q = search.trim().toLowerCase();
    if (q) all = all.filter(it => (it.title + ' ' + (it.folder || '') + ' ' + (it.kind === 'proc' ? ('' + it.seed) : it.rel)).toLowerCase().indexOf(q) >= 0);
    viewList = all;
    renderedCount = BATCH; // resetea el lote visible — evita re-renderizar miles de covers de golpe
    if (curItem) { const ni = viewList.findIndex(v => sameItem(v, curItem)); curViewIndex = ni; }
    notify();
  }
  function renderMore() { if (renderedCount < viewList.length) { renderedCount = Math.min(renderedCount + BATCH, viewList.length); notify(); } }

  // ---- favoritos / biblioteca ----
  function addSong(seedStr) {
    const seed = toSeed(seedStr); const song = buildSong(seed);
    library.push({ seed: seed >>> 0, title: song.title, fav: false });
    persist.guardarBiblioteca(library); rebuildView();
    return library.length - 1;
  }
  function toggleFav(item) {
    if (item.kind === 'proc') { library[item.idx].fav = !library[item.idx].fav; persist.guardarBiblioteca(library); }
    else { const t = localTracks[item.idx]; t.fav = !t.fav; if (t.fav) fileFavs[t.rel] = true; else delete fileFavs[t.rel]; persist.guardarFavoritos(fileFavs); }
    rebuildView();
  }
  function clearProcedural() { library = []; persist.guardarBiblioteca(library); rebuildView(); }

  // ---- editor de patrones ----
  function setEdInst(name) { edInst = name; notify(); }
  function toggleCell(col, note) { const k = col + ',' + note; const set = editorPattern[edInst]; if (set.has(k)) set.delete(k); else set.add(k); notify(); }
  function clearPattern() { editorPattern[edInst].clear(); notify(); }
  function randomPattern() { const set = editorPattern[edInst]; set.clear(); const rng = mulberry32((Math.random() * 1e9) | 0); for (let c = 0; c < ROLL_COLS; c++) if (rng() < 0.5) set.add(c + ',' + rint(rng, 60, 71)); notify(); }
  function saveComposition() { const o = {}; INST_NAMES.forEach(k => o[k] = [...editorPattern[k]]); persist.guardarComposiciones(o); }
  function edScheduler() { while (edNext < ctx.currentTime + LOOKAHEAD) { const set = editorPattern[edInst]; for (const k of set) { const parts = k.split(','); const s = +parts[0], n = +parts[1]; if (s === edStep) playNote(edNext, n, 0.6, stepDur() * 0.9, edInst); } edNext += stepDur(); edStep = (edStep + 1) % ROLL_COLS; } }
  function edPlay() { ensureAudio(); if (ctx.state === 'suspended') ctx.resume(); if (edPlaying) return; edPlaying = true; edNext = ctx.currentTime + 0.06; edStep = 0; edTimer = setInterval(edScheduler, TICK_MS); notify(); }
  function edStop() { edPlaying = false; if (edTimer) { clearInterval(edTimer); edTimer = null; } notify(); }

  // ---- settings ----
  let saveSettingsTimer = null;
  function saveSettingsDebounced() { clearTimeout(saveSettingsTimer); saveSettingsTimer = setTimeout(() => persist.guardarAjustes(settings), 400); }
  function setVolume(v) { settings.vol = v; if (master && !muted) master.gain.value = v; if (audioDirect) audioEl.volume = v; saveSettingsDebounced(); notify(); }
  function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : settings.vol; if (audioDirect) audioEl.volume = muted ? 0 : settings.vol; notify(); }
  function toggleShuffle() {
    settings._shuffle = !settings._shuffle;
    if (settings._shuffle) { queue = viewList.map((_, i) => i).filter(i => i !== curViewIndex); for (let i = queue.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[queue[i], queue[j]] = [queue[j], queue[i]]; } }
    else queue = [];
    saveSettingsDebounced(); notify();
  }
  function cycleRepeat() { settings._repeat = ((settings._repeat || 0) + 1) % 3; saveSettingsDebounced(); notify(); }
  function setViz(mode) { vizMode = mode; settings.viz = mode; saveSettingsDebounced(); notify(); }
  function setBpm(v) { settings.bpm = v; saveSettingsDebounced(); notify(); }
  function setEq(i, v) { settings.eq[i] = v; if (eqNodes[i]) eqNodes[i].gain.value = v; saveSettingsDebounced(); notify(); }
  function setEqPreset(name) { settings.eq = EQ_PRESETS[name].slice(); eqNodes.forEach((n, i) => n.gain.value = settings.eq[i]); saveSettingsDebounced(); notify(); }
  function setFx(key) { settings.fx[key] = !settings.fx[key]; applyFx(); saveSettingsDebounced(); notify(); }
  function setTab(t) { tab = t; settings.tab = t; saveSettingsDebounced(); rebuildView(); }
  function setSearch(q) { search = q; rebuildView(); }
  function setListView(v) { listView = v; settings.view = v ? 'list' : 'grid'; saveSettingsDebounced(); notify(); }

  // ---- export/import ----
  function exportJSON() {
    const data = { library, settings, fileFavs, comp: (() => { const o = {}; INST_NAMES.forEach(k => o[k] = [...editorPattern[k]]); return o; })() };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'reproductor-aurora.json'; a.click();
  }
  function importJSON(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        try {
          const d = JSON.parse(r.result);
          if (d.library) library = d.library;
          if (d.settings) settings = Object.assign(settings, d.settings);
          if (d.fileFavs) fileFavs = d.fileFavs;
          if (d.comp) INST_NAMES.forEach(k => editorPattern[k] = new Set(d.comp[k] || []));
          localTracks.forEach(t => t.fav = !!fileFavs[t.rel]);
          persist.guardarBiblioteca(library); persist.guardarAjustes(settings); persist.guardarFavoritos(fileFavs);
          rebuildView(); resolve();
        } catch (err) { reject(err); }
      };
      r.onerror = reject;
      r.readAsText(file);
    });
  }

  // ---- init / snapshot ----
  async function init(persistApi) {
    persist = persistApi;
    const [bib, favs, ajustes, comp] = await Promise.all([
      persist.leerBiblioteca(), persist.leerFavoritos(), persist.leerAjustes(), persist.leerComposiciones(),
    ]);
    library = bib || [];
    fileFavs = favs || {};
    if (ajustes) settings = Object.assign(settings, ajustes);
    if (comp) INST_NAMES.forEach(k => editorPattern[k] = new Set(comp[k] || []));
    vizMode = settings.viz || 0;
    tab = settings.tab || 'all';
    listView = settings.view === 'list';
    if (library.length === 0) ['aurora', 'medianoche', 'pulso'].forEach(s => addSong(s));
    else rebuildView();
  }

  function snapshot() {
    return {
      viewList: viewList.slice(0, renderedCount), viewTotal: viewList.length, hasMore: renderedCount < viewList.length,
      curViewIndex, curItem, curSong, isPlaying, muted,
      volume: settings.vol, queue, shuffleOn: settings._shuffle, repeatMode: settings._repeat,
      tab, search, listView, scanning, scanCount,
      settings, vizMode,
      edInst, edPlaying, editorPattern,
      progressFrac: progressFrac(), curTimeStr: curTimeStr(), totalTimeStr: totalTimeStr(),
    };
  }
  function progressFrac() {
    if (!curItem) return 0;
    if (curItem.kind === 'proc') { const dur = procDuration(); return dur ? clamp((currentStep * stepDur()) / dur, 0, 1) : 0; }
    const dur = audioEl.duration; return (isFinite(dur) && dur > 0) ? clamp((audioEl.currentTime || 0) / dur, 0, 1) : 0;
  }
  function curTimeStr() { if (!curItem) return '0:00'; return curItem.kind === 'proc' ? fmtTime(currentStep * stepDur()) : fmtTime(audioEl.currentTime || 0); }
  function totalTimeStr() { if (!curItem) return '0:00'; return curItem.kind === 'proc' ? fmtTime(procDuration()) : fmtTime(audioEl.duration); }

  function destroy() {
    if (schedTimer) clearInterval(schedTimer);
    if (edTimer) clearInterval(edTimer);
    if (currentObjectURL) URL.revokeObjectURL(currentObjectURL);
    listeners.clear();
  }

  return {
    init, destroy, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, snapshot,
    addSong, toggleFav, clearProcedural,
    loadItem, togglePlay, play, pause, stop, seek,
    next: () => { const i = nextTrackIndex(); if (i >= 0) { loadItem(i); currentStep = 0; play(); } },
    prev: () => { const i = prevTrackIndex(); if (i >= 0) { loadItem(i); currentStep = 0; play(); } },
    toggleMute, setVolume, toggleShuffle, cycleRepeat, setViz, setBpm, setEq, setEqPreset, setFx,
    setTab, setSearch, setListView, renderMore,
    pickFolder, scanInputFiles,
    coverFor, ensureFolderCover, folderCoverCache: () => folderCoverCache,
    exportJSON, importJSON,
    setEdInst, toggleCell, clearPattern, randomPattern, saveComposition, edPlay, edStop,
    drawViz,
    NOTE_NAMES, INST_NAMES, ROLL_ROWS, ROLL_COLS, VIZ_MODES, EQ_PRESETS, EQ_FREQS,
  };
}
