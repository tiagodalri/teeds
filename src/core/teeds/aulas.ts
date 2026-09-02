/**
 * O catalogo de aulas da Teeds — a "sala de aula" da plataforma.
 *
 * ESTE E O UNICO ARQUIVO PARA MEXER quando os videos chegarem: cole o
 * link em `video` (YouTube, Vimeo ou .mp4 direto) e preencha `duracao`.
 * Aula sem video aparece como "em breve" — o cartao existe, mas nao abre
 * player.
 *
 * A ordem aqui e a ordem na tela. A numeracao ("Aula 1", "Aula 2"...) e
 * continua atraves dos modulos, calculada sozinha.
 */

export interface Aula {
  id: string
  titulo: string
  descricao: string
  /** YouTube (watch, youtu.be, shorts), Vimeo ou .mp4. Vazio = em breve. */
  video: string
  /** Ex.: "4 min". Pode ficar vazio ate o video existir. */
  duracao: string
}

export interface Modulo {
  id: string
  titulo: string
  chamada: string
  /** Cor da capa dos cartoes deste modulo. */
  cor: string
  aulas: Aula[]
}

/** Placeholder oficial usado somente enquanto os vídeos Teeds não chegaram. */
export const VIDEO_DEMONSTRACAO = 'https://www.youtube.com/watch?v=M7lc1UVf-VE'

export const MODULOS: Modulo[] = [
  {
    id: 'comeco',
    titulo: 'Comece por aqui',
    chamada: 'Do zero até a plataforma aberta na sua frente.',
    cor: '#4c6fff',
    aulas: [
      {
        id: 'boas-vindas',
        titulo: 'Bem-vindo à Teeds',
        descricao: 'O que é a plataforma, o que dá para fazer nela e o caminho das primeiras aulas.',
        video: '', duracao: '',
      },
      {
        id: 'conta-corretora',
        titulo: 'Criando sua conta na corretora',
        descricao: 'Passo a passo do cadastro na Deriv, a corretora onde o seu dinheiro fica.',
        video: '', duracao: '',
      },
      {
        id: 'conectar-corretora',
        titulo: 'Conectando a corretora à Teeds',
        descricao: 'O botão "Conectar minha Deriv": autorizando a Teeds a operar na sua conta.',
        video: '', duracao: '',
      },
      {
        id: 'conhecendo-plataforma',
        titulo: 'Conhecendo a plataforma',
        descricao: 'Um passeio pelas telas: mercado, gráfico, posições, operações e o seu perfil.',
        video: '', duracao: '',
      },
    ],
  },
  {
    id: 'dinheiro',
    titulo: 'Depósito e saque',
    chamada: 'Como o dinheiro entra, como o dinheiro sai.',
    cor: '#0d9488',
    aulas: [
      {
        id: 'demo-vs-real',
        titulo: 'Conta demo e conta real',
        descricao: 'A diferença entre o dinheiro fictício de treino e o dinheiro de verdade.',
        video: '', duracao: '',
      },
      {
        id: 'deposito',
        titulo: 'Fazendo um depósito',
        descricao: 'Como colocar dinheiro na sua conta da corretora, com as opções disponíveis no Brasil.',
        video: '', duracao: '',
      },
      {
        id: 'saque',
        titulo: 'Fazendo um saque',
        descricao: 'Como tirar o seu dinheiro: prazos, limites e o caminho na corretora.',
        video: '', duracao: '',
      },
    ],
  },
  {
    id: 'operando',
    titulo: 'Operando na Teeds',
    chamada: 'A mesa de operação, na prática.',
    cor: '#e8892b',
    aulas: [
      {
        id: 'subir-descer',
        titulo: 'Operando Subir e Descer',
        descricao: 'A operação mais simples: escolher direção, valor e duração — e o que é o pagamento.',
        video: '', duracao: '',
      },
      {
        id: 'digitos',
        titulo: 'Operando Dígitos',
        descricao: 'Os contratos de último dígito: como funcionam, o painel de frequência e a fita.',
        video: '', duracao: '',
      },
      {
        id: 'posicoes-operacoes',
        titulo: 'Posições abertas e histórico',
        descricao: 'Acompanhando cada contrato ao vivo e lendo o seu histórico de operações.',
        video: '', duracao: '',
      },
    ],
  },
  {
    id: 'robos',
    titulo: 'Os robôs',
    chamada: 'O que cada robô faz — e os freios que protegem você.',
    cor: '#8b5cf6',
    aulas: [
      {
        id: 'robos-como-funcionam',
        titulo: 'Como os robôs funcionam',
        descricao: 'O motor da Teeds, o que o robô compra e por que a aba precisa ficar aberta.',
        video: '', duracao: '',
      },
      {
        id: 'robo-ag7',
        titulo: 'Teeds - AG7',
        descricao: 'O robô dos dígitos altos: ganha no 7, 8 e 9. Configuração passo a passo.',
        video: '', duracao: '',
      },
      {
        id: 'robo-ag2',
        titulo: 'Teeds - AG2',
        descricao: 'O espelho do AG7 nos dígitos baixos: ganha no 0, 1 e 2.',
        video: '', duracao: '',
      },
      {
        id: 'freios',
        titulo: 'Os freios: stop, take e martingale',
        descricao: 'Quando o robô para sozinho, o que é o martingale e como operar com responsabilidade.',
        video: '', duracao: '',
      },
    ],
  },
]

/* ------------------------------------------------------------ numeração */

export interface AulaNumerada extends Aula {
  numero: number
  modulo: Modulo
}

/** Todas as aulas, na ordem, com o número contínuo ("Aula 1", "Aula 2"…). */
export function todasAsAulas(): AulaNumerada[] {
  const lista: AulaNumerada[] = []
  let n = 1
  for (const m of MODULOS) {
    for (const a of m.aulas) lista.push({
      ...a,
      video: a.video || VIDEO_DEMONSTRACAO,
      duracao: a.duracao || 'Vídeo demonstrativo',
      numero: n++, modulo: m,
    })
  }
  return lista
}

/* ------------------------------------------------------------- player */

export type Player =
  | { tipo: 'youtube' | 'vimeo'; src: string }
  | { tipo: 'mp4'; src: string }
  | null

/** Transforma o link colado no catálogo no endereço que o player usa. */
export function playerDoVideo(url: string): Player {
  const u = url.trim()
  if (!u) return null
  const yt = u.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/,
  )
  if (yt) return { tipo: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0` }
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vm) return { tipo: 'vimeo', src: `https://player.vimeo.com/video/${vm[1]}` }
  if (/\.(mp4|webm|m3u8)(\?|$)/i.test(u)) return { tipo: 'mp4', src: u }
  // link desconhecido: tenta como pagina embutivel
  return { tipo: 'youtube', src: u }
}

/* ------------------------------------------------------------ progresso */

const CHAVE = 'teeds.aulas.vistas'

export function aulasVistas(): Set<string> {
  try {
    const bruto = localStorage.getItem(CHAVE)
    return new Set(bruto ? (JSON.parse(bruto) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function marcarVista(id: string, vista: boolean): Set<string> {
  const atual = aulasVistas()
  if (vista) atual.add(id)
  else atual.delete(id)
  try {
    localStorage.setItem(CHAVE, JSON.stringify([...atual]))
  } catch {
    /* sem armazenamento: o progresso vale so nesta aba */
  }
  return atual
}
