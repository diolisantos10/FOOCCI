/**
 * AS FICHAS DA EMPRESA — as pessoas e agentes dos 9 departamentos da Foocci.
 *
 * ── POR QUE O CATÁLOGO É O MARKDOWN, E NÃO ESTE ARQUIVO ──
 *
 * `docs/arquitetura-operacional-foocci-v1/11-FICHAS-DOS-AGENTES.md` diz, na
 * primeira linha: *"Nenhuma ficha nasce fora deste arquivo, e nenhuma ficha vive
 * só neste arquivo."*
 *
 * Copiar as 37 fichas para dentro de um array de TypeScript cumpriria a segunda
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
  /** Número do departamento (1 a 9). */
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
 * As quatro fichas que já existem como agente de produto semeado.
 *
 * Só entram aqui identidades ÓBVIAS. `suporte-tecnico` ficou de fora de
 * propósito: ele se descreve como "engenheiro de plantão / assistência técnica
 * 24h" e encosta em DUAS fichas do catálogo (4.2 Suporte N1 e 7.3 Incidente e
 * Runbook). Escolher uma no chute faria uma função da empresa herdar, calada, as
 * permissões de um agente de produto. Fica como pergunta ao proprietário.
 */
const JA_EXISTEM: Readonly<Record<string, string>> = {
  "6.2": "waiter",
  "6.3": "crm",
  "6.4": "whatsapp",
  "6.5": "analytics-product",
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

/** Slug do cargo dono de uma ficha. Gerente cuida do seu; do gerente cuida o Geral. */
export function cargoDonoDe(ficha: FichaDaEmpresa, slugDoDepartamento: string): string {
  const ehGerente = ficha.numero.endsWith(".1");
  return ehGerente ? "gerente-geral" : `gerente-${slugDoDepartamento}`;
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
