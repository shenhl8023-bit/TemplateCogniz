const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readPublicJs(fileName) {
  return fs.readFileSync(path.join(rootDir, 'public', 'js', fileName), 'utf8');
}

test('services exposes fuzzy template generation API', () => {
  const source = readPublicJs('services.js');

  assert.match(source, /export async function apiGenerateFuzzyTemplate\(text, limit = 3\)/);
  assert.match(source, /fetch\('\/api\/templates\/generate-fuzzy'/);
  assert.match(source, /JSON\.stringify\(\{ text, limit \}\)/);
});

test('describe-mode chat tries fuzzy template generation before normal LLM processing', () => {
  const source = readPublicJs('ui.js');
  const importIndex = source.indexOf('apiGenerateFuzzyTemplate');
  const handlerIndex = source.indexOf('async function handleFuzzyTemplateGeneration(text)');
  const describeModeIndex = source.indexOf("if (state.modeType === 'describe')");
  const fuzzyCallIndex = source.indexOf('handleFuzzyTemplateGeneration(text)', describeModeIndex);
  const pendingIndex = source.indexOf("chatView.addPendingMessage('LLM等待中", describeModeIndex);

  assert.ok(importIndex >= 0, 'ui.js should import apiGenerateFuzzyTemplate');
  assert.ok(handlerIndex >= 0, 'ui.js should define fuzzy generation handler');
  assert.ok(describeModeIndex >= 0, 'ui.js should branch on describe mode');
  assert.ok(fuzzyCallIndex > describeModeIndex, 'describe mode should call fuzzy generation');
  assert.ok(pendingIndex > fuzzyCallIndex, 'normal LLM pending message should be created after fuzzy handling');
});
