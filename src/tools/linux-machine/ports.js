import { instaboxRequest } from './client.js';

export async function publishPort(machineId, port, name) {
  const body = { port: Number(port) };
  if (name) body.name = String(name);
  return instaboxRequest(`/v1/machines/${machineId}/ports`, {
    method: 'POST',
    body,
  });
}

export async function listPorts(machineId) {
  return instaboxRequest(`/v1/machines/${machineId}/ports`);
}

export async function unpublishPort(machineId, port) {
  await instaboxRequest(`/v1/machines/${machineId}/ports/${Number(port)}`, {
    method: 'DELETE',
  });
  return { ok: true, port: Number(port), unpublished: true };
}
