export const THEMES = [
  // 🌌 Cósmico
  { id: 'redneon',  name: 'Red Neon',  category: 'cosmic',    accent: '#ef4444', surface2: '#2b0000', edgeGlow: 'rgba(239,68,68,0.2)',   accentDim: '#7f0000' },
  { id: 'cyan',     name: 'Cyan',      category: 'cosmic',    accent: '#06b6d4', surface2: '#002b2b', edgeGlow: 'rgba(6,182,212,0.2)',   accentDim: '#005f6b' },
  { id: 'ocean',    name: 'Ocean',     category: 'cosmic',    accent: '#3b82f6', surface2: '#001a2b', edgeGlow: 'rgba(59,130,246,0.2)',  accentDim: '#1a4a7f' },
  { id: 'aurora',   name: 'Aurora',    category: 'cosmic',    accent: '#00e5cc', surface2: '#001a1a', edgeGlow: 'rgba(0,229,204,0.2)',   accentDim: '#005f55', animated: true },
  { id: 'nebula',   name: 'Nebula',    category: 'cosmic',    accent: '#a78bfa', surface2: '#150b2b', edgeGlow: 'rgba(167,139,250,0.2)', accentDim: '#5b3fa0' },

  // ⚡ Cyberpunk
  { id: 'amber',    name: 'Amber',     category: 'cyberpunk', accent: '#f59e0b', surface2: '#2b1a00', edgeGlow: 'rgba(245,158,11,0.2)',  accentDim: '#7f4a00' },
  { id: 'lime',     name: 'Lime',      category: 'cyberpunk', accent: '#84cc16', surface2: '#1a2b00', edgeGlow: 'rgba(132,204,22,0.2)',  accentDim: '#3d5e00' },
  { id: 'magenta',  name: 'Magenta',   category: 'cyberpunk', accent: '#ec4899', surface2: '#2b0018', edgeGlow: 'rgba(236,72,153,0.2)',  accentDim: '#7f0040' },
  { id: 'matrix',   name: 'Matrix',    category: 'cyberpunk', accent: '#22c55e', surface2: '#002b0a', edgeGlow: 'rgba(34,197,94,0.2)',   accentDim: '#0a5e20' },
  { id: 'gold',     name: 'Gold',      category: 'cyberpunk', accent: '#d97706', surface2: '#2b1800', edgeGlow: 'rgba(217,119,6,0.2)',   accentDim: '#7f4500' },

  // 🦇 Gótico
  { id: 'lyria',    name: 'Lyria Carmesí', category: 'gothic', accent: '#e31b36', surface2: '#170307', edgeGlow: 'rgba(227,27,54,0.30)', accentDim: '#710b1b' },
  { id: 'rose',     name: 'Rose',      category: 'gothic',    accent: '#f43f5e', surface2: '#2b0015', edgeGlow: 'rgba(244,63,94,0.2)',   accentDim: '#7f001f' },
  { id: 'violet',   name: 'Violet',    category: 'gothic',    accent: '#8b5cf6', surface2: '#1a0b2b', edgeGlow: 'rgba(139,92,246,0.2)',  accentDim: '#4a1f8f' },
  { id: 'blood',    name: 'Blood',     category: 'gothic',    accent: '#7f0000', surface2: '#1a0000', edgeGlow: 'rgba(127,0,0,0.22)',  accentDim: '#3a0000' },
  { id: 'shadow',   name: 'Shadow',    category: 'gothic',    accent: '#6366f1', surface2: '#0d0d1a', edgeGlow: 'rgba(99,102,241,0.18)', accentDim: '#2d2f70' },
  { id: 'crypt',    name: 'Crypt',     category: 'gothic',    accent: '#94a3b8', surface2: '#0f0f10', edgeGlow: 'rgba(148,163,184,0.12)', accentDim: '#3a3f4a' },

  // 🌊 Abismal
  { id: 'abyssal',  name: 'Abyssal',   category: 'abysmal',   accent: '#06b6d4', surface2: '#000d14', edgeGlow: 'rgba(6,182,212,0.18)',  accentDim: '#00404f' },
  { id: 'biolum',   name: 'Biolum',    category: 'abysmal',   accent: '#34d399', surface2: '#001a10', edgeGlow: 'rgba(52,211,153,0.18)', accentDim: '#005535' },
  { id: 'deep',     name: 'Deep Sea',  category: 'abysmal',   accent: '#818cf8', surface2: '#050014', edgeGlow: 'rgba(129,140,248,0.18)', accentDim: '#2a2070' },

  // 🔥 Infernal
  { id: 'lava',     name: 'Lava',      category: 'infernal',  accent: '#f97316', surface2: '#1a0500', edgeGlow: 'rgba(249,115,22,0.2)',  accentDim: '#7f2d00' },
  { id: 'ember',    name: 'Ember',     category: 'infernal',  accent: '#ef4444', surface2: '#1a0000', edgeGlow: 'rgba(239,68,68,0.2)',   accentDim: '#6b0000' },
  { id: 'sulfur',   name: 'Sulfur',    category: 'infernal',  accent: '#eab308', surface2: '#1a1000', edgeGlow: 'rgba(234,179,8,0.2)',   accentDim: '#6b4a00' },

  // 🌸 Sakura
  { id: 'sakura',   name: 'Sakura',    category: 'sakura',    accent: '#f472b6', surface2: '#1a0015', edgeGlow: 'rgba(244,114,182,0.2)', accentDim: '#7f0060' },
  { id: 'hanami',   name: 'Hanami',    category: 'sakura',    accent: '#e879f9', surface2: '#150014', edgeGlow: 'rgba(232,121,249,0.2)', accentDim: '#6b006b' },
  { id: 'matcha',   name: 'Matcha',    category: 'sakura',    accent: '#86efac', surface2: '#001a08', edgeGlow: 'rgba(134,239,172,0.18)', accentDim: '#1a5e2a' },

  // ❄️ Ártico
  { id: 'glaciar',  name: 'Glaciar',   category: 'arctic',    accent: '#67e8f9', surface2: '#000d14', edgeGlow: 'rgba(103,232,249,0.2)', accentDim: '#00404f' },
  { id: 'frost',    name: 'Frost',     category: 'arctic',    accent: '#bfdbfe', surface2: '#050a14', edgeGlow: 'rgba(191,219,254,0.18)', accentDim: '#1e3a60' },
  { id: 'tundra',   name: 'Tundra',    category: 'arctic',    accent: '#94a3b8', surface2: '#080a0d', edgeGlow: 'rgba(148,163,184,0.15)', accentDim: '#2a3545' },
];

const BASE_BACKGROUNDS = [
  { id: 'starfield', name: 'Starfield', category: 'cosmic', icon: 'spark' },
  { id: 'void', name: 'Void', category: 'cosmic', icon: 'moon' },
  { id: 'clouds', name: 'Clouds', category: 'cosmic', icon: 'cloud' },
  { id: 'nebula', name: 'Nebula', category: 'cosmic', icon: 'aurora' },
  { id: 'aurora', name: 'Aurora', category: 'cosmic', icon: 'repeat' },
  { id: 'particles', name: 'Particles', category: 'cosmic', icon: 'grid' },
  { id: 'matrix', name: 'Matrix', category: 'cyberpunk', icon: 'terminal' },
  { id: 'grid', name: 'Grid CRT', category: 'cyberpunk', icon: 'grid' },
  { id: 'rain', name: 'Neon Rain', category: 'cyberpunk', icon: 'arrowDown' },
  { id: 'glitch', name: 'Glitch', category: 'cyberpunk', icon: 'split' },
  { id: 'fireflies', name: 'Fireflies', category: 'cyberpunk', icon: 'bulb' },
  { id: 'castle', name: 'Castle', category: 'gothic', icon: 'home' },
  { id: 'blood', name: 'Blood', category: 'gothic', icon: 'warning' },
  { id: 'ash', name: 'Ash', category: 'gothic', icon: 'moon' },
  { id: 'fog', name: 'Fog', category: 'gothic', icon: 'menu' },
  { id: 'ravens', name: 'Ravens', category: 'gothic', icon: 'spark' },
  { id: 'abyss', name: 'Abyss', category: 'abysmal', icon: 'eye' },
  { id: 'depths', name: 'Depths', category: 'abysmal', icon: 'arrowDown' },
  { id: 'hellfire', name: 'Hellfire', category: 'infernal', icon: 'spark' },
  { id: 'lava', name: 'Lava', category: 'infernal', icon: 'warning' },
  { id: 'sakura', name: 'Sakura', category: 'sakura', icon: 'spark' },
  { id: 'autumn', name: 'Autumn', category: 'sakura', icon: 'arrowDown' },
  { id: 'moonlit', name: 'Moonlit', category: 'sakura', icon: 'moon' },
  { id: 'blizzard', name: 'Blizzard', category: 'arctic', icon: 'repeat' },
  { id: 'tundra', name: 'Tundra', category: 'arctic', icon: 'chart' },
];

export const BACKGROUND_SERIES = [
  { id: 'remake', name: 'Remake adaptativo', description: 'Escenas nuevas que cambian de paleta sin cambiar de composición.' },
  { id: 'classic-night', name: 'Clásicos nocturnos', description: 'Fondos oscuros originales, conservados como opciones.' },
  { id: 'classic-day', name: 'Clásicos claros', description: 'Visuales del antiguo modo blanco, rescatados como opciones independientes.' },
];

export const BACKGROUNDS = [
  { id: 'lyria-remake', scene: 'lyria', name: 'Eclipse de Lyria', category: 'gothic', icon: 'moon', series: 'remake' },
  { id: 'luna-remake', scene: 'luna', name: 'Luna · Remake', category: 'gothic', icon: 'moon', series: 'remake' },
  ...BASE_BACKGROUNDS.map(x => ({ ...x, scene: x.id, id: `${x.id}-remake`, series: 'remake', name: `${x.name} · Remake` })),
  ...BASE_BACKGROUNDS.map(x => ({ ...x, scene: x.id, series: 'classic-night', name: `${x.name} · Noche clásica` })),
  ...BASE_BACKGROUNDS.map(x => ({ ...x, scene: x.id, id: `${x.id}-classic-day`, series: 'classic-day', name: `${x.name} · Día clásico` })),
];

export const HUDS = [
  { id: 'lyria', name: 'Mirada de Lyria', category: 'gothic', icon: 'eye', behavior: 'Presencia', description: 'Une armadura grabada con una mirada carmesí que responde al estado real de Lyria.' },
  { id: 'pulse-rings', name: 'Halo de foco', category: 'cosmic', icon: 'eye', behavior: 'Foco', description: 'Aísla el control o proceso activo con pulsos concéntricos.' },
  { id: 'scanlines', name: 'Panel CRT', category: 'cyberpunk', icon: 'menu', behavior: 'Textura', description: 'Añade barrido técnico dentro de superficies, sin ensuciar el fondo.' },
  { id: 'circuit', name: 'Circuitos UI', category: 'cyberpunk', icon: 'link', behavior: 'Estructura', description: 'Conecta paneles y controles con trazas y nodos funcionales.' },
  { id: 'corners', name: 'Brackets', category: 'cyberpunk', icon: 'expand', behavior: 'Encuadre', description: 'Marca los límites de tarjetas y estados seleccionados.' },
  { id: 'candles', name: 'Filigrana cálida', category: 'gothic', icon: 'bulb', behavior: 'Jerarquía', description: 'Ilumina cabeceras y superficies importantes con remates cálidos.' },
  { id: 'runes', name: 'Runas UI', category: 'gothic', icon: 'braces', behavior: 'Código', description: 'Construye marcas geométricas en títulos y estados activos.' },
  { id: 'drip', name: 'Borde carmesí', category: 'gothic', icon: 'arrowDown', behavior: 'Tensión', description: 'Crea remates verticales y bordes superiores dramáticos.' },
  { id: 'sonar', name: 'Sonar de foco', category: 'abysmal', icon: 'search', behavior: 'Actividad', description: 'Emite ondas sobre foco, streaming y operaciones en curso.' },
  { id: 'ember', name: 'Interfaz brasa', category: 'infernal', icon: 'spark', behavior: 'Estado', description: 'Calienta bordes y vuelve inequívocos los estados activos.' },
  { id: 'torii', name: 'Marcos Torii', category: 'sakura', icon: 'grid', behavior: 'Umbral', description: 'Convierte cabeceras y divisores en umbrales arquitectónicos.' },
  { id: 'compass', name: 'Navegación polar', category: 'arctic', icon: 'globe', behavior: 'Orientación', description: 'Refuerza dirección, navegación y posición actual.' },
];
