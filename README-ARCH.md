# 前端架构说明（模块化）

## 1. 目标
当前项目已从单文件脚本重构为模块化前端，结构对齐 `/Users/zhaoyongwei/AI访谈式应用` 的可维护模式。

## 2. 模块目录
- `public/js/main.js`：最薄入口
- `public/js/app-controller.js`：应用启动编排
- `public/js/ui.js`：页面级编排（绑定模块、组织渲染）
- `public/js/store.js`：状态与基础数据操作
- `public/js/services.js`：后端 API 调用封装
- `public/js/ai-service.js`：大模型设置加载/保存/测试
- `public/js/chat-engine.js`：对话处理与 XML 刷新流程
- `public/js/chat-view.js`：聊天区渲染与输入控制
- `public/js/tree-view.js`：分组树渲染与拖拽事件出口
- `public/js/panel-view.js`：右侧参数卡片渲染
- `public/js/settings-controller.js`：设置弹窗控制器
- `public/js/mode-controller.js`：初始态/工作态切换控制器
- `public/js/commands.js`：树与参数的命令式变更

## 3. 启动流程
1. `main.js` 调用 `bootstrapApp()`
2. `app-controller.js` 调用 `initApp()`
3. `ui.js` 完成：
   - 拉取初始化数据 `/api/init`
   - 装配 controllers / view / engine
   - 绑定事件
   - 刷新初始 XML

## 4. 数据流
1. 用户输入 -> `chat-view` -> `ui.sendChat()`
2. `ui` 调用 `chat-engine.processUserInput()`
3. `chat-engine` 调用 `services.apiChat()`
4. 返回 `draft + xml + reply` -> `store.state` 更新 -> `view` 重渲染

## 5. 设置流
1. 用户点“设置” -> `settings-controller.open()`
2. 保存 -> `ai-service.save()` -> `services /api/settings`
3. 测试连接 -> `ai-service.test()` -> `services /api/settings/test`

## 6. 视图渲染职责
- `tree-view`：只渲染树，不改业务状态
- `panel-view`：只渲染卡片，不改业务状态
- 业务状态变更统一走 `commands.js`

## 7. 命令层职责
`commands.js` 统一封装：
- 分组树增删改拖拽
- Part/Group 参数赋值
- 模板字段增删及联动同步

## 8. 后续建议
1. 新增 `llm-adapter.js`：统一多模型调用策略（Gemini / OpenAI兼容）
2. 新增 `validation-service.js`：集中管理保存前校验
3. 新增 `snapshot-service.js`：支持撤销/重做
