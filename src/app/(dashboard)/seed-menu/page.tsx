"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";

type Status = "checking" | "ready" | "blocked" | "seeding" | "done" | "error";

export default function SeedMenuPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [result, setResult] = useState<{ categories: number; items: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetch("/api/seed-menu")
      .then((r) => r.json())
      .then((data) => {
        if (data.data?.seedAllowed) {
          setStatus("ready");
        } else {
          setStatus("blocked");
        }
      })
      .catch(() => {
        setErrorMsg("Não foi possível verificar o cardápio.");
        setStatus("error");
      });
  }, []);

  async function handleSeed() {
    setStatus("seeding");
    try {
      const res = await fetch("/api/seed-menu", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Erro ao criar cardápio.");
        setStatus("error");
        return;
      }
      setResult(data.data.created);
      setStatus("done");
    } catch {
      setErrorMsg("Erro de rede. Tente novamente.");
      setStatus("error");
    }
  }

  return (
    <>
      <TopBar title="Cardápio de Exemplo" />
      <div className="flex flex-col items-center justify-center p-10">
        <div className="w-full max-w-md rounded-2xl border border-line2 bg-paper p-8 shadow-sm text-center">
          {status === "checking" && (
            <p className="text-muted text-sm">Verificando cardápio...</p>
          )}

          {status === "ready" && (
            <>
              <div className="text-5xl mb-4">🍕</div>
              <h2 className="text-xl font-bold text-ink mb-2">
                Cardápio de Exemplo
              </h2>
              <p className="text-sm text-muted mb-1">
                Seu cardápio está vazio. Deseja popular com dados de exemplo de uma pizzaria?
              </p>
              <p className="text-xs text-muted mb-6">
                Serão criadas 4 categorias e 11 itens. Você poderá editar ou excluir qualquer item depois.
              </p>
              <ul className="text-sm text-ink2 text-left mb-6 space-y-1">
                <li>🍕 <strong>Pizzas Tradicionais</strong> — 4 sabores</li>
                <li>⭐ <strong>Pizzas Especiais</strong> — 3 sabores</li>
                <li>🥤 <strong>Bebidas</strong> — 2 itens</li>
                <li>🍰 <strong>Sobremesas</strong> — 2 itens</li>
              </ul>
              <button
                onClick={handleSeed}
                className="w-full rounded-lg bg-brand-500 py-3 text-sm font-semibold text-white hover:bg-brand-600"
              >
                Criar cardápio de exemplo
              </button>
            </>
          )}

          {status === "seeding" && (
            <p className="text-muted text-sm">Criando cardápio...</p>
          )}

          {status === "done" && result && (
            <>
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-xl font-bold text-ink mb-2">Cardápio criado!</h2>
              <p className="text-sm text-ink2 mb-1">
                {result.categories} categorias e {result.items} itens adicionados com sucesso.
              </p>
              <button
                onClick={() => router.push("/menu")}
                className="mt-6 w-full rounded-lg bg-brand-500 py-3 text-sm font-semibold text-white hover:bg-brand-600"
              >
                Ver cardápio
              </button>
            </>
          )}

          {status === "blocked" && (
            <>
              <div className="text-5xl mb-4">🔒</div>
              <h2 className="text-xl font-bold text-ink mb-2">Cardápio já possui dados</h2>
              <p className="text-sm text-muted mb-6">
                O seeding só é permitido quando o cardápio está completamente vazio.
              </p>
              <button
                onClick={() => router.push("/menu")}
                className="w-full rounded-lg bg-brand-500 py-3 text-sm font-semibold text-white hover:bg-brand-600"
              >
                Ver cardápio
              </button>
            </>
          )}

          {status === "error" && (
            <>
              <div className="text-5xl mb-4">❌</div>
              <p className="text-sm text-red-600 mb-4">{errorMsg}</p>
              <button
                onClick={() => router.push("/menu")}
                className="w-full rounded-lg bg-line2 py-3 text-sm font-semibold text-ink2 hover:bg-line2"
              >
                Voltar para o cardápio
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
