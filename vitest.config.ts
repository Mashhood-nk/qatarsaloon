import { defineConfig } from "vitest/config";

// Unit tests run in plain Node (no Cloudflare plugin needed for pure logic).
export default defineConfig({
  test: { include: ["shared/**/*.test.ts", "worker/**/*.test.ts"] },
});
