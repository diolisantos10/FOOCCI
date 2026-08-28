/**
 * O CONTATO QUE ACONTECEU FORA DO SISTEMA.
 *
 * Telefone, visita, conversa no corredor da feira. A Sala Comercial só enxerga o
 * que passou pelo WhatsApp dela — e o que ela não enxerga, para efeito de fila,
 * **nunca aconteceu**: `lastContactedAt` continua nulo, o lead segue na fila de
 * "ainda não abordado", e o próximo vendedor liga para quem já foi atendido
 * ontem. É esse defeito que este arquivo evita.
 *
 * ── QUEM E QUANDO SÃO OBRIGATÓRIOS, E NÃO POR FORMALIDADE ───────────────────
 *
 * **Quem** vem da SESSÃO, nunca do corpo do pedido. Deixar o cliente escolher o
 * autor é deixar o registro de responsabilidade nas mãos de quem age — e o dia
 * em que dois vendedores discordarem sobre quem falou com o cliente é o dia em
 * que este campo vale alguma coisa.
 *
 * **Quando** é digitado, e não presumido. Registro manual quase sempre é feito
 * DEPOIS: liguei às 9h, anoto às 15h. Carimbar a hora da digitação embaralha a
 * linha do tempo (a ligação aparece depois da mensagem que ela provocou) e
 * estraga toda medida de tempo de resposta. Por isso não existe valor padrão
 * aqui dentro: sem `quando`, a função recusa.
 *
 * ── E POR QUE O FUTURO É RECUSADO ───────────────────────────────────────────
 *
 * Um ano digitado errado (2027 no lugar de 2026) empurraria `lastContactedAt`
 * para frente e o lead sumiria da fila de "sem resposta" **para sempre** — a
 * consulta compara com o relógio, e o relógio nunca alcança. Some sem erro, sem
 * alarme, sem ninguém perceber.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import {
  ROTULO_INTERACAO,
  contaComoAbordagem,
  type FoocciInteractionType,
} from "@/services/foocci-crm/foocciCrmFunnel";

type Cliente = PrismaClient | Prisma.TransactionClient;

/**
 * O que se pode registrar à mão.
 *
 * `MUDANCA_ETAPA` fica de fora: mover no funil tem caminho próprio, que escreve
 * estado e histórico na mesma transação. Aceitá-la aqui abriria a porta para o
 * histórico dizer uma coisa e o `stage` dizer outra.
 *
 * `NOTA_INTERNA` também fica de fora, e por outro motivo: ela é `interna: true`
 * — o lead nunca vê — e já tem caminho na tela de conversa. Uma nota interna que
 * entrasse por aqui viraria contato registrado, e um contato registrado mexe na
 * fila de quem falta abordar.
 */
export const TIPOS_DE_CONTATO_MANUAL = [
  "LIGACAO",
  "REUNIAO",
  "MENSAGEM_ENVIADA",
  "RESPOSTA_RECEBIDA",
  "NOTA",
] as const;

export type TipoDeContatoManual = (typeof TIPOS_DE_CONTATO_MANUAL)[number];

export function ehTipoDeContatoManual(v: unknown): v is TipoDeContatoManual {
  return typeof v === "string" && (TIPOS_DE_CONTATO_MANUAL as readonly string[]).includes(v);
}

/** O rótulo vem da mesma fonte que a tela velha usa. Um nome, um lugar. */
export function rotuloDoContatoManual(tipo: TipoDeContatoManual): string {
  return ROTULO_INTERACAO[tipo as FoocciInteractionType];
}

const MAX_NOTA = 1000;

/**
 * Folga entre o relógio do navegador e o do servidor.
 *
 * Sem ela, "agora" digitado pela tela chegaria alguns segundos no futuro em
 * qualquer máquina com o relógio adiantado, e o registro mais comum de todos —
 * "acabei de falar com ele" — seria recusado sem que ninguém entendesse por quê.
 */
const TOLERANCIA_DE_RELOGIO_MS = 5 * 60_000;

export interface NovoContatoManual {
  leadId: string;
  tipo: TipoDeContatoManual;
  /** Id da pessoa na sessão. Vem do cookie assinado, nunca do corpo. */
  quemUserId: string;
  /** Quando o contato ACONTECEU — não quando foi digitado. */
  quando: Date;
  nota?: string | null;
  /** Injetável para teste. Em produção é o relógio do servidor. */
  agora?: Date;
}

export type ResultadoDoContatoManual =
  | {
      ok: true;
      interacaoId: string;
      quando: Date;
      /** `true` quando o registro tirou o lead da fila de "não abordados". */
      contouComoAbordagem: boolean;
    }
  | { ok: false; causa: "semQuem" }
  | { ok: false; causa: "tipoInvalido" }
  | { ok: false; causa: "semQuando" }
  | { ok: false; causa: "quandoNoFuturo"; agora: Date }
  | { ok: false; causa: "anotacaoSemTexto" }
  | { ok: false; causa: "leadNaoExiste" };

function limpaNota(nota: string | null | undefined): string | null {
  if (typeof nota !== "string") return null;
  const t = nota.trim().slice(0, MAX_NOTA);
  return t === "" ? null : t;
}

/**
 * Registra que alguém falou com o lead por fora do sistema.
 *
 * ── POR QUE OS ESPELHOS SÓ ANDAM PARA FRENTE ────────────────────────────────
 *
 * `lastContactedAt` e `lastInteractionAt` são carimbos de "o mais recente", e o
 * registro manual chega fora de ordem por natureza — o vendedor lança na
 * sexta-feira a ligação de terça. Escrever o valor direto faria o carimbo
 * ANDAR PARA TRÁS, e um lead atendido hoje reapareceria na fila de "sem resposta
 * há 3 dias". Por isso a escrita é condicional ao que já está gravado.
 */
export async function registrarContatoManual(
  db: PrismaClient,
  entrada: NovoContatoManual,
): Promise<ResultadoDoContatoManual> {
  const quem = entrada.quemUserId?.trim();
  if (!quem) return { ok: false, causa: "semQuem" };

  if (!ehTipoDeContatoManual(entrada.tipo)) return { ok: false, causa: "tipoInvalido" };

  const quando = entrada.quando;
  if (!(quando instanceof Date) || Number.isNaN(quando.getTime())) {
    return { ok: false, causa: "semQuando" };
  }

  const agora = entrada.agora ?? new Date();
  if (quando.getTime() > agora.getTime() + TOLERANCIA_DE_RELOGIO_MS) {
    return { ok: false, causa: "quandoNoFuturo", agora };
  }

  const nota = limpaNota(entrada.nota);

  // Uma "Anotação" sem texto é uma linha que não conta nada: quem abrir a ficha
  // daqui a um mês lê "Anotação · 12/08" e continua sem saber o que aconteceu.
  // Nos outros tipos o próprio tipo já é o fato ("Ligação"), e a nota é extra.
  if (entrada.tipo === "NOTA" && !nota) return { ok: false, causa: "anotacaoSemTexto" };

  const lead = await db.siteLead.findUnique({
    where: { id: entrada.leadId },
    select: { id: true, lastContactedAt: true, lastInteractionAt: true },
  });
  if (!lead) return { ok: false, causa: "leadNaoExiste" };

  const abordagem = contaComoAbordagem(entrada.tipo as FoocciInteractionType);

  const avancaInteracao =
    lead.lastInteractionAt === null || lead.lastInteractionAt.getTime() < quando.getTime();
  const avancaContato =
    abordagem &&
    (lead.lastContactedAt === null || lead.lastContactedAt.getTime() < quando.getTime());

  const interacaoId = await db.$transaction(async (tx) => {
    const criada = await tx.siteLeadInteraction.create({
      data: {
        leadId: entrada.leadId,
        tipo: entrada.tipo,
        // O autor é o id da sessão. O NOME é resolvido na leitura, e não
        // copiado para cá, porque pessoa desativada nunca é apagada
        // (`admin/pessoas` corta o acesso e mantém a linha) — então o nome
        // continua alcançável, e uma cópia só criaria duas versões dele.
        actor: quem,
        nota,
        // O carimbo é a hora do FATO. É por ele que a linha do tempo ordena.
        createdAt: quando,
      },
      select: { id: true },
    });

    if (avancaInteracao || avancaContato) {
      await tx.siteLead.update({
        where: { id: entrada.leadId },
        data: {
          ...(avancaInteracao ? { lastInteractionAt: quando } : {}),
          ...(avancaContato ? { lastContactedAt: quando } : {}),
        },
      });
    }

    return criada.id;
  });

  return { ok: true, interacaoId, quando, contouComoAbordagem: avancaContato };
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export interface ContatoManualNaFicha {
  id: string;
  tipo: TipoDeContatoManual;
  rotulo: string;
  /** Nome de quem registrou. Cai no `actor` cru quando não há pessoa por trás. */
  quem: string;
  quando: Date;
  nota: string | null;
}

/**
 * Os contatos registrados à mão, do mais recente para o mais antigo.
 *
 * ── POR QUE ISTO EXISTE JUNTO COM O BOTÃO DE REGISTRAR ──────────────────────
 *
 * Um botão cujo resultado não aparece em lugar nenhum é um botão que o time
 * aperta duas vezes — e depois deixa de apertar. A Sala mostra a conversa do
 * WhatsApp; o telefonema não está lá, e não estaria em nenhum outro canto.
 *
 * O `actor` gravado é um id. Quem lê a ficha precisa de um nome, então os ids
 * viram nomes aqui, numa consulta só. Os atores antigos da tela do CRM velho
 * ("admin", "sistema", "sdr-agent") não são id de ninguém e continuam aparecendo
 * como estão — apagá-los seria esconder metade do histórico da base.
 */
export async function listarContatosManuais(
  db: Cliente,
  params: { leadId: string; limite?: number },
): Promise<ContatoManualNaFicha[]> {
  const limite = Math.min(Math.max(params.limite ?? 20, 1), 100);

  const linhas = await db.siteLeadInteraction.findMany({
    where: {
      leadId: params.leadId,
      tipo: { in: [...TIPOS_DE_CONTATO_MANUAL] },
      // Nota interna nunca entra nesta lista, nem por engano: ela tem outro
      // significado e outra tela.
      interna: false,
    },
    orderBy: { createdAt: "desc" },
    take: limite,
    select: { id: true, tipo: true, actor: true, nota: true, createdAt: true },
  });

  const ids = [...new Set(linhas.map((l) => l.actor))];
  const pessoas = ids.length
    ? await db.internalUser.findMany({
        where: { id: { in: ids } },
        select: { id: true, nome: true },
      })
    : [];
  const nomePorId = new Map(pessoas.map((p) => [p.id, p.nome]));

  return linhas.map((l) => ({
    id: l.id,
    tipo: l.tipo as TipoDeContatoManual,
    rotulo: rotuloDoContatoManual(l.tipo as TipoDeContatoManual),
    quem: nomePorId.get(l.actor) ?? l.actor,
    quando: l.createdAt,
    nota: l.nota,
  }));
}
