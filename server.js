const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const TEMPLATE_DIR = path.join(ROOT, '分组模板');
const FEATURE_FILE = path.join(ROOT, '特征选择列表', 'FeatureTemplate.xml');
const SETTINGS_FILE = path.join(ROOT, 'settings.json');
const PROMPT_FILE = path.join(ROOT, 'prompts', 'intent_prompt.md');
const TEMP_EXPORT_DIR = path.join(ROOT, '.codex-runtime');
const DEFAULT_JSON_BODY_LIMIT_BYTES = 1024 * 1024;
const CONFIGURED_JSON_BODY_LIMIT_BYTES = Number(process.env.JSON_BODY_LIMIT_BYTES);
const MAX_JSON_BODY_BYTES = Number.isFinite(CONFIGURED_JSON_BODY_LIMIT_BYTES) && CONFIGURED_JSON_BODY_LIMIT_BYTES > 0
  ? CONFIGURED_JSON_BODY_LIMIT_BYTES
  : DEFAULT_JSON_BODY_LIMIT_BYTES;

const SUPPORTED_PART_FIELDS = [
  '主方向',
  '主方向1',
  '主方向2',
  '主方向3',
  '主方向4',
  '主方向5',
  '主方向6',
  '原点',
  '有主轴线',
  '有轴线',
  '是否需要加工面分离',
  '是否自动按坐标轴方向加工面积多少选择主方向',
  '需要判断外圆车削加工方向',
  '需要判断多外圆车削加工方向'
];

const DEFAULT_GROUP_TEMPLATE_FIELDS = ['依赖方向', '依赖方式', '特征选择'];
const FUZZY_AUTO_APPLY_CONFIDENCE = 0.75;
const FUZZY_CHOICE_CONFIDENCE = 0.4;
const PART_FIELD_SPINDLE_AXIS = '有主轴线';
const PART_FIELD_AXIS = '有轴线';
const GROUP_FIELD_SPINDLE_FEATURE = '主轴线上特征';
const GROUP_FIELD_GENERAL_AXIS_FEATURE = '一般轴线上特征';

const PART_FIELD_META = {
  原点: { type: 'String', defaultval: '', data_type: 'point', respath: 'cad' },
  主方向: { type: 'String', defaultval: '', data_type: 'direction', respath: 'cad' },
  主方向1: { type: 'String', defaultval: '', data_type: 'direction', respath: 'cad' },
  主方向2: { type: 'String', defaultval: '', data_type: 'direction', respath: 'cad' },
  主方向3: { type: 'String', defaultval: '', data_type: 'direction', respath: 'cad' },
  主方向4: { type: 'String', defaultval: '', data_type: 'direction', respath: 'cad' },
  主方向5: { type: 'String', defaultval: '', data_type: 'direction', respath: 'cad' },
  主方向6: { type: 'String', defaultval: '', data_type: 'direction', respath: 'cad' },
  有主轴线: { type: 'Multi', defaultval: '是|是;不是;否', data_type: '', respath: '' },
  有轴线: { type: 'Multi', defaultval: '是|是;不是', data_type: '', respath: '' },
  是否需要加工面分离: { type: 'Multi', defaultval: '是|是;否', data_type: '', respath: '' },
  是否自动按坐标轴方向加工面积多少选择主方向: { type: 'Multi', defaultval: '是|是;否', data_type: '', respath: '' },
  需要判断外圆车削加工方向: { type: 'Multi', defaultval: '是|是;不是', data_type: '', respath: '' },
  需要判断多外圆车削加工方向: { type: 'Multi', defaultval: '是|是;不是', data_type: '', respath: '' }
};

const GROUP_FIELD_META = {
  依赖方向: { type: 'Multi', defaultval: '任意方向|任意方向;从父;主方向1;主方向2;主方向3;主方向4;主方向5;主方向6;外圆加工方向;多外圆加工方向;六面方向;无可行方向;无可行加工方向;未配置', data_type: '', respath: '' },
  依赖方式: { type: 'Multi', defaultval: '无|无;相同;相反;平行;平行且在同侧;平行且在反侧;垂直;不平行;接近;接近反向;与坐标轴方向不平行;相同或接近;相反或接近反向', data_type: '', respath: '' },
  特征选择: { type: 'String', defaultval: '', data_type: '', respath: 'kmfeatype' },
  主轴线上特征: { type: 'Multi', defaultval: '无关|无关;是;不是', data_type: '', respath: '' },
  一般轴线上特征: { type: 'Multi', defaultval: '无关|无关;是;不是', data_type: '', respath: '' },
  是否按用户规则排工序: { type: 'Multi', defaultval: '否|是;否', data_type: '', respath: '' }
};

const SCENE_PRESETS = [
  {
    id: 'housing_multi_face',
    name: '壳体/多面加工类',
    desc: '箱体或复杂结构件，多面铣削/钻孔加工',
    partFields: ['主方向1', '主方向2', '主方向3', '主方向4', '主方向5', '主方向6', '是否需要加工面分离'],
    groupFields: ['依赖方向', '依赖方式', '特征选择', '是否按用户规则排工序'],
    guide: '建议先创建顶层分组：主方向1~主方向6，再在每个方向下细分孔、平面、通槽。'
  },
  {
    id: 'axis_rotary',
    name: '轴/套/回转体类',
    desc: '活门、衬套、回转体，车削/车铣复合加工',
    partFields: ['原点', '主方向1', '有主轴线'],
    groupFields: ['依赖方向', '依赖方式', '主轴线上特征', '特征选择'],
    guide: '建议先创建A侧和B侧，依赖方式分别设为相同/相反，再细分端面、外圆等子分组。'
  },
  {
    id: 'simple_part',
    name: '简单构件/小件类',
    desc: '单面加工或无严格方向要求的小件',
    partFields: ['原点', '主方向'],
    groupFields: ['依赖方向', '依赖方式', '特征选择'],
    guide: '建议采用扁平分组，依赖方向优先用任意方向，快速按特征选择打包。'
  }
];

const RECOGNITION_TEMPLATES = [
  {
    id: 'rotary_recognition',
    name: '回转体自动识别模板',
    partTypes: ['回转体', '轴类', '套类', '衬套'],
    requiredPartFields: ['原点', '主方向1', '有主轴线'],
    keywords: ['衬套', '回转体', '轴类', 'A侧', 'B侧', '端面', '外圆', '孔', '外环槽', '内环槽', '倒角'],
    recognizes: ['端面', '外圆', '孔', '外环槽', '内环槽', '倒角倒圆']
  },
  {
    id: 'housing_multi_face_recognition',
    name: '壳体多面自动识别模板',
    partTypes: ['壳体', '箱体', '多面加工'],
    requiredPartFields: ['主方向1', '主方向2', '主方向3', '主方向4', '主方向5', '主方向6'],
    keywords: ['壳体', '箱体', '六面', '平面', '孔系', '通槽', '周边', '加工面分离'],
    recognizes: ['六面', '平面', '孔系', '通槽', '凹槽', '台阶']
  },
  {
    id: 'simple_feature_recognition',
    name: '简单件特征识别模板',
    partTypes: ['简单件', '小件'],
    requiredPartFields: ['原点', '主方向'],
    keywords: ['简单', '小件', '平面', '孔', '通槽'],
    recognizes: ['平面', '孔', '通槽', '倒角']
  }
];

function defaultSettings() {
  return {
    llmEnabled: false,
    provider: 'openai_compatible',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKey: '',
    model: 'meta/llama-3.1-8b-instruct',
    temperature: 0.2,
    llmTimeoutSec: 0
  };
}

function readSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) return defaultSettings();
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...defaultSettings(), ...(parsed || {}) };
  } catch (_) {
    return defaultSettings();
  }
}

function writeSettings(input) {
  const merged = { ...defaultSettings(), ...(input || {}) };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

async function testGemini(settings) {
  const apiKey = (settings.apiKey || '').trim();
  const model = (settings.model || '').trim() || 'gemini-1.5-flash';
  if (!apiKey) {
    return { ok: false, message: '请先填写 Gemini API Key' };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ parts: [{ text: 'ping' }] }],
    generationConfig: { temperature: Number(settings.temperature || 0.2) }
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const t = await resp.text();
      return { ok: false, message: `Gemini连接失败: ${resp.status} ${t.slice(0, 160)}` };
    }
    return { ok: true, message: 'Gemini连接成功' };
  } catch (e) {
    return { ok: false, message: `Gemini连接异常: ${e.message}` };
  }
}

async function testOpenAICompatible(settings) {
  const apiKey = (settings.apiKey || '').trim();
  const model = (settings.model || '').trim() || 'z-ai/glm5';
  const baseUrl = (settings.baseUrl || '').trim() || 'https://integrate.api.nvidia.com/v1';
  if (!apiKey) return { ok: false, message: '请先填写 API Key' };
  if (!baseUrl) return { ok: false, message: '请先填写 Base URL' };

  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const body = {
    model,
    messages: [{ role: 'user', content: 'ping' }],
    temperature: Number(settings.temperature || 0.2),
    max_tokens: 32
  };
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const t = await resp.text();
      return { ok: false, message: `OpenAI兼容连接失败: ${resp.status} ${t.slice(0, 180)}` };
    }
    return { ok: true, message: 'OpenAI兼容连接成功' };
  } catch (e) {
    return { ok: false, message: `OpenAI兼容连接异常: ${e.message}` };
  }
}

function extractJsonObject(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  const direct = safeJsonParse(trimmed);
  if (direct && typeof direct === 'object') return direct;
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlock) {
    const parsed = safeJsonParse(codeBlock[1].trim());
    if (parsed && typeof parsed === 'object') return parsed;
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const parsed = safeJsonParse(trimmed.slice(start, end + 1));
    if (parsed && typeof parsed === 'object') return parsed;
  }
  return null;
}

function llmIntentPrompt(message, draft, featureDict) {
  const parentGroups = [];
  forEachGroup(draft.groups || [], (g) => {
    if (g && g.name) parentGroups.push(g.name);
  });

  const fallback = [
    '你是“分组模板指令解析器”，只返回JSON，不要返回解释。',
    '目标：把用户输入转成结构化操作，用于更新零件分组模板。',
    '严格输出格式：',
    '{',
    '  "operations": [',
    '    { "type": "select_part_fields", "fields": ["原点","主方向1"] },',
    '    { "type": "set_part_param", "field": "有主轴线", "value": "是" },',
    '    { "type": "add_top_groups", "groups": ["A侧","B侧"] },',
    '    { "type": "add_children", "parents": ["A侧"], "children": ["外圆","端面"] },',
    '    { "type": "add_children_by_path", "parent_path": ["A侧","端面"], "children": ["孔"] },',
    '    { "type": "set_group_param", "group": "A侧", "field": "依赖方向", "value": "主方向1" },',
    '    { "type": "set_group_features", "group": "A侧", "features": ["外圆柱面","轴端面"] }',
    '  ],',
    '  "canonical_text": "可选，尽量简短的标准化中文指令",',
    '  "assistant_reply": "可选，给用户的中文反馈"',
    '}',
    '规则：',
    '1) 只能输出JSON对象，不要Markdown。',
    '2) 不确定时，operations返回空数组，不要猜。',
    '3) 特征必须优先从词典中选择，词典外可忽略。',
    '4) 用户出现“也一样/同样”时，需要结合上下文扩展到对应父分组。',
    '5) 可以创建多层分组：当出现“X下面的Y下添加Z”或“X Y下添加Z”时，必须使用 add_children_by_path，parent_path 形如 ["X","Y"]。',
    '6) 严禁把“在A侧端面下添加孔”理解成在 A侧 下添加孔；应在 A侧/端面 下添加孔。',
    `当前已有分组名: ${JSON.stringify(parentGroups)}`,
    `当前分组结构(树):\n${buildGroupStructureText(draft.groups || [])}`,
    `当前零件参数字段: ${JSON.stringify(draft.partTemplateFields || [])}`,
    `当前分组参数字段: ${JSON.stringify(draft.groupTemplateFields || [])}`,
    `特征词典: ${JSON.stringify(featureDict || [])}`,
    `用户输入: ${message}`
  ].join('\n');

  let tpl = '';
  try {
    if (fs.existsSync(PROMPT_FILE)) {
      tpl = fs.readFileSync(PROMPT_FILE, 'utf8');
    }
  } catch (_) {
    tpl = '';
  }
  if (!tpl.trim()) return fallback;

  const vars = {
    PARENT_GROUPS: JSON.stringify(parentGroups),
    GROUP_TREE: buildGroupStructureText(draft.groups || []),
    PART_FIELDS: JSON.stringify(draft.partTemplateFields || []),
    GROUP_FIELDS: JSON.stringify(draft.groupTemplateFields || []),
    FEATURE_DICT: JSON.stringify(featureDict || []),
    USER_INPUT: String(message || '')
  };

  return tpl.replace(/\{\{(PARENT_GROUPS|GROUP_TREE|PART_FIELDS|GROUP_FIELDS|FEATURE_DICT|USER_INPUT)\}\}/g, (_, key) => vars[key] || '');
}

function buildGroupStructureText(groups, depth = 0) {
  const lines = [];
  const indent = '  '.repeat(depth);
  for (const g of groups || []) {
    const params = g.params || {};
    const depDir = params['依赖方向'] || '未设置';
    const depMode = params['依赖方式'] || '未设置';
    const feat = params['特征选择'] || '未设置';
    lines.push(`${indent}- ${g.name} [依赖方向=${depDir}, 依赖方式=${depMode}, 特征选择=${feat}]`);
    const children = buildGroupStructureText(g.children || [], depth + 1);
    if (children) lines.push(children);
  }
  return lines.join('\n');
}

async function parseByGemini(settings, message, draft, featureDict) {
  const apiKey = (settings.apiKey || '').trim();
  const model = (settings.model || '').trim() || 'gemini-2.0-flash';
  if (!apiKey) throw new Error('Gemini API Key 为空');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: llmIntentPrompt(message, draft, featureDict) }]
    }],
    generationConfig: {
      temperature: Number(settings.temperature || 0.2)
    }
  };

  const timeoutMs = Math.max(0, Number(settings.llmTimeoutSec || 0)) * 1000;
  let resp;
  if (timeoutMs > 0) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  } else {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Gemini请求失败: ${resp.status} ${t.slice(0, 220)}`);
  }
  const data = await resp.json();
  const text = (((data || {}).candidates || [])[0] || {}).content;
  const parts = (text && text.parts) || [];
  const merged = parts.map((p) => p && p.text).filter(Boolean).join('\n');
  const parsed = extractJsonObject(merged);
  if (!parsed) throw new Error('Gemini返回非JSON');
  return parsed;
}

async function parseByOpenAICompatible(settings, message, draft, featureDict) {
  const apiKey = (settings.apiKey || '').trim();
  const baseUrl = (settings.baseUrl || '').trim() || 'https://integrate.api.nvidia.com/v1';
  const model = (settings.model || '').trim() || 'z-ai/glm5';
  if (!apiKey) throw new Error('API Key 为空');
  if (!baseUrl) throw new Error('Base URL 为空');

  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const body = {
    model,
    messages: [
      { role: 'system', content: '你是分组模板指令解析器。只返回JSON对象。' },
      { role: 'user', content: llmIntentPrompt(message, draft, featureDict) }
    ],
    temperature: Number(settings.temperature || 0.2),
    max_tokens: 900
  };

  const timeoutMs = Math.max(0, Number(settings.llmTimeoutSec || 0)) * 1000;
  let resp;
  if (timeoutMs > 0) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  } else {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
  }
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI兼容请求失败: ${resp.status} ${t.slice(0, 240)}`);
  }
  const data = await resp.json();
  const content = ((((data || {}).choices || [])[0] || {}).message || {}).content || '';
  const parsed = extractJsonObject(typeof content === 'string' ? content : JSON.stringify(content || {}));
  if (!parsed) throw new Error('OpenAI兼容返回非JSON');
  return parsed;
}

function validPartField(field) {
  return typeof field === 'string' && SUPPORTED_PART_FIELDS.includes(field);
}

function validGroupField(field) {
  return typeof field === 'string' && Object.prototype.hasOwnProperty.call(GROUP_FIELD_META, field);
}

function applyLlmOperations(inputDraft, ops, featureDict) {
  const draft = normalizeDraft(inputDraft);
  const operations = Array.isArray(ops) ? ops : [];
  const logs = [];

  for (const op of operations) {
    if (!op || typeof op !== 'object') continue;
    const type = String(op.type || '').trim();
    if (!type) continue;

    if (type === 'select_part_fields') {
      const fields = Array.isArray(op.fields) ? op.fields : [];
      const picked = [];
      for (const f of fields) {
        if (validPartField(f)) {
          ensurePartField(draft, f);
          picked.push(f);
        }
      }
      if (picked.length) logs.push(`零件参数: ${picked.join('、')}`);
      syncGroupFeatureFieldsByPart(draft);
      continue;
    }

    if (type === 'set_part_param') {
      const field = op.field;
      if (validPartField(field)) {
        ensurePartField(draft, field);
        draft.partParams[field] = String(op.value ?? '').trim();
        logs.push(`零件参数赋值: ${field}=${draft.partParams[field]}`);
      }
      syncGroupFeatureFieldsByPart(draft);
      continue;
    }

    if (type === 'add_top_groups') {
      const groups = Array.isArray(op.groups) ? op.groups : [];
      const created = [];
      for (const nameRaw of groups) {
        const name = normalizeGroupLabel(nameRaw || '');
        if (!name) continue;
        if (!contextGroupExists(draft, name) && !isValidTopGroupName(name)) continue;
        const existed = !!findGroupByName(draft.groups, name);
        upsertTopGroup(draft, name);
        if (!existed) {
          created.push(name);
          draft.context.lastCreatedGroup = name;
        }
      }
      if (created.length) logs.push(`新增顶层分组: ${created.join('、')}`);
      continue;
    }

    if (type === 'add_children') {
      const parents = Array.isArray(op.parents) ? op.parents : [];
      const children = Array.isArray(op.children) ? op.children.map((v) => String(v || '').trim()).filter(Boolean) : [];
      if (!parents.length || !children.length) continue;
      for (const p of parents) {
        const parent = normalizeGroupLabel(p || '');
        if (!parent) continue;
        let res;
        if (parent.includes('/') || parent.includes('>')) {
          const sep = parent.includes('/') ? '/' : '>';
          const path = parent.split(sep).map((x) => normalizeGroupLabel(x)).filter(Boolean);
          if (!path.length) continue;
          if (!contextGroupExists(draft, path[0]) && !isValidTopGroupName(path[0])) continue;
          res = addChildrenToParentPath(draft, path, children, featureDict);
        } else {
          const resolved = resolveContextParents(draft, parent);
          const target = resolved[0] || parent;
          if (!contextGroupExists(draft, target) && !isValidTopGroupName(target)) continue;
          res = addChildrenToParent(draft, target, children, featureDict);
        }
        if (res.added.length) {
          logs.push(`${parent}: 新增 ${res.added.join('、')}`);
          draft.context.lastCreatedGroup = res.added[res.added.length - 1];
        }
      }
      draft.context.lastAddChildren = { sourceParent: String(parents[0]), children };
      continue;
    }

    if (type === 'add_children_by_path') {
      const parentPath = Array.isArray(op.parent_path)
        ? op.parent_path.map((v) => normalizeGroupLabel(v)).filter(Boolean)
        : [];
      const children = Array.isArray(op.children) ? op.children.map((v) => String(v || '').trim()).filter(Boolean) : [];
      if (!parentPath.length || !children.length) continue;
      if (!contextGroupExists(draft, parentPath[0]) && !isValidTopGroupName(parentPath[0])) continue;
      const res = addChildrenToParentPath(draft, parentPath, children, featureDict);
      if (res.added.length) {
        logs.push(`${parentPath.join('/')}: 新增 ${res.added.join('、')}`);
        draft.context.lastCreatedGroup = res.added[res.added.length - 1];
      }
      draft.context.lastAddChildren = { sourceParent: parentPath.join('/'), children };
      continue;
    }

    if (type === 'set_group_param') {
      const groupName = normalizeGroupLabel(op.group || '');
      const field = String(op.field || '').trim();
      if (!groupName || !validGroupField(field)) continue;
      ensureGroupField(draft, field);
      let group = findGroupByName(draft.groups, groupName);
      if (!group) {
        const cands = resolveContextParents(draft, groupName);
        if (cands.length) group = findGroupByName(draft.groups, cands[0]);
      }
      if (!group) continue;
      const value = String(op.value ?? '').trim();
      const allowed = groupFieldAllowedValues(field);
      if (allowed.length && value && !allowed.includes(value)) {
        logs.push(`${groupName}: ${field} 不支持「${value}」，可选值：${allowed.join('、')}`);
        continue;
      }
      group.params[field] = value;
      logs.push(`${groupName}: ${field}=${group.params[field]}`);
      continue;
    }

    if (type === 'set_group_features') {
      const groupName = normalizeGroupLabel(op.group || '');
      if (!groupName) continue;
      let group = findGroupByName(draft.groups, groupName);
      if (!group) {
        const cands = resolveContextParents(draft, groupName);
        if (cands.length) group = findGroupByName(draft.groups, cands[0]);
      }
      if (!group) continue;
      const features = (Array.isArray(op.features) ? op.features : [])
        .map((f) => String(f || '').trim())
        .filter((f) => f && featureDict.includes(f));
      group.params['特征选择'] = features.join(',');
      logs.push(`${groupName}: 特征选择=${group.params['特征选择'] || '未设置'}`);
      continue;
    }
  }

  syncGroupFeatureFieldsByPart(draft);
  return { draft, logs };
}

async function applyMessageWithLlm(inputDraft, message, featureDict) {
  const draft = normalizeDraft(inputDraft);
  const beforeSig = JSON.stringify({
    partTemplateFields: draft.partTemplateFields,
    partParams: draft.partParams,
    groupTemplateFields: draft.groupTemplateFields,
    groups: draft.groups
  });
  const settings = readSettings();
  const enabled = !!settings.llmEnabled;
  if (!enabled) return null;

  const provider = settings.provider || 'openai_compatible';
  let parsed;
  try {
    parsed = provider === 'gemini'
      ? await parseByGemini(settings, message, draft, featureDict)
      : await parseByOpenAICompatible(settings, message, draft, featureDict);
  } catch (_) {
    return null;
  }

  const operations = Array.isArray(parsed.operations) ? parsed.operations : [];
  const llmUnderstanding = String(parsed.canonical_text || '').trim();
  if (!operations.length) {
    const canonical = llmUnderstanding;
    if (!canonical) return null;
    const result = applyMessage(draft, canonical, featureDict);
    if (result && result.draft) return { ...result, llmUsed: true, llmUnderstanding: canonical };
    return null;
  }

  const applied = applyLlmOperations(draft, operations, featureDict);
  // Keep explicit part-field mentions from raw user input,
  // even when LLM operations omit some fields.
  parsePartFieldMentions(applied.draft, message);
  syncGroupFeatureFieldsByPart(applied.draft);
  const nestedHintLogs = applyExplicitNestedIntentHints(applied.draft, message, featureDict);
  if (nestedHintLogs.length) {
    applied.logs.push(...nestedHintLogs);
  }
  const mirrorHintLogs = applyExplicitMirrorHints(applied.draft, message);
  if (mirrorHintLogs.length) {
    applied.logs.push(...mirrorHintLogs);
  }
  const paramHintLogs = applyExplicitParamHints(applied.draft, message);
  if (paramHintLogs.length) {
    applied.logs.push(...paramHintLogs);
  }
  const afterSig = JSON.stringify({
    partTemplateFields: applied.draft.partTemplateFields,
    partParams: applied.draft.partParams,
    groupTemplateFields: applied.draft.groupTemplateFields,
    groups: applied.draft.groups
  });
  if (beforeSig === afterSig) {
    if (applied.logs.length) {
      const replyNoChange = String(parsed.assistant_reply || '').trim() || applied.logs.join('；');
      return { draft: applied.draft, reply: replyNoChange, llmUsed: true, llmUnderstanding };
    }
    return null;
  }
  const reply = String(parsed.assistant_reply || '').trim() || (applied.logs.length ? applied.logs.join('；') : '已根据你的描述更新模板。');
  return { draft: applied.draft, reply, llmUsed: true, llmUnderstanding };
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function jsonBodyError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function readJsonBody(req, { maxBytes = MAX_JSON_BODY_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    let rejected = false;

    req.on('data', (chunk) => {
      if (rejected) return;
      bytes += chunk.length;
      if (bytes > maxBytes) {
        rejected = true;
        reject(jsonBodyError(413, `请求体过大，最大允许 ${maxBytes} 字节`));
        return;
      }
      body += chunk.toString('utf8');
    });

    req.on('end', () => {
      if (rejected) return;
      const trimmed = body.trim();
      if (!trimmed) {
        resolve({});
        return;
      }
      const parsed = safeJsonParse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        reject(jsonBodyError(400, '请求 JSON 格式无效'));
        return;
      }
      resolve(parsed);
    });

    req.on('error', (e) => {
      if (!rejected) reject(jsonBodyError(400, `读取请求失败：${e.message}`));
    });
  });
}

function sendJson(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function getContentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

function readFeatureCatalog() {
  if (!fs.existsSync(FEATURE_FILE)) return { flat: [], tree: [] };
  const xml = fs.readFileSync(FEATURE_FILE, 'utf8');
  const root = [];
  const stack = [];
  const flat = new Set();
  const tokenRe = /<Item\s+name=['"]([^'"]+)['"]\s*\/>|<Item\s+name=['"]([^'"]+)['"]\s*>|<\/Item>/g;
  let m;
  while ((m = tokenRe.exec(xml))) {
    if (m[0].startsWith('</Item')) {
      stack.pop();
      continue;
    }
    const name = (m[1] || m[2] || '').trim();
    if (!name) continue;
    flat.add(name);
    const node = { name, children: [] };
    if (stack.length) stack[stack.length - 1].children.push(node);
    else root.push(node);
    if (!m[1]) stack.push(node); // open tag with children
  }
  return { flat: Array.from(flat), tree: root };
}

function readFeatures() {
  return readFeatureCatalog().flat;
}

function listXmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listXmlFiles(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.xml')) out.push(full);
  }
  return out;
}

function xmlAttr(tag, name) {
  const re = new RegExp(`${name}\\s*=\\s*(['"])(.*?)\\1`);
  const m = re.exec(tag);
  return m ? m[2] : '';
}

function extractFirstBlock(text, startRe) {
  const startMatch = startRe.exec(text);
  if (!startMatch) return '';
  const start = startMatch.index;
  const openEnd = text.indexOf('>', start);
  if (openEnd < 0) return '';
  let depth = 1;
  const tokenRe = /<Item\b[^>]*>|<\/Item>/g;
  tokenRe.lastIndex = openEnd + 1;
  let m;
  while ((m = tokenRe.exec(text))) {
    if (m[0].startsWith('</Item')) {
      depth--;
      if (depth === 0) return text.slice(start, tokenRe.lastIndex);
    } else if (!m[0].endsWith('/>')) {
      depth++;
    }
  }
  return '';
}

function parseTemplateFields(xml, type) {
  const block = extractFirstBlock(xml, new RegExp(`<Item\\b[^>]*type=["']${type}["'][^>]*>`));
  const fields = [];
  const itemRe = /<Item\b([^>]*)\/>/g;
  let m;
  while ((m = itemRe.exec(block))) {
    const tag = m[0];
    const name = xmlAttr(tag, 'name').trim();
    if (name && !fields.includes(name)) fields.push(name);
  }
  return fields;
}

function parseParams(block) {
  const params = {};
  const paramsBlock = /<Params>([\s\S]*?)<\/Params>/.exec(block);
  if (!paramsBlock) return params;
  const paramRe = /<param\b([^>]*)\/>/g;
  let m;
  while ((m = paramRe.exec(paramsBlock[1]))) {
    const tag = m[0];
    const name = xmlAttr(tag, 'name').trim();
    if (!name) continue;
    params[name] = xmlAttr(tag, 'value');
  }
  return params;
}

function parseGroupItems(xml) {
  const groups = [];
  const stack = [];
  const tokenRe = /<Item\b[^>]*type=["']Group["'][^>]*>|<\/Item>/g;
  let m;
  while ((m = tokenRe.exec(xml))) {
    const token = m[0];
    if (token.startsWith('</Item')) {
      if (stack.length) stack.pop();
      continue;
    }
    const openEnd = tokenRe.lastIndex;
    const paramsStart = xml.indexOf('<Params>', openEnd);
    const paramsEnd = paramsStart >= 0 ? xml.indexOf('</Params>', paramsStart) : -1;
    const paramsBlock = paramsStart >= 0 && paramsEnd >= 0
      ? xml.slice(paramsStart, paramsEnd + '</Params>'.length)
      : '';
    const params = parseParams(paramsBlock);
    const name = params['名称'] || xmlAttr(token, 'name') || '未命名分组';
    const node = {
      id: uid(),
      name,
      params: { '名称': name, ...params },
      children: []
    };
    if (stack.length) stack[stack.length - 1].children.push(node);
    else groups.push(node);
    stack.push(node);
  }
  return groups;
}

function collectGroupStats(groups) {
  const groupNames = [];
  const featureSelections = [];
  let groupCount = 0;
  let depth = 0;

  const walk = (nodes, level) => {
    depth = Math.max(depth, level);
    for (const node of nodes) {
      groupCount++;
      if (node.name && !groupNames.includes(node.name)) groupNames.push(node.name);
      const featureValue = node.params && node.params['特征选择'];
      if (featureValue) {
        for (const item of String(featureValue).split(',')) {
          const value = item.trim();
          if (value && !featureSelections.includes(value)) featureSelections.push(value);
        }
      }
      walk(node.children || [], level + 1);
    }
  };

  walk(groups, 1);
  return { groupNames, featureSelections, groupCount, depth };
}

function parseTemplateXml(filePath) {
  const xml = fs.readFileSync(filePath, 'utf8');
  const partTemplateFields = parseTemplateFields(xml, 'Part_Template');
  const groupTemplateFields = parseTemplateFields(xml, 'Group_Template');
  const partBlock = extractFirstBlock(xml, /<Item\b[^>]*type=["']Part["'][^>]*>/);
  const partParams = parseParams(partBlock);
  const groups = parseGroupItems(partBlock || xml);
  const stats = collectGroupStats(groups);
  const filename = path.basename(filePath);
  const displayName = filename.replace(/\.xml$/i, '');
  const id = crypto.createHash('sha1').update(path.relative(TEMPLATE_DIR, filePath)).digest('hex').slice(0, 12);

  return {
    id,
    filename,
    displayName,
    sourcePath: filePath,
    relativePath: path.relative(TEMPLATE_DIR, filePath),
    partTemplateFields,
    groupTemplateFields,
    partParams,
    groups,
    groupNames: stats.groupNames,
    featureSelections: stats.featureSelections,
    groupCount: stats.groupCount,
    depth: stats.depth
  };
}

function publicTemplateItem(item) {
  return {
    id: item.id,
    filename: item.filename,
    displayName: item.displayName,
    sourcePath: item.sourcePath,
    relativePath: item.relativePath,
    partTemplateFields: item.partTemplateFields,
    groupTemplateFields: item.groupTemplateFields,
    groupNames: item.groupNames,
    featureSelections: item.featureSelections,
    groupCount: item.groupCount,
    depth: item.depth
  };
}

function readTemplateCatalog() {
  return listXmlFiles(TEMPLATE_DIR)
    .map((filePath) => {
      try {
        return parseTemplateXml(filePath);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

function keywordHits(text, values) {
  const hits = [];
  const source = String(text || '').toLowerCase();
  if (!source) return hits;
  for (const value of values || []) {
    const token = String(value || '').trim();
    if (!token) continue;
    const normalized = token.toLowerCase();
    if ((source.includes(normalized) || normalized.includes(source)) && !hits.includes(token)) hits.push(token);
  }
  return hits;
}

function domainKeywordHits(text, values) {
  const hits = keywordHits(text, values);
  const source = String(text || '').toLowerCase();
  const domainTerms = ['衬套', '回转体', '轴类', '套类', 'a侧', 'b侧', 'a测', 'b测', '端面', '外圆', '孔', '外环槽', '内环槽', '倒角', '倒圆', '壳体', '平面', '通槽', '孔系', '凹槽'];
  for (const value of values || []) {
    const token = String(value || '').trim();
    if (!token || hits.includes(token)) continue;
    const normalized = token.toLowerCase();
    const matched = domainTerms.some((term) => source.includes(term) && normalized.includes(term));
    if (matched) hits.push(token);
  }
  return hits;
}

function inferPartTypeHits(text, item) {
  const source = String(text || '').toLowerCase();
  if (!source) return [];
  const templateText = `${item.filename} ${item.displayName} ${item.groupNames.join(' ')} ${item.featureSelections.join(' ')} ${item.partTemplateFields.join(' ')} ${item.groupTemplateFields.join(' ')}`.toLowerCase();
  const rules = [
    {
      label: '衬套/套类',
      textTerms: ['衬套', '套', '套类'],
      templateTerms: ['衬套', '套类']
    },
    {
      label: '回转体/轴类',
      textTerms: ['回转体', '轴类', '主轴线', '外圆', '端面'],
      templateTerms: ['回转体', '轴类', '主轴线', '有主轴线', '衬套']
    },
    {
      label: '壳体/多面加工',
      textTerms: ['壳体', '箱体', '多面', '六面', '孔系', '通槽'],
      templateTerms: ['壳体', '箱体', '主方向6', '是否需要加工面分离', '方向6']
    }
  ];
  return rules
    .filter((rule) => {
      const textMatched = rule.textTerms.some((term) => source.includes(term.toLowerCase()));
      const templateMatched = rule.templateTerms.some((term) => templateText.includes(term.toLowerCase()));
      return textMatched && templateMatched;
    })
    .map((rule) => rule.label);
}

function scoreTemplate(text, item) {
  const reasons = [];
  let score = 0;

  const typeHits = inferPartTypeHits(text, item);
  if (typeHits.length) {
    score += 35 + Math.min(15, typeHits.length * 5);
    reasons.push(`零件类型命中：${typeHits.join('、')}`);
  }

  const featureHits = domainKeywordHits(text, item.featureSelections);
  if (featureHits.length) {
    score += Math.min(30, featureHits.length * 8);
    reasons.push(`特征命中：${featureHits.join('、')}`);
  }

  const groupHits = domainKeywordHits(text, item.groupNames);
  if (groupHits.length) {
    score += Math.min(20, groupHits.length * 5);
    reasons.push(`分组名称命中：${groupHits.join('、')}`);
  }

  const fieldHits = keywordHits(text, [...item.partTemplateFields, ...item.groupTemplateFields]);
  if (fieldHits.length) {
    score += Math.min(15, fieldHits.length * 4);
    reasons.push(`参数字段命中：${fieldHits.join('、')}`);
  }

  if (score === 0 && item.groupCount > 0) {
    score = 1;
    reasons.push('作为可用样例模板列入备选');
  }

  return {
    ...publicTemplateItem(item),
    score,
    confidence: Math.min(0.99, Number((score / 100).toFixed(2))),
    reasons
  };
}

function recommendGroupTemplates({ text = '', catalog = readTemplateCatalog(), limit = 5 } = {}) {
  const cleanText = String(text || '').trim();
  if (!cleanText) return [];
  return catalog
    .map((item) => scoreTemplate(cleanText, item))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.groupCount - a.groupCount || a.filename.localeCompare(b.filename, 'zh'))
    .slice(0, limit);
}

function listRecognitionTemplates() {
  return RECOGNITION_TEMPLATES.map((item) => ({ ...item }));
}

function recognitionHaystack({ text = '', groupTemplate = null, draft = null } = {}) {
  const groupNames = [];
  const featureSelections = [];
  if (groupTemplate) {
    groupNames.push(...(groupTemplate.groupNames || []));
    featureSelections.push(...(groupTemplate.featureSelections || []));
  }
  if (draft && Array.isArray(draft.groups)) {
    const stats = collectGroupStats(draft.groups);
    groupNames.push(...stats.groupNames);
    featureSelections.push(...stats.featureSelections);
  }
  const partFields = draft && Array.isArray(draft.partTemplateFields) ? draft.partTemplateFields : [];
  return `${text} ${groupNames.join(' ')} ${featureSelections.join(' ')} ${partFields.join(' ')}`;
}

function scoreRecognitionTemplate(input, template) {
  const haystack = recognitionHaystack(input);
  const reasons = [];
  let score = 0;

  const typeHits = keywordHits(haystack, template.partTypes || []);
  if (typeHits.length) {
    score += Math.min(35, typeHits.length * 14);
    reasons.push(`零件类型命中：${typeHits.join('、')}`);
  }

  const keywordMatches = keywordHits(haystack, template.keywords || []);
  if (keywordMatches.length) {
    score += Math.min(35, keywordMatches.length * 6);
    reasons.push(`识别关键词命中：${keywordMatches.join('、')}`);
  }

  const fieldMatches = keywordHits(haystack, template.requiredPartFields || []);
  if (fieldMatches.length) {
    score += Math.min(20, fieldMatches.length * 7);
    reasons.push(`零件参数匹配：${fieldMatches.join('、')}`);
  }

  const recognizeMatches = keywordHits(haystack, template.recognizes || []);
  if (recognizeMatches.length) {
    score += Math.min(20, recognizeMatches.length * 5);
    reasons.push(`可识别对象匹配：${recognizeMatches.join('、')}`);
  }

  if (score === 0) {
    score = 1;
    reasons.push('作为可用识别模板列入备选');
  }

  return {
    ...template,
    score,
    confidence: Math.min(0.99, Number((score / 100).toFixed(2))),
    reasons
  };
}

function recommendRecognitionTemplates({
  text = '',
  groupTemplate = null,
  draft = null,
  templates = listRecognitionTemplates(),
  limit = 3
} = {}) {
  return templates
    .map((template) => scoreRecognitionTemplate({ text, groupTemplate, draft }, template))
    .filter((template) => template.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh'))
    .slice(0, limit);
}

function cloneTemplateGroups(groups) {
  return (groups || []).map((node) => ({
    id: uid(),
    name: node.name,
    params: { ...(node.params || {}), '名称': node.name },
    children: cloneTemplateGroups(node.children || [])
  }));
}

function applyGroupTemplate(templateId, { catalog = readTemplateCatalog() } = {}) {
  const selected = catalog.find((item) => item.id === templateId || item.filename === templateId || item.relativePath === templateId);
  if (!selected) return { ok: false, message: '未找到分组模板' };
  const draft = normalizeDraft({
    ...defaultDraft(),
    partTemplateFields: [...selected.partTemplateFields],
    groupTemplateFields: [...selected.groupTemplateFields],
    partParams: { ...selected.partParams },
    groups: cloneTemplateGroups(selected.groups)
  });
  return {
    ok: true,
    template: publicTemplateItem(selected),
    draft,
    summary: buildGroupStructureText(draft.groups || [])
  };
}

function fuzzyClarificationQuestion() {
  return '这个零件更接近衬套/轴类、壳体/箱体，还是简单小件？';
}

function generateFuzzyTemplate({ text = '', limit = 3, catalog = readTemplateCatalog() } = {}) {
  const cleanText = String(text || '').trim();
  if (!cleanText) {
    return {
      ok: true,
      mode: 'needs_clarification',
      recommendations: [],
      question: fuzzyClarificationQuestion()
    };
  }

  const recommendations = recommendGroupTemplates({
    text: cleanText,
    catalog,
    limit: Number(limit) || 3
  });
  const reliableRecommendations = recommendations.filter((item) => (item.confidence || 0) >= FUZZY_CHOICE_CONFIDENCE);
  const top = reliableRecommendations[0] || null;

  if (!top) {
    return {
      ok: true,
      mode: 'needs_clarification',
      recommendations: [],
      question: fuzzyClarificationQuestion()
    };
  }

  if ((top.confidence || 0) >= FUZZY_AUTO_APPLY_CONFIDENCE) {
    const applied = applyGroupTemplate(top.id, { catalog });
    if (!applied.ok) {
      return {
        ok: false,
        mode: 'error',
        message: applied.message || '应用推荐模板失败'
      };
    }

    const xml = buildXml(applied.draft);
    const recognitionRecommendation = recommendRecognitionTemplates({
      text: cleanText,
      groupTemplate: applied.template,
      draft: applied.draft,
      limit: 1
    })[0] || null;

    return {
      ok: true,
      mode: 'auto_applied',
      recommendations: reliableRecommendations,
      template: applied.template,
      draft: applied.draft,
      xml,
      structureSummary: applied.summary,
      recognitionRecommendation,
      reply: `已按高匹配度样例自动生成模板「${applied.template.displayName || applied.template.filename}」。`
    };
  }

  return {
    ok: true,
    mode: 'needs_choice',
    recommendations: reliableRecommendations,
    question: '我找到几个相近模板，请选择一个应用。'
  };
}

const AGENT_STAGE_TEMPLATE_SELECTION = 'TemplateSelection';
const AGENT_WORKFLOW_STEPS = [
  { id: 'select_group_template', title: '选择分组模板' }
];
const agentSessions = new Map();

function createAgentSessionId() {
  return `agent_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function createAgentWorkflow({
  currentStep = 'select_group_template',
  selectGroupTemplateStatus = 'pending'
} = {}) {
  return {
    currentStep,
    steps: AGENT_WORKFLOW_STEPS.map((step, index) => ({
      ...step,
      status: index === 0 ? selectGroupTemplateStatus : 'pending'
    }))
  };
}

function templateCandidateOption(item, selectedTemplateId = '') {
  return {
    id: item.id,
    choiceId: item.id,
    templateId: item.id,
    title: item.displayName || item.filename,
    filename: item.filename,
    confidence: item.confidence || 0,
    score: item.score || 0,
    reasons: item.reasons || [],
    groupCount: item.groupCount || 0,
    depth: item.depth || 0,
    groupNames: item.groupNames || [],
    featureSelections: item.featureSelections || [],
    selected: !!selectedTemplateId && selectedTemplateId === item.id
  };
}

function templateSelectionUi(recommendations, selectedTemplateId = '') {
  if (!recommendations.length) return [];
  return [
    {
      type: 'template_candidates',
      stage: AGENT_STAGE_TEMPLATE_SELECTION,
      title: '请选择分组模板',
      options: recommendations.map((item) => templateCandidateOption(item, selectedTemplateId))
    }
  ];
}

function upsertAgentSession(sessionId, patch) {
  const existing = sessionId ? agentSessions.get(sessionId) : null;
  const now = new Date().toISOString();
  const session = {
    id: existing ? existing.id : (sessionId || createAgentSessionId()),
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
    stage: AGENT_STAGE_TEMPLATE_SELECTION,
    message: '',
    recommendations: [],
    selectedTemplate: null,
    draft: null,
    xml: '',
    structureSummary: '',
    workflow: createAgentWorkflow(),
    ...(existing || {}),
    ...(patch || {})
  };
  session.updatedAt = now;
  agentSessions.set(session.id, session);
  return session;
}

function publicAgentSession(session) {
  if (!session) return null;
  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    stage: session.stage,
    message: session.message,
    selectedTemplate: session.selectedTemplate,
    structureSummary: session.structureSummary,
    workflow: session.workflow
  };
}

function createTemplateSelectionAgentResponse({ text = '', sessionId = '', limit = 3 } = {}) {
  const message = String(text || '').trim();
  const rawRecommendations = message
    ? recommendGroupTemplates({ text: message, limit: Math.max(Number(limit) || 3, 5) })
    : [];
  const recommendations = rawRecommendations
    .slice(0, Number(limit) || 3);
  const hasCandidates = recommendations.length > 0;
  const workflow = createAgentWorkflow({
    currentStep: 'select_group_template',
    selectGroupTemplateStatus: hasCandidates ? 'awaiting_choice' : 'needs_input'
  });
  const session = upsertAgentSession(sessionId, {
    stage: AGENT_STAGE_TEMPLATE_SELECTION,
    message,
    recommendations,
    selectedTemplate: null,
    workflow
  });

  return {
    ok: true,
    sessionId: session.id,
    stage: AGENT_STAGE_TEMPLATE_SELECTION,
    reply: hasCandidates
      ? '我找到几个接近的分组模板，请选择一个作为基础。'
      : '我还需要更多零件类型、加工侧或典型特征信息，才能推荐分组模板。',
    workflow,
    ui: templateSelectionUi(recommendations),
    recommendations,
    session: publicAgentSession(session)
  };
}

function applyTemplateSelectionEvent({ sessionId = '', templateId = '' } = {}) {
  const session = sessionId ? agentSessions.get(sessionId) : null;
  const selectedTemplateId = String(templateId || '').trim();
  if (!selectedTemplateId) {
    return { ok: false, statusCode: 400, message: '缺少要选择的分组模板 ID' };
  }

  const applied = applyGroupTemplate(selectedTemplateId);
  if (!applied.ok) {
    return { ok: false, statusCode: 404, message: applied.message || '未找到分组模板' };
  }

  const xml = buildXml(applied.draft);
  const workflow = createAgentWorkflow({
    currentStep: 'select_group_template',
    selectGroupTemplateStatus: 'completed'
  });
  const recommendations = session && Array.isArray(session.recommendations)
    ? session.recommendations
    : [applied.template];
  const nextSession = upsertAgentSession(session ? session.id : sessionId, {
    stage: AGENT_STAGE_TEMPLATE_SELECTION,
    selectedTemplate: applied.template,
    draft: applied.draft,
    xml,
    structureSummary: applied.summary,
    workflow,
    recommendations
  });

  return {
    ok: true,
    sessionId: nextSession.id,
    stage: AGENT_STAGE_TEMPLATE_SELECTION,
    reply: `已确认分组模板「${applied.template.displayName || applied.template.filename}」，并生成当前分组结构预览。`,
    workflow,
    ui: templateSelectionUi(recommendations, applied.template.id),
    template: applied.template,
    draft: applied.draft,
    xml,
    structureSummary: applied.summary,
    session: publicAgentSession(nextSession)
  };
}

function handleAgentEvent(input = {}) {
  const type = String(input.type || '').trim();
  const stage = String(input.stage || AGENT_STAGE_TEMPLATE_SELECTION).trim();
  if (stage && stage !== AGENT_STAGE_TEMPLATE_SELECTION) {
    return { ok: false, statusCode: 400, message: `暂不支持的智能体阶段：${stage}` };
  }
  if (type !== 'ui.option_selected' && type !== 'template.selected') {
    return { ok: false, statusCode: 400, message: `暂不支持的智能体事件：${type || '(空)'}` };
  }

  const payload = input.payload && typeof input.payload === 'object' ? input.payload : {};
  const templateId = payload.templateId || input.templateId || input.choiceId;
  return applyTemplateSelectionEvent({
    sessionId: String(input.sessionId || '').trim(),
    templateId
  });
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function xmlUuid() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return crypto.randomBytes(16).toString('hex');
}

function defaultDraft() {
  return {
    context: {
      lastAddChildren: null,
      pendingClarification: null,
      lastMentionedGroups: [],
      lastPrimaryParent: null,
      lastPairGroups: [],
      lastCreatedGroup: null
    },
    partTemplateFields: ['主方向1', '原点'],
    groupTemplateFields: ['依赖方向', '依赖方式', '特征选择'],
    partParams: {
      '主方向1': '',
      '原点': ''
    },
    groups: []
  };
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function normalizeDraft(input) {
  const base = defaultDraft();
  if (!input || typeof input !== 'object') return base;
  const draft = deepClone(input);
  draft.context = { ...base.context, ...(draft.context || {}) };
  draft.partTemplateFields = Array.isArray(draft.partTemplateFields) ? draft.partTemplateFields : base.partTemplateFields;
  draft.groupTemplateFields = Array.isArray(draft.groupTemplateFields) ? draft.groupTemplateFields : base.groupTemplateFields;
  draft.partParams = draft.partParams && typeof draft.partParams === 'object' ? draft.partParams : base.partParams;
  draft.groups = Array.isArray(draft.groups) ? draft.groups : [];
  syncGroupFeatureFieldsByPart(draft);
  return draft;
}

function ensurePartField(draft, field) {
  if (!draft.partTemplateFields.includes(field)) {
    draft.partTemplateFields.push(field);
  }
  if (!(field in draft.partParams)) {
    draft.partParams[field] = defaultPartFieldValue(field);
  }
}

function ensureGroupField(draft, field) {
  if (!draft.groupTemplateFields.includes(field)) {
    draft.groupTemplateFields.push(field);
  }
  forEachGroup(draft.groups, (g) => {
    if (!(field in g.params)) g.params[field] = defaultGroupFieldValue(field);
  });
}

function removeGroupField(draft, field) {
  draft.groupTemplateFields = draft.groupTemplateFields.filter((f) => f !== field);
  forEachGroup(draft.groups, (g) => {
    if (g.params && field in g.params) delete g.params[field];
  });
}

function syncGroupFeatureFieldsByPart(draft) {
  const hasSpindleAxis = (draft.partTemplateFields || []).includes(PART_FIELD_SPINDLE_AXIS);
  const hasSpindleFeature = (draft.groupTemplateFields || []).includes(GROUP_FIELD_SPINDLE_FEATURE);
  if (hasSpindleAxis && !hasSpindleFeature) {
    ensureGroupField(draft, GROUP_FIELD_SPINDLE_FEATURE);
  } else if (!hasSpindleAxis && hasSpindleFeature) {
    removeGroupField(draft, GROUP_FIELD_SPINDLE_FEATURE);
  }

  const hasAxis = (draft.partTemplateFields || []).includes(PART_FIELD_AXIS);
  const hasGeneralAxisFeature = (draft.groupTemplateFields || []).includes(GROUP_FIELD_GENERAL_AXIS_FEATURE);
  if (hasAxis && !hasGeneralAxisFeature) {
    ensureGroupField(draft, GROUP_FIELD_GENERAL_AXIS_FEATURE);
  } else if (!hasAxis && hasGeneralAxisFeature) {
    removeGroupField(draft, GROUP_FIELD_GENERAL_AXIS_FEATURE);
  }
}

function fieldMeta(name, scope) {
  const map = scope === 'part' ? PART_FIELD_META : GROUP_FIELD_META;
  return map[name] || { type: 'String', defaultval: '', data_type: '', respath: '' };
}

function defaultFromDefaultVal(defaultval) {
  if (!defaultval) return '';
  const [selected] = defaultval.split('|');
  return selected || '';
}

function parseMultiOptions(defaultval) {
  if (!defaultval) return [];
  const pipe = String(defaultval).split('|');
  const optionSeg = pipe.length > 1 ? pipe[1] : pipe[0];
  return String(optionSeg)
    .split(';')
    .map((v) => v.trim())
    .filter(Boolean);
}

function groupFieldAllowedValues(field) {
  const meta = fieldMeta(field, 'group');
  if (!meta || meta.type !== 'Multi') return [];
  return parseMultiOptions(meta.defaultval);
}

function defaultPartFieldValue(field) {
  const meta = fieldMeta(field, 'part');
  if (meta.type === 'Multi') return defaultFromDefaultVal(meta.defaultval);
  return '';
}

function defaultGroupFieldValue(field) {
  if (field === '依赖方向') return '从父';
  if (field === '依赖方式') return '无';
  const meta = fieldMeta(field, 'group');
  if (meta.type === 'Multi') return defaultFromDefaultVal(meta.defaultval);
  return '';
}

function uniqueNonEmptyStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function validateTemplateFields(fields, { label, supportedFields = null } = {}) {
  const errors = [];
  const seen = new Set();
  const list = Array.isArray(fields) ? fields : [];
  list.forEach((field, index) => {
    const name = String(field || '').trim();
    if (!name) {
      errors.push(`${label} 第 ${index + 1} 项为空`);
      return;
    }
    if (seen.has(name)) errors.push(`${label} 字段重复：${name}`);
    seen.add(name);
    if (supportedFields && !supportedFields.includes(name)) {
      errors.push(`${label} 包含不支持字段：${name}`);
    }
  });
  return errors;
}

function validateMultiParamValue(errors, field, value, groupPath) {
  const allowed = groupFieldAllowedValues(field);
  if (!allowed.length) return;
  const actual = String(value || '').trim();
  if (!actual) return;
  if (!allowed.includes(actual)) {
    errors.push(`${groupPath} 参数「${field}」值无效：${actual}，可选值：${allowed.join('、')}`);
  }
}

function validateFeatureSelectionValue(errors, value, featureSet, groupPath) {
  const features = uniqueNonEmptyStrings(String(value || '').split(/[,，]/));
  if (!features.length || !featureSet) return;
  for (const feature of features) {
    if (!featureSet.has(feature)) {
      errors.push(`${groupPath} 特征选择包含未知特征：${feature}`);
    }
  }
}

function validateGroupNodes(nodes, groupTemplateFields, featureSet, parentPath = '根分组') {
  const errors = [];
  const siblingNames = new Set();
  const list = Array.isArray(nodes) ? nodes : [];

  list.forEach((node, index) => {
    const rawName = node && typeof node === 'object' ? node.name : '';
    const name = String(rawName || '').trim();
    const pathLabel = name ? `${parentPath}/${name}` : `${parentPath}/第 ${index + 1} 个分组`;

    if (!name) {
      errors.push(`${pathLabel} 名称为空`);
    } else if (siblingNames.has(name)) {
      errors.push(`${parentPath} 下存在重复分组名：${name}`);
    }
    if (name) siblingNames.add(name);

    const params = node && node.params && typeof node.params === 'object' ? node.params : {};
    for (const field of groupTemplateFields) {
      if (field === '名称') continue;
      if (!(field in params)) {
        errors.push(`${pathLabel} 缺少参数：${field}`);
        continue;
      }
      validateMultiParamValue(errors, field, params[field], pathLabel);
      if (field === '特征选择') {
        validateFeatureSelectionValue(errors, params[field], featureSet, pathLabel);
      }
    }

    const children = node && Array.isArray(node.children) ? node.children : [];
    errors.push(...validateGroupNodes(children, groupTemplateFields, featureSet, pathLabel));
  });

  return errors;
}

function validateDraft(inputDraft, { features = null } = {}) {
  const draft = normalizeDraft(inputDraft);
  const errors = [];
  const partFields = uniqueNonEmptyStrings(draft.partTemplateFields);
  const groupFields = uniqueNonEmptyStrings(draft.groupTemplateFields);

  errors.push(...validateTemplateFields(draft.partTemplateFields, {
    label: 'Part_Template',
    supportedFields: SUPPORTED_PART_FIELDS
  }));
  errors.push(...validateTemplateFields(draft.groupTemplateFields, {
    label: 'Group_Template'
  }));

  if (!partFields.length) errors.push('Part_Template 至少需要包含 1 个字段');
  if (!groupFields.length) errors.push('Group_Template 至少需要包含 1 个字段');
  for (const required of DEFAULT_GROUP_TEMPLATE_FIELDS) {
    if (!groupFields.includes(required)) errors.push(`Group_Template 缺少基础字段：${required}`);
  }

  if (partFields.includes(PART_FIELD_SPINDLE_AXIS) && !groupFields.includes(GROUP_FIELD_SPINDLE_FEATURE)) {
    errors.push(`选择「${PART_FIELD_SPINDLE_AXIS}」时 Group_Template 必须包含「${GROUP_FIELD_SPINDLE_FEATURE}」`);
  }
  if (partFields.includes(PART_FIELD_AXIS) && !groupFields.includes(GROUP_FIELD_GENERAL_AXIS_FEATURE)) {
    errors.push(`选择「${PART_FIELD_AXIS}」时 Group_Template 必须包含「${GROUP_FIELD_GENERAL_AXIS_FEATURE}」`);
  }

  const featureSet = Array.isArray(features) ? new Set(features) : null;
  errors.push(...validateGroupNodes(draft.groups, groupFields, featureSet));

  return errors;
}

function forEachGroup(groups, fn) {
  for (const g of groups) {
    fn(g);
    if (Array.isArray(g.children) && g.children.length) {
      forEachGroup(g.children, fn);
    }
  }
}

function findGroupByName(groups, name) {
  for (const g of groups) {
    if (g.name === name) return g;
    const child = findGroupByName(g.children || [], name);
    if (child) return child;
  }
  return null;
}

function hasChildName(parent, childName) {
  return (parent.children || []).some((c) => c.name === childName);
}

function findDirectChild(parent, name) {
  return (parent.children || []).find((c) => c.name === name) || null;
}

function createGroupNode(name, draft, featureNames = []) {
  const params = { '名称': name };
  for (const field of draft.groupTemplateFields) {
    if (field === '特征选择') params[field] = featureNames.join(',');
    else params[field] = defaultGroupFieldValue(field);
  }
  return { id: uid(), name, params, children: [] };
}

function upsertTopGroup(draft, name) {
  let g = findGroupByName(draft.groups, name);
  if (!g) {
    g = createGroupNode(name, draft, []);
    if (g.params['依赖方向']) g.params['依赖方向'] = '任意方向';
    if (g.params['依赖方式']) g.params['依赖方式'] = '无';
    draft.groups.push(g);
  }
  return g;
}

function tokenizeChildren(text) {
  return text
    .replace(/(子分组|分组|两个|2个|二个|个)/g, ' ')
    .split(/[、,，和\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^[-—]+$/.test(s))
    .filter((s) => !/也一样|同理|同上/.test(s));
}

function extractLikelyGroupNames(text) {
  const out = [];
  const re = /([A-Za-z0-9一二三四五六七八九十甲乙丙丁左右前后内外上下]+\s*(?:侧|测)|周边)/g;
  let m;
  while ((m = re.exec(text))) {
    const n = normalizeGroupLabel(m[1] || '');
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

function parseDeclaredTopGroups(text) {
  const all = [];
  const re = /(?:分为|分成|划分为|分组为)\s*([^。；]+)/g;
  let m;
  while ((m = re.exec(text))) {
    let seg = (m[1] || '').trim();
    seg = seg.replace(/(?:共|总共)?\s*(?:\d+|[一二三四五六七八九十两]+)\s*个?\s*分组.*$/g, '').trim();
    const names = extractLikelyGroupNames(seg);
    for (const n of names) {
      if (!all.includes(n)) all.push(n);
    }
  }
  return all;
}

function normalizeGroupLabel(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/^(?:请|帮我|麻烦|我想|我要|希望|需要|还要|还需要|再|继续)+/g, '')
    .replace(/^在/g, '')
    .replace(/A测/g, 'A侧')
    .replace(/B测/g, 'B侧')
    .replace(/(?:下方|下面|下)(?:再|还|继续)?$/g, '')
    .replace(/(?:再|继续)$/g, '')
    .replace(/(?:的)?(?:下方|下面|下)?(?:分组结构|分组)$/g, '')
    .trim();
}

function listGroupNames(groups, out = []) {
  for (const g of groups || []) {
    const n = String(g.name || '').trim();
    if (n) out.push(n);
    listGroupNames(g.children || [], out);
  }
  return out;
}

function bestMatchGroupName(draft, raw) {
  const text = normalizeGroupLabel(raw || '');
  if (!text) return '';
  if (contextGroupExists(draft, text)) return text;
  const names = Array.from(new Set(listGroupNames(draft.groups || []))).sort((a, b) => b.length - a.length);
  for (const n of names) {
    const nn = normalizeGroupLabel(n);
    if (!nn) continue;
    if (text.includes(nn) || nn.includes(text)) return n;
  }
  return '';
}

function isValidTopGroupName(name) {
  const n = normalizeGroupLabel(name || '');
  if (!n) return false;
  if (/我|你|他|她|它|请|帮|需要|新增|添加|创建|分组|下面|下方|在/.test(n)) return false;
  return /^(?:[A-Za-z0-9一二三四五六七八九十甲乙丙丁左右前后内外上下]+(?:侧|测)|周边|主方向[1-6]?|方向[1-6])$/.test(n);
}

function sanitizeChildText(text) {
  let t = String(text || '').trim();
  // remove trailing relation clause like ", B侧跟A侧一样"
  t = t.replace(/[，,]\s*[^，。；]*(?:跟|和|与|同)[^，。；]*(?:一样|相同).*$/g, '').trim();
  // remove short "X也一样" fragments
  t = t.replace(/[，,]?\s*([^，,。；\s]+)\s*也一样/g, '').trim();
  return t;
}

function featureCandidatesByName(name, featureDict) {
  const map = [
    { key: '外圆', value: ['外圆柱面'] },
    { key: '端面', value: ['轴端面', '平面'] },
    { key: '平面', value: ['平面'] },
    { key: '孔', value: ['孔'] },
    { key: '槽', value: ['通槽'] },
    { key: '倒角', value: ['倒角'] },
    { key: '倒圆', value: ['倒圆'] },
    { key: '环槽', value: ['U形外环槽', 'U形内环槽'] }
  ];

  const candidates = [];
  for (const item of map) {
    if (name.includes(item.key)) {
      for (const f of item.value) {
        if (featureDict.includes(f) && !candidates.includes(f)) {
          candidates.push(f);
        }
      }
    }
  }
  return candidates;
}

function addChildrenToParent(draft, parentName, childNames, featureDict) {
  const parent = upsertTopGroup(draft, parentName);
  return addChildrenToNode(draft, parent, childNames, featureDict, parentName);
}

function addChildrenToNode(draft, parent, childNames, featureDict, parentNameText) {
  const added = [];
  const skipped = [];
  const unclear = [];

  for (const childName of childNames) {
    if (hasChildName(parent, childName)) {
      skipped.push(childName);
      continue;
    }
    const features = featureCandidatesByName(childName, featureDict);
    if (!features.length) {
      unclear.push(childName);
    }
    parent.children.push(createGroupNode(childName, draft, features));
    added.push(childName);
  }

  return { added, skipped, unclear, parentName: parentNameText || parent.name || '' };
}

function ensureGroupPath(draft, path, featureDict) {
  const names = (Array.isArray(path) ? path : []).map((x) => String(x || '').trim()).filter(Boolean);
  if (!names.length) return null;
  let cur = upsertTopGroup(draft, names[0]);
  for (let i = 1; i < names.length; i++) {
    const name = names[i];
    let child = findDirectChild(cur, name);
    if (!child) {
      const features = featureCandidatesByName(name, featureDict);
      child = createGroupNode(name, draft, features);
      cur.children = cur.children || [];
      cur.children.push(child);
    }
    cur = child;
  }
  return cur;
}

function addChildrenToParentPath(draft, path, childNames, featureDict) {
  const parent = ensureGroupPath(draft, path, featureDict);
  if (!parent) {
    return { added: [], skipped: [], unclear: [], parentName: '' };
  }
  return addChildrenToNode(
    draft,
    parent,
    childNames,
    featureDict,
    (Array.isArray(path) ? path.join('/') : String(path || ''))
  );
}

function popDirectChildByName(parent, childName) {
  const children = parent.children || [];
  const idx = children.findIndex((c) => c.name === childName);
  if (idx < 0) return null;
  return children.splice(idx, 1)[0] || null;
}

function addChildrenToNestedPathWithRepair(draft, topName, midName, childNames, featureDict) {
  const top = upsertTopGroup(draft, topName);
  const nestedParent = ensureGroupPath(draft, [topName, midName], featureDict);
  if (!nestedParent) return { added: [], skipped: [], unclear: [], parentName: `${topName}/${midName}` };

  const moved = [];
  for (const childName of childNames) {
    if (hasChildName(nestedParent, childName)) continue;
    const movedNode = popDirectChildByName(top, childName);
    if (movedNode) {
      nestedParent.children.push(movedNode);
      moved.push(childName);
    }
  }
  const res = addChildrenToNode(draft, nestedParent, childNames, featureDict, `${topName}/${midName}`);
  if (moved.length) {
    res.added = Array.from(new Set([...(res.added || []), ...moved]));
  }
  return res;
}

function isWeakLabelToken(name) {
  const n = normalizeGroupLabel(name || '');
  if (!n) return true;
  return /^(我|你|他|她|它|想|希望|需要|请|帮|帮我|我要|我想)$/.test(n);
}

function applyExplicitNestedIntentHints(draft, message, featureDict) {
  const text = String(message || '');
  const plans = [];

  const patterns = [
    /在\s*([^，。；\s]+?)\s*(?:的)?\s*([^，。；\s]+?)\s*(?:下|下面|下方)\s*(?:还需要|需要|再|继续)?\s*(?:新增|添加|增加|创建|放入|加入)\s*([^。；]+)/g,
    /([^，。；\s]+(?:侧|测|周边))\s*([^，。；\s]+?)\s*(?:下|下面|下方)\s*(?:还需要|需要|再|继续)?\s*(?:新增|添加|增加|创建|放入|加入)\s*([^。；]+)/g
  ];

  for (const regex of patterns) {
    let m;
    while ((m = regex.exec(text))) {
      const topName = normalizeGroupLabel(m[1] || '');
      const midName = normalizeGroupLabel(m[2] || '');
      const childNames = tokenizeChildren(sanitizeChildText(m[3] || ''));
      if (!topName || !midName || !childNames.length) continue;
      if (isWeakLabelToken(topName) || isWeakLabelToken(midName)) continue;
      // Nested hint is a repair pass: only fire when top exists in current tree.
      if (!contextGroupExists(draft, topName)) continue;
      plans.push({ topName, midName, childNames });
    }
  }

  if (!plans.length) return [];

  // Support "...，B侧也一样"
  const sameRe = /([^，。；\s]+)\s*也一样/g;
  let sm;
  const targets = [];
  while ((sm = sameRe.exec(text))) {
    const t = normalizeGroupLabel(sm[1] || '');
    if (t) targets.push(t);
  }
  if (targets.length) {
    const last = plans[plans.length - 1];
    for (const target of targets) {
      if (target !== last.topName) {
        plans.push({ topName: target, midName: last.midName, childNames: last.childNames });
      }
    }
  }

  const logs = [];
  for (const p of plans) {
    const res = addChildrenToNestedPathWithRepair(draft, p.topName, p.midName, p.childNames, featureDict);
    if (res.added.length) {
      logs.push(`${p.topName}/${p.midName}: 新增 ${res.added.join('、')}`);
      draft.context.lastCreatedGroup = res.added[res.added.length - 1];
      draft.context.lastPrimaryParent = p.midName;
      draft.context.lastMentionedGroups = [p.midName, p.topName, ...(draft.context.lastMentionedGroups || []).filter((n) => n !== p.midName && n !== p.topName)].slice(0, 6);
    }
  }
  return logs;
}

function cloneGroupForMirror(node) {
  const cloned = {
    id: uid(),
    name: node.name,
    params: deepClone(node.params || {}),
    children: []
  };
  cloned.children = (node.children || []).map((c) => cloneGroupForMirror(c));
  return cloned;
}

function mirrorGroupChildrenStructure(draft, targetName, sourceName) {
  const source = findGroupByName(draft.groups, sourceName);
  if (!source) {
    return { ok: false, reason: `未找到来源分组 ${sourceName}` };
  }
  const target = upsertTopGroup(draft, targetName);
  target.children = (source.children || []).map((c) => cloneGroupForMirror(c));
  return {
    ok: true,
    targetName,
    sourceName,
    count: target.children.length
  };
}

function applyExplicitMirrorHints(draft, message) {
  const text = String(message || '');
  const plans = [];

  // Generic mirror sentence patterns, independent of concrete group names.
  // Mirror only when user clearly says "structure is same", not for field value "相同".
  const sameRegex = /([^，。；]+?)\s*(?:下方|下面|下)?(?:分组结构|结构)\s*(?:跟|和|与|同)\s*([^，。；]+?)\s*(?:下方|下面|下)?(?:分组结构|结构)?\s*(?:一样|相同)|([^，。；]+?)\s*(?:跟|和|与|同)\s*([^，。；]+?)\s*(?:一样)/g;
  let m;
  while ((m = sameRegex.exec(text))) {
    const targetRaw = normalizeGroupLabel((m[1] || m[3] || ''));
    const sourceRaw = normalizeGroupLabel((m[2] || m[4] || ''));
    if (!targetRaw || !sourceRaw || targetRaw === sourceRaw) continue;
    plans.push({ targetRaw, sourceRaw });
  }

  const copyRegex = /(?:把|将)\s*([^，。；]+?)\s*(?:下方|下面|下)?(?:分组结构|结构)?\s*(?:复制|同步|应用)\s*(?:到|给)\s*([^，。；]+)/g;
  while ((m = copyRegex.exec(text))) {
    const sourceRaw = normalizeGroupLabel(m[1] || '');
    const targetRaw = normalizeGroupLabel(m[2] || '');
    if (!targetRaw || !sourceRaw || targetRaw === sourceRaw) continue;
    plans.push({ targetRaw, sourceRaw });
  }

  const logs = [];
  for (const p of plans) {
    const targetResolved = resolveContextParents(draft, p.targetRaw);
    const sourceResolved = resolveContextParents(draft, p.sourceRaw);
    const targetName = targetResolved[0] || bestMatchGroupName(draft, p.targetRaw) || p.targetRaw;
    const sourceName = sourceResolved[0] || bestMatchGroupName(draft, p.sourceRaw) || p.sourceRaw;
    const mirrored = mirrorGroupChildrenStructure(draft, targetName, sourceName);
    if (!mirrored.ok) continue;
    logs.push(`${targetName} 已同步 ${sourceName} 的下方分组结构（${mirrored.count} 个子分组）`);
    draft.context.lastPrimaryParent = targetName;
    draft.context.lastMentionedGroups = [targetName, sourceName, ...(draft.context.lastMentionedGroups || []).filter((n) => n !== targetName && n !== sourceName)].slice(0, 6);
    draft.context.lastPairGroups = [targetName, sourceName];
    draft.context.lastCreatedGroup = targetName;
  }
  return logs;
}

function splitNameTokens(text) {
  return String(text || '')
    .split(/[、,，和及与]/)
    .map((s) => normalizeGroupLabel(s))
    .filter(Boolean);
}

function forEachDescendant(node, fn) {
  if (!node) return;
  fn(node);
  for (const c of node.children || []) forEachDescendant(c, fn);
}

function applyExplicitParamHints(draft, message) {
  const text = String(message || '');
  const logs = [];

  // Pattern example:
  // "将A侧和B侧下的孔分组的依赖方式设置成相同"
  const re = /(?:将|把)?\s*([^。；，]+?)\s*(?:下的|下面的)\s*([^。；，]+?)\s*分组?(?:的)?\s*(依赖方向|依赖方式|主轴线上特征|一般轴线上特征|是否按用户规则排工序)\s*(?:设置|改|调整)\s*(?:成|为)?\s*([^。；，]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const parentSeg = String(m[1] || '');
    const childSeg = String(m[2] || '');
    const field = String(m[3] || '').trim();
    const rawValue = String(m[4] || '').trim();
    if (!field || !rawValue || !validGroupField(field)) continue;

    const allowed = groupFieldAllowedValues(field);
    if (allowed.length && !allowed.includes(rawValue)) {
      logs.push(`${field} 不支持「${rawValue}」，可选值：${allowed.join('、')}`);
      continue;
    }

    const parentNames = splitNameTokens(parentSeg);
    const childNames = splitNameTokens(childSeg.replace(/分组/g, ''));
    if (!parentNames.length || !childNames.length) continue;

    let updated = 0;
    for (const pRaw of parentNames) {
      const parentResolved = resolveContextParents(draft, pRaw);
      const parentName = parentResolved[0] || bestMatchGroupName(draft, pRaw) || pRaw;
      const parent = findGroupByName(draft.groups, parentName);
      if (!parent) continue;

      forEachDescendant(parent, (node) => {
        if (!childNames.includes(normalizeGroupLabel(node.name))) return;
        ensureGroupField(draft, field);
        node.params[field] = rawValue;
        updated += 1;
      });
    }

    if (updated > 0) {
      logs.push(`已将 ${parentNames.join('、')} 下 ${childNames.join('、')} 分组的${field}设为${rawValue}`);
    }
  }

  return logs;
}

function parsePartFieldMentions(draft, message) {
  const touched = [];
  const text = String(message || '');
  const compact = text.replace(/\s+/g, '');
  const sortedFields = [...SUPPORTED_PART_FIELDS].sort((a, b) => b.length - a.length);
  for (const field of sortedFields) {
    let hit = false;
    if (field === '主方向') {
      // Avoid swallowing 主方向1~6; only match plain 主方向.
      hit = /主方向(?![0-9])/u.test(compact);
    } else {
      hit = compact.includes(field);
    }
    if (hit) {
      ensurePartField(draft, field);
      if (!touched.includes(field)) touched.push(field);
    }
  }

  const boolHints = [
    { pattern: /有主轴线.*(是|有)/, field: '有主轴线', value: '是' },
    { pattern: /有主轴线.*(否|没有|无)/, field: '有主轴线', value: '否' },
    { pattern: /有轴线.*(是|有)/, field: '有轴线', value: '是' },
    { pattern: /有轴线.*(否|没有|无)/, field: '有轴线', value: '否' }
  ];

  for (const h of boolHints) {
    if (h.pattern.test(message)) {
      ensurePartField(draft, h.field);
      draft.partParams[h.field] = h.value;
      if (!touched.includes(h.field)) touched.push(h.field);
    }
  }
  syncGroupFeatureFieldsByPart(draft);

  const groupsMentioned = [];
  const topGroups = extractLikelyGroupNames(message);
  for (const g of topGroups) {
    upsertTopGroup(draft, g);
    groupsMentioned.push(g);
  }
  if (groupsMentioned.length) {
    draft.context.lastMentionedGroups = groupsMentioned.slice(0, 6);
    draft.context.lastPrimaryParent = groupsMentioned[0];
    if (groupsMentioned.length >= 2) {
      draft.context.lastPairGroups = groupsMentioned.slice(0, 2);
    }
  }

  return { touched, groupsMentioned };
}

function contextGroupExists(draft, name) {
  return !!findGroupByName(draft.groups || [], name);
}

function resolveContextParents(draft, token) {
  const t = normalizeGroupLabel(token || '');
  if (!t) return [];
  if (contextGroupExists(draft, t)) return [t];

  // Fuzzy match from existing tree names (prefer longer names first),
  // e.g. "帮我在A侧端面" -> ["A侧","端面"] candidates.
  const names = Array.from(new Set(listGroupNames(draft.groups || []))).sort((a, b) => b.length - a.length);
  const fuzzyHits = names.filter((n) => t.includes(n));
  if (fuzzyHits.length) {
    // If both A侧 and B侧 are clearly mentioned, keep both.
    const abHits = fuzzyHits.filter((n) => n === 'A侧' || n === 'B侧');
    if (abHits.length >= 2) return Array.from(new Set(abHits)).slice(0, 2);
    return [fuzzyHits[0]];
  }

  if (/^两侧$/.test(t)) {
    const out = [];
    if (contextGroupExists(draft, 'A侧')) out.push('A侧');
    if (contextGroupExists(draft, 'B侧')) out.push('B侧');
    return out;
  }

  if (/^(这两个分组|这两个|这两组|它们|他们)$/.test(t)) {
    const pair = (draft.context.lastPairGroups || []).filter((n) => contextGroupExists(draft, n)).slice(0, 2);
    if (pair.length >= 2) return pair;
    return (draft.context.lastMentionedGroups || []).filter((n) => contextGroupExists(draft, n)).slice(0, 2);
  }

  if (/^(它|该分组|这个分组|此分组|该组|这个子分组|该子分组|新分组|刚创建的分组|上一个分组|上个分组|后面创建的分组)$/.test(t)) {
    const lc = draft.context.lastCreatedGroup;
    if (lc && contextGroupExists(draft, lc)) return [lc];
    const p = draft.context.lastPrimaryParent;
    if (p && contextGroupExists(draft, p)) return [p];
  }

  return [];
}

function handleClarification(draft, message, featureDict) {
  const pending = draft.context.pendingClarification;
  if (!pending) return null;

  const candidates = featureDict.filter((f) => message.includes(f));
  if (!candidates.length) {
    return {
      reply: `还需要你明确 ${pending.children.join('、')} 对应的特征。可从词典中直接说出特征名。`,
      draft
    };
  }

  const parent = findGroupByName(draft.groups, pending.parentName);
  if (parent) {
    for (const childName of pending.children) {
      const child = (parent.children || []).find((c) => c.name === childName);
      if (child && child.params && '特征选择' in child.params) {
        child.params['特征选择'] = candidates.join(',');
      }
    }
  }

  draft.context.pendingClarification = null;
  return {
    reply: `已根据你的补充，为 ${pending.parentName} 下的 ${pending.children.join('、')} 更新特征选择：${candidates.join('、')}`,
    draft
  };
}

function applyMessage(inputDraft, message, featureDict) {
  const draft = normalizeDraft(inputDraft);
  const text = (message || '').trim();
  if (!text) return { draft, reply: '请继续描述零件参数或分组需求。' };

  const clarification = handleClarification(draft, text, featureDict);
  if (clarification) return clarification;

  parsePartFieldMentions(draft, text);
  syncGroupFeatureFieldsByPart(draft);

  // Declarative top groups: 分为A侧、B侧和周边三个分组
  const declaredTopGroups = parseDeclaredTopGroups(text);
  for (const g of declaredTopGroups) {
    upsertTopGroup(draft, g);
  }

  // Pattern: B侧(下方分组结构)跟A侧(下方分组结构)一样
  const mirrorRegex = /([^，。；\s]+)\s*(?:下方|下面|下)?(?:分组结构|结构)\s*(?:跟|和|与|同)\s*([^，。；\s]+)\s*(?:下方|下面|下)?(?:分组结构|结构)?\s*(?:一样|相同)|([^，。；\s]+)\s*(?:跟|和|与|同)\s*([^，。；\s]+)\s*(?:一样)/g;
  let mm;
  const mirrorPlans = [];
  while ((mm = mirrorRegex.exec(text))) {
    const targetName = normalizeGroupLabel((mm[1] || mm[3] || ''));
    const sourceName = normalizeGroupLabel((mm[2] || mm[4] || ''));
    if (!targetName || !sourceName) continue;
    if (targetName === sourceName) continue;
    const targetResolved = resolveContextParents(draft, targetName);
    const sourceResolved = resolveContextParents(draft, sourceName);
    mirrorPlans.push({
      targetName: targetResolved[0] || targetName,
      sourceName: sourceResolved[0] || sourceName
    });
  }

  // Prioritize explicit nested intent to avoid creating dirty top groups
  // from colloquial prefixes like "我想在A侧端面下添加孔".
  const earlyNestedLines = applyExplicitNestedIntentHints(draft, text, featureDict);
  if (earlyNestedLines.length) {
    const simple = earlyNestedLines.map((line) => line.replace(/已按嵌套语义修正：/g, ''));
    return { draft, reply: simple.join('；') };
  }

  // Pattern A: (在)A侧(分组)下/下面/下方 添加/创建/放入/加入/包含 外圆和端面子分组
  const addRegex = /(?:在\s*)?([^，。；\s]+?)\s*(?:分组)?\s*(?:下|下面|下方)?\s*(?:还需要|需要|可)?\s*(?:新增|添加|增加|创建|放入|加入|包含|包括)\s*([^。；]+)/g;
  let m;
  const changes = [];
  while ((m = addRegex.exec(text))) {
    const parentNameRaw = normalizeGroupLabel(m[1] || '');
    const parents = resolveContextParents(draft, parentNameRaw);
    const targetParents = parents.length ? parents : [parentNameRaw];
    let childText = sanitizeChildText(m[2]);
    const childNames = tokenizeChildren(childText);
    if (childNames.length && targetParents.length) {
      for (const parentName of targetParents) {
        const p = normalizeGroupLabel(parentName || '');
        if (!p) continue;
        if (!contextGroupExists(draft, p) && !isValidTopGroupName(p)) continue;
        const res = addChildrenToParent(draft, p, childNames, featureDict);
        changes.push(res);
        draft.context.lastAddChildren = { sourceParent: p, children: childNames };
        if (res.added && res.added.length) {
          draft.context.lastCreatedGroup = res.added[res.added.length - 1];
        }
      }
      draft.context.lastPrimaryParent = targetParents[0] || draft.context.lastPrimaryParent;
      draft.context.lastMentionedGroups = [...targetParents, ...(draft.context.lastMentionedGroups || []).filter((n) => !targetParents.includes(n))].slice(0, 6);
      if (targetParents.length >= 2) {
        draft.context.lastPairGroups = targetParents.slice(0, 2);
      }
    }
  }

  // Pattern B: A侧下面有/是 外圆和端面
  const addRegex2 = /(?:在\s*)?([^，。；\s]+?)\s*(?:分组)?\s*(?:下|下面|下方)\s*(?:有|是)\s*([^。；]+)/g;
  while ((m = addRegex2.exec(text))) {
    const parentNameRaw = normalizeGroupLabel(m[1] || '');
    const parents = resolveContextParents(draft, parentNameRaw);
    const targetParents = parents.length ? parents : [parentNameRaw];
    let childText = sanitizeChildText(m[2]);
    const childNames = tokenizeChildren(childText);
    if (childNames.length && targetParents.length) {
      for (const parentName of targetParents) {
        const p = normalizeGroupLabel(parentName || '');
        if (!p) continue;
        if (!contextGroupExists(draft, p) && !isValidTopGroupName(p)) continue;
        const res = addChildrenToParent(draft, p, childNames, featureDict);
        changes.push(res);
        draft.context.lastAddChildren = { sourceParent: p, children: childNames };
        if (res.added && res.added.length) {
          draft.context.lastCreatedGroup = res.added[res.added.length - 1];
        }
      }
      draft.context.lastPrimaryParent = targetParents[0] || draft.context.lastPrimaryParent;
      draft.context.lastMentionedGroups = [...targetParents, ...(draft.context.lastMentionedGroups || []).filter((n) => !targetParents.includes(n))].slice(0, 6);
      if (targetParents.length >= 2) {
        draft.context.lastPairGroups = targetParents.slice(0, 2);
      }
    }
  }

  // Pattern: B侧也一样
  const sameRegex = /([^，。；\s]+)\s*也一样/g;
  while ((m = sameRegex.exec(text))) {
    const targetParent = normalizeGroupLabel(m[1] || '');
    const last = draft.context.lastAddChildren;
    if (last && last.children && last.children.length) {
      const res = addChildrenToParent(draft, targetParent, last.children, featureDict);
      changes.push(res);
      draft.context.lastPairGroups = [targetParent, last.sourceParent].filter(Boolean).slice(0, 2);
      draft.context.lastMentionedGroups = [targetParent, last.sourceParent, ...(draft.context.lastMentionedGroups || []).filter((n) => n !== targetParent && n !== last.sourceParent)].slice(0, 6);
    }
  }

  // Apply mirror plans after add-changes in the same sentence.
  const mirrorLines = [];
  for (const plan of mirrorPlans) {
    const mirrored = mirrorGroupChildrenStructure(draft, plan.targetName, plan.sourceName);
    if (!mirrored.ok) {
      return { draft, reply: `${mirrored.reason}，请先创建来源分组。` };
    }
    mirrorLines.push(`${plan.targetName} 已同步 ${plan.sourceName} 的下方分组结构（${mirrored.count} 个子分组）`);
    draft.context.lastPrimaryParent = plan.targetName;
    draft.context.lastMentionedGroups = [plan.targetName, plan.sourceName];
    draft.context.lastPairGroups = [plan.targetName, plan.sourceName];
  }

  const paramLines = applyExplicitParamHints(draft, text);

  // Batch pattern: A侧和B侧都添加外圆端面
  const batchRegex = /(A侧|B侧|周边|A测|B测)\s*[和、]\s*(A侧|B侧|周边|A测|B测)\s*都.*?(?:新增|添加|增加)\s*([^。；]+)/;
  const batch = text.match(batchRegex);
  if (batch) {
    const p1 = batch[1];
    const p2 = batch[2];
    const childNames = tokenizeChildren(batch[3]);
    if (childNames.length) {
      changes.push(addChildrenToParent(draft, p1, childNames, featureDict));
      changes.push(addChildrenToParent(draft, p2, childNames, featureDict));
      draft.context.lastAddChildren = { sourceParent: p1, children: childNames };
    }
  }

  // fallback: create top groups mentioned by name after 创建/新增
  const topGroupRegex = /(?:创建|新增|添加)\s*([^。；]+)/;
  const topHit = text.match(topGroupRegex);
  if (topHit && !changes.length && !/(?:下|下面|下方)/.test(text)) {
    const names = tokenizeChildren(topHit[1]);
    const created = [];
    for (const name of names) {
      if (isValidTopGroupName(name)) {
        upsertTopGroup(draft, name);
        created.push(name);
      }
    }
    if (created.length) {
      return { draft, reply: `已创建顶层分组：${created.join('、')}。你可以继续说“在X下面添加Y子分组”。` };
    }
  }

  if (changes.length || mirrorLines.length || paramLines.length) {
    const unclear = [];
    const lines = [];
    for (const line of mirrorLines) lines.push(line);
    for (const line of paramLines) lines.push(line);
    for (const c of changes) {
      if (c.added.length) lines.push(`${c.parentName}: 新增 ${c.added.join('、')}`);
      if (c.skipped.length) lines.push(`${c.parentName}: 已存在 ${c.skipped.join('、')}（已跳过）`);
      if (c.unclear.length) unclear.push(...c.unclear.map((n) => ({ parent: c.parentName, name: n })));
    }

    if (unclear.length) {
      const byParent = {};
      for (const item of unclear) {
        byParent[item.parent] = byParent[item.parent] || [];
        if (!byParent[item.parent].includes(item.name)) byParent[item.parent].push(item.name);
      }
      const p = Object.keys(byParent)[0];
      draft.context.pendingClarification = { parentName: p, children: byParent[p] };
      const first = byParent[p].join('、');
      return {
        draft,
        reply: `${lines.join('；')}。我已先创建节点。请补充 ${p} 下 ${first} 的特征选择（可直接说词典特征名）。`
      };
    }

    return { draft, reply: lines.join('；') };
  }

  return {
    draft,
    reply: '我已记录你的描述。你可以继续补充：1) 顶层分组；2) 在某分组下新增子分组；3) 特征选择说明。'
  };
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildFieldItem(name, meta = { type: 'String', defaultval: '', data_type: '', respath: '' }) {
  return `                <Item name="${xmlEscape(name)}" title="${xmlEscape(name)}" value="" data_type="${xmlEscape(meta.data_type || '')}" visible="1" edit="1" type="${xmlEscape(meta.type || 'String')}" defaultval="${xmlEscape(meta.defaultval || '')}" respath="${xmlEscape(meta.respath || '')}" />`;
}

function partFieldXmlMeta(name) {
  return fieldMeta(name, 'part');
}

function groupFieldXmlMeta(name) {
  return fieldMeta(name, 'group');
}

function buildGroupXml(nodes, indent = '        ') {
  const lines = [];
  for (const node of nodes) {
    const gid = xmlUuid();
    lines.push(`${indent}<Item id="${xmlEscape(gid)}" type="Group" stageOrders="" sourceIds="">`);
    lines.push(`${indent}    <Params>`);
    lines.push(`${indent}        <param name="名称" value="${xmlEscape(node.name)}" />`);
    for (const [k, v] of Object.entries(node.params || {})) {
      if (k === '名称') continue;
      lines.push(`${indent}        <param name="${xmlEscape(k)}" value="${xmlEscape(v)}" />`);
    }
    lines.push(`${indent}    </Params>`);
    lines.push(...buildGroupXml(node.children || [], indent + '    '));
    lines.push(`${indent}</Item>`);
  }
  return lines;
}

function buildXml(draft) {
  const partFields = draft.partTemplateFields || [];
  const groupFields = draft.groupTemplateFields || [];

  const lines = [];
  lines.push('<?xml version="1.0" encoding="GB2312" ?>');
  lines.push('<Kmsoft>');
  lines.push('    <Item type="Part_Template">');
  lines.push('        <GridPropList>');
  lines.push('            <GridProp name="节点配置">');
  for (const f of partFields) lines.push(buildFieldItem(f, partFieldXmlMeta(f)));
  lines.push('            </GridProp>');
  lines.push('        </GridPropList>');
  lines.push('    </Item>');

  lines.push('    <Item type="Group_Template">');
  lines.push('        <GridPropList>');
  lines.push('            <GridProp name="节点配置">');
  for (const f of groupFields) {
    const meta = groupFieldXmlMeta(f);
    lines.push(buildFieldItem(f, meta));
  }
  lines.push('            </GridProp>');
  lines.push('        </GridPropList>');
  lines.push('    </Item>');

  lines.push(`    <Item id="${xmlEscape(xmlUuid())}" type="Part" filename="" >`);
  lines.push('        <Params>');
  for (const f of partFields) {
    lines.push(`            <param name="${xmlEscape(f)}" value="${xmlEscape(draft.partParams[f] || '')}" />`);
  }
  lines.push('        </Params>');
  lines.push(...buildGroupXml(draft.groups || [], '        '));
  lines.push('    </Item>');
  lines.push('</Kmsoft>');
  return lines.join('\n');
}

function iconvEncodeGb2312(xmlText) {
  const conv = spawnSync('iconv', ['-f', 'UTF-8', '-t', 'GB2312'], {
    input: Buffer.from(xmlText, 'utf8'),
    maxBuffer: 8 * 1024 * 1024
  });
  if (conv.status !== 0 || conv.error) {
    const stderr = conv.stderr ? Buffer.from(conv.stderr).toString('utf8').trim() : '';
    const detail = conv.error ? conv.error.message : stderr || 'iconv convert failed';
    return { ok: false, message: detail };
  }
  return { ok: true, buffer: conv.stdout };
}

function powershellEncodeGb2312(xmlText) {
  if (process.platform !== 'win32') {
    return { ok: false, message: 'PowerShell GB2312 fallback is only available on Windows' };
  }

  fs.mkdirSync(TEMP_EXPORT_DIR, { recursive: true });
  const tempId = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const inputPath = path.join(TEMP_EXPORT_DIR, `export_${tempId}.utf8.xml`);
  const outputPath = path.join(TEMP_EXPORT_DIR, `export_${tempId}.gb2312.bin`);
  fs.writeFileSync(inputPath, xmlText, 'utf8');

  const script = `
$ErrorActionPreference = 'Stop'
$inputPath = ${JSON.stringify(inputPath)}
$outputPath = ${JSON.stringify(outputPath)}
try {
  $providerType = [System.Type]::GetType('System.Text.CodePagesEncodingProvider')
  if ($providerType) {
    [System.Text.Encoding]::RegisterProvider($providerType::Instance)
  }
} catch {}
$text = [System.IO.File]::ReadAllText($inputPath, [System.Text.Encoding]::UTF8)
$encoding = [System.Text.Encoding]::GetEncoding('GB2312')
[System.IO.File]::WriteAllBytes($outputPath, $encoding.GetBytes($text))
`;

  try {
    const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');
    const result = spawnSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encodedCommand
    ], { maxBuffer: 8 * 1024 * 1024 });

    if (result.status !== 0 || result.error) {
      const stderr = result.stderr ? Buffer.from(result.stderr).toString('utf8').trim() : '';
      const detail = result.error ? result.error.message : stderr || 'PowerShell convert failed';
      return { ok: false, message: detail };
    }
    return { ok: true, buffer: fs.readFileSync(outputPath) };
  } finally {
    for (const tempPath of [inputPath, outputPath]) {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (_) {}
    }
  }
}

function writeXmlAsGb2312(filePath, xmlText) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const iconvResult = iconvEncodeGb2312(xmlText);
  if (iconvResult.ok) {
    fs.writeFileSync(filePath, iconvResult.buffer);
    return;
  }

  const powershellResult = powershellEncodeGb2312(xmlText);
  if (powershellResult.ok) {
    fs.writeFileSync(filePath, powershellResult.buffer);
    return;
  }

  throw new Error(`GB2312编码转换失败: ${iconvResult.message}; ${powershellResult.message}`);
}

function validateBasicXml(xml) {
  const errs = [];
  if (!xml.includes('<Item type="Part_Template"')) errs.push('缺少 Part_Template 节点');
  if (!xml.includes('<Item type="Group_Template"')) errs.push('缺少 Group_Template 节点');
  if (!xml.includes('type="Part"')) errs.push('缺少 Part 节点');
  if (!xml.includes('<Kmsoft>')) errs.push('缺少根节点 Kmsoft');
  return errs;
}

function timestampName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, pathname.replace(/^\//, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }
  const data = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': getContentType(filePath) });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(urlObj.pathname);

  if (req.method === 'GET' && pathname === '/api/init') {
    const catalog = readFeatureCatalog();
    return sendJson(res, 200, {
      ok: true,
      sampleGuide: '示例：我有A侧和B侧两个分组，在A侧添加外圆和端面，B侧也一样。',
      scenePresets: SCENE_PRESETS,
      groupTemplates: readTemplateCatalog().map(publicTemplateItem),
      supportedPartFields: SUPPORTED_PART_FIELDS,
      defaultGroupTemplateFields: DEFAULT_GROUP_TEMPLATE_FIELDS,
      features: catalog.flat,
      featureTree: catalog.tree,
      draft: defaultDraft()
    });
  }

  if (req.method === 'GET' && pathname === '/api/settings') {
    return sendJson(res, 200, { ok: true, settings: readSettings() });
  }

  if (req.method === 'GET' && pathname === '/api/group-templates') {
    const templates = readTemplateCatalog().map(publicTemplateItem);
    return sendJson(res, 200, { ok: true, templates });
  }

  if (req.method === 'POST' && pathname === '/api/agent/message') {
    try {
      const parsed = await readJsonBody(req);
      const result = createTemplateSelectionAgentResponse({
        text: parsed.text || parsed.message || '',
        sessionId: parsed.sessionId || '',
        limit: Number(parsed.limit) || 3
      });
      return sendJson(res, 200, result);
    } catch (e) {
      return sendJson(res, e.statusCode || 400, { ok: false, message: e.message });
    }
  }

  if (req.method === 'POST' && pathname === '/api/agent/event') {
    try {
      const parsed = await readJsonBody(req);
      const result = handleAgentEvent(parsed);
      return sendJson(res, result.ok ? 200 : (result.statusCode || 400), result);
    } catch (e) {
      return sendJson(res, e.statusCode || 400, { ok: false, message: e.message });
    }
  }

  if (req.method === 'GET' && pathname.startsWith('/api/agent/session/')) {
    const sessionId = decodeURIComponent(pathname.slice('/api/agent/session/'.length));
    const session = agentSessions.get(sessionId);
    if (!session) return sendJson(res, 404, { ok: false, message: '未找到智能体会话' });
    return sendJson(res, 200, {
      ok: true,
      sessionId: session.id,
      stage: session.stage,
      workflow: session.workflow,
      session: publicAgentSession(session),
      recommendations: session.recommendations || [],
      template: session.selectedTemplate || null,
      draft: session.draft || null,
      xml: session.xml || '',
      structureSummary: session.structureSummary || ''
    });
  }

  if (req.method === 'GET' && pathname === '/api/recognition-templates') {
    return sendJson(res, 200, { ok: true, templates: listRecognitionTemplates() });
  }

  if (req.method === 'POST' && pathname === '/api/group-templates/recommend') {
    try {
      const parsed = await readJsonBody(req);
      const recommendations = recommendGroupTemplates({
        text: String(parsed.text || parsed.message || '').trim(),
        limit: Number(parsed.limit) || 5
      });
      return sendJson(res, 200, { ok: true, recommendations });
    } catch (e) {
      return sendJson(res, e.statusCode || 400, { ok: false, message: e.message });
    }
  }

  if (req.method === 'POST' && pathname === '/api/templates/generate-fuzzy') {
    try {
      const parsed = await readJsonBody(req);
      const result = generateFuzzyTemplate({
        text: String(parsed.text || parsed.message || '').trim(),
        limit: Number(parsed.limit) || 3
      });
      return sendJson(res, result.ok ? 200 : 400, result);
    } catch (e) {
      return sendJson(res, e.statusCode || 400, { ok: false, message: e.message });
    }
  }

  if (req.method === 'POST' && pathname === '/api/group-templates/apply') {
    try {
      const parsed = await readJsonBody(req);
      const result = applyGroupTemplate(String(parsed.templateId || '').trim());
      if (!result.ok) {
        return sendJson(res, 404, result);
      }
      const xml = buildXml(result.draft);
      const recognitionRecommendation = recommendRecognitionTemplates({
        groupTemplate: result.template,
        draft: result.draft,
        limit: 1
      })[0] || null;
      return sendJson(res, 200, {
        ok: true,
        template: result.template,
        draft: result.draft,
        xml,
        structureSummary: result.summary,
        recognitionRecommendation
      });
    } catch (e) {
      return sendJson(res, e.statusCode || 400, { ok: false, message: e.message });
    }
  }

  if (req.method === 'POST' && pathname === '/api/recognition-templates/recommend') {
    try {
      const parsed = await readJsonBody(req);
      const recommendations = recommendRecognitionTemplates({
        text: String(parsed.text || parsed.message || '').trim(),
        groupTemplate: parsed.groupTemplate || null,
        draft: parsed.draft || null,
        limit: Number(parsed.limit) || 3
      });
      return sendJson(res, 200, { ok: true, recommendations });
    } catch (e) {
      return sendJson(res, e.statusCode || 400, { ok: false, message: e.message });
    }
  }

  if (req.method === 'POST' && pathname === '/api/settings') {
    try {
      const parsed = await readJsonBody(req);
      const settings = writeSettings(parsed.settings || {});
      return sendJson(res, 200, { ok: true, settings });
    } catch (e) {
      return sendJson(res, e.statusCode || 400, { ok: false, message: e.message });
    }
  }

  if (req.method === 'POST' && pathname === '/api/settings/test') {
    try {
      const parsed = await readJsonBody(req);
      const settings = { ...readSettings(), ...(parsed.settings || {}) };
      const provider = settings.provider || 'gemini';
      const result = provider === 'openai_compatible'
        ? await testOpenAICompatible(settings)
        : await testGemini(settings);
      return sendJson(res, result.ok ? 200 : 400, result);
    } catch (e) {
      return sendJson(res, e.statusCode || 400, { ok: false, message: e.message });
    }
  }

  if (req.method === 'POST' && pathname === '/api/chat') {
    try {
      const parsed = await readJsonBody(req);
      const message = String(parsed.message || '').trim();
      const draft = normalizeDraft(parsed.draft);

      // Natural language export: allow users to export template directly via chat.
      if (/(导出模板|导出xml|导出\s*xml|保存模板|导出文件|导出)/i.test(message)) {
        const draftErrs = validateDraft(draft, { features: readFeatures() });
        if (draftErrs.length) {
          return sendJson(res, 400, { ok: false, message: `导出失败：${draftErrs.join('；')}`, errors: draftErrs });
        }
        const xml = buildXml(draft);
        const errs = validateBasicXml(xml);
        if (errs.length) {
          return sendJson(res, 400, { ok: false, message: `导出失败：${errs.join('；')}`, errors: errs });
        }
        const filename = `分组模板_${timestampName()}.xml`;
        const filePath = path.join(TEMPLATE_DIR, filename);
        try {
          writeXmlAsGb2312(filePath, xml);
        } catch (e) {
          return sendJson(res, 500, { ok: false, message: `导出失败：${e.message}` });
        }
        return sendJson(res, 200, {
          ok: true,
          reply: `已导出模板：${filename}\n导出路径：${filePath}`,
          draft,
          xml,
          llmUsed: false,
          llmUnderstanding: '',
          structureSummary: buildGroupStructureText(draft.groups || []),
          exported: true,
          filename,
          filePath
        });
      }

      if (!message) {
        const xml = buildXml(draft);
        return sendJson(res, 200, {
          ok: true,
          reply: '',
          draft,
          xml,
          llmUsed: false,
          llmUnderstanding: '',
          structureSummary: buildGroupStructureText(draft.groups || [])
        });
      }

      const features = readFeatures();
      let result = await applyMessageWithLlm(draft, message, features);
      if (!result) {
        const fallback = applyMessage(draft, message, features);
        if (fallback && fallback.draft) {
          result = {
            ...fallback,
            llmUsed: false,
            llmUnderstanding: ''
          };
        }
      }
      if (!result) {
        return sendJson(res, 502, {
          ok: false,
          message: '未返回可执行结果。请稍后重试或补充更明确的分组描述。'
        });
      }

      const xml = buildXml(result.draft);
      return sendJson(res, 200, {
        ok: true,
        reply: result.reply,
        draft: result.draft,
        xml,
        llmUsed: !!result.llmUsed,
        llmUnderstanding: result.llmUnderstanding || '',
        structureSummary: buildGroupStructureText(result.draft.groups || [])
      });
    } catch (e) {
      return sendJson(res, e.statusCode || 400, { ok: false, message: e.message });
    }
  }

  if (req.method === 'POST' && pathname === '/api/save') {
    try {
      const parsed = await readJsonBody(req);
      const draft = normalizeDraft(parsed.draft);
      const draftErrs = validateDraft(draft, { features: readFeatures() });
      if (draftErrs.length) {
        return sendJson(res, 400, { ok: false, errors: draftErrs, message: `保存失败：${draftErrs.join('；')}` });
      }
      const xml = buildXml(draft);
      const errs = validateBasicXml(xml);
      if (errs.length) {
        return sendJson(res, 400, { ok: false, errors: errs, message: `保存失败：${errs.join('；')}` });
      }
      const filename = `分组模板_${timestampName()}.xml`;
      const filePath = path.join(TEMPLATE_DIR, filename);
      try {
        writeXmlAsGb2312(filePath, xml);
      } catch (e) {
        return sendJson(res, 500, { ok: false, message: `导出失败：${e.message}` });
      }
      return sendJson(res, 200, { ok: true, filename, filePath, xml });
    } catch (e) {
      return sendJson(res, e.statusCode || 400, { ok: false, message: e.message });
    }
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET') {
    return serveStatic(req, res, pathname);
  }

  res.writeHead(404);
  res.end('Not Found');
});

if (process.env.NO_LISTEN !== '1') {
  server.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running: http://${HOST}:${PORT}`);
  });
}

module.exports = {
  server,
  defaultDraft,
  normalizeDraft,
  readFeatures,
  readTemplateCatalog,
  recommendGroupTemplates,
  generateFuzzyTemplate,
  createTemplateSelectionAgentResponse,
  applyTemplateSelectionEvent,
  handleAgentEvent,
  listRecognitionTemplates,
  recommendRecognitionTemplates,
  applyGroupTemplate,
  applyMessage,
  buildXml,
  validateBasicXml,
  validateDraft,
  readJsonBody,
  readSettings,
  writeSettings,
  testGemini,
  testOpenAICompatible,
  applyMessageWithLlm,
  applyLlmOperations
};
