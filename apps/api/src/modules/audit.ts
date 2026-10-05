// Travel Helm (API) — journal d'audit (non modifiable) + notifications (TH-COM, TH-ADM-05).
import { Hono } from "hono";
import { db } from "@travelhelm/db";
import { guard, requireTenant, actorLabel, audit  } from "../lib/context";

export const auditLog = new Hono()
  // ——— GET /api/helm/backoffice/audit — journal du tenant ———
  .get("/", async (c) => {
    const g = await guard(c);
    const company = await requireTenant(g);

    const logs = await db.auditLog.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 60,
    });
    const notifs = await db.notificationLog.findMany({
      where: { companyId: company.id },
      orderBy: { sentAt: "desc" },
      take: 30,
    });
    return c.json({
      logs: logs.map((l) => ({ id: l.id, actor: l.actor, action: l.action, entity: l.entity, entityId: l.entityId, detail: l.detail, at: l.createdAt })),
      notifications: notifs.map((n) => ({
        id: n.id, channel: n.channel, template: n.template,
        recipient: n.recipient.replace(/\d(?=\d{2})/g, "•"), status: n.status, at: n.sentAt,
      })),
    });
  })

  // ——— POST /api/helm/backoffice/notifications/:id/resend — renvoi d'un SMS ———
  .post("/notifications/:id/resend", async (c) => {
    const g = await guard(c, ["GERANT", "MANAGER"]);
    const company = await requireTenant(g);

    const notif = await db.notificationLog.findUnique({ where: { id: c.req.param("id") } });
    if (!notif || notif.companyId !== company.id) return c.json({ error: "Notification introuvable." }, 404);

    const resent = await db.notificationLog.create({
      data: {
        companyId: company.id, departureId: notif.departureId, bookingId: notif.bookingId,
        channel: notif.channel, template: notif.template, recipient: notif.recipient, status: "ENVOYE",
      },
    });
    await audit(company.id, actorLabel(g), "NOTIFICATION_RESENT", "NotificationLog", resent.id, `${notif.template} → ${notif.recipient.replace(/\d(?=\d{2})/g, "•")}`);
    return c.json({ ok: true, id: resent.id });
  });
