const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readPublic(relativePath) {
  return fs.readFileSync(path.join(rootDir, 'public', relativePath), 'utf8');
}

function loadHistoryModule() {
  const source = fs
    .readFileSync(path.join(rootDir, 'public', 'js', 'history.js'), 'utf8')
    .replaceAll('export function ', 'function ');
  const module = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function(
    'module',
    `${source}
module.exports = { createHistory, validateDraftForExport };`
  )(module);
  return module.exports;
}

test('history stack supports push / undo / clear with limit', () => {
  const { createHistory } = loadHistoryModule();
  const h = createHistory({ limit: 3 });
  assert.equal(h.canUndo(), false);
  h.push({ n: 1 });
  h.push({ n: 2 });
  h.push({ n: 3 });
  h.push({ n: 4 });
  assert.equal(h.size(), 3);
  assert.deepEqual(h.pop(), { n: 4 });
  assert.deepEqual(h.pop(), { n: 3 });
  assert.deepEqual(h.pop(), { n: 2 });
  assert.equal(h.pop(), null);
  h.push({ n: 9 });
  h.clear();
  assert.equal(h.canUndo(), false);
});

test('validateDraftForExport catches empty part fields and empty groups', () => {
  const { validateDraftForExport } = loadHistoryModule();
  const empty = validateDraftForExport({
    partTemplateFields: [],
    groupTemplateFields: ['依赖方向', '依赖方式', '特征选择'],
    groups: []
  });
  assert.ok(empty.some((e) => e.includes('零件级参数')));
  assert.ok(empty.some((e) => e.includes('至少一个分组')));

  const ok = validateDraftForExport({
    partTemplateFields: ['原点'],
    groupTemplateFields: ['依赖方向', '依赖方式', '特征选择'],
    groups: [{ name: 'A侧', children: [] }]
  });
  assert.deepEqual(ok, []);
});

test('index exposes scene cards, phrase chips, undo button and empty action', () => {
  const html = readPublic('index.html');
  assert.match(html, /id="sceneCardList"/);
  assert.match(html, /id="phraseChips"/);
  assert.match(html, /id="undoBtn"/);
  assert.match(html, /id="emptySceneHintBtn"/);
  assert.match(html, /class="input-row"/);
});

test('ui wires scene cards, toast, history undo and export precheck', () => {
  const source = readPublic('js/ui.js');
  assert.match(source, /from '\.\/toast\.js'/);
  assert.match(source, /from '\.\/history\.js'/);
  assert.match(source, /function applySceneCard/);
  assert.match(source, /function renderPhraseChips/);
  assert.match(source, /function undoLastChange/);
  assert.match(source, /validateDraftForExport/);
  assert.match(source, /pushHistory\(\)/);
  assert.match(source, /toast\.ok/);
  assert.match(source, /Ctrl\+Z|ctrlKey/);
});

test('style defines toast, scene cards and phrase chips', () => {
  const css = readPublic('style.css');
  assert.match(css, /\.toast-host\s*\{/);
  assert.match(css, /\.scene-card-grid\s*\{/);
  assert.match(css, /\.phrase-chip\s*\{/);
  assert.match(css, /\.input-row\s*\{/);
});
