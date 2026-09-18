/**
 * ANTES E DEPOIS DO DECISOR — a mudança de objetivo, em código.
 *
 * O documento do CEO é explícito no item 5: *"quando o decisor aparece, muda
 * completamente a IA"*.
 *
 *   antes:  objetivo = descobrir quem decide;
 *   depois: objetivo = gerar oportunidade (contexto → hipótese de dor →
 *           abordagem → descoberta → qualificação).
 *
 * ── POR QUE ISTO NÃO É UMA TERCEIRA POSTURA DO OFÍCIO ───────────────────────
 * `oficio.posturaDoLead` responde outra pergunta: *sondar ou fechar*, e responde
 * pela temperatura de quem JÁ é interlocutor. Aqui a pergunta é anterior: *estou
 * falando com quem decide?*. Um lead morno falando com a recepcionista precisa
 * das duas respostas ao mesmo tempo, e uma escala de três degraus obrigaria a
 * escolher. Por isso é um bloco de conduta que entra POR CIMA da postura.
 *
 * ── E ISTO É AVISO, NÃO TRAVA ───────────────────────────────────────────────
 * Guardrail 4 da casa: o texto abaixo instrui o modelo. Quem impede continua
 * sendo `verificador.ts` para o conteúdo e `LeadContactSafety`/`freioDeRitmo`
 * para o envio. Nada aqui autoriza mandar mensagem nenhuma.
 */

import type { EstagioDaEmpresa } from "@prisma/client";

export type ObjetivoDaProspeccao = "DESCOBRIR_DECISOR" | "GERAR_OPORTUNIDADE";

/**
 * O objetivo desta conversa. `null` = **não é conversa de prospecção com estado
 * conhecido** (lead sem empresa, empresa que o Hunter ainda nem preparou) — e aí
 * nada muda, o TA segue como sempre seguiu. Ausência de informação não é
 * informação.
 */
export function objetivoDaProspeccao(p: {
  estagioDaEmpresa?: EstagioDaEmpresa | null;
  contatoEhDecisor?: boolean | null;
}): ObjetivoDaProspeccao | null {
  if (p.contatoEhDecisor === true) return "GERAR_OPORTUNIDADE";

  switch (p.estagioDaEmpresa) {
    case "DECISOR_ENCONTRADO":
    case "QUALIFICADA":
      return "GERAR_OPORTUNIDADE";
    case "PRONTA_PARA_SDR":
    case "GATEKEEPER":
      return "DESCOBRIR_DECISOR";
    default:
      return null;
  }
}

/**
 * A postura com o porteiro, escrita inteira porque a parte proibida é a que mais
 * tenta voltar.
 *
 * O documento recusa nominalmente a saída fácil: *"não faria: quero pedir um
 * sushi — só para enganar o bot"*. Fingir-se de cliente funcionaria, e é por isso
 * que precisa estar escrito que não se faz: furar o porteiro mentindo queima a
 * empresa no primeiro cliente que descobre, e o dano não é do número, é da marca.
 */
const CONDUTA_ANTES_DO_DECISOR = [
  "OBJETIVO DESTA CONVERSA: descobrir quem decide. Ainda não é hora de vender.",
  "Você está falando com quem atende, não com quem decide — e essa pessoa é o caminho até quem decide. Trate como tal.",
  "Diga com todas as letras quem você é e o que quer: falar com a pessoa responsável pela operação comercial.",
  "⛔ NUNCA se passe por cliente. Não peça cardápio, não faça pedido, não finja interesse em comprar para furar o atendimento.",
  "Não faça pitch aqui. Uma pergunta só: quem cuida disso, e por qual canal se fala com essa pessoa.",
  "Se a pessoa der um nome, agradeça e confirme o canal — é isso que você veio buscar.",
].join("\n- ");

const CONDUTA_DEPOIS_DO_DECISOR = [
  "OBJETIVO DESTA CONVERSA: gerar oportunidade. Você chegou em quem decide.",
  "Nesta ordem: contexto do restaurante → hipótese de dor → abordagem → descoberta → qualificação.",
  "Abra pelo contexto dela, não pelo produto: como ela vende hoje, canal próprio ou marketplace.",
  "A hipótese de dor é hipótese — ofereça e deixe ela corrigir. Não afirme a dor dela.",
  "Só depois da descoberta é que se qualifica. Pular para preço aqui queima a conversa.",
].join("\n- ");

/**
 * ⭐ QUEM ESTÁ FALANDO — a apresentação, e por que ela é a PRIMEIRA linha.
 *
 * Ordem do CEO, 17/09/2026, sobre abordagem fria com gente do outro lado: *"o
 * agente se apresenta — representante do Foocci, veio apresentar um negócio
 * novo — e só então trabalha."*
 *
 * ── POR QUE NÃO É SÓ UM COMENTÁRIO, E NÃO É SÓ DO PORTEIRO ─────────────────
 *
 * A conduta de antes do decisor já mandava dizer quem se é. Faltava o outro
 * lado: depois que o decisor aparece, o agente **também** está falando com
 * alguém que nunca ouviu falar da Foocci — este é um número FRIO, nós fomos
 * atrás dele. Um agente que abre pela hipótese de dor sem dizer quem é soa
 * exatamente como o golpe que ele não é, e a conversa morre na primeira linha.
 *
 * Por isso a apresentação entra nos DOIS blocos, e entra primeiro: é o que muda
 * numa conversa onde a pessoa não pediu para ser abordada.
 *
 * ⚠️ E ela não é licença para pitch. "Veio apresentar um negócio novo" é uma
 * frase de identificação; o que vem DEPOIS continua sendo o que cada objetivo
 * manda — no porteiro, uma pergunta só.
 */
const APRESENTACAO_NA_ABORDAGEM_FRIA = [
  "ESTE NÚMERO É FRIO: a pessoa não pediu contato, nós fomos atrás dela. A primeira coisa é se apresentar.",
  "Diga, na primeira fala e sem rodeio: você é representante do Foocci e veio apresentar um negócio novo para o restaurante.",
  "⛔ Nunca comece como se já existisse relação, pedido ou conversa anterior. Não existe.",
].join("\n- ");

/** O bloco pronto para entrar na conduta do turno. `""` quando não se aplica. */
export function blocoDoObjetivoDaProspeccao(objetivo: ObjetivoDaProspeccao | null): string {
  if (!objetivo) return "";
  const conduta =
    objetivo === "DESCOBRIR_DECISOR" ? CONDUTA_ANTES_DO_DECISOR : CONDUTA_DEPOIS_DO_DECISOR;
  return `- ${APRESENTACAO_NA_ABORDAGEM_FRIA}\n- ${conduta}`;
}
