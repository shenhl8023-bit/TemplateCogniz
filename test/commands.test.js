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
module.exports = { defaultValueFromMeta };`
  )(module);

  return module.exports;
}

function loadStoreModule(defaultValueFromMeta) {
  const source = fs
    .readFileSync(path.join(rootDir, 'public', 'js', 'store.js'), 'utf8')
    .replace(/import \{[^}]+\} from '\.\/param-meta\.js';\r?\n/, '')
    .replaceAll('export const ', 'const ')
    .replaceAll('export function ', 'function ');
  const module = { exports: {} };

  new Function(
    'module',
    'defaultValueFromMeta',
    `${source}
module.exports = {
  state,
  findNodeById,
  removeNode,
  updateGroupFieldSyncAdd,
  updateGroupFieldSyncDelete,
  createNode
};`
  )(module, defaultValueFromMeta);

  return module.exports;
}

function loadCommandsModule() {
  const { defaultValueFromMeta } = loadParamMetaModule();
  const store = loadStoreModule(defaultValueFromMeta);
  const source = fs
    .readFileSync(path.join(rootDir, 'public', 'js', 'commands.js'), 'utf8')
    .replace(/import \{[^}]+\} from '\.\/store\.js';\r?\n/, '')
    .replace(/import \{[^}]+\} from '\.\/param-meta\.js';\r?\n/, '')
    .replaceAll('export function ', 'function ');
  const module = { exports: {} };

  new Function(
    'module',
    'findNodeById',
    'removeNode',
    'createNode',
    'updateGroupFieldSyncAdd',
    'updateGroupFieldSyncDelete',
    'defaultValueFromMeta',
    `${source}
module.exports = {
  moveNodeAsChild,
  addTopGroup,
  addChildGroup,
  deleteGroup,
  setPartParam,
  setGroupParam,
  addPartTemplateField,
  removePartTemplateField,
  addGroupTemplateField,
  removeGroupTemplateField,
  togglePartField,
  syncGroupTemplateByPartSelection
};`
  )(
    module,
    store.findNodeById,
    store.removeNode,
    store.createNode,
    store.updateGroupFieldSyncAdd,
    store.updateGroupFieldSyncDelete,
    defaultValueFromMeta
  );

  return { ...module.exports, store };
}

function createDraft() {
  return {
    partTemplateFields: [],
    partParams: {},
    groupTemplateFields: ['依赖方向', '依赖方式', '特征选择'],
    groups: []
  };
}

function groupNames(groups) {
  return groups.map((node) => ({
    name: node.name,
    children: groupNames(node.children || [])
  }));
}

test('group commands add, update, and delete nodes', () => {
  const { addTopGroup, addChildGroup, setGroupParam, deleteGroup } = loadCommandsModule();
  const draft = createDraft();

  assert.equal(addTopGroup(draft.groups, 'A侧', draft.groupTemplateFields), true);
  const top = draft.groups[0];
  assert.equal(top.params.依赖方向, '从父');
  assert.equal(top.params.依赖方式, '无');

  assert.equal(addChildGroup(draft.groups, top.id, '外圆', draft.groupTemplateFields), true);
  const child = top.children[0];
  setGroupParam(child, '名称', '端面');
  assert.equal(child.name, '端面');

  assert.equal(deleteGroup(draft.groups, child.id), true);
  assert.deepEqual(top.children, []);
});

test('moveNodeAsChild moves only after validating the target', () => {
  const { moveNodeAsChild } = loadCommandsModule();
  const groups = [
    {
      id: 'a',
      name: 'A侧',
      params: {},
      children: [
        {
          id: 'a-1',
          name: '外圆',
          params: {},
          children: [
            { id: 'a-1-1', name: '粗加工', params: {}, children: [] }
          ]
        }
      ]
    },
    { id: 'b', name: 'B侧', params: {}, children: [] }
  ];

  assert.equal(moveNodeAsChild(groups, 'a-1', 'b'), true);
  assert.deepEqual(groupNames(groups), [
    { name: 'A侧', children: [] },
    { name: 'B侧', children: [{ name: '外圆', children: [{ name: '粗加工', children: [] }] }] }
  ]);

  const beforeMissingTarget = JSON.stringify(groups);
  assert.equal(moveNodeAsChild(groups, 'a', 'missing'), false);
  assert.equal(JSON.stringify(groups), beforeMissingTarget);

  const beforeDescendantTarget = JSON.stringify(groups);
  assert.equal(moveNodeAsChild(groups, 'b', 'a-1-1'), false);
  assert.equal(JSON.stringify(groups), beforeDescendantTarget);
});

test('part field selection synchronizes dependent group template fields', () => {
  const {
    addPartTemplateField,
    removePartTemplateField,
    addGroupTemplateField,
    removeGroupTemplateField
  } = loadCommandsModule();
  const draft = createDraft();

  assert.equal(addGroupTemplateField(draft, '主轴线上特征'), false);
  assert.equal(draft.groupTemplateFields.includes('主轴线上特征'), false);

  assert.equal(addPartTemplateField(draft, '有主轴线'), true);
  assert.equal(draft.partParams.有主轴线, '是');
  assert.equal(draft.groupTemplateFields.includes('主轴线上特征'), true);

  assert.equal(addPartTemplateField(draft, '有轴线'), true);
  assert.equal(draft.groupTemplateFields.includes('一般轴线上特征'), true);

  assert.equal(removeGroupTemplateField(draft, '一般轴线上特征'), true);
  assert.equal(draft.groupTemplateFields.includes('一般轴线上特征'), false);

  assert.equal(removePartTemplateField(draft, '有主轴线'), true);
  assert.equal(draft.groupTemplateFields.includes('主轴线上特征'), false);
  assert.equal('有主轴线' in draft.partParams, false);
});

