# TemplateCogniz

根据抽象输入自动生成分组模板。

## 启动

```bash
npm start
```

默认地址：`http://127.0.0.1:3000`

## 配置

项目会读取本地 `settings.json`。该文件用于保存 API Key，已被 `.gitignore` 排除，不会提交到仓库。

首次配置可参考 `settings.example.json` 创建本地 `settings.json`。

## 主要能力

- 左侧自然语言对话生成模板草稿
- 右侧分组树预览（新增/删除/拖拽）
- 零件级参数卡片与分组级参数卡片可编辑
- `Part_Template` / `Group_Template` 可编辑，支持实例同步增删参数
- XML 实时预览
- 保存前基础校验（必须包含 `Part_Template` / `Group_Template` / `Part`）
- 点击保存后输出：`分组模板/分组模板_<时间戳>.xml`

## 对话示例

- `先创建A侧和B侧，在A侧添加外圆和端面2个子分组，B侧也一样`
- `在A侧添加复杂面子分组`
- 当系统追问特征时：`平面 通槽`

## 接口

- `GET /api/init` 初始化页面数据
- `POST /api/chat` 输入自然语言并返回更新后的草稿和 XML
- `POST /api/save` 保存 XML 草稿文件

## 说明

当前是零依赖 Node + 原生前端实现，便于快速验证 PRD 交互流程。
