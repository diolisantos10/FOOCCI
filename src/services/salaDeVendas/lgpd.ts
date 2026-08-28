/**
 * O DIREITO DE ELIMINAÇÃO — apagar os dados de um contato, de verdade.
 *
 * ⚠️ **ESTE ARQUIVO APAGA DADO E NÃO TEM VOLTA.** A exclusão do `SiteLead`
 * cascateia por dez tabelas: interações, mensagens, tarefas, compromissos,
 * propostas, handoffs, fatores de score, avaliações, cadências e qualificação.
 * Não existe lixeira, não existe desfazer, e o backup não é ferramenta de
 * operação — é ferramenta de desastre.
 *
 * ── AS QUATRO TRAVAS, E O DEFEITO QUE CADA UMA EVITA ────────────────────────
 *
 * 1. **Papel estreito.** Só o CEO e o Diretor apagam. O SDR que atende o lead
 *    NÃO apaga: quem passa o dia com o dedo na tela do lead é justamente quem
 *    mais erra o clique, e o erro aqui não se conserta. Escondido na tela não
 *    conta — a recusa é da rota, no servidor.
 *
 * 2. **Confirmação pelo NOME, não por um "sim".** Um booleano `confirmo: true`
 *    é digitado por qualquer laço de script e por qualquer clique apressado. O
 *    defeito concreto que isto evita tem nome: **apagar o lead errado**. O id
 *    vem da URL; se a tela estiver mostrando outro contato, ou se a lista tiver
 *    recarregado embaixo do dedo, o "sim" apaga quem estiver do outro lado. O
 *    nome digitado só confere com UM contato.
 *
 * 3. **Origem do pedido declarada.** Apagar por pedido do titular e apagar um
 *    contato de teste são atos diferentes com a mesma consequência, e a trilha
 *    precisa saber qual foi — é a diferença entre cumprir a LGPD e limpar a
 *    base. A tela velha do CRM fazia os dois pelo mesmo botão, sem distinguir.
 *
 * 4. **Trilha na MESMA transação que o apagamento.** Se o registro fosse
 *    escrito antes, uma falha no delete deixaria a trilha afirmando uma exclusão
 *    que não aconteceu. Se fosse escrito depois, uma queda no meio apagaria o
 *    dado sem deixar registro — e um apagamento irreversível sem registro é
 *    indistinguível de um vazamento. Juntos, ou nenhum dos dois.
 *
 * ── O QUE A TRILHA NÃO GUARDA ───────────────────────────────────────────────
 *
 * Nome, WhatsApp, e-mail, cidade, restaurante: **nada disso entra no registro**.
 * Guardar o nome de quem pediu para ser esquecido, na linha que prova que ele
 * foi esquecido, é manter o dado pessoal com outro nome — e numa tabela que
 * ninguém pensa em limpar. O que fica é o id (que depois não aponta para nada),
 * quem executou, quando, por qual pedido e o tamanho do que foi destruído.
 */

import type { PrismaClient } from "@prisma/client";
import type { InternalRole } from "@prisma/client";
import type { SessaoInterna } from "@/lib/internal-auth";

/**
 * Quem pode apagar.
 *
 * Lista fechada, num lugar só, pelo mesmo motivo de `PAPEIS_GLOBAIS` em
 * `internal-auth`: crescer o alcance vira uma linha de código revisável, e não
 * efeito colateral de alguém ganhar um papel novo.
 *
 * `GERENTE_DEPARTAMENTO` fica de fora de propósito. Ele distribui a fila e
 * responde pelo SLA — administrar o trabalho do departamento não é o mesmo que
 * poder destruir a base dele. `AUDITOR_QA` também: quem audita não mexe no que
 * auditou, e apagar é a mexida mais definitiva que existe.
 */
const PAPEIS_QUE_APAGAM: ReadonlySet<InternalRole> = new Set<InternalRole>([
  "MASTER_CEO",
  "DIRETOR_FOOCCI",
]);

export function podeApagarDadosDoLead(sessao: SessaoInterna): boolean {
  return PAPEIS_QUE_APAGAM.has(sessao.role);
}

/**
 * Por que este contato está sendo apagado.
 *
 * Duas, e não um campo de texto livre: motivo escrito à mão não vira relatório,
 * e "quantos pedidos de eliminação a Foocci recebeu este ano" é uma pergunta que
 * a lei pode fazer.
 */
export const ORIGENS_DO_PEDIDO = ["TITULAR", "CONTATO_DE_TESTE"] as const;
export type OrigemDoPedido = (typeof ORIGENS_DO_PEDIDO)[number];

export function ehOrigemDoPedido(v: unknown): v is OrigemDoPedido {
  return typeof v === "string" && (ORIGENS_DO_PEDIDO as readonly string[]).includes(v);
}

export const ROTULO_ORIGEM_DO_PEDIDO: Record<OrigemDoPedido, string> = {
  TITULAR: "A própria pessoa pediu (LGPD)",
  CONTATO_DE_TESTE: "Contato de teste — limpeza da base",
};

/**
 * Compara o nome digitado com o nome gravado.
 *
 * Ignora caixa, acento e espaço sobrando porque o teclado do celular capitaliza
 * sozinho e ninguém acerta "José" com o acento na pressa. O que NÃO se ignora é
 * o nome em si: exigir o nome certo é a trava, e afrouxá-la até virar "qualquer
 * texto serve" transformaria a confirmação em enfeite.
 */
export function nomesConferem(digitado: string, gravado: string): boolean {
  return normaliza(digitado) === normaliza(gravado) && normaliza(gravado) !== "";
}

function normaliza(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export interface PedidoDeApagamento {
  leadId: string;
  /** O nome do contato, digitado por quem está apagando. */
  confirmacaoNome: string;
  origemDoPedido: OrigemDoPedido;
  /** Quem está executando. Vem da sessão assinada, nunca do corpo do pedido. */
  sessao: SessaoInterna;
  agora?: Date;
}

export type ResultadoDoApagamento =
  | {
      ok: true;
      apagadoEm: Date;
      /** O tamanho do que foi destruído — vai para a trilha e para a tela. */
      apagados: { interacoes: number; mensagens: number };
    }
  | { ok: false; causa: "semConfirmacao" }
  | { ok: false; causa: "confirmacaoNaoConfere" }
  | { ok: false; causa: "pedidoDesconhecido" }
  | { ok: false; causa: "leadNaoExiste" };

/**
 * Apaga o contato e tudo que está pendurado nele.
 *
 * A ordem das verificações é deliberada: confirmação e origem do pedido são
 * conferidas ANTES de tocar no banco de verdade, para que um pedido malformado
 * nunca chegue perto do `delete`.
 */
export async function apagarDadosDoLead(
  db: PrismaClient,
  pedido: PedidoDeApagamento,
): Promise<ResultadoDoApagamento> {
  const digitado = pedido.confirmacaoNome?.trim() ?? "";
  if (!digitado) return { ok: false, causa: "semConfirmacao" };
  if (!ehOrigemDoPedido(pedido.origemDoPedido)) return { ok: false, causa: "pedidoDesconhecido" };

  const lead = await db.siteLead.findUnique({
    where: { id: pedido.leadId },
    select: { id: true, nome: true },
  });
  if (!lead) return { ok: false, causa: "leadNaoExiste" };

  if (!nomesConferem(digitado, lead.nome)) return { ok: false, causa: "confirmacaoNaoConfere" };

  // As contagens são lidas ANTES do delete porque depois dele não existe mais o
  // que contar — e um registro de exclusão que não diz o tamanho do que sumiu
  // não serve para conferir nada depois (guardrail 6).
  const [interacoes, mensagens] = await Promise.all([
    db.siteLeadInteraction.count({ where: { leadId: lead.id } }),
    db.leadMensagem.count({ where: { leadId: lead.id } }),
  ]);

  const apagadoEm = pedido.agora ?? new Date();

  await db.$transaction(async (tx) => {
    await tx.internalAuditEvent.create({
      data: {
        actorType: "INTERNAL_USER",
        actorId: pedido.sessao.userId,
        actorLabel: `${pedido.sessao.nome} (${pedido.sessao.userId})`,
        acao: "apagar_dados_do_lead",
        // O id sobrevive à linha que ele apontava. É o que permite cruzar este
        // registro com qualquer outro sistema que tenha citado o mesmo lead.
        recurso: `lead:${lead.id}`,
        resultado: "PERMITIDO",
        // ⚠️ Sem nome, sem telefone, sem e-mail. Ver o aviso no topo.
        detalhe: {
          origemDoPedido: pedido.origemDoPedido,
          nomeConferido: true,
          interacoesApagadas: interacoes,
          mensagensApagadas: mensagens,
        },
        ocorridoEm: apagadoEm,
      },
    });

    await tx.siteLead.delete({ where: { id: lead.id } });
  });

  return { ok: true, apagadoEm, apagados: { interacoes, mensagens } };
}
