export interface ContatoIndicadoNoTexto { nome:string; telefone:string }

/** Extração conservadora: só aceita indicação quando há sinal explícito + telefone. */
export function extrairContatoIndicadoNoTexto(texto:string):ContatoIndicadoNoTexto|null{
 const t=texto.trim();
 if(!/\b(fal(e|a)|convers(e|a)|contat(e|a)|respons[aá]vel|gerente|dono|administrativ[oa]|comercial|marketing)\b/i.test(t))return null;
 const tel=t.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/)?.[0]; if(!tel)return null;
 const antes=t.slice(0,t.indexOf(tel)).trim();
 const nome=antes.match(/(?:com|é|e|chama(?:-se)?|falar com)\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\p{L}'-]{1,30}(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\p{L}'-]{1,30})?)[\s,:-]*$/iu)?.[1]??"Contato indicado";
 return {nome,telefone:tel};
}
