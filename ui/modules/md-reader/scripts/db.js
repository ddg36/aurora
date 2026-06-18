import { getJSON, putJSON, postJSON } from '../../../components/shared/api.js';

export async function getPrefs() {
  const out = await getJSON('/db/mdreader/prefs');
  return out.prefs || {};
}

export async function savePrefs(prefs) {
  return putJSON('/db/mdreader/prefs', prefs);
}

export async function saveIndex(root, files, graph) {
  const nodes = (graph.nodes || []).map(n => ({
    file_path: n.path || n.uri || '',
    node_id: n.id,
    type: n.type,
    label: n.label,
    uri: n.uri,
    line: n.line,
    detail: n.detail,
    meta: {
      count: n.count,
      degree: n.degree,
      missingTarget: n.missingTarget,
      href: n.href,
      tag: n.tag,
      slug: n.slug,
    },
  }));
  const edges = (graph.edges || []).map(e => ({
    source_path: '',
    source_node_id: e.from,
    target_node_id: e.to,
    edge_type: e.type,
    label: e.label,
    source_line: e.sourceLine,
    detail: e.detail,
    meta: {
      count: e.count,
      raw: e.raw,
    },
  }));
  return postJSON('/db/mdreader/index', {
    root,
    files: files.map(f => ({
      path: f.path,
      title: f.name,
      size: f.size,
      mtime: f.mtime,
      checksum: f.checksum,
    })),
    nodes,
    edges,
    stats: graph.stats || {},
  });
}

export async function loadIndex(root) {
  const out = await getJSON(`/db/mdreader/index?root=${encodeURIComponent(root)}`);
  if (!out.ok) return null;
  const graph = out.graph || { nodes: [], edges: [], stats: {} };
  return {
    meta: out.meta,
    graph: {
      nodes: (graph.nodes || []).map(n => ({
        id: n.node_id,
        type: n.type,
        label: n.label,
        path: n.file_path,
        uri: n.uri,
        line: n.line,
        detail: n.detail,
        ...n.meta,
      })),
      edges: (graph.edges || []).map(e => ({
        id: `${e.source_node_id}\u0000${e.target_node_id}\u0000${e.edge_type}`,
        from: e.source_node_id,
        to: e.target_node_id,
        type: e.edge_type,
        label: e.label,
        sourceLine: e.source_line,
        detail: e.detail,
        count: e.meta?.count,
        raw: e.meta?.raw,
      })),
      stats: graph.stats || {},
    },
  };
}
