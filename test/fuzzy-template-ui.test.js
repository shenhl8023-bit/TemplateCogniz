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
  assert.match(source, /requestJson\('\/api\/templates\/generate-fuzzy'/);
  assert.match(source, /JSON\.stringify\(\{ text, limit \}\)/);
});

test('services exposes agent template-selection APIs', () => {
  const source = readPublicJs('services.js');

  assert.match(source, /export async function apiAgentMessage\(message, sessionId = '', limit = 3\)/);
  assert.match(source, /requestJson\('\/api\/agent\/message'/);
  assert.match(source, /export async function apiAgentEvent\(event\)/);
  assert.match(source, /requestJson\('\/api\/agent\/event'/);
});

test('describe-mode chat asks the agent to select a group template before normal LLM processing', () => {
  const source = readPublicJs('ui.js');
  const importIndex = source.indexOf('apiAgentMessage');
  const handlerIndex = source.indexOf('async function requestAgentTemplateSelection(text)');
  const describeModeIndex = source.indexOf("if (state.modeType === 'describe')");
  const agentCallIndex = source.indexOf('requestAgentTemplateSelection(text)', describeModeIndex);
  const pendingIndex = source.indexOf("chatView.addPendingMessage('LLM等待中", describeModeIndex);

  assert.ok(importIndex >= 0, 'ui.js should import apiAgentMessage');
  assert.ok(handlerIndex >= 0, 'ui.js should define agent template selection handler');
  assert.ok(describeModeIndex >= 0, 'ui.js should branch on describe mode');
  assert.ok(agentCallIndex > describeModeIndex, 'describe mode should ask the agent for template selection');
  assert.ok(pendingIndex > agentCallIndex, 'normal LLM pending message should be created after agent handling');
});
