# claude-labs

Laboratorio de experimentos. Ideas que todavía no son una misión ni un
checkpoint — se prueban acá antes de tocar código real de Aurora.

## Regla central

Nada de lo que vive en esta carpeta es producción. Puede estar roto, a medio
terminar, reescrito sin aviso o borrado directamente. No lo importa ningún
módulo de `extensions/`, `src/` ni `ui/`, y ningún experimento de acá debe
importar código de producción tampoco — solo al revés, si algo funciona,
se migra.

## Flujo

1. **Prototipo** — carpeta propia por idea, ej. `scripts/claude-labs/<idea>/`.
   Código descartable, sin necesidad de tests formales todavía, solo probar
   si la idea es viable.
2. **Validación** — se prueba a mano (CDP, `sol-debug.py`, lo que haga falta)
   hasta tener evidencia de que funciona o de que no vale la pena.
3. **Decisión** — Diego decide si se integra. Si sí, se implementa de nuevo
   como corresponde en el árbol real (branch propia, checklist, revisión),
   no se copia el prototipo tal cual. Si no, el experimento queda acá como
   registro de qué se probó y por qué no siguió.

## Experimentos

| Carpeta | Idea | Estado |
|---|---|---|
| _(ninguno todavía)_ | | |

Cada experimento nuevo agrega su fila acá con una línea de estado
(`EN_DISEÑO`, `PROTOTIPO`, `VALIDADO`, `DESCARTADO`, `INTEGRADO`).
