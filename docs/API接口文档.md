# 前端 AI 调用文档
> 更新日期：`2026-03-06`

当前版本不再提供项目自建后端 API。所有 AI 能力由前端直接调用 DashScope Apps API，并在浏览器内处理 SSE。

## 1. 配置对象

前端读取全局对象：

```js
window.__AI_CHAT_CONFIG__
```

支持字段：

```js
{
  endpoint: "https://dashscope.aliyuncs.com/api/v1",
  timeoutMs: 60000,
  defaultAppId: "",
  defaultApiKey: "",
  appIds: {
    "abap-clean-core": "",
    "cpi": "",
    "func-doc": "",
    "fsd2tsd-i": "",
    "fsd2tsd-e": "",
    "tech-doc": "",
    "code-review": "",
    "unit-test": "",
    "diagram": ""
  },
  apiKeys: {
    "abap-clean-core": "",
    "cpi": "",
    "func-doc": "",
    "fsd2tsd-i": "",
    "fsd2tsd-e": "",
    "tech-doc": "",
    "code-review": "",
    "unit-test": "",
    "diagram": ""
  }
}
```

优先级：

1. `config/ai-config.js`
2. 浏览器本地覆盖配置（首页“设置”写入）

## 2. 前端请求策略

前端模块：`webapp/service/DashScopeClient.js`

请求地址：

```text
{endpoint}/apps/{appId}/completion
```

请求头：

```http
Authorization: Bearer <apiKey>
Content-Type: application/json
X-DashScope-SSE: enable
```

## 3. 请求体组装规则

### 3.1 `session_id` 模式

当会话已持有 `sessionId` 时：

```json
{
  "input": {
    "prompt": "用户问题",
    "session_id": "session-id"
  },
  "parameters": {
    "incremental_output": true
  }
}
```

### 3.2 `messages` 回退模式

当 `sessionId` 不可用，但存在历史消息时：

```json
{
  "input": {
    "prompt": "用户问题",
    "messages": [
      { "role": "user", "content": "..." },
      { "role": "assistant", "content": "..." }
    ]
  },
  "parameters": {
    "incremental_output": true
  }
}
```

### 3.3 新会话模式

```json
{
  "input": {
    "prompt": "用户问题"
  },
  "parameters": {
    "incremental_output": true
  }
}
```

## 4. 助手配置映射

| `aiType` | App ID 来源 | API Key 来源 |
| --- | --- | --- |
| `abap-clean-core` | `appIds["abap-clean-core"]` 或 `defaultAppId` | `apiKeys["abap-clean-core"]` 或 `defaultApiKey` |
| `cpi` | `appIds["cpi"]` 或 `defaultAppId` | `apiKeys["cpi"]` 或 `defaultApiKey` |
| `func-doc` | `appIds["func-doc"]` 或 `defaultAppId` | `apiKeys["func-doc"]` 或 `defaultApiKey` |
| `fsd2tsd-i` | `appIds["fsd2tsd-i"]` 或 `defaultAppId` | `apiKeys["fsd2tsd-i"]` 或 `defaultApiKey` |
| `fsd2tsd-e` | `appIds["fsd2tsd-e"]` 或 `defaultAppId` | `apiKeys["fsd2tsd-e"]` 或 `defaultApiKey` |
| `tech-doc` | `appIds["tech-doc"]` 或 `defaultAppId` | `apiKeys["tech-doc"]` 或 `defaultApiKey` |
| `code-review` | `appIds["code-review"]` 或 `defaultAppId` | `apiKeys["code-review"]` 或 `defaultApiKey` |
| `unit-test` | `appIds["unit-test"]` 或 `defaultAppId` | `apiKeys["unit-test"]` 或 `defaultApiKey` |
| `diagram` | `appIds["diagram"]` 或 `defaultAppId` | `apiKeys["diagram"]` 或 `defaultApiKey` |

## 5. SSE 处理

前端会：

- 直接读取 DashScope SSE `ReadableStream`
- 按事件块解析 `data: ...`
- 提取 `output.text`
- 记录 `output.session_id`
- 将上游错误转换为前端可读消息

## 6. 约束与保护

当前前端实现包含以下保护：

- 单条消息最大长度：`120000`
- 历史消息最多保留：`20`
- `sessionId` 最大长度：`256`
- 请求超时默认：`60000ms`
- 仅接受 `user` / `assistant` 两种历史角色

## 7. 说明

- 不再存在 `/api/chat/stream`
- 不再存在 `sendMessage` 后备 action
- 不再需要 `.env` 或 `cf set-env` 配置 AI 参数
