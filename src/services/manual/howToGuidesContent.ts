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
    slug: "guia-whatsapp-oficial-meta",
    title: "Como conectar o WhatsApp oficial da Meta",
    area: "WHATSAPP",
    description: "Conectar o WhatsApp oficial (API da Meta) e escolher o número certo.",
    content: `# Como conectar o WhatsApp oficial da Meta

O **WhatsApp oficial da Meta** é a conexão pela API oficial (WhatsApp Cloud API). É mais estável, sem risco de bloqueio, e permite campanhas com **modelos aprovados**.

Vá em **Integrações → WhatsApp**, no cartão **"Conexão de WhatsApp"**, lado **"WhatsApp oficial da Meta"**.

## Passo a passo
1. Clique em **Conectar WhatsApp oficial da Meta**.
2. Faça login na **Meta** (Facebook) na janela que abrir.
3. Escolha o **Portfólio empresarial** e a **Conta do WhatsApp Business** do seu restaurante.
4. Escolha o **número** — use o **número real do restaurante**, não o de teste.
5. Aguarde aparecer **✓ Conectado** com o seu número.

## O número de teste (+1)
Todo aplicativo novo da Meta vem com um **número de teste** que começa com **+1** (ex.: +1 555...). Ele é criado automaticamente e serve só para testes — **não use ele** para atender clientes de verdade. Selecione sempre o **número real** (+55...).

## Trocar o número ou reconfigurar
Se conectou o número errado (ex.: o +1 de teste):
- No cartão da Meta, clique em **Reconfigurar / trocar número** para refazer o login e escolher outro número.
- Ou clique em **Desconectar** para remover e começar do zero.

> Um número só pode estar em **uma** conexão por vez. Se o número já é usado na conexão atual, veja o guia **"Como migrar seu número para a Meta oficial"**.`,
  },
  {
    slug: "guia-migrar-numero-meta",
    title: "Como migrar seu número para a Meta oficial",
    area: "WHATSAPP",
    description: "Passar o número do WhatsApp atual para a Meta oficial, sem susto.",
    content: `# Como migrar seu número para a Meta oficial

Para o **mesmo número** sair da conexão atual (WhatsApp comum) e ir para a **Meta oficial**, é preciso liberar o número. A Meta **não deixa** um número estar nos dois lugares ao mesmo tempo.

## ⚠️ Faça com o restaurante FECHADO
Durante a migração o WhatsApp fica **fora do ar** por alguns minutos. Faça na **madrugada / após o fechamento**, nunca no movimento.

## Passo a passo
1. **No Foocci:** em **Integrações → WhatsApp**, cartão **"WhatsApp atual"**, clique em **Desconectar e liberar número**.
2. **No celular do restaurante:** apague a conta do WhatsApp desse número — **WhatsApp Business → ⋮ → Configurações → Conta → Apagar minha conta** e confirme com o número.
   - Isso apaga só os dados **do app** (conversas, grupos). Você **não** perde a linha/chip, nem os dados do Foocci.
3. Aguarde **3 a 5 minutos**.
4. **Na tela da Meta:** peça o código de verificação. Se o **SMS não chegar**, escolha **verificação por LIGAÇÃO** (uma voz dita o código) — no Brasil funciona melhor que SMS.
5. Digite o código de 6 dígitos → número verificado.
6. Finalize no Foocci: **Usar como principal** e, se quiser campanhas pela Meta, ligue **Campanhas CRM via Meta**.

## Dicas importantes
- O **chip precisa estar num celular ligado e com sinal** para receber o código (SMS ou ligação).
- **Não peça o código muitas vezes seguidas** — a Meta bloqueia por cerca de 1 hora. Se bloquear, espere.
- Precisa do atendimento de volta rápido? Dá para **voltar para a conexão atual**: registre o número de novo no WhatsApp Business e reconecte pelo QR Code.`,
  },
  {
    slug: "guia-whatsapp-evolution-vs-meta",
    title: "WhatsApp atual x WhatsApp oficial da Meta: qual usar",
    area: "WHATSAPP",
    description: "Diferença entre as duas conexões de WhatsApp e quando usar cada uma.",
    content: `# WhatsApp atual x WhatsApp oficial da Meta

O Foocci trabalha com duas formas de conectar o WhatsApp. Em **Integrações → WhatsApp**, a etiqueta **"Em uso:"** mostra qual está ativa.

## WhatsApp atual (conexão via QR)
- Conecta como **aparelho conectado** (igual ao WhatsApp Web).
- **Convive** com o WhatsApp do celular — não precisa derrubar nada.
- Reconecta a qualquer hora, só escaneando o **QR Code**.
- Ideal para começar rápido.

## WhatsApp oficial da Meta (API oficial)
- Conexão **oficial** pela Meta (WhatsApp Cloud API).
- Mais **estável** e **sem risco de bloqueio**.
- Permite **campanhas com modelos aprovados** e limites maiores.
- O número passa a ser **exclusivo** da API (sai do app do celular).

## Qual escolher?
- Quer simplicidade e já está funcionando? Fique no **WhatsApp atual**.
- Quer o caminho oficial e robusto para escalar campanhas? Vá para a **Meta oficial** (veja o guia de migração).

> Não dá para usar o **mesmo número** nas duas conexões ao mesmo tempo.`,
  },
  {
    slug: "guia-modelos-mensagem-whatsapp",
    title: "Modelos de mensagem (templates) do WhatsApp oficial",
    area: "WHATSAPP",
    description: "O que são os modelos da Meta e por que precisam de aprovação.",
    content: `# Modelos de mensagem (templates) do WhatsApp oficial

No **WhatsApp oficial da Meta**, para enviar **campanhas de marketing** (mensagens que você inicia, fora de uma conversa em andamento), a Meta exige **modelos de mensagem aprovados**.

## O que é um modelo?
É um texto pré-cadastrado e **aprovado pela Meta** (ex.: uma promoção, um aviso). Só depois de aprovado ele pode ser disparado em massa.

## Como sincronizar
1. Em **Integrações → WhatsApp**, no cartão da Meta, clique em **Sincronizar modelos** para trazer os modelos aprovados da sua conta.
2. Ao criar uma campanha de CRM pela Meta, escolha um modelo aprovado.

## Pontos importantes
- Modelos **novos** passam por análise da Meta (pode levar de minutos a algumas horas).
- Sem modelo aprovado, a campanha **não sai** pela Meta — mas o atendimento normal (respostas dentro de conversas) funciona igual.
- Atendimento e respostas do robô **não** precisam de modelo; só as campanhas iniciadas por você.`,
  },
  {
    slug: "guia-limites-envio-whatsapp",
    title: "Limites de envio e proteção contra bloqueio",
    area: "WHATSAPP",
    description: "Como o Foocci protege seu número de bloqueios ao enviar campanhas.",
    content: `# Limites de envio e proteção contra bloqueio

Para o WhatsApp **não bloquear** seu número por envio em massa, o Foocci aplica regras de segurança automáticas, que você vê na configuração do WhatsApp/CRM.

## Aquecimento (warmup)
Número novo começa enviando **pouco** e vai aumentando aos poucos, dia após dia. Isso imita um uso natural e reduz o risco de bloqueio.

## Limite de contatos
Você pode definir um **teto de contatos** para o CRM alcançar. Serve para controlar quanto está sendo enviado e o custo.

## Controle manual
Por padrão, as **proteções ficam ligadas** (modo seguro). Existe a opção de **controle manual** ("eu assumo a responsabilidade") para quem quer definir os próprios limites — use com cuidado.

## Boas práticas
- Não dispare para listas enormes de uma vez, principalmente com número novo.
- Prefira mensagens relevantes; muitos bloqueios/denúncias derrubam a qualidade do número.
- No WhatsApp oficial da Meta, respeite os **modelos aprovados** e acompanhe a **qualidade do número** (a Meta mostra isso na conexão).`,
  },
  {
    slug: "guia-erros-whatsapp",
    title: "Erros comuns do WhatsApp e como resolver",
    area: "WHATSAPP",
    description: "Soluções rápidas para os problemas mais frequentes do WhatsApp.",
    content: `# Erros comuns do WhatsApp e como resolver

## "Conectou, mas o robô não responde"
Geralmente o **webhook** (o caminho que entrega as mensagens ao Foocci) caiu depois de reconectar.
1. Abra **Integrações → WhatsApp**.
2. Acrescente **?suporte=1** no final do endereço e aperte Enter.
3. Clique em **Sincronizar webhook**.
4. Mande uma mensagem de teste — o robô deve responder.

## "Não recebi o código de verificação da Meta"
- Escolha **verificação por LIGAÇÃO** em vez de SMS (funciona melhor no Brasil).
- Confirme que o **chip está num celular ligado e com sinal**.
- **Não peça o código várias vezes** seguidas — a Meta bloqueia por cerca de 1 hora.

## "Esse número já está registrado em uma conta do WhatsApp"
O número ainda está ativo no app do celular. Apague a conta: **WhatsApp Business → ⋮ → Configurações → Conta → Apagar minha conta**, espere alguns minutos e tente de novo. (Veja o guia de migração.)

## "QR Code expirou / não aparece"
- Clique em **Atualizar QR Code** ou **Gerar novo QR Code**.
- Aguarde alguns segundos; o servidor pode levar até ~30s para gerar.

## "Apareceu um número +1 que eu não reconheço"
É o **número de teste** da Meta, criado automaticamente. Use **Reconfigurar / trocar número** e selecione o **número real** do restaurante.

> Se nada resolver, fale com o suporte Foocci pelo próprio assistente de ajuda.`,
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
    description: "Ligar campanhas prontas ou criar a sua (manual ou por IA) e acompanhar o resultado.",
    content: `# Como criar uma campanha / promoção no CRM

Vá no menu lateral em **Marketing → CRM** e abra a aba **Campanhas**.

## 1. Escolha o período que você quer olhar
Na régua **Período:** clique em **Hoje**, **Ontem**, **Últimos 7 dias**, **Semana passada**, **Últimos 30 dias**, **Este mês**, **Personalizado** (aí aparecem os campos de data "até") ou **Total**.

O bloco **Receita gerada pelo CRM** responde ao período escolhido, com os quadros **Receita atribuída**, **Mensagens enviadas**, **Converteram** (% dos enviados) e **Cupons usados**. O gráfico tem os botões **Barras** e **Linha**.

Ao lado fica o quadradinho **📤 Limite de envio** (mensagens/dia) e a **Distribuição** entre campanhas: **🎯 Por audiência**, **Igual p/ todas** ou **Manual**.

## 2. Caminho mais rápido: ligar uma campanha pronta
Desça até **Campanhas prontas** ("já vêm configuradas para qualquer restaurante — é só ligar"). Ligue a que interessa e use **Gerenciar** se quiser ajustar antes ou depois.

## 3. Criar a sua campanha
O bloco **Criar campanha personalizada** fica logo acima da lista de campanhas. Dois caminhos:

### a) Com IA — texto ou voz
Na caixa **✨ Criar campanha com IA**:
1. Escreva o que você quer (ex: "recuperar quem sumiu faz 30 dias com 10% de desconto") **ou** clique em **🎤 Falar**, fale e clique em **⏹ Parar**.
2. Clique em **Montar**.
3. Confira o **Rascunho da IA** (nome, público, objetivo e a mensagem) e clique em **Criar campanha** — ou **Descartar** e tente de novo.

A campanha nasce como rascunho: você revisa e ativa na lista abaixo.

### b) Manual
Clique em **Preencher manual**. A campanha nasce **pausada** de propósito e abre a janela **Gerenciar campanha**, com as abas **Visão Geral**, **Mensagem**, **Agendamento**, **Performance** e **Diagnóstico**.

## 4. Ajustar na janela "Gerenciar campanha"
- **Visão Geral** — **Editar nome da campanha** (+ **Salvar**) e **Público-alvo**: Todos os clientes, Clientes quentes, Clientes mornos, Clientes frios, VIPs (Ouro/Diamante), Fizeram só 1 pedido, Cadastrados sem compra, Recorrentes (2+ pedidos) (+ **Salvar**).
- **Mensagem** — em **Frases da campanha**, ligue as frases que vão rodar (cada envio sorteia uma das ativas e os números mostram qual converte mais). Para escrever a sua: **+ Nova frase personalizada** → **Adicionar frase**.
- **Agendamento** — em **Editar agendamento** escolha os **Dias da semana**, a **Início** e **Fim** da janela de horário e o **Limite diário (mensagens)** (máximo 200/dia). Clique em **Salvar agendamento**.

## 5. Ligar e acompanhar
Em **Campanhas ativas** ("campanhas em execução, agendadas ou recorrentes") cada campanha tem **Pausar** / **Retomar** e o detalhe pelo **Gerenciar**. Em **Ver histórico geral** você vê os **Envios recentes (ao vivo)**, com data e hora.

> Se preferir montar a mensagem antes, salve um rascunho em **Modelos salvos** e depois clique em **Usar em campanha** — ali você define **Nome da campanha**, **Público alvo**, **Mensagem sugerida**, **Cupom vinculado** e o tipo: **Envio único**, **Agendada** (Data + Hora) ou **Recorrente**.`,
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
  {
    slug: "guia-painel-inicial",
    title: "Como ler o painel inicial (Início)",
    area: "GENERAL",
    description: "Entender os números e seções da tela inicial.",
    content: `# Como ler o painel inicial (Início)

No menu lateral, **Início** é o resumo do seu negócio em tempo real.

No topo, escolha o período: **Hoje**, **Ontem**, **Esta semana**, **7 dias**, **Este mês**, **30 dias** ou **Personalizado**.

- **Saúde do negócio** — os números do período: **Faturamento**, **Pedidos**, **Ticket médio**, **Novos clientes** e **Taxa de conversão** (cada um mostra a variação vs. o período anterior).
- **Foocci em ação** — o que o Foocci fez por você: **Vendas no upsell**, **Carrinhos recuperados** e **Clientes quentes (CRM)**.
- **Operação agora** — pedidos em andamento por etapa: **Aguardando**, **Em preparo**, **Prontos** e **Em entrega**, com avisos de atrasados e aguardando pagamento.
- **O que fazer agora** — ações sugeridas para hoje.
- **Mais vendidos** — ranking dos produtos do período.

No rodapé, **Ver análise completa →** abre o Analytics.`,
  },
  {
    slug: "guia-central-conversas",
    title: "Como atender clientes na Central de Conversas",
    area: "WHATSAPP",
    description: "Ler conversas, assumir da IA, responder e resolver.",
    content: `# Como atender clientes na Central de Conversas

No menu lateral, **Central de Conversas** reúne todas as conversas (WhatsApp, Cardápio, Instagram).

## Encontrar a conversa
- Busque por **Nome, telefone ou mensagem** e use **Ordenar** (Mais recentes, Mais antigas, Nome A–Z…).
- Filtre pelos chips: **Todas**, **IA ativa**, **Humano**, **Aguardando**, **Resolvidas**, **IA bloqueada**, **CRM enviado**, **Resposta CRM**.
- Quando alguém pede atendente, aparece **"🙋 X aguardando atendimento humano"** — clique em **Ver pendentes**.

## Assumir e responder
1. Abra a conversa.
2. Clique em **Assumir atendimento** — a IA para de responder e o campo de mensagem libera.
3. Digite e clique em **Enviar** (ou tecle Enter). Para anexar imagem/PDF, use o **📎**.
4. Ao terminar, clique em **Devolver para IA** (a IA volta a responder) ou **Resolver** para encerrar.

> Dono e Gerente também podem lançar um pedido pela conversa em **+ Criar pedido**.`,
  },
  {
    slug: "guia-agentes-ia",
    title: "Como configurar os Agentes de IA",
    area: "WAITER_AGENT",
    description: "Ajustar WhatsApp Host, Waiter, CRM e Analytics.",
    content: `# Como configurar os Agentes de IA

No menu lateral, **Vendas → Agentes IA**. No topo, escolha o agente: **WhatsApp Host**, **Waiter**, **CRM** e **Analytics**.

## WhatsApp Host (recepcionista do WhatsApp)
- **Status do agente:** **Nome do agente**, **Modo de operação** (Menu fixo / Recepcionista / Com suporte humano), **Tom de voz** e **Estilo de atendimento**.
- **Menu inicial:** a **Mensagem de boas-vindas** e as **Opções do menu** (cada opção tem um rótulo e um tipo de fluxo: fazer pedido, falar com atendente, ver cardápio, promoções, submenu…). Use **+ Nova opção** ou **Adicionar predefinição**.
- **Encaminhamento humano:** **Telefone do atendente** e a mensagem de transferência.
- Clique em **Salvar WhatsApp Host**.

## Waiter (atendente do cardápio digital)
Escolha uma **personalidade** (Tradicional, Moderno, Ágil, Premium, Vendas) e ajuste **Formalidade**, **Emojis**, **Saudação**, **Foco de vendas** e **Intensidade do upsell**. Se quiser, escreva **Instruções do agente**. Clique em **Salvar Waiter**.

## CRM e Analytics
**CRM** mostra o resumo da base (frios/mornos/VIP), oportunidades e campanhas. **Analytics** monitora KPIs e alertas (em evolução).

> O que você salvar passa a valer **nas próximas conversas** imediatamente.`,
  },
  {
    slug: "guia-ensinar-ia",
    title: "Como ensinar a IA (base de conhecimento)",
    area: "WAITER_AGENT",
    description: "Aprovar aprendizados e adicionar respostas para a IA.",
    content: `# Como ensinar a IA (base de conhecimento)

Em **Vendas → Agentes IA → WhatsApp Host**, role até a base de conhecimento.

- **Aprendizados pendentes** — respostas sugeridas aguardando sua aprovação. Clique em **Aprovar** para a IA passar a usar, ou **Rejeitar**.
- **Gaps (sem resposta)** — perguntas que a IA não soube responder; adicione a resposta ou clique em **Ignorar**.
- **Base de conhecimento ativa** — os fatos que a IA usa; você pode **Desativar** ou **Excluir** cada um.
- **+ Adicionar conhecimento manualmente** — preencha **Título**, **Exemplos de pergunta** (um por linha), **Resposta da IA** e **Categoria**, e clique em **Salvar como ativo**.

> É assim que a IA aprende as particularidades do seu restaurante.`,
  },
  {
    slug: "guia-analytics",
    title: "Como entender seus números (Analytics)",
    area: "ANALYTICS",
    description: "Ler KPIs, abas e perguntar ao analista de dados.",
    content: `# Como entender seus números (Analytics)

No menu lateral, **Vendas → Analytics**. Escolha o período (**Hoje, Ontem, 7 dias, 30 dias, 90 dias, 12 meses, Personalizado**) e navegue pelas abas:

- **Visão Geral** — KPIs (Receita, Pedidos, Ticket médio, Novos clientes, Cancelamentos), receita incremental do Foocci, eficiência operacional e o **Diagnóstico do período**.
- **Analista** — faça uma pergunta em linguagem natural (ex: "Por que as vendas caíram?") e receba resposta baseada nos seus dados.
- **Produtos** e **Categorias** — o que mais vende e itens parados.
- **Clientes** — retenção, top clientes, segmentos e tiers.
- **Canais** — origem dos pedidos.
- **Receita Incremental** — o que o Foocci vendeu a mais via sugestões.
- **Cardápio Delivery** — visitas e pedidos por canal, com links rastreáveis para copiar.

> Na Visão Geral, o **Gerente Comercial IA** resume tudo e sugere ações.`,
  },
  {
    slug: "guia-promocoes",
    title: "Como criar uma promoção",
    area: "CHECKOUT",
    description: "Criar descontos, cupons, combos e automações.",
    content: `# Como criar uma promoção

No menu lateral, **Marketing → Promoções**. Clique em **+ Criar promoção**.

1. **Informações básicas** — **Nome da promoção** (e descrição interna, opcional).
2. **Tipo de promoção** — **% Desconto**, **R$ Desconto**, **Combo**, **Frete grátis** ou **Cupom**. Para % ou R$, informe o valor; para **Cupom**, defina o **Código do cupom** (ex: PROMO10).
3. **Banner (opcional)** — marque **Adicionar banner** e suba uma imagem (proporção 3:1, até 5 MB); ela aparece no topo do cardápio.
4. **Alvo** — **Pedido**, **Categoria** ou **Produto**; e o **Canal** (Todos, Cardápio QR, Delivery, WhatsApp / IA).
5. **Validade** — **Início** e **Término** (vazio = sem expiração), **Dias da semana** e **Hora início/fim** (opcionais).
6. **Regras** — **Pedido mínimo**, **Qtd. mínima**, **Limite de usos**, **Uso único por cliente** e **Combinável**.
7. Clique em **Criar promoção**.

Em cada card depois: **Ativar/Pausar**, **Editar**, **📊 Métricas**, **Duplicar** ou **Excluir**. Na aba **🤖 Automações WhatsApp** você liga disparos de **Reativação**, **Aniversário** e **Pós-pedido**.`,
  },
  {
    slug: "guia-canais-links",
    title: "Como criar links rastreáveis (Canais)",
    area: "GENERAL",
    description: "Gerar links por canal e medir cliques, pedidos e receita.",
    content: `# Como criar links rastreáveis (Canais)

No menu lateral, **Marketing → Canais** ("Canais & Links Rastreáveis"). Crie um link único por canal para saber de onde vêm cliques, pedidos e receita.

1. Clique em **+ Novo link**.
2. Preencha **Nome do link** (ex: "Instagram Bio"), **Slug** (gerado automaticamente), **Destino** (**Cardápio Delivery /pedido** ou **Cardápio QR / Mesa /qr**), **Origem** (Instagram, WhatsApp, QR Code, Google…) e **Meio** (Bio, Stories, Mesa…). Campanha, Conteúdo e Termo são opcionais.
3. Clique em **Criar link**.

No card do link: **Copiar** o link, **📷 QR** para baixar o QR Code, e acompanhe **Cliques / Clientes / Pedidos / Receita**. Na aba **Analytics** dá para salvar o **GA4** e o **Google Tag Manager** do cardápio público.`,
  },
  {
    slug: "guia-fotos-cardapio",
    title: "Como melhorar as fotos do cardápio",
    area: "UI_UX",
    description: "Gerar, revisar e aprovar fotos melhoradas dos produtos.",
    content: `# Como melhorar as fotos do cardápio

No menu lateral, **Plataforma → Fotos do Cardápio** (acesso de Dono/Gerente). A IA gera uma versão melhorada de cada foto para você aprovar — o original nunca é apagado sozinho.

1. Escolha o **Modo** (**Aprimorar + Upscale**, **Só aprimorar** ou **Só upscale**).
2. Clique em **Iniciar processamento → Processar agora** (ou marque **Dry run** para simular).
3. Abra a aba **Prontas** e compare **Original** × **Aprimorada**.
4. Em cada foto: **Aprovar** (passa a valer no cardápio), **Rejeitar** ou **Regenerar**.

> Aprovou e quer voltar atrás? Use **Restaurar original**.`,
  },
  {
    slug: "guia-cardapio-digital-qr",
    title: "Como compartilhar o cardápio digital (QR Code e link)",
    area: "GENERAL",
    description: "Baixar o QR e copiar o link do cardápio para clientes.",
    content: `# Como compartilhar o cardápio digital (QR Code e link)

No menu lateral, **Vendas → Cardápio**. No topo há dois QR Codes:

- **QR Code Salão** — cardápio digital **só para consulta** (sem pedido). Cole nas mesas. Abre em /qr/seu-restaurante.
- **QR Code Delivery** — **pedido online completo** (o cliente conversa, monta o pedido e paga). Compartilhe no WhatsApp/Instagram. Abre em /pedido/seu-restaurante.

Em cada card: **⬇ Baixar QR** (para imprimir), **📋 Copiar link** (para enviar) e **👁 Visualizar**.

> Cada alteração no Cardápio aparece **na hora** no cardápio digital. Para medir de onde vêm os acessos, gere versões rastreáveis em **Canais**.`,
  },
  {
    slug: "guia-configuracoes",
    title: "Onde fica cada configuração (Configurações)",
    area: "GENERAL",
    description: "Mapa das abas de Configurações e o que cada uma faz.",
    content: `# Onde fica cada configuração (Configurações)

No menu lateral, **Plataforma → Configurações**. Está dividido em dois grupos:

**Operação**
- **Loja** — dados da loja, dados fiscais, endereço, contatos e modalidades (delivery, retirada, presencial).
- **Entrega** — zonas, taxas e área de cobertura.
- **Operação** — horário de funcionamento.
- **Pagamentos** — métodos aceitos (Pix, dinheiro, cartão, link).
- **Impressoras** — impressão de comandas na cozinha.
- **Sons e alertas** — sons de novo pedido e de atendimento.

**Gestão**
- **Equipe** — membros da equipe e permissões.
- **Políticas** — termos, privacidade e cancelamento.

> Marca, Agentes IA e Integrações têm telas próprias no menu lateral.`,
  },
  {
    slug: "guia-integracoes",
    title: "Quais integrações existem e como conectar",
    area: "INTEGRATIONS",
    description: "Visão geral das integrações e como conectar o Instagram.",
    content: `# Quais integrações existem e como conectar

No menu lateral, **Plataforma → Integrações**. Cada cartão tem um status: **Ativo**, **Erro**, **Validação pendente**, **Não conectado** ou **Não configurado**.

Provedores disponíveis:
- **WhatsApp** — conecte por QR Code ou pela conta oficial da Meta.
- **Instagram** — receba e responda o Direct na Central de Conversas.
- **Facebook** — mensagens do Messenger na Central.
- **Google** — Google Meu Negócio e Google Analytics.
- **Mercado Pago** e **Stone** — pagamentos (Pix e cartão).
- **Saipos** — PDV e gestão de pedidos.
- **OpenAI** — motor de IA dos agentes.

### Conectar o Instagram
1. Abra **Integrações → Instagram**.
2. Clique em **Conectar com Facebook** e autorize na Meta.
3. Em **Escolha a Página do Facebook**, selecione a Página ligada ao seu Instagram profissional e clique em **Conectar esta Página**.
4. Pronto — as mensagens do Instagram Direct passam a aparecer na **Central de Conversas** com o selo **Instagram DM**.`,
  },
  {
    slug: "guia-primeiros-passos",
    title: "Primeiros passos — do zero ao primeiro pedido",
    area: "GENERAL",
    description: "Trilha de onboarding: configurar tudo e receber o primeiro pedido.",
    content: `# Primeiros passos — do zero ao primeiro pedido

Bem-vindo ao Foocci! 🚀 Siga esta trilha na ordem — em cada etapa, você pode me perguntar "como faço?" que eu detalho o passo a passo.

## 1. Deixe com a sua cara (Marca)
**Marketing → Marca**: suba a logomarca (**Fazer upload**), preencha o **Nome da marca** e escolha as cores em **Identidade Visual**. Termine em **Salvar persona da marca**.

## 2. Monte o cardápio
**Vendas → Cardápio**: crie as categorias (**+ Nova categoria**) e os produtos (**+ Novo Produto** — nome, preço, foto). Variações e adicionais ficam dentro de **Editar item**.

## 3. Defina quando você abre
**Configurações → Operação**: marque os dias e horários em **Horário de funcionamento** e clique em **Salvar**.

## 4. Configure entrega e retirada
**Configurações → Delivery**: ligue **Delivery ativo** e/ou **Retirada no balcão ativa**, escolha como cobrar (**Taxa fixa**, **Por zonas**, **Por distância** ou **Manual**) e teste no **Simulador de entrega**.

## 5. Escolha como receber
**Configurações → Pagamentos**: ligue **Pix**, **Dinheiro**, **Cartão (maquininha)**. Para Pix automático no checkout, conecte o **Mercado Pago** em **Integrações** (Access Token).

## 6. Conecte o WhatsApp
**Integrações → WhatsApp**: clique em **Conectar WhatsApp** e escaneie o QR Code com o celular do restaurante. O agente de IA passa a atender por lá.

## 7. Divulgue o cardápio
**Vendas → Cardápio** (topo): baixe o **QR Code Salão** para as mesas e copie o link do **QR Code Delivery** para a bio do Instagram e o WhatsApp.

## 8. Faça um pedido de teste
Abra o link do delivery no seu celular, monte um pedido e finalize. Ele vai aparecer em **Vendas → Pedidos** — clique em **Confirmar** e avance o status até **Entregue**.

Pronto: loja no ar. 🎉 Depois, explore **Agentes IA** (personalidade do atendimento), **Promoções** e **CRM** para vender mais.`,
  },
  {
    slug: "guia-treinamento-dono",
    title: "Treinamento do Dono — visão completa do Foocci",
    area: "GENERAL",
    description: "O que o dono precisa dominar: números, marca, IA e equipe.",
    content: `# Treinamento do Dono — visão completa

Como dono, você enxerga e controla tudo. Rotina sugerida:

## Todo dia (5 min)
- **Início**: confira **Saúde do negócio** (faturamento, pedidos, ticket médio) e o bloco **O que fazer agora**.
- **Foocci em ação**: veja o que a IA vendeu (upsell), carrinhos recuperados e clientes quentes.

## Toda semana (30 min)
- **Analytics**: aba **Visão Geral** (diagnóstico do período) e **Produtos** (campeões e itens parados).
- **Marketing → CRM**: crie/acompanhe campanhas (frios, mornos, aniversariantes).
- **Marketing → Promoções**: avalie as promoções ativas em **📊 Métricas**.

## Configurações que só você decide
- **Marca** (identidade e tom da IA), **Agentes IA** (personalidade e estilo de venda), **Configurações → Equipe** (quem tem acesso: Dono, Gerente ou Atendente) e **Políticas**.

## Poderes exclusivos do Dono/Gerente
- **Pausar pedidos** (topo da tela) em emergências.
- **+ Criar pedido** dentro de uma conversa.
- Apagar conversas (só Dono).

> Dica: pergunte no **Analytics → Analista** coisas como "Por que as vendas caíram?" — ele responde com os seus dados.`,
  },
  {
    slug: "guia-treinamento-gerente",
    title: "Treinamento do Gerente — operação do dia a dia",
    area: "GENERAL",
    description: "Rotina do gerente: pedidos, conversas, cardápio e emergências.",
    content: `# Treinamento do Gerente — operação do dia a dia

Seu papel é manter a operação girando. O essencial:

## Abertura do turno
1. **Início**: olhe **Operação agora** (aguardando, em preparo, prontos, em entrega) e alertas.
2. Confirme que o horário e a entrega estão certos (**Configurações → Operação / Delivery**).

## Durante o serviço
- **Vendas → Pedidos**: avance cada pedido — **Confirmar → Preparar → Pronto → Despachar → Entregue**. Aba **Atrasados** é prioridade.
- **Central de Conversas**: fique de olho no aviso **"🙋 aguardando atendimento humano"** — clique em **Ver pendentes**, **Assumir atendimento**, resolva e **Devolver para IA**.
- Produto acabou? **Vendas → Cardápio** → desligue o toggle de disponibilidade do item (religue depois).

## Emergências
- Cozinha lotada? **Pausar pedidos** (topo) → escolha o motivo e o tempo → **Pausar agora**. Depois, **Reativar**.

## Fechamento
- **Pedidos**: nenhum pedido esquecido em aberto.
- **Central de Conversas**: nenhuma conversa esperando humano.

> Você também pode criar pedido manual (**+ Pedido manual** em Pedidos) e confirmar pagamento Pix manualmente quando o gerente/dono autorizar.`,
  },
  {
    slug: "guia-treinamento-atendente",
    title: "Treinamento do Atendente — atendimento e pedidos",
    area: "WHATSAPP",
    description: "O básico do atendente: conversas, assumir da IA e pedidos.",
    content: `# Treinamento do Atendente — o essencial

Seu dia a dia acontece em duas telas: **Central de Conversas** e **Pedidos**.

## Atender um cliente (Central de Conversas)
1. A IA atende sozinha a maior parte. Você entra quando aparece **"🙋 aguardando atendimento humano"** ou quando quiser intervir.
2. Abra a conversa e clique em **Assumir atendimento** — a IA para e o campo de mensagem libera.
3. Converse normalmente (**Enviar** ou Enter; 📎 anexa imagem/PDF).
4. Terminou? **Devolver para IA** (ela reassume) ou **Resolver** (encerra o assunto).

## Regras de ouro
- Cliente esperando humano é prioridade máxima — o alerta fica vermelho quando passa do tempo.
- Não invente informação de cardápio/preço: confira em **Vendas → Cardápio**.
- Problema de pagamento, cancelamento ou reclamação séria: chame o gerente.

## Pedidos
- Em **Vendas → Pedidos**, acompanhe os status e avance quando a cozinha sinalizar: **Confirmar → Preparar → Pronto**.
- Não force etapas que não são suas (despacho/entrega é com o gerente, se assim combinado).

> Dúvida sobre qualquer tela? Pergunte aqui no chat de ajuda que eu te guio. 😉`,
  },
  {
    slug: "guia-config-loja",
    title: "Como preencher os dados da loja",
    area: "GENERAL",
    description: "Nome, dados fiscais, endereço, contatos e modalidades.",
    content: `# Como preencher os dados da loja

Vá em **Configurações → Loja**. É um formulário único com 6 seções — um só **Salvar** no final grava tudo.

1. **Dados da loja** — o **Nome público do restaurante** (obrigatório), nome fantasia, razão social, descrição pública (aparece no cardápio) e tipo de cozinha. O **Slug (URL pública)** é fixo — não dá pra editar.
2. **Dados fiscais** — CNPJ, regime tributário, inscrições e responsável legal (uso interno, não aparece pro cliente).
3. **Endereço da loja** — digite o **CEP** e clique em **Buscar CEP** (preenche rua/bairro/cidade), complete o **Número**. ⚠️ Importante: é esse endereço que calcula o **frete por distância** — preencha tudo.
4. **Contatos da loja** — telefones, WhatsApp (o principal vira o ícone do cardápio público) e e-mails.
5. **Responsáveis** — contatos do proprietário e do gerente (interno).
6. **Operação** — os toggles **Delivery ativo**, **Retirada ativa** e **Salão / QR ativo**, o **Tempo médio de preparo (min)** (mostrado ao cliente) e o fuso horário.

Clique em **Salvar** e aguarde "Dados da loja salvos com sucesso."`,
  },
  {
    slug: "guia-equipe",
    title: "Como adicionar membros da equipe",
    area: "GENERAL",
    description: "Criar acessos para gerente e atendentes, com perfis.",
    content: `# Como adicionar membros da equipe

Vá em **Configurações → Equipe** (grupo Gestão).

1. Clique em **+ Adicionar membro**.
2. No cartão **Novo usuário**, preencha **Nome completo**, **E-mail** e **Senha** (mínimo 6 caracteres).
3. Escolha o **Perfil**:
   - **Funcionário — acesso básico** (atendente: conversas e pedidos)
   - **Gerente — acesso à operação** (tudo do dia a dia + pausar pedidos)
   - **Proprietário — acesso total**
4. Clique em **Criar usuário**.

A pessoa entra com o e-mail e a senha criados, no mesmo endereço do painel.

> Por enquanto essa tela **lista e cria** usuários. Para alterar, desativar ou remover alguém, fale com a equipe Foocci pelo botão "Falar com a FOOD" aqui do chat.`,
  },
  {
    slug: "guia-impressoras",
    title: "Como configurar a impressão de comandas (Carteiro)",
    area: "INTEGRATIONS",
    description: "Instalar o Carteiro, parear e mandar comandas pra cozinha.",
    content: `# Como configurar a impressão de comandas

Vá em **Configurações → Impressoras**. A impressão automática usa o **Carteiro**, um programinha que roda no computador (Windows) do restaurante.

## 1. Ativar o Carteiro (uma vez só)
1. Clique em **⬇️ Baixar o programa** (tem também o **📄 Manual (passo a passo)**).
2. Abra o arquivo com dois cliques. Se o Windows mostrar o aviso azul: **Mais informações → Executar assim mesmo**.
3. Na telinha do Carteiro, cole o código da tela (**Copiar código**) e clique em **Parear**.

Quando der certo, o topo mostra **"Carteiro conectado"** com as impressoras detectadas.

## 2. Acompanhar a fila (quando o papel não sai)
O cartão **Fila de impressão** ("o caminho da comanda entre o pedido e o papel") tem três contadores: **Na fila**, **No Carteiro** e **Impressas 24h**.

- Sem nada travado, ele diz **"Nada esperando. Toda comanda enviada saiu no papel."** ou **"Nenhuma comanda travada — o que está na fila ainda vai sair."**
- Se alguma comanda travar (tentou 5 vezes e não saiu), ela aparece na lista com o **motivo** e a impressora de destino. Confira se o Carteiro está aberto no computador e se a impressora aparece no Windows com esse mesmo nome — depois clique em **Tentar de novo**.

## 3. Impressora de cada estação
No cartão **"1. Impressora de cada estação"**, escolha a impressora de cada estação (Cozinha, Caixa, Copa…) e clique em **🖨️ Testar** para sair uma comanda de teste.

## 4. Para onde vai cada categoria
No cartão **"2. Para onde vai cada categoria"**, diga em qual estação cada categoria do cardápio imprime. Um prato pode sair em duas cozinhas — use **+ adicionar impressora**.

## 5. Letras grandes (opcional)
**"3. Letras grandes na cozinha"** imprime os itens em letra dupla, mais fácil de ler de longe.

Termine em **Salvar tudo**.`,
  },
  {
    slug: "guia-sons-alertas",
    title: "Como configurar sons e alertas",
    area: "GENERAL",
    description: "Som de novo pedido e de atendimento humano, volume e temas.",
    content: `# Como configurar sons e alertas

Vá em **Configurações → Sons e alertas**. Regra de ouro: **mantenha a tela do painel aberta** no computador do restaurante — é ela que toca os alertas.

1. **Sons do restaurante** — ligue **Ativar todos os sons**.
2. **Volume** — ajuste no slider ou nos atalhos (**Baixo 50%** a **Máximo 400%**). Recomendado: **Alto (150%)** para ambiente de cozinha.
3. **Som de novo pedido** — ligue o alerta e, se quiser, **Repetir até pedido ser aceito** (toca em loop até alguém aceitar).
4. **Som de atendimento humano** — alerta quando um cliente pede pra falar com uma pessoa; também tem **Repetir até conversa ser vista**.
5. **Tema sonoro** — **🔔 Padrão**, **🎵 Suave** ou **🚨 Urgente** (o Urgente é mais alto e insistente, ideal pra cozinha).
6. Clique em **Salvar alterações**.

> Apareceu **"🔇 Navegador bloqueou o áudio"**? Clique em **🔊 Desbloquear áudio neste dispositivo** — os navegadores exigem um clique antes de tocar som.`,
  },
  {
    slug: "guia-politicas",
    title: "Como definir termos e políticas da loja",
    area: "SECURITY",
    description: "Termos de uso, privacidade e política de cancelamento.",
    content: `# Como definir termos e políticas da loja

Vá em **Configurações → Políticas** (grupo Gestão), cartão **Documentos legais**.

São três textos, cada um com até 5.000 caracteres:
1. **Termos de uso** — as condições do seu restaurante.
2. **Política de privacidade** — como você trata os dados dos clientes.
3. **Política de cancelamento** — prazo para cancelar e regras de reembolso (evita conflito com cliente!).

Escreva (ou cole) os textos e clique em **Salvar**.

> Salvar já publica: os documentos aparecem no rodapé do cardápio web e são enviados ao cliente quando solicitado. Campo vazio = documento não exibido.`,
  },
  {
    slug: "guia-precificacao",
    title: "Como calcular o CMV e o preço certo de cada prato",
    area: "ANALYTICS",
    description: "Premissas, markup, ficha de custo dos insumos e reprecificação automática.",
    content: `# Como calcular o CMV e o preço certo de cada prato

Vá no menu lateral em **Vendas → CMV & Precificação**. A tela tem seis abas: **Custos & Fórmula**, **Markup**, **Preços do cardápio**, **Insumos**, **Ficha de custo** e **Automação**.

> Só **dono** ou **gerente** edita. Outros perfis veem o aviso "Você está em modo de visualização".

## 1. Custos & Fórmula (comece aqui)
No cartão **Premissas do negócio** preencha:
1. **Faturamento médio mensal (R$)**.
2. **Despesas fixas mensais (R$)** — aluguel, equipe, luz, contador. A tela mostra a quanto isso equivale em % do faturamento.
3. **Impostos + taxas (%)** — Simples, cartão, apps de entrega.
4. **Margem de lucro desejada (%)** — quanto deve sobrar de cada venda.

Ao lado aparece o **Seu markup** (ex: "2,85×"), o multiplicador que transforma custo em preço: **preço ideal = custo × markup**. Referência do setor: 2,5× a 3× (bebidas e sobremesas até 4–5×).

Abaixo, **CMV do período (opcional)**: informe **Estoque inicial (R$)**, **Compras do período (R$)**, **Estoque final (R$)** e **Faturamento do período (R$)** — a tela calcula o CMV do negócio inteiro e mostra se está na faixa saudável (25–35%).

Clique em **Salvar premissas**. Enquanto não salvar, a tabela de preços continua usando as premissas antigas (a tela avisa).

## 2. Markup (opcional, por categoria)
Na aba **Markup** cada categoria pode ter um multiplicador próprio — prática do setor: pratos 2,5–3×, bebidas e sobremesas 4–5×. A tabela mostra **Itens**, **Markup da categoria**, **CMV alvo** e **Custo R$ 10 vira**. Categoria sem valor segue o markup global; use **limpar** para voltar ao global. Termine em **Salvar markups**.

## 3. Insumos (o que você compra)
Na aba **Insumos**, a **Lista de insumos** traz os ingredientes com **Unidade**, **Custo por unidade (R$)** e em quantos produtos cada um é **Usado em**. Formas de preencher:
- **📷 Ler nota de compra** — mande a foto ou o PDF da nota; a IA lê e abre **Revisar preços da nota** para você conferir linha por linha. Nada muda sem você clicar em **Aplicar preços marcados**.
- **↻ Importar do cardápio** — puxa os ingredientes escritos nos produtos.
- **📄 Importar lista** — cole a lista (um insumo por linha) ou envie um .txt/.csv. Para já vir com unidade e custo, separe por ponto e vírgula: \`Nome ; unidade ; custo\`.
- **Novo insumo** — nome, **Unidade** e **Custo por unidade (R$)**, depois **＋ Cadastrar**.

Editou custos na tabela? Clique em **Salvar insumos**.

## 4. Ficha de custo (o que entra no prato)
A aba **Ficha de custo** lista todos os pratos por categoria, cada um marcado como **montar**, **incompleta** ou **completa**. Toque no prato para abrir a ficha.

Na ficha:
1. Em **Adicionar insumo à ficha**, escolha o insumo, informe a **Quantidade** e clique em **＋ Adicionar**.
2. Em cada linha, escolha a **unidade de uso** — como você usa **no prato**. O custo vem do preço de compra do insumo e converte sozinho: compra em **kg**, usa em **g** (ex: 150 g de um insumo a R$ 30,00/kg = R$ 4,50). Debaixo do nome do insumo a tela mostra "compra: R$ 30,00/kg".
3. A conversão só vale dentro da mesma medida (massa g↔kg, volume ml↔L). Contagem (un, fatia, porção) não converte.

Quando todas as linhas têm quantidade e custo, o topo mostra **"Ficha completa · custo calculado: R$ …"** e esse custo passa a valer para o produto. Use **← Voltar aos pratos** para escolher outro.

## 5. Preços do cardápio
A aba **Preços do cardápio** mostra, item por item: **Custo (R$)**, **Preço atual**, **CMV**, **Preço ideal** e o **Status** — **Sem custo**, **Subir R$ …**, **No alvo** ou **Margem extra**.
- Item com ficha completa tem o custo travado (é a ficha que manda) — o atalho **🧾 ver ficha** / **＋ montar ficha** leva direto pra ela.
- **Aplicar** sobe um item para o preço ideal; **Aplicar sugeridos (N)** faz todos de uma vez (a confirmação mostra o potencial somando uma venda de cada).

Preço alterado vale na hora no cardápio e no agente do WhatsApp.

## 6. Automação
Na aba **Automação**, o **Dispositivo de reprecificação** decide o que acontece quando um custo muda:
- **Desligado** — nada muda sozinho, a tela só mostra os preços ideais.
- **Sugerir** (recomendado) — o novo preço ideal fica pendente e você aprova com 1 clique.
- **Automático** — atualiza o preço na hora, dentro da trava.

Ajuste também o **Arredondamento do preço sugerido** (terminar em ,90 / em ,99 / sem arredondamento) e a **Trava do modo Automático (%)** — variações maiores que isso viram sugestão em vez de serem aplicadas sozinhas. Clique em **Salvar automação**.

O **Histórico de alterações** abaixo registra toda mudança de custo ou preço, com origem e horário.

> Travas permanentes: o preço sugerido nunca fica abaixo do custo, e toda alteração — manual ou automática — vai pro histórico.`,
  },
];
