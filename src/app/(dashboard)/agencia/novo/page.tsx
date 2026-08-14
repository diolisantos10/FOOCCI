import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";
import { TopBar } from "@/components/layout/TopBar";
import { AgenciaClient } from "../AgenciaClient";

// A criação de projeto continua sendo a tela que já existia e já funcionava
// (formulário → POST /api/agency/projects). Ela saiu de `/agencia`, que agora é
// o Client Command Center, e ganhou rota própria. Nada aqui foi redesenhado.

export const metadata = { title: "Agência — Novo projeto" };
export const dynamic = "force-dynamic";

export default async function NovoProjetoPage() {
  let restaurantId: string | null = null;
  let restaurantName = "Restaurante";
  try {
    restaurantId = getTenantId();
  } catch {
    /* sem sessão */
  }

  let serialized: {
    id: string; name: string; objective: string; status: string; services: unknown;
    createdAt: string; strategySession: { id: string; generatedAt: string } | null;
  }[] = [];

  if (restaurantId) {
    const [restaurant, rows] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
      prisma.agencyProject.findMany({
        where:   { restaurantId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, name: true, objective: true, status: true, services: true, createdAt: true,
          strategySession: { select: { id: true, generatedAt: true } },
        },
      }),
    ]);
    restaurantName = restaurant?.name ?? "Restaurante";
    serialized = rows.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      strategySession: p.strategySession
        ? { ...p.strategySession, generatedAt: p.strategySession.generatedAt.toISOString() }
        : null,
    }));
  }

  return (
    <>
      <TopBar title="Agência — Novo projeto" />
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-24 text-sm text-muted">
            Carregando projetos…
          </div>
        }
      >
        <AgenciaClient projects={serialized} restaurantName={restaurantName} />
      </Suspense>
    </>
  );
}
