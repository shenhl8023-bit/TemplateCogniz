#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const rows = [];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, filePath), 'utf8').replace(/^\uFEFF/, ''));
}

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
    // Keep json null; caller will report the command output.
  }
  return { ...result, json };
}

function add(name, pass, detail = '') {
  rows.push({ name, pass: Boolean(pass), detail });
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function validateIssueList(value, label) {
  expect(Array.isArray(value), `${label} must be an array`);
  for (const issue of value) {
    expect(issue && typeof issue === 'object', `${label} item must be an object`);
    expect(typeof issue.code === 'string', `${label} item missing code`);
    expect(typeof issue.message === 'string', `${label} item missing message`);
  }
}

function validateWorkflow(value, expectedStatus) {
  expect(value && typeof value === 'object', 'workflow must be an object');
  expect(value.currentStep === 'select_group_template', 'workflow.currentStep mismatch');
  expect(Array.isArray(value.steps) && value.steps.length === 1, 'workflow.steps must contain one step');
  const step = value.steps[0];
  expect(step.id === 'select_group_template', 'workflow step id mismatch');
  expect(step.title === '选择分组模板', 'workflow step title mismatch');
  expect(step.status === expectedStatus, `workflow status must be ${expectedStatus}`);
}

function validateOptionCards(ui) {
  expect(Array.isArray(ui), 'ui must be an array');
  for (const block of ui) {
    expect(block.type === 'option_cards', 'ui block type mismatch');
    expect(block.id === 'group_template_candidates', 'ui block id mismatch');
    expect(block.stage === 'select_group_template', 'ui block stage mismatch');
    expect(Array.isArray(block.options), 'ui options must be an array');
    for (const option of block.options) {
      expect(typeof option.id === 'string' && option.id, 'option missing id');
      expect(option.choiceId === option.id, 'option choiceId must match id');
      expect(option.templateId === option.id, 'option templateId must match id');
      expect(typeof option.title === 'string', 'option missing title');
      expect(typeof option.confidence === 'number', 'option missing confidence');
      expect(typeof option.selected === 'boolean', 'option missing selected');
    }
  }
}

function validateTemplate(value, label) {
  expect(value && typeof value === 'object', `${label} must be an object`);
  for (const key of ['id', 'templateId', 'filename', 'displayName']) {
    expect(typeof value[key] === 'string' && value[key], `${label}.${key} missing`);
  }
  expect(Number.isInteger(value.groupCount), `${label}.groupCount must be an integer`);
  expect(Number.isInteger(value.depth), `${label}.depth must be an integer`);
}

function validateValidation(value) {
  expect(value && typeof value === 'object', 'validation must be an object');
  expect(typeof value.ok === 'boolean', 'validation.ok must be boolean');
  validateIssueList(value.errors, 'validation.errors');
  validateIssueList(value.warnings, 'validation.warnings');
}

function validateProposeResponse(value, expectedMode) {
  expect(value && typeof value === 'object', 'response must be an object');
  expect(value.ok === true, 'propose ok must be true');
  expect(value.action === 'propose', 'action must be propose');
  expect(value.stage === 'select_group_template', 'stage mismatch');
  expect(value.mode === expectedMode, `mode must be ${expectedMode}`);
  validateWorkflow(value.workflow, expectedMode);
  validateOptionCards(value.ui);
  expect(Array.isArray(value.candidates), 'candidates must be an array');
  for (const candidate of value.candidates) {
    validateTemplate(candidate, 'candidate');
    expect(typeof candidate.confidence === 'number', 'candidate confidence missing');
    expect(Array.isArray(candidate.tags), 'candidate tags missing');
    expect(candidate.scoreBreakdown && typeof candidate.scoreBreakdown === 'object', 'candidate scoreBreakdown missing');
  }
}

function validateConfirmCompleted(value) {
  expect(value && typeof value === 'object', 'response must be an object');
  expect(value.ok === true, 'confirm completed ok must be true');
  expect(value.action === 'confirm', 'action must be confirm');
  expect(value.stage === 'select_group_template', 'stage mismatch');
  expect(value.mode === 'completed', 'mode must be completed');
  validateWorkflow(value.workflow, 'completed');
  validateOptionCards(value.ui);
  validateTemplate(value.selectedTemplate, 'selectedTemplate');
  if ('draft' in value) expect(value.draft && typeof value.draft === 'object', 'draft must be an object when present');
  if ('xml' in value) expect(typeof value.xml === 'string' && value.xml.includes('<Kmsoft>'), 'xml must contain Kmsoft when present');
  expect(typeof value.structureSummary === 'string', 'structureSummary missing');
  expect(value.validation === null || typeof value.validation === 'object', 'validation must be null or object');
  expect(value.handoff && value.handoff.completed === true, 'completed handoff missing');
  validateTemplate(value.handoff.selectedGroupTemplate, 'handoff.selectedGroupTemplate');
  if ('draft' in value.handoff) expect(value.handoff.draft && typeof value.handoff.draft === 'object', 'handoff draft must be an object when present');
  if ('xml' in value.handoff) expect(typeof value.handoff.xml === 'string' && value.handoff.xml.includes('<Kmsoft>'), 'handoff xml must contain Kmsoft when present');
}

function validateConfirmNotFound(value) {
  expect(value && typeof value === 'object', 'response must be an object');
  expect(value.ok === false, 'not_found ok must be false');
  expect(value.action === 'confirm', 'action must be confirm');
  expect(value.stage === 'select_group_template', 'stage mismatch');
  expect(value.mode === 'not_found', 'mode must be not_found');
  expect(typeof value.message === 'string' && value.message, 'message missing');
  validateWorkflow(value.workflow, 'not_found');
  validateOptionCards(value.ui);
}

function validateErrorResponse(value) {
  expect(value && typeof value === 'object', 'response must be an object');
  expect(value.ok === false, 'error ok must be false');
  expect(value.stage === 'select_group_template', 'stage mismatch');
  expect(value.mode === 'error', 'mode must be error');
  expect(typeof value.message === 'string' && value.message, 'message missing');
}

function checkSchemaFilesParse() {
  const files = [
    'schemas/propose.request.schema.json',
    'schemas/propose.response.schema.json',
    'schemas/confirm.request.schema.json',
    'schemas/confirm.response.schema.json',
    'schemas/error.response.schema.json'
  ];
  for (const file of files) readJson(file);
  add('schema files parse', true, `${files.length} files`);
}

function checkProposeSchemas() {
  let result = runNode([
    'scripts/select_group_template.js',
    'propose',
    '--text',
    '壳体类多面加工零件，包含孔系、平面和通槽',
    '--limit',
    '3'
  ]);
  try {
    expect(result.status === 0, `command failed: ${result.stderr || result.stdout}`);
    validateProposeResponse(result.json, 'awaiting_choice');
    expect(!('sourcePath' in result.json.candidates[0]), 'sourcePath should be omitted by default');
    add('propose awaiting_choice contract', true, `candidates=${result.json.candidates.length}`);
  } catch (err) {
    add('propose awaiting_choice contract', false, err.message);
  }

  result = runNode(['scripts/select_group_template.js', 'propose', '--text', '']);
  try {
    expect(result.status === 0, `command failed: ${result.stderr || result.stdout}`);
    validateProposeResponse(result.json, 'needs_input');
    add('propose needs_input contract', true, `candidates=${result.json.candidates.length}`);
  } catch (err) {
    add('propose needs_input contract', false, err.message);
  }
}

function checkSourcePathOptIn() {
  const result = runNode([
    'scripts/select_group_template.js',
    'propose',
    '--text',
    '壳体 孔 槽',
    '--limit',
    '1',
    '--include-source-path'
  ]);
  try {
    expect(result.status === 0, `command failed: ${result.stderr || result.stdout}`);
    validateProposeResponse(result.json, 'awaiting_choice');
    expect(typeof result.json.candidates[0].sourcePath === 'string', 'sourcePath should be present when requested');
    add('sourcePath opt-in contract', true, result.json.candidates[0].relativePath);
  } catch (err) {
    add('sourcePath opt-in contract', false, err.message);
  }
}

function checkConfirmSchemas() {
  let result = runNode([
    'scripts/select_group_template.js',
    'confirm',
    '--template-id',
    '新衬套模板.xml',
    '--validate'
  ]);
  try {
    expect(result.status === 0, `command failed: ${result.stderr || result.stdout}`);
    validateConfirmCompleted(result.json);
    expect(result.json.draft && result.json.xml, 'default confirm should include draft and xml');
    add('confirm completed contract', true, result.json.selectedTemplate.filename);
  } catch (err) {
    add('confirm completed contract', false, err.message);
  }

  result = runNode([
    'scripts/select_group_template.js',
    'confirm',
    '--template-id',
    'does-not-exist.xml'
  ]);
  try {
    expect(result.status !== 0, 'not_found command should exit non-zero');
    validateConfirmNotFound(result.json);
    add('confirm not_found contract', true, result.json.message);
  } catch (err) {
    add('confirm not_found contract', false, err.message);
  }
}

function checkConfirmOmitLargeFields() {
  const result = runNode([
    'scripts/select_group_template.js',
    'confirm',
    '--template-id',
    '新衬套模板.xml',
    '--omit-draft',
    '--omit-xml'
  ]);
  try {
    expect(result.status === 0, `command failed: ${result.stderr || result.stdout}`);
    validateConfirmCompleted(result.json);
    expect(!('draft' in result.json), 'draft should be omitted');
    expect(!('xml' in result.json), 'xml should be omitted');
    expect(!('draft' in result.json.handoff), 'handoff draft should be omitted');
    expect(!('xml' in result.json.handoff), 'handoff xml should be omitted');
    add('confirm omit large fields contract', true, result.json.selectedTemplate.filename);
  } catch (err) {
    add('confirm omit large fields contract', false, err.message);
  }
}

function checkErrorSchema() {
  const result = runNode(['scripts/select_group_template.js', '--stdin'], '{bad json');
  try {
    expect(result.status !== 0, 'bad JSON command should exit non-zero');
    validateErrorResponse(result.json);
    add('error response contract', true, result.json.message);
  } catch (err) {
    add('error response contract', false, err.message);
  }
}

function main() {
  try {
  checkSchemaFilesParse();
  } catch (err) {
    add('schema files parse', false, err.message);
  }
  checkProposeSchemas();
  checkSourcePathOptIn();
  checkConfirmSchemas();
  checkConfirmOmitLargeFields();
  checkErrorSchema();

  for (const row of rows) {
    console.log(`${row.pass ? 'PASS' : 'FAIL'}\t${row.name}\t${row.detail}`);
  }

  const failed = rows.filter((row) => !row.pass);
  console.log(`SUMMARY\t${rows.length - failed.length}/${rows.length} passed; ${failed.length} failed`);
  if (failed.length) process.exit(1);
}

main();
