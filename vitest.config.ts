import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    globalSetup: ["tests/global-setup.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    alias: {
      "@travelhelm/db": resolve(__dirname, "packages/db/src/client.ts"),
      "@travelhelm/core": resolve(__dirname, "packages/core/src/index.ts"),
      "@travelhelm/shared": resolve(__dirname, "packages/shared/src/index.ts"),
    },
  },
});
