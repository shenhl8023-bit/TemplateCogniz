const state = {
  templates: [],
  features: null,
  candidates: [],
  selectedTemplateId: '',
  lastResponse: null,
  lastDraft: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  serverStatus: $('#serverStatus'),
  templateCount: $('#templateCount'),
  featureCount: $('#featureCount'),
  descriptionInput: $('#descriptionInput'),
  limitInput: $('#limitInput'),
  writeFileToggle: $('#writeFileToggle'),
  proposeBtn: $('#proposeBtn'),
  smokeBtn: $('#smokeBtn'),
  buildDraftBtn: $('#buildDraftBtn'),
  templateSearch: $('#templateSearch'),
  templateList: $('#templateList'),
  candidateList: $('#candidateList'),
  modeBadge: $('#modeBadge'),
  summaryStats: $('#summaryStats'),
  fieldPills: $('#fieldPills'),
  structureTree: $('#structureTree'),
  draftEditor: $('#draftEditor'),
  xmlOutput: $('#xmlOutput'),
  jsonOutput: $('#jsonOutput'),
  logOutput: $('#logOutput'),
  toast: $('#toast')
};

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = label || '处理中';
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function toast(message, type = 'info') {
  els.toast.textContent = message;
  els.toast.dataset.type = type;
  els.toast.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove('show'), 2800);
}

async function api(path, payload = {}) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await response.json();
  if (!response.ok && !json) throw new Error(`HTTP ${response.status}`);
  return json;
}

async function bootstrap() {
  try {
    const response = await fetch('/api/bootstrap');
    const data = await response.json();
    if (!data.ok) throw new Error(data.message || '初始化失败');
    state.templates = data.templates || [];
    state.features = data.features || null;
    els.serverStatus.textContent = '已连接';
    els.serverStatus.className = 'status-pill status-ok';
    els.templateCount.textContent = `模板 ${state.templates.length}`;
    els.featureCount.textContent = `特征 ${state.features ? state.features.flat.length : 0}`;
    renderTemplateList();
    els.logOutput.textContent = [
      `Demo 服务已连接`,
      `样例目录: ${data.sampleDir}`,
      `输出目录: ${data.outputDir}`
    ].join('\n');
  } catch (err) {
    els.serverStatus.textContent = '连接失败';
    els.serverStatus.className = 'status-pill status-error';
    els.logOutput.textContent = err.message || String(err);
  }
}

function renderTemplateList() {
  const query = els.templateSearch.value.trim().toLowerCase();
  const filtered = state.templates.filter((item) => {
    const haystack = [
      item.filename,
      item.displayName,
      item.relativePath,
      ...(item.groupNames || []),
      ...(item.featureSelections || [])
    ].join(' ').toLowerCase();
    return !query || haystack.includes(query);
  });

  if (!filtered.length) {
    els.templateList.innerHTML = '<div class="empty-state"><p>没有匹配的模板。</p></div>';
    return;
  }

  els.templateList.innerHTML = filtered.map((item) => `
    <button class="template-row" type="button" data-template-id="${escapeHtml(item.id)}">
      <strong>${escapeHtml(item.displayName)}</strong>
      <span>${escapeHtml(item.filename)}</span>
      <span class="row-meta">
        <span>${item.groupCount} 分组</span>
        <span>${item.depth} 层</span>
        <span>${(item.featureSelections || []).length} 特征</span>
      </span>
    </button>
  `).join('');
}

function setMode(mode) {
  const label = {
    awaiting_choice: '待确认',
    completed: '已确认',
    needs_input: '需补充',
    error: '错误',
    validation_failed: '校验失败',
    not_found: '未找到'
  }[mode] || mode || '待推荐';
  els.modeBadge.textContent = label;
}

function renderCandidates(candidates) {
  state.candidates = candidates || [];
  if (!state.candidates.length) {
    els.candidateList.className = 'candidate-list empty-state';
    els.candidateList.innerHTML = '<p>暂无候选结果。</p>';
    return;
  }

  els.candidateList.className = 'candidate-list';
  els.candidateList.innerHTML = state.candidates.map((item) => {
    const percent = Math.round((item.confidence || 0) * 100);
    const reasons = (item.reasons || []).slice(0, 6);
    return `
      <article class="candidate-card ${item.templateId === state.selectedTemplateId ? 'selected' : ''}">
        <div class="candidate-head">
          <div>
            <strong>${escapeHtml(item.displayName || item.filename || item.templateId)}</strong>
            <div class="card-meta">
              <span>${escapeHtml(item.filename || '')}</span>
              <span>${item.groupCount || 0} 分组</span>
              <span>${item.depth || 0} 层</span>
            </div>
          </div>
          <div class="confidence-ring" style="--pct: ${percent}%">
            <span>${percent}%</span>
          </div>
        </div>
        <div class="candidate-body">
          <ul class="reason-list">
            ${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}
          </ul>
          <div class="pill-cloud">
            ${(item.tags || item.groupNames || []).slice(0, 8).map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join('')}
          </div>
          <button class="candidate-action" type="button" data-confirm-template="${escapeHtml(item.templateId || item.id)}">
            确认并生成
          </button>
        </div>
      </article>
    `;
  }).join('');
}

function renderStats(source = {}) {
  const groupCount = source.groupCount || (source.selectedTemplate && source.selectedTemplate.groupCount) || 0;
  const depth = source.depth || (source.selectedTemplate && source.selectedTemplate.depth) || 0;
  const featureCount = (source.featureSelections || (source.selectedTemplate && source.selectedTemplate.tags) || []).length;
  els.summaryStats.innerHTML = `
    <div><strong>${groupCount}</strong><span>分组</span></div>
    <div><strong>${depth}</strong><span>层级</span></div>
    <div><strong>${featureCount}</strong><span>特征</span></div>
  `;
}

function renderFields(source = {}) {
  const fields = [
    ...(source.partTemplateFields || []),
    ...(source.groupTemplateFields || [])
  ];
  els.fieldPills.innerHTML = fields.slice(0, 24).map((field) => `<span class="pill">${escapeHtml(field)}</span>`).join('');
}

function renderTreeFromSummary(summary) {
  const lines = String(summary || '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) {
    els.structureTree.className = 'tree-view empty-state';
    els.structureTree.innerHTML = '<p>暂无结构摘要。</p>';
    return;
  }

  const root = [];
  const stack = [{ level: -1, children: root }];
  for (const rawLine of lines) {
    const match = /^(\s*)-\s*(.+)$/.exec(rawLine);
    if (!match) continue;
    const level = Math.floor(match[1].length / 2);
    const node = { name: match[2], children: [] };
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push({ level, children: node.children });
  }

  els.structureTree.className = 'tree-view';
  els.structureTree.innerHTML = renderTreeNodes(root);
}

function renderTreeFromGroups(groups) {
  if (!Array.isArray(groups) || !groups.length) {
    els.structureTree.className = 'tree-view empty-state';
    els.structureTree.innerHTML = '<p>Draft 中没有分组。</p>';
    return;
  }
  els.structureTree.className = 'tree-view';
  els.structureTree.innerHTML = renderTreeNodes(groups.map((group) => ({
    name: group.name,
    feature: group.params && group.params['特征选择'],
    children: group.children || []
  })));
}

function renderTreeNodes(nodes) {
  if (!nodes || !nodes.length) return '';
  return `<ul>${nodes.map((node) => `
    <li>
      <span class="tree-node">
        <strong>${escapeHtml(node.name || '未命名')}</strong>
        ${node.feature ? `<span class="node-feature">${escapeHtml(node.feature)}</span>` : ''}
      </span>
      ${renderTreeNodes(node.children || [])}
    </li>
  `).join('')}</ul>`;
}

function showResponse(response) {
  state.lastResponse = response;
  els.jsonOutput.textContent = prettyJson(response);
  els.logOutput.textContent = [
    response.command ? `命令: ${response.command}` : '',
    response.stderr ? `stderr:\n${response.stderr}` : '',
    response.stdout && !response.result ? `stdout:\n${response.stdout}` : ''
  ].filter(Boolean).join('\n\n') || '无额外日志';
}

async function propose() {
  const text = els.descriptionInput.value.trim();
  if (!text) {
    toast('请先输入零件描述。', 'warn');
    return;
  }
  setBusy(els.proposeBtn, true, '推荐中');
  try {
    const response = await api('/api/propose', {
      text,
      limit: Number(els.limitInput.value || 3)
    });
    showResponse(response);
    const result = response.result || {};
    setMode(result.mode || (response.ok ? 'awaiting_choice' : 'error'));
    renderCandidates(result.candidates || []);
    if (result.candidates && result.candidates[0]) {
      previewTemplate(result.candidates[0]);
    }
    toast(response.ok ? '推荐完成。' : '推荐返回错误。', response.ok ? 'ok' : 'error');
  } catch (err) {
    toast(err.message || String(err), 'error');
  } finally {
    setBusy(els.proposeBtn, false);
  }
}

function previewTemplate(template) {
  renderStats(template);
  renderFields(template);
  renderTreeFromSummary(template.structureSummary);
  els.draftEditor.value = '';
  els.xmlOutput.textContent = '';
}

async function confirmTemplate(templateId) {
  if (!templateId) return;
  state.selectedTemplateId = templateId;
  renderCandidates(state.candidates);
  const button = document.querySelector(`[data-confirm-template="${CSS.escape(templateId)}"]`);
  setBusy(button, true, '生成中');
  try {
    const response = await api('/api/confirm', {
      templateId,
      validate: true,
      includeDraft: true,
      includeXml: true,
      writeFile: els.writeFileToggle.checked,
      writeEncoding: 'utf8'
    });
    showResponse(response);
    const result = response.result || {};
    setMode(result.mode || (response.ok ? 'completed' : 'error'));
    renderStats(result.selectedTemplate || {});
    renderFields(result.draft || result.selectedTemplate || {});
    if (result.draft) {
      state.lastDraft = result.draft;
      els.draftEditor.value = prettyJson(result.draft);
      renderTreeFromGroups(result.draft.groups || []);
    } else {
      renderTreeFromSummary(result.structureSummary);
    }
    els.xmlOutput.textContent = result.xml || '';
    toast(response.ok ? '确认完成，Draft/XML 已生成。' : '确认失败，请查看 JSON。', response.ok ? 'ok' : 'error');
  } catch (err) {
    toast(err.message || String(err), 'error');
  } finally {
    setBusy(button, false);
  }
}

async function parseTemplate(templateId) {
  setMode('读取中');
  try {
    const response = await api('/api/parse', { templateId });
    showResponse(response);
    if (response.template) {
      state.selectedTemplateId = templateId;
      renderStats(response.template);
      renderFields(response.template);
      renderTreeFromGroups(response.template.groups || []);
      els.draftEditor.value = prettyJson({
        partTemplateFields: response.template.partTemplateFields,
        groupTemplateFields: response.template.groupTemplateFields,
        partParams: response.template.partParams,
        groups: response.template.groups
      });
      els.xmlOutput.textContent = '';
      setMode(response.validation && response.validation.ok ? '已解析' : '校验提示');
    }
  } catch (err) {
    toast(err.message || String(err), 'error');
  }
}

async function buildDraft() {
  let draft = null;
  try {
    draft = els.draftEditor.value.trim()
      ? JSON.parse(els.draftEditor.value)
      : (state.lastDraft || null);
  } catch (err) {
    toast(`Draft JSON 格式错误: ${err.message}`, 'error');
    return;
  }
  if (!draft) {
    toast('请先确认模板，或在 Draft 页签输入 JSON。', 'warn');
    return;
  }
  setBusy(els.buildDraftBtn, true, '构建中');
  try {
    const response = await api('/api/build', {
      draft,
      encoding: 'GB2312',
      writeFile: els.writeFileToggle.checked,
      writeEncoding: 'utf8'
    });
    showResponse(response);
    state.lastDraft = response.draft || draft;
    els.draftEditor.value = prettyJson(state.lastDraft);
    els.xmlOutput.textContent = response.xml || '';
    renderTreeFromGroups(state.lastDraft.groups || []);
    setMode(response.ok ? '已构建' : '校验失败');
    switchTab('xml');
    toast(response.ok ? 'XML 构建完成。' : 'XML 已生成，但校验未通过。', response.ok ? 'ok' : 'warn');
  } catch (err) {
    toast(err.message || String(err), 'error');
  } finally {
    setBusy(els.buildDraftBtn, false);
  }
}

async function runSmokeTest() {
  setBusy(els.smokeBtn, true, '测试中');
  switchTab('log');
  try {
    const response = await api('/api/smoke', {});
    showResponse(response);
    els.logOutput.textContent = response.stdout || response.stderr || prettyJson(response);
    toast(response.ok ? '冒烟测试通过。' : '冒烟测试失败，请看日志。', response.ok ? 'ok' : 'error');
  } catch (err) {
    toast(err.message || String(err), 'error');
  } finally {
    setBusy(els.smokeBtn, false);
  }
}

function switchTab(name) {
  $$('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  $$('.tab-panel').forEach((panel) => panel.classList.remove('active'));
  const panel = $(`#${name}Panel`);
  if (panel) panel.classList.add('active');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

els.proposeBtn.addEventListener('click', propose);
els.smokeBtn.addEventListener('click', runSmokeTest);
els.buildDraftBtn.addEventListener('click', buildDraft);
els.templateSearch.addEventListener('input', renderTemplateList);

els.templateList.addEventListener('click', (event) => {
  const row = event.target.closest('[data-template-id]');
  if (row) parseTemplate(row.dataset.templateId);
});

els.candidateList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-confirm-template]');
  if (button) confirmTemplate(button.dataset.confirmTemplate);
});

$$('.preset-btn').forEach((button) => {
  button.addEventListener('click', () => {
    els.descriptionInput.value = button.dataset.text || '';
    propose();
  });
});

$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

bootstrap();
