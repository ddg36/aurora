import { getJSON, putJSON } from '../../../components/shared/api.js';
import { setTheme, setThemeMode, setBackground, setHud, theme, themeMode, background, hud } from '../../../store.js';

export async function cargarTema() {
  try {
    const [t, m, b, h] = await Promise.all([
      getJSON('/db/ajustes/theme'),
      getJSON('/db/ajustes/themeMode'),
      getJSON('/db/ajustes/background'),
      getJSON('/db/ajustes/hud'),
    ]);
    if (t.valor) setTheme(t.valor);
    if (m.valor) setThemeMode(m.valor);
    if (h.valor === 'luna') {
      // Migración v4: Luna ahora es fondo, no una capa HUD.
      setBackground('luna-remake');
      setHud('none');
      Promise.all([
        putJSON('/db/ajustes/background', { valor: 'luna-remake' }),
        putJSON('/db/ajustes/hud', { valor: 'none' }),
      ]).catch(() => {});
    } else {
      if (b.valor) setBackground(b.valor);
      if (h.valor) setHud(h.valor);
    }
  } catch {}
}

export async function guardarTema(id) {
  setTheme(id);
  await putJSON('/db/ajustes/theme', { valor: id });
}

export async function guardarThemeMode(mode) {
  setThemeMode(mode);
  await putJSON('/db/ajustes/themeMode', { valor: mode });
}

export async function guardarBackground(id) {
  setBackground(id);
  await putJSON('/db/ajustes/background', { valor: id });
}

export async function guardarHud(id) {
  setHud(id);
  await putJSON('/db/ajustes/hud', { valor: id });
}

export { theme, themeMode, background, hud };
