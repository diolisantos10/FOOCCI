"use client";

/**
 * Formulário de pedido de demonstração. Client component.
 *
 * DOIS DESTINOS, NESTA ORDEM — e a ordem é o produto inteiro:
 *
 *   1. **Salvar o lead.** `POST /api/site/leads` grava antes de qualquer aviso e
 *      antes de qualquer redirecionamento. Se a pessoa desistir de mandar o "oi",
 *      o contato continua nosso. Isto nunca sai da frente.
 *   2. **Levar ao WhatsApp** com a mensagem já escrita, para ela só apertar
 *      enviar — e, com isso, ser ELA quem inicia a conversa. É o que abre a janela
 *      de 24h de texto livre, deixa o consentimento evidente e tira o risco de
 *      banimento de quem aborda estranho (`docs/sdr-foocci-desenho.md`).
 *
 * A trava de ordem não é uma linha de código aqui: a mensagem carrega o `#código`
 * que **só existe na resposta do servidor**. Sem gravação não há código, sem
 * código não há tela de WhatsApp. O cliente não consegue pular a etapa.
 *
 * SEM NÚMERO DE VENDAS configurado (`WHATSAPP_SALES_NUMBER === null`, que é o caso
 * hoje) nada disso aparece: o comportamento é exatamente o de antes — "recebemos,
 * entramos em contato". O caminho novo acende sozinho quando o número existir.
 *
 * POR QUE NÃO REDIRECIONAMOS SOZINHOS: abrir o WhatsApp depois de um `fetch`
 * exige `window.open` fora do gesto do usuário (bloqueado por padrão em celular)
 * ou uma navegação que leva a pessoa embora da página — e junto vai o plano B,
 * que é justamente para quando o WhatsApp não abre. Um botão grande e explícito
 * funciona em 100% dos navegadores e ainda mostra a mensagem antes de mandar,
 * que é o mínimo devido a quem vai assinar aquele texto.
 *
 * Estados (DESIGN.md §6.1): idle · enviando (botão travado, dois toques não viram
 * dois leads) · enviado (painel de WhatsApp OU painel de confirmação) · erro em
 * linha que PRESERVA tudo que foi digitado.
 */

import { useState } from "react";
import { leOrigemGuardada } from "./leadOriginStorage";
import { WhatsAppIcon, CheckIcon } from "./icons";
import { buildLeadWhatsAppMessage, formatSalesNumber, whatsappUrl } from "./config";

const TIPOS = [
  "Pizzaria",
  "Hamburgueria",
  "Japonês",
  "Comida brasileira",
  "Cafeteria / Padaria",
  "Açaí / Sorveteria",
  "Outro",
];

const DESAFIOS = [
  "Poucos pedidos diretos",
  "Clientes que não voltam",
  "Atendimento no WhatsApp",
  "Falta de CRM / organização",
  "Recuperar clientes",
  "Outro",
];

export function DemoForm({ includeChallenge = false }: { includeChallenge?: boolean }) {
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [restaurante, setRestaurante] = useState("");
  const [cidade, setCidade] = useState("");
  const [tipo, setTipo] = useState("");
  const [desafio, setDesafio] = useState("");

  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  /** Código devolvido pelo servidor. Só existe se o lead foi gravado. */
  const [codigo, setCodigo] = useState<string | null>(null);

  // Calculado no render: o número é constante de build, não estado.
  const numeroLegivel = formatSalesNumber();
  const temWhatsApp = numeroLegivel !== null;

  const canSubmit = status !== "sending" && nome.trim() !== "" && whatsapp.trim() !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setStatus("sending");
    setError(null);

    // A origem NÃO é a página em que o visitante está agora — é a que ele abriu
    // primeiro nesta visita, com os parâmetros da campanha. Ver LeadOriginTracker.
    const origemDaVisita = leOrigemGuardada();

    try {
      const res = await fetch("/api/site/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          whatsapp,
          restaurante,
          cidade,
          tipo,
          desafio: includeChallenge ? desafio : "",
          // `origem` (legado) segue sendo a página do formulário: é a resposta a
          // "de qual página ele enviou", que continua útil e nunca foi atribuição.
          origem: typeof window !== "undefined" ? window.location.pathname : "",
          utmSource:   origemDaVisita.utmSource   ?? "",
          utmMedium:   origemDaVisita.utmMedium   ?? "",
          utmCampaign: origemDaVisita.utmCampaign ?? "",
          utmContent:  origemDaVisita.utmContent  ?? "",
          utmTerm:     origemDaVisita.utmTerm     ?? "",
          clickId:     origemDaVisita.clickId     ?? "",
          landingPath: origemDaVisita.landingPath ?? "",
          referrer:    origemDaVisita.referrer    ?? "",
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | { error?: string; codigo?: string | null }
        | null;

      if (!res.ok) {
        // Nada é limpo — a pessoa mantém tudo que digitou.
        setError(data?.error ?? "Não conseguimos enviar agora. Tente de novo em instantes.");
        setStatus("idle");
        return;
      }

      setCodigo(data?.codigo ?? null);
      setStatus("sent");
    } catch {
      setError("Sem conexão. Verifique a internet e tente de novo.");
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <div data-demo-form>
        {temWhatsApp ? (
          <WhatsAppHandoff
            nome={nome}
            restaurante={restaurante}
            codigo={codigo}
            numeroLegivel={numeroLegivel!}
          />
        ) : (
          /* Sem número de vendas: exatamente a tela de antes. Nada regride. */
          <div role="status" className="rounded-2xl border border-brand-200 bg-brand-50 p-7 text-center">
            <p className="text-lg font-semibold text-ink">Recebemos seu pedido! 🎉</p>
            <p className="mt-2 text-base leading-relaxed text-ink2">
              Vamos entrar em contato pelo WhatsApp <strong>{whatsapp}</strong> para combinar a
              demonstração.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    /*
      `data-demo-form` é a marca que a barra fixa do celular procura para sair da
      frente: duas ações primárias laranja empilhadas na mesma dobra — a do
      formulário e a da barra — competem, e a barra leva a pessoa embora de onde
      ela já estava convertendo. Ver `StickyMobileCta`.
    */
    <form onSubmit={handleSubmit} data-demo-form className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="nome" label="Nome" value={nome} onChange={setNome} placeholder="Seu nome" required />
        <Field id="whatsapp" label="WhatsApp" value={whatsapp} onChange={setWhatsapp} placeholder="(00) 00000-0000" required />
        <Field id="restaurante" label="Nome do restaurante" value={restaurante} onChange={setRestaurante} placeholder="Seu restaurante" />
        <Field id="cidade" label="Cidade" value={cidade} onChange={setCidade} placeholder="Sua cidade" />
      </div>

      <div className={includeChallenge ? "grid gap-4 sm:grid-cols-2" : ""}>
        <Select id="tipo" label="Tipo de restaurante" value={tipo} onChange={setTipo} options={TIPOS} />
        {includeChallenge && (
          <Select id="desafio" label="Principal desafio" value={desafio} onChange={setDesafio} options={DESAFIOS} />
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "sending"
            ? "Enviando…"
            : temWhatsApp
              ? "Enviar e falar no WhatsApp"
              : "Solicitar demonstração"}
        </button>
        {/*
          Dizer ANTES o que vai acontecer. Ninguém gosta de ser jogado num
          aplicativo sem aviso — e quem sabe o que vem clica com mais vontade.
        */}
        <p className="mt-2 text-center text-sm text-muted">
          {temWhatsApp
            ? "Salvamos seus dados e te levamos pro WhatsApp com a mensagem pronta."
            : "Sem compromisso. Retornamos pelo WhatsApp."}
        </p>
      </div>
    </form>
  );
}

/* ── Passo 2: o lead JÁ está salvo; agora é só o "oi" ──────────────────────── */

function WhatsAppHandoff({
  nome,
  restaurante,
  codigo,
  numeroLegivel,
}: {
  nome: string;
  restaurante: string;
  codigo: string | null;
  numeroLegivel: string;
}) {
  const mensagem = buildLeadWhatsAppMessage({ nome, restaurante, codigo });
  const href = whatsappUrl(mensagem);

  return (
    /*
      `bg-canvas` e não `bg-paper`: este painel mora DENTRO de um cartão branco, e
      branco sobre branco com duas bordas vira caixa dentro de caixa sem hierarquia
      nenhuma. Com o off-white, ele lê como "o próximo passo", igual ao painel de
      confirmação (que usa `brand-50` pelo mesmo motivo).
    */
    <div role="status" className="rounded-2xl border border-line bg-canvas p-5 sm:p-6">
      {/* Confirmação discreta: importante, mas já resolvido — não é o próximo passo. */}
      <p className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
        <CheckIcon className="h-3.5 w-3.5" />
        Seus dados estão salvos
      </p>

      <h3 className="mt-4 text-xl font-semibold leading-snug text-ink sm:text-2xl">
        Só falta mandar o oi.
      </h3>
      <p className="mt-2 text-base leading-relaxed text-ink2">
        A gente abre o WhatsApp com a mensagem já escrita — você só aperta enviar.
        A conversa continua por lá.
      </p>

      {/* A mensagem, à vista. Quem vai assinar o texto tem o direito de lê-lo antes. */}
      <figure className="mt-5">
        <figcaption className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
          Você vai enviar
        </figcaption>
        <blockquote className="mt-2 rounded-xl rounded-bl-sm border border-line bg-paper px-4 py-3 text-[15px] leading-relaxed text-ink">
          {mensagem}
        </blockquote>
      </figure>

      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          autoFocus
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          <WhatsAppIcon className="h-5 w-5" />
          Abrir o WhatsApp
        </a>
      )}

      {/* PLANO B, visível de saída — não escondido atrás de "teve algum problema?".
          No celular o link abre o aplicativo; no computador, o WhatsApp Web. Nos dois
          casos pode não abrir, e aí a pessoa precisa do número na mão. */}
      <div className="mt-5 border-t border-line pt-5">
        <p className="text-sm text-ink2">
          Não abriu? Chame no <strong className="whitespace-nowrap text-ink">{numeroLegivel}</strong>
          {codigo && (
            <>
              {" "}e cite o código{" "}
              <strong className="whitespace-nowrap text-ink">#{codigo}</strong>
            </>
          )}
          .
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton value={numeroLegivel} label="Copiar número" />
          <CopyButton value={mensagem} label="Copiar mensagem" />
        </div>
      </div>

      {!codigo && (
        /* Ausência de código não é ausência de lead — e a pessoa merece saber
           que continua tudo certo do lado dela. */
        <p className="mt-4 text-xs leading-relaxed text-muted">
          Seus dados estão salvos do mesmo jeito. Se a gente demorar a ligar o seu
          nome à conversa, é só repetir o nome do restaurante no WhatsApp.
        </p>
      )}
    </div>
  );
}

/** Botão de copiar com confirmação — e com saída honesta quando o navegador nega. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("ok");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("fail");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-full border border-line2 bg-paper px-3.5 py-2 text-[13.5px] font-semibold text-ink transition-colors hover:bg-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
    >
      {state === "ok" && <CheckIcon className="h-4 w-4 text-green-600" />}
      {state === "ok" ? "Copiado" : state === "fail" ? "Selecione acima" : label}
    </button>
  );
}

/* ── Primitivos do formulário ──────────────────────────────────────────────── */

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink2">
        {label}
        {required && <span className="text-brand-500"> *</span>}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-line2 bg-paper px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
    </div>
  );
}

function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink2">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-line2 bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      >
        <option value="">Selecione…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
