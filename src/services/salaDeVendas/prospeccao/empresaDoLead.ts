/**
 * ⭐ O ELO QUE FALTAVA — o lead de prospecção ganha a sua EMPRESA.
 *
 * ── O DEFEITO MEDIDO EM PRODUÇÃO, 17/09/2026 ────────────────────────────────
 *
 * `objetivoDaProspeccao()` existe, está testada e está LIGADA ao caminho real da
 * conversa (`ta/atender.ts` e `gatekeeper/registro.ts`). Ela é a consciência que
 * o CEO pediu: *"número frio que cair em bot automático, o objetivo é buscar o
 * contato certo administrativo comercial"*.
 *
 * E ela estava **inerte**. Ela só sabe o objetivo se o lead tiver `Empresa`
 * ligada — e NENHUM dos 750 leads abordados tinha. Devolvia `null`, o TA seguia
 * sem objetivo nenhum, e nas conversas reais o robô do restaurante respondia e o
 * sistema não ia atrás de nada. Raio-X do dia: `gatekeepers: medido:false`,
 * `decisores: medido:false`, motivo *"nenhum lead abordado tem Empresa ligada"*.
 *
 * Peça pronta, testada, **sem o dado de que ela depende**. É o primo do defeito
 * de peça sem chamador que esta base já mediu quatro vezes: por dentro parece
 * tudo certo, por fora não acontece nada.
 *
 * ── O CRITÉRIO DE CASAMENTO, E POR QUE NÃO É O TELEFONE ─────────────────────
 *
 * `casamento.ts` casa TELEFONE → lead, e resolve outra pergunta: *"que pessoa é
 * este número?"*. Aqui a pergunta é *"que CASA é este lead?"*, e telefone não
 * responde: o telefone é da PESSOA, não da casa — duas unidades da mesma rede
 * publicam o mesmo número, e casar empresa por telefone fundiria duas empresas
 * diferentes numa só. É literalmente a razão escrita em `chaveDeDedupeDaEmpresa`
 * para a chave NÃO ser telefone.
 *
 * O critério é o mesmo da jornada, e de propósito: **nome do restaurante +
 * cidade**, normalizados (`chaveDeDedupeDaEmpresa`). Usar a mesma chave é o que
 * faz este retrofit encontrar a empresa que o Hunter já descobriu em vez de
 * criar uma segunda linha ao lado dela.
 *
 * ── ⚠️ ONDE FOR AMBÍGUO, NÃO SE ADIVINHA ───────────────────────────────────
 *
 * Lead sem `restaurante` preenchido fica **sem ligar**, é contado e o motivo é
 * dito. Chutar o nome da empresa a partir do nome da pessoa ("Marina Duarte"
 * viraria uma empresa chamada Marina Duarte) encheria a base de empresas
 * fantasma e, pior, faria `objetivoDaProspeccao` devolver DESCOBRIR_DECISOR com
 * convicção sobre uma casa que não existe. Ausência de informação não é
 * informação (guardrail 1): um `null` honesto é melhor que um vínculo inventado.
 *
 * ── O ESTÁGIO EM QUE A EMPRESA NASCE AQUI ───────────────────────────────────
 *
 * `descobrirEmpresa` cria em `DESCOBERTA`, e `DESCOBERTA` devolve objetivo
 * `null` — ou seja, criar a empresa e parar aí deixaria a consciência tão
 * inerte quanto antes. Por isso o retrofit move para `PRONTA_PARA_SDR`, que é a
 * verdade do registro: **este contato já está na fila do SDR, e alguns já foram
 * abordados**. O degrau existe em `TRANSICOES_DA_EMPRESA` e a mudança vai pela
 * `moverEmpresa`, com trilha — nunca por escrita direta de `estagio`.
 *
 * ── ⛔ E ISTO NÃO MANDA MENSAGEM. NENHUMA. ──────────────────────────────────
 *
 * Nem uma, nem em hipótese nenhuma. Empresa em `PRONTA_PARA_SDR` entra em FILA
 * DE TRABALHO, nunca em fila de envio: quem autoriza uma saída continua sendo
 * `LeadContactSafety`, `freioDeRitmo` e `ProspeccaoConfig`, e nada aqui encosta
 * neles. Este arquivo só lê e escreve registro.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  AUTORIA_SISTEMA,
  descobrirEmpresa,
  moverEmpresa,
  registrarContato,
  vincularLead,
  type Autoria,
} from "@/services/salaDeVendas/jornadaComercial";
import { moverNaSala } from "../funil";

type Cliente = PrismaClient | Prisma.TransactionClient;

const FONTE_DO_RETROFIT = "retrofit-lead-de-prospeccao";

/** Por que um lead ficou de fora. Enumerado: motivo em texto livre não vira conta. */
export type MotivoDeNaoLigar =
  | "jaEstavaLigado"
  | "semNomeDeRestaurante"
  | "naoEhContatoFrio"
  | "leadNaoExiste";

export type ResultadoDaLigacao =
  | { ligou: true; empresaId: string; contatoId: string | null; criouEmpresa: boolean }
  | { ligou: false; motivo: MotivoDeNaoLigar; empresaId: string | null };

/** As portas de entrada em que NÓS fomos atrás — as únicas que têm empresa a descobrir. */
const FONTES_DE_PROSPECCAO = ["LISTA_PROSPECCAO", "INDICACAO", "IMPORTACAO"] as const;

/**
 * Garante que este lead de prospecção está ligado à sua `Empresa` (e ao seu
 * `Contato`, quando há telefone).
 *
 * **Idempotente.** Rodar duas vezes sobre o mesmo lead devolve
 * `jaEstavaLigado` e não grava nada: `descobrirEmpresa` deduplica pela
 * `chaveDeDedupe`, `registrarContato` por (empresa, telefone) e `vincularLead`
 * não regrava o vínculo que já existe.
 */
export async function garantirEmpresaDoLead(
  db: Cliente,
  params: { leadId: string; autoria?: Autoria; agora?: Date },
): Promise<ResultadoDaLigacao> {
  const autoria = params.autoria ?? AUTORIA_SISTEMA;
  const agora = params.agora ?? new Date();

  const lead = await db.siteLead.findUnique({
    where: { id: params.leadId },
    select: {
      id: true,
      nome: true,
      restaurante: true,
      cidade: true,
      tipo: true,
      email: true,
      whatsapp: true,
      fonte: true,
      empresaId: true,
      contatoId: true,
    },
  });

  if (!lead) return { ligou: false, motivo: "leadNaoExiste", empresaId: null };
  if (lead.empresaId) return { ligou: false, motivo: "jaEstavaLigado", empresaId: lead.empresaId };

  if (!(FONTES_DE_PROSPECCAO as readonly string[]).includes(lead.fonte)) {
    return { ligou: false, motivo: "naoEhContatoFrio", empresaId: null };
  }

  const nomeDaCasa = (lead.restaurante ?? "").trim();
  if (!nomeDaCasa) {
    // ⚠️ O caso ambíguo. Ver o cabeçalho: não se chuta o nome da empresa a
    // partir do nome da pessoa. Fica sem ligar, e a contagem diz quantos.
    return { ligou: false, motivo: "semNomeDeRestaurante", empresaId: null };
  }

  const descoberta = await descobrirEmpresa(db, {
    nome: nomeDaCasa,
    cidade: lead.cidade,
    // `estado` não existe em `SiteLead`. Deixá-lo fora da chave é consistente:
    // `chaveDeDedupeDaEmpresa` ignora as partes vazias, então a mesma casa
    // descoberta pelo Hunter com estado gera chave diferente desta. Erra para o
    // lado barato — duas linhas se juntam depois; uma fusão errada não se desfaz.
    estado: null,
    categoria: lead.tipo,
    fonteDaDescoberta: FONTE_DO_RETROFIT,
    dados: { email: lead.email, whatsappPublicado: lead.whatsapp },
    autoria,
    agora,
  });

  const empresaId = descoberta.empresaId;

  // ── O DEGRAU QUE ACORDA O OBJETIVO ──────────────────────────────────────
  //
  // Sem esta parte a empresa nasceria em DESCOBERTA e `objetivoDaProspeccao`
  // continuaria devolvendo `null` — a consciência seguiria inerte, agora com
  // uma tabela a mais para dar a impressão de que foi resolvida.
  const empresa = await db.empresa.findUnique({
    where: { id: empresaId },
    select: { estagio: true },
  });
  if (empresa && empresa.estagio === "DESCOBERTA") {
    await moverEmpresa(db, {
      empresaId,
      de: "DESCOBERTA",
      para: "PRONTA_PARA_SDR",
      autoria,
      motivo: "lead de prospecção já estava na fila do SDR quando a empresa foi criada",
      agora,
    });
  }

  // A pessoa por trás do lead vira `Contato` da empresa. Sem ele, o Gatekeeper
  // teria a empresa e não teria em quem pendurar o carimbo de porteiro —
  // `Contato.empresaId` é obrigatório, e é onde o registro do porteiro mora.
  //
  // ⚠️ `ehDecisor` e `ehGatekeeper` ficam os DOIS em `false`: ninguém apurou o
  // papel desta pessoa ainda. Marcar decisor aqui faria `objetivoDaProspeccao`
  // pular direto para GERAR_OPORTUNIDADE e o agente venderia para a atendente.
  let contatoId: string | null = null;
  const nomeDaPessoa = (lead.nome ?? "").trim() || nomeDaCasa;
  const r = await registrarContato(db, {
    empresaId,
    nome: nomeDaPessoa,
    canal: "whatsapp",
    telefone: lead.whatsapp,
    email: lead.email,
    ehDecisor: false,
    ehGatekeeper: false,
    confianca: "BAIXA",
    comoFoiDescoberto: "contato da lista de prospecção, papel ainda não apurado",
    fonte: FONTE_DO_RETROFIT,
    autoria,
    agora,
  });
  contatoId = r.contatoId;

  await vincularLead(db, { leadId: lead.id, empresaId, autoria });
  if (!lead.contatoId && contatoId) {
    await vincularLead(db, { leadId: lead.id, contatoId, autoria });
  }

  return { ligou: true, empresaId, contatoId, criouEmpresa: descoberta.criada };
}

/** A conta do retrofit — cada lead cai em exatamente uma destas linhas. */
export interface ContagemDoRetrofit {
  examinados: number;
  ligados: number;
  empresasCriadas: number;
  jaEstavamLigados: number;
  /** Os ambíguos: sem nome de restaurante, e por isso deixados em paz. */
  semNomeDeRestaurante: number;
  naoEhContatoFrio: number;
  /** Falhas de escrita, com o id — nunca somem caladas. */
  falharam: Array<{ leadId: string; erro: string }>;
}

/**
 * ⭐ O RETROFIT — a base antiga ganha o elo que nunca teve.
 *
 * Varre os leads de prospecção SEM empresa e liga cada um à sua. Percorre em
 * páginas por `id` para não carregar 750 (nem 75 mil) linhas na memória.
 *
 * ── ⛔ ELA NÃO ENVIA MENSAGEM. NENHUMA. ─────────────────────────────────────
 * Nem template, nem retomada, nem "só um oi". O retrofit é escrita de registro,
 * e o único efeito visível dele é o agente passar a SABER o que fazer quando a
 * pessoa escrever de volta.
 *
 * ── PODE RODAR DE NOVO ──────────────────────────────────────────────────────
 * Idempotente por construção: o filtro já exclui quem tem empresa, e todas as
 * escritas por baixo deduplicam. Rodar duas vezes devolve a segunda contagem
 * com `ligados: 0` e não cria nada.
 */
export async function retrofitEmpresaDosLeadsDeProspeccao(
  db: Cliente,
  opcoes: { autoria?: Autoria; agora?: Date; tamanhoDaPagina?: number } = {},
): Promise<ContagemDoRetrofit> {
  const tamanho = opcoes.tamanhoDaPagina ?? 200;
  const conta: ContagemDoRetrofit = {
    examinados: 0,
    ligados: 0,
    empresasCriadas: 0,
    jaEstavamLigados: 0,
    semNomeDeRestaurante: 0,
    naoEhContatoFrio: 0,
    falharam: [],
  };

  let cursor: string | null = null;

  for (;;) {
    const pagina: Array<{ id: string }> = await db.siteLead.findMany({
      where: {
        empresaId: null,
        fonte: { in: [...FONTES_DE_PROSPECCAO] },
      },
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: tamanho,
      select: { id: true },
    });

    if (pagina.length === 0) break;

    for (const { id } of pagina) {
      conta.examinados += 1;
      try {
        const r = await garantirEmpresaDoLead(db, {
          leadId: id,
          autoria: opcoes.autoria,
          agora: opcoes.agora,
        });
        if (r.ligou) {
          conta.ligados += 1;
          if (r.criouEmpresa) conta.empresasCriadas += 1;
        } else if (r.motivo === "jaEstavaLigado") conta.jaEstavamLigados += 1;
        else if (r.motivo === "semNomeDeRestaurante") conta.semNomeDeRestaurante += 1;
        else if (r.motivo === "naoEhContatoFrio") conta.naoEhContatoFrio += 1;
      } catch (erro) {
        // Uma linha ruim não derruba a varredura inteira — mas também não some:
        // ela sai na contagem com o id, que é o que permite investigar depois.
        conta.falharam.push({
          leadId: id,
          erro: erro instanceof Error ? erro.message : String(erro),
        });
      }
    }

    cursor = pagina[pagina.length - 1]!.id;
    if (pagina.length < tamanho) break;
  }

  return conta;
}

// ─────────────────────────────────────────────────────────────────────────────
// ⭐ A SEGUNDA METADE DO RETROFIT: O SELO ERRADO NA TELA
// ─────────────────────────────────────────────────────────────────────────────

export interface ContagemDaCorrecaoDeEtapa {
  examinados: number;
  corrigidos: number;
  /** Já se interessaram: são LEAD de verdade e ficam onde estão. */
  jaEramLead: number;
  recusados: Array<{ leadId: string; motivo: string }>;
}

/**
 * ⭐ TIRA O SELO "NOVO LEAD" DE CIMA DE QUEM NÓS FOMOS CAÇAR.
 *
 * ── POR QUE O RETROFIT DA EMPRESA NÃO BASTAVA ───────────────────────────────
 *
 * `materializarLead` criava o contato de prospecção em `NOVO`, e `NOVO` se lê
 * na tela como **"Novo lead"**. O conserto na origem (feito em `selecao.ts`)
 * vale para quem chegar daqui em diante; os que JÁ estão na base continuariam
 * com o selo errado para sempre. Conserto que só vale para o futuro deixa a
 * tela mentindo sobre o presente.
 *
 * ── ⚠️ QUEM ESTA ROTINA NÃO TOCA ────────────────────────────────────────────
 *
 * · quem não veio de lista fria — esse É lead, e sempre foi;
 * · quem já saiu de `NOVO` (abordado, respondeu, qualificado) — mover alguém
 *   que já andou no funil seria APAGAR histórico verdadeiro para consertar um
 *   rótulo, e o dano seria maior que o defeito;
 * · quem já foi promovido por interesse (`virouLeadEm`) — esse virou lead pela
 *   porta certa e rebaixá-lo desfaria a promoção na frente do vendedor.
 *
 * Move por `moverNaSala`, e não por escrita direta de `stage`: a transição fica
 * na linha do tempo do contato, com autor `sistema`, e quem abrir a ficha vê o
 * que aconteceu em vez de uma etapa que mudou sozinha.
 *
 * ⛔ Não manda mensagem. Nenhuma.
 */
export async function corrigirEtapaDosContatosFrios(
  db: PrismaClient,
  opcoes: { agora?: Date; tamanhoDaPagina?: number } = {},
): Promise<ContagemDaCorrecaoDeEtapa> {
  const tamanho = opcoes.tamanhoDaPagina ?? 200;
  const conta: ContagemDaCorrecaoDeEtapa = {
    examinados: 0,
    corrigidos: 0,
    jaEramLead: 0,
    recusados: [],
  };

  for (;;) {
    // Sem cursor: cada volta relê o filtro, e o próprio conserto tira a linha
    // do resultado. Uma linha recusada sairia de novo na página seguinte e o
    // laço não terminaria — por isso a saída é "nada mais para corrigir OU
    // todas as desta página foram recusadas".
    const pagina = await db.siteLead.findMany({
      where: {
        stage: "NOVO",
        fonte: { in: [...FONTES_DE_PROSPECCAO] },
      },
      orderBy: { id: "asc" },
      take: tamanho,
      select: { id: true, virouLeadEm: true },
    });

    if (pagina.length === 0) break;

    let andou = false;
    for (const lead of pagina) {
      conta.examinados += 1;
      if (lead.virouLeadEm) {
        conta.jaEramLead += 1;
        continue;
      }

      const r = await moverNaSala(db, {
        leadId: lead.id,
        para: "DISPONIVEL_PARA_PROSPECCAO",
        actor: "sistema",
        nota: "correção: contato de lista fria estava marcado como 'Novo lead'. Nós fomos atrás dele; ele não pediu contato.",
        agora: opcoes.agora,
      });

      if (r.ok) {
        conta.corrigidos += 1;
        andou = true;
      } else {
        conta.recusados.push({
          leadId: lead.id,
          motivo: "recusas" in r ? r.recusas.map((x) => x.motivo).join("; ") : r.causa,
        });
      }
    }

    if (!andou) break;
  }

  return conta;
}
