/**
 * O QUE O COPILOTO GRAVA — e por que passa pela porta da jornada.
 *
 * ── A EXIGÊNCIA ─────────────────────────────────────────────────────────────
 *
 * O documento pede que o copiloto **registre no CRM automaticamente**: a objeção
 * que identificou, a necessidade que ouviu, a próxima ação que propôs. Sem isso
 * o vendedor lê a leitura, fecha a conversa, e o que a IA descobriu morre na
 * tela — que é o mesmo defeito da sondagem antes de ela ter chamador.
 *
 * ── ⛔ NADA AQUI ESCREVE ESTADO DA JORNADA ─────────────────────────────────
 *
 * `jornadaComercial.ts` é explícito: *"Ninguém escreve estado da jornada fora
 * daqui"*. Este arquivo respeita isso — ele **não** move estágio, **não** abre
 * oportunidade, **não** qualifica empresa. Ele grava EVENTO (`registrarNaTrilha`)
 * e escreve nos campos descritivos da oportunidade que já existe.
 *
 * A distinção não é formalidade: objeção registrada não é promoção. Uma IA que
 * movesse estágio ao "aprender" algo produziria funil inflado sem ninguém ter
 * decidido nada — e o funil é o número que o CEO lê.
 *
 * ── AUTOR IA, SEMPRE ────────────────────────────────────────────────────────
 *
 * `Autoria.autor = "IA"` com o `userId` de quem confirmou. Sem isso não existe a
 * pergunta "o que a IA acertou?", que é a única maneira de decidir se o copiloto
 * fica. Carimbar como HUMANO seria a IA ganhando crédito de gente — e escondendo
 * o próprio erro.
 *
 * ── IDEMPOTÊNCIA ────────────────────────────────────────────────────────────
 *
 * A chave inclui o texto do aprendizado: apertar "Registrar no CRM" duas vezes
 * com a mesma leitura grava UM evento. Uma leitura nova (texto diferente) grava
 * outro, porque aí é descoberta nova de verdade.
 */

import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { registrarNaTrilha, type Autoria } from "./jornadaComercial";

type Cliente = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export type ResultadoDoRegistro =
  | { ok: true; gravados: string[] }
  | { ok: false; causa: "leadNaoExiste" | "nadaParaGravar" };

export interface PedidoDeRegistro {
  leadId: string;
  evento: "aprendizado" | "devolvido";
  autoria: Autoria;
  objecoes?: string[];
  necessidade?: string | null;
  proximaAcao?: string | null;
  /** Só em `devolvido`: para quê a conversa voltou ao modo automático. */
  objetivo?: string | null;
  agora?: Date;
}

/**
 * Grava o que o copiloto aprendeu.
 *
 * Devolve a lista do que foi gravado, em palavras — a tela precisa dizer ao
 * vendedor o que entrou, e "registrado" sozinho não diz nada verificável.
 */
export async function registrarAprendizadoDoCopiloto(
  db: Cliente,
  pedido: PedidoDeRegistro,
): Promise<ResultadoDoRegistro> {
  const lead = await db.siteLead.findUnique({
    where: { id: pedido.leadId },
    select: { id: true, empresaId: true, contatoId: true },
  });
  if (!lead) return { ok: false, causa: "leadNaoExiste" };

  const objecoes = (pedido.objecoes ?? []).map((o) => o.trim()).filter(Boolean);
  const necessidade = pedido.necessidade?.trim() || null;
  const proximaAcao = pedido.proximaAcao?.trim() || null;
  const objetivo = pedido.objetivo?.trim() || null;

  if (pedido.evento === "aprendizado" && !objecoes.length && !necessidade && !proximaAcao) {
    return { ok: false, causa: "nadaParaGravar" };
  }

  const oportunidade = await db.oportunidade.findFirst({
    where: { leadId: lead.id },
    orderBy: { criadoEm: "desc" },
    select: { id: true, empresaId: true, objecoes: true, dorIdentificada: true },
  });

  const gravados: string[] = [];

  // ── 1. A trilha, que é o registro que não se perde ────────────────────────
  const nota =
    pedido.evento === "devolvido"
      ? `Conversa devolvida para a IA. Objetivo: ${objetivo ?? "(não informado)"}`
      : montarNota({ objecoes, necessidade, proximaAcao });

  // ── ⚠️ A TRILHA SÓ EXISTE PARA QUEM TEM JORNADA ──────────────────────────
  //
  // `EventoDaJornada` amarra `entidadeId` a uma entidade REAL da jornada —
  // oportunidade, contato, empresa. Um lead que entrou pelo formulário do site
  // não tem nenhuma das três (ver `SiteLead.empresaId`, opcional de propósito),
  // e enfiar o id do lead em `entidadeId` produziria evento apontando para um
  // registro que não existe naquela tabela: história falsa, pior que história
  // faltando. Nesse caso a gravação segue pela linha do tempo do lead (passo 4),
  // que é onde a tela dele olha.
  const alvo = oportunidade
    ? ({ entidade: "OPORTUNIDADE", id: oportunidade.id } as const)
    : lead.contatoId
      ? ({ entidade: "CONTATO", id: lead.contatoId } as const)
      : lead.empresaId
        ? ({ entidade: "EMPRESA", id: lead.empresaId } as const)
        : null;

  if (alvo) {
    const gravou = await registrarNaTrilha(db, {
      entidade: alvo.entidade,
      entidadeId: alvo.id,
      // `NOTA` e não `ENRIQUECIMENTO`: enriquecimento nesta casa quer dizer dado
      // apurado de fonte externa. O que o copiloto ouviu na conversa é leitura,
      // e misturar as duas coisas estragaria a fila de quem falta enriquecer.
      tipo: "NOTA",
      autoria: pedido.autoria,
      empresaId: lead.empresaId ?? oportunidade?.empresaId ?? null,
      contatoId: lead.contatoId ?? null,
      oportunidadeId: oportunidade?.id ?? null,
      leadId: lead.id,
      nota,
      fonte: "copiloto-do-vendedor",
      chaveDeIdempotencia: chaveDe(lead.id, pedido.evento, nota),
    });

    if (gravou) gravados.push("trilha");
  }

  // ── 2. A oportunidade, quando existe ──────────────────────────────────────
  //
  // ⚠️ Objeção NOVA se ACRESCENTA; a lista nunca é substituída. Substituir
  // apagaria a objeção que o SDR registrou há duas semanas porque a leitura de
  // hoje não a mencionou — e ela não deixou de existir por não ter sido dita
  // de novo. Mesma doutrina de `juntarSinais` em `sondagem.ts`.
  if (oportunidade && pedido.evento === "aprendizado") {
    const juntas = semRepetir([...oportunidade.objecoes, ...objecoes]);
    const mudouObjecoes = juntas.length !== oportunidade.objecoes.length;
    // A dor só é escrita quando o campo está VAZIO. Sobrescrever a dor apurada
    // por gente com a leitura de um modelo é trocar fato por inferência.
    const escreverDor = Boolean(necessidade) && !oportunidade.dorIdentificada?.trim();

    if (mudouObjecoes || escreverDor) {
      await db.oportunidade.update({
        where: { id: oportunidade.id },
        data: {
          ...(mudouObjecoes ? { objecoes: juntas } : {}),
          ...(escreverDor ? { dorIdentificada: necessidade } : {}),
        },
      });
      if (mudouObjecoes) gravados.push("objeções na oportunidade");
      if (escreverDor) gravados.push("necessidade na oportunidade");
    }
  }

  // ── 3. A próxima ação, no lead ────────────────────────────────────────────
  //
  // Também só quando está vazia: uma próxima ação agendada por uma pessoa vale
  // mais que a sugestão do modelo, e apagá-la faria sumir um compromisso do dia
  // de alguém.
  if (proximaAcao && pedido.evento === "aprendizado") {
    const atual = await db.siteLead.findUnique({
      where: { id: lead.id },
      select: { proximaAcaoNota: true, proximaAcaoEm: true },
    });

    if (!atual?.proximaAcaoNota?.trim() && !atual?.proximaAcaoEm) {
      await db.siteLead.update({
        where: { id: lead.id },
        data: { proximaAcaoNota: proximaAcao.slice(0, 500) },
      });
      gravados.push("próxima ação no lead");
    }
  }

  // ── 4. A linha do tempo do lead, que é onde a tela olha ───────────────────
  await db.siteLeadInteraction.create({
    data: {
      leadId: lead.id,
      tipo: "NOTA_INTERNA",
      actor: pedido.autoria.userId ?? "copiloto",
      nota: `Copiloto: ${nota}`.slice(0, 1000),
      // O lead nunca vê o que o copiloto anotou sobre ele. Isto é observação da
      // equipe, e o amarelo da tela depende deste campo.
      interna: true,
    },
  });
  gravados.push("linha do tempo do lead");

  return { ok: true, gravados };
}

/** A nota, em português, do jeito que um humano vai ler daqui a três semanas. */
export function montarNota(p: {
  objecoes: string[];
  necessidade: string | null;
  proximaAcao: string | null;
}): string {
  const partes: string[] = [];
  if (p.necessidade) partes.push(`Necessidade: ${p.necessidade}`);
  if (p.objecoes.length) partes.push(`Objeções: ${p.objecoes.join("; ")}`);
  if (p.proximaAcao) partes.push(`Próxima ação: ${p.proximaAcao}`);
  return partes.join(" · ");
}

/**
 * A chave de idempotência.
 *
 * Resume o TEXTO porque o conteúdo é livre e pode ser longo — e porque é o
 * conteúdo, não o relógio, que decide se é a mesma gravação. Sem o resumo a
 * chave teria o tamanho da nota e a coluna única a rejeitaria.
 */
export function chaveDe(leadId: string, evento: string, nota: string): string {
  const resumo = createHash("sha256").update(nota).digest("hex").slice(0, 24);
  return `copiloto:${evento}:${leadId}:${resumo}`;
}

function semRepetir(lista: string[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const bruto of lista) {
    const t = bruto.trim();
    if (!t) continue;
    const chave = t.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(t);
  }
  return saida;
}
