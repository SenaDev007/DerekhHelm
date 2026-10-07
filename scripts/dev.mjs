#!/usr/bin/env node
/**
 * Travel Helm — orchestrateur de développement local.
 * Démarre le backend (apps/api, Hono, port 4000) puis le frontend (apps/web, Next.js, port 3000).
 * Le frontend proxifie /api/* vers le backend (voir apps/web/src/app/api/[...path]/route.ts).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const API_PORT = process.env.API_PORT || "4000";
const WEB_PORT = process.env.WEB_PORT || "3000";

if (!existsSync(`${ROOT}node_modules`)) {
  console.error("node_modules manquant — lancez d'abord : bun install");
  process.exit(1);
}

// Charge le .env racine (source unique de configuration locale) et l'injecte aux enfants.
function loadDotEnv() {
  const p = `${ROOT}.env`;
  const out = {};
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const dotenv = loadDotEnv();

const procs = [];

function start(name, cwd, command, args, color) {
  const p = spawn(command, args, {
    cwd,
    env: { ...dotenv, ...process.env, API_PORT, WEB_PORT, PORT: WEB_PORT, FORCE_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tag = `\x1b[${color}m[${name}]\x1b[0m`;
  const fwd = (stream) =>
    stream.on("data", (buf) => {
      for (const line of buf.toString().split("\n")) {
        if (line.trim().length) console.log(`${tag} ${line}`);
      }
    });
  fwd(p.stdout);
  fwd(p.stderr);
  p.on("exit", (code) => {
    if (code !== null && code !== 0) console.error(`${tag} exited with code ${code}`);
  });
  procs.push(p);
  return p;
}

console.log(`\x1b[36m[dev]\x1b[0m Travel Helm — backend :${API_PORT} · frontend :${WEB_PORT} (proxy /api)\n`);

const isBun = process.env.BUN_INSTALL || existsSync(`${ROOT}bun.lock`);

// Backend Hono en premier (le frontend proxifie vers lui)
if (isBun) start("api", `${ROOT}apps/api`, "bun", ["run", "dev"], "35");
else start("api", `${ROOT}apps/api`, "npm", ["run", "dev", "-w", "apps/api"], "35");

// Léger délai pour que le backend soit joignable au premier rendu du proxy
setTimeout(() => {
  // API_ORIGIN explicite → mode PROXY (split dev : api:4000 + web:3000).
  // Sans API_ORIGIN, la route /api monterait l'API dans Next (mode unifié).
  process.env.API_ORIGIN = `http://localhost:${API_PORT}`;
  if (isBun) start("web", `${ROOT}apps/web`, "bun", ["run", "dev"], "36");
  else start("web", `${ROOT}apps/web`, "npm", ["run", "dev", "-w", "apps/web"], "36");
}, 800);

function shutdown() {
  console.log("\n\x1b[36m[dev]\x1b[0m Arrêt des services…");
  for (const p of procs) {
    try { p.kill("SIGTERM"); } catch {}
  }
  setTimeout(() => process.exit(0), 400);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
