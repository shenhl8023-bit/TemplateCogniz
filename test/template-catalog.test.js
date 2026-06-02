const assert = require('node:assert/strict');
const test = require('node:test');

process.env.NO_LISTEN = '1';

const {
  readTemplateCatalog,
  recommendGroupTemplates,
  listRecognitionTemplates,
  recommendRecognitionTemplates,
  applyGroupTemplate,
  buildXml
} = require('../server');

test('readTemplateCatalog extracts sample template metadata', () => {
  const catalog = readTemplateCatalog();

  assert.ok(catalog.length >= 5);
  const sleeve = catalog.find((item) => item.filename.includes('衬套'));
  assert.ok(sleeve);
  assert.ok(sleeve.id);
  assert.ok(sleeve.displayName);
  assert.ok(sleeve.sourcePath.endsWith('.xml'));
  assert.ok(sleeve.partTemplateFields.includes('原点'));
  assert.ok(sleeve.groupTemplateFields.includes('特征选择'));
  assert.ok(sleeve.groupNames.some((name) => name.includes('外圆')));
  assert.ok(sleeve.featureSelections.some((name) => name.includes('外圆') || name.includes('孔')));
  assert.ok(sleeve.groupCount > 0);
  assert.ok(sleeve.depth > 0);
});

test('recommendGroupTemplates ranks sleeve and rotary templates from text', () => {
  const catalog = readTemplateCatalog();
  const recommendations = recommendGroupTemplates({
    text: '这是一个衬套类回转体零件，需要按A侧、B侧、端面、外圆、孔、外环槽分组',
    catalog
  });

  assert.ok(recommendations.length > 0);
  const top = recommendations[0];
  assert.ok(top.score > 0);
  assert.ok(top.confidence >= 0.4);
  assert.ok(Array.isArray(top.reasons));
  assert.ok(top.reasons.length > 0);
  assert.match(`${top.displayName} ${top.filename} ${top.reasons.join(' ')}`, /衬套|回转体|外圆|孔|端面/);
});

test('applyGroupTemplate converts selected template into editable draft and XML', () => {
  const catalog = readTemplateCatalog();
  const selected = recommendGroupTemplates({
    text: '衬套类零件，A侧和B侧，包含外圆、端面、孔',
    catalog
  })[0];

  const result = applyGroupTemplate(selected.id, { catalog });

  assert.equal(result.ok, true);
  assert.ok(result.draft.partTemplateFields.length > 0);
  assert.ok(result.draft.groupTemplateFields.includes('特征选择'));
  assert.ok(result.draft.groups.length > 0);
  assert.ok(result.summary.includes('外圆') || result.summary.includes('端面') || result.summary.includes('孔'));
  const xml = buildXml(result.draft);
  assert.ok(xml.includes('<Item type="Part_Template">'));
  assert.ok(xml.includes('<Item type="Group_Template">'));
  assert.ok(xml.includes('<Item'));
});

test('recommendRecognitionTemplates selects rotary recognition after applying sleeve template', () => {
  const catalog = readTemplateCatalog();
  const selected = recommendGroupTemplates({
    text: '衬套类回转体零件，A侧和B侧，包含外圆、端面、孔',
    catalog
  })[0];
  const applied = applyGroupTemplate(selected.id, { catalog });

  const templates = listRecognitionTemplates();
  const recommendations = recommendRecognitionTemplates({
    text: '衬套类回转体零件，需要自动识别端面、外圆、孔和外环槽',
    groupTemplate: selected,
    draft: applied.draft,
    templates
  });

  assert.ok(templates.length >= 3);
  assert.ok(recommendations.length > 0);
  assert.equal(recommendations[0].id, 'rotary_recognition');
  assert.ok(recommendations[0].confidence >= 0.5);
  assert.ok(recommendations[0].recognizes.includes('外圆'));
  assert.ok(recommendations[0].reasons.length > 0);
});
