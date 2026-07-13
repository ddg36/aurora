// Los proveedores Cloud pueden pausar el render/stream al detectar que su
// documento está oculto, aunque Aurora mantenga viva la pestaña con WebAudio.
// Este shim corre en MAIN (antes que la app del proveedor) y sólo dentro de un
// iframe cuyo padre es una página de extensión. Las pestañas normales de los
// proveedores conservan la Visibility API real.
(() => {
  if (window.top === window) return;
  const padre = location.ancestorOrigins?.[0] || '';
  if (!padre.startsWith('chrome-extension://')) return;

  try {
    Object.defineProperty(Document.prototype, 'visibilityState', {
      configurable: true, enumerable: true, get: () => 'visible',
    });
    Object.defineProperty(Document.prototype, 'hidden', {
      configurable: true, enumerable: true, get: () => false,
    });
    document.documentElement.dataset.auroraVisibilityShim = 'active';
    globalThis.__AURORA_VISIBILITY_SHIM__ = true;
  } catch (error) {
    globalThis.__AURORA_VISIBILITY_SHIM__ = `error:${error?.message || error}`;
  }
})();
