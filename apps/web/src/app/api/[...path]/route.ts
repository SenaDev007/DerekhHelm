// Travel Helm (web) — proxy runtime vers le backend séparé (@travelhelm/api).
// Toutes les requêtes /api/** du frontend sont transférées vers API_ORIGIN
// (défaut : http://localhost:4000 en développement). Sur Vercel, définir
// API_ORIGIN=https://<projet-api>.vercel.app. Les cookies de session back-office
// transitent à l'identique : le frontend reste same-origin, sans CORS.
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const API_ORIGIN = process.env.API_ORIGIN || "http://localhost:4000";

async function proxy(req: NextRequest, path: string) {
  const url = new URL(req.url);
  const target = `${API_ORIGIN}/api/${path}${url.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!["host", "connection", "content-length", "accept-encoding"].includes(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
    cache: "no-store",
  };
  if (!["GET", "HEAD"].includes(req.method)) {
    init.body = await req.arrayBuffer();
  }

  try {
    const upstream = await fetch(target, init);
    const resHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(key.toLowerCase())) {
        resHeaders.set(key, value);
      }
    });
    // Préserver les Set-Cookie multiples (session login/logout)
    const setCookies = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const sc of setCookies) resHeaders.append("set-cookie", sc);

    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: resHeaders });
  } catch {
    return Response.json(
      {
        error:
          "Backend Travel Helm injoignable (" + API_ORIGIN + "). " +
          (API_ORIGIN.includes("localhost")
            ? "Démarrez-le avec : bun run dev (à la racine du monorepo)."
            : "Vérifiez la variable API_ORIGIN et le déploiement du projet API."),
      },
      { status: 502 },
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, (path ?? []).join("/"));
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, (path ?? []).join("/"));
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, (path ?? []).join("/"));
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, (path ?? []).join("/"));
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, (path ?? []).join("/"));
}
