import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Splits Prisma's `?schema=` convention out of the connection string (node-postgres
 * doesn't understand it) so the app can live in a private schema, e.g. on Supabase
 * where the `public` schema is exposed through the Data API.
 */
export function parseDatabaseUrl(raw: string): { connectionString: string; schema: string | undefined } {
  try {
    const url = new URL(raw);
    const schema = url.searchParams.get("schema") ?? undefined;
    url.searchParams.delete("schema");
    // node-postgres treats require/prefer/verify-ca as full verification today but will
    // weaken them to libpq semantics in a future major. Pin the strict behavior explicitly.
    const ssl = url.searchParams.get("sslmode");
    if (ssl && ["prefer", "require", "verify-ca"].includes(ssl)) url.searchParams.set("sslmode", "verify-full");
    return { connectionString: url.toString(), schema: schema && schema !== "public" ? schema : undefined };
  } catch {
    return { connectionString: raw, schema: undefined };
  }
}

function createClient() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL is not configured.");
  }
  const { connectionString, schema } = parseDatabaseUrl(raw);
  const adapter = new PrismaPg({ connectionString, max: 3 }, schema ? { schema } : undefined);
  return new PrismaClient({ adapter });
}

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
