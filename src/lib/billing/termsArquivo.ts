/**
 * O ARQUIVO DAS VERSÕES DO TERMO — o que dá sentido ao rótulo guardado no aceite.
 *
 * ── O achado que criou este arquivo (29/08/2026) ────────────────────────────
 *
 * Cada aceite grava em `PlanSubscription` quatro colunas: `termsVersion`,
 * `termsAcceptedAt`, `termsAcceptedIp` e `termsAcceptedBy`. Repare no que NÃO
 * está lá: **o texto**. O banco guarda o RÓTULO da versão, nunca o contrato que
 * a pessoa leu. Enquanto existiu uma versão só, ninguém sentiu — o rótulo e o
 * texto eram a mesma coisa. Na hora em que o texto muda (hoje), o rótulo "v1"
 * vira um ponteiro para lugar nenhum: `TERMS_SECTIONS` passa a devolver a v2, e
 * a prova de todo aceite anterior aponta para um texto que aquela pessoa nunca
 * leu. Numa disputa, é a nossa prova que se desfaz — não a dela.
 *
 * Este arquivo é a correção mínima e imediata: o texto de cada versão aposentada
 * fica GUARDADO, palavra por palavra, resolvível pelo rótulo que está no banco.
 *
 * ⚠️ O QUE ISTO **NÃO** RESOLVE, dito na cara: guardar a versão em código é
 * reproduzir o texto, não provar que foi aquele texto que a tela mostrou naquele
 * dia. A prova forte é a coluna que não existe — o texto (ou o hash dele) gravado
 * NO PRÓPRIO ACEITE, no momento do aceite. Isso é mudança de schema e decisão do
 * CEO; está declarada como pendência, não esquecida.
 *
 * ⛔ REGRA DE OURO DESTE ARQUIVO: texto arquivado NÃO SE EDITA. Nem para
 * corrigir vírgula, nem para "melhorar". Ele não é o contrato vigente — é o
 * retrato do que alguém aceitou. Corrigir aqui é falsificar prova. Contrato novo
 * se escreve em `terms.ts`, com versão nova.
 */

import { TERMS_SECTIONS, TERMS_VERSION } from "./terms";

export interface VersaoDoTermo {
  versao: string;
  /** Quando o CEO aprovou aquele texto. */
  aprovadaEm: string;
  /** Por que ela saiu de cena — vazio na versão vigente. */
  aposentadaPor?: string;
  secoes: readonly { title: string; body: string }[];
}

/**
 * As versões APOSENTADAS, congeladas. A vigente não entra aqui: ela é
 * `TERMS_SECTIONS`, e duplicá-la seria criar duas versões do mesmo texto — o
 * defeito que este arquivo existe para impedir.
 */
export const TERMOS_ARQUIVADOS: readonly VersaoDoTermo[] = [
  {
    versao: "v1-2026-08-03",
    aprovadaEm: "2026-08-03",
    aposentadaPor:
      "v2-2026-08-29 — a seção 4 passou a dizer a regra inteira de cancelamento e " +
      "devolução (decisão do CEO de 29/08/2026). Na v1 ela não falava de dinheiro.",
    secoes: [
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
        body: "Renovação automática por ciclo. O Restaurante pode cancelar a qualquer momento, com efeito ao fim do ciclo pago — sem multa e sem fidelidade. Por 30 dias após o término, os dados (cardápio, clientes, pedidos) podem ser exportados em formato estruturado; após 60 dias são excluídos, salvo obrigação legal.",
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
    ],
  },
  {
    versao: "v2-2026-08-29",
    aprovadaEm: "2026-08-29",
    aposentadaPor:
      "v3-2026-08-29 — no mesmo dia, o CEO fechou como se recalculam os meses já " +
      "usados: pelo valor que aquele cliente efetivamente pagou, e não pelo preço de " +
      "tabela. Promoção concedida deixou de ser recuperável na saída.",
    // Só a seção 4 difere da v1; as outras oito estão repetidas de propósito. Uma
    // versão arquivada é um RETRATO, e retrato não se monta por referência: se a
    // seção 1 da v2 apontasse para a da v1, bastaria alguém editar a v1 para
    // mudar o que um cliente da v2 aceitou.
    secoes: [
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
    ],
  },
];

/**
 * O texto que uma pessoa aceitou, a partir do rótulo gravado no aceite.
 *
 * Devolve `null` para rótulo desconhecido — e null aqui é informação, não erro
 * a engolir: significa que existe aceite apontando para um texto que a casa não
 * sabe reproduzir. Quem chamar precisa mostrar isso, não esconder.
 */
export function secoesDaVersao(
  versao: string | null | undefined,
): readonly { title: string; body: string }[] | null {
  if (!versao) return null;
  if (versao === TERMS_VERSION) return TERMS_SECTIONS;
  return TERMOS_ARQUIVADOS.find((v) => v.versao === versao)?.secoes ?? null;
}

/** Toda versão que já foi carimbada em algum aceite — a vigente e as arquivadas. */
export function versoesConhecidas(): string[] {
  return [TERMS_VERSION, ...TERMOS_ARQUIVADOS.map((v) => v.versao)];
}
