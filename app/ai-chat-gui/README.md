# UI5 Frontend Module

该模块是纯前端 UI5 应用，不再依赖 CAP/Express 后端。

## 运行

```bash
npm install
npm run start
```

默认入口：

```text
http://localhost:8080/index.html
```

## 关键文件

```text
webapp/index.html                 应用入口
webapp/config/ai-config.js        运行时配置
webapp/config/ai-config.template.js 配置模板
webapp/service/AIConfig.js        配置合并与本地覆盖逻辑
webapp/service/DashScopeClient.js 前端 DashScope 流式客户端
ui5.yaml                          本地预览配置
ui5-deploy.yaml                   HTML5 Repo 构建打包配置
xs-app.json                       Work Zone / HTML5 Repo 路由
```

## 运行时配置

优先级从低到高：

1. `webapp/config/ai-config.js`
2. 首页“设置”中保存到浏览器 `localStorage` 的覆盖配置

应用会直接从浏览器发起 DashScope SSE 请求，因此无需 `/api/chat/stream` 代理。
