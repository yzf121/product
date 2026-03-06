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
    console: "readonly",
    __dirname: "readonly",
    module: "readonly",
    require: "readonly"
};

export default [
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
            ecmaVersion: 2022,
            sourceType: "script",
            globals: browserGlobals
        },
        rules: {
            "no-console": "off"
        }
    },
    {
        files: ["scripts/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: nodeGlobals
        },
        rules: {
            "no-console": "off"
        }
    }
];
