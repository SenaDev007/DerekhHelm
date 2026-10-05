// Travel Helm (API) — embarquement : scan des billets + manifeste (TH-TKT-04/05).
// Session requise (contrôleur, gérant, manager) — le tenant est vérifié à chaque scan.
import { Hono } from "hono";
import { db } from "@travelhelm/db";
import { sweepExpiredHolds, verifyQrPayload } from "@travelhelm/core";
import { guard, audit, actorLabel, type AuthUser } from "../lib/context";

const BOARDING_ROLES = ["CONTROLEUR", "GERANT", "MANAGER"] as const;

async function assertTenant(user: AuthUser, departureCompanyId: string) {
  if (!user.companyId || user.companyId !== departureCompanyId) {
    return false;
  }
  return true;
}

export const boarding = new Hono()
  // ——— POST /api/helm/boarding/scan ———
  .post("/scan", async (c) => {
    const g = await guard(c, [...BOARDING_ROLES]);

    const body = await c.req.json().catch(() => ({}));
    const { scan } = body as { scan?: string };
    const actor = actorLabel(g);
    if (!scan?.trim()) return c.json({ error: "Code ou QR requis" }, 400);

    let code = scan.trim().toUpperCase();
    const qr = verifyQrPayload(scan.trim());
    if (qr.valid) code = qr.code;

    const ticket = await db.ticket.findUnique({
      where: { code },
      include: { booking: { include: { departure: { include: { route: true } } } } },
    });
    if (!ticket) {
      return c.json({ result: "INCONNU", message: "Billet introuvable sur ce départ — examen manuel conseillé", code });
    }

    const b = ticket.booking;
    const departure = b.departure;

    // TH-ADM-04 : un contrôleur d'une compagnie ne peut pas valider les billets d'une autre.
    if (!(await assertTenant(g, departure.companyId))) {
      await audit(null, actor, "BOARDING_CROSS_TENANT_BLOCKED", "Ticket", ticket.code, "Tentative de scan hors tenant refusée");
      return c.json({ result: "REFUSE", code: ticket.code, message: "Billet hors périmètre de votre compagnie — scan refusé", passenger: b.passengerName, booking: b.reference }, 403);
    }

    if (ticket.status === "ANNULE" || ticket.status === "REMPLACE") {
      await audit(departure.companyId, actor, "BOARDING_REFUSED", "Ticket", ticket.code, `Statut ${ticket.status}`);
      return c.json({
        result: "REFUSE", code: ticket.code, message: `Billet ${ticket.status === "ANNULE" ? "annulé" : "remplacé"} — embarquement refusé`,
        passenger: b.passengerName, booking: b.reference, departure: `${departure.route.originCity} → ${departure.route.destCity}`,
      });
    }

    if (b.status === "A_RECONCILIER") {
      await audit(departure.companyId, actor, "BOARDING_MANUAL", "Ticket", ticket.code, "Paiement à réconcilier — examen manuel");
      return c.json({
        result: "EXAMEN_MANUEL", code: ticket.code, message: "Paiement non confirmé (à réconcilier) — guichet/finance doit statuer avant embarquement",
        passenger: b.passengerName, booking: b.reference, seats: b.seatCodes,
      });
    }

    if (ticket.status === "UTILISE") {
      await audit(departure.companyId, actor, "BOARDING_DUPLICATE", "Ticket", ticket.code, "Double scan ignoré");
      return c.json({
        result: "DEJA_EMBARQUE", code: ticket.code, message: "Billet déjà utilisé",
        scannedAt: ticket.scannedAt, scannedBy: ticket.scannedBy,
        passenger: b.passengerName, seats: b.seatCodes, booking: b.reference,
      });
    }

    if (b.status !== "CONFIRMEE" && b.status !== "PRESENTEE") {
      return c.json({
        result: "REFUSE", code: ticket.code, message: `Réservation ${b.status} — paiement non confirmé`,
        passenger: b.passengerName, booking: b.reference,
      });
    }

    const now = new Date();
    await db.ticket.update({ where: { id: ticket.id }, data: { status: "UTILISE", scannedAt: now, scannedBy: actor } });
    await db.booking.update({ where: { id: b.id }, data: { status: "EMBARQUEE" } });
    await audit(departure.companyId, actor, "BOARDING_OK", "Ticket", ticket.code, `${b.passengerName} · sièges ${b.seatCodes ?? "—"}`);

    return c.json({
      result: "EMBARQUE", code: ticket.code, message: "Embarquement validé",
      passenger: b.passengerName, seats: b.seatCodes, booking: b.reference,
      departure: `${departure.route.originCity} → ${departure.route.destCity}`,
      departsAt: departure.departsAt, at: now, by: actor,
    });
  })

  // ——— GET /api/helm/boarding/manifest/:departureId ———
  .get("/manifest/:id", async (c) => {
    const g = await guard(c, [...BOARDING_ROLES]);
    if (!g.companyId) return c.json({ error: "Compte sans compagnie." }, 403);

    const id = c.req.param("id");
    await sweepExpiredHolds(id);

    const d = await db.departure.findUnique({
      where: { id },
      include: {
        route: true, vehicle: { include: { seats: { orderBy: [{ row: "asc" }, { col: "asc" }] } } }, company: true,
        bookings: {
          where: { status: { in: ["CONFIRMEE", "PRESENTEE", "EMBARQUEE", "EN_ATTENTE_PAIEMENT", "A_RECONCILIER", "NO_SHOW", "TERMINEE"] } },
          include: { tickets: { orderBy: { createdAt: "desc" }, take: 1 }, payment: true, occupancies: { include: { seat: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!d) return c.json({ error: "Départ introuvable" }, 404);
    if (d.companyId !== g.companyId) return c.json({ error: "Départ hors périmètre de votre compagnie." }, 403);

    const seats = d.vehicle
      ? d.vehicle.seats.map((s) => {
          const occ = d.bookings.flatMap((b) => b.occupancies).find((o) => o.seatId === s.id && o.status === "CONFIRMED");
          const b = occ?.bookingId ? d.bookings.find((bb) => bb.id === occ.bookingId) : null;
          return {
            code: s.code, row: s.row, col: s.col, kind: s.kind,
            state: !occ ? "FREE" : b?.status === "EMBARQUEE" || b?.status === "TERMINEE" ? "BOARDED" : "BOOKED",
            bookingRef: b?.reference ?? null, passenger: b?.passengerName ?? null, ticketCode: b?.tickets?.[0]?.code ?? null,
            ticketStatus: b?.tickets?.[0]?.status ?? null,
          };
        })
      : [];

    const totalSeats = d.vehicle ? d.vehicle.seats.filter((s) => s.kind !== "SERVICE").length : d.capacity;
    const boarded = d.bookings.filter((b) => ["EMBARQUEE", "TERMINEE"].includes(b.status));
    const confirmed = d.bookings.filter((b) => ["CONFIRMEE", "PRESENTEE"].includes(b.status));
    const pending = d.bookings.filter((b) => ["EN_ATTENTE_PAIEMENT", "A_RECONCILIER"].includes(b.status));

    return c.json({
      departure: {
        id: d.id, route: `${d.route.originCity} → ${d.route.destCity}`, code: d.route.code,
        departsAt: d.departsAt, durationMin: d.durationMin, status: d.status, delayMin: d.delayMin,
        vehicle: d.vehicle ? { label: d.vehicle.label, plate: d.vehicle.plate, model: d.vehicle.model, seatLayout: d.vehicle.seatLayout } : null,
        company: { name: d.company.name, brandColor: d.company.brandColor },
        boardingPoint: d.route.boardingPoint, dropOffPoint: d.route.dropOffPoint,
      },
      manifest: d.bookings.map((b) => ({
        reference: b.reference, passenger: b.passengerName, phone: b.passengerPhone, seats: b.seatCodes,
        status: b.status, channel: b.channel, amount: b.totalAmount, method: b.paymentMethod,
        ticket: b.tickets?.[0] ? { code: b.tickets[0].code, status: b.tickets[0].status, scannedAt: b.tickets[0].scannedAt, scannedBy: b.tickets[0].scannedBy } : null,
        payment: b.payment ? { status: b.payment.status, providerRef: b.payment.providerRef } : null,
      })),
      seats,
      stats: { totalSeats, boarded: boarded.length, confirmed: confirmed.length, pending: pending.length },
      serverTime: new Date().toISOString(),
    });
  });
