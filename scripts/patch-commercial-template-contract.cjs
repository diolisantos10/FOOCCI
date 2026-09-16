/*
 * Hotfix operacional 15/09/2026.
 *
 * A Meta confirmou ao vivo que os cinco templates comerciais verdes usam:
 *   {{1}} = nome do restaurante
 *   {{2}} = proveniência/origem pública
 *
 * O código legado de abordar.ts ainda montava, para lista fria:
 *   [restaurante, restaurante, proveniência]
 * e ao cortar para 2 variáveis enviava o restaurante duas vezes.
 *
 * Este patch é aplicado no build de produção para alinhar imediatamente o
 * caminho normal da Sala Comercial enquanto a refatoração definitiva é feita
 * em código-fonte revisado. É idempotente: se a correção já estiver no fonte,
 * o build segue normalmente.
 */
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(process.cwd(), 'src/services/salaDeVendas/abordar.ts');
const source = fs.readFileSync(file, 'utf8');

const before = `function camposDoModelo(lead: LeadParaOsParametros): Array<{ rotulo: string; valor: string | null }> {
  return [
    // Contrato lido do template APPROVED \`abordagem_restaurante_fria\` na Meta:
    // "Olá, {{1}} ... falando com o {{2}} porque encontramos ... em {{3}}".
    // A ordem é parte do texto aprovado e não pode ser inferida pela quantidade.
    {
      rotulo: "nome do contato",
      valor: saudacaoDoLead(lead),
    },
    { rotulo: "nome do restaurante", valor: (lead.restaurante ?? "").trim() || null },
    { rotulo: "procedência da lista", valor: (lead.proveniencia ?? "").trim() || null },
  ];
}`;

const after = `function camposDoModelo(lead: LeadParaOsParametros): Array<{ rotulo: string; valor: string | null }> {
  // Contrato confirmado AO VIVO na Meta em 15/09/2026 para os cinco templates
  // comerciais liberados: {{1}} = restaurante; {{2}} = proveniência/origem.
  // Para lista fria, nunca inferimos "nome da pessoa": a base contém empresas.
  if (lead.fonte === FONTE_DE_LISTA) {
    return [
      {
        rotulo: "nome do restaurante",
        valor: (lead.restaurante ?? lead.nome ?? "").trim() || null,
      },
      {
        rotulo: "procedência da lista",
        valor: (lead.proveniencia ?? "").trim() || null,
      },
      // Reserva somente para eventual modelo legado de 3 variáveis. Os cinco
      // modelos verdes atuais pedem exatamente duas.
      { rotulo: "cidade", valor: (lead.cidade ?? "").trim() || null },
    ];
  }

  // Leads inbound/mornos preservam o contrato legado até haver um modelo
  // específico para essa origem.
  return [
    {
      rotulo: "nome do contato",
      valor: saudacaoDoLead(lead),
    },
    { rotulo: "nome do restaurante", valor: (lead.restaurante ?? "").trim() || null },
    { rotulo: "procedência da lista", valor: (lead.proveniencia ?? "").trim() || null },
  ];
}`;

if (source.includes(before)) {
  const patched = source.replace(before, after);
  fs.writeFileSync(file, patched, 'utf8');
  console.log('[patch-commercial-template-contract] aplicado: lista fria = [restaurante, proveniência]');
  process.exit(0);
}

if (source.includes(after) || source.includes('rotulo: "procedência da lista"')) {
  console.log('[patch-commercial-template-contract] correção já presente no fonte; nada a aplicar');
  process.exit(0);
}

console.error('[patch-commercial-template-contract] contrato esperado não encontrado; build interrompido');
process.exit(1);
