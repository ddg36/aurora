const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)(?:[?#].*)?$/i;
const MD_RE = /\.md(?:[?#].*)?$/i;
const TYPE_ORDER = { file: 0, heading: 1, tag: 2, task: 3, 'task-done': 3, image: 4, asset: 4, wikilink: 5, 'markdown-link': 5, external: 6, code: 4, table: 4, missing: 7 };
const TYPE_LABEL = { file: 'Archivo', heading: 'Sección', tag: 'Tag', task: 'Tarea', 'task-done': 'Tarea hecha', image: 'Imagen', asset: 'Archivo', code: 'Código', table: 'Tabla', wikilink: 'Wikilink', 'markdown-link': 'Link', external: 'Externo', missing: 'Faltante' };

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

export function compact(value, max = 72) {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, Math.max(0, max - 1)) + '…' : s;
}

export function lineOfIndex(text, index) {
  return String(text || '').slice(0, Math.max(0, index)).split('\n').length;
}

export function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[`*_~[\]()>#|]/g, '')
    .replace(/&[a-z0-9#]+;/gi, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'seccion';
}

export function safeDecodeUriComponent(value) {
  const raw = String(value ?? '');
  try { return decodeURIComponent(raw); } catch { return raw; }
}

export function stripAngleBrackets(value) {
  const s = String(value ?? '').trim();
  return s.startsWith('<') && s.endsWith('>') ? s.slice(1, -1).trim() : s;
}

export function stripFencedCode(text) {
  const input = String(text ?? '');
  return input.replace(/(^|\n)(```|~~~)[^\n]*\n[\s\S]*?(\n\2\s*(?=\n|$))/g, match => match.replace(/[^\n]/g, ' '));
}

export function stripTitleFromHref(href) {
  return stripAngleBrackets(String(href ?? '').trim().replace(/\s+["'][^"']*["']\s*$/, '').trim());
}

export function splitHref(href) {
  const raw = stripTitleFromHref(href);
  const hashAt = raw.indexOf('#');
  const queryAt = raw.indexOf('?');
  let cut = raw.length;
  if (hashAt >= 0) cut = Math.min(cut, hashAt);
  if (queryAt >= 0) cut = Math.min(cut, queryAt);
  const target = safeDecodeUriComponent(raw.slice(0, cut));
  const suffix = raw.slice(cut);
  const hash = hashAt >= 0 ? safeDecodeUriComponent(raw.slice(hashAt + 1).split(/[?&]/)[0]) : '';
  return { raw, target, suffix, hash };
}

export function parseWikiLink(inner) {
  let raw = String(inner ?? '').trim();
  let alias = '';
  const pipe = raw.indexOf('|');
  if (pipe >= 0) {
    alias = raw.slice(pipe + 1).trim();
    raw = raw.slice(0, pipe).trim();
  }
  let target = raw;
  let heading = '';
  const hash = raw.indexOf('#');
  if (hash >= 0) {
    target = raw.slice(0, hash).trim();
    heading = raw.slice(hash + 1).trim();
  }
  return { raw, target, heading, alias };
}

export function sanitizeMissingName(value) {
  return String(value || 'Nueva nota')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Nueva nota';
}

export function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .replace(/^\.\//, '')
    .toLowerCase();
}

export function posixBasename(path) {
  return String(path ?? '').split('/').filter(Boolean).pop() || '';
}

export function posixDirname(path) {
  const parts = String(path ?? '').split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

export function joinPaths(...parts) {
  const out = [];
  for (const part of parts) {
    for (const p of String(part ?? '').split('/')) {
      if (!p || p === '.') continue;
      if (p === '..') out.pop();
      else out.push(p);
    }
  }
  return out.join('/');
}

export function findHeadingByHash(headings, hash) {
  const wanted = safeDecodeUriComponent(String(hash ?? '').trim());
  if (!wanted) return null;
  const wantedSlug = slugify(wanted);
  const wantedLower = wanted.toLowerCase();
  return (headings || []).find(h => h.slug === wantedSlug || String(h.title ?? '').toLowerCase() === wantedLower) || null;
}

export function indexHeadings(text) {
  const headings = [];
  const usedSlugs = new Map();
  const re = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const level = m[1].length;
    const title = m[2].trim();
    const baseSlug = slugify(title);
    const seen = usedSlugs.get(baseSlug) || 0;
    usedSlugs.set(baseSlug, seen + 1);
    const slug = seen ? `${baseSlug}-${seen}` : baseSlug;
    headings.push({ level, title, slug, line: lineOfIndex(text, m.index), id: `md-heading-${slug}` });
  }
  return headings;
}

export function makeFileIndex(files) {
  const byKey = new Map();
  const basename = new Map();
  for (const file of files || []) {
    const rel = String(file.path || file).replace(/\\/g, '/');
    const noExt = rel.replace(/\.md$/i, '');
    const base = posixBasename(noExt);
    const variants = [rel, noExt, base, base + '.md'].map(normalizeKey);
    for (const key of variants) {
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, rel);
      else if (basename.has(key)) basename.set(key, null);
    }
    if (!basename.has(normalizeKey(base))) basename.set(normalizeKey(base), rel);
    else basename.set(normalizeKey(base), null);
  }
  return { byKey, basename };
}

export function resolveWikiTarget(target, sourcePath, fileIndex) {
  const clean = safeDecodeUriComponent(String(target ?? '').trim()).replace(/\\/g, '/').replace(/\.md$/i, '');
  if (!clean) return sourcePath;
  const directKeys = [clean, clean + '.md'].map(normalizeKey);
  for (const key of directKeys) {
    const found = fileIndex.byKey.get(key) || fileIndex.basename.get(key);
    if (found) return found;
  }
  return null;
}

export function resolveMarkdownHref(href, sourcePath, fileIndex) {
  const { raw, target, hash } = splitHref(href);
  if (!raw || raw.startsWith('#')) return { kind: 'anchor', uri: sourcePath, hash, raw };
  if (/^(https?:|mailto:|ftp:|vscode:|command:)/i.test(raw) || raw.startsWith('//')) return { kind: 'external', raw };
  if (IMAGE_RE.test(target)) return { kind: 'image', raw, target };
  if (!MD_RE.test(target) && /\.[a-z0-9]+$/i.test(target)) return { kind: 'file', raw, target };

  const baseDir = posixDirname(sourcePath);
  const withExt = target && !/\.md$/i.test(target) ? target + '.md' : target;
  const relUri = withExt ? joinPaths(baseDir, withExt) : null;

  if (relUri && fileIndex.byKey.has(normalizeKey(relUri))) {
    return { kind: 'note', uri: fileIndex.byKey.get(normalizeKey(relUri)), hash, raw };
  }

  const wiki = resolveWikiTarget(target, sourcePath, fileIndex);
  if (wiki) return { kind: 'note', uri: wiki, hash, raw };
  return { kind: 'missing', raw, target: target || raw, hash };
}

export function parseMarkdownFile(path, text, fileIndex, headingIndex) {
  const rel = String(path || '').replace(/\\/g, '/');
  const fileId = `file:${rel}`;
  const nodes = [];
  const edges = [];
  const addNode = node => nodes.push(node);
  const addEdge = edge => edges.push(edge);

  addNode({ id: fileId, type: 'file', label: posixBasename(rel), path: rel, uri: rel, detail: rel });

  const headings = headingIndex.get(rel) || [];
  const headingBySlug = new Map(headings.map(h => [h.slug, h]));
  const headingForLine = line => {
    let current = null;
    for (const heading of headings) {
      if (heading.line <= line) current = heading;
      else break;
    }
    return current;
  };
  const sourceForLine = line => {
    const heading = headingForLine(line);
    return heading ? `heading:${rel}#${heading.slug}` : fileId;
  };

  const parseText = stripFencedCode(text);

  for (const h of headings) {
    const hId = `heading:${rel}#${h.slug}`;
    addNode({ id: hId, type: 'heading', label: h.title, level: h.level, line: h.line + 1, path: rel, uri: rel, slug: h.slug, detail: `${rel}:${h.line + 1}` });
    addEdge({ from: fileId, to: hId, type: 'heading', label: `h${h.level}`, sourceLine: h.line + 1 });
  }

  const wikiRe = /\[\[([^\]]+)\]\]/g;
  let wm;
  while ((wm = wikiRe.exec(parseText))) {
    const parsed = parseWikiLink(wm[1]);
    const line = lineOfIndex(parseText, wm.index) + 1;
    const from = sourceForLine(line);
    const targetUri = resolveWikiTarget(parsed.target, rel, fileIndex);
    let to;
    let label = parsed.alias || parsed.target || parsed.heading || parsed.raw;
    if (targetUri) {
      const targetKey = targetUri;
      const targetHeading = parsed.heading ? findHeadingByHash(headingIndex.get(targetKey) || [], parsed.heading) : null;
      to = targetHeading ? `heading:${targetKey}#${targetHeading.slug}` : `file:${targetKey}`;
    } else {
      const missingName = parsed.target || parsed.raw;
      to = 'missing:' + normalizeKey(missingName);
      addNode({ id: to, type: 'missing', label: missingName, missingTarget: missingName, detail: `Nota enlazada pero no encontrada: ${missingName}` });
    }
    addEdge({ from, to, type: 'wikilink', label, sourceLine: line, raw: wm[0] });
  }

  const mdLinkRe = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;
  let lm;
  while ((lm = mdLinkRe.exec(parseText))) {
    const isImage = lm[1] === '!';
    const line = lineOfIndex(parseText, lm.index) + 1;
    const from = sourceForLine(line);
    const alt = lm[2] || '';
    const href = lm[3] || '';
    if (isImage) {
      const id = `image:${rel}:${line}:${href}`;
      addNode({ id, type: 'image', label: compact(alt || posixBasename(splitHref(href).target || href), 48), href, path: rel, uri: rel, line, detail: `Imagen en ${rel}:${line}` });
      addEdge({ from, to: id, type: 'image', label: alt || 'imagen', sourceLine: line });
      continue;
    }
    const resolved = resolveMarkdownHref(href, rel, fileIndex);
    let to;
    if (resolved.kind === 'external') {
      to = 'external:' + resolved.raw;
      addNode({ id: to, type: 'external', label: compact(resolved.raw, 44), href: resolved.raw, detail: resolved.raw });
    } else if (resolved.kind === 'anchor') {
      const h = findHeadingByHash(headingIndex.get(rel) || [], resolved.hash);
      to = h ? `heading:${rel}#${h.slug}` : fileId;
    } else if (resolved.kind === 'note') {
      const targetKey = resolved.uri;
      const h = resolved.hash ? findHeadingByHash(headingIndex.get(targetKey) || [], resolved.hash) : null;
      to = h ? `heading:${targetKey}#${h.slug}` : `file:${targetKey}`;
    } else if (resolved.kind === 'file' || resolved.kind === 'image') {
      to = `asset:${rel}:${line}:${resolved.raw}`;
      addNode({ id: to, type: resolved.kind === 'image' ? 'image' : 'asset', label: compact(posixBasename(resolved.target || resolved.raw), 44), href: resolved.raw, detail: resolved.raw });
    } else {
      const name = resolved.target || resolved.raw;
      to = 'missing:' + normalizeKey(name);
      addNode({ id: to, type: 'missing', label: name, missingTarget: name, detail: `Nota enlazada pero no encontrada: ${name}` });
    }
    addEdge({ from, to, type: 'markdown-link', label: alt || href, sourceLine: line, raw: lm[0] });
  }

  const codeRe = /^(```|~~~)([^\n`]*)\n[\s\S]*?^\1\s*(?=\n|$)/gm;
  let codeBlock;
  while ((codeBlock = codeRe.exec(text))) {
    const line = lineOfIndex(parseText, codeBlock.index) + 1;
    const lang = (codeBlock[2] || 'código').trim() || 'código';
    const id = `code:${rel}:${line}:${lang}`;
    addNode({ id, type: 'code', label: lang, path: rel, uri: rel, line, detail: `Bloque de código ${lang} en ${rel}:${line}` });
    addEdge({ from: sourceForLine(line), to: id, type: 'code', label: lang, sourceLine: line });
  }

  const tableRe = /^\s*\|.+\|\s*\n\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/gm;
  let tableBlock;
  while ((tableBlock = tableRe.exec(parseText))) {
    const line = lineOfIndex(parseText, tableBlock.index) + 1;
    const id = `table:${rel}:${line}`;
    addNode({ id, type: 'table', label: `Tabla línea ${line}`, path: rel, uri: rel, line, detail: `Tabla Markdown en ${rel}:${line}` });
    addEdge({ from: sourceForLine(line), to: id, type: 'table', label: 'tabla', sourceLine: line });
  }

  const tagRe = /(^|\s)#([\p{L}\p{N}_/-]{2,})/gu;
  let tm;
  while ((tm = tagRe.exec(parseText))) {
    const before = tm[1] || '';
    if (before === '') {
      const lineStart = parseText.lastIndexOf('\n', tm.index) + 1;
      const prefix = parseText.slice(lineStart, tm.index).trim();
      if (!prefix && parseText.slice(tm.index, tm.index + 2) === '# ') continue;
    }
    const tag = tm[2];
    const line = lineOfIndex(parseText, tm.index) + 1;
    const id = 'tag:#' + tag.toLowerCase();
    addNode({ id, type: 'tag', label: '#' + tag, tag: '#' + tag, detail: `Etiqueta #${tag}` });
    addEdge({ from: sourceForLine(line), to: id, type: 'tag', label: '#' + tag, sourceLine: line });
  }

  const taskRe = /^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/gm;
  let task;
  let taskIndex = 0;
  while ((task = taskRe.exec(parseText))) {
    const line = lineOfIndex(parseText, task.index) + 1;
    const done = /x/i.test(task[1]);
    const id = `task:${rel}:${line}:${taskIndex++}`;
    addNode({ id, type: done ? 'task-done' : 'task', label: compact(task[2], 60), uri: rel, path: rel, line, detail: `${done ? 'Tarea completada' : 'Tarea pendiente'} en ${rel}:${line}` });
    addEdge({ from: sourceForLine(line), to: id, type: 'task', label: done ? 'hecha' : 'pendiente', sourceLine: line });
  }

  return { nodes, edges, headings: headings.map(h => ({ ...h, line: h.line + 1 })) };
}

export function uniqueGraph(parts) {
  const nodes = new Map();
  const edges = new Map();
  for (const part of parts) {
    for (const node of part.nodes) {
      const prev = nodes.get(node.id);
      if (prev) {
        prev.count = (prev.count || 1) + 1;
        if (!prev.uri && node.uri) prev.uri = node.uri;
        if (!prev.path && node.path) prev.path = node.path;
      } else {
        nodes.set(node.id, { ...node, count: node.count || 1 });
      }
    }
    for (const edge of part.edges) {
      if (!edge.from || !edge.to || edge.from === edge.to) continue;
      const key = `${edge.from}\u0000${edge.to}\u0000${edge.type}`;
      const prev = edges.get(key);
      if (prev) prev.count = (prev.count || 1) + 1;
      else edges.set(key, { ...edge, id: key, count: 1 });
    }
  }
  const nodeList = Array.from(nodes.values());
  const degree = new Map();
  for (const edge of edges.values()) {
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  }
  for (const node of nodeList) node.degree = degree.get(node.id) || 0;
  return { nodes: nodeList, edges: Array.from(edges.values()) };
}

export function buildWorkspaceGraph(files, texts, activePath) {
  const fileIndex = makeFileIndex(files);
  const headingIndex = new Map();
  for (const file of files) {
    const text = texts.get(file.path) || '';
    headingIndex.set(file.path, indexHeadings(text));
  }
  const parts = files.map(file => parseMarkdownFile(file.path, texts.get(file.path) || '', fileIndex, headingIndex));
  const graph = uniqueGraph(parts);
  const stats = {
    files: files.length,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    tags: graph.nodes.filter(n => n.type === 'tag').length,
    missing: graph.nodes.filter(n => n.type === 'missing').length,
    external: graph.nodes.filter(n => n.type === 'external').length,
    tasks: graph.nodes.filter(n => n.type === 'task' || n.type === 'task-done').length,
  };
  return { ...graph, stats, activePath: activePath || null };
}

export function parseDocument(path, text, fileIndexOverride = null, headingIndexOverride = null) {
  const files = fileIndexOverride ? [{ path }] : [{ path, name: posixBasename(path), type: 'file', size: text.length }];
  const fileIndex = fileIndexOverride || makeFileIndex(files);
  const headingIndex = headingIndexOverride || new Map([[path, indexHeadings(text)]]);
  const parsed = parseMarkdownFile(path, text, fileIndex, headingIndex);
  return { ...parsed, stats: { files: fileIndexOverride ? fileIndex.byKey.size : 1, nodes: parsed.nodes.length, edges: parsed.edges.length } };
}

export function extractFrontmatter(text) {
  const src = String(text ?? '');
  if (!src.startsWith('---\n')) return null;
  const end = src.indexOf('\n---', 4);
  if (end < 0) return null;
  const raw = src.slice(4, end).trim();
  const data = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (m) data[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return { raw, data, endLine: src.slice(0, end + 4).split('\n').length };
}

export function renderMarkdown(text, path = '', fileIndexOverride = null, headingIndexOverride = null) {
  const fm = extractFrontmatter(text);
  const body = fm ? text.slice(fm.endLine).replace(/^\n/, '') : text;
  const parsed = parseDocument(path, text, fileIndexOverride, headingIndexOverride);
  const headings = indexHeadings(text);
  const fileIndex = fileIndexOverride || makeFileIndex([{ path, name: posixBasename(path), type: 'file', size: text.length }]);
  const headingIndex = headingIndexOverride || new Map([[path, headings]]);
  const html = renderMarkdownBody(body, fm ? fm.endLine : 0, path, fileIndex, headingIndex);
  const tasks = parsed.nodes.filter(n => n.type === 'task' || n.type === 'task-done');
  const tags = parsed.nodes.filter(n => n.type === 'tag');
  const images = parsed.nodes.filter(n => n.type === 'image');
  const missing = parsed.nodes.filter(n => n.type === 'missing');
  const external = parsed.nodes.filter(n => n.type === 'external');
  const links = parsed.edges.filter(e => e.type === 'wikilink' || e.type === 'markdown-link');
  return {
    html,
    headings,
    tasks,
    tags,
    images,
    missing,
    external,
    links,
    frontmatter: fm,
    parsed,
  };
}

function renderMarkdownBody(body, offset, path, fileIndex, headingIndex) {
  const lines = String(body ?? '').split('\n');
  const parts = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const lineNo = offset + i + 1;
    const blank = !line.trim();
    if (blank) {
      parts.push('<div class="markdown-line-gap"></div>');
      i++;
      continue;
    }

    const fence = line.match(/^(```|~~~)(\w+)?/);
    if (fence) {
      const lang = fence[2] || '';
      const code = [];
      i++;
      while (i < lines.length && !new RegExp('^' + fence[1].replace(/[~`]/g, '\\$&') + '\\s*$').test(lines[i])) {
        code.push(lines[i++]);
      }
      if (i < lines.length) i++;
      const langLabel = lang || 'código';
      parts.push(`<div class="markdown-code-wrap" data-md-line="${lineNo}"><div class="markdown-code-head"><span>${escapeHtml(langLabel)}</span><span>línea ${lineNo}</span></div><pre class="markdown-code"><code class="language-${escapeAttr(lang)}">${escapeHtml(code.join('\n'))}</code></pre></div>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2].trim();
      const id = `md-heading-${slugify(title)}`;
      parts.push(`<h${level} id="${escapeAttr(id)}" class="markdown-heading" data-md-heading-id="${escapeAttr(id)}" data-md-line="${lineNo}">${inlineMarkdown(title, path, fileIndex, headingIndex)}</h${level}>`);
      i++;
      continue;
    }

    const task = line.match(/^(\s*)([-*+])\s+\[([ xX])\]\s+(.+)$/);
    if (task) {
      const done = /x/i.test(task[3]);
      const label = inlineMarkdown(task[4], path, fileIndex, headingIndex);
      parts.push(`<div class="markdown-task" data-md-line="${lineNo}" data-md-done="${done ? '1' : '0'}"><input type="checkbox" data-md-action="toggle-task" data-md-line="${lineNo}" ${done ? 'checked' : ''}><span>${label}</span></div>`);
      i++;
      continue;
    }

    const list = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
    if (list) {
      const ordered = /^\d+\.$/.test(list[2]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
        if (!m) break;
        items.push(`<li data-md-line="${offset + i + 1}">${inlineMarkdown(m[3], path, fileIndex, headingIndex)}</li>`);
        i++;
      }
      parts.push(`<${ordered ? 'ol' : 'ul'} class="markdown-list">${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }

    if (line.trimStart().startsWith('>')) {
      const quote = [];
      while (i < lines.length && lines[i].trimStart().startsWith('>')) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      parts.push(`<blockquote class="markdown-quote" data-md-line="${lineNo}">${quote.map(q => `<p>${inlineMarkdown(q, path, fileIndex, headingIndex)}</p>`).join('')}</blockquote>`);
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      const rows = [];
      const headers = line.split('|').map(c => c.trim()).filter((_, idx, arr) => !(idx === 0 && arr[0] === '') && !(idx === arr.length - 1 && arr[arr.length - 1] === ''));
      i += 2;
      while (i < lines.length && lines[i].includes('|')) {
        const cells = lines[i].split('|').map(c => c.trim()).filter((_, idx, arr) => !(idx === 0 && arr[0] === '') && !(idx === arr.length - 1 && arr[arr.length - 1] === ''));
        rows.push(`<tr data-md-line="${offset + i + 1}">${(cells.length ? cells : headers.map(() => '')).map(c => `<td>${inlineMarkdown(c, path, fileIndex, headingIndex)}</td>`).join('')}</tr>`);
        i++;
      }
      parts.push(`<div class="markdown-table-wrap"><table class="markdown-table" data-md-line="${lineNo}"><thead><tr>${headers.map(h => `<th>${inlineMarkdown(h, path, fileIndex, headingIndex)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`);
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim()) {
      paragraph.push(lines[i]);
      i++;
    }
    parts.push(`<p class="markdown-paragraph" data-md-line="${lineNo}">${inlineMarkdown(paragraph.join(' '), path, fileIndex, headingIndex)}</p>`);
  }
  return parts.join('\n');
}

function inlineMarkdown(text, path, fileIndex, headingIndex) {
  let s = escapeHtml(String(text ?? ''));
  s = s
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, href) => renderImage(alt, href, path, fileIndex))
    .replace(/\[\[([^\]]+)\]\]/g, (_m, inner) => renderWikiLink(inner, path, fileIndex, headingIndex))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => renderMarkdownLink(label, href, path, fileIndex, headingIndex))
    .replace(/(^|\s)#([\p{L}\p{N}_/-]{2,})/gu, '$1<span class="markdown-chip">#' + '$2' + '</span>')
    .replace(/`([^`]+)`/g, '<code class="markdown-inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  return s;
}

function renderImage(alt, href, path, fileIndex) {
  const resolved = resolveMarkdownHref(href, path, fileIndex);
  const label = alt || posixBasename(resolved.target || href) || 'imagen';
  if (resolved.kind === 'external') return `<img class="markdown-img" src="${escapeAttr(href)}" alt="${escapeAttr(label)}">`;
  return `<button type="button" class="markdown-image-link" data-md-action="open-link" data-md-href="${escapeAttr(href)}">${escapeHtml(label)}</button>`;
}

function renderWikiLink(inner, path, fileIndex, headingIndex) {
  const parsed = parseWikiLink(inner);
  const targetUri = resolveWikiTarget(parsed.target, path, fileIndex);
  const label = parsed.alias || parsed.target || parsed.heading || parsed.raw;
  if (!targetUri) {
    return `<button type="button" class="markdown-missing-link" data-md-action="open-link" data-md-href="${escapeAttr(parsed.raw)}">${escapeHtml(label)}</button>`;
  }
  const targetHeading = parsed.heading ? findHeadingByHash(headingIndex.get(targetUri) || [], parsed.heading) : null;
  return `<button type="button" class="markdown-link" data-md-action="open-link" data-md-target="${escapeAttr(targetUri)}" data-md-hash="${escapeAttr(parsed.heading)}" data-md-heading-id="${escapeAttr(targetHeading?.id || '')}">${escapeHtml(label)}</button>`;
}

function renderMarkdownLink(label, href, path, fileIndex, headingIndex) {
  const resolved = resolveMarkdownHref(href, path, fileIndex);
  if (resolved.kind === 'external') return `<a class="markdown-external" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  if (resolved.kind === 'anchor') {
    const h = findHeadingByHash(headingIndex.get(path) || [], resolved.hash);
    return `<button type="button" class="markdown-link" data-md-action="jump-heading" data-md-heading-id="${escapeAttr(h?.id || '')}">${escapeHtml(label)}</button>`;
  }
  if (resolved.kind === 'note') {
    const targetHeading = resolved.hash ? findHeadingByHash(headingIndex.get(resolved.uri) || [], resolved.hash) : null;
    return `<button type="button" class="markdown-link" data-md-action="open-link" data-md-target="${escapeAttr(resolved.uri)}" data-md-hash="${escapeAttr(resolved.hash)}" data-md-heading-id="${escapeAttr(targetHeading?.id || '')}">${escapeHtml(label)}</button>`;
  }
  if (resolved.kind === 'missing') {
    return `<button type="button" class="markdown-missing-link" data-md-action="open-link" data-md-href="${escapeAttr(href)}">${escapeHtml(label)}</button>`;
  }
  return `<button type="button" class="markdown-link" data-md-action="open-link" data-md-href="${escapeAttr(href)}">${escapeHtml(label)}</button>`;
}

export function layoutGraph(graph, width = 900, height = 620) {
  const nodes = (graph?.nodes || []).slice().sort((a, b) => (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99) || String(a.label).localeCompare(String(b.label)));
  const groups = new Map();
  for (const node of nodes) {
    const key = node.type || 'node';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(node);
  }
  const groupKeys = Array.from(groups.keys()).sort((a, b) => (TYPE_ORDER[a] ?? 99) - (TYPE_ORDER[b] ?? 99));
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.38;
  const placed = new Map();
  let angle = -Math.PI / 2;
  groupKeys.forEach((type, i) => {
    const list = groups.get(type);
    const count = list.length;
    const start = angle;
    const span = groupKeys.length === 1 ? Math.PI * 2 : Math.PI * 1.55;
    list.forEach((node, j) => {
      const t = count <= 1 ? 0 : j / (count - 1);
      const a = start + t * span;
      const jitter = ((node.id.length * 17) % 23) / 23 - 0.5;
      const r = radius + jitter * 48;
      const x = Math.round(cx + Math.cos(a) * r - 80);
      const y = Math.round(cy + Math.sin(a) * r - 32);
      placed.set(node.id, { ...node, x: Math.max(12, Math.min(width - 180, x)), y: Math.max(12, Math.min(height - 70, y)) });
    });
    angle += span + 0.08;
  });
  const file = nodes.find(n => n.type === 'file');
  if (file && placed.has(file.id)) {
    const p = placed.get(file.id);
    placed.set(file.id, { ...p, x: 18, y: Math.round(height / 2 - 28) });
  }
  return { nodes: Array.from(placed.values()), edges: graph?.edges || [], width, height };
}

export function renderGraphHtml(graph, options = {}) {
  const allowed = new Set(options.types || []);
  const query = String(options.query || '').trim().toLowerCase();
  const nodes = (graph?.nodes || []).filter(n => (allowed.size ? allowed.has(n.type) : true) && (!query || `${n.label} ${n.detail} ${n.path || ''}`.toLowerCase().includes(query)));
  const ids = new Set(nodes.map(n => n.id));
  const edges = (graph?.edges || []).filter(e => ids.has(e.from) && ids.has(e.to));
  const layout = layoutGraph({ nodes, edges }, options.width || 900, options.height || 620);
  const nodeMap = new Map(layout.nodes.map(n => [n.id, n]));
  const edgeHtml = layout.edges.map(edge => {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) return '';
    const x1 = from.x + 140;
    const y1 = from.y + 30;
    const x2 = to.x;
    const y2 = to.y + 30;
    const dx = Math.max(60, Math.abs(x2 - x1) * 0.45);
    const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    return `<path class="aurora-graph-edge" d="${escapeAttr(d)}"></path>`;
  }).join('');
  const nodeHtml = layout.nodes.map(node => {
    const title = `${TYPE_LABEL[node.type] || node.type} · ${node.detail || ''}`;
    return `<button type="button" class="aurora-graph-node aurora-graph-node-${escapeAttr(node.type)}" style="left:${node.x}px;top:${node.y}px" data-md-action="open-node" data-md-id="${escapeAttr(node.id)}" title="${escapeAttr(title)}"><span>${escapeHtml(TYPE_LABEL[node.type] || node.type)}</span><strong>${escapeHtml(node.label)}</strong></button>`;
  }).join('');
  const warnings = nodes.length === 0 ? '<div class="aurora-graph-empty">Sin nodos para mostrar.</div>' : '';
  return `<div class="aurora-graph-board" style="width:${layout.width}px;height:${layout.height}px"><svg class="aurora-graph-svg" viewBox="0 0 ${layout.width} ${layout.height}" aria-hidden="true">${edgeHtml}</svg>${nodeHtml}${warnings}</div>`;
}

export function renderGraphDetails(graph, selectedId) {
  const node = (graph?.nodes || []).find(n => n.id === selectedId);
  if (!node) return '<div class="aurora-graph-empty">Seleccioná un nodo para ver detalles.</div>';
  const outgoing = (graph?.edges || []).filter(e => e.from === node.id).slice(0, 8);
  const incoming = (graph?.edges || []).filter(e => e.to === node.id).slice(0, 8);
  const edgeHtml = [...outgoing, ...incoming].map(edge => {
    const other = (graph?.nodes || []).find(n => n.id === (edge.from === node.id ? edge.to : edge.from));
    return `<li><span class="markdown-chip">${escapeHtml(edge.type)}</span> ${escapeHtml(other?.label || '')}</li>`;
  }).join('');
  return `<article class="aurora-details-card"><h3>${escapeHtml(node.label)}</h3><p>${escapeHtml(node.detail || '')}</p><ul>${edgeHtml || '<li>Sin conexiones directas.</li>'}</ul></article>`;
}

export function statsForGraph(graph) {
  const nodes = graph?.nodes || [];
  return {
    files: nodes.filter(n => n.type === 'file').length,
    headings: nodes.filter(n => n.type === 'heading').length,
    tags: nodes.filter(n => n.type === 'tag').length,
    tasks: nodes.filter(n => n.type === 'task' || n.type === 'task-done').length,
    images: nodes.filter(n => n.type === 'image').length,
    code: nodes.filter(n => n.type === 'code').length,
    table: nodes.filter(n => n.type === 'table').length,
    missing: nodes.filter(n => n.type === 'missing').length,
    external: nodes.filter(n => n.type === 'external').length,
    edges: (graph?.edges || []).length,
  };
}
