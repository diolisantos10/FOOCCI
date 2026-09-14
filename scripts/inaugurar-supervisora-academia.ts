import { PrismaClient } from "@prisma/client";
import { semearAcademiaComercial } from "./semear-academia-comercial";
import { publicarVersaoDaAcademia } from "@/services/salaDeVendas/supervisora/academiaInterruptor";
import { alterarModo, lerConfig } from "@/services/salaDeVendas/supervisora/config";

const prisma = new PrismaClient();

async function main() {
  const seed = await semearAcademiaComercial(prisma);
  const v1 = await prisma.academiaComercialVersao.findFirst({ where: { numero: 1 } });
  if (!v1) throw new Error("Academia Comercial v1 não existe após a semeadura");

  const publicada = await publicarVersaoDaAcademia(prisma, {
    versaoId: v1.id,
    porUserId: null,
  });
  if (!publicada.ok) throw new Error(`não foi possível publicar a Academia: ${publicada.causa}`);

  const estadoAntes = await lerConfig(prisma);
  if (estadoAntes.modoEfetivo === "OFF") {
    const ativacao = await alterarModo(prisma, {
      novoModo: "SHADOW",
      novaLigada: true,
      alteradoPor: "ceo-inauguracao-2026-09-14",
      motivo: "Inauguração autorizada pelo CEO: Supervisora em SHADOW + Academia Comercial v1",
    });
    if (!ativacao.ok) throw new Error(`não foi possível ativar SHADOW: ${JSON.stringify(ativacao)}`);
  } else if (estadoAntes.modoEfetivo !== "SHADOW") {
    throw new Error(`Supervisora já está em ${estadoAntes.modoEfetivo}; inauguração automática não altera modo superior`);
  }

  const estadoDepois = await lerConfig(prisma);
  const academiaAtiva = await prisma.academiaComercialConfig.findUnique({
    where: { id: "singleton" },
    include: { versaoAtiva: { select: { numero: true, situacao: true, _count: { select: { itens: true } } } } },
  });

  console.log(JSON.stringify({
    ok: true,
    seed,
    academia: academiaAtiva?.versaoAtiva ?? null,
    supervisora: { ligada: estadoDepois.ligada, modo: estadoDepois.modo, modoEfetivo: estadoDepois.modoEfetivo },
  }));
}

main()
  .catch((e) => {
    console.error("[inauguracao] falhou", e);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
