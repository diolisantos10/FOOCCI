/**
 * The subscription contract shown on the public acceptance page (/contratar).
 *
 * SINGLE SOURCE: the canonical text lives in docs/juridico/termo-de-contratacao-foocci.md
 * (the CEO-reviewed minuta). This file carries the rendered version + the VERSION
 * STRING that gets stamped on every acceptance — bump the version whenever the text
 * changes, or old acceptances become claims about a text nobody can reproduce.
 *
 * v1 (03/08/2026): the CEO CONFIRMED the open decisions — reajuste = IPCA,
 * inadimplência = 15 dias (painel) / 30 dias (total), degustação = 50% no 1º mês.
 * The uptime SLA was DELIBERATELY LEFT OUT of the customer contract on the
 * Diretor Geral's recommendation: a hard % (e.g. "99%") for an operation that
 * depends on Meta/gateway/Railway is a breach trap; 99% stays an INTERNAL
 * operational target, not a contractual promise. This version string is stamped
 * on every acceptance — bump it whenever the text changes.
 *
 * ── v2 (29/08/2026) — A REGRA DA SAÍDA, DECIDIDA PELO CEO ───────────────────
 *
 * O que mudou, e só isto: a seção "4. Vigência, cancelamento e dados" passou a
 * dizer a regra INTEIRA de cancelamento e devolução. Até aqui ela não falava de
 * dinheiro nenhum (zero ocorrências de "reembols"), enquanto o site prometia
 * "cancela avisando 30 dias antes" e o contrato em `docs/juridico` prometia que
 * "valores de ciclos já pagos não são reembolsados". Três bocas, três regras — e
 * a que o cliente aceita era justamente a muda.
 *
 * A regra que passou a valer (palavra do CEO, 29/08/2026) mora em
 * `@/lib/billing/saidaDoPlano`, com a conta em centavos inteiros: cancela a
 * qualquer momento sem multa; o mês em curso segue até o fim, sem devolução;
 * abaixo de 6 meses devolve-se o proporcional não entregue; de 6 meses para
 * cima o período usado é recalculado pelo preço mensal e a diferença volta,
 * nunca negativa e nunca recuperando mais que o desconto concedido; e os 7 dias
 * de arrependimento de quem contratou pelo site devolvem tudo, acima de tudo.
 *
 * ⚠️ POR QUE A VERSÃO SUBIU JUNTO COM O TEXTO. Cada aceite guarda esta string
 * (`PlanSubscription.termsVersion`). Mudar o texto sem trocar o rótulo faria
 * TODO aceite anterior apontar para um texto que aquela pessoa nunca leu —
 * destruir a prova é pior que a divergência que se estava consertando. O texto
 * da v1 continua reproduzível em `@/lib/billing/termsArquivo`.
 */

export const TERMS_VERSION = "v2-2026-08-29";

/**
 * ── AS CLÁUSULAS QUE PRECISAM APARECER EM DESTAQUE, SEM CLIQUE ──────────────
 *
 * O CDC, art. 54 §4º: *"As cláusulas que implicarem limitação de direito do
 * consumidor deverão ser redigidas com destaque, permitindo sua imediata e fácil
 * compreensão."*
 *
 * Até 29/08/2026 as duas cláusulas que mais protegem a Foocci estavam
 * exatamente onde a lei não quer: no `/contratar/novo`, dentro de um bloco que
 * só abria depois de a pessoa clicar em "Ler o Termo" — um `<details>` fechado
 * com outro nome —, e no `/contratar/[token]`, no fim de uma caixa com rolagem
 * própria. Ninguém as escondeu de propósito; elas simplesmente foram parar no
 * lugar onde texto longo costuma ir. É assim que este defeito nasce sempre.
 *
 * ⚠️ ESTA LISTA GUARDA TÍTULOS, NÃO TEXTO. É o ponto inteiro: o destaque tem de
 * ser a cláusula, palavra por palavra, e não uma segunda redação dela. Duas
 * versões da mesma cláusula é como elas passam a dizer coisas diferentes — e a
 * que a tela mostra em destaque valeria contra nós. `clausulasEmDestaque()`
 * resolve os títulos contra `TERMS_SECTIONS` e devolve as seções de verdade.
 *
 * ⛔ MEXER AQUI NÃO É MEXER NO CONTRATO. Esta lista muda COMO a cláusula
 * aparece; o texto dela continua sendo `TERMS_SECTIONS`, e mudar texto exige
 * subir `TERMS_VERSION` — senão um aceite antigo vira afirmação sobre um texto
 * que ninguém consegue reproduzir.
 */
export const TITULOS_EM_DESTAQUE: readonly string[] = [
  // Cancelamento, efeito ao fim do mês em curso, a devolução do que não foi
  // entregue, os 7 dias de arrependimento e o apagamento dos dados em 60 dias.
  // Desde a v2 é também onde a regra do dinheiro aparece — e é por estar nesta
  // lista que ela é lida SEM CLIQUE, antes do aceite, nas duas telas.
  "4. Vigência, cancelamento e dados",
  // Limitação de responsabilidade ao total pago nos 12 meses e exclusão de
  // lucros cessantes — a cláusula que mais limita quem assina.
  "8. Propriedade intelectual e responsabilidade",
];

/**
 * As cláusulas em destaque, tiradas do próprio contrato.
 *
 * Devolve as seções de `TERMS_SECTIONS` na ordem em que aparecem no Termo — o
 * destaque não reordena a leitura. Um título que não casa some da lista em vez
 * de virar um bloco vazio na tela; é o teste que reprova nesse caso, e não a
 * página do cliente.
 */
export function clausulasEmDestaque(): { title: string; body: string }[] {
  return TERMS_SECTIONS.filter((s) => TITULOS_EM_DESTAQUE.includes(s.title));
}

export const TERMS_SECTIONS: { title: string; body: string }[] = [
  {
    title: "1. Partes e objeto",
    body: "Contratada: 59.120.811 DIEGO DE OLIVEIRA SANTOS (Foocci), CNPJ 59.120.811/0001-79, São Paulo/SP. Contratante: a pessoa jurídica identificada na contratação, representada por quem aceita eletronicamente este Termo. Objeto: licença de uso, não exclusiva e intransferível, da plataforma Foocci (SaaS) — cardápio digital, pedidos, pagamentos, atendimento por IA, CRM e operação, conforme o plano contratado. Não há venda ou transferência de software ou código-fonte.",
  },
  {
    title: "2. Planos, preço e reajuste",
    body: "Valem os valores da tabela vigente na contratação, travados durante o ciclo pago (mensal, trimestral ou anual). Reajuste anual pelo IPCA acumulado ou na renovação de ciclo, o que ocorrer depois. Mudanças de tabela valem para renovações, nunca retroativamente.",
  },
  {
    title: "3. Pagamento e inadimplência",
    body: "Cobrança recorrente na periodicidade do ciclo, com nota fiscal de serviço a cada cobrança confirmada. Em caso de falha: novas tentativas por até 7 dias; aviso no painel e por contato direto; persistindo por 15 dias, suspensão do acesso administrativo; por 30 dias, suspensão total. A loja e o atendimento ao cliente final do Restaurante são os últimos a serem afetados.",
  },
  {
    title: "4. Vigência, cancelamento e dados",
    body: "Renovação automática por ciclo. O Restaurante pode cancelar a qualquer momento, sem multa e sem fidelidade obrigatória. O cancelamento tem efeito ao fim do mês em curso, que já está pago e segue sendo prestado até lá — e por isso não é devolvido. Nos ciclos abaixo de 6 meses, os meses do ciclo que ainda não foram entregues são devolvidos de forma proporcional. Nos ciclos de 6 meses ou mais, o período já usado é recalculado pelo preço do plano mensal — o de quem não se comprometeu com prazo — e a diferença é devolvida ao Restaurante; o resultado nunca é negativo, no mínimo zero, e a recuperação nunca ultrapassa o desconto concedido pelo ciclo longo. Quem contratou pelo site tem 7 dias, contados da contratação, para desistir e receber tudo de volta — direito de arrependimento, que prevalece sobre este Termo. Por 30 dias após o término, os dados (cardápio, clientes, pedidos) podem ser exportados em formato estruturado; após 60 dias são excluídos, salvo obrigação legal.",
  },
  {
    title: "5. Dependências de terceiros",
    body: "Funcionalidades de WhatsApp e Instagram dependem das plataformas da Meta e de suas políticas e limites, que a Foocci não controla; pagamentos dependem do gateway. Indisponibilidades causadas por esses terceiros não constituem falha da Foocci, que se obriga a avisar com transparência e priorizar a restauração.",
  },
  {
    title: "6. Inteligência artificial",
    body: "O atendimento automatizado responde com base nas informações cadastradas pelo Restaurante; a exatidão do que a IA informa depende da exatidão do cadastro. A Foocci mantém verificações para impedir que o agente afirme o que a base não sustenta; informações sensíveis (alergênicos, restrições) devem ser mantidas corretas no cadastro pelo Restaurante.",
  },
  {
    title: "7. Dados pessoais (LGPD)",
    body: "Para os dados dos clientes finais do Restaurante, o Restaurante é controlador e a Foocci é operadora, tratando-os exclusivamente para prestar o serviço. A Foocci não vende dados nem os usa para publicidade própria. Incidentes relevantes são comunicados em até 72 horas.",
  },
  {
    title: "8. Propriedade intelectual e responsabilidade",
    body: "Plataforma, marca e modelos são da Foocci; cardápio, fotos, marca e dados do Restaurante são do Restaurante. A responsabilidade total da Foocci fica limitada ao total pago nos 12 meses anteriores ao evento, excluídos lucros cessantes e danos indiretos, salvo dolo ou culpa grave.",
  },
  {
    title: "9. Aceite e foro",
    body: "O aceite eletrônico (clique com registro de data, hora, IP e versão do Termo) vale como assinatura. Alterações serão avisadas com 30 dias, facultado o cancelamento sem ônus no período. Foro: comarca de São Paulo/SP.",
  },
];
