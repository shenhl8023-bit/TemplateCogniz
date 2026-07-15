const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readPublicFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, 'public', relativePath), 'utf8');
}

function extractRule(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'm'));
  return match ? match[1] : '';
}

test('left workspace content has its own scroll area', () => {
  const html = readPublicFile('index.html');
  const css = readPublicFile('style.css');
  const mainContentRule = extractRule(css, '.chat-main-scroll');
  const layoutRule = extractRule(css, '.layout');

  assert.match(html, /<div class="chat-main-scroll">/);
  assert.match(mainContentRule, /overflow-y:\s*auto/);
  assert.match(mainContentRule, /min-height:\s*0/);
  assert.match(layoutRule, /height:\s*calc\(100vh - (?:64px|var\(--topbar-h\))\)/);
});

test('right preview sections have clear visual boundaries', () => {
  const html = readPublicFile('index.html');
  const css = readPublicFile('style.css');
  const rightSectionRule = extractRule(css, '.right-section-card');
  const rightSectionBeforeRule = extractRule(css, '.right-section-card::before');

  assert.match(html, /id="partCardsSection" class="stack-card right-section-card hidden"/);
  assert.match(html, /<div class="stack-card right-section-card">\s*<h2>[^<]+<\/h2>\s*<div id="tree"><\/div>/);
  assert.match(html, /id="groupCardsSection" class="stack-card right-section-card hidden"/);
  assert.match(rightSectionRule, /position:\s*relative/);
  assert.match(rightSectionRule, /border:\s*1px solid/);
  assert.match(rightSectionRule, /border-radius:/);
  assert.match(rightSectionBeforeRule, /height:\s*\d+px/);
  assert.match(rightSectionBeforeRule, /background:/);
});
