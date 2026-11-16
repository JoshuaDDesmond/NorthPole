import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations need a direct/session connection; the app itself can use a pooled one.
    // A placeholder keeps `prisma generate` working in CI where no database exists.
    // DATABASE_URL_UNPOOLED / POSTGRES_URL_NON_POOLING are set by the Vercel × Neon integration.
    url:
      process.env.DIRECT_URL ??
      process.env.DATABASE_URL_UNPOOLED ??
      process.env.POSTGRES_URL_NON_POOLING ??
      process.env.DATABASE_URL ??
      "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
