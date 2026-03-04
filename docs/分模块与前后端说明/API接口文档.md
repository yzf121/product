# API 接口文档

> **版本**: v1.4.3  
> **基础路径**: `/api`  
> **协议**: HTTP/HTTPS

---

## 📋 接口概览

| 端点 | 方法 | 描述 |
|-----|------|------|
| `/api/chat/stream` | POST | 流式聊天（主要接口） |
| `/api/chat/sendMessage` | POST | 非流式聊天（备用） |

> **提示**: 在 V1.4.3 版本之后，文件解析功能已全部移至前端浏览器本地进行，因此原有的 `/api/files/session` 和 `/api/files/session/:fileId/status` 后端上传与状态轮询接口已被安全移除。

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
    /**
     * 用户消息内容 (若有本地解析的文件内容，会一并追加于此)
     * @required
     */
    message: string;
    
    /**
     * AI 助手类型（可选，未传时默认使用 abap-clean-core）
     * @optional
     * @enum abap-clean-core, cpi, func-doc, tech-doc,
     *       code-review, unit-test, diagram
     */
    aiType?: string;
    
    /**
     * 百炼 session_id
     * 首次对话时不传，后续对话传入上次返回的 sessionId
     * @optional
     */
    sessionId?: string;
    
    /**
     * 历史消息列表
     * 当 session_id 失效时使用此参数降级
     * @optional
     */
    messages?: Message[];
    
    /**
     * 会话信息
     * 用于判断是否使用 session_id 模式
     * @optional
     */
    sessionInfo?: SessionInfo;
}

interface Message {
    role: "user" | "assistant";
    content: string;
}

interface SessionInfo {
    /** 会话创建时间 (ISO 8601) */
    createdAt: string;
    /** 当前轮次 */
    roundCount: number;
}
```

### 请求示例

#### 新对话（无 session_id）

```bash
POST /api/chat/stream
Content-Type: application/json

{
    "message": "请帮我分析这段 ABAP 代码是否符合 Clean Core 规范",
    "aiType": "abap-clean-core"
}
```

#### 继续对话（带 session_id）

```bash
POST /api/chat/stream
Content-Type: application/json

{
    "message": "能否给出更具体的重构建议？",
    "aiType": "abap-clean-core",
    "sessionId": "session_abc123def456",
    "sessionInfo": {
        "createdAt": "2025-01-08T10:00:00Z",
        "roundCount": 5
    }
}
```

#### 降级模式（带 messages）

```bash
POST /api/chat/stream
Content-Type: application/json

{
    "message": "继续上述话题",
    "aiType": "abap-clean-core",
    "messages": [
        {"role": "user", "content": "请帮我分析代码"},
        {"role": "assistant", "content": "好的，我来帮你分析..."},
        {"role": "user", "content": "有什么改进建议吗？"},
        {"role": "assistant", "content": "建议如下..."}
    ],
    "sessionInfo": {
        "createdAt": "2025-01-08T08:00:00Z",
        "roundCount": 55
    }
}
```

### 响应格式

SSE (Server-Sent Events) 格式：

```
data: {"text": "我来帮你分析", "sessionId": "session_abc123"}

data: {"text": "这段代码", "sessionId": "session_abc123"}

data: {"text": "首先，", "sessionId": "session_abc123"}

data: [DONE]
```

### 响应字段

```typescript
interface ChatStreamResponse {
    /** AI 响应的文本片段（增量输出） */
    text: string;
    
    /** 百炼 session_id，用于后续对话 */
    sessionId?: string;
}

interface ChatStreamError {
    /** 错误信息 */
    error: string;
}
```

### 错误响应示例

```
data: {"error": "AI服务配置不完整，请联系管理员"}
```

```
data: {"error": "AI服务响应超时，请稍后重试"}
```

```
data: {"error": "消息内容不能为空"}
```

### aiType 枚举值

| 值 | 描述 | 对应环境变量 | 回退逻辑 |
|----|------|-------------|---------|
| `abap-clean-core` | ABAP Clean Core 重构助手 | `DASHSCOPE_APP_ID_ABAP` | 未配置时回退到 `DASHSCOPE_APP_ID` |
| `cpi` | SAP CPI 集成助手 | `DASHSCOPE_APP_ID_CPI` | 未配置时回退到默认应用 ID |
| `func-doc` | 功能文档生成助手 | `DASHSCOPE_APP_ID_FUNC_DOC` | 未配置时回退到默认应用 ID |
| `tech-doc` | 技术文档生成助手 | `DASHSCOPE_APP_ID_TECH_DOC` | 未配置时回退到默认应用 ID |
| `code-review` | 代码审查助手 | `DASHSCOPE_APP_ID_CODE_REVIEW` | 未配置时回退到默认应用 ID |
| `unit-test` | 单元测试生成助手 | `DASHSCOPE_APP_ID_UNIT_TEST` | 未配置时回退到默认应用 ID |
| `diagram` | 流程图生成助手 | `DASHSCOPE_APP_ID_DIAGRAM` | 未配置时回退到默认应用 ID |

> **默认值**: 未传 `aiType` 时默认使用 `abap-clean-core`。
> **回退机制**: 当指定的 `aiType` 对应的环境变量未配置时，系统会回退到 `DEFAULT_APP_ID`（即 `DASHSCOPE_APP_ID` 或 `DASHSCOPE_APP_ID_ABAP`）。

---

## 2. 非流式聊天接口（备用）

### 基本信息

| 属性 | 值 |
|-----|-----|
| **端点** | `POST /api/chat/sendMessage` |
| **协议** | HTTP |
| **Content-Type** | `application/json` |

> ⚠️ **注意**: 此接口为备用接口，一般使用流式接口 `/api/chat/stream`

### 请求参数

| 参数名 | 类型 | 必需 | 描述 |
|-------|------|-----|------|
| `message` | string | 是 | 消息内容 |
| `sessionId` | string | 否 | 会话 ID |

### 请求示例

```bash
POST /api/chat/sendMessage
Content-Type: application/json

{
    "message": "你好",
    "sessionId": "session_abc123"
}
```

### 响应格式

```json
{
    "value": "你好！我是 AI 助手，有什么可以帮你的吗？"
}
```

---

## 3. CORS 配置

当前仅对以下端点显式处理预检：
- `/api/chat/stream`: `POST, OPTIONS`

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: <按端点>
Access-Control-Allow-Headers: Content-Type
```

### 预检请求

```bash
OPTIONS /api/chat/stream
# 返回 200 OK
```

---

## 4. 错误处理

### 通用错误响应

```typescript
interface ErrorResponse {
    error: string;
    code?: string;
}
```

### HTTP 状态码

| 状态码 | 描述 |
|-------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权（生产环境） |
| 500 | 服务器内部错误 |

---

## 5. 使用示例

### JavaScript (浏览器)

```javascript
// 流式聊天
async function streamChat(message, aiType, sessionId) {
    const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message,
            aiType,
            sessionId
        })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let newSessionId = sessionId;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data:')) {
                const jsonStr = line.slice(5).trim();
                if (jsonStr === '[DONE]') continue;
                
                try {
                    const data = JSON.parse(jsonStr);
                    if (data.text) {
                        fullText += data.text;
                        console.log('收到:', data.text);
                    }
                    if (data.sessionId) {
                        newSessionId = data.sessionId;
                    }
                } catch (e) {
                    // 忽略解析错误
                }
            }
        }
    }

    return { text: fullText, sessionId: newSessionId };
}

// 使用示例
streamChat('你好', 'abap-clean-core')
    .then(result => {
        console.log('完整回复:', result.text);
        console.log('Session ID:', result.sessionId);
    });
```

### cURL 示例

```bash
# 流式聊天
curl -X POST http://localhost:4004/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "你好", "aiType": "abap-clean-core"}'
```

---

## 6. 速率限制

当前版本暂无速率限制。

如需实现，建议在生产环境中添加：
- API 网关层限流
- 用户级别配额
- 并发请求限制

---

## 7. 版本历史

| 版本 | 日期 | 变更 |
|-----|------|------|
| v1.4.3 | 2025-01-23 | 前置所有文件解析操作至前端，移除 `api/files/session` 等后端服务 |
| v1.4.0 | 2025-01 | 添加流程图生成支持 |
| v1.3.0 | 2024-12 | 添加会话管理策略 |
| v1.0.0 | 2024-12 | 初始版本 |
