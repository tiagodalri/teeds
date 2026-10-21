import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import {
  abrirAnexo, abrirConversa, aguardandoEquipe, aoPedirSuporte, atualizarConversa, diaDaMensagem, enviarAnexo, horaCurta,
  lerMensagens, mandarMensagem, minhasConversas, naoLidasDoCliente, paraConversa, paraMensagem, statusDoSuporte,
  type Conversa, type Mensagem,
} from '../../core/teeds/suporte'
import { buscarPerguntas, PERGUNTAS, type Pergunta } from '../../core/teeds/faq'
import { ATALHOS, perguntas as perguntasDaTriagem, TEMAS, type Opcao, type ResumoDaTriagem, type Tema } from '../../core/teeds/triagem'
import { assinarMudancas } from '../../core/teeds/realtime'
import { Monograma } from '../marca/Monograma'
import { MARCA } from '../../marca'
import './suporte.css'
import { dataCurta } from '../../core/datas'

/**
 * O chat de suporte (20/10/2026): a caixinha flutuante no canto da tela.
 *
 * Cliente: abre, escreve, manda print, recebe a resposta ali mesmo (tempo
 * real só com a janela aberta: o plano grátis do Supabase tem conexões
 * contadas; fechada, um selo de não lidas confere a cada minuto). Enquanto
 * escreve, a Ajuda sugere respostas prontas. Encerrado, avalia.
 *
 * Antes de escrever, a triagem (triagem.ts): assunto + 1 a 3 perguntas de
 * toque + a resposta da Ajuda quando houver. A conversa chega na equipe já
 * etiquetada, com prioridade e o resumo das respostas.
 *
 * Admin: o mesmo botão mostra quantas conversas esperam a equipe e leva
 * para a caixa de entrada (painel admin, aba Suporte).
 */

interface Props {
  sessao: SessaoTeeds
  nome: string
  telaAtual: string
  admin: boolean
  /** Esconde o botão (tour aberto, sala de treino com chat próprio). */
  escondido?: boolean
  irPara: (tela: string) => void
  onAbrirCaixa?: () => void
}

type Vista = 'inicio' | 'conversa' | 'historico'
const REABRE_EM_H = 48
const chaveRascunho = (uid: string) => `${MARCA.id}.suporte.rascunho.${uid}`
const chaveUsou = (uid: string) => `${MARCA.id}.suporte.usou.${uid}`
const toque = () => typeof matchMedia === 'function' && matchMedia('(hover: none)').matches
const ler = (k: string) => { try { return localStorage.getItem(k) ?? '' } catch { return '' } }
const gravar = (k: string, v: string) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k) } catch { /* só agora */ } }

/** Um passo da triagem: a pilha guarda cada um, e "Voltar" desempilha. */
interface Passo {
  etapa: 'tema' | 'pergunta' | 'ajuda' | 'escrever'
  no?: string
  faq?: string[]
  depois?: string | null
  tema?: Tema
  respostas: Array<{ pergunta: string; resposta: string }>
  alta: boolean
  dica?: string
  faqVistas: string[]
}
const INICIO_DA_TRIAGEM: Passo[] = [{ etapa: 'tema', respostas: [], alta: false, faqVistas: [] }]
const ARVORE = perguntasDaTriagem()

const I = {
  enviar: 'M4 12l16-8-6 16-2.5-6.5z',
  clipe: 'M20 11.5l-8.2 8.2a5 5 0 01-7-7L13 4.5a3.3 3.3 0 014.7 4.7l-8.2 8.2a1.7 1.7 0 01-2.4-2.4l7.6-7.6',
  fechar: 'M6 6l12 12M18 6L6 18',
  descer: 'M6 9l6 6 6-6',
  voltar: 'M15 6l-6 6 6 6',
  relogio: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  balao: 'M4 5h16v11H9l-5 4z',
  livro: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19V5M8 7h7',
  certo: 'M5 12.5l4.2 4.2L19 7',
  seta: 'M9 6l6 6-6 6',
  mais: 'M12 5v14M5 12h14',
  estrela: 'M12 3l2.6 5.4 5.9.9-4.3 4.1 1 5.8L12 16.6 6.8 19.2l1-5.8L3.5 9.3l5.9-.9z',
}
const Ic = ({ d, className }: { d: string; className?: string }) => <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>

/** O print privado vira imagem na hora de mostrar. */
function Anexo({ sessao, caminho, aoAmpliar }: { sessao: SessaoTeeds; caminho: string; aoAmpliar: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [erro, setErro] = useState(false)
  useEffect(() => { let vivo = true; abrirAnexo(sessao, caminho).then((u) => vivo && setUrl(u)).catch(() => vivo && setErro(true)); return () => { vivo = false } }, [caminho]) // eslint-disable-line react-hooks/exhaustive-deps
  if (erro) return <span className="sp-anexo-erro">Imagem indisponível</span>
  if (!url) return <span className="sp-anexo carregando" aria-busy="true" />
  return <button type="button" className="sp-anexo" onClick={() => aoAmpliar(url)} aria-label="Ampliar imagem"><img src={url} alt="Imagem enviada no chat" /></button>
}

/** O que veio do banco, mais o que só existe nesta tela (enviando), sem repetir a mensagem que já chegou. */
function mesclar(atuais: Mensagem[], doBanco: Mensagem[], conversaId: string): Mensagem[] {
  const lidos = new Set(doBanco.map((x) => x.id))
  const extras = atuais.filter((x) => x.conversaId === conversaId && !lidos.has(x.id) && !(x.enviando && doBanco.some((y) => y.autor === x.autor && y.texto === x.texto)))
  return [...doBanco, ...extras].sort((a, b) => Date.parse(a.criadaEm) - Date.parse(b.criadaEm))
}

export function SuporteWidget({ sessao, nome, telaAtual, admin, escondido = false, irPara, onAbrirCaixa }: Props) {
  const uid = sessao.usuario.id
  const [aberto, setAberto] = useState(false)
  const [vista, setVista] = useState<Vista>('inicio')
  const [conversas, setConversas] = useState<Conversa[] | null>(null)
  const [atual, setAtual] = useState<Conversa | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [carregando, setCarregando] = useState(false)
  const [texto, setTexto] = useState(() => ler(chaveRascunho(uid)))
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [naoLidas, setNaoLidas] = useState(0)
  const [filaAdmin, setFilaAdmin] = useState(0)
  const [status, setStatus] = useState<{ online: boolean; minutos: number | null }>({ online: false, minutos: null })
  const [aviso, setAviso] = useState<string | null>(null)
  const [ampliada, setAmpliada] = useState<string | null>(null)
  const [sugestaoAberta, setSugestaoAberta] = useState<string | null>(null)
  const [dispensadas, setDispensadas] = useState<Set<string>>(new Set())
  const [nota, setNota] = useState(0)
  const [comentario, setComentario] = useState('')
  const [avaliou, setAvaliou] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [pilha, setPilha] = useState<Passo[]>(INICIO_DA_TRIAGEM)
  const [resolvidoNaAjuda, setResolvidoNaAjuda] = useState(false)
  const passo = pilha[pilha.length - 1]
  const lista = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const arquivo = useRef<HTMLInputElement>(null)
  const painel = useRef<HTMLDivElement>(null)
  const primeiro = nome.trim().split(/\s+/)[0]

  // ------------------------------------------------ triagem
  const ir = (p: Partial<Passo>) => setPilha((l) => [...l, { ...l[l.length - 1], ...p }])
  const voltarPasso = () => setPilha((l) => (l.length > 1 ? l.slice(0, -1) : l))
  const recomecar = () => { setPilha(INICIO_DA_TRIAGEM); setResolvidoNaAjuda(false) }
  function escolherTema(t: Tema) {
    if (!t.inicio) ir({ etapa: 'escrever', tema: t, dica: t.dica })
    else ir({ etapa: 'pergunta', no: t.inicio, tema: t, dica: t.dica })
  }
  function escolherOpcao(o: Opcao) {
    const q = ARVORE[passo.no ?? '']
    const respostas = [...passo.respostas, { pergunta: q?.pergunta ?? '', resposta: o.rotulo }]
    const comum = { respostas, alta: passo.alta || !!o.alta, dica: o.dica ?? passo.dica }
    if (o.texto && !texto.trim()) setTexto(o.texto)
    if (o.faq?.length) ir({ ...comum, etapa: 'ajuda', faq: o.faq, depois: o.vai ?? null })
    else if (o.vai) ir({ ...comum, etapa: 'pergunta', no: o.vai })
    else ir({ ...comum, etapa: 'escrever' })
    if (!o.vai) window.setTimeout(() => campo.current?.focus({ preventScroll: true }), 80)
  }
  function aindaPrecisoDeAjuda() {
    const faqVistas = [...passo.faqVistas, ...(passo.faq ?? [])]
    if (passo.depois) ir({ etapa: 'pergunta', no: passo.depois, faqVistas })
    else { ir({ etapa: 'escrever', faqVistas }); window.setTimeout(() => campo.current?.focus({ preventScroll: true }), 80) }
  }
  const resumoDaTriagem = (): ResumoDaTriagem | null => passo.tema ? {
    tema: passo.tema.id, rotulo: passo.tema.rotulo, etiqueta: passo.tema.etiqueta, alta: passo.alta, respostas: passo.respostas, faqVistas: passo.faqVistas,
  } : null

  useEffect(() => { gravar(chaveRascunho(uid), texto) }, [texto, uid])
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // ------------------------------------------------ admin: só o tamanho da fila
  useEffect(() => {
    if (!admin) return
    let vivo = true
    const ver = () => aguardandoEquipe(sessao, MARCA.id).then((n) => vivo && setFilaAdmin(n)).catch(() => undefined)
    ver()
    const t = window.setInterval(ver, 30_000)
    return () => { vivo = false; window.clearInterval(t) }
  }, [admin, uid]) // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------ cliente: selo de não lidas com a janela fechada
  useEffect(() => {
    if (admin || aberto) return
    let vivo = true
    let anterior = -1
    const ver = () => {
      if (document.hidden) return
      naoLidasDoCliente(sessao).then((n) => {
        if (!vivo) return
        if (anterior >= 0 && n > anterior) setAviso('A equipe respondeu a sua mensagem.')
        anterior = n; setNaoLidas(n)
      }).catch(() => undefined)
    }
    ver()
    const t = window.setInterval(ver, 60_000)
    document.addEventListener('visibilitychange', ver)
    return () => { vivo = false; window.clearInterval(t); document.removeEventListener('visibilitychange', ver) }
  }, [admin, aberto, uid]) // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------ abrir: conversas, status da equipe
  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null)
    try {
      const l = await minhasConversas(sessao)
      setConversas(l)
      const viva = l.find((c) => c.status !== 'resolvida')
      const recente = l.find((c) => c.status === 'resolvida' && c.resolvidaEm && Date.now() - Date.parse(c.resolvidaEm) < REABRE_EM_H * 3_600_000)
      const escolhida = viva ?? recente ?? null
      setAtual(escolhida)
      setVista(escolhida ? 'conversa' : 'inicio')
      if (l.length) gravar(chaveUsou(uid), '1')
    } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }, [sessao, uid])

  useEffect(() => {
    if (!aberto || admin) return
    void carregar()
    let vivo = true
    const ver = () => statusDoSuporte(sessao).then((s) => vivo && setStatus(s))
    ver()
    const t = window.setInterval(ver, 60_000)
    return () => { vivo = false; window.clearInterval(t) }
  }, [aberto]) // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------ a conversa aberta: mensagens + tempo real
  useEffect(() => {
    if (!aberto || !atual) { setMensagens([]); return }
    let vivo = true
    setNota(atual.avaliacao ?? 0); setAvaliou(!!atual.avaliacao); setComentario('')
    // mescla: a 1ª mensagem pode ter saído antes desta leitura voltar
    const id = atual.id
    lerMensagens(sessao, id).then((m) => vivo && setMensagens((atuais) => mesclar(atuais, m, id))).catch(() => undefined)
    const canal = assinarMudancas({
      token: sessao.token, canal: `suporte-cliente-${atual.id}`,
      tabelas: [{ tabela: 'suporte_mensagens', filtro: `conversa_id=eq.${atual.id}`, evento: 'INSERT' }, { tabela: 'suporte_conversas', filtro: `id=eq.${atual.id}`, evento: 'UPDATE' }],
      aoMudar: (m) => {
        if (m.tabela === 'suporte_mensagens') {
          const nova = paraMensagem(m.linha)
          if (nova.interna) return
          setMensagens((l) => (l.some((x) => x.id === nova.id) ? l : [...l.filter((x) => !(x.enviando && x.autor === nova.autor && x.texto === nova.texto)), nova]))
        } else {
          const c = paraConversa(m.linha)
          setAtual((a) => (a && a.id === c.id ? c : a))
          setConversas((l) => l?.map((x) => (x.id === c.id ? c : x)) ?? l)
        }
      },
    })
    return () => { vivo = false; canal.fechar() }
  }, [aberto, atual?.id, sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps

  // lida: abriu a conversa, zera o contador
  useEffect(() => {
    if (!aberto || !atual || vista !== 'conversa' || atual.naoLidasCliente === 0) return
    void atualizarConversa(sessao, atual.id, { nao_lidas_cliente: 0 }).catch(() => undefined)
    setNaoLidas((n) => Math.max(0, n - atual.naoLidasCliente))
  }, [aberto, vista, atual?.id, atual?.naoLidasCliente]) // eslint-disable-line react-hooks/exhaustive-deps

  // sempre no fim da conversa
  useLayoutEffect(() => { const el = lista.current; if (el) el.scrollTop = el.scrollHeight }, [mensagens.length, vista, sugestaoAberta])

  // ------------------------------------------------ pedido de outra tela (perfil, ajuda)
  useEffect(() => aoPedirSuporte((p) => {
    if (admin) { onAbrirCaixa?.(); return }
    setAberto(true)
    const atalho = p.atalho ? ATALHOS[p.atalho] : null
    const tema = TEMAS.find((t) => t.id === (atalho?.tema ?? p.tema)) ?? (p.mensagem ? TEMAS.find((t) => t.id === 'outro') : undefined)
    if (tema) {
      const resposta = atalho?.resposta ?? p.resposta
      setPilha([...INICIO_DA_TRIAGEM, {
        etapa: 'escrever', tema, dica: tema.dica, alta: false, faqVistas: p.faq ? [p.faq] : [],
        respostas: resposta ? [{ pergunta: p.faq ? 'Vindo da Ajuda' : 'O que você precisa?', resposta }] : [],
      }])
    }
    const textoInicial = atalho?.texto ?? p.mensagem
    if (textoInicial) setTexto(textoInicial)
    window.setTimeout(() => campo.current?.focus(), 250)
  }), [admin, onAbrirCaixa])

  // ------------------------------------------------ celular: tela inteira, acompanha o teclado
  useEffect(() => {
    if (!aberto) return
    const vv = window.visualViewport
    const raiz = document.documentElement
    raiz.classList.add('sp-aberto')
    const ajustar = () => {
      if (!painel.current || !vv) return
      painel.current.style.setProperty('--sp-altura', `${vv.height}px`)
      painel.current.style.setProperty('--sp-topo', `${vv.offsetTop}px`)
    }
    ajustar()
    vv?.addEventListener('resize', ajustar); vv?.addEventListener('scroll', ajustar)
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (ampliada) setAmpliada(null); else setAberto(false) } }
    document.addEventListener('keydown', esc)
    if (!toque()) window.setTimeout(() => campo.current?.focus({ preventScroll: true }), 120)
    return () => { raiz.classList.remove('sp-aberto'); vv?.removeEventListener('resize', ajustar); vv?.removeEventListener('scroll', ajustar); document.removeEventListener('keydown', esc) }
  }, [aberto, ampliada])

  // o recado do botão some sozinho
  useEffect(() => { if (!aviso) return; const t = window.setTimeout(() => setAviso(null), 9000); return () => window.clearTimeout(t) }, [aviso])

  // a caixa de texto cresce com o que a pessoa escreve
  useLayoutEffect(() => { const c = campo.current; if (!c) return; c.style.height = 'auto'; c.style.height = `${Math.min(c.scrollHeight, 132)}px`; c.style.overflowY = c.scrollHeight > 132 ? 'auto' : 'hidden' }, [texto, aberto, vista])

  // ------------------------------------------------ a Ajuda sugere antes de mandar
  const jaFalou = mensagens.some((m) => m.autor === 'cliente')
  const sugestoes = useMemo<Pergunta[]>(() => {
    if (jaFalou && atual?.status !== 'resolvida') return []
    if (!atual && passo.etapa !== 'escrever') return []
    if (texto.trim().length < 6) return []
    return buscarPerguntas(texto, 3).filter((a) => a.nota >= 1.3 && !dispensadas.has(a.p.id) && !passo.faqVistas.includes(a.p.id)).map((a) => a.p).slice(0, 2)
  }, [texto, jaFalou, atual?.status, dispensadas, passo]) // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------ mandar
  async function mandar(textoDaMensagem = texto, anexo: string | null = null, conversaPronta?: Conversa) {
    const limpo = textoDaMensagem.trim()
    if ((!limpo && !anexo) || enviando) return
    setEnviando(true); setErro(null)
    const temp: Mensagem = { id: `temp-${Date.now()}`, conversaId: atual?.id ?? '', autor: 'cliente', autorId: uid, autorNome: nome, texto: limpo, anexo, interna: false, criadaEm: new Date().toISOString(), enviando: true }
    try {
      let conversa = conversaPronta ?? atual
      // resolvida há mais de 48 h: assunto novo, conversa nova
      if (conversa && conversa.status === 'resolvida' && conversa.resolvidaEm && Date.now() - Date.parse(conversa.resolvidaEm) > REABRE_EM_H * 3_600_000) conversa = null
      const nova = !conversa
      if (!conversa) {
        conversa = await abrirConversa(sessao, telaAtual, resumoDaTriagem())
        setConversas((l) => [conversa!, ...(l ?? [])])
        setAtual(conversa); setMensagens([]); setVista('conversa')
        gravar(chaveUsou(uid), '1')
        setPilha(INICIO_DA_TRIAGEM)
      }
      setMensagens((l) => [...l, { ...temp, conversaId: conversa!.id }])
      if (!anexo) setTexto('')
      const salva = await mandarMensagem(sessao, conversa.id, { texto: limpo, anexo, autor: 'cliente' })
      setMensagens((l) => (l.some((x) => x.id === salva.id) ? l.filter((x) => x.id !== temp.id) : l.map((x) => (x.id === temp.id ? salva : x))))
      if (conversa.status === 'resolvida') setAtual({ ...conversa, status: 'aberta', resolvidaEm: null })
      if (nova) { const id = conversa.id; window.setTimeout(() => { void lerMensagens(sessao, id).then((m) => setMensagens((atuais) => mesclar(atuais, m, id))).catch(() => undefined) }, 1200) }
    } catch (e) {
      setMensagens((l) => l.map((x) => (x.id === temp.id ? { ...x, enviando: false, falhou: true } : x)))
      setErro((e as Error).message)
      if (!anexo && !texto) setTexto(limpo)
    } finally { setEnviando(false) }
  }

  async function mandarPrint(f: File | undefined) {
    if (!f) return
    setErro(null)
    try {
      let conversa = atual
      if (!conversa || (conversa.status === 'resolvida' && conversa.resolvidaEm && Date.now() - Date.parse(conversa.resolvidaEm) > REABRE_EM_H * 3_600_000)) {
        conversa = await abrirConversa(sessao, telaAtual, resumoDaTriagem())
        setConversas((l) => [conversa!, ...(l ?? [])]); setAtual(conversa); setMensagens([]); setVista('conversa'); setPilha(INICIO_DA_TRIAGEM)
      }
      setEnviando(true)
      const caminho = await enviarAnexo(sessao, conversa, f)
      setEnviando(false)
      await mandar(texto.trim(), caminho, conversa)
      setTexto('')
    } catch (e) { setErro((e as Error).message); setEnviando(false) } finally { if (arquivo.current) arquivo.current.value = '' }
  }

  async function encerrar() {
    if (!atual) return
    try { await atualizarConversa(sessao, atual.id, { status: 'resolvida' }); setAtual({ ...atual, status: 'resolvida', resolvidaEm: new Date().toISOString() }) }
    catch (e) { setErro((e as Error).message) }
  }
  async function avaliar() {
    if (!atual || !nota) return
    try { await atualizarConversa(sessao, atual.id, { avaliacao: nota, avaliacao_comentario: comentario.trim() || null }); setAvaliou(true) }
    catch (e) { setErro((e as Error).message) }
  }
  function novaConversa() { setAtual(null); setMensagens([]); setVista('inicio'); setTexto(''); recomecar() }

  const teclas = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !toque() && !e.nativeEvent.isComposing) { e.preventDefault(); void mandar() }
  }
  const colar = (e: React.ClipboardEvent) => {
    const img = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'))
    if (img) { e.preventDefault(); void mandarPrint(img) }
  }

  // ------------------------------------------------ botão flutuante
  const selo = admin ? filaAdmin : naoLidas
  if (escondido && !aberto) return null
  const botao = (
    <div className={`sp-lancador-area ${aberto ? 'aberto' : ''}`}>
      {aviso && !aberto && (
        <button type="button" className="sp-aviso" onClick={() => { setAviso(null); setAberto(true) }}>
          <Monograma tamanho={22} /><span><b>Suporte {MARCA.prosa}</b>{aviso}</span>
        </button>
      )}
      <button type="button" className={`sp-lancador ${selo ? 'com-selo' : ''}`} data-tour="suporte"
        onClick={() => (admin ? onAbrirCaixa?.() : setAberto((a) => !a))}
        aria-expanded={admin ? undefined : aberto} aria-label={admin ? `Caixa de entrada do suporte${filaAdmin ? `: ${filaAdmin} aguardando` : ''}` : aberto ? 'Fechar o suporte' : 'Abrir o suporte'}>
        <span className="sp-lancador-rotulo">{admin ? (filaAdmin ? `${filaAdmin} aguardando` : 'Caixa de suporte') : 'Suporte'}</span>
        <span className="sp-lancador-circulo">
          {aberto ? <Ic d={I.descer} className="sp-lancador-x" /> : <><Monograma tamanho={28} /><i className="sp-lancador-balao"><Ic d={I.balao} /></i></>}
        </span>
        {!aberto && selo > 0 && <b className="sp-selo" aria-hidden="true">{selo > 9 ? '9+' : selo}</b>}
      </button>
    </div>
  )
  if (admin || !aberto) return botao

  // ------------------------------------------------ o painel
  const resolvida = atual?.status === 'resolvida'
  const aguardando = atual?.status === 'aberta' && jaFalou
  const respostaEm = status.minutos ? (status.minutos < 2 ? 'em minutos' : status.minutos < 60 ? `em ~${status.minutos} min` : `em ~${Math.round(status.minutos / 60)} h`) : null

  let diaAnterior = ''
  return (
    <>
      {botao}
      <div ref={painel} className="sp-painel" role="dialog" aria-modal="false" aria-label={`Suporte ${MARCA.prosa}`}>
        <header className="sp-cabeca">
          {vista !== 'inicio' && (vista === 'historico' || (conversas?.length ?? 0) > 0) ? (
            <button type="button" className="sp-icone-btn" onClick={() => (vista === 'historico' ? setVista(atual ? 'conversa' : 'inicio') : setVista('historico'))} aria-label={vista === 'historico' ? 'Voltar' : 'Ver conversas anteriores'}>
              <Ic d={vista === 'historico' ? I.voltar : I.relogio} />
            </button>
          ) : <span className="sp-icone-vazio" />}
          <div className="sp-equipe">
            <span className="sp-equipe-avatar"><Monograma tamanho={26} /><i className={status.online ? 'online' : ''} /></span>
            <span>
              <b>Suporte {MARCA.prosa}</b>
              <small>{status.online ? <><i className="sp-ponto" />Online agora</> : 'Respondemos o quanto antes'}{respostaEm && ` · responde ${respostaEm}`}</small>
            </span>
          </div>
          <button type="button" className="sp-icone-btn" onClick={() => setAberto(false)} aria-label="Fechar o suporte"><Ic d={I.fechar} /></button>
        </header>

        {!online && <p className="sp-offline">Sem internet agora. A mensagem vai assim que a conexão voltar.</p>}

        {/* ------------------------------------------------ histórico */}
        {vista === 'historico' ? (
          <div className="sp-corpo sp-historico">
            <button type="button" className="sp-nova" onClick={novaConversa}><Ic d={I.mais} />Nova conversa</button>
            {(conversas ?? []).map((c) => (
              <button type="button" key={c.id} className={`sp-hist ${c.id === atual?.id ? 'atual' : ''}`} onClick={() => { setAtual(c); setVista('conversa') }}>
                <span className={`sp-hist-status ${c.status}`}>{c.status === 'resolvida' ? 'Resolvida' : c.status === 'respondida' ? 'Respondida' : 'Em andamento'}</span>
                <b>{c.assunto || 'Conversa com o suporte'}</b>
                <small>{dataCurta(c.criadaEm)}{c.ultimaMensagem && ` · ${c.ultimaMensagem}`}</small>
                {c.naoLidasCliente > 0 && <i className="sp-hist-selo">{c.naoLidasCliente}</i>}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="sp-corpo" ref={lista} aria-live="polite">
              {carregando && !conversas ? <div className="sp-carregando"><i /><i /><i /></div> : vista === 'inicio' || !atual ? (
                // ------------------------------------------------ triagem
                <div className="sp-triagem">
                  {passo.etapa === 'tema' ? (
                    <div className="sp-ola">
                      <Monograma variante="marca-dagua" tamanho={180} className="sp-ola-marca" />
                      <h3>{primeiro ? `Olá, ${primeiro}!` : 'Olá!'}</h3>
                      <p>{resolvidoNaAjuda ? 'Que bom que resolveu! Se precisar de mais alguma coisa, escolha um assunto.' : 'Sobre o que você quer falar? Escolha um assunto e a gente te leva ao lugar certo.'}</p>
                      <div className="sp-temas">
                        {TEMAS.map((t) => (
                          <button type="button" key={t.id} className={t.id === 'outro' ? 'outro' : ''} onClick={() => escolherTema(t)}>
                            <span className="sp-tema-icone"><Ic d={t.icone} /></span>
                            <span><b>{t.rotulo}</b><small>{t.descricao}</small></span>
                          </button>
                        ))}
                      </div>
                      <button type="button" className="sp-central" onClick={() => { setAberto(false); irPara('ajuda') }}>
                        <Ic d={I.livro} /><span><b>Central de ajuda</b><small>As dúvidas mais comuns, respondidas</small></span>
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="sp-trilha">
                        <button type="button" className="sp-trilha-voltar" onClick={voltarPasso} aria-label="Voltar um passo"><Ic d={I.voltar} /></button>
                        <span className="sp-trilha-tema"><Ic d={passo.tema?.icone ?? I.balao} />{passo.tema?.rotulo}</span>
                        {passo.respostas.map((r, n) => <span key={n} className="sp-trilha-item"><Ic d={I.seta} />{r.resposta}</span>)}
                      </div>
                      {passo.etapa === 'pergunta' && passo.no && ARVORE[passo.no] && (
                        <div className="sp-pergunta" key={passo.no}>
                          <h4>{ARVORE[passo.no].pergunta}</h4>
                          <div className="sp-opcoes">
                            {ARVORE[passo.no].opcoes.map((o) => <button type="button" key={o.rotulo} onClick={() => escolherOpcao(o)}><span>{o.rotulo}</span><Ic d={I.seta} /></button>)}
                          </div>
                        </div>
                      )}
                      {passo.etapa === 'ajuda' && (
                        <div className="sp-pergunta">
                          <h4><Ic d={I.livro} />Talvez isso já resolva</h4>
                          {(passo.faq ?? []).map((id) => PERGUNTAS.find((x) => x.id === id)).filter((x): x is Pergunta => !!x).map((x) => (
                            <article key={x.id} className="sp-faq">
                              <b>{x.pergunta}</b>
                              {x.resposta.map((r, n) => <p key={n} className={r.startsWith('• ') ? 'item' : ''}>{r.replace(/^• /, '')}</p>)}
                              {x.ir && <button type="button" className="sp-faq-ir" onClick={() => { setAberto(false); irPara(x.ir!.tela) }}>{x.ir.rotulo}<Ic d={I.seta} /></button>}
                            </article>
                          ))}
                          <div className="sp-faq-acoes">
                            <button type="button" className="sp-btn ouro" onClick={() => { recomecar(); setResolvidoNaAjuda(true); setTexto('') }}>Resolveu, obrigado!</button>
                            <button type="button" className="sp-btn" onClick={aindaPrecisoDeAjuda}>Ainda preciso de ajuda</button>
                          </div>
                        </div>
                      )}
                      {passo.etapa === 'escrever' && (
                        <div className="sp-pergunta">
                          <h4>{passo.tema?.id === 'outro' ? 'Fale com a equipe' : 'Agora, conte para a equipe'}</h4>
                          <p className="sp-dica">{passo.dica ?? passo.tema?.dica}</p>
                          <p className="sp-dica fraca"><Ic d={I.clipe} />Dá para mandar print pelo clipe ou colando a imagem.</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                // ------------------------------------------------ a conversa
                <>
                  {(() => {
                    const t = (atual.contexto as { triagem?: ResumoDaTriagem }).triagem
                    if (!t || t.tema === 'outro') return null
                    return <div className="sp-resumo"><span>Assunto</span><b>{[t.rotulo, ...t.respostas.map((r) => r.resposta)].join(' · ')}</b></div>
                  })()}
                  {mensagens.map((m) => {
                    const dia = diaDaMensagem(m.criadaEm)
                    const separador = dia !== diaAnterior ? <div className="sp-dia" key={`d-${m.id}`}><span>{dia}</span></div> : null
                    diaAnterior = dia
                    if (m.autor === 'sistema') return [separador, <div key={m.id} className="sp-sistema"><Monograma tamanho={18} /><p>{m.texto}</p></div>]
                    const meu = m.autor === 'cliente'
                    return [separador,
                      <div key={m.id} className={`sp-msg ${meu ? 'minha' : 'equipe'} ${m.falhou ? 'falhou' : ''}`}>
                        {!meu && <span className="sp-msg-avatar"><Monograma tamanho={18} /></span>}
                        <div className="sp-balao">
                          {!meu && <span className="sp-msg-nome">{(m.autorNome || 'Equipe').split(' ')[0]} · Equipe</span>}
                          {m.anexo && <Anexo sessao={sessao} caminho={m.anexo} aoAmpliar={setAmpliada} />}
                          {m.texto && <p>{m.texto}</p>}
                          <span className="sp-msg-hora">{m.falhou ? <button type="button" onClick={() => { setMensagens((l) => l.filter((x) => x.id !== m.id)); void mandar(m.texto, m.anexo) }}>Não enviou · tentar de novo</button> : m.enviando ? 'enviando…' : horaCurta(m.criadaEm)}
                            {meu && !m.enviando && !m.falhou && <Ic d={I.certo} className="sp-visto" />}</span>
                        </div>
                      </div>]
                  })}
                  {aguardando && (
                    <div className="sp-esperando"><span className="sp-digitando"><i /><i /><i /></span>
                      {status.online ? 'A equipe já foi avisada e responde por aqui.' : 'Mensagem recebida. Você é avisado aqui quando a equipe responder.'}</div>
                  )}
                  {atual.status === 'respondida' && (
                    <div className="sp-resolveu">Resolvido? <button type="button" onClick={() => void encerrar()}>Encerrar atendimento</button></div>
                  )}
                  {resolvida && (
                    <div className="sp-fim">
                      <span className="sp-fim-selo"><Ic d={I.certo} /></span>
                      <b>Atendimento encerrado</b>
                      {avaliou ? <p>Obrigado pela avaliação! Ela ajuda a gente a melhorar sempre.</p> : (
                        <>
                          <p>Como foi o atendimento?</p>
                          <div className="sp-estrelas" role="radiogroup" aria-label="Nota do atendimento">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button type="button" key={n} role="radio" aria-checked={nota === n} aria-label={`${n} de 5`} className={n <= nota ? 'on' : ''} onClick={() => setNota(n)}><Ic d={I.estrela} /></button>
                            ))}
                          </div>
                          {nota > 0 && (
                            <>
                              <textarea id="sp-comentario" value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} maxLength={500} placeholder={nota >= 4 ? 'Quer deixar um elogio? (opcional)' : 'O que podemos melhorar? (opcional)'} />
                              <button type="button" className="sp-btn ouro" onClick={() => void avaliar()}>Enviar avaliação</button>
                            </>
                          )}
                        </>
                      )}
                      <button type="button" className="sp-btn" onClick={novaConversa}>Nova conversa</button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ------------------------------------------------ a Ajuda antes de mandar */}
            {sugestoes.length > 0 && (
              <div className="sp-sugestoes">
                <span className="sp-sugestoes-rot"><Ic d={I.livro} />Talvez isso ajude</span>
                {sugestoes.map((p) => (
                  <div key={p.id} className={`sp-sugestao ${sugestaoAberta === p.id ? 'aberta' : ''}`}>
                    <button type="button" onClick={() => setSugestaoAberta((a) => (a === p.id ? null : p.id))} aria-expanded={sugestaoAberta === p.id}>{p.pergunta}</button>
                    {sugestaoAberta === p.id && (
                      <div className="sp-sugestao-resposta">
                        {p.resposta.map((r, i) => <p key={i}>{r}</p>)}
                        <div>
                          <button type="button" className="sp-btn ouro" onClick={() => { setTexto(''); setSugestaoAberta(null); setDispensadas((d) => new Set(d).add(p.id)) }}>Resolveu, obrigado!</button>
                          <button type="button" className="sp-btn" onClick={() => { setSugestaoAberta(null); setDispensadas((d) => new Set(d).add(p.id)) }}>Ainda preciso de ajuda</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {erro && <p className="sp-erro" role="alert">{erro}</p>}

            {/* ------------------------------------------------ escrever */}
            {(vista === 'conversa' && atual) || passo.etapa === 'escrever' ? <div className="sp-escrever">
                <button type="button" className="sp-icone-btn" onClick={() => arquivo.current?.click()} disabled={enviando} aria-label="Mandar um print da tela"><Ic d={I.clipe} /></button>
                <input ref={arquivo} type="file" accept="image/*" hidden onChange={(e) => void mandarPrint(e.target.files?.[0])} />
                <textarea id="sp-texto" ref={campo} value={texto} rows={1} maxLength={4000} onChange={(e) => setTexto(e.target.value)} onKeyDown={teclas} onPaste={colar}
                  placeholder={resolvida ? 'Escreva para falar de novo com a equipe' : 'Escreva a sua mensagem'} enterKeyHint="send" aria-label="Mensagem" />
                <button type="button" className="sp-enviar" onClick={() => void mandar()} disabled={!texto.trim() || enviando} aria-label="Enviar"><Ic d={I.enviar} /></button>
            </div> : null}
            <p className="sp-rodape">A equipe nunca pede a sua senha.</p>
          </>
        )}
      </div>
      {ampliada && (
        <button type="button" className="sp-ampliada" onClick={() => setAmpliada(null)} aria-label="Fechar imagem"><img src={ampliada} alt="Imagem ampliada" /></button>
      )}
    </>
  )
}
