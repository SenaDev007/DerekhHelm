// Travel Helm (API) — réservations back-office : liste filtrable, fiche, actions
// (annulation avec libération des places, remboursement, no-show, présentation, note).
import { Hono } from "hono";
import { db } from "@travelhelm/db";
import { cancelBookingAndRelease, refundBooking } from "@travelhelm/core";
import { guard, requireTenant, actorLabel, audit  } from "../lib/context";

const ACTION_ROLES = ["GERANT", "MANAGER", "FINANCE"] as const;

export const bookingsAdmin = new Hono()
  // ——— GET /api/helm/backoffice/bookings?status&channel&q&date ———
  .get("/", async (c) => {
    const g = await guard(c);
    const company = await requireTenant(g);

    const sp = c.req.query();
    const status = sp.status;
    const channel = sp.channel;
    const q = sp.q?.trim().toLowerCase();
    const date = sp.date;

    const where: Record<string, unknown> = { companyId: company.id };
    if (status && status !== "TOUS") where.status = status;
    if (channel && channel !== "TOUS") where.channel = channel;
    if (q) {
      where.OR = [
        { reference: { contains: q.toUpperCase() } },
        { passengerName: { contains: q } },
        { passengerPhone: { contains: q } },
      ];
    }
    if (date) {
      const d0 = new Date(date + "T00:00:00");
      const d1 = new Date(d0); d1.setDate(d0.getDate() + 1);
      where.createdAt = { gte: d0, lt: d1 };
    }

    const bookings = await db.booking.findMany({
      where,
      include: {
        departure: { include: { route: true } },
        tickets: { orderBy: { createdAt: "desc" }, take: 1 },
        payment: true,
      },
      orderBy: { createdAt: "desc" },
      take: 120,
    });

    return c.json({
      bookings: bookings.map((b) => ({
        reference: b.reference, status: b.status, channel: b.channel, createdAt: b.createdAt, confirmedAt: b.confirmedAt,
        passengerName: b.passengerName, passengerPhone: b.passengerPhone, seats: b.seatCodes, seatCount: b.seatCount,
        totalAmount: b.totalAmount, paymentMethod: b.paymentMethod, agentName: b.agentName, note: b.note,
        payment: b.payment ? { status: b.payment.status, providerRef: b.payment.providerRef, failureReason: b.payment.failureReason } : null,
        ticket: b.tickets?.[0] ? { code: b.tickets[0].code, status: b.tickets[0].status, scannedAt: b.tickets[0].scannedAt } : null,
        departure: {
          id: b.departure.id, route: `${b.departure.route.originCity} → ${b.departure.route.destCity}`,
          departsAt: b.departure.departsAt, status: b.departure.status,
        },
      })),
    });
  })

  // ——— GET /api/helm/backoffice/bookings/:reference — fiche + événements paiement ———
  .get("/:reference", async (c) => {
    const g = await guard(c);
    const company = await requireTenant(g);

    const b = await db.booking.findUnique({
      where: { reference: c.req.param("reference").toUpperCase() },
      include: {
        departure: { include: { route: true, vehicle: true } },
        tickets: { orderBy: { createdAt: "desc" }, take: 1 },
        payment: { include: { events: { orderBy: { receivedAt: "desc" } } } },
        occupancies: { include: { seat: true } },
      },
    });
    if (!b || b.companyId !== company.id) return c.json({ error: "Réservation introuvable." }, 404);

    return c.json({
      booking: {
        reference: b.reference, status: b.status, channel: b.channel, createdAt: b.createdAt, confirmedAt: b.confirmedAt, canceledAt: b.canceledAt,
        passengerName: b.passengerName, passengerPhone: b.passengerPhone, passengerEmail: b.passengerEmail,
        seats: b.seatCodes, seatCount: b.seatCount, amount: b.amount, serviceFee: b.serviceFee, totalAmount: b.totalAmount,
        paymentMethod: b.paymentMethod, agentName: b.agentName, note: b.note,
        ticket: b.tickets?.[0] ? { code: b.tickets[0].code, status: b.tickets[0].status, scannedAt: b.tickets[0].scannedAt, scannedBy: b.tickets[0].scannedBy } : null,
        payment: b.payment
          ? {
              provider: b.payment.provider, providerRef: b.payment.providerRef, status: b.payment.status,
              amount: b.payment.amount, failureReason: b.payment.failureReason,
              events: b.payment.events.map((e) => ({ type: e.type, outcome: e.outcome, ignoredReason: e.ignoredReason, at: e.receivedAt })),
            }
          : null,
        departure: {
          id: b.departure.id, route: `${b.departure.route.originCity} → ${b.departure.route.destCity}`,
          departsAt: b.departure.departsAt, status: b.departure.status,
          vehicle: b.departure.vehicle ? `${b.departure.vehicle.label} · ${b.departure.vehicle.plate}` : null,
        },
      },
    });
  })

  // ——— PATCH /api/helm/backoffice/bookings/:reference — actions ———
  .patch("/:reference", async (c) => {
    const g = await guard(c, [...ACTION_ROLES]);
    const company = await requireTenant(g);

    const b = await db.booking.findUnique({
      where: { reference: c.req.param("reference").toUpperCase() },
      include: { payment: true },
    });
    if (!b || b.companyId !== company.id) return c.json({ error: "Réservation introuvable." }, 404);

    const body = await c.req.json().catch(() => ({}));
    const { action, reason, note } = body as { action?: string; reason?: string; note?: string };
    const actor = actorLabel(g);

    switch (action) {
      case "cancel": {
        if (["EMBARQUEE", "TERMINEE", "ANNULEE", "REMBOURSEE", "EXPIREE"].includes(b.status)) {
          return c.json({ error: `Une réservation ${b.status} ne peut plus être annulée.` }, 409);
        }
        if (!reason?.trim()) return c.json({ error: "Une raison est obligatoire pour annuler une réservation." }, 400);
        const refund = ["CONFIRMEE", "PRESENTEE", "A_RECONCILIER"].includes(b.status) && b.payment?.status === "SUCCES";
        const res = await cancelBookingAndRelease(b.id, { actor, reason: reason.trim(), refund });
        return c.json({ ok: true, status: res.booking?.status, refundInitiated: refund });
      }

      case "refund": {
        if (!reason?.trim()) return c.json({ error: "Une raison est obligatoire pour rembourser." }, 400);
        try {
          const res = await refundBooking(b.id, { actor, reason: reason.trim() });
          return c.json({ ok: true, status: res.booking?.status, already: res.alreadyRefunded });
        } catch (e) {
          return c.json({ error: (e as Error).message }, 409);
        }
      }

      case "no_show": {
        if (!["CONFIRMEE", "PRESENTEE"].includes(b.status)) {
          return c.json({ error: `Le no-show ne s'applique pas à une réservation ${b.status}.` }, 409);
        }
        if (!reason?.trim()) return c.json({ error: "Une raison est obligatoire (audit)." }, 400);
        await db.booking.update({ where: { id: b.id }, data: { status: "NO_SHOW", note: b.note ? `${b.note} · No-show : ${reason}` : `No-show : ${reason}` } });
        await audit(company.id, actor, "BOOKING_NO_SHOW", "Booking", b.reference, reason);
        return c.json({ ok: true, status: "NO_SHOW" });
      }

      case "mark_presented": {
        if (b.status !== "CONFIRMEE") {
          return c.json({ error: "Seule une réservation confirmée peut être marquée présentée." }, 409);
        }
        await db.booking.update({ where: { id: b.id }, data: { status: "PRESENTEE" } });
        await audit(company.id, actor, "BOOKING_PRESENTED", "Booking", b.reference, "Voyageur présenté au guichet");
        return c.json({ ok: true, status: "PRESENTEE" });
      }

      case "note": {
        if (!note?.trim()) return c.json({ error: "Note vide." }, 400);
        await db.booking.update({ where: { id: b.id }, data: { note: note.trim() } });
        await audit(company.id, actor, "BOOKING_NOTE", "Booking", b.reference, note.trim().slice(0, 120));
        return c.json({ ok: true });
      }

      default:
        return c.json({ error: "Action inconnue (cancel | refund | no_show | mark_presented | note)." }, 400);
    }
  });
