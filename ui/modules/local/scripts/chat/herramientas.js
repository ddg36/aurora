export const HERRAMIENTAS_SISTEMA = [
  { name: 'get_current_datetime', desc: 'Obtiene la fecha y hora actual en ISO 8601.' },
  { name: 'run_bash',             desc: 'Ejecuta un comando bash en el cuarto de Gemita.' },
  { name: 'nexus_run',            desc: 'Ejecuta una tarea via Nexus con confirmación por riesgo.' },
  { name: 'read_file',            desc: 'Lee el contenido de un archivo del workspace.' },
  { name: 'write_file',           desc: 'Escribe o sobreescribe un archivo.' },
  { name: 'list_directory',       desc: 'Lista archivos y carpetas de un directorio.' },
  { name: 'search_in_files',      desc: 'Busca texto dentro de archivos (grep).' },
  { name: 'find_files',           desc: 'Busca archivos por nombre o patrón.' },
  { name: 'update_memory',        desc: 'Guarda un recuerdo en la memoria persistente.' },
  { name: 'read_memory',          desc: 'Lee recuerdos de la memoria persistente.' },
  { name: 'get_user_profile',     desc: 'Lee el perfil del usuario del workspace.' },
  { name: 'save_user_profile',    desc: 'Guarda o actualiza el perfil del usuario.' },
  { name: 'canvas_write',         desc: 'Escribe contenido en el canvas visual del usuario.' },
];

export function promptParaHerramienta(tool, soloNombre = false) {
  if (soloNombre) return tool.name;
  return `Usá la herramienta ${tool.name} para: `;
}
