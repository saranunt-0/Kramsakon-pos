import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 20000,
    // Integration tests share one database, so run files one at a time.
    fileParallelism: false,
  },
});
