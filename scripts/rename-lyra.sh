#!/usr/bin/env bash
# Rename completo: gemita/local (módulo chat) → lyra.
# - módulo ui/modules/local → ui/modules/lyra (tab, view, css)
# - gemita-ws.js → lyra-ws.js + funciones sendToGemita → sendToLyra etc.
# - endpoint WS /gemita → /lyra (backend + frontend)
# Excluye: docs/ (historia), _legacy/, vendor/, databases/.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── mv de directorios y archivos ──"
git mv ui/modules/local ui/modules/lyra
git mv ui/modules/lyra/view/local.js ui/modules/lyra/view/lyra.js
git mv ui/components/local ui/components/lyra
git mv ui/components/local.views ui/components/lyra.views
git mv ui/components/shared/gemita-ws.js ui/components/shared/lyra-ws.js
for css in local.css local.canvas.css local.composer-cloud.css local.messages.css local.panels.css local.responsive.css local.tools.css; do
  [ -f "ui/components/lyra/$css" ] && git mv "ui/components/lyra/$css" "ui/components/lyra/${css/local./lyra.}"
done

FILES=$(grep -rl -e 'gemita\|Gemita\|GEMITA' -e 'modules/local' -e 'components/local' -e 'view/local\.js' -e 'local/local\.css' \
  ui/ src/ extensions/ tests/ config/ scripts/start.sh 2>/dev/null \
  --include='*.js' --include='*.mjs' --include='*.py' --include='*.html' --include='*.toml' --include='*.ts' --include='*.css' --include='*.sh' \
  | grep -v '_legacy\|vendor\|__pycache__\|node_modules' | sort -u)

echo "── sed en $(echo "$FILES" | wc -l) archivos ──"
for f in $FILES; do
  sed -i \
    -e 's|modules/local/|modules/lyra/|g' \
    -e 's|components/local|components/lyra|g' \
    -e "s|'./local/local\.css'|'./lyra/lyra.css'|g" \
    -e 's|view/local\.js|view/lyra.js|g' \
    -e 's|gemita|lyra|g' \
    -e 's|Gemita|Lyra|g' \
    -e 's|GEMITA|LYRA|g' \
    "$f"
done

echo "── css internos del módulo ──"
for f in ui/modules/lyra/view/lyra.js ui/components/lyra/*.css; do
  [ -f "$f" ] && sed -i \
    -e 's|local\.canvas\.css|lyra.canvas.css|g' \
    -e 's|local\.composer-cloud\.css|lyra.composer-cloud.css|g' \
    -e 's|local\.messages\.css|lyra.messages.css|g' \
    -e 's|local\.panels\.css|lyra.panels.css|g' \
    -e 's|local\.responsive\.css|lyra.responsive.css|g' \
    -e 's|local\.tools\.css|lyra.tools.css|g' \
    -e 's|local\.css|lyra.css|g' \
    "$f" || true
done

echo "── tab id: local → lyra ──"
sed -i "s|local:        () => import('./modules/lyra/view/lyra.js|lyra:         () => import('./modules/lyra/view/lyra.js|" ui/app.js
sed -i "s|{ id: 'local',        label: 'Local',|{ id: 'lyra',         label: 'Lyra',|" ui/components/nav/nav-tabs.js
sed -i "s|{ tab: 'local',        icon: '🧠', label: 'Local AI',   desc: 'Lyra + llama' }|{ tab: 'lyra',         icon: '🧠', label: 'Lyra',       desc: 'Lyra + llama' }|" ui/modules/inicio/foot/actions.js

echo "── verificación: referencias viejas restantes (debe estar vacío) ──"
grep -rn -e 'gemita' -e 'modules/local' -e "id: 'local'" ui/ src/ tests/ config/ extensions/pi/ 2>/dev/null \
  --include='*.js' --include='*.mjs' --include='*.py' --include='*.toml' --include='*.ts' \
  | grep -v '_legacy\|vendor\|__pycache__' || echo "OK — sin referencias viejas"
