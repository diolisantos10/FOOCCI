/**
 * POST /api/admin/meta-leads/backfill
 *
 * ⛔ O COMANDO DE RESGATE — a porta por onde um lead que ficou preso fora do
 * Foocci entra à mão, agora, sem esperar integração nenhuma ficar pronta.
 *
 * ── POR QUE ELA EXISTE ──────────────────────────────────────────────────────
 * 18/09/2026: três leads pagos do Facebook Ads estavam parados numa planilha do
 * Google, um deles havia 36 horas. A sincronização automática da planilha é a
 * solução permanente e leva tempo; estes três não tinham tempo. Esta rota é o
 * caminho curto — e permanece útil depois, porque toda integração um dia falha
 * e a casa precisa de um jeito de repor o que ficou de fora.
 *
 * ── SEGREDO PRÓPRIO, E POR QUE NÃO SE REUSA NENHUM ──────────────────────────
 * `FOOCCI_META_LEADS_BACKFILL_KEY`, exclusiva. Não é `CRON_SECRET` (que é da
 * rotina de máquina e circula em agendador) nem `ADMIN_SECRET` (que abre o
 * painel inteiro). Esta rota **cria contato comercial com data de chegada
 * escolhida por quem chama** — quem pode fazer isso pode fabricar histórico, e
 * um poder desses não pode vir de carona numa chave que existe para outra
 * coisa. Mesmo princípio da ADR-003.
 *
 * **Fail-closed:** chave não configurada = 503 e nada roda. Ausência de
 * configuração nunca é permissão.
 *
 * ── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
 * Não escreve em `SiteLead` por conta própria: entrega cada linha a
 * `importarMetaLead`, a mesma porta do webhook da Meta e da sincronização da
 * planilha. Se escrevesse aqui, a casa passaria a ter duas verdades sobre a
 * origem do lead.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { importarMetaLead, metaLeadSchema } from "@/services/meta-leads/importarMetaLead";

export const dynamic = "force-dynamic";

const CABECALHO = "x-foocci-backfill-key";

const corpoSchema = z.object({
  leads: z.array(metaLeadSchema).min(1).max(200),
  /**
   * Marca as fichas como prioritárias. Padrão `true`: quem usa este comando
   * está resgatando lead atrasado, e lead atrasado vai para o topo da lista.
   * ⚠️ `prioritario` ORDENA LISTAS e nada mais — nenhuma regra de distribuição
   * o lê hoje. Está dito aqui para ninguém confundir destaque com atendimento.
   */
  prioritario: z.boolean().optional(),
});

function autorizado(req: NextRequest, esperado: string): boolean {
  const recebido = req.headers.get(CABECALHO);
  if (!recebido) return false;
  // Comparação de tamanho antes do conteúdo evita vazar o comprimento por
  // tempo; o resto é comparação simples porque a chave é longa e aleatória.
  return recebido.length === esperado.length && recebido === esperado;
}

export async function POST(req: NextRequest) {
  const esperado = process.env.FOOCCI_META_LEADS_BACKFILL_KEY;
  if (!esperado) {
    console.error("[meta-leads/backfill] FOOCCI_META_LEADS_BACKFILL_KEY não configurada");
    return NextResponse.json(
      { ok: false, error: "Comando desligado — FOOCCI_META_LEADS_BACKFILL_KEY não configurada." },
      { status: 503 },
    );
  }
  if (!autorizado(req, esperado)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  const bruto = await req.json().catch(() => null);
  const corpo = corpoSchema.safeParse(bruto);
  if (!corpo.success) {
    return NextResponse.json(
      { ok: false, error: corpo.error.issues[0]?.message ?? "Payload inválido.", caminho: corpo.error.issues[0]?.path },
      { status: 400 },
    );
  }

  const prioritario = corpo.data.prioritario ?? true;

  const criados: unknown[] = [];
  const jaExistiam: unknown[] = [];
  const promovidos: unknown[] = [];
  const recusados: unknown[] = [];

  for (const lead of corpo.data.leads) {
    try {
      /* ⚠️ `exigirDataDeChegada: true`. Aqui a data vem de quem digitou, e sem
       * ela o lead nasceria com a hora da importação — o atraso de 36 horas
       * viraria zero no mesmo instante em que o resgatamos. Fail-closed: linha
       * sem data legível é recusada e contada, nunca aproximada em silêncio. */
      const r = await importarMetaLead(lead, { prioritario, exigirDataDeChegada: true });
      if (r.status === "criado") criados.push(r);
      else if (r.status === "jaExistia") jaExistiam.push(r);
      else if (r.status === "promovido") promovidos.push(r);
      else recusados.push(r);
    } catch (erro) {
      // Uma linha ruim não pode derrubar as outras duas: o lote continua, e o
      // motivo vai no relatório em vez de num log que ninguém lê.
      console.error("[meta-leads/backfill] falha na linha", lead.metaLeadId, erro);
      recusados.push({
        status: "recusado",
        metaLeadId: lead.metaLeadId,
        motivo: erro instanceof Error ? erro.message : "Falha desconhecida ao importar.",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    recebidos: corpo.data.leads.length,
    criados,
    promovidos,
    jaExistiam,
    recusados,
    resumo: {
      criados: criados.length,
      promovidos: promovidos.length,
      jaExistiam: jaExistiam.length,
      recusados: recusados.length,
    },
  });
}
