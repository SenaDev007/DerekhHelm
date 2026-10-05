// Travel Helm (API) — endpoints publics du canal voyageur.
// Recherche multi-compagnies, plan de sièges, rétention atomique, réservation,
// callback fournisseur de paiement (idempotent), billet QR, « mes billets ».
import { Hono } from "hono";
import { db } from "@travelhelm/db";
import QRCode from "qrcode";
import { sweepExpiredHolds, createHold, releaseHold, confirmBookingPipeline, audit } from "@travelhelm/core";
import { bookingRef, providerRef, eventToken, verifyQrPayload } from "@travelhelm/core";

export const publicApi = new Hono()
  // ——— GET /api/helm/companies — annuaire public + villes desservies ———
  .get("/companies", async (c) => {
    const companies = await db.company.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, slug: true, tagline: true, brandColor: true, brandAccent: true,
        description: true, holdMinutes: true, contactPhone: true, contactEmail: true,
      },
    });
    const cities = await db.station.findMany({ where: { isPrimary: true }, select: { city: true, name: true }, distinct: ["city"] });
    return c.json({
      companies,
      cities: cities.map((s) => ({ city: s.city, station: s.name })).sort((a, b) => a.city.localeCompare(b.city)),
    });
  })

  // ——— POST /api/helm/search — recherche publique multi-compagnies ———
  .post("/search", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { origin, destination, date, passengers = 1 } = body as { origin?: string; destination?: string; date?: string; passengers?: number };

    if (!origin || !destination || origin === destination) {
      return c.json({ error: "Ville de départ et d'arrivée requises (et différentes)." }, 400);
    }
    const day = date ? new Date(date + "T00:00:00") : new Date();
    const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayStart.getDate() + 1);

    await sweepExpiredHolds();

    const routes = await db.route.findMany({ where: { originCity: origin, destCity: destination } });
    const routeIds = routes.map((r) => r.id);
    const departures = routeIds.length
      ? await db.departure.findMany({
          where: {
            routeId: { in: routeIds },
            departsAt: { gte: dayStart, lt: dayEnd },
            status: { in: ["PUBLIE", "EMBARQUEMENT", "RETARDE"] },
          },
          include: { route: true, vehicle: { include: { seats: true } }, company: true, occupancies: true },
          orderBy: { departsAt: "asc" },
        })
      : [];

    const results = departures.map((d) => {
      const occupied = d.occupancies.filter((o) => o.status === "CONFIRMED" || (o.status === "HOLD" && o.expiresAt && o.expiresAt > new Date())).length;
      const capacity = d.seatSelectionEnabled ? (d.vehicle?.seats.filter((s) => s.kind !== "SERVICE").length ?? d.capacity) : d.capacity;
      const seatsLeft = Math.max(0, capacity - occupied);
      return {
        id: d.id,
        company: { id: d.company.id, name: d.company.name, slug: d.company.slug, brandColor: d.company.brandColor, brandAccent: d.company.brandAccent, tagline: d.company.tagline },
        route: { code: d.route.code, originCity: d.route.originCity, destCity: d.route.destCity, boardingPoint: d.route.boardingPoint, dropOffPoint: d.route.dropOffPoint, distanceKm: d.route.distanceKm },
        departsAt: d.departsAt,
        durationMin: d.durationMin,
        status: d.status,
        delayMin: d.delayMin,
        reason: d.reason,
        basePrice: d.basePrice,
        vipSurcharge: d.vipSurcharge,
        seatsLeft,
        capacity,
        seatSelection: d.seatSelectionEnabled,
        vehicle: d.vehicle ? { label: d.vehicle.label, model: d.vehicle.model, amenities: (d.vehicle.amenities ?? "").split(",").filter(Boolean) } : null,
        boardingCutoffMin: d.boardingCutoffMin,
      };
    });

    return c.json({
      origin, destination, date: date ?? dayStart.toISOString().slice(0, 10), passengers,
      results,
      inventorySyncAt: new Date().toISOString(),
      disclaimer: "Places restantes calculées sur l'inventaire central Travel Helm au moment de la requête.",
    });
  })

  // ——— GET /api/helm/departures/:id?token=HOLD — détail + plan de sièges ———
  .get("/departures/:id", async (c) => {
    const id = c.req.param("id");
    const token = c.req.query("token");

    await sweepExpiredHolds(id);

    const d = await db.departure.findUnique({
      where: { id },
      include: {
        route: { include: { stops: { orderBy: { seq: "asc" } } } },
        vehicle: { include: { seats: { orderBy: [{ row: "asc" }, { col: "asc" }] } } },
        company: true,
        occupancies: { include: { seat: true, booking: { include: { tickets: { orderBy: { createdAt: "desc" }, take: 1 } } } } },
        stateLogs: { orderBy: { createdAt: "desc" }, take: 6 },
      },
    });
    if (!d) return c.json({ error: "Départ introuvable" }, 404);

    const now = new Date();
    const occBySeat = new Map(d.occupancies.filter((o) => o.seatId).map((o) => [o.seatId!, o]));
    const seats = d.vehicle
      ? d.vehicle.seats.map((s) => {
          const occ = occBySeat.get(s.id);
          const state =
            !occ || (occ.status === "HOLD" && occ.expiresAt && occ.expiresAt < now)
              ? "FREE"
              : token && occ.holdToken === token
                ? "MINE"
                : occ.status === "HOLD"
                  ? "HOLD_OTHER"
                  : "TAKEN";
          return {
            id: s.id, code: s.code, row: s.row, col: s.col, kind: s.kind, window: s.window,
            state,
            holdExpireIn: state === "HOLD_OTHER" && occ?.expiresAt ? Math.max(0, occ.expiresAt.getTime() - now.getTime()) : null,
            boardingState: occ?.booking ? occ.booking.status : null,
            ticketStatus: occ?.booking?.tickets?.[0]?.status ?? null,
          };
        })
      : [];

    const capacityMode = !d.seatSelectionEnabled;
    const capacity = capacityMode ? d.capacity : d.vehicle?.seats.filter((s) => s.kind !== "SERVICE").length ?? d.capacity;
    const activeOcc = d.occupancies.filter((o) => o.status === "CONFIRMED" || (o.status === "HOLD" && o.expiresAt && o.expiresAt > now));
    const seatsLeft = Math.max(0, capacity - activeOcc.length);
    const booked = d.occupancies.filter((o) => o.status === "CONFIRMED").length;
    const boarded = d.occupancies.filter((o) => o.booking && ["EMBARQUEE", "TERMINEE"].includes(o.booking.status)).length;

    return c.json({
      id: d.id,
      company: { name: d.company.name, slug: d.company.slug, brandColor: d.company.brandColor, brandAccent: d.company.brandAccent, contactPhone: d.company.contactPhone, holdMinutes: d.company.holdMinutes },
      route: {
        code: d.route.code, label: d.route.label, originCity: d.route.originCity, destCity: d.route.destCity,
        boardingPoint: d.route.boardingPoint, dropOffPoint: d.route.dropOffPoint, distanceKm: d.route.distanceKm,
        stops: d.route.stops.map((s) => ({ city: s.city, station: s.station, offsetMin: s.offsetMin })),
      },
      vehicle: d.vehicle ? { label: d.vehicle.label, model: d.vehicle.model, plate: d.vehicle.plate, seatLayout: d.vehicle.seatLayout, amenities: (d.vehicle.amenities ?? "").split(",").filter(Boolean) } : null,
      departsAt: d.departsAt, durationMin: d.durationMin, status: d.status, delayMin: d.delayMin, reason: d.reason,
      basePrice: d.basePrice, vipSurcharge: d.vipSurcharge, seatSelection: d.seatSelectionEnabled,
      seats, capacity, seatsLeft, booked, boarded,
      boardingCutoffMin: d.boardingCutoffMin, checkInNote: d.checkInNote,
      stateLogs: d.stateLogs.map((l) => ({ fromStatus: l.fromStatus, toStatus: l.toStatus, actor: l.actor, reason: l.reason, at: l.createdAt })),
      serverTime: now.toISOString(),
    });
  })

  // ——— POST /api/helm/holds — rétention atomique de places (TH-INV-02) ———
  .post("/holds", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { departureId, seatIds = [], count = 1, channel = "WEB", holder = "Portail web" } = body as {
      departureId?: string; seatIds?: string[]; count?: number; channel?: string; holder?: string;
    };
    if (!departureId || (seatIds.length === 0 && !count)) {
      return c.json({ error: "departureId et sièges (ou nombre de places) requis." }, 400);
    }
    const result = await createHold({ departureId, seatIds, count, channel, holder });
    if (!result.ok) {
      return c.json({ error: result.message, takenSeats: result.takenSeats }, result.code);
    }
    return c.json({ holdToken: result.token, expiresAt: result.expiresAt, seats: result.seats });
  })

  // ——— POST /api/helm/holds/release — abandon volontaire d'une rétention ———
  .post("/holds/release", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { holdToken } = body as { holdToken?: string };
    if (!holdToken) return c.json({ error: "holdToken requis" }, 400);
    const released = await releaseHold(holdToken, "Voyageur (abandon)");
    return c.json({ released });
  })

  // ——— POST /api/helm/bookings — réservation (montant calculé serveur, §3.1.7) ———
  .post("/bookings", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { departureId, holdToken, passengerName, passengerPhone, passengerEmail, paymentMethod, channel = "WEB", agentName } = body as {
      departureId?: string; holdToken?: string; passengerName?: string; passengerPhone?: string; passengerEmail?: string;
      paymentMethod?: string; channel?: string; agentName?: string;
    };

    if (!departureId || !holdToken || !passengerName?.trim() || !passengerPhone?.trim()) {
      return c.json({ error: "Champs obligatoires manquants (nom, téléphone, départ)." }, 400);
    }

    const departure = await db.departure.findUnique({
      where: { id: departureId },
      include: { company: true, vehicle: { include: { seats: true } }, route: true },
    });
    if (!departure) return c.json({ error: "Départ introuvable" }, 404);

    await sweepExpiredHolds(departureId);

    const occs = await db.seatOccupancy.findMany({
      where: { departureId, holdToken, status: "HOLD" },
      include: { seat: true },
    });
    if (occs.length === 0) {
      return c.json({ error: "Votre rétention a expiré ou les places ont été libérées. Merci de recommencer la sélection." }, 409);
    }
    const expiresSoon = occs.some((o) => o.expiresAt && o.expiresAt < new Date());
    if (expiresSoon) {
      return c.json({ error: "Rétention expirée." }, 409);
    }

    const seatCodes = occs.map((o) => o.seat?.code).filter(Boolean).join(",");
    const vipCount = occs.filter((o) => o.seat?.kind === "VIP").length;
    const seatCount = occs.length;
    // ⚠️ Montant TOUJOURS recalculé côté serveur, jamais lu depuis le client
    const amount = seatCount * departure.basePrice + vipCount * departure.vipSurcharge;
    const serviceFee = 0; // frais offerts au pilote — affichés explicitement
    const totalAmount = amount + serviceFee;
    const method = paymentMethod ?? (channel === "GUICHET" ? "CASH" : "MTN_MOMO");

    const booking = await db.booking.create({
      data: {
        reference: bookingRef(), companyId: departure.companyId, departureId, channel,
        passengerName: passengerName.trim(), passengerPhone: passengerPhone.trim(),
        passengerEmail: passengerEmail?.trim() || null,
        seatCount, seatCodes: seatCodes || null, amount, serviceFee, totalAmount,
        status: "EN_ATTENTE_PAIEMENT", paymentMethod: method, agentName: agentName ?? null, holdToken,
      },
    });

    await db.seatOccupancy.updateMany({ where: { holdToken }, data: { bookingId: booking.id } });

    const payment = await db.payment.create({
      data: {
        bookingId: booking.id, provider: method === "AU_GUICHET" ? "CASH" : method,
        providerRef: providerRef(), amount: totalAmount,
        status: "INITIE",
      },
    });

    await audit(departure.companyId, channel === "GUICHET" ? (agentName ?? "Guichet") : "Portail web",
      "BOOKING_PENDING", "Booking", booking.reference, `${seatCount} place(s) · ${seatCodes || "capacité"} · ${method}`);

    return c.json({
      booking: {
        reference: booking.reference, status: booking.status, channel, seatCount, seatCodes, amount, serviceFee, totalAmount,
        passengerName: booking.passengerName, departure: {
          id: departure.id, label: `${departure.route.originCity} → ${departure.route.destCity}`,
          departsAt: departure.departsAt, basePrice: departure.basePrice,
        },
      },
      payment: { id: payment.id, providerRef: payment.providerRef, provider: payment.provider, status: payment.status, amount: payment.amount },
      nextStep: method === "AU_GUICHET"
        ? "Réservation enregistrée. Réglez en espèces au guichet avant l'heure limite de présentation."
        : "Paiement initié. La réservation sera confirmée après notification vérifiée du fournisseur.",
    });
  })

  // ——— POST /api/helm/payments/callback — notification fournisseur (démo) ———
  // Idempotence garantie par eventToken unique (TH-PAY-03).
  .post("/payments/callback", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { providerRef: pref, outcome } = body as { providerRef?: string; outcome?: "SUCCES" | "ECHEC" | "EXPIRE" | "INCONNU" };
    if (!pref || !outcome || !["SUCCES", "ECHEC", "EXPIRE", "INCONNU"].includes(outcome)) {
      return c.json({ error: "providerRef et outcome (SUCCES|ECHEC|EXPIRE|INCONNU) requis" }, 400);
    }

    const payment = await db.payment.findUnique({ where: { providerRef: pref }, include: { booking: true } });
    if (!payment) return c.json({ error: "Référence fournisseur inconnue" }, 404);

    const token = eventToken();
    const evt = await db.paymentEvent.create({
      data: {
        paymentId: payment.id, eventToken: token, type: "CALLBACK", outcome,
        payload: JSON.stringify({ providerRef: pref, outcome, receivedAt: new Date().toISOString() }), processed: true,
      },
    }).catch(async () => {
      const dup = await db.paymentEvent.findUnique({ where: { eventToken: token } });
      if (dup) return dup;
      throw new Error("EVENT_CONFLICT");
    });

    const alreadyFinal = ["SUCCES", "ECHEC", "EXPIRE", "REMBOURSE"].includes(payment.status);
    if (alreadyFinal && payment.status !== "INCONNU") {
      return c.json({
        received: true, ignored: true, ignoredReason: `Paiement déjà en statut final ${payment.status} — événement dupliqué ignoré (idempotence)`,
        paymentStatus: payment.status, bookingStatus: payment.booking.status,
      });
    }

    if (outcome === "SUCCES") {
      const res = await confirmBookingPipeline(payment.bookingId, { actor: `Fournisseur (${payment.provider})` });
      const ticket = await db.ticket.findFirst({ where: { bookingId: payment.bookingId, status: { in: ["VALIDE", "UTILISE", "EXAMEN_MANUEL"] } }, orderBy: { createdAt: "desc" } });
      await db.paymentEvent.update({ where: { id: evt.id }, data: { processed: true } });
      return c.json({
        received: true, ignored: false, alreadyConfirmed: res.alreadyConfirmed,
        paymentStatus: "SUCCES", bookingStatus: "CONFIRMEE",
        ticketCode: ticket?.code ?? null,
        bookingReference: payment.booking.reference,
      });
    }

    if (outcome === "ECHEC") {
      await db.payment.update({ where: { id: payment.id }, data: { status: "ECHEC", failureReason: "Refusé par le fournisseur (démo)" } });
      await audit(payment.booking.companyId, `Fournisseur (${payment.provider})`, "PAYMENT_FAILED", "Payment", pref, "Callback échec — rétention maintenue jusqu'à expiration");
      return c.json({ received: true, ignored: false, paymentStatus: "ECHEC", bookingStatus: payment.booking.status, note: "Places conservées jusqu'à l'expiration de la rétention." });
    }

    if (outcome === "EXPIRE") {
      await db.payment.update({ where: { id: payment.id }, data: { status: "EXPIRE" } });
      if (payment.booking.holdToken) await releaseHold(payment.booking.holdToken, "Expiration paiement");
      const b = await db.booking.findUnique({ where: { id: payment.bookingId } });
      return c.json({ received: true, ignored: false, paymentStatus: "EXPIRE", bookingStatus: b?.status ?? "EXPIREE" });
    }

    // INCONNU — aucune décision automatique : dossier à réconcilier (§3.3)
    await db.payment.update({ where: { id: payment.id }, data: { status: "INCONNU" } });
    await db.booking.update({ where: { id: payment.bookingId }, data: { status: "A_RECONCILIER" } });
    await audit(payment.booking.companyId, "Système", "PAYMENT_UNKNOWN", "Payment", pref, "Réponse fournisseur ambigue — interrogation/rapprochement requis, aucune nouvelle charge automatique");
    return c.json({
      received: true, ignored: false, paymentStatus: "INCONNU", bookingStatus: "A_RECONCILIER",
      note: "Aucune nouvelle charge automatique : l'équipe interroge le fournisseur.",
    });
  })

  // ——— GET /api/helm/tickets/:code — billet + QR signé (TH-TKT-02) ———
  .get("/tickets/:code", async (c) => {
    const code = c.req.param("code");
    const ticket = await db.ticket.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        booking: {
          include: {
            departure: { include: { route: { include: { stops: { orderBy: { seq: "asc" } } } }, company: true, vehicle: true } },
            payment: true,
          },
        },
      },
    });
    if (!ticket) return c.json({ error: "Billet introuvable. Vérifiez le code (format THQ-XXXX-XXXX)." }, 404);

    const b = ticket.booking;
    const d = b.departure;
    const qrSvg = await QRCode.toString(ticket.qrPayload, { type: "svg", margin: 0, width: 240, color: { dark: "#1a1712", light: "#00000000" } });

    return c.json({
      code: ticket.code, status: ticket.status, scannedAt: ticket.scannedAt, scannedBy: ticket.scannedBy,
      booking: {
        reference: b.reference, passengerName: b.passengerName, passengerPhone: b.passengerPhone,
        seatCodes: b.seatCodes, seatCount: b.seatCount, channel: b.channel, totalAmount: b.totalAmount, status: b.status,
        payment: b.payment ? { provider: b.payment.provider, status: b.payment.status, providerRef: b.payment.providerRef } : null,
      },
      departure: {
        id: d.id, company: d.company.name, brandColor: d.company.brandColor, brandAccent: d.company.brandAccent,
        contactPhone: d.company.contactPhone,
        route: `${d.route.originCity} → ${d.route.destCity}`, boardingPoint: d.route.boardingPoint,
        dropOffPoint: d.route.dropOffPoint, departsAt: d.departsAt, durationMin: d.durationMin,
        status: d.status, delayMin: d.delayMin, checkInNote: d.checkInNote, boardingCutoffMin: d.boardingCutoffMin,
        vehicle: d.vehicle ? `${d.vehicle.label} · ${d.vehicle.model}` : null,
      },
      qrSvg,
    });
  })

  // ——— GET /api/helm/find?ref=TH-XXXX | ?phone= — « Mes billets » (TH-TKT-03) ———
  .get("/find", async (c) => {
    const ref = c.req.query("ref")?.trim().toUpperCase();
    const phone = c.req.query("phone")?.trim();
    if (!ref && !phone) return c.json({ error: "Référence ou téléphone requis" }, 400);

    const bookings = await db.booking.findMany({
      where: ref
        ? { reference: ref }
        : { passengerPhone: { contains: phone!.replace(/\s/g, "") } },
      include: {
        departure: { include: { route: true, company: true } },
        tickets: { orderBy: { createdAt: "desc" }, take: 1 },
        payment: true,
      },
      orderBy: { createdAt: "desc" },
      take: 12,
    });

    return c.json({
      found: bookings.length,
      bookings: bookings.map((b) => ({
        reference: b.reference, status: b.status, channel: b.channel, totalAmount: b.totalAmount,
        passengerName: b.passengerName, seats: b.seatCodes, createdAt: b.createdAt,
        payment: { status: b.payment?.status ?? null, method: b.paymentMethod },
        ticket: b.tickets?.[0] ? { code: b.tickets[0].code, status: b.tickets[0].status } : null,
        departure: {
          id: b.departure.id, route: `${b.departure.route.originCity} → ${b.departure.route.destCity}`,
          departsAt: b.departure.departsAt, status: b.departure.status, delayMin: b.departure.delayMin,
          company: b.departure.company.name, brandColor: b.departure.company.brandColor,
        },
      })),
    });
  });
