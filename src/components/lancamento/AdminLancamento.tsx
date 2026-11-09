/**
 * Administração › Live de lançamento (GlobalFly, funil de 02/11/2026).
 *
 * O controle da live de 09/11: o link do YouTube que aparece dentro da
 * plataforma, começar, encerrar e liberar, e os números ao vivo (inscritos
 * esperando, assistindo agora, quem já está "até o fim"). Só o admin geral.
 *
 * Encerrar = só marcar o fim da live. A liberação é o botão "Liberar acesso
 * geral", em Administração › Clientes (08/11/2026, Tiago). Se ninguém
 * encerrar, o servidor fecha a live sozinho 3 horas depois do horário marcado.
 */
import { useEffect, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { controlarLive, idDoYoutube, linkDaLive, LIVE_POR_FORA, painelDaLive, type AcaoDaLive, type PainelDaLive } from '../../core/teeds/lancamento'
import './lancamento.css'

const hora = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export function AdminLancamento({ sessao }: { sessao: SessaoTeeds }) {
  const [p, setP] = useState<PainelDaLive | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [recado, setRecado] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const [ocupado, setOcupado] = useState<AcaoDaLive | null>(null)
  const [confirmar, setConfirmar] = useState(false)

  // relê de 15 em 15 s: sempre com o token mais novo (ele renova a cada hora)
  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao
  async function ler() {
    try { const d = await painelDaLive(sessaoRef.current); setP(d); setErro(null); setLink((l) => l || d.youtube || '') } catch (e) { setErro((e as Error).message) }
  }
  useEffect(() => {
    void ler()
    // aba escondida não relê (o painel soma todas as presenças: é uma consulta cara); ao voltar, relê na hora
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void ler() }, 15_000)
    const aoVoltar = () => { if (document.visibilityState === 'visible') void ler() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', aoVoltar) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fazer(acao: AcaoDaLive, valor?: string) {
    setOcupado(acao); setRecado(null); setErro(null)
    try {
      const r = await controlarLive(sessaoRef.current, acao, valor)
      if (acao === 'encerrar') setRecado('Live encerrada. Para liberar o acesso, use "Liberar acesso geral" em Clientes.')
      if (acao === 'youtube') setRecado(valor ? (LIVE_POR_FORA ? 'Link salvo. Em até 20 s ele aparece no aviso da live e em globalflytrade.com/live.' : 'Link salvo. Ele aparece na plataforma assim que a live estiver no ar.') : 'Link removido.')
      if (acao === 'comecar') setRecado('Live no ar: o aviso abriu para todos os inscritos e a presença começou a contar.')
      setConfirmar(false)
      await ler()
    } catch (e) { setErro((e as Error).message) } finally { setOcupado(null) }
  }

  // 09/11/2026: a transmissão é fora da plataforma: vale qualquer endereço http(s)
  const linkValido = !link.trim() || (LIVE_POR_FORA ? !!linkDaLive(link) : !!idDoYoutube(link))
  const encerrada = !!p?.terminouEm
  // o admin de um parceiro só (ex.: o Naor) acompanha, mas não comanda a live de todos (09/11/2026)
  const pode = p?.podeControlar !== false

  return (
    <div className="adm-lanc">
      <div className="adm-kpis">
        <article><span>Inscritos esperando</span><strong>{p?.aguardando ?? '—'}</strong><small>Plataforma trancada até a live</small></article>
        <article className={p?.noAr ? 'ok' : ''}><span>Assistindo agora</span><strong>{p?.noAr ? p.assistindoAgora : '—'}</strong><small>{p?.noAr ? 'Presença no último minuto' : 'Conta quando a live estiver no ar'}</small></article>
        <article><span>Assistiram</span><strong>{p?.assistiram ?? '—'}</strong><small>{p?.total ? `${p.total} min de live até agora` : 'Ainda sem live'}</small></article>
        <article className="alerta"><span>Ficaram até o fim</span><strong>{p?.ficaram ?? '—'}</strong><small>{p ? `Viraram GF Member: ${p.liberados ?? 0}` : ''}</small></article>
      </div>

      {!pode && <p className="adm-lanc-ok" role="status">Você acompanha os números da live. O link, o começo, o fim e a liberação ficam com o administrador geral.</p>}
      {erro && <p className="adm-lanc-erro" role="alert">{erro}</p>}
      {recado && <p className="adm-lanc-ok" role="status">{recado}</p>}

      <section className="admin-card">
        <header><div><span className="rot">1 · Transmissão</span><h3>{LIVE_POR_FORA ? 'Link da live' : 'Link da live no YouTube'}</h3></div></header>
        {LIVE_POR_FORA
          ? <p className="adm-lanc-texto">A transmissão é <b>fora da plataforma</b>. Cole aqui o link da live e salve: em até 20&nbsp;s ele aparece no aviso de tela cheia que todos (menos os administradores) veem a partir das 19h40, no botão <b>Entrar na live ao vivo</b>, e na página <b>globalflytrade.com/live</b>, para onde vão os e-mails e os avisos no celular. O aviso sai quando você aperta <b>Encerrar a live</b> (ou às 23h). Para ver o aviso como o cliente vê, abra a GlobalFly com <b>?ver=aviso-da-live</b>.</p>
          : <p className="adm-lanc-texto">Crie a live no YouTube como <b>não listada</b> e cole o link aqui. Ela passa dentro da GlobalFly, com o chat, e a presença de cada inscrito é marcada sozinha.</p>}
        <div className="adm-lanc-linha">
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder={LIVE_POR_FORA ? 'https://…' : 'https://www.youtube.com/live/…'} aria-label="Link da live" aria-invalid={!linkValido} disabled={!pode} />
          <button className="admin-primary" disabled={!pode || !linkValido || ocupado !== null || (link.trim() || null) === (p?.youtube ?? null)} onClick={() => void fazer('youtube', link.trim())}>{ocupado === 'youtube' ? 'Salvando…' : 'Salvar link'}</button>
        </div>
        {!linkValido && <small className="adm-lanc-erro">{LIVE_POR_FORA ? 'Esse link não é um endereço válido (comece com https://).' : 'Esse link não é de um vídeo do YouTube.'}</small>}
      </section>

      <section className="admin-card">
        <header><div><span className="rot">2 · Ao vivo</span><h3>{p?.noAr ? 'A live está no ar' : encerrada ? 'A live terminou' : 'A live ainda não começou'}</h3></div></header>
        <dl className="adm-lanc-dados">
          <div><dt>Marcada para</dt><dd>{hora(p?.inicioPrevisto ?? null)}</dd></div>
          <div><dt>Começou</dt><dd>{hora(p?.comecouEm ?? null)}</dd></div>
          <div><dt>Terminou</dt><dd>{hora(p?.terminouEm ?? null)}</dd></div>
          <div><dt>Liberação</dt><dd>{hora(p?.liberadoEm ?? null)}</dd></div>
          <div><dt>Até o fim é</dt><dd>{p?.minimoPct ?? 80}% da live, com os últimos 10&nbsp;min</dd></div>
        </dl>
        <p className="adm-lanc-texto">Às 20h de 09/11 a live entra no ar sozinha. Use <b>Começar agora</b> se for abrir antes. <b>Ninguém é liberado sozinho:</b> o acesso abre quando um administrador aperta <b>Liberar acesso geral</b>, em Clientes. Aí todos os inscritos viram GF Member, com acesso até 09/11/2027, mesmo quem não assistiu, e a live continua no ar para quem está vendo. <b>Encerrar a live</b> só marca o fim, sem liberar ninguém.</p>
        {pode && <div className="adm-lanc-botoes">
          {!p?.noAr && <button className="admin-primary" disabled={ocupado !== null} onClick={() => void fazer('comecar')}>{ocupado === 'comecar' ? 'Abrindo…' : encerrada ? 'Começar de novo' : 'Começar agora'}</button>}
          {p?.noAr && !confirmar && <button className="admin-primary" disabled={ocupado !== null} onClick={() => setConfirmar(true)}>Encerrar a live</button>}
          {p?.noAr && confirmar && (
            <span className="adm-lanc-confirma">
              <b>Encerrar tira a live do ar para todos. Não libera ninguém.</b>
              <button className="admin-primary" disabled={ocupado !== null} onClick={() => void fazer('encerrar')}>{ocupado === 'encerrar' ? 'Encerrando…' : 'Confirmar'}</button>
              <button onClick={() => setConfirmar(false)}>Cancelar</button>
            </span>
          )}
          {encerrada && <button disabled={ocupado !== null} onClick={() => void fazer('retomar')}>Voltar ao ar</button>}
        </div>}
      </section>

      <section className="admin-card">
        <header><div><span className="rot">3 · Cuidados</span><h3>Até a live</h3></div></header>
        <ul className="adm-lanc-lista">
          <li>A liberação é o botão <b>Liberar acesso geral</b>, em Clientes: aperte com o filtro do topo em <b>Todos</b>.</li>
          <li>Para ver a plataforma como o inscrito vê, abra a GlobalFly com <b>?ver=inscrito</b> no fim do endereço.</li>
          <li>{LIVE_POR_FORA ? 'Depois de salvar o link, abra globalflytrade.com/live numa aba anônima para conferir que ele leva à transmissão.' : 'Teste o link do YouTube antes com uma live de teste não listada.'}</li>
        </ul>
      </section>
    </div>
  )
}
