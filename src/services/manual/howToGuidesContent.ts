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
    description: "Conectar o WhatsApp do restaurante pelo login da Meta — com ou sem manter o número no celular — e como saber se conectou de verdade.",
    content: `# Como conectar o WhatsApp

Vá no menu lateral em **Plataforma → Integrações** e clique no cartão **WhatsApp** (ou no link **Configurar →** dentro dele). Abre a tela **WhatsApp**, com o cartão **Conexão de WhatsApp**.

Hoje existe **um caminho só**: a conta oficial da Meta. Não há QR Code para colar no Foocci nem senha para digitar — a etiqueta no alto do cartão mostra **"Em uso: WhatsApp oficial da Meta"**, e embaixo do título **WhatsApp oficial da Meta** a tela avisa: *"Faça login com a Meta e escolha sua empresa e número. Sem códigos para digitar."*

## Antes de clicar: são dois botões, para duas situações
- **Conectar WhatsApp oficial da Meta** — o caminho padrão. Você faz login na Meta e escolhe o número que ela vai atender.
- **Conectar número que está no celular** — a **Coexistência**. Use quando o restaurante quer **continuar respondendo pelo WhatsApp no aparelho** e, ao mesmo tempo, deixar o robô/CRM atender no mesmo número.

Se o número que você vai ligar é o mesmo que a equipe usa no celular do balcão, **o botão certo é o segundo**.

## 1. Caminho padrão — Conectar WhatsApp oficial da Meta
1. Clique em **Conectar WhatsApp oficial da Meta** (o botão vira **Conectando…**).
2. Faça o login na **Meta** na janela que abrir.
3. Escolha a empresa e o **número** do restaurante.
4. Espere a tela mostrar **✓ Conectado** com o seu número.

Se aparecer **"Conexão cancelada."**, a janela da Meta foi fechada antes do fim — é só clicar de novo.

## 2. Coexistência — manter o número no celular
No quadro **Manter o número no celular (Coexistência)**. O **histórico dos últimos 6 meses é sincronizado**. A própria tela lista o que precisa estar pronto antes:
- o número já ativo no **WhatsApp Business** (app verde) há **pelo menos 7 dias**;
- app atualizado (**v2.24.17+**) e câmera para ler o QR Code;
- ao clicar, escolher **"conectar sua conta do WhatsApp Business"** e ler o QR **no aparelho**.

Então clique em **Conectar número que está no celular** (o botão vira **Abrindo Meta…**) e leia o QR com o celular. Deu certo quando a tela diz **"Número conectado em modo Coexistência — segue no celular e no bot ao mesmo tempo."** e aparece a etiqueta verde **Coexistência · número segue no celular**.

### Se esse botão estiver apagado, é de propósito
Quando embaixo do botão aparece o aviso laranja **"Ainda não liberado nesta conta: a coexistência exige uma configuração própria da Meta. Sem ela, conectar por aqui tiraria o número do celular. Fale com o suporte Foocci."**, o botão fica **desligado**. Não é defeito da tela: sem essa liberação, clicar levaria ao cadastro comum da Meta — e o cadastro comum **tira o número do aparelho**, justo o contrário do que o botão promete. **Fale com o suporte Foocci** para liberar. Enquanto isso, o caminho padrão continua disponível.

## 3. Conferir que conectou de verdade
Conectado, o cartão mostra **✓ Conectado** com o número. A partir daí:
- **Testar conexão** — dispara uma mensagem de teste para um número interno da Foocci; a tela confirma com *"Mensagem de teste enviada (número interno)."*
- **Reparar recebimento** — use quando as mensagens chegam no WhatsApp mas a IA não responde. O botão vira **Reparando…** e termina com *"Recebimento reativado. Mande uma mensagem no WhatsApp do restaurante — a IA deve responder."*

> Enquanto a tela não mostrar **✓ Conectado**, considere que **não conectou** — não feche achando que terminou.

## 4. Número errado, trocar ou desconectar
Conectou o número de teste (os que começam com **+1**) ou o número errado? A tela avisa e dá as duas saídas:
- **Reconfigurar / trocar número** — refaz o login na Meta para escolher outro número (o botão vira **Abrindo Meta…**).
- **Desconectar** — pede confirmação: **Confirmar desconexão** ou **Cancelar**.

## Outros avisos que podem aparecer
- **"Em breve — disponível quando ativado pela Foocci."** — a integração ainda não foi ligada para a sua conta.
- **"Precisa de autorização da Foocci para ativar. Fale com o suporte Foocci."** — falta liberação da plataforma; nada que você resolva na tela.
- **"Não foi possível carregar o serviço da Meta. Verifique sua conexão e tente novamente."** — problema de internet ou bloqueio no navegador.
- **"⚠ Autorização expira em breve"** (com a data) — reconecte o WhatsApp **antes dessa data** para não parar de enviar mensagens.

> O botão **Avançado · configuração da plataforma**, no rodapé do cartão, é da equipe Foocci — você não precisa dele para nada.

> Depois de conectado, o toggle **Campanhas CRM via Meta** decide se as campanhas saem por essa conexão. Para escolher o número certo e entender o número de teste, veja o guia **"Como conectar o WhatsApp oficial da Meta"**.`,
  },
  {
    slug: "guia-whatsapp-oficial-meta",
    title: "Como conectar o WhatsApp oficial da Meta",
    area: "WHATSAPP",
    description: "Conectar o WhatsApp oficial (API da Meta), escolher o número certo e decidir se ele sai ou fica no celular.",
    content: `# Como conectar o WhatsApp oficial da Meta

O **WhatsApp oficial da Meta** é a conexão pela API oficial (WhatsApp Cloud API). É mais estável, sem risco de bloqueio, e permite campanhas com **modelos aprovados**.

Vá em **Plataforma → Integrações → WhatsApp**, no cartão **"Conexão de WhatsApp"**, no bloco **"WhatsApp oficial da Meta"**.

## Passo a passo
1. Clique em **Conectar WhatsApp oficial da Meta** (o botão vira **Conectando…**).
2. Faça login na **Meta** (Facebook) na janela que abrir.
3. Escolha o **Portfólio empresarial** e a **Conta do WhatsApp Business** do seu restaurante.
4. Escolha o **número** — use o **número real do restaurante**, não o de teste.
5. Aguarde aparecer **✓ Conectado** com o seu número.

## O número de teste (+1)
Todo aplicativo novo da Meta vem com um **número de teste** que começa com **+1** (ex.: +1 555...). Ele é criado automaticamente e serve só para testes — **não use ele** para atender clientes de verdade. Selecione sempre o **número real** (+55...).

## O número vai sair do celular?
Esta é a pergunta que decide qual botão você aperta:
- **Conectar WhatsApp oficial da Meta** — o caminho padrão, para um número que **não** precisa continuar sendo usado no aparelho.
- **Conectar número que está no celular**, no quadro **Manter o número no celular (Coexistência)** — o número **segue funcionando no aparelho** e o robô/CRM atende junto. Conectado assim, o cartão exibe a etiqueta verde **Coexistência · número segue no celular**.

Se esse segundo botão estiver **apagado**, com o aviso laranja **"Ainda não liberado nesta conta"**, a coexistência ainda não foi habilitada para a sua conta — ela depende de uma configuração própria da Meta. **Fale com o suporte Foocci**; não tente pelo caminho padrão achando que dá no mesmo, porque nele o número **sai do celular**.

## Depois de conectado
- **Testar conexão** — envia uma mensagem de teste para um número interno da Foocci.
- **Reparar recebimento** — quando as mensagens chegam mas a IA não responde.
- **Campanhas CRM via Meta** — o toggle (**Ativar** / **Ativado**) que manda as campanhas de CRM saírem por esta conexão.
- **⚠ Autorização expira em breve** — quando aparecer, com a data, reconecte o WhatsApp antes dela para não parar de enviar.

## Trocar o número ou reconfigurar
Se conectou o número errado (ex.: o +1 de teste):
- No cartão da Meta, clique em **Reconfigurar / trocar número** para refazer o login e escolher outro número.
- Ou clique em **Desconectar** (e confirme em **Confirmar desconexão**) para remover e começar do zero.

> Um número só pode estar em **uma** conexão por vez — a não ser na **Coexistência**, que é justamente o modo em que ele fica no celular e na Meta ao mesmo tempo.`,
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

Para o WhatsApp **não bloquear** seu número por envio em massa, o Foocci aplica regras de segurança automáticas. Você as vê em **Marketing → CRM → Configurações**, no cartão **Regras de Segurança**.

## Limite de mensagens por dia (o teto da Meta)
O quadro verde **🟢 Limite oficial da Meta** mostra **"X msgs/dia hoje"** — é o teto **oficial da Meta** para o seu WhatsApp Business. Ele **sobe sozinho** conforme a **qualidade** e o histórico do seu número (quando a Meta informa, a tela diz se a qualidade está **alta**, **média** ou **baixa**), sem risco de bloqueio. Esse limite é **por dia** e **reseta todo dia**.

## Limite de contatos (no total, para sempre)
É outro limite, e não se confunde com o de cima: o teto de pessoas **diferentes** que o CRM pode abordar na **vida toda**. Ele **acumula e nunca zera sozinho**. Cada pessoa conta 1 vez, mesmo recebendo várias campanhas — e **0 = sem limite**. O quadro **Contatos restantes** mostra "X de Y"; quando acaba, aparece **"Limite de contatos atingido"** e o CRM **para de abordar gente nova** — quem já está na conta continua recebendo — até você aumentar o **Máximo de pessoas**. Esse campo você mexe quando quiser, sem precisar ligar o controle manual.

## Controle manual
Por padrão, as **proteções ficam ligadas** (modo seguro): o ritmo de envio fica congelado em **Intervalo por cliente** de 24 h, no máximo **5 por cliente/semana**, **sem envio das 21h às 8h**, **delay de 5–45 s** entre mensagens e fim de semana permitido. Para mexer em qualquer um deles, ligue **Assumir controle manual (eu me responsabilizo)**; aí a tela avisa **⚠️ Controle manual ativo** e o risco passa a ser seu. **O Limite de contatos NÃO entra nessa chave:** ele é limite de gasto, não regra de proteção do número, e você mexe nele quando quiser.

## Proteções que nunca desligam
Quem pediu para sair (opt-out) nunca mais recebe; sem telefone válido ninguém recebe; a mesma campanha não chega duas vezes para a mesma pessoa; e quem já recebeu algo hoje espera o intervalo (só o aniversário passa na frente).

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
    description: "Ler a Visão Geral, ligar campanhas prontas ou criar a sua (manual, por IA ou ditando por voz), escolher as frases que vão rodar, mandar WhatsApp para um cliente, acompanhar o resultado e conferir as Regras de Segurança.",
    content: `# Como criar uma campanha / promoção no CRM

Vá no menu lateral em **Marketing → CRM**. No topo ficam as abas **Visão Geral**, **Campanhas**, **Migração**, **Cupons**, **Conversões**, **Clientes**, **Programa de Relacionamento**, **Avaliações** e **Configurações**.

## Antes: o que a Visão Geral te mostra
A aba **Visão Geral** abre em **Hoje** e é o resumo do CRM, de cima para baixo:

1. **Os números da sua base** (não dependem do período): **Clientes na base** ("Inclui Foocci + importados"), **Quentes**, **Mornos**, **Frios**, **Perdidos**, **Novos hoje** (o nome muda com o período: "Novos (7 dias)", "Novos este mês", "Novos no mês anterior"…) e **Não compraram** ("Cadastraram mas nunca pediram"). Cada quadro é clicável e leva pra lista já filtrada (**Ver quentes**, **Ver mornos**, **Ver frios**, **Ver perdidos**, **Ver novos**, **Ver e criar campanha**).

   **Como ler o percentualzinho ao lado do número.** Todos os quadros — menos o **Clientes na base**, que é o total — mostram, do lado do número, **quanto aquele grupo pesa na sua base inteira**. É sempre a mesma conta: aquele grupo dividido por **Clientes na base**. Então **Quentes 40%** quer dizer "40% de toda a minha base está quente", não "40% de quem já comprou".
   - As cinco faixas que não se misturam — **Quentes**, **Mornos**, **Frios**, **Perdidos** e **Não compraram** — somam mais ou menos **100%** da base. Cada cliente está em uma delas, e só em uma. Se a soma não fechar em 100 na bucha, é arredondamento.
   - **Novos** é a exceção: ele conta quem se cadastrou **no período** escolhido, então essa gente também aparece em uma das cinco faixas acima. O percentual dele é só informação ("os novos deste mês são 6% da minha base") — não entre na soma.
   - Grupo pequeno **não vira 0%**: abaixo de 1% a tela mostra uma casa decimal (**0,2%**), para você ver que existe alguém ali.
2. **A régua de período**: **Hoje**, **Últimos 7 dias**, **Esta semana**, **Este mês**, **Mês anterior**, **Este ano** e **Personalizado** (abre duas datas com "até" e o botão **Aplicar**). Ela vale dos blocos abaixo pra baixo. Escolhendo **Mês anterior** (o mês fechado, do dia 1º ao último dia do mês passado), o quadro de novos clientes passa a se chamar **Novos no mês anterior**.
3. **Receita gerada pelo CRM** — os quadros **Receita atribuída** (campanhas + automações), **Mensagens enviadas**, **Converteram** (% dos enviados) e **Cupons usados**, mais o gráfico com os botões **Barras** e **Linha**.
4. **Campanhas mais rentáveis** — "Top 5 por receita no período selecionado", em cinco quadradinhos com a posição (**1º**, **2º**…), o nome da campanha, quanto ela fez em R$, quantas mensagens foram **enviadas** e quantos **pedidos** saíram. **Ver todas →** abre a aba Campanhas. Sem resultado no período: **"Nenhuma campanha gerou receita comprovada neste período."** — troque o período pra ver mais.
5. **Clientes mais valiosos** — "Quem mais gastou com o restaurante", com valor, nº de pedidos, último pedido, o selo do nível e **Ver ficha →**.
6. **Programa de relacionamento** — os quatro níveis em números grandes: **🥉 Bronze**, **🥈 Prata**, **🥇 Ouro** e **💎 Diamante**, cada um com **% da base**.

Para criar campanha, abra a aba **Campanhas**.

## Antes ainda: sua base precisa estar ligada para o WhatsApp (aba Clientes)
Se você montar uma campanha para toda a base e a audiência aparecer **zerada**, o problema quase sempre é este: a base que você **importou** entra desligada para o WhatsApp. Ela tem o telefone, mas ainda não entra em campanha.

Abra a aba **Clientes**. No topo fica o cartão **Saúde da base de contatos**, com o **Base total** no canto direito e três quadros:
- **Contactáveis (WhatsApp)** — "Têm telefone válido para campanha". É essa gente que a campanha enxerga.
- **Com e-mail** — "Canal alternativo de contato".
- **Conquistados pelo Foocci** — "Fizeram pedido real pelo app/cardápio (fora da base importada)".

Se houver quem ativar, aparece logo abaixo o aviso **"N clientes com telefone, mas desligados para WhatsApp"**, explicando que é a base importada que ainda não entra em campanha, com o alerta em amarelo: **"⚠️ Avise apenas quem consentiu. Ativar contatos importados sem opt-in pode gerar bloqueio no WhatsApp / questões de LGPD — a responsabilidade é sua."**

Para ligar:
1. Clique em **Ativar N para WhatsApp**.
2. Leia a confirmação que abre ("Ativar N cliente(s) para WhatsApp?") e confirme. O botão passa a **Ativando…**.
3. Quando terminar aparece **"✓ N clientes ativados para WhatsApp."** — **recarregue a página** para os números atualizarem. A campanha passa a enxergar essa audiência no próximo ciclo.

O que essa ação faz e o que **não** faz: ela liga **apenas** quem tem telefone e **não** pediu para sair (opt-out) — quem pediu opt-out continua fora. **Nenhuma mensagem é enviada na hora**: os clientes só passam a entrar nas campanhas, e todo envio continua respeitando horário, limites diários e a regra de 1× por campanha.

Se der problema, a tela diz: **"Não foi possível ativar agora. Tente novamente."** ou **"Falha de rede. Tente novamente."** — é só clicar de novo.

## 1. Escolha o período que você quer olhar
Na régua **Período:** clique em **Hoje**, **Ontem**, **Últimos 7 dias**, **Semana passada**, **Últimos 30 dias**, **Este mês**, **Mês anterior**, **Personalizado** (aí aparecem os campos de data "até") ou **Total**.

> **Mês anterior** é o mês fechado — do dia 1º ao último dia do mês passado. Use ele pra ver quanto o CRM rendeu no mês que acabou, sem precisar digitar as datas.

O bloco **Receita gerada pelo CRM** responde ao período escolhido, com os quadros **Receita atribuída**, **Mensagens enviadas**, **Converteram** (% dos enviados) e **Cupons usados**. O gráfico tem os botões **Barras** e **Linha**.

Ao lado fica o quadradinho **📤 Limite de envio** (mensagens/dia) e a **Distribuição** entre campanhas: **🎯 Por audiência**, **Igual p/ todas** ou **Manual**.

## 2. Caminho mais rápido: ligar uma campanha pronta
Desça até **Campanhas prontas** ("já vêm configuradas para qualquer restaurante — é só ligar"). Ligue a que interessa e use **Gerenciar** se quiser ajustar antes ou depois.

## 3. Criar a sua campanha
O bloco **Criar campanha personalizada** fica logo acima da lista de campanhas. Dois caminhos:

### a) Com IA — texto ou voz
Na caixa **✨ Criar campanha com IA** ("Descreva (ou fale) o que você quer — ex.: 'recuperar quem sumiu faz 30 dias com 10% de desconto' — e a IA monta pra você"):
1. Escreva no campo **Escreva aqui a campanha que você quer…**.
2. **Se preferir falar:** toque no **microfone** do canto direito do campo e fale. Embaixo aparece **"Gravando… fale e toque no microfone para parar"**; toque no microfone de novo e vem **"Transcrevendo o que você falou…"**. A sua fala **vira texto no próprio campo** — dá para corrigir na mão antes de seguir.
3. Clique em **Montar** (enquanto pensa, o botão fica **Montando…**). Campo vazio devolve **"Escreva ou fale o que você quer."**
4. Confira o **Rascunho da IA** — nome, o selo do público, o objetivo, o selo **cupom X%** quando você pediu desconto, e a mensagem — e clique em **Criar campanha**. Se não gostou, **Descartar** e tente de novo.

A campanha nasce como rascunho: você revisa e ativa na lista abaixo. Pediu desconto? A tela lembra: **"💡 Você pediu X% de desconto — crie o cupom na aba de cupons e ligue na campanha."**

> **Mudou em 05/08/2026:** antes existiam os botões **🎤 Falar** e **⏹ Parar** e o áudio ia direto para a IA montar sozinha. Agora o microfone fica dentro do campo e a fala **só vira texto** — quem aperta **Montar** é você, depois de ler. Se o navegador não souber gravar, o microfone nem aparece (antes ele aparecia e não funcionava).

### b) Manual
Clique em **Preencher manual**. A campanha nasce **pausada** de propósito e abre a janela **Gerenciar campanha**, com as abas **Visão Geral**, **Mensagem**, **Agendamento**, **Performance** e **Diagnóstico**.

## 4. Ajustar na janela "Gerenciar campanha"
- **Visão Geral** — **Editar nome da campanha** (+ **Salvar**) e **Público-alvo**: Todos os clientes, Clientes quentes, Clientes mornos, Clientes frios, VIPs (Ouro/Diamante), Fizeram só 1 pedido, Cadastrados sem compra, Recorrentes (2+ pedidos) (+ **Salvar**).
- **Mensagem** — o quadro **Frases da campanha** (ver abaixo, é o mais importante da janela).
- **Agendamento** — em **Editar agendamento** escolha os **Dias da semana**, a **Início** e **Fim** da janela de horário e o **Limite diário (mensagens)** (máximo 200/dia). Clique em **Salvar agendamento**.

## 5. As frases da campanha (aba Mensagem)
Na janela **Gerenciar campanha**, aba **Mensagem**, fica o quadro **Frases da campanha**: *"Ative as frases que vão rodar — cada envio sorteia uma das ativas, e os números mostram qual converte mais."*

**Nas campanhas prontas, todas as frases do catálogo já vêm ligadas.** Isso é o que o sistema realmente faz — cada envio sorteia uma das ativas, e ele precisa rodar todas para descobrir qual vende mais. (Até 07/08/2026 a tela mostrava só uma ligada enquanto o sistema já rodava as cinco: o controle mentia. Se você desligar alguma, sua escolha é respeitada e fica salva.)

Cada frase é uma linha com:
- a **chavinha** à esquerda para ligar/desligar. Ligada, a linha fica esverdeada. Não tem botão de salvar: mexeu, aparece **Salvando…** e depois **✓ Salvo**;
- o texto da frase e, quando a campanha tem cupom, o lembrete **"🎁 + linha do cupom no final (automática)"**;
- o selo de confiança do número: **🏆 Campeã** (converte bem acima da média, com envios suficientes), **✓ Confiável** (já dá para confiar no número) ou **🧪 Em teste** (poucos envios, número provisório);
- quando o WhatsApp oficial da Meta está em uso, o selo do modelo: **✓ Meta aprovada**, **⏳ Meta em análise**, **✗ Meta rejeitou** ou **Meta: na fila**;
- os números: **📤 N enviadas · 🛒 N pedidos · X%** (e o R$ quando houver) ou **sem envios ainda**.

Enquanto a campanha é nova, aparece em cima: **"📊 Coletando baseline — X/Y envios. Os números ainda estão maturando: o agente testa todas por igual antes de eleger favoritas."** Não escolha favorita antes disso — os números ainda não valem.

Se você desligar todas, o aviso amarelo avisa: **"Nenhuma frase ativa — a mensagem padrão da campanha continua rodando até você ativar pelo menos uma."**

**Para escrever a sua frase:** clique em **+ Nova frase personalizada (n/5)**, escreva no campo (*"Escreva sua frase… use {nome}, {cupom}, {validade}, {link_cardapio}"*), confira a **Prévia** que aparece embaixo e clique em **Adicionar frase** (ou **Cancelar**). As suas frases ficam com o selo **Sua frase** e têm o botão **Excluir** (ele pergunta antes: *"Excluir esta frase personalizada?"*). O limite é **5** — atingido, a tela diz **"Limite de 5 frases personalizadas atingido — exclua uma para criar outra."**

Duas campanhas não deixam você editar a mensagem, e a tela explica por quê: **"Campanha finalizada — a mensagem não pode ser editada."** e **"A mensagem desta campanha é gerenciada pelo sistema."**

## 6. Ligar e acompanhar
Em **Campanhas ativas** ("campanhas em execução, agendadas ou recorrentes") cada campanha tem **Pausar** / **Retomar** e o detalhe pelo **Gerenciar**. Em **Ver histórico geral** você vê os **Envios recentes (ao vivo)**, com data e hora.

## 7. Os dois limites (aba Configurações → Regras de Segurança)
Na aba **Configurações**, o cartão **Regras de Segurança** tem **dois** limites que não se confundem:

**a) Limite de mensagens por dia — 🟢 Limite oficial da Meta.** É o teto **oficial da Meta** para o seu WhatsApp Business, mostrado como **"X msgs/dia hoje"**. Ele **sobe sozinho** conforme a qualidade e o histórico do seu número, sem risco de bloqueio — e, quando a Meta informa, a tela ainda diz a **qualidade do número** (alta, média ou baixa). Abaixo ficam os valores congelados do modo seguro, só pra você ver: **Limite diário**, **Intervalo por cliente** (24 h), **Máx. por cliente/semana** (5), **Horário sem envio** (21h–8h), **Delay entre envios** (5–45 s) e **Fim de semana** (permitido).

**b) Limite de contatos (no total, para sempre).** É o teto de pessoas **diferentes** que o CRM pode abordar na **vida toda**. Cuidado para não confundir: o de cima é **por dia** e reseta todo dia; este **acumula e nunca zera sozinho**. Cada pessoa conta 1 vez, mesmo recebendo várias campanhas. **0 = sem limite.** Ao lado, **Contatos restantes** mostra "X de Y" com a barrinha de uso.

Quando o teto acaba, a barra fica amarela e aparece o aviso **"Limite de contatos atingido"**: o CRM **para de abordar pessoas novas** — quem já está na conta continua recebendo normalmente. Para voltar a falar com clientes novos, aumente o **Máximo de pessoas** (ou coloque **0 = sem limite**) e salve. **Esse campo é seu e não depende do controle manual** — ele é limite de gasto, não regra de proteção do número.

No rodapé do cartão, as **Proteções sempre ativas**: quem pediu para sair (opt-out) nunca mais recebe, sem telefone válido ninguém recebe, a mesma campanha não chega duas vezes pra mesma pessoa e quem já recebeu algo hoje espera o intervalo (só o aniversário passa na frente).

Ao final, clique em **Salvar configurações**.

## 8. Mandar um WhatsApp para um cliente só (aba Clientes)
Fora das campanhas, dá para falar com uma pessoa específica:

1. Na aba **Clientes**, clique em **WhatsApp** na linha do cliente (ou **Enviar WhatsApp** no cartão dele). Quem pediu para sair aparece como **Opt-out** e quem não tem número como **Sem telefone** — nesses casos o botão não existe.
2. Abre a janela **Enviar WhatsApp para** *(nome do cliente)*, com o telefone embaixo e uma mensagem já sugerida ("Oi, *primeiro nome*! Tudo bem? 😊 Passando para dizer que estamos aqui caso queira fazer um pedido…"). Edite à vontade no campo **Digite ou fale a mensagem…** (até 4096 caracteres — o contador fica no canto).
3. **Para ditar:** toque no **microfone** do canto do campo, fale, toque nele de novo para parar. A fala **é acrescentada ao texto que já está lá** — releia tudo antes de mandar.
4. Clique em **Enviar WhatsApp** (fica **Enviando…**). Deu certo, aparece **"Mensagem enviada pelo WhatsApp."** e o atalho **Ver conversa em Atendimento →**. Deu errado, a janela mostra o motivo e você tenta de novo. **Cancelar** fecha sem enviar.

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
    description: "Entender os números e seções da tela inicial, do período aos Destaques e à origem do faturamento.",
    content: `# Como ler o painel inicial (Início)

No menu lateral, **Início** é o resumo do seu negócio. O topo dá bom dia (ou boa tarde/boa noite), mostra a data e avisa que é **visão em tempo real** — com o período **Hoje**, os números se atualizam sozinhos a cada 2 minutos.

## Primeiro, escolha o período
No canto de cima ficam os botões **Hoje**, **Ontem**, **Esta semana**, **7 dias**, **Este mês**, **Mês anterior**, **30 dias** e **Personalizado** (esse último abre duas datas, "de … **até** …").

> **Mês anterior** é o mês fechado — do dia 1º ao último dia do mês passado. É o botão pra usar quando você quer fechar o mês sem ficar escolhendo data na mão. Ele se compara com o mês retrasado.

Essa escolha vale pra **tela toda**: todo número, gráfico e destaque abaixo é do período escolhido e se compara com a janela anterior.

## Saúde do negócio
Os cinco números do período, cada um com a variação em % vs. o período anterior:
**Faturamento**, **Pedidos**, **Ticket médio**, **Novos clientes** e **Taxa de conversão** (quantos dos que entraram compraram — ex: "8 compraram de 40 que entraram").

## Receita no período
O gráfico de barras do faturamento. Em **Hoje**/**Ontem** cada barra é uma hora; em períodos longos, um dia. A barra escura é **Atual** e a barra clarinha do lado é a janela de comparação (a legenda embaixo diz qual). A barra laranja é a mais recente com venda. Passe o mouse pra ver o valor exato.

## Destaques
Ao lado do gráfico, o "diário" do período — os melhores números, em frase curta: quanto faturou acima (ou abaixo) da janela anterior, o **Campeão** de vendas, o **Pico** de horário (ou o **Melhor dia**), ticket médio que subiu, clientes novos, carrinhos recuperados, dinheiro a mais com sugestões e conversão. Aparecem até 6, só o que tiver número no período. Sem vendas ainda, aparece **Sem destaques ainda**.

## Origem do faturamento
De onde veio **cada real** do período ("de onde veio cada real no período"), num gráfico de rosca com o **total** no meio. Hoje são **três** origens, e a legenda ao lado mostra o valor em R$, a % e uma dica de cada uma:
- **CRM** — campanhas e automações.
- **Garçom / Indicações** — recomendou ou indicou (foi o agente do Foocci que puxou a venda).
- **Espontânea** — cliente por conta própria.

Cada pedido entra em uma origem só, então a soma fecha com o **Faturamento** lá de cima. Passando o mouse na fatia, ela diz a origem, o valor e a %. Sem venda no período, aparece **Sem faturamento no período** ("Quando entrarem vendas, mostro de onde cada real veio").

## Foocci em ação
O que o Foocci fez por você — e cada quadro leva pra tela onde você age: **Vendas no upsell** (vai pro Analytics), **Carrinhos recuperados** (recuperados/abandonados, vai pro CRM) e **Clientes quentes (CRM)**, com mornos e frios embaixo.

## Operação agora
Os pedidos em andamento por etapa: **Aguardando**, **Em preparo**, **Prontos** e **Em entrega**, com os avisos **⏱ atrasado(s)** e **💳 aguardando pagamento** quando houver. O título leva pra tela **Pedidos**. Sem nada aberto, mostra **Nenhum pedido em andamento**.

## Mais vendidos
O ranking dos produtos ("top 10 no período"), com a quantidade vendida de cada um.

## Conversão por canal
Quantos dos clientes identificados compraram em cada porta de entrada — **WhatsApp**, **Cardápio (link)**, **QR na mesa** e **Instagram** — com a % de agora e a de antes.

## No rodapé
À esquerda, se houver, aparece o aviso discreto de **ajustes de configuração pendentes** (leva pra tela do ajuste). À direita, **Ver análise completa →** abre o Analytics.`,
  },
  {
    slug: "guia-central-conversas",
    title: "Como atender clientes na Central de Conversas",
    area: "WHATSAPP",
    description: "Ler conversas, assumir da IA, responder (digitando ou falando), resolver e entender o selo que avisa quando um canal para de receber.",
    content: `# Como atender clientes na Central de Conversas

No menu lateral, **Central de Conversas** reúne todas as conversas (WhatsApp, Cardápio, Instagram).

## O selo no topo: quando um canal para de receber
Lista vazia nunca foi prova de que está tudo bem — um canal fora do ar e um dia parado davam exatamente a mesma tela. Por isso, quando o **Instagram** para, aparece **um selo de uma linha no topo da Central**: uma bolinha colorida, o que está acontecendo e, ao lado, o próximo passo sublinhado. O selo inteiro é clicável e leva para a tela do Instagram em Integrações:

- bolinha **vermelha** — *"Instagram fora do ar — as mensagens não estão chegando."* → **Reconectar**
- bolinha **âmbar** — *"Instagram sem receber mensagens — confira a conexão."* → **Abrir Integrações**
- bolinha **azul** — *"Instagram só recebe: ainda não dá para responder por aqui."* → **Ativar resposta em Integrações**

**Aqui cabe uma linha, e isso é de propósito.** Quem está com cliente esperando não conserta conexão: o motivo técnico — a resposta literal da Meta — **não aparece nesta tela**. O aviso inteiro (o que fazer, o botão **Reconectar agora** e a dobra **Detalhes técnicos (para o suporte)**) mora em **Plataforma → Integrações → Instagram**, que é a tela de quem conserta. Até 24/08/2026 esse texto todo ficava aqui, numa tarja vermelha que comia um terço da tela do celular e empurrava a fila de conversas para baixo. O aviso **não foi apagado** — mudou de tela.

O que esse selo **não** faz, de propósito:
- não acende para canal que você nunca ligou, nem para canal que **você mesmo** pausou;
- não fica vermelho só porque está quieto — vermelho só quando existe um **erro registrado**. Silêncio, por mais longo que seja, no máximo fica âmbar;
- **selo ausente não quer dizer "canal saudável"**: quando o painel não consegue ler o estado do canal, o selo some calado em vez de dizer que está tudo bem;
- o **WhatsApp** ainda não entra nesse selo — não existe hoje registro de última mensagem recebida por provedor, e avisar sem esse dado seria chute.

O selo fica **acima** das duas colunas, então no celular ele continua à vista mesmo com a conversa aberta, e o painel reconfere o estado dos canais a cada 5 minutos.

## Encontrar a conversa
- Busque por **Nome, telefone ou mensagem…**. A busca é feita no servidor: ela alcança **toda** a sua base de conversas, inclusive as antigas que ainda não estão carregadas na lista.
- Use **Ordenar** (Mais recentes, Mais antigas, Nome A–Z, Nome Z–A, Canal).
- Filtre pelos chips: **Todas**, **Humano**, **Aguardando**, **Staff**, **CRM**, **📷 Instagram** e **Resolvidas**. O chip **📷 Instagram** também busca no servidor — um Direct de semanas atrás aparece ali mesmo com muito WhatsApp por cima.
- Quando alguém pede atendente, aparece **"🙋 X aguardando atendimento humano"** — clique em **Ver pendentes**.
- Sem resultado, a lista diz **"Nenhuma conversa encontrada."** (no filtro **Staff**: **"Nenhuma conversa classificada como staff."**).

## Assumir e responder
1. Abra a conversa.
2. Clique em **Assumir atendimento** — a IA para de responder e o campo de mensagem libera.
3. No campo **Digite ou fale…**, escreva e clique em **Enviar** (ou tecle Enter; Shift+Enter pula linha). Para anexar imagem ou PDF, use o **📎** ao lado — o anexo aparece com o nome do arquivo e o campo passa a pedir **Legenda (opcional)…**; o **✕** tira o anexo.
4. Ao terminar, clique em **Devolver para IA** (a IA volta a responder) ou **Resolver** para encerrar.

## Falar em vez de digitar
Dentro do campo de mensagem, do lado direito, tem um **microfone**. Serve para quem está com as mãos ocupadas na cozinha.

1. Toque no microfone e fale. Embaixo aparece **"Gravando… fale e toque no microfone para parar"**.
2. Toque nele de novo para parar. Aparece **"Transcrevendo o que você falou…"** e, em seguida, **a sua fala vira texto no campo**.
3. **Leia o que ficou escrito e clique em Enviar.** O áudio nunca vai sozinho para o cliente — mensagem errada enviada custa mais caro que um toque a mais.

Se algo der errado, o aviso embaixo do campo diz o próximo passo e **a gravação fica guardada ali**, com **Tentar de novo** e um tocador para você ouvir o que gravou. Exemplos de aviso: **"O microfone está bloqueado para este site. Toque no cadeado ao lado do endereço, marque Permitir microfone e tente de novo."**, **"Outro aplicativo está usando o microfone. Feche a chamada ou o gravador que está aberto e tente de novo."** e **"O áudio ficou longo demais. Grave um trecho mais curto e mande em duas partes."**

> O microfone só aparece se o navegador do seu aparelho souber gravar.
> **Instagram** (Direct e comentários) e **Messenger** só aceitam texto — nessas conversas o **📎** não aparece. Em comentário do Instagram o campo diz **Responda o comentário…**, e a resposta sai pública.

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
    description: "Ler KPIs, abas e perguntar ao analista de dados — digitando ou falando.",
    content: `# Como entender seus números (Analytics)

No menu lateral, **Vendas → Analytics**. Escolha o período (**Hoje, Ontem, 7 dias, 30 dias, Mês anterior, 90 dias, 12 meses, Personalizado**) e navegue pelas abas:

> **Mês anterior** pega o mês fechado inteiro — do dia 1º ao último dia do mês passado. Serve pra fechar o mês sem digitar data.

- **Visão Geral** — KPIs (Receita, Pedidos, Ticket médio, Novos clientes, Cancelamentos), receita incremental do Foocci, eficiência operacional e o **Diagnóstico do período**.
- **Analista** — faça uma pergunta em linguagem natural (ex: "Por que as vendas caíram?"), digitando **ou falando**, e receba resposta baseada nos seus dados. Detalhe mais abaixo.
- **Produtos** e **Categorias** — o que mais vende e itens parados.
- **Clientes** — retenção, top clientes, segmentos e tiers.
- **Canais** — origem dos pedidos.
- **Receita Incremental** — o que o Foocci vendeu a mais via sugestões.
- **Cardápio Delivery** — visitas e pedidos por canal, com links rastreáveis para copiar.

## Perguntar ao Analista (aba Analista)
No topo da aba fica o cartão **Analista de Dados**: "Faça uma pergunta sobre o seu negócio. As respostas são baseadas nos dados reais do período selecionado — sem invenções."

1. Em **Perguntas rápidas** dá para clicar numa pronta e ela já é enviada: **Por que as vendas caíram?**, **Quais produtos mais venderam?**, **Os clientes estão voltando?**, **Como está a operação?** ou **O que devo fazer hoje?**.
2. Ou escreva a sua no campo **Digite ou fale sua pergunta** e clique em **Perguntar** (tecle Enter que dá no mesmo).
3. **Prefere falar?** Toque no **microfone** dentro do campo, fale a pergunta e toque nele de novo para parar. Enquanto grava, embaixo aparece **"Gravando… fale e toque no microfone para parar"**; depois, **"Transcrevendo o que você falou…"**. O texto cai no campo — **leia e clique em Perguntar**. A fala não é enviada sozinha.

A resposta abre num cartão com o assunto que a IA entendeu e o selo **Alta confiança**, **Média confiança** ou **Baixa confiança**, seguido de **Métricas**, **Ações recomendadas**, **Limitações dos dados** (quando existem) e **Perguntas de continuidade** — clique numa delas para puxar o assunto adiante.

> A resposta usa o **período escolhido lá no topo da tela**. Trocou o período? Pergunte de novo.
> O microfone só aparece se o seu navegador souber gravar — no aparelho que não grava, ele não é desenhado. Se der problema, a mensagem embaixo do campo diz o que fazer (ex.: **"O microfone está bloqueado para este site. Toque no cadeado ao lado do endereço, marque Permitir microfone e tente de novo."**) e a gravação fica guardada ali com **Tentar de novo** — o que você falou não se perde.

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
    description: "Os três QR Codes da tela Cardápio (Salão, Cardápio sem IA e Delivery): qual usar em cada lugar, como baixar e como copiar o link.",
    content: `# Como compartilhar o cardápio digital (QR Code e link)

No menu lateral, **Vendas → Cardápio**. No topo da tela ficam **três** cartões de QR Code, do mais simples ao mais completo. Cada um abre um link diferente — escolha pelo que você quer que o cliente faça.

## Os três cartões

**1. QR Code Salão** — "Cardápio digital — sem pedido"
O cliente lê o cardápio e pronto: **não tem carrinho nem checkout**. A dica do cartão diz o resto: *"Cole nas mesas para que os clientes consultem o cardápio. Leitura apenas — sem carrinho ou checkout."*
Use para: mesas, balcão, vitrine. Substitui o cardápio de papel.

**2. QR Code Cardápio sem IA** — "Pedido online — sem IA"
O cliente vê o catálogo, escolhe os itens, monta o carrinho e **paga online — sem conversar com ninguém**. A dica do cartão: *"O cliente vê o catálogo, monta o carrinho e paga online, sem IA. Ideal para quem prefere pedir direto."*
Use para: quem quer pedir rápido, no jeito de aplicativo, sem bate-papo. O link tem o trecho **?modo=loja** no fim — é ele que garante a versão sem IA, mesmo que o seu plano tenha o agente ligado.

**3. QR Code Delivery** — "Pedido online completo"
É a experiência completa, **com o agente de IA**: o cliente conversa, o agente sugere, monta o pedido e ele paga online. A dica do cartão: *"Compartilhe para delivery e retirada. O cliente conversa com o agente, monta o pedido e paga online."*
Use para: bio do Instagram, status e conversas de WhatsApp, delivery e retirada.

> Os três cartões mostram o selo **Ativo** no canto direito do topo: os links já estão no ar, não há nada para "ligar".

## O que fazer em cada cartão
Todos os três funcionam igual:

1. **Link público** — o link aparece na caixinha; clique nele e o texto já vem selecionado.
2. **📋 Copiar link** — copia para colar onde você quiser. O botão vira **✓ Copiado!** por dois segundos para você ter certeza.
3. **⬇ Baixar QR** — salva a imagem do QR Code (PNG) no seu computador ou celular, pronta para imprimir. O arquivo já vem com nome que diz qual é: *salao-qr…*, *cardapio-sem-ia-qr…* ou *delivery-qr…*.
4. **👁 Visualizar** — abre o cardápio numa aba nova, exatamente como o cliente vê. Confira aqui antes de imprimir ou divulgar.

## Dicas de uso
- **Imprima o QR do Salão** e cole nas mesas; guarde o do Delivery para o digital (bio, status, respostas automáticas).
- **Faça o teste você mesmo:** leia o QR com o celular antes de mandar para a gráfica.
- Cada alteração no Cardápio (preço, foto, item esgotado) aparece **na hora** nos três links — o QR impresso não precisa ser trocado.
- Para saber **de onde** vêm os acessos e os pedidos, gere versões rastreáveis em **Marketing → Canais** em vez de espalhar o link cru.`,
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
    description: "Visão geral das integrações, o que cada selo quer dizer (inclusive o \"Sem receber\"), como conectar o Instagram e o que fazer quando ele para de receber — esta é a tela do aviso completo, com Reconectar agora e os detalhes técnicos.",
    content: `# Quais integrações existem e como conectar

No menu lateral, **Plataforma → Integrações**. Cada cartão tem um selo de status:

- **Ativo** (verde) — conectado e recebendo.
- **Sem receber** (amarelo) — conectado, sem erro nenhum registrado, mas **nada chega há mais de 48 horas**. Não é o mesmo que **Erro**: pode ser só movimento baixo. Mas se você espera mensagem, confira a conexão.
- **Erro** (vermelho) — o provedor registrou uma falha. Aqui existe prova de que quebrou.
- **Validação pendente** — configurado, esperando a primeira mensagem chegar para provar que funciona.
- **Não conectado** / **Não configurado** — falta ligar.

No topo da lista, os quadradinhos de resumo contam: **Total**, **Conectado**, **Pendente**, **Sem receber** (só aparece quando existe algum) e **Com erro** (idem). Canal mudo tem quadradinho próprio de propósito — antes ele era somado no **Conectado**, e era exatamente por isso que dava para passar duas semanas com um canal morto marcado como saudável.

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
2. Clique em **Entrar com Instagram** — é o caminho principal e **não precisa de Facebook**. Sua conta precisa ser **Profissional** (Comercial ou Criador), o que é de graça nas configurações do Instagram.
3. **Alternativa**, se o seu Instagram já está ligado a uma Página do Facebook: clique em **Conectar com Facebook**, autorize na Meta e, em **Escolha a Página do Facebook**, selecione a Página e clique em **Conectar esta Página**.
4. Conectado, o cartão verde **Conectado** mostra a conexão, o **@** da conta, o **Modo**, o **Recebimento** (Todos os clientes ou Só conta de teste) e o **Último Direct recebido**.
5. Clique em **Rodar diagnóstico** — ele confere conta, Instagram profissional, token, webhook, Central e envio real, e **não manda mensagem nenhuma**.
6. Para receber de verdade dos seus clientes (e não só da conta de teste), clique em **Receber de todos os clientes**.

As mensagens do Instagram Direct e os comentários passam a aparecer na **Central de Conversas**, com o selo **Instagram DM**.

### Quando o Instagram para de receber
Estar escrito **Conectado** não garante que está chegando mensagem. Se a conexão adoecer, o próprio cartão verde passa a mostrar, em vermelho:

**"Instagram fora do ar — as mensagens do Instagram não estão chegando."** e, embaixo: *"Enquanto isto durar, nenhum Direct entra na Central de Atendimento. Clique em **Reconectar agora** e autorize a conta de novo. Se o problema voltar logo depois de reconectar, não é a sua conta: é a autorização do aplicativo Foocci na Meta, e quem resolve é o suporte — mande este texto para a gente."*

Clique em **Reconectar agora** e refaça o login — é seguro, a configuração é regravada igual.

Embaixo do botão fica a dobra **Detalhes técnicos (para o suporte)**, fechada. Abra só se for falar com o suporte: ali dentro está a resposta crua da Meta, para copiar e mandar para a gente. **Esta é a tela do aviso inteiro** — na Central de Atendimento o mesmo problema aparece encolhido num selo de uma linha, sem o texto técnico, porque quem está atendendo cliente não conserta conexão.

E quando **não há erro nenhum**, mas simplesmente parou de chegar, aparece um aviso amarelo logo abaixo do **Último Direct recebido**:

**"Nenhuma mensagem chegou nas últimas 48 horas. Pode ser movimento baixo — mas se você espera Directs, rode o diagnóstico ou reconecte a conta."**

Esse aviso existe porque a data sozinha não denuncia nada: um **"Último Direct recebido: 23/07"** do lado de um selo verde passa por normal — e já passou por treze dias. Pelo mesmo motivo, na lista de conferência do fim da tela o item **"Webhook configurado / mensagens chegando"** só fica marcado se a última mensagem for **recente**; carimbo velho não conta mais como "chegando". O selo do cartão em **Integrações** vira **Sem receber** ao mesmo tempo, e a **Central de Conversas** mostra, no topo, o selo *"Instagram sem receber mensagens — confira a conexão."* com o atalho **Abrir Integrações**.

Há também o botão **Reconectar Instagram**, ao lado do **Rodar diagnóstico**: use quando quiser renovar o acesso **sem** passar pelo **Desconectar**.

Logo depois de conectar, dois avisos merecem atenção porque dizem "conectado" e ainda assim não funcionam:
- **"Conectado, mas a conexão NÃO durou: o Instagram devolveu um acesso de 1 hora em vez do de 60 dias. Tente conectar de novo e, se repetir, avise o suporte Foocci — o motivo fica registrado no Diagnóstico."**
- **"Conectado, mas a conta não ficou inscrita para receber as mensagens — nenhuma DM vai chegar. Tente conectar de novo; o motivo fica registrado no Diagnóstico."**

Nos dois casos: **conecte de novo**. Se repetir, chame o suporte Foocci — o motivo fica guardado no **Diagnóstico**.

> Outros botões do cartão: **Ativar resposta manual**, **Restringir a conta de teste**, **Pausar** / **Despausar**, **Desconectar** (o histórico de conversas é preservado) e **Abrir Central de Atendimento**.`,
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
**Vendas → Cardápio** (topo): são três cartões de QR. Baixe o **QR Code Salão** para as mesas e copie o link do **QR Code Delivery** para a bio do Instagram e o WhatsApp. O do meio, **QR Code Cardápio sem IA**, é o mesmo pedido online sem o bate-papo — bom para quem prefere escolher direto no catálogo.

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
- **Início**: confira **Saúde do negócio** (faturamento, pedidos, ticket médio) e o bloco **Destaques** — o diário do período, ao lado do gráfico.
- **Origem do faturamento**: veja de onde veio cada real — **CRM**, **Garçom / Indicações** ou **Espontânea**.
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

Ao fim dos três passos a tela avisa: **"✅ Pronto! O Carteiro acha a impressora sozinho"** — você **não precisa escolher marca nem modelo**, e a partir do pareamento cada pedido imprime automaticamente.

Quando der certo, o topo mostra **"Carteiro conectado"** com as impressoras detectadas. Se já estiver pareado, o passo 3 mostra **"✓ Já conectado — não precisa fazer de novo."**

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
    description: "Ativar o som no topo do painel, som de novo pedido e de atendimento humano, volume e temas.",
    content: `# Como configurar sons e alertas

## Antes de tudo: ativar o som no topo (1 clique)
Na **faixa branca do topo**, logo depois do nome da tela, fica o controle de som — ele aparece em **todas as abas** do painel:

- **🔔 Ativar som** (laranja, piscando) — é o primeiro acesso naquele navegador. Clique **uma vez**: o navegador libera o som e a escolha fica gravada, então não pergunta mais a cada vez que você abre o painel.
- **🔔 Som ativo** — já está tudo liberado. Clicando, vai direto pra tela de sons.
- **🔕 Sons off** — o som está **desligado nas configurações**. Clique pra abrir a tela e ligar.

No celular aparece só o sininho (sem o texto), pra não atrapalhar o resto do topo.

Regra de ouro: **mantenha a tela do painel aberta** no computador do restaurante — é ela que toca os alertas.

## Ajustar os sons
Vá em **Configurações → Sons e alertas**.

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
