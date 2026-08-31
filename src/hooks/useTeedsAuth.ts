import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cadastrar as criarConta, entrar as fazerLogin, recuperarSenha,
  renovar, sair as encerrar, sessaoGuardada,
  type SessaoTeeds,
} from '../core/teeds/conta'
import { autenticacaoConfigurada } from '../core/teeds/config'

export type StatusTeeds = 'carregando' | 'deslogado' | 'logado' | 'dispensado'

/**
 * A conta da Teeds — o primeiro dos dois logins.
 *
 * Enquanto o Supabase nao estiver configurado, o estado e 'dispensado' e a
 * plataforma abre direto, sem porta.
 */
export function useTeedsAuth() {
  const [status, setStatus] = useState<StatusTeeds>(
    autenticacaoConfigurada() ? 'carregando' : 'dispensado',
  )
  const [sessao, setSessao] = useState<SessaoTeeds | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Agenda a renovacao para um minuto antes do vencimento. */
  const agendarRenovacao = useCallback((s: SessaoTeeds) => {
    if (relogio.current) clearTimeout(relogio.current)
    const daqui = Math.max(30_000, s.expiraEm - Date.now() - 60_000)
    relogio.current = setTimeout(async () => {
      try {
        const nova = await renovar(s.refresh)
        setSessao(nova)
        agendarRenovacao(nova)
      } catch {
        // refresh vencido: a pessoa entra de novo
        setSessao(null)
        setStatus('deslogado')
      }
    }, daqui)
  }, [])

  // sessao guardada, ao abrir
  useEffect(() => {
    if (!autenticacaoConfigurada()) return
    let vivo = true
    const guardada = sessaoGuardada()
    if (!guardada) { setStatus('deslogado'); return }

    // token perto de vencer ja entra renovando
    const renovarSeVelho = async () => {
      try {
        const s = guardada.expiraEm - Date.now() < 120_000
          ? await renovar(guardada.refresh)
          : guardada
        if (!vivo) return
        setSessao(s)
        setStatus('logado')
        agendarRenovacao(s)
      } catch {
        if (!vivo) return
        setSessao(null)
        setStatus('deslogado')
      }
    }
    void renovarSeVelho()
    return () => {
      vivo = false
      if (relogio.current) clearTimeout(relogio.current)
    }
  }, [agendarRenovacao])

  const entrar = useCallback(async (email: string, senha: string) => {
    setOcupado(true); setErro(null)
    try {
      const s = await fazerLogin(email, senha)
      setSessao(s); setStatus('logado'); agendarRenovacao(s)
      return true
    } catch (e) {
      setErro((e as Error).message)
      return false
    } finally {
      setOcupado(false)
    }
  }, [agendarRenovacao])

  const cadastrar = useCallback(async (email: string, senha: string, nome: string) => {
    setOcupado(true); setErro(null)
    try {
      const { sessao: s, confirmar } = await criarConta(email, senha, nome)
      if (s) { setSessao(s); setStatus('logado'); agendarRenovacao(s) }
      return { ok: true, confirmar }
    } catch (e) {
      setErro((e as Error).message)
      return { ok: false, confirmar: false }
    } finally {
      setOcupado(false)
    }
  }, [agendarRenovacao])

  const esqueci = useCallback(async (email: string) => {
    setOcupado(true); setErro(null)
    try {
      await recuperarSenha(email)
      return true
    } catch (e) {
      setErro((e as Error).message)
      return false
    } finally {
      setOcupado(false)
    }
  }, [])

  const sair = useCallback(async () => {
    if (relogio.current) clearTimeout(relogio.current)
    await encerrar(sessao?.token)
    setSessao(null)
    setStatus('deslogado')
  }, [sessao])

  return { status, sessao, usuario: sessao?.usuario ?? null, erro, setErro, ocupado, entrar, cadastrar, esqueci, sair }
}
