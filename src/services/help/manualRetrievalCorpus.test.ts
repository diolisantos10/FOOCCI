/**
 * A TRAVA DO PISO DE ADMISSÃO, MEDIDA NO CORPUS REAL.
 *
 * Por que este arquivo existe: até 04/08/2026 a única prova de que o assistente
 * sabia dizer "não sei" era um teste que MOCKAVA o retrieval devolvendo []
 * (helpAssistant.test.ts). A condição mockada nunca acontecia na vida real — o
 * retrieval ordenava sem cortar e SEMPRE voltava com guia. O teste provava o
 * tratamento de um caso que o sistema não produzia: carimbo, não portão.
 *
 * Aqui não há mock de retrieval. São os 36 guias REAIS (howToGuidesContent, os
 * mesmos que o seed publica em OperationalManualChapter) contra 31 perguntas de
 * lojista: 21 cobertas pelo manual, 9 sobre assunto que ele NÃO cobre e 1 que o
 * piso derrubou junto (registrada no fim do arquivo, não escondida). É este
 * arquivo que calibra MIN_KEYWORD_SCORE e MIN_TERM_IDF_COVERAGE: mexeu nos
 * números, é aqui que a conta é refeita.
 *
 * As duas metades estão presentes de propósito:
 *   • as 9 sem guia PRECISAM devolver vazio (senão o agente inventa tela);
 *   • as 21 com guia PRECISAM continuar trazendo o guia certo (senão o portão
 *     vira mordaça e o assistente para de servir para alguma coisa).
 */

import { describe, it, expect, vi } from "vitest";

// Nenhum I/O: o ranking é puro. Os mocks existem só porque o módulo importa o
// prisma/openai no topo para o degrau de embedding (que não é exercido aqui).
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/openai", () => ({ openai: {} }));

import { rankChapters, type ManualChapterInput } from "./manualRetrieval";
import { HOW_TO_GUIDES } from "@/services/manual/howToGuidesContent";

/** O corpus real, no mesmo formato em que o banco devolve. */
const CHAPTERS: ManualChapterInput[] = HOW_TO_GUIDES.map((g, i) => ({
  id: `ch${i}`,
  slug: g.slug,
  title: g.title,
  area: g.area,
  description: g.description,
  content: g.content,
}));

const ask = (q: string) => rankChapters(q, CHAPTERS, 4).map((c) => c.slug);

/**
 * 21 perguntas que o manual COBRE. `accept` = slugs que respondem de verdade;
 * pelo menos um precisa aparecer entre os recuperados.
 */
const COBERTAS: Array<{ q: string; accept: string[] }> = [
  { q: "como cadastro um produto novo no cardápio", accept: ["guia-cadastrar-produto"] },
  { q: "como eu conecto meu whatsapp no foocci", accept: ["guia-conectar-whatsapp"] },
  { q: "quero usar o whatsapp oficial da meta, como faço", accept: ["guia-whatsapp-oficial-meta", "guia-whatsapp-evolution-vs-meta"] },
  { q: "como funciona a migração do meu número para a meta", accept: ["guia-migrar-numero-meta"] },
  { q: "qual a diferença entre o whatsapp atual e o oficial", accept: ["guia-whatsapp-evolution-vs-meta"] },
  { q: "preciso criar um modelo de mensagem aprovado", accept: ["guia-modelos-mensagem-whatsapp"] },
  { q: "qual o limite de envio de mensagens por dia", accept: ["guia-limites-envio-whatsapp"] },
  { q: "como acompanho os pedidos que chegam", accept: ["guia-acompanhar-pedidos"] },
  { q: "como ativo o pix como forma de pagamento", accept: ["guia-configurar-pagamentos"] },
  { q: "como crio uma campanha de crm para meus clientes", accept: ["guia-criar-campanha-crm"] },
  { q: "como configuro a taxa de entrega por bairro", accept: ["guia-area-entrega-taxas"] },
  { q: "como mudo o horário de funcionamento da loja", accept: ["guia-horario-funcionamento"] },
  { q: "preciso pausar os pedidos agora, tá lotado", accept: ["guia-pausar-pedidos"] },
  { q: "como troco a logo e as cores da minha marca", accept: ["guia-personalizar-marca"] },
  { q: "como funciona a central de conversas", accept: ["guia-central-conversas"] },
  { q: "onde vejo meu faturamento e ticket médio", accept: ["guia-analytics", "guia-painel-inicial"] },
  { q: "como gero o qr code do cardápio digital", accept: ["guia-cardapio-digital-qr"] },
  { q: "como adiciono um funcionário na equipe", accept: ["guia-equipe"] },
  { q: "a impressora não está imprimindo as comandas", accept: ["guia-impressoras"] },
  { q: "como calculo o cmv dos meus pratos", accept: ["guia-precificacao"] },
  { q: "como instalo o carteiro para imprimir comanda", accept: ["guia-impressoras"] },
];

/**
 * 9 perguntas sobre assunto que o manual NÃO cobre. Conferido termo a termo no
 * corpus: não há guia de nota fiscal, estorno, recuperação de senha, iFood,
 * boleto, assinatura/cobrança do Foocci, aplicativo nativo, backup ou comissão
 * de entregador. As três primeiras são exatamente os casos que a auditoria
 * mediu devolvendo guia errado com cara de verdade.
 */
const NAO_COBERTAS: string[] = [
  "como emito nota fiscal do pedido",          // devolvia o guia de acompanhar pedidos
  "cliente quer estorno do pix",               // devolvia o guia de campanha de CRM
  "esqueci a senha do painel",                 // devolvia o guia do painel inicial
  "vocês têm integração com o ifood",
  "posso emitir boleto para o cliente",
  "como cancelo minha assinatura do foocci",
  "tem aplicativo para iphone",
  "como faço backup dos meus dados",
  "como controlo a comissão dos entregadores",
];

describe("piso de admissão do manual — corpus real, sem mock de retrieval", () => {
  it("o corpus é o real e tem tamanho de corpus (não é fixture)", () => {
    expect(CHAPTERS.length).toBeGreaterThanOrEqual(30);
  });

  it("BARRA: as 9 perguntas sem guia devolvem VAZIO — todas as 9", () => {
    const vazaram = NAO_COBERTAS.filter((q) => ask(q).length > 0).map((q) => `${q} → ${ask(q).join(", ")}`);
    // O alerta carrega a própria evidência: se cair, a mensagem diz QUAL
    // pergunta vazou e QUAL guia entrou como verdade.
    expect(vazaram, `perguntas sem guia que ainda devolvem guia:\n${vazaram.join("\n")}`).toEqual([]);
  });

  it("DEIXA PASSAR: as perguntas cobertas continuam trazendo o guia certo", () => {
    const erraram = COBERTAS.filter((c) => !ask(c.q).some((s) => c.accept.includes(s))).map(
      (c) => `${c.q} → esperava ${c.accept.join("|")}, veio [${ask(c.q).join(", ") || "VAZIO"}]`,
    );
    expect(erraram, `perguntas cobertas que o piso quebrou:\n${erraram.join("\n")}`).toEqual([]);
  });

  it("o piso não é mordaça: a grande maioria das perguntas cobertas segue respondida", () => {
    const respondidas = COBERTAS.filter((c) => ask(c.q).length > 0).length;
    expect(respondidas / COBERTAS.length).toBeGreaterThanOrEqual(0.9);
  });

  it("nenhuma pergunta coberta traz mais de 4 guias (o limite é respeitado)", () => {
    for (const c of COBERTAS) expect(ask(c.q).length, c.q).toBeLessThanOrEqual(4);
  });
});

/**
 * CUSTO MEDIDO DO PISO, registrado em vez de escondido.
 *
 * Uma pergunta legítima passou a devolver vazio: "como ensino a IA a responder
 * uma pergunta nova". O guia existe (guia-ensinar-ia) e o retrieval não o
 * alcança porque a pergunta não compartilha vocabulário com ele ("ensino" ×
 * "ensinar", "responder" × "aprendizado"). ANTES do piso ela também não era
 * respondida direito: o topo era guia-central-conversas — o guia ERRADO,
 * entregue como verdade. Trocamos uma resposta errada por um "não sei", que é
 * pior em recall e melhor em confiança.
 *
 * O caminho para recuperá-la é stemming leve (medido: prefixo de 6 caracteres
 * recupera esta e "como acompanho os pedidos", mas passa a deixar entrar guia
 * errado em outras — por isso NÃO foi adotado). Se alguém melhorar o retrieval,
 * este teste cai: ótimo. Confira que veio guia-ensinar-ia e mova a pergunta
 * para COBERTAS.
 */
describe("custo medido: o que o piso derrubou junto", () => {
  it("'como ensino a IA...' virou 'não sei' — registrado, não escondido", () => {
    expect(ask("como ensino a IA a responder uma pergunta nova")).toEqual([]);
  });
});
