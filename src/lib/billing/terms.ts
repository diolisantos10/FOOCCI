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
 */

export const TERMS_VERSION = "v1-2026-08-03";

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
];
