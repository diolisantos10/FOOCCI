// Universal Import Field Mapper
// Maps arbitrary CSV/XLSX headers to Foocci canonical fields via fuzzy matching.
// Does NOT execute imports — detection and validation only.

// ── Canonical field definitions ───────────────────────────────────────────────

export type FieldGroup =
  | "identity"
  | "metrics"
  | "contact"
  | "address"
  | "product"
  | "system";

export interface CanonicalField {
  key:          string;
  label:        string;        // Portuguese display label
  group:        FieldGroup;
  required:     boolean;
  aliases:      string[];      // normalized (lower, no accents, no spaces) aliases
  parseType:    "string" | "phone" | "decimal" | "integer" | "date" | "boolean";
  description:  string;
}

export const CANONICAL_FIELDS: CanonicalField[] = [
  // ── Identity ────────────────────────────────────────────────────────────────
  {
    key: "phone", label: "Telefone", group: "identity", required: false,
    aliases: ["telefone","phone","celular","fone","tel","whatsapp","mobile","contato"],
    parseType: "phone",
    description: "Número de telefone (E.164 ou formato brasileiro)",
  },
  {
    key: "name", label: "Nome", group: "identity", required: false,
    aliases: ["nome","name","cliente","customer","razao","razaosocial","nomecompleto","fullname"],
    parseType: "string",
    description: "Nome completo do cliente",
  },
  {
    key: "document", label: "CPF/CNPJ", group: "identity", required: false,
    aliases: ["cpf","cnpj","cpfcnpj","documento","document","taxid","tax_id","cpf/cnpj"],
    parseType: "string",
    description: "CPF ou CNPJ do cliente",
  },
  {
    key: "email", label: "E-mail", group: "identity", required: false,
    aliases: ["email","e-mail","mail","correio","emailcliente"],
    parseType: "string",
    description: "Endereço de e-mail",
  },
  {
    key: "birthDate", label: "Data de nascimento", group: "identity", required: false,
    aliases: ["aniversario","aniversario","nascimento","birthday","datanascimento","dataaniversario","birthdate","birth_date","dt_nasc"],
    parseType: "date",
    description: "Data de nascimento (DD/MM/YYYY ou YYYY-MM-DD)",
  },

  // ── Metrics ─────────────────────────────────────────────────────────────────
  {
    key: "importedOrderCount", label: "Qtd. pedidos", group: "metrics", required: false,
    aliases: ["qtdpedidos","quantidadepedidos","pedidos","totalpedidos","ordercount","totalorders","qtd_pedidos","numeropedidos","numorders"],
    parseType: "integer",
    description: "Total de pedidos históricos",
  },
  {
    key: "importedTotalSpent", label: "Total gasto", group: "metrics", required: false,
    aliases: ["valortotal","totalgasto","gastototal","totalspend","totalspent","lifetimevalue","receita","totalreceita","spent","totalfaturado"],
    parseType: "decimal",
    description: "Valor total histórico gasto",
  },
  {
    key: "averageTicket", label: "Ticket médio", group: "metrics", required: false,
    aliases: ["ticketmedio","ticketmediototal","averageticket","avgordervalue","ticketmedioglobal","avgticket","mediacompra"],
    parseType: "decimal",
    description: "Ticket médio do cliente",
  },
  {
    key: "importedLastOrderAt", label: "Última compra", group: "metrics", required: false,
    aliases: ["ultimacompra","ultimopedido","lastpurchase","lastorderat","lastorder","dataultimopedido","dataultimacompra","lastorderdate"],
    parseType: "date",
    description: "Data da última compra",
  },
  {
    key: "financialBalanceTotal", label: "Saldo financeiro", group: "metrics", required: false,
    aliases: ["saldofinanceiro","saldo","balance","financialbalance","creditbalance","saldocliente"],
    parseType: "decimal",
    description: "Saldo financeiro/crédito do cliente",
  },
  {
    key: "financialBalancePeriod", label: "Período do saldo", group: "metrics", required: false,
    aliases: ["periodosaldo","saldoperiodo","balanceperiod","periodofinanceiro"],
    parseType: "string",
    description: "Período de referência do saldo",
  },

  // ── Contact status ──────────────────────────────────────────────────────────
  {
    key: "crmContactable", label: "Contactável via CRM", group: "contact", required: false,
    aliases: ["contactavel","contato","crmcontactable","podecontatar","opt_in","optin","contatavel"],
    parseType: "boolean",
    description: "Se o cliente aceita contato via CRM",
  },
  {
    key: "contactStatus", label: "Status de contato", group: "contact", required: false,
    aliases: ["statuscontato","contactstatus","statuscliente","statuscomunicacao"],
    parseType: "string",
    description: "Status do contato (ativo, bloqueado, etc.)",
  },
  {
    key: "dataEnrichmentStatus", label: "Status de enriquecimento", group: "contact", required: false,
    aliases: ["statusenriquecimento","enrichmentstatus","dataenrichmentstatus","enriquecimento"],
    parseType: "string",
    description: "Status de enriquecimento de dados",
  },
  {
    key: "internalNotes", label: "Observações internas", group: "contact", required: false,
    aliases: ["observacoes","observacao","notas","notes","internalnotes","obs","observacaointerna","observacoes_internas","nota"],
    parseType: "string",
    description: "Anotações internas sobre o cliente",
  },

  // ── Address ─────────────────────────────────────────────────────────────────
  {
    key: "addressLine", label: "Endereço", group: "address", required: false,
    aliases: ["endereco","address","logradouro","rua","street","enderecocompleto"],
    parseType: "string",
    description: "Logradouro / rua",
  },
  {
    key: "number", label: "Número", group: "address", required: false,
    aliases: ["numero","number","num","nr","nro","numerocasa","complementonumero"],
    parseType: "string",
    description: "Número do endereço",
  },
  {
    key: "neighborhood", label: "Bairro", group: "address", required: false,
    aliases: ["bairro","neighborhood","district"],
    parseType: "string",
    description: "Bairro",
  },
  {
    key: "city", label: "Cidade", group: "address", required: false,
    aliases: ["cidade","city","municipio","localidade"],
    parseType: "string",
    description: "Cidade",
  },
  {
    key: "state", label: "Estado", group: "address", required: false,
    aliases: ["estado","state","uf","provincia"],
    parseType: "string",
    description: "Estado / UF",
  },
  {
    key: "zipCode", label: "CEP", group: "address", required: false,
    aliases: ["cep","zipcode","zip","postalcode","codigopostal"],
    parseType: "string",
    description: "CEP / código postal",
  },
  {
    key: "complement", label: "Complemento", group: "address", required: false,
    aliases: ["complemento","complement","apto","apartamento","bloco"],
    parseType: "string",
    description: "Complemento de endereço",
  },
  {
    key: "reference", label: "Referência", group: "address", required: false,
    aliases: ["referencia","reference","pontoreferencia","ponto_de_referencia"],
    parseType: "string",
    description: "Ponto de referência",
  },

  // ── Product aggregate fields ─────────────────────────────────────────────────
  {
    key: "rowType", label: "Tipo de linha", group: "product", required: false,
    aliases: ["tipoline","rowtype","tipo","tiporegistro","tipodado","row_type"],
    parseType: "string",
    description: "Tipo de linha (produto / categoria / totalizador)",
  },
  {
    key: "categoryName", label: "Categoria", group: "product", required: false,
    aliases: ["categoria","category","categoryname","nomecategoria","grupoproduto","grupo"],
    parseType: "string",
    description: "Nome da categoria do produto",
  },
  {
    key: "productName", label: "Nome do produto", group: "product", required: false,
    aliases: ["produto","product","nomeproduto","productname","descricao","descricaoproduto","item","descricaoitem"],
    parseType: "string",
    description: "Nome do produto",
  },
  {
    key: "quantitySold", label: "Quantidade vendida", group: "product", required: false,
    aliases: ["quantidadevendida","qtdvendida","quantityvendida","quantitysold","qtdvend","vendido","qtditens"],
    parseType: "integer",
    description: "Quantidade total vendida",
  },
  {
    key: "grossRevenue", label: "Receita bruta", group: "product", required: false,
    aliases: ["receitabruta","grossrevenue","faturamentobruto","receita","faturamento","revenue","valorbruto"],
    parseType: "decimal",
    description: "Receita bruta do produto/categoria",
  },
  {
    key: "percent", label: "Percentual", group: "product", required: false,
    aliases: ["percentual","percent","porcentagem","participacao","share","pct","porcentual"],
    parseType: "decimal",
    description: "Percentual de participação no faturamento",
  },
  {
    key: "periodStart", label: "Início do período", group: "product", required: false,
    aliases: ["inicioperiodo","periodstart","dataini","datainicio","startdate","start_date","periodo_inicio"],
    parseType: "date",
    description: "Data de início do período de referência",
  },
  {
    key: "periodEnd", label: "Fim do período", group: "product", required: false,
    aliases: ["fimperiodo","periodend","datafim","datafinal","enddate","end_date","periodo_fim"],
    parseType: "date",
    description: "Data de fim do período de referência",
  },

  // ── System / metadata ────────────────────────────────────────────────────────
  {
    key: "sourceSystem", label: "Sistema de origem", group: "system", required: false,
    aliases: ["sistema","sourcesystem","origem","source","sistemaorigem","plataforma"],
    parseType: "string",
    description: "Sistema POS de origem (Saipos, Nemo, etc.)",
  },
  {
    key: "sourceRow", label: "Linha de origem", group: "system", required: false,
    aliases: ["linhaorigem","sourcerow","rowidorigem","linhadados","rownum"],
    parseType: "integer",
    description: "Número da linha no arquivo de origem",
  },
  {
    key: "sourceFieldName", label: "Campo de origem", group: "system", required: false,
    aliases: ["campoorigem","sourcefieldname","campodados","fieldname"],
    parseType: "string",
    description: "Nome do campo no sistema de origem",
  },
  {
    key: "importBatchId", label: "ID do lote de importação", group: "system", required: false,
    aliases: ["loteimportacao","importbatchid","batchid","jobid","importjobid","loteid"],
    parseType: "string",
    description: "Identificador do lote/job de importação",
  },
];

// ── Header normalization ───────────────────────────────────────────────────────

export function normalizeHeader(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // strip combining diacritics
    .replace(/[^a-z0-9]/g, "");        // keep only alphanumeric
}

// ── Auto-detection ─────────────────────────────────────────────────────────────

export type ConfidenceLevel = "high" | "medium" | "low" | "conflict";

export interface DetectedMapping {
  sourceHeader:   string;     // original column name from file
  canonicalKey:   string;     // matched CanonicalField.key
  canonicalLabel: string;
  confidence:     ConfidenceLevel;
  score:          number;     // 0–100
  matchedAlias:   string;     // which alias triggered the match
}

interface ScoredCandidate {
  field:        CanonicalField;
  score:        number;
  matchedAlias: string;
}

function scoreHeader(normalized: string, field: CanonicalField): ScoredCandidate | null {
  let best: ScoredCandidate | null = null;

  for (const alias of field.aliases) {
    let score = 0;

    if (normalized === alias) {
      score = 100;
    } else if (normalized.startsWith(alias) || alias.startsWith(normalized)) {
      // prefix match: shorter = more specific, penalize by length difference
      const lenDiff = Math.abs(normalized.length - alias.length);
      score = 85 - lenDiff * 3;
    } else if (normalized.includes(alias) || alias.includes(normalized)) {
      score = 65;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { field, score, matchedAlias: alias };
    }
  }

  return best;
}

export function autoDetect(headers: string[]): DetectedMapping[] {
  // normalized header → original header
  const normalized = headers.map((h) => ({ original: h, norm: normalizeHeader(h) }));

  // For each source header, find best-scoring canonical field
  const perHeader: Array<{ original: string; candidates: ScoredCandidate[] }> = normalized.map(
    ({ original, norm }) => {
      const candidates: ScoredCandidate[] = [];
      for (const field of CANONICAL_FIELDS) {
        const match = scoreHeader(norm, field);
        if (match && match.score >= 50) candidates.push(match);
      }
      candidates.sort((a, b) => b.score - a.score);
      return { original, candidates };
    }
  );

  // Greedy assignment: highest-confidence header wins each canonical slot
  // Then flag conflicting headers pointing at same canonical key
  const assignedKeys = new Map<string, { header: string; score: number }>();

  // First pass: collect best per-key
  for (const { original, candidates } of perHeader) {
    if (!candidates.length) continue;
    const top = candidates[0]!;
    const existing = assignedKeys.get(top.field.key);
    if (!existing || top.score > existing.score) {
      assignedKeys.set(top.field.key, { header: original, score: top.score });
    }
  }

  // Second pass: build result, mark conflicts
  const results: DetectedMapping[] = [];

  for (const { original, candidates } of perHeader) {
    if (!candidates.length) continue;
    const top = candidates[0]!;
    const winner = assignedKeys.get(top.field.key);
    const isConflict = winner?.header !== original;

    let confidence: ConfidenceLevel;
    if (isConflict) {
      confidence = "conflict";
    } else if (top.score >= 90) {
      confidence = "high";
    } else if (top.score >= 70) {
      confidence = "medium";
    } else {
      confidence = "low";
    }

    results.push({
      sourceHeader:   original,
      canonicalKey:   top.field.key,
      canonicalLabel: top.field.label,
      confidence,
      score:          top.score,
      matchedAlias:   top.matchedAlias,
    });
  }

  return results;
}

// ── Column mapping (user-confirmed) ───────────────────────────────────────────

export interface ColumnMapping {
  sourceHeader: string;
  canonicalKey: string;     // empty string = "ignore this column"
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

export function validateMapping(
  mappings:   ColumnMapping[],
  importType: "customers" | "products" | "generic"
): ValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  const mapped = mappings.filter((m) => m.canonicalKey !== "");

  // Duplicate target check
  const targetCount = new Map<string, number>();
  for (const { canonicalKey } of mapped) {
    targetCount.set(canonicalKey, (targetCount.get(canonicalKey) ?? 0) + 1);
  }
  for (const [key, count] of targetCount) {
    if (count > 1) {
      const field = CANONICAL_FIELDS.find((f) => f.key === key);
      errors.push(
        `Campo "${field?.label ?? key}" está mapeado para ${count} colunas. Escolha apenas uma.`
      );
    }
  }

  // Import-type specific required fields
  if (importType === "customers") {
    const hasPhone = mapped.some((m) => m.canonicalKey === "phone");
    const hasName  = mapped.some((m) => m.canonicalKey === "name");
    if (!hasPhone && !hasName) {
      warnings.push("Nenhum campo de identificação (Telefone ou Nome) mapeado — clientes podem não ser identificáveis.");
    }
  }

  if (importType === "products") {
    const hasProduct  = mapped.some((m) => m.canonicalKey === "productName");
    const hasCategory = mapped.some((m) => m.canonicalKey === "categoryName");
    if (!hasProduct && !hasCategory) {
      errors.push("Importação de produtos requer ao menos um campo de nome (Produto ou Categoria).");
    }
  }

  // Unknown canonical keys
  const validKeys = new Set(CANONICAL_FIELDS.map((f) => f.key));
  for (const { canonicalKey } of mapped) {
    if (canonicalKey && !validKeys.has(canonicalKey)) {
      errors.push(`Campo canônico desconhecido: "${canonicalKey}". Verifique o mapeamento.`);
    }
  }

  if (mapped.length === 0) {
    errors.push("Nenhuma coluna mapeada. Selecione ao menos uma coluna para importação.");
  }

  return {
    valid:  errors.length === 0,
    errors,
    warnings,
  };
}
