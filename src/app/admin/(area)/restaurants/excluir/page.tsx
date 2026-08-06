/**
 * Admin → Restaurantes → Excluir — a única porta por onde um restaurante sai.
 *
 * POR QUE ESTA TELA EXISTE, e não um comando:
 * a máquina da purga (`RestaurantPurgeService`) já estava pronta e testada desde
 * 06/08, e mesmo assim a exclusão era IMPOSSÍVEL de executar — de propósito. O
 * `executarPurga` exige o sha256 de uma exportação recém-baixada, e essa
 * exportação carrega nome, telefone, endereço e conversa de cliente. O único
 * caminho automatizado que existia (`scripts/purgar-restaurante.mjs`) recusa
 * rodar dentro do GitHub Actions justamente porque o log daquele lugar é público.
 *
 * Ou seja: a rede de segurança não podia existir em lugar nenhum que já
 * tivéssemos — em CI ela virava o próprio vazamento. **No navegador de quem
 * decide, não.** O arquivo desce para a máquina dele e para por ali.
 *
 * POR QUE AQUI, e não numa entrada nova do menu: `/admin/restaurants` já é a casa
 * dos restaurantes. Esta é uma sub-tela dela, alcançada por um link discreto no
 * cabeçalho da lista — o menu lateral continua com uma porta só, e o item
 * "Restaurantes" segue aceso (o realce é `pathname.startsWith`).
 *
 * O QUE ESTE ARQUIVO FAZ DE FATO: lê no servidor as duas verdades que a tela não
 * pode adivinhar — o estado do interruptor de ambiente e a lista de protegidos —
 * e entrega para o cliente. Sem isso, a tela só descobriria o interruptor
 * desligado depois de o CEO clicar em apagar e receber um erro seco.
 */

import Link from "next/link";
import { purgaHabilitada } from "@/services/restaurant/RestaurantPurgeService";
import { SLUGS_PROTEGIDOS } from "@/services/restaurant/restaurantPurgeMap";
import { ExcluirRestauranteClient } from "./ExcluirRestauranteClient";

export const dynamic = "force-dynamic";

export default function AdminExcluirRestaurantePage() {
  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <Link
            href="/admin/restaurants"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-600 hover:text-brand-700"
          >
            ← Restaurantes
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            Excluir restaurante
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink2">
            Quatro passos, nesta ordem: olhar os números, contar o que sairia, baixar o backup e
            só então apagar. Um restaurante por vez. Os três primeiros passos não mudam nada no
            banco.
          </p>
        </header>

        <ExcluirRestauranteClient
          interruptorLigado={purgaHabilitada()}
          protegidos={[...SLUGS_PROTEGIDOS]}
        />
      </div>
    </div>
  );
}
