/**
 * ?tela=multitela(&n=2|4|6)(&real=1)(&sem-deriv) no laboratório: a grade da Multitela com
 * cotações, gráficos e preços REAIS da Deriv (conexão pública) e compras de mentira:
 * a "compra" nasce no preço atual e se resolve pelas cotações de verdade. Nada é enviado.
 */
import { useEffect, useRef, useState } from 'react'
import { useSymbols } from '../../../hooks/useMarket'
import { subscribeTicks } from '../../../core/deriv/market'
import type { OpenContract } from '../../../core/deriv/trading'
import { Multitela } from './Multitela'
import { useMultitela, type Quadros } from './estado'
import type { ContaDaMultitela } from './Quadro'

const agoraS = () => Math.floor(Date.now() / 1000)
const PAGA = 0.92

export default function LabMultitela() {
  const q = new URLSearchParams(location.search)
  const { symbols } = useSymbols()
  const [, mudar] = useMultitela()
  useEffect(() => {
    const n = Number(q.get('n'))
    if ([2, 4, 6].includes(n)) mudar((e) => ({ ...e, n: n as Quadros }))
    else mudar((e) => (e.n === 1 ? { ...e, n: 4 } : e))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [contratos, setContratos] = useState<OpenContract[]>([])
  const [encerradas, setEncerradas] = useState<OpenContract[]>([])
  const [saldo, setSaldo] = useState(10000)
  const precos = useRef(new Map<string, number>())
  const ticks = useRef(new Map<string, number>())
  const assinados = useRef(new Map<string, () => void>())
  const seq = useRef(900001)

  // cada ativo comprado: acompanha as cotações reais até o fim
  const acompanhar = (simbolo: string) => {
    if (assinados.current.has(simbolo)) return
    assinados.current.set(simbolo, subscribeTicks(simbolo, (t) => { precos.current.set(simbolo, t.quote); ticks.current.set(simbolo, (ticks.current.get(simbolo) ?? 0) + 1) }))
  }
  useEffect(() => () => { assinados.current.forEach((f) => f()) }, [])
  useEffect(() => {
    const t = window.setInterval(() => {
      setContratos((lista) => {
        const fim: OpenContract[] = []
        const vivos = lista.map((c) => {
          if (c.status !== 'open') return c
          const preco = precos.current.get(c.symbol) ?? c.currentSpot ?? 0
          const sobe = c.contractType === 'CALL'
          const ganha = sobe ? preco > (c.entrySpot ?? 0) : preco < (c.entrySpot ?? 0)
          const acabou = agoraS() >= c.expiryTime
          const n: OpenContract = { ...c, currentSpot: preco, profit: ganha ? c.payout - c.buyPrice : -c.buyPrice, bidPrice: ganha ? c.payout * 0.7 : c.buyPrice * 0.3,
            ...(acabou ? { status: ganha ? 'won' : 'lost', exitSpot: preco, isExpired: true, isValidToSell: false } : {}) }
          if (acabou) fim.push(n)
          return n
        })
        if (fim.length) {
          setEncerradas((e) => [...fim, ...e].slice(0, 6))
          setSaldo((s) => s + fim.reduce((t, c) => t + (c.status === 'won' ? c.payout : 0), 0))
          window.setTimeout(() => setContratos((l) => l.filter((c) => !fim.some((f) => f.contractId === c.contractId))), 7000)
        }
        return vivos
      })
    }, 1000)
    return () => window.clearInterval(t)
  }, [])

  const semDeriv = q.has('sem-deriv')
  const conta: ContaDaMultitela = {
    pronta: !semDeriv, conectando: false, aoConectar: () => undefined,
    motivoDaConta: semDeriv ? 'Conecte a Deriv para operar' : null,
    real: q.has('real'), semDizerReal: false, tipoNaTela: semDeriv ? null : q.has('real') ? 'real' : 'demo',
    saldo: semDeriv ? null : saldo, moeda: 'USD', socket: null,
    contratos, encerradas,
    comprar: async (simbolo, tipo, valor, duracao, unidade) => {
      acompanhar(simbolo)
      await new Promise((r) => window.setTimeout(r, 450))
      const preco = precos.current.get(simbolo)
      if (preco === undefined) throw new Error('A cotação ainda não chegou. Tente de novo em um segundo.')
      const segundos = unidade === 't' ? duracao * (simbolo.startsWith('1HZ') ? 1 : 2) : unidade === 's' ? duracao : duracao * 60
      const inicio = agoraS()
      const id = seq.current++
      const c: OpenContract = {
        contractId: id, symbol: simbolo, contractType: tipo, buyPrice: valor, bidPrice: valor, payout: Math.round(valor * (1 + PAGA) * 100) / 100,
        profit: 0, profitPercentage: 0, status: 'open', isValidToSell: true, motivoSemVenda: null, isExpired: false,
        entrySpot: preco, currentSpot: preco, exitSpot: null, barrier: null, longcode: '',
        shortcode: `${tipo}_${simbolo}_${valor}_${inicio}_${unidade === 't' ? `${duracao}T` : inicio + segundos}`, currency: 'USD',
        purchaseTime: inicio, startTime: inicio, expiryTime: inicio + segundos, pipSize: 2, appMarkup: null,
      }
      setSaldo((s) => s - valor)
      setContratos((l) => [...l, c])
      return { buyPrice: c.buyPrice, payout: c.payout }
    },
    encerrar: (id) => setContratos((l) => l.map((c) => (c.contractId === id ? { ...c, status: 'sold', exitSpot: c.currentSpot, isValidToSell: false } : c))),
    vendendo: null,
    aviso: null,
  }
  return (
    <div className="app workspace-app" style={{ minHeight: 'calc(100vh / var(--escala-pagina, 1))', background: 'var(--bg)' }}>
      <Multitela conta={conta} ativos={symbols} sessao={null} ativoInicial="R_75" />
    </div>
  )
}
