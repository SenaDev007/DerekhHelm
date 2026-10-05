#!/usr/bin/env node
/**
 * Travel Helm — garde anti-dérive : vérifie que schema.sqlite.prisma et
 * schema.postgres.prisma sont identiques à la ligne `provider` près.
 * Exécuté par `bun run schema:check` (CI / pré-commit recommandé).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const dir = resolve(HERE, "../prisma");

const strip = (f) =>
  readFileSync(resolve(dir, f), "utf8")
    .split("\n")
    .filter((l) => !/^\s*provider\s*=\s*"(sqlite|postgresql)"/.test(l))
    .join("\n");

if (strip("schema.sqlite.prisma") !== strip("schema.postgres.prisma")) {
  console.error("❌ Dérive détectée : schema.sqlite.prisma et schema.postgres.prisma diffèrent (au-delà du provider).");
  console.error("   Corrigez les deux variantes pour qu'elles restent synchrones.");
  process.exit(1);
}
console.log("✅ Schémas SQLite/PostgreSQL synchrones.");
