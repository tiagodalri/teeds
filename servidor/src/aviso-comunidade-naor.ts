/**
 * Aviso da comunidade nova do Naor (05/11/2026).
 *
 * A comunidade antiga do Naor no WhatsApp foi inativada e ele criou uma nova
 * (https://chat.whatsapp.com/L3ITpIcORkG57tf1aIYnlp, já em marcas.ts). O Tiago
 * aprovou o texto e pediu para avisar todos os leads do Naor por e-mail:
 * "era legal falar que tivemos um problema e a comunidade foi inativada".
 *
 *   cd /root/teeds/servidor
 *   node dist/aviso-comunidade-naor.mjs ensaio     # só conta e mostra
 *   node dist/aviso-comunidade-naor.mjs enviar     # manda
 *
 * As mesmas travas dos e-mails do lançamento: quem pediu para sair não recebe
 * (sem a lista de descadastros, não manda nada); cada envio vira uma linha em
 * lancamento_emails (etapa 'comunidade-nova') ANTES de sair, então rodar de
 * novo não manda duas vezes; e cada envio leva uma chave única no Resend.
 */
import './ambiente'
import { marcaPorId } from '../../src/marca/marcas'
import { montarEmail } from './emails'
import { jaSairam, linkDeDescadastro } from './descadastro'
import { banco, comunidadeDe, despachar } from './aprovacao-leads'

const MARCA = 'globalfly'
const PARCEIRO = 'n'
const ETAPA = 'comunidade-nova'
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Lead { email: string; nome: string | null; parceiro: string | null }

const primeiro = (p: Lead) => (p.nome ?? '').trim().split(/\s+/)[0] || ''
const capitalizado = (s: string) => s ? s[0].toLocaleUpperCase('pt-BR') + s.slice(1).toLocaleLowerCase('pt-BR') : ''

export function emailDaComunidadeNova(p: Lead) {
  const marca = marcaPorId(MARCA)
  const nome = capitalizado(primeiro(p))
  const inicio = nome ? `${nome}, tivemos` : 'Tivemos'
  return montarEmail(marca, 'convite', comunidadeDe(marca, p.parceiro ?? PARCEIRO), {
    assunto: 'Criamos uma nova comunidade no WhatsApp',
    titulo: 'Criamos uma nova comunidade',
    espia: 'A comunidade antiga foi inativada. Entre na nova para receber os avisos da live de 09/11.',
    corpo: `${inicio} um problema com a nossa comunidade no WhatsApp e ela foi **inativada**. Por isso, **criamos uma nova**, e é por ela que vão chegar os avisos da live de lançamento e os próximos passos.\n\nSe você já estava na antiga, entre na nova pelo botão abaixo. Leva um toque.\n\nA live continua marcada para **segunda, 09/11, às 20h** (Brasília), dentro da plataforma.`,
    botao: 'Entrar na nova comunidade',
    descadastrar: linkDeDescadastro(MARCA, p.email),
    motivo: `Você recebeu este e-mail porque se inscreveu na live de lançamento da ${marca.prosa}.`,
  })
}

async function main() {
  const modo = process.argv[2]
  if (modo !== 'ensaio' && modo !== 'enviar') {
    console.error('Use: node dist/aviso-comunidade-naor.mjs ensaio | enviar')
    process.exit(1)
  }
  const marca = marcaPorId(MARCA)
  if (!marca.email.remetente) throw new Error('A GlobalFly está sem remetente de e-mail.')

  const leads: Lead[] = await banco(`/rest/v1/clientes?marca=eq.${MARCA}&parceiro=eq.${PARCEIRO}&email=not.is.null&select=email,nome,parceiro&order=criado_em.asc&limit=5000`) ?? []
  const sairam = await jaSairam(MARCA)   // sem a lista, lança e não manda nada
  const enviados: Array<{ email: string }> = await banco(`/rest/v1/lancamento_emails?marca=eq.${MARCA}&etapa=eq.${ETAPA}&select=email&limit=50000`) ?? []
  const ja = new Set(enviados.map((x) => x.email.toLowerCase()))

  const vistos = new Set<string>()
  const fila: Lead[] = []
  let pediramParaSair = 0, jaRecebeu = 0
  for (const p of leads) {
    const email = (p.email ?? '').trim().toLowerCase()
    if (!email || !email.includes('@') || vistos.has(email)) continue
    vistos.add(email)
    if (sairam.has(email)) { pediramParaSair++; continue }
    if (ja.has(email)) { jaRecebeu++; continue }
    fila.push({ ...p, email })
  }
  console.log(`Leads do /${PARCEIRO}: ${vistos.size} e-mails · pediram para sair: ${pediramParaSair} · já receberam: ${jaRecebeu} · na fila: ${fila.length}`)

  if (modo === 'ensaio') {
    const exemplo = fila[0] ?? { email: 'exemplo@gmail.com', nome: 'Maria', parceiro: PARCEIRO }
    const e = emailDaComunidadeNova(exemplo)
    console.log(`\nAssunto: ${e.assunto}\nRemetente: ${marca.email.remetente}\n\n${e.texto}`)
    return
  }

  let mandados = 0, falhas = 0
  for (const p of fila) {
    // grava antes de mandar (a chave primária barra a segunda vez); se o envio falhar, apaga
    try { await banco('/rest/v1/lancamento_emails', 'POST', { marca: MARCA, email: p.email, etapa: ETAPA }) } catch { jaRecebeu++; continue }
    try {
      await despachar(marca, p.email, emailDaComunidadeNova(p), `${ETAPA}-${p.email}`, linkDeDescadastro(MARCA, p.email))
      mandados++
    } catch {
      falhas++
      await banco(`/rest/v1/lancamento_emails?marca=eq.${MARCA}&etapa=eq.${ETAPA}&email=eq.${encodeURIComponent(p.email)}`, 'DELETE').catch(() => undefined)
      if (falhas >= 3) { console.warn('O Resend recusou 3 vezes; parei para não queimar a lista.'); break }
    }
    await pausa(250)   // ~4 por segundo, abaixo do limite do Resend
  }
  console.log(`Enviados: ${mandados} · falhas: ${falhas}`)
}

main().catch((e) => { console.error((e as Error).message); process.exit(1) })
