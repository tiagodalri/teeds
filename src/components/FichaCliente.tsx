import { useEffect, useMemo, useState } from 'react'
import { lerFichaCliente, lerRastroCliente, type FichaCliente as Ficha, type RastroCliente } from '../core/teeds/clientes'
import { horasLegiveis, idiomaLegivel, lugarDoFuso } from '../core/teeds/insights'
import { todasAsAulas } from '../core/teeds/aulas'
import { ESTRATEGIAS_LOCAIS, nomeDoRoboNaMarca } from '../core/deriv/strategies'
import { MARCA } from '../marca'
import type { SessaoTeeds } from '../core/teeds/conta'
import { aparelhoLegivel, dataEHora, historicoDeAceites, type HistoricoDeAceites } from '../core/teeds/termos'
import { NomeDoRobo } from './NomeDoRobo'

/**
 * A vida inteira de um cliente, dentro da ficha do admin.
 *
 * O painel sabia quase tudo sobre a base e quase nada sobre UMA pessoa. Agora
 * sabe: cadastro, comportamento na plataforma, contas na corretora, extrato,
 * operações, robôs, markup, aulas e cada e-mail que a casa mandou — com a
 * linha do tempo de entrega, abertura e clique de cada um.
 *
 * Tudo chega de UMA consulta (`teeds_cliente_ficha`), então ou a ficha vem
 * inteira ou vem o aviso. Nada de meia tela com dez blocos carregando.
 *
 * Quatro abas porque aberto de uma vez isto é uma página de rolagem sem fim,
 * e quem abre a ficha no meio de um atendimento quer uma resposta. Cada aba
 * responde uma pergunta: quem é · quanto rendeu · o que operou · como se
 * comporta.
 */

const n = (v: number) => v.toLocaleString('pt-BR')
const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const usd4 = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const dataHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const soData = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
const diaCurto = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Valor cru do banco ("ativo", "celular") com a primeira letra maiúscula, como todo rótulo da casa. */
const rotulo = (v?: string | null) => (v ? v[0].toUpperCase() + v.slice(1) : '—')

/** "há 3 dias", "há 2 h". A pergunta do atendimento é essa, não a data seca. */
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

/** O vocabulário do Resend, em português de gente. */
const EVENTO: Record<string, string> = {
  sent: 'saiu daqui', delivered: 'entregue', opened: 'aberto', clicked: 'clicou no link',
  bounced: 'voltou', complained: 'marcou como spam', delivery_delayed: 'entrega atrasada',
  suppressed: 'bloqueado pelo provedor',
}
/**
 * O nome de cada origem, em português, e os apps que a Deriv conhece.
 *
 * A conta Deriv é do cliente: ele pode operar pela Teeds, pela OMNI, pelo bot
 * da própria Deriv ou por qualquer robô do mercado. Saber QUAL app comprou é
 * o que separa receita de curiosidade.
 */
const ORIGEM: Record<string, string> = {
  externo: 'Fora da plataforma', 'sem-dono': 'Sem dono identificado',
  teeds: 'Teeds', omni: 'OMNI', globalfly: 'GlobalFly',
}
const APP: Record<string, string> = {
  bot_deriv_com: 'bot da própria Deriv', deriv_com: 'site da Deriv', dtrader: 'DTrader da Deriv',
}
const nomeDaOrigem = (o: string) => ORIGEM[o] ?? o
const nomeDoApp = (a: string) => APP[a] ?? a

/** O id interno da tela vira o nome que a pessoa vê no menu. */
const TELA: Record<string, string> = {
  operar: 'Manual', robos: MARCA.menu?.nomes?.robos ?? 'Robôs', assistente: 'Assistente', gerenciamento: 'Gerenciamento',
  marketplace: 'Marketplace', aulas: 'Aulas', gestao: 'Administração',
  insights: 'Insights', monitoramento: 'Monitoramento', desconhecida: 'Não identificada',
}
const nomeDaTela = (t: string) => TELA[t] ?? t

const TOM: Record<string, string> = {
  clicado: 'bom', aberto: 'bom', entregue: 'neutro', enviado: 'neutro',
  atrasado: 'atencao', voltou: 'ruim', reclamou: 'ruim', falhou: 'ruim', suprimido: 'ruim',
}

type Aba = 'geral' | 'dinheiro' | 'operacoes' | 'comportamento'
const ABAS: Array<[Aba, string]> = [
  ['geral', 'Visão geral'], ['dinheiro', 'Dinheiro'],
  ['operacoes', 'Operações'], ['comportamento', 'Comportamento'],
]

/*
  Termos de uso (27/10/2026, Tiago: "no perfil de cada cliente mostrar: aceitou
  os termos pela primeira vez na data tal, à hora tal"). Lê o histórico gravado
  no banco (termos_aceites_eventos): data, hora, IP e aparelho carimbados pelo
  servidor. É a prova do aceite, à mão do admin.
*/
function AceitesDosTermos({ sessao, userId }: { sessao: SessaoTeeds; userId: string }) {
  const [h, setH] = useState<HistoricoDeAceites | null>(null)
  const [erro, setErro] = useState(false)
  const [lista, setLista] = useState(false)
  useEffect(() => {
    let vivo = true
    setH(null); setErro(false)
    historicoDeAceites(sessao.token, userId).then((r) => { if (vivo) setH(r) }).catch(() => { if (vivo) setErro(true) })
    return () => { vivo = false }
  }, [sessao.token, userId])
  const tipo = (t: string) => (t === 'primeiro_acesso' ? 'Primeiro acesso' : 'Login')
  return (
    <section className="fc-bloco">
      <h4>Termos de uso</h4>
      {erro ? <p className="fc-vazio">Não foi possível ler os aceites agora.</p>
        : !h ? <p className="fc-vazio">Lendo os aceites…</p>
        : !h.primeiro ? <p className="fc-vazio">Ainda não aceitou os termos. O aceite é pedido no próximo acesso.</p>
        : <>
          <dl className="fc-dados">
            <div><dt>Aceitou pela primeira vez</dt><dd>{dataEHora(h.primeiro.aceitoEm)} <em>(versão {h.primeiro.versao})</em></dd></div>
            <div><dt>De onde</dt><dd>{h.primeiro.ip ? `IP ${h.primeiro.ip} · ` : ''}{aparelhoLegivel(h.primeiro.aparelho)}</dd></div>
            <div><dt>Último aceite</dt><dd>{dataEHora(h.ultimo!.aceitoEm)} <em>({tipo(h.ultimo!.tipo).toLowerCase()})</em></dd></div>
            <div><dt>Declarou 18 anos ou mais</dt><dd>{h.eventos.some((ev) => ev.maioridade) ? `Sim, em ${dataEHora(h.eventos.find((ev) => ev.maioridade)!.aceitoEm)}` : 'Ainda não (é pedido no próximo login)'}</dd></div>
            <div><dt>Aceites registrados</dt><dd>{h.total} {h.total === 1 ? 'vez' : 'vezes'}
              {h.total > 1 && <button type="button" className="fc-link" onClick={() => setLista((x) => !x)}>{lista ? 'esconder' : 'ver todos'}</button>}</dd></div>
          </dl>
          {lista && <div className="fc-tabela fc-aceites">
            <div className="cab"><span>Quando</span><span>Como</span><span>Versão</span><span>De onde</span></div>
            {[...h.eventos].reverse().map((ev, i) => (
              <div className="linha" key={i}><span>{dataEHora(ev.aceitoEm)}</span><span>{tipo(ev.tipo)}{ev.maioridade ? ' · 18+' : ''}</span><span>{ev.versao}</span><span>{ev.ip ? `${ev.ip} · ` : ''}{aparelhoLegivel(ev.aparelho)}</span></div>
            ))}
          </div>}
        </>}
    </section>
  )
}

export function PerfilCliente({ sessao, userId }: { sessao: SessaoTeeds; userId: string }) {
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<Aba>('geral')
  const [emailAberto, setEmailAberto] = useState<number | null>(null)
  const [rastro, setRastro] = useState<RastroCliente | null>(null)
  const catalogo = useMemo(() => todasAsAulas(), [])

  useEffect(() => {
    let vivo = true
    setCarregando(true); setErro(null); setFicha(null); setAba('geral'); setRastro(null)
    // O rastro vem à parte: só a aba de comportamento usa, e a ficha já é
    // pesada. Falha dele não derruba a ficha.
    lerRastroCliente(sessao, userId).then((r) => { if (vivo) setRastro(r) }).catch(() => {})
    lerFichaCliente(sessao, userId)
      .then((f) => { if (vivo) { if (f) setFicha(f); else setErro('Esta ficha não está disponível para o seu acesso.') } })
      .catch((e) => { if (vivo) setErro((e as Error).message) })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [sessao.usuario.id, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (carregando) return <div className="fc-carregando">Lendo o histórico completo…</div>
  if (erro || !ficha) return <div className="fc-aviso">{erro ?? 'Ficha indisponível.'}</div>

  const c = ficha.cliente
  const reais = ficha.contas.filter((x) => x.tipo !== 'demo')
  const saldo = reais.reduce((s, x) => s + x.saldo, 0)
  const lugar = c.fusoHorario ? lugarDoFuso(c.fusoHorario) : null
  const sessaoMedia = c.totalAcessos ? c.tempoTotalSegundos / c.totalAcessos : 0
  const ops = ficha.operacoes.resumo
  const mk = ficha.markup.resumo
  const ex = ficha.extrato.resumo
  const acerto = ops.total ? Math.round((ops.ganhas / ops.total) * 100) : 0
  const maxDia = Math.max(1, ...ficha.acessos.dias.map((d) => d.segundos))
  const maxMk = Math.max(0.0001, ...ficha.markup.porDia.map((d) => d.comissao))
  const maxHora = Math.max(1, ...ficha.operacoes.porHora.map((h) => h.operacoes))
  const nomeRobo = (id: string, cru: string | null) => {
    const e = ESTRATEGIAS_LOCAIS.find((x) => x.id === id)
    return e ? nomeDoRoboNaMarca(e, MARCA) : (cru || id)
  }
  const tituloAula = (id: string) => catalogo.find((a) => a.id === id)?.titulo ?? id

  return (
    <div className="fc">
      <div className="fc-abas" role="tablist" aria-label="Seções da ficha">
        {ABAS.map(([id, rotulo]) => (
          <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? 'on' : ''} onClick={() => setAba(id)}>{rotulo}</button>
        ))}
      </div>

      {/* ------------------------------------------------------ visão geral */}
      {aba === 'geral' && <>
        <div className="fc-kpis">
          <div><span>Último acesso</span><b>{dataHora(c.vistoEm)}</b><small>{haQuantoTempo(c.vistoEm)}</small></div>
          <div><span>Tempo na plataforma</span><b>{horasLegiveis(c.tempoTotalSegundos)}</b><small>{n(c.totalAcessos)} acesso{c.totalAcessos === 1 ? '' : 's'} · média de {horasLegiveis(sessaoMedia)}</small></div>
          <div className={saldo > 0 ? 'ok' : ''}><span>Saldo real</span><b>{reais.length ? usd(saldo) : '—'}</b><small>{reais.length ? `${reais.length} conta${reais.length === 1 ? '' : 's'} real${reais.length === 1 ? '' : 'is'}` : 'Sem conta conectada'}</small></div>
          <div className={mk.comissaoReal > 0 ? 'ok' : ''}><span>Markup real</span><b>{usd4(mk.comissaoReal)}</b><small>O que a casa ganhou com o cliente</small></div>
        </div>

        {c.sessaoAtual && <p className="fc-agora">● Está na plataforma agora, há {horasLegiveis(c.sessaoAtualSegundos)}.</p>}
        {ficha.emails?.descadastrado && <p className="fc-alerta">Pediu para sair da lista de e-mails. Não inclua em campanha.</p>}

        <div className="fc-duas">
          <section className="fc-bloco">
            <h4>Quem é</h4>
            <dl className="fc-dados">
              <div><dt>E-mail</dt><dd>{c.email || '—'}</dd></div>
              <div><dt>Telefone</dt><dd>{c.telefone || '—'}</dd></div>
              <div><dt>CPF</dt><dd>{c.cpf || '—'}</dd></div>
              <div><dt>Situação</dt><dd>{rotulo(c.situacao)}</dd></div>
              <div><dt>Cadastro</dt><dd>{soData(c.criadoEm)} <em>({haQuantoTempo(c.criadoEm)})</em></dd></div>
              <div><dt>Acesso expira</dt><dd>{soData(c.acessoExpiraEm)}</dd></div>
              {/* A cidade vem do IP, resolvida no servidor, que não guarda o
                  endereço. Enquanto ela não chega, vale o fuso do navegador,
                  que acerta o país e erra a cidade. */}
              <div><dt>Região</dt><dd>{rastro?.regiao.cidade
                ? `${rastro.regiao.cidade}${rastro.regiao.estado ? ` · ${rastro.regiao.estado}` : ''}${rastro.regiao.pais ? ` · ${rastro.regiao.pais}` : ''}`
                : lugar ? `${lugar.lugar}${lugar.pais ? ` · ${lugar.pais}` : ''}` : '—'}
                {rastro?.regiao.cidade && <em> (pelo acesso)</em>}</dd></div>
              <div><dt>Idioma</dt><dd>{c.idioma ? idiomaLegivel(c.idioma) : '—'}</dd></div>
            </dl>
          </section>

          <section className="fc-bloco">
            <h4>Como entrou</h4>
            {ficha.cadastro ? <dl className="fc-dados">
              <div><dt>Pediu cadastro</dt><dd>{dataHora(ficha.cadastro.pedidoEm)}</dd></div>
              <div><dt>Situação do pedido</dt><dd>{rotulo(ficha.cadastro.status)}{ficha.cadastro.recadastro ? ' · recadastro' : ''}</dd></div>
              <div><dt>Decidido em</dt><dd>{dataHora(ficha.cadastro.decididoEm)}</dd></div>
              <div><dt>E-mail de boas-vindas</dt><dd>{dataHora(ficha.cadastro.emailCadastroEm)}</dd></div>
              <div><dt>E-mail de aprovação</dt><dd>{dataHora(ficha.cadastro.emailAprovacaoEm)}</dd></div>
            </dl> : <p className="fc-vazio">Veio de importação, não do formulário de cadastro.</p>}
          </section>
        </div>

        {MARCA.termos && <AceitesDosTermos sessao={sessao} userId={userId} />}

        <section className="fc-bloco">
          <h4>Contas na corretora
            {ficha.autorizacao?.expiraEm && <small>Autorização da Deriv válida até {soData(ficha.autorizacao.expiraEm)}</small>}</h4>
          {ficha.contas.length ? <div className="fc-tabela fc-contas">
            <div className="cab"><span>Conta</span><span>Tipo</span><span>Saldo</span><span>Conectada</span><span>Saldo visto</span><span>Extrato lido</span></div>
            {ficha.contas.map((x, i) => (
              <div className="linha" key={`${x.contaId}-${i}`}>
                <span><b>{x.contaId}</b></span>
                <span>{x.tipo === 'demo' ? 'demonstração' : 'real'}</span>
                <span className={x.tipo !== 'demo' && x.saldo > 0 ? 'ok' : ''}>{x.moeda || 'USD'} {x.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                <span>{soData(x.conectadaEm)}</span>
                <span>{haQuantoTempo(x.vistaEm)}</span>
                <span>{x.extratoEm ? haQuantoTempo(x.extratoEm) : 'nunca'}</span>
              </div>
            ))}
          </div> : <p className="fc-vazio">Nenhuma conta Deriv conectada.</p>}
        </section>

        {ficha.produtos.length > 0 && <section className="fc-bloco">
          <h4>Produtos liberados</h4>
          <div className="fc-chips">
            {ficha.produtos.map((p, i) => (
              <span key={i} className={p.ativo ? 'on' : ''}>{p.produtoId}<small>{p.ativo ? 'ativo' : 'inativo'} · desde {soData(p.concedidoEm)}</small></span>
            ))}
          </div>
        </section>}
      </>}

      {/* --------------------------------------------------------- dinheiro */}
      {aba === 'dinheiro' && <>
        <div className="fc-kpis">
          <div className={mk.comissaoReal > 0 ? 'ok' : ''}><span>Markup real</span><b>{usd4(mk.comissaoReal)}</b><small>Conta real · o que a casa ganhou</small></div>
          <div><span>Markup total</span><b>{usd4(mk.comissao)}</b><small>Somando demonstração</small></div>
          <div className={ex.depositos > 0 ? 'ok' : ''}><span>Depositou</span><b>{usd(ex.depositos)}</b><small>{ex.saques ? `Sacou ${usd(Math.abs(ex.saques))}` : 'Nenhum saque'}</small></div>
          <div className={ops.resultadoReal >= 0 ? 'ok' : 'ruim'}><span>Resultado real</span><b>{usd(ops.resultadoReal)}</b><small>{n(ops.reais)} operações reais</small></div>
        </div>

        <section className="fc-bloco">
          <h4>Markup dia a dia <small>Últimos 90 dias · a barra é a comissão do dia</small></h4>
          {ficha.markup.porDia.length ? <>
            <div className="fc-barras">
              {ficha.markup.porDia.map((d) => (
                <div key={d.dia} title={`${diaCurto(d.dia)}: ${usd4(d.comissao)} em ${n(d.operacoes)} operações${d.soDemo ? ' (só demonstração)' : ''}`}>
                  <i className={d.soDemo ? 'demo' : ''} style={{ height: `${Math.max(4, (d.comissao / maxMk) * 100)}%` }} />
                </div>
              ))}
            </div>
            <p className="fc-nota">De {soData(mk.primeiroDia)} a {soData(mk.ultimoDia)} · {n(mk.operacoes)} operações contadas pela Deriv. As barras claras são dias só de demonstração.</p>
          </> : <p className="fc-vazio">Nenhuma comissão registrada.</p>}
        </section>

        <div className="fc-duas">
          <section className="fc-bloco">
            <h4>Por conta</h4>
            {ficha.markup.porConta.length ? <div className="fc-tabela fc-mkconta">
              <div className="cab"><span>Conta</span><span>Operações</span><span>Comissão</span><span>Resultado</span></div>
              {ficha.markup.porConta.map((x, i) => (
                <div className="linha" key={i}>
                  <span><b>{x.contaId}</b><small>{x.demo ? 'demonstração' : 'real'}</small></span>
                  <span>{n(x.operacoes)}</span>
                  <span className={!x.demo && x.comissao > 0 ? 'ok' : ''}>{usd4(x.comissao)}</span>
                  <span className={x.resultado > 0 ? 'ok' : x.resultado < 0 ? 'ruim' : ''}>{usd(x.resultado)}</span>
                </div>
              ))}
            </div> : <p className="fc-vazio">Sem comissão apurada.</p>}
          </section>

          <section className="fc-bloco">
            <h4>Por origem <small>Qual aplicativo comprou o contrato</small></h4>
            {ficha.markup.porOrigem.length ? <>
              <div className="fc-tabela fc-mkorigem">
                <div className="cab"><span>Origem</span><span>Operações</span><span>Markup</span><span>Resultado</span></div>
                {ficha.markup.porOrigem.map((x, i) => (
                  <div className="linha" key={i}>
                    <span><b>{nomeDaOrigem(x.origem)}</b>{x.apps.length > 0 && <small>{x.apps.map(nomeDoApp).join(' · ')}</small>}</span>
                    <span>{n(x.operacoes)}</span>
                    {/* A conta da casa só existe quando o contrato foi comprado
                        PELO NOSSO app. Em app de terceiro a Deriv paga o dono
                        daquele app; mostrar o valor aqui como se fosse nosso
                        foi exatamente o erro que o Tiago pegou em 02/10/2026. */}
                    <span className={x.nosso ? '' : 'fc-apagado'} title={x.nosso ? '' : 'Comprado por outro aplicativo: este markup não é nosso'}>
                      {x.nosso ? usd4(x.markup) : `${usd4(x.markup)} (não é nosso)`}
                    </span>
                    <span className={x.resultado > 0 ? 'ok' : x.resultado < 0 ? 'ruim' : ''}>{usd(x.resultado)}</span>
                  </div>
                ))}
              </div>
              {ficha.markup.porOrigem.some((x) => !x.nosso) && <p className="fc-nota">
                A casa só recebe markup de contrato comprado pelo <b>nosso</b> aplicativo. O que aparece
                em cinza foi operado por outro app na conta da pessoa: a Deriv paga o dono daquele app,
                não nós. O valor fica à vista para dar tamanho ao que está indo embora.
              </p>}
            </> : <p className="fc-vazio">Sem separação por origem ainda.</p>}
          </section>
        </div>

        <section className="fc-bloco">
          <h4>Extrato da corretora <small>Depósitos, saques e ajustes lidos da Deriv</small></h4>
          {ficha.extrato.lancamentos.length ? <div className="fc-tabela fc-extrato">
            <div className="cab"><span>Quando</span><span>Conta</span><span>Tipo</span><span>Descrição</span><span>Valor</span><span>Saldo depois</span></div>
            {ficha.extrato.lancamentos.map((x, i) => (
              <div className="linha" key={i}>
                <span>{dataHora(x.ocorridaEm)}</span>
                <span>{x.contaId}{x.demo && <small>Demo</small>}</span>
                <span>{x.tipo || '—'}</span>
                <span title={x.descricao || ''}>{x.descricao || '—'}</span>
                <span className={x.valor > 0 ? 'ok' : x.valor < 0 ? 'ruim' : ''}>{usd(x.valor)}</span>
                <span>{x.saldoDepois === null ? '—' : usd(x.saldoDepois)}</span>
              </div>
            ))}
          </div> : <p className="fc-vazio">Nenhum lançamento lido da corretora. O extrato só é coletado de contas autorizadas.</p>}
        </section>
      </>}

      {/* ------------------------------------------------------- operações */}
      {aba === 'operacoes' && <>
        <div className="fc-kpis">
          <div><span>Operações</span><b>{n(ops.total)}</b><small>{n(ops.reais)} em conta real</small></div>
          <div><span>Acerto</span><b>{ops.total ? `${acerto}%` : '—'}</b><small>{n(ops.ganhas)} ganhas</small></div>
          <div><span>Volume operado</span><b>{usd(ops.entradas)}</b><small>{usd(ops.entradasReais)} em conta real</small></div>
          <div><span>Opera desde</span><b>{soData(ops.primeira)}</b><small>Última {haQuantoTempo(ops.ultima)}</small></div>
        </div>

        <section className="fc-bloco">
          <h4>Robôs <small>Todas as sessões, desde sempre</small></h4>
          {ficha.robos.porRobo.length ? <div className="fc-tabela fc-robos">
            <div className="cab"><span>Robô</span><span>Sessões</span><span>Operações</span><span>Acerto</span><span>Resultado</span><span>Markup real</span><span>Última vez</span></div>
            {ficha.robos.porRobo.map((r) => (
              <div className="linha" key={r.roboId}>
                <span><b><NomeDoRobo nome={nomeRobo(r.roboId, r.roboNome)} id={r.roboId} /></b>{r.sessoesDemo > 0 && <small>{n(r.sessoesDemo)} em demonstração</small>}</span>
                <span>{n(r.sessoes)}</span>
                <span>{n(r.operacoes)}</span>
                <span>{r.operacoes ? `${Math.round((r.ganhas / r.operacoes) * 100)}%` : '—'}</span>
                <span className={r.resultado > 0 ? 'ok' : r.resultado < 0 ? 'ruim' : ''}>{usd(r.resultado)}</span>
                <span>{usd4(r.markupReal)}</span>
                <span>{haQuantoTempo(r.ultimaVez)}</span>
              </div>
            ))}
          </div> : <p className="fc-vazio">Nunca ligou um robô.</p>}
        </section>

        <div className="fc-duas">
          <section className="fc-bloco">
            <h4>Por ativo</h4>
            {ficha.operacoes.porAtivo.length ? <div className="fc-tabela fc-ativos">
              <div className="cab"><span>Ativo</span><span>Operações</span><span>Acerto</span><span>Resultado</span></div>
              {ficha.operacoes.porAtivo.map((x, i) => (
                <div className="linha" key={i}>
                  <span><b>{x.ativo || '—'}</b></span>
                  <span>{n(x.operacoes)}</span>
                  <span>{x.operacoes ? `${Math.round((x.ganhas / x.operacoes) * 100)}%` : '—'}</span>
                  <span className={x.resultado > 0 ? 'ok' : x.resultado < 0 ? 'ruim' : ''}>{usd(x.resultado)}</span>
                </div>
              ))}
            </div> : <p className="fc-vazio">Sem operações.</p>}
          </section>

          <section className="fc-bloco">
            <h4>Em que hora opera <small>Fuso da pessoa</small></h4>
            {ficha.operacoes.porHora.length ? <>
              <div className="fc-barras baixa">
                {Array.from({ length: 24 }, (_, h) => {
                  const x = ficha.operacoes.porHora.find((o) => o.hora === h)
                  return <div key={h} title={`${String(h).padStart(2, '0')}h: ${n(x?.operacoes ?? 0)} operações`}>
                    <i style={{ height: `${Math.max(2, ((x?.operacoes ?? 0) / maxHora) * 100)}%` }} />
                  </div>
                })}
              </div>
              <p className="fc-nota">00h à esquerda, 23h à direita.</p>
            </> : <p className="fc-vazio">Sem operações.</p>}
          </section>
        </div>

        {ficha.robos.ultimas.length > 0 && <section className="fc-bloco">
          <h4>Últimas sessões</h4>
          <div className="fc-tabela fc-sessoes">
            <div className="cab"><span>Quando</span><span>Robô</span><span>Conta</span><span>Entrada</span><span>Operações</span><span>Resultado</span><span>Como terminou</span></div>
            {ficha.robos.ultimas.map((s, i) => (
              <div className="linha" key={i}>
                <span>{dataHora(s.criadaEm)}</span>
                <span><NomeDoRobo nome={nomeRobo(s.roboId, s.roboNome)} id={s.roboId} /></span>
                <span>{s.demo ? 'demo' : 'real'}</span>
                <span>{s.entradaInicial === null ? '—' : usd(s.entradaInicial)}</span>
                <span>{n(s.operacoes)} <small>{n(s.ganhas)}✓ {n(s.perdidas)}✕</small></span>
                <span className={s.resultado > 0 ? 'ok' : s.resultado < 0 ? 'ruim' : ''}>{usd(s.resultado)}</span>
                {/* O motivo vem longo ("a Deriv recusou a compra — [InsufficientBalance]…").
                    A coluna corta em duas linhas e o texto inteiro fica no hover. */}
                <span title={s.motivoDaParada || s.situacao}>{s.motivoDaParada || s.situacao}</span>
              </div>
            ))}
          </div>
        </section>}

        {ficha.operacoes.ultimas.length > 0 && <section className="fc-bloco">
          <h4>Últimas operações</h4>
          <div className="fc-tabela fc-ops">
            <div className="cab"><span>Quando</span><span>Robô</span><span>Contrato</span><span>Entrada</span><span>Dígito</span><span>Resultado</span><span>Markup</span></div>
            {ficha.operacoes.ultimas.map((o, i) => (
              <div className="linha" key={i}>
                <span>{dataHora(o.executadaEm)}</span>
                <span>{o.roboNome || '—'}{o.demo && <small>Demo</small>}</span>
                <span>{o.tipoContrato || '—'}<small>{o.ativo}</small></span>
                <span>{usd(o.entrada)}</span>
                <span>{o.digitoSaida ?? '—'}</span>
                <span className={o.ganhou ? 'ok' : 'ruim'}>{usd(o.resultado)}</span>
                <span>{usd4(o.markup)}</span>
              </div>
            ))}
          </div>
        </section>}
      </>}

      {/* ---------------------------------------------------- comportamento */}
      {aba === 'comportamento' && <>
        <div className="fc-kpis">
          <div><span>Dias com acesso</span><b>{n(ficha.acessos.diasComAcesso)}</b><small>{ficha.acessos.primeiroDia ? `Desde ${soData(ficha.acessos.primeiroDia)}` : 'Nunca entrou'}</small></div>
          <div><span>Aparelho</span><b>{rotulo(ficha.acessos.porDispositivo[0]?.dispositivo)}</b><small>{ficha.acessos.porDispositivo.map((d) => `${rotulo(d.dispositivo)} ${n(d.acessos)}`).join(' · ') || 'Sem registro'}</small></div>
          <div><span>Aulas abertas</span><b>{n(ficha.aulas.length)}</b><small>{n(ficha.aulas.filter((a) => a.concluida).length)} concluída{ficha.aulas.filter((a) => a.concluida).length === 1 ? '' : 's'}</small></div>
          <div><span>E-mails recebidos</span><b>{n(ficha.emails?.enviados ?? 0)}</b><small>{n(ficha.emails?.abertos ?? 0)} aberto{(ficha.emails?.abertos ?? 0) === 1 ? '' : 's'}</small></div>
        </div>

        <section className="fc-bloco">
          <h4>Quando entra <small>Últimos 90 dias · a barra é o tempo de cada dia</small></h4>
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
              {[...ficha.acessos.dias].reverse().slice(0, 10).map((d) => (
                <div className="linha" key={d.dia}><span>{soData(d.dia)}</span><span>{n(d.acessos)}</span><span>{horasLegiveis(d.segundos)}</span><span>{d.dispositivo || '—'}</span></div>
              ))}
            </div>
          </> : <p className="fc-vazio">Nunca entrou na plataforma.</p>}
        </section>

        <section className="fc-bloco">
          <h4>Por onde andou <small>Telas abertas e tempo em cada uma</small></h4>
          {rastro?.paginas.length ? <div className="fc-tabela fc-paginas">
            <div className="cab"><span>Tela</span><span>Visitas</span><span>Tempo</span><span>Última vez</span></div>
            {rastro.paginas.map((p, i) => (
              <div className="linha" key={i}>
                <span><b>{nomeDaTela(p.pagina)}</b></span>
                <span>{n(p.visitas)}</span>
                <span>{horasLegiveis(p.segundos)}</span>
                <span>{haQuantoTempo(p.ultimaEm)}</span>
              </div>
            ))}
          </div> : <p className="fc-vazio">Sem rastro ainda. A gravação começou em 02/10/2026; quem não entrou depois disso não tem histórico.</p>}
        </section>

        <section className="fc-bloco">
          <h4>No que clicou <small>O rótulo que a pessoa leu no botão</small></h4>
          {rastro?.cliques.length ? <div className="fc-tabela fc-cliques">
            <div className="cab"><span>Botão</span><span>Na tela</span><span>Vezes</span><span>Última vez</span></div>
            {rastro.cliques.map((c, i) => (
              <div className="linha" key={i}>
                <span><b>{c.alvo}</b></span>
                <span>{nomeDaTela(c.pagina)}</span>
                <span>{n(c.vezes)}</span>
                <span>{haQuantoTempo(c.ultimaEm)}</span>
              </div>
            ))}
          </div> : <p className="fc-vazio">Nenhum clique registrado ainda.</p>}
          <p className="fc-nota">A plataforma guarda o rótulo do botão e a tela, somados por dia. Não guarda nada do que foi digitado, nem valores de campo, nem o IP.</p>
        </section>

        <section className="fc-bloco">
          <h4>Aulas</h4>
          {ficha.aulas.length ? <div className="fc-tabela fc-aulas">
            <div className="cab"><span>Aula</span><span>Aberturas</span><span>Tempo</span><span>Até onde</span><span>Primeira vez</span><span>Última vez</span></div>
            {ficha.aulas.map((a) => (
              <div className="linha" key={a.aulaId}>
                <span><b>{tituloAula(a.aulaId)}</b>{a.concluida && <small>Concluída</small>}</span>
                <span>{n(a.aberturas)}</span>
                <span>{horasLegiveis(a.segundos)}</span>
                <span><i className="fc-prog"><u style={{ width: `${Math.round(a.posicaoMax * 100)}%` }} /></i>{Math.round(a.posicaoMax * 100)}%</span>
                <span>{soData(a.primeiraVez)}</span>
                <span>{haQuantoTempo(a.ultimaVez)}</span>
              </div>
            ))}
          </div> : <p className="fc-vazio">Nunca abriu uma aula.</p>}
        </section>

        <section className="fc-bloco">
          <h4>E-mails que a casa mandou
            <small>Clique numa linha para ver a linha do tempo de entrega</small></h4>
          {ficha.emails && ficha.emails.enviados > 0 ? <>
            <div className="fc-resumo-email">
              <span>{n(ficha.emails.enviados)} enviados</span>
              <span>{n(ficha.emails.entregues)} entregues</span>
              <span className="bom">{n(ficha.emails.abertos)} abertos</span>
              <span className="bom">{n(ficha.emails.clicados)} clicados</span>
              {ficha.emails.voltaram > 0 && <span className="ruim">{n(ficha.emails.voltaram)} voltaram</span>}
            </div>
            <div className="fc-tabela fc-emails">
              <div className="cab"><span>Enviado</span><span>Campanha</span><span>Situação</span><span>Aberturas</span><span>Cliques</span><span>1ª abertura</span></div>
              {ficha.emails.mensagens.map((m, i) => (
                <div key={i} className="fc-email">
                  <button className={`linha ${emailAberto === i ? 'aberta' : ''}`} onClick={() => setEmailAberto(emailAberto === i ? null : i)}>
                    <span>{dataHora(m.enviadoEm)}</span>
                    <span>{m.campanha}</span>
                    <span><em className={`fc-selo ${TOM[m.situacao] ?? 'neutro'}`}>{m.situacao}</em></span>
                    <span>{n(m.aberturas)}</span>
                    <span>{n(m.cliques)}</span>
                    <span>{m.primeiraAbertura ? dataHora(m.primeiraAbertura) : '—'}</span>
                  </button>
                  {emailAberto === i && <ol className="fc-linha-tempo">
                    {m.eventos.length ? m.eventos.map((e, j) => (
                      <li key={j}><b>{EVENTO[e.tipo] ?? e.tipo}</b><span>{dataHora(e.quando)}</span></li>
                    )) : <li><b>sem eventos registrados</b><span>o provedor ainda não respondeu</span></li>}
                    {m.erro && <li className="ruim"><b>falhou no envio</b><span>{m.erro}</span></li>}
                  </ol>}
                </div>
              ))}
            </div>
          </> : <p className="fc-vazio">Nunca recebeu e-mail de campanha da casa.</p>}
        </section>

        {ficha.assistente && ficha.assistente.dias > 0 && <section className="fc-bloco">
          <h4>Assistente</h4>
          <dl className="fc-dados">
            <div><dt>Mensagens</dt><dd>{n(ficha.assistente.mensagens)}</dd></div>
            <div><dt>Dias que usou</dt><dd>{n(ficha.assistente.dias)}</dd></div>
            <div><dt>Última vez</dt><dd>{soData(ficha.assistente.ultimoDia)}</dd></div>
          </dl>
        </section>}
      </>}
    </div>
  )
}
