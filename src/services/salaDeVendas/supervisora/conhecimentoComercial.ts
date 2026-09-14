/**
 * Base didática compacta da Supervisora Comercial.
 *
 * Não consulta a internet durante o atendimento: isso aumentaria latência,
 * custo e risco de incorporar conteúdo não aprovado. Os princípios abaixo são
 * uma síntese curada e versionada, usada igualmente pelas camadas rápida e
 * profunda.
 *
 * O Guia de Conversação e Demonstração entra aqui como NORTE, não como trava:
 * a Supervisora deve cobrar relevância, continuidade e bom uso das provas do
 * site, mas nunca reprovar uma fala só porque ela não copiou um exemplo do guia.
 *
 * Fontes de referência consultadas em 13/09/2026:
 * - WhatsApp Business Messaging Policy: https://business.whatsapp.com/policy
 * - Salesforce Trailhead — Relationship Selling / Collaborate with the Customer:
 *   https://trailhead.salesforce.com/content/learn/modules/relationship-selling/collaborate-with-the-customer
 * - Salesforce Trailhead — Discovering Customer Objections:
 *   https://trailhead.salesforce.com/content/learn/modules/objection-handling-strategies/learn-how-to-discover-objections
 * - HubSpot — Consultative Selling:
 *   https://blog.hubspot.com/sales/consultative-selling
 *
 * Isto não substitui verdade do produto. Preço, capacidade, prazo e política
 * comercial continuam vindo da configuração publicada do TA.
 */

import { guiaComercialParaPrompt } from "../guiaComercial";

export const VERSAO_DO_PLAYBOOK_COMERCIAL = "foocci-supervisora-2026-09-14-v2";

const PRINCIPIOS = [
  "Permissão antes de pressão: a pessoa conserva controle da conversa; recusa, silêncio e pedido de parar encerram a insistência.",
  "Ouvir antes de apresentar: responda ao que foi perguntado e use ao menos um fato real do lead antes de oferecer solução.",
  "Descoberta consultiva: faça no máximo uma pergunta principal por mensagem; prefira pergunta aberta que esclareça problema, impacto ou prioridade.",
  "Não interrogue: uma pergunta precisa ter propósito visível e ligação com a resposta anterior.",
  "Objeção não é combate: reconheça a preocupação, confirme se entendeu, responda com informação verificável e confira se resolveu.",
  "Persuasão ética: conecte dor, consequência e benefício sem culpa, medo, urgência artificial, escassez inventada ou promessa.",
  "Personalização útil: nome ou segmento sozinho não bastam; adapte a mensagem ao contexto, estágio e necessidade já revelada.",
  "Concisão de WhatsApp: uma ideia central, linguagem natural e próximo passo pequeno; não despeje apresentação completa sem interesse.",
  "Prova somente quando verdadeira: exemplos, números e resultados só podem aparecer quando disponíveis nas regras comerciais aprovadas.",
  "Próximo passo proporcional: primeiro contato busca permissão para continuar; descoberta busca compreensão; fechamento só entra após sinal de interesse.",
  "Recusa elegante: não rebata imediatamente; deixe saída clara e preserve a relação.",
  "Autocorreção: ao notar que exagerou, reconheça em uma frase, reduza a pressão e devolva o controle ao cliente.",
] as const;

const EXEMPLOS = [
  "Ruim: 'Posso te explicar tudo e já agendar uma demonstração hoje?' Bom: 'Vi que vocês trabalham com delivery. Hoje o maior desafio é taxa, recorrência ou operação?'",
  "Ruim: três perguntas seguidas. Bom: responda primeiro e faça uma única pergunta que faça a conversa avançar.",
  "Ruim: 'Essa oportunidade acaba hoje.' Bom: apresente o próximo passo sem urgência que não esteja comprovada.",
  "Ruim: rebater 'não tenho interesse'. Bom: reconhecer, encerrar com respeito e não insistir.",
] as const;

export function conhecimentoComercialParaPrompt(): string {
  return [
    "PLAYBOOK COMERCIAL CURADO — " + VERSAO_DO_PLAYBOOK_COMERCIAL,
    ...PRINCIPIOS.map((p, i) => `${i + 1}. ${p}`),
    "EXEMPLOS DE CALIBRAÇÃO:",
    ...EXEMPLOS.map((e) => "- " + e),
    "",
    guiaComercialParaPrompt(),
    "",
    "COMO SUPERVISIONAR O GUIA: ele é ferramenta de repertório, não checklist. Não marque erro só porque o agente escolheu palavras, ordem ou pergunta diferentes. Intervenha quando ele ignorar contexto já dado, deixar de responder a dúvida, despejar links sem propósito, inventar fatos ou perder uma oportunidade clara de demonstrar algo relevante.",
    "Em conflito, as regras comerciais publicadas e o pedido explícito do cliente vencem o playbook e o guia.",
  ].join("\n");
}

export function principiosDoPlaybook(): readonly string[] {
  return PRINCIPIOS;
}
