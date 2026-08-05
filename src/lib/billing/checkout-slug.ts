/**
 * Regras do endereço da loja escolhido no checkout self-service.
 *
 * O slug vira `foocci.com.br/pedido/<slug>` e o identificador do tenant. Fica em
 * arquivo próprio porque três lugares precisam da MESMA regra — a validação do
 * POST de checkout, a consulta de disponibilidade e o formulário — e regra de
 * validação duplicada é regra que diverge.
 */

export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Nomes que não podem virar loja. Não é sobre rota (a loja mora sob `/pedido/`),
 * é sobre não entregar a um cliente um endereço que parece institucional da
 * Foocci ou que confunde suporte.
 */
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "site",
  "login",
  "logout",
  "setup",
  "contratar",
  "pedido",
  "qr",
  "foocci",
  "suporte",
  "ajuda",
  "conta",
  "billing",
  "checkout",
  "www",
  "teste",
  "demo",
]);

export interface SlugVerdict {
  ok: boolean;
  error?: string;
}

/** Valida forma e reserva. NÃO consulta o banco — colisão é checada à parte. */
export function validateSlugShape(slug: string): SlugVerdict {
  const s = slug.trim().toLowerCase();
  if (s.length < 3) return { ok: false, error: "O endereço precisa de ao menos 3 caracteres." };
  if (s.length > 60) return { ok: false, error: "O endereço passou de 60 caracteres." };
  if (!SLUG_REGEX.test(s)) {
    return { ok: false, error: "Use só letras minúsculas, números e hífen (sem hífen no começo ou no fim)." };
  }
  if (RESERVED_SLUGS.has(s)) return { ok: false, error: "Esse endereço é reservado. Escolha outro." };
  return { ok: true };
}

/** Sugere um endereço a partir do nome do restaurante. */
export function suggestSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
