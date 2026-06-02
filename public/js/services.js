export async function apiInit() {
  const resp = await fetch('/api/init');
  if (!resp.ok) throw new Error(`init failed: ${resp.status}`);
  return resp.json();
}

export async function apiChat(draft, message) {
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft, message })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || `chat failed: ${resp.status}`);
  return data;
}

export async function apiSave(draft) {
  const resp = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft })
  });
  return resp.json();
}

export async function apiGetSettings() {
  const resp = await fetch('/api/settings');
  if (!resp.ok) throw new Error(`settings failed: ${resp.status}`);
  return resp.json();
}

export async function apiSaveSettings(settings) {
  const resp = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings })
  });
  const data = await resp.json();
  return { ok: resp.ok && data.ok, data };
}

export async function apiTestSettings(settings) {
  const resp = await fetch('/api/settings/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings })
  });
  const data = await resp.json();
  return { ok: resp.ok, data };
}
