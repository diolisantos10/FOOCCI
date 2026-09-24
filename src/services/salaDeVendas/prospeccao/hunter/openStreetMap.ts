/**
 * A FONTE ABERTA — descobrir restaurante no OpenStreetMap, via Overpass API.
 *
 * ── ⛔ O DEFEITO QUE ESTE ARQUIVO EXISTE PARA MATAR ─────────────────────────
 *
 * Medido em produção: a rodada das 9h roda todo dia útil e conclui com
 * `abordados: 0, parouPor: 'filaAcabou'`. A máquina de abordagem está ligada e
 * inteira; o que não existe é matéria-prima. A fila só enchia quando uma
 * PESSOA subia uma planilha na tela.
 *
 * E `telas/hunter.ts` dizia, no próprio código, que a descoberta automática
 * *"depende de uma fonte de dados paga que a empresa ainda não contratou"*.
 * Essa frase foi MEDIDA em 24/09/2026 e é **falsa como afirmação geral** —
 * existe fonte aberta, legal e sem contrato. O que ela custa não é dinheiro:
 * é COBERTURA, e a cobertura está medida no cabeçalho de `descoberta.ts`.
 *
 * ── POR QUE OpenStreetMap, E O QUE FOI DESCARTADO ───────────────────────────
 *
 * Conferido em 24/09/2026, com os termos lidos, não supostos:
 *
 *   ✅ **OpenStreetMap / Overpass API** — dado sob ODbL (uso comercial
 *      permitido, exige atribuição "© OpenStreetMap contributors"). A Overpass
 *      é uma API pública de LEITURA com uso justo declarado de ~10.000
 *      requisições/dia e ~1 GB/dia. Esta obra gasta UMA requisição por cidade,
 *      uma vez por dia — três ordens de grandeza abaixo do limite.
 *      ⚠️ Não é raspagem: é a API que o projeto publica para ser consultada.
 *
 *   ⛔ **Google Places API** — DESCARTADA por dois motivos, e o segundo é o que
 *      mata: (1) o telefone (`nationalPhoneNumber`) está no SKU *Enterprise*,
 *      ~US$ 35/1.000 buscas + ~US$ 20/1.000 detalhes; (2) os Termos da
 *      plataforma **proíbem armazenar o conteúdo** — só `place_id` e
 *      coordenadas podem ser guardados, por até 30 dias. Uma base fria de
 *      prospecção é exatamente armazenamento permanente de conteúdo. Pagar não
 *      resolveria: o uso seria proibido do mesmo jeito.
 *
 *   ⛔ **Raspar Google Maps / iFood / redes sociais** — DESCARTADA. Os termos
 *      dos três proíbem acesso automatizado não autorizado. Guardrail desta
 *      casa: termo de uso se confere antes, não depois da notificação.
 *
 *   🔄 **Receita Federal (dados abertos do CNPJ)** e **Overture Maps Places**
 *      — as duas destravam VOLUME e as duas são gratuitas, mas nenhuma é uma
 *      API: são dumps de vários GB (CNPJ ~85 GB; Overture em Parquet no S3)
 *      que exigem uma esteira de ETL mensal fora do processo do Next.js. Ficam
 *      nomeadas como o próximo passo, não construídas aqui.
 *
 * ── ⛔ O QUE ESTE ARQUIVO NÃO FAZ ───────────────────────────────────────────
 *
 * Não escreve no banco, não qualifica ninguém e não fala com telefone nenhum.
 * Ele busca e traduz. Quem decide o que entra na fila é `descoberta.ts`, e
 * quem aborda continua sendo `abordarDaFila.ts`, no horário dele.
 */

/** Um restaurante como a fonte aberta o descreve — antes de qualquer trava. */
export interface RestauranteDescoberto {
  /** Identidade estável na fonte: `osm:node/123456`. É a chave de auditoria. */
  idNaFonte: string;
  nome: string;
  /** O telefone publicado pelo estabelecimento. Pode ser fixo — e isso é ok. */
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
  bairro: string | null;
  endereco: string | null;
  cep: string | null;
  site: string | null;
  instagram: string | null;
  /** "restaurante", "lanchonete", "cafeteria"… em português, para a ficha. */
  tipo: string | null;
  /** O link direto do ponto no mapa aberto — não o texto do endereço. */
  mapaUrl: string | null;
}

/** O endereço da instância pública. Trocável sem deploy, por espelho. */
export function enderecoDoOverpass(env: NodeJS.ProcessEnv = process.env): string {
  const v = (env.FOOCCI_OVERPASS_URL ?? "").trim();
  return v === "" ? "https://overpass-api.de/api/interpreter" : v;
}

/**
 * O User-Agent é OBRIGATÓRIO pela política de uso da OSM: uma requisição
 * anônima é indistinguível de raspagem, e é assim que instância pública some
 * para todo mundo. Identificar-se é a contrapartida de usar de graça.
 */
export const USER_AGENT_DO_HUNTER = "foocci-hunter/1.0 (prospeccao B2B; contato via foocci.com.br)";

/**
 * A atribuição que a licença ODbL exige de quem usa o dado.
 *
 * ⚠️ Ela não é enfeite de rodapé: vira a `proveniencia` do lote, que é o campo
 * que o portão de abordagem lê (`baseLegalDeclarada`) e a frase que responde
 * "de onde vocês tiraram o meu telefone?". Cumprir a licença e responder ao
 * dono do restaurante são, aqui, o MESMO ato.
 */
export const ATRIBUICAO_OSM =
  "Telefone publicado pelo próprio estabelecimento no OpenStreetMap " +
  "(© OpenStreetMap contributors, dados sob ODbL), coletado pela descoberta " +
  "automática da Foocci";

/**
 * Os tipos de ponto que interessam, e o rótulo em português de cada um.
 *
 * `bar` e `ice_cream` entram porque o produto serve os dois; `fast_food` é a
 * lanchonete, que no Brasil é boa parte da base. O que fica de fora fica de
 * fora de propósito — padaria e mercado vendem comida e não são o cliente.
 */
export const TIPOS_DE_PONTO: Record<string, string> = {
  restaurant: "Restaurante",
  fast_food: "Lanchonete",
  pizzeria: "Pizzaria",
  cafe: "Cafeteria",
  bar: "Bar",
  ice_cream: "Sorveteria",
};

/**
 * Monta a consulta de UMA cidade.
 *
 * ── POR QUE POR CIDADE, E NÃO POR ESTADO ────────────────────────────────────
 *
 * Medido em 24/09/2026: a consulta de São Paulo (capital) devolveu **504** na
 * instância pública, duas vezes. Cidade média responde em segundos. Pedir o
 * estado inteiro seria pedir um tempo-limite todo dia — e um tempo-limite
 * diário é uma máquina desligada com aparência de ligada.
 *
 * `admin_level=8` é o município no Brasil dentro do OSM. Sem ele, `name` casa
 * também com bairro e com o estado homônimo, e a área vira outra coisa.
 */
export function montarConsultaOverpass(cidade: string, timeoutSegundos = 120): string {
  const tipos = Object.keys(TIPOS_DE_PONTO).join("|");
  // Aspas dentro do nome quebrariam a consulta. Cidade brasileira não tem
  // aspas no nome, e por isso a recusa aqui é a resposta certa: consulta
  // montada com texto de fora é por onde entra o que ninguém previu.
  const limpo = cidade.replace(/["\\]/g, "").trim();
  return (
    `[out:json][timeout:${timeoutSegundos}];` +
    `area["name"="${limpo}"]["boundary"="administrative"]["admin_level"="8"]->.cidade;` +
    `nwr["amenity"~"^(${tipos})$"](area.cidade);` +
    `out tags center;`
  );
}

interface ElementoOverpass {
  type?: string;
  id?: number;
  tags?: Record<string, string>;
}

/** O telefone, na ordem em que o OSM costuma gravá-lo. O primeiro que existir. */
function telefoneDaEtiqueta(t: Record<string, string>): string | null {
  const candidatos = [
    t["contact:whatsapp"],
    t["whatsapp"],
    t["contact:mobile"],
    t["mobile"],
    t["phone"],
    t["contact:phone"],
  ];
  for (const c of candidatos) {
    if (typeof c !== "string") continue;
    // "+55 62 3223-5396; +55 62 3223-5397" — o OSM separa múltiplos por ";".
    // O primeiro é o principal; os outros não são descartados por preguiça, e
    // sim porque abordar dois números da mesma casa é abordar a casa duas vezes.
    const primeiro = c.split(";")[0]!.trim();
    if (primeiro !== "") return primeiro;
  }
  return null;
}

function texto(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/** O Instagram, seja qual for a forma em que o mapeador o escreveu. */
function instagramDaEtiqueta(t: Record<string, string>): string | null {
  const bruto = texto(t["contact:instagram"]) ?? texto(t["instagram"]);
  if (bruto === null) return null;
  if (/^https?:\/\//i.test(bruto)) return bruto;
  return `https://instagram.com/${bruto.replace(/^@/, "")}`;
}

function enderecoDaEtiqueta(t: Record<string, string>): string | null {
  const rua = texto(t["addr:street"]);
  if (rua === null) return null;
  const numero = texto(t["addr:housenumber"]);
  return numero === null ? rua : `${rua}, ${numero}`;
}

/**
 * Traduz a resposta da Overpass em fichas.
 *
 * ── ⚠️ ESTA FUNÇÃO É PURA, E ISSO É DE PROPÓSITO ────────────────────────────
 *
 * Toda a tradução — telefone, tipo, endereço — é testável sem rede. O que
 * depende de rede (`buscarNaCidade`) não tem regra nenhuma dentro: só busca e
 * repassa. Regra atrás de `fetch` é regra que ninguém testa.
 *
 * Ponto SEM NOME é descartado aqui, em silêncio: abordar "o restaurante" sem
 * saber qual é abordar errado, e a mensagem sai com o nome em branco.
 */
export function lerRespostaOverpass(corpo: unknown): RestauranteDescoberto[] {
  const elementos = (corpo as { elements?: unknown })?.elements;
  if (!Array.isArray(elementos)) return [];

  const fichas: RestauranteDescoberto[] = [];

  for (const cru of elementos as ElementoOverpass[]) {
    const t = cru?.tags;
    if (!t || typeof t !== "object") continue;

    const nome = texto(t["name"]);
    if (nome === null) continue;

    const tipo = TIPOS_DE_PONTO[t["amenity"] ?? ""] ?? null;

    fichas.push({
      idNaFonte: `osm:${cru.type ?? "node"}/${cru.id ?? "?"}`,
      nome,
      telefone: telefoneDaEtiqueta(t),
      cidade: texto(t["addr:city"]),
      estado: texto(t["addr:state"]),
      bairro: texto(t["addr:suburb"]) ?? texto(t["addr:neighbourhood"]),
      endereco: enderecoDaEtiqueta(t),
      cep: texto(t["addr:postcode"]),
      site: texto(t["website"]) ?? texto(t["contact:website"]),
      instagram: instagramDaEtiqueta(t),
      tipo,
      mapaUrl:
        cru.type && cru.id ? `https://www.openstreetmap.org/${cru.type}/${cru.id}` : null,
    });
  }

  return fichas;
}

export class FonteIndisponivel extends Error {
  constructor(public readonly cidade: string, detalhe: string) {
    super(`A fonte aberta não respondeu para ${cidade}: ${detalhe}`);
    this.name = "FonteIndisponivel";
  }
}

/**
 * Busca UMA cidade na Overpass, com nova tentativa.
 *
 * ── POR QUE TENTAR DE NOVO, E POR QUE SÓ TRÊS VEZES ─────────────────────────
 *
 * Medido: a instância pública devolve 429 (uso justo) e 504 (consulta longa)
 * com frequência normal, e a MESMA consulta passa na tentativa seguinte. Não
 * tentar de novo faria a cidade cair do dia por um soluço.
 *
 * ⚠️ E o teto de três é a outra metade: insistir sem fim numa instância que
 * está pedindo folga é exatamente como se perde o acesso de graça de todo
 * mundo. A espera cresce entre as tentativas de propósito.
 */
export async function buscarNaCidade(
  cidade: string,
  opcoes: {
    fetch?: typeof fetch;
    url?: string;
    tentativas?: number;
    esperar?: (ms: number) => Promise<void>;
  } = {},
): Promise<RestauranteDescoberto[]> {
  const buscar = opcoes.fetch ?? fetch;
  const url = opcoes.url ?? enderecoDoOverpass();
  const tentativas = opcoes.tentativas ?? 3;
  const esperar = opcoes.esperar ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let ultimoDetalhe = "sem detalhe";

  for (let i = 1; i <= tentativas; i++) {
    try {
      const resposta = await buscar(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT_DO_HUNTER,
        },
        body: new URLSearchParams({ data: montarConsultaOverpass(cidade) }).toString(),
      });

      if (!resposta.ok) {
        ultimoDetalhe = `HTTP ${resposta.status}`;
      } else {
        return lerRespostaOverpass(await resposta.json());
      }
    } catch (e) {
      ultimoDetalhe = e instanceof Error ? e.message : String(e);
    }

    if (i < tentativas) await esperar(i * 5_000);
  }

  throw new FonteIndisponivel(cidade, `${ultimoDetalhe} (após ${tentativas} tentativas)`);
}
