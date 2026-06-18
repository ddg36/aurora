export function crearSnapshotAjustes({ theme, background, hud, llms }) {
  return {
    theme,
    background,
    hud,
    llms,
    exportado: new Date().toISOString(),
  };
}

export function descargarJSON(nombre, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();

  URL.revokeObjectURL(a.href);
}

export function leerJSONArchivo(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo'));
    reader.readAsText(file);
  });
}
