sap.ui.define([], function () {
    "use strict";

    var GLOBAL_CONFIG_KEY = "__AI_CHAT_CONFIG__";
    var USER_CONFIG_STORAGE_KEY = "ai_chat_runtime_config_v1";
    var DEFAULT_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1";
    var DEFAULT_TIMEOUT_MS = 60000;
    var AI_TYPES = [
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

    var LEGACY_APP_ID_KEYS = {
        "abap-clean-core": "DASHSCOPE_APP_ID_ABAP",
        "cpi": "DASHSCOPE_APP_ID_CPI",
        "func-doc": "DASHSCOPE_APP_ID_FUNC_DOC",
        "fsd2tsd-i": "DASHSCOPE_APP_ID_FSD2TSD_I",
        "fsd2tsd-e": "DASHSCOPE_APP_ID_FSD2TSD_E",
        "tech-doc": "DASHSCOPE_APP_ID_TECH_DOC",
        "code-review": "DASHSCOPE_APP_ID_CODE_REVIEW",
        "unit-test": "DASHSCOPE_APP_ID_UNIT_TEST",
        "diagram": "DASHSCOPE_APP_ID_DIAGRAM"
    };

    var LEGACY_API_KEY_KEYS = {
        "fsd2tsd-i": "DASHSCOPE_API_KEY_FSD2TSD_I",
        "fsd2tsd-e": "DASHSCOPE_API_KEY_FSD2TSD_E"
    };

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function normalizeString(value) {
        return typeof value === "string" ? value.trim() : "";
    }

    function normalizeTimeout(value) {
        var parsed = Number.parseInt(value, 10);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
    }

    function createEmptyMap() {
        return AI_TYPES.reduce(function (result, aiType) {
            result[aiType] = "";
            return result;
        }, {});
    }

    function createDefaultConfig() {
        return {
            endpoint: DEFAULT_ENDPOINT,
            timeoutMs: DEFAULT_TIMEOUT_MS,
            defaultAppId: "",
            defaultApiKey: "",
            appIds: createEmptyMap(),
            apiKeys: createEmptyMap()
        };
    }

    function copyKnownKeys(target, source) {
        AI_TYPES.forEach(function (aiType) {
            target[aiType] = normalizeString(source && source[aiType]);
        });
        return target;
    }

    function normalizeMap(rawMap) {
        var result = createEmptyMap();
        if (rawMap && typeof rawMap === "object" && !Array.isArray(rawMap)) {
            copyKnownKeys(result, rawMap);
        }
        return result;
    }

    function normalizeLegacyMap(rawConfig, legacyKeyMap) {
        var result = createEmptyMap();
        AI_TYPES.forEach(function (aiType) {
            var legacyKey = legacyKeyMap[aiType];
            if (legacyKey) {
                result[aiType] = normalizeString(rawConfig && rawConfig[legacyKey]);
            }
        });
        return result;
    }

    function hasMeaningfulConfig(rawConfig) {
        if (!rawConfig || typeof rawConfig !== "object") {
            return false;
        }

        if (normalizeString(rawConfig.endpoint) || normalizeString(rawConfig.defaultAppId) || normalizeString(rawConfig.defaultApiKey)) {
            return true;
        }

        if (normalizeString(rawConfig.DASHSCOPE_APP_ID) || normalizeString(rawConfig.DASHSCOPE_API_KEY)) {
            return true;
        }

        return AI_TYPES.some(function (aiType) {
            return Boolean(
                normalizeString(rawConfig.appIds && rawConfig.appIds[aiType]) ||
                normalizeString(rawConfig.apiKeys && rawConfig.apiKeys[aiType]) ||
                normalizeString(rawConfig.assistantAppIds && rawConfig.assistantAppIds[aiType]) ||
                normalizeString(rawConfig.assistantApiKeys && rawConfig.assistantApiKeys[aiType]) ||
                normalizeString(rawConfig[LEGACY_APP_ID_KEYS[aiType]]) ||
                normalizeString(rawConfig[LEGACY_API_KEY_KEYS[aiType]])
            );
        });
    }

    function normalizeConfig(rawConfig) {
        var defaultConfig = createDefaultConfig();
        var config = rawConfig && typeof rawConfig === "object" ? rawConfig : {};
        var appIds = normalizeMap(config.appIds || config.assistantAppIds);
        var legacyAppIds = normalizeLegacyMap(config, LEGACY_APP_ID_KEYS);
        var apiKeys = normalizeMap(config.apiKeys || config.assistantApiKeys);
        var legacyApiKeys = normalizeLegacyMap(config, LEGACY_API_KEY_KEYS);

        AI_TYPES.forEach(function (aiType) {
            appIds[aiType] = appIds[aiType] || legacyAppIds[aiType];
            apiKeys[aiType] = apiKeys[aiType] || legacyApiKeys[aiType];
        });

        return {
            endpoint: normalizeString(config.endpoint) || defaultConfig.endpoint,
            timeoutMs: normalizeTimeout(config.timeoutMs),
            defaultAppId: normalizeString(config.defaultAppId) || normalizeString(config.DASHSCOPE_APP_ID),
            defaultApiKey: normalizeString(config.defaultApiKey) || normalizeString(config.DASHSCOPE_API_KEY),
            appIds: appIds,
            apiKeys: apiKeys
        };
    }

    function mergeMaps(baseMap, overrideMap) {
        var result = createEmptyMap();
        AI_TYPES.forEach(function (aiType) {
            result[aiType] = normalizeString(overrideMap && overrideMap[aiType]) || normalizeString(baseMap && baseMap[aiType]);
        });
        return result;
    }

    function mergeConfig(baseConfig, overrideConfig) {
        var base = normalizeConfig(baseConfig);
        var override = normalizeConfig(overrideConfig);

        return {
            endpoint: normalizeString(override.endpoint) || normalizeString(base.endpoint) || DEFAULT_ENDPOINT,
            timeoutMs: normalizeTimeout(override.timeoutMs || base.timeoutMs),
            defaultAppId: normalizeString(override.defaultAppId) || normalizeString(base.defaultAppId),
            defaultApiKey: normalizeString(override.defaultApiKey) || normalizeString(base.defaultApiKey),
            appIds: mergeMaps(base.appIds, override.appIds),
            apiKeys: mergeMaps(base.apiKeys, override.apiKeys)
        };
    }

    function getWindowConfig() {
        var config = window[GLOBAL_CONFIG_KEY];
        return hasMeaningfulConfig(config) ? normalizeConfig(config) : createDefaultConfig();
    }

    function getUserConfig() {
        try {
            var rawValue = localStorage.getItem(USER_CONFIG_STORAGE_KEY);
            if (!rawValue) {
                return null;
            }

            var parsed = JSON.parse(rawValue);
            if (!parsed || typeof parsed !== "object") {
                return null;
            }

            return normalizeConfig(parsed);
        } catch {
            return null;
        }
    }

    function getEffectiveConfig() {
        var fileConfig = getWindowConfig();
        var userConfig = getUserConfig();

        if (!userConfig) {
            return fileConfig;
        }

        return mergeConfig(fileConfig, userConfig);
    }

    function getAssistantConfig(aiType) {
        var config = getEffectiveConfig();
        var normalizedType = normalizeString(aiType);
        var appId = normalizeString(config.appIds[normalizedType]) || config.defaultAppId;
        var apiKey = normalizeString(config.apiKeys[normalizedType]) || config.defaultApiKey;

        return {
            endpoint: config.endpoint,
            timeoutMs: config.timeoutMs,
            appId: appId,
            apiKey: apiKey,
            isReady: Boolean(appId && apiKey)
        };
    }

    function hasAnyUsableConfig() {
        return AI_TYPES.some(function (aiType) {
            return getAssistantConfig(aiType).isReady;
        });
    }

    function getStatus() {
        var fileConfig = getWindowConfig();
        var userConfig = getUserConfig();
        var effectiveConfig = userConfig ? mergeConfig(fileConfig, userConfig) : fileConfig;

        return {
            isReady: hasAnyUsableConfig(),
            hasFileConfig: hasMeaningfulConfig(window[GLOBAL_CONFIG_KEY]),
            hasUserOverride: Boolean(userConfig),
            effectiveConfig: effectiveConfig
        };
    }

    function saveUserConfig(rawConfig) {
        var normalizedConfig = normalizeConfig(rawConfig);
        localStorage.setItem(USER_CONFIG_STORAGE_KEY, JSON.stringify(normalizedConfig));
        return normalizedConfig;
    }

    function clearUserConfig() {
        localStorage.removeItem(USER_CONFIG_STORAGE_KEY);
    }

    function getEditableConfig() {
        return clone(getEffectiveConfig());
    }

    function toPrettyJson(value) {
        return JSON.stringify(value || {}, null, 2);
    }

    return {
        AI_TYPES: AI_TYPES.slice(),
        USER_CONFIG_STORAGE_KEY: USER_CONFIG_STORAGE_KEY,
        createDefaultConfig: createDefaultConfig,
        normalizeConfig: normalizeConfig,
        getConfig: getEffectiveConfig,
        getAssistantConfig: getAssistantConfig,
        getStatus: getStatus,
        hasAnyUsableConfig: hasAnyUsableConfig,
        getEditableConfig: getEditableConfig,
        saveUserConfig: saveUserConfig,
        clearUserConfig: clearUserConfig,
        toPrettyJson: toPrettyJson
    };
});
