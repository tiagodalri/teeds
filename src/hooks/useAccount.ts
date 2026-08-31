import { useCallback, useEffect, useRef, useState } from 'react'
import { completeLogin, loadSession, logout as clearSession, startLogin, type AuthSession } from '../core/deriv/auth'
import { fetchAccounts, fetchTradingSocketUrl, resetDemoBalance, type TradingAccount } from '../core/deriv/account'
import { TeedsSocket } from '../core/deriv/client'
import { subscribeBalance, subscribeOpenContracts, type Balance, type OpenContract } from '../core/deriv/trading'

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
    let stopBalance: (() => void) | undefined
    let stopContracts: (() => void) | undefined

    setConnecting(true)
    setBalance(null)
    setContracts(new Map())

    fetchTradingSocketUrl(session, accountId)
      .then((url) => {
        if (!alive) return
        socketRef.current?.disconnect()
        const sock = new TeedsSocket({ url })
        socketRef.current = sock
        sock.connect()
        stopBalance = subscribeBalance(sock, (b) => alive && setBalance(b))
        stopContracts = subscribeOpenContracts(sock, (c) => {
          if (!alive) return
          setContracts((prev) => {
            const next = new Map(prev)
            if (c.status === 'open') next.set(c.contractId, c)
            else next.delete(c.contractId)
            return next
          })
        })
        setConnecting(false)
      })
      .catch((e: Error) => {
        if (!alive) return
        setError(e.message)
        setConnecting(false)
      })

    return () => {
      alive = false
      stopBalance?.()
      stopContracts?.()
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

  const recarregarDemo = useCallback(async () => {
    if (!session || !accountId) return
    const conta = accounts.find((a) => a.accountId === accountId)
    if (conta?.type !== 'demo') return
    await resetDemoBalance(session, accountId)
  }, [session, accountId, accounts])

  const account = accounts.find((a) => a.accountId === accountId) ?? null
  const isDemo = account?.type === 'demo'

  return {
    status, error, setError,
    accounts, account, accountId, setAccountId, isDemo,
    balance, contracts: [...contracts.values()],
    socket: socketRef.current, connecting,
    login, logout, recarregarDemo,
  }
}
