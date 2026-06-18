let _conceptos = null;

async function cargarConceptos() {
  if (_conceptos) return _conceptos;
  try {
    const res = await fetch(new URL('../templates/conceptos-creatividad.tmpl.json', import.meta.url));
    _conceptos = res.ok ? await res.json() : {};
  } catch {
    _conceptos = {};
  }
  return _conceptos;
}

function rand(arr) {
  if (!arr || !arr.length) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function generarIdea(tematica = 'general') {
  const c = await cargarConceptos();
  const base = c[tematica] || c['general'] || {};
  return {
    tematica,
    personaje: rand(base.personajes),
    escenario: rand(base.escenarios),
    conflicto: rand(base.conflictos),
    giro: rand(base.giros),
    tema: rand(base.temas),
  };
}

export function ideaAPrompt(idea) {
  return `Personaje: ${idea.personaje}\nEscenario: ${idea.escenario}\nConflicto: ${idea.conflicto}\nGiro narrativo: ${idea.giro}\nTema central: ${idea.tema}`;
}

export async function getTematicas() {
  const c = await cargarConceptos();
  return Object.keys(c);
}
