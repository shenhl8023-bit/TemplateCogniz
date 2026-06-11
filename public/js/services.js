async function requestJson(url, options = {}) {
  const resp = await fetch(url, options);
  const text = await resp.text();
  const data = text ? JSON.parse(text) : {};
  if (!resp.ok) {
    const detail = data.message || (Array.isArray(data.errors) ? data.errors.join('；') : '');
    throw new Error(detail || `request failed: ${resp.status}`);
  }
  return data;
}

export async function apiInit() {
  return requestJson('/api/init');
}

export async function apiChat(draft, message) {
  return requestJson('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft, message })
  });
}

export async function apiSave(draft) {
  return requestJson('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft })
  });
}

export async function apiListGroupTemplates() {
  return requestJson('/api/group-templates');
}

export async function apiRecommendGroupTemplates(text, limit = 5) {
  return requestJson('/api/group-templates/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, limit })
  });
}

export async function apiApplyGroupTemplate(templateId) {
  return requestJson('/api/group-templates/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId })
  });
}

export async function apiAgentMessage(message, sessionId = '', limit = 3) {
  return requestJson('/api/agent/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId, limit })
  });
}

export async function apiAgentEvent(event) {
  return requestJson('/api/agent/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event || {})
  });
}

export async function apiGenerateFuzzyTemplate(text, limit = 3) {
  return requestJson('/api/templates/generate-fuzzy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, limit })
  });
}

export async function apiGetSettings() {
  return requestJson('/api/settings');
}

export async function apiSaveSettings(settings) {
  try {
    const data = await requestJson('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings })
    });
    return { ok: !!data.ok, data };
  } catch (e) {
    return { ok: false, data: { ok: false, message: e.message } };
  }
}

export async function apiTestSettings(settings) {
  try {
    const data = await requestJson('/api/settings/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings })
    });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, data: { ok: false, message: e.message } };
  }
}
