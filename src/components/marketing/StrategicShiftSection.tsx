/**
 * Strategic shift. Server component.
 * Positions Foocci as strengthening direct channels — not attacking marketplaces.
 */

export function StrategicShiftSection() {
  return (
    <section className="bg-white py-20">
      <div className="mx-auto max-w-3xl px-5 text-center lg:px-8">
        <h2 className="text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
          Pedido direto não cresce só com link. Cresce com experiência.
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-gray-600">
          Ter um cardápio online é só o começo. O restaurante que quer vender mais
          precisa conduzir o cliente, entender seu histórico e manter relacionamento
          depois da compra.
        </p>

        <figure className="mx-auto mt-10 max-w-xl rounded-2xl border border-gray-200 bg-gray-50 px-6 py-6">
          <blockquote className="text-lg font-semibold text-[#0B0B0B]">
            “Marketplace entrega pedido.{" "}
            <span className="text-brand-500">Relacionamento constrói cliente.</span>”
          </blockquote>
          <figcaption className="mt-3 text-sm text-gray-500">
            A Foocci fortalece os seus canais diretos para você vender mais com margem.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
