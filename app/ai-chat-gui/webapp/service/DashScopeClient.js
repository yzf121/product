sap.ui.define([
    "com/ai/assistant/aichatapp/service/AIConfig"
], function (AIConfig) {
    "use strict";

    var MAX_MESSAGE_LENGTH = 120000;
    var MAX_HISTORY_MESSAGES = 20;
    var MAX_SESSION_ID_LENGTH = 256;
    var MAX_ERROR_LENGTH = 300;

    function normalizeString(value) {
        return typeof value === "string" ? value.trim() : "";
    }

    function sanitizeMessageContent(value) {
        return normalizeString(value).slice(0, MAX_MESSAGE_LENGTH);
    }

    function normalizeSessionId(value) {
        return normalizeString(value).slice(0, MAX_SESSION_ID_LENGTH);
    }

    function normalizeMessages(rawMessages) {
        var allowedRoles = {
            user: true,
            assistant: true
        };

        if (!Array.isArray(rawMessages)) {
            return [];
        }

        return rawMessages
            .map(function (item) {
                if (!item || typeof item !== "object") {
                    return null;
                }

                var role = normalizeString(item.role).toLowerCase();
                var content = normalizeString(item.content);
                if (!allowedRoles[role] || !content) {
                    return null;
                }

                return {
                    role: role,
                    content: content.slice(0, MAX_MESSAGE_LENGTH)
                };
            })
            .filter(Boolean)
            .slice(-MAX_HISTORY_MESSAGES);
    }

    function buildApiUrl(endpoint, appId) {
        return normalizeString(endpoint).replace(/\/+$/, "") + "/apps/" + encodeURIComponent(appId) + "/completion";
    }

    function buildRequestBody(options) {
        var message = sanitizeMessageContent(options && options.message);
        var sessionId = normalizeSessionId(options && options.sessionId);
        var messages = normalizeMessages(options && options.messages);

        if (!message) {
            throw new Error("Message content cannot be empty");
        }

        if (sessionId) {
            return {
                input: {
                    prompt: message,
                    session_id: sessionId
                },
                parameters: {
                    incremental_output: true
                }
            };
        }

        if (messages.length > 0) {
            return {
                input: {
                    prompt: message,
                    messages: messages
                },
                parameters: {
                    incremental_output: true
                }
            };
        }

        return {
            input: {
                prompt: message
            },
            parameters: {
                incremental_output: true
            }
        };
    }

    function normalizeErrorMessage(value) {
        var compact = normalizeString(value).replace(/\s+/g, " ");
        if (!compact) {
            return "";
        }

        if (compact.length <= MAX_ERROR_LENGTH) {
            return compact;
        }

        return compact.slice(0, MAX_ERROR_LENGTH) + "...";
    }

    function extractUpstreamErrorMessage(data) {
        if (!data || typeof data !== "object") {
            return "";
        }

        var output = data.output && typeof data.output === "object" ? data.output : null;
        if (output && typeof output.text === "string" && output.text) {
            return "";
        }

        var candidates = [
            typeof data.error === "string" ? data.error : "",
            typeof data.message === "string" ? data.message : "",
            output && typeof output.error === "string" ? output.error : "",
            output && typeof output.error_message === "string" ? output.error_message : "",
            typeof data.code === "string" ? "Upstream error: " + data.code : "",
            typeof data.status_code === "number" ? "Upstream status: " + data.status_code : ""
        ];

        return normalizeErrorMessage(candidates.find(function (item) {
            return normalizeString(item);
        }));
    }

    function extractHttpErrorMessage(rawText, statusCode) {
        var normalizedRawText = normalizeString(rawText);
        if (!normalizedRawText) {
            return "AI service request failed (HTTP " + statusCode + ")";
        }

        try {
            var parsed = JSON.parse(normalizedRawText);
            var output = parsed && typeof parsed.output === "object" ? parsed.output : null;
            var candidates = [
                typeof parsed.error === "string" ? parsed.error : "",
                typeof parsed.message === "string" ? parsed.message : "",
                output && typeof output.error === "string" ? output.error : "",
                output && typeof output.error_message === "string" ? output.error_message : "",
                output && typeof output.text === "string" ? output.text : ""
            ];
            var matched = candidates.find(function (item) {
                return normalizeString(item);
            });
            if (matched) {
                return normalizeErrorMessage(matched);
            }
        } catch {
            // Ignore JSON parse failures and fall back to plain text.
        }

        return normalizeErrorMessage(normalizedRawText) || ("AI service request failed (HTTP " + statusCode + ")");
    }

    function createRequestContext(externalSignal, timeoutMs) {
        var controller = new AbortController();
        var timedOut = false;
        var cleanupTasks = [];

        if (externalSignal) {
            if (externalSignal.aborted) {
                controller.abort();
            } else {
                var onAbort = function () {
                    controller.abort();
                };
                externalSignal.addEventListener("abort", onAbort, { once: true });
                cleanupTasks.push(function () {
                    externalSignal.removeEventListener("abort", onAbort);
                });
            }
        }

        var timeoutId = setTimeout(function () {
            timedOut = true;
            controller.abort();
        }, timeoutMs);
        cleanupTasks.push(function () {
            clearTimeout(timeoutId);
        });

        return {
            signal: controller.signal,
            isTimedOut: function () {
                return timedOut;
            },
            cleanup: function () {
                cleanupTasks.forEach(function (task) {
                    task();
                });
                cleanupTasks = [];
            }
        };
    }

    function processEventBlock(eventBlock, onPayload) {
        var dataLines = String(eventBlock || "")
            .split("\n")
            .filter(function (line) {
                return line.indexOf("data:") === 0;
            })
            .map(function (line) {
                return line.slice(5).trim();
            });

        if (!dataLines.length) {
            return;
        }

        var payload = dataLines.join("\n").trim();
        if (!payload || payload === "[DONE]") {
            return;
        }

        try {
            onPayload(JSON.parse(payload));
        } catch {
            // Ignore incomplete payloads and continue reading.
        }
    }

    async function consumeSSE(responseBody, onPayload, onError) {
        var reader = responseBody.getReader();
        var decoder = new TextDecoder();
        var buffer = "";

        while (true) {
            var result;

            try {
                result = await reader.read();
            } catch (error) {
                if (typeof onError === "function") {
                    onError(error);
                    return;
                }
                throw error;
            }

            if (result.done) {
                break;
            }

            buffer += decoder.decode(result.value, { stream: true }).replace(/\r\n/g, "\n");

            var boundaryIndex = buffer.indexOf("\n\n");
            while (boundaryIndex !== -1) {
                var eventBlock = buffer.slice(0, boundaryIndex);
                buffer = buffer.slice(boundaryIndex + 2);
                processEventBlock(eventBlock, onPayload);
                boundaryIndex = buffer.indexOf("\n\n");
            }
        }

        buffer += decoder.decode();
        if (buffer.trim()) {
            processEventBlock(buffer, onPayload);
        }
    }

    async function streamChat(options) {
        var assistantConfig = AIConfig.getAssistantConfig(options && options.aiType);
        if (!assistantConfig.isReady) {
            throw new Error("AI configuration is incomplete. Please set API Key and App ID first");
        }

        var requestBody = buildRequestBody(options);
        var requestContext = createRequestContext(options && options.signal, assistantConfig.timeoutMs);

        try {
            var response = await fetch(buildApiUrl(assistantConfig.endpoint, assistantConfig.appId), {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + assistantConfig.apiKey,
                    "Content-Type": "application/json",
                    "X-DashScope-SSE": "enable"
                },
                body: JSON.stringify(requestBody),
                signal: requestContext.signal
            });

            if (!response.ok) {
                throw new Error(extractHttpErrorMessage(await response.text(), response.status));
            }

            if (!response.body) {
                throw new Error("Browser does not support streaming response");
            }

            await consumeSSE(
                response.body,
                function (payload) {
                    var upstreamError = extractUpstreamErrorMessage(payload);
                    if (upstreamError) {
                        if (options && typeof options.onData === "function") {
                            options.onData({ error: upstreamError });
                        }
                        return;
                    }

                    var output = payload.output && typeof payload.output === "object" ? payload.output : null;
                    if (output && typeof output.text === "string" && output.text && options && typeof options.onData === "function") {
                        options.onData({
                            text: output.text,
                            sessionId: output.session_id
                        });
                    }
                },
                options && typeof options.onError === "function" ? options.onError : null
            );

            if (options && typeof options.onDone === "function") {
                options.onDone();
            }
        } catch (error) {
            if (error && error.name === "AbortError" && requestContext.isTimedOut()) {
                throw new Error("AI service timed out. Please retry later");
            }

            throw error;
        } finally {
            requestContext.cleanup();
        }
    }

    return {
        streamChat: streamChat
    };
});
