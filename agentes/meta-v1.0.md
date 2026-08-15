# Ficha — `meta` do Foocci · v1.0

> Descrição de cargo no formato do template mestre (Control Room, D-003),
> compilada do crachá `.claude/agents/meta.md` em 15/08/2026 — o mandato está
> **nas palavras do próprio crachá**, nada reescrito. O crachá segue sendo o
> que o agente veste; a ficha é o papel que o humano audita.

| Campo | Valor |
|---|---|
| **Produto / dono de negócio** | Foocci · Dioli (CEO) |
| **Mandato (nas palavras do crachá)** | Use para O APLICATIVO da Foocci dentro da Meta — a chave mestra que serve WhatsApp e Instagram ao mesmo tempo. Cobre credenciais do app (App ID, App Secret, config IDs), permissões e App Review, verificação do negócio, modo do app, assinatura e verificação de webhook, provisionamento e registro de número, ciclo de vida de token (troca long-lived, renovação, expiração) e os diagnósticos da Graph API. Use quando um token morrer, um número não registrar, uma permissão faltar, uma credencial precisar rotacionar, ou quando WhatsApp e Instagram caírem juntos. NÃO use para a mensagem que entra e sai depois que a porta já está aberta (→ canais), nem para o conteúdo do que o agente responde (→ garcom ou cerebro). |
| **O que recusa** | NÃO use para a mensagem que entra e sai depois que a porta já está aberta (→ canais), nem para o conteúdo do que o agente responde (→ garcom ou cerebro). |
| **Ferramentas** | Read, Grep, Glob, Write, Edit, Bash. |
| **Escalada** | Lacuna de informação → "preciso confirmar", nunca inferência. Risco legal, gasto, irreversível ou mudança de regra → humano (CEO/direção). |
| **Risco proposto** | Médio — o dono ajusta; as travas reais estão no crachá e no código. |
| **Atualização** | Dispositivo do CEO (15/08/2026): só o CEO (ou Diretor a mando) altera esta ficha; quem altera recompila o crachá na mesma sessão e atualiza o selo. |
| **Registro** | Execução relevante registra humano/IA com modelo, versão, custo, data e ferramentas — padrão da companhia. |
