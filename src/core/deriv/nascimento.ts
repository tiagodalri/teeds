/**
 * A data de nascimento puxada da conta Deriv (17/11/2026, Tiago: "sim, buscar na Deriv e também pedir no cadastro").
 *
 * Quando a conta conecta, o app pergunta à Deriv (`get_settings`, a chamada que devolve os dados da pessoa, com
 * `date_of_birth` em segundos) e grava pela função teeds_nascimento_da_deriv, que só preenche a ficha que ainda não
 * tem a data: o que o cliente digitou no Meu perfil vale por cima. A API nova da Deriv não documenta essa chamada;
 * se ela não responder, a função anota o motivo (nascimento_deriv_tentativas) e o app tenta de novo em 3 dias.
 *
 * Uma pergunta por pessoa e aparelho: com a data gravada (ou já na ficha), não pergunta mais.
 */
import { SUPABASE } from '../teeds/config'
import { MARCA } from '../../marca'
import type { TeedsSocket } from './client'

const DE_NOVO_EM = 3 * 24 * 3_600_000

/** O id da pessoa dentro do token da plataforma (sem validar: só serve para a chave do aparelho). */
function idDoToken(token: string): string | null {
  try { return String(JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || '') || null } catch { return null }
}

export async function buscarNascimentoNaDeriv(sock: TeedsSocket, tokenTeeds: string | null | undefined): Promise<void> {
  if (!tokenTeeds) return
  const id = idDoToken(tokenTeeds)
  if (!id) return
  const chave = `${MARCA.id}.nascimento-deriv.${id}`
  try {
    const visto = localStorage.getItem(chave)
    if (visto === 'ok' || (visto && Date.now() - Number(visto) < DE_NOVO_EM)) return
  } catch { /* sem armazenamento: pergunta de novo */ }

  let data: string | null = null
  let resultado = 'ok'
  try {
    const r = await sock.send({ get_settings: 1 }, 15_000)
    const s = (r as Record<string, any>).get_settings as Record<string, unknown> | undefined
    const dob = Number(s?.date_of_birth)
    if (Number.isFinite(dob) && dob !== 0) data = new Date(dob * 1000).toISOString().slice(0, 10)
    else resultado = s ? 'sem data na resposta' : 'resposta sem get_settings'
  } catch (e) {
    resultado = String((e as Error)?.message ?? e).slice(0, 180)
  }

  try {
    const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_nascimento_da_deriv`, {
      method: 'POST',
      headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${tokenTeeds}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_data: data, p_resultado: resultado }),
    })
    try { localStorage.setItem(chave, r.ok && data ? 'ok' : String(Date.now())) } catch { /* só nesta aba */ }
  } catch { /* sem rede: tenta na próxima conexão */ }
}
