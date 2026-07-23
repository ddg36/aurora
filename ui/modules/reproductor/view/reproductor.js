const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useRef } = globalThis.preactHooks;

import { crearMotor, fmtTime, INST_NAMES, ROLL_ROWS, ROLL_COLS, VIZ_MODES, EQ_PRESETS, EQ_FREQS } from '../scripts/motor.js?v=v3-batch-render-1';
import * as persist from '../scripts/persistencia.js?v=v3-batch-render-1';
import { Button, Chip, Panel, PanelBody, Input, Icon, Select } from '../../../components/index.js';
import { registerAIView } from '../../../components/shared/ai-view-actions.js';

const REPEAT_LABEL = ['Repetir: off', 'Repetir: todas', 'Repetir: una'];
const REPEAT_ICON_ACTIVE = [false, true, true];

function AlbumCard({ item, motor, activo, onOpen, onQueue, onFav }) {
  const ref = useRef(null);
  useEffect(() => { if (item.kind === 'file' && item.folder) motor.ensureFolderCover(item.folder); }, [item.folder]);
  const cover = motor.coverFor(item);
  return html`
    <div ref=${ref} class=${`rp-album ${activo ? 'is-playing' : ''}`} onClick=${onOpen} onDblClick=${onQueue}>
      <img src=${cover} loading="lazy" alt="" />
      <span class="rp-badge">${item.kind === 'proc' ? '♪' : item.ext.toUpperCase()}</span>
      <div class="rp-album-meta">
        <div class="rp-album-t">${item.title}</div>
        <div class="rp-album-d">${item.kind === 'proc' ? 'procedural' : (item.folder || '/').split('/').pop()}</div>
      </div>
      <button class="rp-fav" onClick=${e => { e.stopPropagation(); onFav(); }}>${item.fav ? '★' : '☆'}</button>
    </div>
  `;
}

export default function Reproductor() {
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const folderInputRef = useRef(null);
  const sentinelRef = useRef(null);
  const motorRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [snap, setSnap] = useState(null);
  const [seed, setSeed] = useState('');
  const [search, setSearch] = useState('');
  const [panelOpen, setPanelOpen] = useState(null); // 'settings' | 'editor' | 'queue' | null

  useEffect(() => {
    const motor = crearMotor({ audioEl: audioRef.current });
    motorRef.current = motor;
    const unsub = motor.subscribe(() => setSnap(motor.snapshot()));
    motor.init(persist).then(() => { setSnap(motor.snapshot()); setReady(true); });
    let raf = 0;
    const loop = () => { motor.drawViz(canvasRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const progTimer = setInterval(() => setSnap(motor.snapshot()), 200);
    const resize = () => { if (canvasRef.current) { canvasRef.current.width = innerWidth; canvasRef.current.height = innerHeight; } };
    addEventListener('resize', resize); resize();
    const keydown = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); motor.togglePlay(); }
      else if (e.code === 'ArrowRight') motor.next();
      else if (e.code === 'ArrowLeft') motor.prev();
    };
    addEventListener('keydown', keydown);
    return () => { unsub(); motor.destroy(); cancelAnimationFrame(raf); clearInterval(progTimer); removeEventListener('resize', resize); removeEventListener('keydown', keydown); };
  }, []);

  useEffect(() => {
    if (!ready || !sentinelRef.current) return;
    const obs = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) motorRef.current.renderMore();
    }, { rootMargin: '400px' });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [ready, snap?.hasMore]);

  useEffect(() => registerAIView({
    id: 'reproductor',
    description: 'Reproductor musical: generador procedural + archivos locales, EQ, efectos, editor de patrones.',
    actions: {
      status: { description: 'Estado de reproducción actual.', readOnly: true, run: () => ({ playing: snap?.isPlaying, item: snap?.curItem?.title, tab: snap?.tab }) },
      play: { description: 'Reanuda o inicia la reproducción.', run: () => { motorRef.current.play(); return { ok: true }; } },
      pause: { description: 'Pausa la reproducción.', run: () => { motorRef.current.pause(); return { ok: true }; } },
      next: { description: 'Salta a la siguiente pista.', run: () => { motorRef.current.next(); return { ok: true }; } },
      prev: { description: 'Vuelve a la pista anterior.', run: () => { motorRef.current.prev(); return { ok: true }; } },
      generar: { description: 'Genera una canción procedural a partir de una semilla.', input: { semilla: { type: 'string', required: false } }, run: ({ semilla }) => { const i = motorRef.current.addSong(semilla || null); return { idx: i }; } },
    },
  }), [snap?.isPlaying, snap?.curItem?.title, snap?.tab]);

  if (!ready || !snap) {
    return html`<canvas ref=${canvasRef} class="rp-viz"></canvas><audio ref=${audioRef} class="hidden" preload="metadata"></audio><div class="rp-loading">Cargando reproductor…</div>`;
  }

  const motor = motorRef.current;
  const curFolderName = snap.curItem?.kind === 'file' ? (snap.curItem.folder || '').split('/').pop() : null;

  return html`
    <canvas ref=${canvasRef} class="rp-viz"></canvas>
    <audio ref=${audioRef} class="hidden" preload="metadata"></audio>
    <div class="rp-app">
      <div class="rp-library">
        <h2>Biblioteca</h2>
        <div class="rp-sub">Canciones procedurales por semilla + tus archivos locales, mismo EQ, efectos y visualizador.</div>
        <div class="rp-genrow">
          <${Input} value=${seed} onInput=${e => setSeed(e.target.value)} placeholder="Semilla (texto o número)" class="flex-1 min-w-0 rp-input-grow" />
          <${Button} onClick=${() => { motor.addSong(seed); setSeed(''); }}>Generar<//>
          <${Button} onClick=${() => motor.addSong(null)}>Sorpréndeme<//>
          <${Button} onClick=${async () => { const ok = await motor.pickFolder(); if (ok === null) folderInputRef.current?.click(); }}><${Icon} name="folder" size=${14} /> Mi música<//>
        </div>
        <div class="rp-searchrow">
          <${Input} value=${search} onInput=${e => { setSearch(e.target.value); motor.setSearch(e.target.value); }} placeholder="Buscar título / artista / carpeta…" class="flex-1 min-w-0 rp-input-grow" />
          <${Chip} active=${snap.tab === 'all'} onClick=${() => motor.setTab('all')}>Todo<//>
          <${Chip} active=${snap.tab === 'proc'} onClick=${() => motor.setTab('proc')}>Procedural<//>
          <${Chip} active=${snap.tab === 'file'} onClick=${() => motor.setTab('file')}>Mi música<//>
          <${Button} iconOnly onClick=${() => motor.setListView(!snap.listView)} title="Vista"><${Icon} name=${snap.listView ? 'menu' : 'grid'} size=${15} /><//>
          <span class="rp-count">${snap.viewTotal} elementos</span>
        </div>
        ${snap.scanning && html`<div class="rp-scan">Escaneando… ${snap.scanCount}</div>`}
        <div class=${`rp-grid ${snap.listView ? 'is-list' : ''}`}>
          ${snap.viewList.map((item, i) => html`
            <${AlbumCard}
              key=${item.kind === 'proc' ? `p${item.idx}` : `f${item.rel}`}
              item=${item} motor=${motor}
              activo=${i === snap.curViewIndex && snap.isPlaying}
              onOpen=${() => { motor.loadItem(i); motor.play(); }}
              onQueue=${() => {}}
              onFav=${() => motor.toggleFav(item)}
            />
          `)}
        </div>
        ${snap.hasMore && html`<div ref=${sentinelRef} class="rp-sentinel"></div>`}
      </div>
    </div>

    <div class="rp-controls">
      <div class="rp-cover"><img src=${snap.curItem ? motor.coverFor(snap.curItem) : ''} alt="" /></div>
      <div class="rp-nowinfo">
        <div class="rp-nowtitle">${snap.curItem?.title || '—'}</div>
        <div class="rp-nowseed mono">${snap.curItem ? (snap.curItem.kind === 'proc' ? ('procedural · ' + snap.curSong?.scaleName) : (curFolderName + ' · ' + snap.curItem.ext.toUpperCase())) : '—'}</div>
      </div>
      <div class="rp-transport">
        <${Button} iconOnly onClick=${() => motor.prev()} title="Anterior (←)"><${Icon} name="chevronLeft" size=${16} /><//>
        <${Button} iconOnly variant="primary" onClick=${() => motor.togglePlay()} title="Play/Pausa (Espacio)"><${Icon} name=${snap.isPlaying ? 'pause' : 'play'} size=${18} /><//>
        <${Button} iconOnly onClick=${() => motor.next()} title="Siguiente (→)"><${Icon} name="chevronRight" size=${16} /><//>
        <${Button} iconOnly onClick=${() => motor.stop()} title="Stop"><${Icon} name="stop" size=${14} /><//>
      </div>
      <div class="rp-progwrap">
        <span class="rp-time mono">${snap.curTimeStr}</span>
        <div class="rp-progbar" onClick=${e => { const r = e.currentTarget.getBoundingClientRect(); motor.seek((e.clientX - r.left) / r.width); }}><div class="rp-progfill" style=${`width:${snap.progressFrac * 100}%`}></div></div>
        <span class="rp-time mono">${snap.totalTimeStr}</span>
      </div>
      <div class="rp-volwrap">
        <${Button} iconOnly onClick=${() => motor.toggleMute()} title="Mute (M)"><${Icon} name=${snap.muted ? 'volumeOff' : 'volume'} size=${15} /><//>
        <input type="range" min="0" max="100" value=${Math.round(snap.volume * 100)} onInput=${e => motor.setVolume(+e.target.value / 100)} />
      </div>
      <div class="rp-smallbtns">
        <${Button} iconOnly active=${snap.shuffleOn} onClick=${() => motor.toggleShuffle()} title="Shuffle"><${Icon} name="refresh" size=${14} /><//>
        <${Button} iconOnly active=${REPEAT_ICON_ACTIVE[snap.repeatMode]} onClick=${() => motor.cycleRepeat()} title=${REPEAT_LABEL[snap.repeatMode]}><${Icon} name="repeat" size=${14} /><//>
        <${Button} iconOnly onClick=${() => setPanelOpen(panelOpen === 'editor' ? null : 'editor')} title="Editor de patrón"><${Icon} name="edit" size=${14} /><//>
        <${Button} iconOnly onClick=${() => setPanelOpen(panelOpen === 'settings' ? null : 'settings')} title="Ajustes"><${Icon} name="settings" size=${14} /><//>
      </div>
    </div>

    ${panelOpen === 'settings' && html`
      <div class="rp-panel">
        <div class="rp-panel-head"><h3>Ajustes del reproductor</h3><${Button} iconOnly onClick=${() => setPanelOpen(null)}><${Icon} name="close" size=${14} /><//></div>
        <div class="rp-section">
          <div class="rp-st">Tempo procedural (BPM)</div>
          <div class="rp-row"><input type="range" min="60" max="180" value=${snap.settings.bpm} onInput=${e => motor.setBpm(+e.target.value)} style="flex:1" /><span class="mono">${snap.settings.bpm}</span></div>
        </div>
        <div class="rp-section">
          <div class="rp-st">Visualizador</div>
          <div class="rp-eqrow">
            ${VIZ_MODES.map(m => html`<${Chip} key=${m} active=${VIZ_MODES[snap.vizMode] === m} onClick=${() => motor.setViz(VIZ_MODES.indexOf(m))}>${m}<//>`)}
          </div>
        </div>
        <div class="rp-section">
          <div class="rp-st">Ecualizador (5 bandas)</div>
          <div class="rp-eqrow">
            ${EQ_FREQS.map((f, i) => html`
              <div key=${i} class="rp-eqband">
                <input type="range" min="-12" max="12" step="1" value=${snap.settings.eq[i] || 0} class="rp-eq-slider" onInput=${e => motor.setEq(i, +e.target.value)} />
                <span class="rp-fl">${f >= 1000 ? (f / 1000) + 'k' : f}</span>
              </div>
            `)}
          </div>
          <div class="rp-presets">
            ${Object.keys(EQ_PRESETS).map(name => html`<${Chip} key=${name} onClick=${() => motor.setEqPreset(name)}>${name}<//>`)}
          </div>
        </div>
        <div class="rp-section">
          <div class="rp-st">Efectos</div>
          <div class="rp-row"><label>Reverb</label><${Button} size="sm" active=${snap.settings.fx.rev} onClick=${() => motor.setFx('rev')}>${snap.settings.fx.rev ? 'On' : 'Off'}<//></div>
          <div class="rp-row"><label>Delay</label><${Button} size="sm" active=${snap.settings.fx.del} onClick=${() => motor.setFx('del')}>${snap.settings.fx.del ? 'On' : 'Off'}<//></div>
          <div class="rp-row"><label>Distorsión</label><${Button} size="sm" active=${snap.settings.fx.dist} onClick=${() => motor.setFx('dist')}>${snap.settings.fx.dist ? 'On' : 'Off'}<//></div>
        </div>
        <div class="rp-section">
          <div class="rp-st">Datos</div>
          <div class="rp-row">
            <${Button} onClick=${() => motor.exportJSON()}><${Icon} name="download" size=${13} /> Exportar<//>
            <label class="relative">
              <${Button} onClick=${() => {}}><${Icon} name="upload" size=${13} /> Importar<//>
              <input type="file" accept="application/json" class="rp-file-overlay" onChange=${e => { const f = e.target.files?.[0]; if (f) motor.importJSON(f); }} />
            </label>
          </div>
          <div class="rp-row"><${Button} variant="danger" onClick=${() => { if (confirm('¿Borrar las canciones procedurales?')) motor.clearProcedural(); }}><${Icon} name="trash" size=${13} /> Borrar procedural<//></div>
        </div>
      </div>
    `}

    ${panelOpen === 'editor' && html`
      <div class="rp-editor">
        <div class="rp-editor-head">
          <b>Editor de patrón</b>
          <${Select} value=${snap.edInst} onChange=${e => motor.setEdInst(e.target.value)} size="sm">
            ${INST_NAMES.map(n => html`<option key=${n} value=${n}>${n}</option>`)}
          <//>
          <${Button} variant="primary" onClick=${() => snap.edPlaying ? motor.edStop() : motor.edPlay()}>${snap.edPlaying ? 'Stop' : '▶ Loop'}<//>
          <${Button} onClick=${() => motor.clearPattern()}>Limpiar<//>
          <${Button} onClick=${() => motor.randomPattern()}>Aleatorio<//>
          <div class="rp-sp"></div>
          <${Button} onClick=${() => motor.saveComposition()}>Guardar<//>
          <${Button} onClick=${() => setPanelOpen(null)}>Cerrar<//>
        </div>
        <div class="rp-rollwrap">
          <div class="rp-roll" style=${`grid-template-columns:repeat(${ROLL_COLS},minmax(22px,1fr))`}>
            ${Array.from({ length: ROLL_ROWS }).flatMap((_, r) => {
              const note = 71 - r;
              return Array.from({ length: ROLL_COLS }).map((_, c) => {
                const on = motor.snapshot().editorPattern[snap.edInst].has(c + ',' + note);
                return html`<div key=${r + '-' + c} class=${`rp-cell ${on ? 'on' : ''} ${c % 4 === 0 ? 'bc' : ''}`} onClick=${() => motor.toggleCell(c, note)}></div>`;
              });
            })}
          </div>
        </div>
      </div>
    `}

    <input ref=${folderInputRef} type="file" webkitdirectory multiple class="hidden" onChange=${e => motor.scanInputFiles(e.target.files)} />
  `;
}
