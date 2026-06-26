import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";
import { TopBar } from "@/components/layout/TopBar";
import { AgenciaClient } from "./AgenciaClient";

export const metadata = { title: "Agência — Projetos" };
export const dynamic  = "force-dynamic";

export default async function AgenciaPage() {
  let restaurantId: string | null = null;
  let restaurantName = "Restaurante";
  try { restaurantId = getTenantId(); } catch { /* unauthenticated */ }

  type ProjectRow = {
    id: string;
    name: string;
    objective: string;
    status: string;
    services: unknown;
    createdAt: Date;
    strategySession: { id: string; generatedAt: Date } | null;
  };

  let projects: ProjectRow[] = [];

  if (restaurantId) {
    const [restaurant, rows] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
      prisma.agencyProject.findMany({
        where:   { restaurantId },
        orderBy: { createdAt: "desc" },
        select: {
          id:        true,
          name:      true,
          objective: true,
          status:    true,
          services:  true,
          createdAt: true,
          strategySession: { select: { id: true, generatedAt: true } },
        },
      }),
    ]);
    restaurantName = restaurant?.name ?? "Restaurante";
    projects = rows.map((p) => ({
      ...p,
      createdAt: p.createdAt,
      strategySession: p.strategySession
        ? { ...p.strategySession, generatedAt: p.strategySession.generatedAt }
        : null,
    }));
  }

  const serialized = projects.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    strategySession: p.strategySession
      ? { ...p.strategySession, generatedAt: p.strategySession.generatedAt.toISOString() }
      : null,
  }));

  return (
    <>
      <TopBar title="Agência — Projetos" />
      <Suspense fallback={
        <div className="flex items-center justify-center py-24 text-sm text-muted">
          Carregando projetos…
        </div>
      }>
        <AgenciaClient projects={serialized} restaurantName={restaurantName} />
      </Suspense>
    </>
  );
}
