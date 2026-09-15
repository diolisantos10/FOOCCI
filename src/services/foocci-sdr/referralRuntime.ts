import type { Prisma, PrismaClient } from "@prisma/client";
import { extrairContatoIndicadoNoTexto } from "./referredDecisionMakerFromText";
import { registrarDecisorIndicado } from "./referredDecisionMaker";
type Db=PrismaClient|Prisma.TransactionClient;

export async function processarIndicacaoExplicita(db:Db,p:{leadOrigemId:string;text:string;agora?:Date}){
 const contato=extrairContatoIndicadoNoTexto(p.text); if(!contato)return {handled:false as const};
 const result=await registrarDecisorIndicado(db,{leadOrigemId:p.leadOrigemId,nome:contato.nome,telefone:contato.telefone,agora:p.agora,origem:"resposta WhatsApp"});
 return {handled:result.ok,contact:contato,result};
}
