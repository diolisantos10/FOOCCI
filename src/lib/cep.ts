/**
 * CEP lookup (ViaCEP) — same data source pattern the checkout relies on for
 * address quality. Never throws; returns null on any failure. NEVER called in
 * automated tests (guarded) — tests inject a fake via WaProcessInput.cepLookup.
 */

export interface CepAddress {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  uf: string;
}

function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true" || !!process.env.VITEST_WORKER_ID;
}

export async function lookupCep(rawCep: string): Promise<CepAddress | null> {
  const cep = (rawCep ?? "").replace(/\D/g, "");
  if (cep.length !== 8 || isTestEnv()) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as
      | { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
      | null;
    if (!body || body.erro || !body.logradouro) return null;
    return {
      cep,
      street: body.logradouro,
      neighborhood: body.bairro ?? "",
      city: body.localidade ?? "",
      uf: body.uf ?? "",
    };
  } catch {
    return null;
  }
}
