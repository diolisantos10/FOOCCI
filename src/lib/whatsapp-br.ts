/**
 * Telefone brasileiro plausível — a trava da porta de entrada do CRM.
 *
 * ─── O que estava quebrado ───────────────────────────────────────────────────
 * O formulário do site validava o WhatsApp com `min(8)`: OITO CARACTERES
 * QUAISQUER. "não tenho", "1199999" e "aaaaaaaa" entravam. A tela de sucesso
 * então devolvia o texto na cara da pessoa — "vamos chamar você no WhatsApp
 * 1199999" — e ela ia esperar uma ligação que ninguém consegue fazer. Lead
 * perdido em silêncio, com a confirmação servindo de falsa segurança.
 *
 * ─── A regra, e o que ela NÃO faz ────────────────────────────────────────────
 * Ela confere a FORMA de um telefone brasileiro: DDI opcional, DDD que existe, e
 * um número com quantidade de dígitos possível. Ela não confere se a linha
 * existe, se tem WhatsApp ou se é de quem digitou — nada disso dá para saber sem
 * mandar mensagem, e afirmar mais do que se sabe é o erro que este arquivo
 * conserta, não repete.
 *
 * ─── O medo certo: recusar quem está certo ───────────────────────────────────
 * Um portão apertado demais custa MAIS que o dado sujo — barra o lojista que
 * estava tentando comprar. Por isso aceita tudo que gente de verdade digita:
 *
 *   • com e sem DDI 55        · "+55 11 98765-4321" e "11987654321"
 *   • com e sem máscara        · "(11) 98765-4321", "11 98765 4321", "11.98765.4321"
 *   • com e sem o nono dígito  · "11987654321" e "1187654321"
 *   • com o zero da operadora  · "011 98765-4321" (hábito antigo, ainda comum)
 *
 * **Fixo de 8 dígitos ENTRA — decisão registrada.** "(11) 3333-4444" passa. Três
 * motivos, na ordem em que pesam: (1) WhatsApp Business roda em linha fixa e é
 * exatamente o número que muito restaurante divulga; (2) quem preenche o
 * formulário é o DONO, e o telefone que ele tem na cabeça é o do restaurante;
 * (3) o custo dos dois erros é assimétrico — um fixo aceito vira uma ligação a
 * mais para o SDR, um fixo recusado vira um cliente perdido na porta. O `origem`
 * do lead já diz de onde ele veio; quem atende descobre o resto conversando.
 *
 * O que continua FORA: quantidade de dígitos impossível, DDD que a Anatel nunca
 * atribuiu (00, 01, 20, 30, 40…), celular de 9 dígitos que não começa com 9, e
 * número de serviço (local começando em 0 ou 1). São formas que NENHUM telefone
 * brasileiro tem — recusá-las não recusa ninguém de verdade.
 *
 * PURO: sem I/O e sem dependência. O mesmo código valida no navegador (para a
 * pessoa ver o erro antes de enviar) e no servidor (que é onde a trava vale).
 */

/**
 * Os DDD que existem no Brasil. Lista fechada de propósito: é ela que separa
 * "(11)" de "(01)" — um erro de digitação que passa por qualquer regra de
 * tamanho. Se a Anatel abrir um código novo, some aqui; é uma linha.
 */
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,             // SP
  21, 22, 24, 27, 28,                             // RJ · ES
  31, 32, 33, 34, 35, 37, 38,                     // MG
  41, 42, 43, 44, 45, 46, 47, 48, 49,             // PR · SC
  51, 53, 54, 55,                                 // RS
  61, 62, 63, 64, 65, 66, 67, 68, 69,             // DF · GO · TO · MT · MS · AC · RO
  71, 73, 74, 75, 77, 79,                         // BA · SE
  81, 82, 83, 84, 85, 86, 87, 88, 89,             // PE · AL · PB · RN · CE · PI
  91, 92, 93, 94, 95, 96, 97, 98, 99,             // PA · AM · RR · AP · MA
]);

/** A recusa diz o que FAZER. "Inválido" sozinho não ensina nada a ninguém. */
export const MENSAGEM_WHATSAPP_INVALIDO =
  "Informe seu WhatsApp com DDD — ex.: (11) 98765-4321.";

export type MotivoRecusa =
  /** Não é texto, ou não sobrou dígito nenhum. */
  | "VAZIO"
  /** Quantidade de dígitos que nenhum telefone brasileiro tem. */
  | "TAMANHO"
  /** DDD que a Anatel nunca atribuiu. */
  | "DDD"
  /** O número local não tem forma de telefone (celular sem o 9, serviço…). */
  | "NUMERO";

export type WhatsappBr =
  | {
      ok: true;
      /** Dígitos com DDI, do jeito que o CRM guarda: `5511987654321`. */
      digitos: string;
      /** O mesmo em E.164: `+5511987654321`. */
      e164: string;
      /** Para MOSTRAR de volta: `(11) 98765-4321`. */
      formatado: string;
      /** `false` para fixo e para celular antigo de 8 dígitos. */
      celular: boolean;
    }
  | { ok: false; motivo: MotivoRecusa; mensagem: string };

function recusa(motivo: MotivoRecusa): WhatsappBr {
  return { ok: false, motivo, mensagem: MENSAGEM_WHATSAPP_INVALIDO };
}

/**
 * Analisa um telefone brasileiro digitado por gente.
 *
 * A ordem das reduções importa e é esta:
 *  1. sobram só os dígitos (máscara, espaço, "+" e traço são enfeite);
 *  2. um zero de operadora à frente cai fora ("011…" → "11…");
 *  3. o DDI 55 só é retirado quando o que sobra vira um número nacional inteiro
 *     — retirar antes quebraria o DDD 55 (Santa Maria/RS), cujo celular
 *     "55 99999-8888" começa exatamente com "55".
 */
export function analisarWhatsappBr(bruto: string | null | undefined): WhatsappBr {
  if (typeof bruto !== "string") return recusa("VAZIO");

  let digitos = bruto.replace(/\D/g, "");
  if (digitos.length === 0) return recusa("VAZIO");

  /* "011 98765-4321" — o zero da operadora, hábito de quem discava interurbano.
     Só cai quando o resto ainda tem cara de número nacional (11 ou 12 dígitos
     com o zero = 10 ou 11 sem ele).
   *
   * AMBIGUIDADE ASSUMIDA, e ela é real: "01987654321" tanto pode ser
   * `0 + (19) 8765-4321` quanto alguém que digitou o DDD como "01". Em dígitos
   * as duas coisas são a MESMA sequência — nenhum código separa. A leitura
   * adotada é a primeira, porque DDD 01 não existe e (19) 8765-4321 existe:
   * entre recusar quem pode estar certo e aceitar mostrando de volta o número
   * lido, a segunda é a única que dá à pessoa a chance de ver o engano. Por isso
   * a tela de sucesso mostra o número NORMALIZADO, nunca o texto cru. */
  if (digitos.startsWith("0") && (digitos.length === 11 || digitos.length === 12)) {
    digitos = digitos.slice(1);
  }
  // "0055 11 98765-4321" — mesma ideia, com DDI.
  else if (digitos.startsWith("0055") && (digitos.length === 14 || digitos.length === 15)) {
    digitos = digitos.slice(2);
  }

  /* O DDI só sai quando o total bate com 55 + nacional (12 ou 13 dígitos).
     Um "5511987654321" tem 13 → nacional "11987654321".
     Um "55999998888"  tem 11 → é o DDD 55 com celular, e NÃO se mexe nele. */
  const nacional =
    (digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")
      ? digitos.slice(2)
      : digitos;

  if (nacional.length !== 10 && nacional.length !== 11) return recusa("TAMANHO");

  const ddd = Number(nacional.slice(0, 2));
  if (!DDDS_VALIDOS.has(ddd)) return recusa("DDD");

  const local = nacional.slice(2);

  if (local.length === 9) {
    // Celular atual: nono dígito é sempre 9. "911111111" existe; "811111111" não.
    if (!local.startsWith("9")) return recusa("NUMERO");
  } else {
    // 8 dígitos: 2–5 é fixo, 6–9 é celular antigo (sem o nono dígito).
    // 0 e 1 abrem serviço (0800, 1xx) — não são linha de ninguém.
    const primeiro = local[0]!;
    if (primeiro === "0" || primeiro === "1") return recusa("NUMERO");
  }

  const celular = local.length === 9 || Number(local[0]) >= 6;

  return {
    ok: true,
    digitos: `55${nacional}`,
    e164: `+55${nacional}`,
    formatado: formatarNacional(nacional),
    celular,
  };
}

/** `(11) 98765-4321` / `(11) 3333-4444`. */
function formatarNacional(nacional: string): string {
  const ddd = nacional.slice(0, 2);
  const local = nacional.slice(2);
  const corte = local.length === 9 ? 5 : 4;
  return `(${ddd}) ${local.slice(0, corte)}-${local.slice(corte)}`;
}

/** Atalho booleano — é o que o Zod chama. */
export function whatsappBrValido(bruto: string | null | undefined): boolean {
  return analisarWhatsappBr(bruto).ok;
}

/**
 * O número em forma legível, ou `null` se não der para afirmar nada.
 *
 * Usado para MOSTRAR de volta a quem preencheu: repetir o texto cru é o que
 * fazia a tela de sucesso confirmar um número que não existe.
 */
export function formatarWhatsappBr(bruto: string | null | undefined): string | null {
  const r = analisarWhatsappBr(bruto);
  return r.ok ? r.formatado : null;
}
