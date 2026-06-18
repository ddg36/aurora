import * as components from './index.js';
import { Toast } from './shared/toast.js';

Object.assign(globalThis, components);
globalThis.Toast = Toast;

export default components;
