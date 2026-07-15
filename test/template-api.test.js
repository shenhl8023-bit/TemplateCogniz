const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

process.env.NO_LISTEN = '1';

const { Readable } = require('node:stream');

const { server, readJsonBody, readSettings, validateDraft, writeSettings } = require('../server');

const ROOT = path.resolve(__dirname, '..');

function listen(app = server) {
  return new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => {
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

function streamFromChunks(chunks) {
  return Readable.from(chunks.map((chunk) => Buffer.from(chunk)));
}

function createFakeOpenAIServer(content) {
  const requests = [];
  const fakeServer = http.createServer((req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/chat/completions');

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      requests.push({
        headers: req.headers,
        body: JSON.parse(body)
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        choices: [{
          message: { content }
        }]
      }));
    });
  });
  fakeServer.requests = requests;
  return fakeServer;
}

test('POST APIs return JSON errors for invalid JSON bodies', async () => {
  const { instance, baseUrl } = await listen();
  try {
    const resp = await fetch(`${baseUrl}/api/group-templates/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json'
    });
    const data = await resp.json();

    assert.equal(resp.status, 400);
    assert.equal(data.ok, false);
    assert.match(data.message, /JSON/);
  } finally {
    await new Promise((resolve) => instance.close(resolve));
  }
});

test('readJsonBody rejects bodies over the configured limit', async () => {
  await assert.rejects(
    readJsonBody(streamFromChunks(['{"text":"', 'too long', '"}']), { maxBytes: 8 }),
    (err) => {
      assert.equal(err.statusCode, 413);
      assert.match(err.message, /请求体过大/);
      return true;
    }
  );
});

test('validateDraft reports business-level draft errors', () => {
  const errors = validateDraft({
    partTemplateFields: ['原点', '不存在的零件字段'],
    groupTemplateFields: ['依赖方向', '依赖方式', '特征选择', '依赖方式'],
    partParams: { 原点: '' },
    groups: [
      {
        id: 'a',
        name: 'A侧',
        params: { 依赖方向: '从父', 依赖方式: '非法方式', 特征选择: '外圆' },
        children: []
      },
      {
        id: 'b',
        name: 'A侧',
        params: { 依赖方向: '从父', 依赖方式: '无', 特征选择: '不存在特征' },
        children: []
      },
      {
        id: 'blank',
        name: '',
        params: { 依赖方向: '从父', 依赖方式: '无', 特征选择: '' },
        children: []
      }
    ]
  }, { features: ['外圆'] });

  assert.ok(errors.some((msg) => msg.includes('不支持字段')));
  assert.ok(errors.some((msg) => msg.includes('字段重复')));
  assert.ok(errors.some((msg) => msg.includes('重复分组名')));
  assert.ok(errors.some((msg) => msg.includes('值无效')));
  assert.ok(errors.some((msg) => msg.includes('未知特征')));
  assert.ok(errors.some((msg) => msg.includes('名称为空')));
});

test('save API rejects invalid draft before exporting XML', async () => {
  const { instance, baseUrl } = await listen();
  try {
    const init = await requestJson(baseUrl, '/api/init');
    const invalidDraft = {
      ...init.data.draft,
      partTemplateFields: ['原点', '坏字段']
    };

    const { resp, data } = await requestJson(baseUrl, '/api/save', {
      method: 'POST',
      body: JSON.stringify({ draft: invalidDraft })
    });

    assert.equal(resp.status, 400);
    assert.equal(data.ok, false);
    assert.ok(data.errors.some((msg) => msg.includes('不支持字段')));
    assert.match(data.message, /保存失败/);
  } finally {
    await new Promise((resolve) => instance.close(resolve));
  }
});

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

test('group template API returns no recommendations for blank text', async () => {
  const { instance, baseUrl } = await listen();
  try {
    const { resp, data } = await requestJson(baseUrl, '/api/group-templates/recommend', {
      method: 'POST',
      body: JSON.stringify({ text: '   ', limit: 3 })
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.deepEqual(data.recommendations, []);
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

test('agent message API creates template selection workflow with candidates', async () => {
  const { instance, baseUrl } = await listen();
  try {
    const { resp, data } = await requestJson(baseUrl, '/api/agent/message', {
      method: 'POST',
      body: JSON.stringify({
        message: '衬套类回转体零件，A侧和B侧，包含端面、外圆、孔和外环槽'
      })
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.ok(data.sessionId);
    assert.equal(data.stage, 'TemplateSelection');
    assert.equal(data.workflow.currentStep, 'select_group_template');
    assert.equal(data.workflow.steps[0].id, 'select_group_template');
    assert.equal(data.workflow.steps[0].status, 'awaiting_choice');
    assert.ok(data.recommendations.length > 0);
    assert.equal(data.ui[0].type, 'template_candidates');
    assert.equal(data.ui[0].options[0].templateId, data.recommendations[0].id);
  } finally {
    await new Promise((resolve) => instance.close(resolve));
  }
});

test('agent event API applies selected group template and completes first workflow step', async () => {
  const { instance, baseUrl } = await listen();
  try {
    const created = await requestJson(baseUrl, '/api/agent/message', {
      method: 'POST',
      body: JSON.stringify({
        message: '衬套类回转体零件，A侧和B侧，包含端面、外圆、孔和外环槽'
      })
    });
    const templateId = created.data.recommendations[0].id;

    const { resp, data } = await requestJson(baseUrl, '/api/agent/event', {
      method: 'POST',
      body: JSON.stringify({
        type: 'ui.option_selected',
        sessionId: created.data.sessionId,
        stage: 'TemplateSelection',
        choiceId: templateId,
        payload: { templateId }
      })
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.sessionId, created.data.sessionId);
    assert.equal(data.stage, 'TemplateSelection');
    assert.equal(data.workflow.steps[0].status, 'completed');
    assert.equal(data.workflow.currentStep, 'select_group_template');
    assert.equal(data.workflow.steps.length, 1);
    assert.equal(data.template.id, templateId);
    assert.ok(data.draft.groups.length > 0);
    assert.ok(data.xml.includes('<Kmsoft>'));
    assert.ok(data.structureSummary.length > 0);
    assert.equal(data.ui[0].options.find((item) => item.templateId === templateId).selected, true);
  } finally {
    await new Promise((resolve) => instance.close(resolve));
  }
});

test('fuzzy template API auto-applies high confidence vague descriptions', async () => {
  const { instance, baseUrl } = await listen();
  try {
    const { resp, data } = await requestJson(baseUrl, '/api/templates/generate-fuzzy', {
      method: 'POST',
      body: JSON.stringify({
        text: '衬套类回转体零件，A侧和B侧，包含端面、外圆、孔和外环槽',
        limit: 3
      })
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.mode, 'auto_applied');
    assert.ok(data.template);
    assert.ok(data.template.id);
    assert.ok(data.draft.groups.length > 0);
    assert.ok(data.xml.includes('<Kmsoft>'));
    assert.ok(data.structureSummary.length > 0);
    assert.equal(data.recognitionRecommendation.id, 'rotary_recognition');
    assert.match(data.reply, /自动生成模板/);
  } finally {
    await new Promise((resolve) => instance.close(resolve));
  }
});

test('fuzzy template API asks users to choose medium confidence descriptions', async () => {
  const { instance, baseUrl } = await listen();
  try {
    const { resp, data } = await requestJson(baseUrl, '/api/templates/generate-fuzzy', {
      method: 'POST',
      body: JSON.stringify({
        text: '做个衬套模板',
        limit: 3
      })
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.mode, 'needs_choice');
    assert.ok(data.recommendations.length > 0);
    assert.ok(data.recommendations[0].confidence >= 0.4);
    assert.ok(data.recommendations[0].confidence < 0.75);
    assert.equal(data.draft, undefined);
    assert.match(data.question, /选择/);
  } finally {
    await new Promise((resolve) => instance.close(resolve));
  }
});

test('fuzzy template API asks a clarification question for low confidence descriptions', async () => {
  const { instance, baseUrl } = await listen();
  try {
    const { resp, data } = await requestJson(baseUrl, '/api/templates/generate-fuzzy', {
      method: 'POST',
      body: JSON.stringify({
        text: '帮我做一个差不多能用的模板',
        limit: 3
      })
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.mode, 'needs_clarification');
    assert.equal(data.recommendations.length, 0);
    assert.equal(data.draft, undefined);
    assert.match(data.question, /衬套|壳体|小件/);
  } finally {
    await new Promise((resolve) => instance.close(resolve));
  }
});

test('save API exports the current draft as a real XML file', async () => {
  const { instance, baseUrl } = await listen();
  let exportedPath = null;
  try {
    const init = await requestJson(baseUrl, '/api/init');
    const draft = {
      ...init.data.draft,
      groups: [
        {
          id: 'gb2312-group',
          name: 'A侧',
          params: {
            名称: 'A侧',
            依赖方向: '从父',
            依赖方式: '无',
            特征选择: '外圆柱面'
          },
          children: []
        }
      ]
    };

    const { resp, data } = await requestJson(baseUrl, '/api/save', {
      method: 'POST',
      body: JSON.stringify({ draft })
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.match(data.filename, /^分组模板_\d{8}_\d{6}\.xml$/);
    assert.ok(data.filePath.endsWith(data.filename));
    assert.ok(data.xml.includes('<?xml version="1.0" encoding="GB2312" ?>'));
    assert.ok(data.xml.includes('<Kmsoft>'));
    exportedPath = data.filePath;
    assert.ok(fs.existsSync(exportedPath));
    const exportedBytes = fs.readFileSync(exportedPath);
    const decodedXml = new TextDecoder('gb2312').decode(exportedBytes);
    assert.equal(decodedXml, data.xml);
    assert.ok(decodedXml.includes('name="名称" value="A侧"'));
    assert.ok(decodedXml.includes('name="特征选择" value="外圆柱面"'));
  } finally {
    if (exportedPath && fs.existsSync(exportedPath)) fs.unlinkSync(exportedPath);
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

test('chat API sends loaded intent prompt and skill context to OpenAI-compatible chat completions', async () => {
  const fakeServer = createFakeOpenAIServer(JSON.stringify({
    operations: [
      { type: 'add_top_groups', groups: ['A侧'] }
    ],
    canonical_text: '创建A侧分组',
    assistant_reply: '已创建A侧'
  }));
  let fake = null;
  let app = null;
  const previousSettings = readSettings();

  try {
    fake = await listen(fakeServer);
    app = await listen(server);
    writeSettings({
      ...previousSettings,
      llmEnabled: true,
      provider: 'openai_compatible',
      baseUrl: fake.baseUrl,
      apiKey: 'test-key',
      model: 'test-model',
      temperature: 0
    });

    const draft = {
      partTemplateFields: ['原点'],
      groupTemplateFields: ['依赖方向', '依赖方式', '特征选择'],
      partParams: { 原点: '' },
      groups: [
        {
          id: 'existing-group',
          name: '已有组',
          params: { 名称: '已有组', 依赖方向: '任意方向', 依赖方式: '无', 特征选择: '' },
          children: []
        }
      ]
    };

    const { resp, data } = await requestJson(app.baseUrl, '/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        draft,
        message: '创建A侧分组'
      })
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.llmUsed, true);
    assert.equal(data.reply, '已创建A侧');
    assert.ok(data.draft.groups.some((group) => group.name === 'A侧'));

    assert.equal(fakeServer.requests.length, 1);
    const request = fakeServer.requests[0];
    assert.equal(request.headers.authorization, 'Bearer test-key');
    assert.equal(request.body.model, 'test-model');
    assert.equal(request.body.temperature, 0);
    assert.deepEqual(request.body.response_format, { type: 'json_object' });
    assert.equal(request.body.messages.length, 2);
    assert.deepEqual(request.body.messages.map((message) => message.role), ['system', 'user']);
    assert.match(request.body.messages[0].content, /只返回JSON对象/);

    const userPrompt = request.body.messages[1].content;
    const promptFile = fs.readFileSync(path.join(ROOT, 'prompts', 'intent_prompt.md'), 'utf8');
    assert.ok(userPrompt.includes(promptFile.split('{{PARENT_GROUPS}}')[0].trim()));
    assert.ok(userPrompt.includes('# Project Skill: kmsoft-group-template'));
    assert.ok(userPrompt.includes('# Kmsoft Group Template Selection'));
    assert.ok(userPrompt.includes('# Natural-Language Intent Operations'));
    assert.ok(userPrompt.includes('当前已有分组名: ["已有组"]'));
    assert.ok(userPrompt.includes('当前零件参数字段: ["原点"]'));
    assert.ok(userPrompt.includes('用户输入: 创建A侧分组'));
    assert.doesNotMatch(userPrompt, /\{\{(?:PARENT_GROUPS|GROUP_TREE|PART_FIELDS|GROUP_FIELDS|FEATURE_DICT|USER_INPUT)\}\}/);
  } finally {
    writeSettings(previousSettings);
    if (app) await new Promise((resolve) => app.instance.close(resolve));
    if (fake) await new Promise((resolve) => fake.instance.close(resolve));
  }
});

test('chat API rejects Markdown-wrapped LLM JSON and falls back to rule parsing', async () => {
  const fakeServer = createFakeOpenAIServer([
    '```json',
    JSON.stringify({
      operations: [
        { type: 'add_top_groups', groups: ['B侧'] }
      ],
      assistant_reply: 'this should not be accepted'
    }),
    '```'
  ].join('\n'));
  let fake = null;
  let app = null;
  const previousSettings = readSettings();

  try {
    fake = await listen(fakeServer);
    app = await listen(server);
    writeSettings({
      ...previousSettings,
      llmEnabled: true,
      provider: 'openai_compatible',
      baseUrl: fake.baseUrl,
      apiKey: 'test-key',
      model: 'test-model',
      temperature: 0
    });

    const init = await requestJson(app.baseUrl, '/api/init');
    const { resp, data } = await requestJson(app.baseUrl, '/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        draft: init.data.draft,
        message: '创建A侧分组'
      })
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.equal(fakeServer.requests.length, 1);
    assert.equal(data.llmUsed, false);
    assert.ok(data.draft.groups.some((group) => group.name === 'A侧'));
    assert.equal(data.draft.groups.some((group) => group.name === 'B侧'), false);
  } finally {
    writeSettings(previousSettings);
    if (app) await new Promise((resolve) => app.instance.close(resolve));
    if (fake) await new Promise((resolve) => fake.instance.close(resolve));
  }
});
