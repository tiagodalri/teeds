/**
 * O aviso da live de lançamento (GlobalFly, 09/11/2026, Tiago): "todo mundo que acessar a
 * plataforma (exceto os adms) das 19h40 em diante vai ver um aviso bloqueando a página, tipo
 * popup, com um botão pra entrar na live ao vivo".
 *
 * - A transmissão é fora da plataforma; o link é colado em Administração › Live de lançamento
 *   e chega aqui sozinho (consulta pública teeds_lancamento_publico, de 20 em 20 s).
 * - Aparece das 19h40 até a live ser encerrada no painel (ou 23h, se ninguém encerrar).
 * - Cliente logado: bloqueia a plataforma inteira, sem fechar.
 * - Tela de entrar (ainda não se sabe quem é): o mesmo aviso, com "Sou da equipe" discreto
 *   para o administrador conseguir entrar. Administrador logado não vê.
 * - O administrador confere o aviso com ?ver=aviso-da-live no endereço.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { MARCA } from '../../marca'
import {
  assinarQuemVeAvisoDaLive, AVISO_DA_LIVE_DESDE, callNoAr, EVENTO_ABRIR_AVISO_DA_LIVE, FIM_DA_CALL, faltaCurto, FIM_DA_LIVE, INICIO_DA_LIVE, linkDaLive, liveAberta,
  liveLidaPeloApp, quemVeAvisoDaLive, type LiveAberta,
} from '../../core/teeds/lancamento'
import './lancamento.css'

const CHAVE_EQUIPE = 'gf.aviso-da-live.equipe'
const forcado = () => { try { return new URLSearchParams(location.search).get('ver') === 'aviso-da-live' } catch { return false } }

export default function AvisoDaLive() {
  const quem = useSyncExternalStore(assinarQuemVeAvisoDaLive, quemVeAvisoDaLive)
  // logado, o App já lê a live com login (vale mesmo sem a consulta pública no banco)
  const doApp = useSyncExternalStore(assinarQuemVeAvisoDaLive, liveLidaPeloApp)
  const [ver] = useState(forcado)
  const [agora, setAgora] = useState(Date.now())
  const [dados, setDados] = useState<LiveAberta | null>(null)
  const [equipe, setEquipe] = useState(() => { try { return !!sessionStorage.getItem(CHAVE_EQUIPE) } catch { return false } })
  // call de 10/11: "Agora não" fecha; o Ao vivo do menu reabre (também para administradores)
  const [fechado, setFechado] = useState(false)
  const [pedido, setPedido] = useState(false)
  useEffect(() => {
    const abrir = () => { setFechado(false); setPedido(true) }
    window.addEventListener(EVENTO_ABRIR_AVISO_DA_LIVE, abrir)
    return () => window.removeEventListener(EVENTO_ABRIR_AVISO_DA_LIVE, abrir)
  }, [])

  // o relógio: de 1 em 1 s perto das 20h (a contagem), de 15 em 15 s no resto
  useEffect(() => {
    const perto = Math.abs(agora - INICIO_DA_LIVE) < 30 * 6e4
    const t = window.setTimeout(() => setAgora(Date.now()), perto ? 1000 : 15_000)
    return () => window.clearTimeout(t)
  }, [agora])

  const terminou = dados?.terminouEm ?? doApp?.terminouEm ?? null
  const fim = terminou ? Date.parse(terminou) : FIM_DA_LIVE
  const naJanela = agora >= AVISO_DA_LIVE_DESDE && agora < fim
  const link = linkDaLive(dados?.link) ?? linkDaLive(doApp?.link)
  // lê o link a partir de 5 min antes do aviso, enquanto a live não terminou: de 20 em 20 s
  // até o link chegar, depois de 60 em 60 s (só para saber se ela terminou)
  const emCall = callNoAr(terminou, agora)
  const ler = ver || emCall || (agora >= AVISO_DA_LIVE_DESDE - 5 * 6e4 && agora < fim)
  useEffect(() => {
    if (!ler) return
    let vivo = true
    let t = 0
    const uma = () => {
      window.clearTimeout(t)
      void liveAberta().then((d) => { if (vivo) setDados(d) }).catch(() => undefined).finally(() => {
        if (vivo) t = window.setTimeout(uma, document.visibilityState === 'hidden' ? 60_000 : link ? 60_000 : 20_000)
      })
    }
    const aoVoltar = () => { if (document.visibilityState === 'visible') uma() }
    uma()
    document.addEventListener('visibilitychange', aoVoltar)
    return () => { vivo = false; window.clearTimeout(t); document.removeEventListener('visibilitychange', aoVoltar) }
  }, [ler, !!link]) // eslint-disable-line react-hooks/exhaustive-deps

  if (MARCA.id !== 'globalfly') return null
  if (emCall) {
    if (!link || fechado || (quem === 'admin' && !pedido)) return null
    return (
      <div className="tl-fundo tl-livre alv-fundo" role="presentation">
        <div className="tl-janela alv-janela" role="dialog" aria-modal="true" aria-labelledby="alv-titulo">
          <span className="tl-selo tl-selo-vivo"><i aria-hidden="true" />Ao vivo agora</span>
          <div className="tl-cabeca">
            <h2 id="alv-titulo">Atenção: a nossa transmissão ao vivo começou</h2>
            <p>Clique no botão para entrar na call pelo Google Meet.</p>
          </div>
          <div className="tl-acoes">
            <a className="tl-botao alv-botao" href={link} target="_blank" rel="noopener noreferrer" onClick={() => setFechado(true)}>
              <i className="tl-ponto alv-ponto" aria-hidden="true" />Clique aqui para entrar
            </a>
          </div>
          <button type="button" className="alv-equipe" onClick={() => { setFechado(true); setPedido(false) }}>Agora não</button>
        </div>
      </div>
    )
  }
  void FIM_DA_CALL
  if (!ver && (!naJanela || quem === 'admin' || (quem === 'visitante' && equipe))) return null

  const noAr = agora >= INICIO_DA_LIVE
  const sairParaEquipe = () => { try { sessionStorage.setItem(CHAVE_EQUIPE, '1') } catch { /* só agora */ } setEquipe(true) }

  return (
    <div className="tl-fundo tl-livre alv-fundo" role="presentation">
      <div className="tl-janela alv-janela" role="dialog" aria-modal="true" aria-labelledby="alv-titulo">
        {noAr
          ? <span className="tl-selo tl-selo-vivo"><i aria-hidden="true" />Ao vivo agora</span>
          : <span className="tl-selo">Hoje, às 20h</span>}
        <div className="tl-cabeca">
          <h2 id="alv-titulo">{noAr ? 'Estamos ao vivo' : 'A live de lançamento já vai começar'}</h2>
          <p>{noAr
            ? `A live de lançamento da ${MARCA.prosa} está acontecendo agora. Toque no botão para assistir.`
            : <>Começa às 20h, em <span className="tl-mono alv-falta">{faltaCurto(INICIO_DA_LIVE - agora)}</span>. Toque no botão para entrar e deixe o som ligado.</>}</p>
        </div>
        <div className="tl-acoes">
          {link
            ? <a className="tl-botao alv-botao" href={link} target="_blank" rel="noopener noreferrer">
                {noAr && <i className="tl-ponto alv-ponto" aria-hidden="true" />}Entrar na live ao vivo
              </a>
            : <button type="button" className="tl-botao alv-botao" disabled>O link da live aparece aqui em instantes</button>}
        </div>
        <small className="alv-nota">{link
          ? `A transmissão abre em outra página. A ${MARCA.prosa} volta ao normal aqui quando a live terminar.`
          : 'Esta tela se atualiza sozinha. Não precisa recarregar.'}</small>
        {quem === 'visitante' && !ver && (
          <button type="button" className="alv-equipe" onClick={sairParaEquipe}>Sou da equipe: entrar na plataforma</button>
        )}
      </div>
    </div>
  )
}
