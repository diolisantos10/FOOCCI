/**
 * E-mail de contato plausível — a SEGUNDA porta do lead.
 *
 * ─── Por que este arquivo existe ─────────────────────────────────────────────
 * Em 08/08/2026 a Dioli Digital achou três contatos parados há 51, 29 e 28 dias
 * sem nenhuma resposta: o formulário guardava a conversa inteira e **nenhum
 * caminho de volta que funcionasse**. Um lead que não dá para alcançar vale zero,
 * e o WhatsApp sozinho é um caminho só — um dígito trocado, um número que não tem
 * WhatsApp, um chip que mudou de dono, e o contato morre em silêncio.
 *
 * ─── A regra, e o que ela NÃO faz ────────────────────────────────────────────
 * Ela confere a FORMA de um endereço de e-mail. Não confere se a caixa existe,
 * se recebe, nem se é de quem digitou — isso só se sabe mandando mensagem, e
 * afirmar mais do que se sabe é o erro que este arquivo evita, não repete.
 *
 * ─── O medo certo: recusar quem está certo ───────────────────────────────────
 * Igual ao `whatsapp-br.ts`: portão apertado demais barra o dono que estava
 * tentando comprar. Entra tudo que gente de verdade digita — maiúscula do teclado
 * do celular, espaço colado no fim por copiar/colar, `+` de alias, ponto no nome,
 * hífen no domínio, `.com.br`, `.adm.br`, domínio de quatro níveis.
 *
 * Fica FORA só o que NENHUM e-mail entregável tem:
 *   • sem `@`, ou com mais de um            · "sem-arroba", "a@b@c"
 *   • domínio sem ponto                      · "a@b"  ← o que `type="email"` ACEITA
 *   • espaço no meio                         · "joao@ tal.com"
 *   • ponto duplo, ponto na ponta            · "joao..b@tal.com", ".joao@tal.com"
 *   • rótulo de domínio começando/terminando em hífen
 *   • TLD de 1 letra ou com número           · "a@b.c", "a@b.c0m"
 *
 * ⚠️ **`a@b` é o caso que dá nome ao problema.** O `type="email"` do navegador
 * aceita — o padrão HTML não exige ponto no domínio, porque `a@intranet` é válido
 * numa rede interna. Num formulário público da internet isso é sempre engano de
 * digitação, e é por isso que a validação de verdade não pode ser a do navegador.
 *
 * PURO: sem I/O e sem dependência. O mesmo código roda no navegador (para a
 * pessoa ver o erro antes de enviar) e no servidor — que é onde a trava vale.
 */

/** A recusa diz o que FAZER. "Inválido" sozinho não ensina nada a ninguém. */
export const MENSAGEM_EMAIL_INVALIDO =
  "Informe um e-mail válido — ex.: voce@restaurante.com.br.";

/** Limites do RFC 5321, que é quem manda no que um servidor aceita entregar. */
const MAX_TOTAL = 254;
const MAX_LOCAL = 64;

export type MotivoRecusaEmail =
  /** Não é texto, ou veio vazio. */
  | "VAZIO"
  /** Nenhum `@`, ou mais de um. */
  | "ARROBA"
  /** Espaço (ou qualquer caractere de espaço) em qualquer posição. */
  | "ESPACO"
  /** A parte antes do `@` não tem forma de nome de caixa. */
  | "LOCAL"
  /** A parte depois do `@` não tem forma de domínio da internet. */
  | "DOMINIO"
  /** Passa dos limites que um servidor de e-mail aceita. */
  | "TAMANHO";

export type EmailContato =
  | {
      ok: true;
      /**
       * Para GUARDAR e para MOSTRAR de volta: sem espaço nas pontas e com o
       * domínio em minúscula (domínio não diferencia caixa; a parte local, pelo
       * RFC, diferencia — então ela é preservada como foi digitada).
       */
      normalizado: string;
      /** Só o domínio, minúsculo — útil para agrupar sem reprocessar a string. */
      dominio: string;
    }
  | { ok: false; motivo: MotivoRecusaEmail; mensagem: string };

function recusa(motivo: MotivoRecusaEmail): EmailContato {
  return { ok: false, motivo, mensagem: MENSAGEM_EMAIL_INVALIDO };
}

/** Caracteres que o RFC 5322 permite sem aspas na parte local. */
const LOCAL_OK = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
/** Rótulo de domínio: letra/dígito nas pontas, hífen só no meio. */
const ROTULO_OK = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
/** Domínio de topo: só letras, no mínimo duas (`.com`, `.br`, `.company`). */
const TLD_OK = /^[A-Za-z]{2,}$/;

/**
 * Analisa um e-mail digitado por gente.
 *
 * A ordem das checagens é a ordem em que os erros acontecem na vida real:
 * primeiro o campo vazio, depois o espaço colado pelo copiar/colar, depois o
 * `@`, e só então a forma das duas metades.
 */
export function analisarEmail(bruto: string | null | undefined): EmailContato {
  if (typeof bruto !== "string") return recusa("VAZIO");

  const texto = bruto.trim();
  if (texto === "") return recusa("VAZIO");

  // Espaço no MEIO (as pontas já caíram no trim). Também pega tabulação e quebra
  // de linha, que é o que vem quando a pessoa cola de um documento.
  if (/\s/.test(texto)) return recusa("ESPACO");

  if (texto.length > MAX_TOTAL) return recusa("TAMANHO");

  const partes = texto.split("@");
  if (partes.length !== 2) return recusa("ARROBA");

  const [local, dominioBruto] = partes as [string, string];

  // ── a parte antes do @ ──
  if (local === "" || local.length > MAX_LOCAL) return recusa("LOCAL");
  if (!LOCAL_OK.test(local)) return recusa("LOCAL");
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return recusa("LOCAL");
  }

  // ── a parte depois do @ ──
  const dominio = dominioBruto.toLowerCase();
  if (dominio === "" || dominio.length > 253) return recusa("DOMINIO");

  const rotulos = dominio.split(".");
  // Menos de dois rótulos = domínio sem ponto. É aqui que "a@b" morre.
  if (rotulos.length < 2) return recusa("DOMINIO");
  if (rotulos.some((r) => r.length === 0 || r.length > 63 || !ROTULO_OK.test(r))) {
    return recusa("DOMINIO");
  }
  if (!TLD_OK.test(rotulos[rotulos.length - 1]!)) return recusa("DOMINIO");

  return { ok: true, normalizado: `${local}@${dominio}`, dominio };
}

/** Atalho booleano — é o que o Zod chama. */
export function emailValido(bruto: string | null | undefined): boolean {
  return analisarEmail(bruto).ok;
}

/**
 * O e-mail em forma normalizada, ou `null` se não der para afirmar nada.
 *
 * Usado para MOSTRAR de volta a quem preencheu — mesma lição do WhatsApp: repetir
 * o texto cru faz a tela de sucesso confirmar um endereço que não existe.
 */
export function formatarEmail(bruto: string | null | undefined): string | null {
  const r = analisarEmail(bruto);
  return r.ok ? r.normalizado : null;
}
