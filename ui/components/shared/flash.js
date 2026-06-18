const timers = new WeakMap();

export function mostrarTemporal(setter, value, {
  delay = 1500,
  clearValue = '',
} = {}) {
  if (typeof setter !== 'function') return;

  const prev = timers.get(setter);
  if (prev) clearTimeout(prev);

  setter(value);

  const timer = setTimeout(() => {
    timers.delete(setter);
    setter(clearValue);
  }, delay);

  timers.set(setter, timer);
}

export function cancelarTemporal(setter) {
  const timer = timers.get(setter);
  if (!timer) return;

  clearTimeout(timer);
  timers.delete(setter);
}
