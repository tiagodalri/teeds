/**
 * "Liberar acesso geral" (08/11/2026, Tiago): em vez de abrir sozinho às 20h30
 * de 09/11, o acesso de todo mundo abre quando um administrador aperta este
 * botão, em Administração › Clientes (só na GlobalFly, só administradores; o
 * banco confere de novo).
 *
 * O que o clique faz (banco: teeds_lancamento_controlar 'liberar_geral'):
 * - todo inscrito esperando a live vira GF Member, com acesso até 09/11/2027,
 *   de todos os parceiros, tenha assistido ou não (recusados ficam de fora);
 * - quem já era cliente sai da tranca e as aulas do GF Member abrem;
 * - cada inscrito recebe o e-mail "Seu acesso está liberado" (o servidor manda
 *   20 a cada 30 s).
 * Dá para apertar de novo depois: libera só quem se inscreveu depois.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { controlarLive, painelDaLive, type PainelDaLive } from '../../core/teeds/lancamento'
import { IconeFechar } from '../IconeFechar'
import './lancamento.css'

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(', ', ' às ')

export function LiberarAcessoGeral({ sessao, geral }: { sessao: SessaoTeeds; geral: boolean }) {
  const [p, setP] = useState<PainelDaLive | null>(null)
  const [aberto, setAberto] = useState(false)
  const [liberando, setLiberando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [recado, setRecado] = useState<string | null>(null)

  // o contador relê de 30 em 30 s: sempre com o token mais novo (ele renova a cada hora)
  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao
  const ler = () => painelDaLive(sessaoRef.current).then(setP).catch(() => undefined)
  useEffect(() => {
    void ler()
    const t = window.setInterval(() => void ler(), 30_000)
    return () => window.clearInterval(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function liberar() {
    setLiberando(true); setErro(null)
    try {
      const r = await controlarLive(sessaoRef.current, 'liberar_geral')
      const n = r.liberados ?? 0
      setRecado(n > 0
        ? `${n.toLocaleString('pt-BR')} ${n === 1 ? 'pessoa liberada' : 'pessoas liberadas'} como GF Member. Os e-mails de acesso liberado começam a sair em instantes.`
        : 'Acesso geral liberado. Não havia ninguém novo esperando.')
      setAberto(false)
      await ler()
    } catch (e) { setErro((e as Error).message) } finally { setLiberando(false) }
  }

  // Esc fecha a confirmação (menos no meio da liberação)
  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !liberando) setAberto(false) }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aberto, liberando])

  const liberado = !!p?.liberadoEm
  const esperando = p?.aguardando ?? null
  // quem libera é o admin geral ou quem enxerga todos os parceiros (o banco confere de novo)
  const pode = p ? p.podeControlar !== false : geral

  return (
    <section className={`admin-card lag ${liberado ? 'lag-feito' : ''}`}>
      <div className="lag-texto">
        <span className="rot">Lançamento · só administradores</span>
        <h3>{liberado ? 'Acesso geral liberado' : 'Acesso geral ainda trancado'}</h3>
        <p>{liberado
          ? <>Liberado em <b>{quando(p!.liberadoEm!)}</b>{p?.liberados ? <>, {p.liberados.toLocaleString('pt-BR')} {p.liberados === 1 ? 'pessoa' : 'pessoas'} viraram GF Member</> : null}. Se alguém se inscreveu depois, aperte de novo para liberar só os novos.</>
          : pode
            ? <>Ninguém é liberado sozinho. Quando você apertar, todos os inscritos viram <b>GF Member</b>, com acesso até 09/11/2027, e quem já era cliente sai da tranca.{esperando !== null && <> Hoje são <b>{esperando.toLocaleString('pt-BR')}</b> esperando.</>}</>
            : <>Ninguém é liberado sozinho. Quem aperta o botão é o administrador geral, na hora da live.</>}</p>
        {recado && <p className="lag-ok" role="status">{recado}</p>}
      </div>
      {pode && (
        <button type="button" className={liberado ? 'lag-de-novo' : 'admin-primary lag-botao'} onClick={() => { setErro(null); setAberto(true) }}>
          {liberado ? 'Liberar os novos inscritos' : <><Cadeado />Liberar acesso geral</>}
        </button>
      )}

      {aberto && createPortal(
        <div className="adm-modal-fundo" onMouseDown={() => { if (!liberando) setAberto(false) }}>
          <section className="adm-modal lag-modal" role="dialog" aria-modal="true" aria-labelledby="lag-titulo" onMouseDown={(e) => e.stopPropagation()}>
            <header>
              <h3 id="lag-titulo">{liberado ? 'Liberar os novos inscritos?' : 'Liberar o acesso de todo mundo?'}</h3>
              <button type="button" aria-label="Fechar" disabled={liberando} onClick={() => setAberto(false)}><IconeFechar /></button>
            </header>
            <ul className="lag-lista">
              <li>Todos os inscritos que estão esperando viram <b>GF Member</b>, com acesso até <b>09/11/2027</b>, de todos os parceiros, tenham assistido à live ou não.</li>
              {!liberado && <li>Quem já era cliente sai da tranca, e as aulas do GF Member abrem.</li>}
              <li>Cada inscrito recebe o e-mail <b>“Seu acesso está liberado”</b>. Eles saem aos poucos, em cerca de 20 minutos para todos.</li>
              <li>Cadastros recusados continuam de fora.</li>
              {!liberado && <li>Daqui em diante, quem se cadastrar entra como <b>GF Member</b> para você aprovar, e o plano “Aguardando live” sai da lista.</li>}
            </ul>
            <p className="lag-aviso">Não dá para desfazer por aqui.</p>
            {erro && <p className="lag-erro" role="alert">{erro}</p>}
            <footer>
              <button type="button" className="lag-cancelar" disabled={liberando} onClick={() => setAberto(false)}>Cancelar</button>
              <button type="button" className="admin-primary" disabled={liberando} onClick={() => void liberar()}>{liberando ? 'Liberando…' : 'Sim, liberar agora'}</button>
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </section>
  )
}

function Cadeado() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" /><path d="M8 10.5V7.4a4 4 0 0 1 7.6-1.7" />
    </svg>
  )
}
