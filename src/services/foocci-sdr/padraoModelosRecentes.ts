import { Prisma, type PrismaClient } from "@prisma/client";
import { metaGraphUrl } from "@/services/whatsapp/metaFlag";
import {
  comOTokenDeVendas,
  foocciSalesPhoneNumberId,
} from "./FoocciSalesChannel";
import {
  contaDoNumeroDeVendas,
  ehFalha,
  graphAbsoluto,
} from "./modelosDaMeta";

type Cliente = PrismaClient | Prisma.TransactionClient;

const QUANTOS_NO_PADRAO = 6;
const TETO_DE_PAGINAS = 10;

export interface CandidatoAoPadrao {
  nome: string;
  idioma: string;
  categoria: string | null;
  situacao: string;
  atualizadoEm: string | null;
  temCorpo: boolean;
}

export type SelecaoDosMaisRecentes =
  | { ok: true; modelos: CandidatoAoPadrao[] }
  | { ok: false; erro: string };

export type ResultadoDoPadrao =
  | { ok: true; alterou: boolean; modelos: string[] }
  | { ok: false; erro: string };

function idiomaEhPtBr(idioma: string): boolean {
  return idioma.trim().toLowerCase().replace("-", "_") === "pt_br";
}

/**
 * A régua do pedido do CEO: os seis templates de MARKETING, pt-BR e APPROVED
 * com edição mais recente na própria Meta. A data da sincronização local não
 * serve para isso: uma varredura atualiza todos no mesmo instante.
 */
export function selecionarSeisMaisRecentes(
  candidatos: readonly CandidatoAoPadrao[],
): SelecaoDosMaisRecentes {
  const elegiveis = candidatos.filter(
    (m) =>
      m.situacao.toUpperCase() === "APPROVED" &&
      (m.categoria ?? "").toUpperCase() === "MARKETING" &&
      idiomaEhPtBr(m.idioma) &&
      m.temCorpo,
  );

  const semData = elegiveis.filter(
    (m) => !m.atualizadoEm || !Number.isFinite(Date.parse(m.atualizadoEm)),
  );
  if (semData.length > 0) {
    return {
      ok: false,
      erro:
        "A Meta não devolveu a data da última edição de todos os templates elegíveis; " +
        "não é seguro adivinhar quais são os seis mais recentes.",
    };
  }

  const modelos = [...elegiveis]
    .sort((a, b) => {
      const porData = Date.parse(b.atualizadoEm!) - Date.parse(a.atualizadoEm!);
      if (porData !== 0) return porData;
      const porNome = a.nome.localeCompare(b.nome, "pt-BR");
      if (porNome !== 0) return porNome;
      return a.idioma.localeCompare(b.idioma, "pt-BR");
    })
    .slice(0, QUANTOS_NO_PADRAO);

  return { ok: true, modelos };
}

function temCorpo(components: unknown): boolean {
  if (!Array.isArray(components)) return false;
  const body = components.find(
    (c) => String((c as { type?: unknown })?.type ?? "").toUpperCase() === "BODY",
  );
  const texto = (body as { text?: unknown } | undefined)?.text;
  return typeof texto === "string" && texto.trim().length > 0;
}

async function lerCandidatosNaMeta(
  token: string,
): Promise<{ ok: true; modelos: CandidatoAoPadrao[] } | { ok: false; erro: string }> {
  const conta = await contaDoNumeroDeVendas(token);
  if (!conta.ok) return { ok: false, erro: conta.erro };

  let url: string | null = metaGraphUrl(
    `${conta.wabaId}/message_templates` +
      `?fields=name,language,category,status,components,last_updated_time&limit=100`,
  );
  let paginas = 0;
  const modelos: CandidatoAoPadrao[] = [];

  while (url && paginas < TETO_DE_PAGINAS) {
    const resposta: unknown = await graphAbsoluto(url, token);
    if (ehFalha(resposta)) return { ok: false, erro: resposta.erro };

    const data = (resposta as { data?: unknown }).data;
    for (const bruto of Array.isArray(data) ? data : []) {
      const m = bruto as {
        name?: unknown;
        language?: unknown;
        category?: unknown;
        status?: unknown;
        components?: unknown;
        last_updated_time?: unknown;
      };
      if (!m.name) continue;
      modelos.push({
        nome: String(m.name),
        idioma: String(m.language ?? "pt_BR"),
        categoria: m.category == null ? null : String(m.category),
        situacao: String(m.status ?? "UNKNOWN"),
        atualizadoEm: m.last_updated_time == null ? null : String(m.last_updated_time),
        temCorpo: temCorpo(m.components),
      });
    }

    url = (resposta as { paging?: { next?: unknown } }).paging?.next != null
      ? String((resposta as { paging?: { next?: unknown } }).paging?.next)
      : null;
    paginas++;
  }

  if (url) {
    return {
      ok: false,
      erro:
        "A conta tem mais páginas de templates do que o limite seguro da varredura; " +
        "não é possível afirmar quais são os seis mais recentes.",
    };
  }

  return { ok: true, modelos };
}

export async function selecaoJaFoiConfigurada(db: Cliente): Promise<boolean> {
  const phoneNumberId = foocciSalesPhoneNumberId();
  if (!phoneNumberId) return false;

  // Uma linha de controle órfã (template apagado/fora do espelho atual) não pode
  // impedir a inicialização automática. Ao mesmo tempo, uma linha que ainda
  // corresponde a um modelo atual conta como configuração mesmo com podeEnviar
  // FALSE, preservando a decisão explícita de desligar todos os modelos.
  const linhas = await db.$queryRaw<Array<{ total: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS total
    FROM "modelos_de_vendas_envio" e
    INNER JOIN "modelos_de_vendas" m
      ON m."phoneNumberId" = e."phoneNumberId"
     AND m."nome" = e."nome"
     AND m."idioma" = e."idioma"
    WHERE e."phoneNumberId" = ${phoneNumberId}
  `);
  return (linhas[0]?.total ?? 0) > 0;
}

async function aplicarComToken(
  db: Cliente,
  token: string,
  somenteSeNaoConfigurado: boolean,
): Promise<ResultadoDoPadrao> {
  const phoneNumberId = foocciSalesPhoneNumberId();
  if (!phoneNumberId) {
    return { ok: false, erro: "O número comercial da Foocci não está configurado." };
  }

  if (somenteSeNaoConfigurado && (await selecaoJaFoiConfigurada(db))) {
    return { ok: true, alterou: false, modelos: [] };
  }

  const lidos = await lerCandidatosNaMeta(token);
  if (!lidos.ok) return lidos;

  const escolhidos = selecionarSeisMaisRecentes(lidos.modelos);
  if (!escolhidos.ok) return escolhidos;
  if (escolhidos.modelos.length === 0) {
    return {
      ok: false,
      erro: "A Meta não devolveu nenhum template APPROVED de Marketing em pt-BR com corpo utilizável.",
    };
  }

  // Primeiro desliga o conjunto anterior. Se alguma escrita posterior falhar,
  // o pior caso é fail-closed (nenhum disparo), nunca um template antigo sair.
  await db.$executeRaw(Prisma.sql`
    UPDATE "modelos_de_vendas_envio"
    SET "podeEnviar" = FALSE, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "phoneNumberId" = ${phoneNumberId}
  `);

  for (const modelo of escolhidos.modelos) {
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "modelos_de_vendas_envio"
        ("phoneNumberId", "nome", "idioma", "podeEnviar", "updatedAt")
      VALUES
        (${phoneNumberId}, ${modelo.nome}, ${modelo.idioma}, TRUE, CURRENT_TIMESTAMP)
      ON CONFLICT ("phoneNumberId", "nome", "idioma")
      DO UPDATE SET
        "podeEnviar" = TRUE,
        "updatedAt" = CURRENT_TIMESTAMP
    `);
  }

  return {
    ok: true,
    alterou: true,
    modelos: escolhidos.modelos.map((m) => m.nome),
  };
}

/**
 * Aplica o conjunto padrão pedido pelo CEO. `somenteSeNaoConfigurado` é usado
 * no primeiro disparo para inicializar sem atropelar uma escolha manual futura.
 */
export function aplicarPadraoUltimosSeisDaMeta(
  db: Cliente,
  opts: { somenteSeNaoConfigurado?: boolean } = {},
): Promise<ResultadoDoPadrao> {
  const somenteSeNaoConfigurado = opts.somenteSeNaoConfigurado ?? false;
  return comOTokenDeVendas<ResultadoDoPadrao>(
    (token) => aplicarComToken(db, token, somenteSeNaoConfigurado),
    () => ({
      ok: false,
      erro: "FOOCCI_SALES_ACCESS_TOKEN não está no ambiente; o padrão não foi alterado.",
    }),
  );
}
