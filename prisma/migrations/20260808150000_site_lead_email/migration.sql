-- E-mail do contato — o SEGUNDO caminho de volta até o lead.
--
-- Por que existe: em 08/08/2026 a Dioli Digital encontrou três contatos parados
-- há 51, 29 e 28 dias sem nenhuma resposta. O formulário guardava a conversa
-- inteira e um único caminho de contato — o WhatsApp. Um dígito trocado, um
-- número sem WhatsApp ou um chip que mudou de dono e o contato morre em
-- silêncio. Venda perdida medida, não hipótese.
--
-- O campo é OBRIGATÓRIO no formulário (a trava é o `createSiteLeadSchema`, no
-- servidor) e NULLABLE na coluna. Os dois não se contradizem:
--   • obrigatório na porta = nenhum contato NOVO entra sem caminho de volta;
--   • nullable na coluna   = os contatos que já existem não têm e-mail, e
--     preencher com um valor inventado (ou com string vazia) transformaria
--     "não perguntamos" em "ele não tem" — que é o guardrail 1 ao contrário.
--
-- Índice de busca: quem atende cola no campo de busca o que chegou (um código,
-- um telefone, um e-mail). Sem índice o `contains` varre a tabela; com ele a
-- busca por e-mail custa o mesmo que as outras.
--
-- Aditiva: coluna nova opcional, nenhuma linha existente muda, nenhum default.

ALTER TABLE "SiteLead" ADD COLUMN IF NOT EXISTS "email" TEXT;

CREATE INDEX IF NOT EXISTS "SiteLead_email_idx" ON "SiteLead"("email");
