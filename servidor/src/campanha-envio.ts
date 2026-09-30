/**
 * Dispara uma campanha para a base, em levas.
 *
 *   cd /root/teeds/servidor
 *   node dist/campanha-envio.mjs teeds 200 ensaio              # só mostra
 *   node dist/campanha-envio.mjs teeds 200                     # manda
 *   node dist/campanha-envio.mjs teeds 214 enviar sem-nome-gmail
 *
 * O último argumento escolhe o grupo:
 *
 *   com-nome        quem tem nome cadastrado (o padrão)
 *   sem-nome-gmail  quem não tem nome e usa Gmail
 *
 * O grupo existe porque provedor diferente responde diferente. Na primeira
 * leva o Gmail entregou na caixa de entrada (24 aberturas em 254) e a
 * Microsoft mandou tudo para o spam (0 aberturas em 92). Enquanto a conversa
 * com a Microsoft não estiver resolvida, dá para seguir só pelo Gmail em vez
 * de cavar mais fundo no spam deles.
 *
 * Em levas porque domínio que quase não mandou e-mail não dispara 11 mil de
 * uma vez: o Gmail lê isso como lista comprada e passa a tratar TODO o
 * domínio como suspeito — inclusive a senha de quem acabou de se cadastrar.
 * A rampa começa pequena e cresce se os números deixarem.
 *
 * Três travas, e nenhuma é opcional:
 *
 *  1. quem pediu para sair nunca mais recebe. Se a lista de descadastros não
 *     puder ser lida, o envio NÃO acontece — reenviar para quem pediu para
 *     sair é a falha que não tem conserto;
 *  2. quem já recebeu esta campanha não recebe de novo. A leva de amanhã
 *     continua de onde a de hoje parou;
 *  3. cada envio leva uma chave única. Se o comando cair no meio e for
 *     rodado de novo, ninguém recebe duas vezes.
 *
 * A ordem é deliberada: primeiro quem tem nome cadastrado, e dentro deles
 * quem já usou a plataforma. As primeiras levas são as que ensinam ao Gmail
 * que remetente é este, então vão para quem tem mais chance de abrir.
 */
import './ambiente'
import { marcaPorId } from '../../src/marca/marcas'
import { emailDeVolta } from './campanhas'
import { jaSairam, linkDeDescadastro } from './descadastro'

const CAMPANHA = 'volta-2026-09'

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
  if (!r.ok) throw new Error(`${caminho} respondeu ${r.status}`)
  return (r.status === 204 ? undefined : await r.json().catch(() => undefined)) as T
}

interface Pessoa { user_id: string; nome: string | null; email: string; total_acessos: number | null }

export type Grupo = 'com-nome' | 'sem-nome-gmail'

/** O filtro de cada grupo, do jeito que o PostgREST entende. */
const FILTRO: Record<Grupo, string> = {
  // Quem tem nome: a fatia mais saudável da base, e a que foi medida primeiro.
  'com-nome': '&nome=not.is.null',
  // Sem nome e no Gmail. O `or` cobre o nome nulo e o nome vazio, que na
  // importação vieram os dois.
  'sem-nome-gmail': '&or=(nome.is.null,nome.eq.)&email=ilike.*@gmail.com',
}

/** Quem ainda não recebeu esta campanha, na ordem em que deve receber. */
async function fila(marca: string, quantos: number, grupo: Grupo): Promise<Pessoa[]> {
  const fora = await jaSairam(marca)   // lança se não conseguir ler: é de propósito
  const enviados = new Set(
    (await banco<Array<{ email: string }>>(
      `/rest/v1/envios_campanha?select=email&marca=eq.${marca}&campanha=eq.${CAMPANHA}`))
      .map((l) => l.email.toLowerCase()),
  )
  console.log(`[campanha] ${fora.size} descadastrado(s) · ${enviados.size} já receberam`)

  const escolhidos: Pessoa[] = []
  const vistos = new Set<string>()
  // Página a página: a base tem 11 mil linhas e o PostgREST devolve mil por vez.
  for (let salto = 0; escolhidos.length < quantos; salto += 1000) {
    const pagina = await banco<Pessoa[]>(
      `/rest/v1/clientes?select=user_id,nome,email,total_acessos&marca=eq.${marca}` +
      `${FILTRO[grupo]}&order=total_acessos.desc.nullslast,criado_em.asc` +
      `&limit=1000&offset=${salto}`)
    if (!pagina.length) break
    for (const p of pagina) {
      const email = (p.email ?? '').trim().toLowerCase()
      if (!email) continue
      // O filtro do banco já separa o grupo; aqui é a segunda conferência,
      // porque mandar para o grupo errado não tem como ser desfeito.
      const temNome = Boolean((p.nome ?? '').trim())
      if (grupo === 'com-nome' && !temNome) continue
      if (grupo === 'sem-nome-gmail' && (temNome || !email.endsWith('@gmail.com'))) continue
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) continue
      if (fora.has(email) || enviados.has(email) || vistos.has(email)) continue
      vistos.add(email)
      escolhidos.push({ ...p, email })
      if (escolhidos.length >= quantos) break
    }
  }
  return escolhidos
}

async function enviar(marca: string, quantos: number, gravar: boolean, grupo: Grupo) {
  const m = marcaPorId(marca)
  if (!m.email.remetente) throw new Error(`A marca ${marca} não tem remetente verificado.`)
  if (!process.env.RESEND_CHAVE) throw new Error('Sem chave de envio no ambiente.')

  const lista = await fila(marca, quantos, grupo)
  console.log(`[campanha] grupo "${grupo}" · ${lista.length} pessoa(s) nesta leva · ${gravar ? 'ENVIANDO' : 'ensaio, sem enviar'}`)
  console.log(`[campanha] assunto: ${emailDeVolta(m, 'exemplo@exemplo.com').assunto}`)
  for (const p of lista.slice(0, 5)) console.log(`   ${(p.nome ?? '(sem nome)').slice(0, 28).padEnd(28)} ${p.email}`)
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
          // A mesma pessoa, na mesma campanha, é sempre a mesma chave: rodar
          // o comando duas vezes não manda duas vezes.
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
    // O limite da conta é 10 por segundo; 8 deixa folga para o resto do
    // servidor, que continua mandando senha de cadastro enquanto isto roda.
    await pausa(125)
    if ((enviados + falhas) % 50 === 0) console.log(`   ${enviados + falhas}/${lista.length}…`)
  }
  return { enviados, falhas, total: lista.length }
}

const [marca = 'teeds', quantosArg = '200', modo, grupoArg = 'com-nome'] = process.argv.slice(2)
const quantos = Math.max(1, Math.min(5000, Number(quantosArg) || 200))
if (grupoArg !== 'com-nome' && grupoArg !== 'sem-nome-gmail') {
  console.error(`[campanha] grupo desconhecido: ${grupoArg}`)
  process.exit(1)
}
enviar(marca, quantos, modo !== 'ensaio', grupoArg)
  .then((r) => {
    console.log(`\n[campanha] enviados ${r.enviados} · falhas ${r.falhas} · de ${r.total}`)
    process.exit(r.falhas > r.total * 0.1 ? 1 : 0)
  })
  .catch((e) => { console.error('[campanha]', (e as Error).message); process.exit(1) })
