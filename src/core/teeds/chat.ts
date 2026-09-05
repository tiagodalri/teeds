import { SERVIDOR } from './config'
import type { SessaoTeeds } from './conta'

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
  sessao: SessaoTeeds, historico: Turno[], pergunta: string,
): Promise<Resposta> {
  let res: Response
  try {
    res = await fetch(`${SERVIDOR.url}/api/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessao.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pergunta, historico }),
    })
  } catch {
    throw new Error('Não consegui falar com o servidor da Teeds. Tente de novo em instantes.')
  }
  const corpo = await res.json().catch(() => ({} as any))
  if (!res.ok) throw new Error(corpo?.erro || `O servidor recusou o pedido (${res.status}).`)
  return corpo as Resposta
}
