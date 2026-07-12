"""Test de src/pi/ocr.py: OCR vía proceso pi DEDICADO (no el de Lyra).

Correr: .venv-linux/bin/python3 tests/pi/test_ocr.py
"""

import asyncio
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "src"))

from pi import ocr as O

FAKE = str(pathlib.Path(__file__).parent / "fake_pi.py")


async def main():
    O._proceso = None

    comandos = []
    proceso_real = O._get_proceso()
    proceso_real.argv = [sys.executable, FAKE]
    pedir_original = proceso_real.pedir

    async def pedir_espia(cmd, *a, **kw):
        comandos.append(cmd.get("type"))
        return await pedir_original(cmd, *a, **kw)

    proceso_real.pedir = pedir_espia

    texto, modelo_id = await O.extraer_texto("QUJD", mime_type="image/png")
    assert texto == "Hola mundo", texto
    # get_available_models (fake_pi) sólo marca "image" en input para los
    # modelos anthropic — llamacpp no soporta visión, así que el proceso
    # dedicado de OCR debe elegir uno de los que sí.
    assert modelo_id in ("claude-haiku-4-5", "claude-haiku-4-5-20251001"), modelo_id

    # new_session corre ANTES de fijar el modelo — sesión descartable, sin
    # historial acumulado entre llamadas de OCR.
    assert "new_session" in comandos, comandos
    assert comandos.index("new_session") < comandos.index("set_model"), comandos

    # Segunda llamada: el modelo ya quedó fijado la vez anterior — get_state
    # debe confirmarlo y NO debe volver a pedir set_model.
    comandos.clear()
    texto2, modelo_id2 = await O.extraer_texto("QUJD")
    assert texto2 == "Hola mundo", texto2
    assert modelo_id2 == modelo_id
    assert "set_model" not in comandos, comandos

    await O._proceso.parar()
    print("OK — todos los asserts pasaron")


asyncio.run(main())
