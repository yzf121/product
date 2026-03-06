#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");
const outputPath = path.join(projectRoot, "app", "ai-chat-gui", "webapp", "config", "ai-config.js");

const DEFAULT_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1";
const DEFAULT_TIMEOUT_MS = 60000;

const APP_ID_KEYS = {
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

const API_KEY_KEYS = {
    "abap-clean-core": "DASHSCOPE_API_KEY_ABAP",
    "cpi": "DASHSCOPE_API_KEY_CPI",
    "func-doc": "DASHSCOPE_API_KEY_FUNC_DOC",
    "fsd2tsd-i": "DASHSCOPE_API_KEY_FSD2TSD_I",
    "fsd2tsd-e": "DASHSCOPE_API_KEY_FSD2TSD_E",
    "tech-doc": "DASHSCOPE_API_KEY_TECH_DOC",
    "code-review": "DASHSCOPE_API_KEY_CODE_REVIEW",
    "unit-test": "DASHSCOPE_API_KEY_UNIT_TEST",
    "diagram": "DASHSCOPE_API_KEY_DIAGRAM"
};

function parseEnvValue(rawValue) {
    const trimmed = String(rawValue || "").trim();
    if (!trimmed) {
        return "";
    }

    if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }

    return trimmed;
}

function parseEnvFile(content) {
    return String(content || "")
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .reduce((result, line) => {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith("#")) {
                return result;
            }

            const normalizedLine = trimmedLine.startsWith("export ") ? trimmedLine.slice(7) : trimmedLine;
            const separatorIndex = normalizedLine.indexOf("=");
            if (separatorIndex <= 0) {
                return result;
            }

            const key = normalizedLine.slice(0, separatorIndex).trim();
            const value = parseEnvValue(normalizedLine.slice(separatorIndex + 1));
            if (key) {
                result[key] = value;
            }
            return result;
        }, {});
}

function readEnvConfig(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Missing .env file: ${filePath}`);
    }

    return parseEnvFile(fs.readFileSync(filePath, "utf8"));
}

function normalizeTimeout(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function buildConfig(envConfig) {
    const appIds = {};
    const apiKeys = {};

    Object.entries(APP_ID_KEYS).forEach(([aiType, envKey]) => {
        appIds[aiType] = envConfig[envKey] || "";
    });

    Object.entries(API_KEY_KEYS).forEach(([aiType, envKey]) => {
        apiKeys[aiType] = envConfig[envKey] || "";
    });

    return {
        endpoint: envConfig.DASHSCOPE_ENDPOINT || DEFAULT_ENDPOINT,
        devProxyPath: envConfig.DASHSCOPE_DEV_PROXY_PATH || "/dashscope-api",
        timeoutMs: normalizeTimeout(envConfig.DASHSCOPE_TIMEOUT_MS || envConfig.API_TIMEOUT),
        defaultAppId: envConfig.DASHSCOPE_APP_ID || envConfig.DASHSCOPE_APP_ID_ABAP || "",
        defaultApiKey: envConfig.DASHSCOPE_API_KEY || "",
        appIds,
        apiKeys
    };
}

function toConfigFileContent(config) {
    return `(function (global) {
    "use strict";

    // Generated from .env by scripts/migrate-env-to-ai-config.js
    global.__AI_CHAT_CONFIG__ = Object.assign({}, global.__AI_CHAT_CONFIG__, ${JSON.stringify(config, null, 4).replace(/\n/g, "\n    ")});
})(window);
`;
}

function main() {
    const envConfig = readEnvConfig(envPath);
    const finalConfig = buildConfig(envConfig);
    const fileContent = toConfigFileContent(finalConfig);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, fileContent, "utf8");

    console.log(`[migrate] Generated ${path.relative(projectRoot, outputPath)} from .env`);
}

main();
