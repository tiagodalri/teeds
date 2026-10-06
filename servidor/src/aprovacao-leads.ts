import './ambiente'
import { createHmac, randomUUID } from 'node:crypto'
import { marcaPorId, type Marca } from '../../src/marca/marcas'
import { montarEmail } from './emails'
import { planoClienteValido } from '../../src/core/teeds/planos'

const base = () => (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
const segredo = () => process.env.SUPABASE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

/**
 * A senha provisória da casa — a mesma para todo mundo (Tiago, 30/09/2026).
 *
 * Antes da aprovação, o cliente vê a tela de espera. Depois, precisa criar
 * a própria senha antes de usar a plataforma. A troca forçada
 * (`trocar_senha: true`) faz parte do fluxo de entrada, mas
 * NÃO elimina o risco de alguém conhecer a senha antes do titular.
 */
/**
 * Qual marca este pedido de aprovação administra.
 *
 * O painel da master tem um seletor de plataforma no topo. Esta rota ignorava
 * esse seletor e usava a marca da ORIGEM (o site aberto): com o painel na
 * Teeds e o seletor em OMNI, as aprovações mostravam os cadastros da Teeds
 * sob o título "OMNI Admin" (Tiago, 06/10/2026). Ler errado confunde; aprovar
 * errado cria a conta na marca errada, manda o e-mail errado, e desfazer é
 * trabalho manual.
 *
 * Marca desconhecida DÁ ERRO em vez de virar a padrão. `marcaPorId` normaliza
 * silenciosamente, o que é aceitável para escolher uma cor; aqui, não: um id
 * digitado errado aprovaria alguém na Teeds sem ninguém perceber.
 */
export function marcaAdministrada(pedida: unknown, origem: string): string {
  if (pedida === null || pedida === undefined || pedida === '') return origem
  if (typeof pedida !== 'string') throw new Error('Plataforma inválida.')
  if (marcaPorId(pedida).id !== pedida) throw new Error('Plataforma inválida.')
  return pedida
}

export const SENHA_PROVISORIA = '123mudar'
const VERSAO_SENHA = 'provisoria-v2'

// Mantida para contas criadas antes de 30/09/2026, que receberam uma senha
// própria gerada aqui. Não é mais usada para cadastro novo.
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
  return banco(`/rest/v1/clientes_pendentes?marca=eq.${marca}&status=eq.${status}&select=id,nome,email,telefone,status,recadastro,ultima_inscricao_em,criado_em,decidido_em,email_enviado_em&order=ultima_inscricao_em.desc,id.desc&limit=51&offset=${offset}`)
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
        email:ficha.email,password:SENHA_PROVISORIA,email_confirm:true,
        user_metadata:{nome:ficha.nome,telefone:ficha.telefone,marca,trocar_senha:true},
        app_metadata:{aprovacao_lead:id,senha_aprovacao_versao:VERSAO_SENHA},
      })
    } catch (e) {
      // Pode ter havido timeout depois da criação ou cadastro concorrente.
      usuario=await banco('/rest/v1/rpc/teeds_auth_do_pendente','POST',{p_id:id,p_trava:trava})
      if (!usuario) throw e
    }
  }
  if (!usuario?.id) throw new Error('Não foi possível confirmar a conta. Retome a aprovação em dois minutos.')
  // A consulta protegida retorna apenas o ID. Só a aprovação autenticada
  // renova uma senha existente; um formulário público jamais faz isso.
  const atual=await banco(`/auth/v1/admin/users/${encodeURIComponent(usuario.id)}`)
  if (atual.app_metadata?.aprovacao_lead!==id || atual.app_metadata?.senha_aprovacao_versao!==VERSAO_SENHA) {
    const admins=await banco(`/rest/v1/administradores?user_id=eq.${encodeURIComponent(usuario.id)}&select=user_id&limit=1`)
    if (!Array.isArray(admins) || admins.length) throw new Error('Contas administrativas não podem ter a senha renovada pelo cadastro público.')
    // Senha e marcador juntos: se a resposta se perder, retomar não desfaz
    // uma senha que o titular já tenha escolhido entre as tentativas.
    await banco(`/auth/v1/admin/users/${encodeURIComponent(usuario.id)}`,'PUT',{
      password:SENHA_PROVISORIA,
      user_metadata:{...atual.user_metadata,trocar_senha:true},
      app_metadata:{...atual.app_metadata,aprovacao_lead:id,senha_aprovacao_versao:VERSAO_SENHA},
    })
  }
  await banco('/rest/v1/rpc/teeds_finalizar_lead','POST',{p_id:id,p_trava:trava,p_user:usuario.id})
  return {status:'aprovado'}
}

/** Manda um e-mail pronto pela marca. Devolve false quando a marca não pode enviar. */
/**
 * Manda um e-mail pronto pela marca.
 *
 * `descadastrar` só é passado em campanha, e liga os dois cabeçalhos que o
 * Gmail e o Yahoo exigem de quem manda para muita gente: o `List-Unsubscribe`
 * e o `List-Unsubscribe-Post`, que juntos desenham o "Cancelar inscrição" ao
 * lado do remetente. Sem eles a mensagem de lista vai para o spam — e quem
 * quer sair sem achar o botão marca como spam, que é o pior sinal possível.
 */
async function despachar(
  marca: ReturnType<typeof marcaPorId>, para: string,
  email: {assunto:string;html:string;texto:string}, chaveUnica: string,
  descadastrar?: string,
): Promise<void> {
  if (!process.env.RESEND_CHAVE || !marca.email.remetente) throw new Error('Envio indisponível')
  const r = await fetch('https://api.resend.com/emails', {
    method:'POST', signal:AbortSignal.timeout(20000),
    headers:{Authorization:`Bearer ${process.env.RESEND_CHAVE}`,'Content-Type':'application/json','Idempotency-Key':chaveUnica},
    body:JSON.stringify({
      from:marca.email.remetente,to:[para],subject:email.assunto,html:email.html,text:email.texto,
      ...(descadastrar ? { headers: {
        'List-Unsubscribe': `<${descadastrar}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      } } : {}),
    }),
  })
  if (!r.ok) throw new Error('Envio indisponível')
}

/**
 * Os dois e-mails do cadastro, em um lugar só.
 *
 * Ficam aqui, exportados, porque a prévia (`npm run emails`) monta os MESMOS
 * textos. Se o corpo do e-mail morasse dentro do carteiro, a prévia seria uma
 * segunda versão do texto — e uma versão que ninguém checa envelhece calada.
 */
export function emailDeCadastro(marca: Marca, email: string, senhaProvisoria?: string) {
  const acesso=senhaProvisoria
    ? `Seus dados de entrada:\nE-mail: ${email}\nSenha provisória: ${senhaProvisoria}\n\nVocê já pode entrar para acompanhar a tela de espera. Após a aprovação, será necessário criar a sua própria senha antes de usar a plataforma.`
    : `E-mail cadastrado: ${email}. Seu recadastro está em análise. Após a aprovação, você receberá a senha provisória e as instruções de acesso, sem precisar lembrar sua senha antiga. Seu histórico será preservado. Por enquanto, sua senha não foi alterada.`
  return montarEmail(marca,'confirmar',new URL('/',marca.redirectUri).href,{
    assunto:`Cadastro recebido · ${marca.prosa}`,
    titulo:'Cadastro recebido',
    espia:`Seu cadastro na ${marca.prosa} foi recebido e está em análise.`,
    corpo:`Recebemos o seu cadastro na ${marca.prosa}. Ele está em análise pela nossa equipe — assim que for aprovado, você recebe um segundo e-mail com as orientações de acesso.\n\n${acesso}`,
    botao:'Entrar na plataforma',
    aviso:'Se não foi você que se cadastrou, pode ignorar este e-mail. Não compartilhe seus dados de acesso.',
  })
}

export function emailDeAprovacao(marca: Marca, email: string, aindaProvisoria: boolean) {
  const entrada=aindaProvisoria
    ? `Seus dados de entrada:\nE-mail: ${email}\nSenha provisória: ${SENHA_PROVISORIA}\n\nNo primeiro acesso após a aprovação, você deverá criar sua própria senha antes de usar a plataforma. Se você já tinha conta, esta senha substitui a anterior. Seu histórico foi preservado.`
    : `Sua conta e seu histórico foram preservados. Entre com o e-mail ${email} e a sua senha atual. Se não lembrar, clique em “Esqueci a senha” na tela de acesso e você recebe um link para definir uma nova senha.`
  return montarEmail(marca,'convite',new URL('/',marca.redirectUri).href,{
    assunto:`Cadastro aprovado · seu acesso à ${marca.prosa} está liberado`,
    titulo:'Cadastro aprovado',
    espia:`Seu acesso à ${marca.prosa} foi liberado.`,
    corpo:`Parabéns! Seu cadastro na ${marca.prosa} foi aprovado e o seu acesso está liberado. Você já pode entrar, conectar a sua conta da corretora e começar a operar.\n\n${entrada}`,
    botao:'Acessar a plataforma',
    aviso:'Guarde seus dados de acesso com segurança. Não compartilhe sua senha com ninguém.',
  })
}

let cadastrando=false
/**
 * O e-mail de boas-vindas, logo depois do cadastro.
 *
 * A conta de acesso nasce aqui, com a senha provisória da casa, e o e-mail
 * leva os dados de entrada. A pessoa já consegue entrar — e vai encontrar a
 * tela dizendo que o cadastro está em análise, porque a ficha dela nasce
 * 'pendente' (veja o gatilho `teeds_novo_cliente`). Quem libera é a aprovação.
 *
 * Roda no carteiro, e não no endereço público do cadastro, por três motivos:
 * o cadastro não fica esperando o Resend, uma falha é tentada de novo sozinha,
 * e vale igual para quem veio da landing e para quem veio da tela de login.
 */
export async function enviarCadastros() {
  if (cadastrando) return
  cadastrando=true
  try {
    const lista=await banco('/rest/v1/clientes_pendentes?status=eq.pendente&email_cadastro_em=is.null&select=id,marca,email,nome,telefone,user_id&order=criado_em.asc&limit=20')
    for (const p of lista ?? []) {
      try {
        const marca=marcaPorId(p.marca)
        if (!marca.email.remetente) continue   // marca sem domínio verificado: não manda pela outra
        // A conta pode já existir: cadastro repetido, ou uma passada anterior
        // que criou a conta e caiu antes de marcar o envio.
        let usuario=p.user_id
          ? await banco(`/auth/v1/admin/users/${encodeURIComponent(p.user_id)}`)
          : await banco(`/auth/v1/admin/users?filter=${encodeURIComponent(p.email)}`).then((d:any)=>(d?.users??[]).find((u:any)=>String(u.email).toLowerCase()===p.email))
        let criadaAgora=false
        if (!usuario) {
          usuario=await banco('/auth/v1/admin/users','POST',{
            email:p.email,password:SENHA_PROVISORIA,email_confirm:true,
            user_metadata:{nome:p.nome,telefone:p.telefone,marca:p.marca,trocar_senha:true},
            app_metadata:{cadastro_lead:p.id},
          })
          criadaAgora=true
        }
        if (!usuario?.id) throw new Error('Conta não criada')
        if (!p.user_id) await banco(`/rest/v1/clientes_pendentes?id=eq.${p.id}`,'PATCH',{user_id:usuario.id})

        const senhaConhecida=criadaAgora || (usuario.app_metadata?.cadastro_lead===p.id && usuario.user_metadata?.trocar_senha===true)
        const email=emailDeCadastro(marca,p.email,senhaConhecida?SENHA_PROVISORIA:undefined)
        await despachar(marca,p.email,email,`cadastro-lead-${p.id}`)
        await banco(`/rest/v1/clientes_pendentes?id=eq.${p.id}&status=eq.pendente`,'PATCH',{email_cadastro_em:new Date().toISOString()})
      } catch { console.warn('[cadastro] E-mail de boas-vindas pendente; será tentado novamente.') }
    }
  } catch { /* Migração ainda não aplicada: não interfere no resto. */ }
  finally { cadastrando=false }
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
        // Ainda com a provisória: repete os dados de entrada, porque este pode
        // ser o único e-mail que a pessoa achar depois. Quem já criou a própria
        // senha não recebe senha nenhuma de volta.
        const aindaProvisoria=u.user_metadata?.trocar_senha===true
          && u.app_metadata?.aprovacao_lead===p.id
          && u.app_metadata?.senha_aprovacao_versao===VERSAO_SENHA
        const email=emailDeAprovacao(marca,p.email,aindaProvisoria)
        await despachar(marca,p.email,email,`aprovacao-lead-${p.id}`)
        await banco(`/rest/v1/clientes_pendentes?id=eq.${p.id}&status=eq.aprovado`,'PATCH',{email_enviado_em:new Date().toISOString()})
      } catch { console.warn('[aprovação] E-mail pendente; será tentado novamente.') }
    }
  } catch { /* Migração ainda não aplicada: não interfere no carteiro existente. */ }
  finally { enviando=false }
}
