import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src-tauri/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "./dev.db",
  },
});
