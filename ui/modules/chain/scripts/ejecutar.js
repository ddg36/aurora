import { sendToLyra } from '../../../components/shared/lyra-ws.js';

export async function ejecutarCadena({ pasos, entrada, model, onPasoInicio, onToken, onPasoFin }) {
  let actual = entrada;
  const resultados = [];
  for (let i = 0; i < pasos.length; i++) {
    const paso = pasos[i];
    onPasoInicio?.(i);
    let salida = '';
    await sendToLyra({
      message: actual,
      model,
      system: paso.instruccion,
      onToken: (t) => {
        salida += t;
        onToken?.(i, salida);
      },
    });
    resultados.push({ paso: paso.nombre, salida });
    onPasoFin?.(i, salida);
    actual = salida;
  }
  return resultados;
}

export const PLANTILLAS = [
  {
    nombre: 'Investigar → Resumir → Traducir',
    pasos: [
      { nombre: 'Analizar', instruccion: 'Analizá el texto del usuario en profundidad: puntos clave, contexto, implicancias. En español.' },
      { nombre: 'Resumir', instruccion: 'Resumí el análisis recibido en máximo 5 bullets. En español.' },
      { nombre: 'Traducir', instruccion: 'Traducí el texto recibido al inglés. Devolvé SOLO la traducción.' },
    ],
  },
  {
    nombre: 'Borrador → Crítica → Versión final',
    pasos: [
      { nombre: 'Borrador', instruccion: 'Escribí un borrador sobre el tema que da el usuario. En español.' },
      { nombre: 'Crítica', instruccion: 'Criticá el texto recibido: debilidades, faltantes, mejoras concretas. Al final incluí el texto original completo.' },
      { nombre: 'Final', instruccion: 'Reescribí el texto aplicando las críticas recibidas. Devolvé SOLO la versión final en español.' },
    ],
  },
  {
    nombre: 'Código → Explicar → Tests',
    pasos: [
      { nombre: 'Revisar', instruccion: 'Revisá el código del usuario: bugs, edge cases, mejoras. Al final incluí el código original.' },
      { nombre: 'Explicar', instruccion: 'Explicá en español qué hace el código y resumí los problemas detectados.' },
      { nombre: 'Tests', instruccion: 'Escribí tests unitarios para el código mencionado, cubriendo los edge cases detectados.' },
    ],
  },
];
