import { findNodeById, removeNode, createNode, updateGroupFieldSyncAdd, updateGroupFieldSyncDelete } from './store.js';
import { defaultValueFromMeta } from './param-meta.js';

const PART_FIELD_SPINDLE_AXIS = '有主轴线';
const PART_FIELD_AXIS = '有轴线';
const GROUP_FIELD_SPINDLE_FEATURE = '主轴线上特征';
const GROUP_FIELD_GENERAL_AXIS_FEATURE = '一般轴线上特征';

function containsNodeId(node, id) {
  if (!node || !id) return false;
  if (node.id === id) return true;
  return (node.children || []).some((child) => containsNodeId(child, id));
}

export function moveNodeAsChild(groups, movingId, targetId) {
  if (!movingId || !targetId || movingId === targetId) return false;
  const moving = findNodeById(groups, movingId);
  if (!moving) return false;
  const target = findNodeById(groups, targetId);
  if (!target) return false;
  if (containsNodeId(moving, targetId)) return false;
  const removed = removeNode(groups, movingId);
  if (!removed) return false;
  target.children = target.children || [];
  target.children.push(moving);
  return true;
}

export function addTopGroup(groups, name, groupTemplateFields) {
  if (!name) return false;
  groups.push(createNode(name, groupTemplateFields));
  return true;
}

export function addChildGroup(groups, parentId, name, groupTemplateFields) {
  if (!parentId || !name) return false;
  const parent = findNodeById(groups, parentId);
  if (!parent) return false;
  parent.children = parent.children || [];
  parent.children.push(createNode(name, groupTemplateFields));
  return true;
}

export function deleteGroup(groups, nodeId) {
  if (!nodeId) return false;
  return removeNode(groups, nodeId);
}

export function setPartParam(draft, field, value) {
  draft.partParams[field] = value;
}

export function setGroupParam(node, field, value) {
  node.params[field] = value;
  if (field === '名称') node.name = value;
}

export function addPartTemplateField(draft, field) {
  if (!field) return false;
  if (!draft.partTemplateFields.includes(field)) draft.partTemplateFields.push(field);
  if (!(field in draft.partParams)) draft.partParams[field] = defaultValueFromMeta('part', field);
  syncGroupTemplateByPartSelection(draft);
  return true;
}

export function removePartTemplateField(draft, field) {
  if (!field) return false;
  draft.partTemplateFields = draft.partTemplateFields.filter((x) => x !== field);
  delete draft.partParams[field];
  syncGroupTemplateByPartSelection(draft);
  return true;
}

export function addGroupTemplateField(draft, field) {
  if (!field) return false;
  if (field === GROUP_FIELD_SPINDLE_FEATURE && !draft.partTemplateFields.includes(PART_FIELD_SPINDLE_AXIS)) {
    return false;
  }
  if (field === GROUP_FIELD_GENERAL_AXIS_FEATURE && !draft.partTemplateFields.includes(PART_FIELD_AXIS)) {
    return false;
  }
  if (!draft.groupTemplateFields.includes(field)) draft.groupTemplateFields.push(field);
  updateGroupFieldSyncAdd(draft.groups, field);
  return true;
}

export function removeGroupTemplateField(draft, field) {
  if (!field) return false;
  draft.groupTemplateFields = draft.groupTemplateFields.filter((x) => x !== field);
  updateGroupFieldSyncDelete(draft.groups, field);
  return true;
}

export function togglePartField(draft, field, enabled) {
  if (!field) return false;
  if (enabled) {
    return addPartTemplateField(draft, field);
  }
  return removePartTemplateField(draft, field);
}

export function syncGroupTemplateByPartSelection(draft) {
  if (!draft || !Array.isArray(draft.partTemplateFields) || !Array.isArray(draft.groupTemplateFields)) return;
  const hasSpindleAxis = draft.partTemplateFields.includes(PART_FIELD_SPINDLE_AXIS);
  const hasSpindleFeature = draft.groupTemplateFields.includes(GROUP_FIELD_SPINDLE_FEATURE);
  if (hasSpindleAxis && !hasSpindleFeature) {
    draft.groupTemplateFields.push(GROUP_FIELD_SPINDLE_FEATURE);
    updateGroupFieldSyncAdd(draft.groups, GROUP_FIELD_SPINDLE_FEATURE);
  }
  if (!hasSpindleAxis && hasSpindleFeature) {
    draft.groupTemplateFields = draft.groupTemplateFields.filter((x) => x !== GROUP_FIELD_SPINDLE_FEATURE);
    updateGroupFieldSyncDelete(draft.groups, GROUP_FIELD_SPINDLE_FEATURE);
  }

  const hasAxis = draft.partTemplateFields.includes(PART_FIELD_AXIS);
  const hasGeneralAxisFeature = draft.groupTemplateFields.includes(GROUP_FIELD_GENERAL_AXIS_FEATURE);
  if (hasAxis && !hasGeneralAxisFeature) {
    draft.groupTemplateFields.push(GROUP_FIELD_GENERAL_AXIS_FEATURE);
    updateGroupFieldSyncAdd(draft.groups, GROUP_FIELD_GENERAL_AXIS_FEATURE);
  }
  if (!hasAxis && hasGeneralAxisFeature) {
    draft.groupTemplateFields = draft.groupTemplateFields.filter((x) => x !== GROUP_FIELD_GENERAL_AXIS_FEATURE);
    updateGroupFieldSyncDelete(draft.groups, GROUP_FIELD_GENERAL_AXIS_FEATURE);
  }
}
