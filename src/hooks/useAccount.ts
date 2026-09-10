import { useCallback, useEffect, useRef, useState } from 'react'
import { completeLogin, loadSession, logout as clearSession, startLogin, type AuthSession } from '../core/deriv/auth'
import { fetchAccounts, fetchTradingSocketUrl, resetDemoBalance, type TradingAccount } from '../core/deriv/account'
import { TeedsSocket } from '../core/deriv/client'
import type { ConnectionState } from '../core/deriv/types'
import { acessoSomenteDemo, contasPermitidas, selecionarContaPermitida } from '../core/deriv/accountAccess'
import { limparCacheOperacoes } from '../core/deriv/history'
import {
  assinarContratos, fetchPortfolio, subscribeBalance, subscribeTransactions,
  type Balance, type OpenContract,
} from '../core/deriv/trading'

export type AuthStatus = 'deslogado' | 'entrando' | 'logado' | 'erro'

/**
 * Cuida de todo o ciclo de conta: login, escolha da conta,
 * conexao autenticada, saldo e posicoes abertas.
 */
export function useAccount(acesso: { admin?: boolean | null; email?: string | null } = {}) {
  const [status, setStatus] = useState<AuthStatus>('deslogado')
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [accounts, setAccounts] = useState<TradingAccount[]>([])
  const [chosenAccountId, setChosenAccountId] = useState<string | null>(null)
  const somenteDemo = acessoSomenteDemo(acesso.admin, acesso.email)
  const permitidas = contasPermitidas(accounts, somenteDemo)
  const account = selecionarContaPermitida(permitidas, chosenAccountId)
  const accountId = account?.accountId ?? null
  const setAccountId = (id: string) => {
    if (permitidas.some(c => c.accountId === id)) setChosenAccountId(id)
  }
  const [balance, setBalance] = useState<Balance | null>(null)
  const [contracts, setContracts] = useState<Map<number, OpenContract>>(new Map())
  const [connecting, setConnecting] = useState(false)
  /** Sobe a cada transacao na conta — quem depende do historico se atualiza. */
  const [pulso, setPulso] = useState(0)
  /**
   * Ultimas compras vistas no fluxo de transacoes da conta.
   *
   * Serve para a tela reconhecer uma compra sua cuja resposta se perdeu
   * (tempo esgotado, linha caiu depois do envio): o contrato existe, chega
   * por aqui, e a tela precisa saber que foi ela quem comprou.
   */
  const [comprasRecentes, setComprasRecentes] = useState<Array<{ contractId: number; valor: number; quando: number }>>([])
  /** Estado da conexao autenticada — diferente da conexao publica do grafico. */
  const [conexao, setConexao] = useState<ConnectionState>('idle')

  const socketRef = useRef<TeedsSocket | null>(null)
  const socketAccountRef = useRef<string | null>(null)
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
        setChosenAccountId((prev) => prev ?? (demo?.accountId ?? list[0]?.accountId ?? null))
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


    setConnecting(true)
    setBalance(null)
    setContracts(new Map())
    // historico de outra conta nao vale para esta
    limparCacheOperacoes()

    /**
     * Guarda um contrato na lista de posicoes abertas.
     *
     * Uma unica assinatura cobre todos os contratos da conta. Antes era uma
     * por contrato, que nunca era cancelada: a Deriv permite 100 por conexao
     * e um robo comprando a cada segundo estourava esse teto em menos de dois
     * minutos — dali em diante nada mais era acompanhado.
     */
    /*
      Um contrato que fecha NAO some na hora.

      Antes, o cartao era apagado no mesmo instante em que o contrato
      vencia — e o estado "Ganhou / Perdeu" desenhado na tela nunca chegava a
      aparecer. A pessoa via a posicao sumir sem saber o resultado. Agora o
      cartao fica alguns segundos mostrando o resultado final e so entao sai.
      Enquanto a Deriv liquida (venceu, mas ainda sem won/lost), ele continua
      na lista como "liquidando", com um prazo de seguranca caso o estado final
      nunca chegue.
    */
    const FINAIS = new Set(['won', 'lost', 'sold', 'cancelled'])
    const remocoes = new Map<number, ReturnType<typeof setTimeout>>()
    const agendarRemocao = (id: number, ms: number) => {
      const antigo = remocoes.get(id)
      if (antigo) clearTimeout(antigo)
      remocoes.set(id, setTimeout(() => {
        remocoes.delete(id)
        if (!alive) return
        setContracts((prev) => {
          if (!prev.has(id)) return prev
          const next = new Map(prev)
          next.delete(id)
          return next
        })
      }, ms))
    }
    paradas.push(() => { remocoes.forEach((t) => clearTimeout(t)); remocoes.clear() })

    const guardar = (c: OpenContract) => {
      if (!alive) return
      const finalizado = FINAIS.has(c.status)
      setContracts((prev) => {
        // ja saiu da lista (ou nunca esteve): nao volta
        if (finalizado && !prev.has(c.contractId)) return prev
        const next = new Map(prev)
        next.set(c.contractId, c)
        return next
      })
      if (finalizado) agendarRemocao(c.contractId, 7_000)
      else if (c.isExpired) agendarRemocao(c.contractId, 25_000)
    }

    fetchTradingSocketUrl(session, accountId)
      .then(async (url) => {
        if (!alive) return
        socketRef.current?.disconnect()
        // O OTP da URL e de uso unico: cada reconexao precisa de um novo.
        const sock = new TeedsSocket({
          url,
          renovarUrl: () => fetchTradingSocketUrl(session, accountId),
        })
        socketRef.current = sock
        socketAccountRef.current = accountId
        paradas.push(sock.onStateChange((e) => { if (alive) setConexao(e) }))
        sock.connect()

        paradas.push(subscribeBalance(sock, (b) => alive && setBalance(b)))

        // uma assinatura so, para todos os contratos da conta
        paradas.push(
          assinarContratos(sock, guardar, (msg) => {
            // sem este stream a pessoa compra e nao ve a posicao: melhor dizer
            if (alive) setError(`A Deriv recusou o acompanhamento das posições (${msg}).`)
          }),
        )

        // contratos que ja estavam abertos quando conectamos
        try {
          const abertos = await fetchPortfolio(sock)
          if (!alive) return
          for (const c of abertos) guardar(c)
        } catch { /* portfolio vazio ou indisponivel: o stream cobre daqui */ }

        // qualquer compra nova entra na lista automaticamente
        paradas.push(
          subscribeTransactions(sock, (t) => {
            if (!alive) return
            setPulso((n) => n + 1)
            if (t.action === 'buy' && t.contractId !== null) {
              const compra = { contractId: t.contractId, valor: Math.abs(t.amount), quando: Date.now() }
              setComprasRecentes((lista) => [...lista, compra].slice(-20))
            }
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
      socketAccountRef.current = null
    }
  }, [session, accountId])

  /*
    Os saldos da LISTA eram uma foto tirada no login: so a conta escolhida
    tinha saldo ao vivo (pela assinatura da propria linha). A conta real
    ficava com o valor velho ate a pessoa sair e entrar. Agora a lista e
    relida quando o menu abre, depois de cada transacao e de minuto em minuto.
  */
  const atualizarContas = useCallback(async () => {
    if (!session) return
    try {
      const lista = await fetchAccounts(session)
      if (lista.length) setAccounts(lista)
    } catch { /* sem resposta agora: a lista fica como esta e tenta de novo depois */ }
  }, [session])
  useEffect(() => {
    if (!session) return
    const relogio = window.setInterval(() => { void atualizarContas() }, 30_000)
    return () => window.clearInterval(relogio)
  }, [session, atualizarContas])
  useEffect(() => {
    if (!session || pulso === 0) return
    const t = setTimeout(() => { void atualizarContas() }, 1_500)
    return () => clearTimeout(t)
  }, [pulso, session, atualizarContas])

  /*
    Saldo da conta REAL ao vivo mesmo quando ela nao e a escolhida.

    Cada conta da Deriv tem a sua propria linha; a escolhida ja recebe o
    saldo tick a tick. Para a real que ficou de fora (a pessoa esta na demo),
    abre-se uma linha dedicada SO de saldo — nada de operacao passa por ela.
    Se a real passa a ser a escolhida, a linha dedicada fecha (a principal
    assume). No acesso somente-demo a real nem aparece; nao abre nada.
  */
  const chaveDasContas = accounts.map((a) => a.accountId + ':' + a.type).join(',')
  useEffect(() => {
    if (!session || somenteDemo) return
    const alvo = accounts.filter((a) => a.type === 'real' && a.accountId !== accountId)
    if (!alvo.length) return
    let alive = true
    const paradas: Array<() => void> = []
    const linhas: TeedsSocket[] = []
    for (const a of alvo) {
      fetchTradingSocketUrl(session, a.accountId)
        .then((url) => {
          if (!alive) return
          const linha = new TeedsSocket({ url, renovarUrl: () => fetchTradingSocketUrl(session, a.accountId) })
          linhas.push(linha)
          linha.connect()
          paradas.push(subscribeBalance(linha, (b) => {
            if (!alive) return
            setAccounts((prev) => prev.map((x) => (x.accountId === a.accountId ? { ...x, balance: b.amount } : x)))
          }))
        })
        .catch(() => { /* sem linha agora: a releitura periodica cobre */ })
    }
    return () => {
      alive = false
      paradas.forEach((p) => p())
      linhas.forEach((l) => l.disconnect())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, accountId, somenteDemo, chaveDasContas])

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
    setChosenAccountId(null)
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

  const isDemo = account?.type === 'demo'
  const conexaoDaConta = accountId !== null && socketAccountRef.current === accountId

  return {
    status, error, setError, session,
    accounts: permitidas, demonstrationAccounts: accounts, account, accountId, setAccountId, isDemo, somenteDemo,
    balance: conexaoDaConta ? balance : null, contracts: conexaoDaConta ? [...contracts.values()] : [],
    socket: conexaoDaConta ? socketRef.current : null, connecting, aviso, setAviso, pulso, conexao,
    comprasRecentes: conexaoDaConta ? comprasRecentes : [],
    login, logout, recarregarDemo, atualizarContas,
  }
}
