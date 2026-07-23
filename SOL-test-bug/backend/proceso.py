# ══════════════════════════════════════════════════════
#  PI PROCESO — subproceso `pi --mode rpc` persistente.
#  JSONL por stdin/stdout: comandos con id → future correlado,
#  eventos sin id → callback on_event. Restart lazy en ensure().
# ══════════════════════════════════════════════════════

import asyncio
import itertools
import json
import logging
import os
import pathlib

from db.auth import TOKEN_INTERNO

from . import config

log = logging.getLogger('aurora.pi')


class PiProceso:
    def __init__(self, on_event=None, argv=None, cwd=None):
        self.on_event = on_event
        self.argv = argv or self._argv_default()
        self.cwd = cwd or config.CWD
        self.proc: asyncio.subprocess.Process | None = None
        self.generacion = 0
        self._futuros: dict[str, asyncio.Future] = {}
        self._ids = itertools.count(1)
        self._spawn_lock = asyncio.Lock()
        self._tareas: list[asyncio.Task] = []

    @staticmethod
    def _argv_default() -> list[str]:
        if config.PI_BIN.lower().endswith(('.cmd', '.bat')):
            # Windows: CreateProcess no ejecuta shims .cmd/.bat directo —
            # van vía cmd.exe, y el shim ya trae su propio runtime.
            argv = ['cmd', '/c', config.PI_BIN, '--mode', 'rpc']
        else:
            argv = [config.RUNTIME, config.PI_BIN, '--mode', 'rpc']
        if config.SESSION_DIR:
            # Sólo si se pidió explícito en config/llm.toml — sin esto pi
            # usa su default real (~/.pi/agent/sessions/), igual que correr
            # `pi` a mano.
            argv += ['--session-dir', config.SESSION_DIR]
        argv += config.EXTRA_ARGS
        return argv

    @property
    def vivo(self) -> bool:
        return self.proc is not None and self.proc.returncode is None

    async def ensure(self):
        async with self._spawn_lock:
            if self.vivo:
                return
            await self._spawn()

    async def _spawn(self):
        if config.SESSION_DIR:
            pathlib.Path(config.SESSION_DIR).mkdir(parents=True, exist_ok=True)
        self.proc = await asyncio.create_subprocess_exec(
            *self.argv,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self.cwd,
            # aurora-tools.ts autentica contra Aurora con este token efímero;
            # sin él, el guard global (post-auditoría) devuelve 401 a las tools.
            env={**os.environ, 'AURORA_TOKEN': TOKEN_INTERNO},
            # get_available_models (y otras respuestas grandes) superan
            # los 64KB default de StreamReader — readline() tira
            # LimitOverrunError sin consumir el buffer, así que el loop de
            # _leer_stdout queda repitiendo el mismo error para siempre:
            # pi sigue vivo pero Aurora nunca vuelve a leer nada de él
            # (cualquier RPC posterior cuelga 30s). pi (docs/rpc.md) no
            # documenta ningún límite de línea — el cliente de ejemplo
            # bufferea sin tope.
            limit=1024 * 1024 * 16,
        )
        self.generacion += 1
        self._tareas = [
            asyncio.create_task(self._leer_stdout(self.proc)),
            asyncio.create_task(self._leer_stderr(self.proc)),
        ]
        log.info('pi rpc arrancado pid=%s gen=%d', self.proc.pid, self.generacion)

    async def _leer_stdout(self, proc):
        while True:
            try:
                # JSONL estricto: solo \n delimita registros (ver docs/rpc.md)
                linea = await proc.stdout.readline()
            except (ValueError, ConnectionResetError) as exc:
                log.warning('pi stdout: %s', exc)
                continue
            if not linea:
                break
            texto = linea.decode('utf-8', 'replace').strip()
            if not texto:
                continue
            try:
                msg = json.loads(texto)
            except ValueError:
                log.warning('pi stdout no-JSON: %.200s', texto)
                continue
            await self._despachar(msg)
        self._marcar_muerto()

    async def _leer_stderr(self, proc):
        while True:
            linea = await proc.stderr.readline()
            if not linea:
                break
            log.warning('pi stderr: %s', linea.decode('utf-8', 'replace').rstrip())

    def _marcar_muerto(self):
        rc = self.proc.returncode if self.proc else None
        log.warning('pi rpc terminó rc=%s', rc)
        for fut in self._futuros.values():
            if not fut.done():
                fut.set_exception(RuntimeError(f'pi terminó (rc={rc})'))
        self._futuros.clear()

    async def _despachar(self, msg: dict):
        if msg.get('type') == 'response':
            if msg.get('id') in self._futuros:
                fut = self._futuros.pop(msg['id'])
                if not fut.done():
                    fut.set_result(msg)
                return
            # Respuesta real de pi para un id que pedir() ya dejó de esperar
            # (encontrado en vivo con /fork: pi contesta success:true, pero
            # Aurora ya se había rendido — bajo qué condición exacta pedir()
            # se rinde antes de que llegue esta línea no se pudo reproducir
            # aislado, ni siquiera simulando llamadas concurrentes de
            # get_session_stats — sólo pasa en el motor compartido real).
            # Antes esto cascaba en silencio total a on_event() de abajo, que
            # tampoco hace nada con type='response' — se perdía sin dejar
            # rastro. Bug real, root cause no confirmado — este log es lo
            # mínimo para no seguir a ciegas la próxima vez que pase.
            log.warning('pi respuesta huérfana (pedir() ya no la esperaba): '
                        'id=%s command=%s success=%s', msg.get('id'),
                        msg.get('command'), msg.get('success'))
            return
        if self.on_event:
            try:
                await self.on_event(msg)
            except Exception:
                log.exception('error manejando evento pi')

    async def enviar(self, cmd: dict):
        await self.ensure()
        data = json.dumps(cmd, ensure_ascii=False) + '\n'
        self.proc.stdin.write(data.encode('utf-8'))
        await self.proc.stdin.drain()

    async def pedir(self, cmd: dict, timeout: float | None = None) -> dict:
        cmd = dict(cmd)
        cid = f'aurora-{next(self._ids)}'
        cmd['id'] = cid
        fut = asyncio.get_running_loop().create_future()
        self._futuros[cid] = fut
        try:
            await self.enviar(cmd)
            return await asyncio.wait_for(fut, timeout or config.TIMEOUT_CMD)
        finally:
            self._futuros.pop(cid, None)

    async def parar(self):
        for t in self._tareas:
            t.cancel()
        self._tareas = []
        if self.vivo:
            self.proc.terminate()
            try:
                await asyncio.wait_for(self.proc.wait(), 5)
            except asyncio.TimeoutError:
                self.proc.kill()
                await self.proc.wait()
        self.proc = None
