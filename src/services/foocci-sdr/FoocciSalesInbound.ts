/**
 * FoocciSalesInbound — entrada do WhatsApp comercial da Foocci.
 * Reconhece/cria o prospect, honra opt-out, persiste a conversa e só então
 * entrega mensagens humanas ao TA. Automações passam primeiro pelo BotGate.
 */
import { prisma } from "@/lib/prisma";
import { extractLeadCode } from "@/lib/site/leadCode";
import { detectOptOutIntent } from "@/services/crm/ContactSafetyService";
import { analisarWhatsappBr } from "@/lib/whatsapp-br";
import { normalizaWhatsapp } from "@/services/foocci-crm/leadOrigin";
import { registrarEntrada, descricaoParaIA } from "@/services/salaDeVendas/conversa";
import { comIdentidade, comoSistema } from "@/services/salaDeVendas/identidadeNoBanco";
import { atenderComOTA, type ResultadoDoTurno } from "@/services/salaDeVendas/ta/atender";
import { comATravaDaConversa } from "@/services/salaDeVendas/travaDaConversa";
// O relógio da primeira resposta nasce com o contato — ver
// `salaDeVendas/recepcao/prazoDaPrimeiraResposta.ts`. Quem já chega pedindo
// silêncio não ganha prazo: não existe resposta a dever a quem mandou calar.
import { prazoDaPrimeiraResposta } from "@/services/salaDeVendas/recepcao/prazoDaPrimeiraResposta";
import { iaAssumeSeEstaLivre } from "@/services/salaDeVendas/responsavel";
import { aplicarPoliticaAntesDoTA } from "./ColdLeadInboundPolicy";
// ⭐ 19/09/2026 — o anúncio clique-para-WhatsApp. Ver `anuncioDeOrigem.ts`: o
// `referral` da Meta sempre chegou neste webhook e sempre foi descartado.
import { camposDeOrigemDoAnuncio, FONTE_DO_ANUNCIO, motivoDaPromocaoPorAnuncio, nomeDoAnuncio, notaDoAnuncio, veioDeAnuncio, type ReferralDeAnuncio } from "./anuncioDeOrigem";
import { veioDeListaFria } from "@/services/salaDeVendas/frioOuLead";
import { AUTORIA_SISTEMA, promoverFrioParaLead } from "@/services/salaDeVendas/jornadaComercial";
import { marcarPrazoDePrimeiraResposta } from "@/services/salaDeVendas/recepcao/prazoDaPrimeiraResposta";
import { FONTES_QUE_NOS_PROCURARAM } from "@/services/salaDeVendas/recepcao/portasDeEntrada";
import type { SiteLeadSource } from "@prisma/client";
import { carimbarTurno, chegouEntradaDepois, esperar, janelaDeAgrupamento, juntarEntradasDoTurno } from "@/services/salaDeVendas/ta/agrupamento";
import type { TipoDaMensagem } from "@prisma/client";

export interface LeituraDaMensagem { codigo: string | null; pedeSilencio: boolean; temTexto: boolean }
export function interpretarMensagemDeVendas(text: string | null | undefined): LeituraDaMensagem {
  const t=(text??"").trim(); return { codigo:t?extractLeadCode(t):null, pedeSilencio:detectOptOutIntent(t), temTexto:t.length>0 };
}
export type EntradaDeVendasStatus="RECONHECIDO_POR_CODIGO"|"RECONHECIDO_POR_TELEFONE"|"CONTATO_NOVO"|"PEDIU_SILENCIO"|"FALHOU";
export interface EntradaDeVendas { status:EntradaDeVendasStatus; leadId:string|null; codigo:string|null; detalhe:string; ta?:ResultadoDoTurno }
export interface MensagemDeVendas { referral?:ReferralDeAnuncio|null; fromPhone:string; text:string|null; profileName?:string|null; agora?:Date; waMessageId?:string|null; tipo?:TipoDaMensagem; tipoCru?:string|null; legenda?:string|null; midiaId?:string|null; midiaMimeType?:string|null; midiaNome?:string|null; duracaoSeg?:number|null }
type LeadResumo={id:string;codigo:string|null;optOutAt:Date|null;fonte?:SiteLeadSource;virouLeadEm?:Date|null};

/** A fonte já é uma porta da frente? Mesma régua de `importarMetaLead`. */
function fonteEhVistaPelaRecepcao(fonte:SiteLeadSource|null|undefined):boolean{
 return fonte?(FONTES_QUE_NOS_PROCURARAM as readonly SiteLeadSource[]).includes(fonte):false;
}

/**
 * ⭐ O LEAD DE ANÚNCIO QUE JÁ EXISTIA NA BASE — promoção, nunca ficha nova.
 *
 * Quem clicou no anúncio e já estava na base fria **não vira um segundo
 * registro**: a ficha é promovida e o histórico inteiro fica. Duas fichas para
 * a mesma pessoa reiniciam o contador do portão do SDR e ela leva a mesma
 * mensagem duas vezes.
 *
 * A ORDEM IMPORTA, e é a mesma de `importarMetaLead`: promover ANTES de trocar
 * a fonte. `promoverFrioParaLead` só aceita quem ainda é frio — trocar a fonte
 * primeiro faria a própria promoção ser recusada por "naoEhFrio", e a ficha
 * passaria a dizer que a pessoa sempre foi lead.
 *
 * ⚠️ O RELÓGIO DE SLA tem UM dono: `marcarPrazoDePrimeiraResposta`, que só
 * escreve quando `slaVenceEm` é `null`. Nada aqui grava o prazo na mão — e
 * empurrar prazo a cada mensagem seria o jeito mais silencioso de um lead
 * atrasado nunca aparecer como atrasado.
 */
async function registrarChegadaPorAnuncio(lead:LeadResumo,referral:ReferralDeAnuncio,agora:Date):Promise<void>{
 try{
  const campos=camposDeOrigemDoAnuncio(referral);
  const atual=await prisma.siteLead.findUnique({where:{id:lead.id},select:{fonte:true,origem:true,utmSource:true,utmCampaign:true,utmContent:true,clickId:true,referrer:true}});
  if(!atual)return;

  if(veioDeListaFria({fonte:atual.fonte})){
   await promoverFrioParaLead(prisma,{leadId:lead.id,motivo:motivoDaPromocaoPorAnuncio(referral),autoria:AUTORIA_SISTEMA,agora})
    .catch(e=>console.error("[foocci-sdr] promoção por anúncio falhou:",e));
  }

  // A fonte só é reescrita quando a atual NÃO é porta da frente: quem já entrou
  // por formulário ou WhatsApp direto mantém o PRIMEIRO toque — reescrever
  // apagaria a atribuição verdadeira.
  const trocarFonte=!fonteEhVistaPelaRecepcao(atual.fonte);
  // ⚠️ Campo vazio é preenchido; campo escrito é PRESERVADO. O clickId pertence
  // a quem trouxe a pessoa primeiro e não se sobrescreve.
  await prisma.siteLead.update({where:{id:lead.id},data:{
   ...(trocarFonte?{fonte:FONTE_DO_ANUNCIO}:{}),
   origem:atual.origem??campos.origem,
   utmSource:atual.utmSource??campos.utmSource,
   utmCampaign:atual.utmCampaign??campos.utmCampaign,
   utmContent:atual.utmContent??campos.utmContent,
   clickId:atual.clickId??campos.clickId,
   referrer:atual.referrer??campos.referrer,
   lastInteractionAt:agora,
  }});

  // O relógio começa a correr AGORA: o que começou foi a demora desta
  // manifestação de interesse, não a de um cadastro antigo a quem nada devíamos.
  await marcarPrazoDePrimeiraResposta(prisma,{leadId:lead.id,chegouEm:agora})
   .catch(e=>console.error("[foocci-sdr] relógio de SLA do lead de anúncio falhou:",e));

  await registrarInteracao(lead.id,"NOTA",notaDoAnuncio(referral),agora);
 }catch(e){console.error("[foocci-sdr] falha ao registrar a chegada por anúncio:",e)}
}

export async function receberMensagemDeVendas(msg:MensagemDeVendas):Promise<EntradaDeVendas>{
 const agora=msg.agora??new Date(), leitura=interpretarMensagemDeVendas(msg.text); const a=analisarWhatsappBr(msg.fromPhone); const digitos=a.ok?a.digitos:normalizaWhatsapp(msg.fromPhone);
 try{
  const lead=await encontrarLead(leitura.codigo,digitos,msg.fromPhone);
  if(leitura.pedeSilencio){ const alvo=lead??await criarContatoDeWhatsApp(msg,digitos,agora,{jaOptOut:true}); if(!alvo)return {status:"FALHOU",leadId:null,codigo:null,detalhe:"pedido de silêncio recebido e NÃO gravado"}; await prisma.siteLead.update({where:{id:alvo.id},data:{optOutAt:alvo.optOutAt??agora,optOutCanal:alvo.optOutAt?undefined:"whatsapp",lastInteractionAt:agora}}); await registrarInteracao(alvo.id,"NOTA","Pediu para não receber mais mensagens (WhatsApp).",agora); await gravarNaConversa(alvo.id,msg,agora); return {status:"PEDIU_SILENCIO",leadId:alvo.id,codigo:alvo.codigo,detalhe:"opt-out registrado — nada mais será enviado a este contato"}; }
  if(!lead){ const novo=await criarContatoDeWhatsApp(msg,digitos,agora,{jaOptOut:false}); if(!novo)return {status:"FALHOU",leadId:null,codigo:null,detalhe:"contato novo NÃO gravado"}; const g=await gravarNaConversa(novo.id,msg,agora); return {status:"CONTATO_NOVO",leadId:novo.id,codigo:novo.codigo,detalhe:veioDeAnuncio(msg.referral)?`lead de campanha paga — anúncio "${nomeDoAnuncio(msg.referral!)}"`:"primeiro contato pelo WhatsApp, sem formulário",ta:g.repetida?undefined:await chamarOTA(novo.id,msg,leitura,agora)}; }
  const deAnuncio=veioDeAnuncio(msg.referral);
  await prisma.siteLead.update({where:{id:lead.id},data:{lastInteractionAt:agora}});
  await registrarInteracao(lead.id,"RESPOSTA_RECEBIDA",deAnuncio?`Clicou no anúncio "${nomeDoAnuncio(msg.referral!)}" e escreveu no WhatsApp de vendas.`:"Escreveu no WhatsApp de vendas.",agora);
  if(deAnuncio)await registrarChegadaPorAnuncio(lead,msg.referral!,agora); const g=await gravarNaConversa(lead.id,msg,agora);
  return {status:leitura.codigo&&lead.codigo===leitura.codigo?"RECONHECIDO_POR_CODIGO":"RECONHECIDO_POR_TELEFONE",leadId:lead.id,codigo:lead.codigo,detalhe:leitura.codigo?`código #${leitura.codigo}`:"reconhecido pelo telefone",ta:g.repetida?undefined:await chamarOTA(lead.id,msg,leitura,agora)};
 }catch(e){console.error("[foocci-sdr] falha ao receber mensagem de vendas:",e);return {status:"FALHOU",leadId:null,codigo:null,detalhe:e instanceof Error?e.message.slice(0,200):"erro desconhecido"}}
}
interface ResultadoDaGravacao{repetida:boolean}
async function gravarNaConversa(leadId:string,msg:MensagemDeVendas,agora:Date):Promise<ResultadoDaGravacao>{ const wamid=msg.waMessageId;if(!wamid)return {repetida:false};try{const r=await comIdentidade(prisma,comoSistema("webhook da Meta: recepção de mensagem, sem usuário logado"),(tx)=>registrarEntrada(tx,{leadId,waMessageId:wamid,tipo:msg.tipo??"TEXTO",tipoCru:msg.tipoCru??null,texto:msg.text??null,legenda:msg.legenda??null,midiaId:msg.midiaId??null,midiaMimeType:msg.midiaMimeType??null,midiaNome:msg.midiaNome??null,duracaoSeg:msg.duracaoSeg??null,ocorreuEm:agora}));if(!r.ok){console.error(`[foocci-sdr] mensagem NÃO gravada na conversa do lead ${leadId}: ${r.causa}`);return {repetida:false}}return {repetida:r.repetida}}catch(e){console.error("[foocci-sdr] falha ao gravar mensagem na conversa:",e);return {repetida:false}}}
const VOLTAS_DO_TURNO=3;
// O turno do TA inclui leitura de contexto, composição e persistência. Em produção
// já foi medido acima dos 5 s padrão do Prisma (P2028). A janela maior é aplicada
// SOMENTE a esta transação; recepção, BotGate e demais usos de comIdentidade
// continuam com o timeout padrão para não esconder travas no restante da Sala.
const TRANSACAO_TA = { maxWait: 5_000, timeout: 60_000 } as const;
/**
 * ⛔ O DEFEITO DE 19/09/2026 — a IA não estava vendo a imagem. Ela não estava
 * nem sendo chamada.
 *
 * A linha era `if(!leitura.temTexto||!msg.text) return undefined`, e
 * `leitura` nasce de `interpretarMensagemDeVendas(msg.text)`. Mídia da Meta
 * **nunca** traz `text`: a foto vem com `image.id` e as palavras do cliente vêm
 * em `image.caption`, que este arquivo grava em `legenda`. Resultado medido: o
 * lead mandava foto do cardápio com legenda e o Atendente não rodava. Nenhuma
 * resposta, nenhum erro, nenhum log — o silêncio perfeito, que é o pior estado
 * possível porque ninguém o percebe.
 *
 * Agora o turno é decidido pelo que a IA CONSEGUE LER (`descricaoParaIA`), que
 * inclui a legenda e o fato de ter vindo mídia. Segue valendo que sem nada
 * legível não se chama o TA — mas "nada legível" passou a ser medido no
 * conteúdo inteiro da mensagem, não só no campo `text`.
 *
 * ⚠️ O PORTEIRO CONTINUA LENDO SÓ PALAVRA DE GENTE. `aplicarPoliticaAntesDoTA`
 * procura padrão de bot e de secretária no que a pessoa ESCREVEU; entregar a
 * ele "[o cliente enviou uma imagem]" seria dar texto nosso para ele
 * classificar como sendo dele. Por isso o gate recebe `palavrasDoCliente` e o
 * TA recebe `paraOTA` — são coisas diferentes e não devem virar uma só.
 */
async function chamarOTA(leadId:string,msg:MensagemDeVendas,leitura:LeituraDaMensagem,agora:Date):Promise<ResultadoDoTurno|undefined>{
 const paraOTA=descricaoParaIA({tipo:msg.tipo??"TEXTO",texto:msg.text??null,legenda:msg.legenda??null,midiaNome:msg.midiaNome??null,tipoCru:msg.tipoCru??null}).trim();
 // ⛔ NENHUM DESCARTE SAI DAQUI EM SILÊNCIO — 19/09/2026. Este `return undefined`
 // era mudo, e um turno descartado sem linha de log é indistinguível de um turno
 // que rodou e respondeu. Foi o silêncio que custou o dia, não o descarte.
 if(!paraOTA){console.warn(`[foocci-sdr] turno DESCARTADO no lead ${leadId}: a mensagem (tipo ${msg.tipo??"TEXTO"}/${msg.tipoCru??"-"}) não tem nada legível para a IA`);return undefined}
 const palavrasDoCliente=(msg.text??msg.legenda??"").trim();
 void leitura;
 try{
  // ⭐ A POLÍTICA INTEIRA, E NÃO SÓ O GATE. Até 17/09/2026 esta linha chamava
  // `interceptarAutomacaoAntesDoTA` direto, e `aplicarPoliticaAntesDoTA` — que
  // grava o porteiro e a indicação do decisor — não era chamada por caminho de
  // produção nenhum. O ativo mais caro da prospecção ("é com a Juliana") era
  // gravado na conversa e perdido em todo o resto. Era um chamador que faltava.
  const gate=await comIdentidade(prisma,comoSistema("webhook da Meta: política comercial antes do TA"),(tx)=>aplicarPoliticaAntesDoTA(tx,{leadId,fromPhone:msg.fromPhone,text:palavrasDoCliente,agora}));
  if(gate.gatekeeper?.aplicado)console.info(`[foocci-sdr] gatekeeper ${leadId}: ${gate.gatekeeper.detalhe} — objetivo ${gate.gatekeeper.objetivo??"inalterado"}`);
  if(gate.intercepted){if(msg.waMessageId){await prisma.leadMensagem.updateMany({where:{leadId,waMessageId:msg.waMessageId,direcao:"ENTRADA"},data:{turnoId:`bot-gate:${gate.kind}`}}).catch((e)=>console.error(`[foocci-sdr] falha ao carimbar entrada do BotGate ${leadId}:`,e))}console.info(`[foocci-sdr] política ${leadId}: interceptado por ${gate.kind}`);return undefined}const r=await comATravaDaConversa(prisma,{leadId,agora},async(dono)=>turnoConsolidado(leadId,dono,agora,paraOTA));
  if(r===null){console.info(`[foocci-sdr] turno NÃO rodou no lead ${leadId}: a conversa já estava travada por um turno vizinho, que responde por esta mensagem também`);return undefined}
  if(r===undefined){console.warn(`[foocci-sdr] turno TERMINOU SEM RESULTADO no lead ${leadId} — nenhuma volta do agrupamento produziu resposta`);return undefined}
  console.info(`[foocci-sdr] turno do lead ${leadId}: ${r.falou?`FALOU (entregue=${r.entregue===true})`:r.chamouGente?`chamou gente (${r.motivo})`:`calou — ${r.motivo}: ${r.detalhe}`}`);
  return r}catch(e){console.error(`[foocci-sdr] o TA não conseguiu atender o lead ${leadId}:`,e);return undefined}}
async function turnoConsolidado(leadId:string,dono:string,agora:Date,chao:string):Promise<ResultadoDoTurno|undefined>{let ultimo:ResultadoDoTurno|undefined;for(let volta=0;volta<VOLTAS_DO_TURNO;volta++){if(volta===0)await esperar(janelaDeAgrupamento());const entradas=await juntarEntradasDoTurno(prisma,leadId).catch(()=>null);if(!entradas){if(volta>0)return ultimo;return comIdentidade(prisma,comoSistema("webhook da Meta: o TA respondendo, sem usuário logado"),(tx)=>atenderComOTA(tx,{leadId,mensagem:chao,agora,turnoId:`${dono}:chao`}),TRANSACAO_TA)}const turnoId=`${dono}:${volta}`;await carimbarTurno(prisma,entradas.ids,turnoId);ultimo=await comIdentidade(prisma,comoSistema("webhook da Meta: o TA respondendo, sem usuário logado"),(tx)=>atenderComOTA(tx,{leadId,mensagem:entradas.texto,agora,turnoId}),TRANSACAO_TA);const novo=await chegouEntradaDepois(prisma,leadId,entradas.ateQuando).catch(()=>false);if(!novo)return ultimo}return ultimo}
async function encontrarLead(codigo:string|null,digitos:string|null,fromPhone:string):Promise<LeadResumo|null>{const select={id:true,codigo:true,optOutAt:true,fonte:true,virouLeadEm:true} as const;if(codigo){const x=await prisma.siteLead.findUnique({where:{codigo},select});if(x)return x}const cauda=(digitos??fromPhone).replace(/\D/g,"").slice(-8);if(cauda.length<8)return null;return prisma.siteLead.findFirst({where:{whatsappDigits:{contains:cauda}},orderBy:{createdAt:"desc"},select})}
/**
 * ⭐ O NASCIMENTO, E ELE É UM SÓ.
 *
 * Com `referral` de anúncio a ficha nasce como LEAD DE CAMPANHA (`CAMPANHA_PAGA`,
 * que está em `FONTES_QUE_NOS_PROCURARAM`), com a campanha gravada nos campos
 * utm que a tela já lê. Sem `referral`, nasce exatamente como antes. É a MESMA
 * porta: um segundo caminho de nascimento produziria duas verdades sobre a
 * origem do lead — e origem divergente não se conserta depois, porque ninguém
 * sabe qual das duas estava certa.
 */
async function criarContatoDeWhatsApp(msg:MensagemDeVendas,digitos:string|null,agora:Date,opts:{jaOptOut:boolean}):Promise<LeadResumo|null>{try{
 const deAnuncio=veioDeAnuncio(msg.referral);
 const campos=deAnuncio?camposDeOrigemDoAnuncio(msg.referral!):null;
 const c=await prisma.siteLead.create({data:{nome:(msg.profileName??"").trim()||msg.fromPhone,whatsapp:msg.fromPhone,whatsappDigits:digitos,fonte:campos?FONTE_DO_ANUNCIO:"WHATSAPP_DIRETO",stage:"NOVO",consentAt:opts.jaOptOut?null:agora,lastInteractionAt:agora,slaVenceEm:opts.jaOptOut?null:prazoDaPrimeiraResposta(agora),...(campos?{origem:campos.origem,utmSource:campos.utmSource,utmMedium:campos.utmMedium,utmCampaign:campos.utmCampaign,utmContent:campos.utmContent,clickId:campos.clickId,referrer:campos.referrer}:{})},select:{id:true,codigo:true,optOutAt:true}});
 await registrarInteracao(c.id,"CAPTURA",campos?`Clicou no anúncio "${nomeDoAnuncio(msg.referral!)}" e escreveu no nosso WhatsApp — lead de campanha paga.`:"Escreveu direto no WhatsApp de vendas, sem passar pelo formulário.",agora);
 if(campos)await registrarInteracao(c.id,"NOTA",notaDoAnuncio(msg.referral!),agora);
 // ⭐ D-0E4: a IA assume na chegada. Escrita condicional a NINGUEM, e quem
 // pediu silêncio não é assumido por ninguém — não há conversa a conduzir.
 if(!opts.jaOptOut){await iaAssumeSeEstaLivre(prisma,{leadId:c.id,agora}).catch(e=>console.error("[foocci-sdr] a IA não conseguiu assumir o contato novo:",e))}
 return c}catch(e){console.error("[foocci-sdr] não consegui criar o contato de WhatsApp:",e);return null}}
async function registrarInteracao(leadId:string,tipo:"CAPTURA"|"RESPOSTA_RECEBIDA"|"NOTA",nota:string,agora:Date):Promise<void>{await prisma.siteLeadInteraction.create({data:{leadId,tipo,actor:"sistema",nota,createdAt:agora}}).catch(e=>console.error("[foocci-sdr] falha ao registrar interação:",e))}
