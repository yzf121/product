# AI 助手平台（SAP CAP + UI5 + DashScope）

> 版本：`v1.4.3`  
> 项目 ID：`abap-clean-core-ai-fiori-new`

这是一个面向 SAP 开发场景的多助手 AI 平台，后端基于 CAP/Express 提供统一流式网关，前端基于 UI5 提供多助手聊天与流程图能力。

## 核心能力

- 多助手路由：`abap-clean-core`、`cpi`、`func-doc`、`fsd2tsd-i`、`fsd2tsd-e`、`tech-doc`、`code-review`、`unit-test`、`diagram`
- 流式对话：后端通过 `POST /api/chat/stream` 转发 DashScope SSE
- 会话策略：优先 `sessionId`，超过轮次/时效自动降级 `messages`
- 本地文件解析：在浏览器端解析后拼接上下文，不走后端上传
- Diagram Helper：AI 生成 Mermaid，支持二次编辑、导出 PNG/SVG、Draw.io 打开
- 本地历史：按 AI 类型管理对话并持久化到 `localStorage`

## 架构概览

```text
UI5 前端 (app/ai-chat-gui)
   -> /api/chat/stream
CAP 自定义服务 (srv/server.js)
   -> DashScope Apps API
```

部署到 BTP 后，前端由 HTML5 Repo 托管，鉴权由 XSUAA 与 Destination 处理。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 `.env`

最少需要：

```bash
DASHSCOPE_API_KEY=sk-xxxx
DASHSCOPE_APP_ID=xxxx
```

建议先复制模板文件：

```bash
cp .env.example .env
```

按助手细分（可选）：

```bash
DASHSCOPE_APP_ID_ABAP=xxxx
DASHSCOPE_APP_ID_CPI=xxxx
DASHSCOPE_APP_ID_FUNC_DOC=xxxx
DASHSCOPE_APP_ID_FSD2TSD_I=xxxx
DASHSCOPE_API_KEY_FSD2TSD_I=sk-xxxx
DASHSCOPE_APP_ID_FSD2TSD_E=xxxx
DASHSCOPE_API_KEY_FSD2TSD_E=sk-xxxx
DASHSCOPE_APP_ID_TECH_DOC=xxxx
DASHSCOPE_APP_ID_CODE_REVIEW=xxxx
DASHSCOPE_APP_ID_UNIT_TEST=xxxx
DASHSCOPE_APP_ID_DIAGRAM=xxxx
```

### 3. 启动开发环境

```bash
npm run dev
```

默认入口：`http://localhost:4004/ai-chat-gui/webapp/index.html`  
若 `4004` 被占用，服务会自动尝试 `4005` 起的可用端口。

## 文件解析说明（当前实现）

前端可选扩展名与已实现本地解析能力保持一致：`txt/md/json/csv/xml/pdf/docx/xlsx/xls`。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 本地开发（cds watch） |
| `npm run start` | 生产方式启动 CAP 服务 |
| `npm run doctor` | 检查本机 Node/mbt/make 工具链是否满足构建条件 |
| `npm run lint` | 仅检查项目源码（排除三方压缩库与构建产物） |
| `npm run verify` | 一键执行 lint + 语法检查 + CDS 编译 + UI5 构建 |
| `npm run build:mta` | 仅执行 MTAR 构建（包含 mbt 二进制自愈） |
| `npm run build` | 生成 `mta_archives/archive.mtar` |
| `npm run deploy` | 部署 MTAR 到 Cloud Foundry |
| `npm run undeploy` | 卸载应用及关联服务 |

## 项目结构

```text
app/ai-chat-gui/    UI5 前端应用
srv/                CAP 服务与流式网关
db/                 CDS schema（当前无业务持久化表）
docs/               项目文档
mta.yaml            BTP 部署描述
xs-security.json    XSUAA 安全模型
```

## 文档索引

- [项目技术文档](./docs/项目技术文档.md)
- [API 接口文档](./docs/API接口文档.md)
- [部署指南](./docs/部署指南.md)
- [成本与路线图](./docs/成本与路线图.md)

## 许可

仅用于内部项目与受控环境。
