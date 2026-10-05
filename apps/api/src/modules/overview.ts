// Travel Helm (API) — tableau de bord back-office : KPI, séries 14 j, départs du jour.
import { Hono } from "hono";
import { db } from "@travelhelm/db";
import { sweepExpiredHolds } from "@travelhelm/core";
import { guard, requireTenant  } from "../lib/context";

export const overview = new Hono()
  .get("/", async (c) => {
    const g = await guard(c);
    const company = await requireTenant(g);

    await sweepExpiredHolds();

    const now = new Date();
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayStart.getDate() + 1);

    const [todayBookings, todayDepartures, pendingPayments, recentAudit, weekBookings] = await Promise.all([
      db.booking.findMany({
        where: { companyId: company.id, createdAt: { gte: dayStart, lt: dayEnd } },
        include: { payment: true, departure: { include: { route: true } } },
      }),
      db.departure.findMany({
        where: { companyId: company.id, departsAt: { gte: dayStart, lt: dayEnd } },
        include: { route: true, vehicle: { include: { seats: true } }, occupancies: { include: { booking: true } } },
        orderBy: { departsAt: "asc" },
      }),
      db.payment.findMany({
        where: { status: { in: ["EN_ATTENTE", "INCONNU", "ECHEC"] }, booking: { companyId: company.id } },
        include: { booking: { include: { departure: { include: { route: true } } } } },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      db.auditLog.findMany({ where: { companyId: company.id }, orderBy: { createdAt: "desc" }, take: 14 }),
      db.booking.findMany({
        where: { companyId: company.id, createdAt: { gte: new Date(dayStart.getTime() - 13 * 86400000) } },
        select: { createdAt: true, totalAmount: true, channel: true, status: true },
      }),
    ]);

    const confirmedToday = todayBookings.filter((b) => ["CONFIRMEE", "EMBARQUEE", "TERMINEE", "PRESENTEE"].includes(b.status));
    const revenueToday = confirmedToday.reduce((s, b) => s + b.totalAmount, 0);
    const webToday = confirmedToday.filter((b) => b.channel === "WEB");
    const guichetToday = confirmedToday.filter((b) => b.channel === "GUICHET");

    const series: { date: string; label: string; web: number; guichet: number; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d0 = new Date(dayStart.getTime() - i * 86400000);
      const d1 = new Date(d0.getTime() + 86400000);
      const rows = weekBookings.filter((b) => b.createdAt >= d0 && b.createdAt < d1 && ["CONFIRMEE", "EMBARQUEE", "TERMINEE", "PRESENTEE"].includes(b.status));
      series.push({
        date: d0.toISOString().slice(0, 10),
        label: d0.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
        web: rows.filter((r) => r.channel === "WEB").reduce((s, r) => s + r.totalAmount, 0),
        guichet: rows.filter((r) => r.channel === "GUICHET").reduce((s, r) => s + r.totalAmount, 0),
        count: rows.length,
      });
    }

    const boards = todayDepartures.map((d) => {
      const capacity = d.seatSelectionEnabled
        ? (d.vehicle?.seats.filter((s) => s.kind !== "SERVICE").length ?? d.capacity)
        : d.capacity;
      const confirmed = d.occupancies.filter((o) => o.status === "CONFIRMED").length;
      const boarded = d.occupancies.filter((o) => o.booking && ["EMBARQUEE", "TERMINEE"].includes(o.booking.status)).length;
      return {
        id: d.id, time: d.departsAt, route: `${d.route.originCity} → ${d.route.destCity}`, code: d.route.code,
        status: d.status, delayMin: d.delayMin, vehicle: d.vehicle?.label ?? "—",
        capacity, confirmed, boarded, occupancy: capacity ? Math.round((confirmed / capacity) * 100) : 0,
        revenue: d.occupancies.filter((o) => o.status === "CONFIRMED" && o.booking).reduce((s, o) => s + (o.booking?.totalAmount ?? 0), 0),
      };
    });

    return c.json({
      company: { name: company.name, slug: company.slug, brandColor: company.brandColor, brandAccent: company.brandAccent, tagline: company.tagline, contactPhone: company.contactPhone },
      kpis: {
        salesToday: { count: confirmedToday.length, amount: revenueToday },
        web: { count: webToday.length, amount: webToday.reduce((s, b) => s + b.totalAmount, 0) },
        guichet: { count: guichetToday.length, amount: guichetToday.reduce((s, b) => s + b.totalAmount, 0) },
        pending: { count: pendingPayments.length },
        departuresToday: todayDepartures.length,
        activeDepartures: todayDepartures.filter((d) => ["PUBLIE", "EMBARQUEMENT", "RETARDE"].includes(d.status)).length,
        boardingLoad: (() => {
          const live = todayDepartures.filter((d) => d.status === "EMBARQUEMENT");
          if (live.length === 0) return null;
          const d = live[0]!;
          const capacity = d.seatSelectionEnabled ? d.vehicle?.seats.filter((s) => s.kind !== "SERVICE").length ?? d.capacity : d.capacity;
          const boarded = d.occupancies.filter((o) => o.booking?.status === "EMBARQUEE").length;
          return { departureId: d.id, boarded, capacity, route: `${d.route.originCity} → ${d.route.destCity}` };
        })(),
      },
      series, boards,
      pendingPayments: pendingPayments.map((p) => ({
        providerRef: p.providerRef, status: p.status, amount: p.amount,
        booking: p.booking.reference, passenger: p.booking.passengerName,
        route: `${p.booking.departure.route.originCity} → ${p.booking.departure.route.destCity}`,
        departsAt: p.booking.departure.departsAt,
      })),
      audit: recentAudit.map((a) => ({ id: a.id, actor: a.actor, action: a.action, entity: a.entity, entityId: a.entityId, detail: a.detail, at: a.createdAt })),
      serverTime: now.toISOString(),
    });
  });
