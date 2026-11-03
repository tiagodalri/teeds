/**
 * O passo a passo de subir um anúncio (ou um teste A/B), em tela cheia (03/11/2026).
 * Uma pergunta por tela, tudo já preenchido com o padrão do lançamento, o celular com a prévia
 * ao lado o tempo todo. O arquivo sobe para a biblioteca da conta assim que é escolhido; o
 * rascunho se salva sozinho; criar põe tudo na Meta PAUSADO, e ligar é um segundo passo.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { SessaoTeeds } from '../../../core/teeds/conta'
import {
  BOTOES, PUBLICO_PADRAO, sinaisDoTexto, type ApiEstudio, type ContextoDoEstudio, type DadosDoRascunho, type Midia, type Publico,
  type Rascunho, type Texto, type Variavel,
} from '../../../core/teeds/estudio'
import { Previa, encaixe, NOME_DO_ENCAIXE, type Lugar } from './Previa'
import { MontarPublico, type Aprendizado } from './MontarPublico'
import { problemasDoPublico, publicoCompleto, resumoDoPublico } from '../../../core/teeds/publicos'
import { Confirmar, Icone, brl, int } from './pecas'

type Lado = 'a' | 'b'
type IdPasso = 'teste' | 'criativo' | 'mensagem' | 'destino' | 'publico' | 'orcamento' | 'revisar'
const PASSOS: Record<IdPasso, { nome: string; pergunta: string; icone: Parameters<typeof Icone>[0]['nome'] }> = {
  teste: { nome: 'O que testar', pergunta: 'O que muda entre as duas versões?', icone: 'teste' },
  criativo: { nome: 'Criativo', pergunta: 'Qual vídeo ou imagem?', icone: 'subir' },
  mensagem: { nome: 'Mensagem', pergunta: 'O que o anúncio diz?', icone: 'texto' },
  destino: { nome: 'Onde entra', pergunta: 'Em qual campanha ele entra?', icone: 'destino' },
  publico: { nome: 'Para quem', pergunta: 'Quem vai ver?', icone: 'publico' },
  orcamento: { nome: 'Quanto por dia', pergunta: 'Quanto investir por dia?', icone: 'dinheiro' },
  revisar: { nome: 'Revisar', pergunta: 'Tudo certo para criar?', icone: 'conferir' },
}
const VARIAVEIS: Array<{ id: Variavel; nome: string; dica: string }> = [
  { id: 'criativo', nome: 'O vídeo ou a imagem', dica: 'O mais comum: o criativo é o que mais muda o custo.' },
  { id: 'texto', nome: 'O texto', dica: 'Mesmo vídeo, duas mensagens diferentes.' },
  { id: 'publico', nome: 'O público', dica: 'Mesmo anúncio para dois públicos.' },
]
// data-sem-vocabulario: aqui a tela mostra o texto exatamente como vai para a Meta (a troca automática
// de "robô" por "I.A." da GlobalFly esconderia justamente o que o semáforo precisa apontar)
// modelos de texto já no jeito da marca (sem promessa de ganho, I.A. no feminino)
const MODELOS: Array<{ nome: string; texto: Texto }> = [
  { nome: 'Convite para a live', texto: { principal: 'Dia 09/11 tem live ao vivo com o Naor: como a I.A. da GlobalFly opera o mercado, passo a passo, e como você acompanha cada operação. A inscrição é gratuita e leva 1 minuto.', titulo: 'Live gratuita dia 09/11', descricao: 'Inscrição gratuita', botao: 'SIGN_UP' } },
  { nome: 'Bastidores da I.A.', texto: { principal: 'Já viu uma I.A. operando ao vivo? Na GlobalFly a estratégia roda na sua conta e você acompanha cada entrada na tela, com o seu gerenciamento. Cadastre-se e veja como funciona.', titulo: 'Veja a I.A. operando ao vivo', descricao: 'Cadastro gratuito', botao: 'LEARN_MORE' } },
  { nome: 'Direto ao ponto', texto: { principal: 'A GlobalFly abre as portas na live de 09/11. Faça seu cadastro agora e receba o aviso quando começar.', titulo: 'Cadastre-se para a live', descricao: '', botao: 'SIGN_UP' } },
]

/** A foto do perfil: a do Instagram (com a chave) ou a da página, que a Meta mostra sem chave. */
export const fotoDaConta = (ctx: ContextoDoEstudio) => ctx.instagram.foto ?? `https://graph.facebook.com/${ctx.pagina.id}/picture?type=large`

const ddmm = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }
export function dadosNovos(ctx: ContextoDoEstudio, tipo: 'novo' | 'teste'): DadosDoRascunho {
  return {
    nomeAnuncio: '', texto: { principal: '', titulo: '', descricao: '', botao: 'SIGN_UP' }, link: ctx.link,
    destino: { campanha: 'nova', nomeCampanha: `Live 09/11 | ${tipo === 'teste' ? 'Teste' : 'Cadastros'} ${ddmm()}`, conjunto: 'novo', nomeConjunto: 'Público do lançamento' },
    publico: { ...PUBLICO_PADRAO }, diario: 300,
    ...(tipo === 'teste' ? { teste: { variavel: 'criativo' as Variavel, dias: 7 }, textoB: { principal: '', titulo: '', descricao: '', botao: 'SIGN_UP' }, publicoB: { ...PUBLICO_PADRAO, modo: 'personalizado' as const, idadeMin: 25, idadeMax: 45 } } : {}),
  }
}

/** Lê as medidas do arquivo e tira um quadro para a prévia (e, no vídeo, a capa que a Meta exige). */
async function lerArquivo(f: File): Promise<{ midia: Midia; capa: Blob | null }> {
  const local = URL.createObjectURL(f)
  const quadro = (fonte: CanvasImageSource, w: number, h: number, max: number, q: number) => new Promise<Blob | null>((ok) => {
    const k = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas')
    c.width = Math.round(w * k); c.height = Math.round(h * k)
    c.getContext('2d')!.drawImage(fonte, 0, 0, c.width, c.height)
    c.toBlob(ok, 'image/jpeg', q)
  })
  const dataUrl = (b: Blob | null) => new Promise<string | undefined>((ok) => { if (!b) return ok(undefined); const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(b) })
  if (f.type.startsWith('image/')) {
    const img = new Image(); img.src = local
    await img.decode().catch(() => { throw new Error('Não consegui abrir essa imagem. Use JPG ou PNG.') })
    const poster = await dataUrl(await quadro(img, img.naturalWidth, img.naturalHeight, 420, 0.72))
    return { midia: { tipo: 'imagem', nome: f.name, largura: img.naturalWidth, altura: img.naturalHeight, tamanho: f.size, poster, local }, capa: null }
  }
  // o vídeo fica na página (invisível) enquanto é lido: o Safari do iPhone não carrega quadros de vídeo solto
  const v = document.createElement('video')
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = local
  v.setAttribute('playsinline', ''); v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none'
  document.body.appendChild(v)
  try {
    await new Promise<void>((ok, falha) => {
      const t = setTimeout(() => falha(new Error('Esse vídeo demorou para abrir neste navegador. Tente pelo computador ou converta para MP4.')), 15000)
      v.onloadedmetadata = () => { clearTimeout(t); ok() }
      v.onerror = () => { clearTimeout(t); falha(new Error('Não consegui abrir esse vídeo. Use MP4 ou MOV.')) }
    })
    // tocar e pausar faz o navegador montar o primeiro quadro
    await v.play().catch(() => { /* sem permissão para tocar: segue com o que tiver */ }); v.pause()
    v.currentTime = Math.min(1.2, (v.duration || 3) / 3)
    await new Promise<void>((ok) => { v.onseeked = () => ok(); setTimeout(ok, 2500) })
    if (!v.videoWidth || !v.videoHeight) throw new Error('Não consegui ler as medidas desse vídeo. Tente pelo computador ou converta para MP4.')
    const [mini, capa] = await Promise.all([quadro(v, v.videoWidth, v.videoHeight, 420, 0.72), quadro(v, v.videoWidth, v.videoHeight, 1080, 0.9)])
    if (!capa) throw new Error('Não consegui tirar a capa desse vídeo (a Meta exige uma). Tente pelo computador ou converta para MP4.')
    return { midia: { tipo: 'video', nome: f.name, largura: v.videoWidth, altura: v.videoHeight, duracao: v.duration, tamanho: f.size, poster: await dataUrl(mini), local }, capa }
  } finally { v.remove() }
}

const tamanho = (b: number) => (b > 1e9 ? `${(b / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`)
const duracao = (s?: number) => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`)
const pronta = (m?: Midia) => !!m && (m.tipo === 'imagem' ? !!m.hash : !!m.videoId && !!m.posterHash)

interface Envio { fase: 'lendo' | 'enviando' | 'processando' | 'pronto' | 'erro' | 'local'; fracao: number; erro?: string }

export function Criador({ sessao, api, parceiro, ctx, tipo, inicial, prefill, custoPorCadastro, contaNome, fechar, aprendizado }: {
  sessao: SessaoTeeds; api: ApiEstudio; parceiro: string; ctx: ContextoDoEstudio; tipo: 'novo' | 'teste'
  inicial: Rascunho | null; prefill?: Partial<DadosDoRascunho>; custoPorCadastro: number | null; contaNome: string
  fechar: (mudou: boolean) => void
  aprendizado?: Aprendizado | null
}) {
  // o id do rascunho mora em idRef (os salvamentos são em fila); o estado só redesenha a tela
  const [, setId] = useState<string | null>(inicial?.id ?? null)
  const [dados, setDados] = useState<DadosDoRascunho>(() => ({ ...dadosNovos(ctx, tipo), ...(inicial?.dados ?? {}), ...(prefill ?? {}) }))
  const [passo, setPasso] = useState(0)
  const [lado, setLado] = useState<Lado>('a')
  const [lugar, setLugar] = useState<Lugar>('feed')
  const [salvo, setSalvo] = useState<'salvo' | 'salvando' | 'erro' | null>(inicial ? 'salvo' : null)
  const [envio, setEnvio] = useState<Partial<Record<Lado, Envio>>>(() => ({
    ...(inicial?.dados.midia ? { a: { fase: pronta(inicial.dados.midia) ? 'pronto' : 'local', fracao: 1 } } : {}),
    ...(inicial?.dados.midiaB ? { b: { fase: pronta(inicial.dados.midiaB) ? 'pronto' : 'local', fracao: 1 } } : {}),
  }))
  const [criando, setCriando] = useState<{ etapa: number; aguardandoVideo?: boolean } | null>(null)
  const [feito, setFeito] = useState<'pausado' | 'ligado' | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(inicial?.situacao === 'erro' ? inicial.erro : null)
  const [ligar, setLigar] = useState<{ indo?: boolean; erro?: string | null } | null>(null)
  const [verPrevia, setVerPrevia] = useState(false)
  const arquivos = useRef<Partial<Record<Lado, { f: File; capa: Blob | null }>>>({})
  const enderecos = useRef<string[]>([])
  const aberto = useRef(true)
  useEffect(() => () => { aberto.current = false; pararSalvar(); for (const u of enderecos.current) URL.revokeObjectURL(u) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const mudou = useRef(false)
  const teste = tipo === 'teste'
  const variavel = dados.teste?.variavel
  const conjuntoExistente = !teste && dados.destino.conjunto !== 'novo'

  const ordem: IdPasso[] = useMemo(() => {
    const l: IdPasso[] = teste ? ['teste', 'criativo', 'mensagem', 'destino', 'publico', 'orcamento', 'revisar'] : ['criativo', 'mensagem', 'destino', 'publico', 'orcamento', 'revisar']
    return conjuntoExistente ? l.filter((p) => p !== 'publico' && p !== 'orcamento') : l
  }, [teste, conjuntoExistente])
  const atual = ordem[Math.min(passo, ordem.length - 1)]
  const temLados = teste && ((atual === 'criativo' && variavel === 'criativo') || (atual === 'mensagem' && variavel === 'texto') || (atual === 'publico' && variavel === 'publico'))
  useEffect(() => { if (!temLados && atual !== 'revisar') setLado('a') }, [temLados, atual])

  const mudar = (f: (d: DadosDoRascunho) => DadosDoRascunho) => { mudou.current = true; setDados(f) }
  const texto = lado === 'b' && variavel === 'texto' ? dados.textoB! : dados.texto
  const setTexto = (t: Partial<Texto>) => mudar((d) => (lado === 'b' && variavel === 'texto' ? { ...d, textoB: { ...d.textoB!, ...t } } : { ...d, texto: { ...d.texto, ...t } }))
  const publico = publicoCompleto(lado === 'b' && variavel === 'publico' ? dados.publicoB : dados.publico)
  const setPublico = (p: Partial<Publico>) => mudar((d) => (lado === 'b' && variavel === 'publico' ? { ...d, publicoB: { ...publicoCompleto(d.publicoB), ...p } } : { ...d, publico: { ...publicoCompleto(d.publico), ...p } }))
  const midiaDe = (l: Lado) => (l === 'b' && variavel === 'criativo' ? dados.midiaB : dados.midia)
  // a prévia mostra a versão do lado escolhido; o que não muda vem da versão A
  const previaMidia = lado === 'b' && variavel === 'criativo' ? dados.midiaB : dados.midia
  const previaTexto = lado === 'b' && variavel === 'texto' ? dados.textoB! : dados.texto

  // o rascunho se salva sozinho (um segundo depois da última mudança)
  const nomeDe = (d: DadosDoRascunho) => d.nomeAnuncio.trim() || (d.midia?.nome ? d.midia.nome.replace(/\.[a-z0-9]+$/i, '') : `${teste ? 'Teste A/B' : 'Anúncio'} de ${ddmm()}`)
  const nomeFinal = nomeDe(dados)
  // os salvamentos vão um de cada vez (o id fica numa ref): nunca nasce rascunho repetido
  const idRef = useRef<string | null>(inicial?.id ?? null)
  const fila = useRef<Promise<unknown>>(Promise.resolve())
  const relogioSalvar = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dadosRef = useRef(dados); dadosRef.current = dados
  const salvarAgora = () => {
    const p = fila.current.then(() => {
      const d = dadosRef.current, nome = nomeDe(d)
      return api.salvar(sessao, parceiro, idRef.current, tipo, nome, { ...d, nomeAnuncio: nome }).then((novo) => { idRef.current = novo; setId(novo); setSalvo('salvo'); return novo })
    })
    fila.current = p.catch(() => setSalvo('erro'))
    return p
  }
  const pararSalvar = () => { if (relogioSalvar.current) { clearTimeout(relogioSalvar.current); relogioSalvar.current = null; return true } return false }
  useEffect(() => {
    if (!mudou.current || criando || feito) return
    setSalvo('salvando')
    pararSalvar()
    relogioSalvar.current = setTimeout(() => { relogioSalvar.current = null; void salvarAgora().catch(() => {}) }, 1000)
  }, [dados]) // eslint-disable-line react-hooks/exhaustive-deps
  /** Sair sem perder o último segundo: o que estava para salvar é salvo antes de fechar. */
  const sair = async () => {
    if (pararSalvar() && !feito) await salvarAgora().catch(() => {})
    else await fila.current
    fechar(mudou.current)
  }

  /* ---------------------------------------------- o arquivo: medidas, prévia e envio para a conta */
  const enviar = async (l: Lado, f: File, capa: Blob | null, m: Midia) => {
    if (ctx.semChave) { setEnvio((e) => ({ ...e, [l]: { fase: 'local', fracao: 0 } })); return }
    const guardar = (extra: Partial<Midia>) => mudar((d) => {
      const atualM = l === 'b' ? d.midiaB : d.midia
      if (!atualM || atualM.local !== m.local) return d // trocaram o arquivo no meio do envio
      return l === 'b' ? { ...d, midiaB: { ...atualM, ...extra } } : { ...d, midia: { ...atualM, ...extra } }
    })
    try {
      setEnvio((e) => ({ ...e, [l]: { fase: 'enviando', fracao: 0 } }))
      if (m.tipo === 'imagem') {
        const { hash } = await api.subirImagem(sessao, parceiro, f, f.name)
        guardar({ hash })
        setEnvio((e) => ({ ...e, [l]: { fase: 'pronto', fracao: 1 } }))
        return
      }
      const [{ videoId }, capaSubida] = await Promise.all([
        api.subirVideo(sessao, parceiro, f, (fracao) => setEnvio((e) => ({ ...e, [l]: { fase: 'enviando', fracao } }))),
        capa ? api.subirImagem(sessao, parceiro, capa, `capa-${f.name}.jpg`) : Promise.resolve({ hash: '' }),
      ])
      guardar({ videoId, posterHash: capaSubida.hash })
      setEnvio((e) => ({ ...e, [l]: { fase: 'processando', fracao: 0 } }))
      // a Meta processa o vídeo depois do envio: acompanha até ficar pronto
      for (let i = 0; i < 120 && aberto.current; i++) {
        const s = await api.estadoVideo(sessao, parceiro, videoId)
        if (s.estado === 'ready') { setEnvio((e) => ({ ...e, [l]: { fase: 'pronto', fracao: 1 } })); return }
        if (s.estado === 'error') throw new Error('A Meta não conseguiu processar o vídeo. Tente com outro arquivo (MP4 ou MOV).')
        setEnvio((e) => ({ ...e, [l]: { fase: 'processando', fracao: s.progresso / 100 } }))
        await new Promise((ok) => setTimeout(ok, 4000))
      }
      setEnvio((e) => ({ ...e, [l]: { fase: 'pronto', fracao: 1 } }))
    } catch (e) {
      setEnvio((x) => ({ ...x, [l]: { fase: 'erro', fracao: 0, erro: (e as Error).message } }))
    }
  }
  const escolher = async (l: Lado, f: File | undefined) => {
    if (!f) return
    if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) { setEnvio((e) => ({ ...e, [l]: { fase: 'erro', fracao: 0, erro: 'Escolha um vídeo (MP4, MOV) ou uma imagem (JPG, PNG).' } })); return }
    if (f.type.startsWith('image/') && f.size > 30e6) { setEnvio((e) => ({ ...e, [l]: { fase: 'erro', fracao: 0, erro: 'A imagem precisa ter até 30 MB.' } })); return }
    if (f.size > 4e9) { setEnvio((e) => ({ ...e, [l]: { fase: 'erro', fracao: 0, erro: 'O vídeo precisa ter até 4 GB.' } })); return }
    setEnvio((e) => ({ ...e, [l]: { fase: 'lendo', fracao: 0 } }))
    try {
      const { midia, capa } = await lerArquivo(f)
      if (midia.local) enderecos.current.push(midia.local)
      arquivos.current[l] = { f, capa }
      mudar((d) => ({ ...(l === 'b' ? { ...d, midiaB: midia } : { ...d, midia }), nomeAnuncio: d.nomeAnuncio || (l === 'a' ? f.name.replace(/\.[a-z0-9]+$/i, '') : d.nomeAnuncio) }))
      void enviar(l, f, capa, midia)
    } catch (e) {
      setEnvio((x) => ({ ...x, [l]: { fase: 'erro', fracao: 0, erro: (e as Error).message } }))
    }
  }
  const tentarDeNovo = (l: Lado) => { const a = arquivos.current[l], m = midiaDe(l); if (a && m) void enviar(l, a.f, a.capa, m) }

  /* ---------------------------------------------- conferências */
  const sinais = useMemo(() => [...sinaisDoTexto(dados.texto), ...(teste && variavel === 'texto' && dados.textoB ? sinaisDoTexto(dados.textoB).map((s) => ({ ...s, motivo: `Versão B: ${s.motivo}` })) : [])], [dados.texto, dados.textoB, teste, variavel])
  // o nome do anúncio também aparece para quem vê (e a função barra as mesmas palavras nele)
  const vermelhos = [...sinais, ...sinaisDoTexto({ titulo: nomeFinal }).map((s) => ({ ...s, motivo: `No nome do anúncio: ${s.motivo}` }))].filter((s) => s.cor === 'vermelho')
  const custo = custoPorCadastro && custoPorCadastro > 0 ? custoPorCadastro : null
  const porDia = custo ? dados.diario / custo : null
  const diasSugeridos = porDia ? Math.min(14, Math.max(3, Math.ceil(80 / porDia))) : 7
  const campanhaEscolhida = ctx.campanhas.find((c) => c.id === dados.destino.campanha)
  const conjuntosDaCampanha = ctx.conjuntos.filter((c) => c.campanhaId === dados.destino.campanha)
  const conjuntoEscolhido = ctx.conjuntos.find((c) => c.id === dados.destino.conjunto)

  const checagens = [
    { ok: pronta(dados.midia) && (!teste || variavel !== 'criativo' || pronta(dados.midiaB)), nome: teste && variavel === 'criativo' ? 'Os dois criativos na biblioteca da conta' : 'Criativo na biblioteca da conta',
      falta: ctx.semChave ? 'Sobe quando a chave for conectada' : !dados.midia || (teste && variavel === 'criativo' && !dados.midiaB) ? 'Falta escolher o arquivo' : 'Esperando o envio terminar', passo: 'criativo' as IdPasso },
    { ok: !!dados.texto.principal.trim() && !!dados.texto.titulo.trim() && (!teste || variavel !== 'texto' || (!!dados.textoB?.principal.trim() && !!dados.textoB?.titulo.trim())), nome: 'Texto e título preenchidos', falta: 'Falta o texto ou o título', passo: 'mensagem' as IdPasso },
    { ok: !vermelhos.length, nome: 'Nenhuma palavra que a marca não usa', falta: `${vermelhos.length} ${vermelhos.length === 1 ? 'trecho precisa' : 'trechos precisam'} mudar`, passo: 'mensagem' as IdPasso },
    ...(!conjuntoExistente ? [{ ok: !problemasDoPublico(dados.publico).length && (!teste || variavel !== 'publico' || !problemasDoPublico(dados.publicoB ?? {}).length), nome: 'Público montado', falta: problemasDoPublico(dados.publico)[0] ?? problemasDoPublico(dados.publicoB ?? {})[0] ?? 'Revise o público', passo: 'publico' as IdPasso }] : []),
    ...(!conjuntoExistente ? [{ ok: dados.diario >= 6 && dados.diario <= ctx.maxDia, nome: 'Orçamento dentro do limite', falta: `O orçamento por dia precisa ficar entre R$ 6 e ${brl(ctx.maxDia, 0)}`, passo: 'orcamento' as IdPasso }] : []),
    { ok: true, nome: 'Link com a marcação do anúncio (cada cadastro fica ligado a ele)', passo: 'destino' as IdPasso },
    { ok: true, nome: 'Pixel do Naor, otimizando para inscrição concluída', passo: 'destino' as IdPasso },
    { ok: true, nome: 'Nome no padrão "GF |", para o painel reconhecer', passo: 'destino' as IdPasso },
    { ok: true, nome: 'Nasce pausado: nada gasta até você ligar', passo: 'revisar' as IdPasso },
  ]
  const podeCriar = checagens.every((c) => c.ok) && !ctx.semChave
  const passoOk = (p: IdPasso) => checagens.filter((c) => c.passo === p).every((c) => c.ok)

  /* ---------------------------------------------- criar e ligar */
  const ETAPAS = ['Conferindo o texto e o link', dados.destino.campanha === 'nova' ? 'Criando a campanha' : 'Abrindo a campanha', teste ? 'Criando os dois públicos' : conjuntoExistente ? 'Abrindo o público' : 'Criando o público', teste ? 'Criando as duas versões' : 'Criando o anúncio']
  const criar = async () => {
    setErro(null); setCriando({ etapa: 0 })
    const relogio = setInterval(() => setCriando((c) => (c ? { ...c, etapa: Math.min(ETAPAS.length - 1, c.etapa + 1) } : c)), 900)
    try {
      pararSalvar()
      const novo = await salvarAgora()
      let r = await api.criar(sessao, parceiro, novo)
      for (let i = 0; r.aguardando === 'video' && i < 60; i++) {
        setCriando((c) => (c ? { ...c, aguardandoVideo: true } : c))
        await new Promise((ok) => setTimeout(ok, 5000))
        r = await api.criar(sessao, parceiro, novo)
      }
      if (r.aguardando) throw new Error('A Meta ainda está processando o vídeo. O rascunho ficou salvo: tente criar de novo daqui a pouco.')
      setAvisos(r.progresso.avisos ?? [])
      setFeito('pausado'); mudou.current = true
    } catch (e) { setErro((e as Error).message) }
    finally { clearInterval(relogio); setCriando(null) }
  }
  const confirmarLigar = async () => {
    const rid = idRef.current
    if (!rid) return
    setLigar({ indo: true })
    try { const r = await api.ligar(sessao, parceiro, rid); setAvisos((a) => [...new Set([...a, ...(r.progresso.avisos ?? [])])]); setFeito('ligado'); setLigar(null) }
    catch (e) { setLigar({ erro: (e as Error).message }) }
  }

  // Esc fecha (salvando); a página de trás não rola enquanto o estúdio está aberto
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !ligar && !criando) void sair() }
    window.addEventListener('keydown', esc)
    const antes = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = antes }
  }, [ligar, criando]) // eslint-disable-line react-hooks/exhaustive-deps

  const seguir = () => setPasso((p) => Math.min(ordem.length - 1, p + 1))
  const voltar = () => setPasso((p) => Math.max(0, p - 1))
  const irPara = (p: IdPasso) => { const i = ordem.indexOf(p); if (i >= 0) setPasso(i) }

  /* ---------------------------------------------- as telas */
  const Lados = () => (
    <div className="es-lados" role="tablist" aria-label="Versão">
      {(['a', 'b'] as Lado[]).map((l) => <button key={l} type="button" role="tab" aria-selected={lado === l} className={lado === l ? 'on' : ''} onClick={() => setLado(l)}><b>Versão {l.toUpperCase()}</b></button>)}
    </div>
  )

  const telaTeste = (
    <div className="es-campos">
      <div className="es-opcoes">
        {VARIAVEIS.map((v) => (
          <button key={v.id} type="button" className={`es-opcao ${variavel === v.id ? 'on' : ''}`} onClick={() => mudar((d) => ({ ...d, teste: { ...d.teste!, variavel: v.id } }))} aria-pressed={variavel === v.id}>
            <span className="es-radio" aria-hidden="true" /><div><b>{v.nome}</b><small>{v.dica}</small></div>
          </button>
        ))}
      </div>
      <p className="es-explica">Todo o resto fica igual nas duas versões. Assim, se uma trouxer cadastro mais barato, foi por causa do que mudou. A Meta divide o público em duas metades que não se misturam.</p>
    </div>
  )

  const telaCriativo = (() => {
    const lm: Lado = temLados ? lado : 'a'
    const m = midiaDe(lm), e = envio[lm]
    return (
      <div className="es-campos">
        {temLados && <Lados />}
        {!m ? (
          <label className="es-solta" onDragOver={(ev) => ev.preventDefault()} onDrop={(ev) => { ev.preventDefault(); void escolher(lm, ev.dataTransfer.files[0]) }}>
            <input type="file" accept="video/mp4,video/quicktime,video/*,image/jpeg,image/png,image/webp" onChange={(ev) => { void escolher(lm, ev.target.files?.[0]); ev.target.value = '' }} />
            <span className="es-solta-ic"><Icone nome="subir" tam={30} /></span>
            <b>{e?.fase === 'lendo' ? 'Abrindo o arquivo…' : 'Arraste o vídeo ou a imagem aqui'}</b>
            <small>ou toque para escolher · vídeo vertical (9:16) funciona em todos os lugares</small>
          </label>
        ) : (
          <div className="es-arquivo">
            <div className="es-arquivo-mini">{m.poster ? <img src={m.poster} alt="" /> : <span />}{m.tipo === 'video' && <i>{duracao(m.duracao)}</i>}</div>
            <div className="es-arquivo-info">
              <b>{m.nome}</b>
              <small>{m.tipo === 'video' ? 'Vídeo' : 'Imagem'} · {m.largura}×{m.altura} · {tamanho(m.tamanho)}</small>
              <div className={`es-envio ${e?.fase ?? 'local'}`}>
                {e?.fase === 'enviando' && <><span className="es-barra"><i style={{ width: `${Math.round(e.fracao * 100)}%` }} /></span>Enviando para a conta de anúncios · {Math.round(e.fracao * 100)}%</>}
                {e?.fase === 'processando' && <><span className="es-barra viva"><i style={{ width: `${Math.max(8, Math.round(e.fracao * 100))}%` }} /></span>A Meta está preparando o vídeo{e.fracao > 0 ? ` · ${Math.round(e.fracao * 100)}%` : '…'}</>}
                {(e?.fase === 'pronto' || (!e && pronta(m))) && <><Icone nome="ok" tam={16} />Na biblioteca da conta</>}
                {e?.fase === 'local' && (ctx.semChave ? 'Fica só nesta tela até a chave ser conectada' : 'Escolha o arquivo de novo para enviar')}
                {e?.fase === 'erro' && <>{e.erro} {arquivos.current[lm] && <button type="button" onClick={() => tentarDeNovo(lm)}>Tentar de novo</button>}</>}
              </div>
            </div>
            <label className="es-btn fino">Trocar<input type="file" accept="video/*,image/jpeg,image/png,image/webp" onChange={(ev) => { void escolher(lm, ev.target.files?.[0]); ev.target.value = '' }} /></label>
          </div>
        )}
        {!m && e?.fase === 'erro' && <p className="es-erro">{e.erro}</p>}
        {m && (
          <ul className="es-encaixes" aria-label="Como fica em cada lugar">
            {(['feed', 'stories', 'reels', 'facebook'] as Lugar[]).map((l) => { const f = encaixe(m, l); return <li key={l} className={f}><button type="button" onClick={() => setLugar(l)}><b>{l === 'feed' ? 'Feed' : l === 'stories' ? 'Stories' : l === 'reels' ? 'Reels' : 'Facebook'}</b><span>{NOME_DO_ENCAIXE[f]}</span></button></li> })}
          </ul>
        )}
        {m?.tipo === 'video' && (m.duracao ?? 0) > 90 && <p className="es-dica amarelo">Vídeos acima de 90 segundos não entram nos Reels. Para Reels, até 60 segundos rende mais.</p>}
      </div>
    )
  })()

  const telaMensagem = (
    <div className="es-campos">
      {temLados && <Lados />}
      {!texto.principal && (
        <div className="es-modelos"><small>Começar com um modelo</small><div>{MODELOS.map((m) => <button key={m.nome} type="button" onClick={() => setTexto(m.texto)}>{m.nome}</button>)}</div></div>
      )}
      <label className="es-campo">
        <span>Texto principal <em className={texto.principal.length > 125 ? 'passou' : ''}>{texto.principal.length}/125</em></span>
        <textarea id="es-texto" rows={5} value={texto.principal} onChange={(e) => setTexto({ principal: e.target.value })} placeholder="O que faz a pessoa parar de rolar? Comece pelo mais forte." />
      </label>
      <label className="es-campo">
        <span>Título <em className={texto.titulo.length > 40 ? 'passou' : ''}>{texto.titulo.length}/40</em></span>
        <input id="es-titulo" value={texto.titulo} onChange={(e) => setTexto({ titulo: e.target.value })} placeholder="Ex.: Live gratuita dia 09/11" />
      </label>
      <label className="es-campo">
        <span>Descrição <small>(opcional, aparece em poucos lugares)</small></span>
        <input id="es-descricao" value={texto.descricao} onChange={(e) => setTexto({ descricao: e.target.value })} placeholder="Ex.: Inscrição gratuita" />
      </label>
      <div className="es-campo">
        <span>Botão</span>
        <div className="es-chips">{BOTOES.map((b) => <button key={b.id} type="button" className={texto.botao === b.id ? 'on' : ''} aria-pressed={texto.botao === b.id} onClick={() => setTexto({ botao: b.id })}>{b.nome}</button>)}</div>
      </div>
      <Semaforo sinais={sinais} />
    </div>
  )

  const telaDestino = (
    <div className="es-campos">
      <div className="es-opcoes">
        <button type="button" className={`es-opcao ${dados.destino.campanha === 'nova' ? 'on' : ''}`} aria-pressed={dados.destino.campanha === 'nova'} onClick={() => mudar((d) => ({ ...d, destino: { ...d.destino, campanha: 'nova', conjunto: 'novo' } }))}>
          <span className="es-radio" aria-hidden="true" /><div><b>Numa campanha nova</b><small>O mais simples para começar. Ela já nasce otimizando para cadastro.</small></div>
        </button>
        {dados.destino.campanha === 'nova' && (
          <label className="es-campo dentro"><span>Nome da campanha</span>
            <div className="es-prefixo"><i>GF |</i><input id="es-nome-campanha" value={dados.destino.nomeCampanha} onChange={(e) => mudar((d) => ({ ...d, destino: { ...d.destino, nomeCampanha: e.target.value.replace(/^GF \|\s*/, '') } }))} /></div>
          </label>
        )}
        <button type="button" className={`es-opcao ${dados.destino.campanha !== 'nova' ? 'on' : ''}`} aria-pressed={dados.destino.campanha !== 'nova'} disabled={!ctx.campanhas.length}
          onClick={() => mudar((d) => ({ ...d, destino: { ...d.destino, campanha: ctx.campanhas[0]?.id ?? 'nova', conjunto: teste ? 'novo' : ctx.conjuntos.find((c) => c.campanhaId === ctx.campanhas[0]?.id)?.id ?? 'novo' } }))}>
          <span className="es-radio" aria-hidden="true" /><div><b>Numa campanha que já existe</b><small>{ctx.campanhas.length ? `${ctx.campanhas.length} ${ctx.campanhas.length === 1 ? 'campanha da GlobalFly' : 'campanhas da GlobalFly'} na conta.` : 'Ainda não há campanha da GlobalFly na conta.'}</small></div>
        </button>
        {dados.destino.campanha !== 'nova' && (
          <div className="es-lista">
            {ctx.campanhas.map((c) => (
              <button key={c.id} type="button" className={dados.destino.campanha === c.id ? 'on' : ''} onClick={() => mudar((d) => ({ ...d, destino: { ...d.destino, campanha: c.id, conjunto: teste ? 'novo' : ctx.conjuntos.find((s) => s.campanhaId === c.id)?.id ?? 'novo' } }))}>
                <b>{c.nome}</b><span className={`es-st ${c.status === 'ACTIVE' ? 'ok' : ''}`}>{c.status === 'ACTIVE' ? 'No ar' : 'Pausada'}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {!teste && dados.destino.campanha !== 'nova' && (
        <div className="es-campo">
          <span>Em qual público dessa campanha?</span>
          <div className="es-lista">
            {conjuntosDaCampanha.map((c) => (
              <button key={c.id} type="button" className={dados.destino.conjunto === c.id ? 'on' : ''} onClick={() => mudar((d) => ({ ...d, destino: { ...d.destino, conjunto: c.id } }))}>
                <b>{c.nome}</b><small>{c.publico}{c.orcDia ? ` · ${brl(c.orcDia, 0)}/dia` : ''}</small>
              </button>
            ))}
            <button type="button" className={dados.destino.conjunto === 'novo' ? 'on' : ''} onClick={() => mudar((d) => ({ ...d, destino: { ...d.destino, conjunto: 'novo' } }))}><b>Um público novo</b><small>Com orçamento próprio</small></button>
          </div>
        </div>
      )}
      {teste && <p className="es-explica">No teste, o estúdio cria dois públicos novos dentro da campanha, um para cada versão, com metade do orçamento cada.</p>}
      <div className="es-link">
        <small>Para onde o anúncio leva</small>
        <b>{dados.link.replace(/^https:\/\//, '')}</b>
        <span><Icone nome="ok" tam={14} />Marcação automática: cada cadastro fica ligado ao anúncio que trouxe</span>
      </div>
    </div>
  )

  const telaPublico = (
    <div className="es-campos">
      {temLados && <Lados />}
      <MontarPublico key={lado} publico={publico} mudar={setPublico} sessao={sessao} api={api} parceiro={parceiro} semChave={!!ctx.semChave} aprendizado={aprendizado} />
    </div>
  )

  const RAPIDOS = [50, 100, 300, 500, 1000]
  const telaOrcamento = (
    <div className="es-campos">
      <div className="es-valor">
        <span>R$</span>
        <input id="es-diario" type="number" inputMode="numeric" min={6} max={ctx.maxDia} value={dados.diario} onChange={(e) => mudar((d) => ({ ...d, diario: Math.max(0, Math.min(ctx.maxDia, Math.round(Number(e.target.value) || 0))) }))} aria-label="Orçamento por dia, em reais" />
        <small>por dia</small>
      </div>
      <input className="es-regua" type="range" min={20} max={2000} step={10} value={Math.min(2000, dados.diario)} onChange={(e) => mudar((d) => ({ ...d, diario: Number(e.target.value) }))} aria-label="Orçamento por dia" />
      <div className="es-chips centro">{RAPIDOS.map((v) => <button key={v} type="button" className={dados.diario === v ? 'on' : ''} onClick={() => mudar((d) => ({ ...d, diario: v }))}>{brl(v, 0)}</button>)}</div>
      <div className="es-estimativa">
        {porDia ? (
          <><b>≈ {int(porDia)} cadastros por dia</b><span>Estimativa pelo custo do período escolhido no painel ({brl(custo!)} por cadastro). Não é promessa: o custo muda com o criativo e o dia.</span></>
        ) : <span>Quando houver cadastros vindos de anúncio, aparece aqui quantos esse valor tende a trazer.</span>}
        <span className="es-mes">Em 30 dias: até {brl(dados.diario * 30, 0)}{teste ? ` · metade para cada versão (${brl(dados.diario / 2, 0)} + ${brl(dados.diario / 2, 0)} por dia)` : ''}</span>
      </div>
      {teste && (
        <div className="es-campo">
          <span>Quanto tempo o teste dura: <b>{dados.teste!.dias} dias</b></span>
          <input className="es-regua" type="range" min={3} max={14} value={dados.teste!.dias} onChange={(e) => mudar((d) => ({ ...d, teste: { ...d.teste!, dias: Number(e.target.value) } }))} aria-label="Dias de teste" />
          <small className={dados.teste!.dias < diasSugeridos ? 'es-dica amarelo' : 'es-dica'}>
            {porDia ? `Com esse orçamento, ${diasSugeridos} dias juntam uns 80 cadastros, o bastante para a comparação ter certeza.` : 'A Meta recomenda pelo menos 7 dias para o resultado valer.'}
          </small>
        </div>
      )}
      {dados.diario < 6 && <p className="es-erro">O mínimo da Meta é R$ 6 por dia.</p>}
    </div>
  )

  const publicoTexto = (p?: Publico) => resumoDoPublico(p ?? {})
  const telaRevisar = (
    <div className="es-campos">
      <ul className="es-checks">
        {checagens.map((c) => (
          <li key={c.nome} className={c.ok ? 'ok' : 'falta'}>
            <i aria-hidden="true">{c.ok ? <Icone nome="ok" tam={14} /> : '!'}</i>
            <span>{c.ok ? c.nome : c.falta}</span>
            {!c.ok && !(ctx.semChave && c.passo === 'criativo' && dados.midia) && <button type="button" onClick={() => irPara(c.passo)}>Resolver</button>}
          </li>
        ))}
      </ul>
      {sinais.some((s) => s.cor === 'amarelo') && <p className="es-dica amarelo">O texto tem {sinais.filter((s) => s.cor === 'amarelo').length} {sinais.filter((s) => s.cor === 'amarelo').length === 1 ? 'ponto' : 'pontos'} de atenção que a Meta costuma reprovar. Dá para criar, mas vale revisar.</p>}
      <dl className="es-resumo">
        <div><dt>Anúncio</dt><dd>GF | {nomeFinal}</dd></div>
        <div><dt>Campanha</dt><dd>{dados.destino.campanha === 'nova' ? `GF | ${dados.destino.nomeCampanha} (nova)` : campanhaEscolhida?.nome}</dd></div>
        <div><dt>Público</dt><dd>{conjuntoExistente ? `${conjuntoEscolhido?.nome ?? ''} (já existe)` : teste && variavel === 'publico' ? `A: ${publicoTexto(dados.publico)} · B: ${publicoTexto(dados.publicoB!)}` : publicoTexto(dados.publico)}</dd></div>
        <div><dt>Orçamento</dt><dd>{conjuntoExistente ? `O do público escolhido${conjuntoEscolhido?.orcDia ? ` (${brl(conjuntoEscolhido.orcDia, 0)}/dia)` : ''}` : `${brl(dados.diario, 0)} por dia${teste ? `, por ${dados.teste!.dias} dias` : ''}`}</dd></div>
        {teste && <div><dt>O que muda</dt><dd>{VARIAVEIS.find((v) => v.id === variavel)?.nome}</dd></div>}
        <div><dt>Conta</dt><dd>{contaNome} · @{ctx.instagram.usuario}</dd></div>
      </dl>
      {ctx.semChave && <p className="es-dica amarelo">Falta conectar a chave da conta de anúncios. O rascunho fica salvo e você cria assim que ela chegar.</p>}
    </div>
  )

  const telas: Record<IdPasso, ReactElement> = { teste: telaTeste, criativo: telaCriativo, mensagem: telaMensagem, destino: telaDestino, publico: telaPublico, orcamento: telaOrcamento, revisar: telaRevisar }
  const previa = (
    <Previa midia={previaMidia} texto={previaTexto} usuario={ctx.instagram.usuario} foto={fotoDaConta(ctx)} paginaNome={ctx.pagina.nome} link={dados.link} lugar={lugar} setLugar={setLugar}
      rotulo={teste && variavel && variavel !== 'publico' ? `Versão ${lado.toUpperCase()}` : undefined} />
  )

  return (
    <div className="es-criador" role="dialog" aria-modal="true" aria-labelledby="es-criador-titulo" data-sem-vocabulario="">
      <header className="es-topo">
        <button type="button" className="es-btn fino" onClick={() => void sair()} disabled={!!criando}><Icone nome="fechar" tam={16} />{feito ? 'Fechar' : 'Salvar e sair'}</button>
        <div className="es-titulo">
          <small>{teste ? 'Teste A/B' : 'Anúncio novo'}</small>
          <input id="es-criador-titulo" value={dados.nomeAnuncio} placeholder={nomeFinal} onChange={(e) => mudar((d) => ({ ...d, nomeAnuncio: e.target.value }))} aria-label="Nome do anúncio" disabled={!!feito} />
        </div>
        <span className={`es-salvo ${salvo ?? ''}`} aria-live="polite">{salvo === 'salvando' ? 'Salvando…' : salvo === 'salvo' ? 'Rascunho salvo' : salvo === 'erro' ? 'Não salvou, tentando de novo' : ''}</span>
      </header>

      {feito ? (
        <div className="es-feito">
          <div className="es-feito-ic"><Icone nome={feito === 'ligado' ? 'ligar' : 'ok'} tam={38} /></div>
          <h2>{feito === 'ligado' ? 'No ar.' : 'Pronto. Está na Meta, pausado.'}</h2>
          <p>{feito === 'ligado'
            ? 'A Meta revisa o anúncio antes de entregar, normalmente em algumas horas. Os números aparecem no painel e em "Rodando agora".'
            : `Nada está gastando. Quando quiser, ligue aqui${teste ? ': o teste A/B começa na hora em que ligar.' : '.'}`}</p>
          {avisos.map((a) => <p key={a} className="es-dica amarelo">{a}</p>)}
          <div className="es-feito-acoes">
            {feito === 'pausado' && <button type="button" className="es-btn principal grande" onClick={() => setLigar({})}><Icone nome="ligar" tam={18} />Ligar agora</button>}
            <button type="button" className="es-btn grande" onClick={() => { mudou.current = true; void sair() }}>{feito === 'pausado' ? 'Deixar pausado' : 'Voltar ao estúdio'}</button>
          </div>
          <div className="es-feito-previa">{previa}</div>
        </div>
      ) : (
        <div className="es-corpo">
          <nav className="es-trilho" aria-label="Passos">
            <ol>
              {ordem.map((p, i) => (
                <li key={p} className={`${i === passo ? 'on' : ''} ${i < passo || (p !== 'revisar' && passoOk(p) && i < passo) ? 'feito' : ''}`}>
                  <button type="button" onClick={() => setPasso(i)} aria-current={i === passo ? 'step' : undefined}>
                    <i aria-hidden="true">{i < passo ? <Icone nome="ok" tam={13} /> : i + 1}</i><span>{PASSOS[p].nome}</span>
                  </button>
                </li>
              ))}
            </ol>
            <span className="es-trilho-barra" aria-hidden="true"><i style={{ width: `${((passo + 1) / ordem.length) * 100}%` }} /></span>
          </nav>

          <main className="es-palco" key={atual}>
            <div className="es-pergunta">
              <small>Passo {passo + 1} de {ordem.length}</small>
              <h2>{PASSOS[atual].pergunta}</h2>
            </div>
            {telas[atual]}
            {erro && <p className="es-erro">{erro}</p>}
          </main>

          <aside className={`es-lado-previa ${verPrevia ? 'aberta' : ''}`} aria-label="Prévia">
            <button type="button" className="es-fechar-previa" onClick={() => setVerPrevia(false)} aria-label="Fechar prévia"><Icone nome="fechar" tam={18} /></button>
            {teste && variavel && variavel !== 'publico' && !temLados && (
              <div className="es-lados mini">{(['a', 'b'] as Lado[]).map((l) => <button key={l} type="button" className={lado === l ? 'on' : ''} onClick={() => setLado(l)}>Versão {l.toUpperCase()}</button>)}</div>
            )}
            {previa}
          </aside>

          <footer className="es-rodape">
            <button type="button" className="es-btn" onClick={voltar} disabled={passo === 0 || !!criando}><Icone nome="voltar" tam={16} />Voltar</button>
            <button type="button" className="es-btn so-celular" onClick={() => setVerPrevia(true)}><Icone nome="olho" tam={16} />Prévia</button>
            {atual === 'revisar'
              ? <button type="button" className="es-btn principal" onClick={() => void criar()} disabled={!podeCriar || !!criando}>{criando ? 'Criando…' : <><span className="longo">Criar na Meta, pausado</span><span className="curto">Criar pausado</span></>}</button>
              : <button type="button" className="es-btn principal" onClick={seguir}>Continuar</button>}
          </footer>
        </div>
      )}

      {criando && (
        <div className="es-criando" aria-live="polite">
          <div className="es-criando-caixa">
            <span className="es-giro" aria-hidden="true" />
            <h3>{criando.aguardandoVideo ? 'A Meta está terminando de preparar o vídeo' : 'Criando na Meta'}</h3>
            <ol>{ETAPAS.map((e, i) => <li key={e} className={i < criando.etapa ? 'ok' : i === criando.etapa ? 'on' : ''}><i aria-hidden="true">{i < criando.etapa ? <Icone nome="ok" tam={12} /> : ''}</i>{e}</li>)}</ol>
            <small>Tudo nasce pausado. Pode levar alguns segundos.</small>
          </div>
        </div>
      )}
      {ligar && (
        <Confirmar titulo="Ligar e começar a gastar?" botao="Ligar agora" indo={ligar.indo} erro={ligar.erro} confirmar={() => void confirmarLigar()} cancelar={() => setLigar(null)}>
          <p>{conjuntoExistente
            ? <>O anúncio entra no público <b>{conjuntoEscolhido?.nome}</b>{conjuntoEscolhido?.orcDia ? <>, que gasta até <b>{brl(conjuntoEscolhido.orcDia)}</b> por dia</> : null}.</>
            : <>Vai gastar até <b>{brl(dados.diario)} por dia</b> na conta <b>{contaNome}</b>{teste ? <>, metade em cada versão, por {dados.teste!.dias} dias</> : null}.</>}</p>
          <p className="es-mudo">Dá para pausar a qualquer momento em "Rodando agora".</p>
        </Confirmar>
      )}
    </div>
  )
}

function Semaforo({ sinais }: { sinais: ReturnType<typeof sinaisDoTexto> }) {
  if (!sinais.length) return <div className="es-semaforo limpo"><i aria-hidden="true" /><span><b>Texto dentro das regras.</b> Nenhuma palavra que a marca não usa e nada que a Meta costuma reprovar.</span></div>
  return (
    <ul className="es-semaforo" aria-label="Conferência do texto">
      {sinais.map((s, i) => (
        <li key={`${s.trecho}-${i}`} className={s.cor}><i aria-hidden="true" /><div><b>{s.cor === 'azul' ? 'Dica' : `“${s.trecho}”`}</b><span>{s.motivo}</span></div></li>
      ))}
    </ul>
  )
}
