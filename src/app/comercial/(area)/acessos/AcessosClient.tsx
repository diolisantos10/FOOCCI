"use client";

/**
 * CRIAR ACESSO — a pessoa entra na Sala sem ninguém abrir um terminal.
 *
 * ── POR QUE ESTA TELA EXISTE ────────────────────────────────────────────────
 *
 * Sem uma pessoa cadastrada a Sala responde "sem acesso" para todo mundo,
 * inclusive para o dono. E o único caminho era um comando de terminal rodado
 * dentro do ambiente de produção.
 *
 * A regra da casa é direta: *"CEO não faz setup nenhum"*, e antes de pedir um
 * passo humano o Diretor esgota os caminhos. Este é o caminho.
 *
 * ── A SENHA APARECE UMA VEZ ─────────────────────────────────────────────────
 *
 * Ela é sorteada no servidor, mostrada aqui e não fica guardada em lugar
 * nenhum. Por isso o cartão dela é grande, tem botão de copiar e não some
 * sozinho: senha que o navegador engole é uma pessoa trancada do lado de fora.
 */

import { useState } from "react";

const PAPEIS = [
  { valor: "AGENTE_HUMANO", rotulo: "Vendedor (SDR)", nota: "entra direto na Sala e não vê o resto do sistema" },
  { valor: "GERENTE_DEPARTAMENTO", rotulo: "Gerente comercial", nota: "vê a operação inteira e o painel" },
  { valor: "DIRETOR_FOOCCI", rotulo: "Diretor", nota: "vê tudo, inclusive os outros departamentos" },
  { valor: "MASTER_CEO", rotulo: "CEO", nota: "acesso total" },
  { valor: "AUDITOR_QA", rotulo: "Auditoria", nota: "lê e avalia; não escreve nada" },
];

interface Criado {
  nome: string;
  email: string;
  papel: string;
  senha: string;
  trocouSenha: boolean;
}

export function AcessosClient() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState("AGENTE_HUMANO");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criado, setCriado] = useState<Criado | null>(null);
  const [copiou, setCopiou] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;

    setSalvando(true);
    setErro(null);
    setCriado(null);

    try {
      const res = await fetch("/api/admin/sala-de-vendas/primeiro-acesso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, email, papel, departamentos: ["vendas"] }),
      });
      const j = (await res.json()) as { ok: boolean; data?: Criado; error?: string };

      if (!j.ok || !j.data) {
        setErro(j.error ?? "Não foi possível criar o acesso.");
        return;
      }
      setCriado(j.data);
      setNome("");
      setEmail("");
    } catch {
      setErro("Sem resposta do servidor.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-[-.02em] text-ink">Criar acesso</h1>
          <p className="mt-1 max-w-[62ch] text-[13.5px] leading-relaxed text-muted">
            Sem ninguém cadastrado, a Sala responde <strong className="text-ink2">“sem
            acesso” para todo mundo</strong> — inclusive para você. Crie aqui o
            primeiro, e depois os vendedores.
          </p>
        </header>

        {criado && (
          <div className="mb-5 rounded-xl border-2 border-emerald-400 bg-emerald-50 p-4">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-emerald-800">
              {criado.trocouSenha ? "Senha trocada" : "Acesso criado"}
            </p>
            <p className="mt-1 text-[14px] text-emerald-900">
              <strong>{criado.nome}</strong> · {criado.email}
            </p>

            <p className="mt-3 text-[12.5px] font-semibold uppercase tracking-wide text-emerald-800">
              A senha, e ela aparece uma vez só
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="select-all rounded-lg bg-white px-3 py-2 text-[17px] font-semibold tracking-wide text-ink">
                {criado.senha}
              </code>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(criado.senha).then(() => setCopiou(true));
                }}
                className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-[13px] font-semibold text-emerald-800"
              >
                {copiou ? "Copiado" : "Copiar"}
              </button>
            </div>
            <p className="mt-2 max-w-[60ch] text-[12.5px] leading-relaxed text-emerald-900/85">
              Ela não fica guardada em lugar nenhum. Se você perder esta tela, crie de
              novo com o mesmo e-mail — a senha é trocada e a antiga para de valer.
            </p>
          </div>
        )}

        <form onSubmit={criar} className="rounded-xl border border-line bg-paper p-4">
          <label className="block text-[12.5px] font-semibold text-ink2" htmlFor="nome">
            Nome
          </label>
          <input
            id="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Marina Souza"
            className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] text-ink"
          />

          <label className="mt-3 block text-[12.5px] font-semibold text-ink2" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="marina@foocci.com"
            className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] text-ink"
          />

          <fieldset className="mt-4">
            <legend className="text-[12.5px] font-semibold text-ink2">O que essa pessoa é</legend>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {PAPEIS.map((p) => (
                <label
                  key={p.valor}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${
                    papel === p.valor ? "border-brand-400 bg-canvas" : "border-line"
                  }`}
                >
                  <input
                    type="radio"
                    name="papel"
                    value={p.valor}
                    checked={papel === p.valor}
                    onChange={() => setPapel(p.valor)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-[13.5px] font-semibold text-ink">{p.rotulo}</span>
                    <span className="block text-[12.5px] text-muted">{p.nota}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {erro && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={salvando || !nome.trim() || !email.trim()}
            className="mt-4 w-full rounded-xl bg-brand-500 px-3 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            {salvando ? "Criando…" : "Criar acesso e mostrar a senha"}
          </button>
        </form>

        <p className="mt-3 max-w-[62ch] text-[12.5px] leading-relaxed text-muted">
          Depois de criado, a pessoa entra em <strong className="text-ink2">/admin/login</strong>{" "}
          com o e-mail e essa senha. O vendedor cai direto no atendimento e não
          enxerga o resto do sistema.
        </p>
      </div>
    </div>
  );
}
