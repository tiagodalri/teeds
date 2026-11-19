import { SERVIDOR } from './config'
import type { SessaoTeeds } from './conta'
import { MARCA } from '../../marca'

/**
 * A conversa com o assistente da Teeds.
 *
 * Este arquivo é fino de propósito: a inteligência toda mora no servidor.
 * Aqui não há chave de IA, não há decisão sobre o que responder e não há
 * regra de limite — só o pedido e a resposta.
 *
 * A chave da Anthropic nunca chega ao navegador. Se ela chegasse, qualquer
 * pessoa abriria as ferramentas do navegador, copiaria e passaria a gastar
 * na conta da Teeds.
 */

/** O cartão que a tela desenha quando o assistente entende um pedido de ligar. */
export interface Proposta {
  roboId: string
  roboNome: string
  regra: string
  contaId: string
  demo: boolean
  moeda: string
  saldo: number
  entrada: number
  stopLoss: number
  takeProfit: number
}

export interface Turno {
  papel: 'cliente' | 'assistente'
  texto: string
}

export interface Resposta {
  texto: string
  proposta?: Proposta
  uso: { hoje: number; teto: number }
  /** A Anthropic recusou: o motivo em português (a tela mostra só para a administração). */
  falhaDaIA?: string
  /** Quem respondeu: o Gemini entra quando a Anthropic recusa a conta (19/11/2026). */
  motor?: 'anthropic' | 'gemini'
  /** O que a pessoa falou no áudio, como o servidor entendeu. */
  transcricao?: string
}

/** O que vai junto com a pergunta (19/11/2026): áudio, fotos ou quadros de um vídeo, em base64, e a conta da tela. */
export interface Extras {
  audio?: { mime: string; dados: string }
  imagens?: Array<{ mime: string; dados: string }>
  video?: boolean
  contaAtual?: string
  trocados?: boolean
}

/**
 * Manda a pergunta e espera a resposta.
 *
 * O histórico vai junto porque a conversa é sem memória do lado de lá: cada
 * pergunta chega sozinha, e o que dá sentido a "e o outro?" é o que a tela
 * mandou junto. O servidor corta nas últimas mensagens — histórico longo
 * custa dinheiro em todo turno e não ajuda a responder nada.
 */
export async function perguntar(
  sessao: SessaoTeeds, historico: Turno[], pergunta: string, extras: Extras = {},
): Promise<Resposta> {
  let res: Response
  try {
    res = await fetch(`${SERVIDOR.url}/api/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessao.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pergunta, historico, marca: MARCA.id, ...extras }),
    })
  } catch {
    throw new Error(`Não consegui falar com o servidor da ${MARCA.prosa}. Tente de novo em instantes.`)
  }
  const corpo = await res.json().catch(() => ({} as any))
  if (res.status === 413) throw new Error('O anexo ficou grande demais. Mande um áudio mais curto ou menos fotos.')
  if (!res.ok) throw new Error(corpo?.erro || `O servidor recusou o pedido (${res.status}).`)
  return corpo as Resposta
}

/**
 * Troca a chave da Anthropic do Assistente (19/11/2026). Só o admin geral: o servidor confere, testa a chave
 * com uma conversa de 1 token e só então guarda. A chave vai e não volta: a tela nunca a recebe de novo.
 */
export async function trocarChaveDaIA(sessao: SessaoTeeds, valor: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${SERVIDOR.url}/api/chat/chave`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor, marca: MARCA.id }),
    })
  } catch {
    throw new Error(`Não consegui falar com o servidor da ${MARCA.prosa}. Tente de novo em instantes.`)
  }
  const corpo = await res.json().catch(() => ({} as any))
  if (!res.ok) throw new Error(corpo?.erro || `O servidor recusou o pedido (${res.status}).`)
}
