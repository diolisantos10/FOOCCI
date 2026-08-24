/**
 * A porta das fichas da empresa para a tela.
 *
 * Rota fina, como a irmã `/api/admin/sala-dos-agentes`: a inteligência mora no
 * serviço, aqui só existe o portão e a tradução para JSON.
 *
 * ── POR QUE ESTA ROTA NÃO ACEITA `ADMIN_SECRET` ──
 *
 * ADR-003, regra 1: **rota nova nasce exigindo sessão interna.** A senha
 * compartilhada continua abrindo o que já abria, com prazo e rastro, mas não
 * ganha território novo — senão o prazo nunca chega.
 *
 * Consequência prática, e ela é de propósito: enquanto ninguém tiver login
 * interno, esta rota responde 401 para todo mundo, inclusive para o
 * proprietário. Um comando resolve:
 *
 *     npx tsx scripts/criar-usuario-interno.ts --email <email> --nome "<nome>" \
 *       --papel CEO --cargo ceo
 *
 * Preferimos a porta trancada à porta que aceita a senha velha "só por enquanto".
 *
 * ── O QUE ESTA ROTA NÃO FAZ ──
 *
 * Não escreve. Não ativa ficha. Não liga runtime. É leitura — e enquanto o
 * serviço de escrita não existir, não haverá botão que finge salvar.
 */

import { NextRequest, NextResponse } from "next/server";
import { autorizarInterno } from "@/lib/internal-auth";
import { getFichasDaEmpresa } from "@/services/agents/AgentProfileService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = autorizarInterno(req);

  if (!auth.ok) {
    // Toda negativa vira linha na trilha. É esse número que sustenta qualquer
    // decisão futura sobre quem entra — e sem ele "ninguém tentrou" seria
    // suposição, não medida.
    try {
      await prisma.internalAuditEvent.create({
        data: {
          actorType: auth.sessao ? "INTERNAL_USER" : "ANONIMO",
          // Sem sessão não há nome a registrar. "anônimo" é o fato; deixar em
          // branco faria a linha parecer perda de dado.
          actorLabel: auth.sessao ? `${auth.sessao.nome} (${auth.sessao.userId})` : "anônimo",
          acao: "ler_fichas_da_empresa",
          recurso: "agent_profiles?population=EMPRESA",
          resultado: "NEGADO",
          motivo: auth.motivo,
        },
      });
    } catch {
      // Trilha indisponível não pode virar porta aberta: a negativa vale
      // mesmo que o registro dela falhe.
    }

    return NextResponse.json(
      { ok: false, error: auth.motivo, comoResolver: "scripts/criar-usuario-interno.ts" },
      { status: auth.status },
    );
  }

  const resultado = await getFichasDaEmpresa();

  if (!resultado.leituraOk) {
    // "Não consegui ler" NÃO vira lista vazia. A tela precisa distinguir
    // "nenhuma ficha" de "não deu para perguntar" — é a regra da Sala.
    return NextResponse.json(
      { ok: false, error: resultado.motivo ?? "falha ao ler as fichas" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, data: { fichas: resultado.fichas } });
}
