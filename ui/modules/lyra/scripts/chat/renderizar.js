const KW_POR_LENGUAJE = {
  py:     'def|class|return|if|elif|else|for|while|import|from|as|with|try|except|finally|raise|pass|break|continue|lambda|yield|None|True|False|self|async|await|and|or|not|in|is|print|len|range',
  python: 'def|class|return|if|elif|else|for|while|import|from|as|with|try|except|finally|raise|pass|break|continue|lambda|yield|None|True|False|self|async|await|and|or|not|in|is|print|len|range',
  go:     'func|package|import|var|const|type|struct|interface|return|if|else|for|range|switch|case|break|continue|defer|go|chan|map|nil|true|false|error|string|int|float64|bool',
  rs:     'fn|let|mut|const|pub|use|mod|struct|enum|impl|trait|if|else|match|for|while|loop|return|break|continue|true|false|None|Some|Ok|Err|self|async|await|where|type',
  rust:   'fn|let|mut|const|pub|use|mod|struct|enum|impl|trait|if|else|match|for|while|loop|return|break|continue|true|false|None|Some|Ok|Err|self|async|await|where|type',
};

const KW_DEFAULT = 'const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|new|this|typeof|import|export|default|from|async|await|try|catch|finally|throw|null|undefined|true|false|void|delete|in|of|yield';

const LENGUAJES_EJECUTABLES = new Set(['bash', 'sh', 'shell', 'zsh', 'console']);

function escape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function wrap(className, text) {
  return `<span class="hl-${className}">${text}</span>`;
}

function highlightCode(raw, lang) {
  const l = (lang || '').toLowerCase();

  if (!l || l === 'text' || l === 'plain') return escape(raw);

  if (l === 'json') {
    return escape(raw)
      .replace(/&quot;([^&\n]*)&quot;(\s*:)/g,
        (_, k, c) => wrap('key', `&quot;${k}&quot;`) + c)
      .replace(/:\s*&quot;([^&\n]*)&quot;/g,
        (m, v) => m.replace(`&quot;${v}&quot;`, wrap('str', `&quot;${v}&quot;`)))
      .replace(/\b(true|false|null)\b/g,   m => wrap('kw',  m))
      .replace(/\b(-?\d+(?:\.\d+)?)\b/g,    m => wrap('num', m));
  }

  const kwStr = KW_POR_LENGUAJE[l] || KW_DEFAULT;
  const kwRe = new RegExp(`\\b(${kwStr})\\b`, 'g');
  const esPython = l === 'py' || l === 'python';

  const stash = [];
  const guardar = (type, s) => {
    const i = stash.length;
    stash.push(wrap(type, escape(s)));
    return `\x01${i}\x01`;
  };

  let out = raw
    .replace(/\/\*[\s\S]*?\*\//g, m => guardar('cm', m))
    .replace(/\/\/[^\n]*/g,        m => guardar('cm', m));

  if (esPython) out = out.replace(/#[^\n]*/g, m => guardar('cm', m));

  out = out.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*?\1/g, m => guardar('str', m));

  out = escape(out)
    .replace(kwRe, m => wrap('kw', m))
    .replace(/\b(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, m => wrap('num', m));

  return out.replace(/\x01(\d+)\x01/g, (_, i) => stash[+i]);
}

export function renderMarkdownLight(text) {
  const CODE_RE = /```(\w*)\n?([\s\S]*?)```/g;
  const parts = [];
  let last = 0, m;

  while ((m = CODE_RE.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: 'text', c: text.slice(last, m.index) });
    parts.push({ t: 'code', lang: m[1], c: m[2].replace(/\n$/, '') });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: 'text', c: text.slice(last) });

  return parts.map(p => {
    if (p.t === 'code') {
      const lang = p.lang || 'code';
      const hl = highlightCode(p.c, p.lang);
      const raw = escape(p.c).replace(/"/g, '&quot;');
      const runBtn = LENGUAJES_EJECUTABLES.has(lang.toLowerCase())
        ? `<button class="code-btn js-run-code" title="Ejecutar en cuarto de Lyra">▶ Run</button>`
        : '';
      return `<div class="code-block" data-code="${raw}" data-lang="${escape(lang)}">` +
               `<div class="code-hdr">` +
                 `<span class="code-lang">${escape(lang)}</span>` +
                 `<button class="code-btn js-copy-code"     title="Copiar código">⎘ Copiar</button>` +
                 `<button class="code-btn js-code-to-notes" title="Enviar a notas">✎ Notas</button>` +
                 `<button class="code-btn js-open-canvas"   title="Abrir en Canvas">◱ Canvas</button>` +
                 runBtn +
               `</div>` +
               `<pre>${hl}</pre>` +
             `</div>`;
    }
    return escape(p.c)
      .replace(/`([^`\n]+)`/g,       '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g,     '<em>$1</em>')
      .replace(/\n/g,                '<br>');
  }).join('');
}

function _normalizarChatGPT(texto) {
  return texto
    .replace(/^(\d+\.\s+)([^–\-\n]{3,60})\s*[–—-]\s*/gm, (_, num, titulo) => {
      return `${num}**${titulo.trim()}** — `;
    })
    .replace(/^([•·]\s*)([^–\-\n]{3,60})\s*[–—-]\s*/gm, (_, bullet, titulo) => {
      return `${bullet}**${titulo.trim()}** — `;
    });
}

export function renderizarContenido(texto, opts = {}) {
  if (!texto) return '';
  const procesado = opts.externo ? _normalizarChatGPT(texto) : texto;
  return renderMarkdownLight(procesado);
}

export function formatearArgsToolCall(toolCalls) {
  if (!toolCalls?.length) return '';
  return toolCalls.map(tc => {
    const name = tc.function?.name || '?';
    const args = tc.function?.arguments || {};
    const preview = Object.entries(args)
      .slice(0, 2)
      .map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`)
      .join(', ');
    return `${name}(${preview})`;
  }).join(' · ');
}

export function scrollAlFondo(containerEl) {
  if (!containerEl) return;
  containerEl.scrollTop = containerEl.scrollHeight;
}

export function estaCercaDelFondo(containerEl, margen = 120) {
  if (!containerEl) return true;
  const { scrollTop, scrollHeight, clientHeight } = containerEl;
  return scrollHeight - scrollTop - clientHeight < margen;
}

export function inicializarEventosCodigo(containerEl, { onNotas, onRun } = {}) {
  if (!containerEl) return;

  containerEl.querySelectorAll('.js-copy-code').forEach(btn => {
    if (btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', () => {
      const raw = btn.closest('.code-block')?.dataset.code || '';
      navigator.clipboard.writeText(raw).catch(() => {});
      btn.textContent = '✓ Copiado';
      setTimeout(() => { btn.textContent = '⎘ Copiar'; }, 1500);
    });
  });

  containerEl.querySelectorAll('.js-code-to-notes').forEach(btn => {
    if (btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', async () => {
      const raw = btn.closest('.code-block')?.dataset.code || '';
      if (!raw) return;
      try {
        await onNotas?.('```\n' + raw + '\n```');
        btn.textContent = '✓ En notas';
      } catch {
        btn.textContent = '✗ Error';
      }
      setTimeout(() => { btn.textContent = '✎ Notas'; }, 1500);
    });
  });

  containerEl.querySelectorAll('.js-run-code').forEach(btn => {
    if (btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', async () => {
      const raw = btn.closest('.code-block')?.dataset.code || '';
      if (!raw) return;
      btn.disabled = true;
      btn.textContent = '⟳ Ejecutando…';
      try {
        await onRun?.(raw);
        btn.textContent = '✓ Ejecutado';
      } catch {
        btn.textContent = '✗ Error';
      }
      setTimeout(() => { btn.disabled = false; btn.textContent = '▶ Run'; }, 2000);
    });
  });

  containerEl.querySelectorAll('.js-open-canvas').forEach(btn => {
    if (btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const raw = btn.closest('.code-block')?.dataset.code || '';
      const lang = btn.closest('.code-block')?.dataset.lang || 'text';
      document.dispatchEvent(new CustomEvent('lyra:canvas', {
        detail: { code: raw, lang },
      }));
    });
  });
}
