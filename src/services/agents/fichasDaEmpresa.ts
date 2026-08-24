/**
 * AS FICHAS DA EMPRESA — os agentes dos 6 departamentos oficiais da Foocci (v3).
 *
 * ── POR QUE O CATÁLOGO É O MARKDOWN, E NÃO ESTE ARQUIVO ──
 *
 * `docs/arquitetura-operacional-foocci-v3/02-DEPARTAMENTOS-E-AGENTES.md` diz, na
 * primeira linha: *"Nenhuma ficha nasce fora deste arquivo, e nenhuma ficha vive
 * só neste arquivo."*
 *
 * Copiar as fichas para dentro de um array de TypeScript cumpriria a segunda
 * metade e quebraria a primeira: passariam a existir duas cópias, o proprietário
 * aprovaria uma e o banco receberia a outra. Em dois meses ninguém saberia qual
 * está certa — e é exatamente assim que um catálogo vira decoração.
 *
 * Então este arquivo NÃO guarda ficha nenhuma. Ele **lê** o documento aprovado.
 * O texto que o proprietário lê é o texto que vai para o banco, sem ninguém no
 * meio para transcrever errado.
 *
 * O mesmo padrão já vive nesta casa: `elencoObrigatorio.test.ts` lê os arquivos
 * de `.claude/agents/` em vez de repetir o conteúdo deles.
 *
 * ── AS TRÊS POPULAÇÕES ──
 *
 * Em 07/08/2026 quatro fichas foram apagadas por confundir duas populações que
 * não se misturam. Esta fase traz uma terceira, e a lição vale de novo:
 *
 *   `produto`        → roda dentro do sistema, para o lojista ou o cliente final.
 *   `desenvolvimento`→ constrói o Foocci (`.claude/agents/`).
 *   `empresa`        → quem trabalha NA Foocci: SDR, Closer, Gerente Financeiro.
 *
 * As fichas deste arquivo são todas `empresa`. Uma ficha de empresa nunca herda
 * permissão de agente de produto, e o portão está em `fichasDaEmpresa.test.ts`.
 */

/** Modo de execução declarado no catálogo. */
export type ModoDeExecucao = "IA" | "HUMANO" | "HIBRIDO";

export interface FichaDaEmpresa {
  /** Identificador estável, derivado do nome. Chave do `AgentProfile`. */
  slug: string;
  /** Numeração do catálogo: "2.2". É como o proprietário se refere à ficha. */
  numero: string;
  /** Número do departamento (1 a 6). */
  departamento: number;
  nome: string;
  modo: ModoDeExecucao;
  /** Linha solta antes dos campos rotulados. Vira `description`. */
  resumo: string | null;
  /** "Pode:" — o que executa sem pedir licença. Vira `allowedActions`. */
  pode: string[];
  /** "Não pode:" (e "Não pode também:") — a trava. Vira `forbiddenActions`. */
  naoPode: string[];
  /** "Escala quando:" — o gatilho que devolve a decisão para gente. */
  escalaQuando: string[];
  /** "Mede-se por:" — como se sabe se está funcionando. */
  medeSePor: string[];
  /** "Regra dura:" — regra que não admite exceção. Entra em `safetyRules`. */
  regraDura: string[];
  /**
   * Slug de um `AgentProfile` que JÁ EXISTE e é a mesma coisa que esta ficha.
   * Quando preenchido, o seed LIGA a linha existente ao departamento em vez de
   * criar outra — é o que impede dois nomes para o mesmo trabalho.
   */
  jaExisteComo: string | null;
}

/**
 * As três fichas que já existem como agente de produto semeado e em operação.
 *
 * Só entram aqui identidades ÓBVIAS.
 *
 * `analytics-product` saiu da lista na v3: o slot existe no registro desde a
 * Fase 0 como placeholder vazio — zero regra, zero ferramenta. Apontar a ficha
 * 3.5 para ele faria o catálogo chamar de "agente que já existe" o que é uma
 * vaga com nome. A ficha 3.5 nasce como as outras: a construir.
 *
 * `suporte-tecnico` também ficou de fora, e agora com motivo resolvido: na v3
 * ele é o Agente de Suporte N1 (ficha 2.3), como o CEO confirmou. O vínculo NÃO
 * é feito aqui mesmo assim — ligar as duas coisas faria uma função da empresa
 * herdar, calada, as permissões de um agente de produto em operação. Entra
 * quando houver decisão registrada sobre as permissões, não antes.
 */
const JA_EXISTEM: Readonly<Record<string, string>> = {
  "3.2": "waiter",
  "3.3": "crm",
  "3.4": "whatsapp",
};

/**
 * Slugs que uma ficha de empresa NUNCA pode usar.
 *
 * Os cinco primeiros são os Essenciais que constroem este sistema e vivem em
 * `.claude/agents/`. Os quatro últimos foram aposentados em 07/08/2026 por
 * duplicarem um Essencial pelo nome.
 *
 * A tentação que esta lista contém é real e já aconteceu uma vez: criar
 * "Agente de Qualidade" na empresa e, sem perceber, colidir com o `qualidade`
 * que duvida do resultado. Nomes iguais para trabalhos diferentes custam mais
 * caro que nomes feios.
 */
export const SLUGS_PROIBIDOS: readonly string[] = [
  "qualidade",
  "cerebro",
  "interface",
  "experiencia",
  "seguranca",
  "orchestrator",
  "security-governance",
  "ui-ux",
  "qa-test",
];

const ACENTOS: Readonly<Record<string, string>> = {
  á: "a", à: "a", â: "a", ã: "a", ä: "a",
  é: "e", ê: "e", è: "e",
  í: "i", ì: "i",
  ó: "o", ô: "o", õ: "o", ò: "o",
  ú: "u", ü: "u", ù: "u",
  ç: "c",
};

/** Nome do catálogo → slug estável. Determinístico: o mesmo nome dá o mesmo slug. */
export function slugDe(nome: string): string {
  return nome
    .toLowerCase()
    .replace(/[áàâãäéêèíìóôõòúüùç]/g, (c) => ACENTOS[c] ?? c)
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const ROTULOS: ReadonlyArray<{ rotulo: string; campo: keyof FichaDaEmpresa }> = [
  { rotulo: "Pode", campo: "pode" },
  { rotulo: "Não pode também", campo: "naoPode" },
  { rotulo: "Não pode", campo: "naoPode" },
  { rotulo: "Escala quando", campo: "escalaQuando" },
  { rotulo: "Mede-se por", campo: "medeSePor" },
  { rotulo: "Regra dura", campo: "regraDura" },
];

/**
 * Quebra o texto de um campo em itens.
 *
 * O catálogo escreve em prosa separada por vírgula, e uma frase inteira num
 * `allowedActions` seria inútil na tela. Mas vírgula dentro de parêntese ou de
 * crase (`NOVO → CONTATADO`) não separa item — quebrar ali picaria a regra no
 * meio e mudaria o que ela diz.
 */
function itens(texto: string): string[] {
  const partes: string[] = [];
  let atual = "";
  let cerca = false;
  let profundidade = 0;

  for (const ch of texto) {
    if (ch === "`") cerca = !cerca;
    if (ch === "(") profundidade++;
    if (ch === ")") profundidade = Math.max(0, profundidade - 1);

    if ((ch === ";" || ch === ",") && !cerca && profundidade === 0) {
      partes.push(atual);
      atual = "";
      continue;
    }
    atual += ch;
  }
  partes.push(atual);

  return partes
    .map((p) => p.trim().replace(/\.$/, "").trim())
    .filter((p) => p.length > 0);
}

/** Remove a ênfase do markdown, preservando o texto. */
function semMarcacao(texto: string): string {
  return texto.replace(/\*\*/g, "").trim();
}

/**
 * Lê o catálogo aprovado e devolve as fichas.
 *
 * Função pura: recebe o texto, não toca em disco. Quem lê o arquivo é o seed ou
 * o teste — assim o parser é exercitável com casos sintéticos, inclusive os
 * casos ruins.
 */
export function lerCatalogo(markdown: string): FichaDaEmpresa[] {
  const fichas: FichaDaEmpresa[] = [];

  for (const bloco of markdown.split(/^### /m).slice(1)) {
    const quebra = bloco.indexOf("\n");
    const cabecalho = (quebra < 0 ? bloco : bloco.slice(0, quebra)).trim();

    const m = /^(\d+)\.(\d+)\s+(.+?)\s+·\s+(IA|HUMANO|HÍBRIDO)/.exec(cabecalho);
    if (!m) continue;

    const numero = `${m[1]}.${m[2]}`;
    const nome = m[3]!.trim();
    const modo: ModoDeExecucao = m[4] === "HÍBRIDO" ? "HIBRIDO" : (m[4] as ModoDeExecucao);

    const corpo = (quebra < 0 ? "" : bloco.slice(quebra + 1)).split(/^---$/m)[0] ?? "";

    const ficha: FichaDaEmpresa = {
      slug: slugDe(nome),
      numero,
      departamento: Number(m[1]),
      nome,
      modo,
      resumo: null,
      pode: [],
      naoPode: [],
      escalaQuando: [],
      medeSePor: [],
      regraDura: [],
      jaExisteComo: JA_EXISTEM[numero] ?? null,
    };

    for (const linha of corpo.split("\n").map((l) => l.trim()).filter(Boolean)) {
      const rotulo = ROTULOS.find((r) => linha.startsWith(`**${r.rotulo}:**`));

      if (!rotulo) {
        // Linha sem rótulo antes de qualquer campo é o resumo da ficha. As
        // fichas de gerente são escritas assim: uma frase, sem "Pode:".
        if (!ficha.resumo) ficha.resumo = semMarcacao(linha);
        continue;
      }

      const conteudo = linha.slice(`**${rotulo.rotulo}:**`.length);
      const destino = ficha[rotulo.campo] as string[];
      destino.push(...itens(semMarcacao(conteudo)));
    }

    fichas.push(ficha);
  }

  return fichas;
}

// ── DA FICHA PARA A LINHA DO BANCO ────────────────────────────────────────────

/** A ficha `x.1` de cada departamento é o Agente Gerente dele. */
export function ehAgenteGerente(ficha: FichaDaEmpresa): boolean {
  return ficha.numero.endsWith(".1");
}

export interface CargoDaFicha {
  slug: string;
  titulo: string;
  nivel: "GERENTE" | "OPERACAO";
  departamento: string;
  /** Slug do cargo a quem este se reporta. */
  reportaA: string;
}

/**
 * O cargo que corresponde a uma ficha.
 *
 * Na v3 ficha e cargo são a mesma coisa vista de dois ângulos: a ficha diz o que
 * a função pode e não pode; o cargo diz onde ela fica no organograma. Mantê-los
 * como duas listas separadas — como era na v1 — produziria duas fontes que podem
 * discordar sobre quem existe.
 *
 * A cadeia é curta, e é a regra 4 da hierarquia: o Agente Gerente se reporta ao
 * Diretor da Foocci, direto, sem camada intermediária. Não existe Gerente Geral.
 */
export function cargoDaFicha(ficha: FichaDaEmpresa, slugDoDepartamento: string): CargoDaFicha {
  const gerente = ehAgenteGerente(ficha);
  return {
    slug: ficha.slug,
    titulo: ficha.nome,
    nivel: gerente ? "GERENTE" : "OPERACAO",
    departamento: slugDoDepartamento,
    reportaA: gerente ? "diretor-foocci" : slugDoAgenteGerente(slugDoDepartamento),
  };
}

/**
 * Quem RESPONDE por uma ficha.
 *
 * Do agente comum responde o Agente Gerente do departamento. Da ficha do próprio
 * Agente Gerente responde o Diretor — senão quem cobra e quem é cobrado seriam a
 * mesma pessoa.
 */
export function cargoResponsavelPor(ficha: FichaDaEmpresa, slugDoDepartamento: string): string {
  return ehAgenteGerente(ficha) ? "diretor-foocci" : slugDoAgenteGerente(slugDoDepartamento);
}

/**
 * O slug do Agente Gerente de um departamento.
 *
 * Derivado do catálogo, não escrito à mão: quem é o gerente é sempre a ficha
 * `x.1`, e o slug dela vem do nome. Uma constante escrita à mão aqui poderia
 * discordar do catálogo no dia em que um gerente fosse renomeado.
 */
let gerentesPorDepartamento: Map<string, string> | null = null;

export function registrarGerentes(fichas: FichaDaEmpresa[], slugPorNumero: Map<number, string>) {
  gerentesPorDepartamento = new Map();
  for (const f of fichas) {
    if (!ehAgenteGerente(f)) continue;
    const dep = slugPorNumero.get(f.departamento);
    if (dep) gerentesPorDepartamento.set(dep, f.slug);
  }
}

export function slugDoAgenteGerente(slugDoDepartamento: string): string {
  const achado = gerentesPorDepartamento?.get(slugDoDepartamento);
  if (achado) return achado;
  // Sem o catálogo registrado, o nome derivado do padrão. Não é chute: é o
  // mesmo formato que `slugDe` produziria para "Agente Gerente <algo>".
  return `agente-gerente-${slugDoDepartamento}`;
}

const MODO_NO_BANCO: Readonly<Record<ModoDeExecucao, "AI" | "HUMAN" | "HYBRID">> = {
  IA: "AI",
  HUMANO: "HUMAN",
  HIBRIDO: "HYBRID",
};

/** O que o seed grava numa ficha NOVA da empresa. */
export interface PerfilNovo {
  slug: string;
  name: string;
  population: "EMPRESA";
  executionMode: "AI" | "HUMAN" | "HYBRID";
  catalogNumber: string;
  description: string | null;
  allowedActions: string[];
  forbiddenActions: string[];
  escalationRules: string[];
  evaluationCriteria: string[];
  safetyRules: string[];
  /** Nasce em rascunho, sempre. Ligar uma ficha é decisão do proprietário. */
  status: "DRAFT";
  visibility: "INTERNAL";
  isRuntimeEnabled: false;
  isGlobalDefault: false;
  version: string;
  source: string;
}

/**
 * As três regras universais do catálogo, que valem para toda ficha de IA sem
 * precisar estar repetidas em cada uma.
 *
 * Elas viram `safetyRules` — o piso que a ficha não pode baixar. Deixá-las só no
 * cabeçalho do documento faria delas um aviso; aqui elas viajam com a linha.
 */
export const REGRAS_UNIVERSAIS: readonly string[] = [
  "Nunca inventa preço, desconto, prazo, integração, funcionalidade ou número.",
  "Nunca aprova exceção financeira, jurídica, de segurança ou promessa fora do catálogo.",
  'Nunca escreve zero quando a resposta é "não sei".',
];

export function paraPerfilNovo(ficha: FichaDaEmpresa): PerfilNovo {
  return {
    slug: ficha.slug,
    name: ficha.nome,
    population: "EMPRESA",
    executionMode: MODO_NO_BANCO[ficha.modo],
    catalogNumber: ficha.numero,
    description: ficha.resumo,
    allowedActions: [...ficha.pode],
    forbiddenActions: [...ficha.naoPode],
    escalationRules: [...ficha.escalaQuando],
    evaluationCriteria: [...ficha.medeSePor],
    // Regra dura da ficha primeiro, depois o piso que vale para todas de IA.
    safetyRules:
      ficha.modo === "HUMANO"
        ? [...ficha.regraDura]
        : [...ficha.regraDura, ...REGRAS_UNIVERSAIS],
    status: "DRAFT",
    visibility: "INTERNAL",
    isRuntimeEnabled: false,
    isGlobalDefault: false,
    version: "0.1",
    source: "CATALOGO_FICHAS",
  };
}

/**
 * O que o seed grava numa ficha que JÁ EXISTE como agente de produto.
 *
 * Repare no que NÃO está aqui: `allowedActions`, `forbiddenActions`, `status`,
 * `isRuntimeEnabled`, `mission`, `population`. Um agente de produto em operação
 * tem constituição própria, e o catálogo da empresa não manda nela.
 *
 * Se este objeto ganhar um campo de conteúdo, o seed passa a poder apagar a
 * constituição do Waiter numa segunda-feira de manhã. O teste
 * "vínculo não toca em conteúdo de agente de produto" existe para isso.
 */
export interface VinculoDeFicha {
  catalogNumber: string;
  departmentId: string;
  ownerPositionId: string | null;
  managerPositionId: string | null;
}

/** Contagem por departamento — o que a tabela do catálogo afirma. */
export function porDepartamento(fichas: FichaDaEmpresa[]): Map<number, number> {
  const mapa = new Map<number, number>();
  for (const f of fichas) mapa.set(f.departamento, (mapa.get(f.departamento) ?? 0) + 1);
  return mapa;
}

/** Contagem por modo. */
export function porModo(fichas: FichaDaEmpresa[]): Record<ModoDeExecucao, number> {
  const conta: Record<ModoDeExecucao, number> = { IA: 0, HUMANO: 0, HIBRIDO: 0 };
  for (const f of fichas) conta[f.modo] += 1;
  return conta;
}
