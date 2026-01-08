# API 接口文档

> **版本**: v1.4.3  
> **基础路径**: `/api`  
> **协议**: HTTP/HTTPS

---

## 📋 接口概览

| 端点 | 方法 | 描述 |
|-----|------|------|
| `/api/chat/stream` | POST | 流式聊天（主要接口） |
| `/api/files/session` | POST | 上传会话文件 |
| `/api/files/session/:fileId/status` | GET | 查询文件状态 |
| `/api/chat/sendMessage` | POST | 非流式聊天（备用） |

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
     * 用户消息内容
     * @required
     */
    message: string;
    
    /**
     * AI 助手类型
     * @required
     * @enum abap-clean-core, cpi, func-doc, tech-doc, 
     *       code-review, unit-test, diagram
     */
    aiType: string;
    
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
    
    /**
     * 会话文件 ID 列表
     * 用于 RAG 检索
     * @optional
     */
    sessionFileIds?: string[];
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

#### 带文件的对话

```bash
POST /api/chat/stream
Content-Type: application/json

{
    "message": "请分析这份文档的内容",
    "aiType": "func-doc",
    "sessionFileIds": [
        "file_session_xyz789abc123"
    ]
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
event: message
data: {"text": "我来帮你分析", "sessionId": "session_abc123"}

event: message
data: {"text": "这段代码", "sessionId": "session_abc123"}

event: message
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

| 值 | 描述 | 对应环境变量 |
|----|------|-------------|
| `abap-clean-core` | ABAP Clean Core 重构助手 | `DASHSCOPE_APP_ID_ABAP` |
| `cpi` | SAP CPI 集成助手 | `DASHSCOPE_APP_ID_CPI` |
| `func-doc` | 功能文档生成助手 | `DASHSCOPE_APP_ID_FUNC_DOC` |
| `tech-doc` | 技术文档生成助手 | `DASHSCOPE_APP_ID_TECH_DOC` |
| `code-review` | 代码审查助手 | `DASHSCOPE_APP_ID_CODE_REVIEW` |
| `unit-test` | 单元测试生成助手 | `DASHSCOPE_APP_ID_UNIT_TEST` |
| `diagram` | 流程图生成助手 | `DASHSCOPE_APP_ID_DIAGRAM` |

---

## 2. 文件上传接口

### 基本信息

| 属性 | 值 |
|-----|-----|
| **端点** | `POST /api/files/session` |
| **协议** | HTTP |
| **Content-Type** | `multipart/form-data` |

### 请求参数

| 参数名 | 类型 | 必需 | 描述 |
|-------|------|-----|------|
| `file` | File | 是 | 要上传的文件 |

### 支持的文件类型

| 类型 | 扩展名 |
|-----|--------|
| PDF | `.pdf` |
| Word | `.doc`, `.docx` |
| Excel | `.xls`, `.xlsx` |
| PowerPoint | `.ppt`, `.pptx` |
| 文本 | `.txt`, `.md` |
| 数据 | `.json`, `.xml`, `.csv` |

### 文件限制

| 限制项 | 值 |
|-------|-----|
| 最大文件大小 | 50 MB |
| 单会话最大文件数 | 5 个 |
| 解析超时 | 120 秒 |

### 请求示例

```bash
POST /api/files/session
Content-Type: multipart/form-data

------WebKitFormBoundary
Content-Disposition: form-data; name="file"; filename="document.pdf"
Content-Type: application/pdf

<文件二进制内容>
------WebKitFormBoundary--
```

### 响应格式

#### 成功响应

```typescript
interface FileUploadSuccessResponse {
    /** 文件 ID (file_session_xxx) */
    fileId: string;
    
    /** 原始文件名 */
    fileName: string;
    
    /** 文件大小（字节） */
    size: number;
    
    /** 状态 */
    status: "UPLOADING";
    
    /** 提示信息 */
    message: string;
}
```

```json
{
    "fileId": "file_session_abc123def456",
    "fileName": "document.pdf",
    "size": 1024000,
    "status": "UPLOADING",
    "message": "文件已上传，正在解析中..."
}
```

#### 错误响应

```typescript
interface FileUploadErrorResponse {
    /** 错误信息 */
    error: string;
    
    /** 错误代码 */
    code: string;
}
```

### 错误代码

| 代码 | HTTP 状态 | 描述 |
|-----|----------|------|
| `CONFIG_ERROR` | 500 | 文件上传服务未配置 |
| `NO_FILE` | 400 | 未选择文件 |
| `FILE_TOO_LARGE` | 400 | 文件超过大小限制 |
| `UPLOAD_ERROR` | 500 | 上传过程中出错 |

### 错误示例

```json
{
    "error": "文件过大，最大支持 50MB",
    "code": "FILE_TOO_LARGE"
}
```

```json
{
    "error": "不支持的文件类型: .exe",
    "code": "UPLOAD_ERROR"
}
```

---

## 3. 文件状态查询接口

### 基本信息

| 属性 | 值 |
|-----|-----|
| **端点** | `GET /api/files/session/:fileId/status` |
| **协议** | HTTP |
| **Content-Type** | `application/json` |

### 路径参数

| 参数名 | 类型 | 描述 |
|-------|------|------|
| `fileId` | string | 文件 ID |

### 请求示例

```bash
GET /api/files/session/file_session_abc123def456/status
```

### 响应格式

```typescript
interface FileStatusResponse {
    /** 文件 ID */
    fileId: string;
    
    /** 文件名 */
    fileName: string;
    
    /** 原始状态（百炼 API 返回） */
    rawStatus: string;
    
    /** 简化状态 */
    status: "processing" | "ready" | "error" | "unknown";
    
    /** 状态描述 */
    message: string;
}
```

### 响应示例

#### 处理中

```json
{
    "fileId": "file_session_abc123def456",
    "fileName": "document.pdf",
    "rawStatus": "PARSING",
    "status": "processing",
    "message": "解析中..."
}
```

#### 已就绪

```json
{
    "fileId": "file_session_abc123def456",
    "fileName": "document.pdf",
    "rawStatus": "FILE_IS_READY",
    "status": "ready",
    "message": "文件已就绪"
}
```

#### 错误

```json
{
    "fileId": "file_session_abc123def456",
    "fileName": "document.pdf",
    "rawStatus": "PARSE_FAILED",
    "status": "error",
    "message": "文件解析失败"
}
```

### 状态映射表

| rawStatus | status | message |
|-----------|--------|---------|
| `INIT` | processing | 初始化中... |
| `PARSING` | processing | 解析中... |
| `PARSE_SUCCESS` | processing | 解析成功，正在索引... |
| `FILE_IS_READY` | ready | 文件已就绪 |
| `PARSE_FAILED` | error | 文件解析失败 |
| `SAFE_CHECK_FAILED` | error | 文件安全检查失败 |
| `INDEX_BUILDING_FAILED` | error | 索引构建失败 |
| `FILE_EXPIRED` | error | 文件已过期 |

---

## 4. 非流式聊天接口（备用）

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

## 5. CORS 配置

所有 API 端点均支持 CORS：

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

### 预检请求

```bash
OPTIONS /api/chat/stream
# 返回 200 OK
```

---

## 6. 错误处理

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

## 7. 使用示例

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

### JavaScript (文件上传)

```javascript
async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/files/session', {
        method: 'POST',
        body: formData
    });

    const result = await response.json();
    
    if (result.error) {
        throw new Error(result.error);
    }

    return result.fileId;
}

async function pollFileStatus(fileId) {
    while (true) {
        const response = await fetch(`/api/files/session/${fileId}/status`);
        const result = await response.json();

        if (result.status === 'ready') {
            return result;
        }
        
        if (result.status === 'error') {
            throw new Error(result.message);
        }

        // 等待 2 秒后继续轮询
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

// 使用示例
const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    
    try {
        const fileId = await uploadFile(file);
        console.log('文件上传成功，ID:', fileId);
        
        const status = await pollFileStatus(fileId);
        console.log('文件已就绪:', status);
        
        // 现在可以使用 fileId 进行对话
        const result = await streamChat(
            '请分析这份文档', 
            'func-doc',
            null,
            [fileId]
        );
        console.log('AI 回复:', result.text);
    } catch (error) {
        console.error('错误:', error.message);
    }
});
```

### cURL 示例

```bash
# 流式聊天
curl -X POST http://localhost:4004/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "你好", "aiType": "abap-clean-core"}'

# 文件上传
curl -X POST http://localhost:4004/api/files/session \
  -F "file=@document.pdf"

# 查询文件状态
curl http://localhost:4004/api/files/session/file_session_abc123/status
```

---

## 8. 速率限制

当前版本暂无速率限制。

如需实现，建议在生产环境中添加：
- API 网关层限流
- 用户级别配额
- 并发请求限制

---

## 9. 版本历史

| 版本 | 日期 | 变更 |
|-----|------|------|
| v1.4.3 | 2025-01 | 添加文件上传接口文档 |
| v1.4.0 | 2025-01 | 添加流程图生成支持 |
| v1.3.0 | 2024-12 | 添加会话管理策略 |
| v1.0.0 | 2024-12 | 初始版本 |
