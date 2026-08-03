/**
 * Admin → Assinaturas: a carteira de clientes pagantes da Foocci.
 *
 * O fluxo de compra V1 (assistido) opera daqui: criar a assinatura fechada no
 * WhatsApp, copiar o link de aceite, acompanhar status e a fila de NFS-e.
 */

import { AssinaturasClient } from "./AssinaturasClient";

export const dynamic = "force-dynamic";

export default function AdminAssinaturasPage() {
  return <AssinaturasClient />;
}
