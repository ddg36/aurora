# Aurora Mobile — entorno de desarrollo agéntico de bolsillo

## Idea central

Aurora Mobile no pretende controlar Android ni apoderarse del teléfono. Su propósito es ofrecer un entorno de desarrollo contenido donde una IA en la nube pueda crear, leer, modificar, ejecutar y previsualizar proyectos útiles dentro de un espacio privado.

El objetivo no es reproducir una PC completa. En el celular solo necesitamos cuatro capacidades:

1. una terminal para Aurora;
2. Python, Git y utilidades Linux básicas;
3. un runtime de navegador para ejecutar HTML, CSS y JavaScript;
4. acceso a un espacio propio para leer, escribir y editar archivos.

## La agencia no depende de Pi

Pi es útil como arnés para modelos locales, pero no es obligatorio para el modo nube.

Aurora ya puede importar y ejecutar directamente sus funciones de herramientas sin iniciar Pi en modo headless ni RPC. En ese flujo, el chat en la nube aporta el razonamiento y Aurora aporta el parser, la validación, la ejecución y la devolución del resultado.

El ciclo agéntico real es:

```text
razonamiento
    ↓
llamada estructurada
    ↓
validación
    ↓
ejecución
    ↓
resultado real
    ↓
corrección o siguiente acción
```

Pi sigue siendo uno de los arneses o ejecutores posibles, especialmente para modelos locales, pero Aurora puede ejecutar herramientas sin mantener Pi activo.

## Alcance correcto de Aurora Mobile

Aurora Mobile debe ser un agente de desarrollo dentro de un sandbox, no un agente de control general del teléfono.

Su función será:

- crear aplicaciones pequeñas;
- escribir scripts útiles;
- leer, escribir y editar archivos;
- ejecutar Python;
- trabajar con repositorios Git;
- ejecutar comandos Linux básicos;
- previsualizar HTML, CSS y JavaScript;
- guardar proyectos y resultados dentro de su propio espacio.

No necesita acceso a llamadas, contactos, SMS, cuentas personales, accesibilidad global ni configuraciones del sistema.

## Las cuatro piezas necesarias

### 1. Terminal y ejecutor de procesos

Aurora necesita una terminal real o un ejecutor que pueda iniciar procesos y devolver:

- `stdout`;
- `stderr`;
- código de salida;
- estado del proceso;
- tiempo de ejecución;
- cancelación;
- timeout.

Herramientas mínimas:

```text
bash o sh
read
write
edit
ls
find
grep
```

No es necesario que la terminal tenga acceso total a Android. Solo debe operar dentro del workspace privado de Aurora y sobre archivos importados explícitamente.

### 2. Python, Git y entorno Linux básico

El entorno puede vivir dentro del sandbox de la aplicación o apoyarse opcionalmente en Termux.

Componentes principales:

```text
Python
Git
sh o bash
grep
sed
find
tar
zip
curl
```

Node o Bun serían opcionales. Para aplicaciones web sencillas basta con el runtime del navegador, pero podrían incorporarse si algún proyecto necesita herramientas de construcción JavaScript.

Esto permitiría:

- escribir y ejecutar scripts Python;
- procesar CSV, JSON, texto e imágenes;
- clonar repositorios;
- revisar y modificar código;
- ejecutar pruebas compatibles con ARM/Android;
- comprimir y exportar proyectos;
- usar SSH para delegar tareas pesadas a una laptop o servidor RTX.

### 3. Runtime de navegador

Un WebView puede alojar la interfaz de Aurora y servir como runtime para proyectos creados por la IA.

Debe poder ejecutar:

- HTML;
- CSS;
- JavaScript;
- Markdown;
- Canvas;
- interfaces y pequeñas aplicaciones web.

Ejemplo de proyecto:

```text
projects/gastos/
├── index.html
├── styles.css
└── app.js
```

Aurora crea o modifica esos archivos y luego abre `index.html` en una pestaña de previsualización interna.

No hace falta portar Helium completo. Basta con un WebView y un puente seguro entre la interfaz JavaScript y el ejecutor de herramientas.

### 4. Espacio propio de archivos

Aurora necesita un workspace privado y organizado:

```text
Aurora/
├── projects/
├── scripts/
├── repos/
├── outputs/
├── memory/
├── config/
└── runtime/
```

Dentro de este espacio podrá:

- leer archivos;
- escribir archivos;
- aplicar ediciones;
- crear y borrar carpetas controladamente;
- guardar repositorios;
- ejecutar scripts;
- almacenar resultados;
- mantener memoria y configuración local.

Los archivos externos deben importarse mediante el selector de documentos de Android o una carpeta autorizada. Aurora no necesita acceso arbitrario al almacenamiento completo del teléfono.

## Arquitectura propuesta

```text
ChatGPT, Claude u otro chat en la nube
                ↓
       texto y tool calls visibles
                ↓
          Aurora Mobile
                ↓
       parser y validador
                ↓
           Tool Router
       ┌────────┼─────────┐
       ↓        ↓         ↓
     Files    Shell     Preview
       ↓        ↓         ↓
  Workspace  Python/Git  WebView
```

La interfaz puede ser web, mientras las funciones sensibles se implementan en una capa nativa o en un backend local controlado.

## Herramientas mínimas del MVP

```text
read
write
edit
ls
find
grep
bash
python
 git
preview_web
```

`preview_web` abriría un archivo HTML del workspace en el WebView interno.

Cada herramienta debe tener:

- esquema estricto de argumentos;
- rutas permitidas;
- límite de tiempo;
- límite de tamaño de salida;
- registro de ejecución;
- confirmación para operaciones destructivas.

## Termux como backend opcional

Termux puede aportar el entorno Linux, Python, Git, SSH y utilidades Unix sin que Aurora dependa completamente de él.

Dos posibles integraciones:

### Puente local

```text
Aurora Mobile
      ↓ petición validada
localhost
      ↓
Termux Bridge
      ↓
Python, Git y shell
```

El puente solo debe escuchar en `127.0.0.1` y aceptar herramientas previamente permitidas.

### Ejecución mediante integración Android

Aurora podría solicitar a Termux ejecutar comandos autorizados mediante los mecanismos que Android y Termux permitan.

En ambos casos, Aurora conserva el control del protocolo, los permisos y la validación. Termux actúa únicamente como runtime Linux.

## Ejemplos de uso

### Crear una aplicación

> Crea una aplicación para registrar gastos diarios.

Aurora genera HTML, CSS y JavaScript, guarda el proyecto y lo abre en la vista previa.

### Crear un script Python

> Analiza este CSV, agrupa los gastos por categoría y genera un resumen.

Aurora importa el archivo, escribe el script, lo ejecuta y guarda el resultado.

### Trabajar con Git

> Clona este repositorio, encuentra el error y ejecuta sus pruebas.

Aurora usa Git, lee y edita el código, ejecuta las pruebas y devuelve los resultados al chat.

### Crear herramientas pequeñas

> Haz un script que renombre estos archivos siguiendo una numeración.

Aurora construye y ejecuta el script dentro del workspace autorizado.

### Delegar trabajo pesado

> Conéctate por SSH al servidor y ejecuta llama.cpp o ComfyUI.

El celular sigue siendo el núcleo portátil, pero puede usar otros nodos cuando necesita más potencia.

## Privacidad

Aurora Mobile no necesita acceso a contactos, llamadas, SMS ni ubicación para cumplir su objetivo.

Dar esas capacidades a un modelo de nube podría exponer números telefónicos, nombres, mensajes u otros datos personales en el contexto remoto.

Si alguna vez se implementan funciones personales, el modelo solo debería expresar una intención abstracta y el teléfono resolver los datos privados localmente.

Ejemplo seguro conceptual:

```json
{"tool":"call_contact","args":{"contact_alias":"mamá"}}
```

El número real se resolvería en el dispositivo y nunca se devolvería al chat. Aun así, llamadas y contactos deben quedar fuera del MVP.

## Seguridad

El enfoque contenido reduce considerablemente la superficie de riesgo:

- sin root;
- sin control general de Android;
- workspace privado;
- rutas autorizadas;
- archivos externos importados explícitamente;
- herramientas con esquemas estrictos;
- timeouts y límites de salida;
- confirmación para borrar o sobrescribir;
- historial de acciones;
- secretos almacenados localmente;
- Termux opcional y aislado detrás de un puente validado.

## Diferencia entre escritorio y móvil

```text
Aurora Desktop
= agente de sistema y desarrollo con acceso amplio a una PC

Aurora Mobile
= agente de desarrollo contenido dentro de su propio workspace
```

La versión móvil no es una Aurora inferior. Está especializada en crear y ejecutar software útil sin intentar administrar el teléfono completo.

## MVP propuesto

1. Aplicación Android con WebView.
2. Interfaz móvil de Aurora.
3. Workspace privado.
4. Herramientas `read`, `write`, `edit`, `ls`, `find` y `grep`.
5. Ejecutor de shell con `stdout`, `stderr`, código de salida, cancelación y timeout.
6. Python funcional.
7. Git funcional.
8. Preview interno de HTML, CSS y JavaScript.
9. Parser de herramientas reutilizado del modo nube.
10. Memoria e historial local, posiblemente con SQLite.
11. Importación y exportación explícita de archivos.
12. Integración opcional con Termux.

## Definición final

> Aurora Mobile es un entorno de desarrollo agéntico, portátil y contenido, capaz de crear, leer, editar, ejecutar y previsualizar software dentro de su propio espacio.

No necesita controlar Android. Solo necesita archivos, terminal, Python, Git y un navegador donde mostrar lo que construyó.
