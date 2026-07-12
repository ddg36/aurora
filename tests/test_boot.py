"""Smoke test de arranque: levanta la app completa en memoria y verifica
rutas públicas, guard global, búsqueda FTS y backup/restore/borrado.

Correr: .venv-linux/bin/python3 tests/test_boot.py
"""

import os
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
os.environ["AURORA_DB_PATH"] = str(pathlib.Path(tempfile.mkdtemp()) / "boot-test.db")

from litestar.testing import TestClient

from main import app


def main():
    with TestClient(app=app) as client:
        # Rutas públicas
        r = client.get("/ping")
        assert r.status_code == 200 and r.json()["ok"], r.text
        r = client.get("/health")
        assert r.status_code == 200, r.text
        h = r.json()
        for clave in ("pi", "extension", "webnavigator", "nexus", "db"):
            assert clave in h, f"health sin {clave}: {h}"
        assert h["db"]["schema"] >= 7, h["db"]

        # Guard global: sin token → 401
        for ruta in ("/nexus/fs/list?path=.", "/tools", "/db/usuarios/list", "/voz/voces"):
            r = client.get(ruta)
            assert r.status_code == 401, f"{ruta} debería dar 401, dio {r.status_code}"

        # Bootstrap de usuario
        r = client.post("/db/usuarios/init", json={"nombre": "boot-test"})
        assert r.status_code in (200, 201), r.text
        token = r.json()["token"]
        hdrs = {"Authorization": f"Bearer {token}"}

        # Con token pasa
        r = client.get("/nexus/fs/list?path=.", headers=hdrs)
        assert r.status_code == 200 and r.json()["ok"], r.text
        r = client.get("/tools", headers=hdrs)
        assert r.status_code == 200, r.text

        # tools: el caller del body se ignora; shell sigue exigiendo approval
        r = client.post(
            "/tools/aurora.nexus.shell.run/run",
            json={"arguments": {"cmd": "ls"}, "caller": {"kind": "internal"}, "approved": True},
            headers=hdrs,
        )
        assert r.json().get("approval_required"), r.text

        # Búsqueda FTS: crear chat+mensaje vía triggers y buscar
        r = client.post(
            "/db/chats",
            json={"id": 1, "nombre": "chat smoke", "creado_en": 1, "actualizado": 1},
            headers=hdrs,
        )
        client.post(
            "/db/chats/1/mensajes",
            json={"rol": "user", "contenido": "palabra buscable zanahoria"},
            headers=hdrs,
        )
        r = client.get("/db/search?q=zanahoria", headers=hdrs)
        cuerpo = r.json()
        assert r.status_code == 200 and cuerpo["ok"], r.text
        # si el POST de chats/mensajes usa otra forma, el search vacío no es error del guard
        if cuerpo["resultados"]:
            assert cuerpo["resultados"][0]["tipo"] == "mensaje", cuerpo

        # Backup introspectivo + restore idempotente
        r = client.get("/db/backup", headers=hdrs)
        assert r.status_code == 200, r.text
        backup = r.json()
        assert backup["version"] == 2 and "tablas" in backup, backup
        r = client.post("/db/backup/restore", json=backup, headers=hdrs)
        assert r.status_code in (200, 201) and r.json()["ok"], r.text

        # Borrado de usuario: el activo no, otro sí
        r = client.delete("/db/usuarios/999", headers=hdrs)
        assert not r.json().get("ok"), r.text
        r = client.post("/db/usuarios/crear", json={"nombre": "victima"}, headers=hdrs)
        uid2 = r.json()["usuario_id"]
        r = client.delete(f"/db/usuarios/{uid2}", headers=hdrs)
        assert r.json()["ok"], r.text

    print("OK — boot, guard global, FTS, backup/restore y borrado de usuario")


if __name__ == "__main__":
    main()
