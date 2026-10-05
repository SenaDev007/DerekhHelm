// Travel Helm (API) — gestion des départs : CRUD complet + transitions d'état journalisées.
// Règles métier :
//  · création en BROUILLON uniquement
//  · modification (prix/heure/véhicule/cutoff) autorisée en BROUILLON/PUBLIE/RETARDE,
//    toute modification après publication exige une raison (audit)
//  · suppression uniquement en BROUILLON sans réservation ni occupation
//  · transitions contraintes par la machine à états §3.3, raison obligatoire pour
//    RETARDE / ANNULE / VEHICULE_REMPLACE
import { Hono } from "hono";
import { db } from "@travelhelm/db";
import { guard, requireTenant, actorLabel, audit  } from "../lib/context";

const WRITE_ROLES = ["GERANT", "MANAGER", "REPARTITEUR"] as const;

export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  BROUILLON: ["PUBLIE", "ANNULE"],
  PUBLIE: ["EMBARQUEMENT", "RETARDE", "ANNULE", "VEHICULE_REMPLACE"],
  EMBARQUEMENT: ["EN_COURS", "RETARDE"],
  RETARDE: ["EMBARQUEMENT", "EN_COURS", "ANNULE"],
  EN_COURS: ["TERMINE"],
  VEHICULE_REMPLACE: ["EMBARQUEMENT", "EN_COURS", "ANNULE"],
  TERMINE: [],
  ANNULE: [],
};

function dayRange(dateParam?: string | null) {
  const dayStart = dateParam ? new Date(dateParam + "T00:00:00") : new Date(new Date().setHours(0, 0, 0, 0));
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayStart.getDate() + 1);
  return { dayStart, dayEnd };
}

export const departuresAdmin = new Hono()
  // ——— GET /api/helm/backoffice/departures?date=YYYY-MM-DD ———
  .get("/", async (c) => {
    const g = await guard(c);
    const company = await requireTenant(g);

    const { dayStart, dayEnd } = dayRange(c.req.query("date"));

    const departures = await db.departure.findMany({
      where: { companyId: company.id, departsAt: { gte: dayStart, lt: dayEnd } },
      include: {
        route: true, vehicle: { include: { seats: true } },
        occupancies: { include: { booking: true } },
        stateLogs: { orderBy: { createdAt: "desc" }, take: 5 },
      },
      orderBy: { departsAt: "asc" },
    });

    return c.json({
      date: dayStart.toISOString().slice(0, 10),
      departures: departures.map((d) => {
        const capacity = d.seatSelectionEnabled ? d.vehicle?.seats.filter((s) => s.kind !== "SERVICE").length ?? d.capacity : d.capacity;
        const confirmed = d.occupancies.filter((o) => o.status === "CONFIRMED").length;
        return {
          id: d.id, departsAt: d.departsAt, durationMin: d.durationMin, status: d.status, delayMin: d.delayMin, reason: d.reason,
          basePrice: d.basePrice, vipSurcharge: d.vipSurcharge, seatSelection: d.seatSelectionEnabled,
          capacity, configuredCapacity: d.capacity, boardingCutoffMin: d.boardingCutoffMin, checkInNote: d.checkInNote,
          route: { id: d.route.id, code: d.route.code, originCity: d.route.originCity, destCity: d.route.destCity, boardingPoint: d.route.boardingPoint },
          vehicle: d.vehicle ? { id: d.vehicle.id, label: d.vehicle.label, model: d.vehicle.model, plate: d.vehicle.plate, seatLayout: d.vehicle.seatLayout } : null,
          confirmed, occupancy: capacity ? Math.round((confirmed / capacity) * 100) : 0,
          bookingsCount: d.occupancies.filter((o) => o.bookingId).length,
          revenue: d.occupancies.filter((o) => o.status === "CONFIRMED" && o.booking).reduce((s, o) => s + (o.booking?.totalAmount ?? 0), 0),
          stateLogs: d.stateLogs.map((l) => ({ from: l.fromStatus, to: l.toStatus, actor: l.actor, reason: l.reason, at: l.createdAt })),
        };
      }),
      routes: await db.route.findMany({
        where: { companyId: company.id },
        select: { id: true, code: true, originCity: true, destCity: true, durationMin: true, boardingPoint: true },
      }),
      vehicles: await db.vehicle.findMany({
        where: { companyId: company.id },
        select: { id: true, label: true, model: true, plate: true, capacity: true, seatSelectionEnabled: true, seatLayout: true },
      }),
    });
  })

  // ——— POST /api/helm/backoffice/departures — création (BROUILLON) ———
  .post("/", async (c) => {
    const g = await guard(c, [...WRITE_ROLES]);
    const company = await requireTenant(g);

    const body = await c.req.json().catch(() => ({}));
    const { routeId, vehicleId, date, time, basePrice, vipSurcharge = 0, boardingCutoffMin = 30, checkInNote } = body as {
      routeId?: string; vehicleId?: string; date?: string; time?: string; basePrice?: number; vipSurcharge?: number; boardingCutoffMin?: number; checkInNote?: string;
    };
    if (!routeId || !date || !time || !basePrice || basePrice < 500) {
      return c.json({ error: "Ligne, date, heure et prix de base (≥ 500 FCFA) requis" }, 400);
    }
    const route = await db.route.findUnique({ where: { id: routeId } });
    if (!route || route.companyId !== company.id) return c.json({ error: "Ligne invalide pour cette compagnie" }, 400);

    const vehicle = vehicleId ? await db.vehicle.findUnique({ where: { id: vehicleId } }) : null;
    if (vehicleId && (!vehicle || vehicle.companyId !== company.id)) return c.json({ error: "Véhicule invalide pour cette compagnie" }, 400);

    const departsAt = new Date(`${date}T${time}:00`);
    if (isNaN(departsAt.getTime())) return c.json({ error: "Date/heure invalide" }, 400);

    const departure = await db.departure.create({
      data: {
        companyId: company.id, routeId, vehicleId: vehicle?.id ?? null,
        departsAt, durationMin: route.durationMin, status: "BROUILLON",
        basePrice, vipSurcharge, seatSelectionEnabled: vehicle?.seatSelectionEnabled ?? false,
        capacity: vehicle?.capacity ?? 30, boardingCutoffMin,
        checkInNote: checkInNote?.trim() || "Présentez-vous au point d'embarquement indiqué sur le billet.",
      },
    });
    await db.departureStateLog.create({ data: { departureId: departure.id, fromStatus: null, toStatus: "BROUILLON", actor: actorLabel(g) } });
    await audit(company.id, actorLabel(g), "DEPARTURE_CREATED", "Departure", departure.id, `${route.code} · ${date} ${time} · ${basePrice} FCFA`);
    return c.json({ departure: { id: departure.id, status: "BROUILLON" } }, 201);
  })

  // ——— GET /api/helm/backoffice/departures/:id — fiche complète (édition) ———
  .get("/:id", async (c) => {
    const g = await guard(c);
    const company = await requireTenant(g);

    const d = await db.departure.findUnique({
      where: { id: c.req.param("id") },
      include: { route: true, vehicle: true, stateLogs: { orderBy: { createdAt: "desc" } }, occupancies: true },
    });
    if (!d || d.companyId !== company.id) return c.json({ error: "Départ introuvable" }, 404);

    return c.json({
      departure: {
        id: d.id, routeId: d.routeId, vehicleId: d.vehicleId,
        departsAt: d.departsAt, durationMin: d.durationMin, status: d.status,
        basePrice: d.basePrice, vipSurcharge: d.vipSurcharge,
        seatSelectionEnabled: d.seatSelectionEnabled, capacity: d.capacity,
        boardingCutoffMin: d.boardingCutoffMin, checkInNote: d.checkInNote,
        delayMin: d.delayMin, reason: d.reason,
        route: { id: d.route.id, code: d.route.code },
        vehicle: d.vehicle ? { id: d.vehicle.id, label: d.vehicle.label, plate: d.vehicle.plate } : null,
        occupanciesCount: d.occupancies.filter((o) => o.status === "CONFIRMED").length,
      },
      stateLogs: d.stateLogs.map((l) => ({ from: l.fromStatus, to: l.toStatus, actor: l.actor, reason: l.reason, at: l.createdAt })),
    });
  })

  // ——— PATCH /api/helm/backoffice/departures/:id — modification des champs ———
  .patch("/:id", async (c) => {
    const g = await guard(c, [...WRITE_ROLES]);
    const company = await requireTenant(g);

    const id = c.req.param("id");
    const departure = await db.departure.findUnique({ where: { id }, include: { route: true, vehicle: true } });
    if (!departure || departure.companyId !== company.id) return c.json({ error: "Départ introuvable" }, 404);

    if (!["BROUILLON", "PUBLIE", "RETARDE"].includes(departure.status)) {
      return c.json({ error: `Un départ ${departure.status} ne peut plus être modifié.` }, 409);
    }

    const body = await c.req.json().catch(() => ({}));
    const { date, time, basePrice, vipSurcharge, boardingCutoffMin, vehicleId, checkInNote, reason } = body as {
      date?: string; time?: string; basePrice?: number; vipSurcharge?: number; boardingCutoffMin?: number; vehicleId?: string | null; checkInNote?: string; reason?: string;
    };

    const isPublished = departure.status !== "BROUILLON";
    const changes: string[] = [];
    const data: Record<string, unknown> = {};

    if (date || time) {
      const d0 = new Date(departure.departsAt);
      const newDate = date ?? departure.departsAt.toISOString().slice(0, 10);
      const newTime = time ?? `${String(d0.getHours()).padStart(2, "0")}:${String(d0.getMinutes()).padStart(2, "0")}`;
      const departsAt = new Date(`${newDate}T${newTime}:00`);
      if (isNaN(departsAt.getTime())) return c.json({ error: "Date/heure invalide" }, 400);
      if (departsAt.getTime() !== departure.departsAt.getTime()) {
        data.departsAt = departsAt;
        changes.push(`heure → ${newDate} ${newTime}`);
      }
    }
    if (basePrice !== undefined && basePrice !== departure.basePrice) {
      if (basePrice < 500) return c.json({ error: "Prix de base invalide (≥ 500 FCFA)" }, 400);
      data.basePrice = basePrice;
      changes.push(`prix ${departure.basePrice} → ${basePrice} FCFA`);
    }
    if (vipSurcharge !== undefined && vipSurcharge !== departure.vipSurcharge) {
      if (vipSurcharge < 0) return c.json({ error: "Supplément VIP invalide" }, 400);
      data.vipSurcharge = vipSurcharge;
      changes.push(`supplément VIP → ${vipSurcharge} FCFA`);
    }
    if (boardingCutoffMin !== undefined && boardingCutoffMin !== departure.boardingCutoffMin) {
      if (boardingCutoffMin < 0 || boardingCutoffMin > 240) return c.json({ error: "Cutoff invalide (0-240 min)" }, 400);
      data.boardingCutoffMin = boardingCutoffMin;
      changes.push(`cutoff → ${boardingCutoffMin} min`);
    }
    if (checkInNote !== undefined && checkInNote.trim() !== (departure.checkInNote ?? "")) {
      data.checkInNote = checkInNote.trim() || null;
      changes.push("consigne d'embarquement");
    }
    if (vehicleId !== undefined && vehicleId !== departure.vehicleId) {
      let vehicle: Awaited<ReturnType<typeof db.vehicle.findUnique>> = null;
      if (vehicleId) {
        vehicle = await db.vehicle.findUnique({ where: { id: vehicleId } });
        if (!vehicle || vehicle.companyId !== company.id) return c.json({ error: "Véhicule invalide" }, 400);
      }
      data.vehicleId = vehicle?.id ?? null;
      data.seatSelectionEnabled = vehicle?.seatSelectionEnabled ?? false;
      data.capacity = vehicle?.capacity ?? 30;
      changes.push(`véhicule → ${vehicle?.label ?? "sans véhicule (capacité)"}`);
    }

    if (Object.keys(data).length === 0) {
      return c.json({ error: "Aucune modification détectée." }, 400);
    }
    if (isPublished && !reason?.trim()) {
      return c.json({ error: "Une raison est obligatoire pour modifier un départ déjà publié (exigence d'audit)." }, 400);
    }

    await db.departure.update({ where: { id }, data });
    await db.departureStateLog.create({
      data: {
        departureId: id, fromStatus: departure.status, toStatus: departure.status, actor: actorLabel(g),
        reason: `Modification : ${changes.join(" · ")}${reason?.trim() ? ` · Motif : ${reason.trim()}` : ""}`,
      },
    });
    // Avis aux passagers si le départ est déjà publié (heure ou véhicule changent)
    if (isPublished && (data.departsAt || data.vehicleId)) {
      const impacted = await db.booking.findMany({ where: { departureId: id, status: { in: ["CONFIRMEE", "PRESENTEE"] } } });
      for (const b of impacted) {
        await db.notificationLog.create({
          data: {
            companyId: company.id, departureId: id, bookingId: b.id, channel: "SMS",
            template: "AVIS_MODIFICATION", recipient: b.passengerPhone, status: "ENVOYE",
          },
        });
      }
    }
    await audit(company.id, actorLabel(g), "DEPARTURE_UPDATED", "Departure", id, `${departure.route.code} · ${changes.join(" · ")}${reason ? ` · Motif : ${reason}` : ""}`);
    return c.json({ ok: true, changes });
  })

  // ——— PATCH /api/helm/backoffice/departures/:id/state — transition d'état ———
  .patch("/:id/state", async (c) => {
    const g = await guard(c, [...WRITE_ROLES]);
    const company = await requireTenant(g);

    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const { status, reason, delayMin } = body as { status?: string; reason?: string; delayMin?: number };
    const actor = actorLabel(g);

    const departure = await db.departure.findUnique({ where: { id }, include: { bookings: true, route: true } });
    if (!departure || departure.companyId !== company.id) return c.json({ error: "Départ introuvable" }, 404);
    if (!status || !ALLOWED_TRANSITIONS[departure.status]?.includes(status)) {
      return c.json({
        error: `Transition ${departure.status} → ${status} non autorisée. Autorisées : ${ALLOWED_TRANSITIONS[departure.status]?.join(", ")}`,
      }, 400);
    }
    if (["RETARDE", "ANNULE", "VEHICULE_REMPLACE"].includes(status) && !reason?.trim()) {
      return c.json({ error: "Une raison est obligatoire pour ce changement (exigence d'audit)." }, 400);
    }

    await db.departure.update({ where: { id }, data: { status, reason: reason ?? departure.reason, delayMin: delayMin ?? departure.delayMin } });
    await db.departureStateLog.create({ data: { departureId: id, fromStatus: departure.status, toStatus: status, actor, reason: reason ?? null } });

    let notified = 0;
    if (status === "PUBLIE") {
      await db.departure.update({ where: { id }, data: { publishedAt: new Date() } });
    }
    if (["RETARDE", "ANNULE", "VEHICULE_REMPLACE", "EMBARQUEMENT"].includes(status)) {
      const impacted = departure.bookings.filter((b) => ["CONFIRMEE", "PRESENTEE"].includes(b.status));
      notified = impacted.length;
      for (const b of impacted) {
        await db.notificationLog.create({
          data: {
            companyId: company.id, departureId: id, bookingId: b.id,
            channel: "SMS",
            template: status === "RETARDE" ? "AVIS_RETARD" : status === "ANNULE" ? "AVIS_ANNULATION" : status === "VEHICULE_REMPLACE" ? "AVIS_VEHICULE" : "OUVERTURE_EMBARQUEMENT",
            recipient: b.passengerPhone, status: "ENVOYE",
          },
        });
      }
      if (status === "ANNULE") {
        await db.ticket.updateMany({ where: { bookingId: { in: impacted.map((b) => b.id) } }, data: { status: "ANNULE" } });
        await db.booking.updateMany({ where: { id: { in: impacted.map((b) => b.id) } }, data: { status: "REMBOURSEMENT_EN_COURS" } });
        await db.payment.updateMany({ where: { bookingId: { in: impacted.map((b) => b.id) }, status: "SUCCES" }, data: { status: "REMBOURSE" } });
      }
    }

    await audit(company.id, actor, `DEPARTURE_${status}`, "Departure", id,
      `${departure.route.code} · ${reason ?? ""}${notified ? ` · ${notified} passager(s) notifié(s)` : ""}`);

    return c.json({ ok: true, status, notified });
  })

  // ——— DELETE /api/helm/backoffice/departures/:id — suppression (BROUILLON vierge) ———
  .delete("/:id", async (c) => {
    const g = await guard(c, [...WRITE_ROLES]);
    const company = await requireTenant(g);

    const id = c.req.param("id");
    const departure = await db.departure.findUnique({ where: { id }, include: { bookings: true, occupancies: true, route: true } });
    if (!departure || departure.companyId !== company.id) return c.json({ error: "Départ introuvable" }, 404);

    if (departure.status !== "BROUILLON") {
      return c.json({ error: "Seul un départ en brouillon peut être supprimé. Un départ publié doit être annulé (traçabilité des passagers)." }, 409);
    }
    if (departure.bookings.length > 0 || departure.occupancies.length > 0) {
      return c.json({ error: "Ce brouillon possède déjà des réservations ou occupations — annulez-le plutôt que le supprimer." }, 409);
    }

    await db.departureStateLog.deleteMany({ where: { departureId: id } });
    await db.departure.delete({ where: { id } });
    await audit(company.id, actorLabel(g), "DEPARTURE_DELETED", "Departure", id, `${departure.route.code} · brouillon supprimé`);
    return c.json({ ok: true });
  });
