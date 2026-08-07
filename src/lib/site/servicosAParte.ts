/**
 * O QUE O FOOCCI COBRA FORA DA MENSALIDADE — e por que este arquivo existe.
 *
 * Até 06/08/2026 a página `/site/precos` publicava SEIS itens "cobrados à parte"
 * com preço: WhatsApp oficial R$ 149/mês, nota fiscal R$ 89/mês, pacote de 1.000
 * mensagens R$ 79, unidade adicional a 60% do plano, gestão pela agência sob
 * consulta e implantação por faixa. Eles entraram em 04/08 (commit `a81bd46b`)
 * citando um documento — "Planos Foocci v3" — que **não existe no repositório**.
 * O CEO, ao auditar a seção, disse não reconhecer nenhum daqueles serviços.
 *
 * Pior: **nenhum dos seis era cobrado pelo sistema.** `@/lib/billing/pricing`
 * conhece três planos e três ciclos — não existe add-on, taxa de setup, pacote de
 * mensagem nem unidade adicional. O checkout não sabia cobrar nada daquilo. Era
 * preço publicado sem motor e sem dono: promessa que ninguém podia cumprir.
 *
 * As seis decisões do CEO (06/08/2026):
 *
 *   · WhatsApp oficial da Meta — SAI. O custo entra na mensalidade de quem usa CRM.
 *   · Nota fiscal — SAI o preço. A integração está incluída; certificado e custo
 *     por documento são do lojista, direto com o emissor. Vira nota, não item.
 *   · Pacote de 1.000 mensagens — SAI. Não existe cota de mensagem em plano
 *     nenhum: o item vendia alívio para um problema que o produto não tem.
 *   · Unidade adicional — SAI. "Cada loja paga o valor que tem que pagar."
 *   · Gestão pela agência — FICA como estava. Hora humana, preço por conversa.
 *   · Implantação — vira **Configuração**, e o preço sai da quantidade de itens do
 *     cardápio e de precisar ou não importar a base de clientes. Sem número: o CEO
 *     não deu faixa, e as antigas nasceram do documento que não existe.
 *
 * ⚠️ A REGRA QUE ESTE ARQUIVO CARREGA: **preço publicado é promessa.** Enquanto
 * não houver valor decidido pelo CEO **e** motor que o cobre, o preço aqui é
 * "Sob consulta" — nunca um número que pareceu razoável. `precosSemValorSemLastro.test.ts`
 * reprova o retorno de qualquer um dos valores aposentados e de qualquer dígito
 * neste arquivo.
 */

/** O único preço que um serviço sem motor de cobrança pode anunciar. */
export const SOB_CONSULTA = "Sob consulta";

export type ServicoAParte = {
  name: string;
  /** Sempre `SOB_CONSULTA` enquanto o checkout não souber cobrar o serviço. */
  price: typeof SOB_CONSULTA;
  desc: string;
};

export const SERVICOS_A_PARTE: ServicoAParte[] = [
  {
    name: "Configuração",
    price: SOB_CONSULTA,
    /*
      A crítica do CEO ao nome antigo foi exata: "ninguém vai lá instalar nada, o
      cliente sobe o seu cadastro, tem um manual". Setup só se justifica quando
      ALGUÉM DO FOOCCI faz o trabalho — então a linha diz o que a pessoa recebe, o
      que determina o preço, e que fazer sozinho continua sendo de graça.
    */
    desc:
      "A gente sobe o seu cardápio e cadastra a sua base de clientes por você. " +
      "O preço depende de quantos itens tem o cardápio e de precisar ou não importar clientes. " +
      "Fazer você mesmo, pelo painel e pelo manual, não custa nada.",
  },
  {
    name: "Gestão pela agência",
    price: SOB_CONSULTA,
    // Mantido palavra por palavra: é o único item da lista antiga que o CEO
    // aprovou sem mudança — hora humana, preço por conversa.
    desc: "É serviço com hora humana.",
  },
];

/**
 * A nota fiscal NÃO é um serviço que o Foocci cobre — por isso ela não está na
 * lista acima. Ela aparece porque o lojista pergunta "quanto custa a nota?", e a
 * resposta honesta tem duas metades: a nossa é zero, a dele é com o emissor.
 */
export const NOTA_FISCAL_A_PARTE = {
  name: "Nota fiscal (NFC-e)",
  /** Quem cobra — não quanto custa. O quanto é do emissor, não nosso. */
  price: "Com o emissor",
  desc:
    "A integração já vem incluída e a gente não cobra nada por ela. " +
    "O certificado digital e o custo por documento você contrata direto com o emissor.",
} as const;
