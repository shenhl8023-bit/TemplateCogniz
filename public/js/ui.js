import { state, findNodeById } from './store.js';
import { apiApplyGroupTemplate, apiInit, apiRecommendGroupTemplates, apiSave } from './services.js';
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
  previewContent: document.getElementById('previewContent'),
  partFieldList: document.getElementById('partFieldList'),
  chatLog: document.getElementById('chatLog'),
  chatInput: document.getElementById('chatInput'),
  sendBtn: document.getElementById('sendBtn'),
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
let settingsController = null;
let modeController = null;
let chatView = null;
let refreshSeq = 0;
let groupEditState = { nodeId: null, values: {} };
let groupCardsCollapsedByUser = false;
const expandedNodeIds = new Set();
const DRAFT_CACHE_KEY = 'group_template_draft_cache_v1';
const DEFAULT_GROUP_FIELDS = ['依赖方向', '依赖方式', '特征选择'];
const DESCRIBE_EXAMPLES = [
  {
    name: '轴类样例',
    text: '轴类零件，分A侧和B侧，按端面和外圆分组',
    partFields: ['原点', '主方向1', '有主轴线']
  },
  {
    name: '壳体样例',
    text: '壳体件，按多方向面分组，区分孔和通槽',
    partFields: ['主方向1', '主方向2', '主方向3', '主方向4', '主方向5', '主方向6', '是否需要加工面分离']
  },
  {
    name: '简件样例',
    text: '简单小件，方向要求低，按特征直接打包',
    partFields: ['原点', '主方向']
  }
];

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
      togglePartField(state.draft, field, on);
      state.partFieldsConfirmed = state.draft.partTemplateFields.length > 0;
      refreshXmlOnly();
      renderAll();
    }));
  }
  listCard.appendChild(listGrid);
  els.partFieldList.appendChild(listCard);
}


function applyDescribeExample(example) {
  if (!example || !state.draft) return;
  state.selectedNodeId = null;
  state.draggingNodeId = null;
  state.draft.groups = [];
  state.draft.partTemplateFields = [];
  state.draft.partParams = {};
  state.draft.groupTemplateFields = [...DEFAULT_GROUP_FIELDS];

  const fields = Array.isArray(example.partFields) ? example.partFields : [];
  for (const f of fields) addPartTemplateField(state.draft, f);
  syncGroupTemplateByPartSelection(state.draft);

  state.partFieldsConfirmed = state.draft.partTemplateFields.length > 0;
  renderPartFieldList(state.supportedPartFields || []);
  renderAll();
  refreshXmlOnly();
  chatView.addMessage('bot', `已应用「${example.name}」推荐参数：${fields.join('、')}`);
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
    btn.textContent = `套用${ex.name}参数`;
    btn.addEventListener('click', () => applyDescribeExample(ex));
    row.appendChild(btn);
    els.describeExampleList.appendChild(row);
  }
}

function renderTemplateRecommendations() {
  if (!els.templateRecommendPanel || !els.templateRecommendList) return;
  const recommendations = Array.isArray(state.templateRecommendations) ? state.templateRecommendations : [];
  const recognition = state.selectedRecognitionTemplate;
  els.templateRecommendPanel.classList.toggle('hidden', recommendations.length === 0 && !recognition);
  els.templateRecommendList.innerHTML = '';
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
    applyBtn.textContent = state.selectedGroupTemplate && state.selectedGroupTemplate.id === item.id ? '已应用' : '应用模板';
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

async function applyRecommendedTemplate(templateId) {
  if (!templateId) return;
  try {
    const data = await apiApplyGroupTemplate(templateId);
    state.draft = adoptServerDraft(data.draft);
    state.selectedGroupTemplate = data.template || null;
    state.selectedRecognitionTemplate = data.recognitionRecommendation || null;
    state.selectedNodeId = null;
    expandedNodeIds.clear();
    setXml(data.xml);
    renderAll();
    chatView.addMessage('bot', `已应用分组模板「${data.template.displayName || data.template.filename}」。`);
    if (state.selectedRecognitionTemplate) {
      chatView.addMessage('bot', `已选择自动识别模板「${state.selectedRecognitionTemplate.name}」。`);
    }
    chatView.addMessage('system', `当前分组结构：\n${data.structureSummary || '(暂无分组)'}`);
  } catch (e) {
    chatView.addMessage('bot', `应用模板失败：${e.message}`);
  }
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
        deleteGroup(state.draft.groups, id);
        for (const x of ids) expandedNodeIds.delete(x);
        if (ids.includes(state.selectedNodeId)) state.selectedNodeId = null;
        renderAll();
        refreshXmlOnly();
      },
      onDragStart: (id) => {
        state.draggingNodeId = id;
      },
      onDrop: (targetId) => {
        const ok = moveNodeAsChild(state.draft.groups, state.draggingNodeId, targetId);
        if (!ok) return;
        renderAll();
        refreshXmlOnly();
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
        for (const [field, value] of Object.entries(groupEditState.values || {})) {
          setGroupParam(selectedNode, field, value);
        }
        renderTreeOnly();
        refreshXmlOnly();
      }
    }
  );

  if (els.partTplFields) {
    renderTemplateEditor(els.partTplFields, state.draft.partTemplateFields, (field) => {
      removePartTemplateField(state.draft, field);
      renderAll();
      refreshXmlOnly();
    });
  }

  if (els.groupTplFields) {
    renderTemplateEditor(els.groupTplFields, state.draft.groupTemplateFields, (field) => {
      removeGroupTemplateField(state.draft, field);
      renderAll();
      refreshXmlOnly();
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
  if (state.modeType === 'describe') {
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
      chatView.addMessage('bot', result.message || '请求失败');
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
    chatView.setInputEnabled(true, '描述分组结构，如“在A侧添加外圆和端面，B侧也一样”');
    chatView.focusInput();
    persistDraftCache();
  } finally {
    clearInterval(tick);
    pending.remove();
  }
}

async function saveDraft() {
  const data = await apiSave(state.draft);
  if (!data.ok) {
    chatView.addMessage('bot', `保存失败：${(data.errors || []).join('；')}`);
    return;
  }
  chatView.addMessage('bot', `已导出模板：${data.filename}\n导出路径：${data.filePath}`);
}

function bindEvents() {
  settingsController.bindEvents();
  modeController.bindEvents();

  els.previewTemplateBtn.addEventListener('click', () => {
    if (!state.modeActive) {
      window.alert('请先选择上方操作方式并开始对话。');
      return;
    }
    const isHidden = els.xmlCard.classList.contains('hidden');
    if (isHidden) {
      els.xmlCard.classList.remove('hidden');
      els.previewTemplateBtn.textContent = '📄 隐藏模板';
      els.xmlCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      els.xmlCard.classList.add('hidden');
      els.previewTemplateBtn.textContent = '📄 预览模板';
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
      addTopGroup(state.draft.groups, name, state.draft.groupTemplateFields);
      renderAll();
      refreshXmlOnly();
    });
  }

  if (els.addChildBtn) {
    els.addChildBtn.addEventListener('click', () => {
      if (!state.selectedNodeId) {
        window.alert('请先选择一个分组节点');
        return;
      }
      const name = window.prompt('请输入子分组名称');
      if (!name) return;
      addChildGroup(state.draft.groups, state.selectedNodeId, name, state.draft.groupTemplateFields);
      renderAll();
      refreshXmlOnly();
    });
  }

  if (els.deleteNodeBtn) {
    els.deleteNodeBtn.addEventListener('click', () => {
      if (!state.selectedNodeId) return;
      deleteGroup(state.draft.groups, state.selectedNodeId);
      state.selectedNodeId = null;
      renderAll();
      refreshXmlOnly();
    });
  }

  if (els.saveBtn) {
    els.saveBtn.addEventListener('click', saveDraft);
  }

  if (els.addPartTplFieldBtn && els.newPartTplField) {
    els.addPartTplFieldBtn.addEventListener('click', () => {
      const name = els.newPartTplField.value.trim();
      if (!name) return;
      addPartTemplateField(state.draft, name);
      els.newPartTplField.value = '';
      renderAll();
      refreshXmlOnly();
    });
  }

  if (els.addGroupTplFieldBtn && els.newGroupTplField) {
    els.addGroupTplFieldBtn.addEventListener('click', () => {
      const name = els.newGroupTplField.value.trim();
      if (!name) return;
      addGroupTemplateField(state.draft, name);
      els.newGroupTplField.value = '';
      renderAll();
      refreshXmlOnly();
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
  state.selectedGroupTemplate = null;
  state.selectedRecognitionTemplate = null;
  state.supportedPartFields = data.supportedPartFields || [];
  renderPartFieldList(state.supportedPartFields);
  renderDescribeExampleList();
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
    clearMessages: () => chatView.clearMessages(),
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
