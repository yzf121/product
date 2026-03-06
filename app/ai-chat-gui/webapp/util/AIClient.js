sap.ui.define([
    "com/ai/assistant/aichatapp/util/Utils",
    "com/ai/assistant/aichatapp/util/AIConfig"
], function (Utils, AIConfig) {
    "use strict";

    var CHAT_MESSAGE_MAX_LENGTH = 120000;
    var CHAT_HISTORY_MAX_MESSAGES = 20;
    var CHAT_SESSION_ID_MAX_LENGTH = 256;
    var CHAT_UPSTREAM_ERROR_MAX_LENGTH = 300;

    function sanitizeMessageContent(vMessage) {
        if (typeof vMessage !== "string") {
            return "";
        }
        return vMessage.trim().slice(0, CHAT_MESSAGE_MAX_LENGTH);
    }

    function normalizeSessionId(vSessionId) {
        if (typeof vSessionId !== "string") {
            return "";
        }
        return vSessionId.trim().slice(0, CHAT_SESSION_ID_MAX_LENGTH);
    }

    function normalizeMessages(aRawMessages) {
        if (!Array.isArray(aRawMessages)) {
            return [];
        }

        var oAllowedRoles = {
            user: true,
            assistant: true
        };

        return aRawMessages.map(function (oItem) {
            if (!oItem || typeof oItem !== "object") {
                return null;
            }

            var sRole = typeof oItem.role === "string" ? oItem.role.trim().toLowerCase() : "";
            var sContent = typeof oItem.content === "string" ? oItem.content.trim() : "";

            if (!oAllowedRoles[sRole] || !sContent) {
                return null;
            }

            return {
                role: sRole,
                content: sContent.slice(0, CHAT_MESSAGE_MAX_LENGTH)
            };
        }).filter(Boolean).slice(-CHAT_HISTORY_MAX_MESSAGES);
    }

    function normalizeErrorMessage(vValue) {
        if (typeof vValue !== "string") {
            return "";
        }

        var sCompact = vValue.replace(/\s+/g, " ").trim();
        if (!sCompact) {
            return "";
        }

        if (sCompact.length <= CHAT_UPSTREAM_ERROR_MAX_LENGTH) {
            return sCompact;
        }

        return sCompact.slice(0, CHAT_UPSTREAM_ERROR_MAX_LENGTH) + "...";
    }

    function extractHttpErrorMessage(sRawText, nStatusCode) {
        var sSafeText = typeof sRawText === "string" ? sRawText.trim() : "";
        if (!sSafeText) {
            return "AI service request failed (HTTP " + nStatusCode + ")";
        }

        try {
            var oParsed = JSON.parse(sSafeText);
            var oOutput = oParsed && typeof oParsed.output === "object" ? oParsed.output : null;
            var aCandidates = [
                typeof oParsed.error === "string" ? oParsed.error : "",
                typeof oParsed.message === "string" ? oParsed.message : "",
                oOutput && typeof oOutput.error === "string" ? oOutput.error : "",
                oOutput && typeof oOutput.error_message === "string" ? oOutput.error_message : "",
                oOutput && typeof oOutput.text === "string" ? oOutput.text : ""
            ];

            var sMatched = aCandidates.find(function (sText) {
                return Boolean(normalizeErrorMessage(sText));
            });
            var sNormalized = normalizeErrorMessage(sMatched);
            if (sNormalized) {
                return sNormalized;
            }
        } catch {
            // If payload is not JSON, fallback to plain text.
        }

        var sPlainTextError = normalizeErrorMessage(sSafeText);
        if (sPlainTextError) {
            return sPlainTextError;
        }

        return "AI service request failed (HTTP " + nStatusCode + ")";
    }

    function extractUpstreamErrorMessage(oData) {
        if (!oData || typeof oData !== "object") {
            return "";
        }

        var oOutput = oData.output && typeof oData.output === "object" ? oData.output : null;
        if (oOutput && typeof oOutput.text === "string" && oOutput.text) {
            return "";
        }

        var aCandidates = [
            typeof oData.error === "string" ? oData.error : "",
            typeof oData.message === "string" ? oData.message : "",
            oOutput && typeof oOutput.error === "string" ? oOutput.error : "",
            oOutput && typeof oOutput.error_message === "string" ? oOutput.error_message : "",
            typeof oData.code === "string" ? "Upstream error: " + oData.code : "",
            typeof oData.status_code === "number" ? "Upstream status: " + oData.status_code : ""
        ];

        var sMatched = aCandidates.find(function (sText) {
            return Boolean(normalizeErrorMessage(sText));
        });

        return normalizeErrorMessage(sMatched);
    }

    function toStreamChunk(oUpstreamData) {
        var sUpstreamError = extractUpstreamErrorMessage(oUpstreamData);
        if (sUpstreamError) {
            return {
                error: sUpstreamError
            };
        }

        var oOutput = oUpstreamData && typeof oUpstreamData.output === "object" ? oUpstreamData.output : null;
        if (!oOutput) {
            return null;
        }

        var sText = typeof oOutput.text === "string" ? oOutput.text : "";
        var sSessionId = typeof oOutput.session_id === "string" ? oOutput.session_id : "";

        if (!sText && !sSessionId) {
            return null;
        }

        var oChunk = {};
        if (sText) {
            oChunk.text = sText;
        }
        if (sSessionId) {
            oChunk.sessionId = sSessionId;
        }

        return oChunk;
    }

    function buildDashScopeRequestBody(oPayload, sMessage) {
        var oBody = {
            input: {
                prompt: sMessage
            },
            parameters: {
                incremental_output: true
            }
        };

        var sSessionId = normalizeSessionId(oPayload.sessionId);
        if (sSessionId) {
            oBody.input.session_id = sSessionId;
            return oBody;
        }

        var aMessages = normalizeMessages(oPayload.messages);
        if (aMessages.length > 0) {
            oBody.input.messages = aMessages;
        }

        return oBody;
    }

    function buildApiUrl(sBaseUrl, sAppId) {
        return sBaseUrl + "/" + encodeURIComponent(sAppId) + "/completion";
    }

    function createConfigError(sAiType) {
        var oError = new Error(AIConfig.buildMissingConfigMessage(sAiType));
        oError.code = "AI_CONFIG_MISSING";
        return oError;
    }

    function createTimeoutError() {
        var oError = new Error("AI service timed out. Please retry later");
        oError.code = "AI_TIMEOUT";
        return oError;
    }

    function createMessageError() {
        var oError = new Error("Message content cannot be empty");
        oError.code = "AI_MESSAGE_EMPTY";
        return oError;
    }

    function streamChat(oPayload, oOptions) {
        var oSafePayload = oPayload || {};
        var oSafeOptions = oOptions || {};
        var oRuntime = AIConfig.getAssistantRuntime(oSafePayload.aiType);
        var aMissingConfig = AIConfig.getMissingConfigFields(oRuntime.aiType);
        if (aMissingConfig.length) {
            return Promise.reject(createConfigError(oRuntime.aiType));
        }

        var sMessage = sanitizeMessageContent(oSafePayload.message);
        if (!sMessage) {
            return Promise.reject(createMessageError());
        }

        var oRequestBody = buildDashScopeRequestBody(oSafePayload, sMessage);
        var sApiUrl = buildApiUrl(oRuntime.config.baseUrl, oRuntime.appId);

        var oRequestController = new AbortController();
        var bTimedOut = false;

        var fnOnExternalAbort = null;
        var oExternalSignal = oSafeOptions.signal;
        if (oExternalSignal) {
            if (oExternalSignal.aborted) {
                oRequestController.abort();
            } else {
                fnOnExternalAbort = function () {
                    oRequestController.abort();
                };
                oExternalSignal.addEventListener("abort", fnOnExternalAbort, { once: true });
            }
        }

        var nTimeoutMs = oRuntime.config.requestTimeoutMs;
        var iTimeout = setTimeout(function () {
            bTimedOut = true;
            oRequestController.abort();
        }, nTimeoutMs);

        return fetch(sApiUrl, {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + oRuntime.apiKey,
                "Content-Type": "application/json",
                "X-DashScope-SSE": "enable"
            },
            body: JSON.stringify(oRequestBody),
            signal: oRequestController.signal
        }).then(function (oResponse) {
            if (!oResponse.ok) {
                return oResponse.text().then(function (sErrorText) {
                    throw new Error(extractHttpErrorMessage(sErrorText, oResponse.status));
                });
            }

            if (!oResponse.body) {
                throw new Error("Server does not support streaming response");
            }

            return Utils.parseSSEStream(oResponse, {
                onData: function (oUpstreamData) {
                    var oChunk = toStreamChunk(oUpstreamData);
                    if (oChunk && oSafeOptions.onData) {
                        oSafeOptions.onData(oChunk);
                    }
                },
                onDone: function () {
                    if (oSafeOptions.onDone) {
                        oSafeOptions.onDone();
                    }
                },
                onError: function (oError) {
                    if (oSafeOptions.onError) {
                        oSafeOptions.onError(oError);
                    }
                }
            });
        }).catch(function (oError) {
            if (oError && oError.name === "AbortError" && bTimedOut) {
                throw createTimeoutError();
            }
            throw oError;
        }).finally(function () {
            clearTimeout(iTimeout);
            if (oExternalSignal && fnOnExternalAbort) {
                oExternalSignal.removeEventListener("abort", fnOnExternalAbort);
            }
        });
    }

    return {
        streamChat: streamChat,
        getMissingConfigFields: AIConfig.getMissingConfigFields,
        buildMissingConfigMessage: AIConfig.buildMissingConfigMessage
    };
});
