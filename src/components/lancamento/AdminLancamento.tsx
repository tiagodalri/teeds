/**
 * Administração › Live de lançamento (GlobalFly, funil de 02/11/2026).
 *
 * O controle da live de 09/11: o link do YouTube que aparece dentro da
 * plataforma, começar, encerrar e liberar, e os números ao vivo (inscritos
 * esperando, assistindo agora, quem já está "até o fim"). Só o admin geral.
 *
 * Encerrar = marcar o fim da live e liberar na hora quem ficou até o fim (GF
 * Member, sem aprovação manual). Se ninguém encerrar, o servidor fecha sozinho
 * 3 horas depois do horário marcado.
 */
import { useEffect, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { controlarLive, idDoYoutube, painelDaLive, type AcaoDaLive, type PainelDaLive } from '../../core/teeds/lancamento'
import './lancamento.css'

const hora = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export function AdminLancamento({ sessao }: { sessao: SessaoTeeds }) {
  const [p, setP] = useState<PainelDaLive | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [recado, setRecado] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const [ocupado, setOcupado] = useState<AcaoDaLive | null>(null)
  const [confirmar, setConfirmar] = useState(false)

  async function ler() {
    try { const d = await painelDaLive(sessao); setP(d); setErro(null); setLink((l) => l || d.youtube || '') } catch (e) { setErro((e as Error).message) }
  }
  useEffect(() => {
    void ler()
    const t = window.setInterval(() => void ler(), 15_000)
    return () => window.clearInterval(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fazer(acao: AcaoDaLive, valor?: string) {
    setOcupado(acao); setRecado(null); setErro(null)
    try {
      const r = await controlarLive(sessao, acao, valor)
      if (acao === 'encerrar' || acao === 'liberar') setRecado(`${r.liberados ?? 0} ${r.liberados === 1 ? 'pessoa liberada' : 'pessoas liberadas'} como GF Member. O e-mail de acesso liberado sai em instantes.`)
      if (acao === 'youtube') setRecado(valor ? 'Link salvo. Ele aparece na plataforma assim que a live estiver no ar.' : 'Link removido.')
      if (acao === 'comecar') setRecado('Live no ar: o aviso abriu para todos os inscritos e a presença começou a contar.')
      setConfirmar(false)
      await ler()
    } catch (e) { setErro((e as Error).message) } finally { setOcupado(null) }
  }

  const linkValido = !link.trim() || !!idDoYoutube(link)
  const encerrada = !!p?.terminouEm

  return (
    <div className="adm-lanc">
      <div className="adm-kpis">
        <article><span>Inscritos esperando</span><strong>{p?.aguardando ?? '—'}</strong><small>Plataforma trancada até a live</small></article>
        <article className={p?.noAr ? 'ok' : ''}><span>Assistindo agora</span><strong>{p?.noAr ? p.assistindoAgora : '—'}</strong><small>{p?.noAr ? 'Presença no último minuto' : 'Conta quando a live estiver no ar'}</small></article>
        <article><span>Assistiram</span><strong>{p?.assistiram ?? '—'}</strong><small>{p?.total ? `${p.total} min de live até agora` : 'Ainda sem live'}</small></article>
        <article className="alerta"><span>Ficaram até o fim</span><strong>{p?.ficaram ?? '—'}</strong><small>{p ? `Viraram GF Member: ${p.liberados ?? 0}` : ''}</small></article>
      </div>

      {erro && <p className="adm-lanc-erro" role="alert">{erro}</p>}
      {recado && <p className="adm-lanc-ok" role="status">{recado}</p>}

      <section className="admin-card">
        <header><div><span className="rot">1 · Transmissão</span><h3>Link da live no YouTube</h3></div></header>
        <p className="adm-lanc-texto">Crie a live no YouTube como <b>não listada</b> e cole o link aqui. Ela passa dentro da GlobalFly, com o chat, e a presença de cada inscrito é marcada sozinha.</p>
        <div className="adm-lanc-linha">
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.youtube.com/live/…" aria-label="Link da live no YouTube" aria-invalid={!linkValido} />
          <button className="admin-primary" disabled={!linkValido || ocupado !== null || (link.trim() || null) === (p?.youtube ?? null)} onClick={() => void fazer('youtube', link.trim())}>{ocupado === 'youtube' ? 'Salvando…' : 'Salvar link'}</button>
        </div>
        {!linkValido && <small className="adm-lanc-erro">Esse link não é de um vídeo do YouTube.</small>}
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
        <p className="adm-lanc-texto">Às 20h de 09/11 a live entra no ar sozinha. Use <b>Começar agora</b> se for abrir antes. No fim, <b>Encerrar e liberar</b> marca o fim e transforma em GF Member quem ficou até o fim.</p>
        <div className="adm-lanc-botoes">
          {!p?.noAr && <button className="admin-primary" disabled={ocupado !== null} onClick={() => void fazer('comecar')}>{ocupado === 'comecar' ? 'Abrindo…' : encerrada ? 'Começar de novo' : 'Começar agora'}</button>}
          {p?.noAr && !confirmar && <button className="admin-primary" disabled={ocupado !== null} onClick={() => setConfirmar(true)}>Encerrar e liberar</button>}
          {p?.noAr && confirmar && (
            <span className="adm-lanc-confirma">
              <b>Encerrar agora libera {p.ficaram} {p.ficaram === 1 ? 'pessoa' : 'pessoas'}.</b>
              <button className="admin-primary" disabled={ocupado !== null} onClick={() => void fazer('encerrar')}>{ocupado === 'encerrar' ? 'Liberando…' : 'Confirmar'}</button>
              <button onClick={() => setConfirmar(false)}>Cancelar</button>
            </span>
          )}
          {encerrada && <button disabled={ocupado !== null} onClick={() => void fazer('liberar')}>{ocupado === 'liberar' ? 'Liberando…' : 'Liberar de novo quem ficou'}</button>}
          {encerrada && !p?.liberadoEm && <button disabled={ocupado !== null} onClick={() => void fazer('retomar')}>Voltar ao ar</button>}
        </div>
      </section>

      <section className="admin-card">
        <header><div><span className="rot">3 · Cuidados</span><h3>Até a live</h3></div></header>
        <ul className="adm-lanc-lista">
          <li>Não aprove cadastros da GlobalFly pela aba Clientes: aprovar libera tudo na hora e pula a live.</li>
          <li>Para ver a plataforma como o inscrito vê, abra a GlobalFly com <b>?ver=inscrito</b> no fim do endereço.</li>
          <li>Teste o link do YouTube antes com uma live de teste não listada.</li>
        </ul>
      </section>
    </div>
  )
}
