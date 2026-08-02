// Shared types and helpers for the menu spreadsheet import feature

export type RowStatus = "valid" | "error" | "skipped";

export type RowResult = {
  rowIndex: number;
  foto: string;
  categoria: string;
  nome: string;
  descricao: string;
  ingredients: string;
  precoRaw: string;
  preco: number;
  /**
   * Cost of goods, when the spreadsheet has a cost column. Kept SEPARATE from `preco`
   * on purpose: until 2026-08-02 a column named "custo" was detected as the sale price,
   * so a merchant importing costs to feed the CMV overwrote the sale price of the whole
   * menu — real, silent data loss caused by the customer themselves.
   * `null` means the sheet had no cost column, which is different from a cost of zero.
   */
  custoRaw: string;
  custo: number | null;
  showInDelivery: boolean;
  showInDineIn: boolean;
  hasVariants: boolean;
  servingSize: number | null;
  portionInfo: string;
  code: string;
  tagFunil: string;
  perfilPaladar: string;
  harmonizacaoSugerida: string;
  alergenosDetalhados: string;
  storytellingIA: string;
  status: RowStatus;
  errors: string[];
};

export type ImportPreview = {
  rows: RowResult[];
  categories: string[];
  missingColumns: string[];
  stats: {
    total: number;
    valid: number;
    invalid: number;
    skipped: number;
  };
};

// Normalises price strings to a number.
// Handles: "R$ 42,90" / "42,90" / "42.90" / "1.234,90" / numeric cells
export function normalizePrice(raw: unknown): { value: number; valid: boolean } {
  if (raw === null || raw === undefined || raw === "") {
    return { value: 0, valid: false };
  }
  if (typeof raw === "number") {
    return { value: isNaN(raw) ? 0 : raw, valid: !isNaN(raw) && raw > 0 };
  }
  let s = String(raw).replace(/R\$\s*/gi, "").replace(/\s/g, "");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // "1.234,90" — dots are thousand separators
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // "42,90"
    s = s.replace(",", ".");
  }

  const n = parseFloat(s);
  return { value: isNaN(n) ? 0 : n, valid: !isNaN(n) && n > 0 };
}
