import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  // Deux modes de déploiement (voir src/app/api/[...path]/route.ts) :
  //  · UNIFIÉ (défaut, sans API_ORIGIN) : l'app Hono @travelhelm/api est montée
  //    dans le route handler Next — un seul projet Vercel suffit.
  //  · PROXY (API_ORIGIN défini) : le backend est déployé séparément et le
  //    frontend lui transfère /api/*.
  //
  // Les packages workspace sont du TypeScript source : les déclarer pour que
  // Turbopack les compile (indispensable en layout node_modules npm/bun).
  transpilePackages: ["@travelhelm/shared", "@travelhelm/core", "@travelhelm/db", "@travelhelm/api"],
  // Prisma ne doit pas être bundlé côté serveur : garder les require natifs
  // permet à Vercel de tracer le moteur de requête dans la fonction Node.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  async rewrites() {
    return [];
  },
};

export default nextConfig;
