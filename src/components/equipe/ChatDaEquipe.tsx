import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import {
  diaDaMensagem, duracaoCurta, EDITAR_MS, equipeDoBanco, estaOnline, guardar, horaCurta, lerGuardado, lidaPorTodos, outroDaDireta,
  POR_PAGINA, primeiroNome, quandoNaLista, quemLeu, situacaoDoContato,
  type Contato, type ConversaEq, type EnvioEq, type EquipeApi, type MensagemEq, type Midia, type MudancaEq, type SinalEq,
} from '../../core/teeds/equipe'
import { ativarNotificacoes, estadoDasNotificacoes, type EstadoDasNotificacoes } from '../../core/teeds/notificacoes'
import { Monograma } from '../marca/Monograma'
import { MARCA } from '../../marca'
import { useGravador, gravaAudio, MAXIMO_DE_AUDIO_S, type Gravacao } from './gravador'
import { Avatar, Balao, I, Ic, MenuDaMensagem, OndaAoVivo, toque, vibrar, Visualizador, type AcoesDoBalao, type ItemDoMenu } from './partes'
import './chat-da-equipe.css'

/**
 * O chat da equipe: o "WhatsApp" dos administradores (27/10/2026; nível
 * WhatsApp em 17/11/2026, Tiago: "facil de abrir, sem bug, sem lentidão,
 * responsividade, ux/ui de app nativo whatsapp. surpreenda-me").
 *
 * - Abre na hora: o que já foi visto fica guardado no aparelho e o banco
 *   atualiza por trás. Fotos e áudios ficam guardados depois da 1ª vez.
 * - Celular: tela cheia, a lista e a conversa deslizam como num app; o botão
 *   voltar do Android (e o gesto da borda) volta da conversa para a lista e
 *   da lista para a plataforma. Arrastar o balão para a direita responde;
 *   segurar abre reações e o menu. Segurar o microfone grava (arrastar para a
 *   esquerda cancela, para cima trava).
 * - Computador: janela de duas colunas; Enter manda, Shift+Enter quebra a
 *   linha, colar ou arrastar uma imagem abre a prévia com legenda.
 * - Ao vivo: mensagens, leituras (os tiques azuis), reações, edições e o
 *   "digitando…". Cada mensagem vira notificação no celular de quem não está
 *   com a conversa aberta, e tocar nela abre a conversa.
 * - Sem som (os sons da plataforma são só os três da operação).
 */

interface Props {
  api: EquipeApi
  /** Esconde o botão (sala de treino, que tem o chat dela). */
  escondido?: boolean
  /** As notificações do aparelho (no laboratório não tem). */
  notificacoes?: { estado: () => Promise<EstadoDasNotificacoes>; ativar: () => Promise<void> }
}

interface Aviso { conversaId: string; autor: string | null; texto: string }
interface MenuAberto { m: MensagemEq; ancora: DOMRect; so?: 'reacoes' }
interface Previa { arquivo: File; url: string }

const celular = () => typeof matchMedia === 'function' && matchMedia('(max-width: 720px)').matches
const visivel = () => typeof document === 'undefined' || document.visibilityState === 'visible'
const novoId = () => crypto.randomUUID()
const SINAL_MS = 5000

/** Junta o que já está na tela com o que chegou. O id é o mesmo na cópia otimista e na real. */
function juntar(atuais: MensagemEq[], novas: MensagemEq[]): MensagemEq[] {
  const porId = new Map<string, MensagemEq>()
  for (const m of atuais) porId.set(m.id, m)
  for (const m of novas) {
    const antes = porId.get(m.id)
    // a foto ou o áudio do aparelho continuam na tela (sem piscar quando a real chega)
    porId.set(m.id, antes?.local && !m.local ? { ...m, local: antes.local } : m)
  }
  return [...porId.values()].sort((a, b) => Date.parse(a.criadaEm) - Date.parse(b.criadaEm))
}

const previaDe = (m: Pick<MensagemEq, 'texto' | 'anexo' | 'midia' | 'apagada'>): string | null => {
  if (m.apagada) return null
  if (m.midia?.tipo === 'audio') return `🎤 Mensagem de voz (${duracaoCurta(m.midia.duracao)})`
  if (m.anexo || m.midia?.tipo === 'imagem') return m.texto ? `📷 ${m.texto}` : '📷 Foto'
  return m.texto
}

export function ChatDaEquipe({ api, escondido = false, notificacoes }: Props) {
  const eu = api.euId
  const guardado = useMemo(() => lerGuardado(eu), [eu])
  const [pronto, setPronto] = useState(!!guardado)
  const [erroGeral, setErroGeral] = useState('')
  const [grupo, setGrupo] = useState(guardado?.grupo ?? '')
  const [contatos, setContatos] = useState<Contato[]>(guardado?.contatos ?? [])
  const [conversas, setConversas] = useState<ConversaEq[]>(guardado?.conversas ?? [])
  const [naoLidas, setNaoLidas] = useState<Record<string, number>>(guardado?.naoLidas ?? {})
  const [msgs, setMsgs] = useState<Record<string, MensagemEq[]>>(guardado?.msgs ?? {})
  const [temMais, setTemMais] = useState<Record<string, boolean>>({})
  const [aberto, setAberto] = useState(false)
  const [atual, setAtual] = useState<string | null>(null)
  const rascunhos = useRef<Record<string, string>>(guardado?.rascunhos ?? {})
  const [resposta, setResposta] = useState<MensagemEq | null>(null)
  const [editando, setEditando] = useState<MensagemEq | null>(null)
  const [menu, setMenu] = useState<MenuAberto | null>(null)
  const [apagando, setApagando] = useState<MensagemEq | null>(null)
  const [ampliada, setAmpliada] = useState<{ url: string; m: MensagemEq } | null>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [nota, setNota] = useState('')
  const [abrindoContato, setAbrindoContato] = useState<string | null>(null)
  const [carregandoAntigas, setCarregandoAntigas] = useState(false)
  const [agora, setAgora] = useState(() => Date.now())
  const [longeDoFim, setLongeDoFim] = useState(false)
  const [novasAbaixo, setNovasAbaixo] = useState(0)
  const [divisor, setDivisor] = useState<{ conversaId: string; desde: string } | null>(null)
  const [destaque, setDestaque] = useState<string | null>(null)
  const [sinais, setSinais] = useState<Record<string, Record<string, { tipo: SinalEq['tipo']; ate: number }>>>({})
  const [estadoNotif, setEstadoNotif] = useState<EstadoDasNotificacoes | null>(null)
  const [ativandoNotif, setAtivandoNotif] = useState(false)
  const [arrastandoArquivo, setArrastandoArquivo] = useState(false)
  const [voltarArrasto, setVoltarArrasto] = useState(0)
  // conexão: "Conectando…" no alto, como o WhatsApp; sem internet, um aviso acima do campo
  const [conexao, setConexao] = useState<'ok' | 'conectando' | 'offline'>(() => (typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'ok'))
  const quedaRef = useRef<number | null>(null)
  // a busca (nomes na lista e o texto de todas as conversas, no banco)
  const [busca, setBusca] = useState('')
  const [achadas, setAchadas] = useState<MensagemEq[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const campoBusca = useRef<HTMLInputElement>(null)
  const irDepois = useRef<{ conversaId: string; id: string; criadaEm: string } | null>(null)
  // onde cada conversa estava rolada, e desde quando esta está aberta (as mensagens novas entram animadas)
  const posicoes = useRef<Record<string, number>>({})
  const abertaEm = useRef(Date.now())
  // computador: a janela do canto ou a tela inteira, como o WhatsApp Web (fica lembrado neste navegador)
  const [telaCheia, setTelaCheia] = useState(() => { try { return localStorage.getItem(`${MARCA.id}.equipe.telaCheia`) === '1' } catch { return false } })
  const alternarTelaCheia = () => setTelaCheia((v) => {
    try { localStorage.setItem(`${MARCA.id}.equipe.telaCheia`, v ? '0' : '1') } catch { /* sem armazenamento */ }
    return !v
  })

  const painel = useRef<HTMLDivElement>(null)
  const lista = useRef<HTMLDivElement>(null)
  const linhaDivisor = useRef<HTMLDivElement>(null)
  const sinalizador = useRef<ReturnType<EquipeApi['sinais']> | null>(null)
  const vistaAnterior = useRef<string | null>(null)
  if (atual) vistaAnterior.current = atual
  // o que os ouvintes do Realtime precisam ler sem refazer a assinatura
  const estado = useRef({ aberto, atual, conversas, msgs })
  estado.current = { aberto, atual, conversas, msgs }

  const porId = useMemo(() => new Map(contatos.map((c) => [c.id, c])), [contatos])
  const nomeDe = useCallback((id: string | null) => (id && porId.get(id)?.nome) || 'Alguém da equipe', [porId])
  // o primeiro nome; com dois "Victor" na equipe, vai a inicial do sobrenome junto ("Victor C.", "Victor D.")
  const curto = useCallback((id: string | null) => {
    const nome = nomeDe(id)
    const p = primeiroNome(nome)
    const repetido = contatos.some((c) => c.id !== id && primeiroNome(c.nome).toLowerCase() === p.toLowerCase())
    const partes = nome.trim().split(/\s+/)
    return repetido && partes.length > 1 ? `${p} ${partes[1][0].toUpperCase()}.` : p
  }, [contatos, nomeDe])
  const totalNaoLidas = Object.values(naoLidas).reduce((s, n) => s + n, 0)
  const nomeDoGrupo = `Equipe ${MARCA.prosa}`
  const avisar = useCallback((t: string) => setNota(t), [])
  useEffect(() => { if (!nota) return; const t = window.setTimeout(() => setNota(''), 2600); return () => window.clearTimeout(t) }, [nota])

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
    if (!erroGeral) return
    const t = window.setTimeout(() => void sincronizar(), 30_000)
    return () => window.clearTimeout(t)
  }, [erroGeral, sincronizar])

  // o que está na tela fica guardado no aparelho (abre na hora da próxima vez)
  useEffect(() => {
    if (!pronto || !grupo) return
    const t = window.setTimeout(() => guardar(eu, { grupo, contatos, conversas, naoLidas, msgs, rascunhos: rascunhos.current }), 900)
    return () => window.clearTimeout(t)
  }, [pronto, eu, grupo, contatos, conversas, naoLidas, msgs])
  useEffect(() => {
    const sair = () => { if (grupo) guardar(eu, { grupo, contatos, conversas, naoLidas, msgs, rascunhos: rascunhos.current }) }
    window.addEventListener('pagehide', sair)
    return () => window.removeEventListener('pagehide', sair)
  }, [eu, grupo, contatos, conversas, naoLidas, msgs])

  // "online agora" e "vendo esta conversa" (quem está vendo não recebe a notificação dela)
  const vendo = aberto && atual ? atual : null
  const vendoRef = useRef(vendo)
  vendoRef.current = vendo
  useEffect(() => { if (pronto && visivel()) void api.estouAqui(vendo) }, [pronto, vendo, api])
  useEffect(() => {
    if (!pronto) return
    const bater = () => {
      setAgora(Date.now())
      if (!visivel()) return
      void api.estouAqui(vendoRef.current)
      api.contatos().then(setContatos).catch(() => undefined)
    }
    const t = window.setInterval(bater, 60_000)
    const aoMudarVisibilidade = () => { if (visivel()) bater(); else void api.estouAqui(null, true) }
    const aoSair = () => void api.estouAqui(null, true)
    document.addEventListener('visibilitychange', aoMudarVisibilidade)
    window.addEventListener('pagehide', aoSair)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', aoMudarVisibilidade); window.removeEventListener('pagehide', aoSair) }
  }, [pronto, api])

  // ------------------------------------------------ lidas
  const fecharNotificacoesDa = (conversaId: string) => {
    try { navigator.serviceWorker?.controller?.postMessage({ tipo: 'equipe-lida', conversa: conversaId }) } catch { /* sem service worker */ }
  }
  const marcarLida = useCallback((conversaId: string) => {
    setNaoLidas((n) => (n[conversaId] ? { ...n, [conversaId]: 0 } : n))
    fecharNotificacoesDa(conversaId)
    void api.ler(conversaId).catch(() => undefined)
  }, [api])

  // o número no ícone do app, como no WhatsApp
  useEffect(() => {
    if (!pronto) return
    const n = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    try { if (totalNaoLidas) void n.setAppBadge?.(totalNaoLidas).catch(() => undefined); else void n.clearAppBadge?.().catch(() => undefined) } catch { /* sem suporte */ }
  }, [pronto, totalNaoLidas])

  // ------------------------------------------------ ao vivo
  const reenviarFalhas = useRef<() => void>(() => undefined)
  useEffect(() => {
    if (!pronto) return
    let caiu = false
    const aoMudar = (m: MudancaEq) => {
      const { aberto: ab, atual: at, conversas: cs } = estado.current
      if (m.tipo === 'mensagem') {
        const x = m.item
        setMsgs((t) => (t[x.conversaId] ? { ...t, [x.conversaId]: juntar(t[x.conversaId], [x]) } : t))
        if (!m.nova) {
          // editada ou apagada: a prévia da lista acompanha
          setConversas((l) => l.map((c) => (c.id === x.conversaId && c.ultimaEm === x.criadaEm ? { ...c, ultimaTexto: previaDe(x) } : c)))
          return
        }
        if (!cs.some((c) => c.id === x.conversaId)) api.conversas().then(setConversas).catch(() => undefined)
        setConversas((l) => l.map((c) => (c.id === x.conversaId ? { ...c, ultimaEm: x.criadaEm, ultimaTexto: previaDe(x), ultimaAutor: x.autor } : c)))
        // quem mandou parou de digitar
        setSinais((s) => (s[x.conversaId]?.[x.autor ?? ''] ? { ...s, [x.conversaId]: Object.fromEntries(Object.entries(s[x.conversaId]).filter(([u]) => u !== x.autor)) } : s))
        if (x.autor === eu) return
        if (ab && at === x.conversaId && visivel()) {
          marcarLida(x.conversaId)
          if (lista.current && -lista.current.scrollTop > 200) setNovasAbaixo((n) => n + 1)
          return
        }
        setNaoLidas((n) => ({ ...n, [x.conversaId]: (n[x.conversaId] ?? 0) + 1 }))
        if (!(ab && at === x.conversaId)) setAviso({ conversaId: x.conversaId, autor: x.autor, texto: previaDe(x) || 'Mensagem' })
      } else if (m.tipo === 'leitura') {
        setConversas((l) => l.map((c) => (c.id !== m.conversaId ? c : {
          ...c,
          participantes: c.participantes.some((p) => p.userId === m.userId)
            ? c.participantes.map((p) => (p.userId === m.userId ? { ...p, lidaEm: m.lidaEm } : p))
            : [...c.participantes, { userId: m.userId, lidaEm: m.lidaEm }],
        })))
        // li no celular: o computador também zera (e a notificação some)
        if (m.userId === eu) { setNaoLidas((n) => (n[m.conversaId] ? { ...n, [m.conversaId]: 0 } : n)); fecharNotificacoesDa(m.conversaId) }
      } else if (m.tipo === 'conversa') {
        if (!cs.some((c) => c.id === m.item.id)) { api.conversas().then(setConversas).catch(() => undefined); return }
        setConversas((l) => l.map((c) => (c.id === m.item.id ? { ...c, ...m.item } : c)))
      }
    }
    const parar = api.acompanhar(aoMudar, (vivo) => {
      if (quedaRef.current) { window.clearTimeout(quedaRef.current); quedaRef.current = null }
      if (!vivo) {
        caiu = true
        // só mostra "Conectando…" se demorar: uma piscada de rede não vira aviso
        quedaRef.current = window.setTimeout(() => setConexao(navigator.onLine === false ? 'offline' : 'conectando'), 1800)
        return
      }
      setConexao('ok')
      // voltou depois de cair: busca o que passou enquanto estava fora e manda o que ficou preso
      if (caiu) {
        caiu = false
        void sincronizar()
        const at = estado.current.atual
        if (at) api.mensagens(at).then((l) => setMsgs((t) => ({ ...t, [at]: juntar(t[at] ?? [], l) }))).catch(() => undefined)
        reenviarFalhas.current()
      }
    })
    return parar
  }, [pronto, api, eu, marcarLida, sincronizar])

  // "digitando…"
  useEffect(() => {
    if (!pronto) return
    const s = api.sinais((x) => {
      setSinais((t) => {
        const daConversa = { ...(t[x.conversaId] ?? {}) }
        if (x.tipo === 'parou') delete daConversa[x.userId]
        else daConversa[x.userId] = { tipo: x.tipo, ate: Date.now() + SINAL_MS }
        return { ...t, [x.conversaId]: daConversa }
      })
    })
    sinalizador.current = s
    return () => { s.parar(); sinalizador.current = null }
  }, [pronto, api])
  const temSinal = Object.values(sinais).some((c) => Object.keys(c).length)
  useEffect(() => {
    if (!temSinal) return
    const t = window.setInterval(() => {
      const agoraMs = Date.now()
      setSinais((s) => {
        let mudou = false
        const out: typeof s = {}
        for (const [c, us] of Object.entries(s)) {
          const vivos = Object.fromEntries(Object.entries(us).filter(([, v]) => v.ate > agoraMs))
          if (Object.keys(vivos).length !== Object.keys(us).length) mudou = true
          if (Object.keys(vivos).length) out[c] = vivos
        }
        return mudou ? out : s
      })
    }, 1000)
    return () => window.clearInterval(t)
  }, [temSinal])
  const ultimoSinal = useRef(0)
  const sinalizar = useCallback((tipo: SinalEq['tipo'], conversaId: string | null) => {
    if (!conversaId) return
    if (tipo !== 'parou' && Date.now() - ultimoSinal.current < 2500) return
    ultimoSinal.current = tipo === 'parou' ? 0 : Date.now()
    sinalizador.current?.mandar(tipo, conversaId)
  }, [])
  const quemSinaliza = (conversaId: string | null): { texto: string; tipo: SinalEq['tipo'] } | null => {
    if (!conversaId) return null
    const us = Object.entries(sinais[conversaId] ?? {})
    if (!us.length) return null
    const conv = conversas.find((c) => c.id === conversaId)
    const gravando = us.some(([, v]) => v.tipo === 'gravando')
    const verbo = gravando ? 'gravando áudio…' : 'digitando…' // texto-ok: minúscula de propósito, é a linguagem do WhatsApp ("digitando…")
    if (conv?.tipo !== 'grupo') return { texto: verbo, tipo: gravando ? 'gravando' : 'digitando' }
    const nomes = us.map(([u]) => curto(u))
    return { texto: `${nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]} estão` : `${nomes[0]} está`} ${verbo}`, tipo: gravando ? 'gravando' : 'digitando' }
  }

  // ------------------------------------------------ voltar do celular (Android e gesto da borda)
  /*
    No celular o chat vira "telas" no histórico: eq 1 = lista, eq 2 = conversa. O voltar do
    aparelho sai da conversa para a lista e da lista para a plataforma, sem trocar a tela de
    baixo (o App ignora o voltar quando a tela dele não muda).
  */
  const nivel = () => ((history.state as { eq?: number } | null)?.eq ?? 0)
  const empurrar = (eq: number) => { try { history.pushState({ ...(history.state ?? {}), eq }, '') } catch { /* nada */ } }
  useEffect(() => {
    if (nivel()) { try { const { eq: _eq, ...resto } = history.state ?? {}; history.replaceState(resto, '') } catch { /* nada */ } }
    const aoVoltar = (e: PopStateEvent) => {
      const eq = (e.state as { eq?: number } | null)?.eq ?? 0
      const { aberto: ab } = estado.current
      if (!ab) return
      setMenu(null); setAmpliada(null); setPrevia(null)
      if (eq <= 0) setAberto(false)
      if (eq <= 1) setAtual((a) => (celular() ? null : a))
    }
    window.addEventListener('popstate', aoVoltar)
    return () => window.removeEventListener('popstate', aoVoltar)
  }, [])

  const abrirConversa = useCallback((id: string) => {
    if (celular() && nivel() === 1) empurrar(2)
    setAtual(id)
  }, [])
  const voltarParaLista = useCallback(() => {
    if (celular() && nivel() === 2) history.back()
    else setAtual(null)
  }, [])
  const fecharChat = useCallback(() => {
    const n = nivel()
    if (celular() && n > 0) history.go(-n)
    else setAberto(false)
  }, [])

  // no computador a janela já abre numa conversa (a com não lidas, ou a do grupo)
  const abrirChat = useCallback((conversaId?: string) => {
    setAviso(null)
    const cel = celular()
    if (!estado.current.aberto) {
      setAberto(true)
      if (cel) empurrar(1)
    }
    if (conversaId) {
      if (cel && nivel() === 1) empurrar(2)
      setAtual(conversaId)
    } else if (!estado.current.atual && !cel) {
      const comNaoLida = Object.entries(naoLidas).find(([, n]) => n > 0)?.[0]
      setAtual(comNaoLida ?? grupo ?? null)
    }
  }, [naoLidas, grupo])

  // tocou na notificação: abre a conversa (app aberto pelo service worker; app fechado pelo ?equipe=)
  const abrirChatRef = useRef(abrirChat)
  abrirChatRef.current = abrirChat
  useEffect(() => {
    const u = new URL(location.href)
    const pedida = u.searchParams.get('equipe')
    if (pedida) {
      u.searchParams.delete('equipe')
      history.replaceState(history.state, '', u.pathname + u.search + u.hash)
      if (/^[0-9a-f-]{36}$/i.test(pedida) || pedida.length < 40) window.setTimeout(() => abrirChatRef.current(pedida), 0)
    }
    const aoRecado = (e: MessageEvent) => { if (e.data?.tipo === 'equipe-abrir' && typeof e.data.conversa === 'string') abrirChatRef.current(e.data.conversa) }
    navigator.serviceWorker?.addEventListener('message', aoRecado)
    return () => navigator.serviceWorker?.removeEventListener('message', aoRecado)
  }, [])

  // ------------------------------------------------ a conversa aberta
  useEffect(() => {
    if (!aberto || !atual) return
    const conv = estado.current.conversas.find((c) => c.id === atual)
    const minhaLeitura = conv?.participantes.find((p) => p.userId === eu)?.lidaEm
    // "N mensagens não lidas": a linha fica onde parei de ler
    setDivisor((naoLidas[atual] ?? 0) > 0 && minhaLeitura ? { conversaId: atual, desde: minhaLeitura } : null)
    setNovasAbaixo(0); setLongeDoFim(false)
    abertaEm.current = Date.now()
    // mostra o guardado na hora e busca o mais novo por trás
    api.mensagens(atual)
      .then(async (l) => {
        setMsgs((t) => ({ ...t, [atual]: juntar(t[atual] ?? [], l) }))
        setTemMais((t) => ({ ...t, [atual]: l.length >= POR_PAGINA }))
        // veio da busca: garante a mensagem na tela e vai até ela
        const alvo = irDepois.current
        if (alvo && alvo.conversaId === atual) {
          irDepois.current = null
          if (!l.some((m) => m.id === alvo.id)) {
            const desde = await api.mensagensDesde(atual, alvo.criadaEm).catch(() => [] as MensagemEq[])
            setMsgs((t) => ({ ...t, [atual]: juntar(t[atual] ?? [], desde) }))
            setTemMais((t) => ({ ...t, [atual]: true }))
          }
          window.setTimeout(() => acoesAtuais.current?.irPara(alvo.id), 120)
        }
      })
      .catch((e) => { if (!estado.current.msgs[atual]) avisar(e instanceof Error ? e.message : 'Não consegui carregar as mensagens.') })
    if (visivel()) marcarLida(atual)
    setResposta(null); setEditando(null); setMenu(null)
  }, [aberto, atual]) // eslint-disable-line react-hooks/exhaustive-deps

  // cada conversa volta para onde estava (a não ser que tenha não lidas: aí vai para a linha delas)
  useLayoutEffect(() => {
    if (!aberto || !atual) return
    const l = lista.current
    const antes = posicoes.current[atual]
    if (l && antes && !(naoLidas[atual] ?? 0) && !irDepois.current) l.scrollTop = antes
    return () => { if (lista.current) posicoes.current[atual] = lista.current.scrollTop }
  }, [aberto, atual]) // eslint-disable-line react-hooks/exhaustive-deps

  // voltou para a aba com a conversa aberta: conta como lida
  useEffect(() => {
    if (!aberto || !atual) return
    const aoVoltar = () => { if (visivel() && naoLidas[atual]) marcarLida(atual) }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [aberto, atual, naoLidas, marcarLida])

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
      if (ampliada || menu || previa || apagando) return
      if (editando) setEditando(null)
      else if (resposta) setResposta(null)
      else if (!celular()) setAberto(false)
    }
    document.addEventListener('keydown', esc)
    return () => { raiz.classList.remove('eq-aberto'); vv?.removeEventListener('resize', ajustar); vv?.removeEventListener('scroll', ajustar); document.removeEventListener('keydown', esc) }
  }, [aberto, ampliada, resposta, editando, menu, previa, apagando])

  // atalhos do computador: Ctrl/Cmd+K busca; Alt+↑/↓ troca de conversa
  const ordemRef = useRef<string[]>([])
  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (celular()) setAtual(null)
        window.setTimeout(() => { campoBusca.current?.focus(); campoBusca.current?.select() }, 30)
      } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const ordem = ordemRef.current
        if (!ordem.length) return
        e.preventDefault()
        const i = estado.current.atual ? ordem.indexOf(estado.current.atual) : -1
        const prox = ordem[Math.min(ordem.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]
        if (prox) setAtual(prox)
      }
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aberto])

  // o recado do canto some sozinho
  useEffect(() => { if (!aviso) return; const t = window.setTimeout(() => setAviso(null), 7000); return () => window.clearTimeout(t) }, [aviso])

  // (3) na aba do navegador, como o WhatsApp Web
  useEffect(() => {
    const limpo = document.title.replace(/^\(\d+\+?\) /, '')
    document.title = totalNaoLidas ? `(${totalNaoLidas > 99 ? '99+' : totalNaoLidas}) ${limpo}` : limpo
  }, [totalNaoLidas])
  useEffect(() => () => { document.title = document.title.replace(/^\(\d+\+?\) /, '') }, [])

  // as notificações do aparelho (o convite aparece na lista enquanto estiverem desligadas)
  useEffect(() => {
    if (!aberto || !notificacoes) return
    notificacoes.estado().then(setEstadoNotif).catch(() => undefined)
  }, [aberto, notificacoes])

  // ------------------------------------------------ rolagem (de baixo para cima, como o WhatsApp)
  const mensagens = (atual && msgs[atual]) || null
  // a linha das não lidas: rola até ela na primeira vez
  useLayoutEffect(() => {
    if (divisor && divisor.conversaId === atual && linhaDivisor.current) linhaDivisor.current.scrollIntoView({ block: 'center' })
  }, [divisor, atual, !!mensagens]) // eslint-disable-line react-hooks/exhaustive-deps
  const aoRolar = () => {
    const l = lista.current; if (!l) return
    const longe = -l.scrollTop > 200
    if (longe !== longeDoFim) setLongeDoFim(longe)
    if (!longe && novasAbaixo) setNovasAbaixo(0)
    const doTopo = l.scrollHeight - l.clientHeight + l.scrollTop
    if (doTopo < 500 && atual && temMais[atual] && !carregandoAntigas) void carregarAntigas()
  }
  const descer = () => { const l = lista.current; if (l) l.scrollTo({ top: 0, behavior: 'smooth' }); setNovasAbaixo(0) }

  async function carregarAntigas() {
    if (!atual || !mensagens?.length) return
    setCarregandoAntigas(true)
    try {
      const antigas = await api.mensagens(atual, mensagens.find((m) => !m.enviando && !m.falhou)?.criadaEm)
      setTemMais((t) => ({ ...t, [atual]: antigas.length >= POR_PAGINA }))
      setMsgs((t) => ({ ...t, [atual]: juntar(t[atual] ?? [], antigas) }))
    } catch { /* tenta de novo ao rolar */ } finally { setCarregandoAntigas(false) }
  }

  const irPara = useCallback((id: string) => {
    const alvo = lista.current?.querySelector(`[data-id="${id}"]`)
    if (!alvo) { avisar('Essa mensagem é mais antiga. Role para cima para encontrá-la.'); return }
    alvo.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setDestaque(id)
    window.setTimeout(() => setDestaque((d) => (d === id ? null : d)), 1600)
  }, [avisar])

  // ------------------------------------------------ mandar
  const colocar = (conversaId: string, m: MensagemEq) => setMsgs((t) => ({ ...t, [conversaId]: juntar(t[conversaId] ?? [], [m]) }))
  const mudar = (conversaId: string, id: string, f: (m: MensagemEq) => MensagemEq) =>
    setMsgs((t) => ({ ...t, [conversaId]: (t[conversaId] ?? []).map((m) => (m.id === id ? f(m) : m)) }))

  const enviar = useCallback(async (m: MensagemEq) => {
    const conversaId = m.conversaId
    colocar(conversaId, { ...m, enviando: true, falhou: false })
    setConversas((l) => l.map((c) => (c.id === conversaId ? { ...c, ultimaEm: m.criadaEm, ultimaTexto: previaDe(m), ultimaAutor: eu } : c)))
    try {
      let anexo = m.anexo
      let midia: Midia | null = m.midia
      if (!anexo && m.arquivo) {
        if (m.midia?.tipo === 'audio') anexo = await api.enviarAudio(conversaId, m.arquivo)
        else { const r = await api.enviarPrint(conversaId, m.arquivo); anexo = r.caminho; midia = { tipo: 'imagem', l: r.l, a: r.a } }
        mudar(conversaId, m.id, (x) => ({ ...x, anexo, midia }))
      }
      const envio: EnvioEq = { id: m.id, texto: m.texto, anexo, midia, respostaA: m.respostaA }
      const real = await api.mandar(conversaId, envio)
      colocar(conversaId, { ...real, local: m.local })
    } catch {
      mudar(conversaId, m.id, (x) => ({ ...x, enviando: false, falhou: true }))
    }
  }, [api, eu]) // eslint-disable-line react-hooks/exhaustive-deps

  // o que não foi tenta de novo sozinho quando a rede volta
  reenviarFalhas.current = () => {
    for (const l of Object.values(estado.current.msgs)) for (const m of l) if (m.falhou) void enviar(m)
  }
  useEffect(() => {
    const voltou = () => { setConexao((c) => (c === 'offline' ? 'conectando' : c)); reenviarFalhas.current() }
    const caiu = () => setConexao('offline')
    window.addEventListener('online', voltou); window.addEventListener('offline', caiu)
    return () => { window.removeEventListener('online', voltou); window.removeEventListener('offline', caiu) }
  }, [])

  // a busca no banco (espera a pessoa parar de digitar)
  useEffect(() => {
    const t = busca.trim()
    if (t.length < 2) { setAchadas(null); setBuscando(false); return }
    setBuscando(true)
    let vivo = true
    const id = window.setTimeout(() => {
      api.buscar(t).then((l) => { if (vivo) setAchadas(l) }).catch(() => { if (vivo) setAchadas([]) }).finally(() => { if (vivo) setBuscando(false) })
    }, 280)
    return () => { vivo = false; window.clearTimeout(id) }
  }, [busca, api])

  const nova = (conversaId: string, extra: Partial<MensagemEq>): MensagemEq => ({
    id: novoId(), conversaId, autor: eu, texto: '', anexo: null, midia: null, respostaA: resposta?.id ?? null, apagada: false,
    criadaEm: new Date().toISOString(), reacoes: {}, editadaEm: null, ...extra,
  })
  const depoisDeMandar = (conversaId: string) => {
    setResposta(null); setDivisor(null); sinalizar('parou', conversaId)
    lista.current?.scrollTo({ top: 0 })
  }

  async function mandarTexto(t: string) {
    if (!atual) return
    const texto = t.trim()
    if (!texto) return
    if (editando) {
      const m = editando
      setEditando(null)
      if (texto === m.texto) return
      const antes = m.texto
      mudar(m.conversaId, m.id, (x) => ({ ...x, texto, editadaEm: new Date().toISOString() }))
      try { await api.editar(m.id, texto) } catch (e) {
        mudar(m.conversaId, m.id, (x) => ({ ...x, texto: antes, editadaEm: m.editadaEm }))
        avisar(e instanceof Error ? e.message : 'Não consegui editar agora.')
      }
      return
    }
    const m = nova(atual, { texto })
    depoisDeMandar(atual)
    void enviar(m)
  }

  async function mandarFoto(arquivo: File, legenda: string) {
    if (!atual) return
    const local = URL.createObjectURL(arquivo)
    let l = 0, a = 0
    try { const b = await createImageBitmap(arquivo); l = b.width; a = b.height; b.close?.() } catch { /* a medida vem da subida */ }
    const m = nova(atual, { texto: legenda.trim(), midia: { tipo: 'imagem', l, a }, local, arquivo })
    depoisDeMandar(atual)
    void enviar(m)
  }

  function mandarAudio(g: Gravacao) {
    if (!atual) return
    const m = nova(atual, { midia: { tipo: 'audio', duracao: g.duracao, ondas: g.ondas }, local: URL.createObjectURL(g.blob), arquivo: g.blob })
    depoisDeMandar(atual)
    void enviar(m)
  }

  const editarUltima = () => {
    const l = (atual && msgs[atual]) || []
    const m = [...l].reverse().find((x) => x.autor === eu && !x.apagada && !x.enviando && !x.falhou && x.texto && !x.midia && Date.now() - Date.parse(x.criadaEm) < EDITAR_MS)
    if (!m) return false
    setResposta(null); setEditando(m)
    return true
  }

  const abrirAchada = (m: MensagemEq) => {
    irDepois.current = { conversaId: m.conversaId, id: m.id, criadaEm: m.criadaEm }
    setBusca(''); setAchadas(null)
    if (atual === m.conversaId) { const a = irDepois.current; irDepois.current = null; if (msgs[m.conversaId]?.some((x) => x.id === m.id)) irPara(m.id); else { void api.mensagensDesde(m.conversaId, m.criadaEm).then((d) => { setMsgs((t) => ({ ...t, [m.conversaId]: juntar(t[m.conversaId] ?? [], d) })); window.setTimeout(() => irPara(a.id), 120) }) } return }
    abrirConversa(m.conversaId)
  }

  const escolherImagem = (f: File | undefined | null) => {
    if (!f) return
    if (!f.type.startsWith('image/') && !/\.hei[cf]$/i.test(f.name)) { avisar('Mande uma imagem (print da tela, JPG ou PNG).'); return }
    setPrevia({ arquivo: f, url: URL.createObjectURL(f) })
  }

  async function reagir(m: MensagemEq, emoji: string | null) {
    setMenu(null)
    const antes = m.reacoes
    const minha = antes[eu]
    const depois = { ...antes }
    if (!emoji || minha === emoji) delete depois[eu]; else depois[eu] = emoji
    mudar(m.conversaId, m.id, (x) => ({ ...x, reacoes: depois }))
    try { await api.reagir(m.id, emoji) } catch (e) {
      mudar(m.conversaId, m.id, (x) => ({ ...x, reacoes: antes }))
      avisar(e instanceof Error ? e.message : 'Não consegui reagir agora.')
    }
  }

  async function apagar(m: MensagemEq) {
    setApagando(null)
    const antes = m
    mudar(m.conversaId, m.id, (x) => ({ ...x, apagada: true, texto: '', anexo: null, midia: null, reacoes: {} }))
    try {
      await api.apagar(m.id)
      setConversas((l) => l.map((c) => (c.id === m.conversaId && c.ultimaEm === m.criadaEm ? { ...c, ultimaTexto: null } : c)))
    } catch (e) {
      colocar(m.conversaId, antes)
      avisar(e instanceof Error ? e.message : 'Não consegui apagar agora.')
    }
  }

  async function abrirComContato(c: Contato) {
    const existente = conversas.find((x) => x.tipo === 'direta' && outroDaDireta(x, eu) === c.id)
    if (existente) { abrirConversa(existente.id); return }
    setAbrindoContato(c.id)
    try {
      const id = await api.direta(c.id)
      const l = await api.conversas()
      setConversas(l); abrirConversa(id)
    } catch (e) { avisar(e instanceof Error ? e.message : 'Não consegui abrir a conversa.') } finally { setAbrindoContato(null) }
  }

  async function ligarNotificacoes() {
    if (!notificacoes) return
    setAtivandoNotif(true)
    try { await notificacoes.ativar(); setEstadoNotif('ligadas'); avisar('Pronto! Você vai ser avisado das mensagens da equipe.') } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não consegui ligar as notificações.')
      notificacoes.estado().then(setEstadoNotif).catch(() => undefined)
    } finally { setAtivandoNotif(false) }
  }

  // as ações dos balões (estáveis: o balão não redesenha a cada letra digitada)
  const acoesAtuais = useRef<AcoesDoBalao | null>(null)
  acoesAtuais.current = {
    menu: (m, el) => setMenu({ m, ancora: el.getBoundingClientRect() }),
    responder: (m) => { setEditando(null); setResposta(m); window.dispatchEvent(new Event('eq:focar')) },
    ampliar: (url, m) => setAmpliada({ url, m }),
    irPara,
    reenviar: (m) => void enviar(m),
    reagir: (m, e) => void reagir(m, e),
    verReacoes: (m, el) => setMenu({ m, ancora: el.getBoundingClientRect(), so: 'reacoes' }),
  }
  const acoes = useMemo<AcoesDoBalao>(() => ({
    menu: (m, el) => acoesAtuais.current!.menu(m, el),
    responder: (m) => acoesAtuais.current!.responder(m),
    ampliar: (u, m) => acoesAtuais.current!.ampliar(u, m),
    irPara: (id) => acoesAtuais.current!.irPara(id),
    reenviar: (m) => acoesAtuais.current!.reenviar(m),
    reagir: (m, e) => acoesAtuais.current!.reagir(m, e),
    verReacoes: (m, el) => acoesAtuais.current!.verReacoes(m, el),
  }), [])

  // ------------------------------------------------ a lista da esquerda
  interface Linha { chave: string; conversa: ConversaEq | null; contato: Contato | null; nome: string; previa: string; quando: string | null; naoLidas: number; online?: boolean; minhaUltima: boolean; lidaUltima: boolean }
  const linhas: Linha[] = useMemo(() => {
    const out: Linha[] = []
    const doGrupo = conversas.find((c) => c.id === grupo)
    const previa = (c: ConversaEq | undefined | null, grupoTambem: boolean) => {
      if (!c?.ultimaEm) return grupoTambem ? 'Todos os administradores' : 'Toque para conversar'
      if (c.ultimaTexto == null) return c.ultimaAutor === eu ? 'Você apagou esta mensagem' : 'Esta mensagem foi apagada'
      const quem = c.ultimaAutor === eu ? '' : grupoTambem ? curto(c.ultimaAutor) : ''
      return quem ? `${quem}: ${c.ultimaTexto}` : c.ultimaTexto
    }
    const leu = (c: ConversaEq | null | undefined) => !!c?.ultimaEm && c.ultimaAutor === eu && c.participantes.filter((p) => p.userId !== eu).every((p) => Date.parse(p.lidaEm) >= Date.parse(c.ultimaEm!))
    if (grupo) out.push({ chave: grupo, conversa: doGrupo ?? null, contato: null, nome: nomeDoGrupo, previa: previa(doGrupo, true), quando: doGrupo?.ultimaEm ?? null, naoLidas: naoLidas[grupo] ?? 0, minhaUltima: doGrupo?.ultimaAutor === eu && doGrupo?.ultimaTexto != null, lidaUltima: leu(doGrupo) })
    const diretas = contatos.filter((c) => c.id !== eu).map((c) => {
      const conv = conversas.find((x) => x.tipo === 'direta' && outroDaDireta(x, eu) === c.id) ?? null
      return { chave: conv?.id ?? `contato-${c.id}`, conversa: conv, contato: c, nome: c.nome, previa: previa(conv, false), quando: conv?.ultimaEm ?? null, naoLidas: conv ? naoLidas[conv.id] ?? 0 : 0, online: estaOnline(c, agora), minhaUltima: conv?.ultimaAutor === eu && conv?.ultimaTexto != null, lidaUltima: leu(conv) }
    })
    diretas.sort((a, b) => (b.quando ? Date.parse(b.quando) : 0) - (a.quando ? Date.parse(a.quando) : 0) || a.nome.localeCompare(b.nome, 'pt-BR'))
    return [...out, ...diretas]
  }, [conversas, contatos, grupo, naoLidas, eu, agora, nomeDe, nomeDoGrupo])

  ordemRef.current = linhas.map((l) => l.conversa?.id).filter((x): x is string => !!x)
  const termo = busca.trim().toLowerCase()
  const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const linhasVisiveis = termo ? linhas.filter((l) => semAcento(l.nome).includes(semAcento(termo))) : linhas

  // ------------------------------------------------ gesto da borda (voltar arrastando, no celular)
  const borda = useRef<{ x: number; id: number } | null>(null)
  const aoTocarBorda = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' || !celular() || e.clientX > 22) return
    borda.current = { x: e.clientX, id: e.pointerId }
  }
  const aoArrastarBorda = (e: React.PointerEvent) => {
    if (!borda.current || borda.current.id !== e.pointerId) return
    setVoltarArrasto(Math.max(0, e.clientX - borda.current.x))
  }
  const aoSoltarBorda = (e: React.PointerEvent) => {
    if (!borda.current || borda.current.id !== e.pointerId) return
    borda.current = null
    if (voltarArrasto > window.innerWidth * 0.33) voltarParaLista()
    setVoltarArrasto(0)
  }

  // ------------------------------------------------ botão flutuante
  if (escondido && !aberto) return null
  if (!pronto && !aberto) return null

  const vista = atual ?? (celular() ? vistaAnterior.current : null)
  const conversa = conversas.find((c) => c.id === vista)
  const ehGrupo = !!conversa && conversa.tipo === 'grupo'
  const outro = conversa && !ehGrupo ? porId.get(outroDaDireta(conversa, eu) ?? '') : undefined
  const tituloDaConversa = ehGrupo ? nomeDoGrupo : outro?.nome ?? ''
  const membros = contatos.map((c) => (c.id === eu ? 'Você' : curto(c.id)))
  const sinalDaConversa = quemSinaliza(vista)
  const mensagensDaVista = (vista && msgs[vista]) || null

  const lancador = (
    <div className={`eq-lancador-area ${aberto ? 'aberto' : ''}`}>
      {aviso && !aberto && (
        <button type="button" className="eq-aviso" onClick={() => abrirChat(aviso.conversaId)}>
          <Avatar nome={aviso.conversaId === grupo ? nomeDoGrupo : nomeDe(aviso.autor)} id={aviso.autor} grupo={aviso.conversaId === grupo} tamanho={38} />
          <span>
            <b>{aviso.conversaId === grupo ? nomeDoGrupo : nomeDe(aviso.autor)}</b>
            <em>{aviso.conversaId === grupo ? `${curto(aviso.autor)}: ` : ''}{aviso.texto}</em>
          </span>
        </button>
      )}
      <button type="button" className="eq-lancador" onClick={() => (aberto ? fecharChat() : abrirChat())}
        aria-expanded={aberto} aria-label={`Chat da equipe${totalNaoLidas ? `: ${totalNaoLidas} não lidas` : ''}`}>
        <span className="eq-lancador-rotulo">{totalNaoLidas ? `${totalNaoLidas} não ${totalNaoLidas === 1 ? 'lida' : 'lidas'}` : 'Chat da equipe'}</span>
        <span className="eq-lancador-circulo"><Ic d={aberto ? I.baixo : I.conversa} /></span>
        {!aberto && totalNaoLidas > 0 && <b className="eq-selo" aria-hidden="true">{totalNaoLidas > 99 ? '99+' : totalNaoLidas}</b>}
      </button>
    </div>
  )
  if (!aberto) return lancador

  // ------------------------------------------------ a janela
  const msgPorId = new Map((mensagensDaVista ?? []).map((m) => [m.id, m]))
  const situacaoDe = (m: MensagemEq): 'enviando' | 'falhou' | 'enviada' | 'entregue' | 'lida' => {
    if (m.falhou) return 'falhou'
    if (m.enviando) return 'enviando'
    if (lidaPorTodos(m, conversa, eu)) return 'lida'
    // entregue: os outros abriram a plataforma depois que a mensagem saiu
    const outros = (conversa?.participantes ?? []).filter((p) => p.userId !== eu).map((p) => porId.get(p.userId))
    return outros.length && outros.every((c) => c?.vistoEm && Date.parse(c.vistoEm) >= Date.parse(m.criadaEm)) ? 'entregue' : 'enviada'
  }

  // os dias, cada um com a sua etiqueta que fica presa no alto ao rolar
  const dias: Array<{ dia: string; itens: MensagemEq[] }> = []
  for (const m of mensagensDaVista ?? []) {
    const d = diaDaMensagem(m.criadaEm)
    if (dias[dias.length - 1]?.dia !== d) dias.push({ dia: d, itens: [] })
    dias[dias.length - 1].itens.push(m)
  }
  const primeiraNaoLida = divisor && divisor.conversaId === vista
    ? (mensagensDaVista ?? []).find((m) => m.autor !== eu && Date.parse(m.criadaEm) > Date.parse(divisor.desde))?.id
    : undefined
  const quantasNaoLidas = primeiraNaoLida ? (mensagensDaVista ?? []).filter((m) => m.autor !== eu && Date.parse(m.criadaEm) > Date.parse(divisor!.desde)).length : 0

  // o menu da mensagem
  let menuItens: ItemDoMenu[] = []
  let menuRodape: React.ReactNode = null
  if (menu) {
    const m = menu.m
    const minha = m.autor === eu
    if (menu.so === 'reacoes') {
      const reacoes = Object.entries(m.reacoes)
      menuRodape = (
        <div className="eq-menu-lista">
          <b>{reacoes.length} {reacoes.length === 1 ? 'reação' : 'reações'}</b>
          {reacoes.map(([u, e]) => (
            <button key={u} type="button" onClick={() => (u === eu ? void reagir(m, null) : setMenu(null))}>
              <Avatar nome={nomeDe(u)} id={u} tamanho={30} />
              <span><b>{u === eu ? 'Você' : nomeDe(u)}</b>{u === eu && <small>Toque para remover</small>}</span>
              <em>{e}</em>
            </button>
          ))}
        </div>
      )
    } else {
      menuItens = [
        { rotulo: 'Responder', d: I.responder, aoEscolher: () => { setMenu(null); acoes.responder(m) } },
        ...(m.texto ? [{ rotulo: 'Copiar', d: I.copiar, aoEscolher: () => { setMenu(null); void navigator.clipboard?.writeText(m.texto).then(() => avisar('Mensagem copiada'), () => avisar('Não consegui copiar.')) } }] : []),
        ...(minha && m.texto && !m.midia && Date.now() - Date.parse(m.criadaEm) < EDITAR_MS
          ? [{ rotulo: 'Editar', d: I.editar, aoEscolher: () => { setMenu(null); setResposta(null); setEditando(m); window.dispatchEvent(new Event('eq:focar')) } }] : []),
        ...(minha ? [{ rotulo: 'Apagar para todos', d: I.lixo, perigo: true, aoEscolher: () => { setMenu(null); setApagando(m) } }] : []),
      ]
      if (minha) {
        const leram = quemLeu(m, conversa, eu)
        const outros = (conversa?.participantes ?? []).filter((p) => p.userId !== eu)
        menuRodape = (
          <div className="eq-menu-info">
            <Ic d={I.visto} className="lida" />
            <span>{!leram.length ? 'Ainda ninguém leu' : leram.length === outros.length ? (ehGrupo ? 'Lida por todos' : `Lida`) : `Lida por ${leram.map((u) => curto(u)).join(', ')}`}</span>
            <small>{horaCurta(m.criadaEm)}</small>
          </div>
        )
      }
    }
  }

  const statusDaCabeca = conexao !== 'ok'
    ? <small className="conectando">{conexao === 'offline' ? 'Sem internet' : 'Conectando…'}</small>
    : sinalDaConversa
    ? <small className="digitando">{sinalDaConversa.texto}</small>
    : <small className={!ehGrupo && estaOnline(outro, agora) ? 'online' : ''}>{ehGrupo ? membros.join(', ') : situacaoDoContato(outro, agora)}</small>

  return (
    <>
      {lancador}
      <div ref={painel} className={`eq-painel ${vista && atual ? 'com-conversa' : 'so-lista'} ${telaCheia ? 'tela-cheia' : ''}`} role="dialog" aria-modal="false" aria-label="Chat da equipe"
        style={voltarArrasto ? { ['--eq-arrasto' as string]: `${voltarArrasto}px` } : undefined}>
        {/* ---------- conversas ---------- */}
        <aside className="eq-lado">
          <header className="eq-lado-cabeca">
            <button type="button" className="eq-icone-btn eq-so-cel" onClick={fecharChat} aria-label="Voltar para a plataforma"><Ic d={I.voltar} /></button>
            <span>
              <b>Conversas</b>
              {conexao !== 'ok'
                ? <small className="conectando"><span className="eq-girando" />{conexao === 'offline' ? 'Sem internet' : 'Conectando…'}</small>
                : <small><Ic d={I.cadeado} />Só a equipe {MARCA.prosa} · {contatos.length} {contatos.length === 1 ? 'pessoa' : 'pessoas'}</small>}
            </span>
            <button type="button" className="eq-icone-btn eq-so-pc" onClick={alternarTelaCheia} aria-pressed={telaCheia}
              aria-label={telaCheia ? 'Voltar para a janela' : 'Abrir em tela cheia'} title={telaCheia ? 'Voltar para a janela' : 'Tela cheia'}>
              <Ic d={telaCheia ? I.reduzir : I.ampliar} />
            </button>
            <button type="button" className="eq-icone-btn eq-so-pc" onClick={fecharChat} aria-label="Fechar o chat"><Ic d={I.fechar} /></button>
          </header>
          {(estadoNotif === 'desligadas' || estadoNotif === 'instalar' || estadoNotif === 'bloqueadas') && (
            <div className="eq-convite">
              <span className="eq-convite-icone"><Ic d={I.sino} /></span>
              <span>
                <b>{estadoNotif === 'instalar' ? 'Instale o app para ser avisado' : estadoNotif === 'bloqueadas' ? 'As notificações estão bloqueadas' : 'Seja avisado das mensagens'}</b>
                <small>{estadoNotif === 'instalar' ? 'No iPhone, as notificações chegam com o app na tela de início (Compartilhar › Adicionar à Tela de Início).' : estadoNotif === 'bloqueadas' ? 'Libere as notificações para este app nos ajustes do aparelho.' : 'Cada mensagem da equipe chega no seu celular, mesmo com o app fechado.'}</small>
              </span>
              {estadoNotif === 'desligadas' && <button type="button" className="eq-btn ouro" onClick={() => void ligarNotificacoes()} disabled={ativandoNotif}>{ativandoNotif ? 'Ativando…' : 'Ativar'}</button>}
            </div>
          )}
          <div className="eq-busca">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4" /></svg>
            <input ref={campoBusca} type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar nomes e mensagens"
              aria-label="Pesquisar nomes e mensagens" enterKeyHint="search"
              onKeyDown={(e) => { if (e.key === 'Escape' && busca) { e.stopPropagation(); setBusca('') } }} />
            {busca ? <button type="button" className="eq-icone-btn" onClick={() => { setBusca(''); campoBusca.current?.focus() }} aria-label="Limpar a pesquisa"><Ic d={I.fechar} /></button>
              : !toque() && <kbd className="eq-atalho" aria-hidden="true">{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'}</kbd>}
          </div>
          {!pronto ? (
            erroGeral
              ? <div className="eq-vazio"><p>{erroGeral}</p><button type="button" className="eq-btn" onClick={() => void sincronizar()}>Tentar de novo</button></div>
              : <div className="eq-esqueleto" aria-busy="true" aria-label="Carregando as conversas">{[0, 1, 2, 3].map((i) => <span key={i}><i /><b><em /><em /></b></span>)}</div>
          ) : (
            <nav className="eq-conversas" aria-label="Conversas">
              {termo && !linhasVisiveis.length && !achadas?.length && !buscando && <p className="eq-sem-resultado">Nada encontrado para "{busca.trim()}".</p>}
              {termo && linhasVisiveis.length > 0 && <h3 className="eq-secao">Conversas</h3>}
              {linhasVisiveis.map((l) => {
                const ativa = !!l.conversa && l.conversa.id === atual
                const grupoDaLinha = l.chave === grupo
                const sinal = quemSinaliza(l.conversa?.id ?? null)
                return (
                  <button key={l.chave} type="button" className={`eq-linha ${ativa ? 'ativa' : ''} ${l.naoLidas ? 'nao-lida' : ''}`}
                    disabled={abrindoContato === l.contato?.id}
                    onClick={() => (l.conversa ? abrirConversa(l.conversa.id) : l.contato && void abrirComContato(l.contato))}>
                    <Avatar nome={l.nome} id={l.contato?.id ?? null} grupo={grupoDaLinha} tamanho={50} online={!grupoDaLinha && l.online} />
                    <span className="eq-linha-meio">
                      <span className="eq-linha-topo">
                        <b>{l.nome}</b>
                        <time>{quandoNaLista(l.quando)}</time>
                      </span>
                      <span className="eq-linha-baixo">
                        {abrindoContato === l.contato?.id ? <small>Abrindo…</small>
                          : sinal ? <small className="digitando">{sinal.texto}</small>
                          : l.conversa && l.conversa.id !== atual && rascunhos.current[l.conversa.id]?.trim()
                            ? <small><em className="eq-rascunho">Rascunho:</em> {rascunhos.current[l.conversa.id].trim()}</small>
                            : <small>{l.minhaUltima && <Ic d={l.lidaUltima ? I.visto : I.enviada} className={`eq-tique ${l.lidaUltima ? 'lida' : ''}`} />}{l.previa}</small>}
                        {l.naoLidas > 0 ? <i className="eq-linha-selo">{l.naoLidas > 99 ? '99+' : l.naoLidas}</i>
                          : grupoDaLinha ? <Ic d={I.fixar} className="eq-fixada" /> : null}
                      </span>
                    </span>
                  </button>
                )
              })}
              {termo && (achadas?.length || buscando) ? (
                <>
                  <h3 className="eq-secao">Mensagens {buscando && <span className="eq-girando" />}</h3>
                  {(achadas ?? []).map((m) => {
                    const c = conversas.find((x) => x.id === m.conversaId)
                    const onde = c?.tipo === 'grupo' ? nomeDoGrupo : nomeDe(c ? outroDaDireta(c, eu) : null)
                    const t = m.texto
                    const i = semAcento(t).indexOf(semAcento(termo))
                    const ini = Math.max(0, i - 24)
                    return (
                      <button key={m.id} type="button" className="eq-achada" onClick={() => abrirAchada(m)}>
                        <span className="eq-linha-topo"><b>{onde}</b><time>{quandoNaLista(m.criadaEm)}</time></span>
                        <small>
                          {m.autor === eu ? 'Você: ' : c?.tipo === 'grupo' ? `${curto(m.autor)}: ` : ''}
                          {ini > 0 && '…'}{t.slice(ini, i)}<mark>{t.slice(i, i + termo.length)}</mark>{t.slice(i + termo.length, i + termo.length + 80)}
                        </small>
                      </button>
                    )
                  })}
                </>
              ) : null}
              <p className="eq-rodape-lista"><Ic d={I.cadeado} />Só os administradores da {MARCA.prosa} veem estas conversas. Nenhum cliente tem acesso.</p>
            </nav>
          )}
        </aside>

        {/* ---------- a conversa ---------- */}
        <section className="eq-conversa" aria-label={tituloDaConversa || 'Conversa'}
          onPointerDown={aoTocarBorda} onPointerMove={aoArrastarBorda} onPointerUp={aoSoltarBorda} onPointerCancel={aoSoltarBorda}
          onDragOver={(e) => { if (conversa && [...e.dataTransfer.items].some((i) => i.type.startsWith('image/'))) { e.preventDefault(); setArrastandoArquivo(true) } }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setArrastandoArquivo(false) }}
          onDrop={(e) => { e.preventDefault(); setArrastandoArquivo(false); escolherImagem([...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))) }}>
          {!conversa ? (
            <div className="eq-boas-vindas">
              <Monograma variante="marca-dagua" tamanho={140} />
              <b>Chat da equipe {MARCA.prosa}</b>
              <p>Mande mensagens, fotos e áudios para os administradores. Tudo fica registrado aqui, e cliente nenhum vê.</p>
              <small><Ic d={I.cadeado} />Só a equipe</small>
            </div>
          ) : (
            <>
              <header className="eq-cabeca">
                <button type="button" className="eq-icone-btn eq-voltar" onClick={voltarParaLista} aria-label="Voltar para as conversas">
                  <Ic d={I.voltar} />
                  {totalNaoLidas - (naoLidas[conversa.id] ?? 0) > 0 && <i className="eq-voltar-selo">{totalNaoLidas - (naoLidas[conversa.id] ?? 0)}</i>}
                </button>
                <Avatar nome={tituloDaConversa} id={outro?.id ?? null} grupo={ehGrupo} tamanho={40} online={!ehGrupo && estaOnline(outro, agora)} />
                <span className="eq-cabeca-nome">
                  <b>{tituloDaConversa}</b>
                  {statusDaCabeca}
                </span>
              </header>

              <div className="eq-mensagens" ref={lista} onScroll={aoRolar}>
                <div className="eq-trilho" aria-live="polite">
                  {!mensagensDaVista ? <div className="eq-carregando"><i /><i /><i /></div> : (
                    <>
                      {temMais[conversa.id] && <div className="eq-antigas">{carregandoAntigas ? <span className="eq-girando" /> : <button type="button" onClick={() => void carregarAntigas()}>Carregar mensagens anteriores</button>}</div>}
                      {!temMais[conversa.id] && (
                        <div className="eq-primeira">
                          <Ic d={I.cadeado} />
                          <p>{ehGrupo ? 'Grupo de todos os administradores. O que for escrito aqui, a equipe toda vê, e fica registrado.' : `Conversa só entre você e ${primeiroNome(tituloDaConversa)}. Cliente nenhum vê.`}</p>
                        </div>
                      )}
                      {dias.map((d) => (
                        <section key={d.dia + d.itens[0].id} className="eq-dia-secao">
                          <div className="eq-dia"><span>{d.dia}</span></div>
                          {d.itens.map((m, i) => {
                            const anterior = d.itens[i - 1]
                            const proxima = d.itens[i + 1]
                            const junto = (a?: MensagemEq, b?: MensagemEq) => !!a && !!b && a.autor === b.autor && Math.abs(Date.parse(b.criadaEm) - Date.parse(a.criadaEm)) < 5 * 60_000 && b.id !== primeiraNaoLida
                            const citada = m.respostaA ? msgPorId.get(m.respostaA) : null
                            return [
                              m.id === primeiraNaoLida ? <div key="div" ref={linhaDivisor} className="eq-nao-lidas"><span>{quantasNaoLidas} {quantasNaoLidas === 1 ? 'mensagem não lida' : 'mensagens não lidas'}</span></div> : null,
                              <Balao key={m.id} api={api} m={m} eu={eu} minha={m.autor === eu} grupo={ehGrupo}
                                primeiraDaSequencia={!junto(anterior, m)} ultimaDaSequencia={!junto(m, proxima)}
                                nomeAutor={nomeDe(m.autor)} citada={citada} nomeCitada={citada ? (citada.autor === eu ? 'Você' : nomeDe(citada.autor)) : 'Mensagem'}
                                situacao={situacaoDe(m)} destacada={destaque === m.id} acoes={acoes}
                                nova={Date.parse(m.criadaEm) > abertaEm.current || !!m.enviando} />,
                            ]
                          })}
                        </section>
                      ))}
                      {sinalDaConversa && (
                        <div className="eq-msg dele primeira ultima eq-digitando-balao" aria-label={sinalDaConversa.texto}>
                          <div className="eq-balao">{sinalDaConversa.tipo === 'gravando' ? <span className="eq-gravando-sinal"><Ic d={I.mic} />{'gravando…' /* texto-ok: como no WhatsApp */}</span> : <span className="eq-pontinhos"><i /><i /><i /></span>}</div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              {longeDoFim && (
                <button type="button" className="eq-descer" onClick={descer} aria-label="Ir para a última mensagem">
                  <Ic d={I.baixo} />{novasAbaixo > 0 && <i>{novasAbaixo}</i>}
                </button>
              )}
              {conexao === 'offline' && <p className="eq-offline" role="status"><Ic d={I.alerta} />Sem internet. O que você mandar sai assim que a conexão voltar.</p>}
              {arrastandoArquivo && <div className="eq-soltar"><Ic d={I.camera} /><b>Solte a imagem para mandar</b></div>}

              <Escrever key={conversa.id} conversaId={conversa.id} rascunhos={rascunhos}
                placeholder="Mensagem"
                resposta={resposta} editando={editando} nomeDe={nomeDe} eu={eu}
                aoCancelarResposta={() => setResposta(null)} aoCancelarEdicao={() => setEditando(null)}
                aoMandar={(t) => void mandarTexto(t)} aoImagem={escolherImagem} aoAudio={mandarAudio}
                aoDigitar={(tipo) => sinalizar(tipo, conversa.id)} aoAvisar={avisar} aoEditarUltima={editarUltima} />
            </>
          )}
        </section>

        {/* ---------- por cima ---------- */}
        {previa && (
          <PreviaDaFoto previa={previa} para={tituloDaConversa} legendaInicial={(atual && rascunhos.current[atual]) || ''}
            aoFechar={() => { URL.revokeObjectURL(previa.url); setPrevia(null) }}
            aoMandar={(legenda) => { const p = previa; setPrevia(null); if (atual) rascunhos.current[atual] = ''; window.dispatchEvent(new Event('eq:limpar')); void mandarFoto(p.arquivo, legenda) }} />
        )}
        {nota && <p className="eq-nota" role="status">{nota}</p>}
      </div>

      {menu && (
        <MenuDaMensagem ancora={menu.ancora} minha={menu.m.autor === eu} minhaReacao={menu.m.reacoes[eu]}
          itens={menuItens} rodape={menuRodape} aoReagir={menu.so ? undefined : (e) => void reagir(menu.m, e)} aoFechar={() => setMenu(null)} />
      )}
      {apagando && (
        <div className="eq-menu-fundo eq-confirmar" onPointerDown={(e) => { if (e.target === e.currentTarget) setApagando(null) }}>
          <div className="eq-dialogo" role="alertdialog" aria-label="Apagar mensagem">
            <b>Apagar mensagem?</b>
            <p>Ela some para todos da conversa. No lugar fica "Você apagou esta mensagem".</p>
            <div><button type="button" onClick={() => setApagando(null)}>Cancelar</button><button type="button" className="perigo" onClick={() => void apagar(apagando)}>Apagar para todos</button></div>
          </div>
        </div>
      )}
      {ampliada && (
        <Visualizador api={api} inicial={ampliada.m.id}
          fotos={(mensagensDaVista ?? []).filter((m) => !m.apagada && m.midia?.tipo !== 'audio' && (m.anexo || m.local))}
          tituloDe={(m) => (m.autor === eu ? 'Você' : nomeDe(m.autor))}
          subtituloDe={(m) => `${diaDaMensagem(m.criadaEm)}, ${horaCurta(m.criadaEm)}`} aoFechar={() => setAmpliada(null)} />
      )}
    </>
  )
}

/* ------------------------------------------------ emoji (no computador; no celular o teclado já tem) */
const EMOJIS: Array<[string, string]> = [
  ['Carinhas', '😀 😃 😄 😁 😆 😅 😂 🤣 😊 🙂 😉 😍 🥰 😘 😎 🤩 🥳 🤔 🤨 😐 😏 🙄 😬 😮 😯 😲 😳 🥺 😢 😭 😤 😡 🤯 😱 😴 🤤 😷 🤒 🤑 🤝'],
  ['Gestos', '👍 👎 👌 ✌️ 🤞 🤟 🤙 👏 🙌 🙏 💪 👊 ✊ 🤛 🤜 👋 ✋ 👀 🫡 🫶'],
  ['Trabalho', '✅ ❌ ⚠️ ❗ ❓ 💯 🔥 🚀 📈 📉 💰 💵 💸 🏆 🎯 📌 📎 📝 📊 📅 ⏰ ⏳ 💡 🔔 📣 🔒 🔑 🛠️ ⚡ ✈️'],
  ['Corações', '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 ❤️‍🔥 💖 ✨ ⭐ 🌟 🎉 🎊 🎁 🍾 🥂 ☕'],
]
const CHAVE_RECENTES = 'equipe.emojisRecentes'
function PainelDeEmoji({ aoEscolher, aoFechar }: { aoEscolher: (e: string) => void; aoFechar: () => void }) {
  const [recentes, setRecentes] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? '[]') } catch { return [] } })
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const fora = (e: PointerEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('.eq-emoji-btn')) aoFechar() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); aoFechar() } }
    document.addEventListener('pointerdown', fora); document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc, true) }
  }, [aoFechar])
  const escolher = (e: string) => {
    const novos = [e, ...recentes.filter((x) => x !== e)].slice(0, 16)
    setRecentes(novos)
    try { localStorage.setItem(CHAVE_RECENTES, JSON.stringify(novos)) } catch { /* sem armazenamento */ }
    aoEscolher(e)
  }
  const grupos: Array<[string, string[]]> = [...(recentes.length ? [['Usados recentemente', recentes] as [string, string[]]] : []), ...EMOJIS.map(([n, l]) => [n, l.split(' ')] as [string, string[]])]
  return (
    <div ref={caixa} className="eq-emojis" role="dialog" aria-label="Emoji">
      {grupos.map(([nome, lista]) => (
        <section key={nome}>
          <b>{nome}</b>
          <div>{lista.map((e) => <button key={nome + e} type="button" onPointerDown={(x) => x.preventDefault()} onClick={() => escolher(e)} aria-label={e}>{e}</button>)}</div>
        </section>
      ))}
    </div>
  )
}

/* ------------------------------------------------ o campo de escrever (com a gravação de voz) */
function Escrever({ conversaId, rascunhos, placeholder, resposta, editando, nomeDe, eu, aoCancelarResposta, aoCancelarEdicao, aoMandar, aoImagem, aoAudio, aoDigitar, aoAvisar, aoEditarUltima }: {
  aoEditarUltima: () => boolean
  conversaId: string
  rascunhos: React.MutableRefObject<Record<string, string>>
  placeholder: string
  resposta: MensagemEq | null
  editando: MensagemEq | null
  nomeDe: (id: string | null) => string
  eu: string
  aoCancelarResposta: () => void
  aoCancelarEdicao: () => void
  aoMandar: (t: string) => void
  aoImagem: (f: File | null | undefined) => void
  aoAudio: (g: Gravacao) => void
  aoDigitar: (tipo: SinalEq['tipo']) => void
  aoAvisar: (t: string) => void
}) {
  const [texto, setTextoLocal] = useState(() => rascunhos.current[conversaId] ?? '')
  const campo = useRef<HTMLTextAreaElement>(null)
  const arquivo = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const textoAntesDeEditar = useRef<string | null>(null)
  const [travado, setTravado] = useState(false)
  const [emojis, setEmojis] = useState(false)
  const porEmoji = (e: string) => {
    const c = campo.current
    const ini = c?.selectionStart ?? texto.length, fim = c?.selectionEnd ?? texto.length
    const v = texto.slice(0, ini) + e + texto.slice(fim)
    setTexto(v)
    requestAnimationFrame(() => { if (c) { c.focus({ preventScroll: true }); c.setSelectionRange(ini + e.length, ini + e.length) } })
  }
  const [puxar, setPuxar] = useState({ x: 0, y: 0 })
  const gesto = useRef<{ x: number; y: number; id: number } | null>(null)
  const mandarAoParar = useRef(false)
  const gravador = useGravador(() => void terminarGravacao(true))

  const setTexto = (v: string) => {
    setTextoLocal(v)
    rascunhos.current[conversaId] = v
    if (v.trim()) aoDigitar('digitando')
  }
  useEffect(() => {
    const focar = () => campo.current?.focus({ preventScroll: true })
    const limpar = () => setTextoLocal('')
    window.addEventListener('eq:focar', focar); window.addEventListener('eq:limpar', limpar)
    if (!toque()) window.setTimeout(focar, 60)
    return () => { window.removeEventListener('eq:focar', focar); window.removeEventListener('eq:limpar', limpar) }
  }, [])
  // editar: o texto da mensagem entra no campo; cancelar devolve o rascunho
  useEffect(() => {
    if (editando) { textoAntesDeEditar.current = texto; setTextoLocal(editando.texto) }
    else if (textoAntesDeEditar.current !== null) { setTextoLocal(textoAntesDeEditar.current); textoAntesDeEditar.current = null }
  }, [editando]) // eslint-disable-line react-hooks/exhaustive-deps

  // a caixa cresce com o que a pessoa escreve
  useLayoutEffect(() => {
    const c = campo.current; if (!c) return
    c.style.height = 'auto'; c.style.height = `${Math.min(c.scrollHeight, 150)}px`; c.style.overflowY = c.scrollHeight > 150 ? 'auto' : 'hidden'
  }, [texto, gravador.estado])

  const enviar = () => {
    const t = texto.trim()
    if (!t) return
    aoMandar(t)
    if (!editando) { setTextoLocal(''); rascunhos.current[conversaId] = '' }
    else textoAntesDeEditar.current = ''
  }
  const colar = (e: React.ClipboardEvent) => {
    const img = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'))
    if (img) { e.preventDefault(); aoImagem(img) }
  }

  // ---- voz: segurar grava; arrastar para a esquerda cancela; para cima trava (no mouse, um clique já trava)
  async function terminarGravacao(mandar: boolean) {
    setTravado(false); setPuxar({ x: 0, y: 0 }); gesto.current = null
    aoDigitar('parou')
    if (!mandar) { gravador.cancelar(); return }
    const g = await gravador.parar()
    if (!g) return
    if (g.duracao < 1) { aoAvisar('Segure o microfone para gravar e solte para enviar.'); return }
    aoAudio(g)
  }
  const aoDescerMic = async (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    if (gravador.estado !== 'parado') return
    if (!gravaAudio()) { aoAvisar('Este navegador não grava áudio.'); return }
    const mouse = e.pointerType === 'mouse'
    if (!mouse) { e.currentTarget.setPointerCapture(e.pointerId); gesto.current = { x: e.clientX, y: e.clientY, id: e.pointerId } }
    mandarAoParar.current = false
    try {
      const ok = await gravador.iniciar()
      if (!ok) return
      if (mouse) setTravado(true)
      // soltou enquanto o microfone ligava
      if (!mouse && !gesto.current) void terminarGravacao(mandarAoParar.current)
    } catch (err) { gesto.current = null; aoAvisar(err instanceof Error ? err.message : 'Não consegui gravar.') }
  }
  const aoMoverMic = (e: React.PointerEvent) => {
    const g = gesto.current
    if (!g || g.id !== e.pointerId || travado) return
    const x = Math.min(0, e.clientX - g.x), y = Math.min(0, e.clientY - g.y)
    setPuxar({ x, y })
    if (x < -110) { vibrar(20); void terminarGravacao(false) }
    else if (y < -80) { vibrar(12); setTravado(true); setPuxar({ x: 0, y: 0 }); gesto.current = null }
  }
  const aoSubirMic = (e: React.PointerEvent) => {
    const g = gesto.current
    if (!g || g.id !== e.pointerId) return
    gesto.current = null
    if (travado) return
    if (gravador.estado === 'gravando') void terminarGravacao(true)
    else mandarAoParar.current = false
  }
  useEffect(() => { if (gravador.estado === 'gravando') aoDigitar('gravando') }, [gravador.segundos]) // eslint-disable-line react-hooks/exhaustive-deps

  const gravando = gravador.estado !== 'parado'
  const temTexto = !!texto.trim()
  const ref = resposta ?? editando

  return (
    <div className={`eq-escrever ${gravando ? 'gravando' : ''}`}>
      {ref && !gravando && (
        <div className="eq-respondendo" style={{ ['--tom' as string]: editando ? 'var(--eq-ouro)' : undefined }}>
          <span>
            <b>{editando ? 'Editando a mensagem' : resposta!.autor === eu ? 'Você' : nomeDe(resposta!.autor)}</b>
            <em>{ref.midia?.tipo === 'audio' ? `🎤 Mensagem de voz (${duracaoCurta(ref.midia.duracao)})` : ref.texto || (ref.anexo ? '📷 Foto' : '')}</em>
          </span>
          <button type="button" className="eq-icone-btn" onClick={editando ? aoCancelarEdicao : aoCancelarResposta} aria-label="Cancelar"><Ic d={I.fechar} /></button>
        </div>
      )}
      <div className="eq-escrever-linha">
        {gravando ? (
          <div className={`eq-gravacao ${travado ? 'travada' : ''}`}>
            {travado
              ? <button type="button" className="eq-icone-btn eq-gravacao-lixo" onClick={() => void terminarGravacao(false)} aria-label="Descartar o áudio"><Ic d={I.lixo} /></button>
              : <i className="eq-gravacao-ponto" />}
            <span className="eq-gravacao-tempo">{gravador.estado === 'pedindo' ? '…' : duracaoCurta(gravador.segundos)}</span>
            {travado
              ? <OndaAoVivo nivel={gravador.nivel} />
              : <span className="eq-gravacao-cancelar" style={{ transform: `translateX(${puxar.x * 0.6}px)`, opacity: 1 + puxar.x / 140 }}><Ic d={I.voltar} />Deslize para cancelar</span>}
            {gravador.segundos > MAXIMO_DE_AUDIO_S - 20 && <small className="eq-gravacao-limite">até {duracaoCurta(MAXIMO_DE_AUDIO_S)}</small>}
          </div>
        ) : (
          <div className="eq-campo">
            {!toque() && (
              <button type="button" className={`eq-icone-btn eq-emoji-btn ${emojis ? 'ativo' : ''}`} onClick={() => setEmojis((v) => !v)} aria-label="Emoji" aria-expanded={emojis} title="Emoji">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 100-18 9 9 0 000 18zM8.5 14.5a4.5 4.5 0 007 0M9 9.5h.01M15 9.5h.01" /></svg>
              </button>
            )}
            {emojis && <PainelDeEmoji aoEscolher={porEmoji} aoFechar={() => setEmojis(false)} />}
            <textarea ref={campo} rows={1} value={texto} placeholder={placeholder} enterKeyHint={toque() ? 'enter' : 'send'}
              onChange={(e) => setTexto(e.target.value)} onPaste={colar} maxLength={4000}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !toque() && !e.nativeEvent.isComposing) { e.preventDefault(); enviar() }
                // ↑ com o campo vazio: edita a última mensagem (como no WhatsApp Web e no Slack)
                else if (e.key === 'ArrowUp' && !texto && !editando && !toque() && aoEditarUltima()) e.preventDefault()
              }} />
            {!editando && (
              <>
                <button type="button" className="eq-icone-btn" onClick={() => arquivo.current?.click()} aria-label="Mandar foto" title="Mandar foto (ou cole o print)"><Ic d={I.clipe} /></button>
                {!temTexto && toque() && <button type="button" className="eq-icone-btn" onClick={() => camera.current?.click()} aria-label="Tirar foto"><Ic d={I.camera} /></button>}
              </>
            )}
            <input ref={arquivo} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; aoImagem(f) }} />
            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; aoImagem(f) }} />
          </div>
        )}
        {temTexto || editando || (gravando && travado) ? (
          <button type="button" className="eq-enviar" aria-label={editando ? 'Salvar' : 'Enviar'}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => (gravando ? void terminarGravacao(true) : enviar())}>
            <Ic d={editando ? I.enviada : I.enviar} cheio={!editando} />
          </button>
        ) : (
          <span className="eq-mic-area">
            {gravando && !travado && (
              <span className="eq-trava" style={{ transform: `translateY(${Math.max(-40, puxar.y * 0.5)}px)` }} aria-hidden="true">
                <Ic d={I.cadeado} /><Ic d={I.seta} />
              </span>
            )}
            <button type="button" className={`eq-enviar eq-mic ${gravando ? 'ativo' : ''}`} aria-label="Segure para gravar um áudio" title="Gravar áudio"
              style={gravando && !travado ? { transform: `translate(${puxar.x * 0.35}px, ${puxar.y * 0.35}px) scale(1.5)` } : undefined}
              onPointerDown={(e) => void aoDescerMic(e)} onPointerMove={aoMoverMic} onPointerUp={aoSubirMic} onPointerCancel={aoSubirMic}
              onContextMenu={(e) => e.preventDefault()}>
              <Ic d={I.mic} />
            </button>
          </span>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------ a prévia da foto, com legenda */
function PreviaDaFoto({ previa, para, legendaInicial, aoFechar, aoMandar }: { previa: Previa; para: string; legendaInicial: string; aoFechar: () => void; aoMandar: (legenda: string) => void }) {
  const [legenda, setLegenda] = useState(legendaInicial)
  const campo = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!toque()) campo.current?.focus()
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); aoFechar() } }
    document.addEventListener('keydown', esc, true)
    return () => document.removeEventListener('keydown', esc, true)
  }, [aoFechar])
  return (
    <div className="eq-previa" role="dialog" aria-label="Mandar foto">
      <header>
        <button type="button" className="eq-icone-btn" onClick={aoFechar} aria-label="Cancelar"><Ic d={I.fechar} /></button>
        <b>Para {para}</b>
      </header>
      <div className="eq-previa-foto"><img src={previa.url} alt="" /></div>
      <form className="eq-previa-baixo" onSubmit={(e) => { e.preventDefault(); aoMandar(legenda) }}>
        <input ref={campo} value={legenda} onChange={(e) => setLegenda(e.target.value)} placeholder="Adicione uma legenda…" maxLength={4000} enterKeyHint="send" />
        <button type="submit" className="eq-enviar" aria-label="Enviar"><Ic d={I.enviar} cheio /></button>
      </form>
    </div>
  )
}

/** No site: o chat falando com o banco, com o login de quem está vendo. */
export function ChatDaEquipeDoBanco({ sessao, escondido }: { sessao: SessaoTeeds; escondido?: boolean }) {
  const api = useMemo(() => equipeDoBanco(sessao), [sessao.token, sessao.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const notificacoes = useMemo(() => ({ estado: estadoDasNotificacoes, ativar: () => ativarNotificacoes(sessao) }), [sessao])
  return <ChatDaEquipe api={api} escondido={escondido} notificacoes={notificacoes} />
}
