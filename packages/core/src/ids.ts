// Travel Helm — identifiants & jetons (côté serveur uniquement)
import { createHmac, randomUUID } from "node:crypto";

const QR_SECRET = process.env.HELM_QR_SECRET || "travelhelm-demo-secret";
const REF_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randChars(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += REF_CHARS[Math.floor(Math.random() * REF_CHARS.length)];
  return s;
}

export function bookingRef() { return `TH-${randChars(6)}`; }
export function ticketCode() { return `THQ-${randChars(4)}-${randChars(4)}`; }
export function providerRef() { return `PAY-${randChars(8)}`; }
export function holdToken() { return `H-${randomUUID().slice(0, 13).replace(/-/g, "")}`; }
export function eventToken() { return randomUUID(); }
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function qrPayloadFor(code: string): string {
  return `THV1|${code}|${createHmac("sha256", QR_SECRET).update(code).digest("hex").slice(0, 16)}`;
}

export function verifyQrPayload(payload: string): { code: string; valid: boolean } {
  const parts = payload.split("|");
  if (parts.length !== 3 || parts[0] !== "THV1") return { code: "", valid: false };
  const [, code, sig] = parts;
  return { code, valid: qrPayloadFor(code) === payload && sig === createHmac("sha256", QR_SECRET).update(code).digest("hex").slice(0, 16) };
}
