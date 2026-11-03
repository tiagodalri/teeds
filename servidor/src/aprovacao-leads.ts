import './ambiente'
import { createHmac, randomUUID } from 'node:crypto'
import { marcaPorId, type Marca } from '../../src/marca/marcas'
import { montarEmail } from './emails'
import { planoClienteValido } from '../../src/core/teeds/planos'
import { emailDaConta } from '../../src/core/teeds/emailDaConta'

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
export async function banco(path: string, method='GET', body?: unknown): Promise<any> {
  const r = await fetch(`${base()}${path}`, {
    method, signal: AbortSignal.timeout(20000),
    headers: { apikey: segredo(), Authorization: `Bearer ${segredo()}`, 'Content-Type':'application/json' },
    ...(body === undefined ? {} : {body:JSON.stringify(body)}),
  })
  if (!r.ok) throw new Error('Não foi possível concluir. Atualize a lista e tente novamente em dois minutos.')
  return r.status===204 ? undefined : r.json().catch(()=>undefined)
}
/** `escopo`: o parceiro cujos cadastros aparecem ('' = direto); undefined = todos (admin geral sem filtro). */
export async function listarPendentes(marca: string, status: string, pagina: number, escopo?: string) {
  if (!['pendente','processando','aprovado','recusado'].includes(status)) throw new Error('Filtro inválido.')
  if (escopo !== undefined && !/^[a-z0-9]{0,20}$/.test(escopo)) throw new Error('Filtro inválido.')
  const offset=Math.max(0,Math.floor(pagina))*50
  const doEscopo = escopo === undefined ? '' : escopo === '' ? '&or=(parceiro.is.null,parceiro.eq.)' : `&parceiro=eq.${escopo}`
  return banco(`/rest/v1/clientes_pendentes?marca=eq.${marca}&status=eq.${status}${doEscopo}&select=id,nome,email,telefone,status,recadastro,ultima_inscricao_em,criado_em,decidido_em,email_enviado_em,parceiro&order=ultima_inscricao_em.desc,id.desc&limit=51&offset=${offset}`)
}
/**
 * O cliente cria a própria senha no cadastro (28/10/2026, Tiago: "o cliente
 * cria a própria senha no cadastro... não mexa em quem já tem cadastro").
 *
 * Só vale para quem NÃO tem conta nesta marca: a conta nasce aqui, com a
 * senha que a pessoa digitou, marcada `senha_propria` (a aprovação e os
 * e-mails nunca mandam nem regravam senha para ela). Quem já tem conta segue
 * exatamente o fluxo antigo, e a senha digitada é descartada. A senha nunca
 * é gravada em tabela nem em log: vai direto para a Auth.
 *
 *   'criada'     conta nova com a senha da pessoa
 *   'existente'  já havia conta: nada mudou nela
 *   'provisoria' não deu para criar agora: o carteiro cria com a provisória (fluxo antigo)
 */
export async function contaComSenhaPropria(marca: string, email: string, nome: string, telefone: string, senha: string): Promise<'criada' | 'existente' | 'provisoria'> {
  const conta = emailDaConta(email, marca)
  try {
    const achados = await banco(`/auth/v1/admin/users?filter=${encodeURIComponent(conta)}`)
    if ((achados?.users ?? []).some((u: any) => String(u.email).toLowerCase() === conta)) return 'existente'
    const [pendente] = await banco(`/rest/v1/clientes_pendentes?marca=eq.${encodeURIComponent(marca)}&email=eq.${encodeURIComponent(email)}&status=eq.pendente&select=id,user_id&limit=1`) ?? []
    if (!pendente?.id || pendente.user_id) return pendente?.user_id ? 'existente' : 'provisoria'
    let usuario: any
    try {
      usuario = await banco('/auth/v1/admin/users', 'POST', {
        email: conta, password: senha, email_confirm: true,
        user_metadata: { nome, telefone, marca, trocar_senha: false },
        app_metadata: { cadastro_lead: pendente.id, senha_propria: true },
      })
    } catch {
      // Cadastro duplo no mesmo instante: a outra chamada criou a conta; esta não mexe nela.
      return 'existente'
    }
    if (!usuario?.id) return 'provisoria'
    await banco(`/rest/v1/clientes_pendentes?id=eq.${pendente.id}&user_id=is.null`, 'PATCH', { user_id: usuario.id })
    return 'criada'
  } catch (e) {
    console.warn('[cadastro] conta com senha própria não criada agora; segue o fluxo da provisória:', (e as Error).message)
    return 'provisoria'
  }
}

export async function decidirLead(id: string, marca: string, admin: string, acao: string, plano='essencial') {
  // A marca do cadastro decide os planos (o GF Member só existe na GlobalFly);
  // até 20/10/2026 valia a marca padrão do servidor e o GF Member era recusado.
  if (!planoClienteValido(plano, marcaPorId(marca))) throw new Error('Plano inválido.')
  if (!/^[0-9a-f-]{36}$/i.test(id) || !['aprovar','recusar'].includes(acao)) throw new Error('Pedido inválido.')
  const trava=randomUUID()
  const ficha=await banco('/rest/v1/rpc/teeds_decidir_lead','POST',{p_id:id,p_marca:marca,p_admin:admin,p_acao:acao,p_trava:trava,p_plano:plano})
  if (ficha.status!=='processando') return {status:ficha.status}
  let usuario=await banco('/rest/v1/rpc/teeds_auth_do_pendente','POST',{p_id:id,p_trava:trava})
  if (!usuario) {
    // Admin Auth não dispara confirmação. O e-mail só sai depois de finalizar.
    try {
      usuario=await banco('/auth/v1/admin/users','POST',{
        email:emailDaConta(ficha.email,marca),password:SENHA_PROVISORIA,email_confirm:true,
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
  if (atual.app_metadata?.senha_propria===true) {
    // Senha criada pela própria pessoa no cadastro (28/10/2026): só carimba a
    // aprovação. Nada de senha provisória, nada de troca obrigatória.
    if (atual.app_metadata?.aprovacao_lead!==id) {
      await banco(`/auth/v1/admin/users/${encodeURIComponent(usuario.id)}`,'PUT',{
        app_metadata:{...atual.app_metadata,aprovacao_lead:id},
      })
    }
  } else if (atual.app_metadata?.aprovacao_lead!==id || atual.app_metadata?.senha_aprovacao_versao!==VERSAO_SENHA) {
    const admins=await banco(`/rest/v1/administradores?user_id=eq.${encodeURIComponent(usuario.id)}&select=user_id&limit=1`)
    if (!Array.isArray(admins) || admins.length) throw new Error('Contas administrativas não podem ter a senha renovada pelo cadastro público.')
    /*
      TROCAR A SENHA DERRUBA QUEM JA ESTA DENTRO.
      
      Regravar a senha pela API de admin faz o Supabase apagar as sessoes do
      usuario. Desde 30/09/2026 a pessoa entra ANTES da aprovacao (ela ve a
      tela "cadastro em analise"), entao ela pode muito bem estar logada
      quando o aprovador clica. Foi o que aconteceu com um cliente da OMNI em
      06/10/2026: entrou as 21:35, foi aprovado as 21:37, e ao salvar a senha
      nova recebeu "Session from session_id claim in JWT does not exist" — o
      token dele apontava para uma sessao que a propria aprovacao apagara.

      A senha so precisa ser regravada quando NAO se sabe qual e'. Se a conta
      nasceu deste mesmo cadastro e o titular ainda nao escolheu a dele
      (`trocar_senha` continua true), a provisoria ja e' a que o e-mail
      anuncia: basta carimbar os marcadores, sem tocar na senha e sem
      derrubar ninguem. E' a mesma leitura que `enviarCadastros` ja fazia
      para decidir se podia anunciar a senha no e-mail.
    */
    const senhaJaConhecida =
      atual.app_metadata?.cadastro_lead===id && atual.user_metadata?.trocar_senha===true
    // Senha e marcador juntos: se a resposta se perder, retomar não desfaz
    // uma senha que o titular já tenha escolhido entre as tentativas.
    await banco(`/auth/v1/admin/users/${encodeURIComponent(usuario.id)}`,'PUT',{
      ...(senhaJaConhecida ? {} : {password:SENHA_PROVISORIA}),
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
export async function despachar(
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
/**
 * Lançamento da GlobalFly (funil aprovado pelo Tiago em 02/11/2026): quem se
 * inscreve até a live recebe "inscrição confirmada" com o acesso, e não
 * "cadastro em análise"; quem fica na live até o fim recebe "acesso liberado".
 * As mesmas datas de src/core/teeds/lancamento.ts (que não roda no Node).
 */
export const INICIO_DA_LIVE = Date.UTC(2026, 10, 9, 23, 0, 0)
export const FIM_DA_LIVE = INICIO_DA_LIVE + 3 * 36e5
export const noLancamento = (marca: Marca, agora = Date.now()) => marca.id === 'globalfly' && agora < FIM_DA_LIVE
/** O parceiro da pessoa, só se for um parceiro de verdade desta marca (/n, /v). */
const doParceiro = (marca: Marca, parceiro?: string | null) => parceiro && marca.parceiros?.includes(parceiro) ? parceiro : null
/** A comunidade do WhatsApp de quem veio por um parceiro (/n, /v); sem parceiro, a da marca. */
export const comunidadeDe = (marca: Marca, parceiro?: string | null) =>
  (doParceiro(marca, parceiro) && marca.comunidadesDosParceiros?.[parceiro!]) || marca.comunidade
/**
 * O endereço da plataforma nos e-mails (Tiago, 02/11/2026: "leads que vierem do
 * /n/cadastro sempre veem os links do Naor e os do /v/cadastro, os do Victor"):
 * globalflytrade.com/n/ para o Naor, /v/ para o Victor, a raiz para o direto.
 */
export const enderecoDe = (marca: Marca, parceiro?: string | null) => {
  const c = doParceiro(marca, parceiro)
  // /n/inicio (e não /n/, que abre o formulário de cadastro): a tela de entrar, guardando o parceiro
  return new URL(c ? `/${c}/inicio` : '/', marca.redirectUri).href
}

function emailDeInscricaoNaLive(marca: Marca, email: string, senhaProvisoria: string | undefined, senhaPropria: boolean, parceiro?: string | null) {
  const comunidade = comunidadeDe(marca, parceiro)
  const acesso=senhaPropria
    ? `Seus dados de entrada:\nE-mail: ${email}\nSenha: a que você criou no cadastro.\n\nSe não lembrar a senha, toque em “Esqueci a senha” na tela de entrada e crie uma nova.`
    : senhaProvisoria
    ? `Seus dados de entrada:\nE-mail: ${email}\nSenha provisória: ${senhaProvisoria}`
    : `Você já tinha uma conta com o e-mail ${email}. Ela foi mantida como está: entre com a sua senha de sempre.`
  return montarEmail(marca,'confirmar',enderecoDe(marca,parceiro),{
    assunto:'Inscrição confirmada · live de 09/11, às 20h',
    titulo:'Sua vaga na live está garantida',
    espia:'Sua conta na GlobalFly já foi criada. A plataforma é liberada na live de 09/11, às 20h.',
    corpo:`Sua inscrição na live de lançamento da ${marca.prosa} está confirmada: **segunda, 09/11, às 20h** (horário de Brasília), dentro da própria plataforma.\n\nSua conta já foi criada. Entre agora e conheça a plataforma: ela fica trancada até a live, com a contagem regressiva. Assista do início ao fim e o acesso é liberado para você, sem pagar nada.\n\n${acesso}`,
    botao:'Entrar na GlobalFly',
    ...(comunidade?{whatsapp:{url:comunidade,texto:'Entrar na comunidade do WhatsApp'}}:{}),
    aviso:'Se não foi você que se inscreveu, pode ignorar este e-mail. Não compartilhe seus dados de acesso.',
    motivo:`Você recebeu este e-mail porque se inscreveu na live de lançamento da ${marca.prosa}.`,
  })
}

export function emailDeCadastro(marca: Marca, email: string, senhaProvisoria?: string, senhaPropria = false, parceiro?: string | null) {
  if (noLancamento(marca)) return emailDeInscricaoNaLive(marca,email,senhaProvisoria,senhaPropria,parceiro)
  const acesso=senhaPropria
    ? `Seus dados de entrada:\nE-mail: ${email}\nSenha: a que você criou no cadastro.\n\nVocê já pode entrar para acompanhar a análise. Se não lembrar a senha, toque em “Esqueci a senha” na tela de entrada e crie uma nova.`
    : senhaProvisoria
    ? `Seus dados de entrada:\nE-mail: ${email}\nSenha provisória: ${senhaProvisoria}\n\nVocê já pode entrar para acompanhar a análise. Após a aprovação, será necessário criar a sua própria senha antes de usar a plataforma.`
    : `Você já tinha uma conta com o e-mail ${email}. Ela foi mantida como está: sua senha não foi alterada, e uma senha nova digitada no cadastro não vale para ela.\n\nApós a aprovação, você recebe por e-mail a senha provisória e as instruções de acesso. Seu histórico continua guardado.`
  /*
    Recadastro de conta existente (29/10/2026): sem botão de entrar. A pessoa
    acabou de digitar uma senha que não vale para esta conta e, em geral, não
    lembra a antiga — um botão "Entrar" seria uma ação que ela não consegue
    fazer. O próximo passo dela é esperar o e-mail da aprovação.
  */
  const podeEntrar=senhaPropria||!!senhaProvisoria
  return montarEmail(marca,'confirmar',enderecoDe(marca,parceiro),{
    assunto:`Cadastro recebido · ${marca.prosa}`,
    titulo:'Cadastro recebido',
    espia:`Seu cadastro na ${marca.prosa} foi recebido e está em análise.`,
    corpo:`Recebemos o seu cadastro na ${marca.prosa}. Ele está em análise pela nossa equipe; avisamos por e-mail quando for aprovado.\n\n${acesso}`,
    ...(podeEntrar?{botao:'Entrar na plataforma'}:{}),
    aviso:'Se não foi você que se cadastrou, pode ignorar este e-mail. Não compartilhe seus dados de acesso.',
  })
}

export function emailDeAprovacao(marca: Marca, email: string, aindaProvisoria: boolean, senhaPropria = false, parceiro?: string | null) {
  // liberado na live de lançamento (até 7 dias depois): o e-mail fala da live, não de "cadastro aprovado"
  const daLive = marca.id === 'globalfly' && Date.now() >= INICIO_DA_LIVE && Date.now() < INICIO_DA_LIVE + 7 * 864e5
  const entrada=senhaPropria
    ? `Seus dados de entrada:\nE-mail: ${email}\nSenha: a que você criou no cadastro.\n\nSe não lembrar a senha, toque em “Esqueci a senha” na tela de entrada e crie uma nova.`
    : aindaProvisoria
    ? `Seus dados de entrada:\nE-mail: ${email}\nSenha provisória: ${SENHA_PROVISORIA}\n\nNo primeiro acesso após a aprovação, você deverá criar sua própria senha antes de usar a plataforma. Se você já tinha conta, esta senha substitui a anterior. Seu histórico foi preservado.`
    : `Sua conta e seu histórico foram preservados. Entre com o e-mail ${email} e a sua senha atual. Se não lembrar, toque em “Esqueci a senha” na tela de entrada e você recebe um link para definir uma nova senha.`
  if (daLive) return montarEmail(marca,'convite',enderecoDe(marca,parceiro),{
    assunto:`Seu acesso está liberado · bem-vindo à ${marca.prosa}`,
    titulo:'Seu acesso está liberado',
    espia:'A live de lançamento aconteceu. A plataforma é sua, até 09/11/2027.',
    corpo:`A live de lançamento da ${marca.prosa} aconteceu e agora você é **GF Member**, com acesso até **09/11/2027**. A plataforma está liberada para você: as I.A., a operação manual, as aulas e a sala de treino.\n\nO próximo passo é conectar a sua conta da Deriv dentro da plataforma.\n\n${entrada}`,
    botao:'Entrar na GlobalFly',
    aviso:'Guarde seus dados de acesso com segurança. Não compartilhe sua senha com ninguém.',
  })
  return montarEmail(marca,'convite',enderecoDe(marca,parceiro),{
    assunto:`Cadastro aprovado · seu acesso à ${marca.prosa} está liberado`,
    titulo:'Cadastro aprovado',
    espia:`Seu acesso à ${marca.prosa} foi liberado.`,
    corpo:`Parabéns! Seu cadastro na ${marca.prosa} foi aprovado e o seu acesso está liberado. Você já pode entrar, conectar a sua conta da corretora e começar a operar.\n\n${entrada}`,
    botao:'Entrar na plataforma',
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
    // 45 s de folga: o cadastro com senha própria cria a conta logo depois do
    // pedido; o carteiro não pode chegar antes e criar a conta com a provisória.
    const folga=new Date(Date.now()-45_000).toISOString()
    const lista=await banco(`/rest/v1/clientes_pendentes?status=eq.pendente&email_cadastro_em=is.null&ultima_inscricao_em=lt.${encodeURIComponent(folga)}&select=id,marca,email,nome,telefone,user_id,parceiro&order=criado_em.asc&limit=20`)
    for (const p of lista ?? []) {
      try {
        const marca=marcaPorId(p.marca)
        if (!marca.email.remetente) continue   // marca sem domínio verificado: não manda pela outra
        // A conta pode já existir: cadastro repetido, ou uma passada anterior
        // que criou a conta e caiu antes de marcar o envio.
        let usuario=p.user_id
          ? await banco(`/auth/v1/admin/users/${encodeURIComponent(p.user_id)}`)
          : await banco(`/auth/v1/admin/users?filter=${encodeURIComponent(emailDaConta(p.email,p.marca))}`).then((d:any)=>(d?.users??[]).find((u:any)=>String(u.email).toLowerCase()===emailDaConta(p.email,p.marca)))
        let criadaAgora=false
        if (!usuario) {
          usuario=await banco('/auth/v1/admin/users','POST',{
            email:emailDaConta(p.email,p.marca),password:SENHA_PROVISORIA,email_confirm:true,
            user_metadata:{nome:p.nome,telefone:p.telefone,marca:p.marca,trocar_senha:true},
            app_metadata:{cadastro_lead:p.id},
          })
          criadaAgora=true
        }
        if (!usuario?.id) throw new Error('Conta não criada')
        if (!p.user_id) await banco(`/rest/v1/clientes_pendentes?id=eq.${p.id}`,'PATCH',{user_id:usuario.id})

        const senhaPropria=usuario.app_metadata?.senha_propria===true
        const senhaConhecida=!senhaPropria && (criadaAgora || (usuario.app_metadata?.cadastro_lead===p.id && usuario.user_metadata?.trocar_senha===true))
        const email=emailDeCadastro(marca,p.email,senhaConhecida?SENHA_PROVISORIA:undefined,senhaPropria,p.parceiro)
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
    const lista=await banco('/rest/v1/clientes_pendentes?status=eq.aprovado&email_enviado_em=is.null&select=id,marca,email,user_id,parceiro&order=decidido_em.asc&limit=20')
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
        const email=emailDeAprovacao(marca,p.email,aindaProvisoria,u.app_metadata?.senha_propria===true,p.parceiro)
        await despachar(marca,p.email,email,`aprovacao-lead-${p.id}`)
        await banco(`/rest/v1/clientes_pendentes?id=eq.${p.id}&status=eq.aprovado`,'PATCH',{email_enviado_em:new Date().toISOString()})
      } catch { console.warn('[aprovação] E-mail pendente; será tentado novamente.') }
    }
  } catch { /* Migração ainda não aplicada: não interfere no carteiro existente. */ }
  finally { enviando=false }
}
