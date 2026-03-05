import cds from "@sap/cds/eslint.config.mjs";

const browserGlobals = {
    window: "readonly",
    document: "readonly",
    navigator: "readonly",
    localStorage: "readonly",
    fetch: "readonly",
    AbortController: "readonly",
    TextDecoder: "readonly",
    FileReader: "readonly",
    Blob: "readonly",
    ClipboardItem: "readonly",
    Image: "readonly",
    URL: "readonly",
    XMLSerializer: "readonly",
    setTimeout: "readonly",
    clearTimeout: "readonly",
    console: "readonly",
    mermaid: "readonly",
    marked: "readonly",
    hljs: "readonly",
    sap: "readonly"
};

const nodeGlobals = {
    process: "readonly",
    fetch: "readonly",
    AbortController: "readonly",
    TextDecoder: "readonly",
    setTimeout: "readonly",
    clearTimeout: "readonly",
    console: "readonly"
};

export default [
    ...cds.recommended,
    {
        ignores: [
            "app/ai-chat-gui/dist/**",
            "app/ai-chat-gui/webapp/lib/**",
            "node_modules/**",
            "gen/**"
        ]
    },
    {
        files: ["app/ai-chat-gui/webapp/**/*.js"],
        languageOptions: {
            globals: browserGlobals
        },
        rules: {
            "no-console": "off"
        }
    },
    {
        files: ["srv/**/*.js"],
        languageOptions: {
            globals: nodeGlobals
        },
        rules: {
            "no-console": "off"
        }
    }
];
