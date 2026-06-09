# Fuzzy Template Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fuzzy generation path that turns vague descriptions into sample-template-based drafts when confidence is high, asks the user to choose at medium confidence, and asks for clarification at low confidence.

**Architecture:** Add a backend decision helper and `POST /api/templates/generate-fuzzy`, then update describe-mode chat flow to consume that decision before normal `/api/chat`. Keep strict LLM intent parsing unchanged for precise incremental edits.

**Tech Stack:** Node.js built-in HTTP server, browser ES modules, `node:test`.

---

### Task 1: Backend Fuzzy Decision API

**Files:**
- Modify: `server.js`
- Test: `test/template-api.test.js`

- [ ] Add tests for `POST /api/templates/generate-fuzzy`: high-confidence text returns `mode: "auto_applied"` with `draft`, `xml`, `template`, and `recognitionRecommendation`; medium-confidence text returns `mode: "needs_choice"` with recommendations but no applied draft; low-confidence text returns `mode: "needs_clarification"` with a question.

- [ ] Run `node --test test/template-api.test.js` and verify the new tests fail because the route does not exist.

- [ ] Add constants `FUZZY_AUTO_APPLY_CONFIDENCE = 0.75` and `FUZZY_CHOICE_CONFIDENCE = 0.4`.

- [ ] Add `generateFuzzyTemplate({ text, limit })` that calls `recommendGroupTemplates`, checks the thresholds, calls `applyGroupTemplate` only for high confidence, and returns one of `auto_applied`, `needs_choice`, or `needs_clarification`.

- [ ] Add `POST /api/templates/generate-fuzzy` to call `generateFuzzyTemplate`.

- [ ] Export `generateFuzzyTemplate` for direct tests if needed.

- [ ] Run `node --test test/template-api.test.js` and verify the API tests pass.

### Task 2: Frontend Describe-Mode Integration

**Files:**
- Modify: `public/js/services.js`
- Modify: `public/js/ui.js`
- Test: add or modify a static frontend test under `test/`

- [ ] Add `apiGenerateFuzzyTemplate(text, limit = 3)` to `public/js/services.js`.

- [ ] Update `public/js/ui.js` imports to include `apiGenerateFuzzyTemplate`.

- [ ] Add `handleFuzzyTemplateGeneration(text)` that updates state for `auto_applied`, populates recommendations for `needs_choice`, and displays the clarification question for `needs_clarification`.

- [ ] In `sendChat()`, when `state.modeType === "describe"`, call `handleFuzzyTemplateGeneration(text)` before creating the normal LLM pending message. If it handles the text, return early.

- [ ] Add a static test that verifies `ui.js` imports `apiGenerateFuzzyTemplate`, calls it inside describe-mode handling, and only creates the LLM pending message after the fuzzy path.

- [ ] Run `node --test`.

### Task 3: Verification

**Files:**
- No additional files expected.

- [ ] Run `node --test`.

- [ ] Start the local server on an available port if needed and verify `POST /api/templates/generate-fuzzy` with a high-confidence vague description returns `auto_applied`.

- [ ] Inspect `git diff --stat` and ensure only the intended files changed, aside from pre-existing local modifications.
