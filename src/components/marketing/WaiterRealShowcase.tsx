/**
 * "O Garçom na prática" — /site/como-funciona.
 *
 * As CINCO TELAS REAIS do pedido pelo Garçom, capturadas pelo CEO no celular
 * (03/08/2026) e publicadas como imagem em /public/site/waiter. Edição feita
 * sob autorização expressa do CEO: nome do restaurante, logo e telefone do
 * cliente trocados ("Sushi da Vila" / "Diego"); todo o resto é o produto real —
 * inclusive a barra do navegador com foocci.com.br, que é a prova visual do
 * diferencial "sem baixar app".
 */

import { Eyebrow, PremiumCard } from "./premium";
import { AGENDAR_LABEL, AGENDAR_URL } from "./config";

const PASSOS = [
  {
    img: "/site/waiter/passo-1-abertura.png",
    titulo: "Chegou, foi reconhecido",
    copy: "O cliente abre pelo link ou QR e o Foocci já sabe quem ele é: saudação, cupons disponíveis e as promoções na frente.",
  },
  {
    img: "/site/waiter/passo-2-sugestao.png",
    titulo: "Pediu sugestão, ganhou sugestão",
    copy: "“Quero uma sugestão” — e o Garçom responde na hora, com pratos reais do cardápio, foto e preço.",
  },
  {
    img: "/site/waiter/passo-3-extras.png",
    titulo: "O Garçom vende mais",
    copy: "Antes de fechar, ele oferece bebidas, sobremesas e extras — o “mais alguma coisa?” que aumenta o tíquete, sem ser chato.",
  },
  {
    img: "/site/waiter/passo-4-pagamento.png",
    titulo: "Pagamento sem fricção",
    copy: "Pix na hora com QR Code, ou pagar na entrega/retirada — dinheiro, maquininha ou Pix. O cliente escolhe.",
  },
  {
    img: "/site/waiter/passo-5-confirmacao.png",
    titulo: "Confirmou, foi pra cozinha",
    copy: "Revisão clara do pedido, nome, forma de pagamento e previsão de tempo. Um toque e está confirmado.",
  },
];

const SEM_APP = [
  { titulo: "Sem baixar app", copy: "Tudo acontece no navegador — repare na barra de endereço das telas." },
  { titulo: "Sem ocupar memória", copy: "Nenhum download, nenhum ícone novo, nenhuma atualização pedindo espaço." },
  { titulo: "Sem criar conta", copy: "O cliente informa o WhatsApp uma vez e pronto — nas próximas, é reconhecido pelo nome." },
];

export function WaiterRealShowcase() {
  return (
    <section id="garcom-na-pratica" aria-labelledby="garcom-pratica-title" className="scroll-mt-20 bg-gray-50 py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>O Garçom na prática</Eyebrow>
          <h2 id="garcom-pratica-title" className="mt-3 text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
            O pedido inteiro, numa conversa. Estas telas são reais.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-gray-600">
            Do “oi” à confirmação em poucos minutos — capturado direto do celular,
            num restaurante operando no Foocci.
          </p>
        </div>

        {/* Filmstrip: as 5 telas em sequência, com rolagem própria */}
        <div className="-mx-5 mt-12 overflow-x-auto px-5 pb-4 lg:-mx-8 lg:px-8" style={{ scrollSnapType: "x proximity" }}>
          <div className="flex w-max gap-5 lg:gap-6">
            {PASSOS.map((p, i) => (
              <figure key={p.titulo} className="w-[240px] shrink-0 sm:w-[260px]" style={{ scrollSnapAlign: "center" }}>
                <div className="overflow-hidden rounded-[1.4rem] border border-gray-200 bg-white shadow-[0_18px_40px_-18px_rgba(120,72,20,0.35)]">
                  {/* Imagens já otimizadas na origem (660px) — <img> direto evita o
                      otimizador do Next segurar o carregamento do filmstrip. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.img}
                    alt={`Tela ${i + 1} do pedido pelo Garçom: ${p.titulo}`}
                    width={660}
                    height={1434}
                    loading={i === 0 ? "eager" : "lazy"}
                    className="h-auto w-full"
                  />
                </div>
                <figcaption className="mt-4 px-1">
                  <p className="text-sm font-semibold text-[#0B0B0B]">
                    <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                    {p.titulo}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{p.copy}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-gray-400 lg:hidden">Arraste para o lado para ver os 5 passos →</p>

        {/* Diferencial: zero app */}
        <PremiumCard className="mx-auto mt-14 max-w-4xl p-7 sm:p-9">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              A dor que o Foocci tira do seu cliente
            </span>
            <h3 className="mt-4 text-2xl font-semibold tracking-tight text-[#0B0B0B] sm:text-3xl">
              Ninguém quer baixar mais um app.
            </h3>
            <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-gray-600">
              Seu cliente não instala nada para pedir: abre o link, pede e paga
              pelo próprio navegador. Menos atrito na entrada é mais pedido no fim.
            </p>
          </div>
          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            {SEM_APP.map((s) => (
              <div key={s.titulo} className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 text-center">
                <p className="text-sm font-semibold text-[#0B0B0B]">{s.titulo}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{s.copy}</p>
              </div>
            ))}
          </div>
        </PremiumCard>

        <div className="mt-12 text-center">
          <a
            href={AGENDAR_URL}
            className="inline-flex items-center justify-center rounded-full bg-brand-500 px-7 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
          >
            Quero ver com o meu cardápio — {AGENDAR_LABEL.toLowerCase()}
          </a>
          <p className="mx-auto mt-6 max-w-2xl text-xs leading-relaxed text-gray-400">
            Telas reais do produto em produção, capturadas em 08/2026. Nome do
            restaurante e dados do cliente foram alterados para proteger a
            privacidade.
          </p>
        </div>
      </div>
    </section>
  );
}
