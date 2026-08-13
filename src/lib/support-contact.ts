/**
 * O CANAL DE SOCORRO — a única fonte de verdade do "não consigo entrar".
 *
 * POR QUE ESTE ARQUIVO EXISTE (13/08/2026, raio-X de percurso):
 * a tela de login mandava o lojista trancado para fora "falar com o suporte" sem
 * dizer com quem, por onde nem em que número — e o assistente de ajuda só existe
 * DENTRO do painel, ou seja, some exatamente para quem não consegue entrar.
 * Convite sem porta é a forma mais barata de abandonar quem já estava tentando.
 *
 * REGRA DE MANUTENÇÃO: nenhuma tela escreve número, e-mail ou `wa.me` à mão. Duas
 * cópias do mesmo endereço é como uma delas silenciosamente para de ser verdade.
 *
 * COMO ACENDER — duas formas, nesta ordem de precedência:
 *   1. `NEXT_PUBLIC_SUPPORT_WHATSAPP` / `NEXT_PUBLIC_SUPPORT_EMAIL` no Railway
 *      (não exige deploy de código);
 *   2. as duas constantes fixas logo abaixo, para quem preferir travar no repo.
 * Sem nenhum dos dois, cai no WhatsApp de VENDAS (`NEXT_PUBLIC_WHATSAPP_SALES_NUMBER`)
 * — é outro time, mas é gente do Foocci que atende, e é melhor que porta nenhuma.
 *
 * ⚠️ Enquanto NADA estiver configurado, `hasChannel` é falso e a tela cai no
 * formulário do site (`/site/precos#demonstracao`), que grava o pedido no banco e
 * aparece no admin. É o plano C honesto: não promete resposta imediata. QUAL número
 * e QUAL caixa de e-mail vão ao ar é decisão do dono do negócio, não do código.
 *
 * NADA aqui é segredo: todo valor é público por natureza (é o que a gente quer que
 * o cliente veja). Nenhuma credencial entra neste arquivo.
 */

/** Só dígitos, com DDI. Ex.: "5511999998888". `null` = desligado. */
const HARDCODED_SUPPORT_WHATSAPP: string | null = null;
/** Caixa que uma PESSOA lê. `null` = desligado. */
const HARDCODED_SUPPORT_EMAIL: string | null = null;

/** Onde a pessoa cai quando não existe canal direto configurado. */
export const SUPPORT_FALLBACK_URL = "/site/precos#demonstracao";

export interface SupportContact {
  /** Link `wa.me` pronto, com a mensagem já escrita. `null` quando não há número. */
  whatsappUrl: string | null;
  /** O mesmo número em formato legível — plano B se o link não abrir. */
  whatsappLabel: string | null;
  /** E-mail de socorro, já validado. `null` quando não há. */
  email: string | null;
  /** `mailto:` pronto, com assunto. `null` quando não há e-mail. */
  emailUrl: string | null;
  /** Verdadeiro quando existe pelo menos UM canal direto de verdade. */
  hasChannel: boolean;
}

/**
 * Tira tudo que não é dígito. Devolve `null` se não sobrar número plausível —
 * um "número" de 3 dígitos vira um link `wa.me` quebrado, e link quebrado na tela
 * de socorro é pior que ausência: a pessoa clica, não acontece nada, e desiste.
 */
export function normalizeWhatsapp(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d : null;
}

/**
 * Valida o e-mail ANTES de virar `mailto:`.
 *
 * Não é frescura de formato: `mailto:` aceita parâmetros depois de `?`, então um
 * valor mal configurado (ou um dia lido de fonte menos confiável) poderia embutir
 * `?bcc=` e mandar cópia do que a pessoa escrever para um terceiro. Espaço, `?`,
 * `&`, vírgula e quebra de linha reprovam aqui e nunca chegam à tela.
 */
export function normalizeEmail(v: string | null | undefined): string | null {
  const e = (v ?? "").trim();
  if (!e) return null;
  if (!/^[^\s@,;<>()[\]\\?&%"']+@[^\s@,;<>()[\]\\?&%"']+\.[a-zA-Z]{2,}$/.test(e)) return null;
  return e;
}

/** "5511999998888" → "+55 (11) 99999-8888". Outros formatos saem com "+" e sem máscara inventada. */
export function formatWhatsapp(numero: string | null): string | null {
  if (!numero) return null;
  const br = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(numero);
  return br ? `+55 (${br[1]}) ${br[2]}-${br[3]}` : `+${numero}`;
}

/** A mensagem que a pessoa só aperta enviar. Sem gênero, sem nome que a gente não tem. */
export const SUPPORT_WA_MESSAGE = "Olá! Não estou conseguindo entrar no painel do Foocci.";
export const SUPPORT_EMAIL_SUBJECT = "Não consigo entrar no painel do Foocci";

/**
 * Monta o contato a partir de valores crus. Recebe tudo por parâmetro de propósito:
 * é o que deixa o teste provar as DUAS metades (com canal e sem canal) sem depender
 * de variável de ambiente de build.
 */
export function buildSupportContact(raw: {
  whatsapp?: string | null;
  email?: string | null;
  message?: string;
}): SupportContact {
  const numero = normalizeWhatsapp(raw.whatsapp);
  const email = normalizeEmail(raw.email);
  const message = raw.message ?? SUPPORT_WA_MESSAGE;

  return {
    whatsappUrl: numero ? `https://wa.me/${numero}?text=${encodeURIComponent(message)}` : null,
    whatsappLabel: formatWhatsapp(numero),
    email,
    emailUrl: email
      ? `mailto:${email}?subject=${encodeURIComponent(SUPPORT_EMAIL_SUBJECT)}`
      : null,
    hasChannel: Boolean(numero || email),
  };
}

/*
  As leituras de `process.env.NEXT_PUBLIC_*` ficam literais e no topo do módulo
  porque o Next as substitui por TEXTO no momento do build — indireção (montar o
  nome da variável em runtime) devolve `undefined` no navegador e o canal nasce
  apagado sem ninguém perceber.
*/
export const SUPPORT_CONTACT: SupportContact = buildSupportContact({
  whatsapp:
    process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ??
    HARDCODED_SUPPORT_WHATSAPP ??
    process.env.NEXT_PUBLIC_WHATSAPP_SALES_NUMBER,
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? HARDCODED_SUPPORT_EMAIL,
});
