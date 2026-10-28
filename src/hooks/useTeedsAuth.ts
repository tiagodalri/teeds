import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buscarUsuario, capturarRetorno, confirmarPeloLink, entrar as fazerLogin, lembrarSessao,
  recuperarSenha, renovar, sair as encerrar, sessaoGuardada, temConfirmacaoNoEndereco, trocarSenha,
  type Retorno, type SessaoTeeds, type Usuario,
} from '../core/teeds/conta'
import { autenticacaoConfigurada } from '../core/teeds/config'
import { inscreverFilaEspera, type DadosFilaEspera } from '../core/teeds/leads'
import { entrarComBiometria as fazerLoginComBiometria } from '../core/teeds/biometria'
import { MARCA } from '../marca'

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
  /** Quando a pessoa chega pelo link de "esqueci a senha". */
  const [redefinindo, setRedefinindo] = useState(false)
  const [recado, setRecado] = useState<string | null>(null)
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null)

  /*
    Várias abas abertas (28/10/2026): a sessão fica no armazenamento do
    navegador, e a Supabase troca a chave de renovação a cada uso. Quando uma
    aba renova, a chave que a OUTRA aba guardou na memória deixa de valer: a
    outra seguia com o acesso vencido, recebendo "não autorizado" em tudo
    (centenas por hora nos registros) até alguém recarregar. Agora, antes de
    renovar, a aba olha se outra já renovou e usa essa; se a renovação falhar,
    olha de novo antes de desistir.
  */
  const daOutraAba = (atual: SessaoTeeds): SessaoTeeds | null => {
    const g = sessaoGuardada()
    return g && g.usuario.id === atual.usuario.id && g.refresh !== atual.refresh && g.expiraEm > Date.now() + 60_000 ? g : null
  }
  const sessaoAtual = useRef<SessaoTeeds | null>(null)

  /** Agenda a renovacao para um minuto antes do vencimento. */
  const agendarRenovacao = useCallback((s: SessaoTeeds) => {
    if (relogio.current) clearTimeout(relogio.current)
    sessaoAtual.current = s
    const daqui = Math.max(30_000, s.expiraEm - Date.now() - 60_000)
    relogio.current = setTimeout(() => { void renovarAgora(s) }, daqui)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const renovando = useRef(false)
  const renovarAgora = useCallback(async (s: SessaoTeeds) => {
    const pronta = daOutraAba(s)
    if (pronta) { setSessao(pronta); agendarRenovacao(pronta); return }
    // uma renovação por vez nesta aba (o relógio e a conferência podem coincidir)
    if (renovando.current) return
    renovando.current = true
    try {
      const nova = await renovar(s.refresh)
      setSessao(nova)
      agendarRenovacao(nova)
    } catch (e) {
      // outra aba pode ter renovado no mesmo instante: usa a dela
      const dela = daOutraAba(s)
      if (dela) { setSessao(dela); agendarRenovacao(dela); return }
      // sem internet (ou a conexão travou): tenta de novo em 30 s, sem tirar a pessoa da conta
      if (/Sem conexão|demorou demais/.test((e as Error)?.message ?? '')) {
        if (relogio.current) clearTimeout(relogio.current)
        relogio.current = setTimeout(() => { void renovarAgora(s) }, 30_000)
        return
      }
      // refresh vencido: a pessoa entra de novo
      setSessao(null)
      setStatus('deslogado')
    } finally {
      renovando.current = false
    }
  }, [agendarRenovacao]) // eslint-disable-line react-hooks/exhaustive-deps

  // a ref segue o estado: depois de sair (sessão nula) nada mais é renovado
  useEffect(() => { sessaoAtual.current = sessao }, [sessao])

  /*
    Aba que volta para a frente (ou computador que acordou da hibernação): o
    relógio da renovação pode ter atrasado. Se outra aba já renovou, usa a
    dela; se o acesso venceu ou vence em menos de 2 min, renova agora.
  */
  useEffect(() => {
    const conferir = () => {
      const s = sessaoAtual.current
      if (!s || document.visibilityState === 'hidden') return
      const pronta = daOutraAba(s)
      if (pronta) { setSessao(pronta); agendarRenovacao(pronta); return }
      if (s.expiraEm - Date.now() < 120_000) void renovarAgora(s)
    }
    const aoMudarArmazenamento = (e: StorageEvent) => { if (e.key === null || e.key === `${MARCA.id}.conta`) conferir() }
    document.addEventListener('visibilitychange', conferir)
    window.addEventListener('focus', conferir)
    window.addEventListener('storage', aoMudarArmazenamento)
    const t = window.setInterval(conferir, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', conferir)
      window.removeEventListener('focus', conferir)
      window.removeEventListener('storage', aoMudarArmazenamento)
      window.clearInterval(t)
    }
  }, [agendarRenovacao, renovarAgora]) // eslint-disable-line react-hooks/exhaustive-deps

  // sessao guardada — ou a que acabou de chegar pelo link do e-mail
  useEffect(() => {
    if (!autenticacaoConfigurada()) return
    let vivo = true

    const aplicar = (retorno: Retorno): boolean => {
      if (retorno.erro) setErro(retorno.erro)
      if (retorno.recado) setRecado(retorno.recado)
      if (!retorno.sessao) return false
      const s = retorno.sessao
      // convite também cai na tela de criar senha: ninguém entra sem ter a própria senha
      if (retorno.tipo === 'recovery' || retorno.tipo === 'invite') setRedefinindo(true)
      else if (retorno.tipo === 'email_change') setRecado('E-mail trocado. A partir de agora, entre com o endereço novo.')
      else setRecado(`E-mail confirmado. Bem-vindo à ${MARCA.prosa}.`)
      void (async () => {
        try {
          const usuario = await buscarUsuario(s.token)
          if (!vivo) return
          const completa = { ...s, usuario }
          setSessao(completa); setStatus('logado'); agendarRenovacao(completa)
        } catch {
          if (vivo) { setSessao(s); setStatus('logado') }
        }
      })()
      return true
    }

    // Sem link (ou link que não valeu): a sessão guardada, renovando se perto de vencer.
    const seguirComGuardada = async () => {
      const guardada = sessaoGuardada()
      if (!guardada) { setStatus('deslogado'); return }
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
        // renovar falhou (rede presa ou recusada): com o acesso ainda válido, entra com ele
        if (guardada.expiraEm > Date.now() + 15_000) { setSessao(guardada); setStatus('logado'); agendarRenovacao(guardada); return }
        setSessao(null)
        setStatus('deslogado')
      }
    }

    // Link novo do e-mail (?confirmar=...): o app valida o código na Supabase.
    if (temConfirmacaoNoEndereco()) {
      void confirmarPeloLink().then((r) => { if (vivo && !aplicar(r)) void seguirComGuardada() })
    } else if (!aplicar(capturarRetorno())) {
      // O link antigo volta com o token no endereco (#access_token=...).
      void seguirComGuardada()
    }
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

  // Face ID / digital (27/10/2026): a mesma sessão do login com senha
  const entrarComBiometria = useCallback(async () => {
    setOcupado(true); setErro(null)
    try {
      const s = await fazerLoginComBiometria()
      setSessao(s); setStatus('logado'); agendarRenovacao(s)
      return true
    } catch (e) {
      setErro((e as Error).message)
      return false
    } finally {
      setOcupado(false)
    }
  }, [agendarRenovacao])

  const cadastrar = useCallback(async (dados: DadosFilaEspera) => {
    setOcupado(true); setErro(null)
    try {
      const conta = await inscreverFilaEspera(dados)
      return { ok: true, conta }
    } catch (e) {
      setErro((e as Error).message)
      return { ok: false as const }
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

  /**
   * Entrou com senha provisória (conta criada pelo painel ou importada da
   * base de leads): não passa da tela de senha nova até criar a própria.
   */
  const precisaTrocarSenha = Boolean(sessao?.usuario?.trocarSenha)

  const definirNovaSenha = useCallback(async (nova: string) => {
    if (!sessao) return false
    setOcupado(true); setErro(null)
    try {
      const eraProvisoria = Boolean(sessao.usuario?.trocarSenha)
      const usuario = await trocarSenha(sessao.token, nova)
      const atualizada = { ...sessao, usuario: { ...sessao.usuario, ...usuario, trocarSenha: false } }
      setSessao(atualizada)
      lembrarSessao(atualizada)
      setRedefinindo(false)
      setRecado(eraProvisoria ? `Senha criada. Bem-vindo à ${MARCA.prosa}.` : 'Senha trocada.')
      return true
    } catch (e) {
      setErro((e as Error).message)
      return false
    } finally {
      setOcupado(false)
    }
  }, [sessao])

  /** Troca os dados do usuário depois de salvar o perfil. */
  const atualizarUsuario = useCallback((usuario: Usuario) => {
    setSessao((s) => (s ? { ...s, usuario } : s))
    setRecado('Dados atualizados.')
  }, [])

  return {
    atualizarUsuario,
    status, sessao, usuario: sessao?.usuario ?? null, erro, setErro, recado, setRecado,
    ocupado, entrar, entrarComBiometria, cadastrar, esqueci, sair, redefinindo, precisaTrocarSenha, definirNovaSenha,
  }
}
