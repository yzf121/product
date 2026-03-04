# API 接口文档

> **版本**: v1.4.3  
> **更新日期**: 2026-03-04  
> **基础路径**: `/api`

---

## 接口概览

| 端点 | 方法 | 描述 |
|-----|------|------|
| `/api/chat/stream` | POST | 流式聊天（主要接口） |
| `/api/chat/sendMessage` | POST | 非流式聊天（CDS 备用） |

> 文件解析功能已全部移至前端浏览器本地进行，无后端文件接口。

---

## 1. 流式聊天接口

### 基本信息

| 属性 | 值 |
|-----|-----|
| **端点** | `POST /api/chat/stream` |
| **协议** | HTTP + Server-Sent Events (SSE) |
| **Content-Type (请求)** | `application/json` |
| **Content-Type (响应)** | `text/event-stream` |

### 请求参数

```typescript
interface ChatStreamRequest {
    /** 用户消息内容（若有本地解析的文件内容，前端会一并拼接于此） */
    message: string;         // 必需

    /** AI 助手类型（可选，默认 abap-clean-core） */
    aiType?: string;

    /** 百炼 session_id（首次对话不传，后续传入上次返回的 sessionId） */
    sessionId?: string;

    /** 历史消息列表（当 session_id 失效时用于降级） */
    messages?: { role: "user" | "assistant"; content: string }[];

    /** 会话信息（用于判断是否使用 session_id 模式） */
    sessionInfo?: {
        createdAt: string;   // ISO 8601
        roundCount: number;
    };
}
```

### 支持的 aiType 值

| aiType | 描述 | API Key |
|--------|------|---------|
| `abap-clean-core` | ABAP Clean Core 助手（默认） | 全局 |
| `cpi` | SAP CPI 集成助手 | 全局 |
| `func-doc` | 功能文档生成助手 | 全局 |
| `fsd2tsd-i` | FSD to TSD 助手 (I) | 支持专用 Key |
| `fsd2tsd-e` | FSD to TSD 助手 (E) | 支持专用 Key |
| `tech-doc` | 技术文档生成助手 | 全局 |
| `code-review` | 代码审查助手 | 全局 |
| `unit-test` | 单元测试生成助手 | 全局 |
| `diagram` | 流程图生成助手 | 全局 |

> 未传 `aiType` 时默认使用 `abap-clean-core`。未配置的 aiType 会回退到默认应用 ID。

### 请求示例

**新对话:**
```json
{
    "message": "请帮我分析这段 ABAP 代码",
    "aiType": "abap-clean-core"
}
```

**继续对话（带 session_id）:**
```json
{
    "message": "能否给出更具体的建议？",
    "aiType": "abap-clean-core",
    "sessionId": "session_abc123def456",
    "sessionInfo": {
        "createdAt": "2025-01-08T10:00:00Z",
        "roundCount": 5
    }
}
```

**降级模式（带 messages）:**
```json
{
    "message": "继续上述话题",
    "aiType": "abap-clean-core",
    "messages": [
        {"role": "user", "content": "请帮我分析代码"},
        {"role": "assistant", "content": "好的，我来帮你分析..."}
    ],
    "sessionInfo": {
        "createdAt": "2025-01-08T08:00:00Z",
        "roundCount": 55
    }
}
```

### 响应格式（SSE）

```
data: {"text": "我来帮你分析", "sessionId": "session_abc123"}

data: {"text": "这段代码", "sessionId": "session_abc123"}

data: [DONE]
```

### 错误响应

```
data: {"error": "AI服务配置不完整，请联系管理员"}
data: {"error": "AI服务响应超时，请稍后重试"}
data: {"error": "消息内容不能为空"}
```

### HTTP 状态码

| 状态码 | 描述 |
|-------|------|
| 200 | 成功（SSE 流） |
| 400 | 请求参数错误（如 message 为空） |
| 401 | 未授权（生产环境） |
| 500 | 服务器内部错误 |

---

## 2. 非流式聊天接口（备用）

| 属性 | 值 |
|-----|-----|
| **端点** | `POST /api/chat/sendMessage` |
| **Content-Type** | `application/json` |

> ⚠️ 此接口为 CDS 备用接口，一般使用流式接口。

**请求:**
```json
{ "message": "你好", "sessionId": "session_abc123" }
```

**响应:**
```json
{ "value": "你好！我是 AI 助手" }
```

---

## 3. CORS 配置

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

---

## 4. JavaScript 使用示例

```javascript
async function streamChat(message, aiType, sessionId) {
    const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, aiType, sessionId })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '', newSessionId = sessionId;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
            if (line.startsWith('data:')) {
                const jsonStr = line.slice(5).trim();
                if (jsonStr === '[DONE]') continue;
                try {
                    const data = JSON.parse(jsonStr);
                    if (data.text) fullText += data.text;
                    if (data.sessionId) newSessionId = data.sessionId;
                } catch (e) {}
            }
        }
    }
    return { text: fullText, sessionId: newSessionId };
}
```

---

*最后更新: 2026-03-04*
