import { defaultValueFromMeta, fieldMeta, fieldDesc, parseMultiOptions } from './param-meta.js';

function createFieldInput(scope, field, value, onInput) {
  const meta = fieldMeta(scope, field);
  if (meta.type === 'Multi') {
    const select = document.createElement('select');
    const options = parseMultiOptions(meta.defaultval);
    for (const option of options) {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = option;
      select.appendChild(opt);
    }
    select.value = value || defaultValueFromMeta(scope, field);
    select.addEventListener('change', () => onInput(field, select.value));
    return select;
  }

  const input = document.createElement('input');
  input.value = value || '';
  input.addEventListener('input', () => onInput(field, input.value));
  return input;
}

function parseSelectedFeatures(value) {
  return new Set(
    String(value || '')
      .split(/[，,]/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function createFeatureChecklist(value, featureTree, features, onChange) {
  const selected = parseSelectedFeatures(value);
  const wrap = document.createElement('div');
  wrap.className = 'feature-checklist';
  const tree = Array.isArray(featureTree) && featureTree.length
    ? featureTree
    : (Array.isArray(features) ? features.map((name) => ({ name, children: [] })) : []);

  const parentLinks = [];
  const leafCheckboxMap = new Map();
  const syncOut = () => onChange(Array.from(selected).join(','));

  function collectLeaves(node, out = []) {
    const children = Array.isArray(node.children) ? node.children : [];
    if (!children.length) {
      out.push(node.name);
      return out;
    }
    for (const c of children) collectLeaves(c, out);
    return out;
  }

  const refreshParentStates = () => {
    for (const link of parentLinks) {
      const count = link.leaves.filter((x) => selected.has(x)).length;
      link.cb.checked = count > 0 && count === link.leaves.length;
      link.cb.indeterminate = count > 0 && count < link.leaves.length;
    }
  };

  function createOptionRow(name, checked, className, onToggle) {
    const row = document.createElement('label');
    row.className = className;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    cb.addEventListener('change', () => onToggle(cb.checked));
    const text = document.createElement('span');
    text.textContent = name;
    row.appendChild(cb);
    row.appendChild(text);
    return { row, cb };
  }

  function renderNode(node, depth = 0) {
    const children = Array.isArray(node.children) ? node.children : [];
    const block = document.createElement('div');
    block.className = 'feature-tree-node';

    if (!children.length) {
      const leaf = createOptionRow(
        node.name,
        selected.has(node.name),
        `feature-tree-option feature-tree-option-leaf depth-${depth}`,
        (on) => {
          if (on) selected.add(node.name);
          else selected.delete(node.name);
          refreshParentStates();
          syncOut();
        }
      );
      if (!leafCheckboxMap.has(node.name)) leafCheckboxMap.set(node.name, []);
      leafCheckboxMap.get(node.name).push(leaf.cb);
      block.appendChild(leaf.row);
      return block;
    }

    const leaves = collectLeaves(node, []);
    const selectedCount = leaves.filter((x) => selected.has(x)).length;
    const parent = createOptionRow(
      node.name,
      selectedCount > 0 && selectedCount === leaves.length,
      `feature-tree-option feature-tree-option-parent depth-${depth}`,
      (on) => {
        for (const leafName of leaves) {
          if (on) selected.add(leafName);
          else selected.delete(leafName);
          const cbs = leafCheckboxMap.get(leafName) || [];
          for (const cb of cbs) cb.checked = on;
        }
        refreshParentStates();
        syncOut();
      }
    );
    parent.cb.indeterminate = selectedCount > 0 && selectedCount < leaves.length;
    parentLinks.push({ cb: parent.cb, leaves });
    block.appendChild(parent.row);

    const childWrap = document.createElement('div');
    childWrap.className = 'feature-tree-children';
    for (const child of children) {
      childWrap.appendChild(renderNode(child, depth + 1));
    }
    block.appendChild(childWrap);
    return block;
  }

  for (const node of tree) {
    wrap.appendChild(renderNode(node, 0));
  }

  return wrap;
}

export function renderPartSelectionSummary(rootEl, fields) {
  rootEl.innerHTML = '';
  if (!Array.isArray(fields) || !fields.length) {
    const empty = document.createElement('div');
    empty.className = 'part-selected-empty';
    empty.textContent = '未选择参数';
    rootEl.appendChild(empty);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'part-selected-grid';
  for (const field of fields) {
    const item = document.createElement('div');
    item.className = 'part-selected-item';
    item.textContent = field;
    wrap.appendChild(item);
  }
  rootEl.appendChild(wrap);
}

export function renderGroupCards(
  rootEl,
  selectedNode,
  groupTemplateFields,
  featureTree,
  features,
  formValues,
  handlers
) {
  rootEl.innerHTML = '';
  if (!selectedNode) {
    rootEl.textContent = '请先在右侧分组树中选择一个节点';
    return;
  }

  const baseFields = ['依赖方向', '依赖方式', '特征选择'];
  const customFields = (Array.isArray(groupTemplateFields) ? groupTemplateFields : []).filter(
    (f) => !baseFields.includes(f)
  );
  const allFields = ['名称', ...baseFields, ...customFields];
  const values = formValues && typeof formValues === 'object' ? formValues : {};

  const ensureValue = (field) => {
    if (field in values) return;
    if (field === '名称') values[field] = selectedNode.name;
    else if (field in selectedNode.params) values[field] = selectedNode.params[field];
    else values[field] = defaultValueFromMeta('group', field);
  };

  const renderFieldBlock = (field) => {
    ensureValue(field);
    const block = document.createElement('div');
    block.className = 'group-field-block';
    const label = document.createElement('label');
    label.textContent = field === '特征选择' ? '特征选择（多选）' : field;
    const descText = fieldDesc('group', field);
    block.appendChild(label);
    if (descText) {
      const desc = document.createElement('div');
      desc.className = 'field-desc';
      desc.textContent = descText;
      block.appendChild(desc);
    }
    const input = field === '名称'
      ? (() => {
          const x = document.createElement('input');
          x.value = values[field] || '';
          x.addEventListener('input', () => handlers.onFieldChange(field, x.value));
          return x;
        })()
      : field === '特征选择'
        ? createFeatureChecklist(values[field], featureTree, features, (next) => handlers.onFieldChange(field, next))
        : createFieldInput('group', field, values[field], handlers.onFieldChange);
    block.appendChild(input);
    return block;
  };

  const compactMainFields = ['名称', '依赖方向', '依赖方式'].filter((f) => allFields.includes(f));
  if (compactMainFields.length) {
    const mainCard = document.createElement('div');
    mainCard.className = 'card group-basic-card';
    for (const field of compactMainFields) {
      mainCard.appendChild(renderFieldBlock(field));
    }
    rootEl.appendChild(mainCard);
  }

  const remainingFields = allFields.filter((f) => !compactMainFields.includes(f));
  for (const field of remainingFields) {
    const card = document.createElement('div');
    card.className = 'card';
    card.appendChild(renderFieldBlock(field));
    rootEl.appendChild(card);
  }

  const actions = document.createElement('div');
  actions.className = 'group-card-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'group-btn group-btn-cancel';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', () => handlers.onCancel());

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'group-btn group-btn-save';
  saveBtn.textContent = '保存参数';
  saveBtn.addEventListener('click', () => handlers.onSave());

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  rootEl.appendChild(actions);
}

export function renderTemplateEditor(rootEl, fields, onDelete) {
  rootEl.innerHTML = '';
  for (const field of fields) {
    const row = document.createElement('div');
    row.className = 'tpl-item';
    row.innerHTML = `<span>${field}</span>`;
    const btn = document.createElement('button');
    btn.textContent = '删除';
    btn.addEventListener('click', () => onDelete(field));
    row.appendChild(btn);
    rootEl.appendChild(row);
  }
}
