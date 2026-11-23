/**
 * As telas da live na nuvem (23/11/2026). Antes ficavam só no navegador de quem
 * montou: outro administrador abria a Central no computador dele e via as telas
 * padrão, sem as fotos, os vídeos e os textos. Agora a marca tem um jogo de telas
 * só (tabela `aovivo_telas`), e as fotos e os vídeos vão para o bucket `aovivo`.
 *
 * O que vai para a nuvem: as telas (nome, modelo, campos, ordem) e a transição.
 * O que fica no computador: a tela no ar, volumes e mudo, e o fone.
 *
 * Duas pessoas mexendo ao mesmo tempo (revisão de 23/11): cada gravação só vale
 * se a nuvem ainda estiver na versão que este computador conhece (a hora da
 * última gravação, carimbada pelo banco). Se outra pessoa gravou antes, as duas
 * versões se juntam tela por tela: fica a mudança de cada um.
 */
import { MARCA } from '../../../marca'
import { SUPABASE } from '../../teeds/config'
import type { SessaoTeeds } from '../../teeds/conta'
import { guardarConfigAntiga, lerArquivo } from './arquivos'
import { aplicarModelo, aplicarTelasDaNuvem, cenaPorId, estudioAgora, ouvirEstudio, telasDaMarca } from './motor'
import type { Cena, ConfigDoEstudio } from './tipos'

export interface TelasDaMarca {
  cenas: Cena[]
  transicao: ConfigDoEstudio['transicao']
  duracaoMs: number
}
interface LinhaDaNuvem { config: TelasDaMarca; atualizado_em: string; atualizado_nome: string | null }

const cabecalhos = (token: string, extra: Record<string, string> = {}) => ({ apikey: SUPABASE.anonKey, Authorization: `Bearer ${token}`, ...extra })
const TABELA = `${SUPABASE.url}/rest/v1/aovivo_telas`
const CAMPOS = 'config,atualizado_em,atualizado_nome'

async function lerLinha(token: string): Promise<LinhaDaNuvem | null> {
  const r = await fetch(`${TABELA}?marca=eq.${encodeURIComponent(MARCA.id)}&select=${CAMPOS}`, { headers: cabecalhos(token) })
  if (!r.ok) throw new Error(`Não consegui ler as telas da nuvem (${r.status}).`)
  return ((await r.json()) as LinhaDaNuvem[])[0] ?? null
}

/** Primeira gravação da marca. null = alguém criou antes (então é juntar). */
async function criarLinha(token: string, telas: TelasDaMarca, nome: string | null): Promise<LinhaDaNuvem | null> {
  const r = await fetch(`${TABELA}?select=${CAMPOS}`, {
    method: 'POST', headers: cabecalhos(token, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify({ marca: MARCA.id, config: telas, atualizado_nome: nome }),
  })
  if (r.status === 409) return null
  if (!r.ok) throw new Error(`Não consegui guardar as telas na nuvem (${r.status}).`)
  return ((await r.json()) as LinhaDaNuvem[])[0] ?? null
}

/** Grava só se a nuvem ainda estiver na versão `desde`. null = outra pessoa gravou antes. */
async function trocarLinha(token: string, telas: TelasDaMarca, desde: string, nome: string | null): Promise<LinhaDaNuvem | null> {
  const r = await fetch(`${TABELA}?marca=eq.${encodeURIComponent(MARCA.id)}&atualizado_em=eq.${encodeURIComponent(desde)}&select=${CAMPOS}`, {
    method: 'PATCH', headers: cabecalhos(token, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify({ config: telas, atualizado_nome: nome }),
  })
  if (!r.ok) throw new Error(`Não consegui guardar as telas na nuvem (${r.status}).`)
  return ((await r.json()) as LinhaDaNuvem[])[0] ?? null
}

const nomeSeguro = (nome: string) =>
  nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/(^-|-$)/g, '') || 'arquivo'
const TIPO_PELA_EXTENSAO: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4' }

/** Envia uma foto ou um vídeo de tela para o bucket `aovivo` (pasta da marca) e volta a URL pública. */
export async function enviarArquivoDaLive(sessao: SessaoTeeds, arquivo: Blob, nome: string): Promise<string> {
  const caminho = `${MARCA.id}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${nomeSeguro(nome)}`
  // alguns .webm chegam sem tipo (Windows): o tipo sai da extensão
  const tipo = arquivo.type || TIPO_PELA_EXTENSAO[nome.split('.').pop()?.toLowerCase() ?? ''] || 'application/octet-stream'
  const r = await fetch(`${SUPABASE.url}/storage/v1/object/aovivo/${caminho.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST', headers: cabecalhos(sessao.token, { 'Content-Type': tipo, 'cache-control': 'max-age=31536000' }), body: arquivo,
  })
  if (!r.ok) {
    let recado = `Não consegui enviar o arquivo (${r.status}).`
    try { recado = (await r.json())?.message || recado } catch { /* sem detalhe */ }
    if (r.status === 413) recado = 'O arquivo é grande demais para enviar. Use um vídeo menor.'
    if (r.status === 403) recado = 'Só a equipe desta marca pode enviar arquivos das telas.'
    throw new Error(recado)
  }
  return `${SUPABASE.url}/storage/v1/object/public/aovivo/${caminho.split('/').map(encodeURIComponent).join('/')}`
}

/* ------------------------------------------------- juntar duas versões */

const json = (x: unknown) => (x === undefined ? '' : JSON.stringify(x))

/**
 * Junta a versão deste computador com a da nuvem, tela por tela, a partir da última
 * versão que os dois tinham em comum (`base`): o que só um mudou, fica a mudança dele;
 * o que os dois mudaram, fica a deste computador. `manter` (a tela no ar durante a
 * live) fica sempre como está aqui.
 */
export function juntarTelas(base: TelasDaMarca | null, local: TelasDaMarca, remoto: TelasDaMarca, manter?: string | null): TelasDaMarca {
  const B = new Map((base?.cenas ?? []).map((c) => [c.id, c]))
  const L = new Map(local.cenas.map((c) => [c.id, c]))
  const R = new Map(remoto.cenas.map((c) => [c.id, c]))
  const escolher = (id: string): Cena | undefined => {
    const b = B.get(id), l = L.get(id), r = R.get(id)
    if (manter && id === manter && l) return l
    const mudouAqui = json(l) !== json(b), mudouLa = json(r) !== json(b)
    if (mudouAqui && !mudouLa) return l
    if (!mudouAqui) return r
    return l ?? r // os dois mudaram: fica a daqui (se aqui apagou e lá editou, a de lá volta)
  }
  const ordemBase = (base?.cenas ?? []).map((c) => c.id).join('|')
  const ordemAquiMudou = !base || local.cenas.map((c) => c.id).join('|') !== ordemBase
  const ids = ordemAquiMudou
    ? [...local.cenas.map((c) => c.id), ...remoto.cenas.map((c) => c.id).filter((id) => !L.has(id))]
    : [...remoto.cenas.map((c) => c.id), ...local.cenas.map((c) => c.id).filter((id) => !R.has(id))]
  const cenas = [...new Set(ids)].map(escolher).filter((c): c is Cena => !!c)
  const deAqui = <K extends 'transicao' | 'duracaoMs'>(k: K) => (base && local[k] !== base[k] ? local[k] : remoto[k])
  return { cenas: cenas.length ? cenas : local.cenas, transicao: deAqui('transicao'), duracaoMs: deAqui('duracaoMs') }
}

/* ------------------------------------------------------- a sincronia */

export type FaseDaNuvem = 'local' | 'abrindo' | 'salvo' | 'salvando' | 'erro'
export interface EstadoDaNuvem { fase: FaseDaNuvem; nome?: string | null; erro?: string }

interface Opcoes {
  /** A sessão mais nova (o token é renovado durante a live). */
  sessao: () => SessaoTeeds | null
  /** Não aplicar o que veio da nuvem agora (janela de editar aberta). */
  pausar: () => boolean
  /** Na live: a tela no ar (ela nunca muda pela nuvem enquanto a live roda). */
  telaNoAr: () => string | null
  avisar: (e: EstadoDaNuvem) => void
}

const CHAVE = `${MARCA.id}.aovivo.nuvem`
const lerMemoria = (): { base: TelasDaMarca | null; desde: string | null } => {
  try { const m = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (m && m.base) return { base: m.base, desde: m.desde ?? null } } catch { /* sem memória */ }
  return { base: null, desde: null }
}
const guardarMemoria = (base: TelasDaMarca, desde: string) => { try { localStorage.setItem(CHAVE, JSON.stringify({ base, desde })) } catch { /* só agora */ } }

/**
 * Liga a sincronia das telas com a nuvem. Volta a função que desliga.
 * - Ao abrir: com mudanças daqui ainda não gravadas, junta e grava; senão, vale a da nuvem.
 * - Mexeu: grava em ~1 s (com a regra de juntar, se outra pessoa gravou antes).
 * - A cada 15 s: pega o que outra pessoa gravou (menos com a janela de editar aberta).
 */
export function ligarSincroniaDasTelas(op: Opcoes): () => void {
  let vivo = true
  let { base, desde } = lerMemoria()
  let gravando = false
  let aplicando = false
  let pendente: number | undefined
  let desligarOuvinte: (() => void) | undefined
  let tentativas = 0

  const assinar = () => json(telasDaMarca())
  const aqui = (): TelasDaMarca => telasDaMarca()
  const mudouAqui = () => !base || assinar() !== json(base)
  const receber = (t: TelasDaMarca) => {
    aplicando = true
    try { aplicarTelasDaNuvem(t) } finally { aplicando = false }
  }
  const token = () => op.sessao()?.token ?? ''
  const nome = () => op.sessao()?.usuario.nome ?? null
  const marcar = (linha: LinhaDaNuvem) => {
    base = linha.config; desde = linha.atualizado_em
    guardarMemoria(base, desde)
    if (vivo) op.avisar({ fase: 'salvo', nome: linha.atualizado_nome })
  }

  /** Arquivos antigos guardados só neste computador: sobem e entram como endereço, tela por tela, na versão atual. */
  async function subirArquivosLocais() {
    const s = op.sessao()
    if (!s) return
    for (const c of estudioAgora().config.cenas) {
      for (const prefixo of ['fundo', 'midia'] as const) {
        const id = c.modelo?.campos[prefixo]
        if (!id) continue
        const a = await lerArquivo(id).catch(() => undefined)
        const url = a ? await enviarArquivoDaLive(s, a.blob, a.nome) : ''
        // aplica só o endereço, na tela como ela está agora (não desfaz o que foi editado durante o envio)
        const agora = cenaPorId(c.id)
        if (!agora?.modelo || agora.modelo.campos[prefixo] !== id) continue
        aplicarModelo(c.id, { ...agora.modelo.campos, [prefixo]: '', [`${prefixo}Url`]: url || agora.modelo.campos[`${prefixo}Url`] || '' })
      }
    }
  }

  // `vivo` não barra a gravação: ao sair com mudança pendente ela ainda vai
  async function gravar(): Promise<void> {
    if (gravando) { window.clearTimeout(pendente); pendente = window.setTimeout(() => void gravar(), 800); return }
    gravando = true
    if (vivo) op.avisar({ fase: 'salvando' })
    try {
      await subirArquivosLocais()
      for (let volta = 0; volta < 4; volta++) {
        const minhas = aqui()
        const linha = desde ? await trocarLinha(token(), minhas, desde, nome()) : await criarLinha(token(), minhas, nome())
        if (linha) { marcar(linha); return }
        // outra pessoa gravou antes: junta as duas versões e tenta de novo
        const la = await lerLinha(token())
        if (!la) { desde = null; continue }
        const juntas = juntarTelas(base, minhas, la.config, op.telaNoAr())
        base = la.config; desde = la.atualizado_em
        if (vivo) receber(juntas)
      }
      throw new Error('Outra pessoa está mexendo nas telas agora. Tente de novo em alguns segundos.')
    } catch (erro) {
      if (vivo) op.avisar({ fase: 'erro', erro: (erro as Error).message })
    } finally { gravando = false }
  }

  const aoMudar = () => {
    if (aplicando || !vivo || !mudouAqui()) return
    window.clearTimeout(pendente)
    pendente = window.setTimeout(() => void gravar(), 1200)
  }

  async function abrir(): Promise<void> {
    try {
      const linha = await lerLinha(token())
      if (!vivo) return
      tentativas = 0
      if (!linha) { desde = null; await gravar() }
      else if (base && mudouAqui()) {
        // mudanças daqui que não chegaram a subir: juntam com as da nuvem
        const juntas = juntarTelas(base, aqui(), linha.config, op.telaNoAr())
        base = linha.config; desde = linha.atualizado_em
        receber(juntas)
        await gravar()
      } else {
        if (!base) await guardarConfigAntiga({ ...estudioAgora().config }, 'antes-da-nuvem').catch(() => undefined)
        receber(linha.config)
        marcar(linha)
      }
      desligarOuvinte = ouvirEstudio(aoMudar)
    } catch (erro) {
      if (!vivo) return
      op.avisar({ fase: 'erro', erro: (erro as Error).message })
      // sem rede ou acesso vencido: tenta de novo, cada vez esperando mais
      tentativas++
      window.setTimeout(() => { if (vivo) void abrir() }, Math.min(60_000, 3000 * 2 ** tentativas))
    }
  }

  const vigia = window.setInterval(() => {
    if (!vivo || !desligarOuvinte || gravando || op.pausar() || document.hidden) return
    void lerLinha(token()).then((linha) => {
      if (!vivo || !linha || linha.atualizado_em === desde || gravando || op.pausar()) return
      if (mudouAqui()) { void gravar(); return } // tem mudança daqui: a gravação já junta as duas
      const noAr = op.telaNoAr()
      receber(noAr ? juntarTelas(base, aqui(), linha.config, noAr) : linha.config)
      marcar(linha)
      if (noAr && mudouAqui()) aoMudar()
    }).catch(() => undefined)
  }, 15_000)

  // saiu da página com uma mudança esperando: grava na hora
  const aoSair = () => { if (pendente !== undefined && mudouAqui()) void gravar() }
  window.addEventListener('pagehide', aoSair)

  op.avisar({ fase: 'abrindo' })
  void abrir()
  return () => {
    aoSair()
    vivo = false
    window.clearTimeout(pendente); window.clearInterval(vigia)
    window.removeEventListener('pagehide', aoSair)
    desligarOuvinte?.()
  }
}
