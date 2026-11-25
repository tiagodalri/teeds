/**
 * As telas prontas do painel da sala de treino (18/11/2026). Cada tela nasce
 * de um modelo e se edita só pelos campos dele (texto, foto, vídeo); as
 * fontes que o motor desenha saem montadas daqui, sempre do mesmo jeito.
 *
 * Os ids das fontes são fixos por tela e papel (`<tela>-<papel>`): editar um
 * texto não recarrega o vídeo de fundo nem corta o som dele.
 */
import { MARCA, FAMILIA_GF, GF_NOME } from '../../../marca'
import {
  ALTURA, CANAL_PADRAO, LARGURA, novoId,
  type CamposDoModelo, type Cena, type ConfigDoEstudio, type EstiloDeTexto, type Fonte, type TipoDeModelo,
} from './tipos'

const BASE = import.meta.env.BASE_URL
const GF = FAMILIA_GF

/** O dourado da arte da live (o mesmo nos dois temas: a tela é sempre noturna). */
export const OURO = '#D6AE5B'

export interface InfoDoModelo {
  tipo: TipoDeModelo
  nome: string
  /** Uma linha, no cartão e na escolha de um modelo novo. */
  dica: string
  campos: CamposDoModelo
}

const FUNDO_GF: CamposDoModelo = GF ? { fundoUrl: `${BASE}estudio-globalfly/fundo.webp`, fundoTipo: 'imagem', fundoNome: `Fundo da ${GF_NOME}` } : {}

/** Os modelos, na ordem em que aparecem no painel. */
export const MODELOS: InfoDoModelo[] = [
  { tipo: 'abertura', nome: 'Começa em instantes', dica: 'A primeira tela, sempre', campos: { titulo: 'LIVE INICIANDO', subtitulo: 'EM INSTANTES', mic: 'nao', ...FUNDO_GF } },
  { tipo: 'aovivo', nome: 'Ao vivo', dica: 'Sua tela com você no canto', campos: { canto: 'inf-dir', camera: 'sim', mic: 'sim', somDaTela: 'nao' } },
  { tipo: 'camera', nome: 'Só câmera', dica: 'Conversa de frente', campos: { legenda: '', mic: 'sim' } },
  { tipo: 'intervalo', nome: 'Intervalo', dica: 'Pausa rápida', campos: { titulo: 'VOLTAMOS JÁ', subtitulo: 'FIQUE POR AQUI', mic: 'nao', ...FUNDO_GF } },
  { tipo: 'depoimento', nome: 'Depoimento', dica: 'Foto ou vídeo de um cliente', campos: { nome: '', cidade: '', frase: '', mic: 'sim' } },
  {
    tipo: 'encerramento', nome: 'Encerramento', dica: GF ? `Vídeo da ${GF_NOME}` : 'Agradecimento final',
    campos: GF
      ? { titulo: '', subtitulo: '', mic: 'nao', fundoUrl: `${BASE}estudio-globalfly/encerramento.mp4`, fundoTipo: 'video', fundoNome: `Vídeo de encerramento da ${GF_NOME}` }
      : { titulo: 'OBRIGADO POR ASSISTIR', subtitulo: 'ATÉ A PRÓXIMA LIVE', mic: 'nao' },
  },
  { tipo: 'arte', nome: 'Arte ou vídeo', dica: 'Sua imagem, vídeo ou animação na tela toda', campos: { mic: 'nao', repetir: 'sim' } },
]

export const infoDoModelo = (tipo: TipoDeModelo): InfoDoModelo => MODELOS.find((m) => m.tipo === tipo) ?? MODELOS[0]

/** O que o vídeo de uma tela faz ao terminar (24/11/2026): repete, volta para a tela de antes ou para no último quadro. */
export type QuandoTerminar = 'repetir' | 'voltar' | 'parar'
export const quandoTerminar = (c: CamposDoModelo): QuandoTerminar =>
  c.aoTerminar === 'voltar' || c.aoTerminar === 'parar' || c.aoTerminar === 'repetir' ? c.aoTerminar : c.repetir === 'nao' ? 'parar' : 'repetir'

/**
 * Os vídeos que a equipe usa nas lives (24/11/2026, pedido do Tiago): vêm com a plataforma
 * (public/estudio-<marca>/videos), um clique em "Nova tela" e eles viram uma tela pronta.
 */
export interface VideoPronto { id: string; nome: string; dica: string; url: string; aoTerminar: QuandoTerminar }
export const VIDEOS_PRONTOS: VideoPronto[] = GF ? [
  { id: 'abertura-apresentacao', nome: 'Vinheta de abertura', dica: 'Live iniciando e a plataforma · 43 s', url: `${BASE}estudio-globalfly/videos/abertura-apresentacao.mp4`, aoTerminar: 'voltar' },
  { id: 'tutorial-operar', nome: 'Tutorial: como operar', dica: 'Passo a passo na plataforma · 3 min 36 s', url: `${BASE}estudio-globalfly/videos/tutorial-operar.mp4`, aoTerminar: 'voltar' },
  { id: 'obrigado-por-assistir', nome: 'Obrigado por assistir', dica: 'Fim da live · 12 s, repete', url: `${BASE}estudio-globalfly/videos/obrigado-por-assistir.mp4`, aoTerminar: 'repetir' },
] : []

/* ------------------------------------------------------------ montar */

const vazio = { esq: 0, topo: 0, dir: 0, baixo: 0 }
const base = (id: string, f: Partial<Fonte> & Pick<Fonte, 'tipo' | 'nome'>): Fonte => ({
  id, visivel: true, bloqueada: true, x: 0, y: 0, w: LARGURA, h: ALTURA, recorte: vazio, ...f,
})
const estilo = (t: Partial<EstiloDeTexto> & Pick<EstiloDeTexto, 'conteudo'>): EstiloDeTexto => ({
  tamanho: 96, cor: '#ffffff', negrito: true, fonte: 'marca', alinhamento: 'centro', espacamento: 0, caixaAlta: false, ...t,
})
/** Um texto; a largura certa sai quando o motor desenha as letras (o centro fica no lugar). */
const texto = (id: string, nome: string, e: EstiloDeTexto, y: number, x = LARGURA / 2 - 400, w = 800): Fonte =>
  base(id, { tipo: 'texto', nome, texto: e, x, y, w, h: e.tamanho * 1.22 * Math.max(1, e.conteudo.split('\n').length) })

/** Quebra a frase em linhas de até `max` letras (sem cortar palavra). */
export function quebrar(frase: string, max: number): string {
  const linhas: string[] = []
  for (const paragrafo of frase.split('\n')) {
    let atual = ''
    for (const p of paragrafo.split(/\s+/).filter(Boolean)) {
      if (atual && (atual + ' ' + p).length > max) { linhas.push(atual); atual = p } else atual = atual ? `${atual} ${p}` : p
    }
    linhas.push(atual)
  }
  return linhas.join('\n').trim()
}

/** A foto ou o vídeo de um campo (enviado neste computador ou que já vem com a plataforma). */
function midia(c: CamposDoModelo, prefixo: 'fundo' | 'midia'): { arquivo?: string; url?: string; tipo: 'imagem' | 'video'; nome: string } | null {
  const arquivo = c[prefixo] || undefined
  const url = c[`${prefixo}Url`] || undefined
  if (!arquivo && !url) return null
  return { arquivo, url, tipo: c[`${prefixo}Tipo`] === 'video' ? 'video' : 'imagem', nome: c[`${prefixo}Nome`] || 'Arquivo' }
}

function fonteDaMidia(id: string, m: NonNullable<ReturnType<typeof midia>>, extra: Partial<Fonte> = {}): Fonte {
  return base(id, {
    tipo: m.tipo, nome: m.nome, arquivo: m.arquivo, url: m.url, nomeDoArquivo: m.nome,
    ...(m.tipo === 'video' ? { repetir: true, reiniciar: true } : {}),
    caber: 'cobrir', ...extra,
  })
}

const fundoLiso = (id: string): Fonte => base(`${id}-cor`, { tipo: 'cor', nome: 'Fundo', cor: '#05080f' })
const microfone = (id: string): Fonte => base(`${id}-mic`, { tipo: 'microfone', nome: 'Microfone', dispositivo: '' })
const sim = (v: string | undefined) => v === 'sim'

const CANTOS: Record<string, { x: number; y: number }> = {
  'sup-esq': { x: 40, y: 40 }, 'sup-dir': { x: LARGURA - 520, y: 40 },
  'inf-esq': { x: 40, y: ALTURA - 310 }, 'inf-dir': { x: LARGURA - 520, y: ALTURA - 310 },
}

/** As fontes de uma tela, montadas a partir do modelo (a primeira da lista fica por cima). */
export function montarFontes(cenaId: string, tipo: TipoDeModelo, c: CamposDoModelo): Fonte[] {
  const id = cenaId
  const mic = sim(c.mic) ? [microfone(id)] : []
  const logoEm = (y: number) => GF ? [base(`${id}-logo`, { tipo: 'imagem', nome: 'Logo', url: `${BASE}globalfly-assinatura.png`, nomeDoArquivo: 'globalfly-assinatura.png', x: LARGURA / 2 - 210, y, w: 420, h: 132 })] : []

  // telas de letreiro: título dourado, linha de baixo e o fundo
  const letreiro = (tamanhoTitulo: number): Fonte[] => {
    const f = midia(c, 'fundo')
    const titulo = (c.titulo ?? '').trim(), sub = (c.subtitulo ?? '').trim()
    // título comprido: quebra em linhas e diminui a letra para caber; a linha de baixo desce junto
    const linhas = quebrar(titulo, 18)
    const maior = Math.max(1, ...linhas.split('\n').map((l) => l.length))
    const tamanho = Math.max(64, Math.min(tamanhoTitulo, Math.floor(1700 / (maior * 0.68))))
    const n = linhas ? linhas.split('\n').length : 0
    const yTitulo = n > 2 ? 300 : n > 1 ? 340 : 400
    const comLogo = !f || f.tipo === 'imagem' ? logoEm(yTitulo - 200) : []
    const ySub = titulo ? yTitulo + Math.round(n * tamanho * 1.22) + 40 : 500
    return [
      ...mic,
      ...(sub ? [texto(`${id}-sub`, 'Linha de baixo', estilo({ conteudo: sub, tamanho: 44, espacamento: 14 }), ySub)] : []),
      ...(titulo ? [texto(`${id}-titulo`, 'Título', estilo({ conteudo: linhas, tamanho, cor: OURO, espacamento: 4 }), yTitulo)] : []),
      ...(titulo || sub ? comLogo : []),
      ...(f ? [fonteDaMidia(`${id}-fundo`, f, { repetir: true })] : [fundoLiso(id)]),
    ]
  }

  switch (tipo) {
    case 'abertura': return letreiro(150)
    case 'intervalo': return letreiro(140)
    case 'encerramento': return letreiro(120)
    case 'aovivo': {
      const p = CANTOS[c.canto] ?? CANTOS['inf-dir']
      return [
        ...mic,
        ...(sim(c.camera) ? [base(`${id}-camera`, { tipo: 'camera', nome: 'Câmera', dispositivo: '', x: p.x, y: p.y, w: 480, h: 270, caber: 'cobrir' })] : []),
        base(`${id}-tela`, { tipo: 'tela', nome: 'Tela compartilhada', audioDaTela: sim(c.somDaTela), caber: 'conter' }),
        fundoLiso(id),
      ]
    }
    case 'camera': {
      const legenda = (c.legenda ?? '').trim()
      return [
        ...mic,
        ...(legenda ? [
          texto(`${id}-legenda`, 'Legenda', estilo({ conteudo: legenda, tamanho: 54, alinhamento: 'esquerda' }), ALTURA - 170, 110, 900),
          base(`${id}-faixa`, { tipo: 'cor', nome: 'Faixa da legenda', cor: '#0b0f17', x: 80, y: ALTURA - 190, w: 18, h: 110 }),
          base(`${id}-faixa-ouro`, { tipo: 'cor', nome: 'Detalhe', cor: OURO, x: 80, y: ALTURA - 190, w: 8, h: 110 }),
        ] : []),
        base(`${id}-camera`, { tipo: 'camera', nome: 'Câmera', dispositivo: '', caber: 'cobrir' }),
        fundoLiso(id),
      ]
    }
    case 'depoimento': {
      const m = midia(c, 'midia')
      const nome = (c.nome ?? '').trim(), cidade = (c.cidade ?? '').trim(), frase = (c.frase ?? '').trim()
      const fundo = midia(c, 'fundo') ?? (GF ? midia(FUNDO_GF, 'fundo') : null)
      const fundoF = fundo ? fonteDaMidia(`${id}-fundo`, fundo) : fundoLiso(id)
      if (!m && !frase && !nome) {
        return [...mic, texto(`${id}-vazio`, 'Aviso', estilo({ conteudo: 'Escreva o depoimento no lápis desta tela', tamanho: 56, cor: '#8a8f99', negrito: false }), 500), fundoF]
      }
      if (!m) {
        // sem foto: a frase no centro
        const linhas = quebrar(frase, 34)
        const n = linhas.split('\n').length
        const yFrase = Math.max(200, 470 - n * 42)
        const yNome = yFrase + n * 86 + 50
        return [
          ...mic,
          ...(cidade ? [texto(`${id}-cidade`, 'Cidade', estilo({ conteudo: cidade, tamanho: 42, cor: '#c3c8d1', negrito: false, espacamento: 2 }), yNome + 84)] : []),
          ...(nome ? [texto(`${id}-nome`, 'Nome', estilo({ conteudo: nome, tamanho: 58, cor: OURO }), yNome)] : []),
          ...(frase ? [texto(`${id}-frase`, 'Frase', estilo({ conteudo: linhas, tamanho: 70, negrito: false }), yFrase)] : []),
          texto(`${id}-aspas`, 'Aspas', estilo({ conteudo: '“', tamanho: 220, cor: OURO }), yFrase - 230),
          fundoF,
        ]
      }
      // com foto ou vídeo: a imagem à esquerda, a frase à direita
      const linhas = quebrar(frase, 24)
      const n = linhas.split('\n').length
      const yFrase = Math.max(250, 520 - n * 38)
      const yNome = yFrase + n * 76 + 40
      return [
        ...mic,
        ...(cidade ? [texto(`${id}-cidade`, 'Cidade', estilo({ conteudo: cidade, tamanho: 40, cor: '#c3c8d1', negrito: false, alinhamento: 'esquerda', espacamento: 2 }), yNome + 78, 1000, 800)] : []),
        ...(nome ? [texto(`${id}-nome`, 'Nome', estilo({ conteudo: nome, tamanho: 56, cor: OURO, alinhamento: 'esquerda' }), yNome, 1000, 800)] : []),
        ...(frase ? [texto(`${id}-frase`, 'Frase', estilo({ conteudo: linhas, tamanho: 62, negrito: false, alinhamento: 'esquerda' }), yFrase, 1000, 800)] : []),
        texto(`${id}-aspas`, 'Aspas', estilo({ conteudo: '“', tamanho: 200, cor: OURO, alinhamento: 'esquerda' }), yFrase - 200, 990, 200),
        fonteDaMidia(`${id}-midia`, m, { x: 140, y: 140, w: 760, h: 800, caber: m.tipo === 'video' ? 'conter' : 'cobrir', repetir: false }),
        base(`${id}-fundo-midia`, { tipo: 'cor', nome: 'Fundo da foto', cor: '#000000', x: 140, y: 140, w: 760, h: 800 }),
        base(`${id}-moldura`, { tipo: 'cor', nome: 'Moldura', cor: OURO, x: 136, y: 136, w: 768, h: 808 }),
        fundoF,
      ]
    }
    case 'arte': {
      const m = midia(c, 'midia')
      return [
        ...mic,
        ...(m ? [fonteDaMidia(`${id}-midia`, m, { caber: 'conter', repetir: quandoTerminar(c) === 'repetir' })] : [
          texto(`${id}-vazio`, 'Aviso', estilo({ conteudo: 'Escolha a arte no lápis desta tela', tamanho: 56, cor: '#8a8f99', negrito: false }), 500),
        ]),
        base(`${id}-cor`, { tipo: 'cor', nome: 'Fundo', cor: '#000000' }),
      ]
    }
  }
}

/** Uma tela nova a partir do modelo. */
export function telaDoModelo(tipo: TipoDeModelo, nome?: string, campos?: CamposDoModelo): Cena {
  const info = infoDoModelo(tipo)
  const id = novoId()
  const c = { ...info.campos, ...campos }
  return { id, nome: nome ?? info.nome, modelo: { tipo, campos: c }, fontes: montarFontes(id, tipo, c) }
}

/** As telas da primeira vez (e de quem vinha do estúdio estilo OBS). */
export function cenasProntas(): ConfigDoEstudio {
  const cenas = MODELOS.filter((m) => m.tipo !== 'arte').map((m) => telaDoModelo(m.tipo))
  return {
    versao: 2,
    cenas,
    programa: cenas[0].id,
    previa: cenas[1].id,
    modoEstudio: false,
    transicao: 'esmaecer',
    duracaoMs: 500,
    stinger: { layout: 'lado-a-lado', inverter: false, pontoMs: 600, fadeAudio: 'cruzado', volume: 1, mudo: false, monitor: 'ambos' },
    canais: { 'mic:padrao': { ...CANAL_PADRAO } },
    ouvirPrevia: false,
    saidaDoFone: '',
  }
}
