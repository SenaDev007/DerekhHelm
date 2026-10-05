// Travel Helm — identité : hachage de mots de passe (scrypt) + sessions signées (HMAC).
// Aucune dépendance externe : node:crypto uniquement. Fonctionne en runtime Node
// (local, Vercel functions).
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_SECRET = process.env.HELM_SESSION_SECRET || "travelhelm-demo-session-secret";
export const SESSION_COOKIE = "helm_session";
const SESSION_TTL_HOURS = 12;

// ——— mots de passe ———

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// ——— sessions (cookie signé, sans état serveur) ———

export interface SessionPayload {
  uid: string;
  email: string;
  role: string;
  companyId: string | null;
  exp: number; // epoch ms
}

function sign(data: string): string {
  return createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
}

export function createSessionToken(payload: Omit<SessionPayload, "exp">): string {
  const full: SessionPayload = { ...payload, exp: Date.now() + SESSION_TTL_HOURS * 3600_000 };
  const body = Buffer.from(JSON.stringify({ uid: full.uid, email: full.email, role: full.role, companyId: full.companyId, exp: full.exp })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
