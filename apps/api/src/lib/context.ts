// Travel Helm (API) — session, gardes de rôle et résolution de tenant.
// TH-ADM-04 : le tenant est TOUJOURS dérivé de la session, jamais d'un paramètre client.
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { verifySessionToken, SESSION_COOKIE, type SessionPayload } from "@travelhelm/core";
import { db } from "@travelhelm/db";
import type { Role } from "@travelhelm/shared";
import { ROLE_LABEL } from "@travelhelm/shared";

/** Erreur métier transportant un code HTTP — interceptée par app.onError. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  companyId: string | null;
  mfaEnabled: boolean;
}

/** Lit la session (cookie signé) puis recharge l'utilisateur depuis la base (compte actif ?). */
export async function currentUser(c: Context): Promise<AuthUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  const payload: SessionPayload | null = verifySessionToken(token);
  if (!payload) return null;
  const user = await db.staffUser.findUnique({ where: { id: payload.uid } });
  if (!user || !user.active) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as Role,
    companyId: user.companyId,
    mfaEnabled: user.mfaEnabled,
  };
}

/**
 * Garde combinée session + rôles. Retourne l'utilisateur authentifié ou LÈVE
 * une ApiError (401/403) interceptée globalement dans app.onError.
 */
export async function guard(c: Context, roles?: Role[]): Promise<AuthUser> {
  const user = await currentUser(c);
  if (!user) {
    throw new ApiError(401, "Session requise — connectez-vous à l'espace compagnie.");
  }
  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    throw new ApiError(403, `Action réservée aux rôles : ${roles.map((r) => ROLE_LABEL[r]).join(", ")}.`);
  }
  return user;
}

/** Résout la compagnie du tenant de la session ou lève 403 (compte support transverse). */
export async function requireTenant(user: AuthUser) {
  if (!user.companyId) {
    throw new ApiError(403, "Compte sans rattachement compagnie — cette vue nécessite un tenant.");
  }
  const company = await db.company.findUnique({ where: { id: user.companyId } });
  if (!company) {
    throw new ApiError(403, "Compagnie introuvable pour ce compte.");
  }
  return company;
}

/** Libellé d'acteur pour le journal d'audit. */
export function actorLabel(user: AuthUser): string {
  return `${user.fullName} (${user.role})`;
}

/** Journal d'audit (fire-and-forget, erreurs non bloquantes). */
export async function audit(companyId: string | null, actor: string, action: string, entity: string, entityId: string, detail?: string) {
  try {
    await db.auditLog.create({ data: { companyId, actor, action, entity, entityId, detail } });
  } catch (e) {
    console.error("[audit] échec d'écriture :", e);
  }
}
