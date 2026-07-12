// UI/COMPONENTS — Aurora Design Kit, componentes Preact.
// Uso: import { Button, Toolbar, Panel } from '../../ui/components/index.js'
//
// Regla de tamaño (por qué todo mide igual, siempre):
// - Ícono/emoji sin texto → <Button iconOnly> (ICON_BTN_SIZE, 36px cuadrado).
// - Texto o texto+emoji   → <Chip>.
// - Cualquier otro control (Input/Textarea/Select) también usa BTN_HEIGHT.
// Ningún componente define su propio número — todos importan BTN_HEIGHT/
// BTN_SAFE/ICON_BTN_SIZE/TOOLBAR_ROW de shared/iconButton.js (reexportadas
// acá abajo). Si un botón nuevo se ve "distinto", es porque no está usando
// estas constantes — nunca hardcodear un alto/ancho propio.

export { Button }                                      from './Button.js';
export { Dropdown, DropdownItem }                       from './Dropdown.js';
export { Status }                                       from './Status.js';
export { Toolbar, ToolbarSpacer }                       from './Toolbar.js';
export { Panel, PanelHeader, PanelBody, PanelFooter,
         PanelLabel, PanelValue }                      from './Panel.js';
export { List, ListItem, ListActions }                 from './List.js';
export { Disclosure }                                  from './Disclosure.js';
export { Empty }                                       from './Empty.js';
export { Chip, ChipGroup }                             from './Chip.js';
export { Input, Textarea, Select }                     from './Input.js';
export { ChatMessage, ChatList }                       from './ChatMessage.js';
export { BTN_HEIGHT, BTN_SAFE, ICON_BTN_SIZE, ICON_BTN_SQUARE,
         TOOLBAR_ROW, TOOLBAR_GROUP, iconButtonClass,
         useFloatingMenu, useAutoFitRow, AutoFitChips }    from './shared/iconButton.js';
