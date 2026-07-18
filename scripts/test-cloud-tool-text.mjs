#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cloudPath = path.resolve(here, '../ui/modules/lyra/scripts/chat/cloud.js');
const source = fs.readFileSync(cloudPath, 'utf8');

const match = source.match(/function separarToolDraft\(texto = ''\) \{[\s\S]*?\n\}/);
assert.ok(match, 'No se encontró separarToolDraft() en cloud.js');

// Evaluar la implementación real con un detector mínimo. El detector visual
// sólo decide si hay draft; esta prueba verifica la separación del texto y el
// cableado de _toolText, que fue lo que causó la regresión en Lyra.
const detectarToolDraft = texto => /(?:```(?:json|pitool)?\s*)?\{?\s*"tool"\s*:/i.test(String(texto || ''))
  ? { tool: 'bash', status: 'ready' }
  : null;
const separarToolDraft = new Function('detectarToolDraft', `${match[0]}; return separarToolDraft;`)(detectarToolDraft);

const fenced = 'Voy a revisar el estado antes de tocar nada.\n\n```json\n{"tool":"bash","args":{"cmd":"echo ok"}}\n```';
const fencedResult = separarToolDraft(fenced);
assert.equal(fencedResult.texto, 'Voy a revisar el estado antes de tocar nada.');
assert.equal(fencedResult.draft?.tool, 'bash');

const plainFence = 'Primero leo el archivo.\n\n```\n{"tool":"read","args":{"path":"/tmp/a"}}\n```';
assert.equal(separarToolDraft(plainFence).texto, 'Primero leo el archivo.');

const toolOnly = '```json\n{"tool":"bash","args":{"cmd":"echo ok"}}\n```';
assert.equal(separarToolDraft(toolOnly).texto, '');

const normal = separarToolDraft('Respuesta normal sin herramienta.');
assert.equal(normal.draft, null);
assert.equal(normal.texto, '');

assert.match(source, /_toolText:\s*texto\s*\|\|\s*undefined/, 'Falta preservar texto durante streaming');
assert.match(source, /_toolText:\s*toolDraftFinal\.texto\s*\|\|\s*undefined/, 'Falta preservar texto en la respuesta final');

console.log('cloud tool text regression: 6/6 PASS');
