/**
 * Admin → Credenciais.
 *
 * O cofre onde o token do Railway (e o de qualquer outro serviço de infraestrutura)
 * fica guardado uma vez só. Pedido do CEO: "não aguento mais gerar token".
 *
 * O que esta tela pode mostrar de um token guardado: que ele existe, os 4 últimos
 * caracteres, quem salvou, quando, e se o serviço aceitou. Nada além disso — o valor
 * não volta do servidor em nenhuma resposta.
 */

import { InfraCredentialsClient } from "./InfraCredentialsClient";

export const dynamic = "force-dynamic";

export default function AdminCredenciaisPage() {
  return <InfraCredentialsClient />;
}
