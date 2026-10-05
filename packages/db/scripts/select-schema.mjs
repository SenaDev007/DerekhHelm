#!/usr/bin/env node
/**
 * Travel Helm — sélection du schéma Prisma actif.
 * Le schéma actif prisma/schema.prisma n'est PAS versionné (gitigné) :
 * il est copié depuis schema.sqlite.prisma ou schema.postgres.prisma selon DATABASE_URL.
 *   · DATABASE_URL commençant par postgres://…  → PostgreSQL (production, Vercel/Neon)
 *   · sinon (file:…, ou absente)                → SQLite (développement local)
 * Si DATABASE_URL n'est pas définie dans l'environnement, on tente de la lire depuis
 * le .env à la racine du monorepo.
 */
import { copyFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");
const ROOT = resolve(PKG, "..");

function envFromRootDotEnv() {
  const p = resolve(ROOT, ".env");
  if (!existsSync(p)) return null;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

const url = process.env.DATABASE_URL || envFromRootDotEnv() || "";
const wantPostgres = url.startsWith("postgres://") || url.startsWith("postgresql://") || url.startsWith("postgres+");

const source = wantPostgres ? "schema.postgres.prisma" : "schema.sqlite.prisma";
copyFileSync(resolve(PKG, "prisma", source), resolve(PKG, "prisma", "schema.prisma"));
console.log(`[db] schéma actif : ${source} (DATABASE_URL=${url ? url.slice(0, 24) + "…" : "non définie → SQLite"})`);
