import { getJSON, postJSON } from '../../../components/shared/api.js';

export async function cargarMcpStatus() {
  return getJSON('/mcp/status');
}

export async function cargarMcpClientConfig() {
  return getJSON('/mcp/client-config');
}

export async function llamarMcp(method, params = {}) {
  return postJSON('/mcp/rpc', { jsonrpc: '2.0', id: Date.now(), method, params });
}
