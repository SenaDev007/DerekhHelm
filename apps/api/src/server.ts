// Travel Helm (API) — serveur de développement local (Node/Bun).
// Port : API_PORT (défaut 4000). Le frontend Next.js proxifie /api/* vers ce serveur.
import { serve } from "@hono/node-server";
import { app } from "./app";

const port = Number(process.env.API_PORT || 4000);

console.log(`
┌─────────────────────────────────────────────────────────┐
│  Travel Helm — API (Hono)                               │
│  http://localhost:${port}/api/helm/health                   │
│  Routes : /api/helm/** (public, auth, backoffice)       │
└─────────────────────────────────────────────────────────┘`);

serve({ fetch: app.fetch, port });

// Sonde de disponibilité pour les tests / la supervision
fetch(`http://localhost:${port}/api/helm/health`)
  .then((r) => r.json())
  .then((d) => console.log("[api] santé :", JSON.stringify(d)))
  .catch(() => {});
