import { useCallback, useEffect, useRef, useState } from 'react'
import { completeLogin, loadSession, logout as clearSession, startLogin, type AuthSession } from '../core/deriv/auth'
import { fetchAccounts, fetchTradingSocketUrl, resetDemoBalance, type TradingAccount } from '../core/deriv/account'
import { TeedsSocket } from '../core/deriv/client'
import { limparCacheOperacoes } from '../core/deriv/history'
import {
  fetchPortfolio, subscribeBalance, subscribeContract, subscribeTransactions,
  type Balance, type OpenContract,
} from '../core/deriv/trading'

export type AuthStatus = 'deslogado' | 'entrando' | 'logado' | 'erro'

/**
 * Cuida de todo o ciclo de conta: login, escolha da conta,
 * conexao autenticada, saldo e posicoes abertas.
 */
export function useAccount() {
  const [status, setStatus] = useState<AuthStatus>('deslogado')
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [accounts, setAccounts] = useState<TradingAccount[]>([])
  const [accountId, setAccountId] = useState<string | null>(null)
  const [balance, setBalance] = useState<Balance | null>(null)
  const [contracts, setContracts] = useState<Map<number, OpenContract>>(new Map())
  const [connecting, setConnecting] = useState(false)

  const socketRef = useRef<TeedsSocket | null>(null)
  const [, setTick] = useState(0)

  // --- retorno da Deriv + sessao guardada
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const fresh = await completeLogin()
        const s = fresh ?? loadSession()
        if (!alive) return
        if (s) {
          setSession(s)
          setStatus('logado')
        }
      } catch (e) {
        if (!alive) return
        setError((e as Error).message)
        setStatus('erro')
      }
    })()
    return () => { alive = false }
  }, [])

  // --- lista de contas
  useEffect(() => {
    if (!session) return
    let alive = true
    fetchAccounts(session)
      .then((list) => {
        if (!alive) return
        setAccounts(list)
        // comeca sempre pela demo: dinheiro ficticio por padrao
        const demo = list.find((a) => a.type === 'demo')
        setAccountId((prev) => prev ?? (demo?.accountId ?? list[0]?.accountId ?? null))
      })
      .catch((e: Error) => {
        if (!alive) return
        setError(e.message)
        if (/401|token/i.test(e.message)) {
          clearSession()
          setSession(null)
          setStatus('deslogado')
        }
      })
    return () => { alive = false }
  }, [session])

  // --- conexao autenticada da conta escolhida
  useEffect(() => {
    if (!session || !accountId) return
    let alive = true
    const paradas: Array<() => void> = []
    const acompanhados = new Set<number>()

    setConnecting(true)
    setBalance(null)
    setContracts(new Map())
    // historico de outra conta nao vale para esta
    limparCacheOperacoes()

    /** Passa a acompanhar um contrato em tempo real (sem duplicar assinatura). */
    const acompanhar = (sock: TeedsSocket, id: number) => {
      if (acompanhados.has(id)) return
      acompanhados.add(id)
      paradas.push(
        subscribeContract(sock, id, (c) => {
          if (!alive) return
          setContracts((prev) => {
            const next = new Map(prev)
            // sai da lista quando vendido, expirado ou liquidado
            if (c.status !== 'open' || c.isExpired) next.delete(c.contractId)
            else next.set(c.contractId, c)
            return next
          })
        }),
      )
    }

    fetchTradingSocketUrl(session, accountId)
      .then(async (url) => {
        if (!alive) return
        socketRef.current?.disconnect()
        const sock = new TeedsSocket({ url })
        socketRef.current = sock
        sock.connect()

        paradas.push(subscribeBalance(sock, (b) => alive && setBalance(b)))

        // contratos que ja estavam abertos
        try {
          const abertos = await fetchPortfolio(sock)
          if (!alive) return
          for (const c of abertos) acompanhar(sock, c.contractId)
        } catch { /* portfolio vazio ou indisponivel: seguimos pelo fluxo de transacoes */ }

        // qualquer compra nova entra na lista automaticamente
        paradas.push(
          subscribeTransactions(sock, (t) => {
            if (!alive || !t.contractId) return
            if (t.action === 'buy') acompanhar(sock, t.contractId)
          }),
        )

        setConnecting(false)
        setTick((n) => n + 1)
      })
      .catch((e: Error) => {
        if (!alive) return
        setError(e.message)
        setConnecting(false)
      })

    return () => {
      alive = false
      paradas.forEach((p) => p())
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [session, accountId])

  const login = useCallback(() => {
    setStatus('entrando')
    startLogin().catch((e: Error) => {
      setError(e.message)
      setStatus('erro')
    })
  }, [])

  const logout = useCallback(() => {
    socketRef.current?.disconnect()
    socketRef.current = null
    clearSession()
    setSession(null)
    setAccounts([])
    setAccountId(null)
    setBalance(null)
    setContracts(new Map())
    setStatus('deslogado')
    setError(null)
  }, [])

  const [aviso, setAviso] = useState<string | null>(null)

  const recarregarDemo = useCallback(async () => {
    if (!session || !accountId) return
    const conta = accounts.find((a) => a.accountId === accountId)
    if (conta?.type !== 'demo') {
      setAviso('Só a conta demo pode ser recarregada.')
      return
    }
    try {
      const novo = await resetDemoBalance(session, accountId)
      // a assinatura de saldo pode demorar a empurrar o valor novo:
      // usamos o que a propria resposta devolveu
      setBalance((b) => (b ? { ...b, amount: novo } : { amount: novo, currency: conta.currency, loginId: accountId }))
      setAccounts((lista) => lista.map((a) => (a.accountId === accountId ? { ...a, balance: novo } : a)))
      setAviso(`Saldo demo recarregado para ${conta.currency} ${novo.toFixed(2)}.`)
    } catch (e) {
      setAviso(`Não consegui recarregar: ${(e as Error).message}`)
    }
  }, [session, accountId, accounts])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 5000)
    return () => clearTimeout(t)
  }, [aviso])

  const account = accounts.find((a) => a.accountId === accountId) ?? null
  const isDemo = account?.type === 'demo'

  return {
    status, error, setError, session,
    accounts, account, accountId, setAccountId, isDemo,
    balance, contracts: [...contracts.values()],
    socket: socketRef.current, connecting, aviso, setAviso,
    login, logout, recarregarDemo,
  }
}
