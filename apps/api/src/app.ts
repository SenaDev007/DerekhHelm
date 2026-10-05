// Travel Helm (API) — assemblage de l'application Hono.
// Toutes les routes sont montées sous /api/helm/** (versionné, REST).
import { Hono } from "hono";
import { logger } from "hono/logger";
import { ApiError } from "./lib/context";
import { health } from "./modules/health";
import { auth } from "./modules/auth";
import { publicApi } from "./modules/public";
import { boarding } from "./modules/boarding";
import { guichet } from "./modules/guichet";
import { overview } from "./modules/overview";
import { reports } from "./modules/reports";
import { auditLog } from "./modules/audit";
import { departuresAdmin } from "./modules/departures";
import { catalogue } from "./modules/catalogue";
import { bookingsAdmin } from "./modules/bookings";
import { paymentsAdmin } from "./modules/payments";
import { staff } from "./modules/staff";
import { settings } from "./modules/settings";

export const app = new Hono()
  .basePath("/api")
  .use(logger(process.env.HELM_LOG === "0" ? () => {} : undefined))
  .onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: err.message }, err.status as 400 | 401 | 403 | 404 | 409 | 500);
    }
    console.error("[api] erreur non gérée :", err);
    return c.json({ error: "Erreur interne du serveur Travel Helm." }, 500);
  })
  .notFound((c) => c.json({ error: "Route inconnue — API Travel Helm /api/helm/*" }, 404))

  // Sonde
  .route("/helm/health", health)
  // Identité
  .route("/helm/auth", auth)
  // Canal voyageur (public)
  .route("/helm", publicApi)
  // Embarquement (contrôleur +)
  .route("/helm/boarding", boarding)
  // Guichet
  .route("/helm/backoffice/guichet", guichet)
  // Back-office
  .route("/helm/backoffice/overview", overview)
  .route("/helm/backoffice/reports", reports)
  .route("/helm/backoffice/audit", auditLog)
  .route("/helm/backoffice/departures", departuresAdmin)
  .route("/helm/backoffice/catalogue", catalogue)
  .route("/helm/backoffice/bookings", bookingsAdmin)
  .route("/helm/backoffice/payments", paymentsAdmin)
  .route("/helm/backoffice/staff", staff)
  .route("/helm/backoffice/settings", settings);

export type App = typeof app;
