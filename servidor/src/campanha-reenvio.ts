/**
 * Segunda tentativa: o mesmo e-mail, para quem recebeu e não abriu.
 *
 *   cd /root/teeds/servidor
 *   node dist/campanha-reenvio.mjs teeds 50 ensaio    # só mostra
 *   node dist/campanha-reenvio.mjs teeds 50 enviar
 *
 * Quem entra na lista (pedido do Tiago em 02/10/2026): recebeu a campanha
 * `volta-2026-09` em 30/09 ou 01/10, a mensagem foi ENTREGUE, e daí não
 * aconteceu mais nada — não abriu, não clicou, não voltou, não reclamou e
 * não foi suprimida. Quem fez qualquer uma dessas coisas fica de fora: a
 * segunda tentativa é para quem o e-mail alcançou e não foi lido.
 *
 * POR QUE UMA CAMPANHA NOVA, e não repetir a antiga. Duas travas do
 * disparador impediriam o reenvio, e ambas existem por bons motivos: a lista
 * de "já recebeu" pula quem está em `envios_campanha`, e a chave de
 * idempotência do Resend (`campanha:<nome>:<email>`) faz o provedor devolver
 * o envio antigo em vez de mandar outro. Trocar o nome da campanha destrava
 * as duas sem enfraquecer nenhuma — e, de quebra, mantém as métricas das
 * duas tentativas separadas, que é o que permite comparar se insistir vale.
 *
 * As travas que continuam valendo, iguais às do disparo normal: quem pediu
 * para sair nunca recebe (e se a lista de descadastros não puder ser lida, o
 * envio não acontece), quem já recebeu ESTA campanha não recebe de novo, e
 * cada mensagem leva a sua chave única.
 */
import './ambiente'
import { marcaPorId } from '../../src/marca/marcas'
import { emailDeVolta } from './campanhas'
import { jaSairam, linkDeDescadastro } from './descadastro'

const CAMPANHA = 'segunda-tentativa'
/** A campanha original, cujos envios decidem quem entra nesta. */
const ORIGINAL = 'volta-2026-09'
/** Os dias da primeira tentativa que valem, no fuso do Brasil. */
const DIAS = ['2026-09-30', '2026-10-01']

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

interface Pessoa { email: string; user_id: string | null }

/**
 * Quem recebeu, foi entregue e não reagiu.
 *
 * A seleção mora numa função do banco porque cruzar envio com evento aqui
 * exigiria trazer milhares de linhas de duas tabelas e juntar na memória —
 * e porque o PostgREST corta em mil sem avisar, que já custou caro uma vez.
 */
async function fila(marca: string, quantos: number): Promise<Pessoa[]> {
  const fora = await jaSairam(marca)   // lança se não conseguir ler: é de propósito
  const lista = await banco<Pessoa[]>('/rest/v1/rpc/teeds_fila_segunda_tentativa', 'POST', {
    p_marca: marca, p_campanha_original: ORIGINAL, p_campanha_nova: CAMPANHA,
    p_dias: DIAS, p_limite: quantos,
  })
  // O descadastro é conferido de novo aqui, com a lista lida agora: entre a
  // consulta e o envio alguém pode ter clicado em "cancelar inscrição".
  return (lista ?? []).filter((p) => !fora.has(p.email.toLowerCase()))
}

async function enviar(marca: string, quantos: number, gravar: boolean) {
  const m = marcaPorId(marca)
  if (!m.email.remetente) throw new Error(`A marca ${marca} não tem remetente verificado.`)
  if (!process.env.RESEND_CHAVE) throw new Error('Sem chave de envio no ambiente.')

  const lista = await fila(marca, quantos)
  console.log(`[reenvio] ${lista.length} pessoa(s) nesta leva · ${gravar ? 'ENVIANDO' : 'ensaio, sem enviar'}`)
  console.log(`[reenvio] campanha "${CAMPANHA}" · assunto: ${emailDeVolta(m, 'exemplo@exemplo.com').assunto}`)
  for (const p of lista.slice(0, 5)) console.log(`   ${p.email}`)
  if (lista.length > 5) console.log(`   … e mais ${lista.length - 5}`)
  if (!gravar) return { enviados: 0, falhas: 0, total: lista.length }

  let enviados = 0, falhas = 0
  for (const p of lista) {
    const pronto = emailDeVolta(m, p.email)
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${process.env.RESEND_CHAVE}`, 'Content-Type': 'application/json',
          'Idempotency-Key': `campanha:${CAMPANHA}:${p.email}`,
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
        { marca, campanha: CAMPANHA, email: p.email, user_id: p.user_id, id_envio: corpo.id ?? null })
      enviados += 1
    } catch (e) {
      falhas += 1
      const erro = (e as Error).message.slice(0, 200)
      console.error(`   ✕ ${p.email}: ${erro}`)
      await banco('/rest/v1/envios_campanha', 'POST',
        { marca, campanha: CAMPANHA, email: p.email, user_id: p.user_id, erro }).catch(() => {})
    }
    await pausa(125)   // o limite da conta é 10/s; 8 deixa folga para o resto
    if ((enviados + falhas) % 50 === 0) console.log(`   ${enviados + falhas}/${lista.length}…`)
  }
  return { enviados, falhas, total: lista.length }
}

const [marca = 'teeds', quantosArg = '100', modo] = process.argv.slice(2)
const quantos = Math.max(1, Math.min(5000, Number(quantosArg) || 100))
enviar(marca, quantos, modo === 'enviar')
  .then((r) => console.log(`\n[reenvio] enviados ${r.enviados} · falhas ${r.falhas} · de ${r.total}`))
  .catch((e) => { console.error('[reenvio] parou:', (e as Error).message); process.exitCode = 1 })
