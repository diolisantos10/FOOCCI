/**
 * A RECEPÇÃO DO EVENTO `leadgen` — o que acontece entre o aviso da Meta e o
 * nascimento do lead.
 *
 * ── AS TRÊS GARANTIAS, E O DEFEITO QUE CADA UMA EVITA ───────────────────────
 *
 * 1. **A porta única continua única.** Nada aqui escreve em `SiteLead`: o
 *    payload montado a partir da Graph é entregue a `importarMetaLead`, a mesma
 *    porta do webhook antigo, do resgate à mão e da planilha. Uma quarta escrita
 *    seria uma quarta verdade sobre a origem do lead.
 *
 * 2. **Idempotência em DOIS níveis, e os dois precisam existir.** A Meta
 *    reentrega o mesmo `leadgen_id` — por retentativa, por reinscrição, por
 *    minuto de instabilidade dela. `importarMetaLead` já recusa o segundo
 *    nascimento pelo `meta_lead_id`; o que ele NÃO evita sozinho é a segunda
 *    ida à Graph. Por isso o pendente/resolvido também é consultado antes.
 *    Duas fichas para a mesma pessoa reiniciariam o contador do portão do SDR e
 *    a pessoa levaria a mesma abordagem duas vezes.
 *
 * 3. **Lead não se perde por falha de terceiro.** Se a Graph não responde, ou
 *    se o token de Página não existe, o `leadgen_id` é GRAVADO como pendente e
 *    a rodada de reprocessamento tenta de novo. Responder 200 e esquecer seria
 *    o defeito da planilha de volta: a Meta considera entregue e nunca repete.
 */

import { prisma } from "@/lib/prisma";
import { importarMetaLead } from "./importarMetaLead";
import { buscarLeadNaGraph, type ResultadoDaBusca } from "./graphDoLead";
import type { EventoLeadgen } from "./leadgenWebhook";

export type ResultadoDoLeadgen =
  | { status: "criado" | "jaExistia" | "promovido"; leadgenId: string; leadId: string }
  /** Já tinha sido processado antes — nem a Graph foi consultada. */
  | { status: "repetido"; leadgenId: string; leadId: string | null }
  /** Nada nasceu, e o `leadgen_id` ficou gravado para nova tentativa. */
  | { status: "pendente"; leadgenId: string; motivo: string };

export interface OpcoesDaRecepcao {
  /** Injeção para teste. */
  buscar?: (leadgenId: string) => Promise<ResultadoDaBusca>;
  agora?: Date;
}

/** Grava (ou atualiza) o pendente. Nunca lança: perder o registro é pior que o erro. */
async function registrarPendente(evento: EventoLeadgen, motivo: string, agora: Date): Promise<void> {
  try {
    await prisma.metaLeadPendente.upsert({
      where: { leadgenId: evento.leadgenId },
      create: {
        leadgenId: evento.leadgenId,
        pageId: evento.pageId,
        formId: evento.formId,
        criadoNaMeta: evento.createdTime,
        tentativas: 1,
        ultimoErro: motivo,
        ultimaTentativaEm: agora,
      },
      update: {
        tentativas: { increment: 1 },
        ultimoErro: motivo,
        ultimaTentativaEm: agora,
      },
    });
  } catch (err) {
    /* Se NEM o pendente pôde ser gravado, o alarme tem de ser alto: este é o
     * único ponto em que um lead pago some sem deixar rastro no banco. */
    console.error(
      `[meta-leads/leadgen] ⛔ NÃO consegui registrar o pendente ${evento.leadgenId} — lead pago em risco de perda. Motivo original: ${motivo}`,
      err,
    );
  }
}

/**
 * Marca o `leadgen_id` como resolvido — e CRIA a linha quando ela não existia.
 *
 * Criar no caminho feliz parece desperdício e não é: é esta linha que faz a
 * reentrega da Meta parar ANTES de ir à Graph de novo. Sem ela, cada reentrega
 * gastaria uma chamada de API (e o limite da Meta é dela, não nosso) para
 * descobrir o que a casa já sabia. A trava de não duplicar o lead continua onde
 * sempre esteve, em `importarMetaLead`; esta é a economia na frente dela.
 */
async function fecharPendente(leadgenId: string, leadId: string | null, agora: Date): Promise<void> {
  try {
    await prisma.metaLeadPendente.upsert({
      where: { leadgenId },
      create: { leadgenId, resolvidoEm: agora, leadId, tentativas: 1, ultimaTentativaEm: agora },
      update: { resolvidoEm: agora, leadId, ultimoErro: null },
    });
  } catch (err) {
    console.error(`[meta-leads/leadgen] não consegui fechar o pendente ${leadgenId}`, err);
  }
}

/**
 * Processa UM evento `leadgen`: busca na Graph e entrega à porta única.
 *
 * `jaProcessado` evita a segunda ida à Graph numa reentrega; mesmo que ele
 * falhe ou passe batido, `importarMetaLead` devolve `jaExistia` e nada é
 * escrito duas vezes — a trava de verdade está lá, esta é só economia.
 */
export async function receberEventoLeadgen(
  evento: EventoLeadgen,
  opcoes: OpcoesDaRecepcao = {},
): Promise<ResultadoDoLeadgen> {
  const agora = opcoes.agora ?? new Date();

  const jaResolvido = await prisma.metaLeadPendente
    .findUnique({ where: { leadgenId: evento.leadgenId }, select: { resolvidoEm: true, leadId: true } })
    .catch(() => null);
  if (jaResolvido?.resolvidoEm) {
    return { status: "repetido", leadgenId: evento.leadgenId, leadId: jaResolvido.leadId };
  }

  const busca = await (opcoes.buscar ?? buscarLeadNaGraph)(evento.leadgenId);
  if (!busca.ok) {
    await registrarPendente(evento, busca.erro, agora);
    return { status: "pendente", leadgenId: evento.leadgenId, motivo: busca.erro };
  }

  let resultado;
  try {
    /* `exigirDataDeChegada: false`, pela MESMA razão do webhook antigo: aqui
     * quem manda é a Meta, em tempo real. Recusar por um `created_time`
     * ilegível custaria o lead inteiro para ganhar segundos de precisão. */
    resultado = await importarMetaLead(busca.lead, { exigirDataDeChegada: false, agora });
  } catch (err) {
    await registrarPendente(evento, `falha ao importar: ${String(err)}`, agora);
    return { status: "pendente", leadgenId: evento.leadgenId, motivo: String(err) };
  }

  if (resultado.status === "recusado") {
    await registrarPendente(evento, `recusado pela porta única: ${resultado.motivo}`, agora);
    return { status: "pendente", leadgenId: evento.leadgenId, motivo: resultado.motivo };
  }

  await fecharPendente(evento.leadgenId, resultado.leadId, agora);
  return { status: resultado.status, leadgenId: evento.leadgenId, leadId: resultado.leadId };
}

/**
 * A RODADA DE REPROCESSAMENTO — o que torna o pendente uma promessa cumprida.
 *
 * Gravar o `leadgen_id` e nunca mais tentar seria trocar "lead perdido" por
 * "lead perdido com registro". Esta rodada é chamada pelo cron e também a cada
 * novo evento que chega, porque webhook que chega é prova de que a Meta está
 * de pé.
 */
export async function reprocessarLeadsPendentes(
  opcoes: OpcoesDaRecepcao & { limite?: number } = {},
): Promise<{ tentados: number; resolvidos: number; aindaPendentes: number }> {
  const limite = Math.min(Math.max(opcoes.limite ?? 25, 1), 200);
  const pendentes = await prisma.metaLeadPendente.findMany({
    where: { resolvidoEm: null },
    orderBy: { createdAt: "asc" },
    take: limite,
    select: { leadgenId: true, pageId: true, formId: true, criadoNaMeta: true },
  });

  let resolvidos = 0;
  for (const p of pendentes) {
    const r = await receberEventoLeadgen(
      {
        leadgenId: p.leadgenId,
        pageId: p.pageId,
        formId: p.formId,
        createdTime: p.criadoNaMeta,
        adId: null,
        adgroupId: null,
      },
      opcoes,
    );
    if (r.status !== "pendente") resolvidos += 1;
  }

  return { tentados: pendentes.length, resolvidos, aindaPendentes: pendentes.length - resolvidos };
}
