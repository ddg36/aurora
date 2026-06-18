import { getJSON } from '../shared/api.js';
import { setTheme } from '../../store.js';

const FRANJAS = [
  { desde: 6,  hasta: 9,  tema: 'amber' },
  { desde: 9,  hasta: 12, tema: 'cyan' },
  { desde: 12, hasta: 17, tema: 'ocean' },
  { desde: 17, hasta: 20, tema: 'lava' },
  { desde: 20, hasta: 23, tema: 'violet' },
  { desde: 23, hasta: 24, tema: 'shadow' },
  { desde: 0,  hasta: 6,  tema: 'deep' },
];

export function temaPorHora(hora = new Date().getHours()) {
  const f = FRANJAS.find(x => hora >= x.desde && hora < x.hasta);
  return f ? f.tema : 'violet';
}

let intervalo = null;

export async function iniciarTemaAuto() {
  let activo = false;
  try {
    const r = await getJSON('/db/ajustes/tema_auto');
    activo = r?.valor === '1';
  } catch {}
  if (!activo) return;

  const aplicar = () => setTheme(temaPorHora());
  aplicar();
  if (intervalo) clearInterval(intervalo);
  intervalo = setInterval(aplicar, 10 * 60 * 1000);
}

export function detenerTemaAuto() {
  if (intervalo) { clearInterval(intervalo); intervalo = null; }
}
