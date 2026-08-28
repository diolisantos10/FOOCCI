/**
 * CADASTRO FRIO — a lista que vinha do Google Drive, agora dentro da Sala.
 *
 * ── O QUE ISTO SUBSTITUI, E POR QUE A PLANILHA PRECISAVA SAIR ───────────────
 *
 * Pedido do CEO em 28/08/2026: *"um espaço dentro do comercial onde eu possa
 * colocar os agentes para alimentar cadastros frios pelo navegador ao invés de
 * usar o Google Drive."*
 *
 * A planilha não era só desconfortável — ela quebrava três coisas de uma vez:
 *
 *   1. **Ninguém sabia de onde o lead veio.** E isso deixou de ser detalhe:
 *      LGPD art. 7º é lista **fechada** ("somente poderá"), e é a origem que
 *      decide qual inciso ampara a mensagem. Planilha sem coluna de origem é
 *      base que não se pode usar com segurança.
 *   2. **Duplicata era invisível.** Colar a mesma lista duas vezes dobrava a
 *      base, e dois vendedores ligavam para a mesma pessoa no mesmo dia.
 *   3. **O lead frio não entrava na fila.** Ficava fora do sistema até alguém
 *      copiar à mão — e o que se copia à mão se esquece.
 *
 * ── ⚠️ ORIGEM É OBRIGATÓRIA, E NÃO É BUROCRACIA ─────────────────────────────
 *
 * Este arquivo **recusa** cadastro sem origem declarada. Não é capricho de
 * formulário: sem ela, ninguém consegue responder depois "com que base legal a
 * gente falou com essa pessoa?" — e essa pergunta chega junto com a reclamação,
 * quando já não dá para reconstruir.
 *
 * O texto do art. 7º está copiado em `control_room/docs/juridico/base-de-leis.md`,
 * da fonte oficial. Aqui não se afirma nada sobre a lei: só se garante que o
 * dado necessário para responder exista.
 *
 * ── O QUE ESTE ARQUIVO NÃO FAZ ──────────────────────────────────────────────
 *
 * Não cria tabela nova — lead frio é `SiteLead`, como qualquer outro, com
 * `fonte` dizendo de onde veio. Não envia mensagem nenhuma: cadastrar é
 * cadastrar. E não mistura com o CRM dos restaurantes.
 */

import type { Prisma, PrismaClient, SiteLeadSource } from "@prisma/client";
import { analisarWhatsappBr } from "@/lib/whatsapp-br";
import { generateLeadCode } from "@/lib/site/leadCode";

type Cliente = PrismaClient | Prisma.TransactionClient;

// ── De onde o lead veio ──────────────────────────────────────────────────────

/**
 * As origens que um cadastro frio pode declarar.
 *
 * Curta de propósito, e cada uma diz uma coisa diferente para quem for
 * responder pela base legal depois. "OUTRO" existe porque obrigar a mentir numa
 * lista curta é pior que aceitar uma resposta honesta e vaga — mas ele **exige
 * a descrição escrita**, senão seria o mesmo que não perguntar.
 */
export const ORIGENS_FRIAS = [
  { valor: "INDICACAO", rotulo: "Indicação de alguém" },
  { valor: "PROSPECCAO", rotulo: "Prospecção nossa (rua, mapa, redes)" },
  { valor: "EVENTO", rotulo: "Evento, feira ou visita" },
  { valor: "LISTA", rotulo: "Lista recebida ou comprada" },
  { valor: "OUTRO", rotulo: "Outro — descreva" },
] as const;

export type OrigemFria = (typeof ORIGENS_FRIAS)[number]["valor"];

const VALORES: ReadonlySet<string> = new Set(ORIGENS_FRIAS.map((o) => o.valor));

export function ehOrigemValida(v: string): v is OrigemFria {
  return VALORES.has(v);
}

/**
 * A origem declarada vira `SiteLeadSource`, que é o que a tabela guarda.
 *
 * O enum do banco é mais grosso que a nossa lista de propósito — ele existe
 * desde antes e é compartilhado com o site. A descrição fina vai em `origem`
 * (texto livre), então nada se perde no caminho.
 */
export function fonteDaOrigem(o: OrigemFria): SiteLeadSource {
  return o === "INDICACAO" ? "INDICACAO" : "MANUAL";
}

// ── Uma linha colada ─────────────────────────────────────────────────────────

export interface LinhaFria {
  nome: string;
  whatsapp: string;
  estabelecimento?: string | null;
  cidade?: string | null;
}

export type ProblemaNaLinha =
  | "semNome"
  | "semWhatsapp"
  | "whatsappInvalido"
  | "repetidaNoLote";

export interface LinhaLida {
  /** O número da linha como a pessoa vê na tela, começando em 1. */
  numero: number;
  /** O texto original, para a tela poder mostrar o que deu errado. */
  bruto: string;
  linha: LinhaFria | null;
  /** Dígitos com DDI. `null` quando o telefone não passou. */
  digitos: string | null;
  problema: ProblemaNaLinha | null;
}

/**
 * O separador de colunas de uma linha colada.
 *
 * ── POR QUE A TABULAÇÃO VEM PRIMEIRO ────────────────────────────────────────
 *
 * Copiar de planilha (Google Sheets, Excel) cola **tabulado**. É o caso
 * principal, já que este arquivo existe justamente para aposentar a planilha.
 * Ponto-e-vírgula e vírgula ficam como cortesia para quem cola de um CSV.
 *
 * ⚠️ A vírgula é a última e a mais perigosa: *"Bar do Zé, 11 98888-7777"* usa
 * vírgula, mas *"Marina, sócia do bar"* também — e aí o nome viraria duas
 * colunas. Por isso ela só é tentada quando não houve tabulação nem
 * ponto-e-vírgula na linha inteira.
 */
function colunas(bruto: string): string[] {
  const sep = bruto.includes("\t") ? "\t" : bruto.includes(";") ? ";" : ",";
  return bruto.split(sep).map((c) => c.trim());
}

/**
 * O texto colado vira linhas conferidas — sem tocar em banco.
 *
 * Pura de propósito: é aqui que mora a decisão de o que é lead e o que é lixo,
 * e isso se testa com string. O banco entra só depois, e só com o que passou.
 *
 * A ordem esperada das colunas é **nome, whatsapp, estabelecimento, cidade** —
 * a mesma da planilha que isto substitui. Colunas a mais são ignoradas em vez
 * de derrubar a linha: planilha real tem coluna de anotação no fim.
 */
export function lerColagem(texto: string): LinhaLida[] {
  const vistos = new Set<string>();

  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((bruto, i): LinhaLida => {
      const numero = i + 1;
      const [nome = "", whatsapp = "", estabelecimento = "", cidade = ""] = colunas(bruto);

      if (!nome) return { numero, bruto, linha: null, digitos: null, problema: "semNome" };
      if (!whatsapp) return { numero, bruto, linha: null, digitos: null, problema: "semWhatsapp" };

      const tel = analisarWhatsappBr(whatsapp);
      if (!tel.ok) {
        return { numero, bruto, linha: null, digitos: null, problema: "whatsappInvalido" };
      }

      // ⚠️ Repetida DENTRO do lote. Sem isto, uma planilha com a mesma pessoa
      // em duas linhas criaria dois leads na mesma colagem — e a conferência
      // contra o banco não pegaria, porque nenhum dos dois existia antes.
      if (vistos.has(tel.digitos)) {
        return { numero, bruto, linha: null, digitos: tel.digitos, problema: "repetidaNoLote" };
      }
      vistos.add(tel.digitos);

      return {
        numero,
        bruto,
        linha: {
          nome,
          whatsapp: tel.formatado,
          estabelecimento: estabelecimento || null,
          cidade: cidade || null,
        },
        digitos: tel.digitos,
        problema: null,
      };
    });
}

// ── A gravação ───────────────────────────────────────────────────────────────

export interface PedidoDeCadastro {
  linhas: LinhaLida[];
  origem: OrigemFria;
  /** Obrigatória quando a origem é OUTRO; livre nas demais. */
  descricaoDaOrigem?: string | null;
  /** Quem está cadastrando. Vem da sessão, nunca do formulário. */
  autorUserId: string;
  autorNome: string;
}

export type RecusaDoCadastro =
  | "semLinhasValidas"
  | "origemInvalida"
  | "origemOutroSemDescricao";

export interface ResultadoDoCadastro {
  criados: number;
  /** Já existiam na base, pelo mesmo WhatsApp. Não são erro. */
  jaExistiam: number;
  /** Linhas que não viraram lead, com o motivo — a tela mostra uma a uma. */
  recusadas: LinhaLida[];
}

/**
 * Confere o pedido antes de encostar no banco.
 *
 * Separada da gravação porque é a metade que se testa sem banco nenhum, e
 * porque a rota precisa recusar cedo — antes de abrir transação.
 */
export function problemaNoPedido(p: {
  linhas: LinhaLida[];
  origem: string;
  descricaoDaOrigem?: string | null;
}): RecusaDoCadastro | null {
  if (!ehOrigemValida(p.origem)) return "origemInvalida";

  // ⚠️ "OUTRO" sem descrição é o mesmo que não declarar origem — e declarar
  // origem é a razão de esta tela existir. Aceitar seria abrir a porta que a
  // obrigatoriedade fecha.
  if (p.origem === "OUTRO" && !p.descricaoDaOrigem?.trim()) {
    return "origemOutroSemDescricao";
  }

  if (!p.linhas.some((l) => l.problema === null)) return "semLinhasValidas";

  return null;
}

/**
 * Grava os leads frios que passaram.
 *
 * ── POR QUE A DUPLICATA NÃO É ERRO ──────────────────────────────────────────
 *
 * Colar de novo a lista da semana passada é o que qualquer pessoa faz, e o
 * certo é **não criar nada e dizer que já existia** — não recusar o lote
 * inteiro nem duplicar em silêncio. A conta volta separada para a tela poder
 * dizer "23 novos, 7 já estavam aqui", que é a frase que dá confiança para
 * colar de novo amanhã.
 *
 * ⚠️ `whatsappDigits` **não é único no banco**, então a conferência é feita
 * aqui, numa consulta só, e não delegada a uma restrição que não existe.
 */
export async function cadastrarFrios(
  db: Cliente,
  p: PedidoDeCadastro,
  agora: Date = new Date(),
): Promise<ResultadoDoCadastro> {
  const boas = p.linhas.filter((l): l is LinhaLida & { digitos: string; linha: LinhaFria } =>
    l.problema === null && l.digitos !== null && l.linha !== null,
  );

  const recusadas = p.linhas.filter((l) => l.problema !== null);
  if (boas.length === 0) return { criados: 0, jaExistiam: 0, recusadas };

  const existentes = await db.siteLead.findMany({
    where: { whatsappDigits: { in: boas.map((l) => l.digitos) } },
    select: { whatsappDigits: true },
  });
  const jaTem = new Set(existentes.map((e) => e.whatsappDigits));

  const novas = boas.filter((l) => !jaTem.has(l.digitos));

  const descricao = p.descricaoDaOrigem?.trim() || null;
  const origemEscrita = descricao ? `${p.origem}: ${descricao}` : p.origem;

  let criados = 0;
  for (const l of novas) {
    const lead = await db.siteLead.create({
      data: {
        nome: l.linha.nome,
        whatsapp: l.linha.whatsapp,
        whatsappDigits: l.digitos,
        restaurante: l.linha.estabelecimento,
        cidade: l.linha.cidade,
        // ⚠️ A origem fica gravada em texto, e não só no enum: é ela que
        // responde "com que base a gente falou com essa pessoa?".
        origem: origemEscrita,
        fonte: fonteDaOrigem(p.origem),
        codigo: generateLeadCode(),
        createdAt: agora,
      },
      select: { id: true },
    });

    // A entrada na base é um fato da linha do tempo, como qualquer outro. Sem
    // isto, a ficha do lead abriria sem dizer como ele chegou ali.
    await db.siteLeadInteraction.create({
      data: {
        leadId: lead.id,
        tipo: "CAPTURA",
        actor: p.autorNome,
        interna: true,
        nota: `Cadastro frio — origem: ${origemEscrita}`,
        createdAt: agora,
      },
    });

    criados += 1;
  }

  return { criados, jaExistiam: boas.length - novas.length, recusadas };
}
