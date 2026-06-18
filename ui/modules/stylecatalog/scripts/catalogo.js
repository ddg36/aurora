export const PRIMITIVES = [
  {
    id: 'button', label: 'Button', file: 'components/Button.js',
    base: 'Button',
    variants: ['variant=primary', 'variant=danger', 'size=sm', 'active', 'disabled'],
    snippet: `<\${Button}>Default<//>\n<\${Button} variant="primary">Primary<//>\n<\${Button} variant="danger">Danger<//>\n<\${Button} size="sm">Small<//>`,
  },
  {
    id: 'panel', label: 'Panel', file: 'components/Panel.js',
    base: 'Panel / PanelHeader / PanelBody / PanelFooter / PanelLabel / PanelValue',
    variants: ['stat', 'interactive', 'active', 'iframeMode'],
    snippet: `<\${Panel} interactive>\n  <\${PanelHeader}>Title<//>\n  <\${PanelBody}>Content<//>\n<//>`,
  },
  {
    id: 'toolbar', label: 'Toolbar', file: 'components/Toolbar.js',
    base: 'Toolbar / ToolbarSpacer',
    variants: ['compact'],
    snippet: `<\${Toolbar} title="Actions">\n  <\${ToolbarSpacer} />\n  <\${Button} size="sm">Action<//>\n<//>`,
  },
  {
    id: 'chip', label: 'Chip', file: 'components/Chip.js',
    base: 'Chip / ChipGroup',
    variants: ['active'],
    snippet: `<\${ChipGroup}>\n  <\${Chip} active>All<//>\n  <\${Chip}>Active<//>\n  <\${Chip}>Archived<//>\n<//>`,
  },
  {
    id: 'input', label: 'Input', file: 'components/Input.js',
    base: 'Input / Textarea / Select',
    variants: ['type', 'disabled', 'rows'],
    snippet: `<\${Input} placeholder="Nombre" value=\${v} onInput=\${e => setV(e.target.value)} />\n<\${Textarea} rows=\${4} placeholder="Texto…" />\n<\${Select}>…opciones<//>`,
  },
  {
    id: 'list', label: 'List', file: 'components/List.js',
    base: 'List / ListItem / ListActions',
    variants: ['icon', 'sub', 'info', 'onClick'],
    snippet: `<\${List}>\n  <\${ListItem} icon="📁" name="Item" sub="Descripción" onClick=\${fn} />\n<//>`,
  },
  {
    id: 'empty', label: 'Empty State', file: 'components/Empty.js',
    base: 'Empty',
    variants: ['icon', 'title'],
    snippet: `<\${Empty} icon="📭" title="Sin items">Creá uno para empezar.<//>`,
  },
  {
    id: 'chatmessage', label: 'ChatMessage', file: 'components/ChatMessage.js',
    base: 'ChatMessage / ChatList',
    variants: ['role=user', 'role=assistant', 'time'],
    snippet: `<\${ChatList}>\n  <\${ChatMessage} role="user" time="10:30">Hola<//>\n  <\${ChatMessage} role="assistant" time="10:31">¿En qué te ayudo?<//>\n<//>`,
  },
];

export const TOKENS = [
  { name: '--aurora-bg',          type: 'color' },
  { name: '--aurora-surface',     type: 'color' },
  { name: '--aurora-surface-2',   type: 'color' },
  { name: '--aurora-border',      type: 'color' },
  { name: '--aurora-text',        type: 'color' },
  { name: '--aurora-text-muted',  type: 'color' },
  { name: '--aurora-text-dim',    type: 'color' },
  { name: '--aurora-accent',      type: 'color' },
  { name: '--aurora-accent-dim',  type: 'color' },
  { name: '--aurora-warning',     type: 'color' },
  { name: '--aurora-error',       type: 'color' },
  { name: '--aurora-success',     type: 'color' },
  { name: '--aurora-field',       type: 'color' },
  { name: '--aurora-radius',      type: 'size' },
];

export const PATTERNS = [
  {
    id: 'toolbar-panel-list',
    label: 'Toolbar + Panel + List',
    snippet: `<\${Panel}>\n  <\${Toolbar} title="Items">\n    <\${ToolbarSpacer} />\n    <\${Button} size="sm" variant="primary">+ Add<//>\n  <//>\n  <\${List}>\n    <\${ListItem} icon="📁" name="Item" sub="…" onClick=\${fn} />\n  <//>\n<//>`,
  },
  {
    id: 'form-in-panel',
    label: 'Form in Panel',
    snippet: `<\${Panel}>\n  <\${PanelHeader}>Settings<//>\n  <\${PanelBody}>\n    <\${Input} placeholder="Nombre" />\n    <\${Input} type="url" placeholder="https://…" />\n  <//>\n  <\${PanelFooter}>\n    <\${Button}>Cancelar<//>\n    <\${Button} variant="primary">Guardar<//>\n  <//>\n<//>`,
  },
  {
    id: 'chips-filters',
    label: 'Chips como filtros',
    snippet: `<\${ChipGroup}>\n  <\${Chip} active>Todos<//>\n  <\${Chip}>Activos<//>\n  <\${Chip}>Archivados<//>\n<//>`,
  },
  {
    id: 'stat-cards',
    label: 'Grid de stats',
    snippet: `<div class="grid grid-cols-4 gap-2">\n  <\${Panel} stat>\n    <\${PanelValue}>42<//>\n    <\${PanelLabel}>Items<//>\n  <//>\n</div>`,
  },
  {
    id: 'empty-action',
    label: 'Empty + acción',
    snippet: `<\${Empty} icon="📭" title="Sin items">\n  Creá el primero.\n  <\${Button} variant="primary">+ Crear<//>\n<//>`,
  },
];

export function resolveToken(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
