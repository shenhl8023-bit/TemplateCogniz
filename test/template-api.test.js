const assert = require('node:assert/strict');
const test = require('node:test');

process.env.NO_LISTEN = '1';

const { server, readSettings, writeSettings } = require('../server');

function listen() {
  return new Promise((resolve) => {
    const instance = server.listen(0, '127.0.0.1', () => {
      const { port } = instance.address();
      resolve({ instance, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function requestJson(baseUrl, pathname, options = {}) {
  const resp = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await resp.json();
  return { resp, data };
}

test('group template API lists catalog items', async () => {
  const { instance, baseUrl } = await listen();
  try {
    const init = await requestJson(baseUrl, '/api/init');
    assert.equal(init.data.ok, true);
    assert.ok(init.data.groupTemplates.length >= 5);

    const { resp, data } = await requestJson(baseUrl, '/api/group-templates');

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.ok(data.templates.length >= 5);
    assert.ok(data.templates[0].id);
    assert.ok(Array.isArray(data.templates[0].groupNames));
  } finally {
    await new Promise((resolve) => instance.close(resolve));
  }
});

test('group template API recommends templates with reasons', async () => {
  const { instance, baseUrl } = await listen();
  try {
    const { resp, data } = await requestJson(baseUrl, '/api/group-templates/recommend', {
      method: 'POST',
      body: JSON.stringify({
        text: '衬套类回转体零件，A侧和B侧，包含端面、外圆、孔和外环槽'
      })
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.ok(data.recommendations.length > 0);
    assert.ok(data.recommendations[0].confidence >= 0.4);
    assert.ok(data.recommendations[0].reasons.length > 0);
  } finally {
    await new Promise((resolve) => instance.close(resolve));
  }
});

test('group template API applies selected recommendation to draft', async () => {
  const { instance, baseUrl } = await listen();
  try {
    const rec = await requestJson(baseUrl, '/api/group-templates/recommend', {
      method: 'POST',
      body: JSON.stringify({
        text: '衬套类回转体零件，包含端面、外圆、孔'
      })
    });
    const templateId = rec.data.recommendations[0].id;

    const { resp, data } = await requestJson(baseUrl, '/api/group-templates/apply', {
      method: 'POST',
      body: JSON.stringify({ templateId })
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.template.id, templateId);
    assert.ok(data.draft.groups.length > 0);
    assert.ok(data.xml.includes('<Kmsoft>'));
    assert.ok(data.structureSummary.length > 0);
    assert.equal(data.recognitionRecommendation.id, 'rotary_recognition');
  } finally {
    await new Promise((resolve) => instance.close(resolve));
  }
});

test('recognition template API recommends a recognition template', async () => {
  const { instance, baseUrl } = await listen();
  try {
    const list = await requestJson(baseUrl, '/api/recognition-templates');
    assert.equal(list.resp.status, 200);
    assert.equal(list.data.ok, true);
    assert.ok(list.data.templates.length >= 3);

    const rec = await requestJson(baseUrl, '/api/group-templates/recommend', {
      method: 'POST',
      body: JSON.stringify({
        text: '衬套类回转体零件，包含端面、外圆、孔'
      })
    });
    const templateId = rec.data.recommendations[0].id;
    const applied = await requestJson(baseUrl, '/api/group-templates/apply', {
      method: 'POST',
      body: JSON.stringify({ templateId })
    });

    const { resp, data } = await requestJson(baseUrl, '/api/recognition-templates/recommend', {
      method: 'POST',
      body: JSON.stringify({
        text: '自动识别端面、外圆、孔和外环槽',
        groupTemplate: rec.data.recommendations[0],
        draft: applied.data.draft
      })
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.recommendations[0].id, 'rotary_recognition');
    assert.ok(data.recommendations[0].reasons.length > 0);
  } finally {
    await new Promise((resolve) => instance.close(resolve));
  }
});

test('chat API falls back to rule parser when LLM is disabled', async () => {
  const { instance, baseUrl } = await listen();
  const previousSettings = readSettings();
  writeSettings({ ...previousSettings, llmEnabled: false });
  try {
    const init = await requestJson(baseUrl, '/api/init');
    const { resp, data } = await requestJson(baseUrl, '/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        draft: init.data.draft,
        message: '创建A侧和B侧分组'
      })
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.llmUsed, false);
    assert.ok(data.draft.groups.some((group) => group.name === 'A侧'));
    assert.ok(data.draft.groups.some((group) => group.name === 'B侧'));
  } finally {
    writeSettings(previousSettings);
    await new Promise((resolve) => instance.close(resolve));
  }
});
