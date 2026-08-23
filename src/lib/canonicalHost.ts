/**
 * Destino do redirecionamento `www.<dominio>` → `<dominio>`.
 *
 * ⚠️ POR QUE ISTO É UMA FUNÇÃO, E NÃO TRÊS LINHAS DENTRO DO MIDDLEWARE
 * (defeito de 23/08/2026, visto pelo CEO em produção):
 *
 *     https://www.foocci.com.br/  →  308  →  https://foocci.com.br:8080/
 *
 * A porta `8080` é a porta INTERNA do contêiner. Atrás do proxy do Railway, o
 * `req.nextUrl` é montado a partir da conexão local, então ele já chega com
 * `:8080` — e o conserto ingênuo não tira essa porta:
 *
 *     const dest = req.nextUrl.clone();
 *     dest.host = host.slice(4);        // ← NÃO limpa a porta
 *
 * O `host` da API de URL (WHATWG) só mexe na porta se o valor NOVO trouxer uma.
 * Como `foocci.com.br` não traz, o `:8080` do clone sobrevive intacto e vai para
 * o cabeçalho `Location`. O visitante recebe um endereço que não existe
 * publicamente: "Não é possível acessar esse site".
 *
 * Regra, então: **o destino é montado, nunca herdado.** Esquema fixo `https`,
 * host público vindo do cabeçalho `Host` (o que o navegador realmente pediu) sem
 * porta nenhuma, e caminho + query preservados na íntegra — quem chega em
 * `www.foocci.com.br/r/ABC123?x=1` tem que cair em `foocci.com.br/r/ABC123?x=1`,
 * porque `/r/<code>` é link de cardápio que já foi para cliente; jogar essa
 * pessoa na home é perder o pedido.
 */

/** `https` fixo: a apex é servida só por HTTPS, e degradar esquema em redirecionamento é como se perde sessão e SEO. */
const ESQUEMA = "https";

/**
 * Remove a porta de um cabeçalho `Host`.
 * IPv6 chega entre colchetes (`[::1]:8080`) — por isso não basta cortar no `:`.
 */
export function hostSemPorta(hostHeader: string): string {
  const host = hostHeader.trim();
  if (host.startsWith("[")) {
    const fim = host.indexOf("]");
    return fim === -1 ? host : host.slice(0, fim + 1);
  }
  const corte = host.indexOf(":");
  return corte === -1 ? host : host.slice(0, corte);
}

/**
 * Monta o destino canônico (sem `www.`, sem porta) preservando caminho e query.
 *
 * @param hostHeader cabeçalho `Host` da requisição — pode vir com porta.
 * @param pathname   caminho pedido, começando com `/`.
 * @param search     query string com `?`, ou string vazia.
 */
export function destinoCanonicoSemWww(hostHeader: string, pathname: string, search = ""): string {
  const host = hostSemPorta(hostHeader);
  const apex = host.startsWith("www.") ? host.slice(4) : host;
  return `${ESQUEMA}://${apex}${pathname}${search}`;
}

/**
 * A raiz do domínio é a VITRINE, e o desvio precisa ser um redirecionamento de
 * verdade — com cabeçalho `Location` — para todo mundo, não só para navegador.
 *
 * ⚠️ POR QUE ISTO SAIU DA PÁGINA E VEIO PARA O MIDDLEWARE (23/08/2026):
 * `src/app/page.tsx` só chama `redirect("/site")`. Sem nada dinâmico, o Next
 * PRÉ-RENDERIZA essa rota — ela sai marcada como estática no build, mesmo com
 * `force-dynamic` — e o que chega ao visitante é `307` com corpo
 * `__next_error__`, `x-nextjs-cache: HIT` e **nenhum `Location`**. Medido em
 * produção. Navegador com JavaScript ainda se vira; `curl`, robô de busca,
 * prévia de link do WhatsApp e monitor de saúde não: para eles a raiz do domínio
 * deixou de redirecionar.
 *
 * Antes a rota era dinâmica por acidente — ler a sessão toca em cookie, e cookie
 * obriga renderização por requisição. Ao tirar a sessão dali, o efeito colateral
 * que segurava tudo de pé foi junto.
 *
 * No middleware não há pré-renderização possível: a resposta é montada a cada
 * requisição, sempre com `Location`.
 *
 * ⚠️ E O `Location` É RELATIVO (`/site`), de propósito. Montar URL absoluta aqui
 * é reabrir a armadilha do `:8080` — atrás do proxy do Railway a porta interna
 * vaza para qualquer destino herdado da conexão. Caminho relativo não tem host
 * nem porta para errar, e funciona igual em produção e no `localhost:3000`.
 */
export const DESTINO_DA_RAIZ = "/site";

/**
 * Origem pública para montar o destino da raiz.
 *
 * ⚠️ `Location` RELATIVO NÃO SERVE, por mais que o HTTP permita: o Next valida o
 * cabeçalho com `new URL(location)` e derruba a requisição com
 * `ERR_INVALID_URL` — 500 na cara do visitante. Isto foi medido rodando o build
 * localmente antes de subir, e é a razão de existir esta função em vez de um
 * simples `"/site"`.
 *
 * E a URL absoluta tem que ser montada com cuidado, senão volta o `:8080`:
 * `req.nextUrl.origin`, atrás do proxy do Railway, carrega a porta interna do
 * contêiner. Por isso a porta é descartada quando o esquema público é `https`
 * (produção, sempre em 443) e MANTIDA quando não é — senão o `localhost:3000` do
 * desenvolvimento passaria a redirecionar para `localhost`, que não responde.
 */
export function origemPublica(hostHeader: string, proto: string): string {
  const esquema = proto.replace(/:$/, "");
  const host = esquema === ESQUEMA ? hostSemPorta(hostHeader) : hostHeader;
  return `${esquema}://${host}`;
}

/** `true` só para a raiz exata — `/site`, `/login`, `/r/...` seguem seu caminho. */
export function raizVaiParaVitrine(pathname: string): boolean {
  return pathname === "/";
}
