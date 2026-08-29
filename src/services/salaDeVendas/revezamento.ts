/**
 * O REVEZAMENTO — o agente sai quando a pessoa entra, e volta quando ela sai.
 *
 * ── O QUE FALTAVA, E ESTAVA ESCRITO COM ESSAS LETRAS ────────────────────────
 *
 * `timeDeAgentes.ts` diz, no próprio cabeçalho, que o revezamento **não está
 * construído**. O desenho do CEO em 26/08/2026 era este:
 *
 *   *"O nosso atendimento vai funcionar vinte e quatro horas. (…) Quando os
 *   cinco humanos forem pra casa dormir vão ficar os cinco agentes, vinte e
 *   quatro horas. Quando tiver humanos, os agentes saem."*
 *
 * A metade "quando tiver humanos, os agentes saem" já existia lead a lead —
 * `atender.ts` cala quando `atendidoPor` não é da IA. A metade que faltava é a
 * **volta**: hoje, um vendedor que assume e some deixa a conversa parada para
 * sempre, porque nada devolve o lead para o turno da noite.
 *
 * Este arquivo responde às duas perguntas num lugar só, e é PURO na parte que
 * decide: quem busca os dados é o chamador, quem decide é a função. É a mesma
 * divisão de `LeadContactSafety` — assim nenhum caminho de envio consegue
 * "esquecer" de consultar o portão sem que isso apareça no tipo.
 *
 * ── ⚠️ O QUE ESTE ARQUIVO **NÃO** É ─────────────────────────────────────────
 *
 * Não é um relógio. A devolução é avaliada dentro do turno, quando o lead
 * escreve de novo — não existe rotina que varra a base devolvendo conversas
 * abandonadas de madrugada. O caso que ela cobre é o que dói de verdade: a
 * pessoa escreve "oi, alguém aí?" depois de horas de silêncio do vendedor, e
 * hoje ninguém responde. Uma varredura por tempo é trabalho separado, e está
 * anotado como tal — afirmar aqui que ela existe seria vender piloto como
 * pronto.
 *
 * ── E NÃO REESCREVE REGRA DE NINGUÉM ────────────────────────────────────────
 *
 * "Só `IA` autoriza a IA a falar em nome da empresa" já mora em
 * `responsavel.ts` (`iaPodeEnviar`), e é de lá que vem — não é copiada.
 * A escolha de quem pega o lead devolvido é `escolherAgente`, de
 * `quemAtende.ts`. O registro da passagem é `registrarHandoff`, de
 * `handoff.ts`.
 *
 * ── ⚠️ O QUE FICA ANOTADO E **NÃO** RESOLVIDO ───────────────────────────────
 *
 *   · **Não existe varredura por tempo.** Já dito acima e repetido aqui porque
 *     é o buraco maior: um lead abandonado que nunca mais escreve fica com o
 *     vendedor sumido para sempre. Quem o cobra hoje é o painel, com gente
 *     olhando — não este arquivo.
 *   · **`leadPediuGente` é para sempre.** Um lead que pediu uma pessoa em
 *     março nunca mais é devolvido ao agente por silêncio, mesmo numa conversa
 *     de agosto que não tem nada a ver. É conservador de propósito — o erro
 *     nessa direção deixa gente atendendo gente —, mas é uma decisão, não um
 *     detalhe, e um dia pode precisar de prazo.
 *   · **`RISCO` não trava a devolução.** Um handoff aberto por risco jurídico
 *     volta ao agente como qualquer outro. O gatilho de risco redispara na
 *     mensagem seguinte e manda de novo para gente, então a coisa se corrige
 *     sozinha — mas por um turno o robô responde uma conversa que já foi
 *     marcada como delicada. Ampliar a exceção é decisão de produto, não minha.
 */

import type { LeadAtendidoPor, Prisma, PrismaClient } from "@prisma/client";
import { iaPodeEnviar } from "./responsavel";
import { escolherAgente, type AgenteEscolhido } from "./quemAtende";
import { registrarHandoff } from "./handoff";

type Cliente = PrismaClient | Prisma.TransactionClient;

// ── O prazo, e de onde ele vem ───────────────────────────────────────────────

/**
 * Quantas horas de silêncio de quem assumiu devolvem a conversa para a IA.
 *
 * ── POR QUE SEIS, E NÃO UM NÚMERO REDONDO QUALQUER ──────────────────────────
 *
 * O número não foi escolhido: ele é o que sobra entre dois limites que já
 * estão decididos nesta casa. Um por baixo e outro por cima.
 *
 * **Por baixo — a jornada.** A Sala atende das 9h às 20h, decisão do CEO em
 * 27/08/2026 (`REGRA.janela`, em `LeadContactSafety.ts`, e `horaInicio`/
 * `horaFim` no banco). São 11 horas. Dentro delas, um vendedor pode sumir por
 * motivo legítimo: almoço, reunião, uma visita externa, um dia de trânsito.
 * Nada disso chega perto de metade do expediente. Um prazo curto — duas, três
 * horas — devolveria ao robô conversas de gente que está trabalhando, e o
 * cliente receberia duas vozes da mesma empresa. É exatamente o defeito que o
 * revezamento existe para impedir; encurtar o prazo o traz de volta pela porta
 * dos fundos.
 *
 * Seis horas passam da metade da jornada. Quem assumiu às 9h e não encostou na
 * conversa até as 15h não está ocupado — está fora.
 *
 * **Por cima — a janela de 24h da Meta.** `registrarSaida` (em `conversa.ts`)
 * **recusa** texto livre depois de 24h da última mensagem do lead. Devolver
 * perto desse limite é devolver para um agente que só pode calar: ele
 * comporia, e a gravação falharia com `janelaFechada`. Seis horas deixam 18 da
 * janela — folga de sobra.
 *
 * E há um segundo teto, mais apertado, que decide entre 6 e 12: a janela do TA
 * fecha às 20h. Um lead que escreveu às 9h e caiu com um vendedor calado
 * voltaria, com prazo de 12h, às 21h — fora do horário do TA. O TA só falaria
 * às 9h do dia seguinte, quando a janela de 24h já expirou. **Doze horas
 * produzem uma devolução que não devolve nada.** Seis mantêm a volta no mesmo
 * dia útil.
 *
 * ⚠️ Este número é constante de código, e não coluna de banco, **por enquanto**.
 * Os limites operacionais do TA moram em `sdr_ia_config` e são do dono
 * (`horaInicio`, `maxSemResposta`, `scoreParaHumano`). Este merece o mesmo
 * caminho no dia em que o CEO quiser ajustá-lo — mas inventar a coluna agora
 * seria decidir por ele. O prazo entra por parâmetro em toda função pura daqui,
 * justamente para que a configuração possa passar a mandar sem tocar na regra.
 */
export const REVEZAMENTO = {
  silencioQueDevolveHoras: 6,
  /** Quem assina a devolução automática na trilha. Não é gente, e diz isso. */
  ator: "sistema-revezamento",
} as const;

const UMA_HORA_MS = 3_600_000;

// ── A máquina, pura ──────────────────────────────────────────────────────────

/** De quem é a vez de falar com o lead agora. */
export type DeQuemEAVez = "IA" | "HUMANO" | "NINGUEM";

/**
 * O estado do lead no instante da decisão.
 *
 * Tudo que a regra precisa saber entra aqui, e nada é buscado lá dentro. Datas
 * podem ser `null`, e `null` é **"não sei"** — nunca "faz muito tempo". A
 * diferença decide o caso mais perigoso do arquivo: um lead sem carimbo
 * nenhum seria devolvido na hora se a ausência virasse zero.
 */
export interface EstadoDoRevezamento {
  atendidoPor: LeadAtendidoPor;
  /** A pessoa que assumiu. `null` quando não há pessoa nomeada. */
  atendenteUserId: string | null;
  /** Desde quando o responsável atual responde. Assumir É uma ação humana. */
  atendenteDesde: Date | null;
  /** A última coisa que a PESSOA fez nesta conversa. `null` = não medido. */
  ultimaAcaoHumana: Date | null;
  /** O lead pediu uma pessoa, com essas palavras, em algum momento. */
  leadPediuGente: boolean;
  agora: Date;
}

export interface Vez {
  de: DeQuemEAVez;
  /** Por que, em uma frase, para a trilha e para a tela. */
  porque: string;
  /**
   * A vez é da IA porque quem assumiu sumiu pelo prazo.
   *
   * Quem chama precisa GRAVAR a volta antes de deixar a IA falar: enquanto o
   * banco disser `HUMANO`, a mensagem sairia assinada com o `atendenteUserId`
   * da pessoa que sumiu — fala de robô contada como produtividade de gente.
   */
  devolvidoPorInatividade: boolean;
}

export type SilencioHumano =
  /** Sem carimbo nenhum: não se sabe há quanto tempo a pessoa não age. */
  | { medido: false; motivo: "semCarimbo" }
  | { medido: true; horas: number };

/**
 * Há quantas horas a pessoa que assumiu não faz nada.
 *
 * O piso é `atendenteDesde`, e isso não é detalhe: **assumir é uma ação**.
 * Sem ele, um lead recém-assumido — em que ainda não houve mensagem nem nota —
 * cairia em `ultimaAcaoHumana: null` e seria lido como abandono, devolvendo ao
 * robô uma conversa que a pessoa acabou de pegar.
 *
 * Sem os dois, devolve `medido: false`. É a regra da casa e ela vale aqui mais
 * do que em qualquer outro lugar: ausência de informação não é informação, e um
 * `0` inventado no lugar de "não sei" faria a devolução disparar sempre.
 */
export function silencioDoHumano(estado: EstadoDoRevezamento): SilencioHumano {
  const marcos = [estado.ultimaAcaoHumana, estado.atendenteDesde].filter(
    (d): d is Date => d instanceof Date,
  );

  if (marcos.length === 0) return { medido: false, motivo: "semCarimbo" };

  const ultima = Math.max(...marcos.map((d) => d.getTime()));
  return { medido: true, horas: (estado.agora.getTime() - ultima) / UMA_HORA_MS };
}

/**
 * De quem é a vez de falar.
 *
 * `prazoHoras` entra por parâmetro para que o dia em que isto virar configuração
 * não exija mexer na regra — e para que o teste possa provar que o prazo é o
 * prazo, e não um número solto dentro de um `if`.
 */
export function quemFala(
  estado: EstadoDoRevezamento,
  prazoHoras: number = REVEZAMENTO.silencioQueDevolveHoras,
): Vez {
  // ── Uma pessoa está na conversa ─────────────────────────────────────────
  if (estado.atendidoPor === "HUMANO") {
    // ⚠️ QUEM PEDIU GENTE NÃO VOLTA PARA O ROBÔ POR SILÊNCIO DO VENDEDOR.
    //
    // É a única exceção, e é a mais importante do arquivo. A pessoa escreveu
    // "quero falar com alguém", foi atendida por alguém, e o vendedor calou.
    // Devolver ao agente aqui não é revezamento: é abandono com cara de
    // automação — a empresa responde de novo, com um robô, exatamente a quem
    // disse que não queria um. Quem cobra o vendedor é o painel, não o TA.
    if (estado.leadPediuGente) {
      return {
        de: "HUMANO",
        porque: "o lead pediu uma pessoa — silêncio do vendedor não devolve ao agente",
        devolvidoPorInatividade: false,
      };
    }

    const silencio = silencioDoHumano(estado);

    // Não sei há quanto tempo ela sumiu → ela continua na conversa. A dúvida
    // sempre pesa a favor de quem já está atendendo.
    if (!silencio.medido) {
      return {
        de: "HUMANO",
        porque: "sem carimbo de ação humana — não dá para medir silêncio, e não medido não devolve",
        devolvidoPorInatividade: false,
      };
    }

    if (silencio.horas >= prazoHoras) {
      return {
        de: "IA",
        porque: `quem assumiu está há ${silencio.horas.toFixed(1)}h sem agir (prazo de ${prazoHoras}h) — a conversa volta para o agente`,
        devolvidoPorInatividade: true,
      };
    }

    return {
      de: "HUMANO",
      porque: `quem assumiu agiu há ${silencio.horas.toFixed(1)}h — dentro do prazo de ${prazoHoras}h`,
      devolvidoPorInatividade: false,
    };
  }

  // ── A IA já pediu gente e ninguém pegou ─────────────────────────────────
  //
  // A vez é de uma pessoa que ainda não chegou, e a IA **não** retoma pelo
  // prazo: foi ela mesma quem largou, e voltar a falar desfaz o pedido dela na
  // frente do cliente. Quem cobra essa fila é `slaEsperaPorGenteMin`, com
  // alerta para gente — não com o robô se autoperdoando.
  if (estado.atendidoPor === "AGUARDANDO_HUMANO") {
    return {
      de: "HUMANO",
      porque: "a IA já pediu gente e ninguém pegou — ela não desfaz o próprio pedido",
      devolvidoPorInatividade: false,
    };
  }

  // A regra de que só `IA` autoriza a IA vem de `responsavel.ts`, inteira.
  if (iaPodeEnviar(estado.atendidoPor)) {
    return { de: "IA", porque: "o lead é da IA", devolvidoPorInatividade: false };
  }

  return {
    de: "NINGUEM",
    porque: "o lead ainda não tem dono",
    devolvidoPorInatividade: false,
  };
}

/**
 * A TRAVA: a IA pode entrar neste turno?
 *
 * **Falsa enquanto houver uma pessoa na conversa** — é a frase inteira do
 * pedido, e é o que este arquivo existe para garantir.
 *
 * ── ⚠️ POR QUE `NINGUEM` PASSA, E ISSO NÃO CONTRADIZ `iaPodeEnviar` ─────────
 *
 * `iaPodeEnviar` recusa `NINGUEM`, e está certo: **enviar** em nome da empresa
 * exige ser o responsável declarado. Esta pergunta é outra — é sobre **entrar
 * no turno**. Todo lead novo nasce `NINGUEM`, e quem atende toma o lead logo em
 * seguida (`iaAssumeSeEstaLivre`), de modo que quando a mensagem for gravada o
 * dono já é a IA. Recusar `NINGUEM` aqui deixaria o TA mudo para sempre — e
 * passaria em todo teste de bloqueio, que é o jeito mais silencioso de quebrar
 * um agente.
 */
export function aIaPodeFalar(
  estado: EstadoDoRevezamento,
  prazoHoras: number = REVEZAMENTO.silencioQueDevolveHoras,
): boolean {
  return quemFala(estado, prazoHoras).de !== "HUMANO";
}

// ── O lado que toca no banco ─────────────────────────────────────────────────

/** O pedaço do lead que o revezamento precisa. Quem chama já leu isto. */
export interface LeadNoRevezamento {
  id: string;
  atendidoPor: LeadAtendidoPor;
  atendenteUserId: string | null;
  atendenteDesde: Date | null;
}

/**
 * Junta o estado do lead com o que só o banco sabe.
 *
 * ⚠️ As consultas só acontecem quando há uma PESSOA na conversa. No caminho
 * comum — lead da IA ou sem dono — esta função não vai ao banco nenhuma vez: o
 * turno do TA roda a cada mensagem recebida, e três consultas a mais em todo
 * "oi" seriam preço cobrado do caso que não precisa delas.
 */
export async function lerEstadoDoRevezamento(
  db: Cliente,
  lead: LeadNoRevezamento,
  agora: Date,
): Promise<EstadoDoRevezamento> {
  const base: EstadoDoRevezamento = {
    atendidoPor: lead.atendidoPor,
    atendenteUserId: lead.atendenteUserId ?? null,
    atendenteDesde: lead.atendenteDesde ?? null,
    ultimaAcaoHumana: null,
    leadPediuGente: false,
    agora,
  };

  if (lead.atendidoPor !== "HUMANO") return base;

  const [ultimaFala, ultimaNota, pedido] = await Promise.all([
    // O que a pessoa DISSE ao lead.
    db.leadMensagem.findFirst({
      where: { leadId: lead.id, autor: "HUMANO" },
      orderBy: { ocorreuEm: "desc" },
      select: { ocorreuEm: true },
    }),
    // ⚠️ E o que ela FEZ sem falar: ligação, nota, mudança de etapa. Contar só
    // mensagem trataria como sumido o vendedor que passou a manhã ao telefone
    // com o lead e registrou a ligação — e o robô entraria por cima dele.
    // O filtro por `actor` é o que impede a ação de OUTRA pessoa (um gerente
    // redistribuindo, por exemplo) de contar como sinal de vida deste vendedor.
    lead.atendenteUserId
      ? db.siteLeadInteraction.findFirst({
          where: { leadId: lead.id, actor: lead.atendenteUserId },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        })
      : Promise.resolve(null),
    // ⚠️ A pergunta é "o lead pediu uma PESSOA", e o único lugar que guarda
    // isso é o motivo do handoff. `motivoDoPedido` no lead não serve: quem
    // assume o apaga (`assumirComoHumano`), então o rastro morre exatamente no
    // instante em que ele passaria a importar.
    //
    // Só `PEDIU_HUMANO` conta. Desconto e proposta também são pedidos do lead,
    // mas quem os mandou para gente foi a NOSSA regra, não a vontade dele —
    // devolver esses ao agente é revezamento normal.
    db.leadHandoff.findFirst({
      where: { leadId: lead.id, motivo: "PEDIU_HUMANO" },
      select: { id: true },
    }),
  ]);

  const marcos = [ultimaFala?.ocorreuEm, ultimaNota?.createdAt].filter(
    (d): d is Date => d instanceof Date,
  );

  return {
    ...base,
    ultimaAcaoHumana: marcos.length ? new Date(Math.max(...marcos.map((d) => d.getTime()))) : null,
    leadPediuGente: Boolean(pedido),
  };
}

export type ResultadoDaVolta =
  | { devolveu: true; agente: AgenteEscolhido | null }
  /** A regra não manda devolver este lead. Nada foi escrito. */
  | { devolveu: false; causa: "naoSeAplica" }
  /** O estado mudou entre a leitura e a escrita. Ninguém devolveu nada. */
  | { devolveu: false; causa: "outraMaoPegou" };

/**
 * A conversa VOLTA para a IA, e a volta fica registrada.
 *
 * ── POR QUE NÃO SE REUSA `devolverParaIA` ───────────────────────────────────
 *
 * A escrita é quase igual, e mesmo assim não dá para chamar aquela função: ela
 * grava a trilha com `actor: userId`, ou seja, **em nome da pessoa que
 * devolveu**. Aqui ninguém devolveu — a pessoa sumiu. Reusá-la faria a
 * auditoria ler "Fulano devolveu o lead com objetivo escrito" exatamente no
 * caso em que Fulano não fez nada, e transformaria um abandono em passagem de
 * bastão bem-feita. É a única diferença, e é a que importa.
 *
 * O que dá para reusar é reusado: `escolherAgente` escolhe quem pega, e
 * `registrarHandoff` grava a linha em `lead_handoffs` — sem ela, a razão entre
 * "quantas a IA largou" e "quantas voltaram" perderia o denominador que o
 * próprio `handoff.ts` diz que precisa ter.
 *
 * ── A ORDEM, QUE É A DA CASA ────────────────────────────────────────────────
 *
 * Troca o dono primeiro, com a condição DENTRO da escrita, e só então registra.
 * Uma falha ao registrar nunca desfaz uma troca que já valeu — lead com dono e
 * sem registro é recuperável; registro sem dono não é.
 */
export async function devolverPorInatividade(
  db: Cliente,
  params: {
    leadId: string;
    estado: EstadoDoRevezamento;
    prazoHoras?: number;
  },
): Promise<ResultadoDaVolta> {
  const prazoHoras = params.prazoHoras ?? REVEZAMENTO.silencioQueDevolveHoras;
  const vez = quemFala(params.estado, prazoHoras);

  // A decisão é a MESMA de `quemFala`, e vem dela. Repetir a conta aqui criaria
  // duas versões da regra, e elas divergiriam no primeiro ajuste do prazo.
  if (!vez.devolvidoPorInatividade) return { devolveu: false, causa: "naoSeAplica" };

  const agora = params.estado.agora;

  // Quem pega tem nome — a mesma exigência do atendimento normal. Devolver ao
  // rótulo "IA", sem agente, refaria o buraco que `quemAtende.ts` fechou.
  const agente = await escolherAgente(db);

  const alterados = await db.siteLead.updateMany({
    // A condição inclui `atendenteUserId`: entre a leitura e esta escrita, o
    // lead pode ter trocado de mão. Devolver por cima de um vendedor que
    // acabou de assumir é o roubo mais fácil de escrever por acidente.
    where: {
      id: params.leadId,
      atendidoPor: "HUMANO",
      atendenteUserId: params.estado.atendenteUserId,
    },
    data: {
      atendidoPor: "IA",
      atendenteUserId: agente?.userId ?? null,
      atendenteDesde: agora,
      motivoDoPedido: null,
    },
  });

  if (alterados.count !== 1) return { devolveu: false, causa: "outraMaoPegou" };

  const objetivo =
    `Devolução automática pelo revezamento: quem assumiu ficou ${prazoHoras}h ou mais sem agir. ` +
    `Retomar a conversa de onde ela parou e responder o que o lead perguntou.`;

  await db.siteLeadInteraction.create({
    data: {
      leadId: params.leadId,
      tipo: "DEVOLVEU_PARA_IA",
      // ⚠️ NÃO é o userId de quem sumiu. Quem devolveu foi a regra, e a trilha
      // tem de dizer isso — senão o abandono aparece como bom atendimento.
      actor: REVEZAMENTO.ator,
      interna: true,
      nota: objetivo,
    },
  });

  await registrarHandoff(db, {
    leadId: params.leadId,
    de: "HUMANO",
    para: "IA",
    motivo: "DEVOLUCAO_PARA_IA",
    dossie: { objetivo },
    deUserId: params.estado.atendenteUserId,
    paraUserId: agente?.userId ?? null,
    agora,
  });

  return { devolveu: true, agente };
}
