import { signal } from '../../../../store.js';
import { BASE, hdrs } from '../../../../components/shared/api.js';

export const grabando       = signal(false);
export const transcribiendo = signal(false);
export const hablando       = signal(false);
export const autoVoz        = signal(false);
export const vozSeleccionada = signal('es-MX-DaliaNeural');
export const voces          = signal([]);

let _recorder = null;
let _chunks   = [];
let _audio    = null;
let _vozGuardada = false;

async function guardarAjuste(clave, valor) {
  try {
    await fetch(`${BASE}/db/ajustes/${clave}`, {
      method: 'PUT',
      headers: hdrs(),
      body: JSON.stringify({ valor }),
    });
  } catch {}
}

export async function cargarAjustesVoz() {
  try {
    const [resVoz, resAuto] = await Promise.all([
      fetch(`${BASE}/db/ajustes/local_voz`, { headers: hdrs() }),
      fetch(`${BASE}/db/ajustes/local_autovoz`, { headers: hdrs() }),
    ]);
    if (resVoz.ok) {
      const d = await resVoz.json();
      if (d.valor) { vozSeleccionada.value = d.valor; _vozGuardada = true; }
    }
    if (resAuto.ok) {
      const d = await resAuto.json();
      if (d.valor != null) autoVoz.value = d.valor === '1';
    }
  } catch {}
}

export async function cargarVoces() {
  await cargarAjustesVoz();
  try {
    const res = await fetch(`${BASE}/voz/voces`, { headers: hdrs() });
    if (res.ok) {
      const data = await res.json();
      voces.value = data.voces || [];
      if (!_vozGuardada && data.default) {
        vozSeleccionada.value = data.default;
      }
    }
  } catch {}
}

export function setVoz(id) {
  vozSeleccionada.value = id;
  _vozGuardada = true;
  guardarAjuste('local_voz', id);
}

export function toggleAutoVoz() {
  autoVoz.value = !autoVoz.value;
  guardarAjuste('local_autovoz', autoVoz.value ? '1' : '0');
}

export async function iniciarGrabacion() {
  if (grabando.value) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  _chunks = [];
  _recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
  _recorder.ondataavailable = e => { if (e.data.size > 0) _chunks.push(e.data); };
  _recorder.start();
  grabando.value = true;
}

export function detenerGrabacion() {
  return new Promise((resolve, reject) => {
    if (!_recorder || !grabando.value) { resolve(''); return; }
    const recorder = _recorder;
    recorder.onstop = async () => {
      grabando.value = false;
      recorder.stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(_chunks, { type: 'audio/webm' });
      _chunks = [];
      _recorder = null;
      if (blob.size < 1000) { resolve(''); return; }

      transcribiendo.value = true;
      try {
        const form = new FormData();
        form.append('data', blob, 'voz.webm');
        // Solo Authorization: el Content-Type del multipart lo pone el browser.
        const res = await fetch(`${BASE}/voz/stt`, {
          method: 'POST',
          headers: { Authorization: hdrs().Authorization },
          body: form,
        });
        if (!res.ok) throw new Error(`STT ${res.status}`);
        const data = await res.json();
        resolve(data.text || '');
      } catch (e) {
        reject(e);
      } finally {
        transcribiendo.value = false;
      }
    };
    recorder.stop();
  });
}

export async function hablar(texto) {
  const limpio = (texto || '').replace(/[*_`#>~\[\]()]/g, '').trim();
  if (!limpio) return;
  detenerVoz();
  hablando.value = true;
  try {
    const res = await fetch(`${BASE}/voz/tts`, {
      method: 'POST',
      headers: hdrs(),
      body: JSON.stringify({ text: limpio.slice(0, 2000), voice: vozSeleccionada.value }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    _audio = new Audio(url);
    _audio.onended = () => { hablando.value = false; URL.revokeObjectURL(url); _audio = null; };
    _audio.onerror = () => { hablando.value = false; URL.revokeObjectURL(url); _audio = null; };
    await _audio.play();
  } catch {
    hablando.value = false;
  }
}

export function detenerVoz() {
  if (_audio) {
    _audio.pause();
    _audio = null;
  }
  hablando.value = false;
}
