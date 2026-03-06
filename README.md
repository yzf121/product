# AI 助手平台（Pure Frontend UI5 + DashScope）

> 版本：`v1.4.3`  
> 项目 ID：`abap-clean-core-ai-fiori-new`

这是一个面向 SAP 开发场景的多助手 AI 平台，现已重构为纯前端 UI5 应用。聊天、多助手切换、会话历史、附件本地解析、Diagram Helper、Draw.io 二次编辑等能力全部保留，AI 请求由浏览器直接发往 DashScope，不再依赖自建后端服务。

## 核心能力

- 多助手路由：`abap-clean-core`、`cpi`、`func-doc`、`fsd2tsd-i`、`fsd2tsd-e`、`tech-doc`、`code-review`、`unit-test`、`diagram`
- 流式对话：浏览器直接调用 DashScope Apps SSE
- 会话策略：优先复用 `sessionId`，到期后自动降级到 `messages`
- 本地文件解析：附件在浏览器端解析后拼接上下文，不上传后端
- Diagram Helper：AI 生成 Mermaid，支持修复、缩放、导出 PNG/SVG、在 Draw.io 打开
- 本地历史：按 AI 类型持久化到 `localStorage`
- 运行时配置：支持 `config/ai-config.js` 外部化，也支持浏览器本地覆盖配置

## 架构概览

```text
UI5 Frontend (HTML5 Repo / Work Zone)
   -> config/ai-config.js 或浏览器本地设置
   -> DashScope Apps API (SSE)
```

部署到 BTP 后，应用由 HTML5 Repo 托管，通过 Work Zone 暴露；访问控制仍可使用 XSUAA，但不再需要 Node.js/CAP 后端模块。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 DashScope

推荐方式一：编辑 `app/ai-chat-gui/webapp/config/ai-config.js`

参考模板：`app/ai-chat-gui/webapp/config/ai-config.template.js`

最小配置示例：

```js
window.__AI_CHAT_CONFIG__ = {
  endpoint: "https://dashscope.aliyuncs.com/api/v1",
  timeoutMs: 60000,
  defaultAppId: "your-default-app-id",
  defaultApiKey: "your-default-api-key",
  appIds: {
    "diagram": "your-diagram-app-id"
  },
  apiKeys: {
    "fsd2tsd-i": "your-fsd2tsd-i-api-key"
  }
};
```

推荐方式二：启动应用后点击首页右上角“设置”，将配置保存到浏览器本地覆盖层。

## 本地运行

```bash
npm run dev
```

默认入口：

```text
http://localhost:8080/index.html
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 本地启动 UI5 预览服务 |
| `npm run lint` | 检查前端源码与脚本 |
| `npm run verify` | 执行 lint + 语法检查 + UI5 构建 |
| `npm run build:mta` | 构建 MTAR |
| `npm run build` | 生成 `mta_archives/archive.mtar` |
| `npm run deploy` | 部署 MTAR 到 Cloud Foundry |
| `npm run undeploy` | 卸载应用及关联服务 |

## 项目结构

```text
app/ai-chat-gui/    UI5 前端应用
docs/               项目文档
scripts/            校验与构建脚本
mta.yaml            BTP 部署描述（纯 HTML5）
xs-security.json    XSUAA 安全模型
```

## 文档索引

- [项目技术文档](./docs/项目技术文档.md)
- [前端 AI 调用文档](./docs/API接口文档.md)
- [部署指南](./docs/部署指南.md)
- [成本与路线图](./docs/成本与路线图.md)

## 许可

仅用于内部项目与受控环境。
