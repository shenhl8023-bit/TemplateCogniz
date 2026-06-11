#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const {
  buildXml,
  listXmlFiles,
  parseFeatureCatalogFile,
  parseTemplateFile,
  parsedTemplateToDraft,
  validateTemplate,
  writeEncodedText,
  writeText
} = require('./template_core');

const DEFAULT_SAMPLE_DIR = path.resolve(__dirname, '..', 'assets', 'sample-templates');
const DEFAULT_FEATURE_FILE = path.resolve(__dirname, '..', 'assets', 'FeatureTemplate.xml');
const DEFAULT_RULES_FILE = path.resolve(__dirname, '..', 'assets', 'recommendation-rules.json');
const DEFAULT_LIMIT = 3;
const MIN_LIMIT = 1;
const MAX_LIMIT = 10;
const DEFAULT_RULE_WEIGHTS = {
  domainMatch: 0.38,
  featureMatch: 0.08,
  longTermMatch: 0.03,
  shortTermMatch: 0.015,
  groupCountDivisor: 500,
  groupCountCap: 30,
  featureCountDivisor: 600,
  featureCountCap: 20
};

function usage() {
  return [
    'Usage:',
    '  node scripts/select_group_template.js propose --text "<零件描述>" [--limit 3] [--rules assets/recommendation-rules.json]',
    '  node scripts/select_group_template.js confirm --template-id <id|filename|path> [--out-draft draft.json] [--out-xml template.xml] [--omit-draft] [--omit-xml]',
    '  node scripts/select_group_template.js --input request.json',
    '  cat request.json | node scripts/select_group_template.js --stdin',
    '',
    'Actions:',
    '  propose  Return workflow state and clickable group-template candidate cards.',
    '  confirm  Apply the selected template and return draft/XML/structure summary for the caller agent.',
    '',
    'JSON input examples:',
    '  { "action": "propose", "text": "衬套类回转体，A侧B侧，包含端面、外圆、孔", "limit": 3 }',
    '  { "action": "confirm", "templateId": "...", "outXml": "selected.xml", "writeEncoding": "gb2312", "includeXml": false }'
  ].join('\n');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    action: '',
    text: '',
    templateId: '',
    samples: DEFAULT_SAMPLE_DIR,
    featureFile: DEFAULT_FEATURE_FILE,
    rulesFile: DEFAULT_RULES_FILE,
    limit: DEFAULT_LIMIT,
    input: '',
    stdin: false,
    outDraft: '',
    outXml: '',
    writeEncoding: 'utf8',
    validate: false,
    includeSourcePath: false,
    includeDraft: true,
    includeXml: true
  };

  if (args[0] && !args[0].startsWith('--')) {
    parsed.action = args[0];
  }

  for (let i = parsed.action ? 1 : 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--text') parsed.text = args[++i] || '';
    else if (arg === '--template-id') parsed.templateId = args[++i] || '';
    else if (arg === '--samples') parsed.samples = path.resolve(args[++i] || '');
    else if (arg === '--feature-file') parsed.featureFile = path.resolve(args[++i] || '');
    else if (arg === '--rules') parsed.rulesFile = path.resolve(args[++i] || '');
    else if (arg === '--limit') parsed.limit = args[++i] ?? parsed.limit;
    else if (arg === '--input') parsed.input = path.resolve(args[++i] || '');
    else if (arg === '--stdin') parsed.stdin = true;
    else if (arg === '--out-draft') parsed.outDraft = path.resolve(args[++i] || '');
    else if (arg === '--out-xml') parsed.outXml = path.resolve(args[++i] || '');
    else if (arg === '--write-encoding') parsed.writeEncoding = args[++i] || parsed.writeEncoding;
    else if (arg === '--validate') parsed.validate = true;
    else if (arg === '--include-source-path') parsed.includeSourcePath = true;
    else if (arg === '--omit-draft') parsed.includeDraft = false;
    else if (arg === '--omit-xml') parsed.includeXml = false;
    else if (arg === '--help') {
      console.log(usage());
      process.exit(0);
    }
  }

  if (parsed.input || parsed.stdin) {
    const raw = parsed.stdin
      ? fs.readFileSync(0, 'utf8')
      : fs.readFileSync(parsed.input, 'utf8');
    const input = JSON.parse(raw.replace(/^\uFEFF/, ''));
    return {
      ...parsed,
      ...input,
      action: input.action || parsed.action,
      templateId: input.templateId || input.template_id || parsed.templateId,
      samples: input.samples ? path.resolve(input.samples) : parsed.samples,
      featureFile: input.featureFile ? path.resolve(input.featureFile) : parsed.featureFile,
      rulesFile: input.rulesFile ? path.resolve(input.rulesFile) : parsed.rulesFile,
      outDraft: input.outDraft ? path.resolve(input.outDraft) : parsed.outDraft,
      outXml: input.outXml ? path.resolve(input.outXml) : parsed.outXml,
      includeSourcePath: Boolean(input.includeSourcePath ?? parsed.includeSourcePath),
      includeDraft: input.includeDraft === undefined ? parsed.includeDraft : Boolean(input.includeDraft),
      includeXml: input.includeXml === undefined ? parsed.includeXml : Boolean(input.includeXml)
    };
  }

  return parsed;
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

function normalizeLimit(value, fallback = DEFAULT_LIMIT) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const integer = Math.trunc(numeric);
  if (integer < MIN_LIMIT) return MIN_LIMIT;
  if (integer > MAX_LIMIT) return MAX_LIMIT;
  return integer;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function normalizeRuleEntry(entry, type) {
  const label = String(entry && entry.label ? entry.label : '').trim();
  if (!label) return null;
  const query = uniqueStrings(type === 'domain' ? entry.query : entry.terms);
  const template = uniqueStrings(type === 'domain' ? (entry.template || entry.query) : entry.terms);
  if (!query.length && !template.length) return null;
  return {
    label,
    query: query.length ? query : template,
    template: template.length ? template : query
  };
}

function loadRecommendationRules(filePath = DEFAULT_RULES_FILE) {
  const raw = readJson(filePath || DEFAULT_RULES_FILE);
  const weights = { ...DEFAULT_RULE_WEIGHTS, ...(raw.weights || {}) };
  const domains = (Array.isArray(raw.domains) ? raw.domains : [])
    .map((entry) => normalizeRuleEntry(entry, 'domain'))
    .filter(Boolean);
  const features = (Array.isArray(raw.features) ? raw.features : [])
    .map((entry) => normalizeRuleEntry(entry, 'feature'))
    .filter(Boolean);

  if (!domains.length) throw new Error(`Recommendation rules contain no domains: ${filePath}`);
  if (!features.length) throw new Error(`Recommendation rules contain no features: ${filePath}`);

  return {
    sourcePath: filePath,
    thresholds: {
      choiceConfidence: Number(raw.thresholds && raw.thresholds.choiceConfidence) || 0.35
    },
    weights,
    domains,
    features
  };
}

function splitQueryTokens(text) {
  return normalizeText(text).split(/[，,。；;、|/\\\s]+/).filter(Boolean);
}

function expandQueryTerms(text, rules) {
  const normalized = normalizeText(text);
  const terms = new Set(splitQueryTokens(text));

  for (const { label, query } of [...rules.domains, ...rules.features]) {
    if (query.some((value) => normalized.includes(normalizeText(value)))) {
      terms.add(normalizeText(label));
      for (const value of query) terms.add(normalizeText(value));
    }
  }

  return Array.from(terms).filter(Boolean);
}

function templateHaystack(item) {
  return normalizeText([
    item.filename,
    ...item.partTemplateFields,
    ...item.groupTemplateFields,
    ...item.groupNames,
    ...item.featureSelections,
    item.structureSummary
  ].join(' '));
}

function publicTemplateItem(item, samples, options = {}) {
  const relativePath = path.relative(samples, item.sourcePath || '').replace(/\\/g, '/');
  const tags = [...item.groupNames, ...item.featureSelections].slice(0, 10);
  const publicItem = {
    id: item.id,
    templateId: item.id,
    filename: item.filename,
    displayName: item.filename ? item.filename.replace(/\.xml$/i, '') : item.id,
    relativePath,
    partTemplateFields: item.partTemplateFields,
    groupTemplateFields: item.groupTemplateFields,
    groupNames: item.groupNames,
    featureSelections: item.featureSelections,
    groupCount: item.groupCount,
    depth: item.depth,
    tags,
    structureSummary: item.structureSummary
  };
  if (options.includeSourcePath) publicItem.sourcePath = item.sourcePath;
  return publicItem;
}

function scoreTemplate(text, item, rules) {
  const normalizedText = normalizeText(text);
  const haystack = templateHaystack(item);
  const weights = rules.weights;
  let score = 0;
  const reasons = [];
  const scoreBreakdown = {
    domain: [],
    feature: [],
    lexical: 0,
    groupComplexity: 0,
    featureComplexity: 0
  };

  for (const { label, query, template } of rules.domains) {
    const queryMatches = query.some((value) => normalizedText.includes(normalizeText(value)));
    const templateMatches = template.some((value) => haystack.includes(normalizeText(value)));
    if (queryMatches && templateMatches) {
      score += weights.domainMatch;
      scoreBreakdown.domain.push({ label, score: weights.domainMatch });
      reasons.push(`零件类型匹配：${label}`);
    }
  }

  for (const { label, query, template } of rules.features) {
    const queryMatches = query.some((value) => normalizedText.includes(normalizeText(value)));
    const templateMatches = template.some((value) => haystack.includes(normalizeText(value)));
    if (queryMatches && templateMatches) {
      score += weights.featureMatch;
      scoreBreakdown.feature.push({ label, score: weights.featureMatch });
      reasons.push(`结构/特征匹配：${label}`);
    }
  }

  for (const term of expandQueryTerms(text, rules)) {
    if (term.length < 2) continue;
    if (haystack.includes(term)) {
      const termScore = term.length >= 3 ? weights.longTermMatch : weights.shortTermMatch;
      score += termScore;
      scoreBreakdown.lexical += termScore;
    }
  }

  if (item.groupCount > 0) {
    scoreBreakdown.groupComplexity = Math.min(item.groupCount, weights.groupCountCap) / weights.groupCountDivisor;
    score += scoreBreakdown.groupComplexity;
  }
  if (item.featureSelections.length > 0) {
    scoreBreakdown.featureComplexity = Math.min(item.featureSelections.length, weights.featureCountCap) / weights.featureCountDivisor;
    score += scoreBreakdown.featureComplexity;
  }

  return {
    score,
    confidence: Math.max(0, Math.min(0.99, Number(score.toFixed(3)))),
    reasons: [...new Set(reasons)].slice(0, 8),
    scoreBreakdown
  };
}

function loadTemplates(samples) {
  if (!fs.existsSync(samples)) {
    throw new Error(`Samples path not found: ${samples}`);
  }

  const files = listXmlFiles(samples);
  if (!files.length) {
    throw new Error(`No XML files found under samples path: ${samples}`);
  }

  return files.map(parseTemplateFile);
}

function recommendTemplates({ text, samples, featureFile, rulesFile, limit, includeSourcePath }) {
  const featureCatalog = parseFeatureCatalogFile(featureFile || DEFAULT_FEATURE_FILE);
  const rules = loadRecommendationRules(rulesFile || DEFAULT_RULES_FILE);

  return loadTemplates(samples)
    .map((item) => ({
      item,
      validation: validateTemplate(item, featureCatalog)
    }))
    .filter(({ validation }) => validation.ok)
    .map(({ item }) => ({
      ...publicTemplateItem(item, samples, { includeSourcePath }),
      ...scoreTemplate(text, item, rules)
    }))
    .filter((item) => item.confidence >= rules.thresholds.choiceConfidence)
    .sort((a, b) => b.score - a.score || b.groupCount - a.groupCount || a.filename.localeCompare(b.filename, 'zh'))
    .slice(0, normalizeLimit(limit));
}

function workflow(status) {
  return {
    currentStep: 'select_group_template',
    steps: [
      {
        id: 'select_group_template',
        title: '选择分组模板',
        status
      }
    ]
  };
}

function optionCards(candidates, selectedTemplateId = '') {
  if (!candidates.length) return [];
  return [
    {
      type: 'option_cards',
      id: 'group_template_candidates',
      stage: 'select_group_template',
      title: '请选择分组模板',
      options: candidates.map((item) => ({
        id: item.id,
        choiceId: item.id,
        templateId: item.id,
        title: item.displayName,
        subtitle: item.filename,
        confidence: item.confidence,
        reasons: item.reasons,
        tags: item.tags || [...item.groupNames, ...item.featureSelections].slice(0, 10),
        meta: {
          groupCount: item.groupCount,
          depth: item.depth,
          relativePath: item.relativePath
        },
        selected: selectedTemplateId === item.id
      }))
    }
  ];
}

function propose(args) {
  const text = String(args.text || '').trim();
  if (!text) {
    return {
      ok: true,
      action: 'propose',
      stage: 'select_group_template',
      mode: 'needs_input',
      reply: '请先提供零件类型、加工侧和典型特征，用于选择分组模板。',
      workflow: workflow('needs_input'),
      ui: [],
      candidates: []
    };
  }

  const candidates = recommendTemplates({
    text,
    samples: args.samples,
    featureFile: args.featureFile,
    rulesFile: args.rulesFile,
    includeSourcePath: args.includeSourcePath,
    limit: args.limit
  });
  const hasCandidates = candidates.length > 0;
  return {
    ok: true,
    action: 'propose',
    stage: 'select_group_template',
    mode: hasCandidates ? 'awaiting_choice' : 'needs_input',
    reply: hasCandidates
      ? '已找到可选分组模板，请让用户确认其中一个。'
      : '未找到足够匹配的分组模板，请补充零件类型、A/B侧信息或典型特征。',
    workflow: workflow(hasCandidates ? 'awaiting_choice' : 'needs_input'),
    ui: optionCards(candidates),
    candidates
  };
}

function findTemplate(args) {
  const target = String(args.templateId || '').trim();
  if (!target) throw new Error('confirm requires --template-id or templateId.');
  const templates = loadTemplates(args.samples);
  return templates.find((item) => {
    const relativePath = path.relative(args.samples, item.sourcePath || '').replace(/\\/g, '/');
    return item.id === target
      || item.filename === target
      || item.sourcePath === target
      || relativePath === target;
  }) || null;
}

function handoffTemplate(template) {
  return {
    id: template.id,
    templateId: template.templateId,
    displayName: template.displayName,
    filename: template.filename,
    relativePath: template.relativePath,
    groupCount: template.groupCount,
    depth: template.depth,
    tags: Array.isArray(template.tags) ? template.tags : []
  };
}

function confirm(args) {
  const selected = findTemplate(args);
  if (!selected) {
    return {
      ok: false,
      action: 'confirm',
      stage: 'select_group_template',
      mode: 'not_found',
      reply: `未找到分组模板：${args.templateId}`,
      workflow: workflow('not_found'),
      ui: [],
      message: `未找到分组模板：${args.templateId}`
    };
  }

  const template = publicTemplateItem(selected, args.samples, { includeSourcePath: args.includeSourcePath });
  let validation = null;

  if (args.validate) {
    const featureCatalog = parseFeatureCatalogFile(args.featureFile);
    validation = validateTemplate(selected, featureCatalog);
    if (!validation.ok) {
      const candidate = {
        ...template,
        score: 1,
        confidence: 1,
        reasons: ['用户已选择该分组模板，但模板校验未通过']
      };

      return {
        ok: false,
        action: 'confirm',
        stage: 'select_group_template',
        mode: 'validation_failed',
        reply: `分组模板「${template.displayName}」校验未通过，不能完成选择。`,
        workflow: workflow('validation_failed'),
        ui: optionCards([candidate], template.id),
        selectedTemplate: template,
        validation,
        artifacts: {},
        handoff: {
          step: 'select_group_template',
          completed: false,
          selectedGroupTemplate: handoffTemplate(template),
          validation
        }
      };
    }
  }

  const draft = parsedTemplateToDraft(selected);
  const xml = buildXml(draft, { encoding: 'GB2312' });
  const responseDraft = args.includeDraft ? draft : undefined;
  const responseXml = args.includeXml ? xml : undefined;
  const artifacts = {};
  if (args.outDraft) {
    writeText(args.outDraft, `${JSON.stringify(draft, null, 2)}\n`);
    artifacts.draft = args.outDraft;
  }
  if (args.outXml) {
    artifacts.xml = {
      path: args.outXml,
      writeEncoding: writeEncodedText(args.outXml, xml, args.writeEncoding)
    };
  }

  const candidate = {
    ...template,
    score: 1,
    confidence: 1,
    reasons: ['用户已确认该分组模板']
  };

  return {
    ok: validation ? validation.ok : true,
    action: 'confirm',
    stage: 'select_group_template',
    mode: 'completed',
    reply: `已确认分组模板「${template.displayName}」。`,
    workflow: workflow('completed'),
    ui: optionCards([candidate], template.id),
    selectedTemplate: template,
    draft: responseDraft,
    xml: responseXml,
    structureSummary: selected.structureSummary,
    validation,
    artifacts,
    handoff: {
      step: 'select_group_template',
      completed: true,
      selectedGroupTemplate: handoffTemplate(template),
      draft: responseDraft,
      xml: responseXml,
      structureSummary: selected.structureSummary
    }
  };
}

function main() {
  let args = null;
  try {
    args = parseArgs(process.argv);
    const action = String(args.action || (args.templateId ? 'confirm' : 'propose')).trim();
    if (!action || action === 'help') {
      console.log(usage());
      return;
    }

    if (!['propose', 'confirm'].includes(action)) {
      throw new Error(`Unsupported action: ${action}`);
    }

    const result = action === 'confirm' ? confirm(args) : propose(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exit(1);
  } catch (err) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      action: args && args.action ? args.action : undefined,
      stage: 'select_group_template',
      mode: 'error',
      message: err && err.message ? err.message : String(err)
    }, null, 2)}\n`);
    process.exit(1);
  }
}

main();
