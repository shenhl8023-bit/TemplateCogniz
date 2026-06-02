# Template Branch Experiments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two comparable experiments: branch 1 recommends existing group templates with rule scoring and human confirmation, branch 2 lets AI generate a template directly from XML structure rules and keywords.

**Architecture:** Branch 1 adds a template catalog service that scans sample XML, extracts searchable metadata, recommends templates with explainable scoring, and applies a selected template to the current draft. Branch 2 will reuse validation and draft/XML conversion but replace catalog selection with a constrained AI generation endpoint.

**Tech Stack:** Node.js built-in HTTP server, Node `node:test`, native browser ES modules, existing XML string generation/parsing style.

---

### Task 1: Branch 1 Backend Template Catalog

**Files:**
- Modify: `package.json`
- Modify: `server.js`
- Create: `test/template-catalog.test.js`

- [ ] **Step 1: Write failing tests**

Create tests for catalog scanning, recommendation ranking, and applying a selected XML template into draft shape.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test`
Expected: FAIL because `readTemplateCatalog`, `recommendGroupTemplates`, and `applyGroupTemplate` are not exported yet.

- [ ] **Step 3: Implement catalog parser and recommendation**

Add functions that read XML files under `分组模板`, parse `Part_Template`, `Group_Template`, `Part` params, recursive `Group` nodes, and produce a catalog item with fields, group names, feature selections, count, depth, and source path.

- [ ] **Step 4: Implement apply**

Add `applyGroupTemplate(templateId)` that returns a normalized draft with groups copied from the selected template and stable regenerated IDs.

- [ ] **Step 5: Run tests and commit**

Run: `npm test`
Expected: PASS.

### Task 2: Branch 1 HTTP API

**Files:**
- Modify: `server.js`
- Create: `test/template-api.test.js`

- [ ] **Step 1: Write failing API tests**

Test `GET /api/group-templates`, `POST /api/group-templates/recommend`, and `POST /api/group-templates/apply`.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test`
Expected: FAIL with 404 for new endpoints.

- [ ] **Step 3: Implement endpoints**

Expose catalog, recommendation, and apply responses. Include reasons, confidence, alternatives, resulting draft, XML, and group structure summary.

- [ ] **Step 4: Run tests and commit**

Run: `npm test`
Expected: PASS.

### Task 3: Branch 1 Frontend Flow

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/services.js`
- Modify: `public/js/store.js`
- Modify: `public/js/ui.js`
- Modify: `public/style.css`

- [ ] **Step 1: Add service wrappers**

Add `apiListGroupTemplates`, `apiRecommendGroupTemplates`, and `apiApplyGroupTemplate`.

- [ ] **Step 2: Add template recommendation card**

Add a left-panel card under describe mode showing recommended template, reasons, alternatives, and an apply button.

- [ ] **Step 3: Wire apply to preview**

When a template is applied, replace `state.draft`, refresh XML, show structure summary, and render the tree.

- [ ] **Step 4: Manual browser verification**

Start with `npm start`, open `http://127.0.0.1:3000`, enter a rotary/sleeve description, verify recommendations and apply flow.

### Task 4: Branch 2 Full AI Generation

**Files:**
- Switch to: `codex/ai-generate-template`
- Modify: `server.js`
- Modify: `public/js/services.js`
- Modify: `public/js/ui.js`
- Modify: `public/style.css`
- Create: `test/ai-template-generation.test.js`

- [ ] **Step 1: Write failing tests**

Test that a constrained AI generation result containing `partTemplateFields`, `groupTemplateFields`, `partParams`, and nested `groups` is normalized, validated, and converted to XML.

- [ ] **Step 2: Implement generator endpoint**

Add `POST /api/templates/generate-ai` that sends the XML schema, feature dictionary, supported fields, and user text to the configured model, then validates returned JSON.

- [ ] **Step 3: Add frontend generation card**

Add a mode that lets users request full AI generation and preview/apply the generated draft.

- [ ] **Step 4: Compare against branch 1**

Use the same user prompts and compare success rate, explainability, edit burden, and XML validity.
