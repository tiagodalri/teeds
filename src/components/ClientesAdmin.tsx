import { useEffect, useMemo, useState } from 'react'
import { atualizarAcessoCliente, definirProdutoCliente, listarClientes, listarComissoes, listarContasDeriv, listarPlanos, listarProdutos, listarProdutosClientes, souAdmin, type ClienteProdutoRegistro, type ClienteRegistro, type ComissaoDia, type ContaDerivRegistro, type PlanoRegistro, type ProdutoRegistro } from '../core/teeds/clientes'
import type { SessaoTeeds } from '../core/teeds/conta'

const dataCurta = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR') : 'Sem vencimento'
const dataInput = (iso?: string | null) => iso ? iso.slice(0, 10) : ''
const venceu = (c: ClienteRegistro) => Boolean(c.acessoExpiraEm && new Date(c.acessoExpiraEm).getTime() < Date.now())
const statusReal = (c: ClienteRegistro) => venceu(c) && c.statusAcesso === 'ativo' ? 'expirado' : c.statusAcesso

export function ClientesAdmin({ sessao, dias }: { sessao: SessaoTeeds | null; dias: number }) {
  const [admin, setAdmin] = useState<boolean | null>(null)
  const [clientes, setClientes] = useState<ClienteRegistro[]>([])
  const [contas, setContas] = useState<ContaDerivRegistro[]>([])
  const [comissoes, setComissoes] = useState<ComissaoDia[]>([])
  const [planos, setPlanos] = useState<PlanoRegistro[]>([])
  const [produtos, setProdutos] = useState<ProdutoRegistro[]>([])
  const [liberacoes, setLiberacoes] = useState<ClienteProdutoRegistro[]>([])
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [editando, setEditando] = useState<ClienteRegistro | null>(null)
  const [form, setForm] = useState({ planoId: 'essencial', status: 'ativo', expira: '', observacoes: '' })
  const [extras, setExtras] = useState<Set<string>>(new Set())
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const usuarioId = sessao?.usuario.id ?? null

  const carregar = async () => {
    if (!sessao) return
    setCarregando(true); setErro(null)
    try {
      const [cli, con, com, pla, pro, lib] = await Promise.all([listarClientes(sessao), listarContasDeriv(sessao), listarComissoes(sessao, dias), listarPlanos(sessao), listarProdutos(sessao), listarProdutosClientes(sessao)])
      setClientes(cli); setContas(con); setComissoes(com); setPlanos(pla); setProdutos(pro); setLiberacoes(lib)
    } catch (e) { setErro((e as Error).message) }
    finally { setCarregando(false) }
  }
  useEffect(() => {
    if (!sessao) return
    let vivo = true
    souAdmin(sessao).then((ok) => { if (vivo) setAdmin(ok) })
    return () => { vivo = false }
  }, [usuarioId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (admin) void carregar() }, [admin, usuarioId, dias]) // eslint-disable-line react-hooks/exhaustive-deps

  const porCliente = useMemo(() => {
    const mapa = new Map<string, { contas: ContaDerivRegistro[]; real: number; operacoes: number }>()
    clientes.forEach((c) => mapa.set(c.userId, { contas: [], real: 0, operacoes: 0 }))
    contas.forEach((c) => mapa.get(c.userId)?.contas.push(c))
    comissoes.forEach((c) => { const x = mapa.get(c.userId); if (x && !c.demo) { x.real += c.comissao; x.operacoes += c.operacoes } })
    return mapa
  }, [clientes, contas, comissoes])
  const visiveis = useMemo(() => clientes.filter((c) => {
    const termo = busca.trim().toLowerCase()
    return (!termo || `${c.nome} ${c.email} ${c.telefone} ${c.cpf}`.toLowerCase().includes(termo)) && (filtro === 'todos' || statusReal(c) === filtro)
  }), [clientes, busca, filtro])
  const ativos = clientes.filter((c) => statusReal(c) === 'ativo').length
  const expirados = clientes.filter((c) => statusReal(c) === 'expirado').length
  const vencendo = clientes.filter((c) => c.acessoExpiraEm && !venceu(c) && new Date(c.acessoExpiraEm).getTime() - Date.now() < 7 * 86400000).length

  const abrir = (c: ClienteRegistro) => {
    setEditando(c)
    setForm({ planoId: c.planoId, status: statusReal(c), expira: dataInput(c.acessoExpiraEm), observacoes: c.observacoes ?? '' })
    setExtras(new Set(liberacoes.filter((x) => x.userId === c.userId && x.ativo).map((x) => x.produtoId)))
  }
  const salvar = async () => {
    if (!sessao || !editando) return
    setSalvando(true); setErro(null)
    try {
      const expira = form.expira ? new Date(`${form.expira}T23:59:59`).toISOString() : null
      await atualizarAcessoCliente(sessao, editando.userId, { planoId: form.planoId, statusAcesso: form.status as ClienteRegistro['statusAcesso'], acessoExpiraEm: expira, observacoes: form.observacoes || null })
      await Promise.all(produtos.map((p) => definirProdutoCliente(sessao, editando.userId, p.id, extras.has(p.id))))
      setEditando(null); await carregar()
    } catch (e) { setErro((e as Error).message) }
    finally { setSalvando(false) }
  }
  if (!sessao || !admin) return null

  return <section className="adm-clientes">
    <header className="adm-cabecalho"><div><span className="rot">Central de clientes</span><h2>Acessos e assinaturas</h2><p>Controle planos, vencimentos e produtos liberados em um só lugar.</p></div><button onClick={() => void carregar()} disabled={carregando}>{carregando ? 'Atualizando…' : '↻ Atualizar'}</button></header>
    {erro && <div className="ger-erro">{erro}</div>}
    <div className="adm-kpis"><article><span>Clientes cadastrados</span><strong>{clientes.length}</strong><small>base completa</small></article><article className="ok"><span>Acessos ativos</span><strong>{ativos}</strong><small>liberados agora</small></article><article className="alerta"><span>Vencem em 7 dias</span><strong>{vencendo}</strong><small>pedem atenção</small></article><article className="perigo"><span>Expirados</span><strong>{expirados}</strong><small>sem acesso operacional</small></article></div>
    <div className="adm-filtros"><label>⌕<input placeholder="Buscar nome, e-mail, telefone ou CPF" value={busca} onChange={(e) => setBusca(e.target.value)} /></label><select value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="todos">Todos os status</option><option value="ativo">Ativos</option><option value="suspenso">Suspensos</option><option value="expirado">Expirados</option><option value="cancelado">Cancelados</option></select></div>
    <div className="adm-tabela"><div className="adm-linha cab"><span>Cliente</span><span>Plano</span><span>Status</span><span>Validade</span><span>Extras</span><span>Operações</span><span /></div>
      {visiveis.map((c) => { const info = porCliente.get(c.userId); const qtdExtras = liberacoes.filter((x) => x.userId === c.userId && x.ativo).length; const st = statusReal(c); return <button className="adm-linha" key={c.userId} onClick={() => abrir(c)}><span className="adm-pessoa"><i>{(c.nome || c.email || '?').slice(0, 1).toUpperCase()}</i><b>{c.nome || 'Sem nome'}<small>{c.email}</small></b></span><span>{planos.find((p) => p.id === c.planoId)?.nome ?? c.planoId}</span><span><em className={`adm-status ${st}`}>{st}</em></span><span>{dataCurta(c.acessoExpiraEm)}</span><span>{qtdExtras ? `${qtdExtras} liberado${qtdExtras > 1 ? 's' : ''}` : 'Nenhum'}</span><span>{info?.operacoes.toLocaleString('pt-BR') ?? 0}</span><span className="adm-seta">›</span></button> })}
      {!carregando && visiveis.length === 0 && <div className="adm-vazio">Nenhum cliente encontrado.</div>}
    </div>
    {editando && <div className="adm-modal-fundo" onMouseDown={() => setEditando(null)}><section className="adm-modal" onMouseDown={(e) => e.stopPropagation()}><header><div className="adm-pessoa"><i>{(editando.nome || editando.email || '?').slice(0, 1).toUpperCase()}</i><b>{editando.nome || 'Sem nome'}<small>{editando.email}</small></b></div><button onClick={() => setEditando(null)}>×</button></header><div className="adm-form"><label><span>Plano</span><select value={form.planoId} onChange={(e) => setForm({ ...form, planoId: e.target.value })}>{planos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label><label><span>Status do acesso</span><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="ativo">Ativo</option><option value="suspenso">Suspenso</option><option value="expirado">Expirado</option><option value="cancelado">Cancelado</option></select></label><label><span>Expira em</span><input type="date" value={form.expira} onChange={(e) => setForm({ ...form, expira: e.target.value })} /></label></div><div className="adm-extras"><span className="rot">Produtos e extras liberados</span>{produtos.map((p) => <label key={p.id}><input type="checkbox" checked={extras.has(p.id)} onChange={() => setExtras((atual) => { const n = new Set(atual); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })} /><span><b>{p.nome}</b><small>{p.categoria}</small></span></label>)}</div><label className="adm-notas"><span>Observações internas</span><textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} placeholder="Anotações visíveis somente para administradores" /></label><footer><span>Cadastrado em {dataCurta(editando.criadoEm)}</span><button onClick={() => void salvar()} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar alterações'}</button></footer></section></div>}
  </section>
}
