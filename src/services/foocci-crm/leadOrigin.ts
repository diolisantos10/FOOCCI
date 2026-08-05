/**
 * leadOrigin — de onde o contato veio, sem chute.
 *
 * PURO: sem banco, sem I/O, sem `window`. Roda igual no navegador (para capturar
 * o primeiro toque) e no servidor (para agrupar a tela de performance). O mesmo
 * código nos dois lados é o que impede a tela de rotular diferente do que foi
 * gravado.
 *
 * PRIMEIRO TOQUE, NÃO ÚLTIMO. O anúncio do Facebook joga a pessoa na home; ela
 * navega três páginas e só então preenche o formulário. Quem trouxe o contato foi
 * o anúncio, não a página de onde ela clicou "enviar" — e era exatamente isso que
 * o campo `origem` antigo (`window.location.pathname`) registrava, motivo pelo
 * qual ele nunca respondeu "qual anúncio funciona".
 *
 * O QUE NÃO SE FAZ AQUI: inventar origem. Sem parâmetro e sem referrer, o
 * resultado é "Direto / não identificado" — que é a verdade, e não um palpite
 * disfarçado de dado. Ausência de informação não é informação.
 */

/** O que fica gravado no contato. Todos opcionais: a maioria das visitas não traz nada. */
export interface OrigemCapturada {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  /** fbclid / gclid / ttclid — o clique identificado do anunciante. */
  clickId: string | null;
  /** Caminho de ENTRADA no site, com query. Pode não ser a página do formulário. */
  landingPath: string | null;
  /** Host + caminho do referrer, SEM query (a query alheia pode carregar dado pessoal). */
  referrer: string | null;
}

export const ORIGEM_VAZIA: OrigemCapturada = {
  utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null,
  utmTerm: null, clickId: null, landingPath: null, referrer: null,
};

/** Canais que a Foocci reconhece por nome. O resto vira "outro", nunca um chute. */
const APELIDOS_DE_CANAL: Record<string, string> = {
  facebook: "facebook", fb: "facebook", "facebook.com": "facebook", "m.facebook.com": "facebook",
  "l.facebook.com": "facebook", meta: "facebook",
  instagram: "instagram", ig: "instagram", "instagram.com": "instagram", "l.instagram.com": "instagram",
  google: "google", "google.com": "google", "www.google.com": "google", adwords: "google", gads: "google",
  youtube: "youtube", "youtube.com": "youtube", "m.youtube.com": "youtube",
  whatsapp: "whatsapp", wa: "whatsapp", "wa.me": "whatsapp", "api.whatsapp.com": "whatsapp",
  linkedin: "linkedin", "linkedin.com": "linkedin", "lnkd.in": "linkedin",
  tiktok: "tiktok", "tiktok.com": "tiktok",
  bing: "bing", "bing.com": "bing",
  email: "email", "e-mail": "email", newsletter: "email",
};

export const ROTULO_CANAL: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", google: "Google", youtube: "YouTube",
  whatsapp: "WhatsApp", linkedin: "LinkedIn", tiktok: "TikTok", bing: "Bing",
  email: "E-mail", direto: "Direto", outro: "Outro",
};

/** Limite por campo. O visitante controla a URL — a query é entrada de atacante. */
const MAX = 200;

function limpa(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, MAX);
  if (t === "") return null;
  // O Gerenciador de Anúncios entrega macros não substituídas quando mal
  // configurado ("{{campaign.name}}"). Isso não é origem — é configuração
  // quebrada, e gravar como se fosse nome de campanha polui a base inteira.
  if (/^\{\{.*\}\}$/.test(t) || /^\{.*\}$/.test(t)) return null;
  return t;
}

/** Leitor mínimo de query string — aceita URLSearchParams ou objeto simples. */
export type LeitorDeParametros = { get(nome: string): string | null };

/**
 * Extrai a origem de uma URL de entrada.
 *
 * @param params  query da página de entrada
 * @param referrer `document.referrer` cru (pode ser "")
 * @param landingPath caminho de entrada, já com query
 */
export function extrairOrigem(
  params: LeitorDeParametros,
  referrer: string | null | undefined,
  landingPath: string | null | undefined,
): OrigemCapturada {
  // `src` é o atalho curto que já se usa nos links da loja (PedidoClient); aceitar
  // os dois evita que um link encurtado à mão perca a origem.
  const source = limpa(params.get("utm_source") ?? params.get("src"));
  const clickId = limpa(
    params.get("fbclid") ?? params.get("gclid") ?? params.get("ttclid") ?? params.get("_tlid"),
  );

  return {
    utmSource:   source,
    utmMedium:   limpa(params.get("utm_medium")),
    utmCampaign: limpa(params.get("utm_campaign") ?? params.get("campanha")),
    utmContent:  limpa(params.get("utm_content")),
    utmTerm:     limpa(params.get("utm_term")),
    clickId,
    landingPath: limpa(landingPath),
    referrer:    normalizaReferrer(referrer),
  };
}

/** Host + caminho. A query do referrer é descartada: pode carregar dado de terceiro. */
export function normalizaReferrer(raw: string | null | undefined): string | null {
  const r = limpa(raw);
  if (!r) return null;
  try {
    const u = new URL(r);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname === "/" ? "" : u.pathname;
    return limpa(host + path);
  } catch {
    return r;
  }
}

/**
 * O canal do contato: facebook, google, direto…
 *
 * Ordem: utm_source (o anunciante declarou) > referrer (o navegador contou) >
 * "direto". Um fbclid sem utm_source ainda é Facebook — o clique carimbado pela
 * própria Meta é evidência, não suposição.
 */
export function canalDoContato(o: Partial<OrigemCapturada>): string {
  const src = o.utmSource?.toLowerCase().trim();
  if (src) return APELIDOS_DE_CANAL[src] ?? "outro";

  if (o.clickId) {
    // Só o fbclid/gclid é autoexplicativo; guardamos o prefixo do parâmetro na
    // captura, então aqui só dá para afirmar "veio de anúncio".
    return "outro";
  }

  const ref = o.referrer?.toLowerCase().trim();
  if (ref) {
    const host = ref.split("/")[0] ?? ref;
    return APELIDOS_DE_CANAL[host] ?? "outro";
  }

  return "direto";
}

/**
 * O rótulo que agrupa a tela de performance.
 *
 * Granularidade decrescente e HONESTA: campanha > canal + criativo > canal >
 * referrer > página de entrada > direto. Nunca cai em "desconhecido" quando
 * existe uma pista melhor, e nunca promove uma pista fraca a nome de campanha.
 */
export function rotuloDaOrigem(o: Partial<OrigemCapturada> & { origem?: string | null }): string {
  const canal = canalDoContato(o);
  const nomeCanal = ROTULO_CANAL[canal] ?? canal;

  if (o.utmCampaign) {
    return o.utmContent ? `${o.utmCampaign} · ${o.utmContent}` : o.utmCampaign;
  }
  if (o.utmSource) return o.utmContent ? `${nomeCanal} · ${o.utmContent}` : nomeCanal;
  if (o.referrer) return `${nomeCanal} (${o.referrer})`;

  // Sem nenhum sinal de campanha: o legado `origem` (a página do formulário) é a
  // única pista. Ela responde "de qual página", nunca "de qual anúncio".
  const pagina = limpa(o.landingPath ?? o.origem ?? null);
  if (pagina) return `Direto — entrou por ${pagina.split("?")[0]}`;

  return "Direto / não identificado";
}

/**
 * WhatsApp em dígitos com DDI 55 — a chave humana do contato.
 *
 * Devolve null quando o que sobrou não pode ser um telefone brasileiro. Um
 * número inválido normalizado à força vira contato fantasma na base do SDR.
 */
export function normalizaWhatsapp(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const digitos = raw.replace(/\D/g, "");
  if (digitos.length < 10) return null;
  const comDdi = digitos.startsWith("55") ? digitos : `55${digitos}`;
  // 55 + DDD(2) + número(8 ou 9) = 12 ou 13. Fora disso não é celular do Brasil.
  if (comDdi.length < 12 || comDdi.length > 13) return null;
  return comDdi;
}

/** Link de conversa pronto — o SDR (humano ou agente) abre daqui. */
export function linkWhatsapp(raw: string | null | undefined): string | null {
  const d = normalizaWhatsapp(raw);
  return d ? `https://wa.me/${d}` : null;
}
