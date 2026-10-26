import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import {
  diaDaMensagem, equipeDoBanco, estaOnline, horaCurta, iniciais, lidaPorTodos, outroDaDireta, POR_PAGINA, primeiroNome, quandoNaLista,
  situacaoDoContato, tomDe,
  type Contato, type ConversaEq, type EquipeApi, type MensagemEq, type MudancaEq,
} from '../../core/teeds/equipe'
import { Monograma } from '../marca/Monograma'
import { MARCA } from '../../marca'
import './chat-da-equipe.css'

/**
 * O chat da equipe (27/10/2026): o "WhatsApp" dos administradores.
 *
 * Um botão no canto, logo acima do botão do suporte, com o número de não
 * lidas. Abre uma janela com as conversas à esquerda (o grupo da equipe e
 * uma conversa direta com cada administrador) e a conversa à direita; no
 * celular, tela cheia, uma coisa de cada vez. Ao vivo pelo Realtime, com
 * prints, resposta a uma mensagem, apagar para todos, os dois tiques de lida
 * e o "online agora". Mensagem nova com a janela fechada vira um recado no
 * canto. Sem som (os sons da plataforma são só os três da operação).
 */

interface Props {
  api: EquipeApi
  /** Esconde o botão (sala de treino, que tem o chat dela). */
  escondido?: boolean
}

interface Aviso { conversaId: string; autor: string | null; texto: string }

const I = {
  enviar: 'M4 12l16-8-6 16-2.5-6.5z',
  clipe: 'M20 11.5l-8.2 8.2a5 5 0 01-7-7L13 4.5a3.3 3.3 0 014.7 4.7l-8.2 8.2a1.7 1.7 0 01-2.4-2.4l7.6-7.6',
  fechar: 'M6 6l12 12M18 6L6 18',
  voltar: 'M15 6l-6 6 6 6',
  conversa: 'M8 10h8M8 14h5M21 12a8.5 8.5 0 01-12.4 7.6L3 21l1.4-5.2A8.5 8.5 0 1121 12z',
  responder: 'M10 8L4 13l6 5M4 13h10a6 6 0 016 6',
  lixo: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  visto: 'M2 12.5l4 4L15 7.5M9.5 16.5l1 1L21 7',
  enviada: 'M5 12.5l4.2 4.2L19 7',
  relogio: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  imagem: 'M4 5h16v14H4zM4 15l5-5 5 5 2-2 4 4M15 9.5a1 1 0 100-.01',
  baixo: 'M6 9l6 6 6-6',
  cadeado: 'M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z',
}
const Ic = ({ d, className }: { d: string; className?: string }) => <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
const toque = () => typeof matchMedia === 'function' && matchMedia('(hover: none)').matches
const celular = () => typeof matchMedia === 'function' && matchMedia('(max-width: 720px)').matches
const visivel = () => typeof document === 'undefined' || document.visibilityState === 'visible'

function Avatar({ nome, id, tamanho = 40, online, grupo }: { nome: string; id: string | null; tamanho?: number; online?: boolean; grupo?: boolean }) {
  return (
    <span className={`eq-avatar ${grupo ? 'grupo' : ''}`} style={{ width: tamanho, height: tamanho, ['--tom' as string]: tomDe(id) }}>
      {grupo ? <Monograma tamanho={Math.round(tamanho * 0.56)} /> : <b style={{ fontSize: Math.round(tamanho * 0.36) }}>{iniciais(nome)}</b>}
      {online !== undefined && <i className={online ? 'online' : ''} aria-hidden="true" />}
    </span>
  )
}

function Print({ api, caminho, aoAmpliar }: { api: EquipeApi; caminho: string; aoAmpliar: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [erro, setErro] = useState(false)
  useEffect(() => { let vivo = true; api.abrirPrint(caminho).then((u) => vivo && setUrl(u)).catch(() => vivo && setErro(true)); return () => { vivo = false } }, [caminho]) // eslint-disable-line react-hooks/exhaustive-deps
  if (erro) return <span className="eq-print-erro">Imagem indisponível</span>
  if (!url) return <span className="eq-print carregando" aria-busy="true" />
  return <button type="button" className="eq-print" onClick={() => aoAmpliar(url)} aria-label="Ampliar imagem"><img src={url} alt="Imagem enviada no chat" /></button>
}

/** Junta o que veio do banco com o que só existe aqui (enviando), sem repetir. */
function juntar(atuais: MensagemEq[], novas: MensagemEq[]): MensagemEq[] {
  const porId = new Map<string, MensagemEq>()
  for (const m of atuais) porId.set(m.id, m)
  for (const m of novas) porId.set(m.id, m)
  const reais = [...porId.values()].filter((m) => !m.enviando && !m.falhou)
  // a cópia otimista sai quando a real (mesmo autor e texto, mesmo print) já chegou
  const pendentes = [...porId.values()].filter((m) => (m.enviando || m.falhou)
    && !reais.some((r) => r.autor === m.autor && r.texto === m.texto && r.anexo === m.anexo && Math.abs(Date.parse(r.criadaEm) - Date.parse(m.criadaEm)) < 120_000))
  return [...reais, ...pendentes].sort((a, b) => Date.parse(a.criadaEm) - Date.parse(b.criadaEm))
}

export function ChatDaEquipe({ api, escondido = false }: Props) {
  const eu = api.euId
  const [pronto, setPronto] = useState(false)
  const [erroGeral, setErroGeral] = useState('')
  const [grupo, setGrupo] = useState('')
  const [contatos, setContatos] = useState<Contato[]>([])
  const [conversas, setConversas] = useState<ConversaEq[]>([])
  const [naoLidas, setNaoLidas] = useState<Record<string, number>>({})
  const [msgs, setMsgs] = useState<Record<string, MensagemEq[]>>({})
  const [temMais, setTemMais] = useState<Record<string, boolean>>({})
  const [aberto, setAberto] = useState(false)
  const [atual, setAtual] = useState<string | null>(null)
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({})
  const [resposta, setResposta] = useState<MensagemEq | null>(null)
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [confirmarApagar, setConfirmarApagar] = useState<string | null>(null)
  const [ampliada, setAmpliada] = useState<string | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [erro, setErro] = useState('')
  const [abrindoContato, setAbrindoContato] = useState<string | null>(null)
  const [enviandoPrint, setEnviandoPrint] = useState(false)
  const [carregandoAntigas, setCarregandoAntigas] = useState(false)
  const [agora, setAgora] = useState(() => Date.now())
  const [longeDoFim, setLongeDoFim] = useState(false)

  const painel = useRef<HTMLDivElement>(null)
  const lista = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const arquivo = useRef<HTMLInputElement>(null)
  const colarNoFim = useRef(true)
  // o que os ouvintes do Realtime precisam ler sem refazer a assinatura
  const estado = useRef({ aberto, atual, conversas })
  estado.current = { aberto, atual, conversas }

  const porId = useMemo(() => new Map(contatos.map((c) => [c.id, c])), [contatos])
  const nomeDe = useCallback((id: string | null) => (id && porId.get(id)?.nome) || 'Alguém da equipe', [porId])
  const totalNaoLidas = Object.values(naoLidas).reduce((s, n) => s + n, 0)
  const nomeDoGrupo = `Equipe ${MARCA.prosa}`

  // ------------------------------------------------ abrir e manter em dia
  const sincronizar = useCallback(async () => {
    try {
      const a = await api.abrir()
      setGrupo(a.grupo); setContatos(a.contatos); setConversas(a.conversas); setNaoLidas(a.naoLidas)
      setPronto(true); setErroGeral('')
    } catch (e) {
      setErroGeral(e instanceof Error ? e.message : 'Não consegui abrir o chat agora.')
    }
  }, [api])

  useEffect(() => { void sincronizar() }, [sincronizar])
  useEffect(() => {
    if (pronto || !erroGeral) return
    const t = window.setTimeout(() => void sincronizar(), 30_000)
    return () => window.clearTimeout(t)
  }, [pronto, erroGeral, sincronizar])

  // "online agora": avisa a cada minuto e confere quem está por aí
  useEffect(() => {
    if (!pronto) return
    const bater = () => {
      setAgora(Date.now())
      if (!visivel()) return
      void api.estouAqui()
      api.contatos().then(setContatos).catch(() => undefined)
    }
    const t = window.setInterval(bater, 60_000)
    const aoVoltar = () => { if (visivel()) bater() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', aoVoltar) }
  }, [pronto, api])

  // ------------------------------------------------ ao vivo
  const marcarLida = useCallback((conversaId: string) => {
    setNaoLidas((n) => (n[conversaId] ? { ...n, [conversaId]: 0 } : n))
    void api.ler(conversaId).catch(() => undefined)
  }, [api])

  useEffect(() => {
    if (!pronto) return
    let caiu = false
    const aoMudar = (m: MudancaEq) => {
      const { aberto: ab, atual: at, conversas: cs } = estado.current
      if (m.tipo === 'mensagem') {
        const x = m.item
        setMsgs((t) => (t[x.conversaId] ? { ...t, [x.conversaId]: juntar(t[x.conversaId], [x]) } : t))
        if (!m.nova) return
        if (!cs.some((c) => c.id === x.conversaId)) api.conversas().then(setConversas).catch(() => undefined)
        setConversas((l) => l.map((c) => (c.id === x.conversaId ? { ...c, ultimaEm: x.criadaEm, ultimaTexto: x.texto || 'Imagem', ultimaAutor: x.autor } : c)))
        if (x.autor === eu) return
        if (ab && at === x.conversaId && visivel()) { marcarLida(x.conversaId); return }
        setNaoLidas((n) => ({ ...n, [x.conversaId]: (n[x.conversaId] ?? 0) + 1 }))
        if (!(ab && at === x.conversaId)) setAviso({ conversaId: x.conversaId, autor: x.autor, texto: x.texto || 'Mandou uma imagem' })
      } else if (m.tipo === 'leitura') {
        setConversas((l) => l.map((c) => (c.id !== m.conversaId ? c : {
          ...c,
          participantes: c.participantes.some((p) => p.userId === m.userId)
            ? c.participantes.map((p) => (p.userId === m.userId ? { ...p, lidaEm: m.lidaEm } : p))
            : [...c.participantes, { userId: m.userId, lidaEm: m.lidaEm }],
        })))
        // li no celular: o computador também zera
        if (m.userId === eu) setNaoLidas((n) => (n[m.conversaId] ? { ...n, [m.conversaId]: 0 } : n))
      } else if (m.tipo === 'conversa') {
        if (!cs.some((c) => c.id === m.item.id)) { api.conversas().then(setConversas).catch(() => undefined); return }
        setConversas((l) => l.map((c) => (c.id === m.item.id ? { ...c, ...m.item } : c)))
      }
    }
    const parar = api.acompanhar(aoMudar, (vivo) => {
      if (!vivo) { caiu = true; return }
      // voltou depois de cair: busca o que passou enquanto estava fora
      if (caiu) {
        caiu = false
        void sincronizar()
        const at = estado.current.atual
        if (at) api.mensagens(at).then((l) => setMsgs((t) => ({ ...t, [at]: juntar(t[at] ?? [], l) }))).catch(() => undefined)
      }
    })
    return parar
  }, [pronto, api, eu, marcarLida, sincronizar])

  // ------------------------------------------------ a conversa aberta
  useEffect(() => {
    if (!aberto || !atual) return
    colarNoFim.current = true
    if (!msgs[atual]) {
      api.mensagens(atual)
        .then((l) => { setMsgs((t) => ({ ...t, [atual]: juntar(t[atual] ?? [], l) })); setTemMais((t) => ({ ...t, [atual]: l.length >= POR_PAGINA })) })
        .catch((e) => setErro(e instanceof Error ? e.message : 'Não consegui carregar as mensagens.'))
    }
    if (naoLidas[atual] || visivel()) marcarLida(atual)
    setResposta(null); setSelecionada(null); setConfirmarApagar(null); setErro('')
    if (!toque()) window.setTimeout(() => campo.current?.focus({ preventScroll: true }), 80)
  }, [aberto, atual]) // eslint-disable-line react-hooks/exhaustive-deps

  // voltou para a aba com a conversa aberta: conta como lida
  useEffect(() => {
    if (!aberto || !atual) return
    const aoVoltar = () => { if (visivel() && naoLidas[atual]) marcarLida(atual) }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [aberto, atual, naoLidas, marcarLida])

  // no computador a janela já abre numa conversa (a do grupo, ou a que chamou)
  const abrirChat = useCallback((conversaId?: string) => {
    setAberto(true); setAviso(null)
    if (conversaId) setAtual(conversaId)
    else if (!atual && !celular()) {
      const comNaoLida = Object.entries(naoLidas).find(([, n]) => n > 0)?.[0]
      setAtual(comNaoLida ?? grupo ?? null)
    }
  }, [atual, naoLidas, grupo])

  // celular: janela inteira acompanhando o teclado; Esc fecha
  useEffect(() => {
    if (!aberto) return
    const vv = window.visualViewport
    const raiz = document.documentElement
    raiz.classList.add('eq-aberto')
    const ajustar = () => {
      if (!painel.current || !vv) return
      painel.current.style.setProperty('--eq-altura', `${vv.height}px`)
      painel.current.style.setProperty('--eq-topo', `${vv.offsetTop}px`)
    }
    ajustar()
    vv?.addEventListener('resize', ajustar); vv?.addEventListener('scroll', ajustar)
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (ampliada) setAmpliada(null)
      else if (resposta) setResposta(null)
      else setAberto(false)
    }
    document.addEventListener('keydown', esc)
    return () => { raiz.classList.remove('eq-aberto'); vv?.removeEventListener('resize', ajustar); vv?.removeEventListener('scroll', ajustar); document.removeEventListener('keydown', esc) }
  }, [aberto, ampliada, resposta])

  // o recado do canto some sozinho
  useEffect(() => { if (!aviso) return; const t = window.setTimeout(() => setAviso(null), 8000); return () => window.clearTimeout(t) }, [aviso])

  // (3) na aba do navegador, como o WhatsApp Web
  useEffect(() => {
    const limpo = document.title.replace(/^\(\d+\+?\) /, '')
    document.title = totalNaoLidas ? `(${totalNaoLidas > 99 ? '99+' : totalNaoLidas}) ${limpo}` : limpo
  }, [totalNaoLidas])
  useEffect(() => () => { document.title = document.title.replace(/^\(\d+\+?\) /, '') }, [])

  // a caixa de texto cresce com o que a pessoa escreve
  const texto = (atual && rascunhos[atual]) || ''
  useLayoutEffect(() => {
    const c = campo.current; if (!c) return
    c.style.height = 'auto'; c.style.height = `${Math.min(c.scrollHeight, 140)}px`; c.style.overflowY = c.scrollHeight > 140 ? 'auto' : 'hidden'
  }, [texto, atual, aberto])

  // desce para a última mensagem quando chega coisa nova (se já estava lá embaixo)
  const mensagens = (atual && msgs[atual]) || null
  useLayoutEffect(() => {
    const l = lista.current
    if (l && colarNoFim.current) l.scrollTop = l.scrollHeight
  }, [mensagens, aberto, atual])
  const aoRolar = () => {
    const l = lista.current; if (!l) return
    const longe = l.scrollHeight - l.scrollTop - l.clientHeight > 120
    colarNoFim.current = !longe
    setLongeDoFim(longe)
    if (l.scrollTop < 60 && atual && temMais[atual] && !carregandoAntigas) void carregarAntigas()
  }
  const descer = () => { const l = lista.current; if (l) { colarNoFim.current = true; l.scrollTo({ top: l.scrollHeight, behavior: 'smooth' }) } }

  async function carregarAntigas() {
    if (!atual || !mensagens?.length) return
    setCarregandoAntigas(true)
    const l = lista.current
    const alturaAntes = l?.scrollHeight ?? 0
    try {
      const antigas = await api.mensagens(atual, mensagens.find((m) => !m.enviando)?.criadaEm)
      setTemMais((t) => ({ ...t, [atual]: antigas.length >= POR_PAGINA }))
      setMsgs((t) => ({ ...t, [atual]: juntar(t[atual] ?? [], antigas) }))
      // fica onde estava, sem pular para o topo
      requestAnimationFrame(() => { if (l) l.scrollTop += l.scrollHeight - alturaAntes })
    } catch { /* tenta de novo ao rolar */ } finally { setCarregandoAntigas(false) }
  }

  // ------------------------------------------------ escrever e mandar
  const setTexto = (v: string) => { if (atual) setRascunhos((r) => ({ ...r, [atual]: v })) }

  async function mandar(conversaId: string, dados: { texto: string; anexo?: string | null; respostaA?: string | null }, reenviar?: MensagemEq) {
    const temp: MensagemEq = reenviar
      ? { ...reenviar, enviando: true, falhou: false }
      : { id: `tmp-${crypto.randomUUID()}`, conversaId, autor: eu, texto: dados.texto.trim(), anexo: dados.anexo ?? null, respostaA: dados.respostaA ?? null, apagada: false, criadaEm: new Date().toISOString(), enviando: true }
    colarNoFim.current = true
    setMsgs((t) => ({ ...t, [conversaId]: juntar(t[conversaId] ?? [], [temp]) }))
    try {
      const real = await api.mandar(conversaId, { texto: temp.texto, anexo: temp.anexo, respostaA: temp.respostaA })
      setMsgs((t) => ({ ...t, [conversaId]: juntar((t[conversaId] ?? []).filter((m) => m.id !== temp.id), [real]) }))
    } catch {
      setMsgs((t) => ({ ...t, [conversaId]: (t[conversaId] ?? []).map((m) => (m.id === temp.id ? { ...m, enviando: false, falhou: true } : m)) }))
    }
  }

  function enviarTexto() {
    if (!atual) return
    const t = texto.trim()
    if (!t) return
    setTexto('')
    const r = resposta?.id ?? null
    setResposta(null)
    void mandar(atual, { texto: t, respostaA: r })
    campo.current?.focus({ preventScroll: true })
  }

  async function enviarPrint(f: File) {
    if (!atual || enviandoPrint) return
    setEnviandoPrint(true); setErro('')
    try {
      const caminho = await api.enviarPrint(atual, f)
      const legenda = texto.trim()
      setTexto('')
      const r = resposta?.id ?? null
      setResposta(null)
      await mandar(atual, { texto: legenda, anexo: caminho, respostaA: r })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui enviar a imagem agora.')
    } finally { setEnviandoPrint(false) }
  }

  const colar = (e: React.ClipboardEvent) => {
    const img = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'))
    if (img) { e.preventDefault(); void enviarPrint(img) }
  }

  async function apagar(m: MensagemEq) {
    setConfirmarApagar(null); setSelecionada(null)
    try {
      await api.apagar(m.id)
      setMsgs((t) => ({ ...t, [m.conversaId]: (t[m.conversaId] ?? []).map((x) => (x.id === m.id ? { ...x, apagada: true, texto: '', anexo: null } : x)) }))
      setConversas((l) => l.map((c) => (c.id === m.conversaId && c.ultimaEm === m.criadaEm ? { ...c, ultimaTexto: null } : c)))
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não consegui apagar agora.') }
  }

  async function abrirComContato(c: Contato) {
    const existente = conversas.find((x) => x.tipo === 'direta' && outroDaDireta(x, eu) === c.id)
    if (existente) { setAtual(existente.id); return }
    setAbrindoContato(c.id)
    try {
      const id = await api.direta(c.id)
      const l = await api.conversas()
      setConversas(l); setAtual(id)
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não consegui abrir a conversa.') } finally { setAbrindoContato(null) }
  }

  // ------------------------------------------------ a lista da esquerda
  interface Linha { chave: string; conversa: ConversaEq | null; contato: Contato | null; nome: string; previa: string; quando: string | null; naoLidas: number; online?: boolean }
  const linhas: Linha[] = useMemo(() => {
    const out: Linha[] = []
    const doGrupo = conversas.find((c) => c.id === grupo)
    const previa = (c: ConversaEq | undefined | null, grupoTambem: boolean) => {
      if (!c?.ultimaEm) return grupoTambem ? 'Todos os administradores' : 'Comece a conversa'
      if (c.ultimaTexto == null) return 'Mensagem apagada'
      const quem = c.ultimaAutor === eu ? 'Você' : grupoTambem ? primeiroNome(nomeDe(c.ultimaAutor)) : ''
      return quem ? `${quem}: ${c.ultimaTexto}` : c.ultimaTexto
    }
    if (grupo) out.push({ chave: grupo, conversa: doGrupo ?? null, contato: null, nome: nomeDoGrupo, previa: previa(doGrupo, true), quando: doGrupo?.ultimaEm ?? null, naoLidas: naoLidas[grupo] ?? 0 })
    const diretas = contatos.filter((c) => c.id !== eu).map((c) => {
      const conv = conversas.find((x) => x.tipo === 'direta' && outroDaDireta(x, eu) === c.id) ?? null
      return { chave: conv?.id ?? `contato-${c.id}`, conversa: conv, contato: c, nome: c.nome, previa: previa(conv, false), quando: conv?.ultimaEm ?? null, naoLidas: conv ? naoLidas[conv.id] ?? 0 : 0, online: estaOnline(c, agora) }
    })
    diretas.sort((a, b) => (b.quando ? Date.parse(b.quando) : 0) - (a.quando ? Date.parse(a.quando) : 0) || a.nome.localeCompare(b.nome, 'pt-BR'))
    return [...out, ...diretas]
  }, [conversas, contatos, grupo, naoLidas, eu, agora, nomeDe, nomeDoGrupo])

  // ------------------------------------------------ botão flutuante
  if (escondido && !aberto) return null
  if (!pronto && !aberto) return null

  const conversa = conversas.find((c) => c.id === atual)
  const ehGrupo = !!conversa && conversa.tipo === 'grupo'
  const outro = conversa && !ehGrupo ? porId.get(outroDaDireta(conversa, eu) ?? '') : undefined
  const tituloDaConversa = ehGrupo ? nomeDoGrupo : outro?.nome ?? ''
  const membros = contatos.map((c) => (c.id === eu ? 'Você' : primeiroNome(c.nome)))
  const onlineNoGrupo = contatos.filter((c) => c.id !== eu && estaOnline(c, agora)).length

  const lancador = (
    <div className={`eq-lancador-area ${aberto ? 'aberto' : ''}`}>
      {aviso && !aberto && (
        <button type="button" className="eq-aviso" onClick={() => abrirChat(aviso.conversaId)}>
          <Avatar nome={nomeDe(aviso.autor)} id={aviso.autor} tamanho={34} />
          <span>
            <b>{nomeDe(aviso.autor)}{aviso.conversaId === grupo && <small> · {nomeDoGrupo}</small>}</b>
            <em>{aviso.texto}</em>
          </span>
        </button>
      )}
      <button type="button" className="eq-lancador" onClick={() => (aberto ? setAberto(false) : abrirChat())}
        aria-expanded={aberto} aria-label={`Chat da equipe${totalNaoLidas ? `: ${totalNaoLidas} não lidas` : ''}`}>
        <span className="eq-lancador-rotulo">{totalNaoLidas ? `${totalNaoLidas} não ${totalNaoLidas === 1 ? 'lida' : 'lidas'}` : 'Chat da equipe'}</span>
        <span className="eq-lancador-circulo"><Ic d={aberto ? I.baixo : I.conversa} /></span>
        {!aberto && totalNaoLidas > 0 && <b className="eq-selo" aria-hidden="true">{totalNaoLidas > 9 ? '9+' : totalNaoLidas}</b>}
      </button>
    </div>
  )
  if (!aberto) return lancador

  // ------------------------------------------------ a janela
  let diaAnterior = ''
  const msgPorId = new Map((mensagens ?? []).map((m) => [m.id, m]))

  return (
    <>
      {lancador}
      <div ref={painel} className={`eq-painel ${atual ? 'com-conversa' : 'so-lista'}`} role="dialog" aria-modal="false" aria-label="Chat da equipe">
        {/* ---------- conversas ---------- */}
        <aside className="eq-lado">
          <header className="eq-lado-cabeca">
            <span>
              <b>Chat da equipe</b>
              <small><Ic d={I.cadeado} />Só administradores · {contatos.length} {contatos.length === 1 ? 'pessoa' : 'pessoas'}</small>
            </span>
            <button type="button" className="eq-icone-btn" onClick={() => setAberto(false)} aria-label="Fechar o chat"><Ic d={I.fechar} /></button>
          </header>
          {!pronto ? (
            <div className="eq-vazio">{erroGeral ? <><p>{erroGeral}</p><button type="button" className="eq-btn" onClick={() => void sincronizar()}>Tentar de novo</button></> : <div className="eq-carregando"><i /><i /><i /></div>}</div>
          ) : (
            <nav className="eq-conversas" aria-label="Conversas">
              {linhas.map((l) => {
                const ativa = !!l.conversa && l.conversa.id === atual
                const grupoDaLinha = l.chave === grupo
                return (
                  <button key={l.chave} type="button" className={`eq-linha ${ativa ? 'ativa' : ''} ${l.naoLidas ? 'nao-lida' : ''}`}
                    disabled={abrindoContato === l.contato?.id}
                    onClick={() => (l.conversa ? setAtual(l.conversa.id) : l.contato && void abrirComContato(l.contato))}>
                    <Avatar nome={l.nome} id={l.contato?.id ?? null} grupo={grupoDaLinha} online={grupoDaLinha ? undefined : l.online} />
                    <span className="eq-linha-meio">
                      <b>{l.nome}</b>
                      <small>{abrindoContato === l.contato?.id ? 'Abrindo…' : l.previa}</small>
                    </span>
                    <span className="eq-linha-fim">
                      <time>{quandoNaLista(l.quando)}</time>
                      {l.naoLidas > 0 && <i className="eq-linha-selo">{l.naoLidas > 99 ? '99+' : l.naoLidas}</i>}
                    </span>
                  </button>
                )
              })}
            </nav>
          )}
        </aside>

        {/* ---------- a conversa ---------- */}
        <section className="eq-conversa" aria-label={tituloDaConversa || 'Conversa'}>
          {!conversa ? (
            <div className="eq-boas-vindas">
              <Monograma variante="marca-dagua" tamanho={150} />
              <b>Chat da equipe {MARCA.prosa}</b>
              <p>Converse com os administradores da plataforma. Cliente nenhum vê este chat.</p>
            </div>
          ) : (
            <>
              <header className="eq-cabeca">
                <button type="button" className="eq-icone-btn eq-voltar" onClick={() => setAtual(null)} aria-label="Voltar para as conversas"><Ic d={I.voltar} /></button>
                <Avatar nome={tituloDaConversa} id={outro?.id ?? null} grupo={ehGrupo} tamanho={38} online={ehGrupo ? undefined : estaOnline(outro, agora)} />
                <span className="eq-cabeca-nome">
                  <b>{tituloDaConversa}</b>
                  <small className={!ehGrupo && estaOnline(outro, agora) ? 'online' : ''}>
                    {ehGrupo ? `${membros.join(', ')}${onlineNoGrupo ? ` · ${onlineNoGrupo} online` : ''}` : situacaoDoContato(outro, agora)}
                  </small>
                </span>
                <button type="button" className="eq-icone-btn eq-fechar-cel" onClick={() => setAberto(false)} aria-label="Fechar o chat"><Ic d={I.fechar} /></button>
              </header>

              <div className="eq-mensagens" ref={lista} onScroll={aoRolar} aria-live="polite">
                {!mensagens ? <div className="eq-carregando"><i /><i /><i /></div> : (
                  <>
                    {temMais[atual!] && (
                      <button type="button" className="eq-antigas" onClick={() => void carregarAntigas()} disabled={carregandoAntigas}>
                        {carregandoAntigas ? 'Carregando…' : 'Ver mensagens anteriores'}
                      </button>
                    )}
                    {!mensagens.length && (
                      <div className="eq-primeira">
                        <Ic d={I.cadeado} />
                        <p>{ehGrupo ? 'Este é o grupo de todos os administradores. O que for escrito aqui, a equipe toda vê.' : `Conversa só entre você e ${primeiroNome(tituloDaConversa)}.`}</p>
                      </div>
                    )}
                    {mensagens.map((m, i) => {
                      const dia = diaDaMensagem(m.criadaEm)
                      const separador = dia !== diaAnterior ? <div className="eq-dia" key={`d-${m.id}`}><span>{dia}</span></div> : null
                      diaAnterior = dia
                      const minha = m.autor === eu
                      const anterior = mensagens[i - 1]
                      // mesma pessoa em sequência: um balão colado no outro, nome só no primeiro
                      const emSequencia = !separador && anterior && anterior.autor === m.autor && Date.parse(m.criadaEm) - Date.parse(anterior.criadaEm) < 5 * 60_000
                      const citada = m.respostaA ? msgPorId.get(m.respostaA) : null
                      const lida = minha && !m.enviando && !m.falhou && lidaPorTodos(m, conversa, eu)
                      return [
                        separador,
                        <div key={m.id} data-id={m.id}
                          className={`eq-msg ${minha ? 'minha' : 'dele'} ${emSequencia ? 'seguida' : ''} ${m.falhou ? 'falhou' : ''} ${selecionada === m.id ? 'selecionada' : ''}`}>
                          {!minha && ehGrupo && (emSequencia ? <span className="eq-msg-avatar-vazio" /> : <Avatar nome={nomeDe(m.autor)} id={m.autor} tamanho={28} />)}
                          <div className="eq-balao" style={{ ['--tom' as string]: tomDe(m.autor) }}
                            onClick={() => toque() && !m.apagada && setSelecionada((s) => (s === m.id ? null : m.id))}>
                            {!minha && ehGrupo && !emSequencia && <span className="eq-msg-nome">{nomeDe(m.autor)}</span>}
                            {m.apagada ? <p className="eq-apagada"><Ic d={I.lixo} />Mensagem apagada</p> : (
                              <>
                                {m.respostaA && (
                                  <button type="button" className="eq-citada" style={{ ['--tom' as string]: tomDe(citada?.autor ?? null) }}
                                    onClick={(e) => { e.stopPropagation(); lista.current?.querySelector(`[data-id="${m.respostaA}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}>
                                    <b>{citada ? (citada.autor === eu ? 'Você' : nomeDe(citada.autor)) : 'Mensagem'}</b>
                                    <span>{citada ? (citada.apagada ? 'Mensagem apagada' : citada.texto || 'Imagem') : 'Mensagem mais antiga'}</span>
                                  </button>
                                )}
                                {m.anexo && <Print api={api} caminho={m.anexo} aoAmpliar={setAmpliada} />}
                                {m.texto && <p>{m.texto}</p>}
                              </>
                            )}
                            <span className="eq-msg-hora">
                              {m.falhou ? <>Não foi <button type="button" onClick={(e) => { e.stopPropagation(); void mandar(m.conversaId, m, m) }}>Tentar de novo</button></> : horaCurta(m.criadaEm)}
                              {minha && !m.falhou && !m.apagada && (m.enviando
                                ? <Ic d={I.relogio} className="eq-tique" />
                                : <Ic d={lida ? I.visto : I.enviada} className={`eq-tique ${lida ? 'lida' : ''}`} />)}
                            </span>
                          </div>
                          {!m.apagada && !m.enviando && !m.falhou && (
                            <span className="eq-acoes">
                              {confirmarApagar === m.id ? (
                                <span className="eq-confirma">
                                  <button type="button" className="perigo" onClick={() => void apagar(m)}>Apagar para todos</button>
                                  <button type="button" onClick={() => setConfirmarApagar(null)}>Cancelar</button>
                                </span>
                              ) : (
                                <>
                                  <button type="button" onClick={() => { setResposta(m); setSelecionada(null); campo.current?.focus() }} aria-label="Responder" title="Responder"><Ic d={I.responder} /></button>
                                  {minha && <button type="button" onClick={() => setConfirmarApagar(m.id)} aria-label="Apagar" title="Apagar"><Ic d={I.lixo} /></button>}
                                </>
                              )}
                            </span>
                          )}
                        </div>,
                      ]
                    })}
                  </>
                )}
              </div>
              {longeDoFim && <button type="button" className="eq-descer" onClick={descer} aria-label="Ir para a última mensagem"><Ic d={I.baixo} /></button>}

              {erro && <p className="eq-erro" role="alert">{erro}</p>}
              {resposta && (
                <div className="eq-respondendo" style={{ ['--tom' as string]: tomDe(resposta.autor) }}>
                  <Ic d={I.responder} />
                  <span><b>Respondendo {resposta.autor === eu ? 'a você' : primeiroNome(nomeDe(resposta.autor))}</b><em>{resposta.texto || 'Imagem'}</em></span>
                  <button type="button" className="eq-icone-btn" onClick={() => setResposta(null)} aria-label="Cancelar a resposta"><Ic d={I.fechar} /></button>
                </div>
              )}
              <div className="eq-escrever">
                <button type="button" className="eq-icone-btn" onClick={() => arquivo.current?.click()} disabled={enviandoPrint} aria-label="Mandar imagem" title="Mandar imagem (ou cole o print)">
                  {enviandoPrint ? <span className="eq-girando" /> : <Ic d={I.clipe} />}
                </button>
                <input ref={arquivo} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void enviarPrint(f) }} />
                <textarea id="eq-campo" ref={campo} rows={1} value={texto} placeholder={ehGrupo ? 'Mensagem para a equipe' : `Mensagem para ${primeiroNome(tituloDaConversa)}`}
                  onChange={(e) => setTexto(e.target.value)} onPaste={colar} maxLength={4000}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !toque()) { e.preventDefault(); enviarTexto() } }} />
                <button type="button" className="eq-enviar" onClick={enviarTexto} disabled={!texto.trim()} aria-label="Enviar"><Ic d={I.enviar} /></button>
              </div>
            </>
          )}
        </section>
      </div>
      {ampliada && <button type="button" className="eq-ampliada" onClick={() => setAmpliada(null)} aria-label="Fechar a imagem"><img src={ampliada} alt="" /></button>}
    </>
  )
}

/** No site: o chat falando com o banco, com o login de quem está vendo. */
export function ChatDaEquipeDoBanco({ sessao, escondido }: { sessao: SessaoTeeds; escondido?: boolean }) {
  const api = useMemo(() => equipeDoBanco(sessao), [sessao.token, sessao.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return <ChatDaEquipe api={api} escondido={escondido} />
}
