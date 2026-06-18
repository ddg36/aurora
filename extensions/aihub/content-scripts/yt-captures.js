/**
 * Aurora Hub — YouTube Content Script
 * Page Capture Pro — YouTube Content Script v4.1
 *
 * METODO PRIMARIO: fetch del HTML de YouTube → ytInitialPlayerResponse → captions API.
 * METODO FALLBACK: DOM con auto-descubrimiento de selectores.
 */
(function () {
  'use strict';

  const MS = {
    title:     ['h1.ytd-video-primary-info-renderer yt-formatted-string','h1.ytd-watch-metadata yt-formatted-string','#title h1 yt-formatted-string','#above-the-fold #title yt-formatted-string'],
    channel:   ['ytd-channel-name#channel-name a','#channel-name a','ytd-video-owner-renderer a'],
    channelUrl:['ytd-video-owner-renderer a','#channel-name a'],
    subs:      ['ytd-video-owner-renderer #owner-sub-count','#owner-sub-count'],
    views:     ['ytd-video-primary-info-renderer #info span:first-child','#info span:first-child'],
    date:      ['ytd-video-primary-info-renderer #info span:last-child','#info span:last-child'],
    commentThread: 'ytd-comment-thread-renderer',
    commentText:   '#content-text',
    commentAuthor: '#author-text',
  };

  const PANEL_SEL   = 'ytd-engagement-panel-section-list-renderer[target-id*="transcript"]';
  const OPEN_BTN    = ['button[aria-label*="transcrip" i]', 'button[aria-label*="transcript" i]', 'ytd-video-description-transcript-section-renderer button', 'tp-yt-paper-button'];
  const EXPAND_DESC = ['#description-inline-expander tp-yt-paper-button#expand', '#description-inline-expander #expand-button'];

  const find    = (sel, p=document) => { for (const s of [].concat(sel)) { try { const e=p.querySelector(s); if(e) return e; } catch(_){} } return null; };
  const findAll = (sel, p=document) => { for (const s of [].concat(sel)) { try { const e=p.querySelectorAll(s); if(e.length) return [...e]; } catch(_){} } return []; };
  const sleep   = ms => new Promise(r=>setTimeout(r,ms));
  const fmtNum  = n => !n?'':n>=1e9?(n/1e9).toFixed(1)+'B':n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':String(n);

  // ─── METODO 1: Fetch HTML ────────────────────────────────────────────────────
  async function fetchViaHTML(videoId) {
    const html = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {'Accept-Language':'en-US,en;q=0.9'}, credentials:'include'
    }).then(r=>{ if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); });

    let pr = null;
    for (const re of [
      /ytInitialPlayerResponse\s*=\s*({.+?})\s*;[\s\S]*?(?:var\s+(?:meta|head)|<\/script)/,
      /ytInitialPlayerResponse\s*=\s*({[\s\S]+?})\s*;\s*(?:var|if|window)/,
      /ytInitialPlayerResponse\s*=\s*({[\s\S]+?})\s*;/,
    ]) {
      const m = html.match(re);
      if (m) { try { pr = JSON.parse(m[1]); break; } catch(_){} }
    }
    if (!pr) throw new Error('No se encontro ytInitialPlayerResponse en el HTML.');

    const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks?.length) throw new Error(pr?.videoDetails ? 'Este video no tiene transcripcion disponible.' : 'No se encontraron pistas de captions.');

    const manual = tracks.filter(t=>!t.kind||t.kind!=='asr');
    const track  = manual.find(t=>t.languageCode?.startsWith('es'))
                || manual.find(t=>t.languageCode?.startsWith('en'))
                || manual[0]
                || tracks.find(t=>t.languageCode?.startsWith('es'))
                || tracks.find(t=>t.languageCode?.startsWith('en'))
                || tracks[0];
    if (!track?.baseUrl) throw new Error('URL de captions no disponible.');

    const baseUrl = track.baseUrl;

    const jsonRes  = await fetch(baseUrl + '&fmt=json3', { credentials: 'include' });
    const jsonText = jsonRes.ok ? await jsonRes.text() : '';
    let parsed = null;
    if (jsonText && jsonText.trimEnd().endsWith('}')) {
      try { parsed = JSON.parse(jsonText); } catch(_) {}
    }

    let segs = [], seen = new Set(), usedXML = false;

    if (parsed) {
      for (const ev of (parsed.events || [])) {
        if (!ev.segs) continue;
        const raw  = ev.segs.map(s => s.utf8 || '').join('');
        const text = raw.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
        if (!text) continue;
        const sec = Math.floor((ev.tStartMs || 0) / 1000);
        const ts  = `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
        const key = `${ts}|${text}`;
        if (!seen.has(key)) { seen.add(key); segs.push({ timestamp: ts, text }); }
      }
    } else {
      usedXML = true;
      const xmlRes  = await fetch(baseUrl + '&fmt=srv3', { credentials: 'include' });
      if (!xmlRes.ok) throw new Error(`Captions HTTP ${xmlRes.status}`);
      const xmlText = await xmlRes.text();
      if (!xmlText?.trim()) throw new Error('Respuesta de captions vacia.');
      const matches = xmlText.matchAll(/<p[^>]+t="(\d+)"[^>]*>([\s\S]*?)<\/p>/g);
      for (const m of matches) {
        const ms   = parseInt(m[1], 10);
        const sec  = Math.floor(ms / 1000);
        const ts   = `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
        const text = m[2].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
        if (text.length < 2) continue;
        const key = `${ts}|${text}`;
        if (!seen.has(key)) { seen.add(key); segs.push({ timestamp: ts, text }); }
      }
    }

    if (!segs.length) throw new Error('Los captions estan vacios.');
    return { success: true, data: segs, source: usedXML ? 'fetch-xml' : 'fetch-json3', language: track.languageCode };
  }

  // ─── AUTO-DESCUBRIMIENTO de selectores ──────────────────────────────────────
  function discoverSegmentSelectors(panel) {
    const TS_RE = /^\d+:\d+$/;
    const counts = {};
    for (const el of panel.querySelectorAll('*')) {
      if (!el.tagName.includes('-')) continue;
      const tag = el.tagName.toLowerCase();
      counts[tag] = (counts[tag] || 0) + 1;
    }
    for (const [tag, count] of Object.entries(counts).sort((a,b) => b[1]-a[1])) {
      if (count < 5) continue;
      const sample = panel.querySelector(tag);
      if (!sample) continue;
      let tsClass = null, txtClass = null;
      for (const child of sample.querySelectorAll('*')) {
        const t = child.textContent.trim();
        if (!tsClass && TS_RE.test(t) && child.className) {
          tsClass = child.className.trim().split(/\s+/)[0];
          continue;
        }
        if (!txtClass && t.length > 3 && !TS_RE.test(t) && child.className) {
          txtClass = child.className.trim().split(/\s+/)[0];
        }
        if (tsClass && txtClass) break;
      }
      if (tsClass && txtClass) {
        return { segment: tag, tsClass, txtClass };
      }
    }
    return null;
  }

  function extractFromSegments(segEls, sel) {
    const TS_RE = /^\d+:\d+$/;
    const data = [], seen = new Set();
    for (const seg of segEls) {
      let ts = sel.tsClass ? seg.querySelector('.' + sel.tsClass)?.textContent.trim() || '' : '';
      if (!ts) {
        for (const c of seg.querySelectorAll('*')) {
          if (TS_RE.test(c.textContent.trim())) { ts = c.textContent.trim(); break; }
        }
      }
      let txt = sel.txtClass ? seg.querySelector('.' + sel.txtClass)?.textContent.trim() || '' : '';
      if (!txt) {
        let best = '';
        for (const c of seg.querySelectorAll('*')) {
          const t = c.textContent.trim();
          if (t.length > best.length && !TS_RE.test(t)) best = t;
        }
        txt = best;
      }
      txt = txt.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
      if (txt.length < 2) continue;
      const key = `${ts}|${txt}`;
      if (!seen.has(key)) { seen.add(key); data.push({ timestamp: ts, text: txt }); }
    }
    return data;
  }

  // ─── METODO 2: DOM con auto-descubrimiento ───────────────────────────────────
  async function fetchViaDOM() {
    const findTranscriptPanel = () => {
      for (const p of document.querySelectorAll('ytd-engagement-panel-section-list-renderer')) {
        const tid = p.getAttribute('target-id') || '';
        if (tid.includes('transcript') || !tid) {
          const customCount = [...p.querySelectorAll('*')].filter(el => el.tagName.includes('-')).length;
          if (customCount > 10) return p;
        }
      }
      return null;
    };
    const hasContent = () => {
      const p = findTranscriptPanel();
      if (!p || p.querySelector('tp-yt-paper-spinner[active]')) return false;
      const customs = [...p.querySelectorAll('*')].filter(el => el.tagName.includes('-'));
      const counts = {};
      for (const el of customs) { const t = el.tagName.toLowerCase(); counts[t] = (counts[t]||0)+1; }
      return Object.values(counts).some(n => n >= 5);
    };

    if (!hasContent()) {
      find(EXPAND_DESC)?.click();
      await sleep(800);

      let btn = find(OPEN_BTN);
      if (!btn) {
        for (const b of document.querySelectorAll('button')) {
          const t = (b.innerText || b.getAttribute('aria-label') || '').toLowerCase();
          if (t.includes('transcrip') || t.includes('transcript')) { btn = b; break; }
        }
      }
      if (!btn) return { success: false, error: 'No se encontro el boton de transcripcion.', data: [] };

      const isOpen = btn.getAttribute('aria-pressed') === 'true' || btn.getAttribute('aria-expanded') === 'true';
      if (!isOpen) { btn.click(); await sleep(2000); }

      for (let i = 0; i < 20; i++) {
        await sleep(500);
        if (hasContent()) break;
      }
    }

    let panel = null;
    for (const p of document.querySelectorAll('ytd-engagement-panel-section-list-renderer')) {
      const tid = p.getAttribute('target-id') || '';
      if (tid.includes('transcript') || !tid) {
        const customCount = [...p.querySelectorAll('*')].filter(el => el.tagName.includes('-')).length;
        if (customCount > 10) { panel = p; break; }
      }
    }
    if (!panel) return { success: false, error: 'Panel de transcript no encontrado.', data: [] };

    const sel = discoverSegmentSelectors(panel);
    if (!sel) return { success: false, error: 'No se reconocio la estructura del transcript.', data: [] };

    const segEls = [...panel.querySelectorAll(sel.segment)];
    if (!segEls.length) return { success: false, error: 'Este video no tiene transcripcion disponible.', data: [] };

    const data = extractFromSegments(segEls, sel);

    return data.length
      ? { success: true, data, source: 'dom-auto' }
      : { success: false, error: 'No se pudo extraer texto de los segmentos.', data: [] };
  }

  // ─── METODO 3: ytInitialData (más rápido, sin esperar DOM) ────────────────────
  async function fetchViaInitialData() {
    const panels = window.ytInitialData?.engagementPanels;
    if (!panels) throw new Error('No ytInitialData.engagementPanels');
    let list = null;
    for (const p of panels) {
      const id = p?.engagementPanelSectionListRenderer?.targetId || '';
      if (id === 'engagement-panel-searchable-transcript') {
        list = p.engagementPanelSectionListRenderer?.content?.transcriptRenderer?.content
                ?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments;
        if (list) break;
      }
    }
    if (!list?.length) throw new Error('No initialSegments en ytInitialData.');
    const data = [], seen = new Set();
    for (const item of list) {
      const sr = item?.transcriptSegmentRenderer;
      if (!sr) continue;
      const rawText = sr.snippet?.runs?.map(r => r.text || '').join('')
                   || sr.snippet?.simpleText
                   || '';
      const txt = rawText.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
      if (!txt) continue;
      const ts = sr.startTimeText?.simpleText || '';
      const key = `${ts}|${txt}`;
      if (!seen.has(key)) { seen.add(key); data.push({ timestamp: ts, text: txt }); }
    }
    if (!data.length) throw new Error('No se pudieron extraer segmentos de ytInitialData.');
    return { success: true, data, source: 'ytInitialData' };
  }

  // ─── METODO 4: New YouTube DOM (transcript-segment-view-model) ────────────────
  async function fetchViaNewDOM() {
    let segments = document.querySelectorAll('transcript-segment-view-model');
    if (!segments.length) {
      const btn = find(OPEN_BTN);
      if (btn) {
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        for (let i = 0; i < 20; i++) {
          await sleep(500);
          segments = document.querySelectorAll('transcript-segment-view-model');
          if (segments.length) break;
        }
      }
    }
    if (!segments.length) throw new Error('No se encontraron segmentos de transcript en el DOM.');

    const data = [], seen = new Set();
    for (const seg of segments) {
      const tsEl  = seg.querySelector('.ytwTranscriptSegmentViewModelTimestamp');
      const txtEl = seg.querySelector('span[role="text"]');
      if (!txtEl) continue;
      const ts  = tsEl ? tsEl.textContent.trim() : '';
      const txt = txtEl.textContent.trim().replace(/\s+/g, ' ');
      if (txt.length < 2) continue;
      const key = `${ts}|${txt}`;
      if (!seen.has(key)) { seen.add(key); data.push({ timestamp: ts, text: txt }); }
    }

    if (!data.length) throw new Error('No se pudo extraer texto de los segmentos del DOM.');
    return { success: true, data, source: 'dom-transcript-segment-view' };
  }

  // ─── EXTRACTOR UNIFICADO ─────────────────────────────────────────────────────
  async function extractTranscript(videoId) {
    try {
      const r = await fetchViaInitialData();
      return r;
    } catch(e) {
      // Fallback to new DOM
    }
    try {
      const r = await fetchViaNewDOM();
      return r;
    } catch(e) {
      // Fallback to fetch API
    }
    try {
      const r = await fetchViaHTML(videoId);
      return r;
    } catch(e) {
      // Fallback to DOM extraction
    }
    return await fetchViaDOM();
  }

  async function checkAvailability(videoId) {
    try {
      const html = await fetch(`https://www.youtube.com/watch?v=${videoId}`,{headers:{'Accept-Language':'en-US'},credentials:'include'}).then(r=>r.text());
      const has  = html.includes('"captionTracks"');
      const cnt  = (html.match(/"baseUrl":"https:\/\/www\.youtube\.com\/api\/timedtext/g)||[]).length;
      return {available:has, trackCount:cnt, hasManual:has&&!html.includes('"kind":"asr"'), source:'fetch-html-check'};
    } catch(_) {
      const btn = find(OPEN_BTN);
      const sec = document.querySelector('ytd-video-description-transcript-section-renderer');
      return {available:!!(btn||sec), source:'dom-check'};
    }
  }

  // ─── METADATOS ────────────────────────────────────────────────────────────────
  function extractDescription() {
    find(EXPAND_DESC)?.click();
    for (const s of ['#description-inline-expander yt-attributed-string span[dir]','#description-inline-expander yt-attributed-string','#attributed-snippet-text yt-attributed-string']) {
      const el=document.querySelector(s); if(!el) continue;
      const t=(el.innerText||el.textContent||'').trim();
      if (t.length>5) return t.replace(/Mostrar menos|Mostrar ms|Show less|Show more/gi,'').replace(/\n{3,}/g,'\n\n').trim();
    }
    const exp=document.querySelector('#description-inline-expander');
    if (exp) {
      const c=exp.cloneNode(true);
      c.querySelectorAll('ytd-horizontal-card-list-renderer,ytd-video-description-infocards-section-renderer,ytd-structured-description-content-renderer,tp-yt-paper-button,#gradient,#more,#less').forEach(e=>e.remove());
      const t=(c.innerText||c.textContent||'').trim();
      if (t) return t.replace(/\n{3,}/g,'\n\n').trim();
    }
    return '';
  }

  function extractMeta() {
    return {
      url:         window.location.href,
      videoId:     new URLSearchParams(window.location.search).get('v')||'',
      title:       find(MS.title)?.textContent.trim()||document.title||'',
      description: extractDescription(),
      channelName: find(MS.channel)?.textContent.trim()||'',
      channelUrl:  find(MS.channelUrl)?.href||'',
      subscribers: find(MS.subs)?.textContent.trim()||'',
      viewCount:   find(MS.views)?.textContent.trim()||'',
      likes:'', dislikes:'',
      uploadDate:  find(MS.date)?.textContent.trim()||'',
    };
  }

  async function fetchDislikes(id) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 3000);
      const r = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${id}`, { signal: ctl.signal });
      clearTimeout(to);
      if (!r.ok) return null;
      const d = await r.json();
      return { dislikes: d.dislikes || 0, likes: d.likes || 0 };
    } catch { return null; }
  }

  async function extractComments(max=200) {
    let threads=document.querySelectorAll(MS.commentThread);
    if (threads.length<5) { document.querySelector('ytd-comments#comments')?.scrollIntoView({behavior:'smooth',block:'end'}); await sleep(1500); threads=document.querySelectorAll(MS.commentThread); }
    const out=[], lim=Math.min(threads.length,max);
    for (let i=0;i<lim;i++) {
      const t=threads[i];
      const body=t.querySelector(MS.commentText)?.textContent.trim();
      if (body) out.push({author:t.querySelector(MS.commentAuthor)?.textContent.trim()||'Anonimo', content:body});
    }
    return {success:true,count:out.length,data:out};
  }

  // ─── FORMATEADORES ────────────────────────────────────────────────────────────
  const join = d=>d.map(s=>s.text.trim()).filter(Boolean).join(' ').replace(/\s{2,}/g,' ').trim();

  function details(m) {
    let o=`URL: ${m.url}\nTitulo: ${m.title}\n`;
    if(m.channelName) o+=`Canal: ${m.channelName}\n`;
    if(m.channelUrl)  o+=`URL canal: ${m.channelUrl}\n`;
    if(m.subscribers) o+=`Suscriptores: ${m.subscribers}\n`;
    if(m.viewCount)   o+=`Vistas: ${m.viewCount}\n`;
    if(m.likes)       o+=`Likes: ${m.likes}\n`;
    if(m.dislikes)    o+=`Dislikes: ${m.dislikes}\n`;
    if(m.uploadDate)  o+=`Fecha: ${m.uploadDate}\n`;
    if(m.description) o+=`\nDescripcion:\n${m.description.replace(/\n{3,}/g,'\n\n').trim()}\n`;
    return o;
  }

  const tsLines = d=>d.map(s=>s.timestamp?`[${s.timestamp}] ${s.text}\n`:`${s.text}\n`).join('');
  const H='=========== VIDEO ===========\n', E='\n=========== END ===========', TR='\n----------- TRANSCRIPCION -----------\n';

  const fmt = {
    withTimestamps:    (m,d)=>H+details(m)+TR+tsLines(d)+E,
    withoutTimestamps: (m,d)=>H+details(m)+TR+join(d)+'\n'+E,
    markdown: (m,d)=>{
      let md=`# URL: ${m.url}\n\n# Titulo: ${m.title}\n\n`;
      if(m.channelName) md+=`# Canal: ${m.channelUrl?`${m.channelName} (${m.channelUrl})`:m.channelName}\n\n`;
      if(m.subscribers) md+=`# Suscriptores: ${m.subscribers}\n\n`;
      if(m.viewCount)   md+=`# Vistas: ${m.viewCount}\n\n`;
      if(m.likes)       md+=`# Likes: ${m.likes}\n\n`;
      if(m.dislikes)    md+=`# Dislikes: ${m.dislikes}\n\n`;
      if(m.uploadDate)  md+=`# Fecha: ${m.uploadDate}\n\n`;
      if(m.description) md+=`# Descripcion: ${m.description}\n\n`;
      return md+`# Transcripcion: ${join(d)}\n`;
    },
    fullPage: (m,d,c)=>{
      let o='=========== WEB PAGE ===========\n'+details(m)+TR;
      o+=d?.length?tsLines(d):'No disponible\n';
      o+='\n----------- COMENTARIOS -----------\n';
      o+=c?.length?c.map(x=>`- @${x.author}: ${x.content}\n`).join(''):'Sin comentarios visibles\n';
      return o+E;
    },
    pageNoTranscript: (m)=>'=========== DETALLES DEL VIDEO ===========\n'+details(m)+'=========== END ===========',
    commentsOnly: (m,c)=>{
      let o=`=========== COMENTARIOS ===========\nVideo: ${m.title}\nURL: ${m.url}\n\n`;
      if(c?.length){o+=`Total: ${c.length} comentarios\n\n`;c.forEach((x,i)=>{o+=`${i+1}. @${x.author}:\n   "${x.content}"\n\n`;});}
      else o+='Sin comentarios visibles.\nTip: Desplazate hacia los comentarios primero.\n';
      return o+'=========== END ===========';
    },
  };

  // ─── DISPATCHER ──────────────────────────────────────────────────────────────
  async function handleExtraction(type) {
    const meta=extractMeta();
    if (!meta.videoId) return {success:false, error:'No se encontro el ID del video.'};

    const disP=fetchDislikes(meta.videoId);
    const needsTr=['withTimestamps','withoutTimestamps','markdown','fullPage'].includes(type);
    const needsCm=['fullPage','commentsOnly'].includes(type);

    let tr={success:true,data:[]}, cm={data:[]};
    if (needsTr) { try{tr=await extractTranscript(meta.videoId);}catch(e){tr={success:false,error:e.message,data:[]};} }
    if (needsCm) cm=await extractComments();

    const dis=await disP;
    if(dis){if(dis.dislikes)meta.dislikes=fmtNum(dis.dislikes);if(dis.likes)meta.likes=fmtNum(dis.likes);}

    if (['withTimestamps','withoutTimestamps','markdown'].includes(type) && !tr.success)
      return {success:false, error:tr.error};

    const content = type==='fullPage'         ? fmt.fullPage(meta,tr.data,cm.data)
                  : type==='pageNoTranscript' ? fmt.pageNoTranscript(meta)
                  : type==='commentsOnly'     ? fmt.commentsOnly(meta,cm.data)
                  : fmt[type]                 ? fmt[type](meta,tr.data)
                  : null;

    if (!content) return {success:false,error:'Tipo no valido.'};
    return {success:true,content,metadata:meta,transcriptAvailable:tr.success,transcriptSource:tr.source||'n/a',commentsCount:cm.data?.length||0};
  }

  // ─── SPA NAV + LISTENER ──────────────────────────────────────────────────────
  let lastVid=new URLSearchParams(window.location.search).get('v')||'';
  document.addEventListener('yt-navigate-finish',()=>{
    const v=new URLSearchParams(window.location.search).get('v')||'';
    if(v&&v!==lastVid){lastVid=v;}
  });

  chrome.runtime.onMessage.addListener((req,_,res)=>{
    if(req.action==='extractData')     {handleExtraction(req.type).then(res, err=>res({success:false,error:err.message})); return true;}
    if(req.action==='checkTranscript') {checkAvailability(new URLSearchParams(window.location.search).get('v')||'').then(res, err=>res({available:false,error:err.message})); return true;}
    if(req.action==='ping')            {res({alive:true}); return true;}
  });

})();
