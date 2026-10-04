/**
 * chaveDoTelefone — a MESMA pessoa, qualquer que seja a forma gravada.
 *
 * Auditoria de 27/09/2026: a importação gravou celular antigo sem o 9
 * (+55DD8dígitos) e o checkout grava com o 9. Viravam dois clientes. Esta
 * chave junta as formas: tira o +55, e em celular de 10 dígitos (local
 * começando em 6–9) insere o 9. Fixo (local começando em 2–5) fica como está.
 *
 * Puro: sem banco. Usado pela contagem e, se o CEO aprovar, pela fusão.
 */
export function chaveDoTelefone(phone: string | null | undefined): string | null {
  if (!phone || phone.startsWith("GUEST-")) return null;
  let d = phone.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 10 && /[6-9]/.test(d[2]!)) d = d.slice(0, 2) + "9" + d.slice(2);
  return d.length === 11 || d.length === 10 ? d : null;
}

export interface ClienteParaAgrupar {
  id: string; phone: string | null; totalOrders: number; createdAt: Date;
}

/** Grupos de clientes do MESMO restaurante que são a mesma pessoa (2+). */
export function gruposDuplicados<T extends ClienteParaAgrupar>(clientes: readonly T[]): T[][] {
  const porChave = new Map<string, T[]>();
  for (const c of clientes) {
    const k = chaveDoTelefone(c.phone);
    if (!k) continue;
    (porChave.get(k) ?? porChave.set(k, []).get(k)!).push(c);
  }
  return [...porChave.values()].filter((g) => g.length > 1);
}

/** Quem sobrevive: mais pedidos, depois o cadastro mais antigo (mesma regra do checkout). */
export function sobrevivente<T extends ClienteParaAgrupar>(grupo: readonly T[]): T {
  return [...grupo].sort((a, b) =>
    b.totalOrders - a.totalOrders || a.createdAt.getTime() - b.createdAt.getTime())[0]!;
}
