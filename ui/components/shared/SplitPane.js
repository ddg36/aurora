const html = (...args) => globalThis.html(...args);

// Layout compartido para vistas con sidebar + contenido principal (Web
// Navigator, Editor, Wiki, etc). En desktop (Twind md: 768px+) van lado a
// lado; en mobile se apilan (sidebar arriba, limitado en alto, contenido
// abajo, ocupando el ancho completo). Antes cada módulo hardcodeaba su
// propio "flex h-full" + "w-56/w-64 shrink-0" sin ninguna variante
// responsive — Twind sí las soporta (boot.js las tiene en la whitelist de
// clases, sm:/md:/lg:), nadie las usaba. En un celular el sidebar fijo se
// comía casi toda la pantalla angosta y el contenido principal quedaba con
// ~100px de ancho real (texto de una letra por línea, bug real reportado
// en vivo). Ajustar el breakpoint/comportamiento ACÁ una vez alcanza para
// todas las vistas que usen este componente, en vez de repetir el parche
// módulo por módulo.
export function SplitPane({
  sidebar,
  sidebarWidth = 'md:w-56',
  sidebarMaxH = 'max-h-40',
  sidebarClassName = '',
  mainClassName = '',
  className = '',
  children,
}) {
  return html`
    <div class="flex flex-col md:flex-row h-full min-h-0 ${className}">
      <aside class="w-full ${sidebarWidth} ${sidebarMaxH} md:max-h-none shrink-0 overflow-y-auto
        border-b md:border-b-0 md:border-r border-white/5 ${sidebarClassName}">
        ${sidebar}
      </aside>
      <div class="flex-1 flex flex-col min-w-0 min-h-0 ${mainClassName}">
        ${children}
      </div>
    </div>
  `;
}
