const cds = require('@sap/cds');
require('dotenv').config();

// 从环境变量读取阿里云百炼API配置
const DASHSCOPE_APP_ID = process.env.DASHSCOPE_APP_ID;
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const DASHSCOPE_API_URL = `https://dashscope.aliyuncs.com/api/v1/apps/${DASHSCOPE_APP_ID}/completion`;

// API请求超时时间（毫秒）
const API_TIMEOUT = 60000;

module.exports = class ChatService extends cds.ApplicationService {
    init() {
        // 处理普通消息请求（非流式，作为备用方案）
        this.on('sendMessage', async (req) => {
            const { message, sessionId } = req.data;
            
            try {
                const response = await this.callDashScope(message, sessionId);
                return response;
            } catch (error) {
                console.error('AI调用错误:', error);
                throw new Error('AI服务暂时不可用，请稍后重试');
            }
        });

        return super.init();
    }

    // 调用阿里云百炼API（非流式）
    async callDashScope(message, sessionId) {
        if (!DASHSCOPE_APP_ID || !DASHSCOPE_API_KEY) {
            throw new Error('AI service configuration is missing');
        }


        const requestBody = {
            input: {
                prompt: message
            },
            parameters: {
                incremental_output: false
            }
        };

        // 如果有会话ID，添加到请求中以保持上下文
        if (sessionId) {
            requestBody.input.session_id = sessionId;
        }

        // 创建AbortController用于超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, API_TIMEOUT);

        try {
            const response = await fetch(DASHSCOPE_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
                    'Content-Type': 'application/json',
                    'X-DashScope-SSE': 'disable'
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });

            // 清除超时定时器
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('百炼API错误:', errorText);
                throw new Error('AI服务调用失败');
            }

            const data = await response.json();
            
            if (data.output && data.output.text) {
                return data.output.text;
            }
            
            throw new Error('AI响应格式异常');
        } catch (error) {
            // 清除超时定时器
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error('AI服务响应超时，请稍后重试');
            }
            throw error;
        }
    }
};
