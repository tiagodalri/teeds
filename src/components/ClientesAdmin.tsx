import { useEffect, useMemo, useState } from 'react'
import {
  listarClientes, listarComissoes, listarContasDeriv, souAdmin,
  type ClienteRegistro, type ComissaoDia, type ContaDerivRegistro,
} from '../core/teeds/clientes'
import type { SessaoTeeds } from '../core/teeds/conta'

const dinheiro = (v: number, moeda = 'USD') =>
  `${moeda} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function quando(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const hoje = new Date()
  const mesmoDia = d.toDateString() === hoje.toDateString()
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (mesmoDia) return `hoje ${hora}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`
}

/**
 * A visao do administrador: quem se cadastrou na Teeds, que conta Deriv
 * conectou e quanta comissao gerou no periodo. So aparece para quem esta
 * na tabela `administradores` — para todo o resto o componente pergunta
 * uma vez, recebe "nao" e se retira em silencio.
 */
export function ClientesAdmin({ sessao, dias }: { sessao: SessaoTeeds | null; dias: number }) {
  const [admin, setAdmin] = useState<boolean | null>(null)
  const [clientes, setClientes] = useState<ClienteRegistro[]>([])
  const [contas, setContas] = useState<ContaDerivRegistro[]>([])
  const [comissoes, setComissoes] = useState<ComissaoDia[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const usuarioId = sessao?.usuario.id ?? null

  useEffect(() => {
    if (!sessao) return
    let vivo = true
    souAdmin(sessao).then((r) => vivo && setAdmin(r))
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId])

  useEffect(() => {
    if (!admin || !sessao) return
    let vivo = true
    setCarregando(true)
    setErro(null)
    Promise.all([listarClientes(sessao), listarContasDeriv(sessao), listarComissoes(sessao, dias)])
      .then(([cli, con, com]) => {
        if (!vivo) return
        setClientes(cli)
        setContas(con)
        setComissoes(com)
      })
      .catch((e: Error) => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false))
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, usuarioId, dias])

  const porCliente = useMemo(() => {
    const mapa = new Map<string, { contas: ContaDerivRegistro[]; real: number; demo: number; operacoes: number }>()
    for (const c of clientes) mapa.set(c.userId, { contas: [], real: 0, demo: 0, operacoes: 0 })
    for (const conta of contas) mapa.get(conta.userId)?.contas.push(conta)
    for (const c of comissoes) {
      const item = mapa.get(c.userId)
      if (!item) continue
      if (c.demo) item.demo += c.comissao
      else item.real += c.comissao
      item.operacoes += c.operacoes
    }
    return mapa
  }, [clientes, contas, comissoes])

  const totais = useMemo(() => {
    let real = 0
    let demo = 0
    let comDeriv = 0
    for (const [, v] of porCliente) {
      real += v.real
      demo += v.demo
      if (v.contas.length > 0) comDeriv += 1
    }
    return { real, demo, comDeriv }
  }, [porCliente])

  if (!sessao || !admin) return null

  return (
    <section className="ger-bloco cli-admin">
      <div className="ger-bloco-topo">
        <span className="rot">Clientes da Teeds</span>
        <span className="ger-tag">visão do administrador</span>
      </div>
      <p className="ger-texto">
        Todo mundo que criou conta na plataforma, a conta Deriv que conectou e a
        comissão que as operações dele geraram no período escolhido aí em cima.
        A comissão de conta demo é fictícia — está aqui para acompanhar testes.
      </p>

      {erro && <div className="ger-erro">{erro}</div>}
      {carregando && clientes.length === 0 && <p className="ger-nota">buscando os clientes…</p>}

      {clientes.length > 0 && (
        <>
          <div className="kpis">
            <div className="kpi">
              <span className="rot">Cadastrados</span>
              <strong>{clientes.length.toLocaleString('pt-BR')}</strong>
            </div>
            <div className="kpi">
              <span className="rot">Com Deriv conectada</span>
              <strong>{totais.comDeriv.toLocaleString('pt-BR')}</strong>
            </div>
            <div className="kpi">
              <span className="rot">Comissão real no período</span>
              <strong>{dinheiro(totais.real)}</strong>
            </div>
            <div className="kpi">
              <span className="rot">Comissão demo no período</span>
              <strong>{dinheiro(totais.demo)}</strong>
            </div>
          </div>

          <div className="cli-tabela">
            <div className="cli-linha cli-cabecalho">
              <span>Cliente</span>
              <span>Contas Deriv</span>
              <span>Saldo</span>
              <span>Comissão real</span>
              <span>Demo</span>
              <span>Visto por último</span>
            </div>
            {clientes.map((c) => {
              const extra = porCliente.get(c.userId)
              return (
                <div key={c.userId} className="cli-linha">
                  <span className="cli-quem">
                    <b>{c.nome ?? '—'}</b>
                    <em>{c.email ?? ''}{c.telefone ? ` · ${c.telefone}` : ''}</em>
                  </span>
                  <span className="cli-contas">
                    {extra && extra.contas.length > 0
                      ? extra.contas.map((k) => (
                          <i key={k.contaId} className={k.tipo === 'demo' ? 'demo' : 'real'}>
                            {k.contaId}
                          </i>
                        ))
                      : <em>nenhuma</em>}
                  </span>
                  <span className="cli-saldos">
                    {extra && extra.contas.length > 0
                      ? extra.contas.map((k) => (
                          <em key={k.contaId} className={k.tipo === 'demo' ? '' : 'cli-saldo-real'}
                            title={`${k.contaId} · visto ${quando(k.vistaEm)}`}>
                            {k.saldo === null ? '—' : dinheiro(k.saldo, k.moeda ?? 'USD')}
                          </em>
                        ))
                      : <em>—</em>}
                  </span>
                  <span className="cli-num">{dinheiro(extra?.real ?? 0)}</span>
                  <span className="cli-num cli-demo">{dinheiro(extra?.demo ?? 0)}</span>
                  <span className="cli-visto">{quando(c.vistoEm)}</span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {!carregando && clientes.length === 0 && !erro && (
        <p className="ger-nota">Ninguém se cadastrou ainda. Divulgue o link da plataforma.</p>
      )}
    </section>
  )
}
