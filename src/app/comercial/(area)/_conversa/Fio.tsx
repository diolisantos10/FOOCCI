"use client";

/**
 * ⭐ O FIO DA CONVERSA — uma peça só, para as duas telas do menu Atendimento.
 *
 * ── POR QUE ISTO SAIU DE DENTRO DE `conversas/AtendimentoClient.tsx` ────────
 *
 * As balas de mídia (imagem, áudio, vídeo, documento) foram consertadas em
 * 19/09/2026, depois de o CEO ver três caixas vazias no lugar do que o cliente
 * mandou. A Central de Atendimento (tela 03) mostra o MESMO fio. Copiar o
 * componente para lá garantiria que o próximo conserto entrasse em um dos dois
 * arquivos e não no outro — e o defeito voltaria pela metade, que é pior do que
 * voltar inteiro, porque ninguém repara.
 *
 * Escrito uma vez aqui, as duas telas não podem divergir.
 *
 * ⚠️ Pasta com `_`: o Next não cria rota a partir dela.
 *
 * ⛔ Este arquivo NÃO envia nada. Ele desenha o que já foi registrado. O envio
 * mora no rodapé de cada tela, no botão que uma pessoa aperta.
 */

import { useState } from "react";
import type { MensagemNaTela } from "@/services/salaDeVendas/conversa";
import {
  rotuloDoNaoSuportado,
  rotuloDeMidiaQueNaoAbriu,
} from "@/services/salaDeVendas/rotuloDeMidia";
import { hora } from "../conversas/_dados";

function cx(...p: Array<string | false | null | undefined>): string {
  return p.filter(Boolean).join(" ");
}

/**
 * ⭐ O CARTÃO DE LINK DE PAGAMENTO — o que o desenho 05 pede dentro do fio.
 *
 * ── E de onde ele sai, já que não existe "tipo: LINK" em `LeadMensagem` ─────
 *
 * Sai do **texto que nós mesmos enviamos**. `checkoutDaProposta.ts` monta a
 * proposta com a linha *"Para contratar, é por aqui: <link>"*, e é esse link
 * que o cliente recebe. O cartão é a leitura dessa mensagem real — **não é
 * dado novo, e não é dado inventado**: se a mensagem não tem link, não há
 * cartão.
 *
 * ⚠️ Só em mensagem de SAÍDA. Um link colado pelo cliente não é nosso checkout,
 * e pintá-lo de "link de pagamento" ensinaria o vendedor a clicar em URL de
 * terceiro com cara de coisa da casa.
 */
const ACHAR_URL = /https?:\/\/[^\s<>"')]+/i;

export function linkDePagamentoDe(m: MensagemNaTela): string | null {
  if (m.direcao !== "SAIDA") return null;
  const texto = m.texto ?? m.legenda ?? "";
  if (!/contratar|pagamento|assinatura|checkout/i.test(texto)) return null;
  const achado = ACHAR_URL.exec(texto);
  return achado ? achado[0] : null;
}

function CartaoDeLinkDePagamento({ link }: { link: string }) {
  let endereco = link;
  try {
    endereco = new URL(link).host + new URL(link).pathname;
  } catch {
    // URL malformada continua sendo o que foi enviado. Mostrar o texto cru é
    // mais honesto do que esconder a linha que o cliente recebeu.
  }

  return (
    <a
      href={link}
      target="_blank"
      rel="noreferrer"
      className="mb-1.5 flex items-center gap-2 rounded-xl border border-line bg-paper px-2.5 py-2 transition-colors hover:bg-canvas"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none"
          stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
          <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-semibold leading-tight text-ink">
          Link de pagamento
        </span>
        <span className="block truncate text-[11.5px] leading-tight text-muted">{endereco}</span>
      </span>
    </a>
  );
}

/**
 * O ARQUIVO QUE O CLIENTE MANDOU, na bolha.
 *
 * 🔒 O `src` é a rota autenticada da Sala, pedindo pelo ID DA MENSAGEM. Não é a
 * url da Meta, e não leva token: a url da Meta é temporária e autenticada, e
 * colocá-la aqui vazaria a credencial para a rede do navegador. Quem confere se
 * esta conversa é sua é o servidor, a cada pedido.
 *
 * ⚠️ `onError` existe porque a Meta EXPIRA a mídia. Uma imagem quebrada com o
 * ícone padrão do navegador faria o vendedor achar que o sistema perdeu a
 * mensagem; o rótulo diz que o arquivo existe e que o download falhou, que é
 * outra coisa e é verdade.
 */
export function AnexoDoCliente({ m }: { m: MensagemNaTela }) {
  const [falhou, setFalhou] = useState(false);

  if (!m.temMidia) return null;

  const src = `/api/admin/sala-de-vendas/conversa/midia/${m.id}`;

  if (falhou) {
    return <p className="italic text-muted">{rotuloDeMidiaQueNaoAbriu(m.tipo, m.midiaNome)}</p>;
  }

  if (m.tipo === "IMAGEM") {
    return (
      <a href={src} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={m.legenda ?? "Imagem enviada pelo cliente"}
          onError={() => setFalhou(true)}
          className="mb-1 max-h-72 w-full rounded-lg object-contain"
        />
      </a>
    );
  }

  if (m.tipo === "AUDIO") {
    return (
      <audio controls src={src} onError={() => setFalhou(true)} className="mb-1 w-full max-w-[16rem]">
        {rotuloDeMidiaQueNaoAbriu(m.tipo, m.midiaNome)}
      </audio>
    );
  }

  if (m.tipo === "VIDEO") {
    return (
      <video controls src={src} onError={() => setFalhou(true)} className="mb-1 max-h-72 w-full rounded-lg" />
    );
  }

  // Documento e qualquer outro arquivo: nome + link. Não se tenta renderizar um
  // PDF na bolha — o navegador já sabe fazer isso melhor numa aba.
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="mb-1 flex items-center gap-1.5 rounded-lg border border-line bg-chip px-2 py-1.5 text-[12.5px] underline"
    >
      📎 {m.midiaNome ?? "Arquivo enviado pelo cliente"}
    </a>
  );
}

/**
 * O rótulo de quando NÃO HÁ arquivo para mostrar.
 *
 * "📦 Conteúdo não suportado" não informava ninguém. O rótulo diz o que é e por
 * que não aparece — e vem do mesmo módulo que o servidor usa na lista, para as
 * duas telas nunca contarem histórias diferentes.
 */
export function descricaoDaMidia(m: MensagemNaTela): string {
  switch (m.tipo) {
    case "AUDIO": return "🎤 Áudio — o arquivo não foi guardado por nós";
    case "IMAGEM": return "🖼️ Imagem — o arquivo não foi guardado por nós";
    case "VIDEO": return "🎬 Vídeo — o arquivo não foi guardado por nós";
    case "DOCUMENTO":
      return m.midiaNome
        ? `📎 ${m.midiaNome}`
        : "📎 Documento — o arquivo não foi guardado por nós";
    case "NAO_SUPORTADO": return rotuloDoNaoSuportado(m.tipoCru);
    default: return rotuloDoNaoSuportado(m.tipoCru);
  }
}

export function MarcaDeEntrega({ status }: { status: string }) {
  switch (status) {
    case "PENDENTE": return <span title="Registrada, não enviada">◷</span>;
    case "ENVIADA": return <span title="Enviada">✓</span>;
    case "ENTREGUE": return <span title="Entregue">✓✓</span>;
    case "LIDA": return <span className="text-sky-600" title="Lida">✓✓</span>;
    case "FALHOU": return <span className="text-red-600" title="Falhou">!</span>;
    default: return null;
  }
}

export function Bolha({ m }: { m: MensagemNaTela }) {
  const daFoocci = m.direcao === "SAIDA";
  const link = linkDePagamentoDe(m);

  return (
    <li className={cx("flex", daFoocci ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[85%] rounded-2xl px-3 py-2 text-[13.5px] leading-relaxed sm:max-w-[70%]",
          daFoocci
            ? "rounded-br-sm bg-brand-50 text-ink"
            : "rounded-bl-sm border border-line bg-paper text-ink",
        )}
      >
        {/* ⭐ A MÍDIA VEM ANTES DO TEXTO, porque é ela o que o cliente mandou:
            a legenda é comentário sobre a foto, não a mensagem. */}
        <AnexoDoCliente m={m} />

        {link && <CartaoDeLinkDePagamento link={link} />}

        {m.texto || m.legenda ? (
          <p className="whitespace-pre-wrap break-words">{m.texto ?? m.legenda}</p>
        ) : m.temMidia ? null : (
          <p className="italic text-muted">{descricaoDaMidia(m)}</p>
        )}

        <div className="mt-1 flex items-center justify-end gap-1.5 text-[10.5px] text-muted">
          {daFoocci && m.autor && (
            <span>{m.autor === "IA" ? "IA" : (m.autorNome ?? "equipe")}</span>
          )}
          <span>{hora(m.ocorreuEm)}</span>
          {daFoocci && <MarcaDeEntrega status={m.status} />}
        </div>

        {/* A falha aparece na própria bolha. Uma mensagem que não chegou e se
            parece com uma que chegou faz o vendedor esperar resposta que não vem. */}
        {m.status === "FALHOU" && (
          <p className="mt-1 rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">
            Não foi entregue{m.erro ? `: ${m.erro}` : ""}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * O aviso da janela de 24h.
 *
 * Ele existe porque, sem ele, o vendedor digita a mensagem, aperta enviar e
 * recebe um erro de API que não explica nada. A informação precisa chegar ANTES
 * de ele escrever.
 */
export function AvisoDaJanela({ janela }: { janela: { aberta: boolean; motivo?: string } }) {
  if (janela.aberta) return null;

  return (
    <p className="mb-2 rounded-lg bg-canvas px-2.5 py-1.5 text-[12.5px] text-ink2">
      {janela.motivo === "nuncaFalou"
        ? "Esta pessoa ainda não escreveu. Pelas regras da Meta, o primeiro contato exige modelo aprovado."
        : "A janela de 24 horas fechou. Fora dela, só sai modelo aprovado pela Meta."}
    </p>
  );
}
