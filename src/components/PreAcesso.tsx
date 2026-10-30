/**
 * Pré-acesso (30/10/2026, Tiago e Naor, áudio 1): quem abriu a conta pela
 * página do lançamento entra e encontra a conta pronta, mas o acesso só abre
 * na live de 9/11. Tiago: "Cadastro realizado, seu acesso será liberado após a
 * sua presença na live do dia 9." Naor: cronômetro, "adicionar na agenda",
 * "ativar as notificações", "instalar o aplicativo" — cada um é um caminho
 * para chamar a pessoa no dia.
 *
 * Fica no lugar de CadastroEmAnalise só na GlobalFly e só até o fim da live
 * (emPreAcesso). Continua conferindo a situação sozinha: liberou, abre.
 */
import { useEffect, useRef, useState } from 'react'
import { Brand } from './Brand'
import { DerivLogo, IconeSaida } from './DerivMarca'
import { MARCA } from '../marca'
import { afiliadoDaDeriv, comunidadeDaVitrine } from '../core/rotas'
import { DERIV } from '../core/deriv/config'
import { emAppInstalado } from '../core/deriv/auth'
import { comoInstalar, instalar, ouvirInstalacao, type ComoInstalar } from '../core/appNativo'
import { ativarNotificacoes, estadoDasNotificacoes, type EstadoDasNotificacoes } from '../core/teeds/notificacoes'
import { AGENDA_DA_LIVE, FIM_DA_LIVE, INICIO_DA_LIVE } from '../core/teeds/lancamento'
import type { SessaoTeeds } from '../core/teeds/conta'
import './entrada/login.css'

const dois = (n: number) => String(n).padStart(2, '0')

function Visto() {
  return <i className="pre-visto" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4L19 7" /></svg></i>
}

export function PreAcesso({ sessao, nome, aoConferir, aoSair }: {
  sessao: SessaoTeeds
  nome?: string | null
  /** Relê a situação no banco. Devolve true quando já foi liberado. */
  aoConferir: () => Promise<boolean>
  aoSair: () => void
}) {
  const primeiroNome = (nome ?? '').trim().split(/\s+/)[0]
  const [agora, setAgora] = useState(Date.now())
  const [avisos, setAvisos] = useState<EstadoDasNotificacoes | null>(null)
  const [ligando, setLigando] = useState(false)
  const [recadoAvisos, setRecadoAvisos] = useState<string | null>(null)
  const [como, setComo] = useState<ComoInstalar>(() => comoInstalar())
  const [passosIos, setPassosIos] = useState(false)
  const conferirRef = useRef(aoConferir)
  conferirRef.current = aoConferir

  useEffect(() => { const t = window.setInterval(() => setAgora(Date.now()), 1000); return () => window.clearInterval(t) }, [])
  useEffect(() => { void estadoDasNotificacoes().then(setAvisos).catch(() => setAvisos('sem-suporte')) }, [])
  useEffect(() => ouvirInstalacao(() => setComo(comoInstalar())), [])

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

  async function ligarAvisos() {
    // no iPhone o pedido de permissão precisa nascer do toque: nada de espera antes
    setLigando(true); setRecadoAvisos(null)
    try {
      await ativarNotificacoes(sessao)
      setAvisos('ligadas')
    } catch (e) {
      setRecadoAvisos((e as Error).message)
      void estadoDasNotificacoes().then(setAvisos).catch(() => undefined)
    } finally { setLigando(false) }
  }

  const falta = Math.max(0, INICIO_DA_LIVE - agora)
  const noAr = agora >= INICIO_DA_LIVE && agora < FIM_DA_LIVE
  const d = Math.floor(falta / 864e5), h = Math.floor(falta / 36e5) % 24, m = Math.floor(falta / 6e4) % 60, s = Math.floor(falta / 1e3) % 60
  const instalado = emAppInstalado()
  const comunidade = comunidadeDaVitrine()

  return (
    <div className="entrada" data-modo="espera">
      <div className="entrada-aurora" aria-hidden="true" />
      <div className="entrada-grade" aria-hidden="true" />

      <div className="entrada-caixa espera-caixa pre-caixa">
        <header className="entrada-topo">
          <div className="entrada-marca"><Brand tamanho={46} /></div>
          <div className="entrada-opera">
            <span>Opera com</span>
            <DerivLogo altura={15} />
          </div>
        </header>

        <div className="espera-cabeca">
          <span className="espera-selo pre-selo"><i aria-hidden="true" />Pré-acesso</span>
          <h1>{primeiroNome ? `${primeiroNome}, sua conta está pronta.` : 'Sua conta está pronta.'}</h1>
          <p>O acesso completo é liberado na live de lançamento, <b>segunda, 9/11, às 20h</b>. Assista do início ao fim e a {MARCA.prosa} fica liberada para você, sem pagar nada.</p>
        </div>

        <div className="pre-relogio" role="timer" aria-live="off">
          {noAr ? (
            <div className="pre-noar">
              <b>A live está no ar agora</b>
              <span>O link está na comunidade do WhatsApp. Fique até o fim para liberar o seu acesso.</span>
            </div>
          ) : agora >= FIM_DA_LIVE ? (
            <div className="pre-noar"><b>A live terminou</b><span>A liberação acontece em instantes. Esta tela abre a plataforma sozinha.</span></div>
          ) : (
            <>
              <span className="pre-relogio-rotulo">Faltam</span>
              <span className="pre-num"><b>{d}</b><small>dias</small></span>
              <span className="pre-num"><b>{dois(h)}</b><small>horas</small></span>
              <span className="pre-num"><b>{dois(m)}</b><small>min</small></span>
              <span className="pre-num"><b>{dois(s)}</b><small>seg</small></span>
            </>
          )}
        </div>

        <section className="espera-enquanto" aria-labelledby="pre-titulo">
          <span className="espera-rotulo" id="pre-titulo">Para não perder a live</span>
          <ul className="pre-acoes">
            <li className={avisos === 'ligadas' ? 'feito' : ''}>
              {avisos === 'ligadas' ? <Visto /> : <i className="pre-n" aria-hidden="true">1</i>}
              <div>
                <b>{avisos === 'ligadas' ? 'Avisos ligados neste aparelho' : 'Ative os avisos no celular'}</b>
                <small>
                  {avisos === 'ligadas' ? 'A gente te chama antes de a live começar.'
                    : avisos === 'instalar' ? 'No iPhone, os avisos só funcionam com o app instalado. Instale primeiro, no passo abaixo, e abra a GlobalFly pelo ícone.'
                    : avisos === 'bloqueadas' ? 'Os avisos estão bloqueados neste aparelho. Libere nos ajustes do navegador e volte aqui.'
                    : avisos === 'sem-suporte' ? 'Este navegador não recebe avisos. Entre pelo celular para ativar.'
                    : 'A gente te chama antes de a live começar, mesmo com o app fechado.'}
                </small>
                {recadoAvisos && <small className="pre-erro" role="status">{recadoAvisos}</small>}
              </div>
              {avisos === 'desligadas' && (
                <button type="button" className="pre-botao" onClick={() => void ligarAvisos()} disabled={ligando}>{ligando ? 'Ativando…' : 'Ativar avisos'}</button>
              )}
            </li>

            <li className={instalado ? 'feito' : ''}>
              {instalado ? <Visto /> : <i className="pre-n" aria-hidden="true">2</i>}
              <div>
                <b>{instalado ? 'App instalado' : 'Instale o app'}</b>
                <small>
                  {instalado ? 'A GlobalFly fica na sua tela inicial, a um toque.'
                    : como === 'abrir-no-navegador' ? 'Daqui não dá para instalar. Abra globalflytrade.com no Safari ou no Chrome e entre de novo.'
                    : como === 'ios' ? 'No iPhone, a instalação é pelo Safari, em três toques.'
                    : como === 'botao' ? 'Um toque e a GlobalFly vai para a sua tela inicial.'
                    : 'No celular, abra globalflytrade.com e instale o app pelo navegador.'}
                </small>
                {como === 'ios' && passosIos && (
                  <ol className="pre-ios">
                    <li>Toque em <b>Compartilhar</b> na barra do Safari. Se não aparecer, toque em <b>···</b> e depois em Compartilhar.</li>
                    <li>Role a lista e toque em <b>Adicionar à Tela de Início</b>.</li>
                    <li>Toque em <b>Adicionar</b> e abra a GlobalFly pelo ícone.</li>
                  </ol>
                )}
              </div>
              {!instalado && como === 'botao' && <button type="button" className="pre-botao" onClick={() => void instalar()}>Instalar</button>}
              {!instalado && como === 'ios' && !passosIos && <button type="button" className="pre-botao" onClick={() => setPassosIos(true)}>Como instalar</button>}
            </li>

            <li>
              <i className="pre-n" aria-hidden="true">3</i>
              <div>
                <b>Salve na sua agenda</b>
                <small>Segunda, 9 de novembro, às 20h (Brasília), com lembrete 1 hora antes.</small>
                <span className="pre-links">
                  <a href={AGENDA_DA_LIVE.google} target="_blank" rel="noopener noreferrer">Google Agenda</a>
                  <a href={AGENDA_DA_LIVE.arquivo}>iPhone e outras</a>
                </span>
              </div>
            </li>

            {comunidade && (
              <li>
                <i className="pre-n" aria-hidden="true">4</i>
                <div>
                  <b>Entre na comunidade do WhatsApp</b>
                  <small>O link da live e os avisos do lançamento chegam por lá.</small>
                </div>
                <a className="pre-botao" href={comunidade} target="_blank" rel="noopener noreferrer">Entrar</a>
              </li>
            )}
          </ul>
        </section>

        <section className="espera-enquanto pre-deriv" aria-labelledby="pre-deriv-titulo">
          <span className="espera-rotulo" id="pre-deriv-titulo">Chegue pronto</span>
          <div className="entrada-corretora espera-corretora">
            <div className="corretora-topo">
              <DerivLogo altura={20} />
              <span className="corretora-selo">Corretora oficial</span>
            </div>
            <b>Abra sua conta na Deriv antes da live</b>
            <p>É grátis. O seu dinheiro fica na sua conta da corretora, e a {MARCA.prosa} se conecta a ela para operar. Na live, mostramos o primeiro <a href={DERIV.deposito} target="_blank" rel="noopener noreferrer">depósito na Deriv</a>, passo a passo.</p>
            <a className="btn-deriv" href={afiliadoDaDeriv()} target="_blank" rel="noopener noreferrer">
              <span>Abrir conta na Deriv</span>
              <IconeSaida />
            </a>
          </div>
        </section>

        <div className="entrada-troca">
          <button type="button" onClick={aoSair}>Sair desta conta</button>
        </div>
      </div>
    </div>
  )
}
