# Selection Contract

This skill provides only the first MPS workflow step: `select_group_template`.

## Caller Responsibilities

- Own the full MPS agent conversation.
- Render option cards from `ui`.
- Collect the user's selected `templateId`.
- Call `confirm`.
- Continue later MPS steps outside this skill.

## Skill Responsibilities

- Rank sample group templates from a Chinese part description.
- Return clickable group-template options.
- Confirm the user's selected template.
- Return draft/XML/structure summary as a handoff payload.

## Propose Request

Schema: `schemas/propose.request.schema.json`

```json
{
  "action": "propose",
  "text": "衬套类回转体零件，A侧和B侧，包含端面、外圆、孔和外环槽",
  "limit": 3,
  "includeSourcePath": false
}
```

## Propose Response

Schema: `schemas/propose.response.schema.json`

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
      "id": "group_template_candidates",
      "stage": "select_group_template",
      "title": "请选择分组模板",
      "options": [
        {
          "id": "template-id",
          "choiceId": "template-id",
          "templateId": "template-id",
          "title": "新衬套模板",
          "confidence": 0.95,
          "reasons": [],
          "tags": [],
          "meta": {
            "groupCount": 33,
            "depth": 4,
            "relativePath": "新衬套模板.xml"
          }
        }
      ]
    }
  ],
  "candidates": [
    {
      "templateId": "template-id",
      "relativePath": "新衬套模板.xml",
      "scoreBreakdown": {}
    }
  ]
}
```

## Confirm Request

Schema: `schemas/confirm.request.schema.json`

```json
{
  "action": "confirm",
  "templateId": "template-id",
  "validate": true,
  "includeDraft": true,
  "includeXml": true
}
```

## Confirm Response

Schema: `schemas/confirm.response.schema.json`

Completed confirmation:

```json
{
  "ok": true,
  "action": "confirm",
  "stage": "select_group_template",
  "mode": "completed",
  "workflow": {
    "currentStep": "select_group_template",
    "steps": [
      {
        "id": "select_group_template",
        "title": "选择分组模板",
        "status": "completed"
      }
    ]
  },
  "selectedTemplate": {},
  "draft": {},
  "xml": "",
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

Business failure modes:

- `mode = "validation_failed"`: the selected template exists, but `--validate` found blocking template errors. The response includes `selectedTemplate`, `validation`, `ui`, and `handoff.completed = false`.
- `mode = "not_found"`: the selected `templateId` does not match any sample template. The response includes `message`, `workflow`, and an empty `ui` array.

Execution failures such as malformed JSON or missing files use `schemas/error.response.schema.json` with `mode = "error"`.

By default, responses omit machine-local absolute `sourcePath` values. Set `includeSourcePath = true` only for local debugging. Set `includeDraft = false` or `includeXml = false` on `confirm` when the caller writes artifacts to files and does not need large draft/XML strings inline.

## Invocation

Use `--input request.json` for file-based calls, or `--stdin` for direct JSON pipes:

```bash
cat request.json | node scripts/select_group_template.js --stdin
```
