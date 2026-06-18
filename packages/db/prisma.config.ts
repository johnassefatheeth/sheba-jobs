import "dotenv/config";
import { defineConfig } from "prisma/config";

// CLI (generate, db push): prefer DIRECT_URL; CI may only provide DATABASE_URL.
const datasourceUrl = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!datasourceUrl) {
  throw new Error("Set DIRECT_URL or DATABASE_URL in the environment.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: datasourceUrl,
  },
});
