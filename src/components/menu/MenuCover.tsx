"use client";

/**
 * MenuCover — a capa do cardápio: a faixa larga no topo, atrás do logo.
 *
 * Recurso de PRODUTO, para todo restaurante (RestaurantBrandConfig.coverImageUrl),
 * não enfeite de uma loja só. Norte estético da loja é iFood/Rappi (DESIGN.md):
 * lá a capa é o primeiro sinal de que aquele cardápio é daquela casa.
 *
 * Os três estados obrigatórios (DESIGN.md §6.1), e o do meio é o que manda:
 *
 *  • VAZIO (a maioria) — sem capa a faixa NÃO some e NÃO fica cinza: ela é
 *    desenhada com o degradê da própria marca (`--brand-primary` →
 *    `--brand-secondary`) mais um brilho suave. O restaurante que nunca abriu a
 *    tela de Marca ganha um topo que parece dele. Vazio bonito, não vazio quebrado.
 *  • CARREGANDO — a altura é fixa e o degradê já está pintado ANTES da foto
 *    chegar. A foto entra por cima, com `opacity` em transição: nada de pulo de
 *    layout, nada de retângulo branco piscando.
 *  • ERRO — foto que não carrega se esconde (`onError`) e o degradê, que sempre
 *    esteve atrás, volta a ser a capa. Nunca o ícone de imagem quebrada.
 *
 * White-label de verdade: zero cor literal de marca aqui. Tudo sai das variáveis
 * `--brand-primary` / `--brand-secondary` que a página da loja define.
 */

import { useState } from "react";

export function MenuCover({
  coverImageUrl,
  restaurantName,
  logoUrl,
  className,
}: {
  coverImageUrl?: string | null;
  restaurantName: string;
  logoUrl?: string | null;
  className?: string;
}) {
  const [falhou, setFalhou] = useState(false);
  const [carregou, setCarregou] = useState(false);
  const temFoto = !!coverImageUrl && !falhou;

  return (
    <div className={className}>
      <div
        className="relative h-28 w-full overflow-hidden sm:h-40"
        style={{
          // O degradê é o CHÃO da capa: existe com foto e sem foto. Com foto, é o
          // placeholder enquanto ela chega e a rede de segurança se ela falhar.
          backgroundImage:
            "linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%)",
        }}
      >
        {/* Brilho suave — dá volume ao estado vazio para ele não parecer um bloco
            chapado de cor. Decoração pura: fora da árvore de acessibilidade. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(120% 90% at 20% 0%, rgba(255,255,255,.28) 0%, rgba(255,255,255,0) 60%)",
          }}
        />

        {temFoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImageUrl!}
            alt={`Foto da fachada de ${restaurantName}`}
            className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-300 ${
              carregou ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setCarregou(true)}
            onError={() => setFalhou(true)}
          />
        )}

        {/* Véu escuro na base — só com foto. Sem ele, o logo claro por cima de uma
            capa clara some, e a borda foto→branco fica dura. */}
        {temFoto && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
            style={{
              backgroundImage:
                "linear-gradient(to top, rgba(0,0,0,.45) 0%, rgba(0,0,0,0) 100%)",
            }}
          />
        )}
      </div>

      {/* O logo monta na divisa capa/conteúdo (padrão iFood/Rappi). O anel branco
          é o que separa o logo da capa em QUALQUER cor de marca — não é enfeite. */}
      {logoUrl && (
        <div className="relative z-10 -mt-11 flex justify-center sm:-mt-14">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt={restaurantName}
            className="h-20 w-20 rounded-full bg-white object-cover shadow-md ring-4 ring-white sm:h-24 sm:w-24"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      )}
    </div>
  );
}
