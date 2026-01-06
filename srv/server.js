const cds = require('@sap/cds');
const express = require('express');
const net = require('net');
require('dotenv').config();

// 从环境变量读取阿里云百炼API配置
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

// AI类型与应用ID的映射关系
const AI_APP_ID_MAP = {
    'abap-clean-core': process.env.DASHSCOPE_APP_ID_ABAP || process.env.DASHSCOPE_APP_ID,
    'cpi': process.env.DASHSCOPE_APP_ID_CPI,
    'func-doc': process.env.DASHSCOPE_APP_ID_FUNC_DOC,
    'tech-doc': process.env.DASHSCOPE_APP_ID_TECH_DOC,
    'code-review': process.env.DASHSCOPE_APP_ID_CODE_REVIEW,
    'unit-test': process.env.DASHSCOPE_APP_ID_UNIT_TEST,
    'diagram': process.env.DASHSCOPE_APP_ID_DIAGRAM  // 架构图/流程图生成应用
};

// 默认应用ID（ABAP Clean Core）
const DEFAULT_APP_ID = process.env.DASHSCOPE_APP_ID || process.env.DASHSCOPE_APP_ID_ABAP;

/**
 * 根据AI类型获取对应的应用ID
 * @param {string} aiType AI类型
 * @returns {string} 应用ID
 */
function getAppIdByType(aiType) {
    const appId = AI_APP_ID_MAP[aiType];
    if (appId) {
        console.log(`[AI] 使用 ${aiType} 助手，应用ID: ${appId.substring(0, 8)}...`);
        return appId;
    }
    console.log(`[AI] 未配置 ${aiType} 助手，使用默认应用ID`);
    return DEFAULT_APP_ID;
}

/**
 * 根据应用ID构建API URL
 * @param {string} appId 应用ID
 * @returns {string} API URL
 */
function buildApiUrl(appId) {
    return `https://dashscope.aliyuncs.com/api/v1/apps/${appId}/completion`;
}

// 检查API配置是否完整
if (!DEFAULT_APP_ID || !DASHSCOPE_API_KEY) {
    console.warn('警告: 阿里云百炼API配置不完整，请检查.env文件');
}

// 打印已配置的AI助手
console.log('[AI] 已配置的助手:');
Object.entries(AI_APP_ID_MAP).forEach(([type, id]) => {
    if (id) {
        console.log(`  - ${type}: ${id.substring(0, 8)}...`);
    }
});

// API请求超时时间（毫秒）
const API_TIMEOUT = 60000;

// session_id 配置常量
const SESSION_CONFIG = {
    MAX_ROUNDS: 50,        // 百炼API限制：最多50轮
    EXPIRE_HOURS: 1,       // 百炼API限制：1小时过期
    FALLBACK_ROUNDS: 10    // 降级时使用的历史轮数
};

/**
 * 判断是否应该使用 session_id（云端存储）
 * 条件：session_id 存在 且 未过期 且 未超过轮次限制
 * @param {string} sessionId 会话ID
 * @param {object} sessionInfo 会话信息（包含创建时间、轮次等）
 * @returns {boolean} 是否使用 session_id
 */
function shouldUseSessionId(sessionId, sessionInfo) {
    if (!sessionId || !sessionInfo) {
        return false;
    }
    
    // 检查轮次限制（50轮）
    if (sessionInfo.roundCount >= SESSION_CONFIG.MAX_ROUNDS) {
        console.log(`[AI] session_id 已达轮次上限 (${sessionInfo.roundCount}/${SESSION_CONFIG.MAX_ROUNDS})，切换到 messages 模式`);
        return false;
    }
    
    // 检查时间限制（1小时）
    if (sessionInfo.createdAt) {
        const createdTime = new Date(sessionInfo.createdAt).getTime();
        const now = Date.now();
        const expireTime = SESSION_CONFIG.EXPIRE_HOURS * 60 * 60 * 1000;
        
        if (now - createdTime > expireTime) {
            console.log(`[AI] session_id 已过期（超过${SESSION_CONFIG.EXPIRE_HOURS}小时），切换到 messages 模式`);
            return false;
        }
    }
    
    return true;
}

/**
 * 检查端口是否可用
 * @param {number} port 要检查的端口
 * @returns {Promise<boolean>} 端口是否可用
 */
function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => {
            resolve(false);
        });
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        server.listen(port);
    });
}

/**
 * 查找可用端口（从指定端口开始，如果被占用则递增）
 * @param {number} startPort 起始端口
 * @param {number} maxAttempts 最大尝试次数
 * @returns {Promise<number>} 可用的端口号
 */
async function findAvailablePort(startPort, maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
        const port = startPort + i;
        const available = await isPortAvailable(port);
        if (available) {
            if (i > 0) {
                console.log(`[cds] - 端口 ${startPort} 被占用，自动切换到端口 ${port}`);
            }
            return port;
        }
        console.log(`[cds] - 端口 ${port} 被占用，尝试下一个...`);
    }
    throw new Error(`无法找到可用端口（已尝试 ${startPort} - ${startPort + maxAttempts - 1}）`);
}

// 扩展CDS服务器，添加流式响应端点
cds.on('bootstrap', (app) => {
    // 添加JSON解析中间件
    app.use('/api/chat/stream', express.json());
    
    // 流式聊天端点
    app.post('/api/chat/stream', async (req, res) => {
        const { message, sessionId, aiType, messages, sessionInfo } = req.body;

        if (!message) {
            return res.status(400).json({ error: '消息内容不能为空' });
        }

        // 根据AI类型获取对应的应用ID
        const appId = getAppIdByType(aiType);
        
        // 检查API配置
        if (!appId || !DASHSCOPE_API_KEY) {
            res.write(`data: ${JSON.stringify({ error: 'AI服务配置不完整，请联系管理员' })}\n\n`);
            res.end();
            return;
        }

        // 构建API URL
        const apiUrl = buildApiUrl(appId);

        // 设置SSE响应头
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');

        // 判断是否使用 session_id（云端存储）还是 messages（本地历史）
        const useSessionId = shouldUseSessionId(sessionId, sessionInfo);
        
        // 创建AbortController用于超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, API_TIMEOUT);

        try {
            let requestBody;
            
            if (useSessionId && sessionId) {
                // 方案1：使用 session_id（云端存储，省token）
                console.log(`[AI] 使用 session_id 模式，轮次: ${sessionInfo?.roundCount || 0}`);
                requestBody = {
                    input: {
                        prompt: message,
                        session_id: sessionId
                    },
                    parameters: {
                        incremental_output: true
                    }
                };
            } else if (messages && messages.length > 0) {
                // 方案2：使用 messages 数组（本地历史，降级方案）
                console.log(`[AI] 使用 messages 模式（降级），历史消息数: ${messages.length}`);
                requestBody = {
                    input: {
                        prompt: message,
                        messages: messages
                    },
                    parameters: {
                        incremental_output: true
                    }
                };
            } else {
                // 方案3：新对话，只发送当前消息
                console.log('[AI] 新对话模式');
                requestBody = {
                    input: {
                        prompt: message
                    },
                    parameters: {
                        incremental_output: true
                    }
                };
            }

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
                    'Content-Type': 'application/json',
                    'X-DashScope-SSE': 'enable'
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });

            // 清除超时定时器
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('百炼API错误:', errorText);
                res.write(`data: ${JSON.stringify({ error: 'AI服务调用失败' })}\n\n`);
                res.end();
                return;
            }

            // 检查response.body是否存在
            if (!response.body) {
                console.error('响应体不支持流式读取');
                res.write(`data: ${JSON.stringify({ error: '服务器不支持流式响应' })}\n\n`);
                res.end();
                return;
            }

            // 处理流式响应
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        const jsonStr = line.slice(5).trim();
                        if (jsonStr) {
                            try {
                                const data = JSON.parse(jsonStr);
                                if (data.output && data.output.text) {
                                    res.write(`data: ${JSON.stringify({ text: data.output.text, sessionId: data.output.session_id })}\n\n`);
                                }
                            } catch (e) {
                                // 忽略解析错误
                            }
                        }
                    }
                }
            }

            res.write('data: [DONE]\n\n');
            res.end();

        } catch (error) {
            // 清除超时定时器
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                console.error('API请求超时');
                res.write(`data: ${JSON.stringify({ error: 'AI服务响应超时，请稍后重试' })}\n\n`);
            } else {
                console.error('流式响应错误:', error);
                res.write(`data: ${JSON.stringify({ error: '服务器内部错误' })}\n\n`);
            }
            res.end();
        }
    });

    // CORS预检请求处理
    app.options('/api/chat/stream', (_req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.status(200).end();
    });
});

// 自定义服务器启动逻辑，支持端口自动递增
cds.on('listening', ({ server, url }) => {
    const port = server.address().port;
    console.log(`[cds] - 服务器已启动: ${url}`);
    console.log(`[cds] - 访问应用: http://localhost:${port}/ai-chat-gui/webapp/index.html`);
});

// 覆盖默认的端口绑定行为
const originalServer = cds.server;
module.exports = async function(options) {
    const defaultPort = process.env.PORT || 4004;
    
    try {
        const availablePort = await findAvailablePort(parseInt(defaultPort));
        process.env.PORT = availablePort;
        return originalServer.call(cds, options);
    } catch (error) {
        console.error('[cds] - 启动失败:', error.message);
        process.exit(1);
    }
};
