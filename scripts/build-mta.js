#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const realProjectRoot = path.resolve(__dirname, "..");
const mbtArgs = process.argv.slice(2);

function containsComplexPathChars(value) {
    return /\s/.test(value) || /[^\x00-\x7F]/.test(value);
}

function tryCreateSubstWorkspace(targetPath) {
    if (process.platform !== "win32") {
        return null;
    }

    const candidates = ["Z", "Y", "X", "W", "V", "U", "T", "S"];
    for (const letter of candidates) {
        const driveRoot = `${letter}:\\`;
        if (fs.existsSync(driveRoot)) {
            continue;
        }

        const result = spawnSync("cmd.exe", ["/d", "/c", "subst", `${letter}:`, targetPath], {
            encoding: "utf8"
        });

        if (result.status === 0) {
            return { drive: `${letter}:`, root: driveRoot };
        }
    }

    return null;
}

function removeSubstWorkspace(substDrive) {
    if (!substDrive || process.platform !== "win32") {
        return;
    }
    spawnSync("cmd.exe", ["/d", "/c", "subst", substDrive, "/d"], {
        encoding: "utf8"
    });
}

function createContext() {
    let workspaceRoot = realProjectRoot;
    let substDrive = null;

    if (containsComplexPathChars(realProjectRoot)) {
        const alias = tryCreateSubstWorkspace(realProjectRoot);
        if (alias) {
            workspaceRoot = alias.root;
            substDrive = alias.drive;
            console.warn(`[build:mta] Workspace path contains spaces/unicode, using temporary alias ${alias.drive}`);
        } else {
            console.warn("[build:mta] Could not create temporary drive alias; fallback to original path.");
        }
    }

    const mbtLauncher = path.join(workspaceRoot, "node_modules", "mbt", "bin", "mbt");
    return {
        workspaceRoot,
        mbtLauncher,
        substDrive
    };
}

function run(ctx, command, args, options = {}) {
    return spawnSync(command, args, {
        cwd: ctx.workspaceRoot,
        encoding: "utf8",
        ...options
    });
}

function printOutput(result) {
    if (result.stdout) {
        process.stdout.write(result.stdout);
    }
    if (result.stderr) {
        process.stderr.write(result.stderr);
    }
}

function commandExists(ctx, command) {
    const checker = process.platform === "win32" ? "where.exe" : "which";
    const result = run(ctx, checker, [command]);
    return result.status === 0;
}

function resolveMakeBinDir(ctx) {
    if (commandExists(ctx, "make")) {
        return null;
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

function buildEnv(ctx) {
    const env = { ...process.env };
    const extraMakeBinDir = resolveMakeBinDir(ctx);

    if (!commandExists(ctx, "make") && !extraMakeBinDir) {
        return { env, missingMake: true };
    }

    if (extraMakeBinDir) {
        env.PATH = `${extraMakeBinDir}${path.delimiter}${env.PATH || ""}`;
    }

    return { env, missingMake: false };
}

function runMbt(ctx, env) {
    const result = run(ctx, process.execPath, [ctx.mbtLauncher, ...mbtArgs], { env });
    printOutput(result);
    return result;
}

function needsMbtRepair(result) {
    const payload = `${result.stdout || ""}\n${result.stderr || ""}\n${result.error ? result.error.message : ""}`.toLowerCase();
    return process.platform === "win32" && (
        payload.includes("spawn eftype") ||
        payload.includes("not a valid application for this os platform")
    );
}

function showMissingMakeHint() {
    console.error("[build:mta] Missing required dependency: GNU make");
    if (process.platform === "win32") {
        console.error("[build:mta] Install suggestion (PowerShell): winget install --id GnuWin32.Make --exact");
        console.error("[build:mta] Or ensure `make.exe` is available in PATH.");
    } else {
        console.error("[build:mta] Install suggestion: apt/yum/brew install make");
    }
}

function exitWithCleanup(code, ctx) {
    removeSubstWorkspace(ctx.substDrive);
    process.exit(code);
}

function main() {
    if (!mbtArgs.length) {
        console.error("[build:mta] Missing mbt arguments. Example: node scripts/build-mta.js build --mtar archive");
        process.exit(1);
    }

    const ctx = createContext();
    if (!fs.existsSync(ctx.mbtLauncher)) {
        console.error(`[build:mta] Cannot find local mbt launcher: ${ctx.mbtLauncher}`);
        console.error("[build:mta] Run `npm install` first.");
        exitWithCleanup(1, ctx);
    }

    const { env, missingMake } = buildEnv(ctx);
    if (missingMake) {
        showMissingMakeHint();
        exitWithCleanup(1, ctx);
    }

    let result = runMbt(ctx, env);
    if (result.status === 0) {
        exitWithCleanup(0, ctx);
    }

    if (!needsMbtRepair(result)) {
        exitWithCleanup(result.status || 1, ctx);
    }

    console.warn("[build:mta] Detected unhealthy local mbt binary, trying `npm rebuild mbt --force` ...");
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const rebuildResult = run(ctx, npmCommand, ["rebuild", "mbt", "--force"], { env });
    printOutput(rebuildResult);

    if (rebuildResult.status !== 0) {
        exitWithCleanup(rebuildResult.status || 1, ctx);
    }

    console.warn("[build:mta] Retrying mbt build ...");
    result = runMbt(ctx, env);
    exitWithCleanup(result.status || 1, ctx);
}

main();
