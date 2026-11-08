/**
 * Os e-mails da live de lançamento da GlobalFly (funil aprovado pelo Tiago em
 * 02/11/2026, PDF "Como vai funcionar o funil no lançamento?").
 *
 * Saem sozinhos, pela data, para quem está esperando a live (ficha
 * 'pendente' no plano "Aguardando live"). Cada etapa tem uma janela: quem se
 * inscreve no meio do caminho recebe só as que ainda estão abertas, nunca uma
 * fila de atrasados. Uma linha em `lancamento_emails` por envio: o mesmo
 * e-mail nunca sai duas vezes, e quem pediu para sair nunca recebe.
 *
 * O e-mail "na hora" (inscrição confirmada + acesso) é o do carteiro
 * (aprovacao-leads.ts, emailDeCadastro), e o de "acesso liberado" é o da
 * aprovação. Aqui fica o meio do caminho e o recado de quem não ficou.
 *
 * Regras de texto da casa: sem ponto de exclamação (pesa no filtro de spam),
 * sem "aposta", "sorte", "chute" ou "jogar"; a I.A. não "aprende", não "prevê",
 * não "acerta" e não "garante"; falou em depósito, vai o link de depósito da Deriv.
 * Antes do acesso liberado, a corretora não é nomeada (03/11/2026, Tiago: "só vamos anunciar
 * que é a Deriv para quem já tiver o acesso"): é sempre "a corretora".
 */
import { marcaPorId, type Marca } from '../../src/marca/marcas'
import { DERIV } from '../../src/core/deriv/config'
import { montarEmail } from './emails'
import { jaSairam, linkDeDescadastro } from './descadastro'
import { banco, comunidadeDe, despachar, enderecoDe, INICIO_DA_LIVE } from './aprovacao-leads'

const MARCA = 'globalfly'
const PLANO_AGUARDANDO = 'globalfly-aguardando-live'
const POR_RODADA = 30
const h = 36e5

interface Inscrito { email: string; nome: string | null; parceiro: string | null; criado_em: string }
interface Etapa {
  id: string
  /** Aberta para esta pessoa agora? */
  aberta: (agora: number, p: Inscrito, liberadoEm: number | null) => boolean
  montar: (marca: Marca, p: Inscrito) => { assunto: string; titulo: string; espia: string; corpo: string; botao?: string; url?: string; comunidade?: boolean }
}

// as datas em UTC (Brasília = UTC−3)
const em = (dia: number, horaBr: number, min = 0) => Date.UTC(2026, 10, dia, horaBr + 3, min)
const primeiro = (p: Inscrito) => (p.nome ?? '').trim().split(/\s+/)[0] || ''
const ola = (p: Inscrito) => primeiro(p) ? `${primeiro(p)}, ` : ''

const ETAPAS: Etapa[] = [
  {
    id: 'o-que-e',
    // um dia depois da inscrição; quem se inscreve a partir de sábado já está nos lembretes
    aberta: (agora, p) => agora >= Date.parse(p.criado_em) + 24 * h && agora < em(8, 9),
    montar: (marca, p) => ({
      assunto: `O que é a ${marca.prosa}, em um minuto`,
      titulo: `O que é a ${marca.prosa}`,
      espia: 'As I.A. analisam o mercado e operam por você, na sua conta, com as regras que você escolhe.',
      corpo: `${ola(p)}a ${marca.prosa} é uma plataforma em que **as I.A. analisam o mercado e operam automaticamente por você**, direto na sua conta da corretora e seguindo as regras que você escolhe: quanto buscar no dia e quanto aceitar perder.\n\nVocê não precisa entender de gráfico nem ficar na frente da tela. O dinheiro fica sempre na sua conta da corretora, no seu nome.\n\nNa live de **segunda, 09/11, às 20h**, a equipe mostra tudo funcionando ao vivo. Quem ficar até o fim recebe a plataforma liberada, sem pagar nada.`,
      botao: 'Ver a plataforma',
      comunidade: true,
    }),
  },
  {
    id: 'deriv',
    aberta: (agora) => agora >= em(5, 10) && agora < em(7, 9),
    montar: (marca, p) => ({
      assunto: 'Abra sua conta na corretora antes da live',
      titulo: 'Chegue à live com a conta pronta',
      espia: 'É grátis e leva poucos minutos. Na live, mostramos o primeiro depósito passo a passo.',
      corpo: `${ola(p)}para usar a ${marca.prosa} logo depois da live, você precisa de uma conta na corretora em que as I.A. operam. É grátis e leva poucos minutos.\n\n1. Crie a sua conta pelo botão abaixo.\n2. Confirme o seu e-mail.\n3. Na live, mostramos o primeiro depósito, passo a passo, por este link: ${DERIV.deposito}\n\nQuem chega à live com a conta pronta já sai dela com tudo ligado.`,
      botao: 'Abrir minha conta na corretora',
      url: (p.parceiro && marca.afiliadosDosParceiros?.[p.parceiro]) || marca.afiliado,
    }),
  },
  {
    id: 'presentes',
    aberta: (agora) => agora >= em(7, 10) && agora < em(8, 9),
    montar: (marca, p) => ({
      assunto: 'iMac e viagem internacional na live de segunda',
      titulo: 'Os presentes da live',
      espia: 'Além da plataforma liberada, um iMac e uma viagem internacional.',
      corpo: `${ola(p)}na live de **segunda, 09/11, às 20h**, além da ${marca.prosa} liberada para quem ficar até o fim, a equipe vai entregar **um iMac** e **uma viagem internacional**.\n\nComo participar é explicado na própria live, e só participa quem estiver assistindo até o fim. Separe o horário, deixe o celular carregado e entre alguns minutos antes.`,
      botao: 'Entrar na GlobalFly',
      comunidade: true,
    }),
  },
  {
    id: 'amanha',
    aberta: (agora) => agora >= em(8, 10) && agora < em(9, 8),
    montar: (marca, p) => ({
      assunto: 'É amanhã: live de lançamento às 20h',
      titulo: 'A live é amanhã',
      espia: 'Segunda, 09/11, às 20h, dentro da plataforma.',
      corpo: `${ola(p)}amanhã, **segunda, 09/11, às 20h** (Brasília), acontece a live de lançamento da ${marca.prosa}, dentro da própria plataforma.\n\nPara não perder: salve na agenda, ative os avisos no celular e confira hoje se você consegue entrar na sua conta. Se não lembrar a senha, toque em “Esqueci a senha” na tela de entrada.`,
      botao: 'Conferir meu acesso',
    }),
  },
  {
    id: 'hoje',
    aberta: (agora) => agora >= em(9, 9) && agora < em(9, 18, 30),
    montar: (marca, p) => ({
      assunto: 'É hoje, às 20h',
      titulo: 'A live é hoje',
      espia: 'Assista do início ao fim e o seu acesso é liberado.',
      corpo: `${ola(p)}hoje, às **20h** (Brasília), a live de lançamento da ${marca.prosa} começa dentro da plataforma.\n\nAssista do início ao fim: é isso que libera o seu acesso, sem pagar nada. Entre alguns minutos antes pelo botão abaixo.`,
      botao: 'Entrar na GlobalFly',
      comunidade: true,
    }),
  },
  {
    id: 'uma-hora',
    aberta: (agora) => agora >= em(9, 19) && agora < em(9, 19, 50),
    montar: (marca) => ({
      assunto: 'Falta 1 hora para a live',
      titulo: 'Falta 1 hora',
      espia: 'Abra a plataforma e deixe tudo pronto.',
      corpo: `Às 20h a live começa dentro da ${marca.prosa}. Abra a plataforma agora, confira se está entrando na sua conta e deixe o som ligado.\n\nQuando a live começar, o botão **Assistir** aparece na hora.`,
      botao: 'Abrir a GlobalFly',
    }),
  },
  {
    id: 'ao-vivo',
    aberta: (agora) => agora >= INICIO_DA_LIVE && agora < INICIO_DA_LIVE + 1.5 * h,
    montar: (marca) => ({
      assunto: 'Estamos ao vivo',
      titulo: 'A live começou',
      espia: 'Entre agora e fique até o fim para liberar o seu acesso.',
      corpo: `A live de lançamento da ${marca.prosa} começou. Entre agora e fique até o fim: a sua presença é marcada sozinha e, no fim da live, o acesso é liberado.`,
      botao: 'Assistir agora',
    }),
  },
  {
    id: 'nao-ficou',
    // depois do botão "Liberar acesso geral", para quem continua esperando (até 2 dias depois)
    aberta: (agora, _p, liberadoEm) => liberadoEm !== null && agora >= liberadoEm + 10 * 6e4 && agora < liberadoEm + 48 * h,
    montar: (marca, p) => ({
      assunto: 'A live de lançamento terminou',
      titulo: 'A live terminou',
      espia: 'O acesso da turma de lançamento foi liberado. O seu ainda não.',
      corpo: `${ola(p)}a live de lançamento da ${marca.prosa} terminou, e o acesso da turma inscrita foi liberado. O seu ainda não foi liberado.\n\nOs próximos passos serão avisados na comunidade do WhatsApp. Fique de olho por lá.`,
      comunidade: true,
    }),
  },
]

/** Monta o e-mail de uma etapa (a prévia usa o mesmo). */
export function emailDoLancamento(marca: Marca, etapa: string, p: Inscrito) {
  const e = ETAPAS.find((x) => x.id === etapa)
  if (!e) throw new Error(`Etapa desconhecida: ${etapa}`)
  const c = e.montar(marca, p)
  const comunidade = c.comunidade ? comunidadeDe(marca, p.parceiro) : undefined
  // o endereço do parceiro de quem se inscreveu: /n/ para o Naor, /v/ para o Victor
  return montarEmail(marca, 'convite', c.url ?? enderecoDe(marca, p.parceiro), {
    assunto: c.assunto, titulo: c.titulo, espia: c.espia, corpo: c.corpo,
    ...(c.botao ? { botao: c.botao } : {}),
    ...(comunidade ? { whatsapp: { url: comunidade, texto: 'Entrar na comunidade do WhatsApp' } } : {}),
    descadastrar: linkDeDescadastro(marca.id, p.email),
    motivo: `Você recebeu este e-mail porque se inscreveu na live de lançamento da ${marca.prosa}.`,
  })
}
export const ETAPAS_DO_LANCAMENTO = ETAPAS.map((e) => e.id)

/**
 * As notificações do dia da live (02/11/2026): "É hoje" às 10h, "Falta 1 hora"
 * às 19h e "A live começou" quando ela entra no ar (pelo painel ou às 20h).
 * Quem manda é a função `notificacoes` do Supabase (as chaves do Web Push moram
 * lá); aqui só se decide a hora, uma vez por etapa (marca em lancamento_emails).
 */
const AVISOS_NO_CELULAR: Array<{ id: string; aberta: (agora: number, live: { comecou_em: string | null; terminou_em: string | null }) => boolean }> = [
  { id: 'hoje', aberta: (agora) => agora >= em(9, 10) && agora < em(9, 18) },
  { id: 'uma-hora', aberta: (agora) => agora >= em(9, 19) && agora < em(9, 19, 50) },
  { id: 'ao-vivo', aberta: (agora, l) => !l.terminou_em && (
    (l.comecou_em !== null && agora - Date.parse(l.comecou_em) < h) || (agora >= INICIO_DA_LIVE && agora < INICIO_DA_LIVE + h)) },
]

async function avisarNoCelular(agora: number, live: { comecou_em: string | null; terminou_em: string | null }) {
  for (const aviso of AVISOS_NO_CELULAR) {
    if (!aviso.aberta(agora, live)) continue
    try {
      // marca antes de mandar: a chave primária garante uma vez só, mesmo com duas rodadas juntas
      await banco('/rest/v1/lancamento_emails', 'POST', { marca: MARCA, email: '*celular*', etapa: `push-${aviso.id}` })
    } catch { continue }
    try {
      const [cfg] = await banco('/rest/v1/config_servicos?chave=eq.PUSH_GATILHO&select=valor') ?? []
      const base = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
      const chave = process.env.SUPABASE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
      const r = await fetch(`${base}/functions/v1/notificacoes`, {
        method: 'POST', signal: AbortSignal.timeout(120_000),
        headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', 'x-gatilho': cfg?.valor ?? '' },
        body: JSON.stringify({ acao: 'lancamento', etapa: aviso.id }),
      })
      console.log(`[lançamento] notificação "${aviso.id}":`, r.status, await r.text().catch(() => ''))
      if (!r.ok) throw new Error(String(r.status))
    } catch {
      // não saiu: tira a marca para tentar na próxima rodada
      await banco(`/rest/v1/lancamento_emails?marca=eq.${MARCA}&email=eq.*celular*&etapa=eq.push-${aviso.id}`, 'DELETE').catch(() => undefined)
    }
  }
}

let rodando = false
/** Uma rodada do carteiro: fecha a live sozinha se preciso e manda as etapas abertas. */
export async function enviarEmailsDoLancamento(agora = Date.now()) {
  if (rodando || agora < Date.UTC(2026, 10, 2) || agora > INICIO_DA_LIVE + 4 * 864e5) return
  rodando = true
  try {
    // a live fecha sozinha 3 h depois; desde 08/11/2026 ninguém é liberado aqui: quem libera é o botão "Liberar acesso geral" (Clientes)
    if (agora >= INICIO_DA_LIVE + 0.5 * h) await banco('/rest/v1/rpc/teeds_lancamento_fechar_sozinha', 'POST', { p_marca: MARCA }).catch(() => undefined)

    const marca = marcaPorId(MARCA)
    if (!marca.email.remetente) return
    const [live] = await banco(`/rest/v1/lancamento_live?marca=eq.${MARCA}&select=liberado_em,comecou_em,terminou_em`) ?? []
    const liberadoEm = live?.liberado_em ? Date.parse(live.liberado_em) : null
    if (live) await avisarNoCelular(agora, { comecou_em: live.comecou_em ?? null, terminou_em: live.terminou_em ?? null })
    const inscritos: Inscrito[] = await banco(`/rest/v1/clientes?marca=eq.${MARCA}&status_acesso=eq.pendente&plano_id=eq.${PLANO_AGUARDANDO}&select=email,nome,parceiro,criado_em&order=criado_em.asc&limit=5000`) ?? []
    if (!inscritos.length) return
    const sairam = await jaSairam(MARCA)   // sem a lista, não manda (lança e para aqui)
    const enviados: Array<{ email: string; etapa: string }> = await banco(`/rest/v1/lancamento_emails?marca=eq.${MARCA}&select=email,etapa&limit=50000`) ?? []
    const ja = new Set(enviados.map((x) => `${x.etapa}|${x.email.toLowerCase()}`))

    let mandados = 0
    for (const etapa of ETAPAS) {
      for (const p of inscritos) {
        if (mandados >= POR_RODADA) return
        const email = (p.email ?? '').trim().toLowerCase()
        if (!email || sairam.has(email) || ja.has(`${etapa.id}|${email}`)) continue
        if (!etapa.aberta(agora, p, liberadoEm)) continue
        // grava antes de mandar (a chave primária barra a segunda vez); se o envio falhar, apaga e tenta na próxima rodada
        try {
          await banco('/rest/v1/lancamento_emails', 'POST', { marca: MARCA, email, etapa: etapa.id })
        } catch { continue }
        ja.add(`${etapa.id}|${email}`)
        try {
          await despachar(marca, email, emailDoLancamento(marca, etapa.id, p), `lancamento-${etapa.id}-${email}`, linkDeDescadastro(MARCA, email))
          mandados++
        } catch {
          console.warn(`[lançamento] e-mail "${etapa.id}" não saiu agora; tenta de novo.`)
          await banco(`/rest/v1/lancamento_emails?marca=eq.${MARCA}&etapa=eq.${etapa.id}&email=eq.${encodeURIComponent(email)}`, 'DELETE').catch(() => undefined)
          return   // o Resend recusou: para a rodada em vez de queimar a lista
        }
      }
    }
  } catch (e) { console.warn('[lançamento]', (e as Error).message) }
  finally { rodando = false }
}
