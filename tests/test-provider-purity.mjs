import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const manifest = JSON.parse(read('extensions/aihub/manifest.json'));
const rules = JSON.parse(read('extensions/aihub/rules.json'));

const forbiddenBootScripts = [
  'content-scripts/aurora-visibility-shim.js',
  'content-scripts/ai-bridge.js',
  'content-scripts/gem-observer.js',
  'content-scripts/session-sniffer.js',
];

const activeScripts = new Set(
  manifest.content_scripts.flatMap(entry => entry.js || []),
);

for (const script of forbiddenBootScripts) {
  assert.equal(activeScripts.has(script), false, `${script} no puede arrancar dentro del proveedor`);
}

const providerScripts = manifest.content_scripts
  .filter(entry => (entry.matches || []).some(match => /chatgpt|openai|gemini|claude|grok|perplexity|copilot|kimi|poe|qwen|you\.com/.test(match)))
  .flatMap(entry => entry.js || []);

const forbiddenSourcePatterns = [
  [/Object\.defineProperty\(Document\.prototype/, 'sobrescritura de Document.prototype'],
  [/\/nexus\/shell\/run/, 'ejecutor de tools paralelo a JSON Family'],
  [/history\.pushState\s*=/, 'parche de history.pushState'],
  [/history\.replaceState\s*=/, 'parche de history.replaceState'],
  [/createElement\(['"]style['"]\)/, 'CSS inyectado en el proveedor'],
];

for (const script of new Set(providerScripts)) {
  const source = read(`extensions/aihub/${script}`);
  for (const [pattern, description] of forbiddenSourcePatterns) {
    assert.doesNotMatch(source, pattern, `${script}: ${description}`);
  }
}

const hud = manifest.content_scripts.find(entry => entry.js?.includes('content-scripts/bold-hud.js'));
assert(hud, 'bold-hud debe seguir declarado para páginas normales');
for (const domain of ['chatgpt.com', 'gemini.google.com', 'grok.com', 'claude.ai']) {
  assert(
    hud.exclude_matches?.some(match => match.includes(domain)),
    `bold-hud debe excluir ${domain}`,
  );
}

const frameRule = rules.find(rule => rule.id === 1);
assert(frameRule?.condition?.requestDomains?.length, 'X-Frame-Options sólo puede retirarse en proveedores explícitos');
assert.notDeepEqual(frameRule.condition.urlFilter, '*', 'prohibido modificar todos los subframes de Internet');

const cspRule = rules.find(rule => rule.id === 2);
for (const authDomain of ['auth.openai.com', 'accounts.google.com', 'appleid.apple.com']) {
  assert.equal(cspRule.condition.requestDomains.includes(authDomain), false, `no retirar CSP de ${authDomain}`);
}

const relayCore = read('extensions/aihub/content-scripts/relay/relay-core.js');
assert.doesNotMatch(relayCore, /cerrar panel|close panel/i, 'Relay Core no puede cerrar UI ajena al composer');
assert.doesNotMatch(relayCore, /location\.reload\(/, 'STOP no puede recargar el proveedor');

console.log('OK — Provider purity: el iframe sólo recibe relay semántico, sin UI/prototipos/tools legacy');
