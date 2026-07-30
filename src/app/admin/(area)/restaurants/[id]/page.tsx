/**
 * Admin → Restaurantes → ficha do cliente.
 *
 * O cadastro de QUEM é o restaurante — redes, nicho, persona, fiscal,
 * localização, contatos. Não é diagnóstico de saúde: é a memória da casa sobre
 * cada cliente, para ninguém precisar perguntar duas vezes a mesma coisa.
 */

import Link from "next/link";
import { FichaDoCliente } from "./FichaDoCliente";

export const dynamic = "force-dynamic";

export default async function AdminRestaurantFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="min-h-full space-y-4 bg-white px-4 py-6 sm:px-8">
      <Link href="/admin/restaurants" className="inline-block text-sm text-gray-500 hover:text-gray-900">
        ← Restaurantes
      </Link>
      <FichaDoCliente restaurantId={id} />
    </div>
  );
}
