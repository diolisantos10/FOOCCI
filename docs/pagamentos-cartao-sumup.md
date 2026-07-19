# Cartão de crédito no app — SumUp (checkout transparente)

Pagamento de cartão **dentro do app**, sem o cliente sair da tela. Arquitetura
**multi-operadora**: Pix roda no Mercado Pago e cartão no SumUp, de forma
invisível pro cliente (ele vê sempre a tela do Foocci).

## Como ligar (1 vez)

1. **No painel do SumUp** (developer.sumup.com):
   - **API key (secret)** — em *Configurações para programadores → Chaves de API*
     (começa com `sup_sk_...`). Precisa de permissão de pagamentos.
   - **Merchant code** — no *Perfil da conta* (código do comerciante).
2. **No Foocci**: `Integrações → SumUp` →
   - Ambiente: **Produção**
   - Cola a **API key** e o **Merchant code**
   - **Parcelas máximas**: à vista (1x) ou até 12x — sua escolha
   - **Salvar** → **Testar conexão**
3. Pronto: a opção **"Cartão de crédito"** passa a aparecer no checkout do
   cliente, em "Pagar agora", ao lado do Pix.

> Enquanto o SumUp não estiver ativo, a opção de cartão **não aparece** — o
> fluxo de Pix/dinheiro fica exatamente como está hoje.

## Como funciona (fluxo)

1. Cliente escolhe **Cartão de crédito** → o pedido é criado e o servidor abre
   um **checkout no SumUp** (`POST /v0.1/checkouts`).
2. O **widget do SumUp** é montado no app; o cliente digita o cartão **dentro de
   um iframe do SumUp** (3D Secure incluso). **O número do cartão nunca passa
   pelo servidor do Foocci** (fora do escopo PCI).
3. Ao aprovar, o servidor **re-verifica no SumUp** (`GET /v0.1/checkouts/{id}`)
   antes de marcar o pedido como pago — o "sucesso" reportado pelo navegador
   **não** é confiado sozinho.
4. Pedido confirmado → imprime comanda, baixa cupom/carteira, sincroniza CRM
   (mesmos efeitos do Pix).

## Webhook (opcional — reforço)

O fluxo já funciona **sem** webhook (confirmação é feita pelo servidor no passo
3). Para reforço assíncrono, registre no painel do SumUp:

```
https://foocci.com.br/api/payments/sumup/webhook
```

O webhook é apenas um gatilho: o servidor **sempre re-verifica** o checkout na
API do SumUp antes de confirmar, então um webhook forjado não confirma pedido
não pago.

## Trocar a operadora depois

O roteamento é por método (`src/services/payment/PaymentRouter.ts`):
`resolvePixProvider` (Mercado Pago) e `resolveCardProvider` (SumUp). Plugar uma
nova operadora = adicionar um provider e apontar o método — sem mexer no resto.

## Arquivos principais

- `src/lib/sumup.ts` — cliente da API do SumUp (checkout + verificação)
- `src/services/payment/providers/SumUpProvider.ts` — operadora de cartão
- `src/services/payment/PaymentRouter.ts` — roteamento por método
- `src/services/payment/confirmCardPayment.ts` — confirmação (re-verifica + marca pago)
- `src/app/api/pedido/[slug]/finalize/route.ts` — cria o checkout (`onlineMethod: "card"`)
- `src/app/api/pedido/[slug]/card/confirm/route.ts` — confirma (chamado pelo widget)
- `src/app/api/payments/sumup/webhook/route.ts` — webhook (reforço)
- `src/app/pedido/[slug]/PedidoClient.tsx` — opção de cartão + widget (stage `CARD_FORM`)
