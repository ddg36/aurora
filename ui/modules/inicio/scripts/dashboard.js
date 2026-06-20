import { getJSON } from '../../../components/shared/api.js';
import { cargarHealth } from '../../../components/shared/api-helpers.js';

export { cargarHealth };

export async function pingAurora() {
  try {
    return await getJSON('/ping');
  } catch {
    return null;
  }
}

export async function cargarDashboardStats() {
  try {
    return await getJSON('/db/stats');
  } catch {
    return null;
  }
}

export function formatBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

export function formatUptime(s) {
  if (s == null) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
