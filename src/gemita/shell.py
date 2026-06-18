# ══════════════════════════════════════════════════════
#  GEMITA SHELL — Shell persistente por sesión
#  Usa bash en Linux, powershell en Windows.
#  El cwd y las variables de entorno se mantienen entre comandos.
#  Usa sentinel para detectar fin de output sin cerrar el proceso.
# ══════════════════════════════════════════════════════

import asyncio
import platform
import subprocess
import uuid


class ShellBash:
    _SENTINEL_BASE = '__GEMITA_EOF__'

    def __init__(self, timeout: int = 30):
        self._proc    = None
        self._lock    = asyncio.Lock()
        self._timeout = timeout
        self._is_win  = platform.system() == 'Windows'

    def _iniciar(self):
        if self._is_win:
            args = ['powershell', '-NoProfile', '-NonInteractive', '-Command', '-']
        else:
            args = ['/bin/bash', '--norc', '--noprofile']
        self._proc = subprocess.Popen(
            args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=None
        )

    def _reiniciar(self):
        try:
            self._proc.terminate()
        except Exception:
            pass
        self._proc = None
        self._iniciar()

    async def ejecutar(self, comando: str) -> dict:
        async with self._lock:
            if not self._proc or self._proc.poll() is not None:
                self._iniciar()

            sentinel   = f'{self._SENTINEL_BASE}_{uuid.uuid4().hex}'
            # Escribimos el comando + un echo de sentinel para saber dónde termina
            bloque = f'{comando}\necho {sentinel}\n'

            loop = asyncio.get_event_loop()

            def _escribir():
                self._proc.stdin.write(bloque)
                self._proc.stdin.flush()

            def _leer():
                lineas = []
                for linea in self._proc.stdout:
                    if sentinel in linea:
                        break
                    lineas.append(linea)
                return ''.join(lineas)

            try:
                await loop.run_in_executor(None, _escribir)
                output = await asyncio.wait_for(
                    loop.run_in_executor(None, _leer),
                    timeout=self._timeout
                )
                return {'ok': True, 'output': output.rstrip('\n')}
            except asyncio.TimeoutError:
                self._reiniciar()
                return {'ok': False, 'output': f'Timeout: superó {self._timeout}s'}
            except Exception as exc:
                self._reiniciar()
                return {'ok': False, 'output': str(exc)}

    async def cwd(self) -> str:
        cmd = '(Get-Location).Path' if self._is_win else 'pwd'
        resultado = await self.ejecutar(cmd)
        return resultado['output'].strip() if resultado['ok'] else '?'

    def cerrar(self):
        if self._proc:
            try:
                self._proc.terminate()
            except Exception:
                pass
            self._proc = None
