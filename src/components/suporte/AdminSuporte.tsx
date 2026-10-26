import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import {
  abrirAnexo, apagarResposta, atualizarConversa, baterPonto, conversasDaMarca, diaDaMensagem, enviarAnexo, ETIQUETAS, fichaDoCliente, haQuanto,
  historicoDoCliente, horaCurta, lerMensagens, mandarMensagem, paraConversa, paraMensagem, preencherResposta, PRIORIDADES, respostasProntas,
  salvarResposta, STATUS, trocarEmailPeloSuporte, type Conversa, type FichaDoCliente, type Mensagem, type Prioridade, type RespostaPronta, type StatusDaConversa,
} from '../../core/teeds/suporte'
import { formatarCPF, formatarTelefone } from '../../core/teeds/conta'
import { nomeDoPlano } from '../../core/teeds/planos'
import { assinarMudancas } from '../../core/teeds/realtime'
import { PERGUNTAS } from '../../core/teeds/faq'
import type { ResumoDaTriagem } from '../../core/teeds/triagem'
import { Monograma } from '../marca/Monograma'
import './admin-suporte.css'

/**
 * A caixa de entrada do suporte (painel admin, 20/10/2026).
 *
 * Fila: o mais urgente e quem espera há mais tempo primeiro. Filtros de
 * múltipla escolha (situação, prioridade, etiquetas), busca, "só minhas" e
 * "não lidas". A conversa no meio; a ficha do cliente ao lado (plano,
 * validade, contato, aparelho, histórico). Respostas prontas com {nome},
 * notas internas que o cliente não vê, print colado direto (Ctrl+V).
 * Tudo em tempo real; um som discreto quando chega mensagem nova.
 */

interface Props { sessao: SessaoTeeds; marca: string; nomeDaEquipe: string }

const PESO: Record<Prioridade, number> = { urgente: 4, alta: 3, normal: 2, baixa: 1 }
const SLA_MIN = 30
const CHAVE_SOM = 'suporte.admin.som'
const ler = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const I = {
  busca: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  enviar: 'M4 12l16-8-6 16-2.5-6.5z',
  clipe: 'M20 11.5l-8.2 8.2a5 5 0 01-7-7L13 4.5a3.3 3.3 0 014.7 4.7l-8.2 8.2a1.7 1.7 0 01-2.4-2.4l7.6-7.6',
  raio: 'M13 3L4 14h7l-1 7 9-11h-7z',
  nota: 'M5 4h14v12l-4 4H5zM15 20v-4h4',
  certo: 'M5 12.5l4.2 4.2L19 7',
  voltar: 'M15 6l-6 6 6 6',
  ficha: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0',
  som: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6',
  mudo: 'M4 9v6h4l5 4V5L8 9zM17 9l4 6M21 9l-4 6',
  mais: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  whats: 'M4 20l1.3-4A8 8 0 1112 20a8 8 0 01-4-1z',
  editar: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  lixo: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
}
const Ic = ({ d, className }: { d: string; className?: string }) => <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
const iniciais = (n: string) => { const p = n.trim().split(/\s+/).filter(Boolean); return (p.length > 1 ? p[0][0] + p[p.length - 1][0] : (p[0] ?? '?').slice(0, 2)).toUpperCase() }
const semAcento = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function tocarSom() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const nota = (f: number, t: number) => {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination)
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35)
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.4)
    }
    nota(880, 0); nota(1318.5, 0.12)
    window.setTimeout(() => void ctx.close(), 900)
  } catch { /* sem áudio, sem problema */ }
}

function Anexo({ sessao, caminho }: { sessao: SessaoTeeds; caminho: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [falhou, setFalhou] = useState(false)
  useEffect(() => { let v = true; setFalhou(false); abrirAnexo(sessao, caminho).then((u) => v && setUrl(u)).catch(() => v && setFalhou(true)); return () => { v = false } }, [caminho]) // eslint-disable-line react-hooks/exhaustive-deps
  if (falhou) return <span className="sx-anexo falhou">Não consegui abrir o print</span>
  return url ? <a className="sx-anexo" href={url} target="_blank" rel="noreferrer"><img src={url} alt="Print enviado" /></a> : <span className="sx-anexo carregando" />
}

/** Um seletor de múltipla escolha que cabe numa barra. */
function Multi<T extends string>({ rotulo, opcoes, valor, aoMudar }: { rotulo: string; opcoes: Array<{ id: T; nome: string; total?: number }>; valor: Set<T>; aoMudar: (v: Set<T>) => void }) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])
  const alternar = (id: T) => { const n = new Set(valor); if (n.has(id)) n.delete(id); else n.add(id); aoMudar(n) }
  return (
    <div className="sx-multi" ref={caixa}>
      <button type="button" className={`sx-filtro ${valor.size ? 'ativo' : ''}`} onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
        {rotulo}{valor.size > 0 && <b>{valor.size}</b>}<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5L6 7.5 9 4.5" /></svg>
      </button>
      {aberto && (
        <div className="sx-multi-menu" role="listbox" aria-multiselectable="true">
          {opcoes.map((o) => (
            <label key={o.id} className={valor.has(o.id) ? 'on' : ''}>
              <input type="checkbox" checked={valor.has(o.id)} onChange={() => alternar(o.id)} />
              <span>{o.nome}</span>{o.total !== undefined && <small>{o.total}</small>}
            </label>
          ))}
          {valor.size > 0 && <button type="button" onClick={() => aoMudar(new Set())}>Limpar</button>}
        </div>
      )}
    </div>
  )
}

export function AdminSuporte({ sessao, marca, nomeDaEquipe }: Props) {
  const eu = sessao.usuario.id
  const [conversas, setConversas] = useState<Conversa[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [ficha, setFicha] = useState<FichaDoCliente | null>(null)
  const [historico, setHistorico] = useState<Conversa[]>([])
  const [respostas, setRespostas] = useState<RespostaPronta[]>([])
  const [busca, setBusca] = useState('')
  const [fStatus, setFStatus] = useState<Set<StatusDaConversa>>(new Set(['aberta', 'respondida']))
  const [fPrioridade, setFPrioridade] = useState<Set<Prioridade>>(new Set())
  const [fEtiquetas, setFEtiquetas] = useState<Set<string>>(new Set())
  const [soMinhas, setSoMinhas] = useState(false)
  const [soNaoLidas, setSoNaoLidas] = useState(false)
  const [ordem, setOrdem] = useState<'fila' | 'recentes'>('fila')
  const [texto, setTexto] = useState('')
  const [interna, setInterna] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [verRespostas, setVerRespostas] = useState(false)
  const [filtroRespostas, setFiltroRespostas] = useState('')
  const [gerirRespostas, setGerirRespostas] = useState(false)
  const [editando, setEditando] = useState<{ id?: string; titulo: string; texto: string } | null>(null)
  const [verFicha, setVerFicha] = useState(false)
  const [novoEmail, setNovoEmail] = useState<string | null>(null)
  const [trocandoEmail, setTrocandoEmail] = useState(false)
  const [som, setSom] = useState(() => ler(CHAVE_SOM) !== '0')
  const [agora, setAgora] = useState(Date.now())
  const [nomes, setNomes] = useState<Record<string, { nome: string; email: string; foto: string | null }>>({})
  const lista = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const arquivo = useRef<HTMLInputElement>(null)
  const selecionadaRef = useRef<string | null>(null)
  selecionadaRef.current = selecionada
  const somRef = useRef(som)
  somRef.current = som

  const comResolvidas = fStatus.has('resolvida') || fStatus.size === 0

  // ------------------------------------------------ carregar + tempo real + ponto
  useEffect(() => {
    let vivo = true
    conversasDaMarca(sessao, marca, true).then((l) => { if (vivo) { setConversas(l); setErro(null) } }).catch((e) => vivo && setErro((e as Error).message))
    respostasProntas(sessao, marca).then((r) => vivo && setRespostas(r)).catch(() => undefined)
    void baterPonto(sessao, marca)
    const ponto = window.setInterval(() => void baterPonto(sessao, marca), 60_000)
    const relogio = window.setInterval(() => setAgora(Date.now()), 30_000)
    const canal = assinarMudancas({
      token: sessao.token, canal: `suporte-equipe-${marca}`,
      tabelas: [{ tabela: 'suporte_conversas', filtro: `marca=eq.${marca}` }, { tabela: 'suporte_mensagens', filtro: `marca=eq.${marca}`, evento: 'INSERT' }],
      aoMudar: (m) => {
        if (m.tabela === 'suporte_conversas') {
          if (m.tipo === 'DELETE') return
          const c = paraConversa(m.linha)
          setConversas((l) => (l ? (l.some((x) => x.id === c.id) ? l.map((x) => (x.id === c.id ? c : x)) : [c, ...l]) : l))
        } else {
          const msg = paraMensagem(m.linha)
          if (msg.conversaId === selecionadaRef.current) setMensagens((l) => (l.some((x) => x.id === msg.id) ? l : [...l.filter((x) => !(x.enviando && x.texto === msg.texto)), msg]))
          if (msg.autor === 'cliente' && (document.hidden || msg.conversaId !== selecionadaRef.current) && somRef.current) tocarSom()
        }
      },
    })
    return () => { vivo = false; window.clearInterval(ponto); window.clearInterval(relogio); canal.fechar() }
  }, [marca, sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps

  // nome e foto de quem escreveu (uma consulta para a fila toda)
  useEffect(() => {
    if (!conversas) return
    const faltam = [...new Set(conversas.map((c) => c.userId))].filter((u) => !nomes[u])
    if (!faltam.length) return
    void import('../../core/teeds/config').then(({ SUPABASE }) => fetch(`${SUPABASE.url}/rest/v1/clientes?marca=eq.${marca}&user_id=in.(${faltam.join(',')})&select=user_id,nome,email,foto_url`, {
      headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}` },
    }).then((r) => r.json()).then((l: any[]) => setNomes((n) => {
      const novo = { ...n }
      for (const u of faltam) novo[u] = { nome: '', email: '', foto: null }
      for (const x of l ?? []) novo[x.user_id] = { nome: x.nome ?? '', email: x.email ?? '', foto: x.foto_url ?? null }
      return novo
    })).catch(() => undefined))
  }, [conversas?.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // título da aba conta quem espera (dá para ver de outra aba)
  const aguardando = conversas?.filter((c) => c.status === 'aberta').length ?? 0
  useEffect(() => {
    const original = document.title.replace(/^\(\d+\)\s*/, '')
    document.title = aguardando ? `(${aguardando}) ${original}` : original
    return () => { document.title = original }
  }, [aguardando])

  // ------------------------------------------------ a conversa aberta
  const atual = conversas?.find((c) => c.id === selecionada) ?? null
  useEffect(() => {
    if (!selecionada || !atual) { setMensagens([]); setFicha(null); return }
    let vivo = true
    lerMensagens(sessao, selecionada).then((m) => vivo && setMensagens(m)).catch(() => undefined)
    fichaDoCliente(sessao, atual.userId, marca).then((f) => vivo && setFicha(f)).catch(() => undefined)
    historicoDoCliente(sessao, atual.userId, marca).then((h) => vivo && setHistorico(h.filter((x) => x.id !== selecionada))).catch(() => undefined)
    setTexto(''); setInterna(false)
    return () => { vivo = false }
  }, [selecionada]) // eslint-disable-line react-hooks/exhaustive-deps

  // abriu: zera as não lidas da equipe
  useEffect(() => {
    if (!atual || atual.naoLidasEquipe === 0) return
    void atualizarConversa(sessao, atual.id, { nao_lidas_equipe: 0 }).catch(() => undefined)
  }, [atual?.id, atual?.naoLidasEquipe]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => { const el = lista.current; if (el) el.scrollTop = el.scrollHeight }, [mensagens.length, selecionada])
  useLayoutEffect(() => { const c = campo.current; if (!c) return; c.style.height = 'auto'; c.style.height = `${Math.min(c.scrollHeight, 200)}px`; c.style.overflowY = c.scrollHeight > 200 ? 'auto' : 'hidden' }, [texto])

  // ------------------------------------------------ filtros
  const contagemEtiquetas = useMemo(() => {
    const t: Record<string, number> = {}
    for (const c of conversas ?? []) if (c.status !== 'resolvida') for (const e of c.etiquetas) t[e] = (t[e] ?? 0) + 1
    return t
  }, [conversas])
  const visiveis = useMemo(() => {
    const q = semAcento(busca.trim())
    return (conversas ?? []).filter((c) => {
      if (fStatus.size && !fStatus.has(c.status)) return false
      if (fPrioridade.size && !fPrioridade.has(c.prioridade)) return false
      if (fEtiquetas.size && !c.etiquetas.some((e) => fEtiquetas.has(e))) return false
      if (soMinhas && c.responsavel !== eu) return false
      if (soNaoLidas && c.naoLidasEquipe === 0) return false
      if (q) {
        const n = nomes[c.userId]
        if (!semAcento(`${n?.nome ?? ''} ${n?.email ?? ''} ${c.assunto ?? ''} ${c.ultimaMensagem ?? ''}`).includes(q)) return false
      }
      return true
    }).sort((a, b) => {
      if (ordem === 'recentes') return Date.parse(b.atualizadaEm) - Date.parse(a.atualizadaEm)
      const sa = a.status === 'aberta' ? 2 : a.status === 'respondida' ? 1 : 0
      const sb = b.status === 'aberta' ? 2 : b.status === 'respondida' ? 1 : 0
      if (sa !== sb) return sb - sa
      if (a.status === 'aberta' && PESO[a.prioridade] !== PESO[b.prioridade]) return PESO[b.prioridade] - PESO[a.prioridade]
      if (a.status === 'aberta') return Date.parse(a.aguardandoDesde ?? a.atualizadaEm) - Date.parse(b.aguardandoDesde ?? b.atualizadaEm)
      return Date.parse(b.atualizadaEm) - Date.parse(a.atualizadaEm)
    })
  }, [conversas, fStatus, fPrioridade, fEtiquetas, soMinhas, soNaoLidas, busca, ordem, nomes, eu])

  // ------------------------------------------------ números do topo
  const kpis = useMemo(() => {
    const l = conversas ?? []
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const abertas = l.filter((c) => c.status === 'aberta')
    const maisAntiga = abertas.reduce<string | null>((m, c) => (!m || (c.aguardandoDesde && c.aguardandoDesde < m) ? c.aguardandoDesde : m), null)
    const tempos = l.filter((c) => c.primeiraRespostaEm && Date.parse(c.criadaEm) > Date.now() - 7 * 86_400_000).map((c) => (Date.parse(c.primeiraRespostaEm!) - Date.parse(c.criadaEm)) / 60000).sort((a, b) => a - b)
    const mediana = tempos.length ? tempos[Math.floor(tempos.length / 2)] : null
    const notas = l.filter((c) => c.avaliacao).map((c) => c.avaliacao!)
    return {
      abertas: abertas.length, foraDoPrazo: abertas.filter((c) => c.aguardandoDesde && agora - Date.parse(c.aguardandoDesde) > SLA_MIN * 60000).length, maisAntiga,
      respondidas: l.filter((c) => c.status === 'respondida').length,
      resolvidasHoje: l.filter((c) => c.resolvidaEm && Date.parse(c.resolvidaEm) >= hoje.getTime()).length,
      mediana, notas: notas.length, media: notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null,
    }
  }, [conversas, agora])

  // ------------------------------------------------ ações
  async function mudar(campos: Record<string, unknown>) {
    if (!atual) return
    const antes = atual
    setConversas((l) => l?.map((c) => (c.id === atual.id ? { ...c, ...Object.fromEntries(Object.entries(campos).map(([k, v]) => [k.replace(/_(\w)/g, (_, x: string) => x.toUpperCase()), v])) } as Conversa : c)) ?? l)
    try { await atualizarConversa(sessao, atual.id, campos) } catch (e) { setErro((e as Error).message); setConversas((l) => l?.map((c) => (c.id === antes.id ? antes : c)) ?? l) }
  }
  const alternarEtiqueta = (e: string) => atual && void mudar({ etiquetas: atual.etiquetas.includes(e) ? atual.etiquetas.filter((x) => x !== e) : [...atual.etiquetas, e].sort() })

  async function enviar(encerrarDepois = false, anexo: string | null = null) {
    if (!atual || enviando || (!texto.trim() && !anexo)) return
    const t = texto.trim()
    setEnviando(true); setErro(null)
    const temp: Mensagem = { id: `temp-${Date.now()}`, conversaId: atual.id, autor: 'equipe', autorId: eu, autorNome: nomeDaEquipe, texto: t, anexo, interna, criadaEm: new Date().toISOString(), enviando: true }
    setMensagens((l) => [...l, temp]); setTexto('')
    try {
      const salva = await mandarMensagem(sessao, atual.id, { texto: t, anexo, autor: 'equipe', interna, autorNome: nomeDaEquipe })
      setMensagens((l) => (l.some((x) => x.id === salva.id) ? l.filter((x) => x.id !== temp.id) : l.map((x) => (x.id === temp.id ? salva : x))))
      if (encerrarDepois && !interna) await mudar({ status: 'resolvida' })
      setInterna(false)
    } catch (e) {
      setMensagens((l) => l.filter((x) => x.id !== temp.id)); setTexto(t); setErro((e as Error).message)
    } finally { setEnviando(false); campo.current?.focus() }
  }
  async function mandarPrint(f: File | undefined) {
    if (!f || !atual) return
    try { setEnviando(true); const c = await enviarAnexo(sessao, atual, f); setEnviando(false); await enviar(false, c) }
    catch (e) { setErro((e as Error).message); setEnviando(false) } finally { if (arquivo.current) arquivo.current.value = '' }
  }
  const usarResposta = (r: RespostaPronta) => {
    setTexto(preencherResposta(r.texto, ficha?.nome || nomes[atual?.userId ?? '']?.nome || ''))
    setVerRespostas(false); setFiltroRespostas('')
    window.setTimeout(() => campo.current?.focus(), 0)
  }
  const teclas = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void enviar(e.metaKey || e.ctrlKey) }
    if (e.key === '/' && !texto) { e.preventDefault(); setVerRespostas(true) }
  }
  const respostasFiltradas = respostas.filter((r) => !filtroRespostas || semAcento(`${r.titulo} ${r.texto}`).includes(semAcento(filtroRespostas)))
  async function guardarResposta() {
    if (!editando || !editando.titulo.trim() || !editando.texto.trim()) return
    try { await salvarResposta(sessao, marca, editando); setRespostas(await respostasProntas(sessao, marca)); setEditando(null) } catch (e) { setErro((e as Error).message) }
  }

  async function trocarEmail() {
    if (!atual || novoEmail === null || trocandoEmail) return
    setTrocandoEmail(true); setErro(null)
    try {
      const email = await trocarEmailPeloSuporte(sessao, atual.userId, marca, novoEmail)
      setFicha((f) => (f ? { ...f, email } : f))
      setNomes((n) => ({ ...n, [atual.userId]: { ...(n[atual.userId] ?? { nome: '', foto: null }), email } }))
      setNovoEmail(null)
      await mandarMensagem(sessao, atual.id, { texto: `E-mail de acesso trocado para ${email}.`, autor: 'equipe', interna: true, autorNome: nomeDaEquipe }).then((m) => setMensagens((l) => (l.some((x) => x.id === m.id) ? l : [...l, m]))).catch(() => undefined)
      setTexto(preencherResposta(`Prontinho, {nome}! O seu e-mail de acesso agora é ${email}. Da próxima vez, entre com ele (a senha continua a mesma).`, ficha?.nome || ''))
      campo.current?.focus()
    } catch (e) { setErro((e as Error).message) } finally { setTrocandoEmail(false) }
  }

  const plano = nomeDoPlano
  const nomeDe = (c: Conversa) => nomes[c.userId]?.nome || nomes[c.userId]?.email || 'Cliente'
  const ctx = (atual?.contexto ?? {}) as { aparelho?: string; navegador?: string; app?: boolean; tela?: string; largura?: number }

  // o campo cresce com o texto (até 160 px) e volta a uma linha depois de enviar
  useEffect(() => { if (!texto && campo.current) campo.current.style.height = '' }, [texto])

  // confirmação de leitura, como no WhatsApp: as últimas N mensagens da equipe que o cliente ainda não leu
  const daEquipe = mensagens.filter((m) => m.autor === 'equipe' && !m.interna && !m.enviando)
  const naoLidasPeloCliente = new Set(daEquipe.slice(Math.max(0, daEquipe.length - (atual?.naoLidasCliente ?? 0))).map((m) => m.id))

  // ------------------------------------------------ tela
  let diaAnterior = ''
  return (
    <section className={`sx ${selecionada ? 'com-conversa' : ''} ${verFicha ? 'com-ficha' : ''}`}>
      {/* números do dia */}
      <div className="sx-kpis">
        <article className={kpis.abertas ? 'alerta' : ''}><span>Aguardando a equipe</span><strong>{kpis.abertas}</strong><small>{kpis.maisAntiga ? `a mais antiga há ${haQuanto(kpis.maisAntiga, agora)}` : 'fila zerada'}</small></article>
        <article className={kpis.foraDoPrazo ? 'perigo' : 'ok'}><span>Fora do prazo ({SLA_MIN} min)</span><strong>{kpis.foraDoPrazo}</strong><small>{kpis.foraDoPrazo ? 'responda essas primeiro' : 'tudo dentro do prazo'}</small></article>
        <article><span>Aguardando o cliente</span><strong>{kpis.respondidas}</strong><small>respondidas</small></article>
        <article className="ok"><span>Resolvidas hoje</span><strong>{kpis.resolvidasHoje}</strong><small>atendimentos encerrados</small></article>
        <article><span>1ª resposta · 7 dias</span><strong>{kpis.mediana === null ? '—' : kpis.mediana < 60 ? `${Math.round(kpis.mediana)} min` : `${(kpis.mediana / 60).toFixed(1)} h`}</strong><small>mediana</small></article>
        <article><span>Satisfação</span><strong>{kpis.media === null ? '—' : `${kpis.media.toFixed(1)} ★`}</strong><small>{kpis.notas} avaliaç{kpis.notas === 1 ? 'ão' : 'ões'}</small></article>
      </div>

      {erro && <p className="sx-erro" role="alert">{erro}<button type="button" onClick={() => setErro(null)}>fechar</button></p>}

      <div className="sx-mesa">
        {/* ------------------------------------------------ fila */}
        <aside className="sx-fila">
          <div className="sx-ferramentas">
            <label className="sx-busca"><Ic d={I.busca} /><input id="sx-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, e-mail ou texto" /></label>
            <div className="sx-filtros">
              <Multi rotulo="Situação" valor={fStatus} aoMudar={setFStatus} opcoes={(Object.keys(STATUS) as StatusDaConversa[]).map((s) => ({ id: s, nome: STATUS[s], total: (conversas ?? []).filter((c) => c.status === s).length }))} />
              <Multi rotulo="Prioridade" valor={fPrioridade} aoMudar={setFPrioridade} opcoes={(Object.keys(PRIORIDADES) as Prioridade[]).map((p) => ({ id: p, nome: PRIORIDADES[p], total: (conversas ?? []).filter((c) => c.prioridade === p && c.status !== 'resolvida').length }))} />
              <Multi rotulo="Etiquetas" valor={fEtiquetas} aoMudar={setFEtiquetas} opcoes={Object.keys(ETIQUETAS).map((e) => ({ id: e, nome: ETIQUETAS[e], total: contagemEtiquetas[e] ?? 0 }))} />
              <button type="button" className={`sx-filtro ${soMinhas ? 'ativo' : ''}`} onClick={() => setSoMinhas((v) => !v)} aria-pressed={soMinhas}>Minhas</button>
              <button type="button" className={`sx-filtro ${soNaoLidas ? 'ativo' : ''}`} onClick={() => setSoNaoLidas((v) => !v)} aria-pressed={soNaoLidas}>Não lidas</button>
            </div>
            <div className="sx-ordem">
              <span>{visiveis.length} conversa{visiveis.length === 1 ? '' : 's'}{!comResolvidas && ' em aberto'}</span>
              <div>
                <button type="button" className={ordem === 'fila' ? 'on' : ''} onClick={() => setOrdem('fila')}>Fila</button>
                <button type="button" className={ordem === 'recentes' ? 'on' : ''} onClick={() => setOrdem('recentes')}>Recentes</button>
                <button type="button" className="sx-som" onClick={() => { const v = !som; setSom(v); try { localStorage.setItem(CHAVE_SOM, v ? '1' : '0') } catch { /* só agora */ } if (v) tocarSom() }} aria-label={som ? 'Silenciar o aviso sonoro' : 'Ligar o aviso sonoro'} title={som ? 'Som ligado' : 'Som desligado'}><Ic d={som ? I.som : I.mudo} /></button>
              </div>
            </div>
          </div>

          <div className="sx-lista" role="list">
            {conversas === null ? <div className="sx-vazio">Abrindo a caixa de entrada…</div> : visiveis.length === 0 ? (
              <div className="sx-vazio"><Monograma tamanho={44} /><b>{conversas.length ? 'Nada com esses filtros' : 'Nenhuma conversa ainda'}</b><small>{conversas.length ? 'Tire algum filtro para ver mais.' : 'Quando um cliente escrever, aparece aqui na hora.'}</small></div>
            ) : visiveis.map((c) => {
              const espera = c.status === 'aberta' && c.aguardandoDesde ? agora - Date.parse(c.aguardandoDesde) : 0
              const n = nomes[c.userId]
              return (
                <button type="button" role="listitem" key={c.id} className={`sx-item ${c.id === selecionada ? 'on' : ''} ${c.naoLidasEquipe ? 'nao-lida' : ''} p-${c.prioridade} s-${c.status}`} onClick={() => { setSelecionada(c.id); setVerFicha(false) }}>
                  <span className="sx-avatar">{n?.foto ? <img src={n.foto} alt="" /> : iniciais(nomeDe(c))}</span>
                  <span className="sx-item-corpo">
                    <span className="sx-item-topo"><b>{nomeDe(c)}</b><time className={espera > SLA_MIN * 60000 ? 'atrasada' : ''}>{c.status === 'aberta' ? haQuanto(c.aguardandoDesde, agora) : haQuanto(c.atualizadaEm, agora)}</time></span>
                    <span className="sx-item-texto">{c.ultimaDe === 'equipe' && <em>Você: </em>}{c.ultimaMensagem || c.assunto || 'Conversa aberta'}</span>
                    <span className="sx-item-selos">
                      {c.prioridade !== 'normal' && <i className={`sx-prio ${c.prioridade}`}>{PRIORIDADES[c.prioridade]}</i>}
                      {c.status !== 'aberta' && <i className={`sx-st ${c.status}`}>{c.status === 'resolvida' ? 'Resolvida' : 'Respondida'}</i>}
                      {c.etiquetas.slice(0, 3).map((e) => <i key={e} className={`sx-tag t-${e}`}>{ETIQUETAS[e] ?? e}</i>)}
                      {c.etiquetas.length > 3 && <i className="sx-tag">+{c.etiquetas.length - 3}</i>}
                    </span>
                  </span>
                  {c.naoLidasEquipe > 0 && <b className="sx-nao-lidas">{c.naoLidasEquipe}</b>}
                </button>
              )
            })}
          </div>
        </aside>

        {/* ------------------------------------------------ a conversa */}
        <div className="sx-conversa">
          {!atual ? (
            <div className="sx-escolha"><Monograma tamanho={64} /><b>Escolha uma conversa</b><small>A fila mostra primeiro o mais urgente e quem espera há mais tempo. Atalhos: <kbd>/</kbd> respostas prontas · <kbd>Enter</kbd> envia · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> envia e encerra · cole um print com <kbd>Ctrl</kbd>+<kbd>V</kbd>.</small></div>
          ) : (
            <>
              <header className="sx-conversa-topo">
                <button type="button" className="sx-icone sx-voltar" onClick={() => setSelecionada(null)} aria-label="Voltar para a fila"><Ic d={I.voltar} /></button>
                <span className="sx-avatar">{nomes[atual.userId]?.foto ? <img src={nomes[atual.userId].foto!} alt="" /> : iniciais(nomeDe(atual))}</span>
                <div className="sx-quem"><b>{nomeDe(atual)}</b><small>{nomes[atual.userId]?.email}{atual.responsavelNome && ` · com ${atual.responsavelNome.split(' ')[0]}`}</small></div>
                <div className="sx-acoes">
                  <select id="sx-prioridade" value={atual.prioridade} onChange={(e) => void mudar({ prioridade: e.target.value })} aria-label="Prioridade" className={`p-${atual.prioridade}`}>
                    {(Object.keys(PRIORIDADES) as Prioridade[]).map((p) => <option key={p} value={p}>{PRIORIDADES[p]}</option>)}
                  </select>
                  {atual.responsavel !== eu && <button type="button" className="sx-btn" onClick={() => void mudar({ responsavel: eu, responsavel_nome: nomeDaEquipe })}>Assumir</button>}
                  {atual.status === 'resolvida'
                    ? <button type="button" className="sx-btn" onClick={() => void mudar({ status: 'aberta', aguardando_desde: new Date().toISOString() })}>Reabrir</button>
                    : <button type="button" className="sx-btn ok" onClick={() => void mudar({ status: 'resolvida' })}><Ic d={I.certo} />Encerrar</button>}
                  <button type="button" className={`sx-icone sx-ficha-btn ${verFicha ? 'on' : ''}`} onClick={() => setVerFicha((v) => !v)} aria-label="Ficha do cliente" aria-pressed={verFicha}><Ic d={I.ficha} /></button>
                </div>
              </header>
              <div className="sx-etiquetas">
                {Object.keys(ETIQUETAS).map((e) => (
                  <button type="button" key={e} className={`sx-tag t-${e} ${atual.etiquetas.includes(e) ? 'on' : ''}`} onClick={() => alternarEtiqueta(e)} aria-pressed={atual.etiquetas.includes(e)}>{ETIQUETAS[e]}</button>
                ))}
              </div>

              <div className="sx-mensagens" ref={lista}>
                {(() => {
                  // a triagem: o que a pessoa escolheu antes de escrever (o atendente não precisa perguntar o básico)
                  const t = (atual.contexto as { triagem?: ResumoDaTriagem }).triagem
                  if (!t) return null
                  const vistas = t.faqVistas.map((id) => PERGUNTAS.find((p) => p.id === id)?.pergunta).filter(Boolean)
                  return (
                    <div className="sx-triagem">
                      <span className="sx-rot">Triagem do cliente</span>
                      <b>{t.rotulo}{t.alta && <i className="sx-prio alta">prioridade alta</i>}</b>
                      {t.respostas.length > 0 && <dl>{t.respostas.map((r, n) => <div key={n}><dt>{r.pergunta}</dt><dd>{r.resposta}</dd></div>)}</dl>}
                      {vistas.length > 0 && <small>Leu na Ajuda e não resolveu: {vistas.join(' · ')}</small>}
                    </div>
                  )
                })()}
                {mensagens.map((m) => {
                  const dia = diaDaMensagem(m.criadaEm)
                  const sep = dia !== diaAnterior ? <div className="sx-dia" key={`d-${m.id}`}><span>{dia}</span></div> : null
                  diaAnterior = dia
                  if (m.autor === 'sistema') return [sep, <div key={m.id} className="sx-sistema"><Monograma tamanho={14} />Resposta automática enviada · {horaCurta(m.criadaEm)}</div>]
                  const cliente = m.autor === 'cliente'
                  return [sep,
                    <div key={m.id} className={`sx-msg ${cliente ? 'cliente' : 'equipe'} ${m.interna ? 'interna' : ''}`}>
                      <div className="sx-balao">
                        <span className="sx-msg-nome">{m.interna ? 'Nota interna · ' : ''}{cliente ? nomeDe(atual).split(' ')[0] : (m.autorNome || 'Equipe').split(' ')[0]}</span>
                        {m.anexo && <Anexo sessao={sessao} caminho={m.anexo} />}
                        {m.texto && <p>{m.texto}</p>}
                        <time>{m.enviando ? 'enviando…' : horaCurta(m.criadaEm)}
                          {!cliente && !m.interna && !m.enviando && (
                            <svg className={`sx-lido ${naoLidasPeloCliente.has(m.id) ? '' : 'lido'}`} viewBox="0 0 18 11" aria-label={naoLidasPeloCliente.has(m.id) ? 'Entregue' : 'Lida pelo cliente'}><path d="M1 6l3 3 6-7M7 9l1 1 7-8" /></svg>
                          )}
                        </time>
                      </div>
                    </div>]
                })}
                {atual.avaliacao && (
                  <div className="sx-avaliacao"><b>{'★'.repeat(atual.avaliacao)}{'☆'.repeat(5 - atual.avaliacao)}</b>{atual.avaliacaoComentario ? <span>“{atual.avaliacaoComentario}”</span> : <span>Avaliação do cliente</span>}</div>
                )}
              </div>

              <div className={`sx-escrever ${interna ? 'interna' : ''}`}>
                {verRespostas && (
                  <div className="sx-respostas">
                    <div className="sx-respostas-topo">
                      <input autoFocus value={filtroRespostas} onChange={(e) => setFiltroRespostas(e.target.value)} placeholder="Procurar resposta pronta" onKeyDown={(e) => { if (e.key === 'Escape') setVerRespostas(false); if (e.key === 'Enter' && respostasFiltradas[0]) usarResposta(respostasFiltradas[0]) }} />
                      <button type="button" className="sx-btn" onClick={() => { setGerirRespostas(true); setVerRespostas(false) }}>Editar</button>
                    </div>
                    {respostasFiltradas.map((r) => <button type="button" key={r.id} onClick={() => usarResposta(r)}><b>{r.titulo}</b><small>{preencherResposta(r.texto, ficha?.nome ?? '')}</small></button>)}
                    {!respostasFiltradas.length && <small className="sx-respostas-vazio">Nenhuma resposta com esse nome.</small>}
                  </div>
                )}
                <div className="sx-escrever-barra">
                  <button type="button" className={`sx-modo ${!interna ? 'on' : ''}`} onClick={() => setInterna(false)}>Responder</button>
                  <button type="button" className={`sx-modo nota ${interna ? 'on' : ''}`} onClick={() => setInterna(true)}><Ic d={I.nota} />Nota interna</button>
                  <small>{interna ? 'O cliente não vê notas internas.' : 'Enter envia · Shift+Enter quebra a linha'}</small>
                  {!interna && atual.status !== 'resolvida' && <button type="button" className="sx-link" disabled={!texto.trim() || enviando} onClick={() => void enviar(true)}>Enviar e encerrar</button>}
                </div>
                <div className="sx-escrever-linha">
                  <button type="button" className={`sx-icone ${verRespostas ? 'on' : ''}`} onClick={() => setVerRespostas((v) => !v)} aria-label="Respostas prontas" title="Respostas prontas ( / )"><Ic d={I.raio} /></button>
                  <button type="button" className="sx-icone" onClick={() => arquivo.current?.click()} aria-label="Mandar imagem" title="Mandar imagem (ou cole com Ctrl+V)"><Ic d={I.clipe} /></button>
                  <input ref={arquivo} type="file" accept="image/*" hidden onChange={(e) => void mandarPrint(e.target.files?.[0])} />
                  <textarea id="sx-texto" ref={campo} value={texto} rows={1}
                    onChange={(e) => { setTexto(e.target.value); const t = e.currentTarget; t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 160)}px` }}
                    onKeyDown={teclas}
                    onPaste={(e) => { const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); void mandarPrint(f) } }}
                    placeholder={interna ? 'Nota só para a equipe' : `Mensagem para ${nomeDe(atual).split(' ')[0]}  ·  / respostas prontas`} />
                  <button type="button" className="sx-enviar" disabled={!texto.trim() || enviando} onClick={() => void enviar()} aria-label={interna ? 'Salvar nota' : 'Enviar'} title={interna ? 'Salvar nota' : 'Enviar'}><Ic d={I.enviar} /></button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ------------------------------------------------ ficha */}
        {atual && (
          <aside className="sx-ficha">
            <button type="button" className="sx-icone sx-ficha-fechar" onClick={() => setVerFicha(false)} aria-label="Fechar a ficha"><Ic d={I.x} /></button>
            <div className="sx-ficha-quem">
              <span className="sx-avatar grande">{ficha?.fotoUrl ? <img src={ficha.fotoUrl} alt="" /> : iniciais(ficha?.nome || nomeDe(atual))}</span>
              <b>{ficha?.nome || nomeDe(atual)}</b>
              <small>{ficha?.email}</small>
            </div>
            {ficha ? (
              <dl>
                <div><dt>Plano</dt><dd>{plano(ficha.planoId)}</dd></div>
                <div><dt>Situação</dt><dd className={ficha.status === 'ativo' ? 'ok' : 'ruim'}>{ficha.status || '—'}</dd></div>
                <div><dt>Válido até</dt><dd>{ficha.acessoExpira ? new Date(ficha.acessoExpira).toLocaleDateString('pt-BR') : 'sem data'}</dd></div>
                <div><dt>Cliente desde</dt><dd>{ficha.criadoEm ? new Date(ficha.criadoEm).toLocaleDateString('pt-BR') : '—'}</dd></div>
                <div><dt>Último acesso</dt><dd>{ficha.vistoEm ? `há ${haQuanto(ficha.vistoEm, agora)}` : '—'}</dd></div>
                <div><dt>CPF</dt><dd>{ficha.cpf ? formatarCPF(ficha.cpf) : '—'}</dd></div>
                <div><dt>Telefone</dt><dd>{ficha.telefone ? <a href={`https://wa.me/55${ficha.telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><Ic d={I.whats} />{formatarTelefone(ficha.telefone)}</a> : '—'}</dd></div>
                {(ficha.cidade || ficha.uf) && <div><dt>Cidade</dt><dd>{[ficha.cidade, ficha.uf].filter(Boolean).join(' / ')}</dd></div>}
              </dl>
            ) : <p className="sx-ficha-vazia">Carregando a ficha…</p>}
            <div className="sx-ficha-bloco">
              <span className="sx-rot">E-mail de acesso</span>
              {novoEmail === null ? (
                <button type="button" className="sx-btn" onClick={() => setNovoEmail('')}>Trocar o e-mail</button>
              ) : (
                <div className="sx-trocar-email">
                  <input id="sx-novo-email" type="email" autoFocus value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="novo@email.com" onKeyDown={(e) => { if (e.key === 'Enter') void trocarEmail(); if (e.key === 'Escape') setNovoEmail(null) }} />
                  <div><button type="button" className="sx-btn" onClick={() => setNovoEmail(null)}>Cancelar</button><button type="button" className="sx-btn ouro" disabled={trocandoEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(novoEmail.trim())} onClick={() => void trocarEmail()}>{trocandoEmail ? 'Trocando…' : 'Confirmar'}</button></div>
                  <small>Confira com o cliente antes. A troca vale na hora; a senha continua a mesma.</small>
                </div>
              )}
            </div>
            <div className="sx-ficha-bloco">
              <span className="sx-rot">Onde escreveu</span>
              <p>{[ctx.tela && `tela ${ctx.tela}`, ctx.aparelho, ctx.navegador, ctx.app ? 'app instalado' : 'navegador'].filter(Boolean).join(' · ') || '—'}</p>
            </div>
            <div className="sx-ficha-bloco">
              <span className="sx-rot">Outras conversas ({historico.length})</span>
              {historico.length ? historico.slice(0, 6).map((h) => (
                <button type="button" key={h.id} className="sx-hist" onClick={() => {
                  // conversa antiga (fora da lista dos últimos 30 dias): entra na lista para abrir
                  setConversas((l) => (l?.some((c) => c.id === h.id) ? l : [...(l ?? []), h])); setSelecionada(h.id)
                }}>
                  <b>{h.assunto || 'Conversa'}</b><small>{new Date(h.criadaEm).toLocaleDateString('pt-BR')} · {STATUS[h.status]}{h.avaliacao ? ` · ${h.avaliacao}★` : ''}</small>
                </button>
              )) : <p>Primeira conversa desta pessoa.</p>}
            </div>
          </aside>
        )}
      </div>

      {/* ------------------------------------------------ respostas prontas: editar */}
      {gerirRespostas && (
        <div className="adm-modal-fundo" onClick={(e) => { if (e.target === e.currentTarget) { setGerirRespostas(false); setEditando(null) } }}>
          <div className="adm-modal sx-gerir">
            <header><div><span className="sx-rot">Suporte</span><h3>Respostas prontas</h3><p>Use <code>{'{nome}'}</code> para o primeiro nome do cliente.</p></div>
              <button type="button" className="sx-icone" onClick={() => { setGerirRespostas(false); setEditando(null) }} aria-label="Fechar"><Ic d={I.x} /></button></header>
            {editando ? (
              <div className="sx-gerir-form">
                <label><span>Título</span><input id="sx-resp-titulo" value={editando.titulo} onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} placeholder="Ex.: Conectar a Deriv" /></label>
                <label><span>Texto</span><textarea id="sx-resp-texto" rows={5} value={editando.texto} onChange={(e) => setEditando({ ...editando, texto: e.target.value })} placeholder="Olá, {nome}! …" /></label>
                <div><button type="button" className="sx-btn" onClick={() => setEditando(null)}>Cancelar</button><button type="button" className="sx-btn ouro" onClick={() => void guardarResposta()}>Salvar</button></div>
              </div>
            ) : (
              <>
                <button type="button" className="sx-btn ouro sx-gerir-nova" onClick={() => setEditando({ titulo: '', texto: '' })}><Ic d={I.mais} />Nova resposta</button>
                <div className="sx-gerir-lista">
                  {respostas.map((r) => (
                    <article key={r.id}><div><b>{r.titulo}</b><p>{r.texto}</p></div>
                      <button type="button" className="sx-icone" onClick={() => setEditando({ id: r.id, titulo: r.titulo, texto: r.texto })} aria-label={`Editar ${r.titulo}`}><Ic d={I.editar} /></button>
                      <button type="button" className="sx-icone" onClick={() => { if (confirm(`Apagar a resposta "${r.titulo}"?`)) void apagarResposta(sessao, r.id).then(() => setRespostas((l) => l.filter((x) => x.id !== r.id))) }} aria-label={`Apagar ${r.titulo}`}><Ic d={I.lixo} /></button>
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
