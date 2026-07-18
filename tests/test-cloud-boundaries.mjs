import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const walk = directory => fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
  const relative = path.join(directory, entry.name);
  if (entry.isDirectory()) return entry.name === '__pycache__' ? [] : walk(relative);
  return /\.(?:js|py)$/.test(entry.name) && !entry.name.includes('.backup.') ? [relative] : [];
});

const activeSources = [...walk('ui'), ...walk('src'), ...walk('extensions/aihub')];
for (const file of activeSources) {
  const source = read(file);
  assert.equal(source.includes('/pi/cloud-tool'), false, `${file} reintrodujo el dispatcher Cloud legacy`);
  assert.equal(source.includes('/tools/providers/pi/run'), false, `${file} reintrodujo ejecución Pi fuera de JSON Family`);
}

assert.equal(fs.existsSync(path.join(root, 'src/pi/cloud_tools.py')), false);
assert.equal(fs.existsSync(path.join(root, 'src/pi/cloud_executor.py')), false);
assert.equal(fs.existsSync(path.join(root, 'ui/components/shared/cloud-tool-client.js')), false);

const lyraCloud = read('ui/modules/lyra/scripts/chat/cloud.js');
const cloudDuo = read('ui/modules/llmcloud/scripts/cloud-duo.js');
assert.match(lyraCloud, /processJSONFamily\(/);
assert.match(lyraCloud, /const MAX_ITER = 100;/);
assert.match(cloudDuo, /processJSONFamily\(/);
assert.match(cloudDuo, /const MAX_ITER = 100;/);

const artifacts = read('src/tools/router.py');
assert.match(artifacts, /@post\("\/artifacts\/read"\)/);
assert.match(read('ui/modules/lyra/view/lyra.js'), /postJSON\('\/artifacts\/read'/);
assert.match(read('ui/modules/llmcloud/view/llmcloud.js'), /postJSON\('\/artifacts\/read'/);

const piRouter = read('src/pi/router.py');
assert.doesNotMatch(piRouter, /execute as ejecutar_tool_pi/);
assert.doesNotMatch(piRouter, /cloud_tool_journal/);
assert.match(read('src/json_family/service.py'), /from pi_tools import execute as execute_pi/);

console.log('OK — Cloud boundary: JSON Family única ejecución agentic, artefactos separados');
