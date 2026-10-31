/**
 * As cenas prontas na primeira vez que o estúdio abre: Iniciando,
 * Operacional e Encerramento (os exemplos do escopo do Victor). Na GlobalFly,
 * com o fundo e o vídeo de encerramento que ele mandou (estudio-globalfly/).
 */
import { MARCA } from '../../../marca'
import { ALTURA, CANAL_PADRAO, LARGURA, novoId, type Cena, type ConfigDoEstudio, type EstiloDeTexto, type Fonte } from './tipos'

const BASE = import.meta.env.BASE_URL
const GF = MARCA.id === 'globalfly'

/** O dourado da arte da live (o mesmo nos dois temas: a cena é sempre noturna). */
const OURO = '#D6AE5B'

const fonte = (f: Partial<Fonte> & Pick<Fonte, 'tipo' | 'nome'>): Fonte => ({
  id: novoId(), visivel: true, bloqueada: false, x: 0, y: 0, w: LARGURA, h: ALTURA,
  recorte: { esq: 0, topo: 0, dir: 0, baixo: 0 }, ...f,
})

const texto = (t: Partial<EstiloDeTexto> & Pick<EstiloDeTexto, 'conteudo'>): EstiloDeTexto => ({
  tamanho: 96, cor: '#ffffff', negrito: true, fonte: 'marca', alinhamento: 'centro', espacamento: 0, caixaAlta: false, ...t,
})

/** Um texto centralizado na horizontal; a largura certa sai quando ele é desenhado. */
const linha = (nome: string, estilo: EstiloDeTexto, y: number): Fonte =>
  fonte({ tipo: 'texto', nome, texto: estilo, x: LARGURA / 2 - 400, y, w: 800, h: estilo.tamanho * 1.3, encaixar: null })

export function cenasProntas(): ConfigDoEstudio {
  const ouro = OURO
  const fundo = (): Fonte => GF
    ? fonte({ tipo: 'imagem', nome: 'Fundo', url: `${BASE}estudio-globalfly/fundo.webp`, nomeDoArquivo: 'fundo.webp', bloqueada: true })
    : fonte({ tipo: 'cor', nome: 'Fundo', cor: '#0a0d14', bloqueada: true })
  const assinatura = (y: number): Fonte | null => GF
    ? fonte({ tipo: 'imagem', nome: 'Logo', url: `${BASE}globalfly-assinatura.png`, nomeDoArquivo: 'globalfly-assinatura.png', x: LARGURA / 2 - 210, y, w: 420, h: 132 })
    : null

  const iniciando: Cena = {
    id: novoId(), nome: 'Iniciando',
    fontes: [
      linha('Em instantes', texto({ conteudo: 'EM INSTANTES', tamanho: 44, espacamento: 14 }), 610),
      linha('Live iniciando', texto({ conteudo: 'LIVE INICIANDO', tamanho: 150, cor: ouro, espacamento: 4 }), 400),
      assinatura(220),
      fundo(),
    ].filter((f): f is Fonte => !!f),
  }

  const operacional: Cena = {
    id: novoId(), nome: 'Operacional',
    fontes: [
      fonte({ tipo: 'microfone', nome: 'Microfone', dispositivo: '' }),
      fonte({ tipo: 'camera', nome: 'Câmera', dispositivo: '', x: LARGURA - 520, y: ALTURA - 330, w: 480, h: 270, encaixar: 'canto' }),
      fonte({ tipo: 'tela', nome: 'Tela compartilhada', audioDaTela: false, encaixar: 'ajustar' }),
      fonte({ tipo: 'cor', nome: 'Fundo', cor: '#05080f', bloqueada: true }),
    ],
  }

  const encerramento: Cena = {
    id: novoId(), nome: 'Encerramento',
    fontes: GF
      ? [fonte({ tipo: 'video', nome: 'Vídeo de encerramento', url: `${BASE}estudio-globalfly/encerramento.mp4`, nomeDoArquivo: 'encerramento.mp4', repetir: true, reiniciar: true, bloqueada: true })]
      : [
        linha('Obrigado', texto({ conteudo: 'OBRIGADO POR ASSISTIR.', tamanho: 120 }), 470),
        fundo(),
      ],
  }

  return {
    versao: 1,
    cenas: [iniciando, operacional, encerramento],
    programa: iniciando.id,
    previa: operacional.id,
    modoEstudio: true,
    transicao: 'esmaecer',
    duracaoMs: 300,
    stinger: { layout: 'lado-a-lado', inverter: false, pontoMs: 600, fadeAudio: 'cruzado', volume: 1, mudo: false, monitor: 'ambos' },
    canais: { 'mic:padrao': { ...CANAL_PADRAO } },
    ouvirPrevia: false,
    saidaDoFone: '',
  }
}
