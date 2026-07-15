/**
 * Simple undo stack for draft mutations.
 * Stores deep-cloned snapshots; caller decides what to put in each snapshot.
 */

export function createHistory({ limit = 20 } = {}) {
  const stack = [];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function push(snapshot) {
    if (!snapshot) return;
    stack.push(clone(snapshot));
    while (stack.length > limit) stack.shift();
  }

  function canUndo() {
    return stack.length > 0;
  }

  function pop() {
    if (!stack.length) return null;
    return stack.pop();
  }

  function clear() {
    stack.length = 0;
  }

  function size() {
    return stack.length;
  }

  return {
    push,
    canUndo,
    pop,
    clear,
    size
  };
}

/**
 * Minimal client-side draft checks before export.
 * Mirrors the most common server validateDraft failures so the user
 * sees a clear message without a round-trip when possible.
 */
export function validateDraftForExport(draft) {
  const errors = [];
  if (!draft || typeof draft !== 'object') {
    return ['草稿为空，请先创建分组结构'];
  }

  const partFields = Array.isArray(draft.partTemplateFields) ? draft.partTemplateFields : [];
  const groupFields = Array.isArray(draft.groupTemplateFields) ? draft.groupTemplateFields : [];
  const groups = Array.isArray(draft.groups) ? draft.groups : [];

  if (!partFields.length) {
    errors.push('请至少选择 1 个零件级参数（Part_Template）');
  }
  if (!groupFields.length) {
    errors.push('Group_Template 至少需要包含 1 个字段');
  }
  for (const required of ['依赖方向', '依赖方式', '特征选择']) {
    if (groupFields.length && !groupFields.includes(required)) {
      errors.push(`Group_Template 缺少基础字段：${required}`);
    }
  }
  if (!groups.length) {
    errors.push('请先添加至少一个分组节点');
  }

  const emptyNames = [];
  const walk = (nodes, parentPath) => {
    const seen = new Set();
    for (const n of nodes || []) {
      const name = (n && n.name ? String(n.name) : '').trim();
      const path = parentPath ? `${parentPath}/${name || '(未命名)'}` : (name || '(未命名)');
      if (!name) emptyNames.push(path);
      if (name) {
        if (seen.has(name)) errors.push(`${parentPath || '根分组'} 下存在重复分组名：${name}`);
        seen.add(name);
      }
      walk(n.children || [], path);
    }
  };
  walk(groups, '');
  if (emptyNames.length) {
    errors.push(`存在空名称的分组：${emptyNames.slice(0, 3).join('、')}${emptyNames.length > 3 ? '…' : ''}`);
  }

  return errors;
}
