const html = (...args) => globalThis.html(...args);

import { Button, PanelFooter, Textarea } from '../../../components/index.js';
import { cancelarMensaje } from '../../../components/shared/gemita-ws.js';

export function LocalToolbar({
  grabando,
  transcribiendo,
  cargando,
  mensaje,
  setMensaje,
  onMic,
  onKeyDown,
  enviarMensaje,
}) {
  return html`
    <${PanelFooter}>
      <div class="flex items-end gap-2 w-full">
        <${Button}
          variant=${grabando ? 'danger' : 'default'}
          onClick=${onMic}
          disabled=${transcribiendo}
          title=${grabando ? 'Detener y transcribir' : 'Hablar (whisper en el server)'}
        >${transcribiendo ? '…' : grabando ? '⏺' : '🎙'}</${Button}>

        <${Textarea}
          value=${mensaje}
          onInput=${e => setMensaje(e.target.value)}
          onKeyDown=${onKeyDown}
          placeholder=${grabando ? '⏺ Grabando… clic al micrófono para transcribir' : 'Escribe un mensaje... Enter para enviar, Shift+Enter nueva línea'}
          rows="3"
          disabled=${cargando}
          class="flex-1 min-h-20"
        />

        ${cargando
          ? html`<${Button} variant="danger" onClick=${cancelarMensaje} title="Cancelar">■</${Button}>`
          : html`<${Button} variant="primary" onClick=${() => enviarMensaje()} disabled=${!mensaje.trim()} title="Enviar">↑</${Button}>`
        }
      </div>
    </${PanelFooter}>
  `;
}

export default LocalToolbar;
