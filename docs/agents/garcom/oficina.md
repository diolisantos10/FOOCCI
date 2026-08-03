# Oficina — garçom (corrente)

> Append-only. O agente escreve aqui; a vitrine é promovida pelo Diretor.

---

2026-08-03 — **sushi-cazza: número reconhecido sem nome + "Comprar novamente"
ausente.** Investigação somente-leitura (despachada pelo Diretor). Causa comum
provável: `findFirst` por `phoneCandidates` **sem `orderBy`** em 4+ pontos
(`pedido/[slug]/page.tsx`, `api/qr/[slug]/identify`, `whatsapp-session`,
`RepeatOrderService.resolveCustomerId`) resolvia cadastro duplicado pré-fix do
9º dígito — a duplicata vazia que o comentário de `src/lib/phone.ts` já
descrevia; o fix dos candidatos simetrizou a busca mas não priorizou o cadastro
rico. Nome-fantasma (`name = telefone`, criado por upserts antigos em
`page.tsx` e `WebhookProcessorService.ts`) e nome vazio (`"".split()[0]` devolve
`""`, não `null`) produzem o sintoma do nome sem quebrar nada visível. Gates do
"Comprar novamente" que permanecem por construção: status do pedido ∈
{CONFIRMED…DELIVERED}, item vivo no cardápio, item com option group obrigatório
é dropado em silêncio (só conta em `unavailableCount`, que ninguém exibe).
Correção aplicada pelo Diretor na mesma sessão: `CUSTOMER_LOOKUP_ORDER` +
`customerFirstName` em `src/lib/phone.ts`, aplicados nos 5 lookups; rotas de
identify agora corrigem cadastro fantasma quando o cliente informa o nome real.
