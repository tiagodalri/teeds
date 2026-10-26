import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AuthSession } from '../core/deriv/auth'
import { CarteiraSemPermissao, lerCarteiras, lerMovimentos, moedaLegivel, valorNaMoeda, type Carteira, type MovimentoDaCarteira, type SituacaoDoMovimento } from '../core/deriv/carteira'
import { DERIV } from '../core/deriv/config'
import { DerivLogo } from './DerivMarca'
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

export function CarteiraDeriv({ session, fechar, reconectar }: { session: AuthSession | null; fechar: () => void; reconectar: () => void }) {
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
  const saldosComValor = principal?.saldos.filter((s) => s.saldo !== 0) ?? []
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
              <p>A sua conexão com a Deriv é de antes da carteira chegar à plataforma. Reconecte uma vez e autorize o acesso à carteira. Os robôs continuam rodando normalmente.</p>
              <button type="button" className="cw-botao principal" onClick={reconectar}>Reconectar a Deriv</button>
            </div>
          ) : (
            <>
              {/* ------------------------------------------------ o saldo */}
              <section className="cw-resumo" aria-label="Saldo da carteira">
                <span className="cw-r-rot">Saldo na carteira</span>
                {carteiras.carregando ? <i className="cw-carregando" aria-label="Carregando o saldo" /> : 'erro' in carteiras ? (
                  <div className="cw-erro-linha"><span>Não consegui ler o saldo agora.</span><button type="button" className="cw-link" onClick={carregar}>Tentar de novo</button></div>
                ) : (
                  <div className="cw-saldos">
                    {principal?.emDolar && saldosComValor.some((s) => s.moeda !== 'USD') ? (
                      <><strong>{valorNaMoeda(principal.emDolar.saldo, 'USD')}</strong><small>somando todas as moedas, em dólar (aproximado)</small></>
                    ) : saldosComValor.length ? (
                      saldosComValor.map((s, i) => <strong key={s.moeda} className={i ? 'menor' : ''}>{valorNaMoeda(s.saldo, s.moeda)}{moedaLegivel(s.moeda).rede && <em>{moedaLegivel(s.moeda).rede}</em>}</strong>)
                    ) : <strong>{valorNaMoeda(0, principal?.saldos[0]?.moeda ?? 'USD')}</strong>}
                  </div>
                )}
                <p className="cw-explica">O depósito cai aqui primeiro. Para os robôs usarem, o saldo passa para a sua conta de operação.</p>

                <div className="cw-totais">
                  <div>
                    <span>Depositado</span>
                    {totalDolar ? <b className="up">{valorNaMoeda(totalDolar.entradas, 'USD')}</b>
                      : somasPorMoeda.length ? somasPorMoeda.filter(([, t]) => t.dep).map(([m, t]) => <b key={m} className="up">{valorNaMoeda(t.dep, m)}</b>)
                      : <b>{movimentos.carregando ? '…' : '—'}</b>}
                  </div>
                  <div>
                    <span>Sacado</span>
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
                  <div className="cw-erro-linha"><span>Não consegui ler as movimentações agora.</span><button type="button" className="cw-link" onClick={carregar}>Tentar de novo</button></div>
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
          <a className="cw-botao principal" href={DERIV.deposito} target="_blank" rel="noopener noreferrer">Depositar na Deriv</a>
          <button type="button" className="cw-botao" onClick={fechar}>Fechar</button>
        </footer>
      </section>
    </div>
  )
}
