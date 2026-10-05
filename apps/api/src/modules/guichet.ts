// Travel Helm (API) — vente guichet : même inventaire central que le web (§3.2).
// La contrainte d'unicité (departureId, seatId) s'applique exactement de la même façon.
import { Hono } from "hono";
import { db } from "@travelhelm/db";
import { bookingRef, ticketCode, qrPayloadFor, providerRef } from "@travelhelm/core";
import { sweepExpiredHolds } from "@travelhelm/core";
import { guard, audit, actorLabel } from "../lib/context";

export const guichet = new Hono()
  .post("/sale", async (c) => {
    const g = await guard(c, ["GUICHETIER", "GERANT", "MANAGER"]);
    if (!g.companyId) return c.json({ error: "Compte sans compagnie." }, 403);

    const body = await c.req.json().catch(() => ({}));
    const { departureId, seatIds = [], count = 1, passengerName, passengerPhone } = body as {
      departureId?: string; seatIds?: string[]; count?: number; passengerName?: string; passengerPhone?: string;
    };
    if (!departureId || !passengerName?.trim() || !passengerPhone?.trim()) {
      return c.json({ error: "Départ, nom et téléphone du voyageur requis" }, 400);
    }

    await sweepExpiredHolds(departureId);

    const departure = await db.departure.findUnique({
      where: { id: departureId },
      include: { company: true, route: true, vehicle: { include: { seats: true } } },
    });
    if (!departure) return c.json({ error: "Départ introuvable" }, 404);
    if (departure.companyId !== g.companyId) return c.json({ error: "Départ hors périmètre de votre compagnie." }, 403);
    if (!["PUBLIE", "EMBARQUEMENT", "RETARDE"].includes(departure.status)) {
      return c.json({ error: `Départ non vendable (${departure.status})` }, 400);
    }
    const cutoff = new Date(departure.departsAt.getTime() - departure.boardingCutoffMin * 60000);
    if (new Date() > cutoff) return c.json({ error: "Heure limite de vente dépassée" }, 400);

    const agent = actorLabel(g);
    const token = `G-${crypto.randomUUID().slice(0, 13).replace(/-/g, "")}`;
    const takenSeats: string[] = [];

    try {
      await db.$transaction(async (tx) => {
        if (seatIds.length > 0) {
          const seats = (departure.vehicle?.seats ?? []).filter((s) => seatIds.includes(s.id) && s.kind !== "SERVICE");
          if (seats.length !== seatIds.length) throw new Error("SEAT_INVALID");
          for (const seat of seats) {
            try {
              await tx.seatOccupancy.create({ data: { departureId: departure.id, seatId: seat.id, holdToken: token, status: "CONFIRMED", channel: "GUICHET" } });
            } catch (e: unknown) {
              if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2002") {
                takenSeats.push(seat.code);
              } else throw e;
            }
          }
          if (takenSeats.length > 0) throw new Error("SEAT_TAKEN");
        } else {
          const occupied = await tx.seatOccupancy.count({ where: { departureId: departure.id } });
          if (occupied + count > departure.capacity) throw new Error("CAPACITY_FULL");
          for (let i = 0; i < count; i++) {
            await tx.seatOccupancy.create({ data: { departureId: departure.id, seatId: null, holdToken: token, status: "CONFIRMED", channel: "GUICHET" } });
          }
        }
      }, { timeout: 10000 });
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? "";
      if (msg === "SEAT_TAKEN") return c.json({ error: "Place(s) déjà vendue(s) ailleurs — stock central", takenSeats }, 409);
      if (msg === "CAPACITY_FULL") return c.json({ error: "Capacité insuffisante" }, 409);
      if (msg === "SEAT_INVALID") return c.json({ error: "Sièges invalides" }, 400);
      throw e;
    }

    const seatCodes = (departure.vehicle?.seats ?? []).filter((s) => seatIds.includes(s.id)).map((s) => s.code);
    const vipCount = (departure.vehicle?.seats ?? []).filter((s) => seatIds.includes(s.id) && s.kind === "VIP").length;
    const seatCount = seatIds.length > 0 ? seatIds.length : count;
    const amount = seatCount * departure.basePrice + vipCount * departure.vipSurcharge;

    const booking = await db.booking.create({
      data: {
        reference: bookingRef(), companyId: departure.companyId, departureId, channel: "GUICHET",
        passengerName: passengerName.trim(), passengerPhone: passengerPhone.trim(),
        seatCount, seatCodes: seatCodes.join(",") || null, amount, serviceFee: 0, totalAmount: amount,
        status: "CONFIRMEE", confirmedAt: new Date(), paymentMethod: "CASH", agentName: agent, holdToken: token,
      },
    });
    await db.seatOccupancy.updateMany({ where: { holdToken: token }, data: { bookingId: booking.id } });
    await db.payment.create({
      data: { bookingId: booking.id, provider: "CASH", providerRef: providerRef(), amount, status: "SUCCES", completedAt: new Date() },
    });
    const code = ticketCode();
    await db.ticket.create({ data: { bookingId: booking.id, code, qrPayload: qrPayloadFor(code), status: "VALIDE" } });
    await db.notificationLog.create({
      data: { companyId: departure.companyId, departureId, bookingId: booking.id, channel: "SMS", template: "CONFIRMATION_VENTE", recipient: booking.passengerPhone, status: "ENVOYE" },
    });
    await audit(departure.companyId, agent, "GUICHET_SALE", "Booking", booking.reference, `${seatCount} place(s) · ${seatCodes.join(",") || "capacité"} · espèces`);

    return c.json({
      booking: { reference: booking.reference, seatCount, seatCodes: seatCodes.join(","), amount },
      ticketCode: code,
    });
  });
