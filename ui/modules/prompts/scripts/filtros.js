export function filtrar(lista, { busqueda = '', categoria = '', soloFavoritos = false } = {}) {
  let out = lista;
  if (soloFavoritos) out = out.filter(p => p.favorito);
  if (categoria) out = out.filter(p => p.categoria === categoria);
  if (busqueda.trim()) {
    const q = busqueda.toLowerCase();
    out = out.filter(p =>
      (p.nombre || '').toLowerCase().includes(q) ||
      (p.contenido || '').toLowerCase().includes(q) ||
      (p.tags || '').toLowerCase().includes(q)
    );
  }
  return out;
}

export function categorias(lista) {
  return [...new Set(lista.map(p => p.categoria).filter(Boolean))].sort();
}
