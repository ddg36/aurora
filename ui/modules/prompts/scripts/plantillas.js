import { prompts, cargarPrompts } from './guardar.js';
import { postJSON } from '../../../components/shared/api.js';

const TEMPLATE_FILES = [
  'prompts-sistema.tmpl.json',
  'prompts-imagen.tmpl.json',
  'prompts-wan.tmpl.json',
];

export async function importarPlantillas() {
  const existentes = new Set(prompts.value.map(p => (p.nombre || '').toLowerCase()));
  let importados = 0;
  let omitidos = 0;

  for (const file of TEMPLATE_FILES) {
    let items;
    try {
      const res = await fetch(new URL(`../templates/${file}`, import.meta.url));
      if (!res.ok) continue;
      items = await res.json();
    } catch {
      continue;
    }
    if (!Array.isArray(items)) continue;

    for (const it of items) {
      const nombre = (it.name || '').trim();
      const contenido = (it.content || '').trim();
      if (!nombre || !contenido) continue;
      if (existentes.has(nombre.toLowerCase())) { omitidos++; continue; }

      const tags = [...(Array.isArray(it.tags) ? it.tags : []), it.targetAI].filter(Boolean);
      await postJSON('/db/prompts', {
        nombre,
        contenido,
        categoria: it.category || null,
        tags: tags.length ? tags.join(',') : null,
      });
      existentes.add(nombre.toLowerCase());
      importados++;
    }
  }

  await cargarPrompts();
  return { importados, omitidos };
}
