import pathlib
import re
import shutil

from litestar import get, post

from .config import SKIP_DIRS, clip
from .workspace import make_backup, rel, safe


@get('/nexus/fs/list')
async def fs_list(path: str = '.') -> dict:
    target = safe(path)
    if not target.is_dir():
        return {'ok': False, 'error': f'No es directorio: {path}'}
    items = []
    for item in sorted(target.iterdir(), key=lambda x: x.name.lower()):
        items.append({
            'name': item.name,
            'path': rel(item),
            'type': 'dir' if item.is_dir() else 'file',
            'size': item.stat().st_size if item.is_file() else 0,
        })
    return {'ok': True, 'path': rel(target), 'entries': items}


@get('/nexus/fs/read')
async def fs_read(path: str) -> dict:
    target = safe(path)
    if not target.is_file():
        return {'ok': False, 'error': f'No es archivo: {path}'}
    content, truncated = clip(target.read_text(encoding='utf-8', errors='replace'))
    return {'ok': True, 'path': rel(target), 'content': content, 'truncated': truncated}


@get('/nexus/fs/head')
async def fs_head(path: str, lines: int = 40) -> dict:
    target = safe(path)
    all_lines = target.read_text(encoding='utf-8', errors='replace').splitlines()
    selected = all_lines[:lines]
    content, truncated = clip('\n'.join(selected))
    return {'ok': True, 'path': rel(target), 'total_lines': len(all_lines), 'content': content, 'truncated': truncated}


@get('/nexus/fs/stat')
async def fs_stat(path: str) -> dict:
    target = safe(path)
    if not target.exists():
        return {'ok': False, 'error': f'No encontrado: {path}'}
    st = target.stat()
    lines = len(target.read_text(encoding='utf-8', errors='replace').splitlines()) if target.is_file() else 0
    return {'ok': True, 'path': rel(target), 'type': 'dir' if target.is_dir() else 'file', 'size': st.st_size, 'lines': lines, 'mtime': st.st_mtime}


@get('/nexus/fs/tree')
async def fs_tree(path: str = '.', depth: int = 3) -> dict:
    root = safe(path)
    lines = [rel(root) or '.']

    def walk(p: pathlib.Path, level: int) -> None:
        if level >= depth:
            return
        try:
            entries = [i for i in sorted(p.iterdir(), key=lambda x: x.name.lower()) if i.name not in SKIP_DIRS]
        except Exception:
            return
        for item in entries[:80]:
            prefix = '  ' * (level + 1)
            lines.append(f'{prefix}{item.name}/' if item.is_dir() else f'{prefix}{item.name}')
            if item.is_dir():
                walk(item, level + 1)

    walk(root, 0)
    content, truncated = clip('\n'.join(lines))
    return {'ok': True, 'content': content, 'truncated': truncated}


@get('/nexus/fs/grep')
async def fs_grep(pattern: str, path: str = '.', max_results: int = 40, names_only: bool = False) -> dict:
    root = safe(path)
    results: list[str] = []
    for fp in root.rglob('*'):
        if len(results) >= max_results:
            break
        try:
            parts = fp.relative_to(root).parts
            if any(part in SKIP_DIRS for part in parts):
                continue
            if not fp.is_file() or fp.stat().st_size > 500_000:
                continue
            if names_only:
                if re.search(pattern, fp.name):
                    results.append(rel(fp))
            else:
                for n, line in enumerate(fp.read_text(encoding='utf-8', errors='replace').splitlines(), 1):
                    if pattern in line:
                        results.append(f'{rel(fp)}:{n}: {line[:240]}')
                        if len(results) >= max_results:
                            break
        except Exception:
            continue
    return {'ok': True, 'content': '\n'.join(results) or '(sin resultados)', 'count': len(results)}


@post('/nexus/fs/write')
async def fs_write(data: dict) -> dict:
    target = safe(data.get('path', ''))
    content = str(data.get('content') or '')
    backup = make_backup(target, 'write') if target.exists() and target.is_file() else None
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')
    out = {'ok': True, 'path': rel(target), 'bytes': len(content.encode())}
    if backup:
        out['backup'] = str(backup)
    return out


@post('/nexus/fs/patch')
async def fs_patch(data: dict) -> dict:
    target = safe(data.get('path', ''))
    old = str(data.get('old') or '')
    new = str(data.get('new') or '')
    content = target.read_text(encoding='utf-8')
    if old not in content:
        return {'ok': False, 'error': 'Texto no encontrado'}
    count = content.count(old)
    if count > 1:
        return {'ok': False, 'error': f'Texto ambiguo — aparece {count} veces'}
    backup = make_backup(target, 'patch')
    target.write_text(content.replace(old, new, 1), encoding='utf-8')
    out = {'ok': True, 'path': rel(target)}
    if backup:
        out['backup'] = str(backup)
    return out


@post('/nexus/fs/delete')
async def fs_delete(data: dict) -> dict:
    target = safe(data.get('path', ''))
    if not target.exists():
        return {'ok': False, 'error': f'No encontrado: {data.get("path")}'}
    backup = make_backup(target, 'delete') if target.is_file() else None
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()
    out = {'ok': True, 'path': rel(target)}
    if backup:
        out['backup'] = str(backup)
    return out


@post('/nexus/fs/move')
async def fs_move(data: dict) -> dict:
    src_s = data.get('from') or data.get('src')
    dst_s = data.get('to') or data.get('dst')
    if not src_s or not dst_s:
        return {'ok': False, 'error': 'Faltan from/to'}
    src = safe(src_s)
    dst = safe(dst_s)
    if not src.exists():
        return {'ok': False, 'error': f'No encontrado: {src_s}'}
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dst))
    return {'ok': True, 'from': rel(src), 'to': rel(dst)}


@post('/nexus/fs/mkdir')
async def fs_mkdir(data: dict) -> dict:
    target = safe(data.get('path', ''))
    target.mkdir(parents=True, exist_ok=True)
    return {'ok': True, 'path': rel(target)}


FS_ROUTES = [fs_list, fs_read, fs_head, fs_stat, fs_tree, fs_grep, fs_write, fs_patch, fs_delete, fs_move, fs_mkdir]
