/**
 * CANCELAR A PRÓPRIA ASSINATURA — o botão que a frase publicada já prometia.
 *
 * ── Por que este arquivo existe ─────────────────────────────────────────────
 *
 * "Cancele quando quiser" está publicado em quatro lugares nossos: no checkout
 * (`/contratar/novo`), na tabela de preços (`Sem fidelidade`), nos Termos de Uso
 * ("pode encerrar o uso a qualquer momento") e na cláusula 5.2 do próprio Termo
 * de Contratação, que o cliente ASSINA. Até 29/08/2026 o único jeito de cancelar
 * era alguém da Foocci abrir o admin e clicar por ele.
 *
 * Isso é descumprir cláusula que nós mesmos escrevemos — e não depende de a
 * relação ser de consumo para ser um problema: está no contrato assinado.
 *
 * ── As quatro regras, e por que cada uma é código e não recomendação ────────
 *
 *  1. **A AUTORIZAÇÃO É DO SERVIDOR, E O DONO É QUEM CANCELA.** A assinatura é
 *     encontrada PELO `restaurantId` que o middleware injeta na requisição —
 *     nunca por um id que veio no corpo do pedido. É a diferença entre "cancele
 *     a minha" e "cancele a de qualquer um": um `subscriptionId` no corpo, ainda
 *     que conferido depois, é uma chave que o cliente escolhe. Aqui ele não tem
 *     onde digitar a chave.
 *
 *  2. **IDEMPOTENTE.** Cancelar duas vezes não quebra e não duplica. A troca de
 *     estado é um `updateMany` condicionado a NÃO estar cancelada — atômico, só
 *     um vence. Quem vence grava a trilha; quem perde recebe "já estava
 *     cancelada" e vai embora. Sem isso, um duplo clique (ou a pessoa nervosa
 *     apertando três vezes) escreveria três eventos de cancelamento e moveria o
 *     `canceledAt` para a última tentativa, apagando a hora real do ato.
 *
 *  3. **TRILHA, SEM APAGAR NADA.** O cancelamento vira um evento em
 *     `DomainEvent` — quem, quando, de qual plano, de qual ciclo, por quanto e
 *     saindo de qual estado. A tabela é append-only por gatilho no banco: uma
 *     tentativa de `update` é recusada pelo Postgres, não engolida. Nenhuma
 *     coluna da assinatura é limpa: `activatedAt`, `termsAcceptedAt`, as
 *     cobranças e as notas continuam onde estavam.
 *
 *  4. **CANCELAR DE VERDADE É DUAS COISAS.** Marcar CANCELADA aqui arma a trava
 *     anti-reativação (código puro, independe de token); cancelar o preapproval
 *     no Mercado Pago é o que estanca o dinheiro no cartão. A trava local é
 *     armada AINDA QUE o gateway falhe — e a falha do gateway NUNCA vira sucesso
 *     silencioso: volta nomeada, para a tela avisar e o operador agir no painel
 *     do MP. É o mesmo desenho da alavanca do admin, de propósito: dois caminhos
 *     para o mesmo ato não podem ter garantias diferentes.
 *
 * ⛔ O QUE ESTE ARQUIVO NÃO FAZ: não decide política de reembolso. O que a tela
 * diz sobre dinheiro é a leitura do Termo assinado — ver `CONSEQUENCIAS_DO_CANCELAMENTO`,
 * onde cada frase carrega a cláusula de onde saiu.
 *
 * ⛔ E NÃO MOVE DINHEIRO — 29/08/2026. O Termo agora PROMETE devolução do período
 * não entregue (cláusula 5.5) e devolução integral no arrependimento de 7 dias
 * (5.6). A conta dessa devolução, em centavos inteiros, está pronta em
 * `@/lib/billing/saidaDoPlano` (`devolucaoNaSaida`): pura, testada, sem banco e
 * sem gateway. **Ela não é chamada aqui, de propósito.** Executar estorno é ato
 * de dinheiro, e ato de dinheiro nesta casa é decisão do CEO — falta ele definir
 * quem aperta o botão (operador no painel do Mercado Pago ou rotina automática),
 * em que prazo, e o que fica registrado. Até lá, cancelar interrompe a cobrança
 * futura e a devolução é feita fora deste código. Pendência declarada, não
 * esquecimento: ligar `devolucaoNaSaida` a um estorno sem essa decisão é
 * exatamente o que o guardrail proíbe.
 */

import type { Prisma, PrismaClient, PlanSubscription } from "@prisma/client";
import { registrarEvento } from "@/services/trabalho/handoff";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** Tipo do evento na linha do tempo. Texto estável — é por ele que se procura. */
export const EVENTO_CANCELAMENTO = "assinatura.cancelada.pelo.cliente";

/**
 * O que a pessoa precisa ler ANTES de confirmar, sem jargão.
 *
 * ⚠️ CADA FRASE CARREGA A CLÁUSULA DE ONDE SAIU, e isso não é enfeite: é o que
 * impede que a tela vire um lugar onde alguém "melhora o texto" e, sem querer,
 * promete devolução de dinheiro que o contrato não promete. Mudou a cláusula?
 * A frase muda junto, e o teste que compara as duas reprova até isso acontecer.
 *
 * A fonte é o Termo de Contratação v2, aprovado pelo CEO em 29/08/2026
 * (`docs/juridico/termo-de-contratacao-foocci.md`).
 *
 * ⚠️ MUDOU EM 29/08/2026, e o que saiu importa: a frase *"O valor do ciclo que
 * já foi pago não é devolvido"* foi **removida**. Ela repetia fielmente a v1 do
 * contrato — e a v1 estava errada. Reter o mês em curso é legítimo; reter meses
 * pré-pagos e não prestados é vantagem excessiva, e era o risco real. O que a
 * tela diz hoje é a v2: o mês em curso não volta, o resto volta.
 */
export const CONSEQUENCIAS_DO_CANCELAMENTO: readonly { texto: string; clausula: string }[] = [
  {
    clausula: "5.2",
    texto:
      "Seu acesso continua até o fim do mês em curso, que você já pagou. Depois " +
      "disso a assinatura simplesmente não renova.",
  },
  {
    clausula: "5.2",
    texto:
      "Não há multa e não há fidelidade. O mês em curso não é devolvido — ele " +
      "segue sendo prestado até o fim.",
  },
  {
    clausula: "5.5",
    texto:
      "O que você pagou adiantado e ainda não usamos volta para você: no " +
      "trimestral, proporcional aos meses que faltam; no anual, refazendo a conta " +
      "dos meses usados pelo preço do plano mensal. A conta nunca fica negativa — " +
      "você não paga nada a mais por cancelar.",
  },
  {
    clausula: "5.6",
    texto:
      "Se você contratou pelo site e está dentro dos primeiros 7 dias, é " +
      "arrependimento: volta tudo, integralmente, sem essa conta toda.",
  },
  {
    clausula: "5.4",
    texto:
      "Por 30 dias depois do fim, você pode exportar seus dados: cardápio, " +
      "clientes e histórico de pedidos. Passados 60 dias, eles são apagados, " +
      "salvo o que a lei obrigue a guardar.",
  },
];

/**
 * Pode a própria loja cancelar esta assinatura?
 *
 * Função pura, separada do banco de propósito: é a regra, e regra se exercita
 * nos sete estados sem subir nada.
 *
 *  · `naoExiste` — a loja não tem assinatura ligada a ela. Acontece com conta
 *    criada à mão pelo admin, ou com a vitrine. Não é erro: é "não há o que
 *    cancelar", e a tela diz isso em vez de mostrar um botão que estoura.
 *  · `jaCancelada` — o caminho idempotente. Não é recusa.
 *  · `podeCancelar` — o resto. Inclui DRAFT, AGUARDANDO_ACEITE e INADIMPLENTE
 *    DE PROPÓSITO: quem está com pagamento atrasado é justamente quem mais
 *    precisa conseguir sair, e travar a saída de quem deve é a armadilha que a
 *    cláusula "sem fidelidade" existe para não ter.
 */
export type Veredito = "podeCancelar" | "jaCancelada" | "naoExiste";

export function vereditoDoCancelamento(
  sub: Pick<PlanSubscription, "status"> | null | undefined,
): Veredito {
  if (!sub) return "naoExiste";
  if (sub.status === "CANCELADA") return "jaCancelada";
  return "podeCancelar";
}

/** O que a tela precisa saber sobre a assinatura da própria loja. */
export interface AssinaturaNaTela {
  id: string;
  plan: PlanSubscription["plan"];
  cycle: PlanSubscription["cycle"];
  priceCents: number;
  status: PlanSubscription["status"];
  activatedAt: Date | null;
  canceledAt: Date | null;
  veredito: Veredito;
}

/**
 * A assinatura DA LOJA que está pedindo — e só ela.
 *
 * O `where` é o `restaurantId`, não um id recebido de fora. É aqui que a regra 1
 * mora: quem chama não tem como pedir a assinatura de outro restaurante, porque
 * não existe parâmetro onde escrever isso.
 *
 * `orderBy` decrescente porque uma loja pode ter histórico: a reassinatura desta
 * casa é um registro NOVO (nunca a ressurreição da cancelada), então a assinatura
 * que vale é a mais recente.
 */
export async function assinaturaDaLoja(
  db: Cliente,
  restaurantId: string,
): Promise<AssinaturaNaTela | null> {
  if (!restaurantId) return null;

  const sub = await db.planSubscription.findFirst({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, plan: true, cycle: true, priceCents: true,
      status: true, activatedAt: true, canceledAt: true,
    },
  });
  if (!sub) return null;

  return { ...sub, veredito: vereditoDoCancelamento(sub) };
}

export interface PedidoDeCancelamento {
  /** Injetado pelo middleware. NUNCA vem do corpo do pedido. */
  restaurantId: string;
  /** Quem apertou o botão — injetado pelo middleware, do mesmo jeito. */
  autorUserId: string;
  /** Nome legível, guardado no evento: se a pessoa sair depois, a trilha continua dizendo quem foi. */
  autorNome: string;
  /** Quem cancela no gateway. Injetado para o teste poder observar a chamada. */
  cancelarNoGateway: (preapprovalId: string) => Promise<{ ok: boolean; detalhe: string | null }>;
  agora?: Date;
}

export type ResultadoDoCancelamento =
  | { resultado: "naoExiste" }
  | { resultado: "jaEstavaCancelada"; canceladaEm: Date | null }
  | { resultado: "cancelada"; canceladaEm: Date; gateway: { ok: true } | { ok: false; detalhe: string } };

/**
 * Cancela a assinatura da própria loja.
 *
 * A ORDEM É DELIBERADA: primeiro a trava local (atômica), depois o gateway.
 * Se fosse ao contrário, uma queda entre as duas deixaria o preapproval
 * cancelado no MP e a assinatura ATIVA do nosso lado — o cliente sem cobrança e
 * com acesso, e nada no sistema dizendo por quê. Com esta ordem, a pior falha
 * possível é a inversa: cancelada aqui e ainda cobrando lá, que é visível,
 * nomeada, e o operador consegue consertar num painel.
 */
export async function cancelarPelaPropriaLoja(
  db: Cliente,
  pedido: PedidoDeCancelamento,
): Promise<ResultadoDoCancelamento> {
  const agora = pedido.agora ?? new Date();

  const sub = await db.planSubscription.findFirst({
    where: { restaurantId: pedido.restaurantId },
    orderBy: { createdAt: "desc" },
  });

  const veredito = vereditoDoCancelamento(sub);
  if (veredito === "naoExiste") return { resultado: "naoExiste" };
  if (veredito === "jaCancelada") {
    // Idempotência: NÃO reescreve `canceledAt` e NÃO grava outro evento. A hora
    // do cancelamento é a do ato, não a do último clique de quem recarregou.
    return { resultado: "jaEstavaCancelada", canceladaEm: sub!.canceledAt };
  }

  /* O ESTADO DE ANTES É COPIADO ANTES DE MUDAR. Parece redundante — `sub` já foi
   * lido — mas ler `sub.status` depois do `updateMany` é confiar em que a linha
   * que temos em mãos não seja a mesma que o banco acabou de alterar. Onde essa
   * suposição não vale, a trilha grava "saiu de CANCELADA para CANCELADA", que é
   * a única informação que este evento existe para carregar. Uma cópia. */
  const estadoAnterior = sub!.status;

  // A corrida, resolvida pelo banco: dois pedidos simultâneos entram aqui, e o
  // `where` com `status: { not: CANCELADA }` deixa exatamente um passar.
  const { count } = await db.planSubscription.updateMany({
    where: { id: sub!.id, status: { not: "CANCELADA" } },
    data: { status: "CANCELADA", canceledAt: agora },
  });

  if (count === 0) {
    // Perdemos a corrida. O outro pedido cancelou e gravou a trilha — este não
    // grava nada. Reler é o que permite devolver a hora REAL, e não a nossa.
    const fresco = await db.planSubscription.findUnique({
      where: { id: sub!.id },
      select: { canceledAt: true },
    });
    return { resultado: "jaEstavaCancelada", canceladaEm: fresco?.canceledAt ?? null };
  }

  // Só quem venceu escreve a trilha — por isso ela fica DEPOIS do `updateMany`.
  await registrarEvento(db, {
    tipo: EVENTO_CANCELAMENTO,
    entidade: "PlanSubscription",
    entidadeId: sub!.id,
    atorTipo: "lojista",
    atorRotulo: pedido.autorNome,
    dados: {
      restaurantId: pedido.restaurantId,
      autorUserId: pedido.autorUserId,
      plano: sub!.plan,
      ciclo: sub!.cycle,
      precoCents: sub!.priceCents,
      statusAnterior: estadoAnterior,
      canceladaEm: agora.toISOString(),
    },
  });

  // O dinheiro. A trava local já está armada; falha aqui é avisada, nunca engolida.
  if (!sub!.mpPreapprovalId) {
    return { resultado: "cancelada", canceladaEm: agora, gateway: { ok: true } };
  }

  const r = await pedido
    .cancelarNoGateway(sub!.mpPreapprovalId)
    .catch((e) => ({ ok: false as const, detalhe: e instanceof Error ? e.message : String(e) }));

  if (r.ok) return { resultado: "cancelada", canceladaEm: agora, gateway: { ok: true } };

  const detalhe =
    `A assinatura ${sub!.id} (restaurante ${pedido.restaurantId}) foi cancelada aqui, mas o ` +
    `preapproval ${sub!.mpPreapprovalId} NÃO foi cancelado no Mercado Pago ` +
    `(${r.detalhe ?? "sem detalhe"}). A cobrança pode continuar no cartão — cancele ` +
    `manualmente no painel do MP.`;
  console.error(`[billing] ${detalhe}`);

  return { resultado: "cancelada", canceladaEm: agora, gateway: { ok: false, detalhe } };
}
