import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/schema/*.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Generation is offline. Push/introspection still requires a real URL.
    url: process.env.DATABASE_URL ?? "postgresql://invalid:invalid@127.0.0.1:1/invalid",
  },
});
