import './ambiente'

import { readFileSync } from 'node:fs'
import { listarRobos, rodar, type Parametros } from './sessao'
import type { AuthSession } from '../../src/core/deriv/auth'

/**
 * O primeiro teste de verdade: o motor da Teeds comprando na Deriv a partir
 * do servidor, sem navegador nenhum aberto.
 *
 * Se isto funcionar, a opção 1 está provada — o MCP passa a ser encanamento
 * em volta de uma peça que já roda. Se não funcionar, não adianta escrever
 * mais nada por cima.
 *
 * Uso:
 *   node dist/teste.mjs --robo superior5 --entrada 0.35 --stop 2 --gain 1
 *
 * O token sai do arquivo .env (DERIV_TOKEN=...), nunca da linha de comando:
 * argumento de processo aparece em `ps` para qualquer um logado na máquina.
 */

function argumentos(): Record<string, string> {
  const out: Record<string, string> = {}
  const lista = process.argv.slice(2)
  for (let i = 0; i < lista.length; i += 1) {
    const a = lista[i]
    if (a.startsWith('--')) {
      const chave = a.slice(2)
      const valor = lista[i + 1] && !lista[i + 1].startsWith('--') ? lista[++i] : 'sim'
      out[chave] = valor
    }
  }
  return out
}

function tokenDoEnv(): string {
  let bruto = ''
  try {
    bruto = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  } catch {
    throw new Error('Falta o arquivo servidor/.env com DERIV_TOKEN=...')
  }
  const linha = bruto.split('\n').find((l) => l.trim().startsWith('DERIV_TOKEN='))
  const token = linha?.slice(linha.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
  if (!token) throw new Error('O .env existe mas não tem DERIV_TOKEN.')
  return token
}

const dinheiro = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`

async function principal() {
  const a = argumentos()

  if (a.robos) {
    console.log('Robôs disponíveis:')
    for (const r of listarRobos()) console.log(`  ${r.id.padEnd(14)} ${r.nome.padEnd(20)} ${r.contrato} ${r.barreira}`)
    return
  }

  const p: Parametros = {
    roboId: a.robo ?? 'superior5',
    contaId: a.conta ?? '',
    valorInicial: Number(a.entrada ?? 0.35),
    stopLoss: Number(a.stop ?? 2),
    takeProfit: Number(a.gain ?? 1),
    maxOperacoes: Number(a.max ?? 0),
  }

  const sessao: AuthSession = { accessToken: tokenDoEnv() }

  console.log(`\nRobô ${p.roboId} · entrada ${p.valorInicial} · stop ${p.stopLoss} · gain ${p.takeProfit}${p.maxOperacoes ? ` · máx ${p.maxOperacoes} operações` : ''}`)
  console.log('Ligando…\n')

  let ultimas = 0
  const r = await rodar(sessao, p, (e) => {
    if (e.operacoes !== ultimas) {
      ultimas = e.operacoes
      const op = e.historico[0]
      if (op) {
        console.log(
          `#${String(e.operacoes).padStart(3)} ${op.ganhou ? 'ganhou' : 'perdeu'} ` +
          `· entrada ${op.valor.toFixed(2)} · dígito ${op.digitoSaida ?? '?'} ` +
          `· ${dinheiro(op.lucro)} · acumulado ${dinheiro(e.resultado)}`,
        )
      }
    }
  })

  console.log('\n────────────────────────────────')
  console.log(`Conta       ${r.contaId} (${r.demo ? 'demonstração' : 'REAL'})`)
  console.log(`Operações   ${r.operacoes} · ${r.vitorias} ganhas, ${r.derrotas} perdidas`)
  console.log(`Movimentado ${r.movimentado.toFixed(2)}`)
  console.log(`Resultado   ${dinheiro(r.resultado)}`)
  console.log(`Parou       ${r.motivo}`)
  console.log(`Duração     ${r.duracaoSegundos}s · compra em ${r.latenciaMedia ? Math.round(r.latenciaMedia) + 'ms' : '—'}`)
  console.log('────────────────────────────────\n')
}

principal().catch((e: Error) => {
  console.error(`\nfalhou: ${e.message}\n`)
  process.exit(1)
})
