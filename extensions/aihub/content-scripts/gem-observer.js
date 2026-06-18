// gem-observer.js — Observador universal de ✦✦✦ / ✧✧✧ en LLMs cloud
// Detecta bloques en respuestas de cualquier chat AI, los ejecuta via Aurora,
// e inyecta el resultado de vuelta.

;(function () {
  'use strict'

  if (window.__GEM_OBSERVER_STARTED__) return
  window.__GEM_OBSERVER_STARTED__ = true
  document.documentElement.dataset.gemObserver = '1'

  const SETTLE_MS = 400

  // Marcadores
  const RE_SHELL = /✦✦✦\n([\s\S]*?)\n✦✦✦/g
  const RE_NEXUS = /✧✧✧\n([\s\S]*?)\n✧✧✧/g
  const RE_ANY = /✦✦✦|✧✧✧/

  // Mensajitos con emoji variable
  const _OK_EMO  = ['🌠','✅','✨','⚡','💫','👍']
  const _NO_EMO  = ['💢','❌','🔥','💥','😤','👎']
  const _NEX_OK  = ['✅','🌠','✨','👍']
  const _NEX_NO  = ['❌','💢','🔥','👎']
  function _rnd(a) { return a[Math.floor(Math.random() * a.length)] }
  function _shortErr(stderr, code) {
    if (!stderr && code != null) return 'exit ' + code
    let s = stderr.trim()
    let m = s.match(/(?:bash:\s*\S+:\s*)?(.+?)(?:\n|$)/)
    if (!m) return s.slice(0, 30) || 'error'
    let reason = m[1].replace(/^\s*bash:\s*/,'').trim()
    if (reason.length > 30) reason = reason.slice(0, 30)
    return reason
  }

  let _seenTexts = new Set()
  let _processedCmds = new Set()
  let _settleTimer = null
  let _lastText = ''
  let _lastMeta = null

  // ── Extraer texto limpio del DOM ─────────────────────

  const _BLOCK_TAGS = new Set(['P','DIV','LI','H1','H2','H3','H4','H5','H6','BR','TR','SECTION','ARTICLE','BLOCKQUOTE'])

  function _extractText(node) {
    if (!node) return ''
    let parts = []
    function walk(n) {
      if (!n) return
      if (n.nodeName === 'PRE') {
        let code = n.querySelector('code')
        let txt = (code ? code.innerText : n.innerText) || ''
        if (txt) parts.push('\n' + txt + '\n')
        return
      }
      if (n.nodeName === 'BR') { parts.push('\n'); return }
      if (n.nodeType === 3) { let t = n.nodeValue || ''; if (t) parts.push(t); return }
      let block = _BLOCK_TAGS.has(n.nodeName)
      if (block) parts.push('\n')
      for (let c of n.childNodes) walk(c)
      if (block) parts.push('\n')
    }
    walk(node)
    return parts.join('').replace(/\n{3,}/g, '\n\n').trim()
  }

  // ── Detectar generación activa ───────────────────────

  function _isGenerating() {
    return !!document.querySelector(
      'button[data-testid="stop-button"], ' +
      'button[aria-label*="Stop generating"], ' +
      'button[aria-label*="Detener"], ' +
      'button[aria-label*="Stop response"], ' +
      'button[aria-label*="Stop generating"], ' + // Grok
      '[data-mat-icon-name="stop"], ' +
      'model-response.processing-state-visible'
    )
  }

  // ── Buscar ✦✦✦ / ✧✧✧ en el DOM ──────────────────────

  function _findBlockText() {
    let msgs = document.querySelectorAll(
      '[data-message-author-role="assistant"], ' +
      'model-response, ' +
      '[data-is-streaming], ' +
      '.font-claude-message, ' +
      '[class*="BotMessage"], ' +
      '[class*="assistant-message"], ' +
      '[data-testid="assistant-message"]'   // Grok
    )
    let last = msgs[msgs.length - 1]
    if (!last) return ''
    // Grok tiene el contenido dentro de .response-content-markdown
    let content = last.querySelector('.response-content-markdown') || last
    return _extractText(content)
  }

  // ── Procesar bloque ──────────────────────────────────

  async function _processText(text) {
    if (!RE_ANY.test(text)) return
    if (_seenTexts.has(text)) return
    _seenTexts.add(text)

    let blocks = []

    // Parsear localmente primero (ruta rápida)
    let m
    while ((m = RE_SHELL.exec(text)) !== null) {
      blocks.push({ type: 'shell', cmd: m[1].trim() })
      text = text.replace(m[0], '')
    }
    while ((m = RE_NEXUS.exec(text)) !== null) {
      blocks.push({ type: 'nexus', body: m[1].trim() })
      text = text.replace(m[0], '')
    }

    // Dedup: skip commands already processed (Gemini echoes them back)
    blocks = blocks.filter(b => {
      const key = (b.cmd || b.body || '').trim()
      if (!key || _processedCmds.has(key)) return false
      _processedCmds.add(key)
      return true
    })
    if (!blocks.length) return

    let outputs = []
    for (let b of blocks) {
      if (b.type === 'shell') {
        try {
          let data = await _bgFetch('/nexus/shell/run', { cmd: b.cmd })
          let out = (data.stdout || '').replace(/\r/g, '').trimEnd()
          let err = (data.stderr || '').replace(/\r/g, '').trimEnd()
          let killed = data.killed
          let ok = !killed && (data.code === 0 || data.code == null)
          if (killed) {
            outputs.push(out || b.cmd)
          } else if (!ok) {
            outputs.push(err || 'Error: exit code ' + data.code)
          } else {
            outputs.push(out || 'ok')
          }
        } catch (e) {
          outputs.push('Error: ' + e.message)
        }
      }
      if (b.type === 'nexus') {
        let lines = b.body.split('\n').filter(l => l.trim())
        for (let line of lines) {
          let kv = {}
          for (let pair of line.matchAll(/(\w+)=("[^"]*"|\S+)/g)) {
            kv[pair[1]] = pair[2].replace(/^"|"$/g, '')
          }
          let action = kv['action'] || ''
          delete kv['action']
          try {
            let data = await _bgFetch('/nexus/' + action, kv)
            outputs.push('✧ ' + action + ' → ' + (data.ok ? '✓' : 'Error: ' + (data.error || '')) + '\n' + action + ' ' + (data.ok ? 'ok' : 'no') + ' ' + _rnd(data.ok ? _NEX_OK : _NEX_NO))
          } catch (e) {
            outputs.push('✧ ' + action + ' → Error: ' + e.message + '\n' + action + ' no ' + _rnd(_NEX_NO))
          }
        }
      }
    }

    if (outputs.length) _injectResult(outputs.join('\n'))
  }

  // ── Relay via background worker (evita Private Network Access) ──
  // Uses chrome.runtime.connect() + chrome.storage.local polling fallback
  async function _bgFetch(path, body) {
    const key = 'pf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    return new Promise((resolve, reject) => {
      let resolved = false
      const timeout = setTimeout(() => {
        if (resolved) return
        // Port failed, poll chrome.storage for result
        _pollStorage(key, 20, 500).then(result => {
          if (result) return resolve(result)
          reject(new Error('proxy timeout'))
        })
      }, 5000)
      try {
        const port = chrome.runtime.connect({ name: 'proxy-fetch' })
        port.onMessage.addListener(resp => {
          clearTimeout(timeout)
          resolved = true
          port.disconnect()
          if (!resp || !resp.ok) return reject(new Error(resp?.error || 'proxy error'))
          resolve(resp.data)
        })
        port.onDisconnect.addListener(() => {
          if (resolved) return
          // Port disconnected, poll storage
          clearTimeout(timeout)
          _pollStorage(key, 20, 500).then(result => {
            resolved = true
            if (result) return resolve(result)
            reject(new Error('proxy disconnected'))
          })
        })
        port.postMessage({ type: 'PROXY_FETCH', path, body, method: 'POST', key })
      } catch (e) {
        clearTimeout(timeout)
        reject(e)
      }
    })
  }

  async function _pollStorage(key, maxTries, intervalMs) {
    for (let i = 0; i < maxTries; i++) {
      await new Promise(r => setTimeout(r, intervalMs))
      try {
        const result = await new Promise((resolve) => {
          chrome.storage.local.get(key, (items) => {
            resolve(items[key] || null)
          })
        })
        if (result) {
          chrome.storage.local.remove(key)
          if (!result.ok) throw new Error(result.error || 'proxy error')
          return result.data
        }
      } catch {}
    }
    return null
  }

  // ── Inyectar resultado al chat ───────────────────────

  function _getComposer() {
    return document.querySelector('.ql-editor') ||
      document.querySelector('#prompt-textarea') ||
      document.querySelector('textarea[placeholder]') ||
      document.querySelector('[aria-label="Ask Grok anything"]') ||  // Grok
      document.querySelector('div[contenteditable="true"][role="textbox"]') ||
      document.querySelector('div[contenteditable="true"]')
  }

  function _getSendButton() {
    return document.querySelector('[data-testid="send-button"]') ||
      document.querySelector('button[aria-label*="Send"], button[aria-label*="Enviar"]') ||
      document.querySelector('button[aria-label="Submit"]') ||
      [...document.querySelectorAll('button')].find(b => /enviar|send|submit/i.test(b.getAttribute('aria-label') || ''))
  }

  function _clickSend() {
    // Grok / ProseMirror: Enter en contenteditable
    let pm = document.querySelector('[aria-label="Ask Grok anything"]')
    if (pm) {
      pm.focus()
      pm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }))
      pm.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }))
      return true
    }
    let el = document.querySelector('.ql-editor')
    if (el) {
      el.focus()
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }))
      return true
    }
    let btn = _getSendButton()
    if (btn && !btn.disabled) { btn.click(); return true }
    return false
  }

  function _injectResult(text) {
    let el = _getComposer()
    if (!el) return
    el.focus({ preventScroll: true })
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      el.value = text
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    } else if (el.classList.contains('ql-editor')) {
      document.execCommand('selectAll', false, null)
      document.execCommand('delete', false, null)
      let ins = document.execCommand('insertText', false, text)
      if (!ins) {
        el.innerHTML = ''
        text.split('\n').forEach(line => {
          let p = document.createElement('p')
          p.textContent = line
          el.appendChild(p)
        })
      }
      el.dispatchEvent(new InputEvent('input', { bubbles: true }))
    } else {
      let sel = window.getSelection()
      let range = document.createRange()
      range.selectNodeContents(el)
      sel.removeAllRanges()
      sel.addRange(range)
      let ins = document.execCommand('insertText', false, text)
      if (!ins) {
        el.textContent = text
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
      }
    }
    let tries = 0
    let sendInterval = setInterval(() => {
      if (_clickSend() || tries++ > 40) clearInterval(sendInterval)
    }, 200)
  }

  // ── Observer ─────────────────────────────────────────

  function _onSettle() {
    if (_isGenerating()) return
    let text = _findBlockText()
    if (!text || text === _lastText) return
    _lastText = text
    _processText(text)
  }

  function start() {
    let root = document.querySelector('#chat-history, chat-window-content, main') || document.body
    let obs = new MutationObserver(() => {
      if (!RE_ANY.test(document.body.innerText)) return
      clearTimeout(_settleTimer)
      _settleTimer = setTimeout(_onSettle, SETTLE_MS)
    })
    obs.observe(root, { childList: true, subtree: true, characterData: true })
    console.log('[Gem] observer started')
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start)
  } else {
    setTimeout(start, 500)
  }
})()
