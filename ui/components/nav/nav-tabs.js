// SVG icons 14x14, stroke currentColor, weight 1.4
const I = {
  inicio:       `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 6.5L7 1.5l5.5 5v6a.5.5 0 01-.5.5H9V9H5v4H2a.5.5 0 01-.5-.5v-6z"/></svg>`,
  aurora:       `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="5"/><path d="M7 2v10M2 7h10M4 4l6 6M10 4l-6 6"/></svg>`,
  productividad:`<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="10" height="10" rx="1"/><path d="M4 5h6M4 7h4M4 9h5"/></svg>`,
  local:        `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="5" r="2.5"/><path d="M2 12c0-2.76 2.24-5 5-5s5 2.24 5 5"/></svg>`,
  llmcloud:     `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 9.5H10a3 3 0 10-6 0h-.5A2 2 0 013.5 5.6a3.5 3.5 0 016.9-.1 2 2 0 01.1 4z"/></svg>`,
  prompts:      `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2h10a.5.5 0 01.5.5v7a.5.5 0 01-.5.5H8l-3 2v-2H2a.5.5 0 01-.5-.5v-7A.5.5 0 012 2z"/></svg>`,
  wiki:         `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 1.5h8a.5.5 0 01.5.5v10a.5.5 0 01-.5.5H3a.5.5 0 01-.5-.5V2a.5.5 0 01.5-.5z"/><line x1="5" y1="4.5" x2="9" y2="4.5"/><line x1="5" y1="7" x2="9" y2="7"/><line x1="5" y1="9.5" x2="7.5" y2="9.5"/></svg>`,
  scratchpad:   `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 1.5l3 3-7 7H2.5v-3l7-7z"/><line x1="8" y1="3" x2="11" y2="6"/></svg>`,
  mdreader:     `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2.5h5.5a2 2 0 012 2v7a2 2 0 01-2 2H3z"/><path d="M10.5 5.5h.5a1 1 0 011 1v4a1 1 0 01-1 1h-.5"/><path d="M5.5 5h3M5.5 7.5h3M5.5 10h2"/></svg>`,
  editor:       `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,4 1.5,7 4,10"/><polyline points="10,4 12.5,7 10,10"/><line x1="8" y1="2" x2="6" y2="12"/></svg>`,
  stats:        `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="7" width="2.5" height="5.5"/><rect x="5.75" y="4" width="2.5" height="8.5"/><rect x="10" y="1.5" width="2.5" height="11"/></svg>`,
  captura:      `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4.5C1 3.67 1.67 3 2.5 3h1.17L4.5 1.5h5l.83 1.5H11.5C12.33 3 13 3.67 13 4.5v6c0 .83-.67 1.5-1.5 1.5h-9C1.67 12 1 11.33 1 10.5v-6z"/><circle cx="7" cy="7.5" r="2"/></svg>`,
  toolkit:      `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2a2.5 2.5 0 00-2.45 3L2 10.5 3.5 12l5.5-5.05A2.5 2.5 0 109.5 2z"/></svg>`,
  chain:        `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 8.5a3.5 3.5 0 005 0l1.5-1.5a3.5 3.5 0 00-5-5L5.5 3.5"/><path d="M8.5 5.5a3.5 3.5 0 00-5 0L2 7a3.5 3.5 0 005 5l1.5-1.5"/></svg>`,
  detective:    `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="4"/><line x1="9" y1="9" x2="12.5" y2="12.5"/></svg>`,
  webnavigator: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="5.5"/><path d="M7 1.5C7 1.5 5 4 5 7s2 5.5 2 5.5M7 1.5C7 1.5 9 4 9 7s-2 5.5-2 5.5M1.5 7h11"/></svg>`,
  stylecatalog: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="4" cy="4" r="2"/><circle cx="10" cy="4" r="2"/><circle cx="4" cy="10" r="2"/><circle cx="10" cy="10" r="2"/></svg>`,
  ajustes:      `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="1.8"/><path d="M7 1.5v1M7 11.5v1M1.5 7h1M11.5 7h1M3.2 3.2l.7.7M10.1 10.1l.7.7M10.8 3.2l-.7.7M3.9 10.1l-.7.7"/></svg>`,
};

export const TABS = [
  { id: 'inicio',       label: 'Inicio',    svg: I.inicio       },
  { id: 'aurora',       label: 'Aurora',    svg: I.aurora       },
  { id: 'productividad', label: 'Product',  svg: I.productividad },
  { id: 'lyra',         label: 'Lyra',     svg: I.local        },
  { id: 'llmcloud',     label: 'Cloud',     svg: I.llmcloud     },
  { id: 'prompts',      label: 'Prompts',   svg: I.prompts      },
  { id: 'wiki',         label: 'Wiki',      svg: I.wiki         },
  { id: 'scratchpad', label: 'Notas',   svg: I.scratchpad   },
  { id: 'md-reader',  label: 'MD Read', svg: I.mdreader     },
  { id: 'editor',     label: 'Editor',  svg: I.editor       },
  { id: 'stats',        label: 'Stats',     svg: I.stats        },
  { id: 'captura',      label: 'Captura',   svg: I.captura      },
  { id: 'toolkit',      label: 'Toolkit',   svg: I.toolkit      },
  { id: 'chain',        label: 'Chain',     svg: I.chain        },
  { id: 'detective',    label: 'Tokens',    svg: I.detective    },
  { id: 'webnavigator', label: 'Navigator', svg: I.webnavigator },
  { id: 'stylecatalog', label: 'Styles',    svg: I.stylecatalog },
  { id: 'ajustes',      label: 'Ajustes',   svg: I.ajustes      },
];

export default TABS;
