import { defineConfig } from "vitest/config";

export default defineConfig({
  // a furnished building generates in a few seconds; the budget test carries its own limit
  test: { maxWorkers: 2, testTimeout: 30000, include: ["tests/**/*.test.ts"] },
});
