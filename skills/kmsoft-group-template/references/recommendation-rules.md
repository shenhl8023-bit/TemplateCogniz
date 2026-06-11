# Recommendation Rules

Use this reference when tuning template recommendation behavior.

## Source Of Truth

`assets/recommendation-rules.json` is the source of truth for ranking rules used by `scripts/select_group_template.js`.

The JSON file controls:

- `thresholds.choiceConfidence`: minimum confidence required for a candidate card.
- `weights.domainMatch`: score added when part type and template family match.
- `weights.featureMatch`: score added for each matching feature family.
- `weights.longTermMatch` and `weights.shortTermMatch`: small lexical overlap bonuses.
- `weights.groupCount*` and `weights.featureCount*`: bounded complexity bonuses.
- `domains`: Chinese part-family terms for query matching and template matching.
- `features`: Chinese feature-family terms for query/template overlap.

## Tuning Rules

- Prefer adding domain-specific synonyms to `domains` or `features` before changing weights.
- Keep labels stable because they appear in `reasons` and may be shown in UI.
- Do not lower `choiceConfidence` unless the UI can handle weaker recommendations.
- When adding a new template family, add at least one smoke-test prompt that should rank it near the top.
- Keep template matching terms narrower than query terms when broad user language should map to a specific template family.

## Output Signals

Each candidate includes:

- `confidence`: clamped public score.
- `reasons`: compact user-facing explanation strings.
- `scoreBreakdown`: machine-readable score components for debugging and UI explanation.

Use `scoreBreakdown` for diagnostics; do not require callers to render it.
