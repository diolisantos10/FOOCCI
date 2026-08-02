/**
 * Admin → Aplicativo Meta.
 *
 * The credentials of the ONE Foocci app inside Meta (`Foocci Whats`), which serves
 * WhatsApp and Instagram at the same time. Until now they existed only as Railway env
 * vars, so changing one meant a deploy plus someone with Railway access.
 *
 * The env vars remain the fallback: a value saved here overrides them, an empty screen
 * changes nothing. Shipping this cannot break a working deploy.
 */

import { MetaCredentialsClient } from "./MetaCredentialsClient";

export const dynamic = "force-dynamic";

export default function AdminMetaPage() {
  return <MetaCredentialsClient />;
}
