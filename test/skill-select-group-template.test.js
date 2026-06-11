const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');
const scriptPath = path.join(rootDir, 'skills', 'kmsoft-group-template', 'scripts', 'select_group_template.js');
const runtimeDir = path.join(rootDir, '.codex-runtime');

function runSkill(args = [], input = null, options = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: rootDir,
    input: input ? `${JSON.stringify(input)}\n` : undefined,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
  if (!options.allowFailure && result.status !== 0) {
    assert.fail(`skill command failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  const stdout = String(result.stdout || '').trim();
  return {
    status: result.status,
    stderr: result.stderr,
    stdout,
    data: stdout ? JSON.parse(stdout) : null
  };
}

test('select_group_template propose returns one-step workflow and option cards', () => {
  const { data } = runSkill(['propose', '--text', '衬套类回转体零件，A侧和B侧，包含端面、外圆、孔和外环槽', '--limit', '3']);

  assert.equal(data.ok, true);
  assert.equal(data.action, 'propose');
  assert.equal(data.stage, 'select_group_template');
  assert.equal(data.mode, 'awaiting_choice');
  assert.equal(data.workflow.currentStep, 'select_group_template');
  assert.equal(data.workflow.steps.length, 1);
  assert.equal(data.workflow.steps[0].status, 'awaiting_choice');
  assert.ok(data.candidates.length > 0);
  assert.equal(data.ui[0].type, 'option_cards');
  assert.equal(data.ui[0].options[0].templateId, data.candidates[0].id);
});

test('select_group_template propose via stdin asks for more input when text is blank', () => {
  const { data } = runSkill(['--stdin'], { action: 'propose', text: '' });

  assert.equal(data.ok, true);
  assert.equal(data.action, 'propose');
  assert.equal(data.mode, 'needs_input');
  assert.equal(data.workflow.steps.length, 1);
  assert.equal(data.workflow.steps[0].status, 'needs_input');
  assert.deepEqual(data.candidates, []);
});

test('select_group_template confirm via stdin returns handoff payload', () => {
  const proposed = runSkill(['--stdin'], {
    action: 'propose',
    text: '衬套类回转体零件，A侧和B侧，包含端面、外圆、孔和外环槽',
    limit: 3
  }).data;
  const templateId = proposed.candidates[0].id;

  const { data } = runSkill(['--stdin'], {
    action: 'confirm',
    templateId
  });

  assert.equal(data.ok, true);
  assert.equal(data.action, 'confirm');
  assert.equal(data.mode, 'completed');
  assert.equal(data.workflow.currentStep, 'select_group_template');
  assert.equal(data.workflow.steps.length, 1);
  assert.equal(data.workflow.steps[0].status, 'completed');
  assert.equal(data.selectedTemplate.id, templateId);
  assert.ok(data.draft.groups.length > 0);
  assert.ok(data.xml.includes('<Kmsoft>'));
  assert.equal(data.handoff.completed, true);
  assert.equal(data.handoff.selectedGroupTemplate.id, templateId);
});

test('select_group_template confirm rejects unknown template ids', () => {
  const { status, data } = runSkill(['--stdin'], {
    action: 'confirm',
    templateId: 'missing-template-id'
  }, { allowFailure: true });

  assert.equal(status, 1);
  assert.equal(data.ok, false);
  assert.match(data.message, /未找到分组模板/);
});

test('select_group_template confirm can write GB2312 XML artifact', () => {
  fs.mkdirSync(runtimeDir, { recursive: true });
  const outXml = path.join(runtimeDir, `skill-select-${Date.now()}.xml`);
  const proposed = runSkill(['propose', '--text', '衬套类回转体零件，A侧和B侧，包含端面、外圆、孔和外环槽']).data;
  const templateId = proposed.candidates[0].id;

  try {
    const { data } = runSkill(['confirm', '--template-id', templateId, '--out-xml', outXml, '--write-encoding', 'gb2312']);

    assert.equal(data.ok, true);
    assert.ok(fs.existsSync(outXml));
    const bytes = fs.readFileSync(outXml);
    const decoded = new TextDecoder('gb2312').decode(bytes);
    assert.ok(decoded.includes('<?xml version="1.0" encoding="GB2312" ?>'));
    assert.ok(decoded.includes('<Kmsoft>'));
  } finally {
    if (fs.existsSync(outXml)) fs.unlinkSync(outXml);
  }
});
