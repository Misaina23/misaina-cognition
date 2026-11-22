import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mode = process.argv[2] === "start" ? "start" : "dev";

const children = [];

function start(command, args) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, BACKEND_PORT: "4000" },
    stdio: "inherit",
    shell: false,
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (signal) return;
    if (code !== 0) process.exitCode = code || 1;
  });
  return child;
}

if (mode === "dev") {
  start(process.execPath, [
    path.join(root, "backend/node_modules/tsx/dist/cli.mjs"),
    "backend/src/server.ts",
  ]);
  start(process.execPath, [
    path.join(root, "node_modules/next/dist/bin/next"),
    "dev",
    "-p",
    "3000",
    "-H",
    "0.0.0.0",
    "frontend",
  ]);
} else {
  start(process.execPath, [path.join(root, "backend/dist/src/server.js")]);
  start(process.execPath, [
    path.join(root, "node_modules/next/dist/bin/next"),
    "start",
    "-p",
    "3000",
    "-H",
    "0.0.0.0",
    "frontend",
  ]);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const child of children) {
      if (!child.killed) child.kill(signal);
    }
  });
}
