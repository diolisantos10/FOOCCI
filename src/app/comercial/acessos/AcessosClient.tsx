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
 * ── ⚠️ ESTA TELA É SÓ DE GENTE, E LEVOU TRÊS VOLTAS PARA CHEGAR AQUI ────────
 *
 * Em 26/08/2026 o CEO corrigiu o mesmo erro meu três vezes, cada vez mais fundo.
 *
 * **Primeira.** A tela tinha só um formulário. *"Isso aqui vai parecendo como se
 * fosse humano. Pra fazer um cadastro? Já tem que ter os botões prontos, com
 * nomes."* — então pus os cinco agentes aqui em cima, com nome, um clique cada.
 *
 * **Segunda.** *"Os agentes de IA, eles não têm login, eles estão lá no
 * sistema."* — tirei a senha deles. O botão ficou.
 *
 * **Terceira, e a que resolve.** *"Os agentes já são parte do sistema. Eles não
 * são externos, eles fazem parte do sistema. Os humanos é que vão ter que fazer
 * login e entrar no sistema."*
 *
 * Aí a ficha caiu: eu tinha corrigido o **sintoma** duas vezes e mantido a
 * premissa errada — a de que o agente **chega de fora e precisa ser admitido**.
 * Ele não chega. Ele é peça: existe porque o sistema existe, como a fila existe
 * e o funil existe. Ninguém põe a fila no sistema.
 *
 * Por isso o time saiu daqui inteiro. Esta tela trata de **entrar**, e entrar é
 * coisa de quem está do lado de fora. O time está dentro (`garantirTime.ts`).
 *
 * ── ⚠️ E POR ISSO ELA VIVE FORA DA MOLDURA ──────────────────────────────────
 *
 * Esta é a única tela de `/comercial` que a **senha da casa** ainda abre, e é de
 * propósito: é por aqui que nasce o primeiro login da vida. Se ela exigisse
 * sessão de pessoa, o primeiro acesso não teria por onde ser criado — a porta
 * pediria a chave que só existe do outro lado dela.
 *
 * Ficar fora da moldura é o que permite isso sem furar a regra nova: a casa
 * (`(area)/layout.tsx`) exige sessão de pessoa e **não aceita mais a senha da
 * casa**. Aqui não há casa — há um formulário.
 */

import { useState } from "react";
import { ENTRADA, ROTAS, COMERCIAL } from "@/lib/sala/rotas";

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
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  /** Cria a conta e devolve a senha, que aparece uma vez. Só para gente. */
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

  /**
   * O atalho do dono.
   *
   * Ele não preenche nada por ele: abre o formulário já no papel de CEO e põe o
   * cursor no e-mail. O e-mail continua sendo digitado — endereço pessoal não
   * mora no código deste repositório.
   */
  function souODono() {
    setPapel("MASTER_CEO");
    setMostrarFormulario(true);
    setErro(null);
    // O `requestAnimationFrame` espera o formulário existir no DOM: chamar
    // `focus` no mesmo tique acha `null` e não foca nada.
    requestAnimationFrame(() => {
      document.getElementById("email")?.focus();
    });
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
    <div className="min-h-screen bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        {/* Sem a moldura, não há menu — e sem menu, não há volta. Este link é a
            volta. Quem chegou aqui pela tela de entrar segue para o login;
            quem chegou de dentro da Sala volta para ela. Os dois cabem no
            mesmo link porque a Sala manda para o login quem não tem sessão. */}
        <a
          href={COMERCIAL}
          className="mb-4 inline-block text-[12.5px] text-muted underline underline-offset-2 hover:text-ink2"
        >
          ← Voltar para a Sala
        </a>

        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-[-.02em] text-ink">Quem entra na Sala</h1>
          <p className="mt-1 max-w-[62ch] text-[13.5px] leading-relaxed text-muted">
            Esta tela é <strong className="text-ink2">só de gente</strong>. Cada pessoa
            entra com o e-mail e a senha dela, e enxerga conforme o que é: o
            vendedor vê os clientes dele; o CEO e o diretor veem a operação inteira.
          </p>
          <p className="mt-2 max-w-[62ch] text-[12.5px] leading-relaxed text-muted">
            Os <strong className="text-ink2">agentes não aparecem aqui</strong> — eles já
            fazem parte do sistema e não fazem login. Quem eles são está na aba{" "}
            <a href={ROTAS.agente} className="underline decoration-line underline-offset-2">
              O agente
            </a>
            .
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

        {/* O erro mora aqui, e não dentro do formulário, que pode estar
            fechado. Erro que aparece dentro de uma gaveta fechada é erro que
            ninguém vê. */}
        {erro && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
            {erro}
          </p>
        )}

        {/* ── O ATALHO DO DONO ───────────────────────────────────────────────
            O beco que ele descreveu: entrou com a senha da casa, que não carrega
            nome, e a Sala recusou — cada lead tem um responsável e responsável
            sem nome não responde por nada. A saída é ele ter o login dele. */}
        <section className="rounded-xl border border-line bg-paper p-4">
          <h2 className="text-[15px] font-semibold text-ink">O seu acesso</h2>
          <p className="mt-1 max-w-[60ch] text-[12.5px] leading-relaxed text-muted">
            A senha da casa abre a porta, mas não tem nome — e a Sala precisa saber
            de quem é cada conversa. Com o seu login você enxerga{" "}
            <strong className="text-ink2">a operação inteira</strong>: os vendedores,
            os agentes e todos os clientes. O vendedor enxerga só os dele.
          </p>
          <button
            type="button"
            onClick={souODono}
            className="mt-3 rounded-xl bg-brand-500 px-3.5 py-2 text-[13.5px] font-semibold text-white transition-colors hover:bg-brand-600"
          >
            Criar o meu acesso de CEO
          </button>
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
