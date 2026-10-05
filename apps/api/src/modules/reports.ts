// Travel Helm (API) — rapports & rapprochement ventes/paiements (TH-FIN-01/02).
import { Hono } from "hono";
import { db } from "@travelhelm/db";
import { sweepExpiredHolds } from "@travelhelm/core";
import { guard, requireTenant  } from "../lib/context";

export const reports = new Hono()
  .get("/", async (c) => {
    const g = await guard(c, ["GERANT", "MANAGER", "FINANCE"]);
    const company = await requireTenant(g);

    await sweepExpiredHolds();
    const now = new Date();
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const windowStart = new Date(dayStart.getTime() - 6 * 86400000);

    const bookings = await db.booking.findMany({
      where: { companyId: company.id, createdAt: { gte: windowStart } },
      include: { payment: true, departure: { include: { route: true, vehicle: { include: { seats: true } } } } },
    });

    const CONFIRMED = ["CONFIRMEE", "PRESENTEE", "EMBARQUEE", "TERMINEE"];
    const earned = bookings.filter((b) => CONFIRMED.includes(b.status));
    const daily: { date: string; label: string; web: number; guichet: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d0 = new Date(dayStart.getTime() - i * 86400000);
      const d1 = new Date(d0.getTime() + 86400000);
      const rows = earned.filter((b) => b.createdAt >= d0 && b.createdAt < d1);
      daily.push({
        date: d0.toISOString().slice(0, 10),
        label: d0.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }),
        web: rows.filter((r) => r.channel === "WEB").reduce((s, r) => s + r.totalAmount, 0),
        guichet: rows.filter((r) => r.channel === "GUICHET").reduce((s, r) => s + r.totalAmount, 0),
        count: rows.length,
      });
    }

    const byRoute = new Map<string, { route: string; count: number; amount: number; seats: number; capacity: number }>();
    for (const b of earned) {
      const key = b.departure.route.code;
      const cur = byRoute.get(key) ?? {
        route: `${b.departure.route.originCity} → ${b.departure.route.destCity}`,
        count: 0, amount: 0, seats: 0,
        capacity: b.departure.seatSelectionEnabled
          ? b.departure.vehicle?.seats.filter((s) => s.kind !== "SERVICE").length ?? b.departure.capacity
          : b.departure.capacity,
      };
      cur.count += 1; cur.amount += b.totalAmount; cur.seats += b.seatCount;
      byRoute.set(key, cur);
    }

    const pendingList = bookings.filter((b) => b.payment && ["EN_ATTENTE", "INCONNU", "ECHEC", "INITIE"].includes(b.payment.status));
    const refundsList = bookings.filter((b) => ["REMBOURSEMENT_EN_COURS", "REMBOURSEE"].includes(b.status));

    return c.json({
      company: { name: company.name, slug: company.slug, brandColor: company.brandColor },
      kpis: {
        earnedAmount: earned.reduce((s, b) => s + b.totalAmount, 0),
        earnedCount: earned.length,
        webAmount: earned.filter((b) => b.channel === "WEB").reduce((s, b) => s + b.totalAmount, 0),
        guichetAmount: earned.filter((b) => b.channel === "GUICHET").reduce((s, b) => s + b.totalAmount, 0),
        pendingCount: pendingList.length,
        refundCount: refundsList.length,
        momoFees: Math.round(earned.filter((b) => b.payment?.provider !== "CASH").reduce((s, b) => s + b.totalAmount, 0) * 0.015), // hypothèse de pilote, à négocier
      },
      daily,
      byRoute: Array.from(byRoute.values()).sort((a, b) => b.amount - a.amount),
      pending: pendingList.map((b) => ({
        reference: b.reference, passenger: b.passengerName, amount: b.totalAmount,
        status: b.payment!.status, providerRef: b.payment!.providerRef, method: b.paymentMethod,
        route: `${b.departure.route.originCity} → ${b.departure.route.destCity}`,
      })),
      refunds: refundsList.map((b) => ({
        reference: b.reference, passenger: b.passengerName, amount: b.totalAmount, status: b.status,
        route: `${b.departure.route.originCity} → ${b.departure.route.destCity}`,
      })),
      rows: earned.map((b) => ({
        reference: b.reference, createdAt: b.createdAt, passenger: b.passengerName,
        route: `${b.departure.route.originCity} → ${b.departure.route.destCity}`,
        seats: b.seatCount, channel: b.channel, method: b.paymentMethod, amount: b.totalAmount,
        paymentStatus: b.payment?.status ?? "—",
      })),
      generatedAt: now.toISOString(),
    });
  });
