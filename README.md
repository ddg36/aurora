# Aurora v2

Documentación única

Para entender este proyecto: lee estos archivos en este orden:

1. [`docs/ideas/aurora-v2.md`](docs/ideas/aurora-v2.md)
    – Arquitectura completa (estados, fears, roadmap)
2. [`docs/ideas/aurora-components-ui.md`](docs/ideas/aurora-components-ui.md)
    – Catálogo de componentes (primitivos, temas, vistas)
3. [`docs/mapa/mapa.md`](docs/mapa/mapa.md)
    – Mapa 1:1 del codebase real

## Iniciar genuine

```bash
# Servidor
cd aurora
pip install -r requirements.txt
python -m src.main

# Frontend
http://localhost:7779/ui
```

## Notas clave

- Se fusionan: `aurora.js` y `manifest.js`
- Las exténsion son thin clients que opera iframe
- Todo en base de datos SQLite a través de endpoints `/db/*`
- Contiene implementación de Duo (LLM en cadena) y explorer basados en WebSocket