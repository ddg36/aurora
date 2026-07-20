const { html } = globalThis;

const PATHS = Object.freeze({
  home: '<path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-7h5v7"/>',
  aurora: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6 6 18"/>',
  productivity: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h6M8 16h7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  cloud: '<path d="M17.5 19H7a5 5 0 0 1-.6-9.96A6.5 6.5 0 0 1 19 10.5 4.25 4.25 0 0 1 17.5 19Z"/>',
  prompt: '<path d="M4 4h16v12H9l-5 4V4Z"/><path d="M8 8h8M8 12h5"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H11v18H6.5A2.5 2.5 0 0 0 4 22V4.5Z"/><path d="M20 4.5A2.5 2.5 0 0 0 17.5 2H13v18h4.5A2.5 2.5 0 0 1 20 22V4.5Z"/>',
  note: '<path d="M14.5 4.5 19.5 9.5 9 20H4v-5L14.5 4.5Z"/><path d="m12.5 6.5 5 5"/>',
  'file-text': '<path d="M6 2h8l4 4v16H6V2Z"/><path d="M14 2v5h5M9 12h6M9 16h6"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  chart: '<path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7M2 20h20"/>',
  camera: '<path d="M4 7h3l1.5-2h7L17 7h3v13H4V7Z"/><circle cx="12" cy="13" r="4"/>',
  toolkit: '<path d="M14.8 6.2a4 4 0 0 1-5 5L4 17l3 3 5.8-5.8a4 4 0 0 0 5-5l-3 3-3-3 3-3Z"/>',
  link: '<path d="M9.5 14.5 14.5 9.5"/><path d="M7 17H6a4 4 0 0 1 0-8h4M17 7h1a4 4 0 1 1 0 8h-4"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  save: '<path d="M4 3h13l3 3v15H4V3Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
  send: '<path d="m3 11 18-8-8 18-2-8-8-2Z"/><path d="m11 13 5-5"/>',
  trash: '<path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
  edit: '<path d="m14 5 5 5L8 21H3v-5L14 5Z"/><path d="m12 7 5 5"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8a7 7 0 0 1 11.4-2.2L20 8M4 16l2.5 2.2A7 7 0 0 0 18 16"/>',
  folder: '<path d="M3 6h7l2 2h9v12H3V6Z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  warning: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
  eyeOff: '<path d="M3 3 21 21"/><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.2 2.8M6.2 6.2C3.8 7.8 2.5 12 2.5 12s3.5 6 9.5 6a10 10 0 0 0 3-.4"/>',
  expand: '<path d="M9 3H3v6M15 3h6v6M21 15v6h-6M9 21H3v-6"/>',
  arrowUp: '<path d="M12 21V4M5 11l7-7 7 7"/>',
  arrowDown: '<path d="M12 3v17M5 13l7 7 7-7"/>',
  command: '<path d="m8 5-5 7 5 7M16 5l5 7-5 7"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m4 17 5-5 4 4 2-2 5 5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  history: '<path d="M4 4v6h6"/><path d="M5.5 17.5A9 9 0 1 0 4 10M12 7v5l3 2"/>',
  spark: '<path d="m12 2 1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5L12 2Z"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 16h4"/>',
  pin: '<path d="m14 4 6 6-3 1-4 4-1 5-2-2-2-2 5-1 4-4 1-3-6-6Z"/><path d="m4 20 6-6"/>',
  volume: '<path d="M4 10v4h4l5 4V6L8 10H4Z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  volumeOff: '<path d="M4 10v4h4l5 4V6L8 10H4Z"/><path d="m17 10 4 4M21 10l-4 4"/>',
  tag: '<path d="M3 4v7l9 9 8-8-9-9H4a1 1 0 0 0-1 1Z"/><circle cx="7.5" cy="7.5" r="1"/>',
  package: '<path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7M10 20h4"/>',
  mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l2 2M14 9l2 2"/>',
  brain: '<path d="M9 4a3 3 0 0 0-5 2 3 3 0 0 0 0 5 3 3 0 0 0 2 5.5A3.5 3.5 0 0 0 12 19V5a3 3 0 0 0-3-1Z"/><path d="M15 4a3 3 0 0 1 5 2 3 3 0 0 1 0 5 3 3 0 0 1-2 5.5A3.5 3.5 0 0 1 12 19M8 9h4M16 9h-4M8 14h4M16 14h-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  paperclip: '<path d="m8 12 6-6a4 4 0 1 1 6 6l-8 8a6 6 0 0 1-8-8l8-8"/>',
  bulb: '<path d="M9 18h6M10 22h4M8 14a7 7 0 1 1 8 0c-1 1-1 2-1 4H9c0-2 0-3-1-4Z"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4"/>',
  puzzle: '<path d="M8 3h4a3 3 0 1 0 6 0h3v7h-3a3 3 0 1 0 0 6h3v5h-7v-3a3 3 0 1 0-6 0v3H3v-7h3a3 3 0 1 0 0-6H3V3h5Z"/>',
  bot: '<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M8 12h.01M16 12h.01M8 16h8"/>',
  inbox: '<path d="M4 4h16l2 11v5H2v-5L4 4Z"/><path d="M2 15h6l2 3h4l2-3h6"/>',
  repeat: '<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
  clipboard: '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4"/>',
  braces: '<path d="M8 3H6a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h2M16 3h2a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-2"/>',
  moon: '<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  none: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
});

const LEGACY = Object.freeze({
  '⌂': 'home', '📷': 'camera', '📸': 'camera', '📄': 'file-text', '📝': 'note',
  '📋': 'copy', '⧉': 'copy', '💾': 'save', '✕': 'close', '×': 'close', '✖': 'close',
  '＋': 'plus', '+': 'plus', '🔍': 'search', '⚙': 'settings', '⚙️': 'settings',
  '🗑': 'trash', '✎': 'edit', '↻': 'refresh', '📁': 'folder', '👁': 'eye',
  '▶': 'play', '⏸': 'pause', '■': 'stop', '⬇': 'download', '⬆': 'upload',
  '✨': 'spark', '✦': 'spark', '💬': 'prompt', '🌐': 'globe', '🔗': 'link',
  '✓': 'check', '✔': 'check', '⚠': 'warning', '⚠️': 'warning', '📌': 'pin',
  '🔊': 'volume', '🔇': 'volumeOff', '🏷': 'tag', '📦': 'package', '👥': 'users',
  '👤': 'user', '🔔': 'bell', '🎤': 'mic', '🔑': 'key', '🧠': 'brain',
  '🕐': 'clock', '🕘': 'clock', '📎': 'paperclip', '💡': 'bulb', '🎬': 'film',
  '🧩': 'puzzle', '🤖': 'bot', '📭': 'inbox', '🔁': 'repeat', '📥': 'download',
  '🖼': 'image', '📊': 'chart', '📚': 'book', '📖': 'book', '🔧': 'toolkit',
  '🛠': 'toolkit', '🧰': 'toolkit', '☰': 'menu', '★': 'spark', '✏': 'edit',
  '⊞': 'clipboard', '@@': 'braces', '◐': 'moon', '↺': 'refresh', '∅': 'none',
  '☾': 'moon', '☼': 'sun', '⊟': 'split', '⇄': 'repeat', '⇆': 'repeat',
  '🦙': 'bot', '🤖': 'bot', '💭': 'prompt', '✉': 'prompt', '🔤': 'braces',
  '🧭': 'globe', '🌐': 'globe', '🌍': 'globe', '🔥': 'spark', '⛓': 'repeat',
  '🎭': 'users', '🏰': 'grid', '🌀': 'repeat', '🌳': 'split', '🌿': 'split',
  '🎩': 'user', '🪶': 'edit', '📂': 'folder', '☁': 'cloud', '☁️': 'cloud',
});

export function resolveIconName(value) {
  if (PATHS[value]) return value;
  return LEGACY[String(value || '').trim()] || null;
}

export function splitIconLabel(value) {
  if (typeof value !== 'string') return { icon: null, label: value };
  const text = value.trim();
  const entries = Object.keys(LEGACY).sort((a, b) => b.length - a.length);
  const glyph = entries.find(item => text.startsWith(item));
  if (!glyph) return { icon: null, label: value };
  return { icon: LEGACY[glyph], label: text.slice(glyph.length).trimStart() };
}

export function iconSvg(name, { size = 18, strokeWidth = 1.7 } = {}) {
  const body = PATHS[name];
  if (!body) return '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function Icon({ name, size = 18, label, class: cls }) {
  const svg = iconSvg(resolveIconName(name) || name, { size });
  if (!svg) return null;
  return html`<span class=${['au-icon', cls].filter(Boolean).join(' ')} role=${label ? 'img' : undefined} aria-label=${label} aria-hidden=${label ? undefined : 'true'} dangerouslySetInnerHTML=${{ __html: svg }} />`;
}
