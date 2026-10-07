// Travel Helm (web) — route API unique : deux modes de déploiement.
//
// 1. MODE UNIFIÉ (défaut, aucune variable à définir) : l'application Hono
//    (@travelhelm/api) est montée directement dans le route handler Next.js.
//    Un seul projet Vercel suffit (Root Directory : apps/web) — le frontend
//    et le backend tournent dans la même fonction Node. Idéal pour démarrer.
//
// 2. MODE PROXY (API_ORIGIN défini) : toutes les requêtes /api/** sont
//    transférées vers le backend séparé (apps/api déployé seul — Vercel,
//    Railway, Fly.io…). Les cookies de session passent à l'identique,
//    le frontend reste same-origin, sans CORS.
//
// Le choix est fait au démarrage : API_ORIGIN présent → proxy, sinon → unifié.
import { NextRequest } from "next/server";
import { app as helmApi } from "@travelhelm/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const API_ORIGIN = process.env.API_ORIGIN || "";
const useProxy = API_ORIGIN.length > 0;

// Mode unifié : Hono route d'après l'URL complète (basePath /api) — app.fetch()
// est l'API cœur de Hono (Request → Response), directement compatible Next.js.
const unified = (req: Request) => helmApi.fetch(req);

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

type Ctx = { params: Promise<{ path: string[] }> };

async function dispatch(req: NextRequest, ctx: Ctx) {
  if (useProxy) {
    const { path } = await ctx.params;
    return proxy(req, (path ?? []).join("/"));
  }
  // Mode unifié : Hono route d'après l'URL complète (basePath /api).
  return unified(req);
}

export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
export const PUT = dispatch;
export const DELETE = dispatch;
