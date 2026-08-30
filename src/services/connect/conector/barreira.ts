/**
 * ⛔⛔ A BARREIRA — cliente externo NUNCA acessa comunicação interna.
 *
 * ─── POR QUE ISTO É UM ARQUIVO, E NÃO UM CUIDADO ────────────────────────────
 *
 * Guardrail 4 da casa: *prompt é aviso; código é trava.* "Tome cuidado para não
 * mandar a fundamentação interna ao cliente" é aviso, e avisos falham no dia em
 * que alguém acrescenta um campo ao retorno do núcleo e o interpola no texto
 * sem pensar. Então a passagem do interno para o externo tem **uma única porta**,
 * ela é esta função, e ela é uma **allowlist de um campo só**.
 *
 * ─── AS DUAS TRAVAS, E ELAS SÃO DIFERENTES ──────────────────────────────────
 *
 *   1. **ALLOWLIST.** Um objeto que veio do núcleo tem N campos; exatamente um
 *      pode virar texto de cliente: `respostaAoCliente`. Os outros não são
 *      "evitados" — eles nunca são lidos. Campo novo no núcleo entra como campo
 *      interno por padrão, e não como campo que vazou por descuido.
 *
 *   2. ⭐ **CONFERÊNCIA DE VAZAMENTO.** A allowlist não protege contra o núcleo
 *      colocar texto interno DENTRO de `respostaAoCliente` — e isso acontece: um
 *      gerente que responde "pode dar permuta sim, mas não conta que o Diretor
 *      autorizou fora da tabela" escreveu conteúdo interno no campo externo.
 *      Então, antes de sair, o texto é conferido contra os VALORES internos que
 *      vieram no mesmo pacote. Se algum aparece lá dentro, a barreira **lança**.
 *
 * Lançar, e não cortar. Cortar entregaria ao cliente um texto diferente do que o
 * gerente escreveu, sem ninguém ficar sabendo — a mesma doutrina de "teto que
 * recusa em vez de cortar" da porta do Connect.
 *
 * ─── ⚠️ O QUE ESTA BARREIRA NÃO FAZ ────────────────────────────────────────
 *
 * Ela não julga o conteúdo do texto. Ela não sabe o que é "sigiloso" em
 * abstrato, e não tem como saber. Ela garante uma coisa exata e verificável:
 * **nada que chegou marcado como interno atravessa**, nem como campo, nem
 * copiado dentro do campo externo. O resto é decisão de quem escreveu — e essa
 * pessoa está do lado de dentro, sabendo que está falando com um cliente.
 */

/**
 * ⛔ Os campos que NUNCA saem do produto.
 *
 * Lista fechada e conferida no teste contra as interfaces de `contrato.ts`: um
 * campo novo lá que não esteja classificado aqui reprova a suíte.
 */
export const CAMPOS_INTERNOS = [
  "fundamentacaoInterna",
  "notaInterna",
  "decididaPor",
  "fio",
  "politicaId",
  "protocolo",
  "virouPolitica",
  "valeApenasPara",
] as const;

/** O único campo que atravessa. */
export const CAMPO_EXTERNO = "respostaAoCliente" as const;

/**
 * Piso do que conta como vazamento.
 *
 * Um valor interno de 3 caracteres ("v1", "OK") apareceria por acaso em quase
 * qualquer frase, e a barreira viraria um gerador de falso positivo que alguém
 * desligaria na terceira vez. Oito caracteres é o ponto em que a coincidência
 * deixa de ser plausível e a aparição vira cópia.
 */
export const MINIMO_PARA_CONTAR_COMO_VAZAMENTO = 8;

export class VazamentoInterno extends Error {
  constructor(readonly campo: string) {
    super(
      `a barreira do conector impediu uma resposta ao cliente: o texto externo repetia, por dentro, o ` +
        `conteúdo do campo interno "${campo}". Comunicação interna não atravessa para cliente externo — ` +
        "nem como campo, nem copiada dentro do campo externo. Quem escreveu precisa reescrever a resposta " +
        "sem o material interno; o conector não corta o texto por conta própria, porque entregar um texto " +
        "diferente do que o gerente escreveu, sem ninguém saber, é o outro jeito de errar isto.",
    );
    this.name = "VazamentoInterno";
  }
}

export type TextoParaOCliente =
  | { ok: true; texto: string }
  | { ok: false; motivo: string };

function normalizar(t: string): string {
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * ⭐ A ÚNICA PORTA entre o que veio do núcleo e o que o cliente lê.
 *
 * @throws {VazamentoInterno} quando o texto externo carrega material interno.
 */
export function paraOCliente(bruto: unknown): TextoParaOCliente {
  if (!bruto || typeof bruto !== "object") {
    return { ok: false, motivo: "o pacote do núcleo não é um objeto" };
  }
  const pacote = bruto as Record<string, unknown>;

  // ── Trava 1: allowlist de um campo ───────────────────────────────────────
  const externo = pacote[CAMPO_EXTERNO];
  if (typeof externo !== "string" || !externo.trim()) {
    return {
      ok: false,
      motivo:
        `o pacote não traz "${CAMPO_EXTERNO}" preenchido, e este é o único campo que pode virar texto ` +
        "para o cliente. Sem ele não há o que entregar — e improvisar uma frase a partir de outro campo " +
        "seria a barreira se contornando sozinha.",
    };
  }
  const texto = externo.trim();

  // ── Trava 2: nada interno atravessa copiado por dentro ───────────────────
  nuncaVazaInterno(texto, pacote);

  return { ok: true, texto };
}

/**
 * A trava que PODE falhar — e que o teste exercita com um pacote de verdade.
 *
 * Separada e exportada de propósito: uma trava que só existe dentro de outra
 * função só se prova por acidente, e a auditoria de 30/08/2026 já pegou nesta
 * casa um assert redundante vendido como trava (achado B-1).
 */
export function nuncaVazaInterno(texto: string, pacote: Record<string, unknown>): void {
  const alvo = normalizar(texto);
  for (const campo of CAMPOS_INTERNOS) {
    for (const valor of valoresDeTexto(pacote[campo])) {
      if (valor.length < MINIMO_PARA_CONTAR_COMO_VAZAMENTO) continue;
      if (alvo.includes(normalizar(valor))) throw new VazamentoInterno(campo);
    }
  }
}

/** Puxa os textos de dentro de um valor interno, que pode ser objeto ou lista. */
function valoresDeTexto(valor: unknown): string[] {
  if (typeof valor === "string") return [valor];
  if (Array.isArray(valor)) return valor.flatMap(valoresDeTexto);
  if (valor && typeof valor === "object") {
    return Object.values(valor as Record<string, unknown>).flatMap(valoresDeTexto);
  }
  return [];
}
