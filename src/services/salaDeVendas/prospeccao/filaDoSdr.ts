/**
 * A FILA DO SDR, POR ESTADO — "então a SDR sabe exatamente onde trabalhar".
 *
 * O documento do CEO desenha o SDR COMMAND CENTER com oito baldes. Este arquivo
 * entrega o DADO desses baldes. A tela é de outra frente, e de propósito: contar
 * é regra de negócio, desenhar não.
 *
 * ── UMA EMPRESA, UM BALDE ───────────────────────────────────────────────────
 * Somar a mesma empresa em dois estados faria o painel mostrar mais empresas do
 * que existem — e um painel que não fecha ninguém confere duas vezes. Por isso a
 * classificação é uma escada de prioridade, e a ordem está escrita abaixo: o
 * estado MAIS AVANÇADO ganha, porque é ele que diz o que fazer hoje.
 *
 * ── O QUE ESTE ARQUIVO NÃO FAZ ──────────────────────────────────────────────
 * Não fila de ENVIO. Aparecer aqui é fila de trabalho; quem autoriza uma
 * mensagem a sair continua sendo `LeadContactSafety`, `freioDeRitmo` e a
 * `ProspeccaoConfig`, exatamente como diz o cabeçalho da jornada.
 */

import type { Prisma, PrismaClient, SiteLeadStage, EstagioDaEmpresa, TipoDeGatekeeper } from "@prisma/client";

type Cliente = PrismaClient | Prisma.TransactionClient;

export type EstadoDaFilaDoSdr =
  | "NOVOS_PROSPECTS"
  | "GATEKEEPER"
  | "FALANDO_COM_ATENDENTE"
  | "DECISOR_IDENTIFICADO"
  | "ABORDAGEM_COMERCIAL"
  | "REUNIAO"
  | "FOLLOW_UP"
  | "SEM_CONTATO";

/** A ordem da escada, e os rótulos que o documento usa. */
export const ESTADOS_DA_FILA: ReadonlyArray<{ estado: EstadoDaFilaDoSdr; rotulo: string }> = [
  { estado: "REUNIAO", rotulo: "Reunião agendada" },
  { estado: "ABORDAGEM_COMERCIAL", rotulo: "Conversa comercial iniciada" },
  { estado: "FOLLOW_UP", rotulo: "Follow-up" },
  { estado: "DECISOR_IDENTIFICADO", rotulo: "Decisor identificado" },
  { estado: "FALANDO_COM_ATENDENTE", rotulo: "Falando com atendente" },
  { estado: "GATEKEEPER", rotulo: "Bot/Gatekeeper" },
  { estado: "SEM_CONTATO", rotulo: "Sem contato" },
  { estado: "NOVOS_PROSPECTS", rotulo: "Novos prospects" },
];

/** Porteiro de carne e osso — dá para insistir. Bot e formulário, não. */
const PORTEIRO_HUMANO: ReadonlyArray<TipoDeGatekeeper> = ["RECEPCIONISTA", "ATENDENTE", "SAC", "CAIXA"];

const EM_REUNIAO: ReadonlyArray<SiteLeadStage> = ["DEMO_AGENDADA", "DEMO_REALIZADA"];
const EM_CONVERSA: ReadonlyArray<SiteLeadStage> = [
  "RESPONDEU",
  "EM_QUALIFICACAO",
  "QUALIFICADO",
  "PROPOSTA_ENVIADA",
  "EM_NEGOCIACAO",
];

export interface EmpresaNaFila {
  estagio: EstagioDaEmpresa;
  contatos: ReadonlyArray<{
    ehDecisor: boolean;
    ehGatekeeper: boolean;
    tipoDeGatekeeper: TipoDeGatekeeper | null;
  }>;
  leads: ReadonlyArray<{
    stage: SiteLeadStage;
    proximaAcaoEm: Date | null;
    optOutAt: Date | null;
  }>;
}

/**
 * Onde esta empresa está, hoje, para quem vai trabalhar a fila.
 *
 * Pura de propósito: é ela que os testes exercitam caso a caso, e é ela que
 * muda quando a régua mudar. A consulta abaixo só carrega e conta.
 */
export function estadoDaFilaDoSdr(empresa: EmpresaNaFila, agora: Date): EstadoDaFilaDoSdr {
  const leads = empresa.leads.filter((l) => !l.optOutAt);
  const temDecisor = empresa.contatos.some((c) => c.ehDecisor);

  if (leads.some((l) => EM_REUNIAO.includes(l.stage))) return "REUNIAO";
  if (temDecisor && leads.some((l) => EM_CONVERSA.includes(l.stage))) return "ABORDAGEM_COMERCIAL";
  if (leads.some((l) => l.stage === "NUTRICAO" || (l.proximaAcaoEm && l.proximaAcaoEm <= agora))) {
    return "FOLLOW_UP";
  }
  if (temDecisor || empresa.estagio === "DECISOR_ENCONTRADO" || empresa.estagio === "QUALIFICADA") {
    return "DECISOR_IDENTIFICADO";
  }
  if (empresa.estagio === "GATEKEEPER") {
    const humano = empresa.contatos.some(
      (c) => c.ehGatekeeper && c.tipoDeGatekeeper !== null && PORTEIRO_HUMANO.includes(c.tipoDeGatekeeper),
    );
    return humano ? "FALANDO_COM_ATENDENTE" : "GATEKEEPER";
  }
  // Abordado e calado. Não é "novo" — é o balde que o documento chama de sem
  // contato, e misturar os dois esconderia quem já consumiu uma tentativa.
  if (leads.some((l) => l.stage === "PRIMEIRO_CONTATO")) return "SEM_CONTATO";
  return "NOVOS_PROSPECTS";
}

export interface ContagemDaFila {
  estado: EstadoDaFilaDoSdr;
  rotulo: string;
  total: number;
}

/**
 * A contagem por estado, com TODOS os baldes presentes — inclusive os zerados.
 *
 * Balde que some quando zera faz o operador achar que o estado não existe, e o
 * painel muda de forma a cada hora. Zero é informação.
 */
export async function contarFilaDoSdr(db: Cliente, agora: Date = new Date()): Promise<ContagemDaFila[]> {
  const empresas = await db.empresa.findMany({
    where: { estagio: { not: "DESCARTADA" } },
    select: {
      estagio: true,
      contatos: { select: { ehDecisor: true, ehGatekeeper: true, tipoDeGatekeeper: true } },
      leads: { select: { stage: true, proximaAcaoEm: true, optOutAt: true } },
    },
  });

  const totais = new Map<EstadoDaFilaDoSdr, number>(ESTADOS_DA_FILA.map((e) => [e.estado, 0]));
  for (const empresa of empresas) {
    const estado = estadoDaFilaDoSdr(empresa as EmpresaNaFila, agora);
    totais.set(estado, (totais.get(estado) ?? 0) + 1);
  }

  return ESTADOS_DA_FILA.map(({ estado, rotulo }) => ({ estado, rotulo, total: totais.get(estado) ?? 0 }));
}
