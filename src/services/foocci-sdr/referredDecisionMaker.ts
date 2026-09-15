import type { Prisma, PrismaClient } from "@prisma/client";
import { analisarWhatsappBr } from "@/lib/whatsapp-br";
import { normalizaWhatsapp } from "@/services/foocci-crm/leadOrigin";

type Db = PrismaClient | Prisma.TransactionClient;
export interface DecisorIndicadoInput { leadOrigemId:string; nome:string; telefone:string; agora?:Date; origem?:string }
export type DecisorIndicadoResult={ok:true;leadId:string;novo:boolean}|{ok:false;reason:string};

/**
 * Cria/vincula um novo prospect da MESMA conta comercial quando o interlocutor
 * indica explicitamente outro telefone. Não copia consentimento, score nem
 * qualificação: indicação é origem, não permissão nem prova de fit.
 */
export async function registrarDecisorIndicado(db:Db,input:DecisorIndicadoInput):Promise<DecisorIndicadoResult>{
 const nome=input.nome.trim(), telefone=input.telefone.trim(), agora=input.agora??new Date();
 if(!nome||!telefone)return {ok:false,reason:"nome e telefone explícitos são obrigatórios"};
 const a=analisarWhatsappBr(telefone); const digits=a.ok?a.digitos:normalizaWhatsapp(telefone); if(!digits)return {ok:false,reason:"telefone indicado inválido"};
 const origem=await db.siteLead.findUnique({where:{id:input.leadOrigemId},select:{id:true,restaurante:true,cidade:true,tipo:true,desafio:true,optOutAt:true}}); if(!origem)return {ok:false,reason:"lead de origem não existe"};
 const existente=await db.siteLead.findFirst({where:{whatsappDigits:digits},orderBy:{createdAt:"desc"},select:{id:true}});
 if(existente){await db.siteLeadInteraction.create({data:{leadId:existente.id,tipo:"NOTA",actor:"sistema",interna:true,nota:`Contato indicado pelo lead ${origem.id}. Origem: ${input.origem??"WhatsApp"}.`}});return {ok:true,leadId:existente.id,novo:false};}
 const novo=await db.siteLead.create({data:{nome,whatsapp:telefone,whatsappDigits:digits,restaurante:origem.restaurante,cidade:origem.cidade,tipo:origem.tipo,desafio:origem.desafio,fonte:"INDICACAO",stage:"DISPONIVEL_PARA_PROSPECCAO",stageChangedBy:"sistema",consentAt:null,lastInteractionAt:agora,proximaAcaoEm:agora,proximaAcaoNota:"Abordar contato indicado respeitando política Meta/template; confirmar papel antes de qualificar."},select:{id:true}});
 await db.siteLeadInteraction.create({data:{leadId:novo.id,tipo:"CAPTURA",actor:"sistema",interna:true,nota:`Decisor/contato indicado pelo lead ${origem.id}. Não qualificado e sem consentimento herdado. Origem: ${input.origem??"WhatsApp"}.`,createdAt:agora}});
 await db.siteLeadInteraction.create({data:{leadId:origem.id,tipo:"NOTA",actor:"sistema",interna:true,nota:`Indicou novo contato ${novo.id}; a conversa comercial continua no novo telefone.`,createdAt:agora}});
 return {ok:true,leadId:novo.id,novo:true};
}
