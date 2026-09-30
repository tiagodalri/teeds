import { MARCAS } from '../../src/marca/marcas'
import { assinaturaConfere } from './gancho-email'

const TIPOS = new Set(['sent','delivered','opened','clicked','bounced','complained','failed','delivery_delayed','suppressed','scheduled'])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const endereco=(s:string)=>(s.match(/<([^<>]+)>/)?.[1]||s).trim().toLowerCase()

export function eventoSeguro(d:any, id:string) {
  if (!d || typeof d.type!=='string' || !d.type.startsWith('email.')) return null
  const tipo=d.type.slice(6)
  if (!TIPOS.has(tipo)) return null
  const from=typeof d.data?.from==='string'?endereco(d.data.from):''
  const marca=Object.values(MARCAS).find(m=>m.email.remetente && endereco(m.email.remetente)===from)?.id
  if (!marca) return null
  if (!uuid.test(d.data?.email_id || '') || !id || id.length>200 || !Number.isFinite(Date.parse(d.created_at))) throw new Error('Evento inválido')
  return {evento_id:id,email_id:d.data.email_id,marca,tipo,ocorrido_em:new Date(d.created_at).toISOString()}
}

async function banco(path:string, init:RequestInit={}) {
  const chave=process.env.SUPABASE_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY||''
  if (!chave || !process.env.SUPABASE_URL) throw new Error('Histórico de eventos indisponível')
  const r=await fetch(process.env.SUPABASE_URL.replace(/\/+$/,'')+'/rest/v1/'+path,{
    ...init,signal:AbortSignal.timeout(10000),headers:{apikey:chave,Authorization:`Bearer ${chave}`,'Content-Type':'application/json',...init.headers},
  })
  if(!r.ok)throw new Error('Histórico de eventos indisponível')
  const texto=await r.text()
  return texto?JSON.parse(texto):null
}

export async function receberEventoResend(cru:string, headers:Record<string,string|string[]|undefined>) {
  const segredo=process.env.RESEND_EVENTOS_SEGREDO
  if (!segredo) return {status:503,corpo:{erro:'Eventos indisponíveis'}}
  if (Buffer.byteLength(cru)>65536) return {status:413,corpo:{erro:'Evento excede o limite'}}
  if (!assinaturaConfere(cru,{'webhook-id':headers['svix-id'],'webhook-timestamp':headers['svix-timestamp'],'webhook-signature':headers['svix-signature']},segredo)) return {status:401,corpo:{erro:'Assinatura inválida'}}
  let evento
  try { const id=headers['svix-id'];evento=eventoSeguro(JSON.parse(cru),String((Array.isArray(id)?id[0]:id)||'')) }
  catch { return {status:400,corpo:{erro:'Evento inválido'}} }
  if (!evento) return {status:200,corpo:{recebido:true}}
  try {
    // Reentregas usam o mesmo svix-id. Não contam como novas aberturas/cliques.
    await banco('email_eventos_resend?on_conflict=evento_id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(evento)})
    return {status:200,corpo:{recebido:true}}
  } catch { return {status:503,corpo:{erro:'Não foi possível registrar. Tente novamente.'}} }
}

export async function consultarEventos(marca:string, ids:string[]) {
  const seguros=ids.filter(id=>uuid.test(id))
  if(!seguros.length)return []
  const p=new URLSearchParams({marca:`eq.${marca}`,email_id:`in.(${seguros.join(',')})`,select:'email_id,entregue_em,aberto_em,ultima_abertura_em,aberturas,clicado_em,ultimo_clique_em,cliques,ultimo_evento_em,ultimo_evento'})
  const d=await banco('email_eventos_resumo?'+p)
  if(!Array.isArray(d))throw new Error('Histórico de eventos indisponível')
  return d
}
