/**
 * GET /api/connect/cadastro — quem o Foocci é dentro do Dioli Connect.
 *
 * O cadastro do produto tem que ser LEGÍVEL de fora, senão "cadastrado" é só uma
 * palavra num relatório. Esta rota devolve, com o mesmo segredo da porta de
 * despacho: qual produto é, quem é o Diretor conectado, quem é o Agente Gerente
 * que recebe, quais agentes esta porta aciona e quem pode despachar.
 *
 * ⚠️ **E devolve a divergência, em vez de escondê-la.** A ordem pedia conectar
 * "Diretor e Gerente Geral"; o Foocci **não tem cargo de Gerente Geral**, por
 * decisão registrada do CEO. O campo `gerente_geral` vem `null` com o motivo
 * colado — porque uma ausência decidida é informação, e inventar o cargo para
 * cumprir a ordem ao pé da letra criaria a segunda taxonomia do mesmo
 * organograma. Ver `services/connect/cadastro.ts`.
 *
 * ── SOMENTE LEITURA ─────────────────────────────────────────────────────────
 * Só existe GET. O cadastro é derivado do organograma canônico em tempo de
 * leitura; não há verbo para alterá-lo por aqui, e é de propósito: cadastro que
 * pode ser reescrito pela mesma porta por onde é lido não serve de referência.
 *
 * ⚠️ Como a de despacho, esta rota depende de uma linha exata em
 * `src/middleware.ts` para existir. Sem ela, o NextAuth responde antes.
 */

import { NextRequest, NextResponse } from "next/server";
import { cadastroDoProduto } from "@/services/connect/cadastro";
import { ESTADOS_DA_CAIXA, caixaSemRegistro } from "@/services/connect/caixa";
import { ACOES, MODO_EXIGIDO } from "@/services/connect/contrato";
import { CABECALHO_DO_SEGREDO, conferirSegredo } from "@/services/connect/porta";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guarda = conferirSegredo(request.headers.get(CABECALHO_DO_SEGREDO), process.env);
  if (!guarda.ok) {
    return NextResponse.json(
      { estado: "recusado", motivo: guarda.motivo, caixa: caixaSemRegistro() },
      { status: guarda.status },
    );
  }

  return NextResponse.json({
    estado: "cadastrado",
    ...cadastroDoProduto(),
    porta: {
      despacho: "POST /api/connect/despacho",
      modo_exigido: MODO_EXIGIDO,
      sintetico_exigido: true,
      acoes: ACOES,
      estados_da_caixa: ESTADOS_DA_CAIXA,
      caixa: caixaSemRegistro(),
    },
  });
}
