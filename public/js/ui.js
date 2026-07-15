import { state, findNodeById, createNode } from './store.js';
import { apiAgentEvent, apiAgentMessage, apiApplyGroupTemplate, apiGenerateFuzzyTemplate, apiInit, apiRecommendGroupTemplates, apiSave } from './services.js';
import { AIService } from './ai-service.js';
import { ChatEngine } from './chat-engine.js';
import { renderTree } from './tree-view.js';
import { renderPartSelectionSummary, renderGroupCards, renderTemplateEditor } from './panel-view.js';
import { createSettingsController } from './settings-controller.js';
import { createModeController } from './mode-controller.js';
import { createChatView } from './chat-view.js';
import {
  moveNodeAsChild,
  addTopGroup,
  addChildGroup,
  deleteGroup,
  setGroupParam,
  addPartTemplateField,
  removePartTemplateField,
  addGroupTemplateField,
  removeGroupTemplateField,
  togglePartField,
  syncGroupTemplateByPartSelection
} from './commands.js';
import { fieldDesc } from './param-meta.js';
import { createToastApi } from './toast.js';
import { createHistory, validateDraftForExport } from './history.js';

const els = {
  describeSamplePanel: document.getElementById('describeSamplePanel'),
  describeExampleList: document.getElementById('describeExampleList'),
  templateRecommendPanel: document.getElementById('templateRecommendPanel'),
  templateRecommendList: document.getElementById('templateRecommendList'),
  manualSelectPanel: document.getElementById('manualSelectPanel'),
  entryCard: document.getElementById('entryCard'),
  manualPanel: document.getElementById('manualPanel'),
  modeDescribeBtn: document.getElementById('modeDescribeBtn'),
  modeManualBtn: document.getElementById('modeManualBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  resetBtn: document.getElementById('resetBtn'),
  undoBtn: document.getElementById('undoBtn'),
  settingsModal: document.getElementById('settingsModal'),
  llmEnabledInput: document.getElementById('llmEnabledInput'),
  providerInput: document.getElementById('providerInput'),
  baseUrlInput: document.getElementById('baseUrlInput'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  modelInput: document.getElementById('modelInput'),
  temperatureInput: document.getElementById('temperatureInput'),
  llmTimeoutSecInput: document.getElementById('llmTimeoutSecInput'),
  settingsHint: document.getElementById('settingsHint'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  testSettingsBtn: document.getElementById('testSettingsBtn'),
  previewTemplateBtn: document.getElementById('previewTemplateBtn'),
  exportTemplateBtn: document.getElementById('exportTemplateBtn'),
  splitter: document.getElementById('splitter'),
  xmlCard: document.getElementById('xmlCard'),
  emptyPreview: document.getElementById('emptyPreview'),
  emptyPreviewText: document.getElementById('emptyPreviewText'),
  emptySceneHintBtn: document.getElementById('emptySceneHintBtn'),
  previewContent: document.getElementById('previewContent'),
  partFieldList: document.getElementById('partFieldList'),
  chatLog: document.getElementById('chatLog'),
  chatInput: document.getElementById('chatInput'),
  sendBtn: document.getElementById('sendBtn'),
  phraseChips: document.getElementById('phraseChips'),
  sceneCardList: document.getElementById('sceneCardList'),
  tree: document.getElementById('tree'),
  groupCardsSection: document.getElementById('groupCardsSection'),
  groupCardsBody: document.getElementById('groupCardsBody'),
  groupCardsToggleBtn: document.getElementById('groupCardsToggleBtn'),
  partCardsSection: document.getElementById('partCardsSection'),
  partCards: document.getElementById('partCards'),
  groupCards: document.getElementById('groupCards'),
  xmlPreview: document.getElementById('xmlPreview'),
  addTopBtn: document.getElementById('addTopBtn'),
  addChildBtn: document.getElementById('addChildBtn'),
  deleteNodeBtn: document.getElementById('deleteNodeBtn'),
  saveBtn: document.getElementById('saveBtn'),
  partTplFields: document.getElementById('partTplFields'),
  groupTplFields: document.getElementById('groupTplFields'),
  newPartTplField: document.getElementById('newPartTplField'),
  newGroupTplField: document.getElementById('newGroupTplField'),
  addPartTplFieldBtn: document.getElementById('addPartTplFieldBtn'),
  addGroupTplFieldBtn: document.getElementById('addGroupTplFieldBtn')
};

const aiService = new AIService();
const chatEngine = new ChatEngine();
const toast = createToastApi();
const draftHistory = createHistory({ limit: 20 });
let settingsController = null;
let modeController = null;
let chatView = null;
let refreshSeq = 0;
let groupEditState = { nodeId: null, values: {} };
let groupCardsCollapsedByUser = false;
let exportInProgress = false;
const expandedNodeIds = new Set();
const DRAFT_CACHE_KEY = 'group_template_draft_cache_v1';
const DEFAULT_GROUP_FIELDS = ['依赖方向', '依赖方式', '特征选择'];
const DESCRIBE_EXAMPLES = [
  {
    name: '轴类样例',
    text: '轴类零件，分A侧和B侧，按端面和外圆分组',
    partFields: ['原点', '主方向1', '有主轴线'],
    groups: [
      { name: 'A侧', children: [{ name: '端面' }, { name: '外圆' }] },
      { name: 'B侧', children: [{ name: '端面' }, { name: '外圆' }] }
    ]
  },
  {
    name: '壳体样例',
    text: '壳体件，按多方向面分组，区分孔和通槽',
    partFields: ['主方向1', '主方向2', '主方向3', '主方向4', '主方向5', '主方向6', '是否需要加工面分离'],
    groups: [
      { name: '周边分组', children: [{ name: '平面' }, { name: '通槽' }] },
      { name: '孔系分组', children: [{ name: '孔' }] }
    ]
  },
  {
    name: '衬套样例',
    text: '衬套类回转体，分A侧和B侧，含外圆、端面、孔和槽',
    partFields: ['原点', '主方向1', '有主轴线'],
    groups: [
      { name: 'A侧', children: [{ name: '外圆' }, { name: '端面' }, { name: '孔' }] },
      { name: 'B侧', children: [{ name: '外圆' }, { name: '端面' }, { name: '槽' }] }
    ]
  },
  {
    name: '简件样例',
    text: '简单小件，方向要求低，按特征直接打包',
    partFields: ['原点', '主方向'],
    groups: [
      { name: '主分组', children: [{ name: '平面' }, { name: '孔' }] }
    ]
  }
];
const PHRASE_CHIPS = [
  { label: '创建A侧和B侧', text: '创建A侧和B侧两个顶层分组' },
  { label: '加外圆和端面', text: '在当前选中分组下添加外圆和端面' },
  { label: 'B侧也一样', text: 'B侧也一样' },
  { label: '添加孔', text: '添加孔子分组' }
];

function captureHistorySnapshot() {
  return {
    draft: state.draft,
    selectedNodeId: state.selectedNodeId,
    selectedGroupTemplate: state.selectedGroupTemplate,
    selectedRecognitionTemplate: state.selectedRecognitionTemplate,
    templateRecommendations: state.templateRecommendations,
    partFieldsConfirmed: state.partFieldsConfirmed,
    modeActive: state.modeActive,
    modeType: state.modeType,
    xml: state.xml
  };
}

function pushHistory() {
  if (!state.draft) return;
  draftHistory.push(captureHistorySnapshot());
  updateUndoButton();
}

function updateUndoButton() {
  if (!els.undoBtn) return;
  const can = draftHistory.canUndo();
  els.undoBtn.disabled = !can;
  els.undoBtn.title = can ? '撤销上一步 (Ctrl+Z)' : '暂无可撤销操作';
}

function restoreHistorySnapshot(snap) {
  if (!snap || !snap.draft) return false;
  state.draft = snap.draft;
  state.selectedNodeId = snap.selectedNodeId || null;
  state.selectedGroupTemplate = snap.selectedGroupTemplate || null;
  state.selectedRecognitionTemplate = snap.selectedRecognitionTemplate || null;
  state.templateRecommendations = Array.isArray(snap.templateRecommendations)
    ? snap.templateRecommendations
    : [];
  state.partFieldsConfirmed = !!snap.partFieldsConfirmed;
  state.modeActive = !!snap.modeActive;
  state.modeType = snap.modeType || null;
  state.draggingNodeId = null;
  expandedNodeIds.clear();
  setXml(snap.xml || '');
  if (state.modeActive) {
    if (els.entryCard) els.entryCard.classList.add('hidden');
    if (els.manualPanel) els.manualPanel.classList.remove('hidden');
    if (els.emptyPreview) els.emptyPreview.classList.add('hidden');
    if (els.previewContent) els.previewContent.classList.remove('hidden');
  }
  return true;
}

function undoLastChange() {
  const snap = draftHistory.pop();
  updateUndoButton();
  if (!snap) {
    toast.info('没有可撤销的操作');
    return;
  }
  restoreHistorySnapshot(snap);
  renderPartFieldList(state.supportedPartFields || []);
  renderAll();
  refreshXmlOnly();
  toast.ok('已撤销上一步');
}

function buildGroupsFromSpec(specs, groupTemplateFields) {
  const walk = (items) => {
    const out = [];
    for (const item of items || []) {
      if (!item || !item.name) continue;
      const node = createNode(item.name, groupTemplateFields);
      node.children = walk(item.children || []);
      out.push(node);
    }
    return out;
  };
  return walk(specs);
}

function persistDraftCache() {
  // disabled: avoid bringing stale groups/checked fields back on next open
}

function loadDraftCache() {
  return null;
}

function adoptServerDraft(nextDraft) {
  const incoming = nextDraft && typeof nextDraft === 'object' ? nextDraft : {};
  const prev = state.draft && typeof state.draft === 'object' ? state.draft : {};
  const prevFields = Array.isArray(prev.partTemplateFields) ? prev.partTemplateFields : [];
  const nextFields = Array.isArray(incoming.partTemplateFields) ? incoming.partTemplateFields : [];

  // Guard: avoid losing selected part fields because of an unexpected empty server draft.
  if (prevFields.length > 0 && nextFields.length === 0) {
    incoming.partTemplateFields = [...prevFields];
    incoming.partParams = { ...(incoming.partParams || {}) };
    for (const f of prevFields) {
      if (!(f in incoming.partParams)) {
        incoming.partParams[f] = (prev.partParams && f in prev.partParams) ? prev.partParams[f] : '';
      }
    }
  }
  return incoming;
}

function snapshotGroupValues(node, groupFields) {
  const baseFields = ['依赖方向', '依赖方式', '特征选择'];
  const customFields = (Array.isArray(groupFields) ? groupFields : []).filter((f) => !baseFields.includes(f));
  const allFields = ['名称', ...baseFields, ...customFields];
  const out = {};
  for (const f of allFields) {
    if (f === '名称') out[f] = node.name || '';
    else if (node.params && f in node.params) out[f] = node.params[f] || '';
    else out[f] = '';
  }
  return out;
}

function setXml(xml) {
  state.xml = xml;
  els.xmlPreview.textContent = xml;
}

function fieldPill(name, checked, onToggle) {
  const wrap = document.createElement('label');
  wrap.className = `param-card ${checked ? 'active' : ''}`;
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'param-checkbox';
  cb.checked = checked;
  cb.addEventListener('change', () => {
    onToggle(cb.checked);
    wrap.classList.toggle('active', cb.checked);
  });

  const body = document.createElement('div');
  body.className = 'param-body';
  const title = document.createElement('div');
  title.className = 'param-title';
  title.textContent = name;
  const desc = document.createElement('div');
  desc.className = 'param-desc';
  desc.textContent = getPartFieldDesc(name);
  body.appendChild(title);
  body.appendChild(desc);

  wrap.appendChild(cb);
  wrap.appendChild(body);
  return wrap;
}

function getPartFieldDesc(name) {
  return fieldDesc('part', name) || '';
}

function renderPartFieldList(allFields) {
  const order = [
    '原点',
    '主方向',
    '主方向1',
    '主方向2',
    '主方向3',
    '主方向4',
    '主方向5',
    '主方向6',
    '有主轴线',
    '有轴线',
    '是否需要加工面分离',
    '是否自动按坐标轴方向加工面积多少选择主方向',
    '需要判断外圆车削加工方向',
    '需要判断多外圆车削加工方向'
  ];
  const sorted = [...allFields].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, 'zh');
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  els.partFieldList.innerHTML = '';
  const listCard = document.createElement('div');
  listCard.className = 'param-list-card';
  const listGrid = document.createElement('div');
  listGrid.className = 'param-list-grid';
  for (const field of sorted) {
    const checked = state.draft.partTemplateFields.includes(field);
    listGrid.appendChild(fieldPill(field, checked, (on) => {
      pushHistory();
      togglePartField(state.draft, field, on);
      state.partFieldsConfirmed = state.draft.partTemplateFields.length > 0;
      refreshXmlOnly();
      renderAll();
      toast.ok(on ? `已添加参数「${field}」` : `已移除参数「${field}」`);
    }));
  }
  listCard.appendChild(listGrid);
  els.partFieldList.appendChild(listCard);
}


function applyDescribeExample(example, { withGroups = false } = {}) {
  if (!example || !state.draft) return;
  pushHistory();
  state.selectedNodeId = null;
  state.draggingNodeId = null;
  state.draft.groups = [];
  state.draft.partTemplateFields = [];
  state.draft.partParams = {};
  state.draft.groupTemplateFields = [...DEFAULT_GROUP_FIELDS];

  const fields = Array.isArray(example.partFields) ? example.partFields : [];
  for (const f of fields) addPartTemplateField(state.draft, f);
  syncGroupTemplateByPartSelection(state.draft);

  if (withGroups && Array.isArray(example.groups) && example.groups.length) {
    state.draft.groups = buildGroupsFromSpec(example.groups, state.draft.groupTemplateFields);
  }

  state.partFieldsConfirmed = state.draft.partTemplateFields.length > 0;
  renderPartFieldList(state.supportedPartFields || []);
  renderAll();
  refreshXmlOnly();

  const groupHint = withGroups && state.draft.groups.length
    ? `，并生成 ${state.draft.groups.length} 个顶层分组`
    : '';
  const msg = `已应用「${example.name}」推荐参数：${fields.join('、')}${groupHint}`;
  if (chatView) chatView.addMessage('bot', msg);
  toast.ok(`已套用${example.name}`);
}

function applySceneCard(example) {
  if (!example || !state.draft) return;
  if (modeController && typeof modeController.enterWorkMode === 'function') {
    modeController.enterWorkMode();
  }
  state.modeType = 'describe';
  if (els.describeSamplePanel) els.describeSamplePanel.classList.remove('hidden');
  if (els.manualSelectPanel) els.manualSelectPanel.classList.add('hidden');
  applyDescribeExample(example, { withGroups: true });
  if (chatView) {
    chatView.setInputEnabled(true, '描述分组结构，如“在A侧添加外圆和端面，B侧也一样”');
    chatView.addMessage('bot', `已从场景「${example.name}」生成草稿。可继续用对话微调，或直接在右侧编辑分组树。`);
    chatView.focusInput();
  }
}

function renderSceneCards() {
  if (!els.sceneCardList) return;
  els.sceneCardList.innerHTML = '';
  for (const ex of DESCRIBE_EXAMPLES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scene-card';
    btn.setAttribute('aria-label', `套用${ex.name}`);

    const title = document.createElement('span');
    title.className = 'scene-card-title';
    title.textContent = ex.name;
    btn.appendChild(title);

    const desc = document.createElement('span');
    desc.className = 'scene-card-desc';
    desc.textContent = ex.text;
    btn.appendChild(desc);

    const meta = document.createElement('span');
    meta.className = 'scene-card-meta';
    meta.textContent = '一点即用';
    btn.appendChild(meta);

    btn.addEventListener('click', () => applySceneCard(ex));
    els.sceneCardList.appendChild(btn);
  }
}

function renderPhraseChips() {
  if (!els.phraseChips) return;
  els.phraseChips.innerHTML = '';
  for (const chip of PHRASE_CHIPS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'phrase-chip';
    btn.textContent = chip.label;
    btn.title = chip.text;
    btn.addEventListener('click', () => {
      if (!els.chatInput || els.chatInput.disabled) return;
      const current = els.chatInput.value.trim();
      els.chatInput.value = current ? `${current} ${chip.text}` : chip.text;
      els.chatInput.focus();
      // Move caret to end
      const len = els.chatInput.value.length;
      els.chatInput.setSelectionRange(len, len);
    });
    els.phraseChips.appendChild(btn);
  }
}

function renderDescribeExampleList() {
  if (!els.describeExampleList) return;
  els.describeExampleList.innerHTML = '';
  for (const ex of DESCRIBE_EXAMPLES) {
    const row = document.createElement('div');
    row.className = 'describe-example-inline-item';

    const t = document.createElement('div');
    t.className = 'describe-example-inline-text';
    t.textContent = ex.text;
    row.appendChild(t);

    const p = document.createElement('div');
    p.className = 'describe-example-inline-params';
    p.textContent = `推荐参数：${ex.partFields.join('、')}`;
    row.appendChild(p);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'describe-example-inline-btn';
    btn.textContent = `套用${ex.name}`;
    btn.addEventListener('click', () => applyDescribeExample(ex, { withGroups: true }));
    row.appendChild(btn);
    els.describeExampleList.appendChild(row);
  }
}

function workflowStatusText(status) {
  const map = {
    pending: '未开始',
    needs_input: '等待输入',
    awaiting_choice: '等待选择',
    running: '生成中',
    completed: '已完成',
    failed: '失败'
  };
  return map[status] || status || '未开始';
}

function workflowStatusClass(status) {
  if (status === 'completed') return 'completed';
  if (status === 'awaiting_choice' || status === 'needs_input') return 'waiting';
  if (status === 'running') return 'running';
  if (status === 'failed') return 'failed';
  return 'pending';
}

function renderAgentWorkflow() {
  const workflow = state.agentWorkflow;
  if (!workflow || !Array.isArray(workflow.steps) || workflow.steps.length === 0) return null;

  const card = document.createElement('div');
  card.className = 'agent-workflow-card';

  const title = document.createElement('div');
  title.className = 'agent-workflow-title';
  title.textContent = '选择分组模板';
  card.appendChild(title);

  const list = document.createElement('div');
  list.className = 'agent-workflow-list';
  workflow.steps.forEach((step, index) => {
    const row = document.createElement('div');
    row.className = `agent-workflow-step ${workflowStatusClass(step.status)}`;

    const indexEl = document.createElement('div');
    indexEl.className = 'agent-workflow-index';
    indexEl.textContent = String(index + 1);
    row.appendChild(indexEl);

    const name = document.createElement('div');
    name.className = 'agent-workflow-name';
    name.textContent = step.title || step.id;
    row.appendChild(name);

    const status = document.createElement('div');
    status.className = 'agent-workflow-status';
    status.textContent = workflowStatusText(step.status);
    row.appendChild(status);

    list.appendChild(row);
  });
  card.appendChild(list);
  return card;
}

function renderTemplateRecommendations() {
  if (!els.templateRecommendPanel || !els.templateRecommendList) return;
  const recommendations = Array.isArray(state.templateRecommendations) ? state.templateRecommendations : [];
  const recognition = state.selectedRecognitionTemplate;
  const workflowCard = renderAgentWorkflow();
  els.templateRecommendPanel.classList.toggle('hidden', recommendations.length === 0 && !recognition && !workflowCard);
  els.templateRecommendList.innerHTML = '';
  if (workflowCard) {
    els.templateRecommendList.appendChild(workflowCard);
  }
  if (recognition) {
    const recCard = document.createElement('div');
    recCard.className = 'template-recommend-item recognition-template-item';

    const head = document.createElement('div');
    head.className = 'template-recommend-head';
    const title = document.createElement('div');
    title.className = 'template-recommend-title';
    title.textContent = `自动识别模板：${recognition.name}`;
    const score = document.createElement('div');
    score.className = 'template-recommend-score';
    score.textContent = `${Math.round((recognition.confidence || 0) * 100)}%`;
    head.appendChild(title);
    head.appendChild(score);
    recCard.appendChild(head);

    const meta = document.createElement('div');
    meta.className = 'template-recommend-meta';
    meta.textContent = `将识别：${(recognition.recognizes || []).join('、')}`;
    recCard.appendChild(meta);

    const reasons = document.createElement('div');
    reasons.className = 'template-recommend-reasons';
    reasons.textContent = (recognition.reasons || []).join('；');
    recCard.appendChild(reasons);
    els.templateRecommendList.appendChild(recCard);
  }
  if (!recommendations.length) return;

  for (const item of recommendations) {
    const card = document.createElement('div');
    card.className = 'template-recommend-item';

    const head = document.createElement('div');
    head.className = 'template-recommend-head';
    const title = document.createElement('div');
    title.className = 'template-recommend-title';
    title.textContent = item.displayName || item.filename;
    const score = document.createElement('div');
    score.className = 'template-recommend-score';
    score.textContent = `${Math.round((item.confidence || 0) * 100)}%`;
    head.appendChild(title);
    head.appendChild(score);
    card.appendChild(head);

    const meta = document.createElement('div');
    meta.className = 'template-recommend-meta';
    meta.textContent = `分组 ${item.groupCount || 0} 个，层级 ${item.depth || 0}`;
    card.appendChild(meta);

    const reasons = document.createElement('div');
    reasons.className = 'template-recommend-reasons';
    reasons.textContent = (item.reasons || []).join('；');
    card.appendChild(reasons);

    const features = document.createElement('div');
    features.className = 'template-recommend-tags';
    const tags = [...(item.groupNames || []), ...(item.featureSelections || [])].slice(0, 8);
    for (const tag of tags) {
      const chip = document.createElement('span');
      chip.textContent = tag;
      features.appendChild(chip);
    }
    card.appendChild(features);

    const actions = document.createElement('div');
    actions.className = 'template-recommend-actions';
    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.textContent = state.selectedGroupTemplate && state.selectedGroupTemplate.id === item.id ? '已确认' : '选择模板';
    applyBtn.disabled = state.selectedGroupTemplate && state.selectedGroupTemplate.id === item.id;
    applyBtn.addEventListener('click', () => applyRecommendedTemplate(item.id));
    actions.appendChild(applyBtn);
    card.appendChild(actions);

    els.templateRecommendList.appendChild(card);
  }
}

async function recommendTemplatesFromText(text) {
  if (!text || !text.trim()) return;
  try {
    const data = await apiRecommendGroupTemplates(text.trim(), 3);
    state.templateRecommendations = data.recommendations || [];
    renderTemplateRecommendations();
  } catch (e) {
    chatView.addMessage('system', `模板推荐失败：${e.message}`);
  }
}

function applyAgentResponseState(data) {
  state.agentSession = data.session || (data.sessionId ? { id: data.sessionId } : null);
  state.agentWorkflow = data.workflow || null;
  const candidatePanel = Array.isArray(data.ui)
    ? data.ui.find((item) => item && item.type === 'template_candidates')
    : null;
  if (candidatePanel && Array.isArray(candidatePanel.options)) {
    state.templateRecommendations = candidatePanel.options;
  } else if (Array.isArray(data.recommendations)) {
    state.templateRecommendations = data.recommendations;
  }
}

async function requestAgentTemplateSelection(text) {
  if (!text || !text.trim()) return false;
  try {
    const data = await apiAgentMessage(text.trim(), state.agentSession && state.agentSession.id, 3);
    applyAgentResponseState(data);
    renderTemplateRecommendations();
    chatView.addMessage('bot', data.reply || '我找到几个接近的分组模板，请选择一个作为基础。');
    return true;
  } catch (e) {
    chatView.addMessage('system', `智能体选择分组模板失败：${e.message}`);
    return false;
  }
}

async function applyRecommendedTemplate(templateId) {
  if (!templateId) return;
  try {
    pushHistory();
    const useAgentEvent = !!(state.agentSession && state.agentSession.id);
    const data = useAgentEvent
      ? await apiAgentEvent({
        type: 'ui.option_selected',
        sessionId: state.agentSession.id,
        stage: 'TemplateSelection',
        choiceId: templateId,
        payload: { templateId }
      })
      : await apiApplyGroupTemplate(templateId);
    if (data.workflow || data.session || data.ui) {
      applyAgentResponseState(data);
    }
    state.draft = adoptServerDraft(data.draft);
    state.selectedGroupTemplate = data.template || null;
    state.selectedRecognitionTemplate = useAgentEvent ? null : (data.recognitionRecommendation || null);
    state.selectedNodeId = null;
    expandedNodeIds.clear();
    setXml(data.xml);
    renderAll();
    const appliedName = (data.template && (data.template.displayName || data.template.filename)) || '模板';
    chatView.addMessage('bot', data.reply || `已应用分组模板「${appliedName}」。`);
    if (!useAgentEvent && state.selectedRecognitionTemplate) {
      chatView.addMessage('bot', `已选择自动识别模板「${state.selectedRecognitionTemplate.name}」。`);
    }
    chatView.addMessage('system', `当前分组结构：\n${data.structureSummary || '(暂无分组)'}`);
    toast.ok(`已应用「${appliedName}」`);
  } catch (e) {
    chatView.addMessage('bot', `应用模板失败：${e.message}`);
    toast.error(`应用模板失败：${e.message}`);
  }
}

async function handleFuzzyTemplateGeneration(text) {
  if (!text || !text.trim()) return false;
  try {
    const data = await apiGenerateFuzzyTemplate(text.trim(), 3);

    if (data.mode === 'auto_applied') {
      pushHistory();
      state.draft = adoptServerDraft(data.draft);
      state.selectedGroupTemplate = data.template || null;
      state.selectedRecognitionTemplate = data.recognitionRecommendation || null;
      state.templateRecommendations = [];
      state.selectedNodeId = null;
      expandedNodeIds.clear();
      setXml(data.xml || '');
      renderAll();
      chatView.addMessage('bot', data.reply || '已按描述自动生成模板。');
      if (state.selectedRecognitionTemplate) {
        chatView.addMessage('bot', `已选择自动识别模板「${state.selectedRecognitionTemplate.name}」。`);
      }
      chatView.addMessage('system', `当前分组结构：\n${data.structureSummary || '(暂无分组)'}`);
      toast.ok('已自动生成模板草稿');
      persistDraftCache();
      return true;
    }

    if (data.mode === 'needs_choice') {
      state.templateRecommendations = data.recommendations || [];
      renderTemplateRecommendations();
      chatView.addMessage('bot', data.question || '我找到几个相近模板，请选择一个应用。');
      return true;
    }

    if (data.mode === 'needs_clarification') {
      state.templateRecommendations = [];
      renderTemplateRecommendations();
      chatView.addMessage('bot', data.question || '请补充零件类型或典型特征。');
      return true;
    }
  } catch (e) {
    chatView.addMessage('system', `模糊生成失败，继续按普通指令解析：${e.message}`);
  }
  return false;
}

function renderAll() {
  if (state.selectedNodeId && !findNodeById(state.draft.groups, state.selectedNodeId)) {
    state.selectedNodeId = null;
  }

  const renderTreeOnly = () => {
    renderTree(els.tree, state.draft.groups, state.selectedNodeId, {
      onSelect: (id) => {
        state.selectedNodeId = id;
        expandedNodeIds.add(id);
        renderAll();
      },
      isExpanded: (id) => expandedNodeIds.has(id),
      onToggleExpand: (id) => {
        if (expandedNodeIds.has(id)) expandedNodeIds.delete(id);
        else expandedNodeIds.add(id);
        renderAll();
      },
      onDelete: (id) => {
        if (!id) return;
        const node = findNodeById(state.draft.groups, id);
        if (!node) return;
        if (!window.confirm(`确定删除分组「${node.name}」及其子分组吗？`)) return;

        const collectIds = (n, out = []) => {
          if (!n) return out;
          out.push(n.id);
          for (const c of n.children || []) collectIds(c, out);
          return out;
        };
        const ids = collectIds(node, []);
        pushHistory();
        deleteGroup(state.draft.groups, id);
        for (const x of ids) expandedNodeIds.delete(x);
        if (ids.includes(state.selectedNodeId)) state.selectedNodeId = null;
        renderAll();
        refreshXmlOnly();
        toast.ok(`已删除分组「${node.name}」`);
      },
      onDragStart: (id) => {
        state.draggingNodeId = id;
      },
      onDrop: (targetId) => {
        pushHistory();
        const ok = moveNodeAsChild(state.draft.groups, state.draggingNodeId, targetId);
        if (!ok) {
          draftHistory.pop();
          updateUndoButton();
          toast.warn('无法移动到该位置');
          return;
        }
        renderAll();
        refreshXmlOnly();
        toast.ok('已调整分组层级');
      }
    });
  };

  renderTreeOnly();
  renderTemplateRecommendations();

  if (els.partCardsSection) {
    els.partCardsSection.classList.remove('hidden');
  }
  renderPartSelectionSummary(els.partCards, state.draft.partTemplateFields);

  const selectedNode = findNodeById(state.draft.groups, state.selectedNodeId);
  if (els.groupCardsSection) {
    els.groupCardsSection.classList.remove('hidden');
  }
  if (els.groupCardsBody && els.groupCardsToggleBtn) {
    const autoCollapsed = !selectedNode;
    if (autoCollapsed) groupCardsCollapsedByUser = false;
    const collapsed = autoCollapsed || groupCardsCollapsedByUser;
    els.groupCardsBody.classList.toggle('hidden', collapsed);
    els.groupCardsToggleBtn.textContent = collapsed ? '展开' : '收起';
    els.groupCardsToggleBtn.disabled = autoCollapsed;
  }
  if (selectedNode) {
    if (groupEditState.nodeId !== selectedNode.id) {
      groupEditState = {
        nodeId: selectedNode.id,
        values: snapshotGroupValues(selectedNode, state.draft.groupTemplateFields)
      };
    }
  } else {
    groupEditState = { nodeId: null, values: {} };
  }

  renderGroupCards(
    els.groupCards,
    selectedNode,
    state.draft.groupTemplateFields,
    state.featureTree,
    state.features,
    groupEditState.values,
    {
      onFieldChange: (field, value) => {
        groupEditState.values[field] = value;
      },
      onCancel: () => {
        if (!selectedNode) return;
        groupEditState = {
          nodeId: selectedNode.id,
          values: snapshotGroupValues(selectedNode, state.draft.groupTemplateFields)
        };
        renderAll();
      },
      onSave: () => {
        if (!selectedNode) return;
        pushHistory();
        for (const [field, value] of Object.entries(groupEditState.values || {})) {
          setGroupParam(selectedNode, field, value);
        }
        renderTreeOnly();
        refreshXmlOnly();
        toast.ok('已保存分组参数');
      }
    }
  );

  if (els.partTplFields) {
    renderTemplateEditor(els.partTplFields, state.draft.partTemplateFields, (field) => {
      pushHistory();
      removePartTemplateField(state.draft, field);
      renderAll();
      refreshXmlOnly();
      toast.ok(`已移除零件参数「${field}」`);
    });
  }

  if (els.groupTplFields) {
    renderTemplateEditor(els.groupTplFields, state.draft.groupTemplateFields, (field) => {
      pushHistory();
      removeGroupTemplateField(state.draft, field);
      renderAll();
      refreshXmlOnly();
      toast.ok(`已移除分组参数「${field}」`);
    });
  }
  persistDraftCache();
}

async function refreshXmlOnly() {
  const seq = ++refreshSeq;
  const result = await chatEngine.refreshXml(state.draft);
  if (!result.ok) return;
  if (seq !== refreshSeq) return;
  // Keep local draft as source of truth for UI; this call is only for XML preview refresh.
  setXml(result.xml);
  persistDraftCache();
}

async function sendChat() {
  const text = chatView.getInputText();
  if (!text) return;
  // Allow direct chat from the initial screen: auto-enter work mode so right preview is visible.
  if (!state.modeActive && modeController && typeof modeController.enterWorkMode === 'function') {
    modeController.enterWorkMode();
    renderAll();
  }
  chatView.clearInput();
  chatView.addMessage('user', text);
  pushHistory();
  if (state.modeType === 'describe') {
    const agentHandled = await requestAgentTemplateSelection(text);
    if (agentHandled) {
      chatView.setInputEnabled(true, '描述分组结构，如“在A侧添加外圆和端面，B侧也一样”');
      chatView.focusInput();
      return;
    }
    recommendTemplatesFromText(text);
  }
  const pending = chatView.addPendingMessage('LLM等待中（已等待 0 秒）');
  const start = Date.now();
  let warnedSlow = false;
  const tick = setInterval(() => {
    const sec = Math.floor((Date.now() - start) / 1000);
    let msg = `LLM等待中（已等待 ${sec} 秒）`;
    if (sec >= 45) {
      warnedSlow = true;
      msg += '，当前较慢，请耐心等待或稍后重试';
    }
    pending.update(msg);
  }, 1000);

  try {
    const result = await chatEngine.processUserInput(state.draft, text);
    if (!result.ok) {
      // Roll back history snapshot since nothing changed
      draftHistory.pop();
      updateUndoButton();
      chatView.addMessage('bot', result.message || '请求失败');
      toast.error(result.message || '请求失败');
      if (warnedSlow) {
        chatView.addMessage('system', '提示：本次等待较久，你可在“设置”中配置超时秒数（0=不限时）。');
      }
      chatView.setInputEnabled(true, '描述分组结构，如“在A侧添加外圆和端面，B侧也一样”');
      chatView.focusInput();
      return;
    }
    state.draft = adoptServerDraft(result.draft);
    setXml(result.xml);
    chatView.addMessage('bot', result.reply || '已处理');
    chatView.addMessage('system', `解析来源：${result.llmUsed ? 'LLM' : '规则兜底'}`);
    if (result.llmUsed && result.llmUnderstanding) {
      chatView.addMessage('system', `LLM理解：${result.llmUnderstanding}`);
    }
    const structureText = (result.structureSummary || '').trim();
    chatView.addMessage('system', `当前分组结构：\n${structureText || '(暂无分组)'}`);
    renderAll();
    toast.ok('已更新分组结构');
    chatView.setInputEnabled(true, '描述分组结构，如“在A侧添加外圆和端面，B侧也一样”');
    chatView.focusInput();
    persistDraftCache();
  } finally {
    clearInterval(tick);
    pending.remove();
  }
}

async function saveDraft() {
  if (exportInProgress) return;

  const localErrors = validateDraftForExport(state.draft);
  if (localErrors.length) {
    const detail = localErrors.join('；');
    chatView.addMessage('bot', `导出前检查未通过：${detail}`);
    toast.warn(localErrors[0]);
    return;
  }

  exportInProgress = true;
  if (els.exportTemplateBtn) els.exportTemplateBtn.disabled = true;
  if (els.saveBtn) els.saveBtn.disabled = true;

  try {
    const data = await apiSave(state.draft);
    if (!data.ok) {
      const detail = data.message || (Array.isArray(data.errors) && data.errors.join('；')) || '未知错误';
      chatView.addMessage('bot', `保存失败：${detail}`);
      toast.error(Array.isArray(data.errors) && data.errors[0] ? data.errors[0] : detail);
      return;
    }
    setXml(data.xml || '');
    chatView.addMessage('bot', `已导出模板：${data.filename}\n导出路径：${data.filePath}`);
    toast.ok(`已导出：${data.filename}`);
  } catch (err) {
    const msg = err.message || '网络请求失败';
    chatView.addMessage('bot', `保存失败：${msg}`);
    toast.error(msg);
  } finally {
    exportInProgress = false;
    if (els.exportTemplateBtn) els.exportTemplateBtn.disabled = false;
    if (els.saveBtn) els.saveBtn.disabled = false;
  }
}

function bindEvents() {
  settingsController.bindEvents();
  modeController.bindEvents();

  if (els.undoBtn) {
    els.undoBtn.addEventListener('click', () => undoLastChange());
  }

  window.addEventListener('keydown', (event) => {
    const key = (event.key || '').toLowerCase();
    const isUndo = (event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey;
    if (!isUndo) return;
    const tag = (event.target && event.target.tagName) || '';
    // Allow native undo inside text fields
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    event.preventDefault();
    undoLastChange();
  });

  if (els.emptySceneHintBtn) {
    els.emptySceneHintBtn.addEventListener('click', () => {
      const axis = DESCRIBE_EXAMPLES.find((x) => x.name === '轴类样例') || DESCRIBE_EXAMPLES[0];
      applySceneCard(axis);
    });
  }

  els.previewTemplateBtn.addEventListener('click', () => {
    if (!state.modeActive) {
      toast.warn('请先点场景卡或开始对话');
      return;
    }
    const isHidden = els.xmlCard.classList.contains('hidden');
    if (isHidden) {
      els.xmlCard.classList.remove('hidden');
      const hideLabel = els.previewTemplateBtn.querySelector('.btn-label');
      if (hideLabel) hideLabel.textContent = '隐藏模板';
      else els.previewTemplateBtn.textContent = '隐藏模板';
      els.xmlCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      els.xmlCard.classList.add('hidden');
      const showLabel = els.previewTemplateBtn.querySelector('.btn-label');
      if (showLabel) showLabel.textContent = '预览模板';
      else els.previewTemplateBtn.textContent = '预览模板';
    }
  });

  if (els.exportTemplateBtn) {
    els.exportTemplateBtn.addEventListener('click', () => {
      saveDraft();
    });
  }

  chatView.bindSend(sendChat);

  if (els.groupCardsToggleBtn) {
    els.groupCardsToggleBtn.addEventListener('click', () => {
      const selectedNode = findNodeById(state.draft.groups, state.selectedNodeId);
      if (!selectedNode) return;
      groupCardsCollapsedByUser = !groupCardsCollapsedByUser;
      renderAll();
    });
  }

  if (els.addTopBtn) {
    els.addTopBtn.addEventListener('click', () => {
      const name = window.prompt('请输入顶层分组名称');
      if (!name) return;
      pushHistory();
      addTopGroup(state.draft.groups, name, state.draft.groupTemplateFields);
      renderAll();
      refreshXmlOnly();
      toast.ok(`已添加顶层分组「${name}」`);
    });
  }

  if (els.addChildBtn) {
    els.addChildBtn.addEventListener('click', () => {
      if (!state.selectedNodeId) {
        toast.warn('请先选择一个分组节点');
        return;
      }
      const name = window.prompt('请输入子分组名称');
      if (!name) return;
      pushHistory();
      addChildGroup(state.draft.groups, state.selectedNodeId, name, state.draft.groupTemplateFields);
      renderAll();
      refreshXmlOnly();
      toast.ok(`已添加子分组「${name}」`);
    });
  }

  if (els.deleteNodeBtn) {
    els.deleteNodeBtn.addEventListener('click', () => {
      if (!state.selectedNodeId) return;
      pushHistory();
      deleteGroup(state.draft.groups, state.selectedNodeId);
      state.selectedNodeId = null;
      renderAll();
      refreshXmlOnly();
      toast.ok('已删除分组');
    });
  }

  if (els.saveBtn) {
    els.saveBtn.addEventListener('click', saveDraft);
  }

  if (els.addPartTplFieldBtn && els.newPartTplField) {
    els.addPartTplFieldBtn.addEventListener('click', () => {
      const name = els.newPartTplField.value.trim();
      if (!name) return;
      pushHistory();
      addPartTemplateField(state.draft, name);
      els.newPartTplField.value = '';
      renderAll();
      refreshXmlOnly();
      toast.ok(`已添加零件参数「${name}」`);
    });
  }

  if (els.addGroupTplFieldBtn && els.newGroupTplField) {
    els.addGroupTplFieldBtn.addEventListener('click', () => {
      const name = els.newGroupTplField.value.trim();
      if (!name) return;
      pushHistory();
      addGroupTemplateField(state.draft, name);
      els.newGroupTplField.value = '';
      renderAll();
      refreshXmlOnly();
      toast.ok(`已添加分组参数「${name}」`);
    });
  }
}

function bindLayoutResize() {
  if (!els.splitter) return;
  const layout = document.querySelector('.layout');
  if (!layout) return;
  let resizing = false;

  const onMove = (e) => {
    if (!resizing) return;
    const rect = layout.getBoundingClientRect();
    const minRight = 320;
    const maxRight = Math.max(minRight, Math.min(620, rect.width - 520));
    const nextRight = Math.max(minRight, Math.min(maxRight, rect.right - e.clientX));
    document.documentElement.style.setProperty('--right-panel-width', `${nextRight}px`);
  };

  const stop = () => {
    if (!resizing) return;
    resizing = false;
    layout.classList.remove('is-resizing');
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', stop);
  };

  els.splitter.addEventListener('mousedown', (e) => {
    if (window.innerWidth <= 980) return;
    resizing = true;
    layout.classList.add('is-resizing');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stop);
    e.preventDefault();
  });
}

export async function initApp() {
  const data = await apiInit();
  try { localStorage.removeItem(DRAFT_CACHE_KEY); } catch (_) {}
  state.draft = data.draft;
  // 初始不默认勾选任何零件级参数；不恢复历史草稿，避免误带出旧分组
  state.modeActive = false;
  state.modeType = null;
  expandedNodeIds.clear();
  state.draft.groups = [];
  state.draft.partTemplateFields = [];
  state.draft.partParams = {};
  syncGroupTemplateByPartSelection(state.draft);
  state.partFieldsConfirmed = false;
  state.features = data.features || [];
  state.featureTree = data.featureTree || [];
  state.scenePresets = data.scenePresets || [];
  state.groupTemplates = data.groupTemplates || [];
  state.templateRecommendations = [];
  state.agentSession = null;
  state.agentWorkflow = null;
  state.selectedGroupTemplate = null;
  state.selectedRecognitionTemplate = null;
  state.supportedPartFields = data.supportedPartFields || [];
  draftHistory.clear();
  updateUndoButton();
  renderPartFieldList(state.supportedPartFields);
  renderDescribeExampleList();
  renderSceneCards();
  renderPhraseChips();
  chatView = createChatView({
    chatLogEl: els.chatLog,
    chatInputEl: els.chatInput,
    sendBtnEl: els.sendBtn
  });
  settingsController = createSettingsController({ els, aiService, state });
  modeController = createModeController({
    els,
    state,
    chatEngine,
    renderAll,
    refreshXmlOnly,
    addMsg: (role, text) => chatView.addMessage(role, text),
    clearMessages: () => {
      chatView.clearMessages();
      draftHistory.clear();
      updateUndoButton();
    },
    setInputEnabled: (enabled, placeholder) => chatView.setInputEnabled(enabled, placeholder)
  });
  bindEvents();
  bindLayoutResize();
  await settingsController.load();

  const xmlResult = await chatEngine.refreshXml(state.draft);
  if (xmlResult.ok) {
    setXml(xmlResult.xml);
  }
  renderAll();
  chatView.setInputEnabled(true, '可直接输入分组描述，如“创建A侧和B侧分组”');
  chatView.focusInput();
}
