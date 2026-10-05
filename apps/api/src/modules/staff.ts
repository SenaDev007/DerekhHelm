// Travel Helm (API) — personnel : CRUD des comptes staff et rôles (TH-ADM-02/03).
// Réservé au gérant. Mots de passe hachés (scrypt) — jamais retournés par l'API.
import { Hono } from "hono";
import { db } from "@travelhelm/db";
import { hashPassword } from "@travelhelm/core";
import { ROLES, ROLE_LABEL } from "@travelhelm/shared";
import { guard, requireTenant, actorLabel, audit  } from "../lib/context";

function publicUser(u: {
  id: string; email: string; fullName: string; phone: string | null; role: string;
  mfaEnabled: boolean; active: boolean; lastLoginAt: Date | null; createdAt: Date; companyId: string | null;
}) {
  return {
    id: u.id, email: u.email, fullName: u.fullName, phone: u.phone, role: u.role,
    roleLabel: ROLE_LABEL[u.role as keyof typeof ROLE_LABEL] ?? u.role,
    mfaEnabled: u.mfaEnabled, active: u.active, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
  };
}

export const staff = new Hono()
  .get("/", async (c) => {
    const g = await guard(c, ["GERANT"]);
    const company = await requireTenant(g);
    const users = await db.staffUser.findMany({
      where: { companyId: company.id },
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
    });
    return c.json({ staff: users.map(publicUser) });
  })

  .post("/", async (c) => {
    const g = await guard(c, ["GERANT"]);
    const company = await requireTenant(g);

    const body = await c.req.json().catch(() => ({}));
    const { email, fullName, phone, role, password, mfaEnabled = false } = body as {
      email?: string; fullName?: string; phone?: string; role?: string; password?: string; mfaEnabled?: boolean;
    };
    if (!email?.trim() || !fullName?.trim() || !password || !role) {
      return c.json({ error: "E-mail, nom complet, rôle et mot de passe requis." }, 400);
    }
    if (!ROLES.includes(role as never) || role === "SUPPORT") {
      return c.json({ error: `Rôle invalide pour un compte compagnie (SUPPORT est réservé à Travel Helm).` }, 400);
    }
    if (password.length < 8) {
      return c.json({ error: "Mot de passe trop court (8 caractères minimum)." }, 400);
    }
    const normalized = email.trim().toLowerCase();
    const dup = await db.staffUser.findUnique({ where: { email: normalized } });
    if (dup) return c.json({ error: "Cet e-mail est déjà utilisé." }, 409);

    const user = await db.staffUser.create({
      data: {
        companyId: company.id, email: normalized, fullName: fullName.trim(), phone: phone?.trim() || null,
        role, passwordHash: hashPassword(password), mfaEnabled,
      },
    });
    await audit(company.id, actorLabel(g), "STAFF_CREATED", "StaffUser", user.id, `${user.fullName} · ${ROLE_LABEL[role as keyof typeof ROLE_LABEL]}`);
    return c.json({ staff: publicUser(user) }, 201);
  })

  .patch("/:id", async (c) => {
    const g = await guard(c, ["GERANT"]);
    const company = await requireTenant(g);

    const user = await db.staffUser.findUnique({ where: { id: c.req.param("id") } });
    if (!user || user.companyId !== company.id) return c.json({ error: "Compte introuvable." }, 404);

    const body = await c.req.json().catch(() => ({}));
    const { fullName, phone, role, active, mfaEnabled, password } = body as {
      fullName?: string; phone?: string; role?: string; active?: boolean; mfaEnabled?: boolean; password?: string;
    };
    const data: Record<string, unknown> = {};
    if (fullName !== undefined) { if (!fullName.trim()) return c.json({ error: "Nom requis." }, 400); data.fullName = fullName.trim(); }
    if (phone !== undefined) data.phone = phone?.trim() || null;
    if (role !== undefined) {
      if (!ROLES.includes(role as never) || role === "SUPPORT") return c.json({ error: "Rôle invalide." }, 400);
      if (user.id === g.id && role !== user.role) return c.json({ error: "Vous ne pouvez pas changer votre propre rôle." }, 400);
      data.role = role;
    }
    if (active !== undefined) {
      if (user.id === g.id && active === false) return c.json({ error: "Vous ne pouvez pas désactiver votre propre compte." }, 400);
      data.active = active;
    }
    if (mfaEnabled !== undefined) data.mfaEnabled = mfaEnabled;
    if (password !== undefined) {
      if (password.length < 8) return c.json({ error: "Mot de passe trop court." }, 400);
      data.passwordHash = hashPassword(password);
    }
    if (Object.keys(data).length === 0) return c.json({ error: "Aucune modification." }, 400);

    await db.staffUser.update({ where: { id: user.id }, data });
    await audit(company.id, actorLabel(g), "STAFF_UPDATED", "StaffUser", user.id, Object.keys(data).join(", "));
    return c.json({ ok: true });
  })

  .delete("/:id", async (c) => {
    const g = await guard(c, ["GERANT"]);
    const company = await requireTenant(g);

    const user = await db.staffUser.findUnique({ where: { id: c.req.param("id") } });
    if (!user || user.companyId !== company.id) return c.json({ error: "Compte introuvable." }, 404);
    if (user.id === g.id) return c.json({ error: "Vous ne pouvez pas supprimer votre propre compte." }, 400);

    await db.staffUser.delete({ where: { id: user.id } });
    await audit(company.id, actorLabel(g), "STAFF_DELETED", "StaffUser", user.id, `${user.fullName} · ${user.email}`);
    return c.json({ ok: true });
  });
