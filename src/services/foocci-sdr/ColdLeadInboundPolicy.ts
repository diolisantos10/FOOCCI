import type { Prisma, PrismaClient } from "@prisma/client";
import { interceptarAutomacaoAntesDoTA } from "./WhatsappBotGate";
import { processarIndicacaoExplicita } from "./referralRuntime";
type Db=PrismaClient|Prisma.TransactionClient;

/** Ordem canônica: bot/menu primeiro; indicação explícita depois; só então TA. */
export async function aplicarPoliticaAntesDoTA(db:Db,p:{leadId:string;fromPhone:string;text:string;agora?:Date}){
 const bot=await interceptarAutomacaoAntesDoTA(db,{leadId:p.leadId,fromPhone:p.fromPhone,text:p.text,agora:p.agora});
 if(bot.intercepted)return {intercepted:true as const,kind:"BOT" as const,detail:bot};
 const referral=await processarIndicacaoExplicita(db,{leadOrigemId:p.leadId,text:p.text,agora:p.agora});
 if(referral.handled)return {intercepted:true as const,kind:"REFERRAL" as const,detail:referral};
 return {intercepted:false as const,kind:"HUMAN" as const};
}
