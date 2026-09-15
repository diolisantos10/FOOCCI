export type EstrategiaDeOrigem="COLD_OUTBOUND"|"INBOUND_INTENT";
export function estrategiaDaFonte(fonte:string):EstrategiaDeOrigem{
 return fonte==="LISTA_PROSPECCAO"||fonte==="IMPORTACAO"?"COLD_OUTBOUND":"INBOUND_INTENT";
}
export function prioridadeDaEstrategia(e:EstrategiaDeOrigem):number{return e==="INBOUND_INTENT"?100:50}
