#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

function quoteCmdArg(value) {
    if (value === "") {
        return "\"\"";
    }

    if (!/[\s"&()^<>|]/.test(value)) {
        return value;
    }

    return `"${value.replace(/(["^])/g, "^$1")}"`;
}

function runStep(label, command, args, useCmdShim = false) {
    console.log(`[verify] ${label}`);
    const result = useCmdShim
        ? spawnSync(process.env.ComSpec || "cmd.exe", [
            "/d",
            "/s",
            "/c",
            [command, ...args].map(quoteCmdArg).join(" ")
        ], {
            cwd: projectRoot,
            stdio: "inherit"
        })
        : spawnSync(command, args, {
            cwd: projectRoot,
            stdio: "inherit"
        });

    if (result.error) {
        console.error(`[verify] Failed to start command: ${result.error.message}`);
        process.exit(1);
    }

    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

function npmCmd() {
    return "npm";
}

function main() {
    const useCmdShim = process.platform === "win32";

    runStep("Run lint", npmCmd(), ["run", "lint"], useCmdShim);

    const syntaxTargets = [
        "app/ai-chat-gui/webapp/controller/Main.controller.js",
        "app/ai-chat-gui/webapp/controller/Diagram.controller.js",
        "app/ai-chat-gui/webapp/controller/Home.controller.js",
        "app/ai-chat-gui/webapp/service/AIConfig.js",
        "app/ai-chat-gui/webapp/service/DashScopeClient.js",
        "app/ai-chat-gui/webapp/Component.js",
        "app/ai-chat-gui/webapp/util/Utils.js"
    ];

    syntaxTargets.forEach((target) => {
        runStep(`Syntax check ${target}`, process.execPath, ["--check", target]);
    });

    runStep("Build UI5 app", npmCmd(), ["--workspace", "app/ai-chat-gui", "run", "build"], useCmdShim);

    console.log("[verify] All checks passed.");
}

main();
