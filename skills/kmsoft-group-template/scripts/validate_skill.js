#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const core = require('./template_core');

const ROOT = path.resolve(__dirname, '..');
const SAMPLE_DIR = path.join(ROOT, 'assets', 'sample-templates');
const FEATURE_FILE = path.join(ROOT, 'assets', 'FeatureTemplate.xml');
const rows = [];

function add(name, pass, detail = '') {
  rows.push({ name, pass: Boolean(pass), detail });
}

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8').replace(/^\uFEFF/, '');
}

function readJson(relativePath) {
  return JSON.parse(readUtf8(relativePath));
}

function runNode(args) {
  return spawnSync('node', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
}

function parseSimpleFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) throw new Error('SKILL.md must start with YAML frontmatter');
  const out = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) throw new Error(`Unsupported frontmatter line: ${rawLine}`);
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function checkFrontmatter() {
  try {
    const frontmatter = parseSimpleFrontmatter(readUtf8('SKILL.md'));
    const keys = Object.keys(frontmatter);
    const unexpected = keys.filter((key) => !['name', 'description'].includes(key));
    if (unexpected.length) throw new Error(`Unexpected frontmatter keys: ${unexpected.join(', ')}`);
    if (frontmatter.name !== 'kmsoft-group-template') throw new Error('name must be kmsoft-group-template');
    if (!frontmatter.description || frontmatter.description.length < 80) throw new Error('description is too short');
    if (!/分组模板/.test(frontmatter.description)) throw new Error('description should include Chinese trigger words');
    if (frontmatter.description.length > 1024) throw new Error('description exceeds 1024 characters');
    add('skill frontmatter', true, `${frontmatter.description.length} chars`);
  } catch (err) {
    add('skill frontmatter', false, err.message);
  }
}

function checkJsonFiles() {
  const files = [
    'assets/recommendation-rules.json',
    'assets/template-index.json',
    'schemas/propose.request.schema.json',
    'schemas/propose.response.schema.json',
    'schemas/confirm.request.schema.json',
    'schemas/confirm.response.schema.json',
    'schemas/error.response.schema.json'
  ];
  try {
    for (const file of files) readJson(file);
    add('json files parse', true, `${files.length} files`);
  } catch (err) {
    add('json files parse', false, err.message);
  }
}

function checkRecommendationRules() {
  try {
    const rules = readJson('assets/recommendation-rules.json');
    if (!rules.thresholds || typeof rules.thresholds.choiceConfidence !== 'number') {
      throw new Error('thresholds.choiceConfidence must be a number');
    }
    if (!rules.weights || typeof rules.weights.domainMatch !== 'number') {
      throw new Error('weights.domainMatch must be a number');
    }
    if (!Array.isArray(rules.domains) || rules.domains.length === 0) {
      throw new Error('domains must be a non-empty array');
    }
    if (!Array.isArray(rules.features) || rules.features.length === 0) {
      throw new Error('features must be a non-empty array');
    }
    for (const domain of rules.domains) {
      if (!domain.label || !Array.isArray(domain.query) || !Array.isArray(domain.template)) {
        throw new Error(`invalid domain rule: ${JSON.stringify(domain)}`);
      }
    }
    for (const feature of rules.features) {
      if (!feature.label || !Array.isArray(feature.terms)) {
        throw new Error(`invalid feature rule: ${JSON.stringify(feature)}`);
      }
    }
    add('recommendation rules', true, `${rules.domains.length} domains; ${rules.features.length} features`);
  } catch (err) {
    add('recommendation rules', false, err.message);
  }
}

function checkSamples() {
  try {
    const catalog = core.parseFeatureCatalogFile(FEATURE_FILE);
    const files = core.listXmlFiles(SAMPLE_DIR);
    const failed = [];
    let warnings = 0;
    for (const file of files) {
      const validation = core.validateTemplate(core.parseTemplateFile(file), catalog);
      warnings += validation.warnings.length;
      if (!validation.ok) failed.push(path.basename(file));
    }
    add('sample templates validate', failed.length === 0, `${files.length - failed.length}/${files.length} pass; warnings=${warnings}`);
  } catch (err) {
    add('sample templates validate', false, err.message);
  }
}

function checkTemplateIndex() {
  try {
    const index = readJson('assets/template-index.json');
    const files = core.listXmlFiles(SAMPLE_DIR);
    if (index.generatedBy !== 'scripts/build_template_index.js') {
      throw new Error('template index generatedBy mismatch');
    }
    if (index.templateCount !== files.length) {
      throw new Error(`templateCount ${index.templateCount} does not match sample XML count ${files.length}`);
    }
    if (!Array.isArray(index.templates) || index.templates.length !== files.length) {
      throw new Error('templates array count mismatch');
    }
    const missingRelativePath = index.templates.filter((item) => !item.relativePath);
    if (missingRelativePath.length) {
      throw new Error(`templates missing relativePath: ${missingRelativePath.map((item) => item.filename).join(', ')}`);
    }
    add('template index', true, `${index.templateCount} templates`);
  } catch (err) {
    add('template index', false, err.message);
  }
}

function checkFeatureDictionarySnapshot() {
  try {
    const catalog = core.parseFeatureCatalogFile(FEATURE_FILE);
    const featureSet = new Set(catalog.flat);
    const text = readUtf8('references/feature-dictionary.md');
    const referenced = [...text.matchAll(/`([^`]+)`/g)]
      .map((match) => match[1])
      .filter((value) => ![
        'assets/FeatureTemplate.xml',
        '特征选择',
        '请双击进行选择'
      ].includes(value));
    const missing = referenced.filter((feature) => !featureSet.has(feature));
    if (missing.length) throw new Error(`feature snapshot references missing values: ${missing.join(', ')}`);
    add('feature dictionary snapshot', true, `${referenced.length} referenced features`);
  } catch (err) {
    add('feature dictionary snapshot', false, err.message);
  }
}

function checkScript(name, args) {
  const result = runNode(args);
  const summary = result.stdout.trim().split(/\r?\n/).find((line) => line.startsWith('SUMMARY')) || result.stdout.trim();
  add(name, result.status === 0, summary || result.stderr.trim());
}

function checkNoParentNpmDependency() {
  const files = [
    'SKILL.md',
    'references/intent-operations.md',
    'references/xml-structure.md',
    'references/selection-contract.md'
  ];
  try {
    const hits = [];
    for (const file of files) {
      const lines = readUtf8(file).split(/\r?\n/);
      lines.forEach((line, index) => {
        if (/npm run skill:/.test(line)) hits.push(`${file}:${index + 1}`);
      });
    }
    if (hits.length) throw new Error(`parent npm script references found: ${hits.join(', ')}`);
    add('standalone commands', true, 'no required parent npm scripts');
  } catch (err) {
    add('standalone commands', false, err.message);
  }
}

function main() {
  checkFrontmatter();
  checkJsonFiles();
  checkRecommendationRules();
  checkNoParentNpmDependency();
  checkSamples();
  checkTemplateIndex();
  checkFeatureDictionarySnapshot();
  checkScript('schema contracts', ['scripts/schema_test.js']);
  checkScript('smoke regression', ['scripts/smoke_test.js']);

  for (const row of rows) {
    console.log(`${row.pass ? 'PASS' : 'FAIL'}\t${row.name}\t${row.detail}`);
  }

  const failed = rows.filter((row) => !row.pass);
  console.log(`SUMMARY\t${rows.length - failed.length}/${rows.length} passed; ${failed.length} failed`);
  if (failed.length) process.exit(1);
}

main();
