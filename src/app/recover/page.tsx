"use client";

/**
 * /recover — FERRAMENTA DE INSTALAÇÃO, não de "esqueci minha senha".
 *
 * Só aparece o formulário quando a instalação está pela metade: existe UM
 * restaurante e ele não tem nenhum proprietário ativo. Em qualquer outro estado a
 * tela recusa e diz o motivo.
 *
 * ⛔ O QUE SAIU DAQUI EM 13/08/2026 — e por quê:
 *
 * Esta página tinha um modo `?force=true` que chamava `POST /api/admin/reset-owner`
 * e APAGAVA TODAS AS CONTAS DE USUÁRIO do restaurante. Ele estava a UM CLIQUE do
 * lojista comum: o login dizia "Esqueci minha senha", caía aqui, e o estado
 * "bloqueado" oferecia, em vermelho, "Recuperação forçada (apaga todos os usuários)".
 * Pior: a chamada nem mandava o `x-admin-secret` que a API exige, então o caminho
 * era garantido terminar em "Unauthorized" — cru, em inglês. Ou seja: um botão que
 * só sabia fazer duas coisas, assustar ou destruir.
 *
 * Apagar acesso é IRREVERSÍVEL. Ferramenta irreversível é de operador, e operador
 * tem credencial: hoje o único caminho é `POST /api/admin/reset-owner` com o
 * `x-admin-secret`, alvo explícito e confirmação — nunca por uma tela pública.
 * Botão destrutivo que só o navegador esconde não está trancado; está escondido.
 *
 * Quem chegar em `/recover?force=true` (link velho, histórico, favorito) vê a mesma
 * tela normal. O parâmetro não faz mais nada.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SupportContactBlock } from "@/components/auth/SupportContactBlock";

type Status = "checking" | "allowed" | "blocked" | "done" | "db_error";

export default function RecoverPage() {
  const router = useRouter();

  const [status, setStatus] = useState<Status>("checking");
  const [restaurantName, setRestaurantName] = useState("");
  const [form, setForm] = useState({ ownerName: "", ownerEmail: "", ownerPassword: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/recover")
      .then((r) => r.json())
      .then((data) => {
        setRestaurantName(data.restaurantName ?? "");
        setStatus(data.recoveryAllowed ? "allowed" : "blocked");
      })
      .catch(() => setStatus("db_error"));
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const { ownerName, ownerEmail, ownerPassword } = form;
    if (!ownerName || !ownerEmail || !ownerPassword) {
      setError("Todos os campos são obrigatórios.");
      return;
    }
    if (ownerPassword.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Não foi possível criar a conta. Tente novamente.");
        setSubmitting(false);
        return;
      }

      setStatus("done");
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setSubmitting(false);
    }
  }

  if (status === "checking") {
    return <Screen><p className="text-muted">Verificando o estado da instalação…</p></Screen>;
  }

  if (status === "db_error") {
    return (
      <Screen>
        <p className="font-semibold text-red-600">Não foi possível conectar ao banco de dados.</p>
        <p className="mt-1 text-sm text-muted">
          Tente de novo em alguns minutos. Se continuar assim, avise o Foocci.
        </p>
        <SupportContactBlock className="mt-5 w-full max-w-md text-left" />
      </Screen>
    );
  }

  /*
    O estado que o lojista de verdade encontra. Antes ele lia "use a recuperação
    forçada" e um link vermelho; agora lê o que realmente resolve o problema dele.
  */
  if (status === "blocked") {
    return (
      <Screen>
        <p className="font-semibold text-ink">Esta página não redefine senha.</p>
        <p className="mt-1 max-w-md text-sm text-ink2">
          Ela só serve para criar o primeiro acesso de um restaurante recém-instalado.
          O seu já tem acesso criado — entre pelo login. Se a senha não funcionar, o
          caminho está logo abaixo.
        </p>
        <a
          href="/login"
          className="mt-4 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
        >
          Ir para o login
        </a>
        <SupportContactBlock className="mt-5 w-full max-w-md text-left" />
      </Screen>
    );
  }

  if (status === "done") {
    return (
      <Screen>
        <div className="text-4xl">✅</div>
        <p className="mt-3 font-semibold text-ink">Conta criada com sucesso!</p>
        <p className="mt-1 text-sm text-muted">Redirecionando para o login…</p>
      </Screen>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-line bg-paper p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-ink">Primeiro acesso</h1>
        {restaurantName && (
          <p className="mt-1 text-sm text-muted">
            Restaurante: <span className="font-medium text-ink2">{restaurantName}</span>
          </p>
        )}
        <p className="mt-1 text-sm text-brand-600">
          Este restaurante ainda não tem proprietário. Crie a conta de acesso agora.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field label="Seu nome" name="ownerName" placeholder="Ex: João Silva"
            value={form.ownerName} onChange={handleChange} />
          <Field label="E-mail de acesso" name="ownerEmail" type="email"
            placeholder="Ex: joao@pizzaria.com" value={form.ownerEmail} onChange={handleChange} />
          <Field label="Senha (mínimo 8 caracteres)" name="ownerPassword" type="password"
            placeholder="••••••••" value={form.ownerPassword} onChange={handleChange} />

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
          )}

          <button type="submit" disabled={submitting}
            className="mt-2 w-full rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {submitting ? "Criando conta…" : "Criar conta de proprietário"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-1 bg-canvas px-4 py-10 text-center">
      {children}
    </div>
  );
}

function Field({ label, name, type = "text", placeholder, value, onChange }: {
  label: string; name: string; type?: string; placeholder?: string;
  value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-ink2">{label}</label>
      <input id={name} name={name} type={type} placeholder={placeholder} value={value}
        onChange={onChange}
        className="w-full rounded-xl border border-line2 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
    </div>
  );
}
