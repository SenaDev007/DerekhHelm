// Travel Helm (API) — paramètres du tenant + console Support Travel Helm (provisioning).
// TH-ADM-01 : création de compagnies réservée au support, sur justification journalisée.
import { Hono } from "hono";
import { db } from "@travelhelm/db";
import { hashPassword, slugify } from "@travelhelm/core";
import { guard, actorLabel, audit } from "../lib/context";

export const settings = new Hono()
  // ══════════════ Paramètres du tenant (gérant) ══════════════
  .get("/company", async (c) => {
    const g = await guard(c, ["GERANT", "MANAGER"]);
    if (!g.companyId) return c.json({ error: "Compte sans compagnie." }, 403);
    const company = await db.company.findUnique({ where: { id: g.companyId } });
    if (!company) return c.json({ error: "Compagnie introuvable." }, 404);
    return c.json({ company });
  })

  .patch("/company", async (c) => {
    const g = await guard(c, ["GERANT"]);
    if (!g.companyId) return c.json({ error: "Compte sans compagnie." }, 403);
    const company = await db.company.findUnique({ where: { id: g.companyId } });
    if (!company) return c.json({ error: "Compagnie introuvable." }, 404);

    const body = await c.req.json().catch(() => ({}));
    const { name, tagline, brandColor, brandAccent, description, holdMinutes, contactPhone, contactEmail } = body as {
      name?: string; tagline?: string; brandColor?: string; brandAccent?: string; description?: string;
      holdMinutes?: number; contactPhone?: string; contactEmail?: string;
    };
    const data: Record<string, unknown> = {};
    if (name !== undefined) { if (!name.trim()) return c.json({ error: "Nom requis." }, 400); data.name = name.trim(); }
    if (tagline !== undefined) data.tagline = tagline?.trim() || null;
    if (brandColor !== undefined) { if (!/^#[0-9a-fA-F]{6}$/.test(brandColor)) return c.json({ error: "Couleur principale invalide (hex #RRGGBB)." }, 400); data.brandColor = brandColor; }
    if (brandAccent !== undefined) { if (brandAccent && !/^#[0-9a-fA-F]{6}$/.test(brandAccent)) return c.json({ error: "Couleur d'accent invalide." }, 400); data.brandAccent = brandAccent || null; }
    if (description !== undefined) data.description = description?.trim() || null;
    if (holdMinutes !== undefined) {
      if (holdMinutes < 1 || holdMinutes > 60) return c.json({ error: "Durée de rétention invalide (1 à 60 minutes) — TH-INV-02." }, 400);
      data.holdMinutes = holdMinutes;
    }
    if (contactPhone !== undefined) data.contactPhone = contactPhone?.trim() || null;
    if (contactEmail !== undefined) data.contactEmail = contactEmail?.trim() || null;
    if (Object.keys(data).length === 0) return c.json({ error: "Aucune modification." }, 400);

    await db.company.update({ where: { id: company.id }, data });
    await audit(company.id, actorLabel(g), "COMPANY_UPDATED", "Company", company.id, Object.keys(data).join(", "));
    return c.json({ ok: true });
  })

  // ══════════════ Console Support Travel Helm ══════════════
  .get("/support/companies", async (c) => {
    const g = await guard(c, ["SUPPORT"]);

    const companies = await db.company.findMany({
      include: {
        _count: { select: { routes: true, vehicles: true, staffUsers: true, bookings: true } },
        departures: { where: { departsAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }, select: { id: true, status: true } },
      },
      orderBy: { name: "asc" },
    });
    await audit(null, actorLabel(g), "SUPPORT_ACCESS", "Company", "-", `Console support · ${companies.length} compagnies listées`);

    return c.json({
      companies: companies.map((co) => ({
        id: co.id, name: co.name, slug: co.slug, tagline: co.tagline, brandColor: co.brandColor,
        holdMinutes: co.holdMinutes, contactPhone: co.contactPhone, contactEmail: co.contactEmail,
        createdAt: co.createdAt,
        counts: {
          routes: co._count.routes, vehicles: co._count.vehicles,
          staff: co._count.staffUsers, bookings: co._count.bookings,
          departuresToday: co.departures.length,
          activeDepartures: co.departures.filter((d) => ["PUBLIE", "EMBARQUEMENT", "RETARDE"].includes(d.status)).length,
        },
      })),
    });
  })

  // ——— POST /support/companies — provisioning d'un nouveau tenant ———
  .post("/support/companies", async (c) => {
    const g = await guard(c, ["SUPPORT"]);

    const body = await c.req.json().catch(() => ({}));
    const { name, slug, tagline, brandColor = "#0b6e47", holdMinutes = 7, contactPhone, contactEmail,
            gerantEmail, gerantName, gerantPassword, justification } = body as {
      name?: string; slug?: string; tagline?: string; brandColor?: string; holdMinutes?: number;
      contactPhone?: string; contactEmail?: string; gerantEmail?: string; gerantName?: string; gerantPassword?: string; justification?: string;
    };
    if (!name?.trim() || !gerantEmail?.trim() || !gerantName?.trim() || !gerantPassword || gerantPassword.length < 8) {
      return c.json({ error: "Nom de compagnie, e-mail/nom/mot de passe (≥ 8) du gérant requis." }, 400);
    }
    if (!justification?.trim()) {
      return c.json({ error: "Une justification est obligatoire pour toute action support (audit)." }, 400);
    }
    const finalSlug = (slug?.trim() ? slugify(slug) : slugify(name)) || `co-${Date.now()}`;
    if (await db.company.findUnique({ where: { slug: finalSlug } })) {
      return c.json({ error: `Le slug « ${finalSlug} » est déjà utilisé.` }, 409);
    }
    const normalizedEmail = gerantEmail.trim().toLowerCase();
    if (await db.staffUser.findUnique({ where: { email: normalizedEmail } })) {
      return c.json({ error: "Cet e-mail de gérant est déjà utilisé." }, 409);
    }

    const company = await db.company.create({
      data: {
        name: name.trim(), slug: finalSlug, tagline: tagline?.trim() || null,
        brandColor: /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : "#0b6e47",
        holdMinutes: Math.min(60, Math.max(1, holdMinutes ?? 7)),
        contactPhone: contactPhone?.trim() || null, contactEmail: contactEmail?.trim() || null,
        staffUsers: {
          create: {
            email: normalizedEmail, fullName: gerantName.trim(), role: "GERANT",
            passwordHash: hashPassword(gerantPassword),
          },
        },
      },
      include: { staffUsers: true },
    });
    await audit(null, actorLabel(g), "TENANT_PROVISIONED", "Company", company.id, `${company.name} (${company.slug}) · gérant ${normalizedEmail} · ${justification}`);
    return c.json({ company: { id: company.id, name: company.name, slug: company.slug }, gerant: { email: normalizedEmail } }, 201);
  })

  // ——— GET /support/audit — journal global (transverse) ———
  .get("/support/audit", async (c) => {
    const g = await guard(c, ["SUPPORT"]);
    const logs = await db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 120,
    });
    const companies = await db.company.findMany({ select: { id: true, name: true, slug: true, brandColor: true } });
    const byId = new Map(companies.map((co) => [co.id, co]));
    return c.json({
      logs: logs.map((l) => ({
        id: l.id, actor: l.actor, action: l.action, entity: l.entity, entityId: l.entityId, detail: l.detail, at: l.createdAt,
        company: l.companyId ? { name: byId.get(l.companyId)?.name ?? "?", slug: byId.get(l.companyId)?.slug ?? "?" } : null,
      })),
    });
  })

  // ——— PATCH /support/companies/:id — support : ajuster les paramètres d'un tenant ———
  .patch("/support/companies/:id", async (c) => {
    const g = await guard(c, ["SUPPORT"]);
    const company = await db.company.findUnique({ where: { id: c.req.param("id") } });
    if (!company) return c.json({ error: "Compagnie introuvable." }, 404);

    const body = await c.req.json().catch(() => ({}));
    const { holdMinutes, contactPhone, contactEmail, justification, tagline } = body as {
      holdMinutes?: number; contactPhone?: string; contactEmail?: string; justification?: string; tagline?: string;
    };
    if (!justification?.trim()) return c.json({ error: "Justification obligatoire (audit)." }, 400);
    const data: Record<string, unknown> = {};
    if (holdMinutes !== undefined) { if (holdMinutes < 1 || holdMinutes > 60) return c.json({ error: "Rétention invalide." }, 400); data.holdMinutes = holdMinutes; }
    if (contactPhone !== undefined) data.contactPhone = contactPhone?.trim() || null;
    if (contactEmail !== undefined) data.contactEmail = contactEmail?.trim() || null;
    if (tagline !== undefined) data.tagline = tagline?.trim() || null;
    if (Object.keys(data).length === 0) return c.json({ error: "Aucune modification." }, 400);

    await db.company.update({ where: { id: company.id }, data });
    await audit(company.id, actorLabel(g), "SUPPORT_COMPANY_UPDATED", "Company", company.id, `${Object.keys(data).join(", ")} · ${justification}`);
    return c.json({ ok: true });
  });
