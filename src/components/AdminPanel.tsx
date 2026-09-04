import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import {
  atualizarAcessoCliente, criarAcessoCliente, definirProdutoCliente, listarClientes,
  listarPlanos, listarProdutos, listarProdutosClientes, salvarPlano, salvarProduto,
  type ClienteProdutoRegistro, type ClienteRegistro, type PlanoRegistro, type ProdutoRegistro,
} from '../core/teeds/clientes'

type Aba = 'visao' | 'clientes' | 'acessos' | 'planos' | 'produtos' | 'comissoes'
const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const data = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR') : 'Sem vencimento'
const dataInput = (iso?: string | null) => iso ? iso.slice(0, 10) : ''
const expirou = (c: ClienteRegistro) => !!c.acessoExpiraEm && Date.parse(c.acessoExpiraEm) < Date.now()
const status = (c: ClienteRegistro) => expirou(c) && c.statusAcesso === 'ativo' ? 'expirado' : c.statusAcesso
const moeda = (centavos: number | null) => centavos == null ? 'Grátis' : (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function AdminPanel({ sessao, comissoes }: { sessao: SessaoTeeds; comissoes?: ReactNode }) {
  const [aba, setAba] = useState<Aba>('visao')
  const [clientes, setClientes] = useState<ClienteRegistro[]>([])
  const [planos, setPlanos] = useState<PlanoRegistro[]>([])
  const [produtos, setProdutos] = useState<ProdutoRegistro[]>([])
  const [liberacoes, setLiberacoes] = useState<ClienteProdutoRegistro[]>([])
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [cliente, setCliente] = useState<ClienteRegistro | null>(null)
  const [clienteForm, setClienteForm] = useState({ planoId: 'essencial', status: 'ativo', expira: '', observacoes: '' })
  const [extras, setExtras] = useState<Set<string>>(new Set())
  const [novo, setNovo] = useState({ nome: '', email: '', telefone: '', cpf: '', senha: '', planoId: 'essencial', expira: '' })
  const [planoForm, setPlanoForm] = useState<PlanoRegistro | null>(null)
  const [produtoForm, setProdutoForm] = useState<ProdutoRegistro | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = async () => {
    setCarregando(true); setErro(null)
    try {
      const [c, p, pr, l] = await Promise.all([listarClientes(sessao), listarPlanos(sessao), listarProdutos(sessao), listarProdutosClientes(sessao)])
      setClientes(c); setPlanos(p); setProdutos(pr); setLiberacoes(l)
    } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }
  useEffect(() => { void carregar() }, [sessao.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const ativos = clientes.filter((c) => status(c) === 'ativo').length
  const expirados = clientes.filter((c) => status(c) === 'expirado').length
  const vencendo = clientes.filter((c) => c.acessoExpiraEm && !expirou(c) && Date.parse(c.acessoExpiraEm) - Date.now() <= 7 * 864e5).length
  const visiveis = useMemo(() => clientes.filter((c) => {
    const q = busca.trim().toLowerCase()
    return (!q || `${c.nome} ${c.email} ${c.telefone} ${c.cpf}`.toLowerCase().includes(q)) && (filtro === 'todos' || status(c) === filtro)
  }), [clientes, busca, filtro])

  const abrirCliente = (c: ClienteRegistro) => {
    setCliente(c); setClienteForm({ planoId: c.planoId, status: status(c), expira: dataInput(c.acessoExpiraEm), observacoes: c.observacoes ?? '' })
    setExtras(new Set(liberacoes.filter((x) => x.userId === c.userId && x.ativo).map((x) => x.produtoId)))
  }
  const salvarCliente = async () => {
    if (!cliente) return
    setSalvando(true); setErro(null)
    try {
      await atualizarAcessoCliente(sessao, cliente.userId, { planoId: clienteForm.planoId, statusAcesso: clienteForm.status as ClienteRegistro['statusAcesso'], acessoExpiraEm: clienteForm.expira ? new Date(`${clienteForm.expira}T23:59:59`).toISOString() : null, observacoes: clienteForm.observacoes || null })
      await Promise.all(produtos.map((p) => definirProdutoCliente(sessao, cliente.userId, p.id, extras.has(p.id))))
      setCliente(null); setSucesso('Acesso atualizado com sucesso.'); await carregar()
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }
  const criar = async () => {
    if (!novo.nome.trim() || !novo.email.trim() || novo.senha.length < 6) { setErro('Preencha nome, e-mail e uma senha provisória com pelo menos 6 caracteres.'); return }
    setSalvando(true); setErro(null); setSucesso(null)
    try {
      const r = await criarAcessoCliente(sessao, novo)
      if (r.userId) await atualizarAcessoCliente(sessao, r.userId, { planoId: novo.planoId, statusAcesso: 'ativo', acessoExpiraEm: novo.expira ? new Date(`${novo.expira}T23:59:59`).toISOString() : null, observacoes: null })
      setNovo({ nome: '', email: '', telefone: '', cpf: '', senha: '', planoId: 'essencial', expira: '' })
      setSucesso(r.precisaConfirmar ? 'Acesso criado. O cliente precisa confirmar o e-mail antes de entrar.' : 'Acesso criado e liberado com sucesso.')
      await carregar(); setAba('clientes')
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }
  const gravarPlano = async () => { if (!planoForm?.nome.trim()) return; setSalvando(true); try { await salvarPlano(sessao, { ...planoForm, id: planoForm.id || slug(planoForm.nome) }); setPlanoForm(null); setSucesso('Plano salvo.'); await carregar() } catch(e){setErro((e as Error).message)} finally{setSalvando(false)} }
  const gravarProduto = async () => { if (!produtoForm?.nome.trim()) return; setSalvando(true); try { await salvarProduto(sessao, { ...produtoForm, id: produtoForm.id || slug(produtoForm.nome) }); setProdutoForm(null); setSucesso('Produto salvo.'); await carregar() } catch(e){setErro((e as Error).message)} finally{setSalvando(false)} }

  const tabelaClientes = <><div className="adm-filtros"><label>⌕<input placeholder="Buscar nome, e-mail, telefone ou CPF" value={busca} onChange={(e) => setBusca(e.target.value)} /></label><select value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="todos">Todos os status</option><option value="ativo">Ativos</option><option value="suspenso">Suspensos</option><option value="expirado">Expirados</option><option value="cancelado">Cancelados</option></select></div><div className="adm-tabela"><div className="adm-linha cab"><span>Cliente</span><span>Plano</span><span>Status</span><span>Validade</span><span>Extras</span><span>Cadastro</span><span /></div>{visiveis.map((c) => { const n = liberacoes.filter((x) => x.userId === c.userId && x.ativo).length; const st = status(c); return <button className="adm-linha" key={c.userId} onClick={() => abrirCliente(c)}><span className="adm-pessoa"><i>{(c.nome || c.email || '?')[0].toUpperCase()}</i><b>{c.nome || 'Sem nome'}<small>{c.email}</small></b></span><span>{planos.find((p) => p.id === c.planoId)?.nome ?? c.planoId}</span><span><em className={`adm-status ${st}`}>{st}</em></span><span>{data(c.acessoExpiraEm)}</span><span>{n ? `${n} liberado${n > 1 ? 's' : ''}` : 'Nenhum'}</span><span>{data(c.criadoEm)}</span><span className="adm-seta">›</span></button>})}{!carregando && !visiveis.length && <div className="adm-vazio">Nenhum cliente encontrado.</div>}</div></>

  return <div className="admin-shell">
    <aside className="admin-sidebar"><div><span className="rot">Painel de controle</span><h2>Administração</h2><p>Gestão completa da Teeds</p></div><nav>{([['visao','Visão geral','⌂'],['clientes','Clientes','◎'],['acessos','Criar acesso','＋'],['planos','Planos','▣'],['produtos','Produtos','◇'],['comissoes','Comissões','↗']] as [Aba,string,string][]).map(([id,nome,ico]) => <button key={id} className={aba === id ? 'on' : ''} onClick={() => setAba(id)}><i>{ico}</i><span>{nome}</span>{id === 'clientes' && <b>{clientes.length}</b>}</button>)}</nav><small>Somente administradores podem visualizar e alterar estes dados.</small></aside>
    <main className="admin-main"><header className="admin-top"><div><span className="rot">Teeds Admin</span><h1>{aba === 'visao' ? 'Visão geral' : aba === 'clientes' ? 'Gestão de clientes' : aba === 'acessos' ? 'Criar novo acesso' : aba === 'planos' ? 'Planos e assinaturas' : aba === 'produtos' ? 'Catálogo de produtos' : 'Comissões e resultados'}</h1><p>{aba === 'visao' ? 'Tudo que precisa de atenção, em um só lugar.' : aba === 'clientes' ? 'Consulte, filtre e edite acessos existentes.' : aba === 'acessos' ? 'Cadastre uma pessoa e defina sua liberação inicial.' : aba === 'planos' ? 'Configure as opções comerciais da plataforma.' : aba === 'produtos' ? 'Gerencie os itens e extras do Marketplace.' : 'Acompanhe volume, operações e comissões da sua conta.'}</p></div><button className="admin-refresh" onClick={() => void carregar()} disabled={carregando}>↻ {carregando ? 'Atualizando…' : 'Atualizar'}</button></header>
      {erro && <div className="ger-erro">{erro}<button onClick={() => setErro(null)}>×</button></div>}{sucesso && <div className="admin-sucesso">✓ {sucesso}<button onClick={() => setSucesso(null)}>×</button></div>}
      {aba === 'visao' && <><div className="adm-kpis"><article><span>Clientes cadastrados</span><strong>{clientes.length}</strong><small>base completa</small></article><article className="ok"><span>Acessos ativos</span><strong>{ativos}</strong><small>liberados agora</small></article><article className="alerta"><span>Vencem em 7 dias</span><strong>{vencendo}</strong><small>pedem atenção</small></article><article className="perigo"><span>Expirados</span><strong>{expirados}</strong><small>sem acesso</small></article></div><div className="admin-grid"><section className="admin-card"><header><div><span className="rot">Clientes recentes</span><h3>Últimos cadastros</h3></div><button onClick={() => setAba('clientes')}>Ver todos →</button></header>{clientes.slice(0,5).map(c=><button className="admin-mini" key={c.userId} onClick={()=>abrirCliente(c)}><span className="adm-pessoa"><i>{(c.nome||c.email||'?')[0].toUpperCase()}</i><b>{c.nome||'Sem nome'}<small>{c.email}</small></b></span><em className={`adm-status ${status(c)}`}>{status(c)}</em></button>)}</section><section className="admin-card"><header><div><span className="rot">Atalhos</span><h3>Ações rápidas</h3></div></header><button className="admin-quick primary" onClick={()=>setAba('acessos')}><i>＋</i><span><b>Criar novo acesso</b><small>Cadastrar e liberar um cliente</small></span></button><button className="admin-quick" onClick={()=>{setPlanoForm({id:'',nome:'',duracaoDias:30,ativo:true});setAba('planos')}}><i>▣</i><span><b>Novo plano</b><small>Definir duração e disponibilidade</small></span></button><button className="admin-quick" onClick={()=>{setProdutoForm({id:'',nome:'',categoria:'robo',precoCentavos:19700,ativo:true});setAba('produtos')}}><i>◇</i><span><b>Novo produto</b><small>Adicionar item ao catálogo</small></span></button></section></div></>}
      {aba === 'clientes' && <section className="admin-card full"><header><div><span className="rot">Base completa</span><h3>{clientes.length} clientes cadastrados</h3></div><button className="admin-primary" onClick={()=>setAba('acessos')}>＋ Novo cliente</button></header>{tabelaClientes}</section>}
      {aba === 'acessos' && <section className="admin-form-page"><div className="admin-form-intro"><span>01</span><h3>Dados do cliente</h3><p>O e-mail será usado para entrar na plataforma.</p></div><div className="admin-form-grid"><label><span>Nome completo *</span><input value={novo.nome} onChange={e=>setNovo({...novo,nome:e.target.value})} placeholder="Nome e sobrenome" /></label><label><span>E-mail de acesso *</span><input type="email" value={novo.email} onChange={e=>setNovo({...novo,email:e.target.value})} placeholder="cliente@email.com" /></label><label><span>Telefone</span><input value={novo.telefone} onChange={e=>setNovo({...novo,telefone:e.target.value})} placeholder="(00) 00000-0000" /></label><label><span>CPF</span><input value={novo.cpf} onChange={e=>setNovo({...novo,cpf:e.target.value})} placeholder="000.000.000-00" /></label><label><span>Senha provisória *</span><input type="password" value={novo.senha} onChange={e=>setNovo({...novo,senha:e.target.value})} placeholder="Mínimo de 6 caracteres" /></label><label><span>Plano inicial</span><select value={novo.planoId} onChange={e=>setNovo({...novo,planoId:e.target.value})}>{planos.filter(p=>p.ativo).map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</select></label><label><span>Validade do acesso</span><input type="date" value={novo.expira} onChange={e=>setNovo({...novo,expira:e.target.value})} /></label></div><footer><p>O cliente poderá alterar a senha depois pelo fluxo “Esqueci minha senha”.</p><button className="admin-primary" onClick={()=>void criar()} disabled={salvando}>{salvando?'Criando…':'Criar e liberar acesso'}</button></footer></section>}
      {aba === 'planos' && <section className="admin-catalogo"><header><button className="admin-primary" onClick={()=>setPlanoForm({id:'',nome:'',duracaoDias:30,ativo:true})}>＋ Criar plano</button></header><div>{planos.map(p=><article key={p.id}><span className="admin-icon">▣</span><div><h3>{p.nome}</h3><p>{p.duracaoDias ? `${p.duracaoDias} dias de acesso` : 'Acesso sem vencimento'}</p></div><em className={`adm-status ${p.ativo?'ativo':'cancelado'}`}>{p.ativo?'Ativo':'Inativo'}</em><button onClick={()=>setPlanoForm(p)}>Editar</button></article>)}</div></section>}
      {aba === 'produtos' && <section className="admin-catalogo"><header><button className="admin-primary" onClick={()=>setProdutoForm({id:'',nome:'',categoria:'robo',precoCentavos:19700,ativo:true})}>＋ Criar produto</button></header><div>{produtos.map(p=><article key={p.id}><span className="admin-icon">◇</span><div><h3>{p.nome}</h3><p>{p.categoria} · {moeda(p.precoCentavos)}</p></div><em className={`adm-status ${p.ativo?'ativo':'cancelado'}`}>{p.ativo?'Ativo':'Inativo'}</em><button onClick={()=>setProdutoForm(p)}>Editar</button></article>)}</div></section>}
      {aba === 'comissoes' && <section className="admin-commission">{comissoes}</section>}
    </main>
    {cliente && <div className="adm-modal-fundo" onMouseDown={()=>setCliente(null)}><section className="adm-modal" onMouseDown={e=>e.stopPropagation()}><header><div className="adm-pessoa"><i>{(cliente.nome||cliente.email||'?')[0].toUpperCase()}</i><b>{cliente.nome||'Sem nome'}<small>{cliente.email}</small></b></div><button onClick={()=>setCliente(null)}>×</button></header><div className="adm-form"><label><span>Plano</span><select value={clienteForm.planoId} onChange={e=>setClienteForm({...clienteForm,planoId:e.target.value})}>{planos.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</select></label><label><span>Status</span><select value={clienteForm.status} onChange={e=>setClienteForm({...clienteForm,status:e.target.value})}><option value="ativo">Ativo</option><option value="suspenso">Suspenso</option><option value="expirado">Expirado</option><option value="cancelado">Cancelado</option></select></label><label><span>Expira em</span><input type="date" value={clienteForm.expira} onChange={e=>setClienteForm({...clienteForm,expira:e.target.value})}/></label></div><div className="adm-extras"><span className="rot">Produtos e extras liberados</span>{produtos.map(p=><label key={p.id}><input type="checkbox" checked={extras.has(p.id)} onChange={()=>setExtras(x=>{const n=new Set(x);n.has(p.id)?n.delete(p.id):n.add(p.id);return n})}/><span><b>{p.nome}</b><small>{p.categoria}</small></span></label>)}</div><label className="adm-notas"><span>Observações internas</span><textarea value={clienteForm.observacoes} onChange={e=>setClienteForm({...clienteForm,observacoes:e.target.value})}/></label><footer><span>Cadastrado em {data(cliente.criadoEm)}</span><button onClick={()=>void salvarCliente()} disabled={salvando}>{salvando?'Salvando…':'Salvar alterações'}</button></footer></section></div>}
    {planoForm && <Editor titulo={planoForm.id?'Editar plano':'Novo plano'} fechar={()=>setPlanoForm(null)} salvar={gravarPlano} salvando={salvando}><label><span>Nome</span><input value={planoForm.nome} onChange={e=>setPlanoForm({...planoForm,nome:e.target.value})}/></label><label><span>Duração em dias</span><input type="number" min="1" placeholder="Vazio = sem vencimento" value={planoForm.duracaoDias??''} onChange={e=>setPlanoForm({...planoForm,duracaoDias:e.target.value?Number(e.target.value):null})}/></label><label className="admin-check"><input type="checkbox" checked={planoForm.ativo} onChange={e=>setPlanoForm({...planoForm,ativo:e.target.checked})}/> Plano disponível</label></Editor>}
    {produtoForm && <Editor titulo={produtoForm.id?'Editar produto':'Novo produto'} fechar={()=>setProdutoForm(null)} salvar={gravarProduto} salvando={salvando}><label><span>Nome</span><input value={produtoForm.nome} onChange={e=>setProdutoForm({...produtoForm,nome:e.target.value})}/></label><label><span>Categoria</span><select value={produtoForm.categoria} onChange={e=>setProdutoForm({...produtoForm,categoria:e.target.value})}><option value="robo">Robô</option><option value="mentoria">Mentoria</option><option value="ferramenta">Ferramenta</option><option value="indicador">Indicador</option><option value="sala">Sala de sinais</option></select></label><label><span>Preço (R$)</span><input type="number" min="0" step="0.01" value={(produtoForm.precoCentavos??0)/100} onChange={e=>setProdutoForm({...produtoForm,precoCentavos:Math.round(Number(e.target.value)*100)})}/></label><label className="admin-check"><input type="checkbox" checked={produtoForm.ativo} onChange={e=>setProdutoForm({...produtoForm,ativo:e.target.checked})}/> Produto disponível</label></Editor>}
  </div>
}

function Editor({titulo,fechar,salvar,salvando,children}:{titulo:string;fechar:()=>void;salvar:()=>void;salvando:boolean;children:ReactNode}) { return <div className="adm-modal-fundo" onMouseDown={fechar}><section className="adm-modal admin-editor" onMouseDown={e=>e.stopPropagation()}><header><h3>{titulo}</h3><button onClick={fechar}>×</button></header><div className="admin-editor-form">{children}</div><footer><span>As alterações entram em vigor imediatamente.</span><button onClick={salvar} disabled={salvando}>{salvando?'Salvando…':'Salvar'}</button></footer></section></div> }
