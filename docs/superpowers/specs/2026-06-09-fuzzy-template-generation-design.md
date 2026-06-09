# Fuzzy Template Generation Design

## Goal

Allow users to create a usable group-template draft from vague Chinese descriptions such as "做个衬套模板，有外圆、端面、孔和槽" without requiring precise group operations.

## Current Context

The project already has two relevant paths:

- `/api/chat` performs strict incremental editing. Its LLM prompt intentionally avoids guessing when the operation is uncertain.
- `/api/group-templates/recommend` and `/api/group-templates/apply` read real sample XML templates, rank candidates from user text, and turn a selected sample into an editable draft plus XML preview.

The vague-generation path should use sample templates first. This keeps generated drafts aligned with real XML structure, supported fields, and feature dictionary values.

## Behavior

When the user is in describe mode and submits vague text:

1. The frontend asks the backend for a fuzzy template-generation decision.
2. If the best recommendation is high-confidence, the backend applies that template immediately and returns the draft, XML, selected group template, recognition template, and structure summary.
3. If confidence is medium, the backend returns candidate templates for the existing recommendation panel. The user chooses one explicitly.
4. If confidence is low or no catalog item can be ranked, the backend returns a short clarification question instead of fabricating a template.
5. Normal precise editing remains handled by `/api/chat`.

## Confidence Rules

- `auto_applied`: top recommendation confidence is at least `0.75`.
- `needs_choice`: top recommendation confidence is at least `0.4` and below `0.75`.
- `needs_clarification`: no recommendation reaches `0.4`.

The thresholds are intentionally conservative because applying a full XML-derived template changes most of the draft.

## API Shape

Add `POST /api/templates/generate-fuzzy`.

Request:

```json
{
  "text": "衬套类回转体零件，包含端面、外圆、孔和外环槽",
  "limit": 3
}
```

Response for automatic application:

```json
{
  "ok": true,
  "mode": "auto_applied",
  "recommendations": [],
  "template": {},
  "draft": {},
  "xml": "",
  "structureSummary": "",
  "recognitionRecommendation": {},
  "reply": "已按高匹配度样例自动生成模板。"
}
```

Response for choice:

```json
{
  "ok": true,
  "mode": "needs_choice",
  "recommendations": [],
  "question": "我找到几个相近模板，请选择一个应用。"
}
```

Response for clarification:

```json
{
  "ok": true,
  "mode": "needs_clarification",
  "recommendations": [],
  "question": "这个零件更接近衬套/轴类、壳体/箱体，还是简单小件？"
}
```

## Frontend Flow

In describe mode, `sendChat()` should call fuzzy generation before the normal chat parser.

- For `auto_applied`, update `state.draft`, `state.selectedGroupTemplate`, `state.selectedRecognitionTemplate`, XML preview, recommendation panel, and chat messages.
- For `needs_choice`, populate `state.templateRecommendations` and show a bot message asking the user to choose.
- For `needs_clarification`, show the clarification question and leave the current draft unchanged.
- If the fuzzy endpoint fails, fall back to the existing chat path so current functionality remains available.

## Testing

Add API tests for:

- High-confidence vague input auto-applies a template and returns XML/draft.
- Medium-confidence input returns recommendations without applying a draft.
- Low-confidence input asks a clarification question.

Add a frontend static test for the describe-mode flow so future edits do not bypass the fuzzy endpoint.
