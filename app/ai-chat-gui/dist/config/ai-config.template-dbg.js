(function (global) {
    "use strict";

    global.__AI_CHAT_CONFIG__ = Object.assign({}, global.__AI_CHAT_CONFIG__, {
        endpoint: "https://dashscope.aliyuncs.com/api/v1",
        devProxyPath: "/dashscope-api",
        timeoutMs: 60000,
        defaultAppId: "replace-with-your-default-app-id",
        defaultApiKey: "replace-with-your-default-api-key",
        appIds: {
            "abap-clean-core": "",
            "cpi": "",
            "func-doc": "",
            "fsd2tsd-i": "",
            "fsd2tsd-e": "",
            "tech-doc": "",
            "code-review": "",
            "unit-test": "",
            "diagram": ""
        },
        apiKeys: {
            "abap-clean-core": "",
            "cpi": "",
            "func-doc": "",
            "fsd2tsd-i": "",
            "fsd2tsd-e": "",
            "tech-doc": "",
            "code-review": "",
            "unit-test": "",
            "diagram": ""
        }
    });
})(window);
