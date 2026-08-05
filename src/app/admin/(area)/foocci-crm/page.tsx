/**
 * /admin/foocci-crm — O CRM DA FOOCCI.
 *
 * A base de prospects da própria Foocci: donos de restaurante capturados pelo
 * site e pelas campanhas de tráfego. É daqui que o agente SDR vai trabalhar.
 *
 * ⚠️ NÃO É O CRM DO PRODUTO. O CRM que o lojista usa (`/crm`) é dele, sobre os
 * clientes que comem no restaurante dele, e é multi-tenant. Este aqui é da
 * Foocci, sobre os clientes DELA, e não tem tenant nenhum. Bases separadas por
 * construção — ver `src/services/foocci-crm/foocciCrmFunnel.ts`.
 *
 * Client component: a tela tem filtro de período, funil, base e gaveta de
 * contato, tudo interativo. Os dados vêm de `/api/admin/foocci-crm/**`, que são
 * rotas com guarda de admin — dado pessoal não sai por rota pública.
 */

import { FoocciCrmClient } from "./FoocciCrmClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "CRM da Foocci" };

export default function AdminFoocciCrmPage() {
  return <FoocciCrmClient />;
}
