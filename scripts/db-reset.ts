/**
 * Travel Helm — réinitialisation complète de la base de démo (SQLite local).
 * Usage : bun scripts/db-reset.ts
 */
import { spawnSync } from "node:child_process";
import { rmSync, existsSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const DB = `${ROOT}db/custom.db`;

if (existsSync(DB)) {
  rmSync(DB);
  console.log("Base supprimée :", DB);
}

const steps = [
  ["prisma db push --schema=packages/db/prisma/schema.prisma --accept-data-loss"],
  ["bun packages/db/seed.ts"],
];
for (const [cmd] of steps) {
  console.log("›", cmd);
  const r = spawnSync(cmd, { shell: true, cwd: ROOT, stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    console.error("Échec :", cmd);
    process.exit(1);
  }
}
console.log("✅ Base de démonstration régénérée (compagnies, lignes, départs, ventes, comptes staff).");
