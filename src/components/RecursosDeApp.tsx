import { useEffect, useState } from 'react'
import { MARCA } from '../marca'
import {
  comoInstalar, conviteRecusado, instalar, lembrarRecusa, ouvirInstalacao, type ComoInstalar,
} from '../core/appNativo'
import './app-nativo.css'

const base = import.meta.env.BASE_URL

/** O ícone de Compartilhar do Safari, desenhado igual ao do iPhone. */
function IconeCompartilhar() {
  return (
    <svg viewBox="0 0 20 24" width="16" height="19" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2v13M6 5.5 10 2l4 3.5M6.5 9H4.5A1.5 1.5 0 0 0 3 10.5v10A1.5 1.5 0 0 0 4.5 22h11a1.5 1.5 0 0 0 1.5-1.5v-10A1.5 1.5 0 0 0 15.5 9h-2" />
    </svg>
  )
}

/**
 * O convite para instalar o app.
 *
 * Android e computador (Chrome, Edge, Samsung): um botão que abre a janela
 * de instalação do próprio sistema. iPhone e iPad: o iOS não deixa site
 * nenhum instalar sozinho, então o convite ensina o caminho pelo menu
 * Compartilhar. Em navegador de rede social (Instagram, WhatsApp...) não dá
 * para instalar: pede para abrir no Safari.
 *
 * Aparece alguns segundos depois de abrir, nunca no app já instalado, e
 * "Agora não" vale por 7 dias.
 */
function ConviteInstalar() {
  const [como, setComo] = useState<ComoInstalar>(null)
  const [aberto, setAberto] = useState(false)
  const [passos, setPassos] = useState(false)

  useEffect(() => {
    if (/[?&](code|access_token)=/.test(location.search)) return // no meio de um login, não
    const atualizar = () => setComo(comoInstalar())
    const t = window.setTimeout(() => { atualizar(); if (!conviteRecusado()) setAberto(true) }, 4000)
    const parar = ouvirInstalacao(atualizar)
    return () => { window.clearTimeout(t); parar() }
  }, [])

  // aberto, o convite fica fixo no pé da tela: a página ganha espaço embaixo para nada ficar atrás dele (27/10/2026)
  const visivel = aberto && !!como
  useEffect(() => {
    document.documentElement.classList.toggle('com-convite-app', visivel)
    return () => document.documentElement.classList.remove('com-convite-app')
  }, [visivel])

  if (!aberto || !como) return null

  const fechar = () => { lembrarRecusa(7); setAberto(false); setPassos(false) }

  return (
    <>
      <aside className="app-convite" role="dialog" aria-label={`Instalar o app ${MARCA.prosa}`}>
        <img className="app-convite-icone" src={`${base}pwa-${MARCA.id}/icon-192.png`} alt="" width="44" height="44" />
        <div className="app-convite-texto">
          <b>Instale o app {MARCA.prosa}</b>
          <span>{como === 'abrir-no-navegador'
            ? 'Para instalar, abra este endereço no Safari.'
            : 'Abre em tela cheia, direto da tela inicial do celular.'}</span>
        </div>
        {como === 'botao' && (
          <button className="app-convite-acao" onClick={async () => { if (await instalar()) setAberto(false) }}>Instalar</button>
        )}
        {como === 'ios' && <button className="app-convite-acao" onClick={() => setPassos(true)}>Como instalar</button>}
        <button className="app-convite-fechar" onClick={fechar} aria-label="Agora não">×</button>
      </aside>

      {passos && (
        <div className="app-passos-fundo" role="presentation" onClick={() => setPassos(false)}>
          <section className="app-passos" role="dialog" aria-modal="true" aria-label="Como instalar no iPhone" onClick={(e) => e.stopPropagation()}>
            <span className="app-passos-alca" aria-hidden />
            <img src={`${base}pwa-${MARCA.id}/icon-192.png`} alt="" width="56" height="56" />
            <h2>Instale em três toques</h2>
            <ol>
              <li><i>1</i><span>Toque em <b>Compartilhar</b> <em><IconeCompartilhar /></em> na barra do Safari. Se não aparecer, toque em <b>···</b> e depois em Compartilhar.</span></li>
              <li><i>2</i><span>Role a lista e toque em <b>Adicionar à Tela de Início</b>.</span></li>
              <li><i>3</i><span>Toque em <b>Adicionar</b>. O ícone da {MARCA.prosa} aparece na sua tela inicial.</span></li>
            </ol>
            <button className="app-convite-acao" onClick={() => setPassos(false)}>Entendi</button>
          </section>
        </div>
      )}
    </>
  )
}

/** O aviso de sem conexão, como nos apps do banco: discreto, no topo. */
function AvisoSemConexao() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  if (online) return null
  return <div className="app-offline" role="status">Sem conexão com a internet. A tela volta a atualizar sozinha quando a conexão voltar.</div>
}

export default function RecursosDeApp() {
  return <><AvisoSemConexao /><ConviteInstalar /></>
}
