/**
 * ⭐ POST /api/connect/retorno — por onde a resposta do gerente volta ao Foocci.
 *
 * É o passo 8 da jornada: *"o agente recebe a resposta dentro da conversa
 * original"*. Quem inicia o movimento é o NÚCLEO, e é por isso que a resposta
 * consegue chegar — o produto não fica perguntando "já decidiram?".
 *
 * ─── ⚠️ ESTA ROTA SÓ EXISTE PORQUE HÁ UMA LINHA NO `src/middleware.ts` ──────
 *
 * Mesma armadilha da porta de despacho, e ela é traiçoeira do mesmo jeito: sem
 * `/^\/api\/connect\/retorno$/` em `PUBLIC_PATHS`, o middleware responde o 401
 * genérico dele antes, o handler nunca roda, e o núcleo lê aquilo como "o
 * segredo está errado" enquanto o problema é que nenhuma linha desta rota
 * chegou a existir. Há teste cobrando as duas metades.
 *
 * ─── A CASCA É FINA DE PROPÓSITO ────────────────────────────────────────────
 *
 * Cinco linhas de decisão: confere o segredo, chama `receberRetorno`, devolve o
 * estado. Tudo o que importa — casar o protocolo com a conversa certa, a
 * barreira do que não pode chegar ao cliente, a ordem de falar antes de fechar —
 * é código puro em `services/connect/conector/retorno.ts`, provável sem levantar
 * servidor e **igual nos quatro produtos**.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CABECALHO_DO_SEGREDO, conferirSegredo } from "@/services/connect/porta";
import { receberRetorno } from "@/services/connect/conector/retorno";
import { ligacaoDoFoocci } from "@/services/connect/conector/foocci/ligacao";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guarda = conferirSegredo(request.headers.get(CABECALHO_DO_SEGREDO), process.env);
  if (!guarda.ok) {
    return NextResponse.json(
      { estado: "recusado", protocolo: null, motivo: guarda.motivo },
      { status: guarda.status },
    );
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json(
      { estado: "recusado", protocolo: null, motivo: "JSON inválido" },
      { status: 400 },
    );
  }

  const resultado = await receberRetorno(corpo, ligacaoDoFoocci(prisma));

  // `duplicado` é 200: o núcleo reentregar o que ele não teve certeza de ter
  // entregue é ele sendo cuidadoso, não um erro dele. Responder 4xx faria o
  // núcleo tentar de novo para sempre.
  const status = resultado.estado === "recusado" ? 422 : 200;
  return NextResponse.json(resultado, { status });
}
