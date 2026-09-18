/**
 * ⭐⭐ A ROTA DE DECISÃO POR CONVERSA — a tabela do CEO, linha por linha.
 *
 * ── A TABELA, COMO ELE A ESCREVEU ───────────────────────────────────────────
 *
 *   cliente falou há menos de 24h ......... retoma na janela, sem template
 *   fora da janela de 24h ................. retoma com um dos 3 templates
 *   bot/menu respondeu .................... navega SÓ por opção explícita
 *   humano respondeu, cargo desconhecido .. pergunta se é o responsável
 *   não é o responsável ................... pede o contato certo
 *   indicou telefone ou cartão ............ cadastra o decisor e abre conversa nova
 *   decisor já identificado ............... vai para SDR/TA
 *   pediu para parar ...................... não aborda, nunca
 *   ambíguo ............................... não inventa — separa para revisão
 *
 * ── DUAS PERGUNTAS, NÃO UMA — e é isso que faz a tabela fechar ──────────────
 *
 * As duas primeiras linhas respondem **por onde** se fala (janela de 24h =
 * texto livre; fora dela = template aprovado). As outras respondem **o que** se
 * diz. Tratá-las como nove casos mutuamente exclusivos obrigaria a escolher
 * entre "está na janela" e "é um porteiro" — e as duas coisas são verdade ao
 * mesmo tempo o tempo todo. Por isso a decisão tem CANAL e AÇÃO.
 *
 * ── ⛔ FAIL-CLOSED ──────────────────────────────────────────────────────────
 *
 * Toda dúvida cai em `REVISAO`, que **não envia nada**. Nenhum caminho daqui
 * devolve "manda alguma coisa" por falta de sinal. Ausência de informação não é
 * informação.
 *
 * ── ⛔ E A MENTIRA PROIBIDA ─────────────────────────────────────────────────
 *
 * Fingir-se de cliente para furar o bot não é uma opção desta rota, e não é um
 * caso que falta implementar: a navegação de menu só usa a opção que o próprio
 * menu ofereceu para falar com GENTE (`sinais.opcaoParaFalarComGente`). Menu sem
 * caminho para humano vira REVISÃO.
 *
 * ⛔ Função PURA: sem banco, sem relógio próprio, sem envio. É por isso que ela
 * pode ser provada caso a caso.
 */

import type { SiteLeadStage, EstagioDaEmpresa } from "@prisma/client";
import { classificarInterlocutor } from "@/services/foocci-sdr/gatekeeper/classificacao";
import { extrairDecisorIndicado, type DecisorIndicado } from "@/services/foocci-sdr/gatekeeper/decisorIndicado";
import { objetivoDaProspeccao } from "@/services/foocci-sdr/gatekeeper/objetivo";
import { naoEhOResponsavel, opcaoParaFalarComGente, pediuParaParar } from "./sinais";
import { TEXTOS, textoDaOpcaoDoMenu } from "./textos";

/** A janela da Meta. Fora dela, só template aprovado — não é escolha nossa. */
export const JANELA_DE_24H_EM_MS = 24 * 60 * 60 * 1000;

/**
 * As etapas em que a conversa JÁ PASSOU da reabordagem.
 *
 * Quem chegou a demo, proposta, negociação ou venda não é reabordagem: é
 * continuação, e mandar um template de apresentação para essa pessoa seria a
 * casa se apresentando a quem já está negociando com ela.
 */
export const ETAPAS_DE_CONTINUACAO: readonly SiteLeadStage[] = [
  "DEMO_AGENDADA",
  "DEMO_REALIZADA",
  "PROPOSTA_ENVIADA",
  "EM_NEGOCIACAO",
  "GANHO",
];

export type AcaoDaReabordagem =
  /** Template aprovado: primeiro toque da campanha em quem nunca respondeu. */
  | "ABORDAGEM_INICIAL"
  /** Humano, cargo desconhecido: "é com você?" */
  | "PERGUNTA_SE_RESPONSAVEL"
  /** Declarou que não é ele, ou é porteiro humano: pede o contato certo. */
  | "PEDE_CONTATO_CERTO"
  /** Bot/menu: digita a opção que o MENU ofereceu para falar com gente. */
  | "NAVEGA_MENU"
  /** ⭐ O objetivo alcançado: indicou telefone/cartão. Cadastra e abre conversa nova. */
  | "CADASTRA_DECISOR"
  /** Decisor já identificado: sai da campanha e vai para o SDR/TA. */
  | "PARA_SDR"
  /** Pediu para parar. Nunca mais. */
  | "NAO_ABORDA"
  /** Já está em demo/proposta/negociação/ganho. Não é reabordagem. */
  | "FORA_DA_CAMPANHA"
  /** Ambíguo. Não se inventa: separa para uma pessoa olhar. */
  | "REVISAO";

export type CanalDaReabordagem = "JANELA" | "TEMPLATE" | "NENHUM";

/** Por qual REGRA a máquina decidiu. Enumerado: motivo em texto livre não vira conta. */
export type RegraAplicada =
  | "pediuParaPararNaFicha"
  | "pediuParaPararNoTexto"
  | "jaEstaEmContinuacao"
  | "decisorJaIdentificado"
  | "decisorIndicadoNaResposta"
  | "indicouDecisorSemTelefone"
  | "nuncaRespondeu"
  | "botComOpcaoParaGente"
  | "botSemOpcaoParaGente"
  | "porteiroHumano"
  | "declarouQueNaoEhResponsavel"
  | "humanoCargoDesconhecido"
  | "respostaSemSinalLegivel"
  | "semTelefone";

export interface FatosDaConversa {
  leadId: string;
  telefone: string | null;
  stage: SiteLeadStage;
  optOutAt: Date | null;
  /** Estágio da `Empresa` ligada, quando o religamento já a ligou. */
  estagioDaEmpresa: EstagioDaEmpresa | null;
  /** O contato ligado a este lead já está marcado como decisor? */
  contatoEhDecisor: boolean | null;
  /** Quando a PESSOA falou pela última vez. `null` = nunca respondeu. */
  ultimaEntradaEm: Date | null;
  /** O texto da última mensagem que a pessoa mandou. */
  textoDaUltimaEntrada: string | null;
}

export interface DecisaoDaReabordagem {
  leadId: string;
  acao: AcaoDaReabordagem;
  canal: CanalDaReabordagem;
  regra: RegraAplicada;
  /** O texto que vai sair, quando `canal === "JANELA"`. */
  texto: string | null;
  /** O decisor lido na resposta, quando `acao === "CADASTRA_DECISOR"`. */
  decisor: DecisorIndicado | null;
  /** O objetivo declarado desta conversa, quando a base já sabe dizer. */
  objetivo: "DESCOBRIR_DECISOR" | "GERAR_OPORTUNIDADE" | null;
  /** Uma frase para quem for ler a linha da execução sem abrir o código. */
  explicacao: string;
}

function decisao(
  f: FatosDaConversa,
  p: Omit<DecisaoDaReabordagem, "leadId" | "objetivo" | "decisor" | "texto"> &
    Partial<Pick<DecisaoDaReabordagem, "decisor" | "texto">>,
): DecisaoDaReabordagem {
  return {
    leadId: f.leadId,
    texto: p.texto ?? null,
    decisor: p.decisor ?? null,
    objetivo: objetivoDaProspeccao({
      estagioDaEmpresa: f.estagioDaEmpresa,
      contatoEhDecisor: f.contatoEhDecisor,
    }),
    acao: p.acao,
    canal: p.canal,
    regra: p.regra,
    explicacao: p.explicacao,
  };
}

/** Está dentro da janela de 24h da Meta? Só a fala da PESSOA abre a janela. */
export function dentroDaJanela(ultimaEntradaEm: Date | null, agora: Date): boolean {
  if (!ultimaEntradaEm) return false;
  return agora.getTime() - ultimaEntradaEm.getTime() < JANELA_DE_24H_EM_MS;
}

/**
 * A decisão, para UMA conversa. Pura.
 *
 * A ORDEM É REGRA, não estilo. O que protege a pessoa vem antes do que serve à
 * campanha, sempre — e quem já saiu da campanha é retirado antes de qualquer
 * leitura de texto.
 */
export function decidirReabordagem(f: FatosDaConversa, agora: Date): DecisaoDaReabordagem {
  // ── 1. O SILÊNCIO PEDIDO, antes de tudo ────────────────────────────────
  if (f.optOutAt) {
    return decisao(f, {
      acao: "NAO_ABORDA",
      canal: "NENHUM",
      regra: "pediuParaPararNaFicha",
      explicacao: "esta pessoa pediu para não receber mensagens. Nunca mais, em nenhum canal.",
    });
  }
  if (pediuParaParar(f.textoDaUltimaEntrada)) {
    return decisao(f, {
      acao: "NAO_ABORDA",
      canal: "NENHUM",
      regra: "pediuParaPararNoTexto",
      explicacao:
        "a última resposta pediu para parar, por escrito. A ficha ainda não foi carimbada — " +
        "e até que seja, a campanha trata como pedido de silêncio.",
    });
  }

  // ── 2. Quem já passou da reabordagem ───────────────────────────────────
  if (ETAPAS_DE_CONTINUACAO.includes(f.stage)) {
    return decisao(f, {
      acao: "FORA_DA_CAMPANHA",
      canal: "NENHUM",
      regra: "jaEstaEmContinuacao",
      explicacao:
        "já está em demo, proposta, negociação ou venda — isto não é reabordagem, é continuação, " +
        "e quem cuida é quem já está na conversa.",
    });
  }

  // ── 3. O decisor já identificado ───────────────────────────────────────
  if (
    f.contatoEhDecisor === true ||
    f.estagioDaEmpresa === "DECISOR_ENCONTRADO" ||
    f.estagioDaEmpresa === "QUALIFICADA"
  ) {
    return decisao(f, {
      acao: "PARA_SDR",
      canal: "NENHUM",
      regra: "decisorJaIdentificado",
      explicacao:
        "o decisor já foi capturado nesta conversa. A campanha não fala mais aqui — quem conduz é o SDR/TA.",
    });
  }

  // ── 4. Sem telefone não se fala com ninguém. Fail-closed. ──────────────
  if (!f.telefone || f.telefone.replace(/\D/g, "").length < 10) {
    return decisao(f, {
      acao: "REVISAO",
      canal: "NENHUM",
      regra: "semTelefone",
      explicacao: "telefone ausente ou ilegível — não há para onde mandar, e não se adivinha número.",
    });
  }

  const naJanela = dentroDaJanela(f.ultimaEntradaEm, agora);

  // ── 5. Nunca respondeu: o primeiro toque da campanha nova ──────────────
  if (!f.ultimaEntradaEm) {
    return decisao(f, {
      acao: "ABORDAGEM_INICIAL",
      canal: "TEMPLATE",
      regra: "nuncaRespondeu",
      explicacao:
        "recebeu a mensagem antiga e nunca respondeu. Fora da janela de 24h — sai por um dos três " +
        "templates simples aprovados pela Meta, e não pelo panfleto de antes.",
    });
  }

  const texto = f.textoDaUltimaEntrada ?? "";

  // ── 6. ⭐ O OBJETIVO ALCANÇADO: indicaram quem decide ───────────────────
  //
  // Vem antes da classificação do interlocutor de propósito: um bot NÃO indica
  // decisor, mas uma recepcionista que responde "fala com a Juliana, 11 9xxxx"
  // dispara as DUAS leituras — e a que interessa é esta.
  const indicado = extrairDecisorIndicado(texto);

  // Indicou a PESSOA mas não o número ("fala com a Juliana"). É um fato bom e
  // não é o objetivo: sem canal, ninguém consegue andar esse caminho hoje. A
  // resposta certa é pedir o telefone — nunca inventar um.
  if (indicado && !indicado.telefone) {
    return decisao(f, {
      acao: "PEDE_CONTATO_CERTO",
      canal: naJanela ? "JANELA" : "TEMPLATE",
      regra: "indicouDecisorSemTelefone",
      decisor: indicado,
      texto: naJanela ? TEXTOS.pedeContatoCerto : null,
      explicacao:
        "indicaram quem decide, mas sem telefone. Um nome sem canal é um caminho que ninguém anda: pede-se o número.",
    });
  }

  if (indicado && indicado.telefone) {
    return decisao(f, {
      acao: "CADASTRA_DECISOR",
      canal: naJanela ? "JANELA" : "NENHUM",
      regra: "decisorIndicadoNaResposta",
      decisor: indicado,
      // Dentro da janela dá para agradecer; fora dela, NÃO se gasta um template
      // com uma despedida. O que importa é o contato novo, e ele já foi aberto.
      texto: naJanela ? TEXTOS.agradeceIndicacao : null,
      explicacao:
        "o atendimento indicou o contato de quem decide, com canal. É isto que a campanha veio buscar: " +
        "o decisor é cadastrado e a conversa continua num contato NOVO.",
    });
  }

  const classificacao = classificarInterlocutor(texto);

  // ── 7. O porteiro que é MÁQUINA ────────────────────────────────────────
  const ehBot =
    classificacao.papel === "GATEKEEPER" &&
    (classificacao.tipoDeGatekeeper === "BOT_DE_PEDIDOS" ||
      classificacao.tipoDeGatekeeper === "CENTRAL_TELEFONICA" ||
      classificacao.tipoDeGatekeeper === "FORMULARIO" ||
      classificacao.tipoDeGatekeeper === "OUTRO");

  if (ehBot) {
    const opcao = opcaoParaFalarComGente(texto);

    // ⛔ Sem opção explícita para gente, ninguém digita nada. A saída fácil
    // (fingir-se de cliente para o menu abrir) é proibida, e continua sendo.
    if (!opcao) {
      return decisao(f, {
        acao: "REVISAO",
        canal: "NENHUM",
        regra: "botSemOpcaoParaGente",
        explicacao:
          "respondeu um robô, e o menu não ofereceu nenhum caminho explícito para atendente, " +
          "comercial ou humano. A casa NÃO se passa por cliente para atravessar o robô: separa para uma pessoa olhar.",
      });
    }

    // Fora da janela, um "3" solto não navega menu nenhum: a janela está
    // fechada e o robô nem receberia. Volta para o template.
    if (!naJanela) {
      return decisao(f, {
        acao: "ABORDAGEM_INICIAL",
        canal: "TEMPLATE",
        regra: "nuncaRespondeu",
        explicacao:
          "o menu oferece caminho para atendente, mas a janela de 24h fechou — mandar a opção agora " +
          "não navega nada. Reabre por template e a navegação acontece na resposta.",
      });
    }

    return decisao(f, {
      acao: "NAVEGA_MENU",
      canal: "JANELA",
      regra: "botComOpcaoParaGente",
      texto: textoDaOpcaoDoMenu(opcao),
      explicacao: `o próprio menu ofereceu "${opcao}" para falar com gente. É por essa opção, e só por ela, que a casa navega.`,
    });
  }

  // ── 8. Porteiro HUMANO, ou quem declarou que não é ele ─────────────────
  const porteiroHumano = classificacao.papel === "GATEKEEPER";
  const declarouQueNao = naoEhOResponsavel(texto);

  if (porteiroHumano || declarouQueNao) {
    return decisao(f, {
      acao: "PEDE_CONTATO_CERTO",
      canal: naJanela ? "JANELA" : "TEMPLATE",
      regra: declarouQueNao ? "declarouQueNaoEhResponsavel" : "porteiroHumano",
      texto: naJanela
        ? declarouQueNao
          ? TEXTOS.pedeContatoCerto
          : TEXTOS.pedeContatoAoPorteiro
        : null,
      explicacao: declarouQueNao
        ? "a pessoa disse que não é ela quem responde. Não se insiste: pede-se o caminho certo."
        : "quem atende é o balcão/recepção. Não decide, e é o caminho até quem decide.",
    });
  }

  // ── 9. O decisor que se declarou ───────────────────────────────────────
  if (classificacao.papel === "DECISOR") {
    return decisao(f, {
      acao: "PARA_SDR",
      canal: "NENHUM",
      regra: "decisorJaIdentificado",
      explicacao:
        "a pessoa se declarou dono/gerente na própria resposta. A campanha entrega a conversa ao SDR/TA.",
    });
  }

  // ── 10. Humano, cargo desconhecido ─────────────────────────────────────
  //
  // Só chega aqui quem escreveu algo legível e não disparou nenhuma regra
  // acima. Texto curto demais para ser fala ("ok", "👍") não é sinal de gente:
  // é ruído, e ruído vai para revisão.
  const legivel = texto.replace(/\s+/g, " ").trim();
  if (legivel.length < 3) {
    return decisao(f, {
      acao: "REVISAO",
      canal: "NENHUM",
      regra: "respostaSemSinalLegivel",
      explicacao:
        "a última resposta não tem texto suficiente para dizer quem respondeu. Não se carimba ninguém no escuro.",
    });
  }

  return decisao(f, {
    acao: "PERGUNTA_SE_RESPONSAVEL",
    canal: naJanela ? "JANELA" : "TEMPLATE",
    regra: "humanoCargoDesconhecido",
    texto: naJanela ? TEXTOS.perguntaSeResponsavel : null,
    explicacao:
      "respondeu gente, e não dá para saber o cargo. A pergunta é uma só: é com você que se fala do comercial?",
  });
}

/** As ações que resultam em alguma mensagem saindo. O resto não fala. */
export const ACOES_QUE_FALAM: readonly AcaoDaReabordagem[] = [
  "ABORDAGEM_INICIAL",
  "PERGUNTA_SE_RESPONSAVEL",
  "PEDE_CONTATO_CERTO",
  "NAVEGA_MENU",
];
