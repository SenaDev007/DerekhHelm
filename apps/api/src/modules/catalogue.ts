// Travel Helm (API) — catalogue : CRUD complet gares, lignes (+ arrêts), véhicules (+ plan de sièges).
// TH-INV-04 : la sélection par siège n'est activée qu'après vérification du plan réel.
// Toutes les écritures sont journalisées (audit) et strictement cloisonnées au tenant de session.
import { Hono } from "hono";
import { db } from "@travelhelm/db";
import { guard, requireTenant, actorLabel, audit  } from "../lib/context";

const WRITE_ROLES = ["GERANT", "MANAGER", "REPARTITEUR"] as const;

// ——— génération de plan de sièges (même logique que le seed, source unique de vérité) ———
type SeatDef = { code: string; row: number; col: number; kind: string; window: boolean };
export function buildSeatPlan(layout: "2-2" | "2-3", rows: number, vipRows: number[] = []): SeatDef[] {
  const cols = layout === "2-3" ? ["A", "B", "C", "D", "E"] : ["A", "B", "C", "D"];
  const out: SeatDef[] = [];
  for (let r = 1; r <= rows; r++) {
    for (let k = 0; k < cols.length; k++) {
      const code = `${r}${cols[k]}`;
      let kind = "STANDARD";
      if (r === 1 && k === 0) kind = "SERVICE"; // sièges techniques face au chauffeur
      else if (vipRows.includes(r)) kind = "VIP";
      if (r === 1 && k === cols.length - 1 && kind === "STANDARD") kind = "ACCESSIBLE"; // PMR près de la porte
      out.push({ code, row: r, col: k, kind, window: k === 0 || k === cols.length - 1 });
    }
  }
  return out;
}

export const catalogue = new Hono()
  // ══════════════ GARES / ARRÊTS ══════════════
  .get("/stations", async (c) => {
    const g = await guard(c, [...WRITE_ROLES, "GUICHETIER"]);
    const company = await requireTenant(g);
    const stations = await db.station.findMany({
      where: { companyId: company.id },
      orderBy: [{ city: "asc" }, { name: "asc" }],
    });
    return c.json({ stations });
  })

  .post("/stations", async (c) => {
    const g = await guard(c, [...WRITE_ROLES]);
    const company = await requireTenant(g);
    const body = await c.req.json().catch(() => ({}));
    const { city, name, kind = "GARE", isPrimary = false } = body as { city?: string; name?: string; kind?: string; isPrimary?: boolean };
    if (!city?.trim() || !name?.trim()) return c.json({ error: "Ville et nom de la gare requis." }, 400);
    if (!["GARE", "ARRET"].includes(kind)) return c.json({ error: "Type invalide (GARE ou ARRET)." }, 400);

    const station = await db.station.create({ data: { companyId: company.id, city: city.trim(), name: name.trim(), kind, isPrimary } });
    await audit(company.id, actorLabel(g), "STATION_CREATED", "Station", station.id, `${name} (${city}) · ${kind}`);
    return c.json({ station }, 201);
  })

  .patch("/stations/:id", async (c) => {
    const g = await guard(c, [...WRITE_ROLES]);
    const company = await requireTenant(g);
    const station = await db.station.findUnique({ where: { id: c.req.param("id") } });
    if (!station || station.companyId !== company.id) return c.json({ error: "Gare introuvable." }, 404);

    const body = await c.req.json().catch(() => ({}));
    const { city, name, kind, isPrimary } = body as { city?: string; name?: string; kind?: string; isPrimary?: boolean };
    const data: Record<string, unknown> = {};
    if (name !== undefined) { if (!name.trim()) return c.json({ error: "Nom requis." }, 400); data.name = name.trim(); }
    if (city !== undefined) { if (!city.trim()) return c.json({ error: "Ville requise." }, 400); data.city = city.trim(); }
    if (kind !== undefined) { if (!["GARE", "ARRET"].includes(kind)) return c.json({ error: "Type invalide." }, 400); data.kind = kind; }
    if (isPrimary !== undefined) data.isPrimary = isPrimary;
    if (Object.keys(data).length === 0) return c.json({ error: "Aucune modification." }, 400);

    await db.station.update({ where: { id: station.id }, data });
    await audit(company.id, actorLabel(g), "STATION_UPDATED", "Station", station.id, JSON.stringify(data));
    return c.json({ ok: true });
  })

  .delete("/stations/:id", async (c) => {
    const g = await guard(c, [...WRITE_ROLES]);
    const company = await requireTenant(g);
    const station = await db.station.findUnique({ where: { id: c.req.param("id") } });
    if (!station || station.companyId !== company.id) return c.json({ error: "Gare introuvable." }, 404);
    await db.station.delete({ where: { id: station.id } });
    await audit(company.id, actorLabel(g), "STATION_DELETED", "Station", station.id, `${station.name} (${station.city})`);
    return c.json({ ok: true });
  })

  // ══════════════ LIGNES (+ arrêts) ══════════════
  .get("/routes", async (c) => {
    const g = await guard(c, [...WRITE_ROLES, "GUICHETIER"]);
    const company = await requireTenant(g);
    const routes = await db.route.findMany({
      where: { companyId: company.id },
      include: { stops: { orderBy: { seq: "asc" } }, _count: { select: { departures: true } } },
      orderBy: { code: "asc" },
    });
    return c.json({ routes });
  })

  .post("/routes", async (c) => {
    const g = await guard(c, [...WRITE_ROLES]);
    const company = await requireTenant(g);
    const body = await c.req.json().catch(() => ({}));
    const { code, originCity, destCity, label, distanceKm, durationMin, boardingPoint, dropOffPoint, stops = [] } = body as {
      code?: string; originCity?: string; destCity?: string; label?: string; distanceKm?: number; durationMin?: number;
      boardingPoint?: string; dropOffPoint?: string; stops?: { city: string; station: string; seq: number; offsetMin: number }[];
    };
    if (!code?.trim() || !originCity?.trim() || !destCity?.trim() || !durationMin || !boardingPoint?.trim() || !distanceKm) {
      return c.json({ error: "Code, villes, distance, durée et point d'embarquement requis." }, 400);
    }
    if (originCity === destCity) return c.json({ error: "Origine et destination doivent différer." }, 400);
    const dup = await db.route.findFirst({ where: { companyId: company.id, code: code.trim().toUpperCase() } });
    if (dup) return c.json({ error: `Le code ligne ${code} existe déjà pour cette compagnie.` }, 409);

    const route = await db.route.create({
      data: {
        companyId: company.id, code: code.trim().toUpperCase(),
        originCity: originCity.trim(), destCity: destCity.trim(),
        label: label?.trim() || `${originCity} → ${destCity}`,
        distanceKm, durationMin, boardingPoint: boardingPoint.trim(), dropOffPoint: dropOffPoint?.trim() || null,
        stops: {
          create: stops
            .filter((s) => s.city?.trim() && s.station?.trim())
            .map((s, i) => ({ city: s.city.trim(), station: s.station.trim(), seq: s.seq ?? i + 1, offsetMin: s.offsetMin ?? 0 })),
        },
      },
      include: { stops: true },
    });
    await audit(company.id, actorLabel(g), "ROUTE_CREATED", "Route", route.id, `${route.code} · ${route.originCity} → ${route.destCity} · ${route.stops.length} arrêt(s)`);
    return c.json({ route }, 201);
  })

  .patch("/routes/:id", async (c) => {
    const g = await guard(c, [...WRITE_ROLES]);
    const company = await requireTenant(g);
    const route = await db.route.findUnique({ where: { id: c.req.param("id") }, include: { stops: true } });
    if (!route || route.companyId !== company.id) return c.json({ error: "Ligne introuvable." }, 404);

    const body = await c.req.json().catch(() => ({}));
    const { code, originCity, destCity, label, distanceKm, durationMin, boardingPoint, dropOffPoint, stops } = body as {
      code?: string; originCity?: string; destCity?: string; label?: string; distanceKm?: number; durationMin?: number;
      boardingPoint?: string; dropOffPoint?: string; stops?: { city: string; station: string; seq?: number; offsetMin?: number }[];
    };
    const data: Record<string, unknown> = {};
    if (code !== undefined && code.trim().toUpperCase() !== route.code) {
      const dup = await db.route.findFirst({ where: { companyId: company.id, code: code.trim().toUpperCase(), id: { not: route.id } } });
      if (dup) return c.json({ error: "Ce code ligne est déjà utilisé." }, 409);
      data.code = code.trim().toUpperCase();
    }
    if (label !== undefined) data.label = label.trim();
    if (originCity !== undefined) data.originCity = originCity.trim();
    if (destCity !== undefined) data.destCity = destCity.trim();
    if (distanceKm !== undefined) { if (distanceKm < 1) return c.json({ error: "Distance invalide." }, 400); data.distanceKm = distanceKm; }
    if (durationMin !== undefined) { if (durationMin < 5) return c.json({ error: "Durée invalide." }, 400); data.durationMin = durationMin; }
    if (boardingPoint !== undefined) data.boardingPoint = boardingPoint.trim();
    if (dropOffPoint !== undefined) data.dropOffPoint = dropOffPoint?.trim() || null;
    if (originCity && destCity && originCity === destCity) return c.json({ error: "Origine et destination doivent différer." }, 400);

    if (stops !== undefined) {
      // Remplacement atomique de la séquence d'arrêts
      await db.stop.deleteMany({ where: { routeId: route.id } });
      await db.stop.createMany({
        data: stops
          .filter((s) => s.city?.trim() && s.station?.trim())
          .map((s, i) => ({ routeId: route.id, city: s.city.trim(), station: s.station.trim(), seq: s.seq ?? i + 1, offsetMin: s.offsetMin ?? 0 })),
      });
    }
    if (Object.keys(data).length > 0) {
      await db.route.update({ where: { id: route.id }, data });
    }
    await audit(company.id, actorLabel(g), "ROUTE_UPDATED", "Route", route.id, `${(data.code as string) ?? route.code} · ${stops !== undefined ? `${stops.length} arrêt(s)` : "champs"}`);
    return c.json({ ok: true });
  })

  .delete("/routes/:id", async (c) => {
    const g = await guard(c, [...WRITE_ROLES]);
    const company = await requireTenant(g);
    const route = await db.route.findUnique({ where: { id: c.req.param("id") }, include: { departures: { select: { id: true } } } });
    if (!route || route.companyId !== company.id) return c.json({ error: "Ligne introuvable." }, 404);
    if (route.departures.length > 0) {
      return c.json({ error: `Impossible de supprimer : ${route.departures.length} départ(s) utilisent cette ligne.` }, 409);
    }
    await db.stop.deleteMany({ where: { routeId: route.id } });
    await db.route.delete({ where: { id: route.id } });
    await audit(company.id, actorLabel(g), "ROUTE_DELETED", "Route", route.id, `${route.code} · ligne supprimée`);
    return c.json({ ok: true });
  })

  // ══════════════ VÉHICULES (+ plan de sièges) ══════════════
  .get("/vehicles", async (c) => {
    const g = await guard(c, [...WRITE_ROLES, "GUICHETIER"]);
    const company = await requireTenant(g);
    const vehicles = await db.vehicle.findMany({
      where: { companyId: company.id },
      include: { seats: { orderBy: [{ row: "asc" }, { col: "asc" }] }, _count: { select: { departures: true } } },
      orderBy: { label: "asc" },
    });
    return c.json({ vehicles });
  })

  .post("/vehicles", async (c) => {
    const g = await guard(c, [...WRITE_ROLES]);
    const company = await requireTenant(g);
    const body = await c.req.json().catch(() => ({}));
    const { label, model, plate, seatLayout = "2-3", rows = 10, vipRows = [], amenities, seatSelectionEnabled = false } = body as {
      label?: string; model?: string; plate?: string; seatLayout?: "2-2" | "2-3"; rows?: number; vipRows?: number[];
      amenities?: string; seatSelectionEnabled?: boolean;
    };
    if (!label?.trim() || !model?.trim() || !plate?.trim()) return c.json({ error: "Désignation, modèle et immatriculation requis." }, 400);
    if (!["2-2", "2-3"].includes(seatLayout)) return c.json({ error: "Plan invalide (2-2 ou 2-3)." }, 400);
    if (rows < 4 || rows > 16) return c.json({ error: "Nombre de rangées invalide (4 à 16)." }, 400);
    const dup = await db.vehicle.findFirst({ where: { companyId: company.id, plate: plate.trim().toUpperCase() } });
    if (dup) return c.json({ error: "Cette immatriculation existe déjà dans votre flotte." }, 409);

    const plan = buildSeatPlan(seatLayout, rows, vipRows ?? []);
    const vehicle = await db.vehicle.create({
      data: {
        companyId: company.id, label: label.trim(), model: model.trim(), plate: plate.trim().toUpperCase(),
        seatLayout, capacity: plan.filter((s) => s.kind !== "SERVICE").length,
        seatSelectionEnabled: seatSelectionEnabled && plan.length > 0,
        amenities: amenities?.trim() || null,
        seats: { create: plan },
      },
      include: { seats: true },
    });
    await audit(company.id, actorLabel(g), "VEHICLE_CREATED", "Vehicle", vehicle.id, `${vehicle.label} · ${vehicle.plate} · ${vehicle.seats.length} sièges (${seatLayout})${seatSelectionEnabled ? " · sélection activée" : ""}`);
    return c.json({ vehicle }, 201);
  })

  .patch("/vehicles/:id", async (c) => {
    const g = await guard(c, [...WRITE_ROLES]);
    const company = await requireTenant(g);
    const vehicle = await db.vehicle.findUnique({ where: { id: c.req.param("id") } });
    if (!vehicle || vehicle.companyId !== company.id) return c.json({ error: "Véhicule introuvable." }, 404);

    const body = await c.req.json().catch(() => ({}));
    const { label, model, plate, amenities, seatSelectionEnabled } = body as {
      label?: string; model?: string; plate?: string; amenities?: string; seatSelectionEnabled?: boolean;
    };
    const data: Record<string, unknown> = {};
    if (label !== undefined) { if (!label.trim()) return c.json({ error: "Désignation requise." }, 400); data.label = label.trim(); }
    if (model !== undefined) { if (!model.trim()) return c.json({ error: "Modèle requis." }, 400); data.model = model.trim(); }
    if (plate !== undefined) {
      const dup = await db.vehicle.findFirst({ where: { companyId: company.id, plate: plate.trim().toUpperCase(), id: { not: vehicle.id } } });
      if (dup) return c.json({ error: "Immatriculation déjà utilisée." }, 409);
      data.plate = plate.trim().toUpperCase();
    }
    if (amenities !== undefined) data.amenities = amenities?.trim() || null;

    if (seatSelectionEnabled !== undefined && seatSelectionEnabled !== vehicle.seatSelectionEnabled) {
      // TH-INV-04 : activation de la sélection par siège = engagement sur le plan réel.
      if (seatSelectionEnabled) {
        const seats = await db.seat.count({ where: { vehicleId: vehicle.id, kind: { not: "SERVICE" } } });
        if (seats === 0) return c.json({ error: "Aucun siège enregistré pour ce véhicule — générez d'abord le plan de sièges." }, 400);
        data.seatSelectionEnabled = true;
        data.capacity = seats;
      } else {
        data.seatSelectionEnabled = false;
      }
    }
    if (Object.keys(data).length === 0) return c.json({ error: "Aucune modification." }, 400);

    await db.vehicle.update({ where: { id: vehicle.id }, data });
    await audit(company.id, actorLabel(g), "VEHICLE_UPDATED", "Vehicle", vehicle.id, JSON.stringify(data));
    return c.json({ ok: true });
  })

  // ——— POST /vehicles/:id/seats — (re)génération du plan de sièges ———
  .post("/vehicles/:id/seats", async (c) => {
    const g = await guard(c, [...WRITE_ROLES]);
    const company = await requireTenant(g);
    const vehicle = await db.vehicle.findUnique({ where: { id: c.req.param("id") } });
    if (!vehicle || vehicle.companyId !== company.id) return c.json({ error: "Véhicule introuvable." }, 404);

    const body = await c.req.json().catch(() => ({}));
    const { seatLayout, rows = 10, vipRows = [] } = body as { seatLayout?: "2-2" | "2-3"; rows?: number; vipRows?: number[] };
    const layout = (seatLayout ?? vehicle.seatLayout) as "2-2" | "2-3";
    if (!["2-2", "2-3"].includes(layout)) return c.json({ error: "Plan invalide." }, 400);
    if (rows < 4 || rows > 16) return c.json({ error: "Nombre de rangées invalide." }, 400);

    // Sécurité : impossible de régénérer un plan si des occupations existent (inventaire en production)
    const occupations = await db.seatOccupancy.count({ where: { seat: { vehicleId: vehicle.id } } });
    if (occupations > 0) {
      return c.json({ error: "Ce véhicule possède des ventes enregistrées — le plan de sièges ne peut plus être régénéré (inventaire protégé)." }, 409);
    }

    await db.seat.deleteMany({ where: { vehicleId: vehicle.id } });
    const plan = buildSeatPlan(layout, rows, vipRows ?? []);
    await db.seat.createMany({ data: plan.map((s) => ({ ...s, vehicleId: vehicle.id })) });
    await db.vehicle.update({
      where: { id: vehicle.id },
      data: { seatLayout: layout, capacity: plan.filter((s) => s.kind !== "SERVICE").length },
    });
    await audit(company.id, actorLabel(g), "VEHICLE_SEATS_REGENERATED", "Vehicle", vehicle.id, `${layout} · ${rows} rangées · ${plan.length} sièges`);
    return c.json({ ok: true, seats: plan.length, capacity: plan.filter((s) => s.kind !== "SERVICE").length });
  })

  .delete("/vehicles/:id", async (c) => {
    const g = await guard(c, [...WRITE_ROLES]);
    const company = await requireTenant(g);
    const vehicle = await db.vehicle.findUnique({ where: { id: c.req.param("id") }, include: { departures: { select: { id: true } } } });
    if (!vehicle || vehicle.companyId !== company.id) return c.json({ error: "Véhicule introuvable." }, 404);
    const occupations = await db.seatOccupancy.count({ where: { seat: { vehicleId: vehicle.id } } });
    if (vehicle.departures.length > 0 || occupations > 0) {
      return c.json({ error: `Impossible de supprimer : ${vehicle.departures.length} départ(s) et ${occupations} occupation(s) référencent ce véhicule.` }, 409);
    }
    await db.seat.deleteMany({ where: { vehicleId: vehicle.id } });
    await db.vehicle.delete({ where: { id: vehicle.id } });
    await audit(company.id, actorLabel(g), "VEHICLE_DELETED", "Vehicle", vehicle.id, `${vehicle.label} · ${vehicle.plate}`);
    return c.json({ ok: true });
  });
