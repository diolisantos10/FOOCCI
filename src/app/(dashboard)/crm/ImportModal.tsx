"use client";

import { useState, useRef, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ImportType = "customers" | "orders" | "customers_orders" | "saipos_nemo_compiled";
type Step = "type" | "upload" | "map" | "preview" | "importing" | "done";

interface ParsedFile {
  columns:          string[];
  rows:             Record<string, string>[];
  totalRows:        number;
  fileName:         string;
  duplicateHeaders: string[];
}

interface CustomerMapping {
  phone:               string;
  name?:               string;
  email?:              string;
  birthday?:           string;
  document?:           string;
  financialBalance?:   string;
  importedOrderCount?: string;
  importedTotalSpent?: string;
  importedLastOrderAt?: string;
  averageTicket?:      string;
  notes?:              string;
}

interface OrderMapping {
  customerPhone:    string;
  customerName?:    string;
  customerEmail?:   string;
  orderDate:        string;
  orderTotal:       string;
  orderExternalId?: string;
  orderStatus?:     string;
  paymentMethod?:   string;
  deliveryFee?:     string;
  discount?:        string;
  fulfillmentType?: string;
  productName?:     string;
  productCategory?: string;
  quantity?:        string;
  unitPrice?:       string;
  itemTotal?:       string;
  itemNotes?:       string;
}

interface CustomerPreview {
  totalRows:    number;
  newCount:     number;
  updateCount:  number;
  invalidCount: number;
  dupesInFile:  number;
  sample: Array<{ name: string | null; phone: string; email: string | null; status: "new" | "update" | "invalid"; reason?: string }>;
}

interface OrderPreview {
  totalRows:         number;
  validRows:         number;
  errorRows:         number;
  warningRows:       number;
  uniqueOrders:      number;
  newCustomers:      number;
  existingCustomers: number;
  productsMatched:   number;
  productsUnmatched: number;
  duplicateOrders:   number;
  errors:            Array<{ row: number; reason: string }>;
  warnings:          string[];
  unmatchedProducts: Array<{ name: string; count: number }>;
  sampleOrders:      Array<{ phone: string; date: string; total: number; itemCount: number; status: "new" | "duplicate" | "warning" }>;
}

type Preview = CustomerPreview | OrderPreview;

interface CustomerResult {
  created: number;
  updated: number;
  invalid: number;
  total:   number;
}

interface OrderResult {
  totalRows:         number;
  createdCustomers:  number;
  updatedCustomers:  number;
  createdOrders:     number;
  createdItems:      number;
  skippedDuplicates: number;
  errorRows:         number;
  unmatchedProducts: Array<{ name: string; count: number; revenue: number }>;
  rebuildSummary:    { customersProcessed: number; customersUpdated: number };
}

type ImportResult = CustomerResult | OrderResult;

function isOrderPreview(p: Preview): p is OrderPreview { return "uniqueOrders" in p; }
function isOrderResult(r: ImportResult): r is OrderResult { return "createdOrders" in r; }

// ── Saipos + Nemo types ──────────────────────────────────────────────────────

interface SaiposNemoPreviewData {
  stats: {
    readyCount:              number;
    needsReviewCount:        number;
    noPhoneImportableCount:  number;
    noPhoneSkippedCount:     number;
    noPhoneNeedsReviewCount: number;
  };
  productCount:   number;
  categoryCount:  number;
  totalQuantity:  number;
  totalRevenue:   number;
  periodStart:    string | null;
  periodEnd:      string | null;
  noPhoneWarning: string;
  importMode:     string;
}

interface SaiposNemoExecuteResult {
  contactableCustomersCreated:    number;
  contactableCustomersUpdated:    number;
  nonContactableCustomersCreated: number;
  nonContactableCustomersUpdated: number;
  noPhoneSkippedInsufficientData: number;
  addressesCreated:               number;
  productAggregatesCreated:       number;
  productAggregatesSkipped:       number;
}

// ── Auto-detection ───────────────────────────────────────────────────────────

const HINTS = {
  // Customer-only mapping
  phone:              ["telefone","phone","celular","fone","tel","whatsapp","mobile"],
  name:               ["nome","name","cliente","customer","razao","razão"],
  email:              ["email","e-mail","mail","correio"],
  birthday:           ["aniversario","aniversário","nascimento","birthday","data_nascimento","data_aniversario","data_aniversário","data_nascimento","birth_date"],
  document:           ["cpf/cnpj","cpf","cnpj","documento","document","tax_id"],
  financialBalance:   ["saldo_financeiro","saldo financeiro","balance","financial_balance","credit_balance"],
  importedOrderCount: ["qtd._pedidos","qtd_pedidos","qtd. pedidos","quantidade_pedidos","pedidos","total_pedidos","order_count","totalorders"],
  importedTotalSpent: ["valor_total","valor total","total_gasto","gasto_total","totalspend","spent","lifetime_value"],
  importedLastOrderAt:["ultima_compra","última_compra","ultima compra","última compra","last_purchase","lastorderat","last_order_at"],
  averageTicket:      ["ticket_medio","ticket_médio","ticket medio","ticket médio","average_ticket","averageticket","avg_order_value"],
  notes:              ["observacao_interna","observação_interna","observacao interna","observação interna","observacoes","observações","notas","notes","internal_notes","internalnotes"],
  // Order mapping
  customerPhone:   ["telefone_cliente","telefone","phone","celular","whatsapp","fone"],
  customerName:    ["nome_cliente","cliente","nome","customer_name","name"],
  customerEmail:   ["email_cliente","email","e-mail","mail"],
  orderDate:       ["data_pedido","data","date","created_at","criado_em","data_compra"],
  orderTotal:      ["total","valor_total","valor","amount","total_pedido"],
  orderExternalId: ["id_externo","external_id","pedido_id","order_id","codigo"],
  orderStatus:     ["status","situacao","situação","estado"],
  paymentMethod:   ["pagamento","metodo_pagamento","payment","forma_pagamento"],
  deliveryFee:     ["taxa_entrega","frete","delivery_fee","entrega"],
  discount:        ["desconto","discount"],
  fulfillmentType: ["tipo_entrega","modalidade","fulfillment","tipo"],
  productName:     ["produto","item","nome_produto","product","descricao","descrição"],
  productCategory: ["categoria","category","categoria_produto"],
  quantity:        ["quantidade","qtd","qty","quantity","quant"],
  unitPrice:       ["preco_unitario","valor_unitario","preco","price","unit_price","preco_unit"],
  itemTotal:       ["total_item","subtotal_item","item_total"],
  itemNotes:       ["observacao","observação","obs","notes","nota_item"],
};

function findCol(columns: string[], hints: string[]): string | undefined {
  const lower = columns.map((c) => c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s/g,"_"));
  const idx   = lower.findIndex((c) => hints.some((h) => c.includes(h)));
  return idx >= 0 ? columns[idx] : undefined;
}

function autoDetectCustomer(columns: string[]): CustomerMapping {
  return {
    phone:               findCol(columns, HINTS.phone) ?? columns[0] ?? "",
    name:                findCol(columns, HINTS.name),
    email:               findCol(columns, HINTS.email),
    birthday:            findCol(columns, HINTS.birthday),
    document:            findCol(columns, HINTS.document),
    financialBalance:    findCol(columns, HINTS.financialBalance),
    importedOrderCount:  findCol(columns, HINTS.importedOrderCount),
    importedTotalSpent:  findCol(columns, HINTS.importedTotalSpent),
    importedLastOrderAt: findCol(columns, HINTS.importedLastOrderAt),
    averageTicket:       findCol(columns, HINTS.averageTicket),
    notes:               findCol(columns, HINTS.notes),
  };
}

function autoDetectOrder(columns: string[]): OrderMapping {
  return {
    customerPhone:   findCol(columns, HINTS.customerPhone) ?? columns[0] ?? "",
    customerName:    findCol(columns, HINTS.customerName),
    customerEmail:   findCol(columns, HINTS.customerEmail),
    orderDate:       findCol(columns, HINTS.orderDate)  ?? "",
    orderTotal:      findCol(columns, HINTS.orderTotal) ?? "",
    orderExternalId: findCol(columns, HINTS.orderExternalId),
    orderStatus:     findCol(columns, HINTS.orderStatus),
    paymentMethod:   findCol(columns, HINTS.paymentMethod),
    deliveryFee:     findCol(columns, HINTS.deliveryFee),
    discount:        findCol(columns, HINTS.discount),
    fulfillmentType: findCol(columns, HINTS.fulfillmentType),
    productName:     findCol(columns, HINTS.productName),
    productCategory: findCol(columns, HINTS.productCategory),
    quantity:        findCol(columns, HINTS.quantity),
    unitPrice:       findCol(columns, HINTS.unitPrice),
    itemTotal:       findCol(columns, HINTS.itemTotal),
    itemNotes:       findCol(columns, HINTS.itemNotes),
  };
}

// ── UI sub-components ────────────────────────────────────────────────────────

function StepDots({ step, importType }: { step: Step; importType?: ImportType }) {
  const order: Step[] = importType === "saipos_nemo_compiled"
    ? ["type","upload","preview","done"]
    : ["type","upload","map","preview","done"];
  const idx = order.indexOf(step === "importing" ? "preview" : step);
  return (
    <div className="flex items-center justify-center gap-2 mb-5">
      {order.map((s,i) => (
        <span key={s} className={`h-2 rounded-full transition-all ${i===idx ? "w-6 bg-brand-600" : i<idx ? "w-2 bg-brand-300" : "w-2 bg-gray-200"}`} />
      ))}
    </div>
  );
}

// ── Step 1: Type ─────────────────────────────────────────────────────────────

function TypeStep({ onSelect }: { onSelect: (t: ImportType) => void }) {
  const options: Array<{ value: ImportType; label: string; desc: string; icon: string }> = [
    { value: "customers",              label: "Clientes",            desc: "Apenas cadastro de clientes (telefone, nome, e-mail, aniversário).", icon: "👥" },
    { value: "orders",                 label: "Pedidos com itens",   desc: "Histórico de pedidos com produtos. Os clientes serão criados automaticamente.", icon: "📦" },
    { value: "customers_orders",       label: "Clientes + Pedidos",  desc: "Importa clientes e pedidos a partir do mesmo arquivo.", icon: "🧾" },
    { value: "saipos_nemo_compiled",   label: "Saipos + Nemo",       desc: "Importar planilha compilada com clientes, endereços e produtos agregados.", icon: "🏭" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-800">O que você quer importar?</p>
        <p className="text-xs text-gray-500 mt-0.5">Selecione o tipo da base que vai enviar.</p>
      </div>

      <div className="space-y-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(opt.value)}
            className="w-full flex items-start gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left hover:border-brand-400 hover:bg-brand-50/50 transition-colors"
          >
            <span className="text-xl shrink-0">{opt.icon}</span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-800">{opt.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
        💡 Dica: para pedidos, use <strong>uma linha por item do pedido</strong>. Pedidos com vários itens devem repetir as colunas de cliente, data e total.
      </div>
    </div>
  );
}

// ── Step 2: Upload ───────────────────────────────────────────────────────────

function UploadStep({
  importType, onParsed,
}: {
  importType: ImportType;
  onParsed: (data: ParsedFile) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res  = await fetch("/api/crm/import/parse", { method: "POST", body: formData });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) { setError(json.error ?? "Falha ao processar arquivo"); return; }
    onParsed({ columns: json.columns, rows: json.rows, totalRows: json.totalRows, fileName: file.name, duplicateHeaders: json.duplicateHeaders ?? [] });
  }

  function downloadTemplate() {
    const url = `/api/crm/import/template?type=${importType}`;
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">Envie o arquivo</p>
          <p className="text-xs text-gray-500 mt-0.5">CSV ou XLSX. Você pode baixar o modelo abaixo.</p>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          ⬇ Baixar modelo
        </button>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        disabled={loading}
        className={`w-full rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? "border-brand-400 bg-brand-50" : "border-gray-200 bg-gray-50 hover:border-brand-300 hover:bg-brand-50/50"
        } disabled:opacity-60`}
      >
        <div className="flex flex-col items-center gap-3">
          <svg className="h-10 w-10 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.338-2.32 5.75 5.75 0 0 1 1.14 11.093" />
          </svg>
          {loading
            ? <span className="text-sm text-gray-500">Processando…</span>
            : <>
                <span className="text-sm font-semibold text-gray-700">Arraste o arquivo aqui ou clique para selecionar</span>
                <span className="text-xs text-gray-400">CSV ou XLSX • máx. 50 000 linhas</span>
              </>
          }
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {error && (
        <p className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}

// ── Generic field-mapping select ─────────────────────────────────────────────

function FieldSelect({
  label, required, value, columns, onChange, hint,
}: {
  label:    string;
  required?: boolean;
  value:    string | undefined;
  columns:  string[];
  onChange: (v: string) => void;
  hint?:    string;
}) {
  const none = "";
  const options = required
    ? columns.map((c) => ({ value: c, label: c }))
    : [{ value: none, label: "— não importar —" }, ...columns.map((c) => ({ value: c, label: c }))];

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        value={value ?? none}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <p className="mt-1 text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}

// ── Step 3: Map ──────────────────────────────────────────────────────────────

function MapStep({
  parsed, importType, onConfirm, onBack,
}: {
  parsed:     ParsedFile;
  importType: ImportType;
  onConfirm:  (cm: CustomerMapping | undefined, om: OrderMapping | undefined) => void;
  onBack:     () => void;
}) {
  const [customer, setCustomer] = useState<CustomerMapping>(() => autoDetectCustomer(parsed.columns));
  const [order, setOrder]       = useState<OrderMapping>(() => autoDetectOrder(parsed.columns));

  const showCustomer = importType === "customers" || importType === "customers_orders";
  const showOrder    = importType === "orders"    || importType === "customers_orders";

  const canContinue = (() => {
    if (showCustomer && !customer.phone) return false;
    if (showOrder    && (!order.customerPhone || !order.orderDate || !order.orderTotal)) return false;
    return true;
  })();

  function setO<K extends keyof OrderMapping>(k: K, v: string | undefined) {
    setOrder((p) => ({ ...p, [k]: v || undefined }));
  }
  function setC<K extends keyof CustomerMapping>(k: K, v: string | undefined) {
    setCustomer((p) => ({ ...p, [k]: v || undefined }));
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-gray-800">Mapeie as colunas</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Arquivo: <strong>{parsed.fileName}</strong> · {parsed.totalRows} linhas
        </p>
      </div>

      {/* Customer-only fields (top) */}
      {importType === "customers" && (
        <div className="space-y-3">
          <FieldSelect label="Telefone"          required value={customer.phone}               columns={parsed.columns} onChange={(v) => setC("phone", v)}               hint="Identificador único — não pode ficar em branco." />
          <FieldSelect label="Nome"                       value={customer.name}                columns={parsed.columns} onChange={(v) => setC("name", v)} />
          <FieldSelect label="E-mail"                     value={customer.email}               columns={parsed.columns} onChange={(v) => setC("email", v)} />
          <FieldSelect label="Aniversário"                value={customer.birthday}            columns={parsed.columns} onChange={(v) => setC("birthday", v)}            hint="DD/MM/AAAA" />
          <FieldSelect label="CPF / CNPJ"                 value={customer.document}            columns={parsed.columns} onChange={(v) => setC("document", v)} />
          <FieldSelect label="Saldo Financeiro"           value={customer.financialBalance}    columns={parsed.columns} onChange={(v) => setC("financialBalance", v)}    hint="Valor em reais, ex: 150,00" />
          <FieldSelect label="Qtd. Pedidos (importado)"   value={customer.importedOrderCount}  columns={parsed.columns} onChange={(v) => setC("importedOrderCount", v)} />
          <FieldSelect label="Total Gasto (importado)"    value={customer.importedTotalSpent}  columns={parsed.columns} onChange={(v) => setC("importedTotalSpent", v)} />
          <FieldSelect label="Última Compra (importado)"  value={customer.importedLastOrderAt} columns={parsed.columns} onChange={(v) => setC("importedLastOrderAt", v)} hint="DD/MM/AAAA" />
          <FieldSelect label="Ticket Médio (importado)"   value={customer.averageTicket}       columns={parsed.columns} onChange={(v) => setC("averageTicket", v)} />
          <FieldSelect label="Observações"                value={customer.notes}               columns={parsed.columns} onChange={(v) => setC("notes", v)} />
        </div>
      )}

      {/* Order fields */}
      {showOrder && (
        <>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Cliente</p>
            <div className="space-y-3">
              <FieldSelect label="Telefone do cliente" required value={order.customerPhone} columns={parsed.columns} onChange={(v) => setO("customerPhone", v)} />
              <FieldSelect label="Nome do cliente"              value={order.customerName}  columns={parsed.columns} onChange={(v) => setO("customerName", v)} />
              <FieldSelect label="E-mail do cliente"            value={order.customerEmail} columns={parsed.columns} onChange={(v) => setO("customerEmail", v)} />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Pedido</p>
            <div className="space-y-3">
              <FieldSelect label="Data do pedido"  required value={order.orderDate}        columns={parsed.columns} onChange={(v) => setO("orderDate", v)}      hint="DD/MM/AAAA ou ISO" />
              <FieldSelect label="Valor total"     required value={order.orderTotal}       columns={parsed.columns} onChange={(v) => setO("orderTotal", v)} />
              <FieldSelect label="ID externo"               value={order.orderExternalId}  columns={parsed.columns} onChange={(v) => setO("orderExternalId", v)} hint="Para evitar duplicatas em re-importações." />
              <FieldSelect label="Tipo de entrega"          value={order.fulfillmentType}  columns={parsed.columns} onChange={(v) => setO("fulfillmentType", v)} hint="delivery / pickup / mesa" />
              <FieldSelect label="Pagamento"                value={order.paymentMethod}    columns={parsed.columns} onChange={(v) => setO("paymentMethod", v)}   hint="pix / dinheiro / cartão / online" />
              <FieldSelect label="Taxa de entrega"          value={order.deliveryFee}      columns={parsed.columns} onChange={(v) => setO("deliveryFee", v)} />
              <FieldSelect label="Desconto"                 value={order.discount}         columns={parsed.columns} onChange={(v) => setO("discount", v)} />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Item do pedido</p>
            <p className="mb-2 text-[11px] text-gray-400">Use uma linha por item. Linhas com mesmo telefone + data + ID se agrupam em um pedido.</p>
            <div className="space-y-3">
              <FieldSelect label="Produto"        value={order.productName}     columns={parsed.columns} onChange={(v) => setO("productName", v)} />
              <FieldSelect label="Categoria"      value={order.productCategory} columns={parsed.columns} onChange={(v) => setO("productCategory", v)} />
              <FieldSelect label="Quantidade"     value={order.quantity}        columns={parsed.columns} onChange={(v) => setO("quantity", v)} />
              <FieldSelect label="Preço unitário" value={order.unitPrice}       columns={parsed.columns} onChange={(v) => setO("unitPrice", v)} />
              <FieldSelect label="Total do item"  value={order.itemTotal}       columns={parsed.columns} onChange={(v) => setO("itemTotal", v)} />
              <FieldSelect label="Observação"     value={order.itemNotes}       columns={parsed.columns} onChange={(v) => setO("itemNotes", v)} />
            </div>
          </div>
        </>
      )}

      {/* Customer auxiliary fields when both */}
      {importType === "customers_orders" && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Dados extras de cliente</p>
          <div className="space-y-3">
            <FieldSelect label="Aniversário"               value={customer.birthday}            columns={parsed.columns} onChange={(v) => setC("birthday", v)}            hint="DD/MM/AAAA" />
            <FieldSelect label="CPF / CNPJ"                value={customer.document}            columns={parsed.columns} onChange={(v) => setC("document", v)} />
            <FieldSelect label="Saldo Financeiro"          value={customer.financialBalance}    columns={parsed.columns} onChange={(v) => setC("financialBalance", v)} />
            <FieldSelect label="Qtd. Pedidos (importado)"  value={customer.importedOrderCount}  columns={parsed.columns} onChange={(v) => setC("importedOrderCount", v)} />
            <FieldSelect label="Total Gasto (importado)"   value={customer.importedTotalSpent}  columns={parsed.columns} onChange={(v) => setC("importedTotalSpent", v)} />
            <FieldSelect label="Última Compra (importado)" value={customer.importedLastOrderAt} columns={parsed.columns} onChange={(v) => setC("importedLastOrderAt", v)} />
            <FieldSelect label="Ticket Médio (importado)"  value={customer.averageTicket}       columns={parsed.columns} onChange={(v) => setC("averageTicket", v)} />
            <FieldSelect label="Observações"               value={customer.notes}               columns={parsed.columns} onChange={(v) => setC("notes", v)} />
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button onClick={onBack} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">Voltar</button>
        <button
          onClick={() => {
            const cm: CustomerMapping | undefined = showCustomer
              ? { phone: order.customerPhone || customer.phone, name: customer.name ?? order.customerName, email: customer.email ?? order.customerEmail, birthday: customer.birthday }
              : undefined;
            const om: OrderMapping | undefined = showOrder ? order : undefined;
            onConfirm(cm, om);
          }}
          disabled={!canContinue}
          className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Ver prévia
        </button>
      </div>
    </div>
  );
}

// ── Step 4: Preview ──────────────────────────────────────────────────────────

function PreviewStep({
  preview, onConfirm, onBack, loading, duplicateHeaders,
}: {
  preview:          Preview;
  onConfirm:        () => void;
  onBack:           () => void;
  loading:          boolean;
  duplicateHeaders: string[];
}) {
  if (isOrderPreview(preview)) {
    const stats = [
      { label: "Linhas no arquivo",      value: preview.totalRows,         color: "text-gray-900" },
      { label: "Pedidos únicos",         value: preview.uniqueOrders,      color: "text-gray-900" },
      { label: "Novos clientes",         value: preview.newCustomers,      color: "text-green-700" },
      { label: "Clientes já existentes", value: preview.existingCustomers, color: "text-blue-700" },
      { label: "Produtos com match",     value: preview.productsMatched,   color: "text-green-700" },
      { label: "Produtos sem match",     value: preview.productsUnmatched, color: "text-orange-600" },
      { label: "Pedidos duplicados",     value: preview.duplicateOrders,   color: "text-orange-600" },
      { label: "Linhas com erro",        value: preview.errorRows,         color: "text-red-600" },
    ];
    const importable = preview.uniqueOrders - preview.duplicateOrders;

    return (
      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-gray-800">Confirmar importação</p>
          <p className="text-xs text-gray-500 mt-0.5">Revise antes de prosseguir. Pedidos duplicados serão ignorados.</p>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-gray-50 divide-y divide-gray-100">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-gray-600">{s.label}</span>
              <span className={`text-sm font-bold ${s.color}`}>{s.value}</span>
            </div>
          ))}
        </div>

        {preview.unmatchedProducts.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Produtos não encontrados no cardápio</p>
            <div className="rounded-xl border border-orange-100 bg-orange-50 max-h-32 overflow-y-auto divide-y divide-orange-100">
              {preview.unmatchedProducts.slice(0, 12).map((p) => (
                <div key={p.name} className="flex items-center justify-between px-3 py-1.5 text-xs">
                  <span className="text-gray-800 truncate">{p.name}</span>
                  <span className="font-semibold text-orange-600 shrink-0 ml-2">{p.count}×</span>
                </div>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-gray-500">Estes itens serão importados com o nome original — sem ligação ao produto.</p>
          </div>
        )}

        {preview.errors.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-red-700 mb-2">Erros</p>
            <div className="rounded-xl border border-red-100 bg-red-50 max-h-32 overflow-y-auto divide-y divide-red-100">
              {preview.errors.slice(0, 8).map((e, i) => (
                <div key={i} className="px-3 py-1.5 text-xs text-red-700">{e.reason}</div>
              ))}
            </div>
          </div>
        )}

        {importable === 0 && (
          <p className="rounded-xl bg-yellow-50 border border-yellow-100 px-4 py-3 text-sm text-yellow-700">
            Nenhum pedido novo para importar.
          </p>
        )}

        <div className="flex gap-2">
          <button onClick={onBack} disabled={loading} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">Voltar</button>
          <button
            onClick={onConfirm}
            disabled={loading || importable === 0}
            className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? "Importando…" : `Importar ${importable} pedido${importable !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    );
  }

  // Customer-only preview (legacy)
  const stats = [
    { label: "Total de linhas",      value: preview.totalRows,    color: "text-gray-900" },
    { label: "Novos clientes",       value: preview.newCount,     color: "text-green-700" },
    { label: "Clientes a atualizar", value: preview.updateCount,  color: "text-blue-700" },
    { label: "Duplicatas no arquivo",value: preview.dupesInFile,  color: "text-orange-600" },
    { label: "Linhas inválidas",     value: preview.invalidCount, color: "text-red-600" },
  ];
  const importCount = preview.newCount + preview.updateCount;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-gray-800">Confirmar importação</p>
        <p className="text-xs text-gray-500 mt-0.5">Revise os dados antes de prosseguir.</p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-gray-50 divide-y divide-gray-100">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-600">{s.label}</span>
            <span className={`text-sm font-bold ${s.color}`}>{s.value}</span>
          </div>
        ))}
      </div>

      {duplicateHeaders.length > 0 && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          <strong>Colunas duplicadas detectadas:</strong> {duplicateHeaders.join(", ")}. A segunda ocorrência foi renomeada para <em>nome_2</em> no mapeamento.
        </div>
      )}

      {importCount === 0 && (
        <p className="rounded-xl bg-yellow-50 border border-yellow-100 px-4 py-3 text-sm text-yellow-700">
          Nenhum dado válido encontrado para importar.
        </p>
      )}

      <div className="flex gap-2">
        <button onClick={onBack} disabled={loading} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">Voltar</button>
        <button onClick={onConfirm} disabled={loading || importCount === 0} className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">
          {loading ? "Importando…" : `Importar ${importCount} cliente${importCount !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

// ── Step 5: Done ─────────────────────────────────────────────────────────────

function DoneStep({ result, onClose }: { result: ImportResult; onClose: () => void }) {
  if (isOrderResult(result)) {
    const rows = [
      { label: "Pedidos criados",       value: result.createdOrders,     color: "text-green-700" },
      { label: "Itens criados",         value: result.createdItems,      color: "text-green-700" },
      { label: "Clientes criados",      value: result.createdCustomers,  color: "text-green-700" },
      { label: "Clientes atualizados",  value: result.updatedCustomers,  color: "text-blue-700" },
      { label: "Pedidos duplicados",    value: result.skippedDuplicates, color: "text-orange-600" },
      { label: "Linhas com erro",       value: result.errorRows,         color: "text-red-600" },
      { label: "Métricas recalculadas", value: result.rebuildSummary.customersUpdated, color: "text-gray-700" },
    ];

    return (
      <div className="flex flex-col items-center gap-5 py-2 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <div>
          <p className="text-base font-bold text-gray-900">Importação concluída!</p>
          <p className="mt-1 text-sm text-gray-500">{result.totalRows} linhas processadas</p>
        </div>
        <div className="w-full rounded-2xl border border-gray-100 bg-gray-50 divide-y divide-gray-100">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-gray-600">{r.label}</span>
              <span className={`font-bold ${r.color}`}>{r.value}</span>
            </div>
          ))}
        </div>
        {result.unmatchedProducts.length > 0 && (
          <div className="w-full text-left">
            <p className="text-xs font-semibold text-gray-600 mb-1">Produtos não vinculados</p>
            <div className="rounded-xl border border-orange-100 bg-orange-50 max-h-32 overflow-y-auto divide-y divide-orange-100">
              {result.unmatchedProducts.slice(0, 8).map((p) => (
                <div key={p.name} className="flex items-center justify-between px-3 py-1.5 text-xs">
                  <span className="text-gray-800 truncate">{p.name}</span>
                  <span className="text-orange-600 shrink-0 ml-2">{p.count}× · R$ {p.revenue.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <button onClick={onClose} className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">Concluir</button>
      </div>
    );
  }

  // Customer-only result
  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>
      <div>
        <p className="text-base font-bold text-gray-900">Importação concluída!</p>
        <p className="mt-1 text-sm text-gray-500">{result.total} linhas processadas</p>
      </div>
      <div className="w-full rounded-2xl border border-gray-100 bg-gray-50 divide-y divide-gray-100">
        <div className="flex justify-between px-4 py-3 text-sm">
          <span className="text-gray-600">Clientes criados</span>
          <span className="font-bold text-green-700">{result.created}</span>
        </div>
        <div className="flex justify-between px-4 py-3 text-sm">
          <span className="text-gray-600">Clientes atualizados</span>
          <span className="font-bold text-blue-700">{result.updated}</span>
        </div>
        {result.invalid > 0 && (
          <div className="flex justify-between px-4 py-3 text-sm">
            <span className="text-gray-600">Linhas ignoradas</span>
            <span className="font-bold text-red-600">{result.invalid}</span>
          </div>
        )}
      </div>
      <button onClick={onClose} className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">Concluir</button>
    </div>
  );
}

// ── Saipos + Nemo: Upload ────────────────────────────────────────────────────

function SaiposNemoUploadStep({
  onPreview,
}: {
  onPreview: (jobId: string, preview: SaiposNemoPreviewData) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    const formData = new FormData();
    formData.append("compiledFile", file);
    const res  = await fetch("/api/crm/saipos-nemo/preview-compiled", { method: "POST", body: formData });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) { setError(json.error ?? "Falha ao processar arquivo"); return; }
    onPreview(json.jobId as string, json.preview as SaiposNemoPreviewData);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-800">Envie a planilha compilada</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Arquivo <strong>Foocci_Base_Compilada_Saipos_Nemo.xlsx</strong> com as abas Clientes_Master, Sem_Telefone e Produtos_Agregados.
        </p>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        disabled={loading}
        className={`w-full rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? "border-brand-400 bg-brand-50" : "border-gray-200 bg-gray-50 hover:border-brand-300 hover:bg-brand-50/50"
        } disabled:opacity-60`}
      >
        <div className="flex flex-col items-center gap-3">
          <span className="text-4xl">🏭</span>
          {loading
            ? <span className="text-sm text-gray-500">Processando planilha…</span>
            : <>
                <span className="text-sm font-semibold text-gray-700">Arraste o arquivo aqui ou clique para selecionar</span>
                <span className="text-xs text-gray-400">XLSX · planilha compilada Saipos + Nemo</span>
              </>
          }
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
        💡 A planilha deve conter as abas: <strong>Clientes_Master</strong>, <strong>Sem_Telefone</strong> e (opcional) <strong>Produtos_Agregados</strong>.
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}

// ── Saipos + Nemo: Preview ───────────────────────────────────────────────────

function SaiposNemoPreviewStep({
  preview, jobId, onConfirm, onBack, loading,
}: {
  preview:   SaiposNemoPreviewData;
  jobId:     string;
  onConfirm: (jId: string) => void;
  onBack:    () => void;
  loading:   boolean;
}) {
  const [confirmOpen,        setConfirmOpen]        = useState(false);
  const [v2Loading,          setV2Loading]          = useState(false);
  const [v2Error,            setV2Error]            = useState<string | null>(null);
  const [v2ImportavelLoading, setV2ImportavelLoading] = useState(false);
  const [v2ImportavelError,   setV2ImportavelError]   = useState<string | null>(null);

  async function handleDownloadV2Importavel() {
    setV2ImportavelError(null);
    setV2ImportavelLoading(true);
    try {
      const res = await fetch("/api/crm/saipos-nemo/generate-v2-importavel", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ jobId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setV2ImportavelError((json as { error?: string }).error ?? "Falha ao gerar dataset importável");
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = "Foocci_Master_Dataset_V2_IMPORTAVEL.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setV2ImportavelError("Erro de rede ao gerar dataset importável");
    } finally {
      setV2ImportavelLoading(false);
    }
  }

  async function handleDownloadV2() {
    setV2Error(null);
    setV2Loading(true);
    try {
      const res = await fetch("/api/crm/saipos-nemo/generate-v2", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ jobId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setV2Error((json as { error?: string }).error ?? "Falha ao gerar dataset");
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = "Foocci_Master_Dataset_V2.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setV2Error("Erro de rede ao gerar dataset");
    } finally {
      setV2Loading(false);
    }
  }

  const contactableCount    = preview.stats.readyCount + preview.stats.needsReviewCount;
  const nonContactableCount = preview.stats.noPhoneImportableCount;
  const skippedCount        = preview.stats.noPhoneSkippedCount;
  const needsReviewCount    = preview.stats.noPhoneNeedsReviewCount;

  const stats = [
    { label: "Clientes contatáveis",              value: contactableCount,     color: "text-green-700" },
    { label: "Clientes não contatáveis",           value: nonContactableCount,  color: "text-amber-600" },
    { label: "Sem dados suficientes (ignorados)",  value: skippedCount,         color: "text-gray-500"  },
    { label: "Requer revisão (sem telefone)",      value: needsReviewCount,     color: "text-orange-600" },
    { label: "Produtos agregados",                 value: preview.productCount, color: "text-blue-700"  },
  ];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-gray-800">Prévia da importação</p>
        <p className="text-xs text-gray-500 mt-0.5">Revise antes de executar. A importação não pode ser desfeita.</p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-gray-50 divide-y divide-gray-100">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-gray-600">{s.label}</span>
            <span className={`text-sm font-bold ${s.color}`}>{s.value}</span>
          </div>
        ))}
        {preview.periodStart && (
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-gray-600">Período dos produtos</span>
            <span className="text-sm font-semibold text-gray-700">{preview.periodStart} → {preview.periodEnd ?? "?"}</span>
          </div>
        )}
      </div>

      {nonContactableCount > 0 && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          ⚠️ {preview.noPhoneWarning}
        </div>
      )}

      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 space-y-1.5">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">Garantias de segurança</p>
        <p className="text-xs text-gray-600">• Clientes sem telefone entram como não contatáveis para enriquecimento.</p>
        <p className="text-xs text-gray-600">• Produtos agregados não criam pedidos nem itens de pedido.</p>
        <p className="text-xs text-gray-600">• Nenhuma campanha WhatsApp será enviada automaticamente.</p>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
        <p className="text-xs font-bold text-blue-700 mb-1">Dataset V2 refinado</p>
        <p className="text-xs text-blue-600 mb-2">
          Gere uma planilha limpa com clientes por tier de qualidade, endereços normalizados, produtos categorizados e lista de itens para revisão.
        </p>
        <button
          type="button"
          onClick={handleDownloadV2}
          disabled={v2Loading || loading}
          className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
        >
          {v2Loading ? "Gerando…" : "⬇ Gerar Dataset V2"}
        </button>
        {v2Error && <p className="mt-1.5 text-xs text-red-600">{v2Error}</p>}
      </div>

      <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
        <p className="text-xs font-bold text-indigo-700 mb-1">Dataset V2 Importável</p>
        <p className="text-xs text-indigo-600 mb-2">
          Gere uma planilha compatível com o parser (Clientes_Master, Sem_Telefone, Produtos_Agregados, Endereços) com categorias V2 normalizadas. Pode ser enviada ao preview-compiled para segunda revisão.
        </p>
        <button
          type="button"
          onClick={handleDownloadV2Importavel}
          disabled={v2ImportavelLoading || loading}
          className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
        >
          {v2ImportavelLoading ? "Gerando…" : "⬇ Gerar V2 Importável"}
        </button>
        {v2ImportavelError && <p className="mt-1.5 text-xs text-red-600">{v2ImportavelError}</p>}
      </div>

      <div className="flex gap-2">
        <button onClick={onBack} disabled={loading} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">Voltar</button>
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={loading || (contactableCount + nonContactableCount) === 0}
          className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? "Importando…" : "Executar importação"}
        </button>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { if (!loading) setConfirmOpen(false); }} />
          <div className="relative z-10 w-full max-w-sm mx-4 bg-white rounded-3xl shadow-2xl p-6 space-y-4">
            <p className="text-base font-bold text-gray-900">Confirmar importação</p>
            <p className="text-sm text-gray-600">
              Essa ação vai criar/atualizar clientes e importar agregados de produtos. Não cria pedidos nem itens de pedido.
            </p>
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 space-y-1">
              <p className="text-xs text-amber-700">• Clientes sem telefone entram como não contatáveis para enriquecimento.</p>
              <p className="text-xs text-amber-700">• Produtos agregados não criam pedidos.</p>
              <p className="text-xs text-amber-700">• Nenhuma campanha WhatsApp será enviada.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmOpen(false)} disabled={loading} className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
              <button
                onClick={() => { setConfirmOpen(false); onConfirm(jobId); }}
                disabled={loading}
                className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Confirmar e executar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Saipos + Nemo: Done ──────────────────────────────────────────────────────

function SaiposNemoDoneStep({ result, onClose }: { result: SaiposNemoExecuteResult; onClose: () => void }) {
  const rows = [
    { label: "Clientes contatáveis criados",       value: result.contactableCustomersCreated,    color: "text-green-700" },
    { label: "Clientes contatáveis atualizados",   value: result.contactableCustomersUpdated,    color: "text-blue-700"  },
    { label: "Não contatáveis criados",             value: result.nonContactableCustomersCreated, color: "text-amber-600" },
    { label: "Não contatáveis atualizados",         value: result.nonContactableCustomersUpdated, color: "text-amber-600" },
    { label: "Endereços salvos",                    value: result.addressesCreated,               color: "text-gray-700"  },
    { label: "Produtos agregados importados",       value: result.productAggregatesCreated,       color: "text-blue-700"  },
    { label: "Produtos agregados ignorados (dup.)", value: result.productAggregatesSkipped,       color: "text-orange-600" },
    { label: "Sem dados suficientes (ignorados)",   value: result.noPhoneSkippedInsufficientData, color: "text-gray-500"  },
  ];

  return (
    <div className="flex flex-col items-center gap-5 py-2 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>
      <div>
        <p className="text-base font-bold text-gray-900">Importação Saipos + Nemo concluída!</p>
        <p className="mt-1 text-sm text-gray-500">Dados importados com sucesso.</p>
      </div>
      <div className="w-full rounded-2xl border border-gray-100 bg-gray-50 divide-y divide-gray-100">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between px-4 py-2.5 text-sm">
            <span className="text-gray-600">{r.label}</span>
            <span className={`font-bold ${r.color}`}>{r.value}</span>
          </div>
        ))}
      </div>
      <div className="w-full rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700 text-left">
        Clientes importados como não contatáveis precisam de enriquecimento de telefone antes de entrar em campanhas WhatsApp.
      </div>
      <button onClick={onClose} className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">Concluir</button>
    </div>
  );
}

// ── Recent imports list (footer of upload step) ──────────────────────────────

interface ImportJob {
  id:                string;
  type:              string;
  filename:          string;
  status:            string;
  createdOrders:     number;
  createdCustomers:  number;
  skippedDuplicates: number;
  unmatchedProducts: number;
  createdAt:         string;
  completedAt:       string | null;
}

function RecentJobs() {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/crm/import/jobs")
      .then((r) => r.json())
      .then((j) => setJobs(j.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (jobs.length === 0) return null;

  return (
    <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Importações recentes</p>
      <div className="space-y-1 max-h-28 overflow-y-auto">
        {jobs.slice(0, 5).map((job) => (
          <div key={job.id} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate text-gray-700">
              {job.filename || job.type} ·{" "}
              <span className="text-gray-500">{new Date(job.createdAt).toLocaleDateString("pt-BR")}</span>
            </span>
            <span className="shrink-0 font-semibold text-green-700">
              {job.createdOrders > 0
                ? `${job.createdOrders} pedidos`
                : `${job.createdCustomers} clientes`}
              {job.skippedDuplicates > 0 && <span className="ml-1 text-orange-600">({job.skippedDuplicates} dup.)</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

export function ImportModal({
  open, onClose, onComplete,
}: {
  open:        boolean;
  onClose:     () => void;
  onComplete:  () => void;
}) {
  const [step,         setStep]         = useState<Step>("type");
  const [importType,   setImportType]   = useState<ImportType>("customers");
  const [parsed,       setParsed]       = useState<ParsedFile | null>(null);
  const [customerMap,  setCustomerMap]  = useState<CustomerMapping | undefined>();
  const [orderMap,     setOrderMap]     = useState<OrderMapping | undefined>();
  const [preview,      setPreview]      = useState<Preview | null>(null);
  const [result,       setResult]       = useState<ImportResult | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [importing,    setImporting]    = useState(false);
  // Saipos + Nemo state
  const [snJobId,      setSnJobId]      = useState<string | null>(null);
  const [snPreview,    setSnPreview]    = useState<SaiposNemoPreviewData | null>(null);
  const [snResult,     setSnResult]     = useState<SaiposNemoExecuteResult | null>(null);

  function reset() {
    setStep("type");
    setImportType("customers");
    setParsed(null);
    setCustomerMap(undefined);
    setOrderMap(undefined);
    setPreview(null);
    setResult(null);
    setError(null);
    setImporting(false);
    setSnJobId(null);
    setSnPreview(null);
    setSnResult(null);
  }

  function handleClose() { reset(); onClose(); }

  async function handleMappingConfirm(cm: CustomerMapping | undefined, om: OrderMapping | undefined) {
    if (!parsed) return;
    setCustomerMap(cm);
    setOrderMap(om);
    setError(null);

    const res = await fetch("/api/crm/import/execute", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        rows:            parsed.rows,
        importType,
        filename:        parsed.fileName,
        customerMapping: cm,
        orderMapping:    om,
        dryRun:          true,
      }),
    });

    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Falha ao calcular prévia"); return; }
    setPreview(json.data as Preview);
    setStep("preview");
  }

  async function handleImportConfirm() {
    if (!parsed) return;
    setImporting(true);
    setError(null);

    const res = await fetch("/api/crm/import/execute", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        rows:            parsed.rows,
        importType,
        filename:        parsed.fileName,
        customerMapping: customerMap,
        orderMapping:    orderMap,
        dryRun:          false,
      }),
    });

    const json = await res.json();
    setImporting(false);

    if (!res.ok) { setError(json.error ?? "Falha na importação"); return; }
    setResult(json.data as ImportResult);
    setStep("done");
  }

  function handleSnPreview(jobId: string, preview: SaiposNemoPreviewData) {
    setSnJobId(jobId);
    setSnPreview(preview);
    setStep("preview");
  }

  async function handleSnExecute(jobId: string) {
    setImporting(true);
    setError(null);
    const res  = await fetch("/api/crm/saipos-nemo/execute", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ jobId }),
    });
    const json = await res.json() as { error?: string; hint?: string; stage?: string; result?: SaiposNemoExecuteResult };
    setImporting(false);
    if (!res.ok) {
      const detail = [json.error, json.hint].filter(Boolean).join(" — ");
      setError(detail || "Falha na importação");
      return;
    }
    setSnResult(json.result as SaiposNemoExecuteResult);
    setStep("done");
  }

  function handleDoneClose() { reset(); onClose(); onComplete(); }

  if (!open) return null;

  const titleByStep: Record<Step, string> = {
    type:      "Importar dados",
    upload:    "Enviar arquivo",
    map:       "Mapear colunas",
    preview:   "Prévia",
    importing: "Importando…",
    done:      "Concluído",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={step !== "importing" ? handleClose : undefined}
      />

      <div className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{titleByStep[step]}</p>
          {step !== "importing" && (
            <button onClick={handleClose} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Fechar">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="px-5 pb-6">
          <StepDots step={step} importType={importType} />

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">{error}</div>
          )}

          {step === "type" && (
            <TypeStep onSelect={(t) => { setImportType(t); setStep("upload"); }} />
          )}

          {/* Saipos + Nemo flow */}
          {importType === "saipos_nemo_compiled" && step === "upload" && (
            <SaiposNemoUploadStep onPreview={handleSnPreview} />
          )}

          {importType === "saipos_nemo_compiled" && (step === "preview" || step === "importing") && snPreview && snJobId && (
            <SaiposNemoPreviewStep
              preview={snPreview}
              jobId={snJobId}
              onConfirm={handleSnExecute}
              onBack={() => setStep("upload")}
              loading={importing}
            />
          )}

          {importType === "saipos_nemo_compiled" && step === "done" && snResult && (
            <SaiposNemoDoneStep result={snResult} onClose={handleDoneClose} />
          )}

          {/* Generic import flow */}
          {importType !== "saipos_nemo_compiled" && step === "upload" && (
            <>
              <UploadStep importType={importType} onParsed={(p) => { setParsed(p); setStep("map"); }} />
              <RecentJobs />
            </>
          )}

          {importType !== "saipos_nemo_compiled" && step === "map" && parsed && (
            <MapStep parsed={parsed} importType={importType} onConfirm={handleMappingConfirm} onBack={() => setStep("upload")} />
          )}

          {importType !== "saipos_nemo_compiled" && (step === "preview" || step === "importing") && preview && (
            <PreviewStep preview={preview} onConfirm={handleImportConfirm} onBack={() => setStep("map")} loading={importing} duplicateHeaders={parsed?.duplicateHeaders ?? []} />
          )}

          {importType !== "saipos_nemo_compiled" && step === "done" && result && (
            <DoneStep result={result} onClose={handleDoneClose} />
          )}
        </div>
      </div>
    </div>
  );
}
