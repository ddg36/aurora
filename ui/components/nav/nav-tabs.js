// Navegación de Aurora: una sola fuente de identidad y SVG monocromático.
// El color siempre llega por currentColor desde el estado del rail.
export const TABS = Object.freeze([
  { id: 'inicio',        label: 'Inicio',    icon: 'home' },
  { id: 'aurora',        label: 'Aurora',    icon: 'aurora' },
  { id: 'productividad', label: 'Product',   icon: 'productivity' },
  { id: 'lyra',          label: 'Lyria',     icon: 'user' },
  { id: 'llmcloud',      label: 'Cloud',     icon: 'cloud' },
  { id: 'prompts',       label: 'Prompts',   icon: 'prompt' },
  { id: 'wiki',          label: 'Wiki',      icon: 'book' },
  { id: 'scratchpad',    label: 'Notas',     icon: 'note' },
  { id: 'md-reader',     label: 'MD Read',   icon: 'file-text' },
  { id: 'editor',        label: 'Editor',    icon: 'code' },
  { id: 'stats',         label: 'Stats',     icon: 'chart' },
  { id: 'captura',       label: 'Captura',   icon: 'camera' },
  { id: 'toolkit',       label: 'Toolkit',   icon: 'toolkit' },
  { id: 'chain',         label: 'Chain',     icon: 'link' },
  { id: 'detective',     label: 'Tokens',    icon: 'search' },
  { id: 'webnavigator',  label: 'Navigator', icon: 'globe' },
  { id: 'stylecatalog',  label: 'Styles',    icon: 'grid' },
  { id: 'ajustes',       label: 'Ajustes',   icon: 'settings' },
  { id: 'reproductor',   label: 'Música',    icon: 'music' },
]);

export default TABS;
