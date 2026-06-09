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

export async function apiListGroupTemplates() {
  const resp = await fetch('/api/group-templates');
  if (!resp.ok) throw new Error(`group template list failed: ${resp.status}`);
  return resp.json();
}

export async function apiRecommendGroupTemplates(text, limit = 5) {
  const resp = await fetch('/api/group-templates/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, limit })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || `template recommend failed: ${resp.status}`);
  return data;
}

export async function apiApplyGroupTemplate(templateId) {
  const resp = await fetch('/api/group-templates/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || `template apply failed: ${resp.status}`);
  return data;
}

export async function apiGenerateFuzzyTemplate(text, limit = 3) {
  const resp = await fetch('/api/templates/generate-fuzzy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, limit })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || `fuzzy template generation failed: ${resp.status}`);
  return data;
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
