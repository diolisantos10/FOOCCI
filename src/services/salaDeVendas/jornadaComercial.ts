/**
 * A JORNADA COMERCIAL — EMPRESA → CONTATO → DECISOR → LEAD → OPORTUNIDADE → CLIENTE.
 *
 * ── O QUE ESTE ARQUIVO É ────────────────────────────────────────────────────
 *
 * A porta única por onde a jornada anda. O documento do CEO pede *"um único
 * registro evoluindo"*, e um registro só evolui de verdade quando existe UM
 * lugar que sabe de onde ele pode vir e para onde pode ir. Escrever `estagio`
 * direto no banco, de dentro de uma rota ou de um agente, é o jeito conhecido de
 * uma entidade aparecer em QUALIFICADA sem nunca ter tido um decisor.
 *
 * **Ninguém escreve estado da jornada fora daqui.** Isto não é preferência de
 * organização: é o único ponto onde a transição é validada E a trilha é gravada
 * na mesma operação. Quem pula esta camada grava estado sem história, e história
 * que falta não se recupera depois.
 *
 * ── O QUE ESTE ARQUIVO **NÃO** FAZ ──────────────────────────────────────────
 *
 * Não manda mensagem, não decide abordagem, não calcula score. Empresa que chega
 * a `PRONTA_PARA_SDR` entra em FILA DE TRABALHO, nunca em fila de envio — quem
 * autoriza uma mensagem a sair continua sendo `LeadContactSafety`,
 * `freioDeRitmo` e `ProspeccaoConfig`, e nada aqui afrouxa nenhum deles.
 *
 * ── IDEMPOTÊNCIA, E POR QUE ELA É REQUISITO E NÃO ELEGÂNCIA ─────────────────
 *
 * O Hunter reprocessa lote, o webhook reentrega, o cron roda duas vezes quando
 * dois agendadores acordam juntos (já aconteceu nesta casa — ver a reserva
 * atômica da rodada em `ProspeccaoConfig`). Toda função que escreve aqui pode
 * rodar duas vezes: a segunda devolve o MESMO registro e não grava um segundo
 * evento na trilha. A garantia é do banco (`chaveDeDedupe`, `chaveDeOrigem`,
 * `Cliente.oportunidadeId` único, `EventoDaJornada.chaveDeIdempotencia`), não da
 * ordem das chamadas.
 *
 * ── ESCRITA CONDICIONAL, PELO MESMO MOTIVO DE `responsavel.ts` ──────────────
 *
 * A condição de estágio vai DENTRO do `updateMany`. Ler, conferir e escrever
 * abre uma janela onde dois pedidos passam pela conferência e escrevem os dois —
 * e a janela só aparece quando a operação está cheia, que é quando ninguém pode
 * parar para investigar.
 */

import type {
  Prisma,
  PrismaClient,
  EstagioDaEmpresa,
  EstagioDaOportunidade,
  SituacaoDoCliente,
  AutorDaMensagem,
  TipoDeGatekeeper,
  ConfiancaDaInformacao,
  PrioridadeDaEmpresa,
} from "@prisma/client";

type Cliente = PrismaClient | Prisma.TransactionClient;

// ─────────────────────────────────────────────────────────────────────────────
// QUEM AGIU — IA ou gente, e o documento exige distinguir
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O autor de uma ação da jornada.
 *
 * Reusa `AutorDaMensagem` (IA/HUMANO/SISTEMA) de propósito: a casa já distingue
 * autoria assim em `LeadMensagem`, e um segundo vocabulário para a mesma
 * pergunta produziria dois relatórios de "o que a IA fez" que não batem.
 *
 * `label` é congelado no evento pela mesma doutrina de `InternalAuditEvent`: se
 * a pessoa for desativada, o histórico continua dizendo quem foi.
 */
export interface Autoria {
  autor: AutorDaMensagem;
  userId?: string | null;
  label?: string | null;
}

/** Autoria de máquina, para reprocessamento e rotina. */
export const AUTORIA_SISTEMA: Autoria = { autor: "SISTEMA", label: "sistema" };

// ─────────────────────────────────────────────────────────────────────────────
// AS MÁQUINAS DE ESTADO, PURAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O pipeline do Hunter. De cada estágio, para onde se pode ir.
 *
 * ── POR QUE VOLTAR É PERMITIDO ──────────────────────────────────────────────
 * Mesma razão do funil do lead (`funil.ts`): acontece de verdade. O decisor que
 * "estava achado" muda de emprego e a empresa volta para GATEKEEPER. Proibir
 * isso faria o operador deixar a empresa no estágio errado, que é pior do que
 * registrar o retrocesso — e o retrocesso fica na trilha com motivo.
 *
 * ── O QUE NÃO SE PERMITE ────────────────────────────────────────────────────
 * Pular a fila inteira (DESCOBERTA → QUALIFICADA num salto): uma empresa
 * qualificada sem ficha e sem decisor é uma promessa vazia para quem for vender.
 * E sair de DESCARTADA, que é terminal — desfazer descarte é correção, e
 * correção tem dono (`ehGerente`).
 */
export const TRANSICOES_DA_EMPRESA: Readonly<Record<EstagioDaEmpresa, readonly EstagioDaEmpresa[]>> = {
  DESCOBERTA: ["ENRIQUECENDO", "PRONTA_PARA_SDR", "DESCARTADA"],
  ENRIQUECENDO: ["PRONTA_PARA_SDR", "DESCOBERTA", "DESCARTADA"],
  PRONTA_PARA_SDR: ["GATEKEEPER", "DECISOR_ENCONTRADO", "ENRIQUECENDO", "DESCARTADA"],
  GATEKEEPER: ["DECISOR_ENCONTRADO", "PRONTA_PARA_SDR", "DESCARTADA"],
  DECISOR_ENCONTRADO: ["QUALIFICADA", "GATEKEEPER", "DESCARTADA"],
  QUALIFICADA: ["DECISOR_ENCONTRADO", "DESCARTADA"],
  /// Terminal. Só sai por correção de gerente.
  DESCARTADA: [],
};

/** Estágios que encerram o pipeline do Hunter. */
export const ESTAGIOS_TERMINAIS_DA_EMPRESA: readonly EstagioDaEmpresa[] = ["DESCARTADA"];

export const TRANSICOES_DA_OPORTUNIDADE: Readonly<
  Record<EstagioDaOportunidade, readonly EstagioDaOportunidade[]>
> = {
  DESCOBERTA: ["QUALIFICACAO", "PERDIDA"],
  QUALIFICACAO: ["PROPOSTA", "DESCOBERTA", "PERDIDA"],
  PROPOSTA: ["NEGOCIACAO", "QUALIFICACAO", "GANHA", "PERDIDA"],
  NEGOCIACAO: ["GANHA", "PERDIDA", "PROPOSTA"],
  /// Terminais. GANHA virou contrato; PERDIDA entrou em relatório.
  GANHA: [],
  PERDIDA: [],
};

export const ESTAGIOS_TERMINAIS_DA_OPORTUNIDADE: readonly EstagioDaOportunidade[] = ["GANHA", "PERDIDA"];

/**
 * A vida do cliente. `CANCELADO` é terminal — reconquista abre uma OPORTUNIDADE
 * nova, não ressuscita a conta antiga. É a regra do documento vista do outro
 * lado: *"o lead não volta para o início"*, e o cliente cancelado também não.
 */
export const TRANSICOES_DO_CLIENTE: Readonly<Record<SituacaoDoCliente, readonly SituacaoDoCliente[]>> = {
  EM_ATIVACAO: ["ATIVO", "EM_RISCO", "CANCELADO"],
  ATIVO: ["EM_RISCO", "INATIVO", "CANCELADO"],
  EM_RISCO: ["ATIVO", "INATIVO", "CANCELADO"],
  INATIVO: ["ATIVO", "EM_RISCO", "CANCELADO"],
  CANCELADO: [],
};

export interface Recusa {
  campo: string;
  motivo: string;
}

export interface PedidoDeMovimento<E extends string> {
  de: E;
  para: E;
  /** O gerente corrige o que o operador não pode desfazer. */
  ehGerente?: boolean;
}

function validarContra<E extends string>(
  mapa: Readonly<Record<string, readonly string[]>>,
  terminais: readonly string[],
  p: PedidoDeMovimento<E>,
  rotulo: string,
): Recusa[] {
  if (p.de === p.para) return [];

  if (terminais.includes(p.de) && !p.ehGerente) {
    return [{ campo: "de", motivo: `sair de "${p.de}" é correção, e só o gerente faz` }];
  }

  const permitidos = mapa[p.de] ?? [];
  if (!permitidos.includes(p.para) && !(terminais.includes(p.de) && p.ehGerente)) {
    return [
      {
        campo: "para",
        motivo: `${rotulo} não vai de "${p.de}" para "${p.para}" — os caminhos daqui são: ${
          permitidos.length ? permitidos.join(", ") : "nenhum"
        }`,
      },
    ];
  }

  return [];
}

export function validarMovimentoDaEmpresa(
  p: PedidoDeMovimento<EstagioDaEmpresa> & { motivoDoDescarte?: string | null },
): Recusa[] {
  const recusas = validarContra(TRANSICOES_DA_EMPRESA, ESTAGIOS_TERMINAIS_DA_EMPRESA, p, "o pipeline do Hunter");

  // Mesma regra do motivo de perda no funil do lead: descarte sem motivo não
  // vira relatório, e "o que mais nos faz descartar" fica sem resposta.
  if (p.para === "DESCARTADA" && !p.motivoDoDescarte?.trim()) {
    recusas.push({
      campo: "motivoDoDescarte",
      motivo: "descarte sem motivo não vira relatório, e a pergunta 'o que mais nos faz descartar' fica sem resposta",
    });
  }

  return recusas;
}

export function validarMovimentoDaOportunidade(
  p: PedidoDeMovimento<EstagioDaOportunidade> & { motivoPerdaId?: string | null },
): Recusa[] {
  const recusas = validarContra(
    TRANSICOES_DA_OPORTUNIDADE,
    ESTAGIOS_TERMINAIS_DA_OPORTUNIDADE,
    p,
    "a oportunidade",
  );

  if (p.para === "PERDIDA" && !p.motivoPerdaId) {
    recusas.push({
      campo: "motivoPerdaId",
      motivo: "perda sem motivo estruturado não vira relatório — use o catálogo MotivoDePerda, o mesmo do lead",
    });
  }

  return recusas;
}

export function validarMovimentoDoCliente(p: PedidoDeMovimento<SituacaoDoCliente>): Recusa[] {
  return validarContra(TRANSICOES_DO_CLIENTE, ["CANCELADO"], p, "a conta do cliente");
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAVES — dedupe e idempotência
// ─────────────────────────────────────────────────────────────────────────────

/** Só os dígitos, no mesmo formato de `SiteLead.whatsappDigits`. */
export function somenteDigitos(valor: string | null | undefined): string | null {
  const digitos = (valor ?? "").replace(/\D+/g, "");
  return digitos.length ? digitos : null;
}

/**
 * A chave que faz "descobrir a mesma empresa duas vezes" ser um `no-op`.
 *
 * ── POR QUE NÃO É CNPJ E NÃO É TELEFONE ─────────────────────────────────────
 * CNPJ quase nunca vem numa fonte de descoberta (o raio-x mediu: os únicos CNPJ
 * do código são colunas lidas de planilha). Telefone é da PESSOA, não da casa —
 * duas unidades da mesma rede publicam o mesmo número, e dedupe por telefone
 * juntaria duas empresas diferentes numa só, que é o erro caro.
 *
 * Nome + cidade + estado, normalizados sem acento e sem pontuação, erra para o
 * lado barato: duas unidades no mesmo bairro viram duas linhas, e duas linhas se
 * juntam depois. Uma fusão errada não se desfaz.
 */
export function chaveDeDedupeDaEmpresa(params: {
  nome: string;
  cidade?: string | null;
  estado?: string | null;
}): string {
  const limpa = (t: string | null | undefined) =>
    (t ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  return [limpa(params.nome), limpa(params.cidade), limpa(params.estado)].filter(Boolean).join("|");
}

// ─────────────────────────────────────────────────────────────────────────────
// A TRILHA — append-only, e ela acompanha o registro
// ─────────────────────────────────────────────────────────────────────────────

export type EntidadeDaTrilha = "EMPRESA" | "CONTATO" | "OPORTUNIDADE" | "CLIENTE";

export interface EventoParaGravar {
  entidade: EntidadeDaTrilha;
  entidadeId: string;
  tipo:
    | "CRIACAO"
    | "MUDANCA_DE_ESTAGIO"
    | "ENRIQUECIMENTO"
    | "VINCULO"
    | "GATEKEEPER_IDENTIFICADO"
    | "DECISOR_ENCONTRADO"
    | "SCORE_CALCULADO"
    | "NOTA";
  autoria: Autoria;
  empresaId?: string | null;
  contatoId?: string | null;
  oportunidadeId?: string | null;
  clienteId?: string | null;
  leadId?: string | null;
  deEstagio?: string | null;
  paraEstagio?: string | null;
  motivo?: string | null;
  nota?: string | null;
  fonte?: string | null;
  /**
   * Quando preenchida, a mesma ação não grava dois eventos. `null` = evento
   * livre (uma nota escrita à mão), que PODE repetir — duas notas iguais em
   * momentos diferentes são duas notas de verdade.
   */
  chaveDeIdempotencia?: string | null;
}

/**
 * Grava um evento da trilha. Devolve `true` se gravou, `false` se a chave já
 * existia (a ação já tinha sido registrada).
 *
 * `skipDuplicates` em vez de `create` dentro de `try/catch`: a colisão de chave
 * aqui é o caminho NORMAL do reprocessamento, e caminho normal não passa por
 * tratamento de exceção — exceção usada como fluxo esconde a exceção de verdade.
 */
export async function registrarNaTrilha(db: Cliente, evento: EventoParaGravar): Promise<boolean> {
  const criados = await db.eventoDaJornada.createMany({
    data: [
      {
        entidade: evento.entidade,
        entidadeId: evento.entidadeId,
        empresaId: evento.empresaId ?? null,
        contatoId: evento.contatoId ?? null,
        oportunidadeId: evento.oportunidadeId ?? null,
        clienteId: evento.clienteId ?? null,
        leadId: evento.leadId ?? null,
        tipo: evento.tipo,
        deEstagio: evento.deEstagio ?? null,
        paraEstagio: evento.paraEstagio ?? null,
        autor: evento.autoria.autor,
        autorUserId: evento.autoria.userId ?? null,
        autorLabel: evento.autoria.label ?? null,
        motivo: evento.motivo ?? null,
        nota: evento.nota ?? null,
        fonte: evento.fonte ?? null,
        chaveDeIdempotencia: evento.chaveDeIdempotencia ?? null,
      },
    ],
    skipDuplicates: true,
  });

  return criados.count === 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPRESA
// ─────────────────────────────────────────────────────────────────────────────

export interface EmpresaDescoberta {
  nome: string;
  cidade?: string | null;
  estado?: string | null;
  bairro?: string | null;
  categoria?: string | null;
  /** De onde veio ("planilha-outscraper", "site", "indicacao"). Obrigatório. */
  fonteDaDescoberta: string;
  loteDeProspeccaoId?: string | null;
  /** Campos opcionais da ficha, do jeito que a fonte entregou. */
  dados?: {
    site?: string | null;
    instagram?: string | null;
    facebook?: string | null;
    whatsappPublicado?: string | null;
    email?: string | null;
    telefone?: string | null;
    googleMapsUrl?: string | null;
    cnpj?: string | null;
    endereco?: string | null;
    cep?: string | null;
    numeroDeUnidades?: number | null;
    sistemaIdentificado?: string | null;
    ticketEstimadoCents?: number | null;
    deliveryProprio?: boolean | null;
    marketplaces?: string[];
    cardapioProprio?: boolean | null;
  };
}

export type ResultadoDaDescoberta =
  | { criada: true; empresaId: string }
  | { criada: false; empresaId: string; motivo: "jaExistia" };

/**
 * O Hunter achou um restaurante.
 *
 * Idempotente pela `chaveDeDedupe`: rodar o mesmo lote duas vezes devolve a
 * MESMA empresa e não grava um segundo evento de criação. A empresa que já
 * existia NÃO é sobrescrita — enriquecer é outra operação, com proveniência
 * própria, e uma descoberta nova não pode apagar um dado que alguém conferiu.
 */
export async function descobrirEmpresa(
  db: Cliente,
  params: EmpresaDescoberta & { autoria: Autoria; agora?: Date },
): Promise<ResultadoDaDescoberta> {
  const chave = chaveDeDedupeDaEmpresa(params);

  const criadas = await db.empresa.createMany({
    data: [
      {
        nome: params.nome,
        chaveDeDedupe: chave,
        cidade: params.cidade ?? null,
        estado: params.estado ?? null,
        bairro: params.bairro ?? null,
        categoria: params.categoria ?? null,
        fonteDaDescoberta: params.fonteDaDescoberta,
        // O estágio inicial é escrito de propósito, e não deixado para o
        // `@default` do banco: onde a empresa nasce é fato de negócio, e quem lê
        // este arquivo precisa vê-lo aqui, não inferir do schema.
        estagio: "DESCOBERTA",
        estagioMudouEm: params.agora ?? new Date(),
        estagioMudouPor: params.autoria.userId ?? params.autoria.autor,
        descobertaEm: params.agora ?? new Date(),
        descobertaPorAutor: params.autoria.autor,
        descobertaPorUserId: params.autoria.userId ?? null,
        loteDeProspeccaoId: params.loteDeProspeccaoId ?? null,
        ...(params.dados ?? {}),
      },
    ],
    skipDuplicates: true,
  });

  const empresa = await db.empresa.findUnique({
    where: { chaveDeDedupe: chave },
    select: { id: true },
  });

  // Não deveria acontecer: ou criamos agora, ou já existia. Se chegar aqui, algo
  // apagou a linha entre as duas escritas — e o silêncio seria pior que o erro.
  if (!empresa) throw new Error(`empresa desapareceu logo após a descoberta (chave: ${chave})`);

  if (criadas.count === 1) {
    await registrarNaTrilha(db, {
      entidade: "EMPRESA",
      entidadeId: empresa.id,
      empresaId: empresa.id,
      tipo: "CRIACAO",
      autoria: params.autoria,
      paraEstagio: "DESCOBERTA",
      fonte: params.fonteDaDescoberta,
      nota: `Empresa descoberta por ${params.fonteDaDescoberta}.`,
      chaveDeIdempotencia: `empresa:criacao:${empresa.id}`,
    });
    return { criada: true, empresaId: empresa.id };
  }

  return { criada: false, empresaId: empresa.id, motivo: "jaExistia" };
}

export type ResultadoDeMover =
  | { ok: true; mudou: boolean }
  | { ok: false; causa: "naoExiste" }
  | { ok: false; causa: "recusado"; recusas: Recusa[] }
  | { ok: false; causa: "estagioMudou"; atual: string };

/**
 * Move a empresa no pipeline do Hunter.
 *
 * `mudou: false` com `ok: true` é o caso idempotente: já estava lá, nada foi
 * escrito, nenhum evento novo. É diferente de `estagioMudou`, que quer dizer
 * "alguém mexeu debaixo de você" — e quem chamou precisa saber a diferença.
 */
export async function moverEmpresa(
  db: Cliente,
  params: {
    empresaId: string;
    de: EstagioDaEmpresa;
    para: EstagioDaEmpresa;
    autoria: Autoria;
    motivo?: string | null;
    motivoDoDescarte?: string | null;
    ehGerente?: boolean;
    agora?: Date;
  },
): Promise<ResultadoDeMover> {
  const recusas = validarMovimentoDaEmpresa(params);
  if (recusas.length) return { ok: false, causa: "recusado", recusas };

  if (params.de === params.para) return { ok: true, mudou: false };

  const agora = params.agora ?? new Date();

  const alterados = await db.empresa.updateMany({
    // A condição vai DENTRO da escrita. Ver o cabeçalho.
    where: { id: params.empresaId, estagio: params.de },
    data: {
      estagio: params.para,
      estagioMudouEm: agora,
      estagioMudouPor: params.autoria.userId ?? params.autoria.autor,
      ...(params.para === "DESCARTADA" ? { motivoDoDescarte: params.motivoDoDescarte } : {}),
    },
  });

  if (alterados.count === 1) {
    await registrarNaTrilha(db, {
      entidade: "EMPRESA",
      entidadeId: params.empresaId,
      empresaId: params.empresaId,
      tipo: "MUDANCA_DE_ESTAGIO",
      autoria: params.autoria,
      deEstagio: params.de,
      paraEstagio: params.para,
      motivo: params.motivo ?? params.motivoDoDescarte ?? null,
      chaveDeIdempotencia: `empresa:estagio:${params.empresaId}:${params.de}>${params.para}:${agora.toISOString()}`,
    });
    return { ok: true, mudou: true };
  }

  // Perdeu a corrida, já estava no destino, ou não existe. Só agora vale a pena
  // ler — e a leitura serve para EXPLICAR, não para decidir.
  const atual = await db.empresa.findUnique({
    where: { id: params.empresaId },
    select: { estagio: true },
  });

  if (!atual) return { ok: false, causa: "naoExiste" };
  if (atual.estagio === params.para) return { ok: true, mudou: false };
  return { ok: false, causa: "estagioMudou", atual: atual.estagio };
}

/**
 * Registra um dado apurado, COM a proveniência dele.
 *
 * Append-only: apurar de novo cria linha nova em `EmpresaProveniencia`, e a
 * anterior continua provando o que se sabia antes. O campo da ficha é atualizado
 * junto, numa escrita só, porque ficha sem prova e prova sem ficha divergem.
 */
export async function registrarProveniencia(
  db: Cliente,
  params: {
    empresaId: string;
    campo: string;
    valor: string | null;
    fonte: string;
    url?: string | null;
    confianca?: ConfiancaDaInformacao;
    autoria: Autoria;
    /** Quando `true`, o campo homônimo da ficha da empresa também é escrito. */
    atualizarFicha?: boolean;
    agora?: Date;
  },
): Promise<void> {
  const agora = params.agora ?? new Date();

  await db.empresaProveniencia.create({
    data: {
      empresaId: params.empresaId,
      campo: params.campo,
      valor: params.valor,
      fonte: params.fonte,
      url: params.url ?? null,
      confianca: params.confianca ?? "MEDIA",
      coletadoEm: agora,
      coletadoPorAutor: params.autoria.autor,
      coletadoPorUserId: params.autoria.userId ?? null,
    },
  });

  if (params.atualizarFicha) {
    await db.empresa.update({
      where: { id: params.empresaId },
      data: { [params.campo]: params.valor } as Prisma.EmpresaUpdateInput,
    });
  }

  await registrarNaTrilha(db, {
    entidade: "EMPRESA",
    entidadeId: params.empresaId,
    empresaId: params.empresaId,
    tipo: "ENRIQUECIMENTO",
    autoria: params.autoria,
    fonte: params.fonte,
    nota: `${params.campo}: ${params.valor ?? "(vazio)"}`,
    chaveDeIdempotencia: `empresa:enriquecimento:${params.empresaId}:${params.campo}:${agora.toISOString()}`,
  });
}

/**
 * Guarda o ICP com a conta fator a fator.
 *
 * ⚠️ `pontos` pode ser negativo e o total pode ser zero — zero aqui significa
 * "medido e não qualifica", e é diferente de `null`, que significa "ninguém
 * mediu". Escrever zero por omissão esconderia a fila de quem nunca foi avaliado.
 */
export async function registrarIcp(
  db: Cliente,
  params: {
    empresaId: string;
    fatores: { fator: string; observado: string; pontos: number }[];
    reguaVersao: number;
    prioridade?: PrioridadeDaEmpresa | null;
    autoria: Autoria;
    agora?: Date;
  },
): Promise<{ total: number }> {
  const agora = params.agora ?? new Date();
  const total = params.fatores.reduce((soma, f) => soma + f.pontos, 0);

  await db.empresaFatorIcp.createMany({
    data: params.fatores.map((f) => ({
      empresaId: params.empresaId,
      fator: f.fator,
      observado: f.observado,
      pontos: f.pontos,
      reguaVersao: params.reguaVersao,
      criadoEm: agora,
    })),
  });

  await db.empresa.update({
    where: { id: params.empresaId },
    data: {
      scoreIcp: total,
      scoreIcpEm: agora,
      reguaVersao: params.reguaVersao,
      ...(params.prioridade !== undefined ? { prioridade: params.prioridade } : {}),
    },
  });

  await registrarNaTrilha(db, {
    entidade: "EMPRESA",
    entidadeId: params.empresaId,
    empresaId: params.empresaId,
    tipo: "SCORE_CALCULADO",
    autoria: params.autoria,
    nota: `ICP ${total} (régua v${params.reguaVersao}), ${params.fatores.length} fator(es).`,
    chaveDeIdempotencia: `empresa:icp:${params.empresaId}:v${params.reguaVersao}:${agora.toISOString()}`,
  });

  return { total };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTATO E DECISOR
// ─────────────────────────────────────────────────────────────────────────────

export interface ContatoDescoberto {
  empresaId: string;
  nome: string;
  cargo?: string | null;
  canal?: string | null;
  telefone?: string | null;
  email?: string | null;
  ehDecisor?: boolean;
  ehGatekeeper?: boolean;
  tipoDeGatekeeper?: TipoDeGatekeeper | null;
  confianca?: ConfiancaDaInformacao;
  /** "informado pelo atendimento", "assinatura do site", "perfil do Instagram". */
  comoFoiDescoberto?: string | null;
  fonte?: string | null;
}

export type ResultadoDoContato =
  | { criado: true; contatoId: string }
  | { criado: false; contatoId: string; motivo: "jaExistia" };

/**
 * Registra uma pessoa da empresa — decisor OU porteiro.
 *
 * ── O PORTEIRO TAMBÉM É ATIVO DO CRM ────────────────────────────────────────
 * O documento é explícito: *"essa pessoa não é o cliente; ela é o caminho até o
 * cliente"*. A recepcionista que informou o nome da gerente vale ser guardada
 * com tipo e confiança — é ela que explica, três semanas depois, de onde saiu o
 * contato da Juliana.
 *
 * Idempotente por (empresa, telefone) quando há telefone. Sem telefone, cria —
 * é melhor duplicar um contato sem número do que recusar um decisor cujo número
 * ainda não se conhece.
 */
export async function registrarContato(
  db: Cliente,
  params: ContatoDescoberto & { autoria: Autoria; agora?: Date },
): Promise<ResultadoDoContato> {
  const digitos = somenteDigitos(params.telefone);

  const dados = {
    empresaId: params.empresaId,
    nome: params.nome,
    cargo: params.cargo ?? null,
    canal: params.canal ?? null,
    telefone: params.telefone ?? null,
    telefoneDigits: digitos,
    email: params.email ?? null,
    ehDecisor: params.ehDecisor ?? false,
    ehGatekeeper: params.ehGatekeeper ?? false,
    tipoDeGatekeeper: params.tipoDeGatekeeper ?? null,
    confianca: params.confianca ?? "MEDIA",
    comoFoiDescoberto: params.comoFoiDescoberto ?? null,
    fonte: params.fonte ?? null,
    criadoPorAutor: params.autoria.autor,
    criadoPorUserId: params.autoria.userId ?? null,
  };

  if (digitos) {
    const criados = await db.contato.createMany({ data: [dados], skipDuplicates: true });
    const contato = await db.contato.findUnique({
      where: { empresaId_telefoneDigits: { empresaId: params.empresaId, telefoneDigits: digitos } },
      select: { id: true },
    });
    if (!contato) throw new Error("contato desapareceu logo após o registro");

    if (criados.count === 1) {
      await gravarNascimentoDoContato(db, contato.id, params);
      return { criado: true, contatoId: contato.id };
    }
    return { criado: false, contatoId: contato.id, motivo: "jaExistia" };
  }

  const contato = await db.contato.create({ data: dados, select: { id: true } });
  await gravarNascimentoDoContato(db, contato.id, params);
  return { criado: true, contatoId: contato.id };
}

async function gravarNascimentoDoContato(
  db: Cliente,
  contatoId: string,
  params: ContatoDescoberto & { autoria: Autoria },
): Promise<void> {
  const tipo = params.ehDecisor
    ? ("DECISOR_ENCONTRADO" as const)
    : params.ehGatekeeper
      ? ("GATEKEEPER_IDENTIFICADO" as const)
      : ("CRIACAO" as const);

  await registrarNaTrilha(db, {
    entidade: "CONTATO",
    entidadeId: contatoId,
    contatoId,
    empresaId: params.empresaId,
    tipo,
    autoria: params.autoria,
    fonte: params.fonte ?? null,
    nota: [
      params.nome,
      params.cargo ? `(${params.cargo})` : null,
      params.ehGatekeeper && params.tipoDeGatekeeper ? `porteiro: ${params.tipoDeGatekeeper}` : null,
      params.comoFoiDescoberto ? `— ${params.comoFoiDescoberto}` : null,
    ]
      .filter(Boolean)
      .join(" "),
    chaveDeIdempotencia: `contato:criacao:${contatoId}`,
  });
}

/**
 * Liga um lead existente a uma empresa e/ou contato.
 *
 * ── ⚠️ A COSTURA COM O QUE JÁ ESTÁ NO AR ────────────────────────────────────
 * Esta é a única função que toca em `SiteLead`, e ela só PREENCHE dois campos
 * que estavam nulos. Não muda etapa, não muda responsável, não muda
 * consentimento, não toca em nada do funil. Lead sem empresa continua sem
 * empresa até alguém chamar aqui.
 *
 * Idempotente: ligar duas vezes o mesmo par não grava um segundo vínculo.
 */
export async function vincularLead(
  db: Cliente,
  params: {
    leadId: string;
    empresaId?: string | null;
    contatoId?: string | null;
    autoria: Autoria;
  },
): Promise<{ ok: true; vinculou: boolean } | { ok: false; causa: "naoExiste" } | { ok: false; causa: "nadaAVincular" }> {
  if (!params.empresaId && !params.contatoId) return { ok: false, causa: "nadaAVincular" };

  const lead = await db.siteLead.findUnique({
    where: { id: params.leadId },
    select: { id: true, empresaId: true, contatoId: true },
  });
  if (!lead) return { ok: false, causa: "naoExiste" };

  const jaEstaIgual =
    (!params.empresaId || lead.empresaId === params.empresaId) &&
    (!params.contatoId || lead.contatoId === params.contatoId);
  if (jaEstaIgual) return { ok: true, vinculou: false };

  await db.siteLead.update({
    where: { id: params.leadId },
    data: {
      ...(params.empresaId ? { empresaId: params.empresaId } : {}),
      ...(params.contatoId ? { contatoId: params.contatoId } : {}),
    },
  });

  await registrarNaTrilha(db, {
    entidade: params.empresaId ? "EMPRESA" : "CONTATO",
    entidadeId: (params.empresaId ?? params.contatoId)!,
    empresaId: params.empresaId ?? null,
    contatoId: params.contatoId ?? null,
    leadId: params.leadId,
    tipo: "VINCULO",
    autoria: params.autoria,
    nota: `Lead ${params.leadId} ligado à jornada.`,
    chaveDeIdempotencia: `vinculo:${params.leadId}:${params.empresaId ?? "-"}:${params.contatoId ?? "-"}`,
  });

  return { ok: true, vinculou: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// OPORTUNIDADE
// ─────────────────────────────────────────────────────────────────────────────

export type ResultadoDaAbertura =
  | { criada: true; oportunidadeId: string }
  | { criada: false; oportunidadeId: string; motivo: "jaExistia" };

/**
 * Abre a oportunidade.
 *
 * `chaveDeOrigem` é obrigatória e é a idempotência: quem chama decide o que
 * identifica ESTE negócio (a empresa + o motivo, o id da proposta, o lead). Sem
 * ela, um webhook reentregue abre duas negociações para o mesmo restaurante e o
 * pipeline passa a valer o dobro do que existe.
 */
export async function abrirOportunidade(
  db: Cliente,
  params: {
    empresaId: string;
    chaveDeOrigem: string;
    contatoDecisorId?: string | null;
    leadId?: string | null;
    valorPotencialCents?: number | null;
    produtoDeInteresse?: string | null;
    dorIdentificada?: string | null;
    previsaoDeFechamento?: Date | null;
    autoria: Autoria;
    agora?: Date;
  },
): Promise<ResultadoDaAbertura> {
  const agora = params.agora ?? new Date();

  const criadas = await db.oportunidade.createMany({
    data: [
      {
        empresaId: params.empresaId,
        chaveDeOrigem: params.chaveDeOrigem,
        contatoDecisorId: params.contatoDecisorId ?? null,
        leadId: params.leadId ?? null,
        valorPotencialCents: params.valorPotencialCents ?? null,
        produtoDeInteresse: params.produtoDeInteresse ?? null,
        dorIdentificada: params.dorIdentificada ?? null,
        previsaoDeFechamento: params.previsaoDeFechamento ?? null,
        estagio: "DESCOBERTA",
        estagioMudouEm: agora,
        estagioMudouPor: params.autoria.userId ?? params.autoria.autor,
        criadoEm: agora,
        criadoPorAutor: params.autoria.autor,
        criadoPorUserId: params.autoria.userId ?? null,
      },
    ],
    skipDuplicates: true,
  });

  const oportunidade = await db.oportunidade.findUnique({
    where: { chaveDeOrigem: params.chaveDeOrigem },
    select: { id: true },
  });
  if (!oportunidade) throw new Error(`oportunidade desapareceu logo após a abertura (${params.chaveDeOrigem})`);

  if (criadas.count === 1) {
    await registrarNaTrilha(db, {
      entidade: "OPORTUNIDADE",
      entidadeId: oportunidade.id,
      oportunidadeId: oportunidade.id,
      empresaId: params.empresaId,
      contatoId: params.contatoDecisorId ?? null,
      leadId: params.leadId ?? null,
      tipo: "CRIACAO",
      autoria: params.autoria,
      paraEstagio: "DESCOBERTA",
      nota: params.produtoDeInteresse ? `Interesse: ${params.produtoDeInteresse}` : null,
      chaveDeIdempotencia: `oportunidade:criacao:${oportunidade.id}`,
    });
    return { criada: true, oportunidadeId: oportunidade.id };
  }

  return { criada: false, oportunidadeId: oportunidade.id, motivo: "jaExistia" };
}

/**
 * Move a oportunidade. Para GANHA existe `ganharOportunidade`, que também faz
 * nascer o cliente — mover para GANHA por aqui é recusado de propósito, senão a
 * venda ficaria ganha sem ninguém do outro lado.
 */
export async function moverOportunidade(
  db: Cliente,
  params: {
    oportunidadeId: string;
    de: EstagioDaOportunidade;
    para: EstagioDaOportunidade;
    autoria: Autoria;
    motivo?: string | null;
    motivoPerdaId?: string | null;
    motivoPerdaDetalhe?: string | null;
    ehGerente?: boolean;
    agora?: Date;
  },
): Promise<ResultadoDeMover> {
  if (params.para === "GANHA") {
    return {
      ok: false,
      causa: "recusado",
      recusas: [
        {
          campo: "para",
          motivo: "ganhar é `ganharOportunidade` — é lá que o CLIENTE nasce, e venda ganha sem cliente não existe",
        },
      ],
    };
  }

  const recusas = validarMovimentoDaOportunidade(params);
  if (recusas.length) return { ok: false, causa: "recusado", recusas };

  if (params.de === params.para) return { ok: true, mudou: false };

  const agora = params.agora ?? new Date();

  const alterados = await db.oportunidade.updateMany({
    where: { id: params.oportunidadeId, estagio: params.de },
    data: {
      estagio: params.para,
      estagioMudouEm: agora,
      estagioMudouPor: params.autoria.userId ?? params.autoria.autor,
      ...(params.para === "PERDIDA"
        ? {
            motivoPerdaId: params.motivoPerdaId,
            motivoPerdaDetalhe: params.motivoPerdaDetalhe ?? null,
            fechadaEm: agora,
          }
        : {}),
    },
  });

  if (alterados.count === 1) {
    await registrarNaTrilha(db, {
      entidade: "OPORTUNIDADE",
      entidadeId: params.oportunidadeId,
      oportunidadeId: params.oportunidadeId,
      tipo: "MUDANCA_DE_ESTAGIO",
      autoria: params.autoria,
      deEstagio: params.de,
      paraEstagio: params.para,
      motivo: params.motivo ?? params.motivoPerdaDetalhe ?? null,
      chaveDeIdempotencia: `oportunidade:estagio:${params.oportunidadeId}:${params.de}>${params.para}:${agora.toISOString()}`,
    });
    return { ok: true, mudou: true };
  }

  const atual = await db.oportunidade.findUnique({
    where: { id: params.oportunidadeId },
    select: { estagio: true },
  });
  if (!atual) return { ok: false, causa: "naoExiste" };
  if (atual.estagio === params.para) return { ok: true, mudou: false };
  return { ok: false, causa: "estagioMudou", atual: atual.estagio };
}

export type ResultadoDoGanho =
  | { ok: true; clienteId: string; jaEraCliente: boolean }
  | { ok: false; causa: "naoExiste" }
  | { ok: false; causa: "recusado"; recusas: Recusa[] }
  | { ok: false; causa: "estagioMudou"; atual: string };

/**
 * ⭐ A OPORTUNIDADE FOI GANHA — E O CLIENTE NASCE AQUI.
 *
 * O documento não deixa margem: *"Lead NÃO volta para o início. Ele se torna
 * CLIENTE."* Hoje GANHO é o fim da linha do comercial, e o que acontece depois —
 * ativação, saúde, recompra, churn — não era medido por ninguém.
 *
 * Idempotente por construção: `Cliente.oportunidadeId` é único no banco. Ganhar
 * duas vezes devolve o mesmo cliente e não cria um segundo. A garantia é da
 * restrição, não da ordem das chamadas.
 */
export async function ganharOportunidade(
  db: Cliente,
  params: {
    oportunidadeId: string;
    de: EstagioDaOportunidade;
    autoria: Autoria;
    restaurantId?: string | null;
    receitaInicialCents?: number | null;
    motivo?: string | null;
    agora?: Date;
  },
): Promise<ResultadoDoGanho> {
  const recusas = validarMovimentoDaOportunidade({ de: params.de, para: "GANHA" });
  if (recusas.length) return { ok: false, causa: "recusado", recusas };

  const agora = params.agora ?? new Date();

  const alterados = await db.oportunidade.updateMany({
    where: { id: params.oportunidadeId, estagio: params.de },
    data: {
      estagio: "GANHA",
      estagioMudouEm: agora,
      estagioMudouPor: params.autoria.userId ?? params.autoria.autor,
      fechadaEm: agora,
    },
  });

  const oportunidade = await db.oportunidade.findUnique({
    where: { id: params.oportunidadeId },
    select: { id: true, empresaId: true, estagio: true, valorPotencialCents: true },
  });
  if (!oportunidade) return { ok: false, causa: "naoExiste" };

  if (alterados.count !== 1 && oportunidade.estagio !== "GANHA") {
    return { ok: false, causa: "estagioMudou", atual: oportunidade.estagio };
  }

  const criados = await db.cliente.createMany({
    data: [
      {
        oportunidadeId: oportunidade.id,
        empresaId: oportunidade.empresaId,
        restaurantId: params.restaurantId ?? null,
        situacao: "EM_ATIVACAO",
        situacaoMudouEm: agora,
        situacaoMudouPor: params.autoria.userId ?? params.autoria.autor,
        ganhoEm: agora,
        receitaTotalCents: params.receitaInicialCents ?? 0,
      },
    ],
    skipDuplicates: true,
  });

  const cliente = await db.cliente.findUnique({
    where: { oportunidadeId: oportunidade.id },
    select: { id: true },
  });
  if (!cliente) throw new Error("cliente desapareceu logo após o ganho");

  if (alterados.count === 1) {
    await registrarNaTrilha(db, {
      entidade: "OPORTUNIDADE",
      entidadeId: oportunidade.id,
      oportunidadeId: oportunidade.id,
      empresaId: oportunidade.empresaId,
      clienteId: cliente.id,
      tipo: "MUDANCA_DE_ESTAGIO",
      autoria: params.autoria,
      deEstagio: params.de,
      paraEstagio: "GANHA",
      motivo: params.motivo ?? null,
      chaveDeIdempotencia: `oportunidade:ganho:${oportunidade.id}`,
    });
  }

  if (criados.count === 1) {
    await registrarNaTrilha(db, {
      entidade: "CLIENTE",
      entidadeId: cliente.id,
      clienteId: cliente.id,
      empresaId: oportunidade.empresaId,
      oportunidadeId: oportunidade.id,
      tipo: "CRIACAO",
      autoria: params.autoria,
      paraEstagio: "EM_ATIVACAO",
      nota: "A oportunidade foi ganha. O lead não volta para o início: ele virou cliente.",
      chaveDeIdempotencia: `cliente:criacao:${cliente.id}`,
    });
  }

  return { ok: true, clienteId: cliente.id, jaEraCliente: criados.count === 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENTE
// ─────────────────────────────────────────────────────────────────────────────

/** Move a conta do cliente (ativação, saúde, risco, cancelamento). */
export async function moverCliente(
  db: Cliente,
  params: {
    clienteId: string;
    de: SituacaoDoCliente;
    para: SituacaoDoCliente;
    autoria: Autoria;
    motivo?: string | null;
    ehGerente?: boolean;
    agora?: Date;
  },
): Promise<ResultadoDeMover> {
  const recusas = validarMovimentoDoCliente(params);
  if (recusas.length) return { ok: false, causa: "recusado", recusas };

  if (params.de === params.para) return { ok: true, mudou: false };

  const agora = params.agora ?? new Date();

  const alterados = await db.cliente.updateMany({
    where: { id: params.clienteId, situacao: params.de },
    data: {
      situacao: params.para,
      situacaoMudouEm: agora,
      situacaoMudouPor: params.autoria.userId ?? params.autoria.autor,
      ...(params.para === "ATIVO" && params.de === "EM_ATIVACAO" ? { ativadoEm: agora } : {}),
      ...(params.para === "CANCELADO" ? { canceladoEm: agora, motivoDoCancelamento: params.motivo ?? null } : {}),
    },
  });

  if (alterados.count === 1) {
    await registrarNaTrilha(db, {
      entidade: "CLIENTE",
      entidadeId: params.clienteId,
      clienteId: params.clienteId,
      tipo: "MUDANCA_DE_ESTAGIO",
      autoria: params.autoria,
      deEstagio: params.de,
      paraEstagio: params.para,
      motivo: params.motivo ?? null,
      chaveDeIdempotencia: `cliente:situacao:${params.clienteId}:${params.de}>${params.para}:${agora.toISOString()}`,
    });
    return { ok: true, mudou: true };
  }

  const atual = await db.cliente.findUnique({
    where: { id: params.clienteId },
    select: { situacao: true },
  });
  if (!atual) return { ok: false, causa: "naoExiste" };
  if (atual.situacao === params.para) return { ok: true, mudou: false };
  return { ok: false, causa: "estagioMudou", atual: atual.situacao };
}
