import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as PE, type ReactNode, type WheelEvent as WE } from 'react'
import { createPortal } from 'react-dom'
import type { SessaoTeeds } from '../../core/teeds/conta'
import type { PapelDoAdmin } from '../../core/teeds/parceiroEmFoco'
import { useParceirosDaMarca } from '../../core/teeds/parceiroEmFoco'
import { MARCA } from '../../marca'
import {
  ALTURA_DO_QUADRO, CORES, EMOJIS, FONTES, IAS, carregarFontesDosStories, contraste, fotoDaIA, nomeDeMencao, nova, proximaLive, proximaMoldura, proximoEstilo, proximoEstiloIA, rotuloDasCamadas,
  type Camada, type FonteDoTexto, type FundoDoTexto, type IdDaIA, type Selo, type Traco,
} from '../../core/teeds/camadas'
import { BOTAO_PADRAO, buscarMembros, enviarArquivo, perfisDoPainel, LIMITE_SEGUNDOS, type BotaoTipo, type Enquadramento, type PerfilDoPainel, type Publico, type Story } from '../../core/teeds/stories'
import { descartar, iniciarFundo, iniciarMidia, publicar as publicarTrabalho, tentarDeNovo, useTrabalho } from '../../core/teeds/publicacaoDeStories'
import { CamadasDoStory } from './CamadasDoStory'
import { LogotipoDaIA } from '../marca/LogotipoDaIA'
import { useTecladoVirtual, useVoltarFecha } from '../../core/telaDeApp'
import { Avatar, estiloDaMidia, VisualizadorDeStories } from './VisualizadorDeStories'
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
  maos: 'M8 13V5.5a1.5 1.5 0 013 0V11M11 10.5V4a1.5 1.5 0 013 0v6.5M14 10.5V5.5a1.5 1.5 0 013 0V13M17 11.5a1.5 1.5 0 013 0V15a7 7 0 01-7 7h-1.5a6.5 6.5 0 01-5.6-3.2L4 14.5a1.5 1.5 0 012.6-1.5L8 15',
  cadeado: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 017 0v3', raio: 'M13 2L4 14h7l-1 8 9-12h-7z',
}

/* ============================================================== o estúdio */
export function EstudioDeStories({ sessao, papel, aoFechar, aoPublicado, fotoDeExemplo }: Props) {
  const [etapa, setEtapa] = useState<Etapa>(fotoDeExemplo ? 'editar' : 'camera')
  const [midia, setMidia] = useState<Midia | null>(fotoDeExemplo ? { tipo: 'imagem', local: fotoDeExemplo } : null)
  const [camadas, setCamadas] = useState<Camada[]>([])
  const camadasRef = useRef<Camada[]>([])
  camadasRef.current = camadas
  const [enq, setEnq] = useState<Enquadramento>({ zoom: 1, x: 50, y: 50 })
  const [semSom, setSemSom] = useState(false)
  const [painel, setPainel] = useState<null | 'figurinhas' | 'local' | 'link' | 'contagem' | 'enquete' | 'mencao' | 'opcoes' | 'sair'>(null)
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

  useEffect(() => { carregarFontesDosStories() }, [])
  useTecladoVirtual()
  useVoltarFecha(aoFechar)
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
    return () => { document.body.style.overflow = antes }
  }, [])

  const avisarRapido = useCallback((t: string) => { setRecado(t); window.setTimeout(() => setRecado((r) => (r === t ? null : r)), 2400) }, [])

  /* ------------------------------------------------ mídia: preparar e subir já (em segundo plano) */
  const [trabalhoId, setTrabalhoId] = useState<string | null>(null)
  const trabalho = useTrabalho(trabalhoId)
  const publicado = useRef(false)
  // fechou sem publicar: o envio em andamento é descartado
  useEffect(() => () => { if (!publicado.current && trabalhoRef.current) descartar(trabalhoRef.current) }, [])
  const trabalhoRef = useRef<string | null>(null)
  useEffect(() => { trabalhoRef.current = trabalhoId }, [trabalhoId])
  useEffect(() => { if (trabalho?.aviso) avisarRapido(trabalho.aviso) }, [trabalho?.aviso]) // eslint-disable-line react-hooks/exhaustive-deps

  function receber(arquivo: File | Blob, nome = 'story') {
    const f = arquivo instanceof File ? arquivo : new File([arquivo], nome, { type: arquivo.type })
    const ehFoto = f.type.startsWith('image/') || /\.(hei[cf]|jpe?g|png|webp)$/i.test(f.name)
    if (trabalhoRef.current) descartar(trabalhoRef.current)
    setMidia({ tipo: ehFoto ? 'imagem' : 'video', local: URL.createObjectURL(f), arquivo: f })
    setEnq({ zoom: 1, x: 50, y: 50 }); setCamadas([]); setSemSom(false)
    setEtapa('editar')
    setTrabalhoId(iniciarMidia(sessao, f, nome))
  }
  function modoTexto() {
    if (trabalhoRef.current) descartar(trabalhoRef.current)
    setTrabalhoId(null)
    setMidia({ tipo: 'fundo', local: '', fundo: 0 })
    setCamadas([]); setEnq({ zoom: 1, x: 50, y: 50 })
    setEtapa('editar')
    window.setTimeout(() => setEditandoTexto(nova.texto('', '#FFFFFF')), 60)
  }

  /** O fundo do modo Texto vira uma foto 1080 x 1920 na hora de publicar. */
  function gerarFundo(i: number) {
    return () => new Promise<Blob>((ok, falha) => {
      const c = document.createElement('canvas'); c.width = 1080; c.height = 1920
      const g = c.getContext('2d')!
      const [a, b] = PARES_DOS_FUNDOS[i] ?? PARES_DOS_FUNDOS[0]
      const gr = g.createLinearGradient(0, 0, 1080, 1920); gr.addColorStop(0, a); gr.addColorStop(1, b)
      g.fillStyle = gr; g.fillRect(0, 0, 1080, 1920)
      c.toBlob((x) => (x ? ok(x) : falha(new Error('Não consegui montar o fundo.'))), 'image/jpeg', 0.9)
    })
  }

  /* ------------------------------------------------ publicar: o estúdio fecha na hora */
  const publico: Publico = paraQuem === 'admins' ? { so_admins: true }
    : subplanos.length || parcs.length || meuParceiro ? { subplanos, parceiros: meuParceiro ? [meuParceiro] : parcs } : { todos: true }
  const perfil = perfis.find((p) => p.id === perfilId)

  /* ------------------------------------------------ a prévia: como os clientes vão ver, antes de postar */
  const [previa, setPrevia] = useState<Story | null>(null)
  async function abrirPrevia() {
    if (!midia) return
    if (!perfilId) { avisarRapido('Escolha a bolinha do story.'); return }
    let url = midia.local
    if (midia.tipo === 'fundo') { try { url = URL.createObjectURL(await gerarFundo(midia.fundo ?? 0)()) } catch { url = '' } }
    setPrevia({
      id: 'previa', codigo: 'previa', tipo: midia.tipo === 'video' ? 'video' : 'imagem', midia: url, capa: null,
      duracao: midia.tipo === 'video' ? (trabalho?.duracao ?? 15) : 6, enquadramento: { ...enq, ...(semSom ? { mudo: true } : {}) },
      chip: null, titulo: null, subtitulo: null, quando: new Date().toISOString(), destaque: fixo, compartilhar, responder,
      visto: false, reacao: null, botao: null, publico, camadas, votos: null, meuVoto: null,
    })
  }
  const rotuloPara = paraQuem === 'admins' ? 'Só admins' : meuParceiro ? 'Meus clientes' : subplanos.length || parcs.length ? 'Público escolhido' : 'Todos'

  async function publicar() {
    if (publicando || !midia) return
    if (subindoFotos.current.size) { setPublicando(true); await Promise.all(subindoFotos.current.values()); setPublicando(false) }
    if (!perfilId) { avisarRapido('Escolha a bolinha do story.'); return }
    if (trabalho?.fase === 'erro') { tentarDeNovo(trabalho.id); avisarRapido('Tentando de novo…'); return }
    const id = midia.tipo === 'fundo' ? iniciarFundo(sessao, gerarFundo(midia.fundo ?? 0)) : trabalhoId
    if (!id) return
    setPublicando(true)
    const parceiro = publico.parceiros?.length === 1 && publico.parceiros[0] !== 'direto' ? publico.parceiros[0] : null
    publicarTrabalho(id, {
      perfil_id: perfilId, enquadramento: { ...enq, ...(semSom ? { mudo: true } : {}) }, camadas: camadasParaSalvar(camadasRef.current),
      chip: '', titulo: '', subtitulo: '', botao_tipo: '', botao_texto: '', botao_destino: '', publico,
      inicia_em: quando === 'agendar' ? new Date(inicio).toISOString() : null, expira_em: null, destaque: fixo, compartilhar, responder,
    }, perfil ? { nome: perfil.nome, foto: perfil.foto_url } : null,
    avisar && pleno && quando === 'agora' && paraQuem === 'todos'
      ? { titulo: `${perfil?.nome ?? MARCA.prosa} postou um story`, corpo: rotuloDasCamadas(camadas) ?? 'Toque para ver na Início.', parceiro } : null)
    publicado.current = true
    aoPublicado?.(id)
    aoFechar()
  }

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
  /* foto por cima (como no Instagram): aparece na hora e sobe em segundo plano */
  const fotoPorCima = useRef<HTMLInputElement | null>(null)
  const subindoFotos = useRef(new Map<string, Promise<void>>())
  async function adicionarFoto(f: File | undefined) {
    if (!f) return
    try {
      let fonte: Blob = f
      if (/heic|heif/i.test(f.type) || /\.hei[cf]$/i.test(f.name)) { const heic2any = (await import('heic2any')).default; fonte = (await heic2any({ blob: f, toType: 'image/jpeg', quality: 0.9 })) as Blob }
      const bmp = await createImageBitmap(fonte)
      const esc = Math.min(1, 1080 / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * esc); c.height = Math.round(bmp.height * esc)
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
      const jpg = await new Promise<Blob>((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Não consegui ler a foto.'))), 'image/jpeg', 0.88))
      const camada = nova.imagem('', URL.createObjectURL(jpg), c.width / c.height)
      adicionar(camada)
      const envio = enviarArquivo(sessao, `${MARCA.id}/camadas/${Date.now().toString(36)}${camada.id}.jpg`, jpg, 'image/jpeg').promessa
        .then((url) => { setCamadas((l) => l.map((x) => (x.id === camada.id ? ({ ...x, url } as Camada) : x))) })
        .catch(() => { avisarRapido('A foto não subiu. Tire e adicione de novo.') })
        .finally(() => subindoFotos.current.delete(camada.id))
      subindoFotos.current.set(camada.id, envio)
    } catch (e) { avisarRapido((e as Error).message) }
  }
  /** O que vai para o banco: sem as URLs locais das fotos e sem foto que não subiu. */
  const camadasParaSalvar = (l: Camada[]) => l.filter((c) => c.tipo !== 'imagem' || !!c.url).map((c) => (c.tipo === 'imagem' ? ({ ...c, local: undefined } as Camada) : c))

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
    else if (c.tipo === 'ia') atualizar(c.id, { estilo: proximoEstiloIA(c.estilo) } as Partial<Camada>)
    else if (c.tipo === 'mencao') atualizar(c.id, { estilo: proximoEstilo(c.estilo) } as Partial<Camada>)
    else if (c.tipo === 'imagem') atualizar(c.id, { moldura: proximaMoldura(c.moldura) } as Partial<Camada>)
  }

  const mudou = camadas.length > 0 || !!midia
  const fechar = () => { if (mudou && etapa === 'editar') setPainel('sair'); else aoFechar() }

  const conteudo = (
    <div className={`est ${etapa}`} role="dialog" aria-modal="true" aria-label="Criar story">
      {etapa === 'camera' && <Camera aoCapturar={(b, n) => receber(b, n)} aoTexto={modoTexto} aoFechar={aoFechar} />}

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
          {trabalho && (trabalho.fase === 'preparando' || trabalho.fase === 'enviando' || trabalho.fase === 'erro') && !editandoTexto && (
            <div className={`est-envio ${trabalho.fase}`}>
              {trabalho.fase === 'erro' ? <>{trabalho.erro}<button type="button" onClick={() => tentarDeNovo(trabalho.id)}>Tentar de novo</button></>
                : <><i style={{ ['--f' as string]: `${Math.round(trabalho.total * 100)}%` }} />{trabalho.fase === 'preparando' ? (trabalho.tipo === 'video' ? 'Preparando o vídeo' : 'Preparando a foto') : 'Subindo'} · {Math.round(trabalho.total * 100)}%</>}
            </div>
          )}
        </Editor>
      )}

      {etapa === 'editar' && editandoTexto && <EditorDeTexto inicial={editandoTexto} aoConcluir={concluirTexto} buscar={(t) => buscarMembros(sessao, t)} />}
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
          <button type="button" className={`est-enviar ${publicando ? 'indo' : ''}`} onClick={() => void abrirPrevia()} disabled={publicando} aria-label="Ver a prévia">
            {publicando ? <span className="est-gira" /> : <Ico d={I.seta} />}
          </button>
        </div>
      )}

      {/* painéis */}
      {painel === 'figurinhas' && (
        <Bandeja aoFechar={() => setPainel(null)}
          aoEscolher={(o) => {
            if (o === 'local' || o === 'link' || o === 'contagem' || o === 'enquete' || o === 'mencao') { setEditandoEnquete(null); setPainel(o); return }
            if (o === 'foto') { setPainel(null); fotoPorCima.current?.click(); return }
            if (o.startsWith('ia:')) { setPainel(null); adicionar(nova.ia(o.slice(3) as IdDaIA)); return }
            setPainel(null)
            if (o === 'hora') adicionar(nova.hora())
            else if (o.startsWith('selo:')) adicionar(nova.selo(o.slice(5) as Selo))
            else adicionar(nova.emoji(o.slice(6)))
          }} />
      )}
      {painel === 'mencao' && <FormMencao sessao={sessao} aoFechar={() => setPainel(null)} aoConcluir={(nome, id) => { setPainel(null); adicionar(nova.mencao(nome, id)) }} />}
      <input ref={fotoPorCima} type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => { void adicionarFoto(e.target.files?.[0]); e.target.value = '' }} />
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
          <button type="button" className="est-perigo" onClick={() => { if (trabalhoId) descartar(trabalhoId); aoFechar() }}>Descartar</button>
          <button type="button" className="est-pronto claro" onClick={() => { setPainel(null); setEtapa('camera'); setMidia(null); if (trabalhoId) descartar(trabalhoId); setTrabalhoId(null); setCamadas([]) }}>Voltar para a câmera</button>
          <button type="button" className="est-pronto claro" onClick={() => setPainel(null)}>Continuar editando</button>
        </Folha>
      )}
      {recado && <div className="est-recado" role="status">{recado}</div>}
      {previa && perfil && (
        <VisualizadorDeStories
          perfis={[{ id: perfil.id, nome: perfil.nome, foto: perfil.foto_url, oficial: perfil.oficial, ordem: 0, parceiro: perfil.parceiro, itens: [previa] }]}
          perfilInicial={0} sessao={null} previa equipe={paraQuem === 'admins'} classe="est-previa" aoFechar={() => setPrevia(null)}
          rodape={
            <div className="est-previa-pe">
              <button type="button" className="est-previa-editar" onClick={() => setPrevia(null)}><Ico d={I.voltar} />Editar</button>
              <button type="button" className="est-previa-para" onClick={() => { setPrevia(null); setPainel('opcoes') }} title="Mudar quem vê">
                <span className="sto-anel"><Avatar foto={perfil.foto_url} nome={perfil.nome} tamanho={26} /></span>
                <span><small>{quando === 'agendar' ? `Agendado · ${new Date(inicio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : fixo ? 'Fixo' : '24 horas'}</small><b>{rotuloPara}</b></span>
              </button>
              <button type="button" className="est-previa-publicar" onClick={() => { setPrevia(null); void publicar() }}>
                {quando === 'agendar' ? 'Agendar' : 'Publicar'}<Ico d={I.seta} />
              </button>
            </div>
          }
        />
      )}
    </div>
  )
  return createPortal(conteudo, document.body)
}

/* ============================================================== câmera */
/*
 * A câmera do estúdio, no jeito do Instagram (09/11/2026, Tiago: "quando eu seguro a bolinha pra gravar
 * eu não consigo dar zoom apenas ao arrastar o dedo pra cima ou pra baixo... também não consigo mãos livres"):
 *  - toque = foto; segurar = vídeo; segurando, arrastar para cima/baixo = zoom; arrastar até o cadeado = trava;
 *  - mãos livres (toque começa, toque para) e temporizador de 3 ou 10 s;
 *  - pinça com dois dedos = zoom; toque duplo = trocar frente/trás, também no meio da gravação (o vídeo
 *    continua no mesmo arquivo e o som não para: só a imagem troca de lente); lanterna quando o aparelho deixa.
 * Zoom: o da própria lente (track zoom) quando o aparelho oferece; senão digital, e aí a gravação passa
 * por um canvas para o zoom entrar no vídeo também.
 */
interface CapacidadesDaCamera { zoom: { min: number; max: number } | null; lanterna: boolean }
const ZOOM_DIGITAL_MAX = 4

function Camera({ aoCapturar, aoTexto, aoFechar }: { aoCapturar: (b: Blob, nome: string) => void; aoTexto: () => void; aoFechar: () => void }) {
  const video = useRef<HTMLVideoElement | null>(null)
  const fluxo = useRef<MediaStream | null>(null)
  const gravador = useRef<MediaRecorder | null>(null)
  const pedacos = useRef<Blob[]>([])
  const desenho = useRef<{ raf: number; canvas: HTMLCanvasElement } | null>(null)
  const [frente, setFrente] = useState(false)
  const [estado, setEstado] = useState<'abrindo' | 'pronta' | 'sem' | 'negada'>('abrindo')
  const [gravando, setGravando] = useState(false)
  const [travado, setTravado] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [flash, setFlash] = useState(false)
  const [maosLivres, setMaosLivres] = useState(false)
  const [temporizador, setTemporizador] = useState<0 | 3 | 10>(0)
  const [contando, setContando] = useState<number | null>(null)
  const [lanterna, setLanterna] = useState(false)
  const [cap, setCap] = useState<CapacidadesDaCamera>({ zoom: null, lanterna: false })
  const capRef = useRef(cap)
  capRef.current = cap
  // virando a câmera no meio da gravação: o canvas segura o último quadro até a outra lente responder
  const virando = useRef(false)
  const [girou, setGirou] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [rotulo, setRotulo] = useState<string | null>(null)
  const zoomRef = useRef(1)
  const segura = useRef<{ t: number; timer: number; y: number; x: number; z0: number } | null>(null)
  const pinca = useRef<{ ptrs: Map<number, { x: number; y: number }>; d0: number; z0: number } | null>(null)
  const ultimoToque = useRef(0)
  const galeria = useRef<HTMLInputElement | null>(null)
  const nativa = useRef<HTMLInputElement | null>(null)
  const celular = toque()
  const iphone = typeof navigator !== 'undefined' && /iPhone|iPad/.test(navigator.userAgent)

  const zMin = cap.zoom?.min ?? 1
  const zMax = cap.zoom ? Math.min(cap.zoom.max, 10) : ZOOM_DIGITAL_MAX

  useEffect(() => {
    let vivo = true
    const restr: MediaTrackConstraints = { facingMode: frente ? 'user' : 'environment', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
    // a permissão pode ficar pendurada (navegador embutido, aviso ignorado): em 5 s mostra as outras opções
    const comPrazo = (c: MediaStreamConstraints) => Promise.race([navigator.mediaDevices.getUserMedia(c), new Promise<never>((_, falha) => window.setTimeout(() => falha(new Error('prazo')), 5000))])

    // virar a câmera troca só a imagem: o microfone continua ligado (09/11/2026, Tiago: "quando tiver gravando...
    // clica 2x na tela e inverte"). Gravando, o gravador segue o mesmo; parado, também evita um novo pedido de
    // permissão no iPhone, que pergunta de novo quando nada está capturando ("está pedindo toda vez")
    const gravandoAgora = gravador.current?.state === 'recording'
    if (fluxo.current && (gravandoAgora || fluxo.current.getAudioTracks().some((t) => t.readyState === 'live'))) {
      const antigo = fluxo.current
      const sons = antigo.getAudioTracks()
      virando.current = true
      // o iPhone só deixa uma câmera ligada por vez: desliga a imagem atual antes de pedir a outra
      antigo.getVideoTracks().forEach((t) => t.stop())
      const trocar = async () => {
        let s: MediaStream | null = null
        try { s = await comPrazo({ video: restr }) } catch { s = null }
        if (!vivo) { s?.getTracks().forEach((t) => t.stop()); return }
        if (!s) {
          virando.current = false
          if (gravandoAgora) { mostrarRotulo('Não deu para virar a câmera'); parar() }
          else { sons.forEach((t) => t.stop()); setEstado('sem') }
          return
        }
        const novo = new MediaStream([...s.getVideoTracks(), ...sons])
        fluxo.current = novo
        const trilha = s.getVideoTracks()[0]
        const c = (trilha?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { zoom?: { min: number; max: number }; torch?: boolean }
        const nativo = c.zoom && c.zoom.max > c.zoom.min ? { min: c.zoom.min, max: c.zoom.max } : null
        setCap({ zoom: nativo, lanterna: !!c.torch })
        zoomRef.current = nativo?.min ?? 1; setZoom(zoomRef.current); setLanterna(false)
        const v = video.current
        if (v) {
          v.srcObject = novo
          await v.play().catch(() => undefined)
          // espera o primeiro quadro da outra lente (até 1,5 s) para o vídeo não pegar tela preta
          const t0 = performance.now()
          while (vivo && (!v.videoWidth || v.readyState < 2) && performance.now() - t0 < 1500) await new Promise((r) => window.setTimeout(r, 30))
        }
        virando.current = false
      }
      void trocar()
      return () => { vivo = false }
    }

    setEstado('abrindo')
    const abrir = async () => {
      fluxo.current?.getTracks().forEach((t) => t.stop())
      if (!navigator.mediaDevices?.getUserMedia) { setEstado('sem'); return }
      let s: MediaStream | null = null
      let negada = false
      // áudio cru, como uma câmera (09/11/2026, Tiago: "o microfone está muito ruim... qualidade horrível"):
      // cancelamento de eco e redução de ruído ligam no iPhone o processamento de chamada de voz, baixo e abafado
      const audio: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 } }
      try { s = await comPrazo({ video: restr, audio }) }
      catch (e) {
        negada = (e as Error).name === 'NotAllowedError'
        if ((e as Error).message !== 'prazo') { try { s = await comPrazo({ video: restr }) } catch (e2) { negada = negada || (e2 as Error).name === 'NotAllowedError'; s = null } }
      }
      if (!vivo) { s?.getTracks().forEach((t) => t.stop()); return }
      if (!s) { setEstado(negada ? 'negada' : 'sem'); return }
      fluxo.current = s
      const trilha = s.getVideoTracks()[0]
      const c = (trilha?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { zoom?: { min: number; max: number }; torch?: boolean }
      const nativo = c.zoom && c.zoom.max > c.zoom.min ? { min: c.zoom.min, max: c.zoom.max } : null
      setCap({ zoom: nativo, lanterna: !!c.torch })
      zoomRef.current = nativo?.min ?? 1; setZoom(zoomRef.current); setLanterna(false)
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => undefined) }
      setEstado('pronta')
    }
    void abrir()
    return () => { vivo = false }
  }, [frente])
  useEffect(() => () => {
    fluxo.current?.getTracks().forEach((t) => t.stop())
    if (gravador.current?.state === 'recording') gravador.current.stop()
    if (desenho.current) cancelAnimationFrame(desenho.current.raf)
  }, [])

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

  const mostrarRotulo = (t: string) => { setRotulo(t); window.setTimeout(() => setRotulo((r) => (r === t ? null : r)), 1400) }

  /* ---------------------------------------------- zoom */
  const pendente = useRef<number | null>(null)
  function aplicarZoom(z: number) {
    const v = Math.min(zMax, Math.max(zMin, z))
    zoomRef.current = v
    setZoom(v)
    if (cap.zoom) {
      // a lente responde devagar: um pedido por quadro
      if (pendente.current === null) pendente.current = requestAnimationFrame(() => {
        pendente.current = null
        const t = fluxo.current?.getVideoTracks()[0]
        void t?.applyConstraints({ advanced: [{ zoom: zoomRef.current } as MediaTrackConstraintSet] }).catch(() => undefined)
      })
    }
  }
  const zoomDigital = !cap.zoom && zoom > 1.001

  /* ---------------------------------------------- foto e vídeo */
  function foto() {
    const v = video.current
    if (!v || !v.videoWidth) return
    setFlash(true); window.setTimeout(() => setFlash(false), 180)
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight
    const g = c.getContext('2d')!
    if (frente) { g.translate(c.width, 0); g.scale(-1, 1) }
    const z = cap.zoom ? 1 : zoomRef.current
    const sw = v.videoWidth / z, sh = v.videoHeight / z
    g.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, 0, 0, c.width, c.height)
    c.toBlob((b) => { if (b) aoCapturar(b, 'foto.jpg') }, 'image/jpeg', 0.95)
  }
  /**
   * O vídeo passa por um canvas: assim o zoom digital entra na gravação, a câmera da frente sai sem espelho
   * e dá para trocar de lente no meio sem parar o gravador (o canvas segue o mesmo; só muda o que se desenha nele).
   * Sem canvas no navegador, grava direto da câmera (aí o toque duplo não vira no meio).
   */
  function fluxoParaGravar(): MediaStream | null {
    const s = fluxo.current, v = video.current
    if (!s || !v) return null
    const podeCanvas = typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype
    if (!podeCanvas || !v.videoWidth) return s
    const c = document.createElement('canvas')
    const escala = Math.min(1, 1920 / Math.max(v.videoWidth, v.videoHeight))
    c.width = Math.round(v.videoWidth * escala); c.height = Math.round(v.videoHeight * escala)
    const g = c.getContext('2d')!
    const quadro = () => {
      // durante a troca de lente fica o último quadro (sem tela preta no vídeo)
      if (!virando.current && v.videoWidth && v.readyState >= 2) {
        // o zoom da própria lente já vem na imagem; o digital entra aqui. "Cobrir" o canvas, caso a outra lente tenha outra proporção
        const z = capRef.current.zoom ? 1 : zoomRef.current
        const k = Math.max(c.width / v.videoWidth, c.height / v.videoHeight) * z
        const sw = c.width / k, sh = c.height / k
        g.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, 0, 0, c.width, c.height)
      }
      if (desenho.current) desenho.current.raf = requestAnimationFrame(quadro)
    }
    desenho.current = { raf: requestAnimationFrame(quadro), canvas: c }
    const saida = (c as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30)
    s.getAudioTracks().forEach((t) => saida.addTrack(t))
    return saida
  }
  function gravar() {
    const s = fluxoParaGravar()
    if (!s || typeof MediaRecorder === 'undefined') { foto(); return }
    const tipos = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
    const mime = tipos.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
    const r = new MediaRecorder(s, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 160_000 })
    pedacos.current = []
    r.ondataavailable = (e) => { if (e.data.size) pedacos.current.push(e.data) }
    r.onstop = () => {
      if (desenho.current) { cancelAnimationFrame(desenho.current.raf); desenho.current = null }
      const b = new Blob(pedacos.current, { type: r.mimeType || mime || 'video/webm' })
      if (b.size) aoCapturar(b, /mp4/.test(b.type) ? 'video.mp4' : 'video.webm')
    }
    r.start(250)
    gravador.current = r
    setSegundos(0); setGravando(true)
  }
  function parar() {
    if (gravador.current?.state === 'recording') gravador.current.stop()
    setGravando(false); setTravado(false)
  }
  function comecarContagem() {
    let n = temporizador
    setContando(n)
    const t = window.setInterval(() => {
      n -= 1
      if (n <= 0) { window.clearInterval(t); setContando(null); gravar(); setTravado(true) }
      else setContando(n)
    }, 1000)
    contagem.current = t
  }
  const contagem = useRef<number | null>(null)

  /* ---------------------------------------------- o botão (toque, segurar, arrastar) */
  function apertar(e: PE<HTMLButtonElement>) {
    e.preventDefault()
    if (estado !== 'pronta') { nativa.current?.click(); return }
    if (contando !== null) { if (contagem.current) window.clearInterval(contagem.current); setContando(null); return }
    if (gravando && (travado || maosLivres)) { parar(); return }
    if (maosLivres || temporizador) {
      if (temporizador) comecarContagem(); else { gravar(); setTravado(true) }
      return
    }
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* já solto */ }
    segura.current = { t: performance.now(), timer: window.setTimeout(gravar, 260), y: e.clientY, x: e.clientX, z0: zoomRef.current }
  }
  function moverNoBotao(e: PE<HTMLButtonElement>) {
    const s = segura.current
    if (!s || !gravando || travado) return
    // para cima = mais zoom; meia tela de arrasto vai do mínimo ao máximo
    const dy = s.y - e.clientY
    aplicarZoom(s.z0 + (dy / (window.innerHeight * 0.45)) * (zMax - zMin))
    // para o lado até o cadeado = trava a gravação
    if (e.clientX - s.x > 72 && Math.abs(dy) < 90) { setTravado(true); segura.current = null; mostrarRotulo('Gravação travada') }
  }
  function soltar() {
    const s = segura.current
    segura.current = null
    if (!s) return
    window.clearTimeout(s.timer)
    if (gravando && !travado) parar()
    else if (!gravando && performance.now() - s.t < 260) foto()
  }

  /* ---------------------------------------------- pinça e toque duplo na imagem */
  function tocarImagem(e: PE<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button, input')) return
    const p = pinca.current ?? { ptrs: new Map(), d0: 0, z0: zoomRef.current }
    p.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (p.ptrs.size === 2) { const [a, b] = [...p.ptrs.values()]; p.d0 = Math.hypot(a.x - b.x, a.y - b.y); p.z0 = zoomRef.current }
    pinca.current = p
    if (p.ptrs.size === 1) {
      const agora = performance.now()
      if (agora - ultimoToque.current < 300) { virarCamera(); ultimoToque.current = 0 } else ultimoToque.current = agora
    }
  }
  function moverImagem(e: PE<HTMLDivElement>) {
    const p = pinca.current
    if (!p || !p.ptrs.has(e.pointerId)) return
    p.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (p.ptrs.size >= 2 && p.d0) { const [a, b] = [...p.ptrs.values()]; aplicarZoom(p.z0 * (Math.hypot(a.x - b.x, a.y - b.y) / p.d0)) }
  }
  function soltarImagem(e: PE<HTMLDivElement>) {
    const p = pinca.current
    if (!p) return
    p.ptrs.delete(e.pointerId)
    if (!p.ptrs.size) pinca.current = null
  }

  function virarCamera() {
    if (estado !== 'pronta' || virando.current) return
    // gravando direto da câmera (navegador sem canvas), trocar a lente cortaria o vídeo: não vira
    if (gravando && !desenho.current) { mostrarRotulo('Pare a gravação para virar a câmera'); return }
    setGirou((n) => n + 1)
    setFrente((f) => !f)
  }

  async function alternarLanterna() {
    const t = fluxo.current?.getVideoTracks()[0]
    const novo = !lanterna
    try { await t?.applyConstraints({ advanced: [{ torch: novo } as MediaTrackConstraintSet] }); setLanterna(novo) } catch { mostrarRotulo('Lanterna indisponível') }
  }

  const escolher = (f: File | undefined) => { if (f) aoCapturar(f, f.name) }
  const zoomTexto = `${(cap.zoom ? zoom : zoom).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: zoom % 1 ? 1 : 0 })}×`
  const transformVideo = `${frente ? 'scaleX(-1) ' : ''}${zoomDigital ? `scale(${zoom})` : ''}`.trim() || undefined

  return (
    <div className="est-cam" onPointerDown={tocarImagem} onPointerMove={moverImagem} onPointerUp={soltarImagem} onPointerCancel={soltarImagem}>
      <video ref={video} className={`est-cam-video ${girou ? `girou-${girou % 2}` : ''}`} playsInline muted autoPlay style={{ transform: transformVideo }} />
      {flash && <i className="est-flash" />}
      {contando !== null && <span className="est-contando" key={contando}>{contando}</span>}
      {(estado === 'sem' || estado === 'negada') && (
        <div className="est-cam-sem">
          <span className="est-cam-sem-ico"><Ico d={I.camera} /></span>
          <b>{estado === 'negada' ? 'Libere a câmera para gravar aqui' : 'Escolha como criar o story'}</b>
          <small>{estado === 'negada'
            ? (iphone ? 'No iPhone: Ajustes › Safari › Câmera e Microfone › Permitir. Depois feche e abra o app de novo. Enquanto isso, use a câmera do iPhone ou a galeria.' : 'Permita a câmera e o microfone nas configurações do navegador. Enquanto isso, use a câmera do aparelho ou a galeria.')
            : 'Sem acesso à câmera nesta tela. Use a câmera do aparelho ou a galeria.'}</small>
          <div>
            <button type="button" onClick={() => nativa.current?.click()}><Ico d={I.camera} />Câmera</button>
            <button type="button" onClick={() => galeria.current?.click()}><Ico d={I.galeria} />Galeria</button>
            <button type="button" onClick={aoTexto}><b className="est-aa">Aa</b>Texto</button>
          </div>
        </div>
      )}
      <div className="est-cam-topo">
        <button type="button" className="est-bt" onClick={aoFechar} aria-label="Fechar"><Ico d={I.fechar} /></button>
        {gravando ? <span className="est-rec"><i />{Math.floor(segundos / 60)}:{String(Math.floor(segundos % 60)).padStart(2, '0')}</span>
          : cap.lanterna && estado === 'pronta' ? <button type="button" className={`est-bt ${lanterna ? 'aceso' : ''}`} onClick={() => void alternarLanterna()} aria-label="Lanterna"><Ico d={I.raio} cheio={lanterna} /></button> : <span />}
        {celular && !gravando
          ? <button type="button" className="est-nativa" onClick={() => nativa.current?.click()}><Ico d={I.camera} />{iphone ? 'Câmera do iPhone' : 'Câmera do celular'}<small>Qualidade máxima</small></button>
          : <span />}
      </div>
      {/* as ferramentas da câmera, na lateral (como no Instagram) */}
      {estado === 'pronta' && !gravando && (
        <div className="est-trilho">
          <button type="button" onClick={aoTexto}><b className="est-aa">Aa</b><span>Criar</span></button>
          <button type="button" className={maosLivres ? 'on' : ''} onClick={() => { setMaosLivres((m) => !m); setTemporizador(0); mostrarRotulo(maosLivres ? 'Mãos livres desligado' : 'Mãos livres: toque para gravar e para parar') }}>
            <Ico d={I.maos} /><span>Mãos livres</span>
          </button>
          <button type="button" className={temporizador ? 'on' : ''} onClick={() => { const n = temporizador === 0 ? 3 : temporizador === 3 ? 10 : 0; setTemporizador(n); setMaosLivres(false); mostrarRotulo(n ? `Temporizador: ${n} s` : 'Temporizador desligado') }}>
            <Ico d={I.relogio} /><span>{temporizador ? `${temporizador} s` : 'Temporizador'}</span>
          </button>
        </div>
      )}
      {(zoom > zMin + 0.05 || gravando) && estado === 'pronta' && <span className="est-zoom">{zoomTexto}</span>}
      {rotulo && <span className="est-rotulo">{rotulo}</span>}
      <div className="est-cam-pe">
        <button type="button" className="est-galeria" onClick={() => galeria.current?.click()} aria-label="Galeria" style={{ visibility: gravando ? 'hidden' : undefined }}><Ico d={I.galeria} /></button>
        <div className="est-disparo-caixa">
          <button type="button" className={`est-disparo ${gravando ? 'gravando' : ''} ${travado ? 'travado' : ''} ${maosLivres || temporizador ? 'livre' : ''}`}
            onPointerDown={apertar} onPointerMove={moverNoBotao} onPointerUp={soltar} onPointerCancel={soltar}
            onContextMenu={(e) => e.preventDefault()} aria-label={gravando ? 'Parar' : maosLivres ? 'Toque para gravar' : 'Toque para foto, segure para vídeo'}>
            <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" className="trilho" /><circle cx="50" cy="50" r="46" className="anda" style={{ strokeDashoffset: `${289 - 289 * Math.min(1, segundos / LIMITE_SEGUNDOS)}` }} /></svg>
            <i />
          </button>
          {gravando && !travado && !maosLivres && <span className="est-cadeado" aria-hidden="true"><Ico d={I.cadeado} /></span>}
        </div>
        <button type="button" className="est-bt grande" onClick={virarCamera} aria-label="Trocar câmera" disabled={estado !== 'pronta' || gravando} style={{ visibility: gravando ? 'hidden' : undefined }}><Ico d={I.virar} /></button>
      </div>
      {!gravando && (
        <div className="est-modos">
          <button type="button" onClick={aoTexto}>Texto</button>
          <button type="button" className="on">Story</button>
        </div>
      )}
      {!gravando && estado === 'pronta' && <span className="est-dica">{maosLivres ? 'Toque para começar a gravar' : temporizador ? `Toque: grava em ${temporizador} s` : 'Toque para foto · segure para vídeo'}</span>}
      {gravando && !travado && !maosLivres && <span className="est-dica fixa">Arraste para cima para zoom · para o lado para travar</span>}
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
  // o vídeo toca com som no editor (como no Instagram); se o iPhone barrar, oferece "Toque para ouvir"
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [pedirSom, setPedirSom] = useState(false)
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = semSom
    void v.play().catch(() => { v.muted = true; if (!semSom) setPedirSom(true); void v.play().catch(() => undefined) })
  }, [midia.local, semSom])
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
        {midia.tipo === 'video' && <video ref={videoRef} src={midia.local} autoPlay loop playsInline muted style={estiloDaMidia(enq)} className="sto-midia" />}
        {midia.tipo === 'imagem' && <img src={midia.local} alt="" draggable={false} style={estiloDaMidia(enq)} className="sto-midia" />}
        {midia.tipo === 'fundo' && <div className="est-fundo" style={{ background: fundo }} />}
        <CamadasDoStory camadas={camadas} modo="editar" escondida={escondida} />
        {guias.v && <i className="est-guia v" />}
        {guias.h && <i className="est-guia h" />}
      </div>
      {children}
      {pedirSom && !semSom && <button type="button" className="est-pede-som" onClick={() => { const v = videoRef.current; if (v) { v.muted = false; void v.play() } setPedirSom(false) }}><Ico d={I.somOff} />Toque para ouvir</button>}
      {arrastando && <div ref={lixo} className={`est-lixo ${sobreLixo ? 'sobre' : ''}`}><Ico d={I.lixo} /></div>}
    </div>
  )
}

/* ============================================================== texto */
type Membro = { userId: string; nome: string; foto: string | null }
function EditorDeTexto({ inicial, aoConcluir, buscar }: { inicial: Camada; aoConcluir: (c: Camada | null) => void; buscar?: (termo: string) => Promise<Membro[]> }) {
  const [c, setC] = useState(inicial as Extract<Camada, { tipo: 'texto' }>)
  // @ no texto: sugere os membros, como no Instagram
  const termo = c.texto.match(/@([^\s@]{2,})$/)?.[1] ?? null
  const [sugestoes, setSugestoes] = useState<Membro[]>([])
  useEffect(() => {
    if (!termo || !buscar) { setSugestoes([]); return }
    let vivo = true
    const t = window.setTimeout(() => { void buscar(termo).then((l) => vivo && setSugestoes(l.slice(0, 8))) }, 250)
    return () => { vivo = false; window.clearTimeout(t) }
  }, [termo]) // eslint-disable-line react-hooks/exhaustive-deps
  const mencionar = (m: Membro) => { setC({ ...c, texto: c.texto.replace(/@[^\s@]*$/, `@${nomeDeMencao(m.nome)} `) }); setSugestoes([]); area.current?.focus() }
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
      {sugestoes.length > 0 && (
        <div className="est-sugere" onPointerDown={(e) => e.preventDefault()}>
          {sugestoes.map((m) => <button key={m.userId} type="button" onClick={() => mencionar(m)}><Avatar foto={m.foto} nome={m.nome} tamanho={28} /><span>{m.nome}</span></button>)}
        </div>
      )}
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
    { id: 'mencao', tag: <span className="cam-mencao e-branco est-amostra"><span>@Menção</span></span> },
    { id: 'foto', tag: <span className="est-amostra-card"><Ico d={I.galeria} />Foto</span> },
    { id: 'hora', tag: <span className="cam-hora e-branco est-amostra"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg><span>{agora}</span></span> },
  ]
  const termo = busca.trim().toLowerCase()
  return (
    <Folha titulo="Figurinhas" aoFechar={aoFechar} alta>
      <input className="est-busca" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar figurinha ou emoji" aria-label="Buscar figurinha" />
      {!termo && <div className="est-especiais">{especiais.map((s) => <button key={s.id} type="button" onClick={() => aoEscolher(s.id)}>{s.tag}</button>)}</div>}
      {(!termo || 'ia i.a. raptor falcon legacy gulf phenom avião aviao'.includes(termo) || IAS.some((x) => x.nome.toLowerCase().includes(termo))) && (
        <>
          <span className="est-grupo">I.A. da GlobalFly</span>
          <div className="est-ias">
            {IAS.filter((x) => !termo || x.nome.toLowerCase().includes(termo) || 'ia i.a. avião aviao'.includes(termo)).map((x) => (
              <button key={x.id} type="button" onClick={() => aoEscolher(`ia:${x.id}`)} aria-label={x.nome}>
                <img src={fotoDaIA(x.id)} alt="" />
                <span><LogotipoDaIA nome={x.nome} id={x.id} sobreFoto /></span>
              </button>
            ))}
          </div>
        </>
      )}
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

function FormMencao({ sessao, aoFechar, aoConcluir }: { sessao: SessaoTeeds; aoFechar: () => void; aoConcluir: (nome: string, userId: string | null) => void }) {
  const [t, setT] = useState('')
  const [lista, setLista] = useState<Membro[]>([])
  const [buscando, setBuscando] = useState(false)
  useEffect(() => {
    const q = t.replace(/^@/, '').trim()
    if (q.length < 2) { setLista([]); return }
    let vivo = true
    setBuscando(true)
    const tm = window.setTimeout(() => { void buscarMembros(sessao, q).then((l) => { if (vivo) { setLista(l); setBuscando(false) } }) }, 250)
    return () => { vivo = false; window.clearTimeout(tm) }
  }, [t]) // eslint-disable-line react-hooks/exhaustive-deps
  const livre = t.replace(/^@/, '').trim()
  return (
    <Folha titulo="Mencionar" aoFechar={aoFechar}>
      <input className="est-campo" value={t} onChange={(e) => setT(e.target.value.slice(0, 40))} placeholder="@ Buscar um membro" autoFocus autoCapitalize="words" aria-label="Buscar membro" />
      {buscando && <small className="est-nota">Buscando…</small>}
      <div className="est-membros">
        {lista.map((m) => (
          <button key={m.userId} type="button" onClick={() => aoConcluir(nomeDeMencao(m.nome), m.userId)}>
            <Avatar foto={m.foto} nome={m.nome} tamanho={40} /><span><b>{m.nome}</b><small>Membro da {MARCA.prosa}</small></span>
          </button>
        ))}
        {!buscando && livre.length >= 2 && !lista.length && <small className="est-nota">Ninguém com esse nome. Dá para mencionar assim mesmo.</small>}
      </div>
      {livre.length >= 2 && <button type="button" className="est-pronto claro" onClick={() => aoConcluir(livre, null)}>Usar “@{livre}”</button>}
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
