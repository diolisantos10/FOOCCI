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
  funil: `${COMERCIAL}/funil`,
  agentes: `${COMERCIAL}/agentes`,
  precos: `${COMERCIAL}/precos`,
  ensaio: `${COMERCIAL}/ensaio`,
  painel: `${COMERCIAL}/painel`,
  agente: `${COMERCIAL}/agente`,
  whatsapp: `${COMERCIAL}/whatsapp`,
  acessos: `${COMERCIAL}/acessos`,
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

// ─── As abas, e quem alcança cada uma ───────────────────────────────────────

export interface Aba {
  href: string;
  rotulo: string;
}

const PARA_TODOS: readonly Aba[] = [
  { href: ROTAS.filas, rotulo: "Filas" },
  { href: ROTAS.conversas, rotulo: "Conversas" },
  { href: ROTAS.funil, rotulo: "Funil" },
  // As fichas ficam visíveis para TODO MUNDO da Sala, o SDR incluído: elas dizem
  // o que cada função pode e não pode, e o SDR precisa ler a dele para saber onde
  // ele para e onde o Closer começa. Esconder a alçada a transforma em folclore —
  // e folclore se resolve perguntando ao colega mais antigo.
  { href: ROTAS.agentes, rotulo: "Agentes" },
  // Preço é dado PÚBLICO: está estampado no site para qualquer estranho ler.
  // Esconder do próprio vendedor não protegeria nada — só o obrigaria a caçar o
  // número na página de marketing no meio da conversa, ou a chutar.
  { href: ROTAS.precos, rotulo: "Preços" },
  // O ensaio do TA fica visível para a Sala inteira: quem vai trabalhar ao lado
  // dele precisa saber como ele fala e onde ele para. E a tela não envia nada.
  { href: ROTAS.ensaio, rotulo: "Ensaio do TA" },
];

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
 * As abas que este papel enxerga.
 *
 * `null` = entrou pela senha compartilhada, que não carrega papel. Nesse caso
 * mostra tudo — esconder itens de quem entrou pela porta de administração
 * esconderia o produto de quem o está montando.
 */
export function abasDoComercial(papel: InternalRole | null): Aba[] {
  const tudo = papel === null;

  return [
    ...PARA_TODOS,
    ...(tudo || PAPEIS_DO_PAINEL.has(papel) ? [{ href: ROTAS.painel, rotulo: "Painel" }] : []),
    // O agente segue a lista do painel para LER. Ligar continua sendo do dono,
    // e quem recusa é a rota — a aba mostra o estado a quem trabalha ao lado
    // dele, porque descobrir que o TA está desligado pela ausência de resposta
    // é o pior jeito possível.
    ...(tudo || PAPEIS_DO_PAINEL.has(papel) ? [{ href: ROTAS.agente, rotulo: "O agente" }] : []),
    ...(tudo || PAPEIS_DO_WHATSAPP.has(papel) ? [{ href: ROTAS.whatsapp, rotulo: "WhatsApp" }] : []),
    ...(tudo || PAPEIS_DOS_ACESSOS.has(papel) ? [{ href: ROTAS.acessos, rotulo: "Criar acesso" }] : []),
  ];
}
