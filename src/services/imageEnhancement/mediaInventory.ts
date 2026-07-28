/**
 * Inventário de mídia — "quais pratos deste cliente têm foto, e quais não têm?"
 *
 * Só leitura. Nenhuma escrita, nenhuma IA, nenhum provider: é um retrato do
 * cardápio pra planejar o que dá pra produzir. Serve pra responder, ANTES de
 * prometer criativo, quantas peças cada cliente consegue sustentar com o
 * insumo que ele já tem.
 *
 * A Oficina consome isto pra decidir o caminho de cada peça (realce × geração ×
 * bloqueio), mas o inventário existe por si só — dá pra olhar sem ligar nada.
 */

import { prisma } from "@/lib/prisma";

export interface ItemSemFoto {
  id: string;
  nome: string;
  categoria: string | null;
}

export interface InventarioDeRestaurante {
  restaurantId: string;
  nome: string;
  /** Itens ativos do cardápio. */
  total: number;
  comFoto: number;
  semFoto: number;
  /** 0–100, arredondado. É o número que diz se dá pra fazer campanha só com realce. */
  cobertura: number;
  /** O que precisa de foto — a lista que vai pro cliente. */
  itensSemFoto: ItemSemFoto[];
  /** Leitura em uma frase, pra não precisar interpretar número. */
  leitura: string;
}

/** Quantos itens sem foto listar por restaurante antes de virar só contagem. */
const TETO_DA_LISTA = 50;

function ler(cobertura: number, semFoto: number): string {
  if (semFoto === 0) return "Cardápio completo de fotos — dá pra fazer campanha inteira só com realce.";
  if (cobertura >= 70) return `Boa cobertura: dá pra montar campanha com realce e deixar ${semFoto} item(ns) de fora.`;
  if (cobertura >= 30) return `Cobertura parcial: ${semFoto} item(ns) sem foto — peça essas ao cliente antes de prometer o calendário.`;
  if (cobertura > 0) return `Cobertura baixa: quase tudo sem foto. Peça as fotos ao cliente ou use peça gráfica (sem foto de prato).`;
  return "Nenhuma foto no cardápio — sem insumo, só peça gráfica até o cliente enviar as fotos.";
}

/** Inventário de um restaurante. */
export async function inventariarMidia(restaurantId: string): Promise<InventarioDeRestaurante | null> {
  const restaurante = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, name: true },
  });
  if (!restaurante) return null;

  const itens = await prisma.menuItem.findMany({
    where: { category: { restaurantId }, isActive: true },
    select: { id: true, name: true, imageUrl: true, category: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  // Espaço em branco não é foto — um imageUrl vazio engana a contagem.
  const semFoto = itens.filter((i) => !i.imageUrl || i.imageUrl.trim().length === 0);
  const total = itens.length;
  const comFoto = total - semFoto.length;
  const cobertura = total === 0 ? 0 : Math.round((comFoto / total) * 100);

  return {
    restaurantId: restaurante.id,
    nome: restaurante.name,
    total,
    comFoto,
    semFoto: semFoto.length,
    cobertura,
    itensSemFoto: semFoto.slice(0, TETO_DA_LISTA).map((i) => ({
      id: i.id,
      nome: i.name,
      categoria: i.category?.name ?? null,
    })),
    leitura: total === 0
      ? "Cardápio vazio — cadastre os itens antes de planejar criativo."
      : ler(cobertura, semFoto.length),
  };
}

/**
 * Inventário de vários restaurantes de uma vez — o caso real de quem vai subir
 * três clientes no mesmo fim de semana e precisa saber de quanto insumo dispõe.
 *
 * Restaurante inexistente é ignorado em silêncio na lista e devolvido em
 * `naoEncontrados`: melhor entregar o inventário dos que existem do que falhar
 * tudo por causa de um id errado.
 */
export async function inventariarVarios(
  restaurantIds: string[],
): Promise<{ inventarios: InventarioDeRestaurante[]; naoEncontrados: string[] }> {
  const unicos = [...new Set(restaurantIds.map((id) => id.trim()).filter(Boolean))];
  const resultados = await Promise.all(unicos.map((id) => inventariarMidia(id).catch(() => null)));

  const inventarios: InventarioDeRestaurante[] = [];
  const naoEncontrados: string[] = [];
  resultados.forEach((r, i) => {
    if (r) inventarios.push(r);
    else naoEncontrados.push(unicos[i] as string);
  });

  return { inventarios, naoEncontrados };
}
