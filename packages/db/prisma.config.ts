import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  // Supabase: use session/direct URL for CLI (migrate, db push). Pool URL is for the app runtime only.
  datasource: {
    url: env("DIRECT_URL"),
  },
});
