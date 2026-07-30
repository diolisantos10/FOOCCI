/**
 * CadastroDoCliente — a régua de "o que a gente sabe sobre esse restaurante".
 *
 * Origem, concreta: para escrever a primeira peça de um cliente foi preciso
 * procurar o @ dele e descobrir que não existia em lugar nenhum do sistema. Nem
 * o @, nem o nicho, nem a persona. Cada vez que alguém precisava, perguntava de
 * novo — e a resposta morria no WhatsApp de quem perguntou.
 *
 * O valor desta peça não é guardar campo: é DENUNCIAR O VAZIO. Um cadastro que
 * não grita o que falta vira exatamente o que já existia — uma tela bonita onde
 * ninguém repara que o Instagram nunca foi preenchido.
 *
 * Determinístico: sem banco, sem rede. Só a régua.
 */

export type GrupoDoCadastro =
  | "identificacao"
  | "redes"
  | "posicionamento"
  | "localizacao"
  | "fiscal"
  | "contatos"
  | "interno";

export interface CampoDoCadastro {
  chave: string;
  grupo: GrupoDoCadastro;
  rotulo: string;
  /** Por que este campo importa — some da tela quando está preenchido. */
  porque: string;
  /**
   * Essencial = sem isto a equipe trava de verdade em algum momento.
   * Não é "obrigatório no formulário": é o que faz alguém ter que perguntar
   * de novo para o cliente.
   */
  essencial: boolean;
  /** Campo longo → textarea. */
  longo?: boolean;
}

export const GRUPOS: { chave: GrupoDoCadastro; titulo: string; subtitulo: string }[] = [
  { chave: "identificacao",  titulo: "Identificação",   subtitulo: "Quem é o negócio, no papel e na rua." },
  { chave: "redes",          titulo: "Onde ele está",   subtitulo: "Os canais do cliente. É o que faltou quando precisamos do @." },
  { chave: "posicionamento", titulo: "Quem ele é",      subtitulo: "Nicho, persona e diferencial — o que ancora qualquer peça." },
  { chave: "localizacao",    titulo: "Localização",     subtitulo: "Onde fica e de onde atende." },
  { chave: "fiscal",         titulo: "Fiscal",          subtitulo: "O que a nota exige." },
  { chave: "contatos",       titulo: "Contatos",        subtitulo: "Com quem falar, e por onde." },
  { chave: "interno",        titulo: "Interno",         subtitulo: "Só a equipe vê. O lojista nunca." },
];

export const CAMPOS_DO_CADASTRO: CampoDoCadastro[] = [
  // ── Identificação ─────────────────────────────────────────────────────────
  { chave: "tradeName",   grupo: "identificacao", essencial: true,  rotulo: "Nome fantasia",
    porque: "é como o cliente se chama de verdade — o nome da conta pode ser outro" },
  { chave: "legalName",   grupo: "identificacao", essencial: false, rotulo: "Razão social",
    porque: "aparece em contrato e nota" },
  { chave: "cuisineType", grupo: "identificacao", essencial: false, rotulo: "Tipo de cozinha",
    porque: "a leitura rápida do segmento" },

  // ── Redes: o buraco que originou a ficha ──────────────────────────────────
  { chave: "instagram",         grupo: "redes", essencial: true,  rotulo: "Instagram",
    porque: "é o primeiro canal que a gente precisa e o que mais faltou" },
  { chave: "website",           grupo: "redes", essencial: false, rotulo: "Site",
    porque: "para onde o conteúdo manda a pessoa" },
  { chave: "googleBusinessUrl", grupo: "redes", essencial: false, rotulo: "Google Meu Negócio",
    porque: "é de onde vêm as avaliações que a gente pede" },
  { chave: "ifoodUrl",          grupo: "redes", essencial: false, rotulo: "iFood",
    porque: "mostra o que ele já vende e a que preço" },
  { chave: "facebook",          grupo: "redes", essencial: false, rotulo: "Facebook", porque: "canal secundário" },
  { chave: "tiktok",            grupo: "redes", essencial: false, rotulo: "TikTok",   porque: "canal secundário" },
  { chave: "youtube",           grupo: "redes", essencial: false, rotulo: "YouTube",  porque: "canal secundário" },

  // ── Posicionamento ────────────────────────────────────────────────────────
  { chave: "niche",              grupo: "posicionamento", essencial: true,  rotulo: "Nicho",
    porque: "hamburgueria artesanal e japonês delivery não falam igual" },
  { chave: "targetPersona",      grupo: "posicionamento", essencial: true,  longo: true, rotulo: "Persona / público",
    porque: "público genérico devolve conteúdo genérico" },
  { chave: "differentiator",     grupo: "posicionamento", essencial: false, longo: true, rotulo: "Diferencial",
    porque: "é o que substitui superlativo vazio" },
  { chave: "averageTicketRange", grupo: "posicionamento", essencial: false, rotulo: "Faixa de ticket",
    porque: "muda a oferta e o tom" },
  { chave: "brandTone",          grupo: "posicionamento", essencial: false, rotulo: "Tom da marca",
    porque: "para a peça não sair com a voz errada" },
  { chave: "mainCompetitors",    grupo: "posicionamento", essencial: false, longo: true, rotulo: "Concorrentes",
    porque: "define o norte e o que evitar" },

  // ── Localização ───────────────────────────────────────────────────────────
  { chave: "cep",          grupo: "localizacao", essencial: true,  rotulo: "CEP", porque: "ancora entrega e frete" },
  { chave: "street",       grupo: "localizacao", essencial: true,  rotulo: "Rua", porque: "endereço da loja" },
  { chave: "streetNumber", grupo: "localizacao", essencial: false, rotulo: "Número", porque: "endereço da loja" },
  { chave: "neighborhood", grupo: "localizacao", essencial: false, rotulo: "Bairro", porque: "endereço da loja" },
  { chave: "city",         grupo: "localizacao", essencial: true,  rotulo: "Cidade", porque: "define a praça" },
  { chave: "state",        grupo: "localizacao", essencial: false, rotulo: "UF", porque: "endereço da loja" },

  // ── Fiscal ────────────────────────────────────────────────────────────────
  { chave: "cnpj",                 grupo: "fiscal", essencial: true,  rotulo: "CNPJ", porque: "sem ele não existe nota nem contrato" },
  { chave: "legalName",            grupo: "fiscal", essencial: false, rotulo: "Razão social", porque: "acompanha o CNPJ" },
  { chave: "stateRegistration",    grupo: "fiscal", essencial: false, rotulo: "Inscrição estadual", porque: "exigida pela NFC-e" },
  { chave: "taxRegime",            grupo: "fiscal", essencial: false, rotulo: "Regime tributário", porque: "muda o cálculo do imposto" },
  { chave: "legalResponsibleName", grupo: "fiscal", essencial: false, rotulo: "Responsável legal", porque: "quem assina" },

  // ── Contatos ──────────────────────────────────────────────────────────────
  { chave: "ownerName",     grupo: "contatos", essencial: true,  rotulo: "Dono", porque: "é quem decide e aprova" },
  { chave: "ownerWhatsapp", grupo: "contatos", essencial: true,  rotulo: "WhatsApp do dono", porque: "o canal real de decisão" },
  { chave: "mainPhone",     grupo: "contatos", essencial: false, rotulo: "Telefone da loja", porque: "contato público" },
  { chave: "mainEmail",     grupo: "contatos", essencial: false, rotulo: "E-mail principal", porque: "contrato e cobrança" },
  { chave: "managerName",   grupo: "contatos", essencial: false, rotulo: "Gerente", porque: "quem toca o dia a dia" },

  // ── Interno ───────────────────────────────────────────────────────────────
  { chave: "leadSource",    grupo: "interno", essencial: false, rotulo: "Como chegou", porque: "de onde vieram os bons" },
  { chave: "internalNotes", grupo: "interno", essencial: false, longo: true, rotulo: "Anotações da equipe",
    porque: "o que a gente sabe e não cabe em campo" },
];

/** Só as chaves que a ficha escreve — trava contra campo inventado. */
export const CHAVES_DO_CADASTRO = [...new Set(CAMPOS_DO_CADASTRO.map((c) => c.chave))];

export type Cadastro = Record<string, unknown>;

function preenchido(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export interface Pendencia {
  chave: string;
  rotulo: string;
  grupo: GrupoDoCadastro;
  porque: string;
  essencial: boolean;
}

export interface AvaliacaoDoCadastro {
  /** 0–100 do ESSENCIAL preenchido. É o número que a tela mostra. */
  completude: number;
  /** Quantos campos, de todos, estão preenchidos. */
  preenchidos: number;
  total: number;
  /** O que falta, essencial primeiro — é o ponto da ficha inteira. */
  faltando: Pendencia[];
  /** Quanto falta em cada grupo, para a tela marcar a seção. */
  faltandoPorGrupo: Record<string, number>;
  /** Frase pronta: o que perguntar ao cliente na próxima conversa. */
  veredito: string;
}

/**
 * O que já se sabe e o que ainda falta perguntar.
 *
 * A completude conta só o ESSENCIAL de propósito. Um cadastro com trinta campos
 * opcionais em branco e os sete essenciais preenchidos está pronto para
 * trabalhar; um com tudo menos o Instagram, não. Média simples de todos os
 * campos esconderia exatamente essa diferença.
 */
export function avaliarCadastro(cadastro: Cadastro | null | undefined): AvaliacaoDoCadastro {
  const dados = cadastro ?? {};
  const vistos = new Set<string>();
  const faltando: Pendencia[] = [];
  let preenchidos = 0;

  for (const campo of CAMPOS_DO_CADASTRO) {
    // legalName aparece em dois grupos (identificação e fiscal) — conta uma vez.
    if (vistos.has(campo.chave)) continue;
    vistos.add(campo.chave);

    if (preenchido(dados[campo.chave])) {
      preenchidos++;
      continue;
    }
    faltando.push({
      chave: campo.chave, rotulo: campo.rotulo, grupo: campo.grupo,
      porque: campo.porque, essencial: campo.essencial,
    });
  }

  const essenciais = CAMPOS_DO_CADASTRO.filter((c, i, arr) => c.essencial && arr.findIndex((x) => x.chave === c.chave) === i);
  const essenciaisOk = essenciais.filter((c) => preenchido(dados[c.chave])).length;
  const completude = essenciais.length === 0 ? 100 : Math.round((essenciaisOk / essenciais.length) * 100);

  faltando.sort((a, b) => Number(b.essencial) - Number(a.essencial));

  const faltandoPorGrupo: Record<string, number> = {};
  for (const p of faltando) faltandoPorGrupo[p.grupo] = (faltandoPorGrupo[p.grupo] ?? 0) + 1;

  const essenciaisFaltando = faltando.filter((p) => p.essencial);
  const veredito =
    essenciaisFaltando.length === 0
      ? faltando.length === 0
        ? "Cadastro completo."
        : `O essencial está todo aqui. Faltam ${faltando.length} campo(s) opcional(is).`
      : `Falta perguntar: ${essenciaisFaltando.slice(0, 4).map((p) => p.rotulo).join(", ")}` +
        (essenciaisFaltando.length > 4 ? ` (+${essenciaisFaltando.length - 4})` : "") + ".";

  return { completude, preenchidos, total: vistos.size, faltando, faltandoPorGrupo, veredito };
}

/** Só o que a ficha pode escrever. Chave fora da lista é descartada. */
export function sanitizarCadastro(entrada: Record<string, unknown>): Record<string, string | null> {
  const saida: Record<string, string | null> = {};
  for (const chave of CHAVES_DO_CADASTRO) {
    if (!(chave in entrada)) continue;
    const v = entrada[chave];
    if (v === null) { saida[chave] = null; continue; }
    if (typeof v !== "string") continue;
    const limpo = v.trim();
    saida[chave] = limpo.length > 0 ? limpo.slice(0, 4000) : null;
  }
  return saida;
}
