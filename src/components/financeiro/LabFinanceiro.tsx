/**
 * Laboratório: Administração › Financeiro com o banco em memória (laboratorio.html?tela=financeiro).
 *   &estado=trava (padrão: aberto) | criar (1º acesso do geral) | provisoria (senha 'provisoria1') | sem (sem acesso) | vazio
 *   &papel=leitor|editor (padrão: dono)
 * Senha do laboratório: 'financeiro1'.
 */
import { useMemo, useState } from 'react'
import type { Acesso, Anexo, Candidato, Categoria, Conta, DadosFin, FinApi, Historico, Lancamento, MeuAcesso, NovoLancamento, Papel, Projeto, Socio } from '../../core/teeds/financeiro'
import { hoje, somarDias, somarMeses } from '../../core/teeds/financeiro'
import { FinanceiroPainel } from './FinanceiroPainel'
import '../admin-topo.css'

const q = new URLSearchParams(location.search)
const ESTADO = q.get('estado') ?? 'aberto'
const PAPEL = (q.get('papel') ?? 'dono') as Papel
const id = () => crypto.randomUUID()

function semente(vazio: boolean): DadosFin {
  const cat = (tipo: 'entrada' | 'saida', nome: string, cor: string, ordem: number): Categoria => ({ id: id(), marca: 'globalfly', tipo, nome, cor, ordem, ativo: true })
  const categorias = [
    cat('saida', 'Anúncios', '#2F6FDB', 1), cat('saida', 'Ferramentas e assinaturas', '#7C5CC4', 2), cat('saida', 'Servidores e tecnologia', '#0E8C9B', 3),
    cat('saida', 'Equipe e prestadores', '#C2410C', 4), cat('saida', 'Comissões de parceiros', '#B78D39', 5), cat('saida', 'Impostos e taxas', '#DC1F2E', 6),
    cat('saida', 'Contabilidade e jurídico', '#64748B', 7), cat('saida', 'Produção de conteúdo', '#DB2777', 8), cat('saida', 'Outras despesas', '#94A3B8', 9),
    cat('entrada', 'Markup da Deriv', '#0B9E4A', 1), cat('entrada', 'Vendas de planos', '#B78D39', 2), cat('entrada', 'Comissão de afiliado', '#2F8F72', 3), cat('entrada', 'Outras receitas', '#64748B', 4),
  ]
  const contas: Conta[] = [
    { id: id(), marca: 'globalfly', nome: 'Conta PJ', tipo: 'banco', saldo_inicial: 2500, cor: '#1E3D6E', ordem: 1, ativo: true },
    { id: id(), marca: 'globalfly', nome: 'Cakto', tipo: 'plataforma', saldo_inicial: 0, cor: '#2F8F72', ordem: 2, ativo: true },
  ]
  const socios: Socio[] = vazio ? [] : [
    { id: id(), marca: 'globalfly', nome: 'Tiago Dal Ri', percentual: 50, cor: '#1E3D6E', ordem: 1, ativo: true },
    { id: id(), marca: 'globalfly', nome: 'Victor Cordeiro', percentual: 25, cor: '#B78D39', ordem: 2, ativo: true },
    { id: id(), marca: 'globalfly', nome: 'Naor Bezerra', percentual: 25, cor: '#0E8C9B', ordem: 3, ativo: true },
  ]
  const projetos: Projeto[] = [
    { id: id(), marca: 'globalfly', nome: 'Projeto Victor', cor: '#B78D39', parceiro: 'v', ordem: 1, ativo: true },
    { id: id(), marca: 'globalfly', nome: 'Projeto Naor', cor: '#0E8C9B', parceiro: 'n', ordem: 2, ativo: true },
    { id: id(), marca: 'globalfly', nome: 'Projeto Douglas', cor: '#7C5CC4', parceiro: 'd', ordem: 3, ativo: true },
  ]
  if (vazio) return { categorias, contas, socios, projetos, lancamentos: [] }
  const c = (n: string) => categorias.find((x) => x.nome === n)!.id
  const h = hoje()
  const l: Lancamento[] = []
  const add = (x: Partial<Lancamento> & Pick<Lancamento, 'tipo' | 'descricao' | 'valor' | 'vencimento'>) => l.push({
    id: id(), marca: 'globalfly', pago_em: null, categoria_id: null, conta_id: contas[0].id, socio_id: null, projeto_id: null, pago_fora: false, contraparte: null, forma: null, observacoes: null,
    grupo: null, parcela: null, parcelas: null, anexos: [], origem: null, origem_id: null, criado_por: 'u1', criado_em: new Date().toISOString(), atualizado_por: 'u1', atualizado_em: new Date().toISOString(), ...x,
  })
  // as cobranças do Facebook (as 31 dos prints de 10/11/2026), pagas no cartão do Tiago
  const fb = [12.68, 13.7, 12.79, 13.78, 20.83, 13.48, 21.34, 17.11, 13.83, 12.81, 17.51, 13.42, 17.06, 49.5, 42.87, 42.84, 12.76, 12.53, 75.18, 71.37, 44.35, 47.13, 111.51, 114.57, 102.45, 75.25, 63.8, 63.78, 73.27, 80.62, 68.31]
  fb.forEach((v, i) => { const d = somarDias(h, -Math.floor(i / 4)); add({ tipo: 'despesa', descricao: 'Anúncios do Facebook', valor: v, vencimento: d, pago_em: d, categoria_id: c('Anúncios'), conta_id: null, socio_id: socios[0].id, contraparte: 'Meta Platforms', forma: 'Cartão de crédito', projeto_id: projetos[0].id, anexos: i === 0 ? [{ path: 'x', nome: 'fatura-meta.pdf', tipo: 'application/pdf', tamanho: 182000 }] : [] }) })
  for (let m = 0; m < 6; m++) {
    const d = somarMeses(h, -m)
    add({ tipo: 'receita', descricao: 'Markup da Deriv', valor: [4820.5, 3910.2, 3120, 2280.4, 1650, 980][m], vencimento: d, pago_em: m === 0 ? null : d, categoria_id: c('Markup da Deriv'), contraparte: 'Deriv', forma: 'Transferência' })
    add({ tipo: 'despesa', descricao: 'Servidor DigitalOcean', valor: 312.4, vencimento: d, pago_em: m === 0 ? null : d, categoria_id: c('Servidores e tecnologia'), contraparte: 'DigitalOcean', forma: 'Cartão de crédito', grupo: 'g1', parcela: 6 - m })
    add({ tipo: 'despesa', descricao: 'Supabase Pro', valor: 145.9, vencimento: d, pago_em: m === 0 ? null : d, categoria_id: c('Ferramentas e assinaturas'), contraparte: 'Supabase', forma: 'Cartão de crédito' })
    if (m > 0) add({ tipo: 'receita', descricao: 'Vendas Black e Prestige', valor: [0, 2970, 1782, 1485, 891, 594][m], vencimento: d, pago_em: d, categoria_id: c('Vendas de planos'), conta_id: contas[1].id, contraparte: 'Cakto', forma: 'Plataforma', projeto_id: projetos[m % 2].id })
    add({ tipo: 'despesa', descricao: 'Anúncios do Naor', valor: [0, 640, 520, 410, 300, 180][m] || 220, vencimento: d, pago_em: d, categoria_id: c('Anúncios'), conta_id: null, contraparte: 'Meta Platforms', forma: 'Cartão de crédito', projeto_id: projetos[1].id, pago_fora: true })
  }
  add({ tipo: 'despesa', descricao: 'Contabilidade de outubro', valor: 650, vencimento: somarDias(h, -6), categoria_id: c('Contabilidade e jurídico'), contraparte: 'Escritório Alfa', forma: 'Boleto' })
  add({ tipo: 'despesa', descricao: 'Edição dos vídeos da live', valor: 1200, vencimento: somarDias(h, 4), categoria_id: c('Produção de conteúdo'), contraparte: 'Estúdio Norte', forma: 'Pix' })
  add({ tipo: 'receita', descricao: 'Comissão de afiliado', valor: 860.75, vencimento: somarDias(h, 9), categoria_id: c('Comissão de afiliado'), contraparte: 'Deriv', forma: 'Transferência' })
  add({ tipo: 'retirada', descricao: 'Distribuição de lucro de setembro', valor: 1500, vencimento: somarMeses(h, -1), pago_em: somarMeses(h, -1), socio_id: socios[1].id, forma: 'Pix' })
  add({ tipo: 'aporte', descricao: 'Aporte para os anúncios', valor: 3000, vencimento: somarMeses(h, -2), pago_em: somarMeses(h, -2), socio_id: socios[2].id, forma: 'Pix' })
  return { categorias, contas, socios, projetos, lancamentos: l }
}

function apiEmMemoria(): FinApi {
  let dados = semente(ESTADO === 'vazio')
  let destravado = ESTADO === 'aberto' || ESTADO === 'vazio'
  let acesso: MeuAcesso = ESTADO === 'criar' ? { admin: true, geral: true, tem: false }
    : ESTADO === 'sem' ? { admin: true, geral: false, tem: false }
      : { admin: true, geral: PAPEL === 'dono', tem: true, ativo: true, papel: PAPEL, marcas: ['globalfly'], trocar_senha: ESTADO === 'provisoria' }
  let senha = ESTADO === 'provisoria' ? 'provisoria1' : 'financeiro1'
  let falhas = 0
  const hist: Historico[] = []
  let acessos: Acesso[] = [
    { email: 'tiago@exemplo.com', nome: 'Tiago Dal Ri', papel: 'dono', marcas: ['*'], ativo: true, trocar_senha: false, bloqueado: false, ultimo_acesso: new Date().toISOString(), criado_em: new Date().toISOString(), eu: true },
    { email: 'victor@exemplo.com', nome: 'Victor Cordeiro', papel: 'leitor', marcas: ['globalfly'], ativo: true, trocar_senha: true, bloqueado: false, ultimo_acesso: null, criado_em: new Date().toISOString(), eu: false },
  ]
  const candidatos: Candidato[] = [{ email: 'naor@exemplo.com', nome: 'Naor Bezerra Santos', marcas: ['globalfly'] }, { email: 'victor@exemplo.com', nome: 'Victor Cordeiro', marcas: ['globalfly'] }, { email: 'saymonn@exemplo.com', nome: 'Saymonn Borba', marcas: ['globalfly'] }]
  const espera = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 180))
  const registrar = (acao: Historico['acao'], antes: Lancamento | null, depois: Lancamento | null) => hist.unshift({ id: hist.length + 1, lancamento_id: (depois ?? antes)!.id, acao, por: 'u1', em: new Date().toISOString(), antes, depois })
  return {
    marca: 'globalfly',
    meuAcesso: () => espera(acesso),
    criarMinhaSenha: async (s) => { senha = s; acesso = { admin: true, geral: true, tem: true, ativo: true, papel: 'dono', marcas: ['*'], trocar_senha: false } },
    entrar: async (s) => {
      await espera(null)
      if (s !== senha) { falhas++; return falhas >= 5 ? { erro: 'bloqueado', ate: new Date(Date.now() + 9e5).toISOString() } : { erro: 'senha', restam: 5 - falhas } }
      falhas = 0; destravado = !acesso.trocar_senha
      return { token: 'lab', expira_em: new Date(Date.now() + 432e5).toISOString(), papel: acesso.papel!, marcas: acesso.marcas!, trocar_senha: !!acesso.trocar_senha }
    },
    trocarSenha: async (a, n) => { if (a !== senha) return { erro: 'senha', restam: 4 }; if (a === n) return { erro: 'igual' }; senha = n; acesso = { ...acesso, trocar_senha: false }; destravado = true; return { ok: true } },
    sair: async () => { destravado = false },
    destravado: () => destravado,
    preparar: async () => undefined,
    ler: () => espera(structuredClone(dados)),
    salvarLancamentos: async (l: NovoLancamento[]) => {
      const novos = l.map((x) => ({ ...x, id: x.id ?? id(), criado_por: 'u1', criado_em: new Date().toISOString(), atualizado_por: 'u1', atualizado_em: new Date().toISOString() }) as Lancamento)
      dados = { ...dados, lancamentos: [...novos, ...dados.lancamentos] }
      novos.forEach((n) => registrar('criou', null, n))
      return espera(novos)
    },
    atualizarLancamento: async (lid, campos) => {
      dados = { ...dados, lancamentos: dados.lancamentos.map((x) => { if (x.id !== lid) return x; const n = { ...x, ...campos } as Lancamento; registrar(!x.pago_em && n.pago_em ? 'pagou' : 'editou', x, n); return n }) }
    },
    atualizarGrupo: async (g, de, campos) => { dados = { ...dados, lancamentos: dados.lancamentos.map((x) => x.grupo === g && x.vencimento >= de ? { ...x, ...campos } as Lancamento : x) } },
    apagarLancamentos: async (ids) => { dados.lancamentos.filter((x) => ids.includes(x.id)).forEach((x) => registrar('apagou', x, null)); dados = { ...dados, lancamentos: dados.lancamentos.filter((x) => !ids.includes(x.id)) } },
    salvarCategoria: async (c) => { const n = { id: c.id ?? id(), marca: 'globalfly', ordem: 99, ativo: true, cor: '#64748B', ...c } as Categoria; dados = { ...dados, categorias: c.id ? dados.categorias.map((x) => x.id === c.id ? { ...x, ...c } : x) : [...dados.categorias, n] }; return n },
    salvarConta: async (c) => { const n = { id: c.id ?? id(), marca: 'globalfly', ordem: 99, ativo: true, tipo: 'banco', saldo_inicial: 0, cor: '#1E3D6E', ...c } as Conta; dados = { ...dados, contas: c.id ? dados.contas.map((x) => x.id === c.id ? { ...x, ...c } : x) : [...dados.contas, n] }; return n },
    salvarProjeto: async (p) => { const n = { id: p.id ?? id(), marca: 'globalfly', ordem: 99, ativo: true, cor: '#2F6FDB', parceiro: null, ...p } as Projeto; dados = { ...dados, projetos: p.id ? dados.projetos.map((x) => x.id === p.id ? { ...x, ...p } : x) : [...dados.projetos, n] }; return n },
    salvarSocio: async (s) => { const n = { id: s.id ?? id(), marca: 'globalfly', ordem: 99, ativo: true, percentual: 0, cor: '#B78D39', ...s } as Socio; dados = { ...dados, socios: s.id ? dados.socios.map((x) => x.id === s.id ? { ...x, ...s } : x) : [...dados.socios, n] }; return n },
    historico: () => espera(hist),
    pessoas: () => espera([{ user_id: 'u1', nome: 'Tiago Dal Ri', email: 'tiago@exemplo.com' }]),
    acessos: () => espera(acessos),
    candidatos: () => espera(candidatos),
    darAcesso: async (email, papel, marcas, s) => {
      const c = candidatos.find((x) => x.email === email)
      const j = acessos.find((a) => a.email === email)
      acessos = j ? acessos.map((a) => a.email === email ? { ...a, papel, marcas, ativo: true, trocar_senha: s ? true : a.trocar_senha } : a)
        : [...acessos, { email, nome: c?.nome ?? null, papel, marcas, ativo: true, trocar_senha: true, bloqueado: false, ultimo_acesso: null, criado_em: new Date().toISOString(), eu: false }]
    },
    tirarAcesso: async (email) => { acessos = acessos.map((a) => a.email === email ? { ...a, ativo: false } : a) },
    enviarAnexo: async (_l, f): Promise<Anexo> => espera({ path: `lab/${f.name}`, nome: f.name, tipo: f.type, tamanho: f.size }),
    linkDoAnexo: async () => 'about:blank',
    apagarAnexo: async () => undefined,
  }
}

export default function LabFinanceiro() {
  const api = useMemo(apiEmMemoria, [])
  const [pedido, setPedido] = useState(0)
  return (
    <div className="admin-shell">
      <main className="admin-main" style={{ gridColumn: '1 / -1' }}>
        <header className="admin-top"><div><span className="rot">GlobalFly Trade Admin</span><h1>Financeiro</h1>
          <p>Custos, receitas, contas a pagar e a receber e a divisão do resultado entre os sócios. Protegido por senha individual.</p></div>
          <div className="admin-top-acoes"><button className="admin-refresh" onClick={() => setPedido((n) => n + 1)}>Atualizar</button></div></header>
        <FinanceiroPainel api={api} pedido={pedido} nomeDaPlataforma="GlobalFly Trade" />
      </main>
    </div>
  )
}
