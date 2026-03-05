// AI 聊天服务定义
// 说明：流式响应由 `server.js` 中自定义 Express 路由 `/api/chat/stream` 提供
service ChatService @(path: '/api/chat') {
    // 非流式备用 Action：发送消息并返回完整文本响应
    action sendMessage(message: String, sessionId: String) returns String;
}
