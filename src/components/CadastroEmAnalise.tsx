/**
 * A tela de quem já entrou mas ainda não foi liberado.
 *
 * Desde 30/09/2026 a conta de acesso nasce no cadastro: a senha provisória
 * precisa chegar por e-mail na hora, e para isso a conta tem de existir. A
 * consequência é que a pessoa consegue entrar antes de alguém aprovar — e
 * o que ela encontra aqui é esta tela, dizendo com todas as letras o que
 * falta e o que vai acontecer.
 *
 * Quem decide se é aqui ou lá dentro é o banco: a ficha nasce 'pendente' e
 * só a aprovação a torna 'ativo'. Um gatilho impede a própria pessoa de
 * mexer nesse campo, então esconder o menu não é a tranca — é só a cortesia
 * de não mostrar portas que não abrem.
 *
 * 29/10/2026 (Tiago, print do celular: "ux horrível"): refeita. Os passos
 * viraram uma linha do tempo alinhada; o botão dourado "Já fui aprovado" (que
 * gritava uma ação que a pessoa ainda não pode fazer) virou um botão discreto,
 * e a tela passou a conferir sozinha — a cada minuto e quando a pessoa volta
 * para a aba depois de ler o e-mail. A ação útil da espera, abrir a conta na
 * corretora, ficou como o destaque.
 */
import { afiliadoDaDeriv } from '../core/rotas'
import { useEffect, useRef, useState } from 'react'
import { Brand } from './Brand'
import { DerivLogo, IconeSaida } from './DerivMarca'
import { MARCA } from '../marca'
import './entrada/login.css'

export function CadastroEmAnalise({ email, nome, aoConferir, aoSair }: {
  email: string
  nome?: string | null
  /** Relê a situação no banco. Devolve true quando já foi liberado. */
  aoConferir: () => Promise<boolean>
  aoSair: () => void
}) {
  const [conferindo, setConferindo] = useState(false)
  const [recado, setRecado] = useState<string | null>(null)
  const primeiroNome = (nome ?? '').trim().split(/\s+/)[0]
  const conferirRef = useRef(aoConferir)
  conferirRef.current = aoConferir

  async function conferir() {
    if (conferindo) return
    setConferindo(true); setRecado(null)
    try {
      const liberado = await conferirRef.current()
      if (!liberado) setRecado('Ainda em análise. Quando for aprovado, o e-mail chega e esta tela abre a plataforma sozinha.')
    } catch {
      setRecado('Não deu para conferir agora. Tente de novo em instantes.')
    } finally { setConferindo(false) }
  }

  // confere sozinha: a cada minuto com a tela à mostra e quando a pessoa volta para ela
  useEffect(() => {
    let ocupada = false
    const emSilencio = () => {
      if (ocupada || document.visibilityState !== 'visible') return
      ocupada = true
      void conferirRef.current().catch(() => false).finally(() => { ocupada = false })
    }
    const t = window.setInterval(emSilencio, 60_000)
    document.addEventListener('visibilitychange', emSilencio)
    window.addEventListener('focus', emSilencio)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', emSilencio)
      window.removeEventListener('focus', emSilencio)
    }
  }, [])

  return (
    <div className="entrada" data-modo="espera">
      <div className="entrada-aurora" aria-hidden="true" />
      <div className="entrada-grade" aria-hidden="true" />

      <div className="entrada-caixa espera-caixa">
        <header className="entrada-topo">
          <div className="entrada-marca"><Brand tamanho={46} /></div>
          <div className="entrada-opera">
            <span>Opera com</span>
            <DerivLogo altura={15} />
          </div>
        </header>

        <div className="espera-cabeca">
          <span className="espera-selo"><i aria-hidden="true" />Em análise</span>
          <h1>{primeiroNome ? `${primeiroNome}, seu cadastro está em análise.` : 'Seu cadastro está em análise.'}</h1>
          <p>Quando for aprovado, avisamos em <b>{email}</b>.</p>
        </div>

        <ol className="espera-passos" aria-label="Etapas do cadastro">
          <li className="feito">
            <i aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4L19 7" /></svg></i>
            <span><b>Cadastro recebido</b><small>Sua conta de acesso já está criada.</small></span>
          </li>
          <li className="agora" aria-current="step">
            <i aria-hidden="true" />
            <span><b>Em análise <em>Agora</em></b><small>Nossa equipe confere cada cadastro, um a um.</small></span>
          </li>
          <li>
            <i aria-hidden="true" />
            <span><b>Acesso liberado</b><small>O e-mail chega e a plataforma abre por inteiro.</small></span>
          </li>
        </ol>

        <section className="espera-enquanto" aria-labelledby="espera-enquanto-titulo">
          <span className="espera-rotulo" id="espera-enquanto-titulo">Enquanto isso</span>
          <div className="entrada-corretora espera-corretora">
            <div className="corretora-topo">
              <DerivLogo altura={20} />
              <span className="corretora-selo">Corretora oficial</span>
            </div>
            <b>Adiante: abra sua conta na Deriv</b>
            <p>É grátis. O seu dinheiro fica na sua conta da corretora, e a {MARCA.prosa} se conecta a ela para operar.</p>
            <a className="btn-deriv" href={afiliadoDaDeriv()} target="_blank" rel="noopener noreferrer">
              <span>Abrir conta na Deriv</span>
              <IconeSaida />
            </a>
          </div>
        </section>

        <div className="espera-conferir">
          <button className="espera-conferir-btn" type="button" onClick={() => void conferir()} disabled={conferindo}>
            {conferindo ? 'Conferindo…' : 'Já recebi o e-mail de aprovação'}
          </button>
          <p className="entrada-mini" role="status">{recado ?? 'Esta tela também confere sozinha, a cada minuto.'}</p>
        </div>

        <div className="entrada-troca">
          <button type="button" onClick={aoSair}>Sair desta conta</button>
        </div>
      </div>
    </div>
  )
}
