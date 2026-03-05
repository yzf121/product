#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const mbtLauncher = path.join(projectRoot, "node_modules", "mbt", "bin", "mbt");

function run(command, args) {
    return spawnSync(command, args, {
        cwd: projectRoot,
        encoding: "utf8"
    });
}

function commandExists(command) {
    const checker = process.platform === "win32" ? "where.exe" : "which";
    return run(checker, [command]).status === 0;
}

function resolveMakeBinDir() {
    if (commandExists("make")) {
        return "";
    }

    if (process.platform === "win32") {
        const candidates = [
            "C:\\Program Files (x86)\\GnuWin32\\bin\\make.exe",
            "C:\\Program Files\\GnuWin32\\bin\\make.exe"
        ];
        for (const fullPath of candidates) {
            if (fs.existsSync(fullPath)) {
                return path.dirname(fullPath);
            }
        }
    }

    return null;
}

function checkNodeVersion() {
    const major = Number.parseInt(process.versions.node.split(".")[0], 10);
    if (Number.isNaN(major) || major < 18) {
        return {
            ok: false,
            detail: `Node.js ${process.versions.node} is below required version 18`
        };
    }

    const recommendedLtsMajors = new Set([18, 20, 22]);
    if (!recommendedLtsMajors.has(major)) {
        return {
            ok: true,
            detail: `Node.js ${process.versions.node} (recommended LTS majors: 18/20/22)`
        };
    }

    return {
        ok: true,
        detail: `Node.js ${process.versions.node}`
    };
}

function checkMbtLauncher() {
    if (!fs.existsSync(mbtLauncher)) {
        return {
            ok: false,
            detail: "Local mbt launcher missing (run `npm install`)"
        };
    }
    const result = run(process.execPath, [mbtLauncher, "-v"]);
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    return {
        ok: result.status === 0,
        detail: output || "mbt version check failed"
    };
}

function checkMake() {
    const makeDir = resolveMakeBinDir();
    if (makeDir === "") {
        return {
            ok: true,
            detail: "`make` found in PATH"
        };
    }

    if (makeDir) {
        return {
            ok: true,
            detail: `Found make in default install location: ${makeDir}`
        };
    }

    return {
        ok: false,
        detail: "GNU make not found (Windows suggestion: `winget install --id GnuWin32.Make --exact`)"
    };
}

function printResult(label, result) {
    const prefix = result.ok ? "[OK] " : "[FAIL] ";
    console.log(`${prefix}${label}: ${result.detail}`);
}

function main() {
    const checks = [
        ["Node", checkNodeVersion()],
        ["mbt", checkMbtLauncher()],
        ["make", checkMake()]
    ];

    checks.forEach(([label, result]) => printResult(label, result));

    const hasFailure = checks.some(([, result]) => !result.ok);
    process.exit(hasFailure ? 1 : 0);
}

main();
