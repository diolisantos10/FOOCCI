/**
 * A DESCOBERTA AUTOMÁTICA — a fila que se enche sozinha.
 *
 * ── ⛔ O DEFEITO, MEDIDO EM PRODUÇÃO ────────────────────────────────────────
 *
 * A rodada de prospecção rodava todo dia útil às 9h e concluía com
 * `abordados: 0, parouPor: 'filaAcabou'`. Máquina ligada, sem matéria-prima: a
 * fila só enchia quando uma pessoa subia uma planilha na tela. Fábrica sem
 * matéria-prima não é fábrica.
 *
 * ── ⭐ A COBERTURA, MEDIDA — E ELA É O LIMITE HONESTO DESTA OBRA ────────────
 *
 * Consultado o OpenStreetMap via Overpass API em 24/09/2026, cidade a cidade,
 * contando pontos de alimentação COM NOME e COM TELEFONE publicado:
 *
 *   | Cidade          | pontos | com nome | **com telefone** |  %  |
 *   |-----------------|-------:|---------:|-----------------:|----:|
 *   | Curitiba        |  1.224 |    1.150 |          **111** |  9% |
 *   | Belo Horizonte  |  1.115 |      972 |          **118** | 11% |
 *   | Florianópolis   |    814 |      746 |          **103** | 13% |
 *   | Campinas        |    693 |      637 |          **149** | 21% |
 *   | Goiânia         |    400 |      347 |           **43** | 11% |
 *   | Uberlândia      |    356 |      307 |           **22** |  6% |
 *
 * E o que NÃO deu para medir, dito como não-medido: a consulta de **São Paulo**
 * (capital) devolveu 504 duas vezes na instância pública — a capital precisa
 * ser fatiada por região, e isso não está construído aqui.
 *
 * ⚠️ **Entre 6% e 21% dos pontos têm telefone.** Esse é o número que manda, e
 * ele não melhora com código nosso: depende de o mapeador ter digitado o
 * telefone. Fingir cobertura maior seria encenação.
 *
 * ⭐ **O que isso dá, em regime:** a PRIMEIRA varredura de uma cidade média
 * entrega entre 20 e 150 contatos novos. A SEGUNDA varredura da MESMA cidade
 * entrega quase zero — o mapa não muda de um dia para o outro. Por isso a
 * descoberta **gira entre cidades** (`FOOCCI_HUNTER_CIDADES`): o volume diário
 * é "uma cidade nova por dia", não "a mesma cidade todo dia". Com a lista
 * padrão de 20 cidades, isso é da ordem de **20 a 150 contatos/dia durante
 * cerca de 20 dias úteis, e perto de zero depois** — até alguém acrescentar
 * cidades à lista.
 *
 * ⛔ **Dito com todas as letras: isto NÃO sustenta um teto diário grande para
 * sempre.** O que destrava volume permanente está escrito em
 * `openStreetMap.ts` (Receita Federal e Overture Maps — as duas gratuitas, as
 * duas exigindo uma esteira de ETL que não cabe neste processo).
 *
 * ── ⛔ AS TRAVAS, E POR QUE CADA UMA ────────────────────────────────────────
 *
 * Lixo na fila não vira mensagem perdida: vira DENÚNCIA, e denúncia derruba a
 * nota do número — que é o mesmo número do atendimento de quem já é cliente.
 * Por isso nada entra sem passar por todas as peneiras de `qualificar`:
 *
 *   1. sem telefone publicado         → fora
 *   2. telefone de forma improvável   → fora (`analisarWhatsappBr`)
 *   3. repetido na própria colheita   → fora
 *   4. ⛔ **pediu silêncio (opt-out)** → fora, SEMPRE, por caminho nenhum
 *   5. já é lead da casa              → fora (não se prospecta quem já conversa)
 *   6. já pendente na Base fria       → fora (seria abordado duas vezes)
 *   7. já descoberto antes            → fora (a mesma cidade varrida de novo)
 *
 * ⚠️ As peneiras 4, 5 e 6 se repetem depois, dentro de `importarLote` e do
 * portão de abordagem. A repetição é de propósito: aqui elas dão NOME ao
 * descarte (é isso que a auditoria lê), e lá elas são a trava.
 *
 * ── ⛔ O QUE ESTE ARQUIVO NÃO FAZ ───────────────────────────────────────────
 *
 * **Não aborda ninguém.** Não cria lead, não preenche consentimento (nem
 * poderia: consentimento sem ato é consentimento falso), não mexe em teto,
 * janela de 24h, descanso nem limite de recusas. Ele enche a fila; quem aborda
 * é `abordarDaFila.ts`, no horário dele, com os interruptores dele. Com a
 * prospecção desligada, a fila cheia continua sem abordar ninguém — e é assim
 * que tem que ser.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import { analisarWhatsappBr } from "@/lib/whatsapp-br";
import { acharLeadPeloTelefone } from "../casamento";
import { importarLote, MAX_LINHAS_POR_IMPORTACAO, type LinhaDaLista } from "../lote";
import {
  abrirImportacao,
  concluirImportacao,
  falharImportacao,
  somarParteNaImportacao,
} from "../importacao";
import {
  ATRIBUICAO_OSM,
  buscarNaCidade,
  type RestauranteDescoberto,
} from "./openStreetMap";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** Quem assina os lotes da descoberta. Não é gente, e o registro não finge que é. */
export const AUTOR_DA_DESCOBERTA = "descoberta-automatica";

/** A etiqueta que marca todo item vindo daqui. É por ela que se audita a origem. */
export const ETIQUETA_DA_DESCOBERTA = "descoberta-automatica";

/** A etiqueta da fonte. Uma por fonte — no dia em que houver a segunda, ela se distingue. */
export const ETIQUETA_DA_FONTE_OSM = "fonte:openstreetmap";

/**
 * As cidades da rotação padrão.
 *
 * ⚠️ Lista PADRÃO, não lista definitiva — `FOOCCI_HUNTER_CIDADES` troca sem
 * deploy. Ela existe porque o contrário seria pior: um agendador que só roda
 * quando alguém configura uma variável é uma máquina construída e desligada, e
 * esse é o defeito que esta casa mais repete.
 */
export const CIDADES_PADRAO = [
  "Goiânia",
  "Campinas",
  "Curitiba",
  "Belo Horizonte",
  "Ribeirão Preto",
  "Uberlândia",
  "Florianópolis",
  "Londrina",
  "Sorocaba",
  "Juiz de Fora",
  "São José dos Campos",
  "Niterói",
  "Santos",
  "Maringá",
  "Joinville",
  "Caxias do Sul",
  "Vitória",
  "Natal",
  "São Luís",
  "Cuiabá",
];

export function cidadesConfiguradas(env: NodeJS.ProcessEnv = process.env): string[] {
  const bruto = (env.FOOCCI_HUNTER_CIDADES ?? "").trim();
  if (bruto === "") return CIDADES_PADRAO;
  const lista = bruto
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c !== "");
  return lista.length > 0 ? lista : CIDADES_PADRAO;
}

/**
 * Quantas cidades a varredura de um dia consulta. Uma por padrão.
 *
 * ── POR QUE UMA, E NÃO TODAS ────────────────────────────────────────────────
 *
 * Duas razões, e as duas contam. A primeira é a instância pública: o uso justo
 * da Overpass é generoso (~10 mil requisições/dia), mas a boa vizinhança de
 * quem usa de graça é gastar o mínimo. A segunda é maior: varrer as 20 cidades
 * no primeiro dia encheria a fila com ~1.500 contatos de uma vez e deixaria os
 * 19 dias seguintes em zero — e o teto de abordagem da casa não os consumiria
 * nesse ritmo de qualquer forma. Um pouco todo dia é o que a máquina digere.
 */
export function cidadesPorDia(env: NodeJS.ProcessEnv = process.env): number {
  const n = parseInt((env.FOOCCI_HUNTER_CIDADES_POR_DIA ?? "").trim(), 10);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : 1;
}

/**
 * Quais cidades saem HOJE — a roda que gira.
 *
 * O ponto de partida é o dia desde a Época, e não um contador guardado: assim
 * a rotação não depende de nenhum estado que possa se perder, e dois processos
 * que rodem no mesmo dia escolhem exatamente a mesma cidade (o que a reserva
 * atômica já impediria, mas duas defesas custam uma linha).
 */
export function cidadesDeHoje(
  agora: Date,
  cidades: readonly string[],
  quantas: number,
): string[] {
  if (cidades.length === 0) return [];
  const dia = Math.floor(agora.getTime() / 86_400_000);
  const escolhidas: string[] = [];
  for (let i = 0; i < Math.min(quantas, cidades.length); i++) {
    escolhidas.push(cidades[(dia * quantas + i) % cidades.length]!);
  }
  return escolhidas;
}

/** Por que uma ficha descoberta NÃO entrou na fila. Chave de agregação e texto de tela. */
export const DESCARTE = {
  semTelefone: "Sem telefone publicado na fonte",
  telefoneImprovavel: "Telefone com formato improvável",
  repetidoNaColheita: "Repetido dentro da própria varredura",
  pediuSilencio: "Pediu para não receber mais",
  jaEraLead: "Já existe como lead na base",
  jaEstavaNaFila: "Já estava pendente na Base fria",
  jaDescoberto: "Já descoberto em varredura anterior",
} as const;

export interface FichaQualificada {
  ficha: RestauranteDescoberto;
  digitos: string;
  linha: LinhaDaLista;
}

export interface Qualificacao {
  aprovadas: FichaQualificada[];
  descartes: Record<string, number>;
}

/**
 * Traduz uma ficha da fonte na linha que a importação entende.
 *
 * ⚠️ `tags` carrega a ORIGEM: a etiqueta da descoberta, a etiqueta da fonte e
 * o id do ponto na fonte. Sem isso ninguém consegue auditar de onde saiu uma
 * abordagem — e "de onde saiu" é a primeira pergunta de quem foi abordado.
 */
export function linhaDaFicha(ficha: RestauranteDescoberto, quando: Date): LinhaDaLista {
  return {
    // `nome` é o responsável e a fonte aberta não o traz — deixar em branco é a
    // verdade. Escrever o nome do restaurante aqui faria a mensagem chamar a
    // loja de "você", e quem lê percebe.
    nome: null,
    whatsapp: ficha.telefone ?? "",
    empresa: ficha.nome,
    cidade: ficha.cidade,
    estado: ficha.estado,
    tipo: ficha.tipo,
    bairro: ficha.bairro,
    endereco: ficha.endereco,
    cep: ficha.cep,
    site: ficha.site,
    instagram: ficha.instagram,
    observacoes:
      `Descoberto automaticamente em ${quando.toISOString().slice(0, 10)} ` +
      `na fonte aberta OpenStreetMap (${ficha.idNaFonte})` +
      (ficha.mapaUrl ? ` — ${ficha.mapaUrl}` : ""),
    tags: [ETIQUETA_DA_DESCOBERTA, ETIQUETA_DA_FONTE_OSM, ficha.idNaFonte],
  };
}

/**
 * ⭐ A PENEIRA. Nada entra na fila sem passar por ela inteira.
 *
 * Somente LEITURA: não cria, não altera e não apaga nada. Quem escreve é
 * `encherAFila`, depois — e a separação é a mesma lição de `selecao.ts`, onde
 * um código que escrevia "enquanto só olhava" queimou cem contatos.
 */
export async function qualificar(
  db: Cliente,
  fichas: readonly RestauranteDescoberto[],
  agora: Date,
): Promise<Qualificacao> {
  const aprovadas: FichaQualificada[] = [];
  const descartes: Record<string, number> = {};
  const vistos = new Set<string>();

  const recusar = (motivo: string) => {
    descartes[motivo] = (descartes[motivo] ?? 0) + 1;
  };

  for (const ficha of fichas) {
    if (ficha.telefone === null) {
      recusar(DESCARTE.semTelefone);
      continue;
    }

    const analise = analisarWhatsappBr(ficha.telefone);
    if (!analise.ok) {
      recusar(DESCARTE.telefoneImprovavel);
      continue;
    }
    const digitos = analise.digitos;

    if (vistos.has(digitos)) {
      recusar(DESCARTE.repetidoNaColheita);
      continue;
    }
    vistos.add(digitos);

    // ── ⛔ O OPT-OUT VEM ANTES DE TUDO O QUE ESCREVE ─────────────────────────
    //
    // `acharLeadPeloTelefone` casa pelos formatos legados da base — e é por
    // isso que ele está aqui e não uma igualdade simples: o lead que pediu
    // silêncio gravado no formato antigo passaria por uma comparação exata e
    // voltaria para a fila como contato novo. Quem saiu nunca volta.
    const lead = await acharLeadPeloTelefone(db, digitos);
    if (lead?.optOutAt) {
      recusar(DESCARTE.pediuSilencio);
      continue;
    }
    if (lead) {
      recusar(DESCARTE.jaEraLead);
      continue;
    }

    const jaNaFila = await db.itemDeProspeccao.findFirst({
      where: { whatsappDigits: digitos, situacao: "PENDENTE" },
      select: { id: true },
    });
    if (jaNaFila) {
      recusar(DESCARTE.jaEstavaNaFila);
      continue;
    }

    // A mesma cidade varrida de novo devolve os mesmos pontos. Sem esta
    // peneira, um ponto RECUSADO ou já ABORDADO voltaria como contato novo a
    // cada varredura — e seria abordado outra vez.
    const jaDescoberto = await db.itemDeProspeccao.findFirst({
      where: { tags: { has: ficha.idNaFonte } },
      select: { id: true },
    });
    if (jaDescoberto) {
      recusar(DESCARTE.jaDescoberto);
      continue;
    }

    aprovadas.push({ ficha, digitos, linha: linhaDaFicha(ficha, agora) });
  }

  return { aprovadas, descartes };
}

export interface ResultadoDaDescoberta {
  /** Quantas cidades foram efetivamente consultadas. */
  cidades: string[];
  /** Cidades que a fonte não respondeu hoje, com o motivo. */
  cidadesQueFalharam: { cidade: string; detalhe: string }[];
  /** Pontos com nome que a fonte devolveu. */
  encontrados: number;
  /** ⭐ Quantos contatos NOVOS entraram na fila. É o número que importa. */
  entraramNaFila: number;
  descartes: Record<string, number>;
  /** O registro da importação, para a aba Importações. `null` se nada entrou. */
  importacaoId: string | null;
}

/**
 * ⭐ A VARREDURA DO DIA: descobre, qualifica e enche a fila.
 *
 * Tudo que fala com o mundo entra por `buscar`, que é injetável — o teste
 * roda a obra inteira sem tocar em rede nenhuma.
 */
export async function descobrirEEncherAFila(
  db: Cliente,
  opcoes: {
    agora: Date;
    cidades?: string[];
    buscar?: (cidade: string) => Promise<RestauranteDescoberto[]>;
  },
): Promise<ResultadoDaDescoberta> {
  const agora = opcoes.agora;
  const cidades =
    opcoes.cidades ??
    cidadesDeHoje(agora, cidadesConfiguradas(), cidadesPorDia());
  const buscar = opcoes.buscar ?? ((cidade: string) => buscarNaCidade(cidade));

  const fichas: RestauranteDescoberto[] = [];
  const cidadesQueFalharam: { cidade: string; detalhe: string }[] = [];
  const cidadesLidas: string[] = [];

  for (const cidade of cidades) {
    try {
      const achadas = await buscar(cidade);
      fichas.push(...achadas);
      cidadesLidas.push(cidade);
    } catch (e) {
      // ⚠️ Uma cidade que não responde NÃO derruba as outras nem a varredura.
      // Ela vira uma linha no relatório — que é o que permite perceber que a
      // fonte está fora do ar, em vez de ver "0 descobertos" sem explicação.
      cidadesQueFalharam.push({
        cidade,
        detalhe: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const { aprovadas, descartes } = await qualificar(db, fichas, agora);

  if (aprovadas.length === 0) {
    return {
      cidades: cidadesLidas,
      cidadesQueFalharam,
      encontrados: fichas.length,
      entraramNaFila: 0,
      descartes,
      importacaoId: null,
    };
  }

  const rotulo = `Descoberta automática — ${cidadesLidas.join(", ")} — ${agora
    .toISOString()
    .slice(0, 10)}`;

  // O LIVRO da varredura nasce ANTES de qualquer item entrar: a varredura que
  // falha no meio é justamente a que precisa estar registrada.
  const importacaoId = await abrirImportacao(db, {
    arquivoNome: rotulo,
    arquivoTipo: "descoberta/openstreetmap",
    linhasTotais: fichas.length,
    // A base legal declarada — é ela que o portão de abordagem lê, e é ela que
    // responde "de onde vocês tiraram o meu telefone?".
    proveniencia: ATRIBUICAO_OSM,
    canalDeObtencao: "OpenStreetMap / Overpass API",
    criadoPor: AUTOR_DA_DESCOBERTA,
    criadoPorUserId: AUTOR_DA_DESCOBERTA,
    criadoPorNome: "Descoberta automática",
  });

  let entraramNaFila = 0;

  try {
    // As partes existem porque `importarLote` recusa mais de 500 linhas de uma
    // vez — o mesmo teto que vale para a planilha vale aqui.
    for (let i = 0; i < aprovadas.length; i += MAX_LINHAS_POR_IMPORTACAO) {
      const parte = aprovadas.slice(i, i + MAX_LINHAS_POR_IMPORTACAO);
      const resultado = await importarLote(db, {
        nome: rotulo,
        proveniencia: ATRIBUICAO_OSM,
        linhas: parte.map((a) => a.linha),
        criadoPor: AUTOR_DA_DESCOBERTA,
        // ⚠️ Sem `criadoPorUserId` o lote entra e NENHUM item é abordado:
        // `abordarDaFila` pula lote sem responsável. A descoberta não tem
        // sessão de gente, e o responsável declarado é ela mesma — que é a
        // verdade, e é auditável.
        criadoPorUserId: AUTOR_DA_DESCOBERTA,
        importacaoId,
      });
      await somarParteNaImportacao(db, importacaoId, resultado);
      entraramNaFila += resultado.aceitas;
    }

    await concluirImportacao(db, importacaoId);
  } catch (e) {
    await falharImportacao(db, importacaoId, e instanceof Error ? e.message : String(e));
    throw e;
  }

  return {
    cidades: cidadesLidas,
    cidadesQueFalharam,
    encontrados: fichas.length,
    entraramNaFila,
    descartes,
    importacaoId,
  };
}
