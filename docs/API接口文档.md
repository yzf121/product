# API 接口文档

> 版本：`v1.4.3`  
> 更新日期：`2026-03-05`  
> 基础路径：`/api`

本文档以当前代码实现为准（`srv/server.js` + `srv/chat-service.cds/js`）。

## 接口一览

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/chat/stream` | `POST` | 主接口，SSE 流式返回 |
| `/api/chat/sendMessage` | `POST` | 备用非流式接口（CDS Action） |

## 1. `POST /api/chat/stream`

### 1.1 请求头

- `Content-Type: application/json`

### 1.2 请求体

```ts
interface ChatStreamRequest {
  message: string; // 必填
  aiType?:
    | "abap-clean-core"
    | "cpi"
    | "func-doc"
    | "fsd2tsd-i"
    | "fsd2tsd-e"
    | "tech-doc"
    | "code-review"
    | "unit-test"
    | "diagram";
  sessionId?: string;
  sessionInfo?: {
    createdAt: string;   // ISO 8601
    roundCount: number;
  };
  messages?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}
```

### 1.3 行为说明

- `message` 为空时：返回 `400` JSON 错误。
- `message` 超过 `120000` 字符时：返回 `413` JSON 错误。
- 有 `sessionId` 时：后端优先走 `session_id` 模式。
- 无 `sessionId` 但有 `messages` 时：走降级历史消息模式。
- 都没有时：按新会话模式处理。
- `aiType` 未配置时：回退到默认 App ID（`DASHSCOPE_APP_ID`）。

### 1.4 `aiType` 与配置映射

| aiType | App ID 环境变量 | 专用 API Key |
| --- | --- | --- |
| `abap-clean-core` | `DASHSCOPE_APP_ID_ABAP`（或默认） | 无 |
| `cpi` | `DASHSCOPE_APP_ID_CPI` | 无 |
| `func-doc` | `DASHSCOPE_APP_ID_FUNC_DOC` | 无 |
| `fsd2tsd-i` | `DASHSCOPE_APP_ID_FSD2TSD_I` | `DASHSCOPE_API_KEY_FSD2TSD_I` |
| `fsd2tsd-e` | `DASHSCOPE_APP_ID_FSD2TSD_E` | `DASHSCOPE_API_KEY_FSD2TSD_E` |
| `tech-doc` | `DASHSCOPE_APP_ID_TECH_DOC` | 无 |
| `code-review` | `DASHSCOPE_APP_ID_CODE_REVIEW` | 无 |
| `unit-test` | `DASHSCOPE_APP_ID_UNIT_TEST` | 无 |
| `diagram` | `DASHSCOPE_APP_ID_DIAGRAM` | 无 |

### 1.5 响应格式（SSE）

响应头：

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`
- `Access-Control-Allow-Origin: *`

数据帧：

```text
data: {"text":"...","sessionId":"..."}

data: {"error":"..."}

data: [DONE]
```

说明：

- `text`：增量文本片段。
- `sessionId`：首次从上游返回后，前端可持久化并复用。
- `[DONE]`：结束标记。

### 1.6 状态码

| 状态码 | 场景 |
| --- | --- |
| `200` | 正常 SSE 返回（含业务错误事件） |
| `400` | `message` 为空、JSON 语法错误 |
| `413` | 请求体超过限制（默认 `20mb`）或 `message` 超过 `120000` 字符 |
| `500` | 中间件或服务端异常 |

## 2. `POST /api/chat/sendMessage`（备用）

CDS Action，非流式。

请求示例：

```json
{
  "message": "你好",
  "sessionId": "optional-session-id"
}
```

响应示例：

```json
{
  "value": "AI 返回文本"
}
```

## 3. CORS 与预检

后端显式处理了：

- `OPTIONS /api/chat/stream`
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

## 4. 前端调用示例（浏览器）

```javascript
async function callStream(message, aiType, sessionId) {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, aiType, sessionId })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      const data = JSON.parse(payload);
      if (data.text) {
        // 渲染增量文本
      }
      if (data.error) {
        // 处理错误
      }
    }
  }
}
```

## 5. 认证说明

- 本地开发：默认无 XSUAA 强制鉴权。
- Cloud Foundry 部署：通过 `xs-app.json` + destination `srv-api` 使用 `xsuaa` 鉴权。
