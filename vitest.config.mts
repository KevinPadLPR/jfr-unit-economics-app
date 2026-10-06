import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Node environment only -- Phase 1's Vitest suite covers Server Action / data-layer logic
// (resolve.ts, post.ts, actions.ts), none of which touches the DOM. Add a jsdom project
// here if/when a future phase needs component rendering tests.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
});
