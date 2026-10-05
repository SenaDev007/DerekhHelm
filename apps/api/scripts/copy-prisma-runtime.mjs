#!/usr/bin/env node
/**
 * Travel Helm — copie du runtime Prisma à côté du bundle Node (apps/api/dist).
 * Le bundle exclut @prisma/client (moteurs natifs) : on copie donc le package
 * @prisma/client + le client généré (.prisma) dans dist/node_modules pour que
 * `node dist/server.js` résolve le client et ses moteurs.
 * Gère les layouts bun (store node_modules/.bun) et npm (hoisting classique).
 */
import { cpSync, existsSync, mkdirSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");          // apps/api
const ROOT = resolve(PKG, "..", "..");    // monorepo
const DIST = resolve(PKG, "dist");

if (!existsSync(resolve(DIST, "server.js"))) {
  console.error("dist/server.js manquant — lancez d'abord la compilation (bun build).");
  process.exit(1);
}

function isSymlink(p) {
  try { return lstatSync(p).isSymbolicLink(); } catch { return false; }
}
function realpathSafe(p) {
  try { return realpathSync(p); } catch { return p; }
}

// Résout le @prisma/client réel (suit le store bun le cas échéant) et le .prisma généré.
function locatePrisma() {
  const candidates = [
    resolve(PKG, "node_modules/@prisma"),
    resolve(ROOT, "node_modules/@prisma"),
    resolve(ROOT, "packages/db/node_modules/@prisma"),
  ];
  // store bun : node_modules/.bun/@prisma+client@…/node_modules/@prisma
  const storeDir = resolve(ROOT, "node_modules/.bun");
  if (existsSync(storeDir)) {
    for (const entry of readdirSync(storeDir)) {
      if (entry.startsWith("@prisma+client@")) {
        candidates.push(resolve(storeDir, entry, "node_modules/@prisma"));
      }
    }
  }
  for (const base of [...candidates]) {
    if (isSymlink(base)) candidates.push(realpathSafe(base));
  }
  for (const base of candidates) {
    if (!existsSync(base)) continue;
    // .prisma peut vivre à côté (dans le même node_modules) ou un cran plus haut
    const siblings = [
      resolve(dirname(base), ".prisma"),
      resolve(dirname(dirname(base)), ".prisma"),
    ];
    for (const dot of siblings) {
      if (existsSync(dot)) return { prismaDir: base, dotPrisma: dot };
    }
  }
  return null;
}

const located = locatePrisma();
if (!located) {
  console.error("⚠️  Runtime Prisma introuvable — exécutez d'abord `bun install` + `prisma generate`.");
  process.exit(1);
}

const targetPrisma = resolve(DIST, "node_modules/@prisma");
const targetDot = resolve(DIST, "node_modules/.prisma");
mkdirSync(targetPrisma, { recursive: true });
mkdirSync(targetDot, { recursive: true });

cpSync(located.prismaDir, targetPrisma, { recursive: true });
cpSync(located.dotPrisma, targetDot, { recursive: true });
console.log(`[build] prisma runtime → dist/node_modules (@prisma ${existsSync(resolve(targetPrisma, "client")) ? "ok" : "?"}, .prisma ${existsSync(resolve(targetDot, "client")) ? "ok" : "?"})`);
console.log("✅ Runtime Prisma embarqué dans apps/api/dist.");
