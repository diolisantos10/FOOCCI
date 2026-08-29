"use client";

/**
 * O FINANCEIRO — quanto a empresa gastou ontem, e quanto está gastando hoje.
 *
 * Pedido do CEO em 29/08/2026: *"toda hora estamos gastando com inteligência
 * artificial, crédito, tudo precisa ser medido (…) a gente precisa contabilizar
 * absolutamente tudo que é gasto."*
 *
 * ── ⚠️ A REGRA QUE MANDA NESTA TELA: AUSÊNCIA NÃO É ZERO ────────────────────
 *
 * Nenhum cartão aqui escreve um valor por conta própria. Cada balde chega do
 * servidor com um `estado` e uma `frase`, e é a frase que aparece quando não há
 * número a mostrar:
 *
 *   · IA `NO_USAGE`  → "sem uso de IA neste dia";
 *   · IA `UNPRICED`  → "houve gasto e não sabemos quanto" — o modelo usado não
 *                       está na tabela de preços;
 *   · IA `PARTIAL`   → o número medido MAIS o aviso de que o real é maior;
 *   · manual `SEM_LANCAMENTO` → "ninguém lançou", que é diferente de "não
 *                       gastou": Railway cobra por mês e domínio por ano.
 *
 * Se esta tela montasse o texto a partir de `centavosUsd`, os três primeiros
 * casos virariam "US$ 0,00" — e a partir daí ela mentiria com cara de precisão,
 * que é o pior defeito possível numa tela de custo.
 *
 * ── ⚠️ POR QUE NÃO EXISTE CARTÃO VERDE AQUI ─────────────────────────────────
 *
 * Verde é a cor de "está tudo bem", e nesta tela ela seria lida como "gasto sob
 * controle" exatamente nos casos em que a fonte do número está ausente. A
 * paleta é neutra para o que foi medido, âmbar para o que é incerto e cinza para
 * o que não existe. Nada aqui comemora — a empresa está em prejuízo, e o CEO
 * disse isso com essas palavras.
 *
 * ── ⚠️ DÓLAR E REAL NÃO SE SOMAM ────────────────────────────────────────────
 *
 * A IA é cobrada em dólar; hospedagem e domínio, em real. Não há cotação neste
 * repositório, e inventar uma produziria um "total da empresa" que não bate com
 * fatura nenhuma. Os dois blocos ficam lado a lado, cada um na sua moeda, e não
 * existe um número que os junte.
 */

import { useEffect, useState } from "react";
import { centavosDoTexto } from "@/services/financeiro/valor";

const ROTA = "/api/admin/financeiro";

type EstadoDeIa = "PRICED" | "PARTIAL" | "UNPRICED" | "NO_USAGE";

/**
 * ⚠️ Repare no que esta interface NÃO declara.
 *
 * A resposta traz `microUsd`, `centavosUsd` e `abaixoDeUmCentavo` — a tela
 * simplesmente não os recebe. Não é economia de linhas: um campo declarado é um
 * campo que alguém usa, e `{(g.centavosUsd / 100).toFixed(2)}` num cartão é a
 * linha mais natural do mundo de se escrever. Ela funciona, fica bonita, e
 * escreve "US$ 0,00" nos dois estados em que não existe número a escrever.
 *
 * O valor chega pronto em `frase`, montada no servidor a partir do ESTADO. Não
 * declarar os centavos é o que impede o atalho de existir.
 */
interface GastoDeIa {
  chave: string;
  rotulo: string;
  chamadas: number;
  tokensTotais: number;
  modelosSemPreco: string[];
  estado: EstadoDeIa;
  frase: string;
}

interface ValorPorMoeda {
  moeda: "BRL" | "USD";
  centavos: number;
  lancamentos: number;
}

interface SomaManual {
  chave: string;
  rotulo: string;
  lancamentos: number;
  porMoeda: ValorPorMoeda[];
  estado: "SEM_LANCAMENTO" | "LANCADO";
  frase: string;
}

interface Lancamento {
  id: string;
  descricao: string;
  categoria: string;
  fornecedor: string | null;
  valorCent: number;
  moeda: "BRL" | "USD";
  competencia: string;
  pagoEm: string | null;
  recorrente: boolean;
  criadoPor: string;
}

interface Opcao {
  valor: string;
  rotulo: string;
}

interface Painel {
  hoje: string;
  ontem: string;
  hojeEscrito: string;
  ontemEscrito: string;
  janela: { de: string; ate: string; dias: number };
  ia: {
    hoje: GastoDeIa;
    ontem: GastoDeIa;
    periodo: GastoDeIa;
    dias: GastoDeIa[];
    porAgente: GastoDeIa[];
  };
  manual: {
    hoje: SomaManual;
    ontem: SomaManual;
    periodo: SomaManual;
    porCategoria: SomaManual[];
    lancamentos: Lancamento[];
  };
  formulario: {
    categorias: Opcao[];
    moedas: Opcao[];
    maximoDaCompetencia: string;
  };
}

type Estado =
  | { fase: "carregando" }
  | { fase: "pronto"; painel: Painel }
  | { fase: "semAcesso" }
  | { fase: "erro"; detalhe: string };

const FORMULARIO_VAZIO = {
  descricao: "",
  categoria: "",
  fornecedor: "",
  valor: "",
  moeda: "BRL",
  competencia: "",
  pagoEm: "",
  recorrente: false,
};

export function FinanceiroClient() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [form, setForm] = useState(FORMULARIO_VAZIO);
  const [enviando, setEnviando] = useState(false);
  const [erroDoLancamento, setErroDoLancamento] = useState<string | null>(null);
  const [ultimoLancado, setUltimoLancado] = useState<Lancamento | null>(null);

  async function carregar() {
    try {
      const res = await fetch(ROTA, { cache: "no-store" });

      if (res.status === 401 || res.status === 403) {
        setEstado({ fase: "semAcesso" });
        return;
      }

      const j = (await res.json()) as { ok: boolean; data?: Painel; error?: string };
      if (!j.ok || !j.data) {
        setEstado({ fase: "erro", detalhe: j.error ?? "resposta inesperada" });
        return;
      }

      setEstado({ fase: "pronto", painel: j.data });
      // A competência começa no dia de hoje — que é o lançamento de nove em cada
      // dez vezes — mas continua editável: fatura de mês passado é comum.
      setForm((f) => (f.competencia ? f : { ...f, competencia: j.data!.hoje }));
    } catch (e) {
      setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : "falha de rede" });
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lancar() {
    if (enviando) return;
    setEnviando(true);
    setErroDoLancamento(null);
    setUltimoLancado(null);

    // ⚠️ A leitura do valor é de TEXTO para inteiro, sem passar por float —
    // `centavosDoTexto`. `Number("49,90".replace(",", ".")) * 100` devolveria
    // 4989,999…, e meio centavo perdido por linha faz a conta parar de fechar
    // com a fatura por um motivo que ninguém encontra.
    const valorCent = centavosDoTexto(form.valor);

    try {
      const res = await fetch(ROTA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ⚠️ Nenhum campo de autor viaja daqui. Quem assina o lançamento é a
        // sessão, no servidor — mandar um nome no corpo seria forjar assinatura,
        // e a rota ignora de qualquer jeito.
        body: JSON.stringify({
          descricao: form.descricao,
          categoria: form.categoria,
          fornecedor: form.fornecedor,
          // `null` quando o texto não é um valor: a rota recusa com a frase
          // certa em vez de a tela adivinhar um número.
          valorCent,
          moeda: form.moeda,
          competencia: form.competencia,
          pagoEm: form.pagoEm || null,
          recorrente: form.recorrente,
        }),
      });

      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: { gasto: Lancamento };
        error?: string;
      };

      if (!res.ok || !j.ok || !j.data) {
        setErroDoLancamento(j.error ?? `Não foi possível lançar (HTTP ${res.status}).`);
        return;
      }

      setUltimoLancado(j.data.gasto);
      setForm((f) => ({ ...FORMULARIO_VAZIO, competencia: f.competencia, moeda: f.moeda }));
      // A conta é recarregada inteira: um lançamento novo muda o cartão do dia,
      // a quebra por categoria e o total do período de uma vez só.
      await carregar();
    } catch (e) {
      setErroDoLancamento(e instanceof Error ? e.message : "Falha de rede.");
    } finally {
      setEnviando(false);
    }
  }

  if (estado.fase === "carregando") {
    return <p className="p-6 text-sm text-gray-400">Carregando a conta…</p>;
  }

  if (estado.fase === "semAcesso") {
    return (
      <p className="max-w-xl p-6 text-sm leading-relaxed text-gray-400">
        Esta tela mostra o custo da empresa inteira e é do CEO e do Diretor. Se
        você deveria enxergá-la, é o papel da sua conta que precisa mudar — não
        esta tela.
      </p>
    );
  }

  if (estado.fase === "erro") {
    return (
      <p className="max-w-xl p-6 text-sm leading-relaxed text-gray-300">
        Não foi possível abrir o financeiro: {estado.detalhe}
      </p>
    );
  }

  const p = estado.painel;

  return (
    <div className="min-h-full bg-gray-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">Financeiro</h1>
          <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-gray-400">
            Quanto a empresa gastou, dia a dia. A IA é medida chamada a chamada,
            direto do registro de uso; o resto — hospedagem, WhatsApp, domínio,
            ferramentas — entra pelo lançamento manual, porque não existe API que
            entregue isso.
          </p>
          <p className="mt-2 max-w-[70ch] rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-[12px] leading-relaxed text-gray-400">
            Dólar e real aparecem <strong className="text-gray-300">separados</strong>, e não
            somados: a IA é cobrada em dólar e a hospedagem em real. Não há cotação
            neste sistema, e um total convertido por uma taxa inventada não bateria
            com fatura nenhuma.
          </p>
        </header>

        {/* ── 1. OS TRÊS RECORTES QUE O CEO PEDIU ───────────────────────── */}
        <Secao titulo="Inteligência artificial" legenda="Medida a partir de cada chamada registrada — tokens reais, tabela de preços auditável.">
          <div className="grid gap-3 sm:grid-cols-3">
            <CartaoDeIa titulo="Hoje" sub={p.hojeEscrito} g={p.ia.hoje} />
            <CartaoDeIa titulo="Ontem" sub={p.ontemEscrito} g={p.ia.ontem} />
            <CartaoDeIa
              titulo={`Últimos ${p.janela.dias} dias`}
              sub={`${p.janela.de} a ${p.janela.ate}`}
              g={p.ia.periodo}
            />
          </div>
        </Secao>

        <Secao
          titulo="Gasto lançado à mão"
          legenda="Hospedagem, mensageria, domínio, ferramentas e impostos — o que chega por fatura."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <CartaoManual titulo="Hoje" sub={p.hojeEscrito} s={p.manual.hoje} />
            <CartaoManual titulo="Ontem" sub={p.ontemEscrito} s={p.manual.ontem} />
            <CartaoManual
              titulo={`Últimos ${p.janela.dias} dias`}
              sub={`${p.janela.de} a ${p.janela.ate}`}
              s={p.manual.periodo}
            />
          </div>
        </Secao>

        {/* ── 2. AS QUEBRAS DA CONTA ────────────────────────────────────── */}
        <Secao
          titulo="Por agente de IA"
          legenda={`Quem consumiu, nos últimos ${p.janela.dias} dias. Chamada sem agente identificado tem balde próprio — nunca é somada a um agente real.`}
        >
          {p.ia.porAgente.length === 0 ? (
            <Vazio texto="Nenhuma chamada de IA registrada neste período. Isso é ausência de uso, não gasto zero." />
          ) : (
            <ul className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900">
              {p.ia.porAgente.map((a) => (
                <li key={a.chave} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                  <span className="min-w-[10rem] flex-1 text-[13px] font-semibold text-gray-200">
                    {a.rotulo}
                  </span>
                  <span className="text-[11.5px] tabular-nums text-gray-500">
                    {a.chamadas.toLocaleString("pt-BR")} chamadas ·{" "}
                    {a.tokensTotais.toLocaleString("pt-BR")} tokens
                  </span>
                  <span className={`text-[13px] font-semibold tabular-nums ${tomDoTexto(a.estado)}`}>
                    {a.frase}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao
          titulo="Por categoria"
          legenda={`O que foi lançado à mão nos últimos ${p.janela.dias} dias, por tipo de gasto.`}
        >
          {p.manual.porCategoria.length === 0 ? (
            <Vazio texto="Nenhum lançamento manual neste período — o que NÃO quer dizer gasto zero. Hospedagem é cobrada por mês e domínio por ano: se não há linha aqui, é porque ninguém lançou." />
          ) : (
            <ul className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900">
              {p.manual.porCategoria.map((c) => (
                <li key={c.chave} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                  <span className="min-w-[12rem] flex-1 text-[13px] font-semibold text-gray-200">
                    {c.rotulo}
                  </span>
                  <span className="text-[11.5px] tabular-nums text-gray-500">
                    {c.lancamentos} {c.lancamentos === 1 ? "lançamento" : "lançamentos"}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums text-gray-100">
                    {c.frase}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        {/* ── 3. O DIA A DIA ────────────────────────────────────────────── */}
        <Secao
          titulo="Dia a dia"
          legenda="Todos os dias do período aparecem, inclusive os sem uso — um dia que sumisse da lista seria lido como um dia sem gasto."
        >
          <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900">
            <table className="w-full min-w-[38rem] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-gray-800 text-[10.5px] uppercase tracking-widest text-gray-500">
                  <th className="px-4 py-2 font-semibold">Dia</th>
                  <th className="px-4 py-2 font-semibold">Chamadas de IA</th>
                  <th className="px-4 py-2 font-semibold">Tokens</th>
                  <th className="px-4 py-2 font-semibold">Gasto de IA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {[...p.ia.dias].reverse().map((d) => (
                  <tr key={d.chave}>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-[12px] text-gray-400">
                      {d.chave}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-gray-400">
                      {d.chamadas.toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-gray-400">
                      {d.tokensTotais.toLocaleString("pt-BR")}
                    </td>
                    {/* A frase, e não o número: dia sem uso e dia não precificado
                        não têm número a mostrar. */}
                    <td className={`px-4 py-2 ${tomDoTexto(d.estado)}`}>{d.frase}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>

        {/* ── 4. O LANÇAMENTO ───────────────────────────────────────────── */}
        <Secao
          titulo="Lançar um gasto"
          legenda="Hospedagem, Meta/WhatsApp, domínio, ferramenta, imposto — o que nenhuma API entrega."
        >
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                rotulo="O que foi pago"
                value={form.descricao}
                onChange={(v) => setForm((f) => ({ ...f, descricao: v }))}
                dica="Ex.: fatura Railway de agosto."
              />
              <Seletor
                rotulo="Categoria"
                value={form.categoria}
                onChange={(v) => setForm((f) => ({ ...f, categoria: v }))}
                vazio="Escolha a categoria…"
                opcoes={p.formulario.categorias}
              />
              <Campo
                rotulo="Fornecedor (opcional)"
                value={form.fornecedor}
                onChange={(v) => setForm((f) => ({ ...f, fornecedor: v }))}
                dica="Railway, Meta, Registro.br…"
              />
              <div className="grid grid-cols-[1fr_8rem] gap-2">
                <Campo
                  rotulo="Valor"
                  value={form.valor}
                  onChange={(v) => setForm((f) => ({ ...f, valor: v }))}
                  dica="Como está na fatura — ex.: 49,90."
                />
                <Seletor
                  rotulo="Moeda"
                  value={form.moeda}
                  onChange={(v) => setForm((f) => ({ ...f, moeda: v }))}
                  opcoes={p.formulario.moedas}
                />
              </div>
              <CampoDeData
                rotulo="Competência"
                value={form.competencia}
                max={p.formulario.maximoDaCompetencia}
                onChange={(v) => setForm((f) => ({ ...f, competencia: v }))}
                dica="O dia a que o gasto pertence. A fatura de agosto é gasto de agosto, mesmo pagando em setembro."
              />
              <CampoDeData
                rotulo="Pago em (opcional)"
                value={form.pagoEm}
                max={p.formulario.maximoDaCompetencia}
                onChange={(v) => setForm((f) => ({ ...f, pagoEm: v }))}
                dica="Deixe em branco enquanto não pagou."
              />
            </div>

            <label className="mt-3 flex items-center gap-2 text-[12.5px] text-gray-300">
              <input
                type="checkbox"
                checked={form.recorrente}
                onChange={(e) => setForm((f) => ({ ...f, recorrente: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-700 bg-gray-800"
              />
              Repete todo mês
            </label>
            <p className="mt-1 text-[11.5px] leading-relaxed text-gray-500">
              É só um rótulo: marcar isto não cria lançamento sozinho no mês que
              vem. Serve para separar o que vai voltar do que foi uma vez só.
            </p>

            <button
              onClick={lancar}
              // O botão trava sem os campos essenciais, mas quem RECUSA é a rota.
              // `disabled` é conveniência de tela: a trava não pode morar num
              // atributo que qualquer um remove pelo navegador.
              disabled={
                enviando ||
                form.descricao.trim() === "" ||
                form.categoria === "" ||
                form.valor.trim() === "" ||
                form.competencia === ""
              }
              className="mt-4 w-full rounded-lg bg-violet-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
            >
              {enviando ? "Lançando…" : "Lançar gasto"}
            </button>

            {erroDoLancamento && (
              <p
                role="status"
                className="mt-3 rounded-lg border border-amber-800/60 bg-amber-950/50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-200"
              >
                {erroDoLancamento}
              </p>
            )}

            {ultimoLancado && (
              <p
                role="status"
                className="mt-3 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-[12.5px] leading-relaxed text-gray-200"
              >
                Lançado: {ultimoLancado.descricao} —{" "}
                <span className="font-semibold tabular-nums">
                  {escrever(ultimoLancado.valorCent, ultimoLancado.moeda)}
                </span>{" "}
                em {ultimoLancado.competencia}. Assinado por {ultimoLancado.criadoPor}.
              </p>
            )}
          </div>
        </Secao>

        {/* ── 5. O QUE JÁ FOI LANÇADO ───────────────────────────────────── */}
        <Secao titulo="Lançamentos do período" legenda="Do mais recente ao mais antigo, com quem lançou.">
          {p.manual.lancamentos.length === 0 ? (
            <Vazio texto="Nada lançado neste período. Enquanto hospedagem, WhatsApp e domínio não estiverem aqui, a conta desta tela está incompleta por baixo — e isso é dito de propósito." />
          ) : (
            <ul className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900">
              {p.manual.lancamentos.map((l) => (
                <li key={l.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="flex-1 text-[13px] font-semibold text-gray-200">
                      {l.descricao}
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums text-gray-100">
                      {escrever(l.valorCent, l.moeda)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-gray-500">
                    {rotuloDaCategoria(p.formulario.categorias, l.categoria)}
                    {l.fornecedor ? ` · ${l.fornecedor}` : ""} · competência {l.competencia} ·{" "}
                    {l.pagoEm ? `pago em ${l.pagoEm}` : "ainda não pago"}
                    {l.recorrente ? " · recorrente" : ""} · lançado por {l.criadoPor}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// OS CARTÕES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * O tom de cada estado.
 *
 * ⚠️ Nenhum deles é verde. Verde é a cor de "está tudo bem", e nesta tela ela
 * apareceria justamente onde a fonte do número está ausente — um dia sem dado
 * pintado de verde é a tela dizendo "sem gastos" sobre algo que ela não sabe.
 */
function tomDoTexto(estado: EstadoDeIa): string {
  switch (estado) {
    case "PRICED":
      return "text-gray-100";
    case "PARTIAL":
    case "UNPRICED":
      return "text-amber-300";
    case "NO_USAGE":
      return "text-gray-500";
  }
}

function tomDaBorda(estado: EstadoDeIa): string {
  switch (estado) {
    case "PRICED":
      return "border-gray-800 bg-gray-900";
    case "PARTIAL":
    case "UNPRICED":
      return "border-amber-800/60 bg-amber-950/30";
    case "NO_USAGE":
      return "border-gray-800 bg-gray-900/40";
  }
}

function CartaoDeIa({ titulo, sub, g }: { titulo: string; sub: string; g: GastoDeIa }) {
  return (
    <div className={`rounded-xl border p-4 ${tomDaBorda(g.estado)}`}>
      <p className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-500">
        {titulo}
      </p>
      <p className="text-[11px] text-gray-600">{sub}</p>

      {/* ⚠️ A frase vem do servidor e é a ÚNICA coisa mostrada como valor. Um
          `{g.centavosUsd / 100}` aqui escreveria "US$ 0,00" para NO_USAGE e para
          UNPRICED — os dois casos em que não existe número a escrever. */}
      <p className={`mt-2 text-[15px] font-semibold leading-snug ${tomDoTexto(g.estado)}`}>
        {g.frase}
      </p>

      <p className="mt-2 text-[11.5px] tabular-nums text-gray-500">
        {g.chamadas.toLocaleString("pt-BR")} chamadas ·{" "}
        {g.tokensTotais.toLocaleString("pt-BR")} tokens
      </p>

      {g.modelosSemPreco.length > 0 && (
        <p className="mt-2 border-t border-amber-800/40 pt-2 text-[11.5px] leading-relaxed text-amber-300/90">
          Sem preço na tabela: {g.modelosSemPreco.join(", ")}. Para medir estas
          chamadas, o modelo precisa entrar em <code>modelPricing</code> com a
          fonte e a data do preço.
        </p>
      )}
    </div>
  );
}

function CartaoManual({ titulo, sub, s }: { titulo: string; sub: string; s: SomaManual }) {
  const semLancamento = s.estado === "SEM_LANCAMENTO";
  return (
    <div
      className={`rounded-xl border p-4 ${
        semLancamento ? "border-gray-800 bg-gray-900/40" : "border-gray-800 bg-gray-900"
      }`}
    >
      <p className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-500">
        {titulo}
      </p>
      <p className="text-[11px] text-gray-600">{sub}</p>

      {/* Mesma regra do cartão de IA: a frase manda. "Nenhum lançamento" nunca
          vira "R$ 0,00" — Railway cobra por mês, domínio por ano. */}
      <p
        className={`mt-2 text-[15px] font-semibold leading-snug ${
          semLancamento ? "text-gray-500" : "text-gray-100"
        }`}
      >
        {semLancamento ? "Nenhum lançamento" : s.porMoeda.map((v) => escrever(v.centavos, v.moeda)).join(" + ")}
      </p>

      <p className="mt-2 text-[11.5px] leading-relaxed text-gray-500">
        {semLancamento
          ? "Ninguém lançou nada neste período — o que é diferente de não ter havido gasto."
          : `${s.lancamentos} ${s.lancamentos === 1 ? "lançamento" : "lançamentos"}`}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Peças
// ═══════════════════════════════════════════════════════════════════════════

function escrever(centavos: number, moeda: "BRL" | "USD"): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: moeda });
}

function rotuloDaCategoria(categorias: Opcao[], valor: string): string {
  return categorias.find((c) => c.valor === valor)?.rotulo ?? valor;
}

function Secao({
  titulo,
  legenda,
  children,
}: {
  titulo: string;
  legenda: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="text-[13px] font-bold tracking-tight text-white">{titulo}</h2>
      <p className="mb-2.5 max-w-[72ch] text-[11.5px] leading-relaxed text-gray-500">{legenda}</p>
      {children}
    </section>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <p className="rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3 text-[12.5px] leading-relaxed text-gray-500">
      {texto}
    </p>
  );
}

const CLASSE_DO_CAMPO =
  "mt-0.5 w-full rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-2 text-[13px] text-gray-100 outline-none transition-colors focus:border-violet-500";

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10.5px] font-semibold uppercase tracking-widest text-gray-500">
      {children}
    </span>
  );
}

function Campo({
  rotulo,
  value,
  onChange,
  dica,
}: {
  rotulo: string;
  value: string;
  onChange: (v: string) => void;
  dica?: string;
}) {
  return (
    <label className="block">
      <Rotulo>{rotulo}</Rotulo>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={CLASSE_DO_CAMPO}
      />
      {dica && <span className="mt-1 block text-[11px] leading-relaxed text-gray-500">{dica}</span>}
    </label>
  );
}

function CampoDeData({
  rotulo,
  value,
  max,
  onChange,
  dica,
}: {
  rotulo: string;
  value: string;
  max: string;
  onChange: (v: string) => void;
  dica?: string;
}) {
  return (
    <label className="block">
      <Rotulo>{rotulo}</Rotulo>
      <input
        type="date"
        value={value}
        // `max` é conveniência do navegador, e nada mais: quem recusa data no
        // futuro é a rota. Um atributo de HTML se remove pelo inspetor em dois
        // cliques, e gasto do futuro entraria na conta de "quanto gastamos".
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className={CLASSE_DO_CAMPO}
      />
      {dica && <span className="mt-1 block text-[11px] leading-relaxed text-gray-500">{dica}</span>}
    </label>
  );
}

function Seletor({
  rotulo,
  value,
  onChange,
  opcoes,
  vazio,
}: {
  rotulo: string;
  value: string;
  onChange: (v: string) => void;
  opcoes: Opcao[];
  vazio?: string;
}) {
  return (
    <label className="block">
      <Rotulo>{rotulo}</Rotulo>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={CLASSE_DO_CAMPO}
      >
        {vazio && <option value="">{vazio}</option>}
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </label>
  );
}
