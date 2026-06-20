import { getJSON, putJSON, postJSON, deleteJSON, patchJSON } from './api.js';

export function getBuilderTemplate(tipo) {
  return getJSON(`/db/builder-templates/${tipo}`);
}

export function saveBuilderTemplate(id, tipo, datos) {
  return putJSON(`/db/builder-templates/${id}`, { tipo, datos });
}

export function deleteBuilderTemplate(id) {
  return deleteJSON(`/db/builder-templates/${id}`);
}

export function getTeamRoles() {
  return getJSON('/db/team-roles');
}

export function getTeamRole(id) {
  return getJSON(`/db/team-roles/${id}`);
}

export function createTeamRole(data) {
  return postJSON('/db/team-roles', data);
}

export function updateTeamRole(id, data) {
  return putJSON(`/db/team-roles/${id}`, data);
}

export function deleteTeamRole(id) {
  return deleteJSON(`/db/team-roles/${id}`);
}

export function reorderTeamRoles(ids) {
  return patchJSON('/db/team-roles/order', { ids });
}

export function getCreativityIdeas(tematica) {
  const q = tematica ? `?tematica=${tematica}` : '';
  return getJSON(`/db/creativity-ideas${q}`);
}

export function getCreativityIdeasByTematica(tematica) {
  return getJSON(`/db/creativity-ideas/${tematica}`);
}

export function saveCreativityIdeas(tematica, datos) {
  return putJSON(`/db/creativity-ideas/${tematica}`, { tematica, datos });
}

export function deleteCreativityIdeas(tematica) {
  return deleteJSON(`/db/creativity-ideas/${tematica}`);
}
