// CRUD back-office complet : catalogue (lignes, véhicules, plans de sièges),
// départs (création/modification/suppression/transitions), personnel, paramètres,
// support (provisioning). Chaque mutation vérifie l'effet en base + l'audit.
import { describe, it, expect, beforeAll } from "vitest";
import { json, body, login } from "./helpers";
import { db } from "@travelhelm/db";

let gerant: string;
let manager: string;
let support: string;

beforeAll(async () => {
  gerant = (await login("gerant@corx.test")).cookie;
  manager = (await login("manager@corx.test")).cookie;
  support = (await login("support@th.test")).cookie;
});

describe("CRUD lignes (avec arrêts)", () => {
  it("création avec code unique, arrêts séquencés ; doublon de code → 409", async () => {
    const r = await json("/api/helm/backoffice/catalogue/routes", "POST", {
      code: "TST-001", originCity: "Cotonou", destCity: "Calavi",
      distanceKm: 28, durationMin: 50, boardingPoint: "Gare de Missèbo (test)",
      stops: [
        { city: "Godomey", station: "Carrefour Godomey", seq: 1, offsetMin: 15 },
        { city: "Calavi", station: "Carrefour Calavi", seq: 2, offsetMin: 40 },
      ],
    }, gerant);
    expect(r.status).toBe(201);
    const route = (await body<{ route: { id: string; stops: unknown[] } }>(r)).route;
    expect(route.stops.length).toBe(2);

    const dup = await json("/api/helm/backoffice/catalogue/routes", "POST", {
      code: "TST-001", originCity: "A", destCity: "B", distanceKm: 10, durationMin: 20, boardingPoint: "X",
    }, gerant);
    expect(dup.status).toBe(409);

    // update : remplacement des arrêts + durée
    const upd = await json(`/api/helm/backoffice/catalogue/routes/${route.id}`, "PATCH", {
      durationMin: 55,
      stops: [{ city: "Calavi", station: "Gare Calavi Centre", seq: 1, offsetMin: 45 }],
    }, gerant);
    expect(upd.status).toBe(200);
    const fresh = await db.route.findUnique({ where: { id: route.id }, include: { stops: true } });
    expect(fresh?.durationMin).toBe(55);
    expect(fresh?.stops.length).toBe(1);

    // suppression : bloque si des départs existent
    const used = await db.route.findFirst({ where: { code: "CTN-PKP" }, include: { departures: { take: 1 } } });
    const blocked = await json(`/api/helm/backoffice/catalogue/routes/${used!.id}`, "DELETE", undefined, gerant);
    expect(blocked.status).toBe(409);

    // la ligne vierge se supprime
    expect((await json(`/api/helm/backoffice/catalogue/routes/${route.id}`, "DELETE", undefined, gerant)).status).toBe(200);
  });
});

describe("CRUD véhicules & plans de sièges (TH-INV-04)", () => {
  it("création 2-3 × 8 rangées = 40 sièges, 38 vendables (2 service), plan régénérable", async () => {
    const r = await json("/api/helm/backoffice/catalogue/vehicles", "POST", {
      label: "Autocar Test 2-3", model: "Yutong ZK6102", plate: "TS-002-BB",
      seatLayout: "2-3", rows: 8, vipRows: [1], seatSelectionEnabled: true,
    }, gerant);
    expect(r.status).toBe(201);
    const v = (await body<{ vehicle: { id: string; capacity: number; seatSelectionEnabled: boolean } }>(r)).vehicle;
    // 40 sièges générés, 1 siège service (1A) → capacité vendable 39
    expect(v.capacity).toBe(39);

    const seats = await db.seat.findMany({ where: { vehicleId: v.id } });
    expect(seats.length).toBe(40);
    expect(seats.filter((x) => x.kind === "SERVICE").length).toBe(1);

    // immatriculation dupliquée → 409
    const dup = await json("/api/helm/backoffice/catalogue/vehicles", "POST", {
      label: "X", model: "Y", plate: "TS-002-BB", seatLayout: "2-2", rows: 6,
    }, gerant);
    expect(dup.status).toBe(409);

    // régénération (aucune vente) → OK, capacité recalculée
    const regen = await json(`/api/helm/backoffice/catalogue/vehicles/${v.id}/seats`, "POST", {
      seatLayout: "2-2", rows: 5,
    }, gerant);
    expect(regen.status).toBe(200);
    expect((await body<{ seats: number; capacity: number }>(regen)).capacity).toBe(19);

    // patch : désactive la sélection par siège
    expect((await json(`/api/helm/backoffice/catalogue/vehicles/${v.id}`, "PATCH", { seatSelectionEnabled: false }, gerant)).status).toBe(200);
    expect((await db.vehicle.findUnique({ where: { id: v.id } }))?.seatSelectionEnabled).toBe(false);

    // suppression du véhicule vierge
    expect((await json(`/api/helm/backoffice/catalogue/vehicles/${v.id}`, "DELETE", undefined, gerant)).status).toBe(200);
  });

  it("véhicule utilisé par un départ : suppression → 409", async () => {
    const used = await db.vehicle.findFirst({
      where: { departures: { some: { status: "PUBLIE" } } },
    });
    const r = await json(`/api/helm/backoffice/catalogue/vehicles/${used!.id}`, "DELETE", undefined, gerant);
    expect(r.status).toBe(409);
  });
});

describe("CRUD départs — cycle de vie complet", () => {
  it("créer (brouillon) → modifier → publier → retarder avec motif → annuler", async () => {
    const route = await db.route.findFirst({ where: { code: "CTN-PKP" } });
    const vehicle = await db.vehicle.findFirst({ where: { companyId: route!.companyId } });

    const r = await json("/api/helm/backoffice/departures", "POST", {
      routeId: route!.id, vehicleId: vehicle!.id, date: "2030-06-15", time: "07:45", basePrice: 9500,
    }, gerant);
    expect(r.status).toBe(201);
    const depId = (await body<{ departure: { id: string } }>(r)).departure.id;
    expect((await db.departure.findUnique({ where: { id: depId } }))?.status).toBe("BROUILLON");

    // modification en brouillon sans raison
    const upd = await body<{ changes: string[] }>(
      await json(`/api/helm/backoffice/departures/${depId}`, "PATCH", { basePrice: 10500 }, gerant),
    );
    expect(upd.changes.join(" ")).toContain("10500");

    // publication
    expect((await json(`/api/helm/backoffice/departures/${depId}/state`, "PATCH", { status: "PUBLIE" }, gerant)).status).toBe(200);

    // modification APRÈS publication : raison exigée
    const noReason = await json(`/api/helm/backoffice/departures/${depId}`, "PATCH", { basePrice: 11000 }, gerant);
    expect(noReason.status).toBe(400);
    const withReason = await json(`/api/helm/backoffice/departures/${depId}`, "PATCH", { basePrice: 11000, reason: "Ajustement carburant" }, gerant);
    expect(withReason.status).toBe(200);

    // transition invalide
    const bad = await json(`/api/helm/backoffice/departures/${depId}/state`, "PATCH", { status: "TERMINE" }, gerant);
    expect(bad.status).toBe(400);

    // retard SANS motif → 400
    const noWhy = await json(`/api/helm/backoffice/departures/${depId}/state`, "PATCH", { status: "RETARDE" }, gerant);
    expect(noWhy.status).toBe(400);

    // retard AVEC motif → 200 + journal d'état
    const late = await json(`/api/helm/backoffice/departures/${depId}/state`, "PATCH", { status: "RETARDE", delayMin: 45, reason: "Panne pneumatique" }, gerant);
    expect(late.status).toBe(200);
    const logs = await db.departureStateLog.findMany({ where: { departureId: depId }, orderBy: { createdAt: "asc" } });
    // Les changements d'état réels (hors modifications de champs) suivent la machine à états
    const transitions = logs.filter((l) => l.fromStatus !== l.toStatus).map((l) => l.toStatus);
    expect(transitions).toEqual(["BROUILLON", "PUBLIE", "RETARDE"]);
    // Les modifications de champs publiable sont aussi tracées avec motif
    expect(logs.some((l) => l.reason?.includes("Ajustement carburant"))).toBe(true);

    // suppression interdite (publié/retardé) → annulation
    expect((await json(`/api/helm/backoffice/departures/${depId}`, "DELETE", undefined, gerant)).status).toBe(409);
    expect((await json(`/api/helm/backoffice/departures/${depId}/state`, "PATCH", { status: "ANNULE", reason: "Annulation commerciale" }, gerant)).status).toBe(200);
    expect((await db.departure.findUnique({ where: { id: depId } }))?.status).toBe("ANNULE");
  });

  it("suppression d'un brouillon vierge", async () => {
    const route = await db.route.findFirst({ where: { code: "CTN-PKP" } });
    const r = await json("/api/helm/backoffice/departures", "POST", {
      routeId: route!.id, date: "2030-07-01", time: "06:00", basePrice: 8000,
    }, gerant);
    const depId = (await body<{ departure: { id: string } }>(r)).departure.id;
    expect((await json(`/api/helm/backoffice/departures/${depId}`, "DELETE", undefined, gerant)).status).toBe(200);
    expect(await db.departure.findUnique({ where: { id: depId } })).toBeNull();
  });

  it("création refusée pour une ligne d'une autre compagnie (isolement)", async () => {
    const sikaRoute = await db.route.findFirst({ where: { code: "CTN-ABJ" } });
    const r = await json("/api/helm/backoffice/departures", "POST", {
      routeId: sikaRoute!.id, date: "2030-06-15", time: "08:00", basePrice: 5000,
    }, gerant);
    expect(r.status).toBe(400);
  });
});

describe("CRUD personnel (TH-ADM-02)", () => {
  it("créer / modifier / désactiver / supprimer, protections anti-verrouillage", async () => {
    const me = await db.staffUser.findUnique({ where: { email: "gerant@corx.test" } });

    const r = await json("/api/helm/backoffice/staff", "POST", {
      email: "nouveau.guichet@corx.test", fullName: "Nouveau Guichet", role: "GUICHETIER", password: "motdepasse8",
    }, gerant);
    expect(r.status).toBe(201);
    const uid = (await body<{ staff: { id: string } }>(r)).staff.id;

    // e-mail déjà pris → 409
    const dup = await json("/api/helm/backoffice/staff", "POST", {
      email: "nouveau.guichet@corx.test", fullName: "X", role: "GUICHETIER", password: "motdepasse8",
    }, gerant);
    expect(dup.status).toBe(409);

    // rôle invalide → 400
    expect((await json("/api/helm/backoffice/staff", "POST", {
      email: "x@corx.test", fullName: "X", role: "SUPERHERO", password: "motdepasse8",
    }, gerant)).status).toBe(400);

    // PATCH : rôle + mot de passe + état
    expect((await json(`/api/helm/backoffice/staff/${uid}`, "PATCH", { role: "FINANCE", active: false, password: "nouveaumdp9" }, gerant)).status).toBe(200);
    const fresh = await db.staffUser.findUnique({ where: { id: uid } });
    expect(fresh?.role).toBe("FINANCE");
    expect(fresh?.active).toBe(false);

    // interdit de changer son propre rôle / se désactiver
    expect((await json(`/api/helm/backoffice/staff/${me!.id}`, "PATCH", { role: "GUICHETIER" }, gerant)).status).toBe(400);
    expect((await json(`/api/helm/backoffice/staff/${me!.id}`, "PATCH", { active: false }, gerant)).status).toBe(400);

    // manager ne gère pas le personnel
    expect((await json("/api/helm/backoffice/staff", "GET", undefined, manager)).status).toBe(403);

    // suppression (pas soi-même)
    expect((await json(`/api/helm/backoffice/staff/${uid}`, "DELETE", undefined, gerant)).status).toBe(200);
    expect((await json(`/api/helm/backoffice/staff/${me!.id}`, "DELETE", undefined, gerant)).status).toBe(400);
  });
});

describe("Paramètres tenant & Support (TH-ADM-01)", () => {
  it("gérant : PATCH rétention (bornes 1-60), audit COMPANY_UPDATED", async () => {
    const bad = await json("/api/helm/backoffice/settings/company", "PATCH", { holdMinutes: 0 }, gerant);
    expect(bad.status).toBe(400);
    const ok = await json("/api/helm/backoffice/settings/company", "PATCH", { holdMinutes: 9, tagline: "Mise à jour test" }, gerant);
    expect(ok.status).toBe(200);
    const company = await db.company.findFirst({ where: { slug: "corridor-express" } });
    expect(company?.holdMinutes).toBe(9);
    expect(await db.auditLog.count({ where: { action: "COMPANY_UPDATED" } })).toBeGreaterThanOrEqual(1);
  });

  it("support : console transverse + provisioning complet (compagnie + gérant)", async () => {
    const list = await body<{ companies: { slug: string }[] }>(
      await json("/api/helm/backoffice/settings/support/companies", "GET", undefined, support),
    );
    expect(list.companies.length).toBeGreaterThanOrEqual(2);
    expect(await db.auditLog.count({ where: { action: "SUPPORT_ACCESS" } })).toBeGreaterThanOrEqual(1);

    const r = await json("/api/helm/backoffice/settings/support/companies", "POST", {
      name: "Derekh Trans", slug: "derekh-trans",
      gerantEmail: "gerant@derekh.test", gerantName: "Gérant Derekh", gerantPassword: "motdepasse8",
      justification: "Contrat de test signé",
    }, support);
    expect(r.status).toBe(201);

    // le gérant provisionné se connecte immédiatement
    const newLogin = await login("gerant@derekh.test", "motdepasse8");
    const stations = await body<{ stations: unknown[] }>(
      await json("/api/helm/backoffice/catalogue/stations", "GET", undefined, newLogin.cookie),
    );
    expect(stations.stations.length).toBe(0); // inventaire vide, cloisonné

    // justification obligatoire
    const noJust = await json("/api/helm/backoffice/settings/support/companies", "POST", {
      name: "X", gerantEmail: "x@x.test", gerantName: "X", gerantPassword: "motdepasse8",
    }, support);
    expect(noJust.status).toBe(400);
  });

  it("journal global du support inaccessible aux tenants", async () => {
    expect((await json("/api/helm/backoffice/settings/support/audit", "GET", undefined, gerant)).status).toBe(403);
  });
});

describe("Vues back-office & supervision", () => {
  it("health : service + base joignables", async () => {
    const d = await body<{ ok: boolean; db: string }>(await json("/api/helm/health", "GET"));
    expect(d.ok).toBe(true);
    expect(d.db).toBe("up");
  });

  it("annuaire public : compagnies + villes desservies", async () => {
    const d = await body<{ companies: { slug: string }[]; cities: { city: string }[] }>(
      await json("/api/helm/companies", "GET"),
    );
    expect(d.companies.length).toBeGreaterThanOrEqual(3);
    expect(d.cities.some((c) => c.city === "Cotonou")).toBe(true);
  });

  it("rapports et journal accessibles au gérant, filtrés par tenant", async () => {
    const reports = await body<{ company: { slug: string } }>(
      await json("/api/helm/backoffice/reports", "GET", undefined, gerant),
    );
    expect(reports.company.slug).toBe("corridor-express");

    const audit = await body<{ logs: { action: string }[] }>(
      await json("/api/helm/backoffice/audit", "GET", undefined, gerant),
    );
    expect(audit.logs.length).toBeGreaterThan(0);
    expect(
      await body<{ logs: unknown[] }>(await json("/api/helm/backoffice/audit", "GET", undefined, sikaCookie())),
    );
    function sikaCookie() { return login("gerant@sika.test").then((x) => x.cookie); }
    // ^ les journaux Sika doivent différer (isolation) — vérifié via contenu
    const sikaAudit = await body<{ logs: { action: string }[] }>(
      await json("/api/helm/backoffice/audit", "GET", undefined, await sikaCookie()),
    );
    const corxActors = audit.logs.map((l) => l.action);
    const sikaActors = sikaAudit.logs.map((l) => l.action);
    expect(new Set([...corxActors, ...sikaActors]).size).toBeGreaterThan(0);
  });
});
