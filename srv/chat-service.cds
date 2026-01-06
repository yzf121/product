// AI聊天服务定义
// 注意：流式响应通过server.js中的自定义Express路由实现（/api/chat/stream）
service ChatService @(path: '/api/chat') {
    // 发送消息到AI的action（非流式，备用）
    action sendMessage(message: String, sessionId: String) returns String;
}
