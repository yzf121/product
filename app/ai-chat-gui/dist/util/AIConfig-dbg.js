sap.ui.define([], function () {
    "use strict";

    var STORAGE_KEY = "ai_chat_runtime_config_v1";
    var DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/api/v1/apps";

    var KNOWN_ASSISTANT_TYPES = [
        "abap-clean-core",
        "cpi",
        "func-doc",
        "fsd2tsd-i",
        "fsd2tsd-e",
        "tech-doc",
        "code-review",
        "unit-test",
        "diagram"
    ];

    function normalizeString(vValue) {
        if (typeof vValue !== "string") {
            return "";
        }
        return vValue.trim();
    }

    function normalizePositiveInt(vValue, nFallback) {
        var nValue = Number.parseInt(vValue, 10);
        if (!Number.isInteger(nValue) || nValue <= 0) {
            return nFallback;
        }
        return nValue;
    }

    function normalizeAssistantMap(vMap) {
        var oNormalizedMap = {};
        if (!vMap || typeof vMap !== "object") {
            return oNormalizedMap;
        }

        Object.keys(vMap).forEach(function (sKey) {
            var sValue = normalizeString(vMap[sKey]);
            if (sValue) {
                oNormalizedMap[sKey] = sValue;
            }
        });

        return oNormalizedMap;
    }

    function readGlobalConfig() {
        if (typeof window === "undefined") {
            return {};
        }
        if (!window.AI_CHAT_CONFIG || typeof window.AI_CHAT_CONFIG !== "object") {
            return {};
        }
        return window.AI_CHAT_CONFIG;
    }

    function readStorageConfig() {
        if (typeof localStorage === "undefined") {
            return {};
        }

        try {
            var sRaw = localStorage.getItem(STORAGE_KEY);
            if (!sRaw) {
                return {};
            }

            var oParsed = JSON.parse(sRaw);
            if (!oParsed || typeof oParsed !== "object") {
                return {};
            }

            return oParsed;
        } catch {
            return {};
        }
    }

    function toMergedConfig(oBaseConfig, oOverrideConfig) {
        var oResult = {
            baseUrl: normalizeString(oBaseConfig.baseUrl),
            defaultAppId: normalizeString(oBaseConfig.defaultAppId),
            defaultApiKey: normalizeString(oBaseConfig.defaultApiKey),
            requestTimeoutMs: normalizePositiveInt(oBaseConfig.requestTimeoutMs, 60000),
            assistantAppIds: normalizeAssistantMap(oBaseConfig.assistantAppIds),
            assistantApiKeys: normalizeAssistantMap(oBaseConfig.assistantApiKeys)
        };

        if (!oOverrideConfig || typeof oOverrideConfig !== "object") {
            return oResult;
        }

        if (typeof oOverrideConfig.baseUrl === "string") {
            oResult.baseUrl = normalizeString(oOverrideConfig.baseUrl);
        }

        if (typeof oOverrideConfig.defaultAppId === "string") {
            oResult.defaultAppId = normalizeString(oOverrideConfig.defaultAppId);
        }

        if (typeof oOverrideConfig.defaultApiKey === "string") {
            oResult.defaultApiKey = normalizeString(oOverrideConfig.defaultApiKey);
        }

        if (oOverrideConfig.requestTimeoutMs !== undefined) {
            oResult.requestTimeoutMs = normalizePositiveInt(oOverrideConfig.requestTimeoutMs, oResult.requestTimeoutMs);
        }

        var oOverrideAppIds = normalizeAssistantMap(oOverrideConfig.assistantAppIds);
        var oOverrideApiKeys = normalizeAssistantMap(oOverrideConfig.assistantApiKeys);
        oResult.assistantAppIds = Object.assign({}, oResult.assistantAppIds, oOverrideAppIds);
        oResult.assistantApiKeys = Object.assign({}, oResult.assistantApiKeys, oOverrideApiKeys);

        return oResult;
    }

    function buildConfig() {
        var oConfig = toMergedConfig({
            baseUrl: DEFAULT_BASE_URL,
            defaultAppId: "",
            defaultApiKey: "",
            requestTimeoutMs: 60000,
            assistantAppIds: {},
            assistantApiKeys: {}
        }, readGlobalConfig());

        oConfig = toMergedConfig(oConfig, readStorageConfig());

        if (!oConfig.baseUrl) {
            oConfig.baseUrl = DEFAULT_BASE_URL;
        }

        oConfig.baseUrl = oConfig.baseUrl.replace(/\/+$/, "");

        return oConfig;
    }

    function normalizeAiType(sAiType) {
        var sType = normalizeString(sAiType);
        return sType || "abap-clean-core";
    }

    function getAssistantRuntime(sAiType) {
        var oConfig = buildConfig();
        var sType = normalizeAiType(sAiType);

        var sAppId = oConfig.assistantAppIds[sType] || oConfig.defaultAppId;
        var sApiKey = oConfig.assistantApiKeys[sType] || oConfig.defaultApiKey;

        return {
            aiType: sType,
            appId: sAppId,
            apiKey: sApiKey,
            config: oConfig
        };
    }

    function getMissingConfigFields(sAiType) {
        var oRuntime = getAssistantRuntime(sAiType);
        var sType = oRuntime.aiType;
        var aMissing = [];

        if (!oRuntime.appId) {
            aMissing.push("defaultAppId or assistantAppIds." + sType);
        }

        if (!oRuntime.apiKey) {
            aMissing.push("defaultApiKey or assistantApiKeys." + sType);
        }

        return aMissing;
    }

    function buildMissingConfigMessage(sAiType) {
        var aMissing = getMissingConfigFields(sAiType);
        if (!aMissing.length) {
            return "";
        }

        return "AI runtime configuration is incomplete. Missing: " +
            aMissing.join(", ") +
            ". Configure webapp/config/ai-config.js before deployment.";
    }

    function saveRuntimeOverrides(oOverrides) {
        if (typeof localStorage === "undefined") {
            return false;
        }

        var oSafeOverrides = toMergedConfig({
            baseUrl: DEFAULT_BASE_URL,
            defaultAppId: "",
            defaultApiKey: "",
            requestTimeoutMs: 60000,
            assistantAppIds: {},
            assistantApiKeys: {}
        }, oOverrides || {});

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(oSafeOverrides));
            return true;
        } catch {
            return false;
        }
    }

    function clearRuntimeOverrides() {
        if (typeof localStorage === "undefined") {
            return false;
        }

        try {
            localStorage.removeItem(STORAGE_KEY);
            return true;
        } catch {
            return false;
        }
    }

    return {
        KNOWN_ASSISTANT_TYPES: KNOWN_ASSISTANT_TYPES,
        STORAGE_KEY: STORAGE_KEY,
        getConfig: buildConfig,
        getAssistantRuntime: getAssistantRuntime,
        getMissingConfigFields: getMissingConfigFields,
        buildMissingConfigMessage: buildMissingConfigMessage,
        saveRuntimeOverrides: saveRuntimeOverrides,
        clearRuntimeOverrides: clearRuntimeOverrides
    };
});
