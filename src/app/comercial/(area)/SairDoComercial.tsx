"use client";

/**
 * A saída.
 *
 * Numa sala onde assumir uma conversa é ato registrado com nome e hora, sair
 * precisa ser um botão visível. Sem ele, a pessoa fecha a aba — e a sessão fica
 * viva num computador compartilhado, onde a próxima pessoa assume conversas em
 * nome dela.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ENTRADA } from "@/lib/sala/rotas";

export function SairDoComercial() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    try {
      await fetch("/api/admin/session/interna", { method: "DELETE" });
    } catch {
      // Falhar em avisar o servidor não pode prender ninguém na tela: o que
      // importa é sair daqui. O cookie tem prazo próprio e morre sozinho.
    }
    // `replace` e não `push`: o botão "voltar" não pode devolver a pessoa para
    // dentro de uma sessão que ela acabou de encerrar.
    router.replace(ENTRADA);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={sair}
      disabled={saindo}
      className="shrink-0 rounded-full border border-line2 bg-canvas px-3 py-1 text-[12.5px] font-medium text-ink2 hover:bg-chip disabled:opacity-60"
    >
      {saindo ? "Saindo…" : "Sair"}
    </button>
  );
}
