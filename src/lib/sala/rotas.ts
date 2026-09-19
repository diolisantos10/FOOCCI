/**
 * OS ENDEREÇOS DA ÁREA COMERCIAL — em um lugar só.
 *
 * ── POR QUE ISTO É UM ARQUIVO, E NÃO STRINGS SOLTAS ─────────────────────────
 *
 * Em 26/08/2026 a Sala saiu de `/admin/sala-de-vendas` para `/comercial`. A
 * mudança tocou o menu, o destino do login, os avisos das telas e os redirecionos
 * do endereço antigo. Com os caminhos digitados em cada lugar, uma mudança dessas
 * é uma caça em quinze arquivos — e o que escapa não quebra o build: vira um
 * botão que leva a lugar nenhum, descoberto por um vendedor no meio de uma
 * conversa com cliente.
 *
 * Endereço, aqui, é dado de uma fonte só. Se um dia a área mudar de nome de novo,
 * muda a constante e acabou.
 *
 * ── E POR QUE O QUE CADA PAPEL VÊ MORA AQUI JUNTO ───────────────────────────
 *
 * Porque a aba e a permissão precisam contar a mesma história. Uma lista de abas
 * escrita no layout e uma lista de papéis escrita na rota divergem no primeiro
 * dia em que alguém mexe só numa — e o resultado é uma aba que abre e devolve
 * 403, que é o jeito mais rápido de ensinar que o sistema é imprevisível.
 *
 * ⚠️ Isto NÃO é a autorização. Quem autoriza é a rota, no servidor. Aqui é a
 * conveniência de não mostrar porta que não abre.
 */

import type { InternalRole } from "@prisma/client";

/**
 * A raiz da área.
 *
 * ⚠️ **NÃO é `/atendimento`**, e a tentação de usar aquele nome custou um build.
 * `/atendimento` já é a caixa de conversas DO RESTAURANTE — a tela em que o
 * lojista fala com o cliente dele. Tomar aquele endereço para a sala comercial
 * da Foocci derrubaria a tela de trabalho de todo cliente pagante.
 *
 * `/comercial` diz o que é: a área de quem VENDE o Foocci, e não a de quem usa.
 */
export const COMERCIAL = "/comercial";

/** Onde se entra. Fora da moldura: quem não tem sessão precisa alcançá-la. */
export const ENTRADA = `${COMERCIAL}/entrar`;

export const ROTAS = {
  filas: COMERCIAL,
  conversas: `${COMERCIAL}/conversas`,
  /** Todos os leads numa tabela só — inclusive quem sumiria das filas. */
  carteira: `${COMERCIAL}/carteira`,
  funil: `${COMERCIAL}/funil`,
  agentes: `${COMERCIAL}/agentes`,
  precos: `${COMERCIAL}/precos`,
  ensaio: `${COMERCIAL}/ensaio`,
  /**
   * Os números de quem está olhando — e **não** o painel do gerente.
   *
   * São duas telas porque são duas perguntas. O gerente pergunta "quem do time
   * está afogado"; o vendedor pergunta "o que eu tenho para fazer agora".
   * Encolher a primeira pelo próprio nome não produz a segunda.
   */
  meus: `${COMERCIAL}/meus-numeros`,
  painel: `${COMERCIAL}/painel`,
  agente: `${COMERCIAL}/agente`,
  whatsapp: `${COMERCIAL}/whatsapp`,
  /**
   * A prospecção — os lotes da lista, o interruptor e a fila do dia.
   *
   * Fica separada das Filas de propósito: "Filas" é quem já fala com a gente;
   * "Prospecção" é quem ainda não sabe que existimos. Misturar as duas telas
   * faria o vendedor tratar estranho e interessado com o mesmo tom.
   */
  prospeccao: `${COMERCIAL}/prospeccao`,
  /**
   * O histórico de ARQUIVOS — um por linha, com quem subiu e o que entrou.
   *
   * Separada da Prospecção porque responde outra pergunta. Prospecção é "quem a
   * casa fala hoje"; Importações é "de onde saiu esta base, e quem respondeu por
   * ela". No dia em que alguém perguntar por que temos o telefone dele, é esta
   * tela que abre.
   */
  importacoes: `${COMERCIAL}/importacoes`,
  /**
   * A base contínua — o estoque unificado de contatos frios.
   *
   * ⚠️ Não é a Carteira. Carteira é quem já virou lead, com dono e conversa;
   * Base fria é quem ainda não sabe que existimos. Misturar as duas na mesma
   * tela faria o vendedor tratar estranho e interessado com o mesmo tom — o
   * mesmo motivo pelo qual Filas e Prospecção vivem separadas.
   */
  baseFria: `${COMERCIAL}/base-fria`,
  acessos: `${COMERCIAL}/acessos`,
  /**
   * ⭐ CADASTRAR UM LEAD À MÃO — a porta que não existia.
   *
   * Em 19/09/2026 um lead da campanha paga (Elisa Oliveira) ficou 20 horas
   * fora do sistema porque a integração falhou e **não havia lugar nenhum no
   * Foocci para digitá-lo**: toda entrada dependia de planilha, webhook ou
   * rota com segredo. Falha de integração virava lead perdido, sem plano B.
   *
   * Mora em Leads, e não em Prospecção, porque quem se cadastra aqui é
   * pessoa que já falou com a gente — misturar com a lista fria repetiria
   * exatamente o erro de tratamento que `frioOuLead.ts` existe para impedir.
   * A origem é escolhida na tela, e é ela que decide os dois casos.
   */
  cadastro: `${COMERCIAL}/cadastrar-lead`,
  /**
   * A Supervisora — a camada de revisão que acompanha todo agente (IA e
   * humano) que fala com lead. Fica ao lado do Painel e do Agente porque
   * responde à mesma pergunta de gestão ("como o time está atendendo"), não
   * à pergunta operacional de "o que eu tenho para fazer agora" — por isso
   * segue a MESMA lista de papéis de `PAPEIS_DO_PAINEL`, abaixo, e não a
   * lista `PARA_TODOS`.
   */
  supervisora: `${COMERCIAL}/supervisora`,

  // ─── As telas do desenho do CEO (17/09/2026) ───────────────────────────────
  //
  // O CEO desenhou 14 telas para a nova área comercial e nós construímos o
  // motor inteiro sem construir nenhuma delas. Estas são as que faltavam. Elas
  // não substituem nada: /conversas, /funil, /precos, /carteira e /painel
  // continuam onde estavam, e continuam sendo a porta do dia a dia.

  /**
   * A Control Tower — a saúde da operação inteira numa tela só.
   *
   * ⚠️ Não é o Painel. O Painel responde "quais são os meus números"; a Torre
   * responde "o que está travado AGORA, e por quê". Régua de gestão, mesma
   * lista de papéis do Painel.
   */
  torre: `${COMERCIAL}/torre`,
  /**
   * A Central de Atendimento — a visão de cima das conversas.
   *
   * ⚠️ Não é /conversas. Lá se atende UMA pessoa; aqui se enxerga a fila
   * inteira, quem espera há mais tempo, quem é IA e quem é gente, e a carga de
   * cada atendente. Tela de quem distribui, não de quem responde.
   */
  atendimento: `${COMERCIAL}/atendimento`,
  /** A Central SDR / Gatekeeper — os 9 tipos de porteiro e a caça ao decisor. */
  sdr: `${COMERCIAL}/sdr`,
  /**
   * O Hunter IA / Inteligência Comercial — a peça 14 do desenho.
   *
   * ⚠️ Não é /prospeccao. Prospecção é a LISTA FRIA que já entrou na casa: os
   * lotes de planilha, a fila do dia e o interruptor de abordagem. O Hunter é a
   * camada de ANTES: o restaurante como empresa — categoria, unidades, canais,
   * ICP e decisor — descoberto e enriquecido antes de virar contato de alguém.
   * Uma tela lê `SiteLead`, a outra lê `Empresa`; juntá-las faria a base fria
   * parecer descoberta, que é exatamente a confusão que `frioOuLead.ts` existe
   * para impedir.
   */
  hunter: `${COMERCIAL}/hunter`,
  /** A CRM IA — o plano do dia, os 14 estados de follow-up e o pós-venda. */
  crm: `${COMERCIAL}/crm`,
  /** Qualificação e Lead Score — FRIO → MORNO → QUENTE → PRIORIDADE MÁXIMA. */
  qualificacao: `${COMERCIAL}/qualificacao`,
  /**
   * O Motor de Decisão — as regras de distribuição, e as que ainda NÃO existem.
   *
   * Mostra a carga e o estado de cada colega, então segue a régua do Painel:
   * gestão e auditoria, nunca o SDR. A rota recusa sozinha; a aba só evita
   * oferecer uma porta que vai bater na cara de quem clicar.
   */
  roteamento: `${COMERCIAL}/roteamento`,
  /** Catálogo, oferta e checkout — o que se vende, por quanto, e as propostas. */
  oferta: `${COMERCIAL}/oferta`,
  /**
   * Follow-up e pós-venda na mesma tela, em abas.
   *
   * São a MESMA pergunta dos dois lados do GANHO: "o que está parado, e quando
   * alguém toca de novo?". Antes da venda o relógio é o silêncio; depois é a
   * ativação. Separá-las obrigaria o gerente a somar de cabeça a base inteira.
   */
  relacionamento: `${COMERCIAL}/relacionamento`,
} as const;

/**
 * O endereço antigo, e para onde ele leva agora.
 *
 * `/admin/sala-de-vendas/atendimento` virou `/comercial/conversas`, e
 * `/admin/sala-de-vendas/canal` virou `/comercial/whatsapp`. Os dois foram
 * renomeados: "atendimento" já é o nome da caixa de conversas DO RESTAURANTE, e
 * "canal" não diz nada a quem não construiu isto.
 *
 * Existe para o redireciono: link antigo em favorito, em conversa, em anotação —
 * tudo continua chegando. Endereço que some leva junto a confiança de quem
 * guardou o favorito.
 */
export const BASE_ANTIGA = "/admin/sala-de-vendas";

const RENOMEADAS: Readonly<Record<string, string>> = {
  atendimento: "conversas",
  canal: "whatsapp",
};

export function destinoDoEnderecoAntigo(caminho: string): string {
  const resto = caminho.replace(BASE_ANTIGA, "").replace(/^\//, "");
  if (!resto) return COMERCIAL;

  const [primeiro, ...cauda] = resto.split("/");
  const traduzido = RENOMEADAS[primeiro!] ?? primeiro!;
  return [COMERCIAL, traduzido, ...cauda].join("/");
}

// ─── O menu: 10 grupos, e quem alcança cada aba ─────────────────────────────
//
// ── POR QUE O MENU DEIXOU DE TER UMA LINHA POR TELA (18/09/2026) ────────────
//
// O menu chegou a 24 itens — uma linha para cada pasta construída. O CEO abriu
// o desenho da área nova e disse o que faltava: *"não é MAIS coisas que a gente
// precisa, é um UPGRADE"*. Vinte e quatro portas lado a lado não são poder de
// escolha; são a mesma pergunta feita vinte e quatro vezes por dia.
//
// O desenho tem **10 itens na lateral**. Então o menu passa a ter 10, e as
// telas que falavam da mesma coisa viraram ABAS de um item só.
//
// ⚠️ **Nenhuma tela foi apagada, movida ou redesenhada.** Cada endereço
// continua exatamente onde estava, respondendo exatamente o que respondia — ele
// só deixou de ocupar uma linha no topo. Quem tem um favorito, um link em
// conversa ou uma anotação continua chegando. É por isso que `abasDoComercial`
// continua existindo abaixo, devolvendo a lista PLANA: ela é a prova, no teste,
// de que agrupar não escondeu endereço nenhum de quem podia alcançá-lo.
//
// ⚠️ E a moldura continua não sendo a fechadura. A aba que a pessoa não alcança
// não aparece — mas quem digitar o endereço direto continua batendo na rota,
// que recusa no servidor.

export interface Aba {
  href: string;
  rotulo: string;
  /** Sem lista = a Sala inteira alcança. Com lista = só estes papéis. */
  papeis?: ReadonlySet<string>;
}

export interface Grupo {
  /** O rótulo do item no menu de cima — o do desenho do CEO. */
  rotulo: string;
  /** Onde o item do menu leva: a primeira aba que ESTA pessoa alcança. */
  href: string;
  /** As abas da barra de dentro, já filtradas pelo papel. */
  abas: Aba[];
  /**
   * Endereços que pertencem ao grupo sem serem item da barra.
   *
   * A ficha do lead (`/comercial/lead/<id>`) abre a partir de Leads e precisa
   * manter a barra do grupo desenhada — mas ela não é uma aba: é o detalhe de
   * uma linha, e um item de menu que só faz sentido depois de um clique é um
   * item morto no resto do tempo.
   */
  prefixos?: readonly string[];
}

const PAPEIS_DO_PAINEL = new Set<string>([
  "MASTER_CEO",
  "DIRETOR_FOOCCI",
  "GERENTE_DEPARTAMENTO",
  "AUDITOR_QA",
]);

/**
 * A conferência do canal segue `vePelaOperacaoToda` na rota, e a aba copia a
 * mesma lista. Ela não mostra segredo nenhum, mas dispara uma chamada à Meta a
 * cada abertura: pôr esse botão na frente da Sala inteira é convidar um laço.
 */
const PAPEIS_DO_WHATSAPP = PAPEIS_DO_PAINEL;

/** Criar gente é do dono. O gerente distribui a fila; ele não cria acesso. */
const PAPEIS_DOS_ACESSOS = new Set<string>(["MASTER_CEO", "DIRETOR_FOOCCI"]);

/**
 * O desenho do menu — a ordem é a do desenho do CEO, que é a do percurso do
 * trabalho: vê a operação, prospecta, fura o porteiro, atende, cuida do lead,
 * vende, mantém, automatiza, mede, configura.
 *
 * A régua de papel de cada aba é a MESMA que o item tinha quando era linha de
 * menu — agrupar não foi ocasião de abrir nem de fechar porta nenhuma.
 */
export const GRUPOS: readonly Grupo[] = [
  {
    // Painel responde "quais são os meus números"; a Torre responde "o que está
    // travado AGORA". Mesma pergunta de gestão, duas lentes — e a mesma régua.
    rotulo: "Painel",
    href: ROTAS.painel,
    abas: [
      { href: ROTAS.painel, rotulo: "Painel", papeis: PAPEIS_DO_PAINEL },
      { href: ROTAS.torre, rotulo: "Torre de controle", papeis: PAPEIS_DO_PAINEL },
    ],
  },
  {
    // Quem a casa fala hoje, o estoque inteiro, e de que arquivo cada contato
    // veio. Três perguntas sobre a MESMA lista fria.
    rotulo: "Prospecção",
    href: ROTAS.prospeccao,
    abas: [
      // ⚠️ Prospecção continua sendo a PRIMEIRA aba, ainda que o Hunter seja o
      // começo do percurso. O `href` do item de menu é o da primeira aba
      // alcançável (ver `menuDoComercial`) — pôr o Hunter na frente mudaria o
      // destino do clique em "Prospecção" e tiraria do caminho a tela que o
      // time abre todo dia, por causa de uma tela que hoje está quase vazia.
      { href: ROTAS.prospeccao, rotulo: "Prospecção" },
      { href: ROTAS.hunter, rotulo: "Hunter IA" },
      { href: ROTAS.baseFria, rotulo: "Base fria" },
      { href: ROTAS.importacoes, rotulo: "Importações" },
    ],
  },
  {
    // A caça ao decisor e a fila de quem já responde: é o trabalho de abordar,
    // dos dois lados do "alô".
    rotulo: "SDR",
    href: ROTAS.sdr,
    abas: [
      { href: ROTAS.sdr, rotulo: "Central SDR" },
      { href: ROTAS.filas, rotulo: "Filas" },
    ],
  },
  {
    // As duas telas do desenho do CEO que vivem no menu Atendimento:
    // `Conversas` é a peça 05 (Copiloto do Vendedor) e `Central de Atendimento`
    // é a peça 03 (a mesa de três colunas com as Caixas de Conversa).
    //
    // ⭐ A Central deixou de ser painel de gestão em 19/09/2026 e virou a mesa
    // de trabalho do desenho — por isso saiu de `PAPEIS_DO_PAINEL`. Quem atende
    // precisa alcançá-la, ou a tela fica sem o público dela. O que ela mostra
    // continua preso ao `escopoDaConsulta`, no `where`: a porta abriu, o dado
    // não. A visão de cima é a Torre, e ela segue a régua de gestão.
    rotulo: "Atendimento",
    href: ROTAS.conversas,
    abas: [
      { href: ROTAS.conversas, rotulo: "Conversas" },
      { href: ROTAS.atendimento, rotulo: "Central de atendimento" },
    ],
  },
  {
    // Todos os leads, o desenho do funil e a temperatura de cada um. A ficha
    // individual abre daqui e mantém a barra — ver `prefixos`.
    rotulo: "Leads",
    href: ROTAS.carteira,
    abas: [
      { href: ROTAS.carteira, rotulo: "Carteira" },
      { href: ROTAS.funil, rotulo: "Funil" },
      { href: ROTAS.qualificacao, rotulo: "Qualificação" },
      // A porta de entrada à mão fica ao lado da Carteira porque é ali que o
      // vendedor vai conferir se o lead entrou. Aberta à Sala inteira: quem
      // atende é quem descobre o lead que a integração deixou cair.
      { href: ROTAS.cadastro, rotulo: "Cadastrar lead" },
    ],
    prefixos: [`${COMERCIAL}/lead`],
  },
  {
    // O que se vende e por quanto. Preço é dado público; a oferta é o que se
    // monta em cima dele.
    rotulo: "Vendas",
    href: ROTAS.precos,
    abas: [
      { href: ROTAS.precos, rotulo: "Preços" },
      { href: ROTAS.oferta, rotulo: "Oferta e checkout" },
    ],
  },
  {
    // O plano do dia e o relógio do silêncio — antes e depois do GANHO.
    rotulo: "CRM",
    href: ROTAS.crm,
    abas: [
      { href: ROTAS.crm, rotulo: "CRM IA" },
      { href: ROTAS.relacionamento, rotulo: "Follow-up e pós-venda" },
    ],
  },
  {
    // O que a máquina faz sozinha: a regra que distribui, o agente que fala, e
    // o ensaio em que se confere como ele fala. As duas primeiras mostram carga
    // e estado do time — régua de gestão. O ensaio não envia nada e fica aberto
    // à Sala: quem vai trabalhar ao lado do TA precisa saber onde ele para.
    rotulo: "Automações",
    href: ROTAS.roteamento,
    abas: [
      { href: ROTAS.roteamento, rotulo: "Roteamento", papeis: PAPEIS_DO_PAINEL },
      { href: ROTAS.agente, rotulo: "O agente", papeis: PAPEIS_DO_PAINEL },
      { href: ROTAS.ensaio, rotulo: "Ensaio do TA" },
    ],
  },
  {
    // "Meus números" são os da própria pessoa e não se escondem de ninguém. A
    // Supervisora compara agentes ENTRE SI — por isso ela segue a régua do
    // Painel, e o SDR humano nunca a ganha.
    rotulo: "Relatórios",
    href: ROTAS.meus,
    abas: [
      { href: ROTAS.meus, rotulo: "Meus números" },
      { href: ROTAS.supervisora, rotulo: "Supervisora", papeis: PAPEIS_DO_PAINEL },
    ],
  },
  {
    // O canal, as fichas de função e a criação de acesso. As fichas ficam
    // visíveis para TODO MUNDO: elas dizem o que cada função pode, e esconder a
    // alçada a transforma em folclore.
    rotulo: "Configurações",
    href: ROTAS.agentes,
    abas: [
      { href: ROTAS.whatsapp, rotulo: "WhatsApp", papeis: PAPEIS_DO_WHATSAPP },
      { href: ROTAS.agentes, rotulo: "Agentes" },
      { href: ROTAS.acessos, rotulo: "Criar acesso", papeis: PAPEIS_DOS_ACESSOS },
    ],
  },
];

/**
 * `null` = entrou pela senha compartilhada, que não carrega papel. Nesse caso
 * mostra tudo — esconder itens de quem entrou pela porta de administração
 * esconderia o produto de quem o está montando.
 */
function alcanca(papel: InternalRole | null, aba: Aba): boolean {
  if (!aba.papeis) return true;
  return papel === null || aba.papeis.has(papel);
}

/**
 * O menu de cima: os grupos que este papel alcança, cada um já com as suas abas
 * filtradas.
 *
 * O `href` do item NÃO é fixo: é o da **primeira aba que esta pessoa alcança**.
 * Um item que apontasse sempre para a mesma tela mandaria o vendedor para um
 * 403 no primeiro clique em "Atendimento" — e a régua é que porta oferecida
 * abre. Grupo sem nenhuma aba alcançável não aparece.
 */
export function menuDoComercial(papel: InternalRole | null): Grupo[] {
  // ── O PAPEL QUE NÃO ENTRA NÃO RECEBE MENU ───────────────────────────────
  //
  // `AGENTE_IA` é o time de agentes, e ele não faz login: `autenticarInterno`
  // o recusa mesmo com senha gravada no banco. Uma sessão com este papel não
  // deveria existir — e é exatamente por isso que a linha está aqui.
  //
  // Se um dia existir, terá sido por defeito, e não vai ser o menu que entrega
  // a Sala a ela. Isto não substitui a trava do login; é a segunda porta
  // fechada no mesmo corredor.
  if (papel === "AGENTE_IA") return [];

  const menu: Grupo[] = [];
  for (const g of GRUPOS) {
    const abas = g.abas.filter((a) => alcanca(papel, a));
    if (abas.length === 0) continue;
    menu.push({ ...g, abas, href: abas[0]!.href });
  }
  return menu;
}

/**
 * A lista PLANA de tudo que este papel alcança.
 *
 * Existe para a prova: agrupar o menu não podia fazer sumir endereço nenhum, e
 * não podia abrir nem fechar porta para papel nenhum. O teste compara esta
 * lista com a de antes do agrupamento.
 */
export function abasDoComercial(papel: InternalRole | null): Aba[] {
  return menuDoComercial(papel).flatMap((g) => g.abas);
}

/**
 * Qual grupo desenha a barra de abas para o endereço aberto.
 *
 * Casa pelo prefixo MAIS LONGO, e nunca por `startsWith` solto: `/comercial` é
 * prefixo de toda a área, e uma comparação ingênua faria a barra das Filas
 * aparecer em cima de todas as telas da casa.
 */
export function grupoDoCaminho(menu: readonly Grupo[], caminho: string): Grupo | null {
  const limpo = caminho.replace(/\/+$/, "") || COMERCIAL;
  let melhor: Grupo | null = null;
  let tamanho = -1;

  for (const g of menu) {
    for (const alvo of [...g.abas.map((a) => a.href), ...(g.prefixos ?? [])]) {
      const casa = limpo === alvo || limpo.startsWith(`${alvo}/`);
      if (casa && alvo.length > tamanho) {
        melhor = g;
        tamanho = alvo.length;
      }
    }
  }
  return melhor;
}
