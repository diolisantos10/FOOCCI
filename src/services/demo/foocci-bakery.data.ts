/**
 * Foocci Bakery — a padaria de demonstração (Frente 3 do lançamento).
 *
 * Este arquivo é o CARDÁPIO e a FICHA DA LOJA. Ele é só dado: quem escreve no
 * banco é `FoocciBakeryService` (chamado pelo botão do admin E pela linha de
 * comando `npm run bakery:seed` — um serviço só, dois chamadores).
 *
 * ─── O que é fictício aqui, declarado ─────────────────────────────────────────
 *  • O restaurante inteiro. Não existe padaria nenhuma; é vitrine do site de vendas.
 *  • Os CUSTOS (`cost`) são plausíveis, não reais — servem para a página de
 *    /precificacao ter o que mostrar numa demonstração. A lei do domínio ("markup
 *    em cima de custo inventado é pior que não ter CMV") vale para lojista de
 *    verdade; aqui não há lojista, e o tenant nasce marcado `isDemo`.
 *  • Os campos FISCAIS (NCM/CFOP/CSOSN) ficam VAZIOS de propósito. Nota fiscal não
 *    admite chute: um NCM errado numa vitrine vira NCM errado copiado por um
 *    cliente. Sem fonte, não se preenche.
 *  • O CNPJ fica vazio pelo mesmo motivo.
 *  • Telefone e e-mail usam faixas comprovadamente inúteis (o mesmo número dos
 *    seeds existentes e o domínio reservado da RFC 2606) para que nenhuma
 *    mensagem de demonstração alcance uma pessoa de verdade.
 *
 * ─── Preço ────────────────────────────────────────────────────────────────────
 * Um preço só por item (o `price` base), sem preço por canal. É de propósito: a
 * padaria cobra o mesmo no salão e no delivery, e canal com preço diferente é
 * exatamente onde já se errou cobrança nesta casa. Quando a vitrine precisar
 * demonstrar preço por canal, preenche-se `priceDineIn` conscientemente.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface BakeryVariant {
  name: string;
  /** Preço próprio da variante. Sempre explícito — variante sem preço herda o item. */
  price: number;
  portion?: string;
}

export interface BakeryExtra {
  name: string;
  price: number;
  portion?: string;
}

export interface BakeryOption {
  name: string;
  /** Acréscimo. Ausente = sem custo. */
  price?: number;
}

export interface BakeryOptionGroup {
  name: string;
  required?: boolean;
  minSelect?: number;
  maxSelect?: number;
  options: BakeryOption[];
}

export interface BakeryItem {
  name: string;
  description: string;
  /** Composição — o Garçom de IA usa para responder "tem glúten?", "leva o quê?". */
  ingredients?: string;
  /** Preço base. Com variantes, é o da variante mais barata (vira o "a partir de"). */
  price: number;
  /** Custo unitário FICTÍCIO — só para a demonstração de CMV/precificação. */
  cost?: number;
  portionInfo?: string;
  servingSize?: number;
  tagFunil?: string;
  perfilPaladar?: string;
  alergenosDetalhados?: string;
  storytellingIA?: string;
  harmonizacaoSugerida?: string;
  variants?: BakeryVariant[];
  extras?: BakeryExtra[];
  optionGroups?: BakeryOptionGroup[];
  showInDelivery?: boolean;
  showInDineIn?: boolean;
}

export interface BakeryCategory {
  name: string;
  description: string;
  /** Multiplicador de markup da categoria (prática do setor: pratos 2,5–3× · bebidas/doces 4–5×). */
  markupOverride?: number;
  /** Estações de impressão da comanda. Chaves estáveis: CAIXA, COZINHA_1…5, COPA, CUPOM. */
  printStationKeys?: string[];
  items: BakeryItem[];
}

export interface BakeryStore {
  slug: string;
  name: string;
  description: string;
  phone: string;
  email: string;
  address: string;
  ownerName: string;
  ownerEmail: string;
}

// ─── A loja ───────────────────────────────────────────────────────────────────

export const BAKERY_STORE: BakeryStore = {
  slug: "foocci-bakery",
  name: "Foocci Bakery",
  description:
    "Padaria e confeitaria de bairro: fornada de hora em hora, café coado na " +
    "hora e um balcão que muda ao longo do dia. Esta é a loja de demonstração " +
    "da Foocci — tudo aqui funciona de verdade, mas nenhum pedido é entregue.",
  // Mesmo número fake já usado nos seeds do repositório — nunca é de uma pessoa.
  phone: "+5511999990000",
  // example.com é domínio reservado (RFC 2606): garantidamente sem caixa de entrada.
  email: "contato@foocci-bakery.example.com",
  address: "Rua da Fornada, 100 — Vila Madalena, São Paulo, SP",
  ownerName: "Dona Ivete (demonstração)",
  ownerEmail: "owner@foocci-bakery.example.com",
};

/**
 * A cara da padaria — logo, capa e redes.
 *
 * **Logo e capa são vetores do próprio repositório** (`public/demo/`), não fotos
 * geradas por IA: a padaria é semeada sozinha no deploy, e identidade que só
 * existe depois de alguém rodar um comando pago é identidade que a vitrine sobe
 * sem ter. Custam zero e são iguais em todo ambiente.
 *
 * **As redes são FICTÍCIAS de propósito, e apontam para `example.com`** — o
 * domínio reservado pela RFC 2606, o mesmo critério já usado nos e-mails desta
 * loja. A alternativa (um `instagram.com/<handle>` inventado) é pior de duas
 * formas: se o handle não existir, o cliente da demonstração cai num 404 da
 * Meta; se existir, mandamos gente para a conta de um terceiro que nada tem a
 * ver com isto. Nenhum ícone do cardápio pode levar à conta de outra pessoa.
 * O WhatsApp não entra aqui: ele nasce do `phone` acima (também fictício).
 */
export const BAKERY_IDENTITY = {
  logoUrl: "/demo/foocci-bakery-logo.svg",
  coverImageUrl: "/demo/foocci-bakery-capa.svg",
  instagramUrl: "https://instagram.example.com/foocci.bakery",
  tiktokUrl: "https://tiktok.example.com/@foocci.bakery",
} as const;

/** Estações de impressão da padaria. Sem impressora atribuída — a vitrine não tem papel. */
/**
 * Categorias que o Garçom oferece no FECHAMENTO do pedido, nesta ordem.
 *
 * A padaria não tem "sobremesa" — tem **Confeitaria**. Enquanto a sequência era
 * constante no código ("bebida" → "sobremesa" por regex), a segunda etapa não
 * casava com nada aqui e o upsell simplesmente não acontecia: dinheiro deixado
 * na mesa em todo pedido, sem nenhum alerta.
 *
 * Os nomes precisam bater EXATAMENTE com os de `BAKERY_MENU` — o casamento é por
 * nome normalizado, nunca difuso. O teste do seed trava essa correspondência.
 */
export const BAKERY_UPSELL_CATEGORIES: readonly string[] = ["Café & Bebidas", "Confeitaria"];

export const BAKERY_PRINT_STATIONS = [
  { key: "CAIXA", name: "Caixa", position: 0 },
  { key: "COZINHA_1", name: "Forno / Produção", position: 1 },
  { key: "COPA", name: "Cafeteria", position: 2 },
] as const;

/**
 * A PADARIA DE VITRINE NUNCA FECHA — 24 horas, sete dias.
 *
 * Ordem do CEO em 07/08/2026, navegando pelo celular de madrugada: *"tira o aviso
 * de horário da nossa padaria de teste porque atrapalha a navegação de quem está
 * testando, incomoda um pouco na tela, deixa aberto vinte e quatro horas."*
 *
 * O horário anterior era crível (abria 06:00, fechava 20:00, domingo meio
 * período) e é justamente por isso que atrapalhava: fora do expediente, a loja
 * exibia a tarja de fechada e **bloqueava o checkout**. Quem abre a vitrine às
 * 23h para conhecer o produto batia na porta trancada de uma padaria que não
 * existe.
 *
 * ── POR QUE `00:00` NAS DUAS PONTAS, E NÃO `00:00`–`23:59` ──
 *
 * `isInPeriod` (lib/business-hours.ts:30) trata `close <= open` como período que
 * atravessa a meia-noite: `nowMin >= open || nowMin < close`. Com as duas pontas
 * em `00:00`, isso vira `nowMin >= 0 || nowMin < 0` — **verdadeiro em qualquer
 * minuto**, por construção.
 *
 * `23:59` pareceria equivalente e deixaria a loja fechada por 60 segundos por
 * dia. Um minuto de tarja amarela é raro o bastante para ninguém reproduzir e
 * frequente o bastante para acontecer numa demonstração.
 *
 * ⚠️ Isto vale **só para a vitrine**. Restaurante de verdade tem horário de
 * verdade, e o `docs/foocci-resumo-executivo.md` continua valendo: horário
 * fechado que impede pedido é recurso, não defeito.
 */
export const BAKERY_HOURS: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }> = [
  { dayOfWeek: 0, isOpen: true, openTime: "00:00", closeTime: "00:00" }, // domingo
  { dayOfWeek: 1, isOpen: true, openTime: "00:00", closeTime: "00:00" },
  { dayOfWeek: 2, isOpen: true, openTime: "00:00", closeTime: "00:00" },
  { dayOfWeek: 3, isOpen: true, openTime: "00:00", closeTime: "00:00" },
  { dayOfWeek: 4, isOpen: true, openTime: "00:00", closeTime: "00:00" },
  { dayOfWeek: 5, isOpen: true, openTime: "00:00", closeTime: "00:00" },
  { dayOfWeek: 6, isOpen: true, openTime: "00:00", closeTime: "00:00" },
];

// ─── O cardápio ───────────────────────────────────────────────────────────────

export const BAKERY_MENU: BakeryCategory[] = [
  {
    name: "Padaria",
    description: "Fornada saindo quente ao longo do dia inteiro. Farinha, água, sal, fermento e tempo.",
    markupOverride: 3.0,
    printStationKeys: ["COZINHA_1"],
    items: [
      {
        name: "Pão Francês",
        description:
          "O de sempre, feito como tem que ser: casca que estala quando você quebra e miolo branco e leve. " +
          "Fornadas às 6h, 10h, 15h e 18h — peça na hora e leve quente.",
        ingredients: "Farinha de trigo, água, sal, fermento biológico",
        price: 1.4,
        cost: 0.45,
        portionInfo: "50g a unidade",
        tagFunil: "Entrada",
        perfilPaladar: "salgado suave, crocante por fora, macio por dentro",
        alergenosDetalhados: "glúten",
        storytellingIA:
          "É o pão que dita o ritmo da casa: a padaria acorda às 4h da manhã por causa dele. " +
          "A massa descansa a noite inteira, e é esse descanso que dá a casca fina que estala.",
        harmonizacaoSugerida: "Café Coado da Casa",
        variants: [
          { name: "Unidade", price: 1.4, portion: "50g" },
          { name: "Meio quilo (aprox. 10 pães)", price: 13.9, portion: "500g" },
          { name: "1 quilo (aprox. 20 pães)", price: 25.9, portion: "1kg" },
        ],
      },
      {
        name: "Pão de Queijo Mineiro",
        description:
          "Polvilho azedo e queijo canastra curado, assado de meia em meia hora. " +
          "Casquinha firme, dentro puxa. Não fica pronto esperando — sai do forno para o balcão.",
        ingredients: "Polvilho azedo, queijo canastra, ovos, leite, óleo, sal",
        price: 6.9,
        cost: 2.3,
        portionInfo: "60g a unidade",
        tagFunil: "Entrada",
        perfilPaladar: "salgado, queijo curado, elástico",
        alergenosDetalhados: "lactose, ovo",
        storytellingIA:
          "O queijo vem de um produtor da Serra da Canastra e é ralado na casa toda manhã. " +
          "Queijo ralado de pacote muda o cheiro do pão de queijo — e a gente sente.",
        harmonizacaoSugerida: "Espresso",
        variants: [
          { name: "Unidade", price: 6.9, portion: "60g" },
          { name: "6 unidades", price: 36.9, portion: "360g" },
          { name: "1 kg congelado (leve para casa)", price: 64.9, portion: "1kg" },
        ],
      },
      {
        name: "Pão de Fermentação Natural",
        description:
          "36 horas de fermentação com levain próprio. Miolo alveolado, acidez leve e uma casca " +
          "escura que faz barulho. Guarda bem por três dias — se sobrar.",
        ingredients: "Farinha de trigo, farinha integral, água, sal marinho, levain",
        price: 19.9,
        cost: 5.6,
        portionInfo: "375g (meio) ou 750g (inteiro)",
        tagFunil: "Prato Principal",
        perfilPaladar: "acidez leve, tostado, casca crocante",
        alergenosDetalhados: "glúten",
        storytellingIA:
          "O levain da casa tem nome e sete anos de idade: chama Aurora. É alimentado todo dia, " +
          "inclusive no domingo. É ele que dá a acidez discreta — não é azedo, é vivo.",
        harmonizacaoSugerida: "Geleia Artesanal 240g",
        variants: [
          { name: "Meio pão (375g)", price: 19.9, portion: "375g" },
          { name: "Pão inteiro (750g)", price: 36.9, portion: "750g" },
        ],
        optionGroups: [
          {
            name: "Como você quer o pão?",
            required: true,
            minSelect: 1,
            maxSelect: 1,
            options: [{ name: "Inteiro" }, { name: "Fatiado na hora" }],
          },
        ],
      },
      {
        name: "Brioche Amanteigado",
        description:
          "Massa rica em manteiga francesa e gemas, trançada à mão. Dourado, macio e levemente doce — " +
          "ótimo para o café da manhã e melhor ainda tostado no dia seguinte.",
        ingredients: "Farinha de trigo, manteiga, gemas, leite, açúcar, fermento, sal",
        price: 22.9,
        cost: 7.4,
        portionInfo: "260g (4 bolinhas) ou 400g (trança)",
        tagFunil: "Prato Principal",
        perfilPaladar: "amanteigado, adocicado, macio",
        alergenosDetalhados: "glúten, lactose, ovo",
        storytellingIA:
          "Leva 28% de manteiga em relação à farinha — é a proporção que faz o brioche desfiar em vez de " +
          "esfarelar. Também é o motivo de ele não ser barato.",
        variants: [
          { name: "4 bolinhas", price: 22.9, portion: "4 un · 260g" },
          { name: "Trança 400g", price: 29.9, portion: "400g" },
        ],
      },
      {
        name: "Pão Integral de Grãos e Sementes",
        description:
          "Farinha integral moída na pedra com linhaça, girassol, gergelim e aveia. Denso, encorpado e " +
          "com sabor de castanha. Aguenta qualquer recheio sem se desmanchar.",
        ingredients: "Farinha integral, farinha de trigo, linhaça, girassol, gergelim, aveia, mel, sal, fermento",
        price: 24.9,
        cost: 8.1,
        portionInfo: "500g",
        tagFunil: "Prato Principal",
        perfilPaladar: "encorpado, sementes tostadas, levemente adocicado",
        alergenosDetalhados: "glúten, gergelim",
        storytellingIA:
          "As sementes são tostadas antes de entrar na massa. Parece detalhe, mas é a diferença entre " +
          "pão integral com sementes e pão integral com semente crua no meio.",
      },
      {
        name: "Baguete Rústica",
        description:
          "Casca fina e crocante, miolo aerado. Feita duas vezes por dia porque baguete de ontem não é baguete. " +
          "Peça a última fornada e leve ainda morna.",
        ingredients: "Farinha de trigo, água, sal, fermento",
        price: 14.9,
        cost: 4.2,
        portionInfo: "280g",
        tagFunil: "Prato Principal",
        perfilPaladar: "neutro, crocante, tostado",
        alergenosDetalhados: "glúten",
        harmonizacaoSugerida: "Sanduíche de Presunto Parma, Rúcula e Brie",
      },
      {
        name: "Croissant Folhado",
        description:
          "72 camadas de massa e manteiga, abertas e dobradas à mão em três dias de trabalho. " +
          "Escame na mesa — é assim que se sabe que está bom.",
        ingredients: "Farinha de trigo, manteiga francesa, leite, açúcar, sal, fermento",
        price: 13.9,
        cost: 4.6,
        portionInfo: "90g",
        tagFunil: "Entrada",
        perfilPaladar: "amanteigado, folhado, crocante",
        alergenosDetalhados: "glúten, lactose",
        storytellingIA:
          "A manteiga é laminada a 14°C — nem mais fria (quebra), nem mais quente (derrete e vira pão). " +
          "É a etapa que separa croissant de imitação de croissant.",
        harmonizacaoSugerida: "Cappuccino Italiano",
        optionGroups: [
          {
            name: "Recheio",
            required: true,
            minSelect: 1,
            maxSelect: 1,
            options: [
              { name: "Puro (do jeito que sai do forno)" },
              { name: "Presunto e queijo", price: 7.0 },
              { name: "Doce de leite", price: 6.0 },
              { name: "Creme de avelã", price: 9.0 },
            ],
          },
        ],
      },
      {
        name: "Caracol de Canela",
        description:
          "Enrolado com manteiga, açúcar mascavo e canela do Ceilão, assado até o centro caramelizar. " +
          "Sai do forno às 8h e às 16h — e costuma acabar antes das 9h.",
        ingredients: "Farinha de trigo, manteiga, leite, açúcar mascavo, canela do Ceilão, ovos, fermento",
        price: 12.9,
        cost: 3.9,
        portionInfo: "120g",
        tagFunil: "Sobremesa",
        perfilPaladar: "doce, canela, caramelizado",
        alergenosDetalhados: "glúten, lactose, ovo",
        extras: [{ name: "Cobertura de cream cheese", price: 5.5, portion: "30g" }],
      },
    ],
  },

  {
    name: "Confeitaria",
    description: "Bolos, tortas e doces feitos aqui todo dia de manhã. Sem mistura pronta, sem gordura vegetal.",
    markupOverride: 4.0,
    printStationKeys: ["COZINHA_1"],
    items: [
      {
        name: "Bolo de Fubá Cremoso com Erva-Doce",
        description:
          "Assado num molde alto: firme em cima, cremoso no meio. Fubá de moinho de pedra e erva-doce " +
          "em grão, moída na hora. O bolo que some primeiro no balcão.",
        ingredients: "Fubá, leite, ovos, açúcar, manteiga, queijo parmesão, erva-doce, fermento",
        price: 10.9,
        cost: 3.1,
        portionInfo: "fatia de 110g",
        servingSize: 1,
        tagFunil: "Sobremesa",
        perfilPaladar: "cremoso, doce moderado, erva-doce",
        alergenosDetalhados: "lactose, ovo",
        storytellingIA:
          "A receita é da avó da confeiteira e tem um erro proposital: o leite entra frio, não morno. " +
          "É o que faz a camada cremosa se separar sozinha no forno.",
        harmonizacaoSugerida: "Café Coado da Casa",
        variants: [
          { name: "Fatia", price: 10.9, portion: "110g" },
          { name: "Bolo inteiro (12 fatias)", price: 79.9, portion: "1,3kg" },
        ],
      },
      {
        name: "Bolo de Cenoura com Ganache Meio Amargo",
        description:
          "Massa úmida de cenoura fresca batida na hora, coberta com ganache de chocolate 55% — " +
          "não é brigadeiro de lata. Doce na medida, amargo no fim.",
        ingredients: "Cenoura, farinha de trigo, ovos, açúcar, óleo, chocolate 55%, creme de leite",
        price: 12.9,
        cost: 3.8,
        portionInfo: "fatia de 130g",
        servingSize: 1,
        tagFunil: "Sobremesa",
        perfilPaladar: "úmido, doce, cacau amargo",
        alergenosDetalhados: "glúten, lactose, ovo",
        variants: [
          { name: "Fatia", price: 12.9, portion: "130g" },
          { name: "Bolo inteiro (12 fatias)", price: 89.9, portion: "1,5kg" },
        ],
      },
      {
        name: "Torta Holandesa",
        description:
          "Base de biscoito amanteigado, creme de baunilha Bourbon e cobertura de chocolate ao leite " +
          "que quebra na colherada. Gelada, alta e sem economia de creme.",
        ingredients: "Biscoito amanteigado, manteiga, creme de leite, leite condensado, baunilha Bourbon, chocolate ao leite",
        price: 18.9,
        cost: 5.9,
        portionInfo: "fatia de 150g",
        servingSize: 1,
        tagFunil: "Sobremesa",
        perfilPaladar: "cremoso, doce, baunilha, chocolate",
        alergenosDetalhados: "glúten, lactose",
        variants: [
          { name: "Fatia", price: 18.9, portion: "150g" },
          { name: "Torta inteira (14 fatias)", price: 199.0, portion: "2,1kg" },
        ],
      },
      {
        name: "Pastel de Nata",
        description:
          "Massa folhada crocante e creme de gema queimado no forno a 300°C, do jeito de Belém. " +
          "Quente, com canela por cima se você quiser.",
        ingredients: "Massa folhada, gemas, leite, açúcar, canela, limão",
        price: 8.5,
        cost: 2.6,
        portionInfo: "70g",
        tagFunil: "Sobremesa",
        perfilPaladar: "doce, folhado, gema queimada",
        alergenosDetalhados: "glúten, lactose, ovo",
        harmonizacaoSugerida: "Espresso",
        variants: [
          { name: "Unidade", price: 8.5, portion: "70g" },
          { name: "Caixa com 6", price: 47.9, portion: "420g" },
        ],
        optionGroups: [
          {
            name: "Canela por cima?",
            required: false,
            minSelect: 0,
            maxSelect: 1,
            options: [{ name: "Com canela" }, { name: "Sem canela" }],
          },
        ],
      },
      {
        name: "Sonho de Creme de Baunilha",
        description:
          "Frito na hora do pedido, açúcar cristal por fora e creme de baunilha injetado quente. " +
          "Espere cinco minutos — vale a espera.",
        ingredients: "Farinha de trigo, ovos, leite, manteiga, açúcar, baunilha, fermento",
        price: 9.5,
        cost: 2.9,
        portionInfo: "110g",
        tagFunil: "Sobremesa",
        perfilPaladar: "doce, macio, baunilha",
        alergenosDetalhados: "glúten, lactose, ovo",
      },
      {
        name: "Brownie de Chocolate 70%",
        description:
          "Denso, com casquinha craquelada e centro que ainda cede. Chocolate belga 70% e uma pitada " +
          "de flor de sal que muda tudo.",
        ingredients: "Chocolate 70%, manteiga, ovos, açúcar, farinha de trigo, flor de sal",
        price: 13.9,
        cost: 4.1,
        portionInfo: "120g",
        tagFunil: "Sobremesa",
        perfilPaladar: "intenso, amargo, denso, salgado no fim",
        alergenosDetalhados: "glúten, lactose, ovo",
        extras: [
          { name: "Bola de sorvete de creme", price: 9.0, portion: "80g" },
          { name: "Calda quente de chocolate", price: 5.0, portion: "40ml" },
        ],
      },
      {
        name: "Cheesecake de Frutas Vermelhas",
        description:
          "Cream cheese batido a frio sobre base de biscoito, com calda de amora, framboesa e morango " +
          "feita na panela — não é geleia comprada.",
        ingredients: "Cream cheese, creme de leite, biscoito, manteiga, açúcar, amora, framboesa, morango",
        price: 19.9,
        cost: 6.2,
        portionInfo: "fatia de 140g",
        servingSize: 1,
        tagFunil: "Sobremesa",
        perfilPaladar: "cremoso, ácido, doce equilibrado",
        alergenosDetalhados: "glúten, lactose",
      },
    ],
  },

  {
    name: "Salgados",
    description: "Do balcão para o guardanapo. Assados e fritos ao longo do dia, nunca de véspera.",
    markupOverride: 3.0,
    printStationKeys: ["COZINHA_1"],
    items: [
      {
        name: "Coxinha de Frango com Catupiry",
        description:
          "Massa de batata cozida na hora, frango desfiado no dente e catupiry de verdade no centro. " +
          "Frita na hora do pedido — sai quente e não sai encharcada.",
        ingredients: "Batata, farinha de trigo, frango, catupiry, cebola, salsinha, farinha de rosca",
        price: 10.9,
        cost: 3.4,
        portionInfo: "130g",
        tagFunil: "Entrada",
        perfilPaladar: "salgado, cremoso, crocante",
        alergenosDetalhados: "glúten, lactose",
        harmonizacaoSugerida: "Suco de Laranja Natural",
        variants: [
          { name: "Unidade", price: 10.9, portion: "130g" },
          { name: "6 unidades", price: 59.9, portion: "780g" },
        ],
      },
      {
        name: "Empada de Palmito",
        description:
          "Massa podre amanteigada que desmancha na boca, recheio de palmito pupunha em cubos com " +
          "azeitona e um toque de azeite português.",
        ingredients: "Farinha de trigo, manteiga, gemas, palmito pupunha, cebola, azeitona, azeite",
        price: 10.5,
        cost: 3.2,
        portionInfo: "110g",
        tagFunil: "Entrada",
        perfilPaladar: "amanteigado, salgado suave",
        alergenosDetalhados: "glúten, lactose, ovo",
      },
      {
        name: "Esfiha Aberta de Carne",
        description:
          "Carne bovina moída na hora com tomate, cebola e um beliscão de limão siciliano, sobre massa " +
          "fina assada em forno de lastro.",
        ingredients: "Farinha de trigo, carne bovina, tomate, cebola, limão siciliano, hortelã, azeite",
        price: 8.9,
        cost: 2.6,
        portionInfo: "100g",
        tagFunil: "Entrada",
        perfilPaladar: "salgado, cítrico, suculento",
        alergenosDetalhados: "glúten",
      },
      {
        name: "Pão de Batata Recheado com Requeijão",
        description:
          "Macio, dourado por cima e recheado até a borda com requeijão cremoso. O salgado que criança " +
          "pede e adulto come dois.",
        ingredients: "Batata, farinha de trigo, leite, manteiga, ovos, requeijão cremoso, fermento",
        price: 10.9,
        cost: 3.3,
        portionInfo: "120g",
        tagFunil: "Entrada",
        perfilPaladar: "macio, salgado, cremoso",
        alergenosDetalhados: "glúten, lactose, ovo",
      },
      {
        name: "Enroladinho de Salsicha",
        description:
          "Massa folhada crocante enrolada em salsicha de carne selecionada, pincelada com gema e " +
          "polvilhada com gergelim.",
        ingredients: "Massa folhada, salsicha, gema, gergelim",
        price: 8.5,
        cost: 2.4,
        portionInfo: "100g",
        tagFunil: "Entrada",
        perfilPaladar: "salgado, folhado, crocante",
        alergenosDetalhados: "glúten, lactose, ovo, gergelim",
      },
      {
        name: "Quiche Lorraine",
        description:
          "A clássica: bacon defumado, creme de ovos e queijo gruyère sobre massa quebradiça. " +
          "Servida morna, do jeito que ela pede.",
        ingredients: "Farinha de trigo, manteiga, ovos, creme de leite, bacon defumado, queijo gruyère, noz-moscada",
        price: 18.9,
        cost: 5.6,
        portionInfo: "fatia de 160g",
        servingSize: 1,
        tagFunil: "Prato Principal",
        perfilPaladar: "salgado, defumado, cremoso",
        alergenosDetalhados: "glúten, lactose, ovo",
        harmonizacaoSugerida: "Café Coado da Casa",
      },
    ],
  },

  {
    name: "Lanches",
    description: "Feitos na chapa, no nosso pão. Servidos das 7h ao fechamento.",
    markupOverride: 2.8,
    printStationKeys: ["COZINHA_1"],
    items: [
      {
        name: "Misto Quente na Chapa",
        description:
          "Presunto e mussarela no pão francês do dia, prensado na chapa com manteiga até dourar dos " +
          "dois lados. Simples e bem feito.",
        ingredients: "Pão francês, presunto, mussarela, manteiga",
        price: 17.9,
        cost: 5.2,
        portionInfo: "180g",
        servingSize: 1,
        tagFunil: "Prato Principal",
        perfilPaladar: "salgado, tostado, derretido",
        alergenosDetalhados: "glúten, lactose",
        harmonizacaoSugerida: "Pingado",
        extras: [
          { name: "Ovo frito", price: 4.5, portion: "1 un" },
          { name: "Queijo extra", price: 5.5, portion: "30g" },
          { name: "Presunto extra", price: 5.0, portion: "30g" },
        ],
      },
      {
        name: "Sanduíche de Presunto Parma, Rúcula e Brie",
        description:
          "Na baguete rústica da casa: parma fatiado fino, brie cremoso, rúcula fresca e um fio de mel. " +
          "O lanche que a gente serve quando alguém pergunta o que é bom.",
        ingredients: "Baguete rústica, presunto parma, queijo brie, rúcula, mel, azeite",
        price: 44.9,
        cost: 15.4,
        portionInfo: "260g",
        servingSize: 1,
        tagFunil: "Prato Principal",
        perfilPaladar: "salgado curado, cremoso, amargo da rúcula, doce discreto",
        alergenosDetalhados: "glúten, lactose",
        storytellingIA:
          "O mel não é enfeite: ele é o que faz o sal do parma e o amargo da rúcula pararem de brigar. " +
          "Sem ele o sanduíche é bom; com ele, é outro sanduíche.",
      },
      {
        name: "Croque-Monsieur",
        description:
          "Pão de forma da casa, presunto, gruyère e molho bechamel gratinado no forno até criar crosta. " +
          "Vem com salada de folhas ao lado.",
        ingredients: "Pão de forma, presunto, queijo gruyère, leite, manteiga, farinha de trigo, noz-moscada",
        price: 34.9,
        cost: 11.8,
        portionInfo: "300g",
        servingSize: 1,
        tagFunil: "Prato Principal",
        perfilPaladar: "cremoso, gratinado, salgado",
        alergenosDetalhados: "glúten, lactose",
      },
      {
        name: "Sanduíche de Frango Desfiado no Pão de Fermentação Natural",
        description:
          "Frango desfiado com requeijão e cebola caramelizada, entre fatias do nosso pão de levain " +
          "tostadas na chapa.",
        ingredients: "Pão de fermentação natural, frango, requeijão, cebola caramelizada, manteiga",
        price: 31.9,
        cost: 10.2,
        portionInfo: "280g",
        servingSize: 1,
        tagFunil: "Prato Principal",
        perfilPaladar: "cremoso, adocicado da cebola, tostado",
        alergenosDetalhados: "glúten, lactose",
      },
      {
        name: "Omelete da Padaria",
        description:
          "Três ovos caipiras batidos na hora, feita na frigideira e dobrada ainda úmida por dentro. " +
          "Acompanha pão francês quentinho.",
        ingredients: "Ovos caipiras, manteiga, sal, pão francês",
        price: 27.9,
        cost: 8.6,
        portionInfo: "3 ovos + pão",
        servingSize: 1,
        tagFunil: "Prato Principal",
        perfilPaladar: "macio, salgado suave",
        alergenosDetalhados: "ovo, glúten, lactose",
        optionGroups: [
          {
            name: "Escolha até 3 recheios",
            required: true,
            minSelect: 1,
            maxSelect: 3,
            options: [
              { name: "Queijo prato" },
              { name: "Mussarela" },
              { name: "Presunto" },
              { name: "Tomate" },
              { name: "Cebola caramelizada", price: 4.0 },
              { name: "Bacon crocante", price: 6.0 },
              { name: "Queijo brie", price: 8.0 },
            ],
          },
        ],
      },
    ],
  },

  {
    name: "Café & Bebidas",
    description: "Grão de Minas torrado toda semana, moído no momento do pedido.",
    markupOverride: 4.5,
    printStationKeys: ["COPA"],
    items: [
      {
        name: "Café Coado da Casa",
        description:
          "Coado no pano, como se faz há cem anos. Blend de Cerrado Mineiro com torra média — doce, " +
          "encorpado e sem amargor de queimado.",
        ingredients: "Café arábica do Cerrado Mineiro, água filtrada",
        price: 5.9,
        cost: 1.1,
        portionInfo: "90ml a xícara",
        tagFunil: "Bebida",
        perfilPaladar: "achocolatado, doce, encorpado",
        alergenosDetalhados: "nenhum",
        storytellingIA:
          "Coado no pano de verdade — o filtro de papel segura os óleos do café, e é neles que está o corpo. " +
          "O pano é fervido todo fim de expediente. Sem isso, azeda.",
        harmonizacaoSugerida: "Bolo de Fubá Cremoso com Erva-Doce",
        variants: [
          { name: "Xícara 90ml", price: 5.9, portion: "90ml" },
          { name: "Caneca 200ml", price: 9.5, portion: "200ml" },
        ],
      },
      {
        name: "Espresso",
        description:
          "Extração de 28 segundos com creme cor de avelã. Grão moído no instante em que você pede — " +
          "café moído há uma hora já não é o mesmo café.",
        ingredients: "Café arábica, água filtrada",
        price: 7.5,
        cost: 1.6,
        portionInfo: "30ml o curto",
        tagFunil: "Bebida",
        perfilPaladar: "intenso, caramelo, acidez baixa",
        alergenosDetalhados: "nenhum",
        harmonizacaoSugerida: "Pastel de Nata",
        variants: [
          { name: "Curto (30ml)", price: 7.5, portion: "30ml" },
          { name: "Duplo (60ml)", price: 11.9, portion: "60ml" },
        ],
      },
      {
        name: "Pingado",
        description:
          "Café coado com um dedo de leite quente vaporizado. O pedido mais antigo do balcão e ainda " +
          "o mais pedido às 7h da manhã.",
        ingredients: "Café coado, leite integral",
        price: 9.5,
        cost: 2.1,
        portionInfo: "200ml",
        tagFunil: "Bebida",
        perfilPaladar: "suave, cremoso, achocolatado",
        alergenosDetalhados: "lactose",
        harmonizacaoSugerida: "Pão Francês",
      },
      {
        name: "Cappuccino Italiano",
        description:
          "Espresso duplo, leite vaporizado sedoso e espuma fina — sem canela, sem chocolate, sem chantilly. " +
          "O italiano de verdade. Se quiser o brasileiro, é só pedir.",
        ingredients: "Café espresso, leite integral vaporizado",
        price: 15.9,
        cost: 4.3,
        portionInfo: "180ml",
        tagFunil: "Bebida",
        perfilPaladar: "cremoso, aveludado, doce natural do leite",
        alergenosDetalhados: "lactose",
        harmonizacaoSugerida: "Croissant Folhado",
        extras: [
          { name: "Dose extra de espresso", price: 5.0, portion: "30ml" },
          { name: "Chantilly da casa", price: 5.5, portion: "30g" },
          { name: "Canela e chocolate por cima", price: 2.0 },
        ],
        optionGroups: [
          {
            name: "Qual leite?",
            required: true,
            minSelect: 1,
            maxSelect: 1,
            options: [
              { name: "Integral" },
              { name: "Desnatado" },
              { name: "Sem lactose", price: 4.0 },
              { name: "Bebida de amêndoas", price: 5.0 },
              { name: "Bebida de aveia", price: 5.0 },
            ],
          },
        ],
      },
      {
        name: "Latte",
        description:
          "Um espresso e muito leite vaporizado, com desenho na espuma quando o barista está inspirado. " +
          "Suave o bastante para acompanhar qualquer doce.",
        ingredients: "Café espresso, leite integral vaporizado",
        price: 14.9,
        cost: 4.0,
        portionInfo: "240ml",
        tagFunil: "Bebida",
        perfilPaladar: "suave, lácteo, doce natural",
        alergenosDetalhados: "lactose",
        optionGroups: [
          {
            name: "Qual leite?",
            required: true,
            minSelect: 1,
            maxSelect: 1,
            options: [
              { name: "Integral" },
              { name: "Desnatado" },
              { name: "Sem lactose", price: 4.0 },
              { name: "Bebida de amêndoas", price: 5.0 },
              { name: "Bebida de aveia", price: 5.0 },
            ],
          },
        ],
      },
      {
        name: "Chocolate Quente Cremoso",
        description:
          "Chocolate 55% derretido no leite, mexido na panela até engrossar. Não é achocolatado em pó — " +
          "é chocolate mesmo, e dá para sentir.",
        ingredients: "Chocolate 55%, leite integral, creme de leite, açúcar",
        price: 17.9,
        cost: 5.1,
        portionInfo: "250ml",
        tagFunil: "Bebida",
        perfilPaladar: "denso, doce, cacau",
        alergenosDetalhados: "lactose",
        extras: [{ name: "Chantilly da casa", price: 5.5, portion: "30g" }],
      },
      {
        name: "Suco de Laranja Natural",
        description: "Espremido na hora, sem água e sem açúcar. Se pedir com gelo, a gente avisa que dilui.",
        ingredients: "Laranja pera",
        price: 13.9,
        cost: 4.6,
        portionInfo: "300ml",
        tagFunil: "Bebida",
        perfilPaladar: "cítrico, fresco, doce natural",
        alergenosDetalhados: "nenhum",
        variants: [
          { name: "Copo 300ml", price: 13.9, portion: "300ml" },
          { name: "Jarra 500ml", price: 19.9, portion: "500ml" },
        ],
      },
      {
        name: "Água Mineral",
        description: "Gelada, 500ml. Com ou sem gás.",
        ingredients: "Água mineral",
        price: 5.5,
        cost: 1.6,
        portionInfo: "500ml",
        tagFunil: "Bebida",
        perfilPaladar: "neutro",
        alergenosDetalhados: "nenhum",
        variants: [
          { name: "Sem gás", price: 5.5, portion: "500ml" },
          { name: "Com gás", price: 6.5, portion: "500ml" },
        ],
      },
    ],
  },

  {
    name: "Cestas & Combos",
    description: "Café da manhã montado por nós. Para comer aqui, levar ou mandar de presente.",
    markupOverride: 2.6,
    printStationKeys: ["CAIXA", "COZINHA_1"],
    items: [
      {
        name: "Combo Café da Manhã",
        description:
          "Café coado na caneca, pão francês na chapa com manteiga e uma fatia de bolo de fubá. " +
          "O começo de dia da casa, por menos do que os três separados.",
        ingredients: "Café coado, pão francês, manteiga, bolo de fubá",
        price: 26.9,
        cost: 7.9,
        portionInfo: "1 café + 1 pão + 1 fatia",
        servingSize: 1,
        tagFunil: "Prato Principal",
        perfilPaladar: "equilibrado, doce e salgado",
        alergenosDetalhados: "glúten, lactose, ovo",
      },
      {
        name: "Cesta de Café da Manhã para Dois",
        description:
          "Dois cafés, quatro pães franceses, croissants, pão de queijo, manteiga, geleia da casa, " +
          "queijo, presunto e frutas da estação. Serve duas pessoas com folga.",
        ingredients: "Café, pão francês, croissant, pão de queijo, manteiga, geleia, queijo, presunto, frutas",
        price: 129.9,
        cost: 44.0,
        portionInfo: "cesta completa",
        servingSize: 2,
        tagFunil: "Prato Principal",
        perfilPaladar: "variado",
        alergenosDetalhados: "glúten, lactose, ovo",
        storytellingIA:
          "A cesta é montada na hora, nunca de véspera — por isso ela pede 40 minutos de antecedência " +
          "no delivery. É o tempo de o pão sair do forno.",
      },
      {
        name: 'Cesta Presente "Bom Dia"',
        description:
          "Na cesta de vime, com laço e cartão escrito à mão: pães, doces da confeitaria, café em grãos " +
          "250g, geleia, granola e mel. Chega em pé e chega bonito.",
        ingredients: "Pães, doces, café em grãos, geleia, granola, mel",
        price: 199.9,
        cost: 72.0,
        portionInfo: "cesta de vime",
        servingSize: 2,
        tagFunil: "Prato Principal",
        perfilPaladar: "variado",
        alergenosDetalhados: "glúten, lactose, ovo, castanhas",
      },
    ],
  },

  {
    name: "Da Nossa Despensa",
    description: "O que a gente faz aqui e você leva para casa.",
    markupOverride: 2.2,
    printStationKeys: ["CAIXA"],
    items: [
      {
        name: "Café em Grãos Foocci Bakery 250g",
        description:
          "Nosso blend de Cerrado Mineiro, torrado há menos de sete dias — a data da torra vai impressa " +
          "no pacote. Moemos na hora se você preferir.",
        ingredients: "Café arábica do Cerrado Mineiro",
        price: 46.9,
        cost: 22.0,
        portionInfo: "250g",
        tagFunil: "Bebida",
        perfilPaladar: "achocolatado, doce, corpo médio",
        alergenosDetalhados: "nenhum",
        optionGroups: [
          {
            name: "Moagem",
            required: true,
            minSelect: 1,
            maxSelect: 1,
            options: [
              { name: "Em grãos (moer em casa)" },
              { name: "Moído para coador" },
              { name: "Moído para prensa francesa" },
              { name: "Moído para espresso" },
            ],
          },
        ],
      },
      {
        name: "Geleia Artesanal 240g",
        description:
          "Cozida na panela em fogo baixo, com 60% de fruta e pouco açúcar. Sem pectina industrial e " +
          "sem conservante — depois de aberta, vai para a geladeira.",
        ingredients: "Fruta, açúcar demerara, suco de limão",
        price: 32.9,
        cost: 12.5,
        portionInfo: "240g",
        tagFunil: "Sobremesa",
        perfilPaladar: "doce, ácido, fruta concentrada",
        alergenosDetalhados: "nenhum",
        harmonizacaoSugerida: "Pão de Fermentação Natural",
        variants: [
          { name: "Goiaba", price: 32.9, portion: "240g" },
          { name: "Laranja com gengibre", price: 34.9, portion: "240g" },
          { name: "Frutas vermelhas", price: 36.9, portion: "240g" },
        ],
      },
      {
        name: "Granola Artesanal da Casa 500g",
        description:
          "Aveia em flocos, castanha-do-pará, amêndoas, coco e mel, assada devagar até ficar em pedaços " +
          "grandes. Sem açúcar refinado e sem gordura hidrogenada.",
        ingredients: "Aveia, castanha-do-pará, amêndoas, coco, mel, óleo de coco, canela",
        price: 42.9,
        cost: 17.0,
        portionInfo: "500g",
        tagFunil: "Entrada",
        perfilPaladar: "crocante, tostado, doce leve",
        alergenosDetalhados: "castanhas, amêndoas, aveia (pode conter glúten)",
      },
    ],
  },
];
