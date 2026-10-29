import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AuthSession } from '../core/deriv/auth'
import type { TradingAccount } from '../core/deriv/account'
import { CarteiraSemPermissao, lerCarteiras, lerMovimentos, moedaLegivel, valorNaMoeda, type Carteira, type MovimentoDaCarteira, type SituacaoDoMovimento } from '../core/deriv/carteira'
import { DERIV } from '../core/deriv/config'
import { DerivLogo } from './DerivMarca'
import { MARCA } from '../marca'
import './carteira-deriv.css'

/*
  A carteira da Deriv dentro da plataforma (26/10/2026; refeita no mesmo dia
  depois do primeiro uso real: o saldo não carregava, vinha "Complete",
  "Reverted" e "USDT_TRON" cru). Só leitura: nada aqui move dinheiro.

  O saldo e as movimentações carregam separados (um não trava o outro). Os
  saques estornados aparecem, mas apagados e fora das somas: o valor voltou.
*/

type Estado<T> = { carregando: true } | { carregando: false; dados: T } | { carregando: false; erro: string }

const SITUACAO: Record<SituacaoDoMovimento, { texto: string; ajuda?: string }> = {
  concluido: { texto: 'Concluído' },
  andamento: { texto: 'Em andamento' },
  estornado: { texto: 'Estornado', ajuda: 'o valor voltou para a carteira' },
  falhou: { texto: 'Não concluído', ajuda: 'nada saiu da carteira' },
  cancelado: { texto: 'Cancelado', ajuda: 'nada saiu da carteira' },
  outro: { texto: '' },
}
// apagados na lista só os que não mexeram no saldo; nas somas, só os concluídos
const conta = (m: MovimentoDaCarteira) => m.situacao === 'concluido' || m.situacao === 'andamento'
const quando = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Onde as contas de opção operam, no vocabulário da marca (na GlobalFly é I.A.; nas outras, robôs). */
const ONDE_OPERAM = MARCA.vocabularioIA ? 'onde as I.A. operam' : 'onde os robôs operam'

export function CarteiraDeriv({ session, contas = [], fechar, reconectar, somenteDemo = false, rotulosTrocados = false }: {
  session: AuthSession | null; contas?: TradingAccount[]; fechar: () => void; reconectar: () => void
  /** Acesso de demonstração: a conta virtual se apresenta como real (só o rótulo; as somas seguem a conta de verdade). */
  somenteDemo?: boolean
  /** Rótulos trocados (uso interno): a virtual veste "Real" e a real veste "Demo" (só o rótulo). */
  rotulosTrocados?: boolean
}) {
  // como a conta aparece na tela; quem soma e filtra continua sendo o tipo de verdade
  const pareceDemo = (c: TradingAccount) => (rotulosTrocados ? c.type !== 'demo' : c.type === 'demo' && !somenteDemo)
  const [carteiras, setCarteiras] = useState<Estado<Carteira[]>>({ carregando: true })
  const [movimentos, setMovimentos] = useState<Estado<MovimentoDaCarteira[]>>({ carregando: true })
  const [semPermissao, setSemPermissao] = useState(false)
  const [filtro, setFiltro] = useState<'todos' | 'deposito' | 'saque'>('todos')
  const [rodada, setRodada] = useState(0)

  const carregar = useCallback(() => setRodada((n) => n + 1), [])
  useEffect(() => {
    if (!session) return
    let vivo = true
    setCarteiras({ carregando: true }); setMovimentos({ carregando: true })
    const falhou = (e: unknown, poe: (x: Estado<never>) => void) => {
      if (!vivo) return
      if (e instanceof CarteiraSemPermissao) { setSemPermissao(true); return }
      poe({ carregando: false, erro: (e as Error)?.message || 'A Deriv não respondeu agora.' })
    }
    lerCarteiras(session).then((dados) => vivo && setCarteiras({ carregando: false, dados })).catch((e) => falhou(e, setCarteiras as never))
    lerMovimentos(session).then((dados) => vivo && setMovimentos({ carregando: false, dados })).catch((e) => falhou(e, setMovimentos as never))
    return () => { vivo = false }
  }, [session, rodada])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    window.addEventListener('keydown', tecla); return () => window.removeEventListener('keydown', tecla)
  }, [fechar])

  const lista = 'dados' in movimentos ? movimentos.dados : []
  const principal = 'dados' in carteiras ? carteiras.dados.find((c) => c.tipo === 'main') ?? carteiras.dados[0] ?? null : null
  // 26/10/2026 (Tiago: "tenho 20 dólares na minha conta de opções, não era pra aparecer?"): a carteira
  // da Deriv e a conta onde as I.A. operam são coisas diferentes. A tela mostra as duas, cada saldo no seu lugar.
  const deOperacao = [...contas].sort((a, b) => Number(a.type === 'demo') - Number(b.type === 'demo'))
  const reais = deOperacao.filter((c) => c.type !== 'demo')
  const saldosDaCarteira = principal?.saldos.length ? principal.saldos : []
  // o total só quando dá para somar sem inventar câmbio: carteira em dólar (a Deriv converte) + contas reais em USD
  const totalNaDeriv = principal?.emDolar && reais.every((c) => c.currency === 'USD') ? principal.emDolar.saldo + reais.reduce((t, c) => t + c.balance, 0) : null
  // o total em dólar só vale se a Deriv mandou alguma coisa nele; senão as somas saem das movimentações
  const totalDolar = principal?.emDolar && (principal.emDolar.entradas || principal.emDolar.saidas) ? principal.emDolar : null

  // depositado e sacado: o total da carteira em dólar, quando vem; senão, a soma das movimentações que valeram
  const somasPorMoeda = useMemo(() => {
    const m = new Map<string, { dep: number; saq: number }>()
    for (const x of lista) {
      if (x.situacao !== 'concluido') continue
      const t = m.get(x.moeda) ?? { dep: 0, saq: 0 }
      if (x.tipo === 'deposito') t.dep += x.liquido || x.valor; else t.saq += Math.abs(x.liquido || x.valor)
      m.set(x.moeda, t)
    }
    return [...m]
  }, [lista])
  const visiveis = lista.filter((x) => filtro === 'todos' || x.tipo === filtro)
  const qtd = { todos: lista.length, deposito: lista.filter((x) => x.tipo === 'deposito').length, saque: lista.filter((x) => x.tipo === 'saque').length }

  return (
    <div className="cw-fundo" onMouseDown={fechar}>
      <section className="cw" role="dialog" aria-modal="true" aria-labelledby="cw-titulo" onMouseDown={(e) => e.stopPropagation()}>
        <header className="cw-topo">
          <div>
            <span className="cw-rot">Sua conta na <DerivLogo altura={12} /></span>
            <h2 id="cw-titulo">Carteira</h2>
          </div>
          <div className="cw-topo-acoes">
            {session && !semPermissao && <button type="button" className="cw-icone" onClick={carregar} aria-label="Atualizar" title="Atualizar" disabled={carteiras.carregando || movimentos.carregando}>↻</button>}
            <button type="button" className="cw-icone" onClick={fechar} aria-label="Fechar">×</button>
          </div>
        </header>

        <div className="cw-corpo">
          {!session ? (
            <div className="cw-aviso"><b>Conecte a Deriv</b><p>A carteira aparece aqui assim que a sua conta estiver conectada.</p></div>
          ) : semPermissao ? (
            <div className="cw-aviso">
              <b>Falta uma permissão</b>
              <p>A sua conexão com a Deriv é de antes de a carteira chegar à plataforma. Reconecte uma vez e autorize o acesso à carteira. As operações em andamento continuam normalmente.</p>
              <button type="button" className="cw-botao principal" onClick={reconectar}>Reconectar a Deriv</button>
            </div>
          ) : (
            <>
              {/* ------------------------------------------------ onde está o dinheiro */}
              <section className="cw-resumo" aria-label="Seus saldos na Deriv">
                <div className="cw-r-cabeca">
                  <span className="cw-r-rot">Seus saldos na Deriv</span>
                  {totalNaDeriv !== null && <span className="cw-r-total">Total <b>{valorNaMoeda(totalNaDeriv, 'USD')}</b><small> aprox.</small></span>}
                </div>
                <ul className="cw-contas">
                  {deOperacao.map((c) => (
                    <li key={c.accountId} className={`cw-conta operacao ${pareceDemo(c) ? 'demo' : ''}`}>
                      <i aria-hidden="true">{pareceDemo(c) ? 'D' : '▲'}</i>
                      <span className="cw-conta-nome">
                        <b>{pareceDemo(c) ? 'Conta demonstração' : 'Conta de operação'}</b>
                        <small>{pareceDemo(c) ? 'Dinheiro de treino, não é real' : `Opções · ${ONDE_OPERAM}`} · {c.accountId}</small>
                      </span>
                      <strong>{valorNaMoeda(c.balance, c.currency)}</strong>
                    </li>
                  ))}
                  {carteiras.carregando ? (
                    <li className="cw-conta carteira"><i aria-hidden="true">$</i><span className="cw-conta-nome"><b>Carteira</b><small>Lendo o saldo…</small></span><i className="cw-carregando" aria-label="Carregando o saldo" /></li>
                  ) : 'erro' in carteiras ? (
                    <li className="cw-conta carteira"><i aria-hidden="true">$</i><span className="cw-conta-nome"><b>Carteira</b><small>Não deu para ler o saldo agora.</small></span><button type="button" className="cw-link" onClick={carregar}>Tentar de novo</button></li>
                  ) : (saldosDaCarteira.length ? saldosDaCarteira : [{ moeda: 'USD', saldo: 0, entradas: 0, saidas: 0 }]).map((x) => {
                    const { simbolo, rede } = moedaLegivel(x.moeda)
                    return (
                      <li key={x.moeda} className={`cw-conta carteira ${x.saldo === 0 ? 'zerada' : ''}`}>
                        <i aria-hidden="true">$</i>
                        <span className="cw-conta-nome"><b>Carteira em {simbolo === 'US$' ? 'dólar' : simbolo}</b><small>{rede ? `${rede} · ` : ''}onde o depósito cai e de onde o saque sai</small></span>
                        <strong>{valorNaMoeda(x.saldo, x.moeda)}</strong>
                      </li>
                    )
                  })}
                </ul>
                <p className="cw-explica">O depósito cai na carteira e passa para a conta de operação. Os depósitos e saques abaixo são os da carteira.</p>

                <div className="cw-totais">
                  <div>
                    <span>Depositado na carteira</span>
                    {totalDolar ? <b className="up">{valorNaMoeda(totalDolar.entradas, 'USD')}</b>
                      : somasPorMoeda.length ? somasPorMoeda.filter(([, t]) => t.dep).map(([m, t]) => <b key={m} className="up">{valorNaMoeda(t.dep, m)}</b>)
                      : <b>{movimentos.carregando ? '…' : '—'}</b>}
                  </div>
                  <div>
                    <span>Sacado da carteira</span>
                    {totalDolar ? <b>{valorNaMoeda(totalDolar.saidas, 'USD')}</b>
                      : somasPorMoeda.length ? somasPorMoeda.filter(([, t]) => t.saq).map(([m, t]) => <b key={m}>{valorNaMoeda(t.saq, m)}</b>)
                      : <b>{movimentos.carregando ? '…' : '—'}</b>}
                  </div>
                </div>
                {!totalDolar && somasPorMoeda.length > 0 && <small className="cw-nota">Soma dos depósitos e saques concluídos abaixo. Os em andamento, estornados e cancelados ficam de fora.</small>}
              </section>

              {/* ------------------------------------------------ as movimentações */}
              <section className="cw-lista" aria-label="Depósitos e saques">
                <div className="cw-lista-topo">
                  <h3>Depósitos e saques</h3>
                  <div className="cw-filtros" role="tablist">
                    {(['todos', 'deposito', 'saque'] as const).map((f) => (
                      <button key={f} type="button" role="tab" aria-selected={filtro === f} className={filtro === f ? 'on' : ''} onClick={() => setFiltro(f)}>
                        {f === 'todos' ? 'Todos' : f === 'deposito' ? 'Depósitos' : 'Saques'} <small>{qtd[f]}</small>
                      </button>
                    ))}
                  </div>
                </div>
                {movimentos.carregando ? (
                  <ul aria-label="Carregando">{[0, 1, 2].map((i) => <li key={i} className="cw-fantasma"><i /><span /></li>)}</ul>
                ) : 'erro' in movimentos ? (
                  <div className="cw-erro-linha"><span>Não deu para ler as movimentações agora.</span><button type="button" className="cw-link" onClick={carregar}>Tentar de novo</button></div>
                ) : visiveis.length === 0 ? (
                  <p className="cw-vazio">{lista.length ? 'Nada com esse filtro.' : 'Nenhum depósito ou saque ainda.'}</p>
                ) : (
                  <ul>
                    {visiveis.map((m) => {
                      const sit = SITUACAO[m.situacao]
                      const valeu = conta(m)
                      const rede = moedaLegivel(m.moeda).rede
                      return (
                        <li key={m.id} className={`${m.tipo} s-${m.situacao} ${valeu ? '' : 'apagado'}`}>
                          <i aria-hidden="true">{m.tipo === 'deposito' ? '↓' : '↑'}</i>
                          <span className="cw-mov">
                            <span className="cw-mov-topo"><b>{m.tipo === 'deposito' ? 'Depósito' : 'Saque'}</b>{sit.texto && <em className={`cw-sit s-${m.situacao}`}>{sit.texto}</em>}</span>
                            <small>{quando(m.quando)} · {m.canal === 'agente' ? 'agente de pagamento' : 'caixa da Deriv'}{rede ? ` · ${rede}` : ''}</small>
                            {sit.ajuda && <small className="cw-ajuda">{sit.ajuda}</small>}
                          </span>
                          <b className="cw-valor">{m.tipo === 'deposito' ? '+' : '−'}{valorNaMoeda(m.liquido || m.valor, m.moeda)}</b>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>

        <footer className="cw-pe">
          {/* sem a permissão, a ação principal é reconectar (acima): o depósito vira secundário */}
          <a className={`cw-botao${semPermissao ? '' : ' principal'}`} href={DERIV.deposito} target="_blank" rel="noopener noreferrer">Depositar na Deriv</a>
          <button type="button" className="cw-botao" onClick={fechar}>Fechar</button>
        </footer>
      </section>
    </div>
  )
}
