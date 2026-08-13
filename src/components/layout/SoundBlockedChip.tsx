"use client";

/**
 * SoundBlockedChip — o que ficou no lugar do "Som ativo".
 *
 * O chip antigo (`SoundStatusChip`, removido em 13/08/2026 por ordem do CEO)
 * era um **status**, e mentia: dizia "🔔 Som ativo" com base numa marca de
 * `localStorage` gravada em algum dia do passado, enquanto o navegador exige um
 * gesto a CADA carregamento da página. O dono abria o painel de manhã, lia "Som
 * ativo", e o pedido entrava mudo.
 *
 * Este aqui não é status: é **alarme com evidência**. Fica invisível o tempo
 * todo e só aparece depois de um pedido REAL ter tentado tocar e o navegador ter
 * recusado (`isAudioBlocked`). Um toque libera o som da sessão e o aviso some.
 *
 * Regra que ele respeita: nunca afirmar que o som está bom. Silêncio aqui quer
 * dizer "nada falhou até agora", não "está tudo certo" — quem quiser certeza
 * aperta *Testar som* em Configurações → Sons.
 */

import { useEffect, useState } from "react";
import { isAudioBlocked, subscribeAudioArmed, markAudioArmed } from "@/lib/audio-gate";
import { resumeSharedAudioContext } from "@/lib/sound-player";

export function SoundBlockedChip() {
  // Começa escondido: o servidor não sabe se este aparelho bloqueou áudio, e um
  // aviso que pisca na hidratação seria alarme falso.
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const sync = () => setBlocked(isAudioBlocked());
    sync();
    return subscribeAudioArmed(sync);
  }, []);

  if (!blocked) return null;

  const ativar = () => {
    void resumeSharedAudioContext();
    markAudioArmed(); // limpa o bloqueio e acorda o alarme, que retoca em seguida
    setBlocked(false);
  };

  return (
    <button
      type="button"
      onClick={ativar}
      title="Um alerta de pedido não conseguiu tocar neste navegador. Toque para liberar o som."
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-600 bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-white" />
      <span aria-hidden>🔇</span>
      <span>Ativar som</span>
    </button>
  );
}
