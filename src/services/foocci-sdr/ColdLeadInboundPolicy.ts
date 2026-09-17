import type { Prisma, PrismaClient } from "@prisma/client";
import { interceptarAutomacaoAntesDoTA } from "./WhatsappBotGate";
import { processarIndicacaoExplicita } from "./referralRuntime";
import { registrarInterlocutorDaProspeccao, type ResultadoDoRegistro } from "./gatekeeper/registro";
type Db=PrismaClient|Prisma.TransactionClient;

/**
 * Ordem canônica: gatekeeper gravado primeiro; bot/menu depois; indicação
 * explícita em seguida; só então TA.
 *
 * ⚠️ O REGISTRO VEM ANTES DO GATE, e a ordem é o conserto: o bot de pedidos é
 * justamente o caso que o gate INTERCEPTA, e interceptar antes de gravar jogaria
 * fora a classificação exatamente do porteiro mais comum. Registrar não manda
 * mensagem e não decide nada — só escreve o que a resposta revelou.
 */
export async function aplicarPoliticaAntesDoTA(db:Db,p:{leadId:string;fromPhone:string;text:string;agora?:Date}){
 const gatekeeper=await registrarInterlocutorDaProspeccao(db,{leadId:p.leadId,fromPhone:p.fromPhone,texto:p.text,agora:p.agora})
   .catch((e)=>{console.error("[foocci-sdr] gatekeeper: falha ao registrar interlocutor:",e);return null});
 const bot=await interceptarAutomacaoAntesDoTA(db,{leadId:p.leadId,fromPhone:p.fromPhone,text:p.text,agora:p.agora});
 if(bot.intercepted)return {intercepted:true as const,kind:"BOT" as const,detail:bot,gatekeeper};
 const referral=await processarIndicacaoExplicita(db,{leadOrigemId:p.leadId,text:p.text,agora:p.agora});
 if(referral.handled)return {intercepted:true as const,kind:"REFERRAL" as const,detail:referral,gatekeeper};
 return {intercepted:false as const,kind:"HUMAN" as const,gatekeeper};
}

export type { ResultadoDoRegistro };
