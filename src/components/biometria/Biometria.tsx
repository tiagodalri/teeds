/**
 * Entrar com Face ID / digital (27/10/2026).
 *
 * CartaoDeBiometria: no Meu perfil, liga este aparelho e lista os aparelhos
 * ligados (com "Tirar"). ConviteDeBiometria: na Início, para quem entrou com
 * senha num aparelho que tem biometria; some de vez ao ligar ou ao fechar.
 */
import { useEffect, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import {
  ativarBiometria, aparelhosComBiometria, biometriaDisponivel, biometriaLigadaAqui, esquecerBiometriaAqui, nomeDaBiometria, rotuloDaBiometria, tirarBiometria,
  type AparelhoComBiometria,
} from '../../core/teeds/biometria'
import { dataEHora } from '../../core/teeds/termos'
import { MARCA } from '../../marca'
import '../notificacoes/notificacoes.css'

const ROSTO = 'M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M9 9.5v1M15 9.5v1M12 9v4h-1M9.5 15.5c1.5 1.2 3.5 1.2 5 0'
const Rosto = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ROSTO} /></svg>

export function CartaoDeBiometria({ sessao }: { sessao: SessaoTeeds }) {
  const [disponivel, setDisponivel] = useState<boolean | null>(null)
  const [aqui, setAqui] = useState(biometriaLigadaAqui)
  const [lista, setLista] = useState<AparelhoComBiometria[] | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [recado, setRecado] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const nome = nomeDaBiometria()

  const carregar = () => { void aparelhosComBiometria(sessao).then(setLista).catch(() => setLista([])) }
  useEffect(() => { void biometriaDisponivel().then(setDisponivel); carregar() }, [sessao.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const ativar = async () => {
    setOcupado(true); setRecado(null)
    try { await ativarBiometria(sessao); setAqui(true); setRecado({ tipo: 'ok', texto: `Pronto! Da próxima vez, toque em "Entrar com ${rotuloDaBiometria()}" na tela de entrada.` }); carregar() }
    catch (e) { setRecado({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não deu certo agora.' }) }
    finally { setOcupado(false) }
  }
  const tirar = async (id: string) => {
    setOcupado(true); setRecado(null)
    try {
      await tirarBiometria(sessao, id)
      const resto = (lista ?? []).filter((x) => x.id !== id)
      setLista(resto)
      if (!resto.length) { esquecerBiometriaAqui(); setAqui(false) }
      setRecado({ tipo: 'ok', texto: 'Aparelho tirado. Ele não entra mais sem a senha.' })
    } catch (e) { setRecado({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não deu certo agora.' }) }
    finally { setOcupado(false) }
  }

  return (
    <section className="mp-cartao nt-cartao">
      <h2><Rosto />Entrar com {rotuloDaBiometria()}</h2>
      <p className="mp-nota">Entre na {MARCA.prosa} sem digitar a senha, com {nome === 'digital' ? 'o leitor de digital' : nome === 'biometria' ? 'a biometria' : `o ${nome}`} do seu aparelho. A biometria fica só no aparelho: a plataforma nunca vê o seu rosto nem a sua digital.</p>

      {disponivel === false && <p className="mp-nota">Este aparelho não tem Face ID, Touch ID ou digital disponível para entrar. No celular, abra a {MARCA.prosa} pelo app instalado ou pelo navegador e ative por lá.</p>}
      {disponivel && !aqui && (
        <button type="button" className="mp-btn ouro" disabled={ocupado} onClick={() => void ativar()}>
          {ocupado ? 'Aguardando o aparelho…' : `Ativar ${rotuloDaBiometria()} neste aparelho`}
        </button>
      )}
      {disponivel && aqui && <div className="mp-atual"><span>Neste aparelho</span><b className="nt-ligadas"><i aria-hidden="true" />Ligado</b></div>}

      {lista && lista.length > 0 && (
        <ul className="nt-aparelhos">
          {lista.map((a) => (
            <li key={a.id}>
              <span><b>{a.aparelho || 'Aparelho'}</b><small>Ligado em {dataEHora(a.criadaEm)}{a.usadaEm ? ` · último uso em ${dataEHora(a.usadaEm)}` : ''}</small></span>
              <button type="button" className="mp-btn secundario" disabled={ocupado} onClick={() => void tirar(a.id)}>Tirar</button>
            </li>
          ))}
        </ul>
      )}
      {recado && <p className={`mp-recado ${recado.tipo}`} role="status">{recado.texto}</p>}
    </section>
  )
}

const CHAVE_FECHADO = `${MARCA.id}:convite-biometria`
const fechadoAntes = () => { try { return localStorage.getItem(CHAVE_FECHADO) === '1' } catch { return false } }

export function ConviteDeBiometria({ sessao }: { sessao: SessaoTeeds }) {
  const [disponivel, setDisponivel] = useState(false)
  const [fechado, setFechado] = useState(() => fechadoAntes() || biometriaLigadaAqui())
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState(false)
  useEffect(() => { if (!fechado) void biometriaDisponivel().then(setDisponivel) }, [fechado])
  const nome = nomeDaBiometria()
  if (feito) return <p className="nt-convite-ok" role="status">Pronto! Da próxima vez, entre com {rotuloDaBiometria()}.</p>
  if (fechado || !disponivel) return null
  const fechar = () => { try { localStorage.setItem(CHAVE_FECHADO, '1') } catch { /* sem armazenamento */ } setFechado(true) }
  const ativar = async () => {
    setOcupado(true); setErro(null)
    try { await ativarBiometria(sessao); setFeito(true); fechar() } catch (e) { setErro(e instanceof Error ? e.message : 'Não deu certo agora.') } finally { setOcupado(false) }
  }
  return (
    <aside className="nt-convite" aria-label={`Entrar com ${rotuloDaBiometria()}`}>
      <span className="nt-convite-icone"><Rosto /></span>
      <div className="nt-convite-texto">
        <b>Entre mais rápido com {rotuloDaBiometria()}</b>
        <span>Sem digitar a senha. A biometria fica só no seu aparelho.</span>
        {erro && <small role="alert">{erro}</small>}
      </div>
      <button type="button" className="nt-convite-acao" disabled={ocupado} onClick={() => void ativar()}>{ocupado ? 'Aguardando…' : 'Ativar'}</button>
      <button type="button" className="nt-convite-fechar" aria-label="Fechar o convite" onClick={fechar}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </aside>
  )
}
