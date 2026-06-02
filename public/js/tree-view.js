export function renderTree(rootEl, groups, selectedNodeId, handlers) {
  rootEl.innerHTML = '';
  for (const node of groups) {
    rootEl.appendChild(renderTreeNode(node, selectedNodeId, handlers));
  }
}

function renderTreeNode(node, selectedNodeId, handlers) {
  const expanded = handlers.isExpanded ? !!handlers.isExpanded(node.id) : false;
  const box = document.createElement('div');
  box.className = `tree-node ${selectedNodeId === node.id ? 'selected' : ''}`;
  box.draggable = false;
  box.addEventListener('click', (e) => {
    e.stopPropagation();
    if (handlers.onSelect) handlers.onSelect(node.id);
  });

  const title = document.createElement('div');
  title.className = 'node-title';
  const name = document.createElement('span');
  name.className = 'node-title-text';
  name.textContent = node.name;
  title.appendChild(name);

  const actions = document.createElement('div');
  actions.className = 'node-title-actions';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'node-expand-btn';
  toggle.textContent = expanded ? '收起' : '展开';
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (handlers.onToggleExpand) handlers.onToggleExpand(node.id);
  });
  actions.appendChild(toggle);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'node-delete-btn';
  del.textContent = '删除';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    if (handlers.onDelete) handlers.onDelete(node.id);
  });
  actions.appendChild(del);
  title.appendChild(actions);
  box.appendChild(title);

  const meta = document.createElement('div');
  meta.className = `node-meta ${expanded ? '' : 'hidden'}`;
  const params = node.params || {};
  const order = ['依赖方向', '依赖方式', '特征选择'];
  const keys = [
    ...order.filter((k) => k in params),
    ...Object.keys(params).filter((k) => k !== '名称' && !order.includes(k))
  ];
  for (const key of keys) {
    const line = document.createElement('div');
    line.className = 'node-meta-line';
    const value = params[key] == null || params[key] === '' ? '未设置' : String(params[key]);
    line.textContent = `${key}：${value}`;
    meta.appendChild(line);
  }
  if (!keys.length) {
    const empty = document.createElement('div');
    empty.className = 'node-meta-line';
    empty.textContent = '无参数';
    meta.appendChild(empty);
  }
  box.appendChild(meta);

  const childrenWrap = document.createElement('div');
  childrenWrap.className = 'tree-children';
  for (const child of node.children || []) {
    childrenWrap.appendChild(renderTreeNode(child, selectedNodeId, handlers));
  }
  box.appendChild(childrenWrap);

  return box;
}
