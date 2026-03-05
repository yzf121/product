const cds = require('@sap/cds');
const express = require('express');
const net = require('net');
require('dotenv').config();

// comment
// comment
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

// Dedicated API keys for FSD->TSD assistants (optional)
const DASHSCOPE_API_KEY_FSD2TSD_I = process.env.DASHSCOPE_API_KEY_FSD2TSD_I;
const DASHSCOPE_API_KEY_FSD2TSD_E = process.env.DASHSCOPE_API_KEY_FSD2TSD_E;

// comment
const AI_APP_ID_MAP = {
    'abap-clean-core': process.env.DASHSCOPE_APP_ID_ABAP || process.env.DASHSCOPE_APP_ID,
    'cpi': process.env.DASHSCOPE_APP_ID_CPI,
    'func-doc': process.env.DASHSCOPE_APP_ID_FUNC_DOC,
    'fsd2tsd-i': process.env.DASHSCOPE_APP_ID_FSD2TSD_I,
    'fsd2tsd-e': process.env.DASHSCOPE_APP_ID_FSD2TSD_E,
    'tech-doc': process.env.DASHSCOPE_APP_ID_TECH_DOC,
    'code-review': process.env.DASHSCOPE_APP_ID_CODE_REVIEW,
    'unit-test': process.env.DASHSCOPE_APP_ID_UNIT_TEST,
    'diagram': process.env.DASHSCOPE_APP_ID_DIAGRAM
};

// comment
const AI_API_KEY_MAP = {
    'fsd2tsd-i': DASHSCOPE_API_KEY_FSD2TSD_I,
    'fsd2tsd-e': DASHSCOPE_API_KEY_FSD2TSD_E
};

// comment
const DEFAULT_APP_ID = process.env.DASHSCOPE_APP_ID || process.env.DASHSCOPE_APP_ID_ABAP;
// comment
const API_TIMEOUT = 60000;

function parsePositiveInt(value, fallbackValue) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return fallbackValue;
    }
    return parsed;
}

const CHAT_REQUEST_LIMIT = process.env.CHAT_REQUEST_LIMIT || '20mb';
const CHAT_MESSAGE_MAX_LENGTH = parsePositiveInt(process.env.CHAT_MESSAGE_MAX_LENGTH || '120000', 120000);
const CHAT_HISTORY_MAX_MESSAGES = parsePositiveInt(process.env.CHAT_HISTORY_MAX_MESSAGES || '20', 20);
const CHAT_SESSION_ID_MAX_LENGTH = parsePositiveInt(process.env.CHAT_SESSION_ID_MAX_LENGTH || '256', 256);
const CHAT_SSE_BUFFER_MAX_LENGTH = parsePositiveInt(process.env.CHAT_SSE_BUFFER_MAX_LENGTH || '1048576', 1048576);
const CHAT_UPSTREAM_ERROR_MAX_LENGTH = parsePositiveInt(process.env.CHAT_UPSTREAM_ERROR_MAX_LENGTH || '300', 300);

/**
  *
 */
function getAppIdByType(aiType) {
    const appId = AI_APP_ID_MAP[aiType];
    if (appId) {
        console.log(`[AI] Using ${aiType} assistant, app ID: ${appId.substring(0, 8)}...`);
        return appId;
    }
    console.log(`[AI] ${aiType} assistant not configured, using default app ID`);
    return DEFAULT_APP_ID;
}

/**
  *
 */
function getApiKeyByType(aiType) {
    const specialKey = AI_API_KEY_MAP[aiType];
    if (specialKey) {
        console.log(`[AI] Using dedicated API key for ${aiType}`);
        return specialKey;
    }
    return DASHSCOPE_API_KEY;
}

/**
  *
 */
function buildApiUrl(appId) {
    return `https://dashscope.aliyuncs.com/api/v1/apps/${appId}/completion`;
}

function sanitizeMessageContent(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
}

function normalizeSessionId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim().slice(0, CHAT_SESSION_ID_MAX_LENGTH);
}

function normalizeMessages(rawMessages) {
    if (!Array.isArray(rawMessages)) {
        return [];
    }

    const allowedRoles = new Set(['user', 'assistant']);

    return rawMessages
        .map((item) => {
            if (!item || typeof item !== 'object') {
                return null;
            }

            const role = typeof item.role === 'string' ? item.role.trim().toLowerCase() : '';
            const content = typeof item.content === 'string' ? item.content.trim() : '';

            if (!allowedRoles.has(role) || !content) {
                return null;
            }

            return {
                role,
                content: content.slice(0, CHAT_MESSAGE_MAX_LENGTH)
            };
        })
        .filter(Boolean)
        .slice(-CHAT_HISTORY_MAX_MESSAGES);
}

function extractUpstreamErrorMessage(data) {
    if (!data || typeof data !== 'object') {
        return '';
    }

    const output = data.output && typeof data.output === 'object' ? data.output : null;
    const hasText = Boolean(output && typeof output.text === 'string' && output.text);

    if (hasText) {
        return '';
    }

    const candidates = [
        typeof data.error === 'string' ? data.error : '',
        typeof data.message === 'string' ? data.message : '',
        output && typeof output.error === 'string' ? output.error : '',
        output && typeof output.error_message === 'string' ? output.error_message : '',
        typeof data.code === 'string' ? `Upstream error: ${data.code}` : '',
        typeof data.status_code === 'number' ? `Upstream status: ${data.status_code}` : ''
    ];

    const match = candidates.find((item) => item && item.trim());
    return normalizeErrorMessage(match);
}

function normalizeErrorMessage(value) {
    if (typeof value !== 'string') {
        return '';
    }

    const compact = value.replace(/\s+/g, ' ').trim();
    if (!compact) {
        return '';
    }

    if (compact.length <= CHAT_UPSTREAM_ERROR_MAX_LENGTH) {
        return compact;
    }

    return `${compact.slice(0, CHAT_UPSTREAM_ERROR_MAX_LENGTH)}...`;
}

function extractUpstreamHttpErrorMessage(rawText, statusCode) {
    const normalizedRawText = typeof rawText === 'string' ? rawText.trim() : '';
    if (!normalizedRawText) {
        return `AI service request failed (HTTP ${statusCode})`;
    }

    try {
        const parsed = JSON.parse(normalizedRawText);
        const output = parsed && typeof parsed.output === 'object' ? parsed.output : null;
        const candidates = [
            typeof parsed.error === 'string' ? parsed.error : '',
            typeof parsed.message === 'string' ? parsed.message : '',
            output && typeof output.error === 'string' ? output.error : '',
            output && typeof output.error_message === 'string' ? output.error_message : '',
            output && typeof output.text === 'string' ? output.text : ''
        ];

        const match = candidates.find((item) => item && item.trim());
        const normalizedMatch = normalizeErrorMessage(match);
        if (normalizedMatch) {
            return normalizedMatch;
        }
    } catch {
        // ignore parse error and fallback to plain text
    }

    const plainTextError = normalizeErrorMessage(normalizedRawText);
    if (plainTextError) {
        return plainTextError;
    }

    return `AI service request failed (HTTP ${statusCode})`;
}

// comment
if (!DEFAULT_APP_ID || !DASHSCOPE_API_KEY) {
    console.warn("Warning: DashScope API configuration is incomplete. Please check .env");
}

// Print configured assistant mappings
console.log("[AI] Configured assistants:");
Object.entries(AI_APP_ID_MAP).forEach(([type, id]) => {
    if (id) {
        console.log(`  - ${type}: ${id.substring(0, 8)}...`);
    }
});

// comment

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
                console.log(`[cds] - Port ${startPort} is occupied, auto-switch to ${port}`);
            }
            return port;
        }
        console.log(`[cds] - Port ${port} is occupied, trying next...`);
    }
    throw new Error(`No available port found (tried ${startPort} - ${startPort + maxAttempts - 1})`);
}

// ===================== CDS server bootstrap extensions =====================

cds.on('bootstrap', (app) => {
    // comment
    app.use('/api/chat/stream', express.json({ limit: CHAT_REQUEST_LIMIT }));
    app.use('/api/chat/stream', (err, _req, res, next) => {
        if (!err) {
            return next();
        }

        if (err.type === 'entity.too.large') {
            return res.status(413).json({ error: "Request payload is too large. Please reduce input size and retry" });
        }

        if (err instanceof SyntaxError) {
            return res.status(400).json({ error: "Request body JSON is invalid" });
        }

        return next(err);
    });

    // comment

    /**
      *
     */
    app.post('/api/chat/stream', async (req, res) => {
        const message = sanitizeMessageContent(req.body?.message);
        const sessionId = normalizeSessionId(req.body?.sessionId);
        const aiType = typeof req.body?.aiType === 'string' ? req.body.aiType.trim() : '';
        const messages = normalizeMessages(req.body?.messages);
        const sessionInfo = req.body?.sessionInfo && typeof req.body.sessionInfo === 'object' ? req.body.sessionInfo : null;

        if (!message) {
            return res.status(400).json({ error: "Message content cannot be empty" });
        }

        if (message.length > CHAT_MESSAGE_MAX_LENGTH) {
            return res.status(413).json({ error: "Message is too long. Please shorten and retry" });
        }

        // comment
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (typeof res.flushHeaders === 'function') {
            res.flushHeaders();
        }

        const safeWrite = (payload) => {
            if (res.writableEnded || res.destroyed) {
                return false;
            }
            try {
                res.write(`data: ${JSON.stringify(payload)}\n\n`);
                return true;
            } catch (writeError) {
                console.error("[AI] Failed to write SSE chunk:", writeError);
                return false;
            }
        };

        const safeWriteDone = () => {
            if (res.writableEnded || res.destroyed) {
                return false;
            }
            try {
                res.write('data: [DONE]\n\n');
                return true;
            } catch (writeError) {
                console.error("[AI] Failed to write SSE DONE marker:", writeError);
                return false;
            }
        };

        const safeEnd = () => {
            if (!res.writableEnded && !res.destroyed) {
                res.end();
            }
        };

        const appId = getAppIdByType(aiType);
        const apiKey = getApiKeyByType(aiType);

        if (!appId || !apiKey) {
            safeWrite({ error: "AI service configuration is incomplete. Please contact administrator" });
            safeEnd();
            return;
        }

        const apiUrl = buildApiUrl(appId);

        const useSessionId = Boolean(sessionId);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, API_TIMEOUT);
        let clientDisconnected = false;
        let abortedBySseBufferLimit = false;
        const handleClientClose = () => {
            clientDisconnected = true;
            controller.abort();
        };
        res.once('close', handleClientClose);

        try {
            let requestBody;

            // comment
            if (useSessionId) {
                console.log(`[AI] Using session_id mode, round: ${sessionInfo?.roundCount || 0}`);
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
                console.log(`[AI] Using messages mode (fallback), history messages: ${messages.length}`);
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
                console.log("[AI] New conversation mode");
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
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'X-DashScope-SSE': 'enable'
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (clientDisconnected) {
                safeEnd();
                return;
            }

            if (!response.ok) {
                const errorText = await response.text();
                const upstreamHttpError = extractUpstreamHttpErrorMessage(errorText, response.status);
                console.error("DashScope API error:", upstreamHttpError);
                safeWrite({ error: upstreamHttpError });
                safeEnd();
                return;
            }

            if (!response.body) {
                console.error("Response body does not support streaming");
                safeWrite({ error: "Server does not support streaming response" });
                safeEnd();
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let sseBuffer = '';

            const processEventBlock = (eventBlock) => {
                const dataLines = eventBlock
                    .split('\n')
                    .filter((line) => line.startsWith('data:'))
                    .map((line) => line.slice(5).trim());

                if (!dataLines.length) {
                    return;
                }

                const payload = dataLines.join('\n').trim();
                if (!payload || payload === '[DONE]') {
                    return;
                }

                try {
                    const data = JSON.parse(payload);
                    const upstreamError = extractUpstreamErrorMessage(data);
                    if (upstreamError) {
                        safeWrite({ error: upstreamError });
                        return;
                    }

                    if (data.output && data.output.text) {
                        safeWrite({ text: data.output.text, sessionId: data.output.session_id });
                    }
                } catch (e) {
                    // comment
                    console.warn("[AI] Failed to parse upstream SSE chunk:", e.message);
                }
            };

            const flushSSEBuffer = (forceFlush = false) => {
                let normalized = sseBuffer.replace(/\r\n/g, '\n');
                let boundaryIndex = normalized.indexOf('\n\n');

                while (boundaryIndex !== -1) {
                    const eventBlock = normalized.slice(0, boundaryIndex);
                    normalized = normalized.slice(boundaryIndex + 2);
                    processEventBlock(eventBlock);
                    boundaryIndex = normalized.indexOf('\n\n');
                }

                if (forceFlush && normalized.trim()) {
                    processEventBlock(normalized);
                    normalized = '';
                }

                sseBuffer = normalized;
            };

            while (true) {
                if (clientDisconnected) {
                    break;
                }

                const { done, value } = await reader.read();
                if (done) break;

                sseBuffer += decoder.decode(value, { stream: true });
                if (sseBuffer.length > CHAT_SSE_BUFFER_MAX_LENGTH) {
                    abortedBySseBufferLimit = true;
                    console.error("[AI] Upstream SSE buffer exceeded limit, aborting to protect process");
                    safeWrite({ error: "Upstream response is abnormal. Please retry later" });
                    controller.abort();
                    break;
                }
                flushSSEBuffer(false);
            }

            if (!clientDisconnected && !abortedBySseBufferLimit) {
                sseBuffer += decoder.decode();
                flushSSEBuffer(true);
                safeWriteDone();
            }

            safeEnd();

        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError' && clientDisconnected) {
                console.log("[AI] Client disconnected, upstream request aborted");
            } else if (error.name === 'AbortError' && abortedBySseBufferLimit) {
                // comment
            } else if (error.name === 'AbortError') {
                console.error("API request timed out");
                safeWrite({ error: "AI service timed out. Please retry later" });
            } else {
                console.error("Streaming response error:", error);
                safeWrite({ error: "Internal server error" });
            }
            safeEnd();
        } finally {
            clearTimeout(timeoutId);
            res.removeListener('close', handleClientClose);
        }
    });

    // comment
    app.options('/api/chat/stream', (_req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.status(200).end();
    });
});

// comment
cds.on('listening', ({ server, url }) => {
    const port = server.address().port;
    console.log(`[cds] - Server started: ${url}`);
    console.log(`[cds] - Open app: http://localhost:${port}/ai-chat-gui/webapp/index.html`);
});

// comment
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
        console.error("[cds] - Startup failed:", error.message);
        process.exit(1);
    }
};


