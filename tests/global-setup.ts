// Vitest globalSetup : prépare une base SQLite de test vierge + fixtures minimales.
import { spawnSync } from "node:child_process";
import { rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DB = resolve(ROOT, "tests/test.db");

process.env.DATABASE_URL = `file:${DB}`;
process.env.HELM_QR_SECRET = "test-qr-secret";
process.env.HELM_SESSION_SECRET = "test-session-secret";

export default async function setup() {
  // 1) base vierge
  for (const f of [DB, `${DB}-journal`]) {
    if (existsSync(f)) rmSync(f);
  }

  // 2) schéma poussé (prisma CLI, schéma actif SQLite)
  const push = spawnSync(
    "bunx",
    ["prisma", "db", "push", "--schema=packages/db/prisma/schema.prisma", "--accept-data-loss"],
    { cwd: ROOT, env: process.env, stdio: "pipe", encoding: "utf8" },
  );
  if (push.status !== 0) {
    throw new Error("prisma db push a échoué : " + (push.stderr || push.stdout || "").slice(0, 800));
  }

  // 3) fixtures via le client partagé (import dynamique APRÈS l'installation du schéma)
  const { db } = await import("../packages/db/src/client");
  const { scryptSync, randomBytes } = await import("node:crypto");

  const hash = (pwd: string) => {
    const salt = randomBytes(16).toString("hex");
    return `scrypt$${salt}$${scryptSync(pwd, salt, 64).toString("hex")}`;
  };
  const PW = hash("test1234");

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 30, 0, 0);

  const [corx, sika] = await Promise.all([
    db.company.create({
      data: {
        name: "Corridor Express", slug: "corridor-express", tagline: "test", brandColor: "#0E7A4E",
        holdMinutes: 5, contactPhone: "+229 01 30 45 12 00",
      },
    }),
    db.company.create({
      data: { name: "Sika Voyages", slug: "sika-voyages", tagline: "test", brandColor: "#B45309", holdMinutes: 5 },
    }),
  ]);

  await db.staffUser.createMany({
    data: [
      { companyId: corx.id, email: "gerant@corx.test", fullName: "Gérant Corx", role: "GERANT", passwordHash: PW },
      { companyId: corx.id, email: "guichet@corx.test", fullName: "Guichet Corx", role: "GUICHETIER", passwordHash: PW },
      { companyId: corx.id, email: "controleur@corx.test", fullName: "Contrôleur Corx", role: "CONTROLEUR", passwordHash: PW },
      { companyId: corx.id, email: "finance@corx.test", fullName: "Finance Corx", role: "FINANCE", passwordHash: PW },
      { companyId: corx.id, email: "manager@corx.test", fullName: "Manager Corx", role: "MANAGER", passwordHash: PW },
      { companyId: sika.id, email: "gerant@sika.test", fullName: "Gérant Sika", role: "GERANT", passwordHash: PW },
      { companyId: sika.id, email: "controleur@sika.test", fullName: "Contrôleur Sika", role: "CONTROLEUR", passwordHash: PW },
      { companyId: null, email: "support@th.test", fullName: "Support TH", role: "SUPPORT", passwordHash: PW },
    ],
  });

  const stationCorx = await db.station.create({
    data: { companyId: corx.id, city: "Cotonou", name: "Gare de Missèbo (test)", kind: "GARE", isPrimary: true },
  });
  await db.station.create({
    data: { companyId: sika.id, city: "Cotonou", name: "Gare Sika (test)", kind: "GARE", isPrimary: true },
  });

  const route = await db.route.create({
    data: {
      companyId: corx.id, code: "CTN-PKP", originCity: "Cotonou", destCity: "Parakou",
      label: "Corridor test", distanceKm: 412, durationMin: 390,
      boardingPoint: stationCorx.name,
      stops: { create: [{ city: "Bohicon", station: "Gare de Bohicon", seq: 1, offsetMin: 105 }] },
    },
  });

  const plan: { code: string; row: number; col: number; kind: string; window: boolean }[] = [];
  for (let r = 1; r <= 4; r++) {
    for (let c = 0; c < 4; c++) {
      plan.push({
        code: `${r}${"ABCD"[c]}`, row: r, col: c,
        kind: r === 1 && c === 0 ? "SERVICE" : r === 2 ? "VIP" : "STANDARD",
        window: c === 0 || c === 3,
      });
    }
  }
  const vehicle = await db.vehicle.create({
    data: {
      companyId: corx.id, label: "Autocar Test", model: "Yutong", plate: "TS-001-AA",
      seatLayout: "2-2", capacity: plan.filter((s) => s.kind !== "SERVICE").length,
      seatSelectionEnabled: true, seats: { create: plan },
    },
  });

  const depSeats = await db.departure.create({
    data: {
      companyId: corx.id, routeId: route.id, vehicleId: vehicle.id, departsAt: tomorrow,
      durationMin: 390, status: "PUBLIE", basePrice: 10000, vipSurcharge: 2000,
      seatSelectionEnabled: true, capacity: 15, boardingCutoffMin: 30, publishedAt: new Date(),
    },
  });
  const depCapacity = await db.departure.create({
    data: {
      companyId: sika.id, routeId: (
        await db.route.create({
          data: { companyId: sika.id, code: "CTN-ABJ", originCity: "Cotonou", destCity: "Bohicon", label: "Sika test", distanceKm: 105, durationMin: 120, boardingPoint: "Gare Sika" },
        })
      ).id,
      departsAt: tomorrow, durationMin: 120, status: "PUBLIE", basePrice: 4000, seatSelectionEnabled: false, capacity: 3, publishedAt: new Date(),
    },
  });

  await db.departure.create({
    data: {
      companyId: corx.id, routeId: route.id, departsAt: tomorrow, durationMin: 390,
      status: "BROUILLON", basePrice: 9000, capacity: 15,
    },
  });

  await db.$disconnect();
  return () => {};
}
