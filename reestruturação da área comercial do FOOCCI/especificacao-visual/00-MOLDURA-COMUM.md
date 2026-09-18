# A moldura comum das telas — lida direto dos desenhos do CEO (18/09/2026)

> As imagens chegaram no chat, não no repositório. Este documento é a leitura
> literal delas, feita pelo Diretor Geral, para servir de régua a quem constrói.
> **Onde o desenho e a nossa realidade divergem, a regra é a do CEO:**
> *"sigo os dashboards com possibilidade de pequenos ajustes, ele precisa ser
> adaptado para nossa realidade, mas sem perder o design."*

## A regra da adaptação

O desenho manda. A adaptação é pequena, e só quando a nossa realidade não
comporta o que a tela pede. **Três saídas, nesta ordem de preferência:**

1. **Tem o dado equivalente** → usa o nosso, mantém o lugar no layout.
2. **Não tem o dado** → mantém o cartão e escreve **"não medido" com o motivo**.
3. **O elemento é um ATO que não existe** (botão que enviaria mensagem numa tela
   só-leitura) → **não desenha o botão**. Botão que não faz nada ensina a
   operação a contar com o que não existe.

⛔ **Nunca**: apagar o cartão para a tela ficar bonita, nem inventar número para
preencher. Zero no lugar de "não sei" é mentira com cara de exatidão.

## Cabeçalho (todas as telas)

- Barra superior escura (azul-marinho quase preto), altura ~64px.
- À esquerda: ícone redondo verde do WhatsApp + **"Atendimento & Vendas WhatsApp"**
  em branco, negrito, e a linha fina embaixo: *"Mais conversas. Mais vendas."*
- Ao centro: campo de busca claro, arredondado, largo, com lupa e o texto
  *"Buscar leads, conversas ou vendas..."*, com o atalho **Ctrl + K** à direita.
- À direita: sino com contador vermelho, e o bloco da pessoa (foto redonda, nome
  em negrito, cargo abaixo em cinza) com uma seta de menu.

**Adaptação nossa:** o nome do produto é o do FOOCCI, não "Atendimento & Vendas
WhatsApp". O bloco da pessoa usa a sessão real. O atalho Ctrl+K só entra se a
busca existir de verdade.

## Barra lateral esquerda (todas as telas)

Fundo branco, ~230px, itens com ícone + rótulo, o item ativo em pílula azul
clara com o texto azul. A ordem do desenho:

`Painel · Prospecção · SDR · Atendimento (com badge 12) · Leads · Vendas · CRM ·
Automações · Campanhas · Relatórios · Configurações`

No rodapé da lateral, um cartão verde-claro: **"Plano Profissional"**,
*200.000 conversas/mês*, barra de progresso, *142.315 utilizadas · 71%*, e o
botão **"Gerenciar plano"**.

**Adaptação nossa:** a nossa área comercial não vende por cota de conversas e
não existe esse dado. O cartão de plano **não se inventa**. Duas saídas aceitas:
(a) ocupar o lugar com o estado real da operação (ex.: teto diário de mensagens
do dia — *de quantos eu podia, quantos mandei*), que é dado que passamos a ter;
ou (b) não desenhar o bloco. **Preferir (a)**: mantém o peso visual do rodapé e
diz uma verdade útil.

## Título da página (todas as telas)

- Linha fina de contexto acima quando houver (ex.: *"Bem-vindo, Carlos!"*).
- **Título grande em negrito**, e abaixo uma linha cinza de uma frase dizendo
  para que a tela serve.
- À direita, dois seletores arredondados brancos com borda: um de **data**
  (ícone de calendário, ex.: *"Hoje, 20 de mai. de 2025"*) e um de **período ou
  atualidade** (ex.: *"Tempo real"* com bolinha verde, ou *"Últimos 30 dias"*).

## Fila de cartões de indicador (o padrão que se repete)

Linha de 5 a 6 cartões brancos, borda fina, cantos arredondados, sombra leve.
Cada cartão: **quadrado colorido com ícone à esquerda** (cor por tema), e à
direita o rótulo pequeno em cinza, o **número grande em negrito**, e embaixo a
variação: seta ↑/↓ colorida + percentual + *"vs. ontem"* em cinza.

**Adaptação nossa, obrigatória:** já está medido que comparação com base zero
não vira porcentagem — escrever *"sem base ontem para comparar (hoje: 3)"*.
Indicador sem fonte de dado mostra **"não medido" e o motivo**, nunca 0.

## Corpo

Grade de três colunas, com a coluna da direita mais estreita reservada à IA
(copiloto, diagnóstico, sugestões), em cartão com título e ícone de faísca.
Blocos brancos, títulos em negrito, tabelas com cabeçalho cinza claro,
etiquetas de estado em pílulas coloridas (verde, âmbar, vermelho, azul).

**Paleta lida:** azul (#2563eb) para ação e seleção, verde para bom e para
WhatsApp, âmbar para atenção, vermelho para risco, roxo para IA. Fundo da
página cinza muito claro; cartões brancos.

**Como isto vira código nesta casa:** os tokens semânticos que já existem
(`bg-canvas`, `bg-paper`, `border-line`, `text-ink`, `text-ink2`, `text-muted`).
Não trazer paleta nova por fora dos tokens.
