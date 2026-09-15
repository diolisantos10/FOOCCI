# Cold runtime wiring

`FoocciSalesInbound` is the live sales-number inbound entry and now executes `WhatsappBotGate` before TA.

`ColdLeadInboundPolicy` composes the complete intended pre-TA policy: bot/menu interception first, explicit referred-contact persistence second, TA only for a human conversation. The referral pieces are deliberately separated for unit testing and conservative extraction.

The next wiring point for structured WhatsApp contact cards is the normalized Meta webhook message (`messages[].contacts`), using `contactCards.ts`; cards must feed the same `registrarDecisorIndicado` service rather than creating a second referral implementation.
