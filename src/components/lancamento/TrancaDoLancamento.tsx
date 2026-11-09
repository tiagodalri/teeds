/**
 * A plataforma trancada até a live (funil do lançamento, aprovado pelo Tiago
 * em 02/11/2026): "consegue logar e ter acesso à página inicial, mas todos os
 * botões estarão bloqueados até a live do dia 09/11; sempre que tentar clicar
 * em algo vai aparecer um aviso... e coloca uma contagem regressiva também".
 *
 * Fica por cima da plataforma de verdade (App.tsx), sem trocar nada de lugar:
 * - um cartão fixo no pé, com o cadeado e a contagem até 09/11, às 20h;
 * - todo toque em botão, link ou campo é segurado e abre o aviso;
 * - na primeira entrada da sessão, o aviso abre sozinho (o "pisca" do Naor);
 * - na hora da live, o aviso vira "Estamos ao vivo" e abre a live aqui dentro;
 * - depois da live, confere sozinho a liberação e abre a plataforma.
 *
 * Ficam livres só: o menu do avatar (para sair), o botão de tema e o que é
 * desta camada (`.tl-livre`).
 *
 * 09/11/2026: a live em si fica no App (uma só para o inscrito e para quem já
 * tem a plataforma). Na liberação a tranca some e a live continua tocando, sem
 * recomeçar o vídeo nem zerar a presença.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MARCA } from '../../marca'
import { DERIV } from '../../core/deriv/config'
import { afiliadoDaDeriv, comunidadeDaVitrine } from '../../core/rotas'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { INICIO_DA_LIVE, LIVE_POR_FORA, faltaCurto, idDoYoutube, linkDaLive, type EstadoDaLive } from '../../core/teeds/lancamento'
import { ChecklistDaLive } from '../PreAcesso'
import './lancamento.css'

const LIVRES = '.tl-livre, .avatar-botao, .menu-acao.perigo, .tema-btn'
const TOCAVEIS = 'button, a, input, select, textarea, label, summary, canvas, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="slider"], [tabindex]:not([tabindex="-1"])'
const CAMPOS = 'input, select, textarea'

const dois = (n: number) => String(n).padStart(2, '0')

function Cadeado({ tamanho = 18 }: { tamanho?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.4" /><path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9" /><path d="M12 14.6v2" />
    </svg>
  )
}

/** Dias, horas, minutos e segundos, em quatro casas. */
function Relogio({ falta }: { falta: number }) {
  const d = Math.floor(falta / 864e5), h = Math.floor(falta / 36e5) % 24, m = Math.floor(falta / 6e4) % 60, s = Math.floor(falta / 1e3) % 60
  return (
    <div className="tl-relogio" role="timer" aria-label={`Faltam ${d} dias, ${h} horas e ${m} minutos`}>
      {([[dois(d), 'dias'], [dois(h), 'horas'], [dois(m), 'min'], [dois(s), 'seg']] as const).map(([n, r]) => (
        <span key={r}><b>{n}</b><small>{r}</small></span>
      ))}
    </div>
  )
}

type Fase = 'antes' | 'no-ar' | 'depois'

export function TrancaDoLancamento({ sessao, nome, estado, aoConferir, previa = false, assistindo, aoAssistir }: {
  sessao: SessaoTeeds
  /** A live está aberta por cima (quem a mostra é o App). */
  assistindo: boolean
  aoAssistir: () => void
  nome?: string | null
  estado: EstadoDaLive | null
  /** Relê a ficha no banco. Devolve true quando o acesso já foi liberado. */
  aoConferir: () => Promise<boolean>
  /** Administrador vendo como o inscrito vê (?ver=inscrito): mostra a faixa da prévia. */
  previa?: boolean
}) {
  const primeiroNome = (nome ?? '').trim().split(/\s+/)[0]
  const [agora, setAgora] = useState(Date.now())
  const [aviso, setAviso] = useState<null | 'aviso' | 'preparo'>(() => {
    try { return sessionStorage.getItem(`${MARCA.id}.tranca.vista`) ? null : 'aviso' } catch { return 'aviso' }
  })
  const conferirRef = useRef(aoConferir)
  conferirRef.current = aoConferir

  useEffect(() => { const t = window.setInterval(() => setAgora(Date.now()), 1000); return () => window.clearInterval(t) }, [])
  useEffect(() => { try { sessionStorage.setItem(`${MARCA.id}.tranca.vista`, '1') } catch { /* só nesta tela */ } }, [])

  const inicio = estado?.inicioPrevisto ? Date.parse(estado.inicioPrevisto) : INICIO_DA_LIVE
  const fase: Fase = estado?.noAr ? 'no-ar' : estado?.terminouEm || agora >= inicio + 3 * 36e5 ? 'depois' : 'antes'
  const falta = Math.max(0, inicio - agora)
  // 09/11/2026: a transmissão é fora da plataforma; o botão leva ao link (o aviso de tela cheia também)
  const linkFora = LIVE_POR_FORA ? linkDaLive(estado?.youtube) : null
  const temVideo = LIVE_POR_FORA ? !!linkFora : !!idDoYoutube(estado?.youtube)

  // a live começou: o aviso abre sozinho com o "Assistir agora"
  const faseAnterior = useRef<Fase | null>(null)
  useEffect(() => {
    if (fase === 'no-ar' && faseAnterior.current !== 'no-ar' && !assistindo) setAviso('aviso')
    faseAnterior.current = fase
  }, [fase, assistindo])

  // segura todo toque fora do que é livre e abre o aviso
  useEffect(() => {
    const segurar = (e: Event) => {
      const alvo = e.target instanceof Element ? e.target : null
      if (!alvo || alvo.closest(LIVRES)) return
      if (!alvo.closest(TOCAVEIS)) return
      e.preventDefault()
      e.stopPropagation()
      if (e.type === 'click') setAviso((a) => a ?? 'aviso')
    }
    // campos: sem foco (o teclado do celular não abre por trás do aviso)
    const semFoco = (e: Event) => {
      const alvo = e.target instanceof Element ? e.target : null
      if (alvo && !alvo.closest(LIVRES) && alvo.closest(CAMPOS)) e.preventDefault()
    }
    document.addEventListener('click', segurar, true)
    document.addEventListener('pointerdown', semFoco, true)
    document.addEventListener('submit', segurar, true)
    return () => {
      document.removeEventListener('click', segurar, true)
      document.removeEventListener('pointerdown', semFoco, true)
      document.removeEventListener('submit', segurar, true)
    }
  }, [])

  // depois da live (e perto dela), confere a liberação sozinho
  useEffect(() => {
    if (previa) return
    let ocupada = false
    const conferir = () => {
      if (ocupada || document.visibilityState !== 'visible') return
      ocupada = true
      void conferirRef.current().catch(() => false).finally(() => { ocupada = false })
    }
    const t = window.setInterval(conferir, fase === 'antes' ? 120_000 : 20_000)
    document.addEventListener('visibilitychange', conferir)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', conferir) }
  }, [fase, previa])

  // o botão "Liberar acesso geral" foi apertado: confere na hora (não espera a próxima volta de 20 s)
  const [conferindo, setConferindo] = useState(false)
  useEffect(() => {
    if (previa || !estado?.liberadoEm) return
    let vivo = true
    setConferindo(true)
    void conferirRef.current().catch(() => false).finally(() => { if (vivo) setConferindo(false) })
    return () => { vivo = false }
  }, [estado?.liberadoEm, previa])

  const abrirLive = () => { setAviso(null); if (linkFora) window.open(linkFora, '_blank', 'noopener'); else if (!LIVE_POR_FORA) aoAssistir() }

  let conteudo: ReactNode
  if (aviso === 'preparo') {
    conteudo = (
      <>
        <div className="tl-cabeca">
          <span className="tl-selo"><Cadeado tamanho={14} />Para não perder a live</span>
          <h2>Deixe tudo pronto para 09/11</h2>
          <p>Quatro passos rápidos. A gente te chama antes de começar.</p>
        </div>
        <ChecklistDaLive sessao={sessao} />
        <div className="tl-deriv">
          <div>
            <b>Abra sua conta na corretora antes da{"\u00a0"}live</b>
            <span>É grátis. Na live, mostramos o primeiro <a href={DERIV.deposito} target="_blank" rel="noopener noreferrer">depósito</a>, passo a passo.</span>
          </div>
          {/* no lançamento a corretora não é nomeada (03/11/2026): o nome aparece só depois do acesso liberado */}
          <a className="tl-botao" href={afiliadoDaDeriv()} target="_blank" rel="noopener noreferrer">Abrir minha conta na corretora</a>
        </div>
        <div className="tl-acoes">
          <button type="button" className="tl-botao tl-botao-calmo" onClick={() => setAviso('aviso')}>Voltar</button>
        </div>
      </>
    )
  } else if (fase === 'no-ar') {
    conteudo = (
      <>
        <div className="tl-cabeca">
          <span className="tl-selo tl-selo-vivo"><i aria-hidden="true" />Ao vivo agora</span>
          <h2>{primeiroNome ? `${primeiroNome}, a live começou` : 'A live começou'}</h2>
          <p>{LIVE_POR_FORA ? 'A transmissão é fora da plataforma. Toque no botão para assistir.' : <>Assista aqui dentro, do início ao fim. A liberação da {MARCA.prosa} acontece ao vivo, durante a live.</>}</p>
        </div>
        <div className="tl-acoes">
          <button type="button" className="tl-botao" onClick={abrirLive} disabled={!temVideo}>{temVideo ? (LIVE_POR_FORA ? 'Entrar na live ao vivo' : 'Assistir agora') : 'A transmissão abre em instantes'}</button>
        </div>
      </>
    )
  } else if (fase === 'depois') {
    conteudo = (
      <>
        <div className="tl-cabeca">
          <span className="tl-selo"><Cadeado tamanho={14} />A live terminou</span>
          <h2>{estado?.liberadoEm && !conferindo ? 'Seu acesso ainda não foi liberado' : 'Liberando os acessos'}</h2>
          <p>{estado?.liberadoEm && !conferindo
            ? 'O acesso da turma de lançamento já foi liberado. Os próximos passos para quem ainda não tem acesso serão avisados na comunidade do WhatsApp.'
            : 'A equipe está liberando os acessos. Esta tela abre a plataforma sozinha assim que o seu for liberado.'}</p>
        </div>
        <div className="tl-acoes">
          {comunidadeDaVitrine() && <a className="tl-botao" href={comunidadeDaVitrine()} target="_blank" rel="noopener noreferrer">Abrir a comunidade</a>}
          <button type="button" className="tl-botao tl-botao-calmo" onClick={() => setAviso(null)}>Entendi</button>
        </div>
      </>
    )
  } else {
    conteudo = (
      <>
        <div className="tl-cadeado" aria-hidden="true"><Cadeado tamanho={26} /></div>
        <div className="tl-cabeca">
          <h2>Liberado na live de 09/11, às 20h</h2>
          <p>{primeiroNome ? `${primeiroNome}, sua conta está pronta. ` : 'Sua conta está pronta. '}Na live, a {MARCA.prosa} é liberada para você, sem pagar nada. Assista do início ao fim.</p>
        </div>
        <Relogio falta={falta} />
        <div className="tl-acoes">
          <button type="button" className="tl-botao" onClick={() => setAviso('preparo')}>Como me preparar</button>
          <button type="button" className="tl-botao tl-botao-calmo" onClick={() => setAviso(null)}>Entendi</button>
        </div>
      </>
    )
  }

  return (
    <>
      {previa && <div className="tl-previa tl-livre" role="status">Prévia: é assim que o inscrito vê a plataforma até a live</div>}

      {!assistindo && (
        <div className={`tl-cartao tl-livre tl-${fase}`} role="status">
          <span className="tl-cartao-ico">{fase === 'no-ar' ? <i className="tl-ponto" aria-hidden="true" /> : <Cadeado />}</span>
          <span className="tl-cartao-texto">
            <b>{fase === 'no-ar' ? 'A live está no ar' : fase === 'depois' ? 'A live terminou' : 'Liberado na live de 09/11, às 20h'}</b>
            <small>{fase === 'no-ar' ? 'A liberação acontece durante a live' : fase === 'depois' ? (estado?.liberadoEm && !conferindo ? 'Seu acesso ainda não foi liberado' : 'Liberando os acessos…') : <>Faltam <span className="tl-mono">{faltaCurto(falta)}</span></>}</small>
          </span>
          {fase === 'no-ar'
            ? <button type="button" className="tl-botao" onClick={abrirLive} disabled={!temVideo}>Assistir</button>
            : <button type="button" className="tl-botao tl-botao-calmo" onClick={() => setAviso(fase === 'antes' ? 'preparo' : 'aviso')}>{fase === 'antes' ? 'Como me preparar' : 'Ver mais'}</button>}
        </div>
      )}

      {aviso && !assistindo && (
        <div className="tl-fundo tl-livre" onClick={(e) => { if (e.target === e.currentTarget) setAviso(null) }}>
          <div className={`tl-janela${aviso === 'preparo' ? ' tl-janela-larga' : ''}`} role="dialog" aria-modal="true" aria-label="Plataforma liberada na live">
            <button type="button" className="tl-fechar" aria-label="Fechar" onClick={() => setAviso(null)}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            {conteudo}
          </div>
        </div>
      )}
    </>
  )
}
