#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const {
  listXmlFiles,
  parseTemplateFile,
  writeText
} = require('./template_core');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SAMPLE_DIR = path.join(ROOT, 'assets', 'sample-templates');
const DEFAULT_OUT = path.join(ROOT, 'assets', 'template-index.json');
const DEFAULT_RULES_FILE = path.join(ROOT, 'assets', 'recommendation-rules.json');

function usage() {
  return [
    'Usage:',
    '  node scripts/build_template_index.js [--samples assets/sample-templates] [--out assets/template-index.json] [--rules assets/recommendation-rules.json]',
    '',
    'Builds a compact index of selectable group-template assets.'
  ].join('\n');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    samples: DEFAULT_SAMPLE_DIR,
    outFile: DEFAULT_OUT,
    rulesFile: DEFAULT_RULES_FILE,
    stdout: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--samples') out.samples = path.resolve(args[++i] || '');
    else if (arg === '--out') out.outFile = path.resolve(args[++i] || '');
    else if (arg === '--rules') out.rulesFile = path.resolve(args[++i] || '');
    else if (arg === '--stdout') out.stdout = true;
    else if (arg === '--help') {
      console.log(usage());
      process.exit(0);
    }
  }

  return out;
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function classifyTemplate(parsed, rules) {
  const haystack = [
    parsed.filename,
    ...parsed.partTemplateFields,
    ...parsed.groupTemplateFields,
    ...parsed.groupNames,
    ...parsed.featureSelections
  ].map(normalizeText).join(' ');

  for (const domain of Array.isArray(rules.domains) ? rules.domains : []) {
    const templateTerms = Array.isArray(domain.template) ? domain.template : domain.query;
    if ((templateTerms || []).some((term) => haystack.includes(normalizeText(term)))) {
      return domain.label;
    }
  }

  return '未分类';
}

function buildIndex(samples, rulesFile) {
  const rules = readJson(rulesFile);
  const files = listXmlFiles(samples);
  const templates = files.map((file) => {
    const parsed = parseTemplateFile(file);
    const relativePath = path.relative(samples, parsed.sourcePath).replace(/\\/g, '/');
    return {
      id: parsed.id,
      filename: parsed.filename,
      displayName: parsed.filename.replace(/\.xml$/i, ''),
      relativePath,
      family: classifyTemplate(parsed, rules),
      groupCount: parsed.groupCount,
      depth: parsed.depth,
      partTemplateFields: parsed.partTemplateFields,
      groupTemplateFields: parsed.groupTemplateFields,
      groupNames: parsed.groupNames.slice(0, 20),
      featureSelections: parsed.featureSelections,
      detectedEncoding: parsed.detectedEncoding,
      declaredEncoding: parsed.declaredEncoding
    };
  }).sort((a, b) => a.family.localeCompare(b.family, 'zh') || a.filename.localeCompare(b.filename, 'zh'));

  return {
    generatedBy: 'scripts/build_template_index.js',
    sampleRoot: 'assets/sample-templates',
    templateCount: templates.length,
    templates
  };
}

function main() {
  const args = parseArgs(process.argv);
  const index = buildIndex(args.samples, args.rulesFile);
  const text = `${JSON.stringify(index, null, 2)}\n`;
  if (args.stdout) process.stdout.write(text);
  else writeText(args.outFile, text);
}

main();
