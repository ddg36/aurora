PROMPTS = {
    "aurora-agent-plan": {
        "name": "aurora-agent-plan",
        "description": "Plan breve para una tarea usando tools de Aurora.",
        "arguments": [{"name": "goal", "description": "Objetivo del usuario", "required": True}],
        "template": "Crea un plan breve para lograr este objetivo en Aurora: {goal}",
    },
    "aurora-code-review": {
        "name": "aurora-code-review",
        "description": "Revisión de código priorizando bugs y regresiones.",
        "arguments": [{"name": "scope", "description": "Archivos o diff a revisar", "required": True}],
        "template": "Revisa este alcance como code review. Prioriza bugs, riesgos y tests: {scope}",
    },
    "aurora-md-summary": {
        "name": "aurora-md-summary",
        "description": "Resumen compacto de documentos Markdown.",
        "arguments": [{"name": "path", "description": "Ruta o documento", "required": True}],
        "template": "Resume el Markdown indicado, preservando decisiones y tareas: {path}",
    },
    "aurora-web-research": {
        "name": "aurora-web-research",
        "description": "Investiga una captura web y extrae resumen, entidades, argumentos y fuentes.",
        "arguments": [{"name": "capture", "description": "Contenido o id de captura", "required": True}],
        "template": "Analiza esta captura web y devuelve resumen, entidades, argumentos, decisiones, fuentes y preguntas: {capture}",
    },
    "aurora-task-from-web": {
        "name": "aurora-task-from-web",
        "description": "Convierte contexto web en tareas accionables.",
        "arguments": [{"name": "context", "description": "Contexto web", "required": True}],
        "template": "Convierte este contexto web en tareas accionables con prioridad y siguiente paso: {context}",
    },
    "aurora-meeting-summary": {
        "name": "aurora-meeting-summary",
        "description": "Resume una reunion web en decisiones, pendientes y timeline.",
        "arguments": [{"name": "transcript", "description": "Transcripcion o chat visible", "required": True}],
        "template": "Resume esta reunion en resumen ejecutivo, decisiones, pendientes y timeline: {transcript}",
    },
    "aurora-price-watch": {
        "name": "aurora-price-watch",
        "description": "Extrae datos de producto para vigilancia de precio.",
        "arguments": [{"name": "product", "description": "Pagina o datos de producto", "required": True}],
        "template": "Extrae nombre, tienda, precio, moneda, stock y selectores utiles de este producto: {product}",
    },
    "aurora-tab-session-summary": {
        "name": "aurora-tab-session-summary",
        "description": "Resume una sesion de pestañas por proyecto o prioridad.",
        "arguments": [{"name": "tabs", "description": "Lista de tabs", "required": True}],
        "template": "Agrupa y resume estas pestañas por proyecto, prioridad y accion sugerida: {tabs}",
    },
}


def list_prompts() -> list[dict]:
    return [
        {k: v for k, v in prompt.items() if k != "template"}
        for prompt in PROMPTS.values()
    ]


def get_prompt(name: str, arguments: dict | None = None) -> dict:
    prompt = PROMPTS.get(name)
    if not prompt:
        return {"ok": False, "error": f"Prompt no encontrado: {name}"}
    arguments = arguments or {}
    text = prompt["template"].format(**{arg["name"]: arguments.get(arg["name"], "") for arg in prompt["arguments"]})
    return {
        "ok": True,
        "description": prompt["description"],
        "messages": [{"role": "user", "content": {"type": "text", "text": text}}],
    }
