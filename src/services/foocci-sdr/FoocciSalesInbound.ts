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
import { registrarEntrada } from "@/services/salaDeVendas/conversa";
import { comIdentidade, comoSistema } from "@/services/salaDeVendas/identidadeNoBanco";
import { atenderComOTA, type ResultadoDoTurno } from "@/services/salaDeVendas/ta/atender";
import { comATravaDaConversa } from "@/services/salaDeVendas/travaDaConversa";
import { interceptarAutomacaoAntesDoTA } from "./WhatsappBotGate";
import { carimbarTurno, chegouEntradaDepois, esperar, janelaDeAgrupamento, juntarEntradasDoTurno } from "@/services/salaDeVendas/ta/agrupamento";
import type { TipoDaMensagem } from "@prisma/client";

export interface LeituraDaMensagem { codigo: string | null; pedeSilencio: boolean; temTexto: boolean }
export function interpretarMensagemDeVendas(text: string | null | undefined): LeituraDaMensagem {
  const t=(text??"").trim(); return { codigo:t?extractLeadCode(t):null, pedeSilencio:detectOptOutIntent(t), temTexto:t.length>0 };
}
export type EntradaDeVendasStatus="RECONHECIDO_POR_CODIGO"|"RECONHECIDO_POR_TELEFONE"|"CONTATO_NOVO"|"PEDIU_SILENCIO"|"FALHOU";
export interface EntradaDeVendas { status:EntradaDeVendasStatus; leadId:string|null; codigo:string|null; detalhe:string; ta?:ResultadoDoTurno }
export interface MensagemDeVendas { fromPhone:string; text:string|null; profileName?:string|null; agora?:Date; waMessageId?:string|null; tipo?:TipoDaMensagem; tipoCru?:string|null; legenda?:string|null; midiaId?:string|null; midiaMimeType?:string|null; midiaNome?:string|null; duracaoSeg?:number|null }
type LeadResumo={id:string;codigo:string|null;optOutAt:Date|null};

export async function receberMensagemDeVendas(msg:MensagemDeVendas):Promise<EntradaDeVendas>{
 const agora=msg.agora??new Date(), leitura=interpretarMensagemDeVendas(msg.text); const a=analisarWhatsappBr(msg.fromPhone); const digitos=a.ok?a.digitos:normalizaWhatsapp(msg.fromPhone);
 try{
  const lead=await encontrarLead(leitura.codigo,digitos,msg.fromPhone);
  if(leitura.pedeSilencio){ const alvo=lead??await criarContatoDeWhatsApp(msg,digitos,agora,{jaOptOut:true}); if(!alvo)return {status:"FALHOU",leadId:null,codigo:null,detalhe:"pedido de silêncio recebido e NÃO gravado"}; await prisma.siteLead.update({where:{id:alvo.id},data:{optOutAt:alvo.optOutAt??agora,optOutCanal:alvo.optOutAt?undefined:"whatsapp",lastInteractionAt:agora}}); await registrarInteracao(alvo.id,"NOTA","Pediu para não receber mais mensagens (WhatsApp).",agora); await gravarNaConversa(alvo.id,msg,agora); return {status:"PEDIU_SILENCIO",leadId:alvo.id,codigo:alvo.codigo,detalhe:"opt-out registrado — nada mais será enviado a este contato"}; }
  if(!lead){ const novo=await criarContatoDeWhatsApp(msg,digitos,agora,{jaOptOut:false}); if(!novo)return {status:"FALHOU",leadId:null,codigo:null,detalhe:"contato novo NÃO gravado"}; const g=await gravarNaConversa(novo.id,msg,agora); return {status:"CONTATO_NOVO",leadId:novo.id,codigo:novo.codigo,detalhe:"primeiro contato pelo WhatsApp, sem formulário",ta:g.repetida?undefined:await chamarOTA(novo.id,msg,leitura,agora)}; }
  await prisma.siteLead.update({where:{id:lead.id},data:{lastInteractionAt:agora}}); await registrarInteracao(lead.id,"RESPOSTA_RECEBIDA","Escreveu no WhatsApp de vendas.",agora); const g=await gravarNaConversa(lead.id,msg,agora);
  return {status:leitura.codigo&&lead.codigo===leitura.codigo?"RECONHECIDO_POR_CODIGO":"RECONHECIDO_POR_TELEFONE",leadId:lead.id,codigo:lead.codigo,detalhe:leitura.codigo?`código #${leitura.codigo}`:"reconhecido pelo telefone",ta:g.repetida?undefined:await chamarOTA(lead.id,msg,leitura,agora)};
 }catch(e){console.error("[foocci-sdr] falha ao receber mensagem de vendas:",e);return {status:"FALHOU",leadId:null,codigo:null,detalhe:e instanceof Error?e.message.slice(0,200):"erro desconhecido"}}
}
interface ResultadoDaGravacao{repetida:boolean}
async function gravarNaConversa(leadId:string,msg:MensagemDeVendas,agora:Date):Promise<ResultadoDaGravacao>{ const wamid=msg.waMessageId;if(!wamid)return {repetida:false};try{const r=await comIdentidade(prisma,comoSistema("webhook da Meta: recepção de mensagem, sem usuário logado"),(tx)=>registrarEntrada(tx,{leadId,waMessageId:wamid,tipo:msg.tipo??"TEXTO",tipoCru:msg.tipoCru??null,texto:msg.text??null,legenda:msg.legenda??null,midiaId:msg.midiaId??null,midiaMimeType:msg.midiaMimeType??null,midiaNome:msg.midiaNome??null,duracaoSeg:msg.duracaoSeg??null,ocorreuEm:agora}));if(!r.ok){console.error(`[foocci-sdr] mensagem NÃO gravada na conversa do lead ${leadId}: ${r.causa}`);return {repetida:false}}return {repetida:r.repetida}}catch(e){console.error("[foocci-sdr] falha ao gravar mensagem na conversa:",e);return {repetida:false}}}
const VOLTAS_DO_TURNO=3;
async function chamarOTA(leadId:string,msg:MensagemDeVendas,leitura:LeituraDaMensagem,agora:Date):Promise<ResultadoDoTurno|undefined>{ if(!leitura.temTexto||!msg.text)return undefined;try{const gate=await comIdentidade(prisma,comoSistema("webhook da Meta: gate de automação comercial"),(tx)=>interceptarAutomacaoAntesDoTA(tx,{leadId,fromPhone:msg.fromPhone,text:msg.text!,agora}));if(gate.intercepted){console.info(`[foocci-sdr] BotGate ${leadId}: ${gate.status} — ${gate.detalhe}`);return undefined}const r=await comATravaDaConversa(prisma,{leadId,agora},async(dono)=>turnoConsolidado(leadId,dono,agora,msg.text!));return r===null?undefined:r}catch(e){console.error(`[foocci-sdr] o TA não conseguiu atender o lead ${leadId}:`,e);return undefined}}
async function turnoConsolidado(leadId:string,dono:string,agora:Date,chao:string):Promise<ResultadoDoTurno|undefined>{let ultimo:ResultadoDoTurno|undefined;for(let volta=0;volta<VOLTAS_DO_TURNO;volta++){if(volta===0)await esperar(janelaDeAgrupamento());const entradas=await juntarEntradasDoTurno(prisma,leadId).catch(()=>null);if(!entradas){if(volta>0)return ultimo;return comIdentidade(prisma,comoSistema("webhook da Meta: o TA respondendo, sem usuário logado"),(tx)=>atenderComOTA(tx,{leadId,mensagem:chao,agora,turnoId:`${dono}:chao`}))}const turnoId=`${dono}:${volta}`;await carimbarTurno(prisma,entradas.ids,turnoId);ultimo=await comIdentidade(prisma,comoSistema("webhook da Meta: o TA respondendo, sem usuário logado"),(tx)=>atenderComOTA(tx,{leadId,mensagem:entradas.texto,agora,turnoId}));const novo=await chegouEntradaDepois(prisma,leadId,entradas.ateQuando).catch(()=>false);if(!novo)return ultimo}return ultimo}
async function encontrarLead(codigo:string|null,digitos:string|null,fromPhone:string):Promise<LeadResumo|null>{const select={id:true,codigo:true,optOutAt:true} as const;if(codigo){const x=await prisma.siteLead.findUnique({where:{codigo},select});if(x)return x}const cauda=(digitos??fromPhone).replace(/\D/g,"").slice(-8);if(cauda.length<8)return null;return prisma.siteLead.findFirst({where:{whatsappDigits:{contains:cauda}},orderBy:{createdAt:"desc"},select})}
async function criarContatoDeWhatsApp(msg:MensagemDeVendas,digitos:string|null,agora:Date,opts:{jaOptOut:boolean}):Promise<LeadResumo|null>{try{const c=await prisma.siteLead.create({data:{nome:(msg.profileName??"").trim()||msg.fromPhone,whatsapp:msg.fromPhone,whatsappDigits:digitos,fonte:"WHATSAPP_DIRETO",stage:"NOVO",consentAt:opts.jaOptOut?null:agora,lastInteractionAt:agora},select:{id:true,codigo:true,optOutAt:true}});await registrarInteracao(c.id,"CAPTURA","Escreveu direto no WhatsApp de vendas, sem passar pelo formulário.",agora);return c}catch(e){console.error("[foocci-sdr] não consegui criar o contato de WhatsApp:",e);return null}}
async function registrarInteracao(leadId:string,tipo:"CAPTURA"|"RESPOSTA_RECEBIDA"|"NOTA",nota:string,agora:Date):Promise<void>{await prisma.siteLeadInteraction.create({data:{leadId,tipo,actor:"sistema",nota,createdAt:agora}}).catch(e=>console.error("[foocci-sdr] falha ao registrar interação:",e))}
