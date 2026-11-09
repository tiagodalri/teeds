/**
 * Sala de treino: público e chat SIMULADOS, para influenciadores e equipe
 * ensaiarem uma live (18/10/2026, GlobalFly, plano "treino").
 *
 * Tudo roda só no navegador de quem treina: não há sala no servidor, nenhum
 * cliente vê nada daqui. A imagem leva o selo "Simulação" (combinado com o
 * Tiago: um selo só, discreto, mas sempre lá).
 *
 * O chat é montado de modelos com variação (horário do dia, nome do
 * apresentador, robôs da casa), para não soar robótico. Os "momentos" mudam
 * o assunto por alguns segundos: meta batida, stop, mercado lento, rodada de
 * perguntas, abertura.
 *
 * 20/10/2026: o público virou gente (chatSimulado.ts). Cada pessoa tem nome
 * de chat de verdade e um jeito de escrever que mantém; uns respondem os
 * outros com @; a sala comemora junto. E "fulano entrou" / "fulano saiu"
 * acompanham o número de pessoas na sala, que sobe e desce.
 */
import { useSyncExternalStore } from 'react'
import { MARCA } from '../../marca'
import { mensagemDe, novaPessoa, respostaA, soEmoji, type Categoria, type Pessoa } from './chatSimulado'

export type Oscilacao = 'baixa' | 'media' | 'alta'
export type Ritmo = 'calmo' | 'normal' | 'agitado'
export type Momento = 'abertura' | 'meta' | 'stop' | 'lateral' | 'perguntas'
/** Velocidade de um bloco de mensagens no play (Lenta / Normal / Rápida). */
export type Velocidade = 'lenta' | 'normal' | 'rapida'
/** O bloco que está tocando: as mensagens aprovadas indo para o chat, uma a uma. */
export interface BlocoTocando { id: string; nome: string; total: number; enviadas: number }

export interface MensagemSimulada {
  id: string
  nome: string
  texto: string
  apresentador: boolean
  entrada: boolean
  hora: number
  /** Aviso da sala ("O apresentador fechou o chat"), no meio do chat. */
  sistema?: boolean
  /** Linha de "fulano saiu" (com `entrada`, é "fulano entrou"). */
  saida?: boolean
  /** Escrita de verdade por um membro do plano que está assistindo o ensaio. */
  membro?: boolean
  /** Na tela de quem assiste: a mensagem que esta própria pessoa escreveu. */
  minha?: boolean
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
  /** O apresentador pode fechar o chat (20/10/2026): ninguém escreve, só ele. */
  chatAberto: boolean
  velocidade: Velocidade
  bloco: BlocoTocando | null
}

let estado: EstadoDaSimulacao = {
  ativa: false, pausada: false, publicoAlvo: 700, publicoAgora: 0, oscilacao: 'media', ritmo: 'normal',
  apresentador: '', momento: null, mensagens: [], chatAberto: true, velocidade: 'normal', bloco: null,
}
const ouvintes = new Set<() => void>()
const mudar = (p: Partial<EstadoDaSimulacao>) => { estado = { ...estado, ...p }; ouvintes.forEach((f) => f()) }
export const useSimulacao = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => estado, () => estado)
/** Fora do React: quem transmite o ensaio para os membros escuta as mudanças por aqui. */
export const ouvirSimulacao = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }
export const simulacaoAgora = () => estado

/* ------------------------------------------------------------- vocabulário */

const robos = () => MARCA.robos.map((id) => (MARCA.nomesDosRobos?.[id] ?? id).replace(/^(GF|GlobalFly)\s+/i, ''))
const sorteio = <T,>(lista: readonly T[]) => lista[Math.floor(Math.random() * lista.length)]
const periodo = () => { const h = new Date().getHours(); return h < 12 ? 'bom dia' : h < 18 ? 'boa tarde' : 'boa noite' }

/* ----------------------------------------------------------- quem está na sala */

const usados = new Set<string>()
let naSala: Pessoa[] = []
let foraDaSala: Pessoa[] = []
/** Quem falou por último (não sai da sala logo depois de falar, e pode ser respondido). */
const falouEm = new Map<string, number>()
let ultimas: Array<{ nome: string; categoria: Categoria; em: number }> = []

function montarPublico() {
  usados.clear(); falouEm.clear(); ultimas = []
  // quem já está quando a live começa, e quem vai chegando depois
  naSala = Array.from({ length: 40 }, () => novaPessoa(usados))
  foraDaSala = Array.from({ length: 160 }, () => novaPessoa(usados))
}
function alguemDeFora(): Pessoa {
  if (!foraDaSala.length) foraDaSala.push(...Array.from({ length: 40 }, () => novaPessoa(usados)))
  return foraDaSala.splice(Math.floor(Math.random() * foraDaSala.length), 1)[0]
}
/** Quem fala: alguém da sala, com mais chance para os que falam muito. */
function quemFala(exceto?: string): Pessoa {
  if (naSala.length < 3) naSala.push(alguemDeFora())
  const lista = naSala.filter((p) => p.nome !== exceto)
  const total = lista.reduce((t, p) => t + p.peso, 0)
  let r = Math.random() * total
  for (const p of lista) { if ((r -= p.peso) <= 0) return p }
  return lista[lista.length - 1]
}
/** Uma pessoa entra (ou sai) e aparece no chat. */
function entra() {
  const p = alguemDeFora()
  naSala.push(p)
  adicionar({ nome: p.nome, texto: 'entrou', apresentador: false, entrada: true })
}
function sai() {
  // quem acabou de falar não vai embora no segundo seguinte
  const agora = Date.now()
  const podem = naSala.filter((p) => agora - (falouEm.get(p.nome) ?? 0) > 40_000)
  if (naSala.length <= 12 || !podem.length) return
  const p = sorteio(podem)
  naSala = naSala.filter((x) => x !== p)
  foraDaSala.push(p) // pode voltar mais tarde, como na vida real
  adicionar({ nome: p.nome, texto: 'saiu', apresentador: false, entrada: true, saida: true })
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

const evitar: string[] = []

function proximaMensagem() {
  const ap = estado.apresentador || 'professor'
  const agora = Date.now()
  const noMomento = estado.momento && agora < fimMomento
  if (estado.momento && !noMomento) mudar({ momento: null })
  let categoria: Categoria
  const r = Math.random()
  if (noMomento && estado.momento && estado.momento !== 'abertura' && estado.momento !== 'perguntas' && r < 0.72) categoria = estado.momento
  else if (noMomento && estado.momento === 'perguntas' && r < 0.75) categoria = 'pergunta'
  else if ((noMomento && estado.momento === 'abertura' && r < 0.8) || (agora - inicio < 90000 && r < 0.55)) categoria = 'saudacao'
  else categoria = r < 0.34 ? 'reacao' : r < 0.5 ? 'giria' : r < 0.7 ? 'pergunta' : r < 0.85 ? 'mercado' : 'saudacao'

  // de vez em quando alguém responde outra pessoa do chat ("@fulano ...")
  const recente = ultimas.filter((u) => agora - u.em < 30_000)
  if (recente.length && Math.random() < 0.1) {
    const alvo = sorteio(recente)
    const p = quemFala(alvo.nome)
    const quemEra = naSala.find((x) => x.nome === alvo.nome) ?? foraDaSala.find((x) => x.nome === alvo.nome)
    falar(p, respostaA(alvo.nome, alvo.categoria, p, quemEra?.ela), 'reacao')
    return
  }
  const p = quemFala()
  falar(p, mensagemDe(categoria, p, { ap, robos: robos(), periodo: periodo() }, evitar), categoria)

  // a sala comemora junto: uns emojis seguidos de gente diferente
  if ((categoria === 'meta' || (categoria === 'giria' && noMomento)) && Math.random() < 0.3) {
    const n = 1 + Math.floor(Math.random() * 3)
    for (let i = 1; i <= n; i++) window.setTimeout(() => { if (estado.ativa && estado.chatAberto) falar(quemFala(), soEmoji(categoria === 'meta'), 'reacao') }, 350 * i + Math.random() * 500)
  }
}

function falar(p: Pessoa, texto: string, categoria: Categoria) {
  falouEm.set(p.nome, Date.now())
  ultimas.push({ nome: p.nome, categoria, em: Date.now() }); if (ultimas.length > 12) ultimas.shift()
  adicionar({ nome: p.nome, texto, apresentador: false, entrada: false })
}

function agendarChat() {
  window.clearTimeout(timerChat)
  if (!estado.ativa) return
  const emMomento = estado.momento && Date.now() < fimMomento
  const porMinuto = TAXA[estado.ritmo] * (emMomento ? 2.5 : 1) * Math.min(1.6, Math.max(0.4, estado.publicoAgora / 700))
  const espera = -Math.log(1 - Math.random()) * (60000 / porMinuto) // chegada aleatória, como gente de verdade
  timerChat = window.setTimeout(() => {
    // chat fechado: o público não escreve (as entradas e saídas continuam);
    // com um bloco tocando, o chat é dele: o chat automático espera
    if (!estado.pausada && estado.chatAberto && !estado.bloco) {
      proximaMensagem()
    }
    agendarChat()
  }, Math.min(8000, Math.max(250, espera)))
}

/** Chance de uma entrada ou saída virar linha no chat a cada passo (o número sempre muda; o chat não pode virar só isso). */
const CHANCE_DE_AVISO: Record<Ritmo, number> = { calmo: 0.3, normal: 0.42, agitado: 0.55 }

function passoDoPublico() {
  const alvo = estado.publicoAlvo
  const atual = estado.publicoAgora || Math.round(alvo * 0.35)
  const ruido = (Math.random() - 0.5) * 2 * AMPLITUDE[estado.oscilacao] * alvo
  const proximo = Math.max(1, Math.round(atual + (alvo - atual) * 0.18 + ruido))
  mudar({ publicoAgora: proximo })
  // "fulano entrou" / "fulano saiu" acompanham o número: subiu, alguém entra; caiu, alguém sai
  const delta = proximo - atual
  if (!delta || estado.pausada || Math.random() > CHANCE_DE_AVISO[estado.ritmo]) return
  // nunca uma fila de "entrou/saiu": com as três últimas linhas sendo isso, quase sempre espera
  const ultimas3 = estado.mensagens.slice(-3)
  if (ultimas3.length === 3 && ultimas3.every((m) => m.entrada) && Math.random() < 0.85) return
  const muitos = Math.abs(delta) > alvo * 0.03 && Math.random() < 0.3 ? 2 : 1
  for (let i = 0; i < muitos; i++) window.setTimeout(() => { if (estado.ativa) (delta > 0 ? entra : sai)() }, i * (500 + Math.random() * 900))
}

export function iniciarSimulacao(apresentador: string): void {
  pararSimulacao()
  montarPublico()
  inicio = Date.now()
  mudar({ ativa: true, pausada: false, apresentador, mensagens: [], momento: null, publicoAgora: Math.round(estado.publicoAlvo * 0.35) })
  timerPublico = window.setInterval(passoDoPublico, 2200)
  agendarChat()
}

export function pararSimulacao(): void {
  window.clearInterval(timerPublico); window.clearTimeout(timerChat); window.clearTimeout(timerBloco)
  fila = []
  mudar({ ativa: false, momento: null, bloco: null })
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

/* ------------------------------------------------- blocos de mensagens (09/11/2026)
   O Tiago prepara e aprova as mensagens antes (blocos.ts) e dá o play na hora certa.
   Elas vão como foram aprovadas, sem mexer no texto, cada uma dita por uma pessoa da
   sala (nunca a mesma duas vezes seguidas), num intervalo que varia como gente de
   verdade. Chat pausado ou fechado: o bloco espera e continua de onde parou. */

/** Segundos entre uma mensagem e a próxima (média, mínimo, máximo). */
const INTERVALO: Record<Velocidade, [number, number, number]> = { lenta: [5, 2.5, 11], normal: [2.4, 1, 5.5], rapida: [0.9, 0.35, 2] }
let timerBloco: number | undefined
let fila: string[] = []
let ultimoNoBloco = ''

/* Quem diz "sou aluna" é ela, quem diz "obrigado" é ele: a frase escolhe a pessoa
   (o nome do chat precisa combinar com o que a pessoa escreve). */
const DELA = /(?:^|[^\p{L}])(aluna|obrigada|cansada|animada|ansiosa|preparada|empolgada|sozinha|nova aqui|nova na|grávida|esposa|mãe)(?![\p{L}])/iu
const DELE = /(?:^|[^\p{L}])(aluno|obrigado|cansado|animado|ansioso|preparado|empolgado|sozinho|novo aqui|novo na|esposo|marido|pai)(?![\p{L}])/iu
/** Cada mensagem do bloco é de uma pessoa diferente (ninguém diz "sou aluno" e depois "não sou"). */
const falaramNoBloco = new Set<string>()
function quemDiz(texto: string): Pessoa {
  const ela = DELA.test(texto) ? true : DELE.test(texto) ? false : null
  const serve = (p: Pessoa) => !falaramNoBloco.has(p.nome) && (ela === null || p.ela === ela)
  const certos = naSala.filter(serve)
  let p: Pessoa | undefined
  if (certos.length) {
    // quem fala muito continua com mais chance, mas só uma vez por bloco
    const total = certos.reduce((t, x) => t + x.peso, 0)
    let r = Math.random() * total
    p = certos.find((x) => (r -= x.peso) <= 0) ?? certos[certos.length - 1]
  } else {
    // ninguém assim na sala: alguém de fora entra para falar
    const i = foraDaSala.findIndex(serve)
    if (i >= 0) p = foraDaSala.splice(i, 1)[0]
    else for (let k = 0; k < 12 && !p; k++) { const nova = novaPessoa(usados); if (serve(nova)) p = nova; else foraDaSala.push(nova) }
    if (p) naSala.push(p)
  }
  p ??= quemFala(ultimoNoBloco)
  falaramNoBloco.add(p.nome)
  return p
}

function agendarBloco(primeira = false) {
  window.clearTimeout(timerBloco)
  if (!estado.bloco) return
  const [media, min, max] = INTERVALO[estado.velocidade]
  const espera = primeira ? 400 : Math.min(max, Math.max(min, -Math.log(1 - Math.random()) * media)) * 1000
  timerBloco = window.setTimeout(passoDoBloco, espera)
}
function passoDoBloco() {
  const b = estado.bloco
  if (!b || !estado.ativa) return
  if (estado.pausada || !estado.chatAberto) { timerBloco = window.setTimeout(passoDoBloco, 1000); return }
  const texto = fila.shift()
  if (texto) {
    const p = quemDiz(texto)
    ultimoNoBloco = p.nome
    falar(p, texto, 'reacao')
    mudar({ bloco: { ...b, enviadas: b.enviadas + 1 } })
  }
  if (!fila.length) { mudar({ bloco: null }); agendarChat(); return }
  agendarBloco()
}

/** Play: manda as mensagens aprovadas do bloco para o chat (em ordem embaralhada). */
export function tocarBloco(id: string, nome: string, mensagens: string[]): void {
  const lista = mensagens.map((m) => m.trim()).filter(Boolean)
  if (!estado.ativa || !lista.length) return
  for (let i = lista.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [lista[i], lista[j]] = [lista[j], lista[i]] }
  fila = lista
  ultimoNoBloco = ''
  falaramNoBloco.clear()
  mudar({ bloco: { id, nome, total: lista.length, enviadas: 0 } })
  agendarBloco(true)
}

/** Para o bloco no meio; o chat automático volta. */
export function pararBloco(): void {
  window.clearTimeout(timerBloco)
  fila = []
  if (estado.bloco) { mudar({ bloco: null }); agendarChat() }
}

export function mudarVelocidade(v: Velocidade): void {
  mudar({ velocidade: v })
  if (estado.bloco) agendarBloco()
}

/** Abre ou fecha o chat da sala de treino; a sala vê o aviso, como numa live de verdade. */
export function abrirChatDoTreino(aberto: boolean): void {
  if (estado.chatAberto === aberto) return
  mudar({ chatAberto: aberto })
  adicionar({ nome: '', texto: aberto ? 'O apresentador abriu o chat' : 'O apresentador fechou o chat', apresentador: false, entrada: false, sistema: true })
}

/** Mensagem de verdade de um membro que assiste o ensaio: entra no chat junto com as simuladas. */
export function mensagemDeMembro(nome: string, texto: string): void {
  if (!estado.chatAberto) return // chat fechado: nem a mensagem de membro entra
  const t = texto.trim().slice(0, 500)
  if (t) adicionar({ nome: nome.slice(0, 30) || 'Membro', texto: t, apresentador: false, entrada: false, membro: true })
}
