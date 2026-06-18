// =============================================================================
// Content Script Injection — reinyección en tabs existentes
// =============================================================================

async function _bcInjectIntoExistingTab(tab) {
    if (!tab?.id || !/^https?:\/\//.test(tab.url || "")) return { ok: false, skipped: true };
    try {
        const probe = await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: false },
            world: 'ISOLATED',
            func: () => Boolean(window.__ASH_MAIN_STARTED__)
        });
        if (probe?.[0]?.result) return { ok: true, alreadyInjected: true };
        await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: false },
            files: ["content.js"]
        });
        return { ok: true, injected: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

async function _bcInjectIntoExistingTabs() {
    try {
        const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
        await Promise.allSettled(tabs.map(_bcInjectIntoExistingTab));
    } catch (e) {
        console.warn('[BC] reinyección de content scripts falló:', e.message);
    }
}

chrome.runtime.onInstalled.addListener(() => { _bcInjectIntoExistingTabs(); });
chrome.runtime.onStartup.addListener(() => { _bcInjectIntoExistingTabs(); });
setTimeout(() => { _bcInjectIntoExistingTabs(); }, 1000);

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    if (info.status !== 'complete') return;
    if (!/^https?:\/\//.test(tab.url || '')) return;
    await _bcInjectIntoExistingTab(tab);
});

// =============================================================================
// Session Management
// =============================================================================

const BC_DEFAULT_SESS = 'default';
let _bcActiveSessId = BC_DEFAULT_SESS;
let _bcSessions = {};

function _bcNewSessObj() {
    return {
        tabId: null, windowId: null, url: null, title: null,
        screenshot: null, screenshotAt: null, frameSeq: 0,
        mapText: null, elements: [], idByKey: {}, nextMapId: 1,
        busy: false, shotBusy: false, lastError: null,
    };
}

function _bcGetSess(id) {
    const sid = id || _bcActiveSessId;
    if (!_bcSessions[sid]) _bcSessions[sid] = _bcNewSessObj();
    return _bcSessions[sid];
}

function _bcSetActive(id) {
    if (!_bcSessions[id]) _bcSessions[id] = _bcNewSessObj();
    _bcActiveSessId = id;
    _bc = _bcSessions[id];
}

let _bc = _bcGetSess(BC_DEFAULT_SESS);
_bcSetActive(BC_DEFAULT_SESS);

function _bcLoadState() {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.get(['bc_sessions', 'bc_activeSessId'], (data) => {
                if (data.bc_sessions && typeof data.bc_sessions === 'object') {
                    chrome.tabs.query({}, (tabs) => {
                        const liveTabIds = new Set(tabs.map(t => t.id));
                        for (const [sid, saved] of Object.entries(data.bc_sessions)) {
                            const sess = _bcGetSess(sid);
                            sess.url      = saved.url      || null;
                            sess.title    = saved.title    || null;
                            sess.idByKey  = saved.idByKey  || {};
                            sess.nextMapId = Number(saved.nextMapId) || 1;
                            if (saved.tabId && liveTabIds.has(saved.tabId)) {
                                sess.tabId    = saved.tabId;
                                sess.windowId = saved.windowId || null;
                            } else {
                                sess.tabId    = null;
                                sess.windowId = null;
                            }
                        }
                    });
                }
                const activeId = data.bc_activeSessId || BC_DEFAULT_SESS;
                _bcSetActive(activeId);
                resolve();
            });
        } catch (_) { resolve(); }
    });
}

function _bcSaveState() {
    return new Promise((resolve) => {
        try {
            const toSave = {};
            for (const [sid, sess] of Object.entries(_bcSessions)) {
                toSave[sid] = {
                    tabId:     sess.tabId,
                    windowId:  sess.windowId,
                    url:       sess.url,
                    title:     sess.title,
                    idByKey:   sess.idByKey   || {},
                    nextMapId: sess.nextMapId || 1,
                };
            }
            chrome.storage.local.set({ bc_sessions: toSave, bc_activeSessId: _bcActiveSessId }, () => {
                resolve();
            });
        } catch (_) { resolve(); }
    });
}

async function _bcGetNormalWindowId(preferredWindowId) {
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    if (!windows.length) return null;
    const preferred = preferredWindowId ? windows.find(w => w.id === preferredWindowId) : null;
    if (preferred) return preferred.id;
    const focused = windows.find(w => w.focused);
    if (focused) return focused.id;
    const withHttpTab = windows.find(w => (w.tabs || []).some(t => /^https?:\/\//i.test(t.url || '')));
    return (withHttpTab || windows[0]).id;
}

async function _bcEnsureTab(url, sess) {
    sess = sess || _bc;
    try {
        if (sess.tabId) {
            const tabs = await chrome.tabs.query({});
            const existing = tabs.find(t => t.id === sess.tabId);
            if (!existing) {
                sess.tabId = null; sess.windowId = null;
            } else {
                const win = await chrome.windows.get(existing.windowId).catch(() => null);
                if (win?.type !== 'normal') { sess.tabId = null; sess.windowId = null; }
            }
        }
        if (!sess.tabId) {
            const windowId = await _bcGetNormalWindowId(sess.windowId);
            if (!windowId) throw new Error('No hay ventana normal disponible');
            const tab = await chrome.tabs.create({ url: url || 'about:blank', active: false, windowId });
            sess.tabId    = tab.id;
            sess.windowId = tab.windowId;
        } else if (url) {
            let nextUrl = url;
            try { nextUrl = new URL(url, sess.url || undefined).href; } catch (_) {}
            if (sess.url && nextUrl !== sess.url) { sess.idByKey = {}; sess.nextMapId = 1; sess.elements = []; }
            await chrome.tabs.update(sess.tabId, { url });
        }
        await _bcSaveState();
        return sess.tabId;
    } catch (e) {
        sess.lastError = e.message;
        return null;
    }
}

function _bcExtensionProjectUrl(rawPath) {
    let rel = String(rawPath || '').trim().replace(/\\/g, '/');
    rel = rel.replace(/^\/+/, '');
    if (!rel) throw new Error('Missing path');
    if (rel.includes('..') || /^(?:[a-z]+:)?\/\//i.test(rel)) {
        throw new Error('Path inválido para web/launch');
    }
    if (!rel.startsWith('sandbox/') && !rel.startsWith('debug-artifacts/') && !rel.startsWith('general/')) {
        rel = 'sandbox/' + rel;
    }
    if (rel.endsWith('/')) rel += 'index.html';
    if (!/\.[a-z0-9]+$/i.test(rel)) rel += '/index.html';
    return chrome.runtime.getURL(rel);
}

// =============================================================================
// UI & Side Panel
// =============================================================================

chrome.notifications.onClicked.addListener(async function(notifId) {
    if (notifId.startsWith('bc-open-')) {
        chrome.notifications.clear(notifId);
        try {
            const data = await chrome.storage.local.get('bc_pendingWindowId');
            const wid = data.bc_pendingWindowId;
            if (wid) {
                await chrome.sidePanel.open({ windowId: wid });
                console.log('[BC] sidepanel abierto via notificación, windowId', wid);
            }
        } catch (e) {
            console.warn('[BC] notification open failed:', e.message);
        }
    }
});

let _bcLastNotifAt = 0;

async function _bcOpenSidePanel(windowId) {
    windowId = await _bcGetNormalWindowId(windowId);
    if (!windowId) { console.warn('[BC] _bcOpenSidePanel: no windowId'); return; }

    try {
        await chrome.sidePanel.open({ windowId });
        console.log('[BC] sidepanel abierto directamente en ventana', windowId);
        return;
    } catch (e) {
        console.warn('[BC] open directo fallido:', e.message);
    }

    const now = Date.now();
    if (now - _bcLastNotifAt < 30000) return;
    _bcLastNotifAt = now;
    await chrome.storage.local.set({ bc_pendingWindowId: windowId });
    chrome.notifications.create('bc-open-' + now, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('ui/images/fire-sprite-0.png'),
        title: '🌐 Browser Cabin',
        message: 'Toca aquí para abrir el sidepanel.',
        priority: 2,
        requireInteraction: true,
    });
}

async function _bcWaitLoad(tabId, timeout = 8000) {
    return new Promise(resolve => {
        const t = setTimeout(() => { chrome.tabs.onUpdated.removeListener(fn); resolve(); }, timeout);
        function fn(id, info) {
            if (id === tabId && info.status === 'complete') {
                clearTimeout(t);
                chrome.tabs.onUpdated.removeListener(fn);
                setTimeout(resolve, 600);
            }
        }
        chrome.tabs.onUpdated.addListener(fn);
    });
}

chrome.tabs.onRemoved.addListener((tabId) => {
    for (const sess of Object.values(_bcSessions)) {
        if (sess.tabId === tabId) { sess.tabId = null; sess.windowId = null; }
    }
    _bcSaveState();
});

// =============================================================================
// DOM Mapper — se serializa e inyecta en el tab destino
// =============================================================================

function _bcMapFn(tipos, soloVisibles, mostrarLabels) {
    const sels = {
        input:'input[type="text"],input[type="search"],input[type="email"],input[type="password"],input:not([type])',
        button:'button,[role="button"],[role="tab"],input[type="submit"],input[type="button"]',
        link:'a[href]', select:'select', textarea:'textarea',
        contenteditable:'[contenteditable="true"]',
    };
    function genSel(el) {
        if (el.id) return '#' + el.id;
        if (el.name) return el.tagName.toLowerCase()+'[name="'+el.name+'"]';
        const cs = Array.from(el.classList).filter(c=>!c.includes(' ')).slice(0,2);
        if (cs.length) { const s='.'+cs.join('.'); if(document.querySelectorAll(s).length===1) return s; }
        const path=[]; let cur=el;
        while(cur&&cur!==document.body){let i=1,s=s.previousElementSibling;while(s){if(s.tagName===cur.tagName)i++;s=s.previousElementSibling;}path.unshift(cur.tagName.toLowerCase()+'['+i+']');cur=cur.parentElement;}
        return '//'+path.join('/');
    }
    const previousOverlay = document.getElementById('ash-browser-cabin-mapper-overlay');
    if (previousOverlay) previousOverlay.remove();

    const out=[];
    tipos.forEach(t=>{const sel=sels[t];if(!sel)return;document.querySelectorAll(sel).forEach(el=>{
        if (el.closest?.('#ash-browser-cabin-mapper-overlay')) return;
        const r=el.getBoundingClientRect();
        if(soloVisibles){if(r.width===0||r.height===0)return;if(r.bottom<0||r.top>window.innerHeight||r.left>window.innerWidth)return;if(el.offsetParent===null)return;const st=getComputedStyle(el);if(st.visibility==='hidden'||st.display==='none'||st.opacity==='0')return;}
        const raw=(el.innerText||el.textContent||el.value||'').replace(/\s+/g,' ').trim();
        const aria=el.getAttribute('aria-label')||'';const title=el.getAttribute('title')||'';
        const href=el.href||el.getAttribute('href')||'';
        const label=raw||aria||title||el.placeholder||el.id||el.name||'';
        const selectorUnico = genSel(el);
        const key = [
            el.tagName.toLowerCase(),
            selectorUnico,
            (href || '').substring(0, 160),
            (aria || title || el.placeholder || el.id || el.name || raw || '').replace(/\s+/g, ' ').trim().substring(0, 120)
        ].join('|');
        out.push({key,tagName:el.tagName.toLowerCase(),text:raw.substring(0,140),aria:aria.substring(0,180),title:title.substring(0,180),href:href.substring(0,240),label:label.substring(0,180),placeholder:el.placeholder||'',selector:selectorUnico,rect:{x:Math.round(r.left+scrollX),y:Math.round(r.top+scrollY),w:Math.round(r.width),h:Math.round(r.height),vx:Math.round(r.left),vy:Math.round(r.top)}});
    });});

    const seenSelectors = new Set(out.map(el => el.selector));
    const scrollables = [];
    const pageScroll = document.scrollingElement || document.documentElement;
    if (pageScroll && pageScroll.scrollHeight > window.innerHeight + 80) {
        scrollables.push({
            kind: 'scroll',
            tagName: 'scroll',
            text: '',
            aria: '',
            title: '',
            href: '',
            label: `Página scroll ${Math.round(window.scrollY)}/${Math.max(0, pageScroll.scrollHeight - window.innerHeight)}`,
            placeholder: '',
            selector: ':root',
            key: 'scroll|:root|page',
            scroll: {
                axis: 'y',
                top: Math.round(window.scrollY),
                left: Math.round(window.scrollX),
                height: Math.round(pageScroll.scrollHeight),
                width: Math.round(pageScroll.scrollWidth),
                clientHeight: Math.round(window.innerHeight),
                clientWidth: Math.round(window.innerWidth)
            },
            rect: {x:Math.max(0, window.scrollX + window.innerWidth - 18), y:Math.round(window.scrollY), w:14, h:Math.round(window.innerHeight), vx:Math.max(0, window.innerWidth - 18), vy:0}
        });
    }
    Array.from(document.querySelectorAll('body *')).forEach(el => {
        if (el.closest?.('#ash-browser-cabin-mapper-overlay')) return;
        const r = el.getBoundingClientRect();
        if (r.width < 80 || r.height < 80) return;
        if (r.bottom < 0 || r.top > window.innerHeight || r.left > window.innerWidth || r.right < 0) return;
        const st = getComputedStyle(el);
        if (st.visibility === 'hidden' || st.display === 'none' || st.opacity === '0') return;
        const canY = /(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 40;
        const canX = /(auto|scroll)/.test(st.overflowX) && el.scrollWidth > el.clientWidth + 40;
        if (!canY && !canX) return;
        const selector = genSel(el);
        if (seenSelectors.has(selector)) return;
        seenSelectors.add(selector);
        const raw = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        scrollables.push({
            kind: 'scroll',
            tagName: 'scroll',
            text: raw.substring(0, 120),
            aria: (el.getAttribute('aria-label') || '').substring(0, 180),
            title: (el.getAttribute('title') || '').substring(0, 180),
            href: '',
            label: (el.getAttribute('aria-label') || el.getAttribute('title') || raw || el.id || el.className || 'Área con scroll').toString().replace(/\s+/g, ' ').trim().substring(0, 180),
            placeholder: '',
            selector,
            key: `scroll|${selector}|${canY ? 'y' : ''}${canX ? 'x' : ''}`,
            scroll: {
                axis: canY && canX ? 'xy' : (canY ? 'y' : 'x'),
                top: Math.round(el.scrollTop),
                left: Math.round(el.scrollLeft),
                height: Math.round(el.scrollHeight),
                width: Math.round(el.scrollWidth),
                clientHeight: Math.round(el.clientHeight),
                clientWidth: Math.round(el.clientWidth)
            },
            rect: {x:Math.round(r.left+scrollX),y:Math.round(r.top+scrollY),w:Math.round(r.width),h:Math.round(r.height),vx:Math.round(r.left),vy:Math.round(r.top)}
        });
    });

    const mapped = out.concat(scrollables);
    if (mostrarLabels && mapped.length) {
        const overlay = document.createElement('div');
        overlay.id = 'ash-browser-cabin-mapper-overlay';
        overlay.style.cssText = [
            'position:fixed',
            'inset:0',
            'z-index:2147483647',
            'pointer-events:none',
            'font-family:system-ui,-apple-system,sans-serif',
            'contain:strict',
            'overflow:hidden',
            'background:transparent',
            'color-scheme:normal'
        ].join(';');

        mapped.forEach(el => {
            const highlight = document.createElement('div');
            const isScroll = el.kind === 'scroll' || el.tagName === 'scroll';
            highlight.style.cssText = [
                'position:absolute',
                `left:${Math.max(0, el.rect.vx)}px`,
                `top:${Math.max(0, el.rect.vy)}px`,
                `width:${Math.max(1, el.rect.w)}px`,
                `height:${Math.max(1, el.rect.h)}px`,
                `border:2px ${isScroll ? 'solid' : 'dashed'} ${isScroll ? '#f97316' : '#3b82f6'}`,
                `background:${isScroll ? 'rgba(249,115,22,.08)' : 'rgba(59,130,246,.06)'}`,
                'box-sizing:border-box',
                'z-index:2147483646',
                'pointer-events:none'
            ].join(';');

            const badge = document.createElement('div');
            badge.className = 'ash-browser-cabin-mapper-badge';
            badge.textContent = String(el.id);
            badge.style.cssText = [
                'position:absolute',
                `left:${Math.max(0, Math.min(window.innerWidth - 28, el.rect.vx + el.rect.w / 2 - 12))}px`,
                `top:${Math.max(0, Math.min(window.innerHeight - 24, el.rect.vy - 24))}px`,
                'min-width:24px',
                'height:24px',
                'padding:0 4px',
                'border-radius:999px',
                'display:flex',
                'align-items:center',
                'justify-content:center',
                `background:${isScroll ? '#f97316' : '#2563eb'}`,
                'color:white',
                'font-size:12px',
                'font-weight:700',
                'line-height:1',
                'box-shadow:0 2px 8px rgba(0,0,0,.45)',
                'border:2px solid white',
                'box-sizing:border-box',
                'z-index:2147483647',
                'pointer-events:none'
            ].join(';');

            overlay.appendChild(highlight);
            overlay.appendChild(badge);
        });
        document.body.appendChild(overlay);
    }
    return mapped;
}

function _bcClearMapOverlayFn() {
    const overlay = document.getElementById('ash-browser-cabin-mapper-overlay');
    if (overlay) overlay.remove();
    return { ok: true };
}

function _bcInteractFn(selector, accion, valor) {
    function resolve(sel){if(!sel)return null;if(sel.startsWith('//')){return document.evaluate(sel,document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue;}return document.querySelector(sel);}
    function setNative(el,val){const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;const d=Object.getOwnPropertyDescriptor(proto,'value');if(d?.set)d.set.call(el,val);else el.value=val;}
    const el=resolve(selector);if(!el)return{error:'Elemento no encontrado: '+selector};
    try{el.scrollIntoView({block:'center',behavior:'smooth'});}catch(_){}
    if(accion==='click'){try{el.focus();}catch(_){}const P=window.PointerEvent||window.MouseEvent;const o={bubbles:true,cancelable:true,view:window};el.dispatchEvent(new P('pointerdown',o));el.dispatchEvent(new MouseEvent('mousedown',o));el.dispatchEvent(new P('pointerup',o));el.dispatchEvent(new MouseEvent('mouseup',o));el.click();return{ok:true};}
    if(accion==='fill'){try{el.focus();}catch(_){}if(el.isContentEditable){el.textContent=valor;el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:valor}));}else if('value'in el){setNative(el,valor);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}else return{error:'El elemento no acepta texto'};return{ok:true};}
    return{error:'Acción no soportada: '+accion};
}

function _bcClickPointFn(x, y) {
    const cx = Number(x);
    const cy = Number(y);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return { ok: false, error: 'Invalid x/y' };
    const el = document.elementFromPoint(cx, cy);
    if (!el) return { ok: false, error: 'No element at point' };
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) {}
    try { el.focus?.(); } catch (_) {}
    const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
    const P = window.PointerEvent || window.MouseEvent;
    el.dispatchEvent(new P('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new P('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.click?.();
    const label = (el.innerText || el.getAttribute?.('aria-label') || el.getAttribute?.('title') || el.tagName || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    return { ok: true, tagName: el.tagName?.toLowerCase?.() || '', label };
}

function _bcScrollFn(selector, dx, dy, elSelector) {
    const x = Number(dx || 0);
    const y = Number(dy || 0);
    let el = null;
    function scrollableCandidates() {
        return Array.from(document.querySelectorAll('*')).filter(node => {
            const style = getComputedStyle(node);
            return /(auto|scroll)/.test(style.overflowY + style.overflowX) &&
                (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth);
        }).filter(node => {
            const r = node.getBoundingClientRect();
            return r.width > 80 && r.height > 80 && r.top < innerHeight && r.bottom > 0;
        });
    }
    if (selector === ':root' || elSelector === ':root') el = document.scrollingElement || document.documentElement;
    if (!el && selector) el = document.querySelector(selector);
    if (!el && elSelector) el = document.querySelector(elSelector);
    if (!el) {
        el = scrollableCandidates()[0] || document.scrollingElement || document.documentElement;
    }
    const beforeLeft = Math.round(el.scrollLeft || window.scrollX || 0);
    const beforeTop = Math.round(el.scrollTop || window.scrollY || 0);
    el.scrollBy ? el.scrollBy(x, y) : window.scrollBy(x, y);
    let afterLeft = Math.round(el.scrollLeft || window.scrollX || 0);
    let afterTop = Math.round(el.scrollTop || window.scrollY || 0);
    if (afterLeft === beforeLeft && afterTop === beforeTop && (x || y)) {
        const fallback = scrollableCandidates().find(node => node !== el);
        if (fallback) {
            el = fallback;
            el.scrollBy ? el.scrollBy(x, y) : window.scrollBy(x, y);
            afterLeft = Math.round(el.scrollLeft || window.scrollX || 0);
            afterTop = Math.round(el.scrollTop || window.scrollY || 0);
        }
    }
    return {
        ok: afterLeft !== beforeLeft || afterTop !== beforeTop || !(x || y),
        moved: afterLeft !== beforeLeft || afterTop !== beforeTop,
        target: el === document.scrollingElement || el === document.documentElement ? 'page' : (el.id ? '#' + el.id : el.tagName?.toLowerCase?.() || 'element'),
        beforeLeft,
        beforeTop,
        afterLeft,
        afterTop,
        scrollLeft: afterLeft,
        scrollTop: afterTop,
        warning: (afterLeft === beforeLeft && afterTop === beforeTop && (x || y)) ? 'scroll target did not move' : null
    };
}

function _bcWheelFn(x, y, dx, dy) {
    const cx = Number(x);
    const cy = Number(y);
    const deltaX = Number(dx || 0);
    const deltaY = Number(dy || 0);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return { ok: false, error: 'Invalid x/y' };

    const start = document.elementFromPoint(cx, cy);
    if (!start) return { ok: false, error: 'No element at point' };

    function scrollableAncestor(node) {
        let current = node;
        while (current && current !== document.body && current !== document.documentElement) {
            const style = getComputedStyle(current);
            const canY = /(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight;
            const canX = /(auto|scroll)/.test(style.overflowX) && current.scrollWidth > current.clientWidth;
            if (canY || canX) return current;
            current = current.parentElement;
        }
        return document.scrollingElement || document.documentElement;
    }

    const el = scrollableAncestor(start);
    const beforeLeft = Math.round(el.scrollLeft || window.scrollX || 0);
    const beforeTop = Math.round(el.scrollTop || window.scrollY || 0);

    const wheelEvent = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: cx,
        clientY: cy,
        deltaX,
        deltaY,
        deltaMode: 0
    });
    start.dispatchEvent(wheelEvent);
    if (!wheelEvent.defaultPrevented) {
        if (el === document.scrollingElement || el === document.documentElement) window.scrollBy(deltaX, deltaY);
        else el.scrollBy(deltaX, deltaY);
    }

    const afterLeft = Math.round(el.scrollLeft || window.scrollX || 0);
    const afterTop = Math.round(el.scrollTop || window.scrollY || 0);
    const label = (start.innerText || start.getAttribute?.('aria-label') || start.getAttribute?.('title') || start.tagName || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    return {
        ok: afterLeft !== beforeLeft || afterTop !== beforeTop || !(deltaX || deltaY),
        moved: afterLeft !== beforeLeft || afterTop !== beforeTop,
        target: el === document.scrollingElement || el === document.documentElement ? 'page' : (el.id ? '#' + el.id : el.tagName?.toLowerCase?.() || 'element'),
        element: start.tagName?.toLowerCase?.() || '',
        label,
        x: cx,
        y: cy,
        beforeLeft,
        beforeTop,
        afterLeft,
        afterTop,
        scrollLeft: afterLeft,
        scrollTop: afterTop,
        warning: (afterLeft === beforeLeft && afterTop === beforeTop && (deltaX || deltaY)) ? 'wheel target did not move' : null
    };
}

function _bcRegionTextFn(x, y, w, h, limit) {
    const rx = Number(x);
    const ry = Number(y);
    const rw = Number(w);
    const rh = Number(h);
    const max = Math.max(1, Math.min(20000, Number(limit) || 5000));
    if (![rx, ry, rw, rh].every(Number.isFinite) || rw <= 0 || rh <= 0) return { ok: false, error: 'Invalid region x/y/w/h' };
    const items = [];
    const seen = new Set();
    Array.from(document.querySelectorAll('body *')).forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        if (r.right < rx || r.left > rx + rw || r.bottom < ry || r.top > ry + rh) return;
        const childrenWithText = Array.from(el.children || []).filter(child => {
            const cr = child.getBoundingClientRect();
            if (cr.width <= 0 || cr.height <= 0) return false;
            if (cr.right < rx || cr.left > rx + rw || cr.bottom < ry || cr.top > ry + rh) return false;
            return Boolean((child.innerText || child.textContent || '').trim());
        });
        if (childrenWithText.length > 2) return;
        const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || seen.has(text)) return;
        if (items.some(existing => existing.includes(text))) return;
        seen.add(text);
        if (text.length <= 500) items.push(text);
    });
    const text = items.join('\n').slice(0, max);
    return { ok: true, text, count: items.length, truncated: items.join('\n').length > max };
}

function _bcTextFn(selector, limit) {
    const max = Math.max(1, Math.min(50000, Number(limit) || 12000));
    const el = selector ? document.querySelector(selector) : document.body;
    if (!el) return { ok: false, error: 'No element found for selector: ' + selector };
    const text = (el.innerText || el.textContent || '').slice(0, max);
    return { ok: true, text, truncated: (el.innerText || el.textContent || '').length > max };
}

function _bcTranscriptFn(limit) {
    const maxLines = Math.max(20, Math.min(500, Number(limit) || 180));
    const text = document.body?.innerText || '';
    const lines = text.split('\n').map(x => x.trim()).filter(Boolean);
    const headerIndex = lines.findIndex(x => /^(transcripción|transcript)$/i.test(x) || /transcripción|transcript/i.test(x));
    const timestampIndex = lines.findIndex(x => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(x));
    const segments = [];
    for (let i = 0; i < lines.length; i += 1) {
        if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(lines[i])) {
            segments.push(lines[i]);
            if (lines[i + 1] && !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(lines[i + 1])) segments.push(lines[i + 1]);
        }
        if (segments.length >= maxLines) break;
    }
    const start = headerIndex >= 0 ? headerIndex : timestampIndex >= 0 ? timestampIndex : 0;
    const chunk = segments.length >= 4 ? segments : lines.slice(start, start + maxLines);
    const timestampLines = lines.filter(x => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(x));
    return {
        ok: true,
        foundHeader: headerIndex >= 0,
        foundTimestamp: timestampIndex >= 0,
        timestampCount: timestampLines.length,
        mode: segments.length >= 4 ? 'segments' : 'chunk',
        text: chunk.join('\n')
    };
}

// =============================================================================
// Map, Screenshot & Debugger
// =============================================================================

async function _bcMap(sess) {
    sess = sess || _bc;
    if (!sess.tabId) return { ok: false, error: 'No hay tab gestionado' };
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: sess.tabId },
            func: _bcMapFn,
            args: [['input','button','link','select','textarea','contenteditable'], true, true],
        });
        const rawElementos = results[0]?.result || [];
        if (!sess.idByKey || typeof sess.idByKey !== 'object') sess.idByKey = {};
        if (!Number.isFinite(Number(sess.nextMapId)) || Number(sess.nextMapId) < 1) {
            const maxId = Math.max(0, ...Object.values(sess.idByKey).map(Number).filter(Number.isFinite));
            sess.nextMapId = maxId + 1;
        }
        const elementos = rawElementos.map((el) => {
            const key = el.key || [el.tagName, el.selector, el.href || '', el.label || el.text || ''].join('|');
            if (!sess.idByKey[key]) sess.idByKey[key] = sess.nextMapId++;
            return { ...el, key, id: sess.idByKey[key] };
        }).sort((a, b) => Number(a.id) - Number(b.id));
        sess.elements = elementos;
        const tab = (await chrome.tabs.query({})).find(t => t.id === sess.tabId);
        sess.url = tab?.url || sess.url;
        sess.title = tab?.title || sess.title;
        const lines = [
            `page "${(sess.title||'').replace(/"/g,"'")}" "${sess.url||''}"`,
            `elements total=${elementos.length} shown=${Math.min(elementos.length,60)}`,
            ...elementos.slice(0,60).map((el,i)=>{
                const lbl=(el.label||el.text||el.aria||el.title||el.placeholder||'(sin texto)').substring(0,80);
                const href=el.href?` href="${el.href.substring(0,60)}"` :'';
                const box=el.rect?` box=${el.rect.vx},${el.rect.vy},${el.rect.w},${el.rect.h}`:'';
                const scroll=el.scroll?` scroll=${el.scroll.axis} pos=${el.scroll.left},${el.scroll.top} size=${el.scroll.clientWidth}x${el.scroll.clientHeight}/${el.scroll.width}x${el.scroll.height}`:'';
                return `[${el.id || i+1}] ${el.tagName.toUpperCase()}: "${lbl}"${href}${box}${scroll}`;
            }),
        ];
        sess.mapText = lines.join('\n');
        await _bcSaveState();
        return { ok: true, mapText: sess.mapText, total: elementos.length };
    } catch (e) { return { ok: false, error: e.message }; }
}

function _bcMapLooksPoor(mapResult, sess) {
    if (!mapResult?.ok) return true;
    const text = mapResult.mapText || '';
    const total = Number(mapResult.total || 0);
    const isYouTube = /youtube\.com|youtu\.be/i.test((sess || _bc).url || '');
    if (total <= 3) return true;
    if (isYouTube) {
        const hasVideoControls = /Pausa|Play|Configuración|Pantalla completa|Subtítulos/i.test(text);
        const hasPageChrome = /Suscribirse|Compartir|Guardar|Comentarios|SCROLL|Mostrar transcrip/i.test(text);
        if (total < 18 && hasVideoControls && !hasPageChrome) return true;
    }
    return false;
}

async function _bcStableMap({ attempts = 5, delay = 1200 } = {}, sess) {
    sess = sess || _bc;
    let best = null;
    for (let i = 0; i < attempts; i++) {
        const current = await _bcMap(sess);
        if (current?.ok && (!best || Number(current.total || 0) > Number(best.total || 0))) best = current;
        if (!_bcMapLooksPoor(current, sess)) return current;
        await new Promise(res => setTimeout(res, delay));
    }
    return best || { ok: false, error: 'No se pudo mapear la página' };
}

async function _bcDetachDebugger(tabId) {
    return new Promise((resolve) => {
        chrome.debugger.detach({ tabId }, () => {
            void chrome.runtime.lastError;
            resolve();
        });
    });
}

async function _bcScreenshot(sess) {
    sess = sess || _bc;
    if (!sess.tabId) return { ok: false, error: 'No hay tab gestionado' };
    if (sess.shotBusy) return { ok: true, skipped: true, reason: 'screenshot_in_progress', screenshot: sess.screenshot, frameSeq: sess.frameSeq, screenshotAt: sess.screenshotAt };
    sess.shotBusy = true;
    const tabId = sess.tabId;
    let weAttached = false;
    try {
        await new Promise((resolve, reject) => {
            chrome.debugger.attach({ tabId }, '1.3', () => {
                const err = chrome.runtime.lastError;
                if (!err) { weAttached = true; resolve(); }
                else if (err.message?.includes('already attached')) resolve();
                else reject(new Error(err.message));
            });
        });
        const result = await new Promise((resolve, reject) => {
            chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', { format: 'png' }, (r) => {
                const err = chrome.runtime.lastError;
                if (err) reject(new Error(err.message));
                else resolve(r);
            });
        });
        if (weAttached) await _bcDetachDebugger(tabId);
        const dataUrl = 'data:image/png;base64,' + result.data;
        sess.screenshot = dataUrl;
        sess.screenshotAt = Date.now();
        sess.frameSeq = Number(sess.frameSeq || 0) + 1;
        return { ok: true, screenshot: dataUrl, screenshotAt: sess.screenshotAt, frameSeq: sess.frameSeq };
    } catch (e) {
        if (weAttached) await _bcDetachDebugger(tabId);
        return { ok: false, error: e.message };
    } finally {
        sess.shotBusy = false;
    }
}

async function _ashDebuggerClick(tabId, x, y) {
    if (!tabId) return { ok: false, error: 'missing_tab_id' };
    const cx = Number(x);
    const cy = Number(y);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return { ok: false, error: 'invalid_xy' };
    let weAttached = false;
    try {
        await new Promise((resolve, reject) => {
            chrome.debugger.attach({ tabId }, '1.3', () => {
                const err = chrome.runtime.lastError;
                if (!err) { weAttached = true; resolve(); }
                else if (err.message?.includes('already attached')) resolve();
                else reject(new Error(err.message));
            });
        });
        const target = { tabId };
        const base = { x: cx, y: cy, button: 'left', clickCount: 1, pointerType: 'mouse' };
        await new Promise((resolve, reject) => {
            chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...base }, () => {
                const err = chrome.runtime.lastError;
                if (err) reject(new Error(err.message));
                else resolve();
            });
        });
        await new Promise((resolve, reject) => {
            chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...base }, () => {
                const err = chrome.runtime.lastError;
                if (err) reject(new Error(err.message));
                else resolve();
            });
        });
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    } finally {
        if (weAttached) await _bcDetachDebugger(tabId);
    }
}

async function _ashResolveChatTabId(senderTabId) {
    if (senderTabId) return senderTabId;
    try {
        const tabs = await chrome.tabs.query({ url: ['https://chatgpt.com/*', 'https://chat.openai.com/*'] });
        const active = tabs.find(t => t.active) || tabs[0];
        return active?.id || null;
    } catch (_) {
        return null;
    }
}

async function _ashDebuggerEnter(tabId, x, y) {
    if (!tabId) return { ok: false, error: 'missing_tab_id' };
    let weAttached = false;
    try {
        await new Promise((resolve, reject) => {
            chrome.debugger.attach({ tabId }, '1.3', () => {
                const err = chrome.runtime.lastError;
                if (!err) { weAttached = true; resolve(); }
                else if (err.message?.includes('already attached')) resolve();
                else reject(new Error(err.message));
            });
        });
        const target = { tabId };
        const cx = Number(x);
        const cy = Number(y);
        if (Number.isFinite(cx) && Number.isFinite(cy)) {
            const mouse = { x: cx, y: cy, button: 'left', clickCount: 1, pointerType: 'mouse' };
            await new Promise((resolve, reject) => {
                chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...mouse }, () => {
                    const err = chrome.runtime.lastError;
                    if (err) reject(new Error(err.message));
                    else resolve();
                });
            });
            await new Promise((resolve, reject) => {
                chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...mouse }, () => {
                    const err = chrome.runtime.lastError;
                    if (err) reject(new Error(err.message));
                    else resolve();
                });
            });
        }
        const base = {
            key: 'Enter',
            code: 'Enter',
            windowsVirtualKeyCode: 13,
            nativeVirtualKeyCode: 13,
        };
        await new Promise((resolve, reject) => {
            chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base }, () => {
                const err = chrome.runtime.lastError;
                if (err) reject(new Error(err.message));
                else resolve();
            });
        });
        await new Promise((resolve, reject) => {
            chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyUp', ...base }, () => {
                const err = chrome.runtime.lastError;
                if (err) reject(new Error(err.message));
                else resolve();
            });
        });
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    } finally {
        if (weAttached) await _bcDetachDebugger(tabId);
    }
}

// =============================================================================
// handleBrowserAction — Manejador principal de acciones del navegador
// =============================================================================

async function handleBrowserAction(request, sendResponse, senderWindowId) {
    const { bcAction, params = {} } = request;
    await _bcLoadState();

    const _sessId = (params.session || '').trim() || _bcActiveSessId;
    const sess = _bcGetSess(_sessId);
    sess.busy = true;
    sess.lastError = null;

    try {
        let result = { ok: false, error: 'Unknown action' };

        if (bcAction === 'browser/state') {
            result = { ok: true, session: _sessId, url: sess.url, title: sess.title, screenshot: sess.screenshot, screenshotAt: sess.screenshotAt, frameSeq: sess.frameSeq, mapText: sess.mapText, elements: sess.elements, busy: sess.busy, shotBusy: sess.shotBusy };
        }
        else if (bcAction === 'browser/session-new') {
            const sid = (params.id || params.name || '').trim() || ('sess_' + Date.now());
            _bcGetSess(sid);
            _bcSetActive(sid);
            await _bcSaveState();
            result = { ok: true, session: sid, sessions: Object.keys(_bcSessions) };
        }
        else if (bcAction === 'browser/session-use') {
            const sid = (params.id || params.name || '').trim();
            if (!sid) { result = { ok: false, error: 'Missing id param' }; }
            else {
                _bcGetSess(sid);
                _bcSetActive(sid);
                await _bcSaveState();
                result = { ok: true, session: sid, url: _bcSessions[sid].url || null, title: _bcSessions[sid].title || null };
            }
        }
        else if (bcAction === 'browser/session-list') {
            const list = Object.entries(_bcSessions).map(([sid, s]) => ({
                id: sid, active: sid === _bcActiveSessId,
                url: s.url || null, title: s.title || null, hasTab: !!s.tabId,
            }));
            result = { ok: true, active: _bcActiveSessId, sessions: list };
        }
        else if (bcAction === 'browser/session-close') {
            const sid = (params.id || params.name || '').trim() || _bcActiveSessId;
            const target = _bcSessions[sid];
            if (!target) { result = { ok: false, error: `Sesión "${sid}" no existe` }; }
            else {
                if (target.tabId) { try { await chrome.tabs.remove(target.tabId); } catch (_) {} }
                delete _bcSessions[sid];
                if (_bcActiveSessId === sid) {
                    const nextId = Object.keys(_bcSessions)[0] || BC_DEFAULT_SESS;
                    _bcGetSess(nextId);
                    _bcSetActive(nextId);
                }
                await _bcSaveState();
                result = { ok: true, closed: sid, active: _bcActiveSessId };
            }
        }
        else if (bcAction === 'web/launch') {
            try {
                const url = _bcExtensionProjectUrl(params.path || params.url);
                await _bcOpenSidePanel(senderWindowId);
                const tabId = await _bcEnsureTab(url, sess);
                if (!tabId) { result = { ok: false, error: 'No se pudo crear/navegar el tab' }; }
                else {
                    await _bcWaitLoad(tabId);
                    const mapResult = await _bcStableMap({}, sess);
                    await _bcScreenshot(sess);
                    result = { ok: true, session: _sessId, url: sess.url, title: sess.title, mapText: sess.mapText, total: sess.elements.length };
                }
            } catch (e) {
                result = { ok: false, error: e.message };
            }
        }
        else if (bcAction === 'browser/navigate') {
            const url = params.url;
            if (!url) { result = { ok: false, error: 'Missing url' }; }
            else {
                await _bcOpenSidePanel(senderWindowId);
                const tabId = await _bcEnsureTab(url, sess);
                if (!tabId) { result = { ok: false, error: 'No se pudo crear/navegar el tab' }; }
                else {
                    await _bcWaitLoad(tabId);
                    const mapResult = await _bcStableMap({}, sess);
                    result = { ok: true, session: _sessId, url: sess.url, title: sess.title, mapText: sess.mapText, total: sess.elements.length };
                }
            }
        }
        else if (bcAction === 'browser/map') {
            const mapResult = await _bcStableMap({}, sess);
            if (mapResult.ok) await _bcScreenshot(sess);
            result = mapResult;
        }
        else if (bcAction === 'browser/clear-map') {
            if (!sess.tabId) {
                result = { ok: false, error: 'No hay tab gestionado' };
            } else {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: sess.tabId },
                    func: _bcClearMapOverlayFn,
                });
                result = results?.[0]?.result || { ok: true };
                sess.mapText = null;
                sess.elements = [];
                await _bcSaveState();
            }
        }
        else if (bcAction === 'browser/screenshot') {
            result = await _bcScreenshot(sess);
        }
        else if (bcAction === 'browser/frame') {
            result = await _bcScreenshot(sess);
        }
        else if (bcAction === 'browser/text') {
            if (!sess.tabId) {
                result = { ok: false, error: 'No hay tab gestionado' };
            } else {
                const selector = params.selector || 'body';
                const limit = params.limit || 12000;
                const results = await chrome.scripting.executeScript({
                    target: { tabId: sess.tabId },
                    func: _bcTextFn,
                    args: [selector, limit],
                });
                result = results?.[0]?.result || { ok: false, error: 'sin resultado' };
            }
        }
        else if (bcAction === 'browser/transcript') {
            if (!sess.tabId) {
                result = { ok: false, error: 'No hay tab gestionado' };
            } else {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: sess.tabId },
                    func: _bcTranscriptFn,
                    args: [params.limit || 180],
                });
                result = results?.[0]?.result || { ok: false, error: 'sin resultado' };
            }
        }
        else if (bcAction === 'browser/read-main') {
            if (!sess.tabId) {
                result = { ok: false, error: 'No hay tab gestionado' };
            } else {
                const limit = Number(params.limit) || 12000;
                const results = await chrome.scripting.executeScript({
                    target: { tabId: sess.tabId },
                    func: function(maxChars) {
                        const candidates = ['main', 'article', '[role="main"]', '#content', '#bodyContent', '.content', '.article', '.post', 'body'];
                        let el = null;
                        for (const sel of candidates) {
                            const found = document.querySelector(sel);
                            if (found && (found.innerText || '').trim().length > 200) { el = found; break; }
                        }
                        const clone = (el || document.body).cloneNode(true);
                        clone.querySelectorAll('nav,header,footer,aside,script,style,noscript,[role="navigation"],[role="banner"],[role="contentinfo"]').forEach(n => n.remove());
                        const text = (clone.innerText || '')
                            .replace(/[ \t]+/g, ' ')
                            .replace(/\n{3,}/g, '\n\n')
                            .trim()
                            .slice(0, maxChars);
                        const links = Array.from((el || document.body).querySelectorAll('a[href]'))
                            .filter(a => a.href && !a.href.startsWith('javascript') && (a.innerText || '').trim().length > 1)
                            .slice(0, 20)
                            .map(a => ({ text: (a.innerText || '').trim().slice(0, 80), href: a.href.slice(0, 200) }));
                        return { ok: true, title: document.title, url: location.href, text, links };
                    },
                    args: [limit],
                });
                result = results?.[0]?.result || { ok: false, error: 'sin resultado' };
            }
        }
        else if (bcAction === 'browser/click' || bcAction === 'browser/fill') {
            const elId = Number(params.el);
            if (!elId) { result = { ok: false, error: 'Missing el param' }; }
            else {
                const el = sess.elements.find(item => Number(item.id) === elId) || sess.elements[elId - 1];
                if (!el) { result = { ok: false, error: `Elemento [${elId}] no en mapa — usa browser/map primero` }; }
                else {
                    const accion = bcAction === 'browser/click' ? 'click' : 'fill';
                    const valor  = params.text || '';
                    const results = await chrome.scripting.executeScript({
                        target: { tabId: sess.tabId },
                        func: _bcInteractFn,
                        args: [el.selector, accion, valor],
                    });
                    const r = results?.[0]?.result;
                    if (r?.ok) {
                        await new Promise(res => setTimeout(res, 700));
                        await _bcStableMap({ attempts: 3, delay: 800 }, sess);
                        await _bcScreenshot(sess);
                        result = { ok: true, action: accion, el: elId, label: el.label || el.text };
                    } else {
                        result = { ok: false, error: r?.error || 'sin resultado' };
                    }
                }
            }
        }
        else if (bcAction === 'browser/click-point') {
            if (!sess.tabId) {
                result = { ok: false, error: 'No hay tab gestionado' };
            } else {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: sess.tabId },
                    func: _bcClickPointFn,
                    args: [params.x, params.y],
                });
                const r = results?.[0]?.result;
                if (r?.ok) {
                    await new Promise(res => setTimeout(res, 500));
                    await _bcStableMap({ attempts: 3, delay: 800 }, sess);
                    await _bcScreenshot(sess);
                    result = r;
                } else {
                    result = r || { ok: false, error: 'sin resultado' };
                }
            }
        }
        else if (bcAction === 'browser/scroll') {
            const dx = Number(params.dx || 0);
            const dy = Number(params.dy || 0);
            if (sess.tabId) {
                const scrollElement = params.el
                    ? (sess.elements.find(item => Number(item.id) === Number(params.el)) || sess.elements[Number(params.el) - 1])
                    : null;
                const scrollResults = await chrome.scripting.executeScript({
                    target: { tabId: sess.tabId },
                    func: _bcScrollFn,
                    args: [params.selector || '', dx, dy, scrollElement?.selector || ''],
                });
                await new Promise(r => setTimeout(r, 500));
                await _bcStableMap({ attempts: 3, delay: 800 }, sess);
                await _bcScreenshot(sess);
                result = scrollResults?.[0]?.result || { ok: true, scrolled: `${dx},${dy}` };
            }
        }
        else if (bcAction === 'browser/wheel') {
            if (!sess.tabId) {
                result = { ok: false, error: 'No hay tab gestionado' };
            } else {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: sess.tabId },
                    func: _bcWheelFn,
                    args: [params.x, params.y, params.dx || 0, params.dy || 0],
                });
                await new Promise(r => setTimeout(r, 500));
                await _bcStableMap({ attempts: 3, delay: 800 }, sess);
                await _bcScreenshot(sess);
                result = results?.[0]?.result || { ok: false, error: 'sin resultado' };
            }
        }
        else if (bcAction === 'browser/region-text') {
            if (!sess.tabId) {
                result = { ok: false, error: 'No hay tab gestionado' };
            } else {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: sess.tabId },
                    func: _bcRegionTextFn,
                    args: [params.x, params.y, params.w, params.h, params.limit],
                });
                result = results?.[0]?.result || { ok: false, error: 'sin resultado' };
            }
        }

        sess.busy = false;
        chrome.runtime.sendMessage({ type: 'BC_STATE_UPDATE', state: { session: _sessId, sessions: Object.keys(_bcSessions).map(sid => ({ id: sid, active: sid === _bcActiveSessId, url: _bcSessions[sid].url, title: _bcSessions[sid].title, hasTab: !!_bcSessions[sid].tabId })), url: sess.url, title: sess.title, screenshot: sess.screenshot, screenshotAt: sess.screenshotAt, frameSeq: sess.frameSeq, mapText: sess.mapText, elements: sess.elements, busy: false, shotBusy: sess.shotBusy } }).catch(()=>{});
        sendResponse(result);
    } catch (e) {
        sess.busy = false;
        sess.lastError = e.message;
        sendResponse({ ok: false, error: e.message });
    }
}

// =============================================================================
// Message Listeners — BROWSER_ACTION, BC_GET_STATE
// =============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'BROWSER_ACTION') {
        handleBrowserAction(request, sendResponse, sender?.tab?.windowId);
        return true;
    }
    if (request.type === 'BC_GET_STATE') {
        (async () => {
            _bcInjectIntoExistingTabs();
            await _bcLoadState();
            const activeSess = _bcGetSess(_bcActiveSessId);
            sendResponse({ ok: true, session: _bcActiveSessId, sessions: Object.keys(_bcSessions).map(sid => ({ id: sid, active: sid === _bcActiveSessId, url: _bcSessions[sid].url, title: _bcSessions[sid].title, hasTab: !!_bcSessions[sid].tabId })), url: activeSess.url, title: activeSess.title, screenshot: activeSess.screenshot, screenshotAt: activeSess.screenshotAt, frameSeq: activeSess.frameSeq, mapText: activeSess.mapText, elements: activeSess.elements, busy: activeSess.busy, shotBusy: activeSess.shotBusy });
        })();
        return true;
    }
});

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    if (request?.type === 'BROWSER_ACTION') {
        handleBrowserAction(request, sendResponse, sender?.tab?.windowId);
        return true;
    }
    if (request?.type === 'EXECUTE_BLOCK') {
        _executeBlock(request.cmd).then(formatted => sendResponse({ ok: true, formatted })).catch(e => sendResponse({ ok: false, error: e.message }));
        return true;
    }
    if (request?.type === 'EXECUTE_TEXT') {
        _executeText(request.text || '', request.context || {}).then(formatted => sendResponse({ ok: true, formatted })).catch(e => sendResponse({ ok: false, error: e.message }));
        return true;
    }
    sendResponse({ ok: false, error: 'ASH external message no soportado' });
    return true;
});

// =============================================================================
// Orion Parser & Executor
// =============================================================================

const ORION_EXTENSION_ID = 'amgjbhnocmeiifdgdgjabbgblcggleah';

function _parseWithOrion(text, context = {}) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(ORION_EXTENSION_ID, {
            type: 'ORION_PARSE',
            text,
            context: {
                origin: 'ash',
                surface: context.surface || 'external',
                url: context.url || '',
                defaultWorkspace: context.defaultWorkspace || 'ash',
                allowedWorkspaces: context.allowedWorkspaces || ['ash'],
                conversationId: context.conversationId || context.host || 'external',
                messageIndex: context.messageIndex,
                turnIndex: context.turnIndex,
            }
        }, res => {
            const err = chrome.runtime.lastError;
            if (err) { reject(new Error(err.message)); return; }
            resolve(res);
        });
    });
}

async function _executeText(text, context = {}) {
    const parsed = await _parseWithOrion(text, context);
    if (!parsed?.blocks?.length) {
        const code = parsed?.errors?.[0]?.code || 'NO_BLOCK_FOUND';
        const message = parsed?.errors?.[0]?.message || 'Orion no encontró bloques ejecutables';
        throw new Error(code + ': ' + message);
    }
    const outputs = [];
    for (const cmd of parsed.blocks) {
        if (!cmd.ok) continue;
        outputs.push(await _executeBlock(cmd));
    }
    return outputs.filter(Boolean).join('\n\n');
}

async function _executeBlock(cmd) {
    const NEXUS = 'http://127.0.0.1:7777';
    const ws = cmd.workspace || 'ash';
    const app = cmd.app || 'nx';

    if (app === 'br' || cmd.target === 'browser') {
        return await _executeBrowserBlock(cmd);
    }

    if (app === 'nx' || app === 'nxw') {
        const shell = cmd.params?.shell || (app === 'nxw' ? 'powershell' : 'bash');
        const res = await fetch(`${NEXUS}/${ws}/run-shell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: cmd.id, cmd: cmd.cmd, shell }),
        }).then(r => r.json());
        const status = res.ok ? 'ok' : 'error';
        const cwd = res.cwd || res.result?.cwd || '~';
        const stdout = res.stdout || res.result?.stdout || '';
        const stderr = res.stderr || res.result?.stderr || '';
        return _fmtNx({ status, cwd, stdout, stderr, exit: res.code });
    }

    if (app === 'nexus') {
        const res = await fetch(`${NEXUS}/${ws}/run-cli`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: cmd.id, cmd: cmd.cmd, body: cmd.body || '' }),
        }).then(r => r.json());
        const status = res.ok ? 'ok' : 'error';
        const output = res.result?.content ?? res.result?.entries ?? res.result ?? '';
        return `[nexus]\n${typeof output === 'string' ? output : JSON.stringify(output, null, 2)}\n[${status === 'ok' ? '🌠ok' : '💢error'}]`;
    }

    throw new Error('app no soportada en EXECUTE_BLOCK: ' + app);
}

const _BR_ACTION_MAP = {
    'web-launch':    'web/launch',
    navigate:        'browser/navigate',
    map:             'browser/map',
    screenshot:      'browser/screenshot',
    frame:           'browser/frame',
    state:           'browser/state',
    'clear-map':     'browser/clear-map',
    'read-main':     'browser/read-main',
    text:            'browser/text',
    transcript:      'browser/transcript',
    'region-text':   'browser/region-text',
    click:           'browser/click',
    fill:            'browser/fill',
    'click-point':   'browser/click-point',
    scroll:          'browser/scroll',
    wheel:           'browser/wheel',
    'session-new':   'browser/session-new',
    'session-use':   'browser/session-use',
    'session-list':  'browser/session-list',
    'session-close': 'browser/session-close',
};

function _executeBrowserBlock(cmd) {
    return new Promise(resolve => {
        const bcAction = _BR_ACTION_MAP[cmd.action];
        if (!bcAction) {
            resolve(`@@browser-result:${cmd.id} status=error\nUNSUPPORTED_ACTION: ${cmd.action}\n@@end-result:${cmd.id}`);
            return;
        }
        const params = Object.assign({}, cmd.params || {});
        if (cmd.session) params.session = cmd.session;
        handleBrowserAction({ type: 'BROWSER_ACTION', bcAction, params }, result => {
            const status = result?.ok ? 'ok' : 'error';
            const body = result?.ok
                ? [result.url ? 'url=' + result.url : '', result.title ? 'title=' + result.title : '', result.mapText || result.text || ''].filter(Boolean).join('\n')
                : (result?.error || 'error');
            resolve(`@@browser-result:${cmd.id} action=${bcAction} status=${status}\n${body}\n@@end-result:${cmd.id}`);
        });
    });
}

const _NX_OK  = ['🌠ok','🌠beep boop, executed','🌠done and dusted','🌠your wish is my command','🌠nexus out ✌️'];
const _NX_ERR = ['💢oops, bash said no','💢something went boom','💢bash is crying rn','💢sir this is a terminal','💢speak bash or speak nothing'];

function _fmtNx({ status, cwd, stdout, stderr, exit: exitCode }) {
    const msgs = status === 'ok' ? _NX_OK : _NX_ERR;
    const footer = '[' + msgs[Math.floor(Math.random() * msgs.length)] + ']';
    const body = (status === 'ok' ? stdout : (stderr || '')).replace(/\s+$/, '');
    const header = '[nx:' + (cwd || '~') + '$]';
    return body ? header + '\n' + body + '\n' + footer : header + '\n' + footer;
}

// =============================================================================
// Download & History
// =============================================================================

async function handleDownload(request, sendResponse) {
    console.log(`[BC] 📥 Procesando: ${request.filename}`);

    const fullPath = `core_instruction/${request.folder}/${request.filename}`;

    try {
        const downloadId = await chrome.downloads.download({
            url: request.url,
            filename: fullPath,
            conflictAction: 'overwrite',
            saveAs: false
        });

        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            title: '✅ ASH: Capturado',
            message: `📂 ${request.folder}\n📄 ${request.filename}`,
            priority: 1
        });

        await saveToHistory({
            id: downloadId || Date.now(),
            filename: request.filename,
            folder: request.folder,
            date: Date.now(),
            size: request.originalSize || 0,
            content: request.content || "",
            isFavorite: false,
            ext: request.filename.split('.').pop().toLowerCase()
        });

        sendResponse({ success: true, id: downloadId });
        console.log(`[BC] ✅ Guardado: ${fullPath}`);

    } catch (error) {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            title: '❌ ASH: Error',
            message: `Fallo al guardar ${request.filename}\n${error.message}`,
            priority: 2
        });

        sendResponse({ success: false, error: error.message });
        console.error(`[BC] ❌ Error:`, error);
    }
}

async function saveToHistory(item) {
    return new Promise((resolve) => {
        chrome.storage.local.get({ downloadHistory: [] }, (result) => {
            let history = result.downloadHistory;
            history.unshift(item);
            const favorites = history.filter(h => h.isFavorite);
            let recent = history.filter(h => !h.isFavorite);
            if (recent.length > 100) {
                recent = recent.slice(0, 100);
            }
            chrome.storage.local.set({ 
                downloadHistory: [...favorites, ...recent] 
            }, () => {
                console.log(`[BC] 💾 Historial actualizado (${favorites.length} favoritos, ${recent.length} recientes)`);
                resolve();
            });
        });
    });
}
