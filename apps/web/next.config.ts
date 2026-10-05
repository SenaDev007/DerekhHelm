import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  // Le backend est une application séparée (@travelhelm/api). En développement,
  // le proxy renvoie vers http://localhost:4000 ; sur Vercel, définir API_ORIGIN
  // (URL du projet API) dans les variables d'environnement du projet web.
  async rewrites() {
    return [];
  },
  transpilePackages: ["@travelhelm/shared"],
};

export default nextConfig;
