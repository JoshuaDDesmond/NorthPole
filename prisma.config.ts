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
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
