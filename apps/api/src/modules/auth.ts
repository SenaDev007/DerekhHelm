// Travel Helm (API) — identité : connexion, session, comptes de démonstration (TH-ADM-02/03).
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { db } from "@travelhelm/db";
import { verifyPassword, createSessionToken, SESSION_COOKIE } from "@travelhelm/core";
import { guard, actorLabel, audit, type AuthUser } from "../lib/context";
import { ROLE_DESCRIPTION } from "@travelhelm/shared";

export const auth = new Hono()
  // ——— POST /api/helm/auth/login ———
  .post("/login", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { email, password } = body as { email?: string; password?: string };
    if (!email?.trim() || !password) {
      return c.json({ error: "E-mail et mot de passe requis." }, 400);
    }
    const user = await db.staffUser.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { company: true },
    });
    // Message volontairement générique : pas de divulgation de l'existence du compte.
    if (!user || !verifyPassword(password, user.passwordHash)) {
      await audit(user?.companyId ?? null, "Inconnu", "LOGIN_FAILED", "StaffUser", email, "Tentative de connexion refusée");
      return c.json({ error: "Identifiants invalides." }, 401);
    }
    if (!user.active) {
      return c.json({ error: "Compte désactivé — contactez le gérant de votre compagnie." }, 403);
    }

    const token = createSessionToken({
      uid: user.id, email: user.email, role: user.role, companyId: user.companyId,
    });
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 12 * 3600,
      secure: process.env.NODE_ENV === "production",
    });
    await db.staffUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(user.companyId ?? null, actorLabel({ id: user.id, email: user.email, fullName: user.fullName, role: user.role as AuthUser["role"], companyId: user.companyId, mfaEnabled: user.mfaEnabled }), "LOGIN", "StaffUser", user.id);

    return c.json({
      user: {
        id: user.id, email: user.email, fullName: user.fullName, role: user.role,
        phone: user.phone, mfaEnabled: user.mfaEnabled, lastLoginAt: new Date(),
        company: user.company
          ? {
              slug: user.company.slug, name: user.company.name, tagline: user.company.tagline,
              brandColor: user.company.brandColor, brandAccent: user.company.brandAccent,
              contactPhone: user.company.contactPhone, contactEmail: user.company.contactEmail,
              holdMinutes: user.company.holdMinutes,
            }
          : null,
      },
    });
  })

  // ——— POST /api/helm/auth/logout ———
  .post("/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  })

  // ——— GET /api/helm/auth/me ———
  .get("/me", async (c) => {
    const g = await guard(c);
    const user = await db.staffUser.findUnique({ where: { id: g.id }, include: { company: true } });
    if (!user) return c.json({ error: "Session invalide." }, 401);
    return c.json({
      user: {
        id: user.id, email: user.email, fullName: user.fullName, role: user.role,
        phone: user.phone, mfaEnabled: user.mfaEnabled, lastLoginAt: user.lastLoginAt,
        company: user.company
          ? {
              slug: user.company.slug, name: user.company.name, tagline: user.company.tagline,
              brandColor: user.company.brandColor, brandAccent: user.company.brandAccent,
              contactPhone: user.company.contactPhone, contactEmail: user.company.contactEmail,
              holdMinutes: user.company.holdMinutes,
            }
          : null,
      },
    });
  })

  // ——— GET /api/helm/auth/demo-accounts — exposé uniquement si HELM_DEMO=1 ———
  .get("/demo-accounts", async (c) => {
    if (process.env.HELM_DEMO !== "1") {
      return c.json({ error: "Non disponible." }, 404);
    }
    const users = await db.staffUser.findMany({
      where: { active: true },
      include: { company: { select: { name: true, brandColor: true } } },
      orderBy: [{ companyId: "asc" }, { role: "asc" }],
    });
    return c.json({
      hint: "Environnement de démonstration — mot de passe commun : demo1234",
      accounts: users.map((u) => ({
        email: u.email, fullName: u.fullName, role: u.role,
        roleDescription: ROLE_DESCRIPTION[u.role as keyof typeof ROLE_DESCRIPTION] ?? "",
        company: u.company ? { name: u.company.name, brandColor: u.company.brandColor } : null,
      })),
    });
  });
