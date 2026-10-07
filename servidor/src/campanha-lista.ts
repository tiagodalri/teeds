/**
 * Dispara a campanha para uma lista de endereços escrita à mão.
 *
 *   cd /root/teeds/servidor
 *   node dist/campanha-lista.mjs teeds ensaio  a@b.com,c@d.com   # só mostra
 *   node dist/campanha-lista.mjs teeds enviar  a@b.com,c@d.com
 *
 * POR QUE ISTO EXISTE, tendo `campanha-envio` do lado. Lá a leva é escolhida
 * por grupo — um provedor, ter nome ou não — e a ordem é fixa: quem mais usou
 * a plataforma primeiro. Isso é certo para varrer a base, e inútil quando o
 * alvo é um punhado de pessoas específicas que não formam grupo nenhum.
 *
 * O caso que pediu isto: em 05/10/2026 apareceram 15 cadastros cujo e-mail
 * tinha erro de digitação no domínio — `gmail.co`, `hotmaill.com`, `yahoo.cm`.
 * Domínio que não existe nunca entregou nada, então essas pessoas jamais
 * receberam o e-mail de cadastro e nunca entraram. Com o endereço corrigido,
 * elas precisavam receber a campanha fora de qualquer grupo.
 *
 * A campanha é a MESMA (`volta-2026-09`), de propósito: estas pessoas fazem
 * parte da primeira tentativa, e separá-las numa campanha nova sujaria a
 * comparação entre a primeira e a segunda tentativa sem ganho nenhum.
 *
 * As três travas do disparo normal valem iguais aqui, e nenhuma é opcional:
 * quem pediu para sair nunca recebe (e se a lista de descadastros não puder
 * ser lida, o envio NÃO acontece); quem já recebeu esta campanha não recebe
 * de novo; e cada mensagem leva a sua chave única, então rodar o comando duas
 * vezes não manda duas vezes.
 *
 * Uma trava a mais, que só faz sentido aqui: o endereço precisa ser de um
 * cliente da marca. Lista escrita à mão é onde entra endereço trocado, e
 * mandar campanha para quem não é da base não tem como ser desfeito.
 */
import './ambiente'
import { readFileSync } from 'node:fs'
import { marcaPorId } from '../../src/marca/marcas'
import { emailDeRepescagem, emailDeVolta } from './campanhas'
import { jaSairam, linkDeDescadastro } from './descadastro'

/*
  Dois modelos, duas campanhas (07/10/2026). A repescagem vai para quem JÁ
  recebeu o convite, então ela tem um nome de campanha próprio: a trava de
  "já recebeu esta campanha" olha o nome, e com o mesmo nome ninguém da
  repescagem passaria.
*/
const MODELOS = {
  volta:      { campanha: 'volta-2026-09',      montar: emailDeVolta },
  repescagem: { campanha: 'repescagem-2026-10', montar: emailDeRepescagem },
} as const
type Modelo = keyof typeof MODELOS
let modelo: Modelo = 'volta'
const CAMPANHA = () => MODELOS[modelo].campanha
const montar = (m: Parameters<typeof emailDeVolta>[0], email: string) => MODELOS[modelo].montar(m, email)

const base = () => (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
const segredo = () => process.env.SUPABASE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function banco<T>(caminho: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(`${base()}${caminho}`, {
    method, signal: AbortSignal.timeout(25_000),
    headers: {
      apikey: segredo(), Authorization: `Bearer ${segredo()}`, 'Content-Type': 'application/json',
      ...(method === 'POST' ? { Prefer: 'resolution=merge-duplicates,return=minimal' } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!r.ok) throw new Error(`${caminho} respondeu ${r.status} ${await r.text().catch(() => '')}`.slice(0, 300))
  return (r.status === 204 ? undefined : await r.json().catch(() => undefined)) as T
}

interface Pessoa { user_id: string; nome: string | null; email: string }

/** Confere a lista pedida contra a base e diz, linha por linha, o que fica de fora. */
async function conferir(marca: string, pedidos: string[]): Promise<Pessoa[]> {
  const fora = await jaSairam(marca)   // lança se não conseguir ler: é de propósito
  const emLista = [...new Set(pedidos.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  if (!emLista.length) throw new Error('Nenhum endereço na lista.')

  const naBase = new Map<string, Pessoa>()
  const lote = emLista.map((e) => `"${e}"`).join(',')
  for (const p of await banco<Pessoa[]>(
    `/rest/v1/clientes?select=user_id,nome,email&marca=eq.${marca}&email=in.(${encodeURIComponent(lote)})`)) {
    naBase.set(p.email.trim().toLowerCase(), { ...p, email: p.email.trim().toLowerCase() })
  }

  const jaRecebeu = new Set(
    (await banco<Array<{ email: string }>>(
      `/rest/v1/envios_campanha?select=email&marca=eq.${marca}&campanha=eq.${CAMPANHA()}` +
      `&email=in.(${encodeURIComponent(lote)})`)).map((l) => l.email.toLowerCase()))

  const escolhidos: Pessoa[] = []
  for (const email of emLista) {
    const p = naBase.get(email)
    if (!p) { console.log(`   ✕ ${email}: não é cliente de ${marca}`); continue }
    if (fora.has(email)) { console.log(`   ✕ ${email}: pediu para sair`); continue }
    if (jaRecebeu.has(email)) { console.log(`   ✕ ${email}: já recebeu esta campanha`); continue }
    escolhidos.push(p)
  }
  return escolhidos
}

async function enviar(marca: string, pedidos: string[], gravar: boolean) {
  const m = marcaPorId(marca)
  if (!m.email.remetente) throw new Error(`A marca ${marca} não tem remetente verificado.`)
  if (!process.env.RESEND_CHAVE) throw new Error('Sem chave de envio no ambiente.')

  const lista = await conferir(marca, pedidos)
  console.log(`[lista] ${lista.length} de ${pedidos.length} pedido(s) vão receber · ${gravar ? 'ENVIANDO' : 'ensaio, sem enviar'}`)
  console.log(`[lista] campanha "${CAMPANHA()}" · modelo ${modelo} · assunto: ${montar(m, 'exemplo@exemplo.com').assunto}`)
  for (const p of lista) console.log(`   ${(p.nome ?? '(sem nome)').slice(0, 28).padEnd(28)} ${p.email}`)
  if (!gravar) return { enviados: 0, falhas: 0, total: lista.length }

  let enviados = 0, falhas = 0
  for (const p of lista) {
    const pronto = montar(m, p.email)
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${process.env.RESEND_CHAVE}`, 'Content-Type': 'application/json',
          'Idempotency-Key': `campanha:${CAMPANHA()}:${p.email}`,
        },
        body: JSON.stringify({
          from: m.email.remetente, to: [p.email],
          subject: pronto.assunto, html: pronto.html, text: pronto.texto,
          headers: {
            'List-Unsubscribe': `<${linkDeDescadastro(marca, p.email)}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }),
      })
      const corpo = await r.json().catch(() => ({})) as { id?: string; message?: string }
      if (!r.ok) throw new Error(corpo.message ?? `recusado (${r.status})`)
      await banco('/rest/v1/envios_campanha', 'POST',
        { marca, campanha: CAMPANHA(), email: p.email, user_id: p.user_id, id_envio: corpo.id ?? null })
      enviados += 1
    } catch (e) {
      falhas += 1
      const erro = (e as Error).message.slice(0, 200)
      console.error(`   ✕ ${p.email}: ${erro}`)
      await banco('/rest/v1/envios_campanha', 'POST',
        { marca, campanha: CAMPANHA(), email: p.email, user_id: p.user_id, erro }).catch(() => {})
    }
    await pausa(125)   // o limite da conta é 10/s; 8 deixa folga para o resto
  }
  return { enviados, falhas, total: lista.length }
}

/*
  Uso:
    node dist/campanha-lista.mjs teeds ensaio  a@b.com,c@d.com
    node dist/campanha-lista.mjs teeds enviar  @/tmp/lista.txt --modelo=repescagem

  `@arquivo` lê um endereço por linha: 455 endereços não cabem bem numa linha
  de comando. `--modelo=` escolhe o e-mail e, com ele, o nome da campanha.
*/
const argumentos = process.argv.slice(2)
const opcaoModelo = argumentos.find((a) => a.startsWith('--modelo='))?.slice('--modelo='.length)
if (opcaoModelo !== undefined) {
  if (!(opcaoModelo in MODELOS)) { console.error(`[lista] modelo desconhecido: ${opcaoModelo}. Use: ${Object.keys(MODELOS).join(', ')}`); process.exit(1) }
  modelo = opcaoModelo as Modelo
}
const [marca = 'teeds', modo, ...resto] = argumentos.filter((a) => !a.startsWith('--'))
const pedidos = resto.flatMap((r) => r.startsWith('@') ? readFileSync(r.slice(1), 'utf8').split(/\r?\n/) : r.split(/[,\s]+/)).filter(Boolean)
enviar(marca, pedidos, modo === 'enviar')
  .then((r) => console.log(`\n[lista] enviados ${r.enviados} · falhas ${r.falhas} · de ${r.total}`))
  .catch((e) => { console.error('[lista] parou:', (e as Error).message); process.exitCode = 1 })
