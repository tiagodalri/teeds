/**
 * Notificações no celular (27/10/2026).
 *
 * CartaoDeNotificacoes: no Meu perfil, liga e desliga neste aparelho, manda um
 * teste e, no iPhone sem o app instalado, ensina a instalar (é a única forma
 * de o iPhone receber). ConviteDeNotificacoes: um convite discreto na Início
 * para quem ainda não ligou; some de vez ao ligar ou ao fechar.
 */
import { useEffect, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { ativarNotificacoes, desligarNotificacoes, estadoDasNotificacoes, testarNotificacoes, type EstadoDasNotificacoes } from '../../core/teeds/notificacoes'
import { MARCA } from '../../marca'
import './notificacoes.css'

const IA = MARCA.id === 'globalfly'
const termo = IA ? 'a I.A.' : 'o robô'

const SINO = 'M6 16V11a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0'
const Sino = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={SINO} /></svg>
// o botão Compartilhar do Safari (quadrado com a seta para cima)
const Compartilhar = () => <svg className="nt-compartilhar" viewBox="0 0 24 24" aria-label="Compartilhar" role="img"><path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1" /></svg>

function useEstado() {
  const [estado, setEstado] = useState<EstadoDasNotificacoes | null>(null)
  const ler = () => { void estadoDasNotificacoes().then(setEstado).catch(() => setEstado('sem-suporte')) }
  useEffect(ler, [])
  return [estado, ler] as const
}

function ComoInstalar() {
  return (
    <ol className="nt-passos">
      <li>No Safari, toque em <Compartilhar /> <b>Compartilhar</b>.</li>
      <li>Escolha <b>Adicionar à Tela de Início</b>.</li>
      <li>Abra a {MARCA.prosa} pelo ícone novo e ligue os avisos aqui no perfil.</li>
    </ol>
  )
}

export function CartaoDeNotificacoes({ sessao }: { sessao: SessaoTeeds }) {
  const [estado, reler] = useEstado()
  const [ocupado, setOcupado] = useState(false)
  const [recado, setRecado] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const agir = async (fazer: () => Promise<string | void>) => {
    setOcupado(true); setRecado(null)
    try { const t = await fazer(); if (t) setRecado({ tipo: 'ok', texto: t }) } catch (e) { setRecado({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não deu certo agora. Tente de novo.' }) } finally { setOcupado(false); reler() }
  }

  return (
    <section className="mp-cartao nt-cartao">
      <h2><Sino />Notificações no celular</h2>
      <p className="mp-nota">Você fica sabendo na hora, mesmo com o app fechado, quando {termo}:</p>
      <ul className="nt-lista">
        <li>bateu a meta;</li>
        <li>parou no limite de perda;</li>
        <li>foi {IA ? 'desligada' : 'desligado'} por falta de saldo ou manutenção.</li>
      </ul>

      {estado === null && <p className="mp-nota">Verificando este aparelho…</p>}
      {estado === 'instalar' && <>
        <p className="mp-nota"><b>No iPhone, os avisos chegam pelo app instalado.</b> Leva 10 segundos:</p>
        <ComoInstalar />
      </>}
      {estado === 'sem-suporte' && <p className="mp-nota">Este navegador não recebe notificações. No Android, use o Chrome; no iPhone, o app instalado na tela de início (iOS 16.4 ou mais novo).</p>}
      {estado === 'bloqueadas' && <p className="mp-nota">Os avisos estão bloqueados para a {MARCA.prosa} neste aparelho. Libere em <b>Ajustes › Notificações</b> (iPhone) ou nas permissões do site (Android) e volte aqui.</p>}
      {estado === 'desligadas' && (
        <button type="button" className="mp-btn ouro" disabled={ocupado} onClick={() => void agir(async () => { await ativarNotificacoes(sessao); return 'Pronto! Os avisos estão ligados neste aparelho.' })}>
          {ocupado ? 'Ligando…' : 'Ativar notificações'}
        </button>
      )}
      {estado === 'ligadas' && <>
        <div className="mp-atual"><span>Neste aparelho</span><b className="nt-ligadas"><i aria-hidden="true" />Ligadas</b></div>
        <div className="nt-acoes">
          <button type="button" className="mp-btn" disabled={ocupado} onClick={() => void agir(async () => {
            const n = await testarNotificacoes(sessao)
            return n > 0 ? `Teste enviado para ${n === 1 ? '1 aparelho' : `${n} aparelhos`}. Deve chegar em alguns segundos.` : 'Nenhum aparelho recebeu. Desligue e ligue de novo aqui.'
          })}>Enviar um teste</button>
          <button type="button" className="mp-btn secundario" disabled={ocupado} onClick={() => void agir(async () => { await desligarNotificacoes(sessao); return 'Os avisos foram desligados neste aparelho.' })}>Desligar neste aparelho</button>
        </div>
      </>}
      {recado && <p className={`mp-recado ${recado.tipo}`} role="status">{recado.texto}</p>}
    </section>
  )
}

const CHAVE_FECHADO = `${MARCA.id}:convite-notificacoes`
const fechadoAntes = () => { try { return localStorage.getItem(CHAVE_FECHADO) === '1' } catch { return false } }

export function ConviteDeNotificacoes({ sessao, aoAbrirPerfil }: { sessao: SessaoTeeds; aoAbrirPerfil: () => void }) {
  const [estado, reler] = useEstado()
  const [fechado, setFechado] = useState(fechadoAntes)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState(false)
  if (fechado || !estado || !['desligadas', 'instalar'].includes(estado)) return feito ? <p className="nt-convite-ok" role="status">Avisos ligados neste aparelho.</p> : null
  const fechar = () => { try { localStorage.setItem(CHAVE_FECHADO, '1') } catch { /* sem armazenamento */ } setFechado(true) }
  const ativar = async () => {
    setOcupado(true); setErro(null)
    try { await ativarNotificacoes(sessao); setFeito(true); fechar() } catch (e) { setErro(e instanceof Error ? e.message : 'Não deu certo agora.') } finally { setOcupado(false); reler() }
  }
  return (
    <aside className="nt-convite" aria-label="Notificações no celular">
      <span className="nt-convite-icone"><Sino /></span>
      <div className="nt-convite-texto">
        <b>Saiba na hora quando {termo} bater a meta ou parar</b>
        <span>{estado === 'instalar' ? 'No iPhone, instale o app na tela de início para receber os avisos.' : 'Um aviso no celular, mesmo com o app fechado.'}</span>
        {erro && <small role="alert">{erro}</small>}
      </div>
      {estado === 'instalar'
        ? <button type="button" className="nt-convite-acao" onClick={aoAbrirPerfil}>Como instalar</button>
        : <button type="button" className="nt-convite-acao" disabled={ocupado} onClick={() => void ativar()}>{ocupado ? 'Ligando…' : 'Ativar'}</button>}
      <button type="button" className="nt-convite-fechar" aria-label="Fechar o convite" onClick={fechar}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </aside>
  )
}
