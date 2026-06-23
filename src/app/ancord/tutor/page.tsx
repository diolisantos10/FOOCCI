"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getModule, roman } from "@/lib/ancord/modules";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

function renderRich(text: string): React.ReactNode {
  // Renderização leve: **negrito** + quebras de linha.
  return text.split("\n").map((line, li) => (
    <span key={li}>
      {line.split(/(\*\*[^*]+\*\*)/g).map((part, pi) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={pi}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={pi}>{part}</span>
        ),
      )}
      <br />
    </span>
  ));
}

function TutorChat() {
  const params = useSearchParams();
  const moduleId = params.get("modulo") ? Number(params.get("modulo")) : undefined;
  const mod = moduleId ? getModule(moduleId) : undefined;

  const greeting: Msg = {
    role: "assistant",
    content: mod
      ? `Oi! Bora destravar o **Capítulo ${roman(mod.id)} — ${mod.short}**? Me diga sua dúvida ou escolha um atalho abaixo. 😊`
      : "Oi! Sou seu tutor da ANCORD. Pode perguntar qualquer coisa da matéria — explico de um jeito simples e direto. 💪",
  };

  const [messages, setMessages] = useState<Msg[]>([greeting]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const suggestions = mod
    ? [
        `Explique o capítulo ${roman(mod.id)} de forma bem simples`,
        "Me dê 5 questões para treinar",
        "Quais as pegadinhas mais comuns aqui?",
        "Resuma em 3 tópicos + um macete",
      ]
    : [
        "Explique a tabela regressiva de IR de forma simples",
        "Diferença entre garantia firme e melhores esforços?",
        "Me dê 5 questões de derivativos",
        "Quais os 5 capítulos críticos da prova?",
      ];

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ancord/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: next.filter((m) => m !== greeting).map(({ role, content }) => ({ role, content })),
          moduleId,
        }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "..." }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Não consegui responder agora. Tente de novo. 🙏" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[85vh] flex-col">
      <header className="mb-3">
        <h1 className="text-2xl font-bold text-gray-900">Tutor 🤖</h1>
        {mod ? (
          <p className="text-sm text-gray-500">
            Contexto: Cap. {roman(mod.id)} · {mod.short}
          </p>
        ) : (
          <p className="text-sm text-gray-500">Tire dúvidas e peça questões na hora</p>
        )}
      </header>

      <div className="flex-1 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "rounded-br-md bg-brand-500 text-white"
                  : "rounded-bl-md border border-gray-100 bg-white text-gray-800 shadow-sm"
              }`}
            >
              {m.role === "assistant" ? renderRich(m.content) : m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <span className="flex gap-1">
                <Dot /> <Dot delay="0.15s" /> <Dot delay="0.3s" />
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Sugestões */}
      {messages.length <= 1 && (
        <div className="my-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-brand-300"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="sticky bottom-20 mt-2 flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send(input);
          }}
          placeholder="Escreva sua dúvida..."
          className="flex-1 border-0 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-0"
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}

function Dot({ delay = "0s" }: { delay?: string }) {
  return (
    <span
      className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-300"
      style={{ animationDelay: delay }}
    />
  );
}

export default function TutorPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-gray-100" />}>
      <TutorChat />
    </Suspense>
  );
}
