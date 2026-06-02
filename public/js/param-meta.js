export const PART_FIELD_META = {
  原点: { type: 'String', defaultval: '', data_type: 'point', respath: 'cad' },
  主方向: { type: 'String', defaultval: '', data_type: 'direction', respath: 'cad' },
  主方向1: { type: 'String', defaultval: '', data_type: 'direction', respath: 'cad' },
  主方向2: { type: 'String', defaultval: '', data_type: 'direction', respath: 'cad' },
  主方向3: { type: 'String', defaultval: '', data_type: 'direction', respath: 'cad' },
  主方向4: { type: 'String', defaultval: '', data_type: 'direction', respath: 'cad' },
  主方向5: { type: 'String', defaultval: '', data_type: 'direction', respath: 'cad' },
  主方向6: { type: 'String', defaultval: '', data_type: 'direction', respath: 'cad' },
  有主轴线: { type: 'Multi', defaultval: '是|是;不是;否', data_type: '', respath: '' },
  有轴线: { type: 'Multi', defaultval: '是|是;不是', data_type: '', respath: '' },
  是否需要加工面分离: { type: 'Multi', defaultval: '是|是;否', data_type: '', respath: '' },
  是否自动按坐标轴方向加工面积多少选择主方向: { type: 'Multi', defaultval: '是|是;否', data_type: '', respath: '' },
  需要判断外圆车削加工方向: { type: 'Multi', defaultval: '是|是;不是', data_type: '', respath: '' },
  需要判断多外圆车削加工方向: { type: 'Multi', defaultval: '是|是;不是', data_type: '', respath: '' }
};

export const GROUP_FIELD_META = {
  依赖方向: { type: 'Multi', defaultval: '任意方向|任意方向;从父;主方向1;主方向2;主方向3;主方向4;主方向5;主方向6;外圆加工方向;多外圆加工方向;六面方向;无可行方向;无可行加工方向;未配置', data_type: '', respath: '' },
  依赖方式: { type: 'Multi', defaultval: '无|无;相同;相反;平行;平行且在同侧;平行且在反侧;垂直;不平行;接近;接近反向;与坐标轴方向不平行;相同或接近;相反或接近反向', data_type: '', respath: '' },
  特征选择: { type: 'String', defaultval: '', data_type: '', respath: 'kmfeatype' },
  主轴线上特征: { type: 'Multi', defaultval: '无关|无关;是;不是', data_type: '', respath: '' },
  一般轴线上特征: { type: 'Multi', defaultval: '无关|无关;是;不是', data_type: '', respath: '' },
  是否按用户规则排工序: { type: 'Multi', defaultval: '否|是;否', data_type: '', respath: '' }
};

export const PART_FIELD_DESC = {
  原点: '零件坐标系原点，定义加工基准点',
  主方向: '主加工方向基准向量',
  主方向1: '主加工方向1',
  主方向2: '主加工方向2',
  主方向3: '主加工方向3',
  主方向4: '主加工方向4',
  主方向5: '主加工方向5',
  主方向6: '主加工方向6',
  有主轴线: '回转体主轴线存在性判断',
  有轴线: '零件轴线存在性判断',
  是否需要加工面分离: '复杂面是否预先分离处理',
  是否自动按坐标轴方向加工面积多少选择主方向: '按面积自动计算主方向',
  需要判断外圆车削加工方向: '启用外圆车削方向判定',
  需要判断多外圆车削加工方向: '启用多外圆车削方向判定'
};

export const GROUP_FIELD_DESC = {
  名称: '分组节点名称',
  依赖方向: '分组方向锚点，可引用主方向或车削方向',
  依赖方式: '与依赖方向的几何关系约束',
  特征选择: '限定本组包含的特征类型（可多选）',
  主轴线上特征: '特征是否位于主轴线上',
  一般轴线上特征: '特征是否位于一般轴线上',
  是否按用户规则排工序: '是否按用户规则参与工序排序'
};

export function fieldMeta(scope, name) {
  const map = scope === 'part' ? PART_FIELD_META : GROUP_FIELD_META;
  return map[name] || { type: 'String', defaultval: '', data_type: '', respath: '' };
}

export function fieldDesc(scope, name) {
  const map = scope === 'part' ? PART_FIELD_DESC : GROUP_FIELD_DESC;
  return map[name] || '';
}

export function parseMultiOptions(defaultval) {
  if (!defaultval) return [];
  const parts = defaultval.split('|');
  if (parts.length < 2) return [];
  const out = [];
  for (const v of parts[1].split(';').map((s) => s.trim()).filter(Boolean)) {
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

export function defaultValueFromMeta(scope, name) {
  const meta = fieldMeta(scope, name);
  if (meta.type !== 'Multi') return '';
  const [selected] = (meta.defaultval || '').split('|');
  return selected || '';
}
