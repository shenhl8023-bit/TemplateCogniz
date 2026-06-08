const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function loadParamMetaModule() {
  const source = fs
    .readFileSync(path.join(rootDir, 'public', 'js', 'param-meta.js'), 'utf8')
    .replaceAll('export const ', 'const ')
    .replaceAll('export function ', 'function ');
  const module = { exports: {} };

  new Function(
    'module',
    `${source}
module.exports = { defaultValueFromMeta, fieldMeta, fieldDesc, parseMultiOptions };`
  )(module);

  return module.exports;
}

function loadPanelViewModule() {
  const deps = loadParamMetaModule();
  const source = fs
    .readFileSync(path.join(rootDir, 'public', 'js', 'panel-view.js'), 'utf8')
    .replace(/import \{[^}]+\} from '\.\/param-meta\.js';\r?\n/, '')
    .replaceAll('export function ', 'function ');
  const module = { exports: {} };

  new Function(
    'module',
    'defaultValueFromMeta',
    'fieldMeta',
    'fieldDesc',
    'parseMultiOptions',
    `${source}
module.exports = { renderGroupCards };`
  )(
    module,
    deps.defaultValueFromMeta,
    deps.fieldMeta,
    deps.fieldDesc,
    deps.parseMultiOptions
  );

  return module.exports;
}

function makeClassList(el) {
  const names = () => el.className.split(/\s+/).filter(Boolean);
  return {
    add(name) {
      if (!names().includes(name)) el.className = [...names(), name].join(' ');
    },
    remove(name) {
      el.className = names().filter((x) => x !== name).join(' ');
    },
    contains(name) {
      return names().includes(name);
    }
  };
}

function createElementStub(tagName) {
  const listeners = new Map();

  return {
    tagName,
    children: [],
    className: '',
    type: '',
    value: '',
    checked: false,
    indeterminate: false,
    _textContent: '',
    get textContent() {
      return this._textContent + this.children.map((child) => child.textContent).join('');
    },
    set textContent(value) {
      this._textContent = String(value);
    },
    set innerHTML(value) {
      this.children = [];
      this._textContent = String(value);
    },
    get innerHTML() {
      return this.textContent;
    },
    get classList() {
      return makeClassList(this);
    },
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    },
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    dispatch(type) {
      for (const handler of listeners.get(type) || []) {
        handler({ type, target: this });
      }
    }
  };
}

function findElement(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children || []) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

test('saving group parameters shows a success hint that disappears automatically', () => {
  const { renderGroupCards } = loadPanelViewModule();
  const root = createElementStub('div');
  const originalDocument = global.document;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const timers = [];

  global.document = { createElement: createElementStub };
  global.setTimeout = (handler, delay) => {
    timers.push({ handler, delay, cleared: false });
    return timers.length;
  };
  global.clearTimeout = (id) => {
    if (timers[id - 1]) timers[id - 1].cleared = true;
  };

  try {
    let saveCount = 0;
    renderGroupCards(
      root,
      { id: 'group-1', name: 'A侧', params: {} },
      ['依赖方向', '依赖方式', '特征选择'],
      [],
      [],
      {},
      {
        onFieldChange() {},
        onCancel() {},
        onSave() {
          saveCount += 1;
          return true;
        }
      }
    );

    const saveButton = findElement(root, (el) => el.tagName === 'button' && el.textContent === '保存参数');
    assert.ok(saveButton);

    saveButton.dispatch('click');

    const hint = findElement(root, (el) => el.classList.contains('group-save-feedback'));
    assert.equal(saveCount, 1);
    assert.ok(hint);
    assert.equal(hint.textContent, '修改成功');
    assert.equal(hint.classList.contains('hidden'), false);
    assert.equal(timers[0].delay, 2000);

    timers[0].handler();

    assert.equal(hint.textContent, '');
    assert.equal(hint.classList.contains('hidden'), true);
  } finally {
    global.document = originalDocument;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});
