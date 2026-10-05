// Travel Helm (API) — entrée Vercel Serverless Function.
// vercel.json (apps/api) réécrit /api/(.*) vers cette fonction unique,
// qui dispatche toutes les routes Hono.
import { handle } from "hono/vercel";
import { app } from "../src/app";

export const config = { runtime: "nodejs" };

export default handle(app);
