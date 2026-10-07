#!/usr/bin/env node
/**
 * Travel Helm — build racine (orchestration api + web).
 *
 * ⚠ La racine du monorepo n'est PAS une application déployable : elle est un
 * espace de travail bun (workspaces). Si Vercel exécute ce script, le projet
 * Vercel est mal configuré (Root Directory laissé sur la racine du repo) —
 * on échoue volontairement avec un message actionnable au lieu de l'erreur
 * opaque « No Output Directory named "public" found ».
 *
 * Deux configurations valides (détails dans le README § Déploiement Vercel) :
 *   1. PROJET UNIQUE  : Root Directory = apps/web (API montée dans Next.js).
 *   2. DEUX PROJETS   : apps/api (backend) + apps/web (frontend + API_ORIGIN).
 */
import { spawnSync } from "node:child_process";

const isVercel = process.env.VERCEL === "1" || process.env.CI_NAME === "vercel";

if (isVercel) {
  console.error(`
+----------------------------------------------------------------------+
|  Configuration Vercel incorrecte                                     |
+----------------------------------------------------------------------+
  La racine de ce monorepo n'est pas une application deployable.
  Le projet Vercel pointe sur la racine du repo (Root Directory vide).

  Correctif (choisir UNE des deux options) :

  [1] PROJET UNIQUE (recommande pour demarrer)
      Vercel > Project Settings > General > Root Directory : apps/web
      Variables d'environnement du projet :
        DATABASE_URL          = postgresql://...   (Neon, Supabase...)
        HELM_QR_SECRET        = <secret long aleatoire>
        HELM_SESSION_SECRET   = <secret long aleatoire>
        HELM_DEMO             = 0
      -> frontend + API dans le meme deploiement (mode unifie).

  [2] DEUX PROJETS (backend et frontend separes)
      Projet API  : Root Directory = apps/api  (+ DATABASE_URL, secrets)
      Projet web  : Root Directory = apps/web  (+ API_ORIGIN = URL du projet API)

  Voir README.md, section "Deploiement sur Vercel".
+----------------------------------------------------------------------+
`);
  process.exit(1);
}

// Chaîne normale (locale / CI / sandbox) : build API puis build web.
const steps = [
  ["@travelhelm/api", "build:api"],
  ["@travelhelm/web", "build:web"],
];

for (const [, script] of steps) {
  const r = spawnSync("bun", ["run", script], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
