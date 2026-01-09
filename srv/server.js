const cds = require('@sap/cds');
const express = require('express');
const net = require('net');
const crypto = require('crypto');
const multer = require('multer');
require('dotenv').config();

// 阿里云百炼 SDK
const Bailian = require('@alicloud/bailian20231229');
const OpenApi = require('@alicloud/openapi-client');
const Util = require('@alicloud/tea-util');

// ===================== 环境变量配置 =====================
// 从环境变量读取阿里云百炼API配置
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

// 百炼 OpenAPI 配置（用于文件上传，使用RAM AK/SK签名）
const BAILIAN_AK = process.env.BAILIAN_ACCESS_KEY_ID;
const BAILIAN_SK = process.env.BAILIAN_ACCESS_KEY_SECRET;
const BAILIAN_WORKSPACE_ID = process.env.BAILIAN_WORKSPACE_ID || 'llm-njsp72bv281ofywg';

// AI类型与应用ID的映射关系
const AI_APP_ID_MAP = {
    'abap-clean-core': process.env.DASHSCOPE_APP_ID_ABAP || process.env.DASHSCOPE_APP_ID,
    'cpi': process.env.DASHSCOPE_APP_ID_CPI,
    'func-doc': process.env.DASHSCOPE_APP_ID_FUNC_DOC,
    'tech-doc': process.env.DASHSCOPE_APP_ID_TECH_DOC,
    'code-review': process.env.DASHSCOPE_APP_ID_CODE_REVIEW,
    'unit-test': process.env.DASHSCOPE_APP_ID_UNIT_TEST,
    'diagram': process.env.DASHSCOPE_APP_ID_DIAGRAM
};

// 默认应用ID（ABAP Clean Core）
const DEFAULT_APP_ID = process.env.DASHSCOPE_APP_ID || process.env.DASHSCOPE_APP_ID_ABAP;

/**
 * 根据AI类型获取对应的应用ID
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
 */
function buildApiUrl(appId) {
    return `https://dashscope.aliyuncs.com/api/v1/apps/${appId}/completion`;
}

// 检查API配置是否完整
if (!DEFAULT_APP_ID || !DASHSCOPE_API_KEY) {
    console.warn('警告: 阿里云百炼API配置不完整，请检查.env文件');
}

// 检查文件上传配置
if (!BAILIAN_AK || !BAILIAN_SK) {
    console.warn('警告: 文件上传API配置不完整（缺少 BAILIAN_ACCESS_KEY_ID 或 BAILIAN_ACCESS_KEY_SECRET），文件上传功能将不可用');
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
    MAX_ROUNDS: 50,
    EXPIRE_HOURS: 1,
    FALLBACK_ROUNDS: 10
};

// 文件上传配置
const FILE_UPLOAD_CONFIG = {
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    MAX_FILES_PER_SESSION: 5,        // 单会话最多5个文件
    ALLOWED_EXTENSIONS: ['.pdf', '.doc', '.docx', '.txt', '.md', '.json', '.xml', '.csv', '.xlsx', '.xls', '.ppt', '.pptx'],
    PARSE_TIMEOUT: 120000,           // 解析超时120秒
    POLL_INTERVAL: 2000              // 轮询间隔2秒
};

// 配置 multer 用于文件上传（内存存储）
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: FILE_UPLOAD_CONFIG.MAX_FILE_SIZE
    },
    fileFilter: (req, file, cb) => {
        const ext = '.' + file.originalname.split('.').pop().toLowerCase();
        if (FILE_UPLOAD_CONFIG.ALLOWED_EXTENSIONS.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`不支持的文件类型: ${ext}`));
        }
    }
});

// ===================== 百炼 SDK 客户端 =====================
/**
 * 创建百炼 SDK 客户端
 */
function createBailianClient() {
    const config = new OpenApi.Config({
        accessKeyId: BAILIAN_AK,
        accessKeySecret: BAILIAN_SK,
    });
    config.endpoint = 'bailian.cn-beijing.aliyuncs.com';
    return new Bailian.default(config);
}

// 创建全局客户端实例
let bailianClient = null;
function getBailianClient() {
    if (!bailianClient && BAILIAN_AK && BAILIAN_SK) {
        bailianClient = createBailianClient();
    }
    return bailianClient;
}

// ===================== 文件上传处理函数 =====================

/**
 * Step B1: 申请文件上传租约
 */
async function applyFileUploadLease(fileName, fileSize, fileMd5) {
    console.log(`[FileUpload] 申请上传租约: ${fileName}, 大小: ${fileSize} bytes`);

    const client = getBailianClient();
    if (!client) {
        throw new Error('百炼客户端未初始化，请检查 BAILIAN_ACCESS_KEY_ID 和 BAILIAN_ACCESS_KEY_SECRET 配置');
    }

    const request = new Bailian.ApplyFileUploadLeaseRequest({
        categoryId: 'default',
        fileName: fileName,
        sizeInBytes: fileSize.toString(),
        md5: fileMd5,
        categoryType: 'SESSION_FILE'
    });

    const runtime = new Util.RuntimeOptions({});

    try {
        const response = await client.applyFileUploadLeaseWithOptions(
            BAILIAN_WORKSPACE_ID,
            'default',  // CategoryId
            request,
            {},  // headers
            runtime
        );

        console.log(`[FileUpload] 获取租约成功: ${response.body.data?.fileUploadLeaseId?.substring(0, 16)}...`);

        // 转换为我们期望的格式
        return {
            FileUploadLeaseId: response.body.data.fileUploadLeaseId,
            Param: {
                Url: response.body.data.param.url,
                Method: response.body.data.param.method,
                Headers: response.body.data.param.headers
            }
        };
    } catch (error) {
        console.error('[FileUpload] 申请租约失败:', error.message);
        throw new Error(`申请上传租约失败: ${error.message}`);
    }
}

/**
 * Step B2: 上传文件到预签名URL
 */
async function uploadToLeaseUrl(leaseData, fileBuffer) {
    const { Url, Method, Headers } = leaseData.Param;

    console.log(`[FileUpload] 开始上传到OSS: ${Url.substring(0, 80)}...`);

    // 构建请求头
    const headers = {};
    if (Headers) {
        for (const [key, value] of Object.entries(Headers)) {
            headers[key] = value;
        }
    }

    const response = await fetch(Url, {
        method: Method || 'PUT',
        headers: headers,
        body: fileBuffer
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`文件上传到OSS失败: ${response.status} - ${errorText}`);
    }

    console.log('[FileUpload] 文件上传到OSS成功');
}

/**
 * Step B3: 添加文件（生成 file_session_... ID）
 */
async function addSessionFile(leaseId) {
    console.log(`[FileUpload] 登记会话文件: ${leaseId.substring(0, 16)}...`);

    const client = getBailianClient();
    if (!client) {
        throw new Error('百炼客户端未初始化');
    }

    const request = new Bailian.AddFileRequest({
        leaseId: leaseId,
        parser: 'DASHSCOPE_DOCMIND',
        categoryId: 'default',
        categoryType: 'SESSION_FILE'
    });

    const runtime = new Util.RuntimeOptions({});

    try {
        const response = await client.addFileWithOptions(
            BAILIAN_WORKSPACE_ID,
            request,
            {},  // headers
            runtime
        );

        console.log(`[FileUpload] 文件ID: ${response.body.data?.fileId}`);

        return {
            FileId: response.body.data.fileId
        };
    } catch (error) {
        console.error('[FileUpload] 添加文件失败:', error.message);
        throw new Error(`添加文件失败: ${error.message}`);
    }
}

/**
 * Step B4: 查询文件状态
 */
async function describeFile(fileId) {
    const client = getBailianClient();
    if (!client) {
        throw new Error('百炼客户端未初始化');
    }

    const request = new Bailian.DescribeFileRequest({});
    const runtime = new Util.RuntimeOptions({});

    try {
        const response = await client.describeFileWithOptions(
            BAILIAN_WORKSPACE_ID,
            fileId,
            request,
            {},  // headers
            runtime
        );

        return {
            Status: response.body.data?.status,
            FileName: response.body.data?.fileName
        };
    } catch (error) {
        console.error('[FileUpload] 查询状态失败:', error.message);
        throw new Error(`查询文件状态失败: ${error.message}`);
    }
}

/**
 * 轮询等待文件解析完成
 */
async function waitForFileReady(fileId, maxWaitMs = FILE_UPLOAD_CONFIG.PARSE_TIMEOUT) {
    const startTime = Date.now();
    const pollInterval = FILE_UPLOAD_CONFIG.POLL_INTERVAL;

    while (Date.now() - startTime < maxWaitMs) {
        const fileInfo = await describeFile(fileId);
        const status = fileInfo.Status;

        console.log(`[FileUpload] 文件状态: ${status}`);

        if (status === 'FILE_IS_READY') {
            return { status: 'ready', fileInfo };
        }

        if (['PARSE_FAILED', 'SAFE_CHECK_FAILED', 'INDEX_BUILDING_FAILED', 'FILE_EXPIRED'].includes(status)) {
            return { status: 'error', error: `文件处理失败: ${status}`, fileInfo };
        }

        // 等待后继续轮询
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return { status: 'timeout', message: '文件解析超时，请稍后查询状态' };
}

// ===================== session_id 辅助函数 =====================

function shouldUseSessionId(sessionId, sessionInfo) {
    if (!sessionId || !sessionInfo) {
        return false;
    }

    if (sessionInfo.roundCount >= SESSION_CONFIG.MAX_ROUNDS) {
        console.log(`[AI] session_id 已达轮次上限 (${sessionInfo.roundCount}/${SESSION_CONFIG.MAX_ROUNDS})，切换到 messages 模式`);
        return false;
    }

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

// ===================== 端口检测辅助函数 =====================

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

// ===================== CDS 服务器扩展 =====================

cds.on('bootstrap', (app) => {
    // JSON 解析中间件
    app.use('/api/chat/stream', express.json());
    app.use('/api/files', express.json());

    // ==================== 文件上传接口 ====================

    /**
     * POST /api/files/session - 上传文件并返回会话文件ID
     */
    app.post('/api/files/session', upload.single('file'), async (req, res) => {
        try {
            // 检查配置
            if (!BAILIAN_AK || !BAILIAN_SK) {
                return res.status(500).json({
                    error: '文件上传服务未配置',
                    code: 'CONFIG_ERROR'
                });
            }

            // 检查文件
            if (!req.file) {
                return res.status(400).json({
                    error: '请选择要上传的文件',
                    code: 'NO_FILE'
                });
            }

            const file = req.file;
            const fileName = file.originalname;
            const fileSize = file.size;
            const fileBuffer = file.buffer;

            // 验证文件大小
            if (fileSize > FILE_UPLOAD_CONFIG.MAX_FILE_SIZE) {
                return res.status(400).json({
                    error: `文件过大，最大支持 ${FILE_UPLOAD_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`,
                    code: 'FILE_TOO_LARGE'
                });
            }

            // 计算 MD5
            const fileMd5 = crypto.createHash('md5').update(fileBuffer).digest('hex');

            console.log(`[FileUpload] 开始处理文件: ${fileName}, 大小: ${fileSize}, MD5: ${fileMd5}`);

            // Step B1: 申请上传租约
            const leaseData = await applyFileUploadLease(fileName, fileSize, fileMd5);

            // Step B2: 上传文件到预签名URL
            await uploadToLeaseUrl(leaseData, fileBuffer);

            // Step B3: 添加文件（生成 file_session_... ID）
            const fileData = await addSessionFile(leaseData.FileUploadLeaseId);
            const fileId = fileData.FileId;

            // 返回文件ID，让前端轮询状态
            res.json({
                fileId: fileId,
                fileName: fileName,
                size: fileSize,
                status: 'UPLOADING',
                message: '文件已上传，正在解析中...'
            });

        } catch (error) {
            console.error('[FileUpload] 上传错误:', error);
            res.status(500).json({
                error: error.message || '文件上传失败',
                code: 'UPLOAD_ERROR'
            });
        }
    });

    /**
     * GET /api/files/session/:fileId/status - 查询文件解析状态
     */
    app.get('/api/files/session/:fileId/status', async (req, res) => {
        try {
            const { fileId } = req.params;

            if (!fileId) {
                return res.status(400).json({ error: '缺少文件ID' });
            }

            const fileInfo = await describeFile(fileId);

            // 状态映射
            const statusMap = {
                'INIT': { status: 'processing', message: '初始化中...' },
                'PARSING': { status: 'processing', message: '解析中...' },
                'PARSE_SUCCESS': { status: 'processing', message: '解析成功，正在索引...' },
                'FILE_IS_READY': { status: 'ready', message: '文件已就绪' },
                'PARSE_FAILED': { status: 'error', message: '文件解析失败' },
                'SAFE_CHECK_FAILED': { status: 'error', message: '文件安全检查失败' },
                'INDEX_BUILDING_FAILED': { status: 'error', message: '索引构建失败' },
                'FILE_EXPIRED': { status: 'error', message: '文件已过期' }
            };

            const statusInfo = statusMap[fileInfo.Status] || {
                status: 'unknown',
                message: `未知状态: ${fileInfo.Status}`
            };

            res.json({
                fileId: fileId,
                fileName: fileInfo.FileName,
                rawStatus: fileInfo.Status,
                ...statusInfo
            });

        } catch (error) {
            console.error('[FileUpload] 查询状态错误:', error);
            res.status(500).json({
                error: error.message || '查询文件状态失败'
            });
        }
    });

    // CORS 预检请求处理 - 文件上传接口
    app.options('/api/files/*', (_req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.status(200).end();
    });

    // ==================== 流式聊天接口 ====================

    /**
     * POST /api/chat/stream - 流式聊天（支持会话文件）
     */
    app.post('/api/chat/stream', async (req, res) => {
        const { message, sessionId, aiType, messages, sessionInfo, sessionFileIds } = req.body;

        if (!message) {
            return res.status(400).json({ error: '消息内容不能为空' });
        }

        const appId = getAppIdByType(aiType);

        if (!appId || !DASHSCOPE_API_KEY) {
            res.write(`data: ${JSON.stringify({ error: 'AI服务配置不完整，请联系管理员' })}\n\n`);
            res.end();
            return;
        }

        const apiUrl = buildApiUrl(appId);

        // 设置SSE响应头
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');

        const useSessionId = shouldUseSessionId(sessionId, sessionInfo);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, API_TIMEOUT);

        try {
            let requestBody;

            // 构建基础请求体
            if (useSessionId && sessionId) {
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

            // 如果有会话文件，添加 rag_options
            if (sessionFileIds && sessionFileIds.length > 0) {
                // 过滤有效的 file_session_ 开头的文件ID
                const validFileIds = sessionFileIds.filter(id =>
                    id && typeof id === 'string' && id.startsWith('file_session_')
                );

                if (validFileIds.length > 0) {
                    console.log(`[AI] 注入会话文件: ${validFileIds.join(', ')}`);
                    requestBody.parameters.rag_options = {
                        session_file_ids: validFileIds
                    };
                } else {
                    console.log('[AI] 警告: sessionFileIds 中没有有效的 file_session_ ID');
                }
            }

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
                    'Content-Type': 'application/json',
                    'X-DashScope-SSE': 'enable',
                    'X-DashScope-WorkSpace': BAILIAN_WORKSPACE_ID
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('百炼API错误:', errorText);
                res.write(`data: ${JSON.stringify({ error: 'AI服务调用失败' })}\n\n`);
                res.end();
                return;
            }

            if (!response.body) {
                console.error('响应体不支持流式读取');
                res.write(`data: ${JSON.stringify({ error: '服务器不支持流式响应' })}\n\n`);
                res.end();
                return;
            }

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

    // CORS预检请求处理 - 聊天接口
    app.options('/api/chat/stream', (_req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.status(200).end();
    });
});

// 服务器启动监听
cds.on('listening', ({ server, url }) => {
    const port = server.address().port;
    console.log(`[cds] - 服务器已启动: ${url}`);
    console.log(`[cds] - 访问应用: http://localhost:${port}/ai-chat-gui/webapp/index.html`);
});

// 自定义端口绑定
const originalServer = cds.server;
module.exports = async function (options) {
    const envPort = process.env.PORT;
    const parsedPort = envPort ? parseInt(envPort, 10) : NaN;
    const defaultPort = Number.isInteger(parsedPort) ? parsedPort : 4004;

    if (Number.isInteger(parsedPort)) {
        return originalServer.call(cds, options);
    }

    try {
        const availablePort = await findAvailablePort(defaultPort);
        process.env.PORT = availablePort;
        return originalServer.call(cds, options);
    } catch (error) {
        console.error('[cds] - 启动失败:', error.message);
        process.exit(1);
    }
};
