const { useState, useEffect, useRef } = globalThis.preactHooks;
import { getJSON, putJSON } from './api.js';
import { onEvento } from './eventos-ws.js';

// useState que sobrevive a recargar/reabrir la vista — guardado en
// /db/ajustes/<clave> (mismo endpoint que theme/background/ui_last_tab),
// no localStorage: el server ya tiene una DB para esto y es lo que el
// resto de la app usa para preferencias de UI.
//
// Además se suscribe al bus /eventos: si otra tab escribe la misma clave,
// esta se actualiza en vivo. Anti-eco: `raw` guarda el último valor
// serializado conocido (carga inicial, escritura propia o evento); un
// evento cuyo valor coincide con `raw` es eco de esta misma tab y se ignora.
export function usePersistedState(clave, initial) {
  const [value, setValue] = useState(initial);
  const raw = useRef(undefined);

  useEffect(() => {
    let cancelado = false;

    const aplicar = (valor) => {
      raw.current = valor;
      if (valor === null) { setValue(initial); return; }
      try { setValue(JSON.parse(valor)); } catch { setValue(valor); }
    };

    getJSON(`/db/ajustes/${clave}`).then(r => {
      if (cancelado || r?.valor === undefined || r?.valor === null) return;
      aplicar(r.valor);
    }).catch(() => {});

    const off = onEvento('ajuste', (datos) => {
      if (cancelado || datos.clave !== clave || datos.valor === raw.current) return;
      aplicar(datos.valor);
    });

    return () => { cancelado = true; off(); };
  }, [clave]);

  function setPersisted(next) {
    setValue(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      raw.current = JSON.stringify(resolved);
      putJSON(`/db/ajustes/${clave}`, { valor: raw.current }).catch(() => {});
      return resolved;
    });
  }

  return [value, setPersisted];
}
