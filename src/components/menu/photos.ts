/**
 * A regra de QUAIS fotos a ficha do produto mostra — num lugar só.
 *
 * O schema separa dois papéis (prisma/schema.prisma, MenuItem):
 *   • `imageUrl`  = a CAPA. É ela no card, no thumbnail, no WhatsApp, no OG e nos
 *     exports. Ela NUNCA muda quando alguém adiciona fotos extras.
 *   • `images[]`  = as fotos extras, mostradas só na ficha e só quando
 *     `carouselEnabled = true`. A ordem do array é a ordem do carrossel.
 *
 * A regra que faltava estar escrita: **a capa é o primeiro slide.** Quem toca no
 * card viu a capa; abrir a ficha em outra foto é trocar o produto debaixo do
 * dedo da pessoa. Antes desta função a Loja com IA montava o carrossel só com
 * `images`, e a capa sumia da ficha justamente do item que a pessoa escolheu.
 *
 * Duplicatas caem fora: se a capa também estiver dentro de `images` (acontece
 * quando alguém reordena as fotos no painel), ela aparece uma vez só.
 */

export type MenuItemPhotoSource = {
  imageUrl?: string | null;
  images?: string[] | null;
  carouselEnabled?: boolean | null;
};

/**
 * As fotos da ficha, em ordem: capa primeiro, extras depois.
 * Devolve `[]` quando não há foto nenhuma — quem chama desenha o estado vazio.
 */
export function menuItemPhotos(item: MenuItemPhotoSource): string[] {
  const capa = typeof item.imageUrl === "string" && item.imageUrl.trim() ? item.imageUrl.trim() : null;

  // Sem o opt-in, a ficha continua sendo uma foto só — mesmo que `images` tenha
  // conteúdo guardado. O carrossel é escolha do lojista, não consequência do dado.
  if (item.carouselEnabled !== true) return capa ? [capa] : [];

  const extras = (item.images ?? [])
    .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    .map((u) => u.trim());

  const ordenadas = capa ? [capa, ...extras] : extras;

  const vistas = new Set<string>();
  return ordenadas.filter((u) => (vistas.has(u) ? false : (vistas.add(u), true)));
}
