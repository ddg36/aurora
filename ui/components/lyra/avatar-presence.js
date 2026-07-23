const { html } = globalThis;
const { useEffect, useRef, useState } = globalThis.preactHooks;

import { Button, Icon, Panel } from '../index.js';
import { activeTab, nexusOnline } from '../../store.js';
import { autoVoz, grabando, transcribiendo, hablando, detenerGrabacion, detenerVoz, toggleAutoVoz } from '../../modules/lyra/scripts/voz/voz.js';
import { avatarAsset, avatarStateLabel, LYRIA_AVATAR } from './avatar-manifest.js?v=v2-avatar-mood';
import { lyriaMood } from './avatar-state.js?v=v1-avatar-mood';

function useSignal(signal) {
  const [value, setValue] = useState(signal.value);
  useEffect(() => signal.subscribe(setValue), [signal]);
  return value;
}

export function AvatarFigure({ state = 'ready', mood = null, mode = 'portrait', manifest = LYRIA_AVATAR }) {
  const currentMood = useSignal(lyriaMood);
  const resolvedMood = mood || currentMood;
  const requestedAsset = avatarAsset(manifest, state, resolvedMood);
  const [visibleAsset, setVisibleAsset] = useState(requestedAsset);

  useEffect(() => {
    if (requestedAsset === visibleAsset) return undefined;
    let cancelled = false;
    const image = new Image();
    image.src = requestedAsset;
    const reveal = () => { if (!cancelled) setVisibleAsset(requestedAsset); };
    if (image.decode) image.decode().then(reveal, reveal);
    else { image.onload = reveal; image.onerror = reveal; }
    return () => { cancelled = true; };
  }, [requestedAsset, visibleAsset]);

  return html`
    <div class=${`lyria-avatar-figure lyria-avatar-figure--${mode}`} data-avatar-state=${state} data-avatar-mood=${resolvedMood} aria-hidden="true">
      <span class="lyria-avatar-aura"></span>
      <img key=${visibleAsset} src=${visibleAsset} alt="" decoding="async" draggable="false" />
    </div>
  `;
}

export function VoiceWave({ active = false, state = 'ready' }) {
  return html`
    <span class=${`lyria-voice-wave${active ? ' is-active' : ''}`} data-wave-state=${state} aria-hidden="true">
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => html`<i key=${i}></i>`)}
    </span>
  `;
}

export function LyriaLocalDock({
  state = 'ready', minimized = false, recording = false, voiceEnabled = false,
  onToggleMinimize, onClose, onMic, onVoice,
}) {
  const active = recording || ['listening', 'thinking', 'working', 'speaking', 'tool-use'].includes(state);
  return html`
    <${Panel} class=${`lyria-local-dock${minimized ? ' is-minimized' : ''}`}>
      <${AvatarFigure} state=${state} mode="dock" />
      <div class="lyria-local-dock__body">
        <div class="lyria-local-dock__identity">
          <strong>Lyria</strong>
          <span class=${`lyria-avatar-status is-${state}`}><i></i>${avatarStateLabel(state)}</span>
        </div>
        ${!minimized && html`
          <div class="lyria-local-dock__activity">
            <${VoiceWave} active=${active} state=${state} />
            <small>${recording ? 'Te escucho…' : voiceEnabled ? 'Voz automática activa' : 'IA local disponible'}</small>
          </div>
        `}
      </div>
      <div class="lyria-local-dock__actions">
        ${!minimized && html`
          <${Button} iconOnly icon="mic" active=${recording} title=${recording ? 'Detener dictado' : 'Hablar con Lyria'} onClick=${onMic} />
          <${Button} iconOnly icon=${voiceEnabled ? 'volume' : 'volumeOff'} active=${voiceEnabled} title="Voz automática" onClick=${onVoice} />
        `}
        <${Button} iconOnly icon=${minimized ? 'chevronDown' : 'arrowDown'} title=${minimized ? 'Expandir presencia' : 'Minimizar presencia'} onClick=${onToggleMinimize} />
        <${Button} iconOnly icon="close" title="Ocultar presencia local" onClick=${onClose} />
      </div>
    <//>
  `;
}

export function AvatarStage({ state = 'ready', responseHtml = '', onHistory, onExit }) {
  return html`
    <section class="lyria-avatar-stage" data-avatar-state=${state} aria-label="Modo Avatar de Lyria">
      <div class="lyria-avatar-stage__chrome">
        <span><${Icon} name="user" size=${14}/> Modo Avatar</span>
        <span class=${`lyria-avatar-status is-${state}`}><i></i>${avatarStateLabel(state)}</span>
        <div class="lyria-avatar-stage__actions">
          <${Button} iconOnly icon="history" title="Abrir historial" onClick=${onHistory}/>
          <${Button} iconOnly icon="close" title="Volver al chat" onClick=${onExit}/>
        </div>
      </div>
      <${AvatarFigure} state=${state} mode="stage" />
      ${responseHtml && html`
        <article class="lyria-avatar-dialogue" aria-live="polite" aria-atomic="false">
          <header>
            <strong>Lyria</strong>
            <${VoiceWave} active=${['speaking', 'working', 'tool-use'].includes(state)} state=${state}/>
          </header>
          <div class="lyria-avatar-dialogue__content prose-chat" dangerouslySetInnerHTML=${{ __html: responseHtml }}></div>
        </article>
      `}
    </section>
  `;
}

// Presencia de voz fuera de Lyria Chat. Usa el estado de voz real y desaparece
// en la tab Lyria porque allí vive el dock local, evitando dos avatares iguales.
export function AvatarVoiceOverlay() {
  const tab = useSignal(activeTab);
  const online = useSignal(nexusOnline);
  const voiceEnabled = useSignal(autoVoz);
  const recording = useSignal(grabando);
  const transcribing = useSignal(transcribiendo);
  const speaking = useSignal(hablando);
  const [minimized, setMinimized] = useState(false);
  const [position, setPosition] = useState(null);
  const dragRef = useRef(null);
  const visible = tab !== 'lyra' && (voiceEnabled || recording || transcribing || speaking);
  const state = !online ? 'offline' : (recording || transcribing) ? 'listening' : speaking ? 'speaking' : 'ready';

  const beginDrag = (event) => {
    if (event.button !== 0 || event.target.closest('button')) return;
    const card = event.currentTarget.closest('.lyria-voice-overlay');
    const rect = card.getBoundingClientRect();
    dragRef.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const drag = (event) => {
    if (!dragRef.current) return;
    const left = Math.max(8, Math.min(window.innerWidth - 190, dragRef.current.left + event.clientX - dragRef.current.x));
    const top = Math.max(8, Math.min(window.innerHeight - 100, dragRef.current.top + event.clientY - dragRef.current.y));
    setPosition({ left, top, right: 'auto', bottom: 'auto' });
  };
  const endDrag = () => { dragRef.current = null; };

  if (!visible) return null;
  return html`
    <aside class=${`lyria-voice-overlay${minimized ? ' is-minimized' : ''}`} style=${position || undefined} data-avatar-state=${state} aria-label="Presencia de voz de Lyria">
      <div class="lyria-voice-overlay__handle" onPointerDown=${beginDrag} onPointerMove=${drag} onPointerUp=${endDrag}>
        <span><${Icon} name="user" size=${14}/> Lyria</span>
        <div>
          <${Button} iconOnly icon=${minimized ? 'chevronDown' : 'arrowDown'} title=${minimized ? 'Expandir' : 'Minimizar'} onClick=${() => setMinimized(v => !v)}/>
          <${Button} iconOnly icon="close" title="Desactivar voz" onClick=${() => { detenerVoz(); if (recording) detenerGrabacion(); if (voiceEnabled) toggleAutoVoz(); }}/>
        </div>
      </div>
      ${!minimized && html`
        <div class="lyria-voice-overlay__content">
          <${AvatarFigure} state=${state} mode="floating"/>
          <div class="lyria-voice-overlay__status">
            <span class=${`lyria-avatar-status is-${state}`}><i></i>${avatarStateLabel(state)}</span>
            <${VoiceWave} active=${recording || transcribing || speaking} state=${state}/>
          </div>
        </div>
      `}
    </aside>
  `;
}
