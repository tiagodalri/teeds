/**
 * Aviso por e-mail da liberação por exceção (18/11/2026, pedido do Tiago).
 *
 * 24 clientes Gold que geraram markup e ficaram sem saldo foram liberados mesmo
 * assim (clientes.liberado_sem_saldo, nota '18/11 exceção do Tiago…'). 14 tinham
 * notificação no celular e receberam o push; este e-mail vai para os outros 10
 * (quem tem aparelho inscrito fica de fora, para não avisar duas vezes).
 *
 *   node dist/aviso-excecao-sem-saldo.mjs ensaio | enviar
 *
 * As travas de sempre: quem pediu para sair não recebe; cada envio vira uma linha
 * em lancamento_emails (etapa 'excecao-sem-saldo') ANTES de sair, então rodar de
 * novo não manda duas vezes; chave única no Resend.
 */
import './ambiente'
import { marcaPorId } from '../../src/marca/marcas'
import { montarEmail } from './emails'
import { jaSairam, linkDeDescadastro } from './descadastro'
import { banco, despachar } from './aprovacao-leads'

const MARCA = 'globalfly'
const ETAPA = 'excecao-sem-saldo'
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))
interface Cliente { user_id: string; email: string; nome: string | null; parceiro: string | null }
const capitalizado = (s: string) => s ? s[0].toLocaleUpperCase('pt-BR') + s.slice(1).toLocaleLowerCase('pt-BR') : ''

export function emailDaExcecao(p: Cliente) {
  const marca = marcaPorId(MARCA)
  const nome = capitalizado((p.nome ?? '').trim().split(/\s+/)[0] || '')
  const parceiro = ['n', 'v', 'd'].includes(p.parceiro ?? '') ? p.parceiro : ''
  const link = parceiro ? `https://globalflytrade.com/${parceiro}/inicio` : 'https://globalflytrade.com/'
  return montarEmail(marca, 'convite', link, {
    assunto: 'Sua conta na GlobalFly foi liberada',
    titulo: 'Sua conta foi liberada',
    espia: 'Abrimos uma exceção: a GlobalFly está liberada para você mesmo sem saldo.',
    corpo: `${nome ? `${nome}, abrimos` : 'Abrimos'} uma **exceção** para você: a sua conta na ${marca.prosa} está **liberada**, mesmo sem saldo na corretora.\n\nÉ só entrar na plataforma e voltar a usar normalmente.`,
    botao: 'Entrar na GlobalFly',
    descadastrar: linkDeDescadastro(MARCA, p.email),
    motivo: `Você recebeu este e-mail porque tem uma conta na ${marca.prosa}.`,
  })
}

async function main() {
  const modo = process.argv[2]
  if (modo !== 'ensaio' && modo !== 'enviar') { console.error('Use: ensaio | enviar'); process.exit(1) }
  const marca = marcaPorId(MARCA)
  if (!marca.email.remetente) throw new Error('A GlobalFly está sem remetente de e-mail.')
  const clientes: Cliente[] = await banco(`/rest/v1/clientes?marca=eq.${MARCA}&liberado_sem_saldo=is.true&liberado_sem_saldo_nota=like.${encodeURIComponent('18/11 exceção do Tiago*')}&select=user_id,email,nome,parceiro`) ?? []
  const comAparelho: Array<{ user_id: string }> = clientes.length ? await banco(`/rest/v1/push_assinaturas?marca=eq.${MARCA}&user_id=in.(${clientes.map((c) => c.user_id).join(',')})&select=user_id`) ?? [] : []
  const temPush = new Set(comAparelho.map((a) => a.user_id))
  const sairam = await jaSairam(MARCA)
  const enviados: Array<{ email: string }> = await banco(`/rest/v1/lancamento_emails?marca=eq.${MARCA}&etapa=eq.${ETAPA}&select=email&limit=5000`) ?? []
  const ja = new Set(enviados.map((x) => x.email.toLowerCase()))
  const fila: Cliente[] = []
  let pediramParaSair = 0, jaRecebeu = 0, recebeuPush = 0
  for (const c of clientes) {
    const email = (c.email ?? '').trim().toLowerCase()
    if (!email.includes('@')) continue
    if (temPush.has(c.user_id)) { recebeuPush++; continue }
    if (sairam.has(email)) { pediramParaSair++; continue }
    if (ja.has(email)) { jaRecebeu++; continue }
    fila.push({ ...c, email })
  }
  console.log(`Liberados: ${clientes.length} · já avisados no celular: ${recebeuPush} · pediram para sair: ${pediramParaSair} · já receberam o e-mail: ${jaRecebeu} · na fila: ${fila.length}`)
  if (modo === 'ensaio') {
    const e = emailDaExcecao(fila[0] ?? { user_id: '', email: 'exemplo@gmail.com', nome: 'Maria', parceiro: 'v' })
    console.log(`\nAssunto: ${e.assunto}\nRemetente: ${marca.email.remetente}\n\n${e.texto}\n\nPara: ${fila.map((f) => f.email).join(', ')}`)
    return
  }
  let mandados = 0, falhas = 0
  for (const p of fila) {
    try { await banco('/rest/v1/lancamento_emails', 'POST', { marca: MARCA, email: p.email, etapa: ETAPA }) } catch { jaRecebeu++; continue }
    try { await despachar(marca, p.email, emailDaExcecao(p), `${ETAPA}-${p.email}`, linkDeDescadastro(MARCA, p.email)); mandados++ }
    catch (e) {
      falhas++; console.warn(`falhou ${p.email}: ${(e as Error).message}`)
      await banco(`/rest/v1/lancamento_emails?marca=eq.${MARCA}&etapa=eq.${ETAPA}&email=eq.${encodeURIComponent(p.email)}`, 'DELETE').catch(() => undefined)
      if (falhas >= 3) { console.warn('O Resend recusou 3 vezes; parei.'); break }
    }
    await pausa(250)
  }
  console.log(`Enviados: ${mandados} · falhas: ${falhas}`)
}

main().catch((e) => { console.error((e as Error).message); process.exit(1) })
