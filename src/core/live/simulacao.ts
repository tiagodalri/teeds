/**
 * Sala de treino: público e chat SIMULADOS, para influenciadores e equipe
 * ensaiarem uma live (18/10/2026, GlobalFly, plano "treino").
 *
 * Tudo roda só no navegador de quem treina: não há sala no servidor, nenhum
 * cliente vê nada daqui. A imagem leva o selo "Simulação" (combinado com o
 * Tiago: um selo só, discreto, mas sempre lá).
 *
 * O chat é montado de modelos com variação (horário do dia, nome do
 * apresentador, robôs da casa, jeito de escrever de cada um), para não
 * soar robótico. Os "momentos" mudam o assunto por alguns segundos: meta
 * batida, stop, mercado lento, rodada de perguntas, abertura.
 */
import { useSyncExternalStore } from 'react'
import { MARCA } from '../../marca'

export type Oscilacao = 'baixa' | 'media' | 'alta'
export type Ritmo = 'calmo' | 'normal' | 'agitado'
export type Momento = 'abertura' | 'meta' | 'stop' | 'lateral' | 'perguntas'

export interface MensagemSimulada {
  id: string
  nome: string
  texto: string
  apresentador: boolean
  entrada: boolean
  hora: number
  /** Escrita de verdade por um membro do plano que está assistindo o ensaio. */
  membro?: boolean
}

export interface EstadoDaSimulacao {
  ativa: boolean
  pausada: boolean
  publicoAlvo: number
  publicoAgora: number
  oscilacao: Oscilacao
  ritmo: Ritmo
  apresentador: string
  momento: Momento | null
  mensagens: MensagemSimulada[]
}

let estado: EstadoDaSimulacao = {
  ativa: false, pausada: false, publicoAlvo: 700, publicoAgora: 0, oscilacao: 'media', ritmo: 'normal',
  apresentador: '', momento: null, mensagens: [],
}
const ouvintes = new Set<() => void>()
const mudar = (p: Partial<EstadoDaSimulacao>) => { estado = { ...estado, ...p }; ouvintes.forEach((f) => f()) }
export const useSimulacao = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => estado, () => estado)
/** Fora do React: quem transmite o ensaio para os membros escuta as mudanças por aqui. */
export const ouvirSimulacao = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }
export const simulacaoAgora = () => estado

/* ------------------------------------------------------------- vocabulário */

const NOMES = [
  'Ana', 'Bruno', 'Carla', 'Diego', 'Elaine', 'Felipe', 'Gabi', 'Henrique', 'Isabela', 'João', 'Karina', 'Lucas',
  'Mariana', 'Nathan', 'Olívia', 'Paulo', 'Rafa', 'Sabrina', 'Thiago', 'Vanessa', 'Wesley', 'Yasmin', 'André',
  'Bia', 'Caio', 'Débora', 'Edu', 'Fernanda', 'Gustavo', 'Helena', 'Igor', 'Juliana', 'Kaique', 'Larissa',
  'Matheus', 'Nicole', 'Otávio', 'Priscila', 'Renan', 'Simone', 'Tati', 'Vinícius', 'Aline', 'Beto', 'Camila',
  'Danilo', 'Érica', 'Fábio', 'Giovana', 'Hugo', 'Ingrid', 'Jéssica', 'Leandro', 'Mônica', 'Pedro', 'Rose',
  'Sérgio', 'Talita', 'Valter', 'Zé', 'Luana', 'Marcos', 'Patrícia', 'Rodrigo', 'Sueli', 'Cláudio', 'Denise',
]

const robos = () => MARCA.robos.map((id) => (MARCA.nomesDosRobos?.[id] ?? id).replace(/^GlobalFly\s+/i, ''))
const sorteio = <T,>(lista: readonly T[]) => lista[Math.floor(Math.random() * lista.length)]
const periodo = () => { const h = new Date().getHours(); return h < 12 ? 'bom dia' : h < 18 ? 'boa tarde' : 'boa noite' }

type Modelo = (ap: string) => string
const MODELOS: Record<'saudacao' | 'reacao' | 'pergunta' | 'mercado' | Exclude<Momento, 'abertura' | 'perguntas'>, Modelo[]> = {
  saudacao: [
    (ap) => `${periodo()} ${ap}!`, (ap) => `${periodo()} pessoal`, () => `${periodo()} galera, cheguei`,
    (ap) => `fala ${ap}, ${periodo()}`, () => `${periodo()} a todos`, () => 'boa, começou! bora pra mais um dia',
    (ap) => `${periodo()} ${ap}, vamos com tudo hoje`, () => 'presente!', () => 'cheguei agora, o que perdi?',
    () => `${periodo()} família`, (ap) => `opa ${ap}, ${periodo()} pra você também`,
  ],
  reacao: [
    () => 'que aula', () => 'muito bom', () => 'show demais', () => 'tô anotando tudo aqui',
    () => 'faz sentido', () => 'agora entendi', () => 'top', () => 'essa explicação foi ótima',
    () => 'gestão é tudo mesmo', () => 'disciplina acima de tudo', () => 'bora!', () => 'excelente',
  ],
  pergunta: [
    () => `qual robô vocês recomendam pra começar, o ${sorteio(robos())} ou o ${sorteio(robos())}?`,
    () => 'como faço pra definir o limite de perda?', () => 'quanto vocês colocam de entrada?',
    () => 'dá pra deixar o robô ligado e sair do computador?', () => 'o saque cai em quanto tempo?',
    () => 'qual o melhor horário pra operar?', () => 'posso usar conta demo primeiro?',
    () => 'como funciona o martingale no robô?', () => 'é melhor meta diária ou por sessão?',
    () => 'o que vocês fazem quando o mercado tá lateral?', () => 'tem aula sobre gerenciamento?',
  ],
  mercado: [
    () => 'mercado tá mais calmo hoje né', () => 'esse ativo tá andando bem', () => 'olha esse movimento',
    () => 'deu uma acelerada agora', () => 'tá respeitando bem', () => 'paciência agora',
  ],
  meta: [
    (ap) => `parabéns ${ap}! meta batida`, () => 'bateu a meta e parou, isso é gestão', () => 'bora!!! meta no bolso',
    () => 'disciplina demais', () => 'é isso, meta batida, desliga e vai viver', () => 'que sessão',
    () => 'parabéns pela gestão', (ap) => `${ap} sempre falando: bateu, para`, () => 'bom demais ver assim',
  ],
  stop: [
    () => 'faz parte, amanhã tem mais', () => 'stop é proteção', () => 'respeitou o limite, isso que importa',
    () => 'gestão salvando de novo', () => 'tranquilo, cabeça fria', () => 'quem respeita o stop fica no jogo',
    (ap) => `valeu por mostrar o stop também ${ap}`, () => 'o importante é não sair do plano',
  ],
  lateral: [
    () => 'mercado de lado hoje', () => 'paciência é parte da estratégia', () => 'melhor esperar mesmo',
    () => 'sem pressa', () => 'aguardando a entrada certa', () => 'esses dias de lado testam a disciplina',
  ],
}

/** O jeito de escrever de cada um: sem acento, minúsculas, risada, letra repetida. */
function humanizar(t: string): string {
  let s = t
  if (Math.random() < 0.25) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (Math.random() < 0.5) s = s.charAt(0).toLowerCase() + s.slice(1)
  else s = s.charAt(0).toUpperCase() + s.slice(1)
  if (Math.random() < 0.12) s += ' kkk'
  if (Math.random() < 0.1) s = s.replace(/([aeo])(!?)$/, '$1$1$1$2')
  if (Math.random() < 0.15 && !/[!?]$/.test(s)) s += '!'
  return s
}

/* ---------------------------------------------------------------- motor */

const TAXA: Record<Ritmo, number> = { calmo: 8, normal: 20, agitado: 45 } // mensagens por minuto
const AMPLITUDE: Record<Oscilacao, number> = { baixa: 0.015, media: 0.04, alta: 0.09 }

let timerPublico: number | undefined
let timerChat: number | undefined
let fimMomento = 0
let inicio = 0
let contador = 0
const recentes: string[] = []

function adicionar(m: Omit<MensagemSimulada, 'id' | 'hora'>) {
  mudar({ mensagens: [...estado.mensagens, { ...m, id: `s${++contador}`, hora: Date.now() }].slice(-200) })
}

function proximaMensagem() {
  const ap = estado.apresentador || 'professor'
  const agora = Date.now()
  const noMomento = estado.momento && agora < fimMomento
  if (estado.momento && !noMomento) mudar({ momento: null })
  let categoria: keyof typeof MODELOS
  const r = Math.random()
  if (noMomento && estado.momento && estado.momento !== 'abertura' && estado.momento !== 'perguntas' && r < 0.75) categoria = estado.momento
  else if ((noMomento && estado.momento === 'perguntas' && r < 0.75)) categoria = 'pergunta'
  else if ((noMomento && estado.momento === 'abertura' && r < 0.8) || agora - inicio < 90000 && r < 0.55) categoria = 'saudacao'
  else categoria = r < 0.45 ? 'reacao' : r < 0.7 ? 'pergunta' : r < 0.85 ? 'mercado' : 'saudacao'
  // não repete a mesma frase nas últimas 12
  let texto = ''
  for (let i = 0; i < 6; i++) { texto = sorteio(MODELOS[categoria])(ap); if (!recentes.includes(texto)) break }
  recentes.push(texto); if (recentes.length > 12) recentes.shift()
  adicionar({ nome: sorteio(NOMES), texto: humanizar(texto), apresentador: false, entrada: false })
}

function agendarChat() {
  window.clearTimeout(timerChat)
  if (!estado.ativa) return
  const emMomento = estado.momento && Date.now() < fimMomento
  const porMinuto = TAXA[estado.ritmo] * (emMomento ? 2.5 : 1) * Math.min(1.6, Math.max(0.4, estado.publicoAgora / 700))
  const espera = -Math.log(1 - Math.random()) * (60000 / porMinuto) // chegada aleatória, como gente de verdade
  timerChat = window.setTimeout(() => {
    if (!estado.pausada) {
      if (Math.random() < 0.12) adicionar({ nome: sorteio(NOMES), texto: 'entrou', apresentador: false, entrada: true })
      else proximaMensagem()
    }
    agendarChat()
  }, Math.min(8000, Math.max(250, espera)))
}

function passoDoPublico() {
  const alvo = estado.publicoAlvo
  const atual = estado.publicoAgora || Math.round(alvo * 0.35)
  const ruido = (Math.random() - 0.5) * 2 * AMPLITUDE[estado.oscilacao] * alvo
  const proximo = Math.max(1, Math.round(atual + (alvo - atual) * 0.18 + ruido))
  mudar({ publicoAgora: proximo })
}

export function iniciarSimulacao(apresentador: string): void {
  pararSimulacao()
  inicio = Date.now()
  mudar({ ativa: true, pausada: false, apresentador, mensagens: [], momento: null, publicoAgora: Math.round(estado.publicoAlvo * 0.35) })
  timerPublico = window.setInterval(passoDoPublico, 2200)
  agendarChat()
}

export function pararSimulacao(): void {
  window.clearInterval(timerPublico); window.clearTimeout(timerChat)
  mudar({ ativa: false, momento: null })
}

export function ajustar(p: Partial<Pick<EstadoDaSimulacao, 'publicoAlvo' | 'oscilacao' | 'ritmo' | 'pausada'>>): void {
  mudar(p)
  if ('ritmo' in p || 'pausada' in p) agendarChat()
}

/** Dispara um momento: o assunto do chat muda por ~25 s e o ritmo sobe. */
export function dispararMomento(m: Momento): void {
  fimMomento = Date.now() + 25000
  mudar({ momento: m })
  agendarChat()
}

export function falarComoApresentador(texto: string): void {
  const t = texto.trim().slice(0, 500)
  if (t) adicionar({ nome: estado.apresentador || 'Você', texto: t, apresentador: true, entrada: false })
}

export const limparChat = () => mudar({ mensagens: [] })

/** Mensagem de verdade de um membro que assiste o ensaio: entra no chat junto com as simuladas. */
export function mensagemDeMembro(nome: string, texto: string): void {
  const t = texto.trim().slice(0, 500)
  if (t) adicionar({ nome: nome.slice(0, 30) || 'Membro', texto: t, apresentador: false, entrada: false, membro: true })
}
