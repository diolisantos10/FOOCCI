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
