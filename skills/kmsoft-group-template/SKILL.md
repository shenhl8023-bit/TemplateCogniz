---
name: kmsoft-group-template
description: Select a Kmsoft/MPS/3DMPS 分组模板 as the first workflow step for an external MPS agent. Use when an agent needs to 推荐分组模板/选择分组模板 from a Chinese part description, show clickable group-template candidates for parts such as 壳体、衬套、套类、小件、活门/阀类, accept the user's selected template, and return the selected template draft/XML/structure summary for handoff to the next MPS workflow step.
---

# Kmsoft Group Template Selection

This skill owns only the first product-video step: **选择分组模板**.

It does not run the full MPS agent, does not select automatic-recognition templates, does not infer features, and does not operate 3DMPS. The caller agent handles those later steps. This skill returns structured JSON that the caller can render as option cards and then use as a handoff payload after the user confirms a template.

## Primary Workflow

Use `scripts/select_group_template.js` as the stable integration entrypoint. It wraps recommendation, option-card shaping, confirmation, XML generation, and handoff payload creation.

```bash
node scripts/select_group_template.js propose --text "衬套类回转体零件，A侧和B侧，包含端面、外圆、孔和外环槽" --limit 3
```

The `propose` action returns:

- `workflow`: one-step status for `select_group_template`.
- `ui`: option-card data for clickable template choices.
- `candidates`: ranked template candidates with reasons, confidence, group count, depth, and tags.

After the external MPS agent receives the user's selected `templateId`, confirm it:

```bash
node scripts/select_group_template.js confirm --template-id "<templateId>" --validate
```

The `confirm` action returns:

- `workflow.steps[0].status = "completed"`.
- `selectedTemplate`: selected template metadata.
- `draft`: editable group-template draft JSON.
- `xml`: Kmsoft XML string with `GB2312` declaration.
- `structureSummary`: compact group tree summary.
- `handoff`: the exact payload the MPS agent should pass to its next workflow step.

When the caller only needs files, set `includeDraft: false` and/or `includeXml: false` to omit large inline payloads after writing `outDraft` or `outXml`.

## JSON Input Mode

For software integration, prefer JSON input files or stdin to avoid shell quoting issues:

```json
{
  "action": "propose",
  "text": "壳体类多面加工零件，包含孔系、平面和通槽",
  "limit": 3
}
```

Run:

```bash
node scripts/select_group_template.js --input request.json
```

Or pass the same JSON through stdin:

```bash
cat request.json | node scripts/select_group_template.js --stdin
```

Confirm example:

```json
{
  "action": "confirm",
  "templateId": "template-id-from-candidate",
  "outDraft": "selected-draft.json",
  "outXml": "selected-template.xml",
  "writeEncoding": "gb2312",
  "includeDraft": false,
  "includeXml": false,
  "validate": true
}
```

## Agent Contract

The external MPS agent should treat this skill as a two-call step:

1. Call `propose` from the user's natural-language part description.
2. Render `ui[0].options` as clickable choices.
3. Pass the chosen `templateId` to `confirm`.
4. Store `handoff` and continue its own MPS workflow.

Do not auto-complete this step without a user choice unless the product explicitly allows auto-selection. The product-video behavior is user-confirmed selection.

### Proposal Shape

```json
{
  "ok": true,
  "stage": "select_group_template",
  "mode": "awaiting_choice",
  "workflow": {
    "currentStep": "select_group_template",
    "steps": [
      {
        "id": "select_group_template",
        "title": "选择分组模板",
        "status": "awaiting_choice"
      }
    ]
  },
  "ui": [
    {
      "type": "option_cards",
      "stage": "select_group_template",
      "title": "请选择分组模板",
      "options": []
    }
  ],
  "candidates": []
}
```

### Confirmation Shape

```json
{
  "ok": true,
  "stage": "select_group_template",
  "mode": "completed",
  "workflow": {
    "steps": [
      {
        "id": "select_group_template",
        "status": "completed"
      }
    ]
  },
  "selectedTemplate": {},
  "draft": {},
  "xml": "<?xml version=\"1.0\" encoding=\"GB2312\" ?>...",
  "structureSummary": "",
  "handoff": {
    "step": "select_group_template",
    "completed": true,
    "selectedGroupTemplate": {},
    "draft": {},
    "xml": "",
    "structureSummary": ""
  }
}
```

## Supporting Tools

Use these only when the caller needs lower-level template operations. Keep `select_group_template.js` as the primary workflow entrypoint.

- Parse or inspect XML: `node scripts/parse_template.js path/to/template.xml`
- Validate XML: `node scripts/validate_template.js path/to/template.xml`
- Run smoke regression: `node scripts/smoke_test.js`
- Run full standalone validation: `node scripts/validate_skill.js`
- Regenerate the template asset index: `node scripts/build_template_index.js`
- List allowed feature names: `node scripts/list_features.js`
- Build XML from a draft: `node scripts/build_template.js --draft draft.json --out template.xml --write-encoding gb2312 --validate`
- Apply structured template edits: `node scripts/apply_operations.js --ops operations.json --draft draft.json --out-xml updated.xml --validate`

## References

Load only as needed:

- External MPS agent integration contract: `references/selection-contract.md`
- XML shape and node relationships: `references/xml-structure.md`
- Part/Group parameter dependencies: `references/parameter-rules.md`
- Natural-language edit operations: `references/intent-operations.md`
- Feature dictionary: `references/feature-dictionary.md`
- Recommendation rules and scoring knobs: `references/recommendation-rules.md`

## Assets

- Selectable templates live under `assets/sample-templates/`.
- `assets/template-index.json` is a generated catalog for quick inspection and UI metadata. Regenerate it with `node scripts/build_template_index.js` after adding or removing sample templates.
- `assets/recommendation-rules.json` controls recommendation terms, thresholds, and scoring weights.

## Schemas

Use these as the stable integration contract for the MPS agent:

- `schemas/propose.request.schema.json`
- `schemas/propose.response.schema.json`
- `schemas/confirm.request.schema.json`
- `schemas/confirm.response.schema.json`

## Guardrails

- Keep this skill scoped to **选择分组模板**.
- Do not include later MPS steps in this skill's output except as caller-owned handoff context.
- Do not call 3DMPS or MCP tools from this skill.
- Use `assets/sample-templates/` as the authority for selectable template structures.
- Use `assets/FeatureTemplate.xml` as the authority when validation checks feature names.
- For final files consumed by legacy Kmsoft/3DMPS paths, prefer `--write-encoding gb2312`.
