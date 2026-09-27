import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 15_000,
    // Each test file gets its own worker → its own SQLite file (see helper).
    pool: "forks",
    poolOptions: {
      forks: { singleFork: false },
    },
    // Prevent leftover cache/timers from bleeding between files.
    isolate: true,
  },
});
