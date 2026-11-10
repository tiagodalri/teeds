/**
 * Operações manuais que ficaram "abertas" depois do vencimento (10/11/2026, Tiago: "resolva com muito
 * cuidado").
 *
 * Quem grava o FIM de uma operação manual é o navegador do cliente. Se ele fecha o app antes do
 * vencimento, a linha de `operacoes_manuais` fica `aberta` para sempre: o Monitoramento já não a conta
 * como aberta (mostra "Sem resultado"), mas o resultado verdadeiro nunca chega ao banco.
 *
 * Aqui o servidor pergunta à Deriv, contrato a contrato (`proposal_open_contract`), com a autorização do
 * próprio cliente que já está no cofre, e grava o fim do mesmo jeito que o app gravaria: situação
 * (ganhou/perdeu/vendida), resultado e hora do fim.
 *
 * Cuidados:
 *  - Só lê linhas `aberta` já vencidas há 2 min (a apuração normal do app vem antes disso) e compradas
 *    nos últimos 3 dias; poucas por passada (`limite`).
 *  - O PATCH tem `situacao=eq.aberta`: se o app do cliente gravar o fim antes, nada é sobrescrito.
 *  - Não mexe em entrada, pagamento nem markup (a contagem do markup não muda).
 *  - Nunca lança para quem chama: falha de uma conta vira registro no log e a passada segue.
 *  - Contrato que a Deriv ainda diz aberto fica como está.
 */
import './ambiente'

import { TeedsSocket } from '../../src/core/deriv/client'
import { fetchTradingSocketUrl } from '../../src/core/deriv/account'
import { autorizacaoDoCliente } from './cofre'
import { deMolho } from './deriv-instavel'
import { fecharManualVencida, manuaisVencidasAbertas, type ManualVencida } from './supabase'

export interface FimDaManual { situacao: 'ganhou' | 'perdeu' | 'vendida' | 'encerrada'; resultado: number; encerrada_em: string }

/**
 * O fim de um contrato, a partir da resposta de `proposal_open_contract`. Puro (testado em
 * teste-manuais-vencidas.ts). Devolve null enquanto a Deriv diz que o contrato está aberto.
 * A situação segue a mesma regra do app (App.tsx): won → ganhou, lost → perdeu, sold → vendida.
 */
export function fimDaManual(p: Record<string, any> | null | undefined, agora = Date.now()): FimDaManual | null {
  if (!p || typeof p !== 'object') return null
  const status = String(p.status ?? '')
  const vendido = Number(p.is_sold ?? 0) === 1 || p.is_sold === true
  if (status === 'open' || (!status && !vendido)) return null
  const situacao = status === 'won' ? 'ganhou' : status === 'lost' ? 'perdeu' : status === 'sold' ? 'vendida' : 'encerrada'
  const lucro = Number(p.profit)
  const resultado = Number.isFinite(lucro) ? Math.round(lucro * 100) / 100 : 0
  const fimSeg = Number(p.sell_time ?? p.exit_tick_time ?? p.date_expiry ?? 0)
  const encerrada_em = new Date(fimSeg > 0 ? fimSeg * 1000 : agora).toISOString()
  return { situacao, resultado, encerrada_em }
}

export interface ResultadoDasManuais {
  lidas: number; fechadas: number; aindaAbertas: number; semAutorizacao: number; falhas: number
  detalhes: Array<{ contrato: number; conta: string; demo: boolean; fim: FimDaManual | null; erro?: string; status?: string; tipo?: string }>
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function fecharManuaisVencidas(opcoes: { gravar: boolean; limite?: number; dias?: number }): Promise<ResultadoDasManuais> {
  const r: ResultadoDasManuais = { lidas: 0, fechadas: 0, aindaAbertas: 0, semAutorizacao: 0, falhas: 0, detalhes: [] }
  const linhas = await manuaisVencidasAbertas(opcoes.limite ?? 40, opcoes.dias ?? 3)
  r.lidas = linhas.length
  if (!linhas.length) return r

  // Uma autorização por cliente e um socket por conta.
  const porCliente = new Map<string, ManualVencida[]>()
  for (const l of linhas) porCliente.set(l.userId, [...(porCliente.get(l.userId) ?? []), l])

  for (const [userId, doCliente] of porCliente) {
    const cofre = await autorizacaoDoCliente(userId).catch(() => ({ tipo: 'erro' as const }))
    if (cofre.tipo !== 'ok') { r.semAutorizacao += doCliente.length; continue }
    const porConta = new Map<string, ManualVencida[]>()
    for (const l of doCliente) porConta.set(l.contaId, [...(porConta.get(l.contaId) ?? []), l])

    for (const [contaId, daConta] of porConta) {
      let socket: TeedsSocket | null = null
      try {
        const url = await fetchTradingSocketUrl(cofre.sessao, contaId)
        socket = new TeedsSocket({ url, renovarUrl: () => fetchTradingSocketUrl(cofre.sessao, contaId), appId: cofre.sessao.appId, resubscribe: false })
        socket.connect()
        for (const op of daConta) {
          try {
            const resp = await socket.send({ proposal_open_contract: 1, contract_id: op.contractId } as never, 15_000)
            const poc = (resp as any)?.proposal_open_contract
            const fim = fimDaManual(poc)
            r.detalhes.push({ contrato: op.contractId, conta: contaId, demo: op.demo, fim, status: String(poc?.status ?? ''), tipo: String(poc?.contract_type ?? '') })
            if (!fim) { r.aindaAbertas++; continue }
            if (opcoes.gravar) await fecharManualVencida(op.userId, op.contractId, fim)
            r.fechadas++
          } catch (e) {
            r.falhas++
            r.detalhes.push({ contrato: op.contractId, conta: contaId, demo: op.demo, fim: null, erro: (e as Error).message.slice(0, 120) })
          }
        }
      } catch (e) {
        r.falhas += daConta.length
        for (const op of daConta) r.detalhes.push({ contrato: op.contractId, conta: contaId, demo: op.demo, fim: null, erro: `conta: ${(e as Error).message.slice(0, 120)}` })
        console.warn(`[manuais] conta ${contaId}: ${(e as Error).message.slice(0, 120)}`)
      } finally {
        try { socket?.disconnect() } catch { /* já caiu */ }
      }
      await pausa(500)
    }
  }
  return r
}

/** Liga a passada periódica. Uma de cada vez; de molho quando a Deriv está instável. Nunca lança. */
export function ligarFechamentoDasManuais(intervaloMs: number): () => void {
  let ocupado = false
  const passo = async () => {
    if (ocupado || deMolho()) return
    ocupado = true
    try {
      const r = await fecharManuaisVencidas({ gravar: true })
      if (r.lidas) {
        console.log(`[manuais] ${r.lidas} vencida(s) sem resultado · ${r.fechadas} fechada(s) com o resultado da Deriv` +
          (r.aindaAbertas ? ` · ${r.aindaAbertas} ainda aberta(s) na Deriv` : '') +
          (r.semAutorizacao ? ` · ${r.semAutorizacao} sem autorização no cofre` : '') +
          (r.falhas ? ` · ${r.falhas} falha(s)` : ''))
      }
    } catch (e) {
      console.warn('[manuais] a passada não completou:', (e as Error).message)
    } finally {
      ocupado = false
    }
  }
  const timer = setInterval(() => { void passo() }, intervaloMs)
  const primeira = setTimeout(() => { void passo() }, 90_000)
  return () => { clearInterval(timer); clearTimeout(primeira) }
}
