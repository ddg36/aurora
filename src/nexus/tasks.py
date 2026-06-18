import asyncio
import os
import platform
import signal
import subprocess
import time
import uuid

from litestar import get, post
from litestar.response.sse import ServerSentEvent

from .config import clip

_IS_WIN = platform.system() == 'Windows'

_jobs: dict[str, 'Job'] = {}
_retained = 50


class Job:
    def __init__(self, cmd: str, cwd: str = '.', origin: dict | None = None):
        self.id = uuid.uuid4().hex[:8]
        self.cmd = cmd
        self.cwd = cwd
        self.origin = origin or {}
        self.status = 'running'
        self.pid: int | None = None
        self.exit_code: int | None = None
        self.stdout = ''
        self.stderr = ''
        self.start_time = time.time()
        self.end_time: float | None = None
        self._proc: asyncio.subprocess.Process | None = None
        self._queue: asyncio.Queue[tuple[str, str, bool]] = asyncio.Queue()
        self._done = asyncio.Event()

    @property
    def duration(self) -> float:
        return (self.end_time or time.time()) - self.start_time

    async def _read(self, stream: asyncio.StreamReader, name: str) -> None:
        while True:
            line = await stream.readline()
            if not line:
                break
            decoded = line.decode('utf-8', errors='replace')
            if name == 'stdout':
                self.stdout += decoded
            else:
                self.stderr += decoded
            await self._queue.put((name, decoded, False))

    async def run(self) -> dict:
        shell_args = ['powershell', '-NoProfile', '-NonInteractive', '-Command', self.cmd] if _IS_WIN else ['bash', '-lc', self.cmd]
        self._proc = await asyncio.create_subprocess_exec(
            *shell_args,
            cwd=self.cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=not _IS_WIN,
        )
        self.pid = self._proc.pid
        await asyncio.gather(
            self._read(self._proc.stdout, 'stdout'),
            self._read(self._proc.stderr, 'stderr'),
        )
        await self._proc.wait()
        self.exit_code = self._proc.returncode
        self.end_time = time.time()
        if self.status == 'running':
            self.status = 'done' if self.exit_code == 0 else 'errored'
        self._done.set()
        await self._queue.put(('', '', True))
        return self.to_dict()

    def kill(self) -> bool:
        if not self._proc or self.status != 'running':
            return False
        self.status = 'killed'
        self.end_time = time.time()
        try:
            if _IS_WIN:
                subprocess.run(['taskkill', '/F', '/T', '/PID', str(self._proc.pid)],
                               capture_output=True, timeout=5)
            else:
                pgid = os.getpgid(self._proc.pid)
                os.killpg(pgid, signal.SIGTERM)
                asyncio.create_task(self._force_kill_after(pgid, 0.5))
        except (ProcessLookupError, PermissionError, OSError):
            pass
        return True

    async def _force_kill_after(self, pgid: int, delay: float) -> None:
        if _IS_WIN:
            return
        await asyncio.sleep(delay)
        try:
            os.killpg(pgid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError, OSError):
            pass

    def to_dict(self) -> dict:
        out, _ = clip(self.stdout)
        err, _ = clip(self.stderr)
        return {
            'id': self.id,
            'cmd': self.cmd,
            'status': self.status,
            'pid': self.pid,
            'exit_code': self.exit_code,
            'stdout': out,
            'stderr': err,
            'start_time': self.start_time,
            'end_time': self.end_time,
            'duration': round(self.duration, 1),
            'origin': self.origin,
        }

    def to_dict_short(self) -> dict:
        return {
            'id': self.id,
            'cmd': self.cmd[:120],
            'status': self.status,
            'pid': self.pid,
            'exit_code': self.exit_code,
            'duration': round(self.duration, 1),
            'start_time': self.start_time,
            'end_time': self.end_time,
            'origin': self.origin,
        }


def create_job(cmd: str, cwd: str = '.', origin: dict | None = None) -> Job:
    job = Job(cmd, cwd, origin)
    _jobs[job.id] = job
    _trim_old()
    return job


def get_job(job_id: str) -> Job | None:
    return _jobs.get(job_id)


def _trim_old():
    done = [j for j in _jobs.values() if j.status != 'running']
    if len(done) > _retained:
        for j in sorted(done, key=lambda x: x.end_time or 0)[:-_retained]:
            _jobs.pop(j.id, None)


# ── Routes ────────────────────────────────────────────────

@get('/nexus/tasks')
async def list_tasks() -> dict:
    running = {jid: j.to_dict_short() for jid, j in _jobs.items() if j.status == 'running'}
    done = {jid: j.to_dict_short() for jid, j in _jobs.items() if j.status != 'running'}
    return {'running': running, 'done': done}


@post('/nexus/tasks/{job_id:str}/kill')
async def kill_task(job_id: str) -> dict:
    job = _jobs.get(job_id)
    if not job:
        return {'ok': False, 'error': 'Job not found'}
    if job.status != 'running':
        return {'ok': False, 'error': f'Job is {job.status}, not running'}
    ok = job.kill()
    return {'ok': ok, 'job_id': job_id, 'status': job.status}


@post('/nexus/tasks/{job_id:str}/forget')
async def forget_task(job_id: str) -> dict:
    job = _jobs.pop(job_id, None)
    return {'ok': job is not None}


@get('/nexus/tasks/{job_id:str}/stream')
async def task_stream(job_id: str) -> ServerSentEvent:
    job = _jobs.get(job_id)
    if not job:
        return {'ok': False, 'error': 'Job not found'}

    async def event_stream():
        done = job._done.is_set()
        last_out = 0
        last_err = 0
        while not done or last_out < len(job.stdout) or last_err < len(job.stderr):
            try:
                name, text, is_done = await asyncio.wait_for(job._queue.get(), timeout=2)
                if is_done:
                    done = True
                    break
                yield {'data': f'{name}:{text}', 'event': 'output'}
                if name == 'stdout':
                    last_out += len(text)
                else:
                    last_err += len(text)
            except asyncio.TimeoutError:
                done = job._done.is_set()

        yield {'data': 'complete', 'event': 'done'}

    return ServerSentEvent(content=event_stream())


TASKS_ROUTES = [list_tasks, kill_task, forget_task, task_stream]
