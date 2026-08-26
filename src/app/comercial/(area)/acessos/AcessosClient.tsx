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
 *
 * ── ⚠️ AGENTE NÃO SE CADASTRA — A CRÍTICA DO CEO, 26/08/2026 ────────────────
 *
 * Esta tela tinha só o formulário. Ele abriu e disse: *"isso aqui vai parecendo
 * como se fosse humano. Pra fazer um cadastro? Já tem que ter os botões prontos,
 * com nomes."*
 *
 * Está certo, e o erro era de leitura do produto. **Formulário é coisa de
 * gente**: uma pessoa tem nome próprio, e-mail próprio, e entra uma vez na vida
 * — vale digitar. Um agente não. Ele é peça da operação, e a operação já sabe de
 * quantos precisa e como se chamam.
 *
 * Pedir ao dono que invente o nome de um robô é trabalho de digitação
 * disfarçado de decisão.
 *
 * Então o time vem pronto, em cima, a um clique. O formulário continua embaixo —
 * ele não sobra: é por onde entra GENTE.
 */

import { useState } from "react";
import { TIME_DE_AGENTES, PAPEL_DO_TIME, type AgenteDoTime } from "@/services/salaDeVendas/timeDeAgentes";
import { ENTRADA } from "@/lib/sala/rotas";

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
  /** Qual agente está sendo criado agora — para o botão dele dizer isso. */
  const [criandoAgente, setCriandoAgente] = useState<string | null>(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  /** O caminho comum a todos: manda para a rota e mostra a senha. */
  async function pedirAcesso(corpo: { nome: string; email: string; papel: string }) {
    setErro(null);
    setCriado(null);
    setCopiou(false);

    try {
      const res = await fetch("/api/admin/sala-de-vendas/primeiro-acesso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...corpo, departamentos: ["vendas"] }),
      });
      const j = (await res.json()) as { ok: boolean; data?: Criado; error?: string };

      if (!j.ok || !j.data) {
        setErro(j.error ?? "Não foi possível criar o acesso.");
        return false;
      }
      setCriado(j.data);
      return true;
    } catch {
      setErro("Sem resposta do servidor.");
      return false;
    }
  }

  async function criarAgente(a: AgenteDoTime) {
    if (criandoAgente) return;
    setCriandoAgente(a.slug);
    // Rolar para o topo: a senha aparece lá em cima e uma vez só. Sem isto, em
    // tela pequena, o botão fica visível e a senha nasce fora do campo de visão.
    window.scrollTo({ top: 0, behavior: "smooth" });
    await pedirAcesso({ nome: a.nome, email: a.email, papel: PAPEL_DO_TIME });
    setCriandoAgente(null);
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;

    setSalvando(true);
    const deuCerto = await pedirAcesso({ nome, email, papel });
    if (deuCerto) {
      setNome("");
      setEmail("");
    }
    setSalvando(false);
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

        {/* O erro mora aqui, e não dentro do formulário: os botões do time
            também erram, e o formulário pode estar fechado. Erro que aparece
            dentro de uma gaveta fechada é erro que ninguém vê. */}
        {erro && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
            {erro}
          </p>
        )}

        {/* ── O TIME DE AGENTES ──────────────────────────────────────────────
            Em cima do formulário, e a ordem é a mensagem: o que já está pronto
            vem primeiro; digitar é a exceção. */}
        <section className="rounded-xl border border-line bg-paper p-4">
          <h2 className="text-[15px] font-semibold text-ink">Time de agentes</h2>
          <p className="mt-1 max-w-[60ch] text-[12.5px] leading-relaxed text-muted">
            Já estão nomeados. Um clique cria o acesso e mostra a senha aqui em cima.
            Crie <strong className="text-ink2">só os que forem trabalhar agora</strong> —
            agente parado na fila é fila dividida à toa.
          </p>

          <ul className="mt-3 flex flex-col gap-2">
            {TIME_DE_AGENTES.map((a) => {
              const esteCriando = criandoAgente === a.slug;
              return (
                <li
                  key={a.slug}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold text-ink">{a.nome}</span>
                    <span className="block text-[12.5px] text-muted">{a.funcao}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void criarAgente(a)}
                    disabled={criandoAgente !== null}
                    className="shrink-0 rounded-lg bg-brand-500 px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
                  >
                    {esteCriando ? "Criando…" : "Criar acesso"}
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 max-w-[60ch] text-[12.5px] leading-relaxed text-muted">
            Cada um entra com o próprio login, assume o lead no nome dele e aparece na
            conversa como quem atendeu — igual a uma pessoa do time.
          </p>
        </section>

        {/* ── E O FORMULÁRIO, PARA GENTE ─────────────────────────────────────
            Fechado por padrão. Aberto, ele volta a ser a primeira coisa que a
            tela pede — e era essa a crítica. */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setMostrarFormulario((v) => !v)}
            className="w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-left text-[13.5px] font-semibold text-ink2 transition-colors hover:bg-canvas"
          >
            {mostrarFormulario ? "− " : "+ "}
            Cadastrar uma pessoa do time
            <span className="ml-1 font-normal text-muted">— nome e e-mail próprios</span>
          </button>
        </div>

        <form
          onSubmit={criar}
          hidden={!mostrarFormulario}
          className="mt-3 rounded-xl border border-line bg-paper p-4"
        >
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

          <button
            type="submit"
            disabled={salvando || !nome.trim() || !email.trim()}
            className="mt-4 w-full rounded-xl bg-brand-500 px-3 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            {salvando ? "Criando…" : "Criar acesso e mostrar a senha"}
          </button>
        </form>

        <p className="mt-4 max-w-[62ch] text-[12.5px] leading-relaxed text-muted">
          Depois de criado, entra-se em <strong className="text-ink2">{ENTRADA}</strong> com
          o e-mail e essa senha — vale igual para agente e para pessoa. Quem é
          vendedor cai direto no atendimento e não enxerga o resto do sistema.
        </p>
      </div>
    </div>
  );
}
