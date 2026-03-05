# ai-chat-gui（UI5 前端模块）

本模块是项目的 UI5 Freestyle 前端，负责：

- 首页助手入口（Home）
- 多助手聊天界面（Main）
- Diagram Helper（Mermaid 生成/编辑/导出）
- 本地附件解析与对话上下文拼接

## 目录说明

```text
webapp/
  controller/      App/Home/Main/Diagram 控制器
  view/            XML 视图
  i18n/            多语言资源
  lib/             本地第三方库（marked/highlight/mermaid）
  util/Utils.js    通用工具（SSE 解析、复制、转义）
xs-app.json        HTML5 Runtime 路由规则
ui5.yaml           本地预览配置
ui5-deploy.yaml    Cloud Foundry 构建打包配置
```

## 本地开发

在仓库根目录执行：

```bash
npm run dev
```

直接执行前端构建：

```bash
cd app/ai-chat-gui
npm install
npm run build
```

## 前端路由

- `""` -> `Home.view.xml`
- `"chat/{aiType}"` -> `Main.view.xml`
- `"diagram"` -> `Diagram.view.xml`

## 与后端交互

- 主要接口：`POST /api/chat/stream`（SSE）
- 备用接口：`POST /api/chat/sendMessage`
- `aiType` 决定后端选择的 DashScope App ID / Key

## 附件解析能力（当前）

已实现解析：`txt/md/json/csv/xml/pdf/docx/xlsx/xls`。  
扩展名虽允许选择但暂未实现解析：`doc/ppt/pptx`。

## 部署相关

- `ui5-deploy.yaml` 使用 `ui5-task-zipper` 产出 `comaiassistantaichatapp.zip`
- `xs-app.json` 约定 `/api/*` 转发到 destination `srv-api`
- 其余静态资源由 `html5-apps-repo-rt` 提供
