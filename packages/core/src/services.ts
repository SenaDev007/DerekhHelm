// Travel Helm — logique serveur : invariants d'inventaire, pipeline de confirmation
import { db } from "@travelhelm/db";
import { bookingRef, ticketCode, qrPayloadFor } from "./ids";

export type Actor = { name: string; kind: "WEB" | "GUICHET" | "SYSTEM" | "CONTROLEUR" };

export async function audit(companyId: string | null, actor: string, action: string, entity: string, entityId: string, detail?: string) {
  await db.auditLog.create({ data: { companyId, actor, action, entity, entityId, detail } });
}

/**
 * Libération idempotente des rétentions expirées (TH-INV-02).
 * Une rétention expirée n'est jamais une place vendue : la ligne d'occupation est supprimée,
 * ce qui rend la contrainte d'unicité (departureId, seatId) de nouveau disponible.
 */
export async function sweepExpiredHolds(departureId?: string) {
  const stale = await db.seatOccupancy.findMany({
    where: {
      status: "HOLD",
      expiresAt: { lt: new Date() },
      ...(departureId ? { departureId } : {}),
    },
    include: { booking: true },
  });
  for (const occ of stale) {
    await db.seatOccupancy.deleteMany({ where: { id: occ.id } });
    // La réservation en attente qui n'a jamais été payée passe à EXPIREE (une seule fois)
    if (occ.bookingId && occ.booking && occ.booking.status === "EN_ATTENTE_PAIEMENT") {
      const remaining = await db.seatOccupancy.count({ where: { bookingId: occ.bookingId } });
      if (remaining === 0) {
        await db.booking.update({ where: { id: occ.bookingId }, data: { status: "EXPIREE" } });
        await db.payment.updateMany({ where: { bookingId: occ.bookingId, status: "INITIE" }, data: { status: "EXPIRE" } });
        await audit(occ.booking.companyId, "Système", "HOLD_EXPIRED", "Booking", occ.booking.reference, "Rétention expirée — places libérées");
      }
    }
  }
  return stale.length;
}

/**
 * Pipeline de confirmation (TH-PAY-03 / TH-INV-03) :
 * paiement SUCCES → réservation CONFIRMEE → occupations CONFIRMED (définitives) → billet émis.
 * Idempotent : rejouer le pipeline ne duplique ni billet ni écriture.
 */
export async function confirmBookingPipeline(bookingId: string, opts: { actor: string; providerRef?: string; channel?: string }) {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, include: { payment: true, departure: true } });
  if (!booking) throw new Error("Réservation introuvable");
  if (booking.status === "CONFIRMEE" || booking.status === "EMBARQUEE" || booking.status === "TERMINEE") {
    return { booking, alreadyConfirmed: true };
  }

  await db.$transaction(async (tx) => {
    await tx.payment.updateMany({ where: { bookingId, status: { in: ["INITIE", "EN_ATTENTE", "INCONNU"] } }, data: { status: "SUCCES", completedAt: new Date() } });
    await tx.booking.update({ where: { id: bookingId }, data: { status: "CONFIRMEE", confirmedAt: new Date() } });
    // Les occupations passent de HOLD → CONFIRMED : la place devient définitivement vendue
    await tx.seatOccupancy.updateMany({ where: { bookingId }, data: { status: "CONFIRMED", expiresAt: null } });
  });

  // Le billet actif : le plus récent non remplacé/annulé (historique de remplacements conservé)
  const existingTicket = await db.ticket.findFirst({
    where: { bookingId, status: { in: ["VALIDE", "UTILISE", "EXAMEN_MANUEL"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!existingTicket) {
    const code = ticketCode();
    await db.ticket.create({ data: { bookingId, code, qrPayload: qrPayloadFor(code), status: "VALIDE" } });
  }

  await audit(booking.companyId, opts.actor, "BOOKING_CONFIRMED", "Booking", booking.reference,
    `${booking.seatCount} place(s) · ${booking.channel} · ${booking.paymentMethod}${booking.seatCodes ? ` · sièges ${booking.seatCodes}` : ""}`);
  await db.notificationLog.create({
    data: {
      companyId: booking.companyId, departureId: booking.departureId, bookingId,
      channel: "SMS", template: "CONFIRMATION_VENTE", recipient: booking.passengerPhone, status: "ENVOYE",
    },
  });

  return { booking: await db.booking.findUnique({ where: { id: bookingId } }), alreadyConfirmed: false };
}

export async function releaseHold(holdToken: string, actor = "Système") {
  const occs = await db.seatOccupancy.findMany({ where: { holdToken, status: "HOLD" }, include: { booking: true, departure: true } });
  if (occs.length === 0) return 0;
  for (const occ of occs) {
    await db.seatOccupancy.delete({ where: { id: occ.id } });
    if (occ.booking && occ.booking.status === "EN_ATTENTE_PAIEMENT") {
      const remaining = await db.seatOccupancy.count({ where: { bookingId: occ.booking.id } });
      if (remaining === 0) {
        await db.booking.update({ where: { id: occ.booking.id }, data: { status: "ANNULEE", canceledAt: new Date() } });
        await db.payment.updateMany({ where: { bookingId: occ.booking.id, status: { in: ["INITIE", "EN_ATTENTE"] } }, data: { status: "EXPIRE" } });
      }
    }
    await audit(occ.departure.companyId, actor, "HOLD_RELEASED", "Departure", occ.departureId, `Siège libéré (${occ.seatId ?? "capacité"})`);
  }
  return occs.length;
}

/** Création atomique d'une rétention : une seule requête concurrente obtient le siège (TH-INV-02/03). */
export async function createHold(opts: {
  departureId: string; seatIds: string[]; count?: number; channel: string; holder: string;
}): Promise<{ ok: true; token: string; expiresAt: Date; seats: { id: string; code: string; kind: string }[] } | { ok: false; code: 409 | 400; message: string; takenSeats: string[] }> {
  const departure = await db.departure.findUnique({
    where: { id: opts.departureId },
    include: { company: true, vehicle: { include: { seats: true } } },
  });
  if (!departure) return { ok: false, code: 400, message: "Départ introuvable", takenSeats: [] };
  if (!["PUBLIE", "EMBARQUEMENT", "RETARDE"].includes(departure.status)) {
    return { ok: false, code: 400, message: "Ce départ n'est plus vendable (état actuel : " + departure.status + ")", takenSeats: [] };
  }
  const cutoff = new Date(departure.departsAt.getTime() - departure.boardingCutoffMin * 60000);
  if (new Date() > cutoff) {
    return { ok: false, code: 400, message: "Heure limite de vente dépassée pour ce départ", takenSeats: [] };
  }

  await sweepExpiredHolds(departure.id);
  const token = `H-${crypto.randomUUID().slice(0, 13).replace(/-/g, "")}`;
  const expiresAt = new Date(Date.now() + departure.company.holdMinutes * 60000);
  const takenSeats: string[] = [];

  try {
    await db.$transaction(async (tx) => {
      if (opts.seatIds.length > 0) {
        if (!departure.seatSelectionEnabled || !departure.vehicle) {
          return { ok: false, code: 400, message: "Ce départ ne gère pas la sélection de sièges", takenSeats: [] };
        }
        const seats = departure.vehicle.seats.filter((s) => opts.seatIds.includes(s.id) && s.kind !== "SERVICE");
        if (seats.length !== opts.seatIds.length) {
          throw new Error("SEAT_INVALID");
        }
        for (const seat of seats) {
          try {
            await tx.seatOccupancy.create({
              data: { departureId: departure.id, seatId: seat.id, holdToken: token, status: "HOLD", expiresAt, channel: opts.channel },
            });
          } catch (e: unknown) {
            if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2002") {
              takenSeats.push(seat.code);
            } else {
              throw e;
            }
          }
        }
        if (takenSeats.length > 0) throw new Error("SEAT_TAKEN");
      } else {
        // vente par capacité
        const count = opts.count ?? 1;
        const occupied = await tx.seatOccupancy.count({ where: { departureId: departure.id } });
        if (occupied + count > departure.capacity) throw new Error("CAPACITY_FULL");
        for (let i = 0; i < count; i++) {
          await tx.seatOccupancy.create({
            data: { departureId: departure.id, seatId: null, holdToken: token, status: "HOLD", expiresAt, channel: opts.channel },
          });
        }
      }
    }, { timeout: 10000 });
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? "";
    if (msg === "SEAT_TAKEN") {
      return { ok: false, code: 409, message: "Des places viennent d'être prises par une autre vente", takenSeats };
    }
    if (msg === "CAPACITY_FULL") {
      return { ok: false, code: 409, message: "Capacité restante insuffisante", takenSeats: [] };
    }
    if (msg === "SEAT_INVALID") {
      return { ok: false, code: 400, message: "Sièges invalides pour ce départ", takenSeats: [] };
    }
    throw e;
  }

  const heldSeats = departure.vehicle?.seats.filter((s) => opts.seatIds.includes(s.id)).map((s) => ({ id: s.id, code: s.code, kind: s.kind })) ?? [];
  await audit(departure.companyId, opts.holder, "HOLD_CREATED", "Departure", departure.id,
    `Rétention ${heldSeats.map((s) => s.code).join(", ") || `${opts.count ?? 1} place(s) capacité`} · ${opts.channel} · exp. ${expiresAt.toISOString()}`);
  return { ok: true, token, expiresAt, seats: heldSeats };
}

/**
 * Annulation d'une réservation avec libération des places (back-office, TH-OPS).
 * Utilisée pour l'annulation volontaire et pour la réconciliation en échec.
 * Les places occupées (HOLD ou CONFIRMED) sont supprimées → la contrainte
 * d'unicité (departureId, seatId) redevient disponible pour une autre vente.
 */
export async function cancelBookingAndRelease(bookingId: string, opts: { actor: string; reason: string; refund: boolean }) {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, include: { payment: true, tickets: true, occupancies: true, departure: true } });
  if (!booking) throw new Error("Réservation introuvable");
  if (["ANNULEE", "EXPIREE", "REMBOURSEE"].includes(booking.status)) {
    return { booking, alreadyCanceled: true };
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.seatOccupancy.deleteMany({ where: { bookingId } });
    await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: opts.refund ? "REMBOURSEMENT_EN_COURS" : "ANNULEE",
        canceledAt: now,
        note: booking.note ? `${booking.note} · Annulation : ${opts.reason}` : `Annulation : ${opts.reason}`,
      },
    });
    if (booking.payment) {
      if (opts.refund && ["SUCCES", "INCONNU"].includes(booking.payment.status)) {
        await tx.payment.update({ where: { id: booking.payment.id }, data: { status: "REMBOURSE", refundedAt: now } });
      } else if (["INITIE", "EN_ATTENTE", "INCONNU"].includes(booking.payment.status)) {
        await tx.payment.update({ where: { id: booking.payment.id }, data: { status: "EXPIRE" } });
      }
    }
    await tx.ticket.updateMany({ where: { bookingId, status: { not: "ANNULE" } }, data: { status: "ANNULE" } });
  });

  await db.notificationLog.create({
    data: {
      companyId: booking.companyId, departureId: booking.departureId, bookingId,
      channel: "SMS", template: opts.refund ? "AVIS_REMBOURSEMENT" : "AVIS_ANNULATION",
      recipient: booking.passengerPhone, status: "ENVOYE",
    },
  });
  await audit(booking.companyId, opts.actor, opts.refund ? "BOOKING_REFUND_INITIATED" : "BOOKING_CANCELED", "Booking", booking.reference, opts.reason);
  return { booking: await db.booking.findUnique({ where: { id: bookingId } }), alreadyCanceled: false };
}

/**
 * Remboursement effectif d'une réservation confirmée (TH-FIN-02) :
 * paiement → REMBOURSE, réservation → REMBOURSEE, billet → ANNULE, places libérées.
 */
export async function refundBooking(bookingId: string, opts: { actor: string; reason: string }) {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, include: { payment: true, tickets: true, departure: true } });
  if (!booking) throw new Error("Réservation introuvable");
  if (booking.status === "REMBOURSEE") return { booking, alreadyRefunded: true };
  if (!["CONFIRMEE", "PRESENTEE", "REMBOURSEMENT_EN_COURS", "A_RECONCILIER"].includes(booking.status)) {
    throw new Error("Seule une réservation confirmée (ou en cours de remboursement) peut être remboursée");
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.seatOccupancy.deleteMany({ where: { bookingId } });
    await tx.booking.update({ where: { id: bookingId }, data: { status: "REMBOURSEE", canceledAt: booking.canceledAt ?? now } });
    if (booking.payment) {
      await tx.payment.update({ where: { id: booking.payment.id }, data: { status: "REMBOURSE", refundedAt: now } });
    }
    await tx.ticket.updateMany({ where: { bookingId, status: { not: "ANNULE" } }, data: { status: "ANNULE" } });
  });

  await db.notificationLog.create({
    data: {
      companyId: booking.companyId, departureId: booking.departureId, bookingId,
      channel: "SMS", template: "AVIS_REMBOURSEMENT", recipient: booking.passengerPhone, status: "ENVOYE",
    },
  });
  await audit(booking.companyId, opts.actor, "BOOKING_REFUNDED", "Booking", booking.reference, `Remboursement effectif · ${opts.reason}`);
  return { booking: await db.booking.findUnique({ where: { id: bookingId } }), alreadyRefunded: false };
}

export { bookingRef };
