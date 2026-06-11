#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const core = require('./template_core');

const ROOT = path.resolve(__dirname, '..');
const SAMPLE_DIR = path.join(ROOT, 'assets', 'sample-templates');
const FEATURE_FILE = path.join(ROOT, 'assets', 'FeatureTemplate.xml');

const ZH = {
  bushing: '\u886c\u5957',
  housing: '\u58f3\u4f53',
  sideA: 'A\u4fa7',
  sideB: 'B\u4fa7',
  face: '\u7aef\u9762',
  outer: '\u5916\u5706',
  hole: '\u5b54',
  newBushingFile: '\u65b0\u886c\u5957\u6a21\u677f.xml',
  housingTech1File: '\u58f3\u4f53\u5e26\u5de5\u827a1.xml',
  valveFile: '\u65b0\u653e\u6cb9\u6d3b\u95e8.xml',
  origin: '\u539f\u70b9',
  depDir: '\u4f9d\u8d56\u65b9\u5411',
  depMode: '\u4f9d\u8d56\u65b9\u5f0f',
  featureSelect: '\u7279\u5f81\u9009\u62e9',
  placeholder: '\u8bf7\u53cc\u51fb\u8fdb\u884c\u9009\u62e9',
  fromParent: '\u4ece\u7236',
  none: '\u65e0',
  name: '\u540d\u79f0'
};

const rows = [];

function runNode(args, input = undefined) {
  const result = spawnSync('node', args, {
    cwd: ROOT,
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  let json = null;
  try {
    json = JSON.parse(result.stdout);
  } catch (_) {
    // Some commands intentionally print text output.
  }
  return { ...result, json };
}

function add(name, pass, detail = '') {
  rows.push({ name, pass: Boolean(pass), detail });
}

function sampleValidations() {
  const catalog = core.parseFeatureCatalogFile(FEATURE_FILE);
  const map = new Map();
  for (const file of core.listXmlFiles(SAMPLE_DIR)) {
    const parsed = core.parseTemplateFile(file);
    map.set(parsed.filename, core.validateTemplate(parsed, catalog));
  }
  return map;
}

function itemField(name) {
  return `<Item name="${name}" title="${name}" value="" data_type="" visible="1" edit="1" type="String" defaultval="" respath="" />`;
}

function checkSyntax() {
  const scripts = fs.readdirSync(__dirname).filter((file) => file.endsWith('.js'));
  const failures = scripts.filter((file) => runNode(['--check', path.join(__dirname, file)]).status !== 0);
  add('syntax', failures.length === 0, `${scripts.length - failures.length}/${scripts.length} scripts`);
}

function checkSchemaContracts() {
  const result = runNode(['scripts/schema_test.js']);
  const summary = result.stdout.trim().split(/\r?\n/).find((line) => line.startsWith('SUMMARY')) || '(no summary)';
  add('schema contracts', result.status === 0, summary);
}

function checkSamples(vmap) {
  const failed = [...vmap.entries()].filter(([, validation]) => !validation.ok).map(([file]) => file);
  add('all samples validate', failed.length === 0, `${vmap.size - failed.length}/${vmap.size} pass; failed=${failed.join(',') || '(none)'}`);
}

function checkPropose(vmap) {
  let result = runNode([
    'scripts/select_group_template.js',
    'propose',
    '--text',
    `${ZH.bushing} ${ZH.sideA} ${ZH.sideB} ${ZH.face} ${ZH.outer} ${ZH.hole}`,
    '--limit',
    '3'
  ]);
  add(
    'bushing propose clean',
    result.status === 0 && result.json && result.json.candidates.every((candidate) => vmap.get(candidate.filename).ok),
    `top=${result.json && result.json.candidates[0] ? result.json.candidates[0].filename : '(none)'}`
  );

  result = runNode([
    'scripts/select_group_template.js',
    'propose',
    '--text',
    `${ZH.housing} \u5b54\u7cfb \u5e73\u9762 \u901a\u69fd`,
    '--limit',
    '3'
  ]);
  add(
    'housing propose clean',
    result.status === 0 && result.json && result.json.candidates.every((candidate) => vmap.get(candidate.filename).ok),
    `top=${result.json && result.json.candidates[0] ? result.json.candidates[0].filename : '(none)'}`
  );
}

function checkLimits() {
  const broad = [
    ZH.bushing,
    ZH.housing,
    ZH.sideA,
    ZH.sideB,
    ZH.face,
    ZH.outer,
    ZH.hole,
    '\u69fd',
    '\u5e73\u9762',
    '\u901a\u69fd',
    '\u56de\u8f6c\u4f53',
    '\u8f66\u524a',
    '\u516d\u9762'
  ].join(' ');

  let result = runNode(['scripts/select_group_template.js', 'propose', '--text', broad, '--limit', '100']);
  add('limit max clamps', result.json && result.json.candidates.length <= 10, `returned=${result.json && result.json.candidates.length}`);

  result = runNode(['scripts/select_group_template.js', 'propose', '--text', broad, '--limit', '-5']);
  add('limit negative clamps', result.json && result.json.candidates.length === 1, `returned=${result.json && result.json.candidates.length}`);
}

function checkConfirm() {
  let result = runNode(['scripts/select_group_template.js', 'confirm', '--template-id', ZH.newBushingFile, '--validate']);
  const missing = result.json && result.json.handoff
    ? ['templateId', 'groupCount', 'depth', 'tags'].filter((key) => !(key in result.json.handoff.selectedGroupTemplate))
    : ['handoff'];
  add('confirm handoff schema fields', result.status === 0 && missing.length === 0, `missing=${missing.join(',') || '(none)'}`);

  result = runNode(['scripts/select_group_template.js', 'confirm', '--template-id', ZH.housingTech1File, '--validate']);
  add(
    'fixed housing1 confirms',
    result.status === 0 && result.json && result.json.ok === true && result.json.validation && result.json.validation.ok === true,
    `status=${result.status}; ok=${result.json && result.json.ok}`
  );
  const serializedOutput = result.json ? `${JSON.stringify(result.json.draft)}\n${result.json.xml}` : '';
  add(
    'confirm strips feature placeholders',
    result.status === 0 && !serializedOutput.includes(ZH.placeholder),
    serializedOutput.includes(ZH.placeholder) ? 'placeholder still present' : 'placeholder absent'
  );
}

function checkOperations() {
  const operationResult = core.applyOperations(core.createDefaultDraft(), [
    { type: 'add_top_groups', groups: ['A'] },
    { type: 'add_children', parents: ['A'], children: ['A'] },
    { type: 'add_children_by_path', parent_path: ['A', 'A'], children: ['X'] }
  ]);
  const topA = operationResult.draft.groups.find((group) => group.name === 'A');
  const childA = topA && topA.children.find((group) => group.name === 'A');
  const hasNestedX = Boolean(childA && childA.children.some((group) => group.name === 'X'));
  const hasTopX = Boolean(topA && topA.children.some((group) => group.name === 'X'));
  add(
    'repeated path preserved',
    hasNestedX && !hasTopX,
    JSON.stringify((topA ? topA.children : []).map((group) => ({ name: group.name, children: group.children.map((child) => child.name) })))
  );
}

function checkDuplicateDetection() {
  const duplicateXml = [
    '<?xml version="1.0" encoding="UTF-8" ?>',
    '<Kmsoft>',
    '<Item type="Part_Template"><GridPropList><GridProp>',
    itemField(ZH.origin),
    itemField(ZH.origin),
    '</GridProp></GridPropList></Item>',
    '<Item type="Group_Template"><GridPropList><GridProp>',
    itemField(ZH.depDir),
    itemField(ZH.depDir),
    itemField(ZH.depMode),
    itemField(ZH.featureSelect),
    '</GridProp></GridPropList></Item>',
    `<Item type="Part"><Params><param name="${ZH.origin}" value="" /></Params>`,
    `<Item type="Group"><Params><param name="${ZH.name}" value="G" /><param name="${ZH.depDir}" value="${ZH.fromParent}" /><param name="${ZH.depMode}" value="${ZH.none}" /><param name="${ZH.featureSelect}" value="${ZH.hole}" /></Params></Item>`,
    '</Item>',
    '</Kmsoft>'
  ].join('');
  const catalog = core.parseFeatureCatalogFile(FEATURE_FILE);
  const codes = core.validateTemplate(core.parseTemplateXmlText(duplicateXml, 'duplicate.xml'), catalog).errors.map((error) => error.code);
  add(
    'duplicates detected',
    codes.includes('duplicate_part_template_field') && codes.includes('duplicate_group_template_field'),
    codes.join(',') || '(none)'
  );
}

function checkMachineReadableErrors() {
  let result = runNode(['scripts/select_group_template.js', '--stdin'], '{bad json');
  add('bad JSON error JSON', result.status !== 0 && result.json && result.json.ok === false, `message=${result.json && result.json.message}`);

  result = runNode(['scripts/select_group_template.js', 'propose', '--text', ZH.bushing, '--samples', path.join(ROOT, 'does-not-exist')]);
  add('missing samples error JSON', result.status !== 0 && result.json && result.json.ok === false, `message=${result.json && result.json.message}`);

  result = runNode([
    'scripts/select_group_template.js',
    'confirm',
    '--template-id',
    ZH.valveFile,
    '--validate',
    '--feature-file',
    path.join(ROOT, 'missing-feature.xml')
  ]);
  add('missing feature error JSON', result.status !== 0 && result.json && result.json.ok === false, `message=${result.json && result.json.message}`);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kmsoft-smoke-'));
  try {
    result = runNode(['scripts/build_template.js', '--json', '--out', path.join(tempDir, 'bad.xml'), '--write-encoding', 'utf16']);
    add('build error JSON', result.status !== 0 && result.json && result.json.ok === false, `message=${result.json && result.json.message}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function main() {
  const vmap = sampleValidations();
  checkSyntax();
  checkSchemaContracts();
  checkSamples(vmap);
  checkPropose(vmap);
  checkLimits();
  checkConfirm();
  checkOperations();
  checkDuplicateDetection();
  checkMachineReadableErrors();

  for (const row of rows) {
    console.log(`${row.pass ? 'PASS' : 'FAIL'}\t${row.name}\t${row.detail}`);
  }

  const failed = rows.filter((row) => !row.pass);
  console.log(`SUMMARY\t${rows.length - failed.length}/${rows.length} passed; ${failed.length} failed`);
  if (failed.length) process.exit(1);
}

main();
