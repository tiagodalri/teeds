/**
 * Administração › Transmissão ao vivo (12/11/2026, Tiago: "no menu de ADM, uma opção pra eu colocar um
 * link da transmissão ao vivo... para os próprios adms fazerem isso").
 *
 * Cola o link (Google Meet, YouTube, Zoom…), aperta Iniciar: em até 30 s todo mundo que está na
 * plataforma vê o popup "a nossa transmissão ao vivo começou" com o botão para entrar, e o Ao vivo
 * do menu pisca em vermelho. Trocar o link no meio faz o popup voltar para todos. Encerrar tira do ar
 * (e se ninguém encerrar, ela sai sozinha 6 horas depois). Admin geral e admins de parceiro com
 * acesso total.
 */
import { useEffect, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { abrirAvisoDaLive, linkDaLive } from '../../core/teeds/lancamento'
import { controlarTransmissao, ondeEhATransmissao, painelDaTransmissao, type AcaoDaTransmissao, type PainelDaTransmissao } from '../../core/teeds/transmissao'
import './lancamento.css'

const hora = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export function AdminTransmissao({ sessao }: { sessao: SessaoTeeds }) {
  const [p, setP] = useState<PainelDaTransmissao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [recado, setRecado] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const [ocupado, setOcupado] = useState<AcaoDaTransmissao | null>(null)
  const [confirmar, setConfirmar] = useState(false)

  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao
  async function ler() {
    try {
      const d = await painelDaTransmissao(sessaoRef.current)
      setP(d); setErro(null)
      // no ar, o campo começa com o link que está valendo
      setLink((l) => l || (d.noAr ? d.link ?? '' : ''))
    } catch (e) { setErro((e as Error).message) }
  }
  useEffect(() => {
    void ler()
    // outro admin pode iniciar ou encerrar: relê de 20 em 20 s com a aba aberta
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void ler() }, 20_000)
    return () => window.clearInterval(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fazer(acao: AcaoDaTransmissao) {
    setOcupado(acao); setRecado(null); setErro(null)
    try {
      const d = await controlarTransmissao(sessaoRef.current, acao, acao === 'encerrar' ? undefined : link.trim())
      setP(d); setConfirmar(false)
      if (acao === 'iniciar') setRecado('Transmissão no ar. Em até 30 segundos o popup aparece para todos na plataforma e o Ao vivo do menu começa a piscar.')
      if (acao === 'trocar_link') setRecado('Link trocado. O popup volta a aparecer para todos com o link novo, inclusive para quem tinha fechado.')
      if (acao === 'encerrar') { setRecado('Transmissão encerrada. Em até 30 segundos o popup sai e o menu volta ao normal para todos.'); setLink('') }
    } catch (e) { setErro((e as Error).message) } finally { setOcupado(null) }
  }

  const noAr = !!p?.noAr
  const valido = !!linkDaLive(link) && /^https?:\/\//i.test(link.trim())
  const mesmoLink = noAr && link.trim() === (p?.link ?? '')
  const onde = ondeEhATransmissao(link.trim())

  return (
    <div className="adm-lanc">
      <div className="adm-kpis">
        <article className={noAr ? 'ok' : ''}><span>Situação</span><strong>{p ? (noAr ? 'No ar' : 'Fora do ar') : '—'}</strong><small>{noAr ? `Desde ${hora(p?.iniciadaEm ?? null)}${p?.iniciadaPor ? `, por ${p.iniciadaPor}` : ''}` : p?.encerradaEm ? `Última encerrada em ${hora(p.encerradaEm)}` : 'Nenhuma transmissão ainda'}</small></article>
        <article><span>Sai sozinha</span><strong>{noAr ? hora(p?.saiSozinhaEm ?? null).split(' ')[1] ?? '—' : '—'}</strong><small>{noAr ? 'Se ninguém encerrar antes' : '6 horas depois de iniciar'}</small></article>
      </div>

      {erro && <p className="adm-lanc-erro" role="alert">{erro}</p>}
      {recado && <p className="adm-lanc-ok" role="status">{recado}</p>}

      <section className="admin-card">
        <header><div><span className="rot">1 · Link</span><h3>{noAr ? 'Link que está no ar' : 'Link da transmissão'}</h3></div></header>
        <p className="adm-lanc-texto">Cole o link da transmissão: <b>Google Meet</b>, <b>YouTube</b>, <b>Zoom</b> ou qualquer endereço que comece com <b>https://</b>. Ao apertar <b>Iniciar transmissão</b>, todo mundo que está na plataforma (e quem entrar depois) vê um aviso com o botão <b>Clique aqui para entrar</b>, e o <b>Ao vivo</b> do menu fica piscando em vermelho. Quem fecha o aviso consegue abrir de novo pelo Ao vivo do menu.</p>
        <div className="adm-lanc-linha">
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet.google.com/…" aria-label="Link da transmissão" aria-invalid={!!link.trim() && !valido} />
          {!noAr && <button className="admin-primary" disabled={!valido || ocupado !== null} onClick={() => void fazer('iniciar')}>{ocupado === 'iniciar' ? 'Iniciando…' : 'Iniciar transmissão'}</button>}
          {noAr && <button className="admin-primary" disabled={!valido || mesmoLink || ocupado !== null} onClick={() => void fazer('trocar_link')}>{ocupado === 'trocar_link' ? 'Trocando…' : 'Trocar o link'}</button>}
        </div>
        {!!link.trim() && !valido && <small className="adm-lanc-erro">Esse link não é um endereço válido (comece com https://).</small>}
        {valido && onde && !mesmoLink && <small className="adm-lanc-texto">O aviso vai dizer: “Clique no botão para entrar na transmissão pelo {onde}”.</small>}
      </section>

      <section className="admin-card">
        <header><div><span className="rot">2 · No ar</span><h3>{noAr ? 'A transmissão está no ar' : 'Nenhuma transmissão no ar'}</h3></div></header>
        <dl className="adm-lanc-dados">
          <div><dt>Iniciada</dt><dd>{noAr ? `${hora(p?.iniciadaEm ?? null)}${p?.iniciadaPor ? ` · ${p.iniciadaPor}` : ''}` : '—'}</dd></div>
          <div><dt>Link trocado</dt><dd>{noAr ? hora(p?.linkTrocadoEm ?? null) : '—'}</dd></div>
          <div><dt>Última encerrada</dt><dd>{p?.encerradaEm ? `${hora(p.encerradaEm)}${p.encerradaPor ? ` · ${p.encerradaPor}` : ''}` : '—'}</dd></div>
        </dl>
        {noAr && <div className="adm-lanc-botoes">
          <button disabled={ocupado !== null} onClick={() => abrirAvisoDaLive()}>Ver o aviso como o cliente</button>
          {!confirmar && <button className="admin-primary" disabled={ocupado !== null} onClick={() => setConfirmar(true)}>Encerrar transmissão</button>}
          {confirmar && (
            <span className="adm-lanc-confirma">
              <b>Encerrar tira o aviso e o Ao vivo piscando para todos.</b>
              <button className="admin-primary" disabled={ocupado !== null} onClick={() => void fazer('encerrar')}>{ocupado === 'encerrar' ? 'Encerrando…' : 'Confirmar'}</button>
              <button onClick={() => setConfirmar(false)}>Cancelar</button>
            </span>
          )}
        </div>}
        {!noAr && <p className="adm-lanc-texto">Depois de encerrar, o aviso some em até 30 segundos para quem está com a plataforma aberta. Se alguém esquecer de encerrar, ela sai do ar sozinha <b>6 horas</b> depois de iniciada.</p>}
      </section>
    </div>
  )
}
