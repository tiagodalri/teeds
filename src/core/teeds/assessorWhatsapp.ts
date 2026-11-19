import { SERVIDOR } from './config'
import type { SessaoTeeds } from './conta'
import { MARCA } from '../../marca'
import { emailReal } from './emailDaConta'

/*
  Assessor GF no WhatsApp (19/11/2026). O número do perfil, confirmado, vira o login da pessoa no WhatsApp:
  ela manda mensagem para o assessor e o Assistente age na conta dela. Quem pode usar o servidor decide
  (por enquanto só o Tiago); os outros recebem { liberado: false } e a tela não mostra nada.
*/

/** Por enquanto só o Tiago (19/11/2026: "somente o meu user de adm"). Liberar = acrescentar aqui e em servidor/src/zapi.ts (a trava de verdade). */
const LIBERADOS = ['tiagodalri1@live.com']
export const assessorNoAdm = (email?: string | null) => !!email && LIBERADOS.includes(emailReal(email).trim().toLowerCase())

export interface EstadoDoAssessor {
  liberado: boolean
  telefone?: string
  confirmado?: boolean
  numeroConfirmado?: string
  numeroAssessor?: string
  conectado?: boolean
}
export interface CodigoDoAssessor { liberado: boolean; codigo?: string; numeroAssessor?: string; expiraEm?: string }

async function pedir<T>(sessao: SessaoTeeds, caminho: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${SERVIDOR.url}${caminho}`, {
      ...init,
      headers: { Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json', ...(init.headers as Record<string, string> ?? {}) },
    })
  } catch {
    throw new Error(`Não consegui falar com o servidor da ${MARCA.prosa}. Tente de novo em instantes.`)
  }
  const corpo = await res.json().catch(() => ({} as any))
  if (!res.ok) throw new Error(corpo?.erro || `O servidor recusou o pedido (${res.status}).`)
  return corpo as T
}

export const estadoDoAssessor = (sessao: SessaoTeeds) => pedir<EstadoDoAssessor>(sessao, '/api/assessor/whatsapp')
export const codigoDoAssessor = (sessao: SessaoTeeds) => pedir<CodigoDoAssessor>(sessao, '/api/assessor/whatsapp/codigo', { method: 'POST', body: '{}' })
export const desvincularAssessor = (sessao: SessaoTeeds) => pedir<{ ok: boolean }>(sessao, '/api/assessor/whatsapp/desvincular', { method: 'POST', body: '{}' })

/** A conversa com o assessor já com a mensagem de confirmação escrita. */
export const linkDeConfirmar = (numeroAssessor: string, codigo: string) =>
  `https://wa.me/${numeroAssessor.replace(/\D/g, '')}?text=${encodeURIComponent(`Confirmar GF ${codigo}`)}`
export const linkDoAssessor = (numeroAssessor: string) => `https://wa.me/${numeroAssessor.replace(/\D/g, '')}`

/** 5511941750465 → +55 (11) 94175-0465 */
export function numeroBonito(n?: string): string {
  const d = String(n ?? '').replace(/\D/g, '')
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/)
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : d ? `+${d}` : ''
}

/* ------------------------------------------------------------------ ADM: os códigos da Z-API */

export interface EstadoDaZapi { configurado: boolean; conectado: boolean; celularOnline?: boolean; numero?: string; instancia?: string; erro?: string; qr?: string }
export const estadoDaZapi = (sessao: SessaoTeeds) => pedir<EstadoDaZapi>(sessao, '/api/admin/zapi')
export const ligarZapi = (sessao: SessaoTeeds, dados: { instancia: string; token: string; clientToken: string }) =>
  pedir<EstadoDaZapi>(sessao, '/api/admin/zapi', { method: 'POST', body: JSON.stringify(dados) })
export const desligarZapi = (sessao: SessaoTeeds) => pedir<EstadoDaZapi>(sessao, '/api/admin/zapi/desligar', { method: 'POST', body: '{}' })
