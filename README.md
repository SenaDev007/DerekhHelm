# Travel Helm — SaaS de billetterie interurbaine multi-compagnies (Bénin)

> **Une place vendue une seule fois.** Travel Helm rapproche le guichet et le web sur un
> inventaire central unique : recherche multi-compagnies, sélection de sièges réelle,
> paiement Mobile Money, billets QR signés, embarquement balayé, rapports et audit complet.

Implémentation du cahier des charges produit/technique v3.0 — FCFA (XOF), mobile-first,
données de démonstration plausibles (compagnies, gares et corridors béninois fictifs).

---

## Architecture — monorepo propre, backend séparé du frontend

```
travelhelm/
├── apps/
│   ├── web/                      # FRONTEND (Next.js 16 + React 19 + Tailwind 4)
│   │   ├── src/app/              #   page unique, route proxy /api/[...path]
│   │   ├── src/components/helm   #   espace voyageur + back-office compagnie
│   │   └── src/store             #   état client (zustand) : session, parcours
│   └── api/                      # BACKEND (Hono 4, REST versionné /api/helm/*)
│       ├── src/modules/          #   auth, search, holds, bookings, payments,
│       │                         #   boarding, catalogue, departures, staff,
│       │                         #   settings/support, reports, audit, health
│       ├── src/lib/context.ts    #   sessions signées, gardes de rôle, tenant
│       ├── api/index.ts          #   entrée Vercel Serverless (hono/vercel)
│       └── src/server.ts         #   serveur local (Node/Bun, port 4000)
├── packages/
│   ├── db/                       # Prisma : schéma (SQLite dev / PostgreSQL prod),
│   │                             # client partagé, seed de démonstration
│   ├── core/                     # Logique métier pure : invariants d'inventaire,
│   │                             # pipeline de confirmation, remboursements,
│   │                             # QR signés, mots de passe scrypt, sessions
│   └── shared/                   # Code isomorphe : formats FCFA, états métier, rôles
├── tests/                        # Vitest : isolement tenant, invariants, CRUD (41 tests)
└── scripts/                      # dev.mjs / start.mjs / db-reset.ts
```

**Séparation stricte** : le frontend ne contient aucune logique métier — il appelle
`/api/*` (proxy runtime vers `API_ORIGIN`). Le backend ne connaît aucun React.
La logique métier (`packages/core`) est testable sans HTTP.

## Démarrage rapide

```bash
bun install                 # installe les workspaces + génère le client Prisma
bun run db:push             # crée la base SQLite locale (db/custom.db)
bun run db:seed             # données de démo : 3 compagnies, 25 départs, 150 ventes, 13 comptes
bun run dev                 # backend :4000 + frontend :3000 (proxy /api)
```

Frontend : http://localhost:3000 — API : http://localhost:4000/api/helm/health

### Comptes de démonstration (mot de passe : `demo1234`)

| Compagnie | E-mail | Rôle |
|---|---|---|
| Corridor Express | `gerant@corridorexpress.bj` | Gérant (accès complet) |
| Corridor Express | `guichet@corridorexpress.bj` | Guichetier (ventes) |
| Corridor Express | `controleur@corridorexpress.bj` | Contrôleur (embarquement) |
| Corridor Express | `finance@corridorexpress.bj` | Finance (rapprochement) |
| Corridor Express | `repartiteur@corridorexpress.bj` | Répartiteur (départs) |
| Sika Voyages | `gerant@sikavoyages.bj` | Gérant |
| Baobab Lines | `gerant@baobablines.bj` | Gérant |
| Travel Helm | `support@travelhelm.bj` | Support (console transverse) |

> En production : `HELM_DEMO=0` masque ces comptes ; chaque gérant crée son personnel.

## Invariants métier (implémentés + testés)

| Exigence | Implémentation |
|---|---|
| **Une place vendue une seule fois** | `SeatOccupancy @@unique([departureId, seatId])` — contrainte base de données, transactions atomiques, capture des conflits `P2002` → 409 + liste des sièges pris |
| **Rétention expirable (TH-INV-02)** | `holdMinutes` configurable par compagnie, sweep idempotent des rétentions expirées |
| **Montant jamais lu côté client (§3.1.7)** | recalcul serveur (base × sièges + suppléments VIP) à chaque réservation |
| **Idempotence des callbacks (TH-PAY-03)** | `PaymentEvent.eventToken` unique ; rejeu ignoré, jamais deux billets |
| **INCONNU ≠ échec (§3.3)** | statut `INCONNU` → réservation `À RÉCONCILIER` ; décision humaine SUCCÈS/ÉCHEC justifiée et journalisée ; aucune nouvelle charge automatique |
| **Machine à états stricte (§3.3)** | Départs : BROUILLON→PUBLIÉ→EMBARQUEMENT→EN COURS→TERMINÉ (+ RETARDÉ/VÉHICULE REMPLACÉ/ANNULÉ) ; transitions contraintes, raison obligatoire, journal immuable |
| **Isolement multi-tenant (TH-ADM-04)** | tenant dérivé de la SESSION (jamais d'un paramètre client), gardes par rôle, 41 tests automatisés |
| **Billets QR signés (TH-TKT-02)** | jeton opaque HMAC (aucune donnée personnelle en clair), remplacement traçable (REMPLACÉ), double scan bloqué |
| **Guichet = même stock (§3.2)** | vente espèces sur le même inventaire central, mêmes contraintes d'unicité |
| **Audit non modifiable** | chaque mutation : acteur de session, action, entité, horodatage |

## CRUD complet (module par module)

| Module | Lecture | Création | Modification | Suppression |
|---|---|---|---|---|
| Gares & arrêts | ✅ | ✅ | ✅ (nom, ville, type, principale) | ✅ |
| Lignes + arrêts | ✅ | ✅ (code unique, séquence) | ✅ (remplacement atomique des arrêts) | ✅ (bloqué si départs) |
| Véhicules | ✅ | ✅ (plan de sièges généré 2-2/2-3, VIP, PMR) | ✅ (+ activation sélection siège) | ✅ (bloqué si ventes) |
| Plans de sièges | ✅ | ✅ régénération | — | protégé dès la 1ʳᵉ vente |
| Départs | ✅ | ✅ (brouillon) | ✅ prix/heure/véhicule/cutoff/consigne (raison exigée si publié) | ✅ (brouillon vierge) |
| Transitions départs | ✅ journal | — | ✅ machine à états + motif | — |
| Réservations | ✅ filtres/export CSV | ✅ (web, guichet) | ✅ annuler / rembourser / no-show / présentée / note | — |
| Paiements | ✅ liste + événements | ✅ (canal web) | ✅ réconciler / interroger / rembourser | — |
| Billets | ✅ QR + fiche | ✅ (émission à la confirmation) | ✅ remplacement (REMPLACÉ) | — |
| Personnel & rôles | ✅ | ✅ (scrypt, MFA) | ✅ rôle/état/mot de passe | ✅ (protections anti-verrouillage) |
| Paramètres tenant | ✅ | — | ✅ (identité, rétention, contacts) | — |
| Compagnies (tenants) | ✅ annuaire | ✅ (support, justification) | ✅ (support) | — |
| Notifications | ✅ journal | auto (SMS simulés) | ✅ renvoi | — |

## Tests

```bash
bun run test        # 41 tests : isolement tenant (TH-ADM-04), gardes de rôle,
                    # CRUD catalogue/départs/personnel, unicité des sièges,
                    # idempotence paiements, réconciliation, QR, embarquement
bun run lint        # ESLint (web) + tsc --noEmit (api)
bun run schema:check # garde anti-dérive des schémas SQLite/PostgreSQL
```

## Base de données

- **Développement** : SQLite (`db/custom.db`) — zéro configuration.
- **Production** : PostgreSQL (Neon/Supabase) — même schéma, sélectionné par `DATABASE_URL`
  (`scripts/select-schema.mjs` copie `schema.sqlite.prisma` ou `schema.postgres.prisma`).
- La contrainte d'unicité `(departureId, seatId)` est **identique** sur les deux moteurs.

```bash
bun run db:reset    # régénère la base de démo complète
```

## Déploiement sur Vercel

Deux modes de déploiement sont supportés. Dans tous les cas :

> ⚠️ **Root Directory obligatoire** : le projet Vercel doit pointer sur un sous-dossier
> (`apps/web` ou `apps/api`), jamais sur la racine du repo — la racine est un espace de
> travail bun (workspaces), pas une application déployable. Un projet configuré sur la
> racine échoue désormais **volontairement** avec un message explicite (voir
> `scripts/build.mjs`) au lieu de l'erreur opaque `No Output Directory named "public"`.
>
> ℹ️ `bun install` installe toujours **tout le monorepo** depuis la racine, même quand
> le Root Directory est un sous-dossier (bun remonte au workspace root) ; le
> `postinstall` racine génère le client Prisma automatiquement — rien à configurer.
>
> ℹ️ Le warning Vercel `Detected "engines": { "node": ">=20" }` est bénin (simple
> information de montée de version majeure Node).

### Mode A — projet UNIQUE (recommandé pour démarrer)

L'application Hono (`@travelhelm/api`) est montée **dans** le route handler Next.js
(`src/app/api/[...path]/route.ts`, via `app.fetch`) : frontend + backend dans le
**même déploiement**, sur une seule URL. Il suffit de **ne pas définir `API_ORIGIN`**.

```bash
# Vercel → New Project → Importer le repo → Root Directory : apps/web
# (framework Next.js détecté automatiquement)
```

Variables d'environnement du projet :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | `postgresql://…` (Neon, Supabase…) — crée la base d'abord |
| `HELM_QR_SECRET` | secret long aléatoire (signature des billets QR) |
| `HELM_SESSION_SECRET` | secret long aléatoire (sessions signées) |
| `HELM_DEMO` | `0` en production |
| `API_ORIGIN` | *(ne pas définir — laisser vide active le mode unifié)* |

> 💡 **Neon** : utiliser l'URL de connexion **avec pooling** (l'hôte contient
> `-pooler`) — les fonctions serverless ouvrent des connexions fréquentes.

Puis initialiser le schéma (une fois, depuis une machine avec le repo) :

```bash
DATABASE_URL="postgresql://…" \
  bunx prisma db push --schema=packages/db/prisma/schema.postgres.prisma --accept-data-loss

DATABASE_URL="postgresql://…" HELM_QR_SECRET=… HELM_SESSION_SECRET=… \
  bun packages/db/seed.ts        # optionnel : données de démo
```

### Mode B — deux projets (backend et frontend séparés)

Le backend tourne dans son propre déploiement (serverless Hono via
`apps/api/api/index.ts` + rewrites) ; le frontend lui transfère `/api/*`
(cookies de session identiques, aucun CORS). Il suffit de définir `API_ORIGIN`.

1. **Projet API** — Root Directory : `apps/api` (framework Other, détecté via
   `api/index.ts` + `vercel.json`). Variables : `DATABASE_URL`, `HELM_QR_SECRET`,
   `HELM_SESSION_SECRET`, `HELM_DEMO`. Initialiser le schéma comme en mode A.
2. **Projet web** — Root Directory : `apps/web`. Variable : `API_ORIGIN`
   (URL du projet API, ex. `https://travelhelm-api.vercel.app`).

Ordre : déployer l'API d'abord, renseigner `API_ORIGIN` ensuite.

### Dépannage : `error: Workspace dependency "@travelhelm/db" not found`

Ce message (bun install, Vercel ou CI) signifie que le dossier `packages/db`
n'est pas présent dans le clone. Cause historique : le motif `.gitignore`
`db/` (sans ancrage) ignorait **tout** dossier nommé `db/`, y compris
`packages/db/`. Corrigé — le motif est désormais `/db/` (dossier SQLite local
de la racine uniquement). **Ne jamais le réintroduire.** Vérifier si besoin :

```bash
git check-ignore -v packages/db/package.json   # ne doit rien retourner
git ls-files packages/db                        # doit lister 8 fichiers
```

### Dépannage : `No Output Directory named "public" found`

Le projet Vercel pointe sur la **racine du repo** (Root Directory vide). La
corriger : Project Settings → General → Root Directory → `apps/web` (mode A)
ou `apps/api` + `apps/web` (mode B).

### Alternatives d'hébergement

> `apps/api` tourne aussi comme serveur Node standard
> (`bun run build:api && node apps/api/dist/server.js`) — le bundle embarque le runtime
> Prisma (Railway, Fly.io, VPS…). Le web unifié fonctionne aussi en auto-hébergé :
> `bun run build:web && node apps/web/.next/standalone/server.js`.

## Sécurité

- Mots de passe **scrypt** (sel unique par compte), jamais retournés par l'API.
- Sessions par **cookie signé HMAC** (httpOnly, SameSite=Lax, 12 h), utilisateur
  rechargé en base à chaque requête (comptes désactivés révoqués immédiatement).
- Rôles vérifiés **côté serveur** sur chaque endpoint (`guard(c, [rôles])`).
- MFA : drapeau par compte (application OTP à brancher en production).
- QR : HMAC-SHA256 sur code opaque — aucune donnée personnelle en clair.
- Journal d'audit append-only, chaque action horodatée et attribuée.

## Limites assumées (honnêteté produit)

- Console « fournisseur Mobile Money » simulée et clairement identifiée (démo) —
  l'intégration réelle (KKiaPay/MTN MoMo) se branche sur `POST /api/helm/payments/callback`.
- SMS journalisés (modele `NotificationLog`), pas d'envoi réel.
- Vente offline : non couverte (protocole anti-conflit à activer explicitement,
  conformément au cahier des charges — non requis au lancement).

---

© 2026 Travel Helm — démonstration produit sur données fictives.
