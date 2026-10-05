// Helpers de test : requêtes JSON sur l'app Hono + gestion des cookies de session.
import { app } from "../apps/api/src/app";

const BASE = "http://test.local";

export function json(path: string, method: string, body?: unknown, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return app.request(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function login(email: string, password = "test1234") {
  const r = await json("/api/helm/auth/login", "POST", { email, password });
  if (r.status !== 200) throw new Error(`login ${email} → ${r.status} : ${await r.text()}`);
  const setCookie = r.headers.get("set-cookie");
  const token = (setCookie?.split(";")[0] ?? "");
  return { cookie: token, user: (await r.json()).user };
}

export async function body<T = Record<string, unknown>>(r: Response): Promise<T> {
  return (await r.json()) as T;
}

export async function createStation(cookie: string, city: string, name: string) {
  const r = await json("/api/helm/backoffice/catalogue/stations", "POST", { city, name }, cookie);
  return { r, station: r.status === 201 ? (await body<{ station: { id: string; city: string; name: string } }>(r)).station : null };
}
