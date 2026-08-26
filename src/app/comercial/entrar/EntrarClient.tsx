"use client";

/**
 * A porta da área comercial.
 *
 * ── DUAS PORTAS, E ELAS NÃO TÊM O MESMO PESO ────────────────────────────────
 *
 * **E-mail e senha** é a porta das pessoas: cada uma entra com a própria
 * identidade, o papel decide o que ela alcança, e a trilha registra quem entrou.
 * É por aqui que o vendedor entra.
 *
 * **A senha da casa** (`ADMIN_SECRET`) continua abrindo o que sempre abriu, mas
 * fica recolhida atrás de um link. Ela não carrega identidade — e numa sala onde
 * "quem assumiu esta conversa" é dado registrado, entrar sem nome é o começo de
 * um histórico que não responde a pergunta nenhuma.
 *
 * ── PARA ONDE CADA UM VAI ───────────────────────────────────────────────────
 *
 * O destino vem do SERVIDOR, junto com a sessão. Mandar todo mundo para a mesma
 * tela jogaria o vendedor num painel que ele não pode ver — e a primeira coisa
 * que ele veria do sistema seria uma recusa.
 */

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { COMERCIAL, ROTAS } from "@/lib/sala/rotas";

export function EntrarClient() {
  const router = useRouter();
  const [mostrarSenhaDaCasa, setMostrarSenhaDaCasa] = useState(false);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [chaveDaCasa, setChaveDaCasa] = useState("");

  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState("");

  async function entrarComoPessoa(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !senha) {
      setErro("Informe e-mail e senha.");
      return;
    }

    setEntrando(true);
    setErro("");

    try {
      const r = await fetch("/api/admin/session/interna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), senha }),
      });

      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        data?: { destino?: string };
      };

      if (r.ok && j.ok) {
        // `replace` para o botão "voltar" não devolver ninguém ao formulário
        // depois de entrar, e `refresh` para o layout reler a sessão do servidor.
        router.replace(j.data?.destino ?? COMERCIAL);
        router.refresh();
        return;
      }

      setErro(j.error ?? "Não foi possível entrar.");
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setEntrando(false);
    }
  }

  async function entrarComSenhaDaCasa(e: FormEvent) {
    e.preventDefault();
    if (!chaveDaCasa) {
      setErro("Informe a senha.");
      return;
    }

    setEntrando(true);
    setErro("");

    try {
      const r = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: chaveDaCasa }),
      });

      if (r.ok) {
        router.replace(COMERCIAL);
        router.refresh();
        return;
      }

      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setErro(j.error ?? "Senha incorreta.");
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[380px]">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-[-.02em] text-ink">
            Comercial Foocci
          </h1>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
            Entre com o seu e-mail e a sua senha.
          </p>
        </header>

        {mostrarSenhaDaCasa ? (
          <form onSubmit={entrarComSenhaDaCasa} className="space-y-3">
            <Campo
              rotulo="Senha de administração"
              type="password"
              value={chaveDaCasa}
              onChange={setChaveDaCasa}
              autoFocus
            />
            {erro ? <Erro texto={erro} /> : null}
            <Botao entrando={entrando} />
            <button
              type="button"
              onClick={() => { setMostrarSenhaDaCasa(false); setErro(""); }}
              className="w-full text-[12.5px] text-muted underline underline-offset-2 hover:text-ink2"
            >
              Entrar com e-mail e senha
            </button>
          </form>
        ) : (
          <form onSubmit={entrarComoPessoa} className="space-y-3">
            <Campo
              rotulo="E-mail"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="username"
              autoFocus
            />
            <Campo
              rotulo="Senha"
              type="password"
              value={senha}
              onChange={setSenha}
              autoComplete="current-password"
            />
            {erro ? <Erro texto={erro} /> : null}
            <Botao entrando={entrando} />
            <button
              type="button"
              onClick={() => { setMostrarSenhaDaCasa(true); setErro(""); }}
              className="w-full text-[12.5px] text-muted underline underline-offset-2 hover:text-ink2"
            >
              Entrar com a senha de administração
            </button>
            {/* ── A SAÍDA PARA O PRIMEIRO ACESSO ───────────────────────────
                Desde que a moldura passou a exigir sessão de pessoa, quem
                ainda não tem login não alcança tela nenhuma de `/comercial`
                — e a de criar acesso é justamente a que ele precisa.

                Sem este link o caminho existiria e ninguém acharia: a pessoa
                teria de saber o endereço de cor. Porta que só abre para quem
                já sabe onde ela fica é porta trancada. */}
            <a
              href={ROTAS.acessos}
              className="block w-full text-center text-[12.5px] text-muted underline underline-offset-2 hover:text-ink2"
            >
              Ainda não tenho login
            </a>
          </form>
        )}
      </div>
    </div>
  );
}

function Campo({
  rotulo, type, value, onChange, autoComplete, autoFocus,
}: {
  rotulo: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-medium text-ink2">{rotulo}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className="w-full rounded-xl border border-line2 bg-paper px-3 py-2 text-[14px] text-ink outline-none focus:border-ink2"
      />
    </label>
  );
}

function Erro({ texto }: { texto: string }) {
  // A recusa é uma frase, nunca um código. Quem lê isto está tentando trabalhar.
  return (
    <p role="alert" className="rounded-xl border border-line2 bg-chip px-3 py-2 text-[13px] text-ink2">
      {texto}
    </p>
  );
}

function Botao({ entrando }: { entrando: boolean }) {
  return (
    <button
      type="submit"
      disabled={entrando}
      className="w-full rounded-xl bg-ink px-3 py-2 text-[14px] font-semibold text-paper disabled:opacity-60"
    >
      {entrando ? "Entrando…" : "Entrar"}
    </button>
  );
}
