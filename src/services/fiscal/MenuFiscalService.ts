/**
 * MenuFiscalService — edição em lote dos campos fiscais do cardápio (por
 * categoria e por item). Espelha o padrão dos endpoints de precificação: recebe
 * só as linhas alteradas e aplica em transação, sempre escopado ao restaurante.
 *
 * Herança na emissão: item → categoria → default global (ver nfceBuilder). Aqui
 * o lojista preenche os overrides; vazio ("") limpa o override (volta a herdar).
 */

import { prisma } from "@/lib/prisma";
import type { UpdateMenuFiscalInput } from "@/validators/fiscal";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

interface FiscalRowStrings {
  ncm?: string;
  cest?: string;
  cfop?: string;
  csosn?: string;
  cst?: string;
  origem?: string;
  unidade?: string;
}

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

/** Only the fields actually sent are written ("" → null clears the override). Pure. */
export function fiscalRowToData(row: FiscalRowStrings): Record<string, string | null> {
  const d: Record<string, string | null> = {};
  if (row.ncm !== undefined) d.fiscalNcm = clean(row.ncm);
  if (row.cest !== undefined) d.fiscalCest = clean(row.cest);
  if (row.cfop !== undefined) d.fiscalCfop = clean(row.cfop);
  if (row.csosn !== undefined) d.fiscalCsosn = clean(row.csosn);
  if (row.cst !== undefined) d.fiscalCst = clean(row.cst);
  if (row.origem !== undefined) d.fiscalOrigem = clean(row.origem);
  if (row.unidade !== undefined) d.fiscalUnidade = clean(row.unidade);
  return d;
}

export const MenuFiscalService = {
  async update(restaurantId: string, input: UpdateMenuFiscalInput): Promise<Result<{ updated: number }>> {
    try {
      let updated = 0;
      await prisma.$transaction(async (tx) => {
        // Categorias — updateMany escopado por restaurantId (seguro por tenant).
        for (const c of input.categories ?? []) {
          const data = fiscalRowToData(c);
          if (Object.keys(data).length === 0) continue;
          const res = await tx.menuCategory.updateMany({ where: { id: c.id, restaurantId }, data });
          updated += res.count;
        }
        // Itens — valida posse via a categoria (menu_item não tem restaurantId).
        if (input.items?.length) {
          const ids = input.items.map((i) => i.id);
          const valid = await tx.menuItem.findMany({
            where: { id: { in: ids }, category: { restaurantId } },
            select: { id: true },
          });
          const validSet = new Set(valid.map((v) => v.id));
          for (const it of input.items) {
            if (!validSet.has(it.id)) continue;
            const data: Record<string, string | number | null> = fiscalRowToData(it);
            if (it.icmsAliquota !== undefined) data.fiscalIcmsAliquota = it.icmsAliquota;
            if (Object.keys(data).length === 0) continue;
            await tx.menuItem.update({ where: { id: it.id }, data });
            updated += 1;
          }
        }
      });
      return { ok: true, data: { updated } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Erro ao salvar campos fiscais" };
    }
  },
};
