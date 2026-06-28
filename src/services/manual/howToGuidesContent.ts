/**
 * Lojista-facing how-to guides — the owner manual that powers the in-app help
 * assistant (RAG). Unlike the internal "Bíblia do Foocci" chapters (product
 * rules for the team), these are plain step-by-step guides written for the
 * restaurant owner, grounded in the real UI labels of the app.
 *
 * Seeded as published + agent-visible chapters (slug prefix "guia-") so the
 * help chat can answer with them immediately. Re-running the seed updates them.
 */

import type { ManualArea } from "@prisma/client";

export interface HowToGuide {
  slug: string;
  title: string;
  area: ManualArea;
  description: string;
  content: string;
}

export const HOW_TO_GUIDES: HowToGuide[] = [
  {
    slug: "guia-cadastrar-produto",
    title: "Como cadastrar um produto no cardápio",
    area: "UI_UX",
    description: "Criar categorias, adicionar produtos, variações e adicionais.",
    content: `# Como cadastrar um produto no cardápio

Vá no menu lateral em **Vendas → Cardápio**.

## 1. Crie a categoria (se ainda não tiver)
1. Clique em **+ Nova categoria**.
2. Preencha o **Nome** (ex: Pizzas, Bebidas) e, se quiser, a Descrição.
3. Clique em **Criar categoria**.

## 2. Adicione o produto
1. Clique em **+ Novo Produto**.
2. Escolha a **Categoria**, preencha **Nome** e **Preço** (campos obrigatórios).
3. Opcional: **Descrição do produto**, **Imagem** (JPG, PNG ou WebP, até 5 MB) e os canais **Delivery** e **QR Salão**.
4. Clique em **Criar produto**.

> Dica rápida: no rodapé de cada categoria há um **+ Adicionar item** para criar produtos só com nome e preço.

## 3. Variações, opções e adicionais (opcional)
Clique no produto para abrir **Editar item** e use as seções:
- **Variantes** — tamanhos/sabores com preço diferente (ex: 350ml, Grande). Ligue **Ativar** e use **+ Adicionar variante**.
- **Grupos de opções** — escolhas obrigatórias ou combos (**+ Adicionar grupo de opções**).
- **Adicionais** — extras como "Queijo extra" (**+ Adicionar adicional**).

Clique em **Salvar alterações**.

## 4. Disponibilidade e remoção
- Na linha do produto, use o **toggle de disponibilidade** para mostrar/ocultar, e os toggles **Delivery** e **Salão** por canal.
- Para apagar, abra o produto e clique em **Excluir produto**.`,
  },
  {
    slug: "guia-conectar-whatsapp",
    title: "Como conectar o WhatsApp",
    area: "WHATSAPP",
    description: "Conectar o número do restaurante via QR Code.",
    content: `# Como conectar o WhatsApp

Vá no menu lateral em **Integrações** e abra o cartão do **WhatsApp**.

1. Clique em **Conectar WhatsApp**.
2. Aguarde alguns segundos enquanto o QR Code é gerado (cerca de 5–10s — não feche a página).
3. Quando aparecer **"Escaneie com o WhatsApp do restaurante"**, no celular:
   1. Abra o **WhatsApp** no celular.
   2. Toque em **Configurações → Aparelhos conectados**.
   3. Toque em **Conectar aparelho** e aponte para o QR Code da tela.
4. Quando o status mudar para **Conectado**, está pronto.

- Se o QR expirar, clique em **Atualizar QR Code**.
- Para trocar de número, use **Reconectar**; para encerrar, **Desconectar**.

> O WhatsApp conectado é o que o atendimento e os agentes usam para falar com seus clientes.`,
  },
  {
    slug: "guia-acompanhar-pedidos",
    title: "Como acompanhar e gerenciar pedidos",
    area: "GENERAL",
    description: "Ver pedidos que chegam e avançar o status até a entrega.",
    content: `# Como acompanhar e gerenciar pedidos

Vá no menu lateral em **Vendas → Pedidos**.

## Status de um pedido
O pedido caminha por estes status: **Novo → Confirmado → Preparando → Pronto → Em entrega → Entregue** (ou **Cancelado**). Pedidos por Pix podem aparecer como **Aguardando Pix**.

## Avançar um pedido
Em cada cartão, clique no botão da próxima etapa:
1. **Confirmar** (de Novo para Confirmado)
2. **Preparar** (para Preparando)
3. **Pronto** (para Pronto)
4. **Despachar** (para Em entrega — só delivery)
5. **Entregue** (finaliza)

Para cancelar, use **Cancelar** (não disponível em pedidos já entregues/cancelados).

## Encontrar e organizar
- Filtros rápidos no topo: **Todos**, **Novos**, **Preparando**, **Pronto**, **Atrasados**.
- Busque por **cliente ou nº do pedido** no campo de busca.
- **🖨️ Imprimir** gera a comanda; **💬 Conversa** abre o chat ligado ao pedido.
- **+ Pedido manual** cria um pedido na mão.

> Quando um pedido novo chega, aparece a janela **NOVO PEDIDO!** com **✓ Aceitar pedido** ou **Recusar pedido**.`,
  },
  {
    slug: "guia-configurar-pagamentos",
    title: "Como configurar as formas de pagamento",
    area: "PAYMENTS",
    description: "Ativar Pix, dinheiro, cartão e cobrança online.",
    content: `# Como configurar as formas de pagamento

Vá no menu lateral em **Configurações → Pagamentos**.

## Métodos aceitos
Ligue/desligue cada método conforme o que você aceita:
- **⚡ Pix** — transferência instantânea (recomendado para delivery).
- **💵 Dinheiro** — pagamento em espécie na entrega/retirada.
- **💳 Cartão (maquininha)** — crédito/débito na entrega.
- **🔗 Link de pagamento** — cobrança online via link (requer integração).

Clique em **Salvar**.

## Receber Pix online (Mercado Pago)
Para gerar o Pix automaticamente no checkout:
1. Vá em **Integrações** e abra o cartão **Mercado Pago**.
2. Em **Ambiente**, escolha **Produção** (ou **Teste** para experimentar).
3. Cole o **Access Token** (no painel do Mercado Pago em Credenciais → Access Token).
4. Clique em **Salvar**.

> No momento, o Pix do Mercado Pago é o método online liberado; cartão e demais virão em breve.`,
  },
  {
    slug: "guia-criar-campanha-crm",
    title: "Como criar uma campanha / promoção no CRM",
    area: "CRM",
    description: "Enviar mensagens e promoções para grupos de clientes.",
    content: `# Como criar uma campanha / promoção no CRM

Vá no menu lateral em **Marketing → CRM** e abra a aba **Campanhas**.

1. Escolha um modelo pronto (ex: **🥶 Recuperar clientes frios**, **🌡️ Reativar clientes mornos**, **🔁 Garantir a segunda compra**).
2. Dê um **Nome da campanha** (ex: "Reativação frios — PROMO10").
3. Confira o **Segmento alvo** (já vem preenchido pelo modelo) e o **Público estimado**.
4. Edite a **Mensagem sugerida**. Você pode inserir variáveis: **{nome}**, **{restaurante}**, **{ultimo_pedido}**, **{produto_favorito}**.
5. Opcional: informe um **Cupom vinculado** (ex: PROMO10) para medir o resultado.
6. Escolha o tipo de envio:
   - **Envio único** — manda agora para todos do segmento.
   - **Agendada** — escolha **Data** e **Hora**.
   - **Recorrente** — dias da semana, janela de horário e limite diário.
7. Clique em **Enviar** / **Agendar** / **Ativar recorrente** (ou **Salvar rascunho**).

> Em "Identidade & evitar repetição" você impede reenvio para quem já recebeu a mesma campanha.`,
  },
  {
    slug: "guia-area-entrega-taxas",
    title: "Como configurar a área de entrega e as taxas",
    area: "CHECKOUT",
    description: "Definir delivery, retirada, zonas e taxas de entrega.",
    content: `# Como configurar a área de entrega e as taxas

Vá no menu lateral em **Configurações → Delivery**.

## 1. Modalidades
Ligue o que você oferece: **Delivery ativo** e/ou **Retirada no balcão ativa**.

## 2. Como cobrar a entrega
Com o Delivery ligado, escolha um modo:
- **Taxa fixa** — sempre o mesmo valor.
- **Por zonas** — taxas e tempos diferentes por distância/bairro.
- **Por distância** — calculada por km.
- **Manual** — frete combinado a cada pedido.

### Taxa fixa
Preencha **Taxa de entrega (R$)** (em branco = grátis), **Pedido mínimo (R$)**, **Tempo estimado (min)** e a **Área de cobertura**.

### Por zonas
Clique em **+ Adicionar zona** e preencha **Nome da zona**, **Distância máxima (km)**, **Tempo estimado**, **Taxa de entrega** e (opcional) **Pedido mínimo**. Cada zona pode ser editada, ativada/desativada ou removida.

## 3. Regras comerciais
Defina **Entrega grátis acima de (R$)** para incentivar pedidos maiores.

## 4. Teste antes de salvar
Use o **Simulador de entrega**: informe a distância e o valor do pedido e clique em **Simular →**.

Clique em **Salvar**.`,
  },
  {
    slug: "guia-horario-funcionamento",
    title: "Como definir o horário de funcionamento",
    area: "GENERAL",
    description: "Configurar os dias e horários em que a loja aceita pedidos.",
    content: `# Como definir o horário de funcionamento

Vá no menu lateral em **Configurações → Operação**, seção **Horário de funcionamento**.

1. Use os botões dos dias (**Dom, Seg, Ter, Qua, Qui, Sex, Sáb**) para abrir/fechar cada dia.
2. Em cada dia aberto, defina o horário de início e o **até** (fim).
3. Tem intervalo (ex: almoço e jantar)? Clique em **+ Adicionar período** para criar mais de uma faixa no mesmo dia.
4. Para repetir a configuração de um dia nos dias úteis, use o link **copiar**.
5. Clique em **Salvar**.

> Exemplo: almoço 11h–15h e jantar 18h–23h = dois períodos no mesmo dia. Dias sem horário aparecem como **Fechado**.`,
  },
  {
    slug: "guia-pausar-pedidos",
    title: "Como pausar os pedidos (emergência)",
    area: "GENERAL",
    description: "Bloquear novos pedidos temporariamente e reativar.",
    content: `# Como pausar os pedidos (emergência)

O botão fica no **topo da tela** (canto superior direito), visível para Dono e Gerente.

## Pausar
1. Clique em **Pausar pedidos**.
2. Escolha o **Motivo** (ex: "Alta demanda — cozinha sobrecarregada", "Falta de ingredientes"…).
3. Em **Retomar automaticamente**, escolha **1 hora**, **2 horas**, **3 horas**, **Tempo personalizado** ou **Indefinido (manual)**.
4. Clique em **Pausar agora**.

Enquanto pausado, todos os canais (cardápio online e WhatsApp) bloqueiam novos pedidos imediatamente, e o topo mostra **Pausado até HH:MM** (ou "Pedidos pausados").

## Reativar
Clique em **Reativar** no indicador do topo para voltar a aceitar pedidos na hora.`,
  },
  {
    slug: "guia-personalizar-marca",
    title: "Como personalizar a marca (logo, nome e cores)",
    area: "BRANDING",
    description: "Definir logomarca, identidade e cores do restaurante.",
    content: `# Como personalizar a marca (logo, nome e cores)

Vá no menu lateral em **Marketing → Marca**.

## Logomarca
No cartão **Logomarca do restaurante**, clique em **Fazer upload** (ou **Trocar logo**). Aceita JPEG, PNG ou WebP, até 5 MB.

## Identidade da marca
Preencha **Nome da marca**, **Público principal**, **Descrição curta** e, se quiser, a **História da marca** (ajuda a IA a comunicar com a sua cara).

## Posicionamento e voz
Defina **Tipo de restaurante**, **Nível de preço** e **Objetivo principal**, o **Tom de voz** e a **Personalidade** do assistente.

## Identidade visual (cores)
No cartão **Identidade Visual**, escolha a **Cor principal** e a **Cor secundária** — elas são aplicadas no cardápio digital e nas comunicações.

Ao final, clique em **Salvar persona da marca**.`,
  },
];
