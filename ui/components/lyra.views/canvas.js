// Canvas — editor de código + preview, panel lateral de Local
// Props: code, lang, tab, onTabChange, onCodeChange, onClose

import { copiarTexto } from '../shared/clipboard.js';
import { Chip, Button } from '../index.js';
import { TOOLBAR_ROW, TOOLBAR_GROUP, AutoFitChips } from '../shared/iconButton.js';

const { Component } = preact;

function detectLang(code) {
  if (!code || !code.trim()) return null;
  const t = code.trim();
  if (t.startsWith('<!DOCTYPE') || t.startsWith('<html') || t.startsWith('<HTML')) return 'HTML';
  if (/<\w[\w-]*(\s[^>]*)?>/.test(t) && /<\/\w+>/.test(t)) return 'HTML';
  if (t.startsWith('{') || t.startsWith('[')) {
    try { JSON.parse(t); return 'JSON'; } catch (_) {}
  }
  if (/^[\w.#*:[\s,]+\s*\{[\s\S]*:[^;]+;/m.test(t)) return 'CSS';
  if (/\b(function|const|let|var|import|export|class|=>|async|await)\b/.test(t)) return 'JS';
  if (t.startsWith('<')) return 'HTML';
  return null;
}

class CanvasEditor extends Component {
  constructor(props) {
    super(props);
    this.codeRef = null;
  }

  componentDidMount() {
    if (this.codeRef && this.props.code) this.codeRef.value = this.props.code;
  }

  componentDidUpdate(prevProps) {
    if (prevProps.code !== this.props.code && this.codeRef && this.codeRef.value !== this.props.code) {
      this.codeRef.value = this.props.code;
    }
  }

  render() {
    const { onCodeChange } = this.props;
    const html = globalThis.html;
    return html`
      <textarea
        ref=${el => this.codeRef = el}
        class="flex-1 w-full p-3 font-mono text-xs leading-relaxed text-aurora-text bg-transparent border-0 outline-none resize-none overflow-auto"
        style="tab-size:2; white-space:pre; caret-color:var(--aurora-accent);"
        spellcheck="false"
        onInput=${e => onCodeChange && onCodeChange(e.target.value, detectLang(e.target.value))}
        placeholder="Código..."
      ></textarea>
    `;
  }
}

// Singleton del iframe de preview — vive fuera del árbol de Preact para que
// ningún re-render lo desmonte. Se crea una vez y se mueve entre contenedores.
const _preview = (() => {
  let iframe = null;
  let lastSent = null;
  let currentContainer = null;

  function ensureIframe() {
    if (iframe) return;
    iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#fff;';
    iframe.setAttribute('sandbox', 'allow-scripts');
  }

  return {
    attach(container, code) {
      ensureIframe();
      if (currentContainer !== container) {
        container.appendChild(iframe);
        currentContainer = container;
      }
      if (code !== lastSent) {
        lastSent = code;
        iframe.srcdoc = code || '';
      }
    },
    openWindow(code) {
      const blob = new Blob([code], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'width=960,height=700');
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  };
})();

class CanvasPreview extends Component {
  constructor(props) {
    super(props);
    this.containerRef = null;
  }

  componentDidMount() {
    if (this.containerRef) _preview.attach(this.containerRef, this.props.code || '');
  }

  componentDidUpdate() {
    if (this.containerRef) _preview.attach(this.containerRef, this.props.code || '');
  }

  render() {
    const html = globalThis.html;
    return html`
      <div class="flex-1 flex flex-col overflow-hidden">
        <div class="flex items-center justify-between px-2 py-1 border-b border-aurora-border flex-shrink-0"
             style="background:color-mix(in srgb,var(--aurora-surface-2) 60%,transparent);">
          <span class="text-[10px] text-aurora-text-dim">Vista previa</span>
          <${Chip}
            onClick=${() => _preview.openWindow(this.props.code || '')}
            title="Abrir en ventana"
          >↗ Ventana<//>
        </div>
        <div class="flex-1 overflow-hidden" ref=${el => { this.containerRef = el; }}></div>
      </div>
    `;
  }
}

export function CanvasPanel({ code, lang, tab, onTabChange, onCodeChange, onClose, onSendToAI }) {
  const html = globalThis.html;
  const langLabel = detectLang(code);
  const isHtml = langLabel === 'HTML';

  const tabBtn = (id, label) => html`
    <${Chip} active=${tab === id} onClick=${() => onTabChange(id)}>${label}<//>
  `;

  const toolChip = (title, label, onClick) => html`
    <${Chip} title=${title} onClick=${onClick}>${label}<//>
  `;

  const toolIconBtn = (title, icon, onClick) => html`
    <${Button} iconOnly title=${title} onClick=${onClick}>${icon}<//>
  `;

  const copy = async () => {
    if (!code.trim()) return;
    const ok = await copiarTexto(code);
    Toast.show(ok ? 'Copiado' : 'No se pudo copiar', ok ? 'info' : 'error', 1200);
  };

  return html`
    <div class="flex flex-col h-full overflow-hidden border-l border-aurora-border"
         style="background:color-mix(in srgb,var(--aurora-bg) 40%,transparent);backdrop-filter:blur(8px);">

      <!-- header -->
      <div class=${TOOLBAR_ROW + ' px-2.5 py-1.5 border-b border-aurora-border flex-shrink-0'}
           style="background:color-mix(in srgb,var(--aurora-surface-2) 60%,transparent); min-height:36px;">
        <${AutoFitChips} class=${TOOLBAR_GROUP}>
          ${tabBtn('codigo', 'Código')}
          ${tabBtn('vista', 'Vista previa')}
        <//>
        <div class=${TOOLBAR_GROUP}>
          ${langLabel && html`<${Chip} variant="dim">${langLabel}<//>`}
          ${onSendToAI && toolChip('Enviar al AI', '↑ AI', () => onSendToAI(code))}
          ${toolIconBtn('Copiar código', '⎘', copy)}
          ${toolIconBtn('Cerrar canvas', '✕', onClose)}
        </div>
      </div>

      <!-- contenido -->
      <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
        ${tab === 'codigo' && html`<${CanvasEditor} code=${code} lang=${lang} onCodeChange=${onCodeChange} />`}
        ${tab === 'vista' && (isHtml
          ? html`<${CanvasPreview} code=${code} />`
          : html`<div class="flex-1 flex items-center justify-center text-aurora-text-dim text-xs">Vista previa solo disponible para HTML</div>`
        )}
      </div>
    </div>
  `;
}
