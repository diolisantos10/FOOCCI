/**
 * Portão da regra de fotos da ficha (components/menu/photos.ts).
 *
 * Cada prova aqui tem as DUAS metades: o caso em que o defeito existe e ela
 * reprova, e o caso vizinho em que não existe e ela passa. Um portão que só
 * conhece o caminho feliz não é portão, é decoração.
 *
 * O defeito real que motivou o arquivo: a Loja com IA montava o carrossel com
 * `item.images` puro. Quem tocava no card do Pão Francês (foto da capa) abria a
 * ficha e via as DUAS OUTRAS fotos — a capa sumia justo do item escolhido.
 */

import { describe, expect, it } from "vitest";
import { menuItemPhotos } from "./photos";

const CAPA = "/api/media/capa";
const E1 = "/api/media/extra-1";
const E2 = "/api/media/extra-2";

describe("menuItemPhotos — a capa é o primeiro slide", () => {
  it("REPROVA a montagem antiga: com carrossel ligado, a capa não pode ficar de fora", () => {
    const fotos = menuItemPhotos({ imageUrl: CAPA, images: [E1, E2], carouselEnabled: true });

    // A metade que pega o defeito: `[E1, E2]` (o comportamento antigo) falha aqui.
    expect(fotos[0]).toBe(CAPA);
    expect(fotos).toEqual([CAPA, E1, E2]);
  });

  it("passa quando não há defeito: sem fotos extras, a ficha é a capa e pronto", () => {
    expect(menuItemPhotos({ imageUrl: CAPA, images: [], carouselEnabled: true })).toEqual([CAPA]);
  });

  it("o carrossel é OPT-IN: com `carouselEnabled` desligado, as extras guardadas não entram", () => {
    // A metade que reprova o inverso — mostrar as extras sem o lojista ter pedido.
    expect(menuItemPhotos({ imageUrl: CAPA, images: [E1, E2], carouselEnabled: false })).toEqual([CAPA]);
    // ... e a metade que passa: com o opt-in, as mesmas fotos aparecem.
    expect(menuItemPhotos({ imageUrl: CAPA, images: [E1, E2], carouselEnabled: true })).toHaveLength(3);
  });

  it("capa repetida dentro de `images` aparece UMA vez — não abre o carrossel com a foto dobrada", () => {
    expect(menuItemPhotos({ imageUrl: CAPA, images: [CAPA, E1], carouselEnabled: true }))
      .toEqual([CAPA, E1]);
  });

  it("item sem foto nenhuma devolve lista vazia — quem chama desenha o estado vazio", () => {
    expect(menuItemPhotos({ imageUrl: null, images: [], carouselEnabled: true })).toEqual([]);
    expect(menuItemPhotos({ imageUrl: "", images: [], carouselEnabled: false })).toEqual([]);
    // E a metade que passa: com uma foto, a lista tem uma.
    expect(menuItemPhotos({ imageUrl: CAPA })).toEqual([CAPA]);
  });

  it("sem capa mas com extras, o carrossel começa na primeira extra em vez de morrer", () => {
    expect(menuItemPhotos({ imageUrl: null, images: [E1, E2], carouselEnabled: true }))
      .toEqual([E1, E2]);
  });

  it("string vazia e espaço em branco em `images` não viram slide fantasma", () => {
    expect(menuItemPhotos({ imageUrl: CAPA, images: ["", "   ", E1], carouselEnabled: true }))
      .toEqual([CAPA, E1]);
  });

  it("campos ausentes (o shape do QR antigo) não quebram — devolve só a capa", () => {
    expect(menuItemPhotos({ imageUrl: CAPA, images: undefined, carouselEnabled: undefined }))
      .toEqual([CAPA]);
  });
});
