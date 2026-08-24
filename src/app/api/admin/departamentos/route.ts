/**
 * A porta da área de Departamentos e Agentes.
 *
 * Rota fina: a inteligência mora em `@/services/organizacao/painelDeDepartamentos`.
 *
 * ── POR QUE NÃO ACEITA `ADMIN_SECRET` ──
 *
 * ADR-003, regra 1: rota nova nasce exigindo sessão interna. A senha
 * compartilhada continua abrindo o que já abria, com prazo e rastro, mas não
 * ganha território novo — senão o prazo nunca chega.
 *
 * Enquanto ninguém tiver login interno, esta rota responde 401 para todo mundo,
 * inclusive para o proprietário. Um comando resolve:
 *
 *     npx tsx scripts/criar-usuario-interno.ts --email <email> --nome "<nome>" \
 *       --papel MASTER_CEO --cargo ceo
 *
 * Preferimos a porta trancada à porta que aceita a senha velha "só por enquanto".
 */

import { NextRequest, NextResponse } from "next/server";
import { autorizarInterno } from "@/lib/internal-auth";
import { montarPainel } from "@/services/organizacao/painelDeDepartamentos";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ── POR QUE ESTA ROTA EXIGE PAPEL, E NÃO SÓ SESSÃO ──
  //
  // A primeira versão aceitava qualquer sessão interna válida. Isso deixava o
  // SDR humano ler o organograma inteiro da empresa — quem trabalha em cada
  // área, quem responde por quê — e contraria o critério 6 do CEO: ele vê a
  // Sala de Vendas e nada mais do Admin.
  //
  // `AUDITOR_QA` entra porque auditar sem enxergar a estrutura é auditar no
  // escuro. `AGENTE_IA` fica de fora: ator técnico não abre tela.
  const auth = autorizarInterno(req, {
    papeis: ["MASTER_CEO", "DIRETOR_FOOCCI", "GERENTE_DEPARTAMENTO", "AUDITOR_QA"],
  });

  if (!auth.ok) {
    // Toda negativa vira linha na trilha. Sem ela, "ninguém tentou entrar" seria
    // suposição, não medida — e é essa medida que sustenta qualquer decisão
    // futura sobre quem entra.
    try {
      await prisma.internalAuditEvent.create({
        data: {
          actorType: auth.sessao ? "INTERNAL_USER" : "ANONIMO",
          actorLabel: auth.sessao ? `${auth.sessao.nome} (${auth.sessao.userId})` : "anônimo",
          acao: "ler_painel_de_departamentos",
          recurso: "departments",
          resultado: "NEGADO",
          motivo: auth.motivo,
        },
      });
    } catch {
      // Trilha indisponível não pode virar porta aberta: a negativa vale mesmo
      // que o registro dela falhe.
    }

    return NextResponse.json(
      { ok: false, error: auth.motivo, comoResolver: "scripts/criar-usuario-interno.ts" },
      { status: auth.status },
    );
  }

  const resultado = await montarPainel();

  if (!resultado.leituraOk) {
    // "Não consegui ler" NÃO vira lista vazia. A tela precisa distinguir
    // "nenhum departamento" de "não deu para perguntar".
    return NextResponse.json({ ok: false, error: resultado.motivo }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: resultado.painel });
}
