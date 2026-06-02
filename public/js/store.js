import { defaultValueFromMeta } from './param-meta.js';

export const state = {
  draft: null,
  features: [],
  featureTree: [],
  scenePresets: [],
  supportedPartFields: [],
  groupTemplates: [],
  templateRecommendations: [],
  selectedGroupTemplate: null,
  selectedRecognitionTemplate: null,
  xml: '',
  settings: null,
  partFieldsConfirmed: false,
  selectedNodeId: null,
  draggingNodeId: null,
  modeActive: false
};

function defaultGroupFieldValue(field) {
  if (field === '依赖方向') return '从父';
  if (field === '依赖方式') return '无';
  const v = defaultValueFromMeta('group', field);
  if (v) return v;
  return '';
}

export function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function findNodeById(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    const child = findNodeById(n.children || [], id);
    if (child) return child;
  }
  return null;
}

export function removeNode(nodes, id) {
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx >= 0) {
    nodes.splice(idx, 1);
    return true;
  }
  for (const n of nodes) {
    if (removeNode(n.children || [], id)) return true;
  }
  return false;
}

export function updateGroupFieldSyncAdd(nodes, field) {
  const walk = (arr) => {
    for (const n of arr) {
      if (!(field in n.params)) n.params[field] = defaultGroupFieldValue(field);
      walk(n.children || []);
    }
  };
  walk(nodes);
}

export function updateGroupFieldSyncDelete(nodes, field) {
  const walk = (arr) => {
    for (const n of arr) {
      delete n.params[field];
      walk(n.children || []);
    }
  };
  walk(nodes);
}

export function createNode(name, groupTemplateFields) {
  const params = { 名称: name };
  for (const f of groupTemplateFields) {
    params[f] = defaultGroupFieldValue(f);
  }
  return { id: uid(), name, params, children: [] };
}
