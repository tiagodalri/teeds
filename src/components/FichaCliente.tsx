import { useEffect, useMemo, useState } from 'react'
import { lerFichaCliente, type FichaCliente as Ficha } from '../core/teeds/clientes'
import { horasLegiveis, idiomaLegivel, lugarDoFuso } from '../core/teeds/insights'
import { todasAsAulas } from '../core/teeds/aulas'
import { nomeDoRoboNaMarca } from '../core/deriv/strategies'
import { ESTRATEGIAS_LOCAIS } from '../core/deriv/strategies'
import { MARCA } from '../marca'
import type { SessaoTeeds } from '../core/teeds/conta'

/**
 * A vida de um cliente, dentro da ficha do admin.
 *
 * O painel sabia quase tudo sobre a base e quase nada sobre UMA pessoa:
 * quatro números e as contas da corretora. Para atender alguém, faltava o que
 * importa — quando entra, quanto fica, de que aparelho, o que assistiu, quais
 * robôs rodou e como foi, se abriu os e-mails que a casa mandou.
 *
 * Tudo chega de uma consulta só (`teeds_cliente_ficha`), então ou a ficha vem
 * inteira ou vem o aviso. Nada de meia tela com três blocos carregando.
 *
 * Por que em abas: aberto de uma vez isso é uma página de rolagem longa, e
 * quem abre a ficha no meio de um atendimento quer uma resposta, não uma
 * leitura. "Visão geral" responde quem é a pessoa; "Atividade" responde o que
 * ela fez; a edição fica na terceira, longe do clique distraído.
 */

const n = (v: number) => v.toLocaleString('pt-BR')
const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dataHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const soData = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
const diaCurto = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** "há 3 dias", "há 2 h". A pergunta do atendimento é essa, não a data. */
export function haQuantoTempo(iso: string | null | undefined): string {
  if (!iso) return 'nunca'
  const seg = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (seg < 90) return 'agora há pouco'
  if (seg < 3600) return `há ${Math.round(seg / 60)} min`
  if (seg < 86400) return `há ${Math.round(seg / 3600)} h`
  const dias = Math.round(seg / 86400)
  if (dias < 30) return `há ${dias} dia${dias === 1 ? '' : 's'}`
  const meses = Math.round(dias / 30)
  return `há ${meses} ${meses === 1 ? 'mês' : 'meses'}`
}

type Aba = 'geral' | 'atividade'

export function PerfilCliente({ sessao, userId }: { sessao: SessaoTeeds; userId: string }) {
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<Aba>('geral')
  const catalogo = useMemo(() => todasAsAulas(), [])

  useEffect(() => {
    let vivo = true
    setCarregando(true); setErro(null); setFicha(null)
    lerFichaCliente(sessao, userId)
      .then((f) => { if (vivo) { if (f) setFicha(f); else setErro('Esta ficha não está disponível para o seu acesso.') } })
      .catch((e) => { if (vivo) setErro((e as Error).message) })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [sessao.usuario.id, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (carregando) return <div className="fc-carregando">Lendo o histórico…</div>
  if (erro || !ficha) return <div className="fc-aviso">{erro ?? 'Ficha indisponível.'}</div>

  const c = ficha.cliente
  const reais = ficha.contas.filter((x) => x.tipo !== 'demo')
  const saldo = reais.reduce((s, x) => s + x.saldo, 0)
  const maxDia = Math.max(1, ...ficha.acessos.dias.map((d) => d.segundos))
  const lugar = c.fusoHorario ? lugarDoFuso(c.fusoHorario) : null
  const sessaoMedia = c.totalAcessos ? c.tempoTotalSegundos / c.totalAcessos : 0
  const ops = ficha.operacoes.resumo
  const acerto = ops.total ? Math.round((ops.ganhas / ops.total) * 100) : 0
  const nomeRobo = (id: string, cru: string | null) => {
    const e = ESTRATEGIAS_LOCAIS.find((x) => x.id === id)
    return e ? nomeDoRoboNaMarca(e, MARCA) : (cru || id)
  }
  const tituloAula = (id: string) => catalogo.find((a) => a.id === id)?.titulo ?? id

  return (
    <div className="fc">
      <div className="fc-abas" role="tablist" aria-label="Seções da ficha">
        <button role="tab" aria-selected={aba === 'geral'} className={aba === 'geral' ? 'on' : ''} onClick={() => setAba('geral')}>Visão geral</button>
        <button role="tab" aria-selected={aba === 'atividade'} className={aba === 'atividade' ? 'on' : ''} onClick={() => setAba('atividade')}>Atividade</button>
      </div>

      {aba === 'geral' && <>
        <div className="fc-kpis">
          <div><span>Último acesso</span><b>{dataHora(c.vistoEm)}</b><small>{haQuantoTempo(c.vistoEm)}</small></div>
          <div><span>Tempo na plataforma</span><b>{horasLegiveis(c.tempoTotalSegundos)}</b><small>{n(c.totalAcessos)} acesso{c.totalAcessos === 1 ? '' : 's'} · média de {horasLegiveis(sessaoMedia)}</small></div>
          <div><span>Dias com acesso</span><b>{n(ficha.acessos.diasComAcesso)}</b><small>{ficha.acessos.primeiroDia ? `desde ${soData(ficha.acessos.primeiroDia)}` : 'nunca entrou'}</small></div>
          <div className={saldo > 0 ? 'ok' : ''}><span>Saldo real</span><b>{reais.length ? usd(saldo) : '—'}</b><small>{reais.length ? `${reais.length} conta${reais.length === 1 ? '' : 's'} real${reais.length === 1 ? '' : 'is'}` : 'nenhuma conta conectada'}</small></div>
        </div>

        {c.sessaoAtual && <p className="fc-agora">● Está na plataforma agora, há {horasLegiveis(c.sessaoAtualSegundos)}.</p>}

        <section className="fc-bloco">
          <h4>Quem é</h4>
          <dl className="fc-dados">
            <div><dt>E-mail</dt><dd>{c.email || '—'}</dd></div>
            <div><dt>Telefone</dt><dd>{c.telefone || '—'}</dd></div>
            <div><dt>CPF</dt><dd>{c.cpf || '—'}</dd></div>
            <div><dt>Cadastro</dt><dd>{soData(c.criadoEm)} <em>({haQuantoTempo(c.criadoEm)})</em></dd></div>
            <div><dt>Acesso expira</dt><dd>{soData(c.acessoExpiraEm)}</dd></div>
            <div><dt>Região</dt><dd>{lugar ? `${lugar.lugar}${lugar.pais ? ` · ${lugar.pais}` : ''}` : '—'}</dd></div>
            <div><dt>Idioma</dt><dd>{c.idioma ? idiomaLegivel(c.idioma) : '—'}</dd></div>
            <div><dt>Aparelho</dt><dd>{ficha.acessos.porDispositivo.length ? ficha.acessos.porDispositivo.map((d) => `${d.dispositivo} (${n(d.acessos)})`).join(' · ') : '—'}</dd></div>
          </dl>
        </section>

        {ficha.cadastro && <section className="fc-bloco">
          <h4>Como entrou</h4>
          <dl className="fc-dados">
            <div><dt>Pediu cadastro</dt><dd>{dataHora(ficha.cadastro.pedidoEm)}</dd></div>
            <div><dt>Situação</dt><dd>{ficha.cadastro.status}{ficha.cadastro.recadastro ? ' · recadastro' : ''}</dd></div>
            <div><dt>Decidido em</dt><dd>{dataHora(ficha.cadastro.decididoEm)}</dd></div>
            <div><dt>E-mail de boas-vindas</dt><dd>{dataHora(ficha.cadastro.emailCadastroEm)}</dd></div>
            <div><dt>E-mail de aprovação</dt><dd>{dataHora(ficha.cadastro.emailAprovacaoEm)}</dd></div>
          </dl>
        </section>}

        <section className="fc-bloco">
          <h4>Contas na corretora</h4>
          {ficha.contas.length ? <div className="fc-contas">{ficha.contas.map((x) => (
            <div key={x.contaId}>
              <span><b>{x.contaId}</b><small>{x.tipo === 'demo' ? 'Demonstração' : 'Conta real'} · conectada {soData(x.conectadaEm)} · vista {haQuantoTempo(x.vistaEm)}</small></span>
              <strong>{x.moeda || 'USD'} {x.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            </div>
          ))}</div> : <p className="fc-vazio">Nenhuma conta Deriv conectada.</p>}
        </section>

        {ficha.emails && ficha.emails.enviados > 0 && <section className="fc-bloco">
          <h4>E-mails da casa</h4>
          <dl className="fc-dados">
            <div><dt>Recebeu</dt><dd>{n(ficha.emails.enviados)}</dd></div>
            <div><dt>Abriu</dt><dd>{n(ficha.emails.abertos)}{ficha.emails.enviados ? ` de ${n(ficha.emails.enviados)}` : ''}</dd></div>
            <div><dt>Último envio</dt><dd>{dataHora(ficha.emails.ultimoEnvio)}</dd></div>
            <div><dt>Última abertura</dt><dd>{dataHora(ficha.emails.ultimaAbertura)}</dd></div>
          </dl>
          {ficha.emails.descadastrado && <p className="fc-alerta">Pediu para sair da lista. Não envie campanha para esta pessoa.</p>}
        </section>}
      </>}

      {aba === 'atividade' && <>
        <section className="fc-bloco">
          <h4>Quando entra <small>últimos 90 dias · a barra é o tempo de cada dia</small></h4>
          {ficha.acessos.dias.length ? <>
            <div className="fc-barras">
              {ficha.acessos.dias.map((d) => (
                <div key={d.dia} title={`${diaCurto(d.dia)}: ${d.acessos} acesso${d.acessos === 1 ? '' : 's'}, ${horasLegiveis(d.segundos)}${d.dispositivo ? ` · ${d.dispositivo}` : ''}`}>
                  <i style={{ height: `${Math.max(4, (d.segundos / maxDia) * 100)}%` }} />
                </div>
              ))}
            </div>
            <div className="fc-tabela fc-dias">
              <div className="cab"><span>Dia</span><span>Acessos</span><span>Tempo</span><span>Aparelho</span></div>
              {[...ficha.acessos.dias].reverse().slice(0, 12).map((d) => (
                <div className="linha" key={d.dia}><span>{soData(d.dia)}</span><span>{n(d.acessos)}</span><span>{horasLegiveis(d.segundos)}</span><span>{d.dispositivo || '—'}</span></div>
              ))}
            </div>
          </> : <p className="fc-vazio">Nunca entrou na plataforma.</p>}
        </section>

        <section className="fc-bloco">
          <h4>Robôs <small>todas as sessões, desde sempre</small></h4>
          {ficha.robos.porRobo.length ? <div className="fc-tabela fc-robos">
            <div className="cab"><span>Robô</span><span>Sessões</span><span>Operações</span><span>Acerto</span><span>Resultado</span><span>Última vez</span></div>
            {ficha.robos.porRobo.map((r) => (
              <div className="linha" key={r.roboId}>
                <span><b>{nomeRobo(r.roboId, r.roboNome)}</b>{r.sessoesDemo > 0 && <small>{n(r.sessoesDemo)} em demonstração</small>}</span>
                <span>{n(r.sessoes)}</span>
                <span>{n(r.operacoes)}</span>
                <span>{r.operacoes ? `${Math.round((r.ganhas / r.operacoes) * 100)}%` : '—'}</span>
                <span className={r.resultado > 0 ? 'ok' : r.resultado < 0 ? 'ruim' : ''}>{usd(r.resultado)}</span>
                <span>{haQuantoTempo(r.ultimaVez)}</span>
              </div>
            ))}
          </div> : <p className="fc-vazio">Nunca ligou um robô.</p>}
        </section>

        {ficha.robos.ultimas.length > 0 && <section className="fc-bloco">
          <h4>Últimas sessões</h4>
          <div className="fc-tabela fc-sessoes">
            <div className="cab"><span>Quando</span><span>Robô</span><span>Conta</span><span>Operações</span><span>Resultado</span><span>Como terminou</span></div>
            {ficha.robos.ultimas.map((s, i) => (
              <div className="linha" key={i}>
                <span>{dataHora(s.criadaEm)}</span>
                <span>{nomeRobo(s.roboId, s.roboNome)}</span>
                <span>{s.demo ? 'demo' : 'real'}</span>
                <span>{n(s.operacoes)} <small>{n(s.ganhas)}✓ {n(s.perdidas)}✕</small></span>
                <span className={s.resultado > 0 ? 'ok' : s.resultado < 0 ? 'ruim' : ''}>{usd(s.resultado)}</span>
                {/* O motivo real vem longo ("a Deriv recusou a compra — [InsufficientBalance]…").
                   A coluna corta, e o texto inteiro fica no hover: truncar sem guardar
                   o original esconde justamente a explicação que se foi buscar. */}
                <span title={s.motivoDaParada || s.situacao}>{s.motivoDaParada || s.situacao}</span>
              </div>
            ))}
          </div>
        </section>}

        <section className="fc-bloco">
          <h4>Operações <small>90 dias</small></h4>
          <div className="fc-kpis compacto">
            <div><span>Operações</span><b>{n(ops.total)}</b><small>{n(ops.reais)} em conta real</small></div>
            <div><span>Acerto</span><b>{ops.total ? `${acerto}%` : '—'}</b><small>{n(ops.ganhas)} ganhas</small></div>
            <div className={ops.resultadoReal >= 0 ? 'ok' : 'ruim'}><span>Resultado real</span><b>{usd(ops.resultadoReal)}</b><small>demo fora da conta</small></div>
            <div><span>Markup real</span><b>{usd(ops.markupReal)}</b><small>o que a casa ganhou</small></div>
          </div>
          {ficha.operacoes.ultimas.length > 0 && <div className="fc-tabela fc-ops">
            <div className="cab"><span>Quando</span><span>Robô</span><span>Entrada</span><span>Dígito</span><span>Resultado</span><span>Markup</span></div>
            {ficha.operacoes.ultimas.map((o, i) => (
              <div className={`linha ${o.ganhou ? '' : 'perdeu'}`} key={i}>
                <span>{dataHora(o.executadaEm)}</span>
                <span>{o.roboNome || '—'}{o.demo && <small>demo</small>}</span>
                <span>{usd(o.entrada)}</span>
                <span>{o.digitoSaida ?? '—'}</span>
                <span className={o.ganhou ? 'ok' : 'ruim'}>{usd(o.resultado)}</span>
                <span>{usd(o.markup)}</span>
              </div>
            ))}
          </div>}
        </section>

        <section className="fc-bloco">
          <h4>Aulas</h4>
          {ficha.aulas.length ? <div className="fc-tabela fc-aulas">
            <div className="cab"><span>Aula</span><span>Aberturas</span><span>Tempo</span><span>Até onde</span><span>Última vez</span></div>
            {ficha.aulas.map((a) => (
              <div className="linha" key={a.aulaId}>
                <span><b>{tituloAula(a.aulaId)}</b>{a.concluida && <small>concluída</small>}</span>
                <span>{n(a.aberturas)}</span>
                <span>{horasLegiveis(a.segundos)}</span>
                <span><i className="fc-prog"><u style={{ width: `${Math.round(a.posicaoMax * 100)}%` }} /></i>{Math.round(a.posicaoMax * 100)}%</span>
                <span>{haQuantoTempo(a.ultimaVez)}</span>
              </div>
            ))}
          </div> : <p className="fc-vazio">Nunca abriu uma aula.</p>}
        </section>
      </>}
    </div>
  )
}
