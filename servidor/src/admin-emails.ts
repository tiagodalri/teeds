import { createHmac, timingSafeEqual } from 'node:crypto'
import { MARCAS } from '../../src/marca/marcas'
import { consultarEventos } from './eventos-resend'

export interface EmailResumo { id: string; destinatarios: string[]; assunto: string; data: string; status: string; sinais?:ReturnType<typeof sinaisDoEmail> }
const cache = new Map<string, { ate: number; valor: { emails: EmailResumo[]; proximo: string | null } }>()
export function sinaisDoEmail(e:EmailResumo, r:any={}) {
  // Ausência de evento nunca significa que a pessoa não abriu/leu.
  return {
    entregue:!!r.entregue_em||e.status==='delivered', entregueEm:r.entregue_em||null,
    aberto:!!r.aberto_em||e.status==='opened', abertoEm:r.aberto_em||null,
    ultimaAberturaEm:r.ultima_abertura_em||null, aberturas:Number(r.aberturas)||0,
    clicado:!!r.clicado_em||e.status==='clicked', clicadoEm:r.clicado_em||null,
    ultimoCliqueEm:r.ultimo_clique_em||null, cliques:Number(r.cliques)||0,
  }
}
const configCache=new Map<string,{ate:number;valor:any}>()
async function configuracaoRastreio(marca:string,chave:string) {
  const atual=configCache.get(marca)
  if(atual&&atual.ate>Date.now())return atual.valor
  const id=process.env[`RESEND_DOMINIO_${marca.toUpperCase()}`]
  const valor={aberturas:null as boolean|null,cliques:null as boolean|null,eventos:!!process.env.RESEND_EVENTOS_SEGREDO,desde:process.env.RESEND_EVENTOS_DESDE||null}
  if(id)try {
    const r=await fetch(`https://api.resend.com/domains/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${chave}`},signal:AbortSignal.timeout(8000)})
    if(r.ok){const d=await r.json() as any;valor.aberturas=d.open_tracking===true;valor.cliques=d.click_tracking===true}
  }catch{/* Não esconde a lista se a configuração estiver indisponível. */}
  configCache.set(marca,{ate:Date.now()+(valor.aberturas===null?30000:300000),valor})
  return valor
}
async function completar(marca:string,chave:string,valor:{emails:EmailResumo[];proximo:string|null}) {
  let registros:any[]=[];let aviso:string|null=null
  try { registros=await consultarEventos(marca,valor.emails.map(e=>e.id)) }
  catch { aviso='Os horários dos eventos estão temporariamente indisponíveis. O último status do provedor continua visível.' }
  const porId=new Map(registros.map(r=>[r.email_id,r]))
  return {...valor,emails:valor.emails.map(e=>({...e,sinais:sinaisDoEmail(e,porId.get(e.id))})),aviso,rastreio:await configuracaoRastreio(marca,chave)}
}
const endereco = (s: string) => (s.match(/<([^<>]+)>/)?.[1] || s).trim().toLowerCase()
// Nunca retorna HTML/texto: mensagens de acesso podem conter senhas ou tokens.
export function resumirEmails(linhas: any[], remetente: string): EmailResumo[] {
  return linhas.filter(e => typeof e.from === 'string' && endereco(e.from) === endereco(remetente)).map(e => ({
    id: String(e.id), destinatarios: Array.isArray(e.to) ? e.to.map(String) : [],
    assunto: String(e.subject || 'Sem assunto'), data: String(e.created_at || ''), status: String(e.last_event || 'unknown'),
  }))
}
function assinar(valor: string, chave: string) { return createHmac('sha256', chave).update(valor).digest('hex') }
function abrirCursor(cursor: string, marca: string, chave: string): string {
  if (!cursor) return ''
  const [valor, assinatura = ''] = cursor.split('.')
  const esperado = assinar(valor, chave)
  if (assinatura.length !== esperado.length || !timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperado))) throw new Error('Paginação inválida. Atualize a lista.')
  const d = JSON.parse(Buffer.from(valor, 'base64url').toString())
  if (d.marca !== marca || typeof d.id !== 'string' || !/^[\w-]{1,100}$/.test(d.id)) throw new Error('Paginação inválida. Atualize a lista.')
  return d.id
}
export async function listarEmailsAdmin(marca: string, cursor = '') {
  if (marca !== 'teeds' && marca !== 'omni') throw new Error('Plataforma inválida.')
  const chave = process.env.RESEND_LEITURA_CHAVE || process.env.RESEND_CHAVE
  if (!chave) throw new Error('Consulta de e-mails não configurada no servidor.')
  const depois = abrirCursor(cursor, marca, chave)
  const k = `${marca}:${depois}`
  const hit = cache.get(k)
  if (hit && hit.ate > Date.now()) return completar(marca,chave,hit.valor)
  const url = new URL('https://api.resend.com/emails')
  url.searchParams.set('limit', '100')
  if (depois) url.searchParams.set('after', depois)
  const r = await fetch(url, { headers: { Authorization: `Bearer ${chave}` }, signal: AbortSignal.timeout(15000) })
  if (r.status === 401 || r.status === 403) throw new Error('A credencial de envio não permite consultas. Configure RESEND_LEITURA_CHAVE no servidor com permissão de leitura do Resend.')
  if (r.status === 429) throw new Error('Limite de consultas atingido. Aguarde alguns segundos e atualize.')
  if (!r.ok) throw new Error('Não foi possível consultar o serviço de e-mails. Tente novamente.')
  const d = await r.json() as any
  if (!Array.isArray(d.data)) throw new Error('Resposta inválida do serviço de e-mails.')
  const ultimo = d.data.at(-1)?.id
  const valorCursor = Buffer.from(JSON.stringify({marca, id: ultimo})).toString('base64url')
  const valor = { emails: resumirEmails(d.data, MARCAS[marca].email.remetente || ''), proximo: d.has_more && ultimo ? `${valorCursor}.${assinar(valorCursor, chave)}` : null }
  if (cache.size >= 50) cache.delete(cache.keys().next().value!)
  cache.set(k, {ate: Date.now() + 15000, valor})
  return completar(marca,chave,valor)
}
