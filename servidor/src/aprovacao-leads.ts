import './ambiente'
import { createHmac, randomUUID } from 'node:crypto'
import { marcaPorId } from '../../src/marca/marcas'
import { montarEmail } from './emails'
import { planoClienteValido } from '../../src/core/teeds/planos'

const base = () => (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
const segredo = () => process.env.SUPABASE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Não grava senha em tabela, logs ou resposta HTTP. A mesma tentativa é
// recuperável após uma queda sem redefinir a senha de uma conta existente.
export function senhaDoPendente(id: string, chave: string): string {
  if (!chave) throw new Error('Servidor sem credencial de acesso.')
  return `Tp!9${createHmac('sha256', chave).update(`aprovacao-lead:v1:${id}`).digest('base64url').slice(0,24)}`
}
async function banco(path: string, method='GET', body?: unknown): Promise<any> {
  const r = await fetch(`${base()}${path}`, {
    method, signal: AbortSignal.timeout(20000),
    headers: { apikey: segredo(), Authorization: `Bearer ${segredo()}`, 'Content-Type':'application/json' },
    ...(body === undefined ? {} : {body:JSON.stringify(body)}),
  })
  if (!r.ok) throw new Error('Não foi possível concluir. Atualize a lista e tente novamente em dois minutos.')
  return r.status===204 ? undefined : r.json().catch(()=>undefined)
}
export async function listarPendentes(marca: string, status: string, pagina: number) {
  if (!['pendente','processando','aprovado','recusado'].includes(status)) throw new Error('Filtro inválido.')
  const offset=Math.max(0,Math.floor(pagina))*50
  return banco(`/rest/v1/clientes_pendentes?marca=eq.${marca}&status=eq.${status}&select=id,nome,email,telefone,status,criado_em,decidido_em,email_enviado_em&order=criado_em.desc&limit=51&offset=${offset}`)
}
export async function decidirLead(id: string, marca: string, admin: string, acao: string, plano='essencial') {
  if (!planoClienteValido(plano)) throw new Error('Plano inválido.')
  if (!/^[0-9a-f-]{36}$/i.test(id) || !['aprovar','recusar'].includes(acao)) throw new Error('Pedido inválido.')
  const trava=randomUUID()
  const ficha=await banco('/rest/v1/rpc/teeds_decidir_lead','POST',{p_id:id,p_marca:marca,p_admin:admin,p_acao:acao,p_trava:trava,p_plano:plano})
  if (ficha.status!=='processando') return {status:ficha.status}
  let usuario=await banco('/rest/v1/rpc/teeds_auth_do_pendente','POST',{p_id:id,p_trava:trava})
  if (!usuario) {
    // Admin Auth não dispara confirmação. O e-mail só sai depois de finalizar.
    try {
      usuario=await banco('/auth/v1/admin/users','POST',{
        email:ficha.email,password:senhaDoPendente(id,segredo()),email_confirm:true,
        user_metadata:{nome:ficha.nome,telefone:ficha.telefone,marca,trocar_senha:true},
        app_metadata:{aprovacao_lead:id},
      })
    } catch (e) {
      // Pode ter havido timeout depois da criação ou cadastro concorrente.
      usuario=await banco('/rest/v1/rpc/teeds_auth_do_pendente','POST',{p_id:id,p_trava:trava})
      if (!usuario) throw e
    }
  }
  if (!usuario?.id) throw new Error('Não foi possível confirmar a conta. Retome a aprovação em dois minutos.')
  await banco('/rest/v1/rpc/teeds_finalizar_lead','POST',{p_id:id,p_trava:trava,p_user:usuario.id})
  return {status:'aprovado'}
}

let enviando=false
export async function enviarAprovacoes() {
  if (enviando) return
  enviando=true
  try {
    const lista=await banco('/rest/v1/clientes_pendentes?status=eq.aprovado&email_enviado_em=is.null&select=id,marca,email,user_id&order=decidido_em.asc&limit=20')
    for (const p of lista ?? []) {
      try {
        const marca=marcaPorId(p.marca)
        const u=await banco(`/auth/v1/admin/users/${encodeURIComponent(p.user_id)}`)
        // Não envia senha provisória se a pessoa já a trocou ou já tinha login.
        const nova=u.app_metadata?.aprovacao_lead===p.id && u.user_metadata?.trocar_senha===true
        const corpo=nova
          ? `Seu cadastro foi aprovado. E-mail de acesso: ${p.email}. Senha provisória: ${senhaDoPendente(p.id,segredo())}. Entre na plataforma e escolha sua própria senha no primeiro acesso.`
          : `Seu cadastro foi aprovado. Entre com o e-mail ${p.email} e sua senha atual. Se não lembrar da senha, use “Esqueci minha senha” na tela de acesso.`
        const email=montarEmail(marca,'convite',new URL('/',marca.redirectUri).href,{
          assunto:`Seu acesso à ${marca.prosa} está pronto`,titulo:'Cadastro aprovado',
          espia:`Seu acesso à ${marca.prosa} foi liberado.`,corpo,botao:'Acessar a plataforma',
          aviso:'Guarde seus dados de acesso com segurança. Não compartilhe sua senha.',
        })
        if (!process.env.RESEND_CHAVE || !marca.email.remetente) throw new Error('Envio indisponível')
        const r=await fetch('https://api.resend.com/emails',{
          method:'POST',signal:AbortSignal.timeout(20000),
          headers:{Authorization:`Bearer ${process.env.RESEND_CHAVE}`,'Content-Type':'application/json','Idempotency-Key':`aprovacao-lead-${p.id}`},
          body:JSON.stringify({from:marca.email.remetente,to:[p.email],subject:email.assunto,html:email.html,text:email.texto}),
        })
        if (!r.ok) throw new Error('Envio indisponível')
        await banco(`/rest/v1/clientes_pendentes?id=eq.${p.id}&status=eq.aprovado`,'PATCH',{email_enviado_em:new Date().toISOString()})
      } catch { console.warn('[aprovação] E-mail pendente; será tentado novamente.') }
    }
  } catch { /* Migração ainda não aplicada: não interfere no carteiro existente. */ }
  finally { enviando=false }
}
