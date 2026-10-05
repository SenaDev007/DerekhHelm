#!/usr/bin/env node
/**
 * Travel Helm — démarrage production local (build standalone).
 * Démarre le backend (apps/api/dist) puis le frontend (apps/web/.next/standalone).
 * Sur Vercel, chaque app est déployée comme un projet indépendant (voir README).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const API_PORT = process.env.API_PORT || "4000";
const WEB_PORT = process.env.WEB_PORT || "3000";

if (!existsSync(`${ROOT}apps/api/dist/server.js`) || !existsSync(`${ROOT}apps/web/.next/standalone/server.js`)) {
  console.error("Builds manquants — lancez d'abord : bun run build");
  process.exit(1);
}

const procs = [];
function start(name, cwd, command, args, color) {
  const p = spawn(command, args, {
    cwd,
    env: { ...process.env, API_PORT, WEB_PORT, NODE_ENV: "production" },
    stdio: "inherit",
  });
  console.log(`\x1b[${color}m[${name}]\x1b[0m démarré (pid ${p.pid})`);
  procs.push(p);
}

start("api", `${ROOT}apps/api`, "node", ["dist/server.js"], "35");
setTimeout(() => start("web", `${ROOT}apps/web/.next/standalone`, "node", ["server.js"], "36"), 500);

function shutdown() {
  for (const p of procs) { try { p.kill("SIGTERM"); } catch {} }
  setTimeout(() => process.exit(0), 400);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
