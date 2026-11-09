import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as PE, type ReactNode, type WheelEvent as WE } from 'react'
import { createPortal } from 'react-dom'
import type { SessaoTeeds } from '../../core/teeds/conta'
import type { PapelDoAdmin } from '../../core/teeds/parceiroEmFoco'
import { useParceirosDaMarca } from '../../core/teeds/parceiroEmFoco'
import { MARCA } from '../../marca'
import {
  ALTURA_DO_QUADRO, CORES, EMOJIS, FONTES, carregarFontesDosStories, contraste, nova, proximaLive, proximoEstilo, rotuloDasCamadas,
  type Camada, type FonteDoTexto, type FundoDoTexto, type Selo, type Traco,
} from '../../core/teeds/camadas'
import {
  avisarNoCelular, BOTAO_PADRAO, enviarArquivo, enviarMidia, EVENTO_STORIES, perfisDoPainel, prepararMidia, salvarStory, LIMITE_SEGUNDOS,
  type BotaoTipo, type Enquadramento, type MidiaPronta, type PerfilDoPainel, type Publico,
} from '../../core/teeds/stories'
import { CamadasDoStory } from './CamadasDoStory'
import { Avatar, estiloDaMidia } from './VisualizadorDeStories'
import './stories.css'
import './camadas.css'
import './estudio.css'

/**
 * O estúdio de stories (09/11/2026, Tiago: "ta mto confuso e complicado... poder tanto subir video
 * ja gravado como abrir a camera pra gravar na hora igual o insta... sem perder a qualidade da
 * camera do iphone... ferramentas de edicao igual o insta, com localizacao, emojis, texto,
 * figurinha... adicionar link tambem, mesmo formato do insta").
 *
 *  1. Câmera: a câmera ao vivo na tela (toque = foto, segurar = vídeo até 60 s, trocar frente/trás),
 *     a galeria e, no celular, a "Câmera do iPhone": abre a câmera nativa, na qualidade total dela.
 *     Modo Texto: um fundo nas cores da GF e escrever.
 *  2. Editor: arrastar, pinçar para aumentar e girar, soltar na lixeira; texto (5 fontes, cores,
 *     fundo, alinhamento, tamanho), emojis, figurinhas (localização, link, contagem, enquete,
 *     horário, selos da GF), desenho com o dedo, som ligado/desligado. Tocar no fundo = texto novo.
 *  3. Publicar: a bolinha, para todos ou só admins, e "Mais opções" (público, agendar, prazo,
 *     respostas, compartilhar, aviso no celular). O vídeo já vai subindo enquanto se edita.
 */

interface Props {
  sessao: SessaoTeeds
  papel: PapelDoAdmin | null
  aoFechar: () => void
  aoPublicado?: (id: string) => void
  /** Laboratório: começa no editor com esta foto. */
  fotoDeExemplo?: string
}

type Etapa = 'camera' | 'editar'
interface Midia { tipo: 'video' | 'imagem' | 'fundo'; local: string; fundo?: number; arquivo?: File | Blob }
interface Envio { fase: 'preparando' | 'enviando' | 'pronto' | 'erro'; f: number; pronto?: { url: string; caminho: string; capa: string | null }; erro?: string; duracao: number; tipo: 'video' | 'imagem' }

/** Os fundos do modo Texto (a família da GlobalFly). */
const FUNDOS = [
  'linear-gradient(160deg, #0C1D33 0%, #051528 55%, #02070F 100%)',
  'linear-gradient(160deg, #F7E3A1 0%, #D6A042 45%, #8A6420 100%)',
  'linear-gradient(160deg, #3B6FB0 0%, #051528 70%)',
  'linear-gradient(45deg, #FBE6A6 0%, #F0C463 20%, #D6A042 38%, #B78D39 50%, #8FA8C8 70%, #5E8FC8 86%, #3B6FB0 100%)',
  'linear-gradient(160deg, #1A1A1A 0%, #000000 100%)',
  'linear-gradient(160deg, #F3F0E9 0%, #E0DBD0 100%)',
]
const PARES_DOS_FUNDOS: Array<[string, string]> = [['#0C1D33', '#02070F'], ['#F7E3A1', '#8A6420'], ['#3B6FB0', '#051528'], ['#F0C463', '#3B6FB0'], ['#1A1A1A', '#000000'], ['#F3F0E9', '#E0DBD0']]
const LOCAIS = ['São Paulo, SP', 'Rio de Janeiro, RJ', 'Curitiba, PR', 'Florianópolis, SC', 'Belo Horizonte, MG', 'Brasília, DF', 'Porto Alegre, RS', 'Goiânia, GO', 'Miami, EUA', 'Dubai, EAU']
const TELAS: Array<{ id: BotaoTipo; nome: string }> = [
  { id: 'aula', nome: 'Aulas' }, { id: 'ia', nome: 'I.A.' }, { id: 'deposito', nome: 'Depositar' }, { id: 'aovivo', nome: 'Ao vivo' },
  { id: 'gerenciamento', nome: 'Gerenciamento' }, { id: 'marketplace', nome: 'Planos' },
]
const SELOS: Array<{ id: Selo; nome: string }> = [
  { id: 'gf', nome: 'GlobalFly' }, { id: 'aovivo', nome: 'Ao vivo' }, { id: 'novidade', nome: 'Novidade' }, { id: 'ia', nome: 'I.A. no ar' },
  { id: 'gold', nome: 'Gold' }, { id: 'black', nome: 'Black' }, { id: 'prestige', nome: 'Prestige' },
]
const SUBPLANOS = [{ id: 'gold', nome: 'Gold' }, { id: 'black', nome: 'Black' }, { id: 'prestige', nome: 'Prestige' }]

const toque = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
const paraInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

const Ico = ({ d, cheio }: { d: string; cheio?: boolean }) => <svg viewBox="0 0 24 24" aria-hidden="true" className={cheio ? 'cheio' : undefined}><path d={d} /></svg>
const I = {
  fechar: 'M6 6l12 12M18 6L6 18', voltar: 'M15 6l-6 6 6 6', texto: 'M5 7V5h14v2M12 5v14M9 19h6',
  figurinha: 'M15 21H7a4 4 0 01-4-4V7a4 4 0 014-4h10a4 4 0 014 4v8zM15 21v-2a4 4 0 014-4h2M8.5 10h.01M14.5 10h.01M8.5 14.5s1.3 1.5 3.5 1.5',
  caneta: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3', somOn: 'M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 010 7M19.5 5.5a9 9 0 010 13',
  somOff: 'M4 9h4l5-4v14l-5-4H4zM17 9.5l5 5M22 9.5l-5 5', galeria: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01',
  virar: 'M4 9a8 8 0 0114-3l2 2M20 15a8 8 0 01-14 3l-2-2M18 3v5h-5M6 21v-5h5', camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  seta: 'M5 12h14M13 6l6 6-6 6', engrenagem: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  lixo: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', desfazer: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  alinhar: { center: 'M4 6h16M7 12h10M4 18h16', left: 'M4 6h16M4 12h10M4 18h16', right: 'M4 6h16M10 12h10M4 18h16' } as Record<string, string>,
  pin: 'M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z', link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  relogio: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2', enquete: 'M5 20V10M12 20V4M19 20v-7', check: 'M5 12.5l4.2 4.2L19 7',
}

/* ============================================================== o estúdio */
export function EstudioDeStories({ sessao, papel, aoFechar, aoPublicado, fotoDeExemplo }: Props) {
  const [etapa, setEtapa] = useState<Etapa>(fotoDeExemplo ? 'editar' : 'camera')
  const [midia, setMidia] = useState<Midia | null>(fotoDeExemplo ? { tipo: 'imagem', local: fotoDeExemplo } : null)
  const [envio, setEnvio] = useState<Envio | null>(null)
  const [camadas, setCamadas] = useState<Camada[]>([])
  const [enq, setEnq] = useState<Enquadramento>({ zoom: 1, x: 50, y: 50 })
  const [semSom, setSemSom] = useState(false)
  const [painel, setPainel] = useState<null | 'figurinhas' | 'local' | 'link' | 'contagem' | 'enquete' | 'opcoes' | 'sair'>(null)
  const [editandoTexto, setEditandoTexto] = useState<Camada | null>(null)
  const [desenhando, setDesenhando] = useState(false)
  const [editandoEnquete, setEditandoEnquete] = useState<string | null>(null)
  const [recado, setRecado] = useState<string | null>(null)
  const [perfis, setPerfis] = useState<PerfilDoPainel[]>([])
  const [perfilId, setPerfilId] = useState('')
  const [paraQuem, setParaQuem] = useState<'todos' | 'admins'>('todos')
  const [subplanos, setSubplanos] = useState<string[]>([])
  const [parcs, setParcs] = useState<string[]>([])
  const [quando, setQuando] = useState<'agora' | 'agendar'>('agora')
  const [inicio, setInicio] = useState(paraInput(new Date(Date.now() + 3600_000)))
  const [fixo, setFixo] = useState(false)
  const [responder, setResponder] = useState(true)
  const [compartilhar, setCompartilhar] = useState(true)
  const [avisar, setAvisar] = useState(false)
  const [publicando, setPublicando] = useState(false)
  const parceiros = useParceirosDaMarca(sessao, MARCA.id)
  const pleno = !!papel && (papel.geral || papel.total)
  const meuParceiro = papel && !papel.geral ? papel.parceiro : null
  const cancelarEnvio = useRef<(() => void) | null>(null)
  const publicarDepois = useRef(false)

  useEffect(() => { carregarFontesDosStories() }, [])
  useEffect(() => {
    perfisDoPainel(sessao).then((l) => {
      const meus = l.filter((p) => !meuParceiro || !p.parceiro || p.parceiro === meuParceiro)
      setPerfis(meus)
      setPerfilId((id) => id || (meus.find((p) => meuParceiro && p.parceiro === meuParceiro) ?? meus[0])?.id || '')
    }).catch(() => undefined)
  }, [sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = antes; cancelarEnvio.current?.() }
  }, [])

  const avisarRapido = useCallback((t: string) => { setRecado(t); window.setTimeout(() => setRecado((r) => (r === t ? null : r)), 2400) }, [])

  /* ------------------------------------------------ mídia: preparar e subir já */
  async function receber(arquivo: File | Blob, nome = 'story') {
    const f = arquivo instanceof File ? arquivo : new File([arquivo], nome, { type: arquivo.type })
    const ehFoto = f.type.startsWith('image/') || /\.(hei[cf]|jpe?g|png|webp)$/i.test(f.name)
    const local = URL.createObjectURL(f)
    setMidia({ tipo: ehFoto ? 'imagem' : 'video', local, arquivo: f })
    setEnq({ zoom: 1, x: 50, y: 50 }); setCamadas([]); setSemSom(false)
    setEtapa('editar')
    setEnvio({ fase: 'preparando', f: 0, duracao: 6, tipo: ehFoto ? 'imagem' : 'video' })
    cancelarEnvio.current?.()
    try {
      const m: MidiaPronta = await prepararMidia(f, (p) => setEnvio((e) => (e && e.fase === 'preparando' ? { ...e, f: p } : e)))
      if (m.cortado) avisarRapido(`Ficaram os primeiros ${LIMITE_SEGUNDOS} segundos do vídeo.`)
      setEnvio({ fase: 'enviando', f: 0, duracao: m.duracao, tipo: m.tipo })
      const e = enviarMidia(sessao, m, (p) => setEnvio((x) => (x && x.fase === 'enviando' ? { ...x, f: p } : x)))
      cancelarEnvio.current = e.cancelar
      const pronto = await e.promessa
      setEnvio({ fase: 'pronto', f: 1, pronto, duracao: m.duracao, tipo: m.tipo })
    } catch (err) {
      setEnvio((x) => ({ fase: 'erro', f: 0, erro: (err as Error).message, duracao: x?.duracao ?? 6, tipo: x?.tipo ?? 'imagem' }))
    }
  }
  function modoTexto() {
    setMidia({ tipo: 'fundo', local: '', fundo: 0 })
    setEnvio(null); setCamadas([]); setEnq({ zoom: 1, x: 50, y: 50 })
    setEtapa('editar')
    window.setTimeout(() => setEditandoTexto(nova.texto('', '#FFFFFF')), 60)
  }

  /** O fundo do modo Texto vira uma foto 1080 x 1920 na hora de publicar. */
  async function fundoComoFoto(i: number): Promise<{ url: string; caminho: string; capa: string | null }> {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1920
    const g = c.getContext('2d')!
    const [a, b] = PARES_DOS_FUNDOS[i] ?? PARES_DOS_FUNDOS[0]
    const gr = g.createLinearGradient(0, 0, 1080, 1920); gr.addColorStop(0, a); gr.addColorStop(1, b)
    g.fillStyle = gr; g.fillRect(0, 0, 1080, 1920)
    const blob = await new Promise<Blob>((ok, falha) => c.toBlob((x) => (x ? ok(x) : falha(new Error('Não consegui montar o fundo.'))), 'image/jpeg', 0.9))
    const caminho = `${MARCA.id}/${Date.now().toString(36)}-fundo.jpg`
    const url = await enviarArquivo(sessao, caminho, blob, 'image/jpeg').promessa
    return { url, caminho, capa: url }
  }

  /* ------------------------------------------------ publicar */
  const publico: Publico = paraQuem === 'admins' ? { so_admins: true }
    : subplanos.length || parcs.length || meuParceiro ? { subplanos, parceiros: meuParceiro ? [meuParceiro] : parcs } : { todos: true }
  const perfil = perfis.find((p) => p.id === perfilId)

  async function publicar() {
    if (publicando || !midia) return
    if (!perfilId) { avisarRapido('Escolha a bolinha do story.'); return }
    if (midia.tipo !== 'fundo' && envio?.fase !== 'pronto') {
      if (envio?.fase === 'erro') { avisarRapido(envio.erro ?? 'O envio falhou. Tente de novo.'); return }
      publicarDepois.current = true; setPublicando(true); return
    }
    setPublicando(true)
    try {
      const pronto = midia.tipo === 'fundo' ? await fundoComoFoto(midia.fundo ?? 0) : envio!.pronto!
      const tipo = midia.tipo === 'fundo' ? 'imagem' : envio!.tipo
      const salvo = await salvarStory(sessao, {
        perfil_id: perfilId, tipo, midia_url: pronto.url, midia_caminho: pronto.caminho, capa_url: pronto.capa,
        duracao: tipo === 'imagem' ? 6 : Math.max(1, Math.round((envio?.duracao ?? 6) * 10) / 10),
        enquadramento: { ...enq, ...(semSom ? { mudo: true } : {}) }, camadas,
        chip: '', titulo: '', subtitulo: '', botao_tipo: '', botao_texto: '', botao_destino: '', publico,
        inicia_em: quando === 'agendar' ? new Date(inicio).toISOString() : null, expira_em: null, destaque: fixo, compartilhar, responder,
      })
      if (avisar && pleno && quando === 'agora' && paraQuem === 'todos') {
        const parceiro = publico.parceiros?.length === 1 && publico.parceiros[0] !== 'direto' ? publico.parceiros[0] : null
        await avisarNoCelular(sessao, salvo.id, `${perfil?.nome ?? MARCA.prosa} postou um story`, rotuloDasCamadas(camadas) ?? 'Toque para ver na Início.', parceiro).catch(() => undefined)
      }
      window.dispatchEvent(new Event(EVENTO_STORIES))
      aoPublicado?.(salvo.id)
      aoFechar()
    } catch (e) {
      setPublicando(false); publicarDepois.current = false
      avisarRapido((e as Error).message)
    }
  }
  // publicou antes do vídeo terminar de subir: sai sozinho quando ficar pronto
  useEffect(() => {
    if (publicarDepois.current && envio?.fase === 'pronto') { publicarDepois.current = false; setPublicando(false); void publicar() }
    if (publicarDepois.current && envio?.fase === 'erro') { publicarDepois.current = false; setPublicando(false); avisarRapido(envio.erro ?? 'O envio falhou.') }
  }, [envio?.fase]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------ camadas */
  const atualizar = (id: string, patch: Partial<Camada>) => setCamadas((l) => l.map((c) => (c.id === id ? ({ ...c, ...patch } as Camada) : c)))
  const remover = (id: string) => setCamadas((l) => l.filter((c) => c.id !== id))
  /** A figurinha nova nasce num lugar livre (não em cima das outras). */
  const adicionar = (c: Camada) => setCamadas((l) => {
    if (c.tipo !== 'desenho') {
      const vagas = [c.y, 24, 36, 48, 60, 72, 82]
      const ocupacao = (y: number) => l.filter((x) => x.tipo !== 'desenho' && Math.abs(x.y - y) < 9).length
      c = { ...c, y: vagas.reduce((m, y) => (ocupacao(y) < ocupacao(m) ? y : m), vagas[0]) } as Camada
    }
    return [...l.filter((x) => x.tipo !== 'desenho' || c.tipo !== 'desenho'), c]
  })
  function concluirTexto(c: Camada | null) {
    const editando = editandoTexto
    setEditandoTexto(null)
    if (!editando) return
    if (!c || (c.tipo === 'texto' && !c.texto.trim())) { remover(editando.id); return }
    setCamadas((l) => (l.some((x) => x.id === c.id) ? l.map((x) => (x.id === c.id ? c : x)) : [...l, c]))
  }
  function tocarCamada(c: Camada) {
    if (c.tipo === 'texto') setEditandoTexto(c)
    else if (c.tipo === 'local' || c.tipo === 'link' || c.tipo === 'hora' || c.tipo === 'contagem') atualizar(c.id, { estilo: proximoEstilo(c.estilo) })
    else if (c.tipo === 'enquete') { setEditandoEnquete(c.id); setPainel('enquete') }
  }

  const mudou = camadas.length > 0 || !!midia
  const fechar = () => { if (mudou && etapa === 'editar') setPainel('sair'); else aoFechar() }

  const conteudo = (
    <div className={`est ${etapa}`} role="dialog" aria-modal="true" aria-label="Criar story">
      {etapa === 'camera' && <Camera aoCapturar={(b, n) => void receber(b, n)} aoTexto={modoTexto} aoFechar={aoFechar} />}

      {etapa === 'editar' && midia && (
        <Editor
          midia={midia} enq={enq} setEnq={setEnq} camadas={camadas} setCamadas={setCamadas} semSom={semSom}
          escondida={editandoTexto?.id ?? null} desenhando={desenhando}
          aoTocarCamada={tocarCamada} aoTocarFundo={() => setEditandoTexto(nova.texto('', midia.tipo === 'fundo' && (midia.fundo === 1 || midia.fundo === 5) ? '#051528' : '#FFFFFF'))}
          aoRemover={remover}
        >
          {/* topo */}
          {!editandoTexto && !desenhando && (
            <div className="est-topo">
              <button type="button" className="est-bt" onClick={fechar} aria-label="Fechar"><Ico d={I.fechar} /></button>
              <div className="est-ferr">
                {midia.tipo === 'fundo' && <button type="button" className="est-bt fundo" onClick={() => setMidia({ ...midia, fundo: ((midia.fundo ?? 0) + 1) % FUNDOS.length })} aria-label="Trocar o fundo"><i style={{ background: FUNDOS[((midia.fundo ?? 0) + 1) % FUNDOS.length] }} /></button>}
                {midia.tipo === 'video' && <button type="button" className="est-bt" onClick={() => { setSemSom((s) => !s); avisarRapido(semSom ? 'Som ligado' : 'Story sem som') }} aria-label={semSom ? 'Ligar o som' : 'Tirar o som'}><Ico d={semSom ? I.somOff : I.somOn} /></button>}
                <button type="button" className="est-bt" onClick={() => setEditandoTexto(nova.texto())} aria-label="Texto"><b className="est-aa">Aa</b></button>
                <button type="button" className="est-bt" onClick={() => setPainel('figurinhas')} aria-label="Figurinhas"><Ico d={I.figurinha} /></button>
                <button type="button" className="est-bt" onClick={() => setDesenhando(true)} aria-label="Desenhar"><Ico d={I.caneta} /></button>
              </div>
            </div>
          )}
          {envio && envio.fase !== 'pronto' && !editandoTexto && (
            <div className={`est-envio ${envio.fase}`}>
              {envio.fase === 'erro' ? <>{envio.erro}<button type="button" onClick={() => midia.arquivo && void receber(midia.arquivo)}>Tentar de novo</button></>
                : <><i style={{ ['--f' as string]: `${Math.round(envio.f * 100)}%` }} />{envio.fase === 'preparando' ? (envio.tipo === 'video' ? 'Preparando o vídeo em 1080p' : 'Preparando a foto') : 'Enviando'} · {Math.round(envio.f * 100)}%</>}
            </div>
          )}
        </Editor>
      )}

      {etapa === 'editar' && editandoTexto && <EditorDeTexto inicial={editandoTexto} aoConcluir={concluirTexto} />}
      {etapa === 'editar' && desenhando && (
        <ModoDesenho camadas={camadas} aoConcluir={(tracos) => {
          setDesenhando(false)
          const d = camadas.find((c) => c.tipo === 'desenho')
          if (!tracos.length) { if (d) remover(d.id); return }
          if (d) atualizar(d.id, { tracos } as Partial<Camada>); else setCamadas((l) => [{ ...nova.desenho(), tracos } as Camada, ...l])
        }} />
      )}

      {/* a barra de publicar */}
      {etapa === 'editar' && !editandoTexto && !desenhando && (
        <div className="est-pe">
          <button type="button" className="est-perfil" onClick={() => { const i = perfis.findIndex((p) => p.id === perfilId); if (perfis.length) setPerfilId(perfis[(i + 1) % perfis.length].id) }}
            aria-label="Trocar a bolinha" title="Trocar a bolinha">
            {perfil ? <span className="sto-anel"><Avatar foto={perfil.foto_url} nome={perfil.nome} tamanho={30} /></span> : <i />}
            <span><small>Bolinha</small><b>{perfil?.nome ?? '…'}</b></span>
          </button>
          <div className="est-para">
            <button type="button" className={paraQuem === 'todos' ? 'on' : ''} onClick={() => setParaQuem('todos')}>{meuParceiro ? 'Meus clientes' : subplanos.length || parcs.length ? 'Escolhidos' : 'Todos'}</button>
            <button type="button" className={paraQuem === 'admins' ? 'on' : ''} onClick={() => setParaQuem('admins')}>Só admins</button>
          </div>
          <button type="button" className="est-bt" onClick={() => setPainel('opcoes')} aria-label="Mais opções"><Ico d={I.engrenagem} /></button>
          <button type="button" className={`est-enviar ${publicando ? 'indo' : ''}`} onClick={() => void publicar()} disabled={publicando} aria-label={quando === 'agendar' ? 'Agendar' : 'Publicar'}>
            {publicando ? <span className="est-gira" /> : <Ico d={I.seta} />}
          </button>
        </div>
      )}
      {publicando && publicarDepois.current && <div className="est-recado">Publica assim que o vídeo terminar de subir…</div>}

      {/* painéis */}
      {painel === 'figurinhas' && (
        <Bandeja aoFechar={() => setPainel(null)}
          aoEscolher={(o) => {
            if (o === 'local' || o === 'link' || o === 'contagem' || o === 'enquete') { setEditandoEnquete(null); setPainel(o); return }
            setPainel(null)
            if (o === 'hora') adicionar(nova.hora())
            else if (o.startsWith('selo:')) adicionar(nova.selo(o.slice(5) as Selo))
            else adicionar(nova.emoji(o.slice(6)))
          }} />
      )}
      {painel === 'local' && <FormLocal aoFechar={() => setPainel(null)} aoConcluir={(t) => { setPainel(null); adicionar(nova.local(t)) }} />}
      {painel === 'link' && <FormLink aoFechar={() => setPainel(null)} aoConcluir={(u, t, a) => { setPainel(null); adicionar(nova.link(u, t, a)) }} />}
      {painel === 'contagem' && <FormContagem aoFechar={() => setPainel(null)} aoConcluir={(t, ate) => { setPainel(null); adicionar(nova.contagem(t, ate)) }} />}
      {painel === 'enquete' && (
        <FormEnquete inicial={camadas.find((c) => c.id === editandoEnquete) as Extract<Camada, { tipo: 'enquete' }> | undefined} aoFechar={() => setPainel(null)}
          aoConcluir={(p, o) => { setPainel(null); if (editandoEnquete) atualizar(editandoEnquete, { pergunta: p, opcoes: o } as Partial<Camada>); else adicionar(nova.enquete(p, o)) }}
          aoRemover={editandoEnquete ? () => { remover(editandoEnquete); setPainel(null) } : undefined} />
      )}
      {painel === 'opcoes' && (
        <Folha titulo="Mais opções" aoFechar={() => setPainel(null)}>
          <div className="est-op">
            <span className="est-op-tit">Bolinha</span>
            <div className="est-chips">{perfis.map((p) => <button key={p.id} type="button" className={perfilId === p.id ? 'on' : ''} onClick={() => setPerfilId(p.id)}><Avatar foto={p.foto_url} nome={p.nome} tamanho={22} />{p.nome}</button>)}</div>
          </div>
          {paraQuem === 'todos' && (
            <div className="est-op">
              <span className="est-op-tit">Quem vê <small>Nada marcado = todos</small></span>
              <div className="est-chips">{SUBPLANOS.map((s) => <button key={s.id} type="button" className={subplanos.includes(s.id) ? 'on' : ''} onClick={() => setSubplanos((l) => (l.includes(s.id) ? l.filter((x) => x !== s.id) : [...l, s.id]))}>{s.nome}</button>)}</div>
              {!meuParceiro && parceiros.length > 0 && (
                <div className="est-chips">
                  {parceiros.map((p) => <button key={p.codigo} type="button" className={parcs.includes(p.codigo) ? 'on' : ''} onClick={() => setParcs((l) => (l.includes(p.codigo) ? l.filter((x) => x !== p.codigo) : [...l, p.codigo]))}>{p.nome.split(' ')[0]} /{p.codigo}</button>)}
                  <button type="button" className={parcs.includes('direto') ? 'on' : ''} onClick={() => setParcs((l) => (l.includes('direto') ? l.filter((x) => x !== 'direto') : [...l, 'direto']))}>Direto</button>
                </div>
              )}
              {meuParceiro && <small className="est-nota">Vai só para os seus clientes (/{meuParceiro}).</small>}
            </div>
          )}
          <div className="est-op duas">
            <div>
              <span className="est-op-tit">Quando entra</span>
              <div className="est-seg"><button type="button" className={quando === 'agora' ? 'on' : ''} onClick={() => setQuando('agora')}>Agora</button><button type="button" className={quando === 'agendar' ? 'on' : ''} onClick={() => setQuando('agendar')}>Agendar</button></div>
              {quando === 'agendar' && <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} aria-label="Data e hora de entrada" />}
            </div>
            <div>
              <span className="est-op-tit">Fica no ar</span>
              <div className="est-seg"><button type="button" className={!fixo ? 'on' : ''} onClick={() => setFixo(false)}>24 horas</button><button type="button" className={fixo ? 'on' : ''} onClick={() => setFixo(true)}>Fixo</button></div>
            </div>
          </div>
          <label className="est-chave"><input type="checkbox" checked={responder} onChange={(e) => setResponder(e.target.checked)} /><span><b>Permitir respostas</b><small>Caem no Suporte</small></span></label>
          <label className="est-chave"><input type="checkbox" checked={compartilhar} onChange={(e) => setCompartilhar(e.target.checked)} /><span><b>Permitir compartilhar</b><small>Link com o cadastro do parceiro</small></span></label>
          <label className={`est-chave ${!pleno || quando === 'agendar' || paraQuem === 'admins' ? 'off' : ''}`}>
            <input type="checkbox" checked={avisar && pleno && quando === 'agora' && paraQuem === 'todos'} disabled={!pleno || quando === 'agendar' || paraQuem === 'admins'} onChange={(e) => setAvisar(e.target.checked)} />
            <span><b>Avisar no celular</b><small>{!pleno ? 'Só o administrador geral dispara' : 'Notificação para quem ativou no app'}</small></span>
          </label>
          <button type="button" className="est-pronto" onClick={() => setPainel(null)}>Pronto</button>
        </Folha>
      )}
      {painel === 'sair' && (
        <Folha titulo="Descartar este story?" aoFechar={() => setPainel(null)}>
          <p className="est-nota">O que você fez até aqui será perdido.</p>
          <button type="button" className="est-perigo" onClick={() => { cancelarEnvio.current?.(); aoFechar() }}>Descartar</button>
          <button type="button" className="est-pronto claro" onClick={() => { setPainel(null); setEtapa('camera'); setMidia(null); setEnvio(null); setCamadas([]); cancelarEnvio.current?.() }}>Voltar para a câmera</button>
          <button type="button" className="est-pronto claro" onClick={() => setPainel(null)}>Continuar editando</button>
        </Folha>
      )}
      {recado && <div className="est-recado" role="status">{recado}</div>}
    </div>
  )
  return createPortal(conteudo, document.body)
}

/* ============================================================== câmera */
function Camera({ aoCapturar, aoTexto, aoFechar }: { aoCapturar: (b: Blob, nome: string) => void; aoTexto: () => void; aoFechar: () => void }) {
  const video = useRef<HTMLVideoElement | null>(null)
  const fluxo = useRef<MediaStream | null>(null)
  const gravador = useRef<MediaRecorder | null>(null)
  const pedacos = useRef<Blob[]>([])
  const [frente, setFrente] = useState(false)
  const [estado, setEstado] = useState<'abrindo' | 'pronta' | 'sem'>('abrindo')
  const [gravando, setGravando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [flash, setFlash] = useState(false)
  const segura = useRef<{ t: number; timer: number } | null>(null)
  const galeria = useRef<HTMLInputElement | null>(null)
  const nativa = useRef<HTMLInputElement | null>(null)
  const celular = toque()

  useEffect(() => {
    let vivo = true
    setEstado('abrindo')
    const abrir = async () => {
      fluxo.current?.getTracks().forEach((t) => t.stop())
      if (!navigator.mediaDevices?.getUserMedia) { setEstado('sem'); return }
      const video: MediaTrackConstraints = { facingMode: frente ? 'user' : 'environment', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
      // a permissão pode ficar pendurada (navegador embutido, aviso ignorado): em 5 s mostra as outras opções
      const comPrazo = (c: MediaStreamConstraints) => Promise.race([navigator.mediaDevices.getUserMedia(c), new Promise<never>((_, falha) => window.setTimeout(() => falha(new Error('prazo')), 5000))])
      let s: MediaStream | null = null
      try { s = await comPrazo({ video, audio: { echoCancellation: true, noiseSuppression: true } }) }
      catch (e) { if ((e as Error).message === 'prazo') s = null; else { try { s = await comPrazo({ video }) } catch { s = null } } }
      if (!vivo) { s?.getTracks().forEach((t) => t.stop()); return }
      if (!s) { setEstado('sem'); return }
      fluxo.current = s
      if (videoEl()) { videoEl()!.srcObject = s; await videoEl()!.play().catch(() => undefined) }
      setEstado('pronta')
    }
    const videoEl = () => video.current
    void abrir()
    return () => { vivo = false }
  }, [frente])
  useEffect(() => () => { fluxo.current?.getTracks().forEach((t) => t.stop()); if (gravador.current?.state === 'recording') gravador.current.stop() }, [])

  useEffect(() => {
    if (!gravando) return
    const t0 = performance.now()
    const t = window.setInterval(() => {
      const s = (performance.now() - t0) / 1000
      setSegundos(s)
      if (s >= LIMITE_SEGUNDOS) parar()
    }, 100)
    return () => window.clearInterval(t)
  }, [gravando]) // eslint-disable-line react-hooks/exhaustive-deps

  function foto() {
    const v = video.current
    if (!v || !v.videoWidth) return
    setFlash(true); window.setTimeout(() => setFlash(false), 180)
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight
    const g = c.getContext('2d')!
    if (frente) { g.translate(c.width, 0); g.scale(-1, 1) }
    g.drawImage(v, 0, 0)
    c.toBlob((b) => { if (b) aoCapturar(b, 'foto.jpg') }, 'image/jpeg', 0.95)
  }
  function gravar() {
    const s = fluxo.current
    if (!s || typeof MediaRecorder === 'undefined') { foto(); return }
    const tipos = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
    const mime = tipos.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
    const r = new MediaRecorder(s, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 160_000 })
    pedacos.current = []
    r.ondataavailable = (e) => { if (e.data.size) pedacos.current.push(e.data) }
    r.onstop = () => {
      const b = new Blob(pedacos.current, { type: r.mimeType || mime || 'video/webm' })
      if (b.size) aoCapturar(b, /mp4/.test(b.type) ? 'video.mp4' : 'video.webm')
    }
    r.start(250)
    gravador.current = r
    setSegundos(0); setGravando(true)
  }
  function parar() {
    if (gravador.current?.state === 'recording') gravador.current.stop()
    setGravando(false)
  }
  function apertar(e: PE<HTMLButtonElement>) {
    e.preventDefault()
    if (estado !== 'pronta') { nativa.current?.click(); return }
    segura.current = { t: performance.now(), timer: window.setTimeout(gravar, 260) }
  }
  function soltar() {
    const s = segura.current
    segura.current = null
    if (!s) return
    window.clearTimeout(s.timer)
    if (gravando) parar(); else if (performance.now() - s.t < 260) foto()
  }
  const escolher = (f: File | undefined) => { if (f) aoCapturar(f, f.name) }

  return (
    <div className="est-cam">
      <video ref={video} className={`est-cam-video ${frente ? 'espelho' : ''}`} playsInline muted autoPlay />
      {flash && <i className="est-flash" />}
      {estado === 'sem' && (
        <div className="est-cam-sem">
          <span className="est-cam-sem-ico"><Ico d={I.camera} /></span>
          <b>Escolha como criar o story</b>
          <small>Sem acesso à câmera nesta tela. Use a câmera do aparelho ou a galeria.</small>
          <div>
            <button type="button" onClick={() => nativa.current?.click()}><Ico d={I.camera} />Câmera</button>
            <button type="button" onClick={() => galeria.current?.click()}><Ico d={I.galeria} />Galeria</button>
            <button type="button" onClick={aoTexto}><b className="est-aa">Aa</b>Texto</button>
          </div>
        </div>
      )}
      <div className="est-cam-topo">
        <button type="button" className="est-bt" onClick={aoFechar} aria-label="Fechar"><Ico d={I.fechar} /></button>
        {gravando && <span className="est-rec"><i />{String(Math.floor(segundos / 60)).padStart(1, '0')}:{String(Math.floor(segundos % 60)).padStart(2, '0')}</span>}
        {celular && !gravando
          ? <button type="button" className="est-nativa" onClick={() => nativa.current?.click()}><Ico d={I.camera} />{/iPhone|iPad/.test(navigator.userAgent) ? 'Câmera do iPhone' : 'Câmera do celular'}<small>Qualidade máxima</small></button>
          : <span />}
      </div>
      <div className="est-cam-pe">
        <button type="button" className="est-galeria" onClick={() => galeria.current?.click()} aria-label="Galeria"><Ico d={I.galeria} /></button>
        <button type="button" className={`est-disparo ${gravando ? 'gravando' : ''}`} onPointerDown={apertar} onPointerUp={soltar} onPointerLeave={() => { if (gravando) soltar() }}
          onContextMenu={(e) => e.preventDefault()} aria-label="Toque para foto, segure para vídeo">
          <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" className="trilho" /><circle cx="50" cy="50" r="46" className="anda" style={{ strokeDashoffset: `${289 - 289 * Math.min(1, segundos / LIMITE_SEGUNDOS)}` }} /></svg>
          <i />
        </button>
        <button type="button" className="est-bt grande" onClick={() => setFrente((f) => !f)} aria-label="Trocar câmera" disabled={estado !== 'pronta' || gravando}><Ico d={I.virar} /></button>
      </div>
      <div className="est-modos">
        <button type="button" onClick={aoTexto}>Texto</button>
        <button type="button" className="on">Story</button>
      </div>
      {!gravando && estado === 'pronta' && <span className="est-dica">Toque para foto · segure para vídeo</span>}
      <input ref={galeria} type="file" accept="image/*,video/*,.heic,.heif,.mov" hidden onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={nativa} type="file" accept="image/*,video/*" capture="environment" hidden onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = '' }} />
    </div>
  )
}

/* ============================================================== editor (palco + gestos) */
interface PropsEditor {
  midia: Midia; enq: Enquadramento; setEnq: (f: (e: Enquadramento) => Enquadramento) => void
  camadas: Camada[]; setCamadas: (f: (l: Camada[]) => Camada[]) => void; semSom: boolean
  escondida: string | null; desenhando: boolean
  aoTocarCamada: (c: Camada) => void; aoTocarFundo: () => void; aoRemover: (id: string) => void
  children: ReactNode
}
function Editor({ midia, enq, setEnq, camadas, setCamadas, semSom, escondida, desenhando, aoTocarCamada, aoTocarFundo, aoRemover, children }: PropsEditor) {
  const quadro = useRef<HTMLDivElement | null>(null)
  const lixo = useRef<HTMLDivElement | null>(null)
  const g = useRef<{ alvo: string; ptrs: Map<number, { x: number; y: number }>; ini: { p: Array<{ x: number; y: number }>; c?: Camada; e: Enquadramento }; t: number; moveu: boolean } | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const [sobreLixo, setSobreLixo] = useState(false)
  const [guias, setGuias] = useState({ v: false, h: false })

  const camadaDe = (id: string) => camadas.find((c) => c.id === id)
  function marcarInicio() {
    const s = g.current
    if (!s) return
    s.ini = { p: [...s.ptrs.values()].map((p) => ({ ...p })), c: s.alvo === 'midia' ? undefined : camadaDe(s.alvo), e: { ...enq } }
  }
  function baixar(e: PE<HTMLDivElement>) {
    if (desenhando || escondida) return
    const el = (e.target as HTMLElement).closest('[data-camada]') as HTMLElement | null
    if ((e.target as HTMLElement).closest('.est-topo, .est-envio, button')) return
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* já solto */ }
    if (!g.current) {
      const alvo = el?.dataset.camada ?? 'midia'
      g.current = { alvo, ptrs: new Map(), ini: { p: [], e: enq }, t: performance.now(), moveu: false }
      // a camada tocada vem para a frente
      if (alvo !== 'midia') setCamadas((l) => { const c = l.find((x) => x.id === alvo); return c && c.tipo !== 'desenho' ? [...l.filter((x) => x.id !== alvo), c] : l })
    }
    g.current.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
    marcarInicio()
  }
  function mover(e: PE<HTMLDivElement>) {
    const s = g.current, q = quadro.current
    if (!s || !q || !s.ptrs.has(e.pointerId)) return
    s.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const r = q.getBoundingClientRect()
    const pts = [...s.ptrs.values()], ini = s.ini
    if (!ini.p.length) return
    const dx = ((pts[0].x - ini.p[0].x) / r.width) * 100, dy = ((pts[0].y - ini.p[0].y) / r.height) * 100
    if (Math.hypot(pts[0].x - ini.p[0].x, pts[0].y - ini.p[0].y) > 6) { if (!s.moveu) { s.moveu = true; if (s.alvo !== 'midia') setArrastando(true) } }
    if (!s.moveu) return
    if (s.alvo === 'midia') {
      const z = ini.e.zoom ?? 1
      if (pts.length >= 2 && ini.p.length >= 2) {
        const d0 = Math.hypot(ini.p[1].x - ini.p[0].x, ini.p[1].y - ini.p[0].y), d1 = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
        setEnq((q2) => ({ ...q2, zoom: limitar(z * (d1 / (d0 || 1)), 1, 3) }))
      } else setEnq((q2) => ({ ...q2, x: limitar((ini.e.x ?? 50) - dx * 1.4, 0, 100), y: limitar((ini.e.y ?? 50) - dy * 1.4, 0, 100) }))
      return
    }
    const c0 = ini.c
    if (!c0) return
    if (pts.length >= 2 && ini.p.length >= 2) {
      const d0 = Math.hypot(ini.p[1].x - ini.p[0].x, ini.p[1].y - ini.p[0].y), d1 = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
      const a0 = Math.atan2(ini.p[1].y - ini.p[0].y, ini.p[1].x - ini.p[0].x), a1 = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x)
      let rot = c0.rotacao + ((a1 - a0) * 180) / Math.PI
      if (Math.abs(((rot % 360) + 360) % 360) < 4 || Math.abs((((rot % 360) + 360) % 360) - 360) < 4) rot = 0
      const mx = (pts[0].x + pts[1].x) / 2 - (ini.p[0].x + ini.p[1].x) / 2, my = (pts[0].y + pts[1].y) / 2 - (ini.p[0].y + ini.p[1].y) / 2
      setCamadas((l) => l.map((c) => (c.id === c0.id ? ({ ...c, escala: limitar(c0.escala * (d1 / (d0 || 1)), 0.3, 6), rotacao: rot, x: c0.x + (mx / r.width) * 100, y: c0.y + (my / r.height) * 100 } as Camada) : c)))
      return
    }
    let x = c0.x + dx, y = c0.y + dy
    const v = Math.abs(x - 50) < 1.6, h = Math.abs(y - 50) < 1.2
    if (v) x = 50
    if (h) y = 50
    setGuias({ v, h })
    setCamadas((l) => l.map((c) => (c.id === c0.id ? ({ ...c, x: limitar(x, -10, 110), y: limitar(y, -6, 106) } as Camada) : c)))
    const lx = lixo.current?.getBoundingClientRect()
    setSobreLixo(!!lx && pts[0].x > lx.left - 20 && pts[0].x < lx.right + 20 && pts[0].y > lx.top - 30)
  }
  function soltar(e: PE<HTMLDivElement>) {
    const s = g.current
    if (!s) return
    s.ptrs.delete(e.pointerId)
    if (s.ptrs.size) { marcarInicio(); return }
    g.current = null
    setArrastando(false); setGuias({ v: false, h: false })
    if (sobreLixo && s.alvo !== 'midia') { aoRemover(s.alvo); setSobreLixo(false); navigator.vibrate?.(12); return }
    setSobreLixo(false)
    if (!s.moveu && performance.now() - s.t < 350) {
      if (s.alvo === 'midia') aoTocarFundo()
      else { const c = camadaDe(s.alvo); if (c) aoTocarCamada(c) }
    }
  }
  function roda(e: WE<HTMLDivElement>) {
    const el = (e.target as HTMLElement).closest('[data-camada]') as HTMLElement | null
    if (!el) return
    const id = el.dataset.camada!
    setCamadas((l) => l.map((c) => (c.id !== id ? c : e.shiftKey ? ({ ...c, rotacao: c.rotacao + e.deltaY * 0.15 } as Camada) : ({ ...c, escala: limitar(c.escala * (1 - e.deltaY * 0.0015), 0.3, 6) } as Camada))))
  }

  const fundo = midia.tipo === 'fundo' ? FUNDOS[midia.fundo ?? 0] : undefined
  return (
    <div className="est-palco" onPointerDown={baixar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar} onWheel={roda} onContextMenu={(e) => e.preventDefault()}>
      <div ref={quadro} className="sto-quadro est-quadro">
        {midia.tipo === 'video' && <video src={midia.local} autoPlay loop playsInline muted={semSom} style={estiloDaMidia(enq)} className="sto-midia" />}
        {midia.tipo === 'imagem' && <img src={midia.local} alt="" draggable={false} style={estiloDaMidia(enq)} className="sto-midia" />}
        {midia.tipo === 'fundo' && <div className="est-fundo" style={{ background: fundo }} />}
        <CamadasDoStory camadas={camadas} modo="editar" escondida={escondida} />
        {guias.v && <i className="est-guia v" />}
        {guias.h && <i className="est-guia h" />}
      </div>
      {children}
      {arrastando && <div ref={lixo} className={`est-lixo ${sobreLixo ? 'sobre' : ''}`}><Ico d={I.lixo} /></div>}
    </div>
  )
}

/* ============================================================== texto */
function EditorDeTexto({ inicial, aoConcluir }: { inicial: Camada; aoConcluir: (c: Camada | null) => void }) {
  const [c, setC] = useState(inicial as Extract<Camada, { tipo: 'texto' }>)
  const area = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => { window.setTimeout(() => area.current?.focus(), 30) }, [])
  useEffect(() => { const a = area.current; if (a) { a.style.height = 'auto'; a.style.height = `${a.scrollHeight}px` } }, [c.texto, c.fonte, c.escala])
  const fundoSeguinte: Record<FundoDoTexto, FundoDoTexto> = { nenhum: 'cor', cor: 'claro', claro: 'nenhum' }
  const alinharSeguinte: Record<string, 'center' | 'left' | 'right'> = { center: 'left', left: 'right', right: 'center' }
  const estilo = c.fundo === 'cor' ? { background: c.cor, color: contraste(c.cor) } : c.fundo === 'claro' ? { background: 'rgba(255,255,255,.88)', color: c.cor === '#FFFFFF' ? '#051528' : c.cor } : { color: c.cor }
  return (
    <div className="est-texto" onPointerDown={(e) => { if (e.target === e.currentTarget) aoConcluir(c) }}>
      <div className="est-texto-topo">
        <div className="est-fontes">
          {FONTES.map((f) => <button key={f.id} type="button" className={`f-${f.id} ${c.fonte === f.id ? 'on' : ''}`} onClick={() => setC({ ...c, fonte: f.id as FonteDoTexto })}>{f.nome}</button>)}
        </div>
        <button type="button" className="est-concluir" onClick={() => aoConcluir(c)}>Concluir</button>
      </div>
      <div className="est-texto-lado">
        <input type="range" min={40} max={300} value={Math.round(c.escala * 100)} onChange={(e) => setC({ ...c, escala: Number(e.target.value) / 100 })} aria-label="Tamanho do texto" />
      </div>
      <div className="sto-quadro est-texto-quadro">
        <div className={`cam-texto f-${c.fonte} fundo-${c.fundo} a-${c.alinhar} est-texto-caixa`} style={{ fontSize: `calc(${c.fonte === 'forte' ? 8.6 : 7.4}cqw * ${c.escala})` }}>
          <textarea ref={area} value={c.texto} rows={1} onChange={(e) => setC({ ...c, texto: e.target.value.slice(0, 220) })} placeholder="Escreva aqui"
            style={{ ...estilo, ['--cor' as string]: c.cor, textAlign: c.alinhar }} aria-label="Texto do story" />
        </div>
      </div>
      <div className="est-texto-pe">
        <button type="button" className="est-bt" onClick={() => setC({ ...c, alinhar: alinharSeguinte[c.alinhar] })} aria-label="Alinhamento"><Ico d={I.alinhar[c.alinhar]} /></button>
        <button type="button" className={`est-bt fundo-t ${c.fundo}`} onClick={() => setC({ ...c, fundo: fundoSeguinte[c.fundo] })} aria-label="Fundo do texto"><b>A</b></button>
        <div className="est-cores">{CORES.map((cor) => <button key={cor} type="button" className={c.cor === cor ? 'on' : ''} style={{ background: cor }} onClick={() => setC({ ...c, cor })} aria-label={`Cor ${cor}`} />)}</div>
      </div>
    </div>
  )
}

/* ============================================================== desenho */
function ModoDesenho({ camadas, aoConcluir }: { camadas: Camada[]; aoConcluir: (t: Traco[]) => void }) {
  const existente = camadas.find((c) => c.tipo === 'desenho') as Extract<Camada, { tipo: 'desenho' }> | undefined
  const [tracos, setTracos] = useState<Traco[]>(existente?.tracos ?? [])
  const [cor, setCor] = useState('#FFFFFF')
  const [largura, setLargura] = useState(1.4)
  const [marcador, setMarcador] = useState(false)
  const atual = useRef<{ pts: string[] } | null>(null)
  const [vivo, setVivo] = useState<string | null>(null)
  const sv = useRef<SVGSVGElement | null>(null)
  const ponto = (e: PE<SVGSVGElement>) => {
    const r = sv.current!.getBoundingClientRect()
    return `${(((e.clientX - r.left) / r.width) * 100).toFixed(2)} ${(((e.clientY - r.top) / r.height) * ALTURA_DO_QUADRO).toFixed(2)}`
  }
  return (
    <div className="est-desenho">
      <div className="est-texto-topo">
        <button type="button" className="est-bt" onClick={() => setTracos((t) => t.slice(0, -1))} disabled={!tracos.length} aria-label="Desfazer"><Ico d={I.desfazer} /></button>
        <div className="est-seg escuro">
          <button type="button" className={!marcador ? 'on' : ''} onClick={() => setMarcador(false)}>Caneta</button>
          <button type="button" className={marcador ? 'on' : ''} onClick={() => setMarcador(true)}>Marca-texto</button>
        </div>
        <button type="button" className="est-concluir" onClick={() => aoConcluir(tracos)}>Concluir</button>
      </div>
      <div className="est-texto-lado"><input type="range" min={4} max={60} value={Math.round(largura * 10)} onChange={(e) => setLargura(Number(e.target.value) / 10)} aria-label="Espessura" /></div>
      <div className="sto-quadro est-desenho-quadro">
        <svg ref={sv} viewBox={`0 0 100 ${ALTURA_DO_QUADRO}`} preserveAspectRatio="none"
          onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); atual.current = { pts: [ponto(e)] }; setVivo(`M${ponto(e)}`) }}
          onPointerMove={(e) => { if (!atual.current) return; atual.current.pts.push(ponto(e)); setVivo(`M${atual.current.pts.join(' L')}`) }}
          onPointerUp={() => { const a = atual.current; atual.current = null; setVivo(null); if (a && a.pts.length) setTracos((t) => [...t, { cor, largura: marcador ? largura * 2.6 : largura, marcador, d: `M${a.pts.join(' L')}${a.pts.length === 1 ? ' l0.01 0' : ''}` }]) }}>
          {tracos.map((t, i) => <path key={i} d={t.d} stroke={t.cor} strokeWidth={t.largura} strokeOpacity={t.marcador ? 0.55 : 1} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
          {vivo && <path d={vivo} stroke={cor} strokeWidth={marcador ? largura * 2.6 : largura} strokeOpacity={marcador ? 0.55 : 1} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      </div>
      <div className="est-texto-pe"><div className="est-cores">{CORES.map((c) => <button key={c} type="button" className={cor === c ? 'on' : ''} style={{ background: c }} onClick={() => setCor(c)} aria-label={`Cor ${c}`} />)}</div></div>
    </div>
  )
}

/* ============================================================== figurinhas */
function Folha({ titulo, aoFechar, children, alta }: { titulo: string; aoFechar: () => void; children: ReactNode; alta?: boolean }) {
  return (
    <div className="est-cortina" onPointerDown={(e) => { if (e.target === e.currentTarget) aoFechar() }}>
      <section className={`est-folha ${alta ? 'alta' : ''}`} role="dialog" aria-label={titulo}>
        <i className="est-alca" />
        <header><h3>{titulo}</h3><button type="button" className="est-x" onClick={aoFechar} aria-label="Fechar"><Ico d={I.fechar} /></button></header>
        <div className="est-folha-corpo">{children}</div>
      </section>
    </div>
  )
}

function Bandeja({ aoFechar, aoEscolher }: { aoFechar: () => void; aoEscolher: (o: string) => void }) {
  const [busca, setBusca] = useState('')
  const agora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const especiais: Array<{ id: string; tag: ReactNode }> = [
    { id: 'local', tag: <span className="cam-local e-branco est-amostra"><svg viewBox="0 0 24 24"><path d={I.pin} /><circle cx="12" cy="10" r="2.6" /></svg><span>Localização</span></span> },
    { id: 'link', tag: <span className="cam-link e-branco est-amostra"><svg viewBox="0 0 24 24"><path d={I.link} /></svg><span>Link</span></span> },
    { id: 'contagem', tag: <span className="est-amostra-card"><Ico d={I.relogio} />Contagem</span> },
    { id: 'enquete', tag: <span className="est-amostra-card"><Ico d={I.enquete} />Enquete</span> },
    { id: 'hora', tag: <span className="cam-hora e-branco est-amostra"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg><span>{agora}</span></span> },
  ]
  const termo = busca.trim().toLowerCase()
  return (
    <Folha titulo="Figurinhas" aoFechar={aoFechar} alta>
      <input className="est-busca" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar figurinha ou emoji" aria-label="Buscar figurinha" />
      {!termo && <div className="est-especiais">{especiais.map((s) => <button key={s.id} type="button" onClick={() => aoEscolher(s.id)}>{s.tag}</button>)}</div>}
      {(!termo || 'globalfly selo ao vivo novidade gold black prestige ia'.includes(termo)) && (
        <>
          <span className="est-grupo">Selos da GlobalFly</span>
          <div className="est-selos">
            {SELOS.filter((s) => !termo || s.nome.toLowerCase().includes(termo) || 'selo'.includes(termo)).map((s) => (
              <button key={s.id} type="button" onClick={() => aoEscolher(`selo:${s.id}`)} aria-label={s.nome}>
                <span className="est-selo-caixa"><span className={`cam-selo s-${s.id}`}>{s.id === 'gf' ? <img src={`${import.meta.env.BASE_URL}globalfly-gf-escuro.png`} alt="" /> : s.id === 'aovivo' ? <><i className="cam-pulso" />Ao vivo</> : s.id === 'ia' ? '✦ I.A. no ar' : s.nome}</span></span>
              </button>
            ))}
          </div>
        </>
      )}
      {EMOJIS.map((g) => (
        <div key={g.grupo}>
          {!termo && <span className="est-grupo">{g.grupo}</span>}
          <div className="est-emojis">{g.lista.filter(() => !termo || g.grupo.toLowerCase().includes(termo)).map((e) => <button key={e} type="button" onClick={() => aoEscolher(`emoji:${e}`)}>{e}</button>)}</div>
        </div>
      ))}
    </Folha>
  )
}

function FormLocal({ aoFechar, aoConcluir }: { aoFechar: () => void; aoConcluir: (t: string) => void }) {
  const [t, setT] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  function minha() {
    if (!navigator.geolocation) { setErro('Este aparelho não informa a localização.'); return }
    setBuscando(true); setErro(null)
    navigator.geolocation.getCurrentPosition(async (p) => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&accept-language=pt-BR&lat=${p.coords.latitude}&lon=${p.coords.longitude}`)
        const j = await r.json()
        const a = j.address ?? {}
        const cidade = a.city || a.town || a.village || a.municipality || a.county || ''
        const uf = (a['ISO3166-2-lvl4'] as string | undefined)?.split('-')[1] ?? a.state ?? ''
        setT([cidade, uf].filter(Boolean).join(', ') || j.name || '')
      } catch { setErro('Não consegui achar o nome do lugar. Escreva à mão.') } finally { setBuscando(false) }
    }, () => { setBuscando(false); setErro('Sem permissão para a localização. Escreva à mão.') }, { enableHighAccuracy: false, timeout: 8000 })
  }
  const sugestoes = LOCAIS.filter((l) => !t.trim() || l.toLowerCase().includes(t.trim().toLowerCase()))
  return (
    <Folha titulo="Localização" aoFechar={aoFechar}>
      <input className="est-campo" value={t} onChange={(e) => setT(e.target.value.slice(0, 40))} placeholder="Onde você está?" autoFocus aria-label="Local" />
      <button type="button" className="est-linha" onClick={minha} disabled={buscando}><Ico d={I.pin} />{buscando ? 'Procurando…' : 'Usar minha localização'}</button>
      {erro && <small className="est-nota erro">{erro}</small>}
      <div className="est-sugestoes">{sugestoes.map((l) => <button key={l} type="button" onClick={() => aoConcluir(l)}>{l}</button>)}</div>
      <button type="button" className="est-pronto" disabled={!t.trim()} onClick={() => aoConcluir(t.trim())}>Adicionar</button>
    </Folha>
  )
}

function FormLink({ aoFechar, aoConcluir }: { aoFechar: () => void; aoConcluir: (url: string, texto: string, acao: BotaoTipo | null) => void }) {
  const [aba, setAba] = useState<'site' | 'tela'>('site')
  const [url, setUrl] = useState('')
  const [texto, setTexto] = useState('')
  const [tela, setTela] = useState<BotaoTipo>('aula')
  const final = /^https?:\/\//i.test(url.trim()) ? url.trim() : url.trim() ? `https://${url.trim()}` : ''
  const valido = aba === 'tela' || /^https?:\/\/[^\s.]+\.[^\s]{2,}/i.test(final)
  return (
    <Folha titulo="Link" aoFechar={aoFechar}>
      <div className="est-seg largo"><button type="button" className={aba === 'site' ? 'on' : ''} onClick={() => setAba('site')}>Endereço</button><button type="button" className={aba === 'tela' ? 'on' : ''} onClick={() => setAba('tela')}>Tela da plataforma</button></div>
      {aba === 'site' ? (
        <>
          <label className="est-rot">URL</label>
          <input className="est-campo" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://exemplo.com" inputMode="url" autoFocus autoCapitalize="none" aria-label="Endereço" />
        </>
      ) : (
        <div className="est-chips">{TELAS.map((t) => <button key={t.id} type="button" className={tela === t.id ? 'on' : ''} onClick={() => setTela(t.id)}>{t.nome}</button>)}</div>
      )}
      <label className="est-rot">Texto da figurinha <small>Opcional</small></label>
      <input className="est-campo" value={texto} onChange={(e) => setTexto(e.target.value.slice(0, 30))} placeholder={aba === 'site' ? (final ? final.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : 'Ex.: Saiba mais') : BOTAO_PADRAO[tela]} aria-label="Texto da figurinha" />
      <div className="est-previa-fig">
        <span className="cam-link e-branco est-amostra"><svg viewBox="0 0 24 24"><path d={I.link} /></svg><span>{texto.trim() || (aba === 'site' ? (final ? final.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : 'exemplo.com') : BOTAO_PADRAO[tela])}</span></span>
      </div>
      <button type="button" className="est-pronto" disabled={!valido} onClick={() => aoConcluir(aba === 'site' ? final : '', texto.trim() || (aba === 'tela' ? BOTAO_PADRAO[tela] : ''), aba === 'tela' ? tela : null)}>Adicionar ao story</button>
    </Folha>
  )
}

function FormContagem({ aoFechar, aoConcluir }: { aoFechar: () => void; aoConcluir: (t: string, ate: string) => void }) {
  const [t, setT] = useState('Live hoje')
  const [ate, setAte] = useState(paraInput(new Date(proximaLive())))
  return (
    <Folha titulo="Contagem regressiva" aoFechar={aoFechar}>
      <label className="est-rot">Nome</label>
      <input className="est-campo" value={t} onChange={(e) => setT(e.target.value.slice(0, 40))} placeholder="Ex.: Live de lançamento" aria-label="Nome da contagem" />
      <label className="est-rot">Termina em</label>
      <input className="est-campo" type="datetime-local" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Data e hora" />
      <button type="button" className="est-pronto" disabled={!ate || Date.parse(ate) < Date.now()} onClick={() => aoConcluir(t.trim(), new Date(ate).toISOString())}>Adicionar</button>
    </Folha>
  )
}

function FormEnquete({ inicial, aoFechar, aoConcluir, aoRemover }: { inicial?: Extract<Camada, { tipo: 'enquete' }>; aoFechar: () => void; aoConcluir: (p: string, o: string[]) => void; aoRemover?: () => void }) {
  const [p, setP] = useState(inicial?.pergunta ?? '')
  const [o, setO] = useState<string[]>(inicial?.opcoes ?? ['Sim', 'Não'])
  return (
    <Folha titulo="Enquete" aoFechar={aoFechar}>
      <input className="est-campo grande" value={p} onChange={(e) => setP(e.target.value.slice(0, 80))} placeholder="Faça uma pergunta…" autoFocus aria-label="Pergunta" />
      {o.map((v, i) => (
        <div key={i} className="est-opcao">
          <input className="est-campo" value={v} onChange={(e) => setO((l) => l.map((x, j) => (j === i ? e.target.value.slice(0, 24) : x)))} placeholder={`Opção ${i + 1}`} aria-label={`Opção ${i + 1}`} />
          {o.length > 2 && <button type="button" className="est-x" onClick={() => setO((l) => l.filter((_, j) => j !== i))} aria-label="Tirar opção"><Ico d={I.fechar} /></button>}
        </div>
      ))}
      {o.length < 4 && <button type="button" className="est-linha" onClick={() => setO((l) => [...l, ''])}>+ Mais uma opção</button>}
      <button type="button" className="est-pronto" disabled={o.filter((x) => x.trim()).length < 2} onClick={() => aoConcluir(p.trim(), o.map((x) => x.trim()).filter(Boolean))}>{inicial ? 'Salvar' : 'Adicionar'}</button>
      {aoRemover && <button type="button" className="est-perigo" onClick={aoRemover}>Tirar a enquete</button>}
    </Folha>
  )
}

/** Atalho: abre o estúdio por cima de qualquer tela (Início ou Administração). */
export function useEstudio() {
  const [aberto, setAberto] = useState(false)
  return useMemo(() => ({ aberto, abrir: () => setAberto(true), fechar: () => setAberto(false) }), [aberto])
}
