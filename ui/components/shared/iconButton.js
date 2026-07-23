const { useEffect, useRef, useState } = globalThis.preactHooks;
const html = (...args) => globalThis.html(...args);

// Las dos propiedades que se rompieron SOLAS varias veces hoy en distintos
// componentes (texto apilándose letra por letra en espacio angosto, o el
// elemento angostándose por debajo de su contenido) — una sola constante,
// cualquier botón/chip nuevo la incluye y ya no puede volver a pasar.
export const BTN_SAFE = 'whitespace-nowrap flex-shrink-0';

// Alto único de TODO botón/chip en la app, tenga texto o sólo ícono — la
// base es el ícono-solo (Button.iconOnly), Chip usa la misma variable para
// no quedar más bajo/alto que él.
export const BTN_HEIGHT = 'au-control-height';

// Tratamiento visual único para botones de ícono (riel de NavBar, Footer,
// y cualquier otra barra de acciones) — bordes redondeados, resaltado sutil
// en hover/activo. El tamaño lo define cada caller vía `extra` (el riel
// quiere w-full para llenar su ancho fijo, Footer quiere un cuadrado fijo
// tipo w-9 h-9) — así ninguno pisa el sizing del otro.
export function iconButtonClass(active, extra = '') {
  return [
    'flex items-center justify-center transition-colors cursor-pointer overflow-hidden',
    BTN_SAFE,
    active ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/5',
    extra,
  ].filter(Boolean).join(' ');
}

// Tamaño fijo único — TODO botón de ícono-solo en la app (NavBar, Footer,
// Canvas, composer, lo que sea) mide esto. Una sola variable, ningún
// caller hardcodea su propio número.
export const ICON_BTN_SIZE = `au-icon-button-size ${BTN_HEIGHT}`;
// Combinación más pedida: cuadrado (Footer y demás filas horizontales).
export const ICON_BTN_SQUARE = `${ICON_BTN_SIZE} rounded-md`;

// Fila de toolbar/header con dos grupos (izquierda/derecha) que se
// acomoda sola: si no entra en una línea, el grupo que sobra baja entero
// a la siguiente en vez de cortarse en el borde (Canvas, header de Lyra,
// cualquier barra con "tabs a la izquierda, acciones a la derecha").
export const TOOLBAR_ROW = 'flex items-center justify-between flex-wrap gap-2';
// Mismo criterio para el grupo DE ADENTRO (izq o der) cuando tiene varios
// ítems: que también pueda acomodarse si hace falta, sin cortarse.
export const TOOLBAR_GROUP = 'flex items-center flex-wrap gap-1';

// Barras horizontales (Footer) sólo scrollean con touch/trackpad-horizontal
// por default — la rueda vertical del mouse no mueve scrollLeft a menos que
// se traduzca a mano (el riel vertical de NavBar no necesita esto: su eje
// de overflow ya es el mismo que la rueda vertical nativa).
export function useWheelHorizontalScroll(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ref]);
}

// Cualquier menú/dropdown que se abre sobre contenido (slash commands,
// selector de tipo de bloque, menú de opciones "+", etc.) DEBE flotar por
// encima con position:fixed vía portal a document.body — nunca
// position:absolute dentro del flujo normal. Un absolute anidado en un
// contenedor flex/scroll termina empujando layout o cortado por overflow
// (bug real: encontrado repetido en Lyra `.slash-menu` y Scratchpad
// `.sp-slash-menu`, cada uno con su propio position:absolute a mano,
// mientras que el selector de tipo de bloque de Scratchpad SÍ ya usaba portal
// y no tenía el problema). Un solo hook centraliza esto: aparece una vez y
// cualquier menú nuevo lo hereda gratis, sin volver a escribir
// preact.render/removeChild a mano.
//
// anchor: 'below' (default — el menú cuelga bajo el ancla, alineado a su
//         borde izquierdo) | 'above' (el menú sube desde el ancla — para
//         composers pegados al pie de pantalla) | 'fill' (el menú cubre
//         desde arriba de la pantalla hasta abajo, alineado al borde
//         izquierdo del ancla — para sidebars colapsados que expanden:
//         'below' dejaba expuesto todo lo que hay arriba del ancla, ej. el
//         título de la nota activa en md-reader, dando la sensación de dos
//         paneles distintos superpuestos en vez de un sidebar completo) |
//         'center' (el menú ocupa el espacio disponible del propio
//         contenedor donde vive el ancla, centrado — para paneles de
//         contenido largo tipo "Resumen" que no tiene sentido atar a la
//         posición exacta del botón que los abre: 'below' los dejaba
//         angostos porque el botón puede estar lejos del borde libre).
// matchWidth: true → el menú ocupa el mismo ancho que el ancla (slash
//         menus que cubren todo el composer) en vez de su ancho natural
//         (dropdowns de un botón puntual, tipo "Text ▾").
// openControlled: si el caller YA tiene su propio estado de abierto/cerrado
//         (ej. slashSel >= 0 manejado por teclado) se lo pasa acá en vez de
//         dejar que el hook gestione uno propio — evita un segundo estado
//         redundante y duplicado. Si se omite, el hook maneja open/toggle/close.
export function useFloatingMenu({ anchor = 'below', matchWidth = false, openControlled } = {}) {
  const [openState, setOpenState] = useState(false);
  const controlled = openControlled !== undefined;
  const open = controlled ? openControlled : openState;
  const anchorRef = useRef(null);
  const portalRef = useRef(null);
  const [, forceRender] = useState(0);

  const toggle = () => setOpenState(o => !o);
  const close = () => setOpenState(false);

  useEffect(() => {
    if (!open || controlled) return;
    const onDown = (e) => {
      if (portalRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, controlled]);

  // El nodo portal se crea/destruye acá (no en un componente separado) —
  // una función-componente recreada en cada render del caller (como sería
  // FloatingMenu si viviera como closure interno) hace que Preact la trate
  // como un componente nuevo cada vez y remonte el portal en cada render,
  // en vez de una sola vez al abrir.
  useEffect(() => {
    if (!open) return;
    const el = document.createElement('div');
    document.body.appendChild(el);
    portalRef.current = el;
    forceRender(n => n + 1); // primer render del portal, ya con el nodo listo
    return () => {
      preact.render(null, el);
      try { document.body.removeChild(el); } catch (_) {}
      portalRef.current = null;
    };
  }, [open]);

  function FloatingMenu({ children, class: cls }) {
    if (!open || !portalRef.current || !anchorRef.current) return null;
    const rect = anchorRef.current.getBoundingClientRect();
    const width = matchWidth ? `width:${rect.width}px;` : '';
    // En viewports angostos (ej. sidepanel de la extensión), un ancla cerca
    // del borde derecho + panel con ancho propio (no matchWidth) se salía
    // de pantalla por la derecha si siempre se ancla por `left`. Si el
    // ancla está en la mitad derecha, anclar por `right` en su lugar —
    // el panel crece hacia la izquierda y siempre queda dentro del viewport.
    const anchorRight = rect.left > window.innerWidth / 2;
    // El CSS del caller pone su propio `width` (ej. min(420px, 100vw-24px))
    // pero ese 100vw no sabe cuánto quedó disponible DESPUÉS de restar el
    // offset left/right recién elegido — en viewports angostos con el ancla
    // pegada a un borde, "100vw" seguía siendo mayor que el hueco real y el
    // panel se salía igual por el lado contrario. Acá sí se conocen ambos
    // números juntos: forzar un max-width que nunca deje que la que el CSS
    // pida se pase del espacio real que queda desde el ancla hasta el borde.
    const maxW = anchorRight ? rect.right - 8 : window.innerWidth - rect.left - 8;
    const horiz = matchWidth
      ? `left:${rect.left}px;`
      : (anchorRight
          ? `right:${window.innerWidth - rect.right}px;max-width:${maxW}px;`
          : `left:${rect.left}px;max-width:${maxW}px;`);
    let style;
    if (anchor === 'above') {
      style = `position:fixed;bottom:${window.innerHeight - rect.top + 4}px;${horiz}${width}z-index:9999;`;
    } else if (anchor === 'fill') {
      // El ancla real es el rail colapsado completo (pegado al borde),
      // no el botón adentro (que trae su propio padding) — usar el borde
      // izquierdo del rail evita un hueco visible entre el borde de la
      // pantalla y el panel, que lo hacía ver como modal flotando en vez
      // de un panel pegado al lado.
      const railRect = anchorRef.current.closest('aside')?.getBoundingClientRect() || rect;
      style = `position:fixed;top:0;bottom:0;left:${railRect.left}px;${width}z-index:9999;`;
    } else if (anchor === 'center') {
      // Ocupa el espacio disponible del contenedor de contenido más cercano
      // (ej. .mdr-main), no el ancho natural del panel — el botón que lo
      // abre puede estar lejos del borde libre, y anclarse a él dejaba el
      // panel angosto con espacio de sobra sin usar al lado.
      const bounds = anchorRef.current.closest('[data-float-bounds]')?.getBoundingClientRect()
        || { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };
      const margin = 16;
      style = `position:fixed;left:${bounds.left + margin}px;right:${window.innerWidth - bounds.right + margin}px;top:${bounds.top + margin}px;bottom:${window.innerHeight - bounds.bottom + margin}px;z-index:9999;`;
    } else {
      style = `position:fixed;top:${rect.bottom + 4}px;${horiz}${width}z-index:9999;`;
    }
    preact.render(html`<div class=${cls || ''} style=${style}>${children}</div>`, portalRef.current);
    return null;
  }

  return { open, anchorRef, toggle, close, FloatingMenu };
}

// Cualquier fila de botones (TOOLBAR_GROUP, chips de acción, lo que sea)
// que tenga que cerrar filas — en vez de aceptar el wrap a 2 líneas ni bien
// no entran con su padding/gap cómodos, esto los comprime primero: mide el
// ancho real disponible contra lo que los botones necesitan con su
// espaciado normal, y si no entra, va reduciendo gap y padding horizontal
// (progresivo, no un salto brusco) hasta el mínimo legible — recién si ni
// así entran, deja que el CSS (flex-wrap) baje el sobrante a otra fila.
// Un solo hook para toda la app: cualquier toolbar nuevo lo importa y ya
// se comprime solo, sin repetir esta medición a mano en cada lugar.
//
// Uso: const fit = useAutoFitRow(); <div ref=${fit.rowRef} class=${TOOLBAR_GROUP} style=${fit.style}>
// ponytail: custom properties (--fit-gap) en objeto style no llegan al DOM
// con la versión de Preact vendorizada acá (confirmado con test aislado:
// preact.render con --x en un objeto style SUELTO sí funciona, pero el
// mismo objeto devuelto por un hook y reenviado a través de un componente
// hijo pierde las keys con guión — sólo "gap" sobrevivía). En vez de pelear
// contra eso, el hook devuelve `scale` (número) y cada caller calcula sus
// propios px directo — sin CSS custom properties de por medio.
export function useAutoFitRow() {
  const rowRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const measure = () => {
      // Medir mutando los nodos REALES que Preact controla (poner nowrap,
      // leer, revertir) corrompe el registro interno de Preact para esos
      // nodos: el siguiente setScale() sí actualiza el estado, pero Preact
      // no vuelve a tocar ese style porque su copia interna del vdom quedó
      // desincronizada con lo que el DOM real tiene puesto (mutación
      // externa que React/Preact no vio). En vez de tocar los nodos reales,
      // se clona la fila entera off-screen, se mide el clon (que nadie
      // más controla) y se descarta — el DOM real que ve el usuario nunca
      // se toca a mano.
      const n = row.children.length;
      if (n === 0) { setScale(1); return; }

      const measureAt = (padX, gap) => {
        const clone = row.cloneNode(true);
        clone.style.position = 'absolute';
        clone.style.visibility = 'hidden';
        clone.style.width = 'auto';
        clone.style.flexWrap = 'nowrap';
        clone.style.gap = `${gap}px`;
        Array.from(clone.children).forEach(child => {
          child.style.paddingLeft = `${padX}px`;
          child.style.paddingRight = `${padX}px`;
        });
        row.parentElement.appendChild(clone);
        const w = clone.scrollWidth;
        clone.remove();
        return w;
      };

      // Margen de seguridad: el clon (fuera de flujo, sin scrollbar-gutter
      // ni redondeos sub-pixel del layout real) mide un poco distinto al
      // ancho real que terminan ocupando los Chips ya con el nuevo padding
      // puesto — apuntar al 100% justo del espacio disponible dejaba casos
      // al límite (predictedW==have) que en el render real SÍ desbordaban
      // por ese margen de error. Apuntar a un 95% deja aire de sobra.
      const have = row.clientWidth * 0.95;
      const needFull = measureAt(10, 4); // espaciado cómodo (scale=1)
      if (needFull <= have || needFull === 0) { setScale(1); return; }

      // needFull no es lineal con el padding (el texto de cada botón es
      // ancho fijo, sólo padding+gap se comprimen) — en vez de asumir
      // scale=have/needFull (subestima cuánto hay que apretar), se mide
      // también en el piso y se interpola sobre la porción real que sí es
      // comprimible. Piso bajo (0.15 → ~1.5px de aire) a propósito: mejor
      // casi sin aire pero en una sola fila, que "prolijo" partido en 2.
      const FLOOR = 0.15;
      const needMin = measureAt(10 * FLOOR, 4 * FLOOR);
      if (needFull === needMin) { setScale(FLOOR); return; }
      const t = (needFull - have) / (needFull - needMin); // 0=cabe cómodo, 1=necesita el piso
      setScale(Math.max(FLOOR, 1 - Math.min(1, t) * (1 - FLOOR)));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, []);

  return { rowRef, scale, gapPx: 4 * scale, padXPx: 10 * scale };
}

// Envoltorio de useAutoFitRow para el caso común: una fila de <Chip> que
// tiene que intentar entrar siempre en una sola línea, achicando su propio
// espaciado antes de wrapear. Sin esto, cada toolbar repetía
// `padX=${fit.padXPx}` a mano en cada Chip — un solo lugar, cualquier
// toolbar nuevo lo hereda con sólo envolver sus <Chip> acá adentro.
export function AutoFitChips({ class: cls, children }) {
  const fit = useAutoFitRow();
  const kids = preact.toChildArray(children).map(child =>
    child && child.props ? preact.cloneElement(child, { padX: fit.padXPx }) : child
  );
  return html`<div ref=${fit.rowRef} class=${['flex flex-wrap', cls].filter(Boolean).join(' ')} style=${`gap:${fit.gapPx}px;`}>${kids}</div>`;
}
