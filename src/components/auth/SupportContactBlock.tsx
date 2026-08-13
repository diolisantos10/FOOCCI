"use client";

/**
 * "Não consigo entrar" — a porta de socorro das telas de acesso.
 *
 * Vive fora do painel de propósito: o assistente de ajuda do Foocci só existe
 * DENTRO do dashboard e some justamente para quem está trancado do lado de fora.
 * Esta é a única coisa que essa pessoa consegue alcançar.
 *
 * Mostra canal DE VERDADE (WhatsApp e/ou e-mail, de `@/lib/support-contact`) quando
 * existe um configurado. Quando não existe, NÃO inventa "fale com o suporte": leva
 * ao formulário do site, que grava o pedido no banco, e diz em português o que vai
 * acontecer depois — promessa que a gente consegue cumprir.
 */

import { SUPPORT_CONTACT, SUPPORT_FALLBACK_URL } from "@/lib/support-contact";

const LINK =
  "font-medium text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 rounded-sm";

export function SupportContactBlock({ className = "" }: { className?: string }) {
  const { whatsappUrl, whatsappLabel, email, emailUrl, hasChannel } = SUPPORT_CONTACT;

  return (
    <div className={`rounded-xl border border-line2 bg-canvas px-4 py-3 text-sm ${className}`}>
      <p className="font-semibold text-ink">Não consegue entrar?</p>

      {hasChannel ? (
        <>
          <p className="mt-1 text-ink2">
            A redefinição de senha é feita pela equipe do Foocci. Chame por aqui e diga o
            e-mail que você usa para entrar:
          </p>
          <ul className="mt-2 space-y-1">
            {whatsappUrl && (
              <li>
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
                  WhatsApp {whatsappLabel}
                </a>
              </li>
            )}
            {emailUrl && email && (
              <li>
                <a href={emailUrl} className={LINK}>
                  {email}
                </a>
              </li>
            )}
          </ul>
        </>
      ) : (
        <p className="mt-1 text-ink2">
          A redefinição de senha é feita pela equipe do Foocci.{" "}
          <a href={SUPPORT_FALLBACK_URL} className={LINK}>
            Deixe seu nome e WhatsApp aqui
          </a>{" "}
          que a gente entra em contato para devolver o seu acesso.
        </p>
      )}
    </div>
  );
}
