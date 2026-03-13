/**
 * Prisma Client singleton.
 *
 * Next.js Hot Module Replacement creates new module instances in development,
 * which would exhaust the database connection pool. We store the client on
 * `globalThis` so a single instance is reused across HMR cycles.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
