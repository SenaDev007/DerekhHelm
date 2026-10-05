// Invariants d'inventaire (TH-INV) : unicité des sièges, rétentions, capacité,
// idempotence des paiements (TH-PAY-03), cycle billets/embarquement (TH-TKT).
import { describe, it, expect, beforeAll } from "vitest";
import { json, body, login } from "./helpers";
import { db } from "@travelhelm/db";

let corx: string;
let sika: string;
let controleur: string;
let depSeatsId: string;
let depCapacityId: string;

beforeAll(async () => {
  corx = (await login("gerant@corx.test")).cookie;
  sika = (await login("gerant@sika.test")).cookie;
  controleur = (await login("controleur@corx.test").then((x) => x.cookie));
  const deps = await db.departure.findMany({ where: { status: "PUBLIE" }, select: { id: true, seatSelectionEnabled: true, companyId: true } });
  depSeatsId = deps.find((d) => d.seatSelectionEnabled)!.id;
  depCapacityId = deps.find((d) => !d.seatSelectionEnabled)!.id;
});

async function seatId(code: string) {
  const seat = await db.seat.findFirst({
    where: { code, vehicle: { departures: { some: { id: depSeatsId } } } },
  });
  return seat!.id;
}

describe("Inventaire & rétentions (TH-INV-02/03)", () => {
  it("rétention atomique, puis conflit 409 avec la liste des sièges pris", async () => {
    const sid = await seatId("3A");
    const first = await body<{ holdToken: string }>(
      await json("/api/helm/holds", "POST", { departureId: depSeatsId, seatIds: [sid], channel: "WEB" }),
    );
    expect(first.holdToken).toMatch(/^H-/);

    const conflict = await json("/api/helm/holds", "POST", { departureId: depSeatsId, seatIds: [sid] });
    expect(conflict.status).toBe(409);
    expect((await body<{ takenSeats: string[] }>(conflict)).takenSeats).toContain("3A");
  });

  it("abandon volontaire libère la place (re-vente possible)", async () => {
    const sid = await seatId("3B");
    const { holdToken } = await body<{ holdToken: string }>(
      await json("/api/helm/holds", "POST", { departureId: depSeatsId, seatIds: [sid] }),
    );
    await json("/api/helm/holds/release", "POST", { holdToken });
    const again = await json("/api/helm/holds", "POST", { departureId: depSeatsId, seatIds: [sid] });
    expect(again.status).toBe(200);
    await json("/api/helm/holds/release", "POST", { holdToken: (await body(again)).holdToken });
  });

  it("vente par capacité : dépassement → 409 (TH-INV-05)", async () => {
    const dep = await db.departure.findUnique({ where: { id: depCapacityId }, select: { capacity: true } });
    const occupied = await db.seatOccupancy.count({ where: { departureId: depCapacityId } });
    const remaining = dep!.capacity - occupied;
    if (remaining > 0) {
      const r = await json("/api/helm/holds", "POST", { departureId: depCapacityId, count: remaining + 1 });
      expect(r.status).toBe(409);
      expect((await body(r)).error.toLowerCase()).toContain("capacité");
    }
  });

  it("départ BROUILLON invisible dans la recherche publique", async () => {
    const d = await body<{ results: { id: string }[] }>(
      await json("/api/helm/search", "POST", { origin: "Cotonou", destination: "Parakou" }),
    );
    const brouillons = await db.departure.findMany({ where: { status: "BROUILLON" }, select: { id: true } });
    for (const b of brouillons) {
      expect(d.results.some((x) => x.id === b.id)).toBe(false);
    }
  });
});

describe("Réservation & paiement (TH-PAY-03)", () => {
  it("montant calculé serveur (base + VIP), billet émis après callback SUCCÈS", async () => {
    const sid = await seatId("2A"); // VIP
    const { holdToken } = await body<{ holdToken: string }>(
      await json("/api/helm/holds", "POST", { departureId: depSeatsId, seatIds: [sid] }),
    );
    const bk = await body<{ booking: { reference: string; totalAmount: number }; payment: { providerRef: string } }>(
      await json("/api/helm/bookings", "POST", {
        departureId: depSeatsId, holdToken,
        passengerName: "Test Passager", passengerPhone: "+229 01 99 00 00 00",
      }),
    );
    // 10 000 base + 2 000 VIP — jamais lu depuis le client
    expect(bk.booking.totalAmount).toBe(12000);

    const cb = await body<{ ticketCode: string | null; bookingStatus: string }>(
      await json("/api/helm/payments/callback", "POST", { providerRef: bk.payment.providerRef, outcome: "SUCCES" }),
    );
    expect(cb.bookingStatus).toBe("CONFIRMEE");
    expect(cb.ticketCode).toMatch(/^THQ-/);

    // idempotence : rejeu du même événement → ignoré, pas de second billet
    const replay = await body<{ ignored: boolean }>(
      await json("/api/helm/payments/callback", "POST", { providerRef: bk.payment.providerRef, outcome: "SUCCES" }),
    );
    expect(replay.ignored).toBe(true);
    const tickets = await db.ticket.findMany({ where: { booking: { reference: bk.booking.reference } } });
    expect(tickets.length).toBe(1);
  });

  it("INCONNU → A_RECONCILIER, décision humaine SUCCÈS confirme", async () => {
    const sid = await seatId("2B");
    const { holdToken } = await body<{ holdToken: string }>(
      await json("/api/helm/holds", "POST", { departureId: depSeatsId, seatIds: [sid] }),
    );
    const bk = await body<{ booking: { reference: string }; payment: { providerRef: string } }>(
      await json("/api/helm/bookings", "POST", {
        departureId: depSeatsId, holdToken,
        passengerName: "Test Inconnu", passengerPhone: "+229 01 99 11 11 11",
      }),
    );
    await json("/api/helm/payments/callback", "POST", { providerRef: bk.payment.providerRef, outcome: "INCONNU" });
    expect((await db.booking.findUnique({ where: { reference: bk.booking.reference } }))?.status).toBe("A_RECONCILIER");

    // guichetier ne peut pas réconcilier → 403
    const guichet = await login("guichet@corx.test");
    expect(
      (await json(`/api/helm/backoffice/payments/${bk.payment.providerRef}/reconcile`, "POST", { decision: "SUCCES", reason: "x" }, guichet.cookie)).status,
    ).toBe(403);

    const finance = await login("finance@corx.test");
    const rec = await body<{ bookingStatus: string }>(
      await json(`/api/helm/backoffice/payments/${bk.payment.providerRef}/reconcile`, "POST", { decision: "SUCCES", reason: "Capture fournisseur vérifiée" }, finance.cookie),
    );
    expect(rec.bookingStatus).toBe("CONFIRMEE");
  });

  it("annulation back-office libère les places pour une autre vente", async () => {
    const sid = await seatId("3C");
    const { holdToken } = await body<{ holdToken: string }>(
      await json("/api/helm/holds", "POST", { departureId: depSeatsId, seatIds: [sid] }),
    );
    const bk = await body<{ booking: { reference: string }; payment: { providerRef: string } }>(
      await json("/api/helm/bookings", "POST", {
        departureId: depSeatsId, holdToken,
        passengerName: "Test Annul", passengerPhone: "+229 01 99 22 22 22",
      }),
    );
    await json("/api/helm/payments/callback", "POST", { providerRef: bk.payment.providerRef, outcome: "SUCCES" });
    const before = await db.seatOccupancy.count({ where: { departureId: depSeatsId } });

    const r = await json(`/api/helm/backoffice/bookings/${bk.booking.reference}`, "PATCH", { action: "cancel", reason: "Demande client" }, corx);
    expect(r.status).toBe(200);

    const after = await db.seatOccupancy.count({ where: { departureId: depSeatsId } });
    expect(before - after).toBe(1);
    // place re-vendable
    const rehold = await json("/api/helm/holds", "POST", { departureId: depSeatsId, seatIds: [sid] });
    expect(rehold.status).toBe(200);
  });
});

describe("Billets & embarquement (TH-TKT-04/06)", () => {
  it("scan hors tenant refusé (403), scan valide embarque, double scan bloqué", async () => {
    // vente web sur Corridor
    const sid = await seatId("4A");
    const { holdToken } = await body<{ holdToken: string }>(
      await json("/api/helm/holds", "POST", { departureId: depSeatsId, seatIds: [sid] }),
    );
    const bk = await body<{ booking: { reference: string }; payment: { providerRef: string } }>(
      await json("/api/helm/bookings", "POST", {
        departureId: depSeatsId, holdToken,
        passengerName: "Test Scan", passengerPhone: "+229 01 99 33 33 33",
      }),
    );
    const cb = await body<{ ticketCode: string }>(
      await json("/api/helm/payments/callback", "POST", { providerRef: bk.payment.providerRef, outcome: "SUCCES" }),
    );

    // contrôleur d'une AUTRE compagnie → 403
    const sikaControleur = await login("controleur@sika.test");
    const cross = await json("/api/helm/boarding/scan", "POST", { scan: cb.ticketCode }, sikaControleur.cookie);
    expect(cross.status).toBe(403);

    // contrôleur du tenant → EMBARQUE
    const ok = await body<{ result: string }>(await json("/api/helm/boarding/scan", "POST", { scan: cb.ticketCode }, controleur));
    expect(ok.result).toBe("EMBARQUE");

    // double scan → DEJA_EMBARQUE
    const twice = await body<{ result: string }>(await json("/api/helm/boarding/scan", "POST", { scan: cb.ticketCode }, controleur));
    expect(twice.result).toBe("DEJA_EMBARQUE");
  });

  it("remplacement de billet : ancien REMPLACÉ, nouveau valide, QR signé", async () => {
    const sid = await seatId("4B");
    const { holdToken } = await body<{ holdToken: string }>(
      await json("/api/helm/holds", "POST", { departureId: depSeatsId, seatIds: [sid] }),
    );
    const bk = await body<{ booking: { reference: string }; payment: { providerRef: string } }>(
      await json("/api/helm/bookings", "POST", {
        departureId: depSeatsId, holdToken,
        passengerName: "Test Remplace", passengerPhone: "+229 01 99 44 44 44",
      }),
    );
    const cb = await body<{ ticketCode: string }>(
      await json("/api/helm/payments/callback", "POST", { providerRef: bk.payment.providerRef, outcome: "SUCCES" }),
    );

    const rep = await body<{ newCode: string }>(
      await json(`/api/helm/backoffice/payments/tickets/${cb.ticketCode}/replace`, "POST", { reason: "Billet perdu" }, corx),
    );
    expect(rep.newCode).toMatch(/^THQ-/);
    expect(rep.newCode).not.toBe(cb.ticketCode);

    const old = await db.ticket.findUnique({ where: { code: cb.ticketCode } });
    expect(old?.status).toBe("REMPLACE");

    const scanOld = await body<{ result: string }>(await json("/api/helm/boarding/scan", "POST", { scan: cb.ticketCode }, controleur));
    expect(scanOld.result).toBe("REFUSE");

    const scanNew = await body<{ result: string }>(await json("/api/helm/boarding/scan", "POST", { scan: rep.newCode }, controleur));
    expect(scanNew.result).toBe("EMBARQUE");
  });

  it("billets non confirmés refusés à l'embarquement", async () => {
    const fake = await db.ticket.findFirst({ where: { status: "VALIDE" }, include: { booking: true } });
    if (fake && fake.booking.status !== "CONFIRMEE") {
      const r = await body<{ result: string }>(await json("/api/helm/boarding/scan", "POST", { scan: fake.code }, controleur));
      expect(["REFUSE", "EXAMEN_MANUEL"]).toContain(r.result);
    }
  });
});

describe("Guichet : même stock central (§3.2)", () => {
  it("vente espèces crée réservation + billet + paiement SUCCÈS, journalisée", async () => {
    const guichet = await login("guichet@corx.test");
    const sid = await seatId("4C");
    const r = await body<{ booking: { reference: string }; ticketCode: string }>(
      await json("/api/helm/backoffice/guichet/sale", "POST", {
        departureId: depSeatsId, seatIds: [sid],
        passengerName: "Client Guichet", passengerPhone: "+229 01 99 55 55 55",
      }, guichet.cookie),
    );
    expect(r.ticketCode).toMatch(/^THQ-/);
    const booking = await db.booking.findUnique({ where: { reference: r.booking.reference }, include: { payment: true, tickets: { orderBy: { createdAt: "desc" }, take: 1 } } });
    expect(booking?.status).toBe("CONFIRMEE");
    expect(booking?.payment?.status).toBe("SUCCES");
    expect(booking?.agentName).toContain("Guichet Corx");
  });

  it("un siège déjà vendu au web ne peut pas être revendu au guichet", async () => {
    const sid = await seatId("4D");
    const hold = await body<{ holdToken: string }>(
      await json("/api/helm/holds", "POST", { departureId: depSeatsId, seatIds: [sid] }),
    );
    const bk = await body<{ payment: { providerRef: string } }>(
      await json("/api/helm/bookings", "POST", {
        departureId: depSeatsId, holdToken: hold.holdToken,
        passengerName: "Double Vente", passengerPhone: "+229 01 99 66 66 66",
      }),
    );
    await json("/api/helm/payments/callback", "POST", { providerRef: bk.payment.providerRef, outcome: "SUCCES" });

    const guichet = await login("guichet@corx.test");
    const conflict = await json("/api/helm/backoffice/guichet/sale", "POST", {
      departureId: depSeatsId, seatIds: [sid],
      passengerName: "Trop Tard", passengerPhone: "+229 01 99 77 77 77",
    }, guichet.cookie);
    expect(conflict.status).toBe(409);
    expect((await body<{ takenSeats: string[] }>(conflict)).takenSeats).toContain("4D");
  });
});
