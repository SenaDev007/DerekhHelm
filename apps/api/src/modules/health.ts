// GET /api/helm/health — sonde de disponibilité (Vercel, supervision, proxy).
import { Hono } from "hono";
import { db } from "@travelhelm/db";

export const health = new Hono()
  .get("/", async (c) => {
    let dbOk = false;
    try {
      await db.company.count();
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return c.json({
      ok: dbOk,
      service: "travelhelm-api",
      version: "1.0.0",
      db: dbOk ? "up" : "down",
      time: new Date().toISOString(),
    }, dbOk ? 200 : 503);
  });
