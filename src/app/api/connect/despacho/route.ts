/**
 * POST /api/connect/despacho — a porta corporativa do Dioli Connect no Foocci.
 *
 * É por aqui que a Control Room conversa com o agente deste produto: recebe,
 * responde e inicia conversa. Kit Dioli Connect, Frente 6b.
 *
 * ─── ⚠️ ESTA ROTA SÓ EXISTE PORQUE HÁ UMA LINHA NO `src/middleware.ts` ──────
 *
 * O middleware do Foocci derruba no NextAuth **toda** rota que não esteja em
 * `PUBLIC_PATHS`. Sem a linha `/^\/api\/connect\/despacho$/` lá, esta função
 * **nunca é executada**: o middleware responde antes, com o 401 genérico dele
 * (`{"success":false,"error":"Unauthorized"}`), e é uma resposta traiçoeira —
 * parece o 401 desta porta, mas nenhuma trava daqui rodou. Sem segredo
 * configurado ela deveria responder 503; com pedido malformado, 400; com
 * acionamento cortado, 502. Nada disso acontece: o handler está morto.
 *
 * A linha é parte da obra, não configuração de ambiente. Há teste cobrando as
 * duas metades em `src/services/connect/tests/middleware-da-porta.test.ts`.
 *
 * ─── AS TRAVAS, NA ORDEM EM QUE ELAS FECHAM ────────────────────────────────
 *
 * 1. SEGREDO PRÓPRIO E ÚNICO (`DIOLI_CONNECT_SECRET`), conferido em tempo
 *    constante. Sem ele configurado a porta responde **503 e permanece
 *    fechada**; ⛔ `ADMIN_SECRET` não abre nada aqui (ADR-003). Ver `porta.ts`.
 * 2. CONTRATO DO LABORATÓRIO. `assertSimulationSafeMode()` roda ANTES do agente
 *    e confere que as seis capacidades do laboratório continuam desligadas NO
 *    CONTRATO congelado. ⚠️ Ela **não lê o ambiente** e não pode falhar por
 *    causa dele — o comentário que dizia isso aqui era falso (achado B-1) e a
 *    promessa foi movida para a trava 9, que mede.
 * 3. MODO e 4. SINTÉTICO. `modo: "homologacao"` e `sintetico: true`, literais,
 *    sem padrão e sem normalização. Ver `contrato.ts`.
 * 5. AUTORIDADE. `de` tem que ser um papel da lista fechada; `para` tem que ser
 *    o Agente Gerente cadastrado.
 * 6. AGENTE. Lista de um: só `waiter`, o único que executa sem chave de IA.
 * 7. AÇÃO. Lista de três: `receber`, `responder`, `iniciar` — sem padrão.
 * 8. ⭐ ALLOWLIST DE CORPO. Só os dez campos que esta porta consome atravessam;
 *    qualquer outro é recusa NOMEADA — `restaurantId` e companhia com a
 *    explicação inteira, o resto com "não conheço este campo". Era uma denylist
 *    de treze nomes, e a variante vizinha (`restaurant_id`, `tenantId`,
 *    `email`) passava ignorada em silêncio (achado B-3).
 * 9. ⭐ SENTINELA DE REDE. As saídas de rede são CONTADAS enquanto o agente
 *    roda; contagem diferente de zero derruba para `nao_verificavel`. É aqui
 *    que a promessa de "acionamento sem credencial e sem rede" vira número em
 *    vez de frase. Ver `sentinela.ts`.
 * 10. ⭐ O DONO DO FIO. Conversa aberta por um papel não é continuada por
 *    outro, em nenhum dos verbos que emendam turno (achado B-4).
 *
 * ─── E A TRAVA CENTRAL, QUE É DE SAÍDA ─────────────────────────────────────
 *
 * "O despachante disse ok é proibido como prova." Esta rota nunca responde
 * sucesso por ter conseguido chamar alguém: ela devolve `executado` só quando a
 * linha da rodada volta LIDA do banco, com fim, cenários e o registro de caixa
 * deste fio. Tudo o que não é isso e não é um "não" nomeado sai como
 * `nao_verificavel` — e `nao_verificavel` JAMAIS é 2xx.
 */

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { armazemDoConnectNoBanco } from "@/services/connect/armazem-prisma";
import { caixaSemRegistro } from "@/services/connect/caixa";
import { conferirPedido, type PedidoDeDespacho } from "@/services/connect/contrato";
import { despachar } from "@/services/connect/despacho";
import { CABECALHO_DO_SEGREDO, conferirSegredo } from "@/services/connect/porta";
import { PRODUTO_ID } from "@/services/connect/cadastro";

export const dynamic = "force-dynamic";

/** Uma recusa da casca, no mesmo formato das outras — nada de envelope diferente. */
function recusa(motivo: string, status: number): NextResponse {
  return NextResponse.json(
    { estado: "recusado", produto: PRODUTO_ID, motivo, caixa: caixaSemRegistro() },
    { status },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guarda = conferirSegredo(request.headers.get(CABECALHO_DO_SEGREDO), process.env);
  if (!guarda.ok) return recusa(guarda.motivo, guarda.status);

  let corpo: PedidoDeDespacho;
  try {
    corpo = (await request.json()) as PedidoDeDespacho;
  } catch {
    return recusa("JSON inválido", 400);
  }

  const conferencia = conferirPedido(corpo ?? {});
  if (!conferencia.ok) return recusa(conferencia.motivo, 400);

  const resultado = await despachar(conferencia.pedido, {
    armazem: armazemDoConnectNoBanco(),
    agora: () => new Date(),
    novoFio: () => randomUUID(),
  });

  // O código HTTP acompanha o estado, e `nao_verificavel` JAMAIS é 2xx:
  //   executado       → 200
  //   recusado        → 422 (o pedido chegou inteiro; a regra é que disse não)
  //   nao_verificavel → 502 (o acionamento não se completou — não é sucesso)
  const status = resultado.estado === "executado" ? 200 : resultado.estado === "recusado" ? 422 : 502;
  return NextResponse.json(resultado, { status });
}
