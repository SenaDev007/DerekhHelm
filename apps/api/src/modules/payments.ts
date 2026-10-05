// Travel Helm (API) — paiements back-office : liste, réconciliation des INCONNU,
// interrogation fournisseur (STATUS_QUERY), remboursement, remplacement de billet.
// §3.3 : aucune décision automatique sur INCONNU — l'équipe statue et c'est journalisé.
import { Hono } from "hono";
import { db } from "@travelhelm/db";
import { confirmBookingPipeline, cancelBookingAndRelease, refundBooking, ticketCode, qrPayloadFor, eventToken } from "@travelhelm/core";
import { guard, requireTenant, actorLabel, audit  } from "../lib/context";

const FINANCE_ROLES = ["GERANT", "FINANCE"] as const;
const TICKET_ROLES = ["GERANT", "MANAGER", "GUICHETIER"] as const;

export const paymentsAdmin = new Hono()
  // ——— GET /api/helm/backoffice/payments?status=&limit= ———
  .get("/", async (c) => {
    const g = await guard(c, ["GERANT", "MANAGER", "FINANCE"]);
    const company = await requireTenant(g);

    const status = c.req.query("status");
    const where: Record<string, unknown> = { booking: { companyId: company.id } };
    if (status && status !== "TOUS") where.status = status;

    const payments = await db.payment.findMany({
      where,
      include: {
        booking: { include: { departure: { include: { route: true } }, tickets: { orderBy: { createdAt: "desc" }, take: 1 } } },
        events: { orderBy: { receivedAt: "desc" }, take: 5 },
      },
      orderBy: { createdAt: "desc" },
      take: Number(c.req.query("limit") ?? 80),
    });

    return c.json({
      payments: payments.map((p) => ({
        id: p.id, provider: p.provider, providerRef: p.providerRef, status: p.status,
        amount: p.amount, feeAmount: p.feeAmount, failureReason: p.failureReason,
        createdAt: p.createdAt, completedAt: p.completedAt, refundedAt: p.refundedAt,
        booking: {
          reference: p.booking.reference, status: p.booking.status, passenger: p.booking.passengerName,
          seats: p.booking.seatCodes, channel: p.booking.channel, method: p.booking.paymentMethod,
          route: `${p.booking.departure.route.originCity} → ${p.booking.departure.route.destCity}`,
          departsAt: p.booking.departure.departsAt,
          ticket: p.booking.tickets?.[0] ? { code: p.booking.tickets[0].code, status: p.booking.tickets[0].status } : null,
        },
        events: p.events.map((e) => ({ type: e.type, outcome: e.outcome, ignoredReason: e.ignoredReason, at: e.receivedAt })),
      })),
    });
  })

  // ——— POST /api/helm/backoffice/payments/:providerRef/reconcile ———
  .post("/:providerRef/reconcile", async (c) => {
    const g = await guard(c, [...FINANCE_ROLES]);
    const company = await requireTenant(g);

    const payment = await db.payment.findUnique({
      where: { providerRef: c.req.param("providerRef") },
      include: { booking: true },
    });
    if (!payment || payment.booking.companyId !== company.id) return c.json({ error: "Paiement introuvable." }, 404);
    if (!["INCONNU", "EN_ATTENTE", "INITIE"].includes(payment.status)) {
      return c.json({ error: `Ce paiement (${payment.status}) n'est pas à réconcilier.` }, 409);
    }

    const body = await c.req.json().catch(() => ({}));
    const { decision, reason } = body as { decision?: "SUCCES" | "ECHEC"; reason?: string };
    if (!decision || !["SUCCES", "ECHEC"].includes(decision)) {
      return c.json({ error: "decision requise : SUCCES ou ECHEC." }, 400);
    }
    if (!reason?.trim()) return c.json({ error: "Une justification est obligatoire (rapprochement auditable)." }, 400);
    const actor = actorLabel(g);

    await db.paymentEvent.create({
      data: {
        paymentId: payment.id, eventToken: eventToken(), type: "RECONCILIATION", outcome: decision,
        payload: JSON.stringify({ decision, reason, by: actor, at: new Date().toISOString() }), processed: true,
      },
    });

    if (decision === "SUCCES") {
      const res = await confirmBookingPipeline(payment.bookingId, { actor });
      const ticket = await db.ticket.findFirst({ where: { bookingId: payment.bookingId, status: { in: ["VALIDE", "UTILISE", "EXAMEN_MANUEL"] } }, orderBy: { createdAt: "desc" } });
      await audit(company.id, actor, "PAYMENT_RECONCILED", "Payment", payment.providerRef!, `Décision SUCCES · ${reason}`);
      return c.json({
        ok: true, decision: "SUCCES", bookingStatus: res.booking?.status,
        ticketCode: ticket?.code ?? null, alreadyConfirmed: res.alreadyConfirmed,
      });
    }

    // Décision ÉCHEC : libération des places, annulation de la réservation
    const res = await cancelBookingAndRelease(payment.bookingId, { actor, reason: `Réconciliation échec fournisseur — ${reason}`, refund: false });
    await audit(company.id, actor, "PAYMENT_RECONCILED", "Payment", payment.providerRef!, `Décision ÉCHEC · ${reason}`);
    return c.json({ ok: true, decision: "ECHEC", bookingStatus: res.booking?.status, seatsReleased: true });
  })

  // ——— POST /api/helm/backoffice/payments/:providerRef/status-query ———
  // Interrogation active du fournisseur (§3.3 : INCONNU → statuer, jamais recharger à l'aveugle).
  .post("/:providerRef/status-query", async (c) => {
    const g = await guard(c, [...FINANCE_ROLES, "MANAGER"]);
    const company = await requireTenant(g);

    const payment = await db.payment.findUnique({
      where: { providerRef: c.req.param("providerRef") },
      include: { booking: true },
    });
    if (!payment || payment.booking.companyId !== company.id) return c.json({ error: "Paiement introuvable." }, 404);

    const body = await c.req.json().catch(() => ({}));
    // Console de démonstration : le « fournisseur » répond SUCCES par défaut.
    // En production, ce résultat provient de l'API du prestataire (KKiaPay/MoMo).
    const providerAnswer = (body as { outcome?: "SUCCES" | "ECHEC" | "INCONNU" }).outcome ?? "SUCCES";
    if (!["SUCCES", "ECHEC", "INCONNU"].includes(providerAnswer)) return c.json({ error: "outcome invalide." }, 400);

    await db.paymentEvent.create({
      data: {
        paymentId: payment.id, eventToken: eventToken(), type: "STATUS_QUERY", outcome: providerAnswer,
        payload: JSON.stringify({ providerAnswer, by: actorLabel(g), at: new Date().toISOString() }), processed: true,
      },
    });
    await audit(company.id, actorLabel(g), "PAYMENT_STATUS_QUERY", "Payment", payment.providerRef!, `Réponse fournisseur : ${providerAnswer}`);

    if (providerAnswer === "SUCCES" && ["INCONNU", "EN_ATTENTE", "INITIE"].includes(payment.status)) {
      const res = await confirmBookingPipeline(payment.bookingId, { actor: actorLabel(g) });
      const ticket = await db.ticket.findFirst({ where: { bookingId: payment.bookingId, status: { in: ["VALIDE", "UTILISE", "EXAMEN_MANUEL"] } }, orderBy: { createdAt: "desc" } });
      return c.json({ ok: true, providerAnswer: "SUCCES", confirmed: true, ticketCode: ticket?.code ?? null, alreadyConfirmed: res.alreadyConfirmed });
    }
    return c.json({ ok: true, providerAnswer, confirmed: false, paymentStatus: payment.status });
  })

  // ——— POST /api/helm/backoffice/payments/:providerRef/refund ———
  .post("/:providerRef/refund", async (c) => {
    const g = await guard(c, [...FINANCE_ROLES]);
    const company = await requireTenant(g);

    const payment = await db.payment.findUnique({
      where: { providerRef: c.req.param("providerRef") },
      include: { booking: true },
    });
    if (!payment || payment.booking.companyId !== company.id) return c.json({ error: "Paiement introuvable." }, 404);

    const body = await c.req.json().catch(() => ({}));
    const { reason } = body as { reason?: string };
    if (!reason?.trim()) return c.json({ error: "Une raison est obligatoire pour un remboursement." }, 400);

    try {
      const res = await refundBooking(payment.bookingId, { actor: actorLabel(g), reason: reason.trim() });
      await db.paymentEvent.create({
        data: {
          paymentId: payment.id, eventToken: eventToken(), type: "REFUND", outcome: "REMBOURSE",
          payload: JSON.stringify({ reason, by: actorLabel(g), at: new Date().toISOString() }), processed: true,
        },
      });
      return c.json({ ok: true, status: res.booking?.status, already: res.alreadyRefunded });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 409);
    }
  })

  // ——— POST /api/helm/backoffice/payments/tickets/:code/replace ———
  // Remplacement d'un billet (perte, litige) : ancien → REMPLACE, nouveau code émis (TH-TKT-02).
  .post("/tickets/:code/replace", async (c) => {
    const g = await guard(c, [...TICKET_ROLES]);
    const company = await requireTenant(g);

    const ticket = await db.ticket.findUnique({
      where: { code: c.req.param("code").toUpperCase() },
      include: { booking: true },
    });
    if (!ticket || ticket.booking.companyId !== company.id) return c.json({ error: "Billet introuvable." }, 404);
    if (["ANNULE", "REMPLACE"].includes(ticket.status)) {
      return c.json({ error: `Ce billet est ${ticket.status} — rien à remplacer.` }, 409);
    }
    if (!["CONFIRMEE", "PRESENTEE", "A_RECONCILIER"].includes(ticket.booking.status)) {
      return c.json({ error: `Réservation ${ticket.booking.status} — le billet ne peut être remplacé.` }, 409);
    }

    const body = await c.req.json().catch(() => ({}));
    const { reason } = body as { reason?: string };
    if (!reason?.trim()) return c.json({ error: "Une raison est obligatoire (perte, litige, réémission…)." }, 400);

    const newCode = ticketCode();
    await db.$transaction(async (tx) => {
      await tx.ticket.update({ where: { id: ticket.id }, data: { status: "REMPLACE" } });
      await tx.ticket.create({
        data: { bookingId: ticket.bookingId, code: newCode, qrPayload: qrPayloadFor(newCode), status: "VALIDE" },
      });
    });
    await db.notificationLog.create({
      data: {
        companyId: company.id, departureId: ticket.booking.departureId, bookingId: ticket.bookingId,
        channel: "SMS", template: "BILLET_REMPLACE", recipient: ticket.booking.passengerPhone, status: "ENVOYE",
      },
    });
    await audit(company.id, actorLabel(g), "TICKET_REPLACED", "Ticket", ticket.code, `→ ${newCode} · ${reason}`);
    return c.json({ ok: true, oldCode: ticket.code, newCode });
  });
