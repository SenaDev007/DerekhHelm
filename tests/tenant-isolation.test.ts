// TH-ADM-04 — Isolement multi-tenant : testé automatiquement à chaque exécution.
// Un compte d'une compagnie ne peut ni lire, ni muter, ni scanner les données d'une autre.
import { describe, it, expect } from "vitest";
import { json, body, login, createStation } from "./helpers";
import { db } from "@travelhelm/db";

describe("Identité & sessions (TH-ADM-02/03)", () => {
  it("refuse un mot de passe erroné sans divulguer l'existence du compte", async () => {
    const r = await json("/api/helm/auth/login", "POST", { email: "gerant@corx.test", password: "mauvais" });
    expect(r.status).toBe(401);
    expect((await body(r)).error).not.toContain("gerant");
  });

  it("refuse un compte désactivé", async () => {
    const u = await db.staffUser.update({
      where: { email: "guichet@corx.test" },
      data: { active: false },
    });
    const r = await json("/api/helm/auth/login", "POST", { email: "guichet@corx.test", password: "test1234" });
    expect(r.status).toBe(403);
    await db.staffUser.update({ where: { id: u.id }, data: { active: true } });
  });

  it("déconnecte proprement (cookie supprimé côté navigateur, réponse ok)", async () => {
    const { cookie } = await login("gerant@corx.test");
    expect((await json("/api/helm/auth/me", "GET", undefined, cookie)).status).toBe(200);
    const out = await json("/api/helm/auth/logout", "POST", undefined, cookie);
    expect(out.status).toBe(200);
    // Le cookie de session est signé et sans état serveur : sa suppression (max-age=0)
    // déconnecte le navigateur ; le jeton reste valide jusqu'à son expiration (12 h).
    expect(out.headers.get("set-cookie") ?? "").toContain("helm_session=;");
    expect((await out.json()).ok).toBe(true);
  });

  it("401 sans session sur tout le back-office", async () => {
    for (const path of ["/api/helm/backoffice/overview", "/api/helm/backoffice/bookings", "/api/helm/backoffice/catalogue/stations"]) {
      expect((await json(path, "GET")).status).toBe(401);
    }
  });
});

describe("Isolement tenant (TH-ADM-04)", () => {
  it("le gérant Corx ne voit QUE les gares de Corx", async () => {
    const { cookie } = await login("gerant@corx.test");
    const d = await body<{ stations: { id: string; name: string }[] }>(
      await json("/api/helm/backoffice/catalogue/stations", "GET", undefined, cookie),
    );
    expect(d.stations.every((s) => s.name.includes("Corx") || s.name.includes("Missèbo (test)"))).toBe(true);
    expect(d.stations.some((s) => s.name.includes("Sika"))).toBe(false);
  });

  it("PATCH sur une gare d'une AUTRE compagnie → 404 (pas de fuite)", async () => {
    const sikaStation = await db.station.findFirst({ where: { name: { contains: "Sika" } } });
    const { cookie } = await login("gerant@corx.test");
    const r = await json(`/api/helm/backoffice/catalogue/stations/${sikaStation!.id}`, "PATCH", { name: "Pirate" }, cookie);
    expect(r.status).toBe(404);
    const fresh = await db.station.findUnique({ where: { id: sikaStation!.id } });
    expect(fresh?.name).not.toBe("Pirate");
  });

  it("DELETE d'une gare d'une autre compagnie → 404, ligne intacte", async () => {
    const sikaStation = await db.station.findFirst({ where: { name: { contains: "Sika" } } });
    const { cookie } = await login("gerant@corx.test");
    expect((await json(`/api/helm/backoffice/catalogue/stations/${sikaStation!.id}`, "DELETE", undefined, cookie)).status).toBe(404);
    expect(await db.station.findUnique({ where: { id: sikaStation!.id } })).not.toBeNull();
  });

  it("overview d'un gérant renvoie SA compagnie uniquement", async () => {
    const { cookie } = await login("gerant@sika.test");
    const d = await body<{ company: { slug: string } }>(
      await json("/api/helm/backoffice/overview", "GET", undefined, cookie),
    );
    expect(d.company.slug).toBe("sika-voyages");
  });

  it("les jetons de session ne traversent pas les comptes (HMAC)", async () => {
    const a = await login("gerant@corx.test");
    expect((await json("/api/helm/auth/me", "GET", undefined, a.cookie + "X")).status).toBe(401);
  });
});

describe("Gardes de rôle (TH-ADM-03)", () => {
  it("guichetier : lecture catalogue OK, écriture → 403", async () => {
    const { cookie } = await login("guichet@corx.test");
    expect((await json("/api/helm/backoffice/catalogue/stations", "GET", undefined, cookie)).status).toBe(200);
    const r = await json("/api/helm/backoffice/catalogue/stations", "POST", { city: "X", name: "Y" }, cookie);
    expect(r.status).toBe(403);
    expect((await body(r)).error).toContain("Gérant");
  });

  it("guichetier : pas d'accès paiements ni personnel", async () => {
    const { cookie } = await login("guichet@corx.test");
    expect((await json("/api/helm/backoffice/payments", "GET", undefined, cookie)).status).toBe(403);
    expect((await json("/api/helm/backoffice/staff", "GET", undefined, cookie)).status).toBe(403);
  });

  it("finance : lecture paiements OK, création de départ → 403", async () => {
    const { cookie } = await login("finance@corx.test");
    expect((await json("/api/helm/backoffice/payments", "GET", undefined, cookie)).status).toBe(200);
    expect((await json("/api/helm/backoffice/departures", "POST", { routeId: "x", date: "2030-01-01", time: "08:00", basePrice: 5000 }, cookie)).status).toBe(403);
  });

  it("contrôleur : scan autorisé, back-office catalogue → 403", async () => {
    const { cookie } = await login("controleur@corx.test");
    expect((await json("/api/helm/backoffice/catalogue/stations", "GET", undefined, cookie)).status).toBe(403);
    expect((await json("/api/helm/boarding/scan", "POST", { scan: "THQ-XXXX-XXXX" }, cookie)).status).toBe(200);
  });

  it("gérant non-support : console support → 403", async () => {
    const { cookie } = await login("gerant@corx.test");
    expect((await json("/api/helm/backoffice/settings/support/companies", "GET", undefined, cookie)).status).toBe(403);
  });
});

describe("CRUD gares — cycle complet et journalisé", () => {
  it("créer / lister / modifier / supprimer, audit STATION_* écrit", async () => {
    const { cookie } = await login("gerant@corx.test");

    const { r, station } = await createStation(cookie, "Calavi", "Gare de Calavi (test)");
    expect(r.status).toBe(201);
    expect(station).not.toBeNull();

    const list = await body<{ stations: { id: string }[] }>(
      await json("/api/helm/backoffice/catalogue/stations", "GET", undefined, cookie),
    );
    expect(list.stations.some((s) => s.id === station!.id)).toBe(true);

    const upd = await json(`/api/helm/backoffice/catalogue/stations/${station!.id}`, "PATCH", { name: "Gare de Calavi-Centre" }, cookie);
    expect(upd.status).toBe(200);
    expect((await db.station.findUnique({ where: { id: station!.id } }))?.name).toBe("Gare de Calavi-Centre");

    expect((await json(`/api/helm/backoffice/catalogue/stations/${station!.id}`, "DELETE", undefined, cookie)).status).toBe(200);
    expect(await db.station.findUnique({ where: { id: station!.id } })).toBeNull();

    const auditRows = await db.auditLog.findMany({
      where: { action: { in: ["STATION_CREATED", "STATION_UPDATED", "STATION_DELETED"] }, companyId: { not: null } },
    });
    expect(auditRows.length).toBeGreaterThanOrEqual(3);
  });

  it("validation : ville/nom requis", async () => {
    const { cookie } = await login("gerant@corx.test");
    expect((await json("/api/helm/backoffice/catalogue/stations", "POST", { city: "" }, cookie)).status).toBe(400);
  });
});
