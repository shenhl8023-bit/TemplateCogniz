#!/usr/bin/env node

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const core = require('../scripts/template_core');

const ROOT = path.resolve(__dirname, '..');
const SAMPLE_DIR = path.join(ROOT, 'assets', 'sample-templates');
const FEATURE_FILE = path.join(ROOT, 'assets', 'FeatureTemplate.xml');
const OUT_DIR = path.join(ROOT, 'demo', 'output');
const PORT = Number(process.env.PORT || 5177);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function sendJson(res, status, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(body);
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store'
  });
  res.end(text);
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error(`Invalid JSON body: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

function runNodeScript(args, stdin = '') {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => {
      let json = null;
      try {
        json = JSON.parse(stdout);
      } catch (_) {
        // Some helper scripts print tabular output instead of JSON.
      }
      resolve({ code, stdout, stderr, json });
    });
    child.stdin.end(stdin);
  });
}

function publicTemplate(template) {
  return {
    id: template.id,
    filename: template.filename,
    displayName: template.filename.replace(/\.xml$/i, ''),
    relativePath: path.relative(SAMPLE_DIR, template.sourcePath).replace(/\\/g, '/'),
    groupCount: template.groupCount,
    depth: template.depth,
    partTemplateFields: template.partTemplateFields,
    groupTemplateFields: template.groupTemplateFields,
    groupNames: template.groupNames,
    featureSelections: template.featureSelections,
    structureSummary: template.structureSummary,
    detectedEncoding: template.detectedEncoding,
    declaredEncoding: template.declaredEncoding
  };
}

function listTemplates() {
  return core.listXmlFiles(SAMPLE_DIR)
    .map(core.parseTemplateFile)
    .sort((a, b) => a.filename.localeCompare(b.filename, 'zh-Hans-CN'))
    .map(publicTemplate);
}

function loadFeatureCatalog() {
  const catalog = core.parseFeatureCatalogFile(FEATURE_FILE);
  return {
    flat: catalog.flat,
    tree: catalog.tree,
    sourcePath: path.relative(ROOT, catalog.sourcePath).replace(/\\/g, '/'),
    detectedEncoding: catalog.detectedEncoding,
    declaredEncoding: catalog.declaredEncoding
  };
}

function findTemplatePath(templateIdOrPath) {
  const target = String(templateIdOrPath || '').trim();
  if (!target) return '';
  const templates = core.listXmlFiles(SAMPLE_DIR).map(core.parseTemplateFile);
  const found = templates.find((item) => {
    const relativePath = path.relative(SAMPLE_DIR, item.sourcePath).replace(/\\/g, '/');
    return item.id === target
      || item.filename === target
      || item.sourcePath === target
      || relativePath === target;
  });
  return found ? found.sourcePath : '';
}

function safeOutputName(value, fallback = 'selected-template') {
  const base = String(value || fallback).replace(/\.xml$/i, '').trim() || fallback;
  return base.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').slice(0, 80);
}

async function propose(res, body) {
  const payload = {
    action: 'propose',
    text: String(body.text || '').trim(),
    limit: Number(body.limit || 3),
    includeSourcePath: false
  };
  const result = await runNodeScript(['scripts/select_group_template.js', '--stdin'], JSON.stringify(payload));
  sendJson(res, result.code === 0 ? 200 : 422, {
    ok: result.code === 0,
    command: `node scripts/select_group_template.js --stdin`,
    request: payload,
    result: result.json,
    stdout: result.json ? undefined : result.stdout,
    stderr: result.stderr || undefined
  });
}

async function confirm(res, body) {
  const templateId = String(body.templateId || '').trim();
  const shouldWrite = Boolean(body.writeFile);
  const selectedPath = findTemplatePath(templateId);
  const outBase = safeOutputName(
    selectedPath ? path.basename(selectedPath, '.xml') : templateId,
    'selected-template'
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outXml = shouldWrite ? path.join(OUT_DIR, `${outBase}-${timestamp}.xml`) : '';
  const outDraft = shouldWrite ? path.join(OUT_DIR, `${outBase}-${timestamp}.draft.json`) : '';
  const payload = {
    action: 'confirm',
    templateId,
    validate: body.validate !== false,
    includeDraft: body.includeDraft !== false,
    includeXml: body.includeXml !== false,
    outXml: outXml || undefined,
    outDraft: outDraft || undefined,
    writeEncoding: body.writeEncoding || 'utf8'
  };
  const result = await runNodeScript(['scripts/select_group_template.js', '--stdin'], JSON.stringify(payload));
  sendJson(res, result.code === 0 ? 200 : 422, {
    ok: result.code === 0,
    command: `node scripts/select_group_template.js --stdin`,
    request: payload,
    result: result.json,
    stdout: result.json ? undefined : result.stdout,
    stderr: result.stderr || undefined
  });
}

async function parseTemplate(res, body) {
  const templateId = String(body.templateId || '').trim();
  const filePath = findTemplatePath(templateId);
  if (!filePath) {
    sendJson(res, 404, { ok: false, message: `Template not found: ${templateId}` });
    return;
  }
  const parsed = core.parseTemplateFile(filePath);
  const featureCatalog = core.parseFeatureCatalogFile(FEATURE_FILE);
  sendJson(res, 200, {
    ok: true,
    template: {
      ...publicTemplate(parsed),
      partParams: parsed.partParams,
      groups: parsed.groups
    },
    validation: core.validateTemplate(parsed, featureCatalog)
  });
}

async function buildDraft(res, body) {
  const draft = body.draft && typeof body.draft === 'object'
    ? body.draft
    : core.createDefaultDraft();
  try {
    const normalizedDraft = core.normalizeDraft(draft);
    const xml = core.buildXml(normalizedDraft, { encoding: body.encoding || 'GB2312' });
    const parsed = {
      sourcePath: 'demo-draft.xml',
      partTemplateFields: normalizedDraft.partTemplateFields,
      groupTemplateFields: normalizedDraft.groupTemplateFields,
      partParams: normalizedDraft.partParams,
      groups: normalizedDraft.groups
    };
    const validation = core.validateTemplate(parsed, core.parseFeatureCatalogFile(FEATURE_FILE));
    let artifact = null;
    if (body.writeFile) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outXml = path.join(OUT_DIR, `draft-${timestamp}.xml`);
      const writeEncoding = body.writeEncoding || 'utf8';
      artifact = {
        path: outXml,
        writeEncoding: core.writeEncodedText(outXml, xml, writeEncoding)
      };
    }
    sendJson(res, validation.ok ? 200 : 422, {
      ok: validation.ok,
      draft: normalizedDraft,
      validation,
      xml,
      artifact
    });
  } catch (err) {
    sendJson(res, 422, {
      ok: false,
      message: err && err.message ? err.message : String(err)
    });
  }
}

async function smokeTest(res) {
  const result = await runNodeScript(['scripts/smoke_test.js']);
  sendJson(res, result.code === 0 ? 200 : 422, {
    ok: result.code === 0,
    command: 'node scripts/smoke_test.js',
    stdout: result.stdout,
    stderr: result.stderr || undefined
  });
}

function serveStatic(req, res, url) {
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.resolve(__dirname, `.${decodeURIComponent(requested)}`);
  if (!filePath.startsWith(__dirname)) {
    sendText(res, 403, 'Forbidden');
    return true;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'content-type': MIME_TYPES[ext] || 'application/octet-stream',
    'cache-control': 'no-store'
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
      sendJson(res, 200, {
        ok: true,
        root: ROOT,
        sampleDir: path.relative(ROOT, SAMPLE_DIR).replace(/\\/g, '/'),
        outputDir: path.relative(ROOT, OUT_DIR).replace(/\\/g, '/'),
        templates: listTemplates(),
        features: loadFeatureCatalog()
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/propose') {
      await propose(res, await parseRequestBody(req));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/confirm') {
      await confirm(res, await parseRequestBody(req));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/parse') {
      await parseTemplate(res, await parseRequestBody(req));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/build') {
      await buildDraft(res, await parseRequestBody(req));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smoke') {
      await smokeTest(res);
      return;
    }

    if (req.method === 'GET' && serveStatic(req, res, url)) return;
    sendText(res, 404, 'Not found');
  } catch (err) {
    sendJson(res, 500, {
      ok: false,
      message: err && err.message ? err.message : String(err)
    });
  }
}

const server = http.createServer(route);

server.listen(PORT, () => {
  console.log(`Kmsoft group-template demo running at http://localhost:${PORT}`);
  console.log(`Workspace: ${ROOT}`);
});
