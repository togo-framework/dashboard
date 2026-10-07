import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": import.meta.dirname } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts", "./tests/setup-dom.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    // Nasaq is ESM that imports CSS from dependencies: let Vite process it instead of Node.
    server: { deps: { inline: [/@fadymondy\/nasaq/, /@xyflow/] } },
    css: false,
  },
});
