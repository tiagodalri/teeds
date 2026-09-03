import { useEffect, useMemo, useState } from 'react'
import { listarProdutos } from '../core/teeds/clientes'
import type { SessaoTeeds } from '../core/teeds/conta'

type Categoria = 'Todos' | 'Robôs' | 'Mentorias' | 'Ferramentas'

type Produto = {
  id: string
  categoria: Exclude<Categoria, 'Todos'>
  nome: string
  descricao: string
  preco: string
  precoDe: string
  desconto: string
  imagem: string
  periodo?: string
  selo: string
  simbolo: string
  tom: 'ouro' | 'verde' | 'rubi' | 'azul' | 'violeta'
  itens: string[]
  destaque?: boolean
}

const PRODUTOS: Produto[] = [
  {
    id: 'mentoria-alavancagem', categoria: 'Mentorias', nome: 'Mentoria de Alavancagem',
    descricao: 'Acompanhamento premium para estruturar crescimento, proteger capital e executar um plano de evolução consistente.',
    precoDe: 'R$ 1.497', preco: 'R$ 997', desconto: '33% OFF', imagem: 'mentoria-alavancagem.jpg', selo: 'Vagas limitadas', simbolo: 'MA', tom: 'ouro', destaque: true,
    itens: ['Encontros estratégicos ao vivo', 'Plano individual de evolução', 'Acompanhamento de performance'],
  },
  {
    id: 'gerenciamento-estrategico', categoria: 'Mentorias', nome: 'Gerenciamento Estratégico',
    descricao: 'Método prático para transformar banca, metas e limites em um plano operacional claro e sustentável.',
    precoDe: 'R$ 797', preco: 'R$ 497', desconto: '38% OFF', imagem: 'gerenciamento-estrategico.jpg', selo: 'Método Teeds', simbolo: 'GE', tom: 'violeta',
    itens: ['Plano de banca personalizado', 'Definição de meta e proteção', 'Rotina de revisão de resultados'],
  },
  {
    id: 'robos-exclusivos', categoria: 'Robôs', nome: 'Acesso a Robôs Exclusivos',
    descricao: 'Escolha automações premium com estratégias distintas e gestão integrada ao ecossistema Teeds.',
    precoDe: 'R$ 297', preco: 'R$ 197', desconto: '34% OFF', imagem: 'robos-exclusivos.jpg', periodo: 'por robô', selo: 'Coleção premium', simbolo: 'RX', tom: 'verde',
    itens: ['Um robô premium à escolha', 'Atualizações da estratégia', 'Painel completo de acompanhamento'],
  },
  {
    id: 'teeds-atlas', categoria: 'Robôs', nome: 'Teeds Atlas',
    descricao: 'Robô premium com motor adaptativo e proteção inteligente para navegar diferentes condições de mercado.',
    precoDe: 'R$ 997', preco: 'R$ 697', desconto: '30% OFF', imagem: 'teeds-atlas.jpg', selo: 'Robô premium', simbolo: 'TA', tom: 'azul',
    itens: ['Motor adaptativo exclusivo', 'Proteção inteligente de sessão', 'Atualizações premium incluídas'],
  },
  {
    id: 'simulador-treino', categoria: 'Ferramentas', nome: 'Simulador de Treinamento',
    descricao: 'Ambiente seguro para praticar estratégias e decisões usando dinheiro fictício antes de operar.',
    precoDe: 'R$ 597', preco: 'R$ 397', desconto: '34% OFF', imagem: 'simulador-treino.jpg', selo: 'Treino sem risco', simbolo: 'ST', tom: 'azul',
    itens: ['Saldo totalmente fictício', 'Cenários próximos do mercado', 'Relatório de evolução'],
  },
  {
    id: 'indicadores-manuais', categoria: 'Ferramentas', nome: 'Indicadores para Operações Manuais',
    descricao: 'Pacote visual de indicadores para apoiar leitura de tendência, força e zonas importantes no gráfico.',
    precoDe: 'R$ 797', preco: 'R$ 497', desconto: '38% OFF', imagem: 'indicadores-manuais.jpg', selo: 'Pack profissional', simbolo: 'IM', tom: 'rubi',
    itens: ['Indicadores selecionados', 'Configurações recomendadas', 'Guia prático de utilização'],
  },
]

const CATEGORIAS: Categoria[] = ['Todos', 'Robôs', 'Mentorias', 'Ferramentas']
const capaProduto = (arquivo: string) => `${import.meta.env.BASE_URL}marketplace/${arquivo}`

const categoriaBanco = (valor: string): Produto['categoria'] => valor === 'robo' ? 'Robôs' : valor === 'mentoria' ? 'Mentorias' : 'Ferramentas'
const precoBR = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export function MarketplacePanel({ sessao }: { sessao?: SessaoTeeds | null }) {
  const [categoria, setCategoria] = useState<Categoria>('Todos')
  const [selecionado, setSelecionado] = useState<Produto | null>(null)
  const [interesse, setInteresse] = useState<string | null>(null)
  const [catalogo, setCatalogo] = useState<Produto[]>(PRODUTOS)
  useEffect(() => {
    if (!sessao) return
    listarProdutos(sessao).then((itens) => {
      const ativos = itens.filter((p) => p.ativo).map((p, indice) => {
        const base = PRODUTOS.find((x) => x.id === p.id)
        const valor = p.precoCentavos ?? 0
        return {
          ...(base ?? {
            id: p.id, descricao: 'Produto exclusivo integrado ao ecossistema Teeds.', imagem: 'teeds-atlas.jpg',
            selo: 'Teeds Original', simbolo: p.nome.split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase(),
            tom: (['ouro','verde','rubi','azul','violeta'] as const)[indice % 5], itens: ['Acesso integrado à plataforma', 'Conteúdo e atualizações exclusivas'],
          }),
          id: p.id, nome: p.nome, categoria: categoriaBanco(p.categoria), preco: precoBR(valor),
          precoDe: precoBR(Math.ceil(valor * 1.45 / 100) * 100), desconto: '31% OFF',
        } as Produto
      })
      if (ativos.length) setCatalogo(ativos)
    }).catch(() => {})
  }, [sessao?.usuario.id])
  const destaque = catalogo.find((produto) => produto.destaque) ?? catalogo[0]
  const visiveis = useMemo(() => categoria === 'Todos'
    ? catalogo
    : catalogo.filter((produto) => produto.categoria === categoria), [categoria, catalogo])

  const registrarInteresse = (produto: Produto) => {
    setInteresse(produto.id)
    setSelecionado(null)
  }

  return (
    <main className="marketplace">
      <section className="market-hero">
        <div className="market-hero-conteudo">
          <span className="market-eyebrow">Teeds Marketplace</span>
          <h1>O próximo nível da sua <em>operação.</em></h1>
          <p>Robôs premium, acompanhamento especializado e ferramentas criadas para evoluir cada etapa da sua jornada.</p>
          <div className="market-hero-acoes">
            <button onClick={() => destaque && setSelecionado(destaque)}>Conhecer lançamento</button>
            <span><i /> Condições especiais de lançamento</span>
          </div>
        </div>
        <div className="market-hero-produto" aria-hidden="true">
          <div className="market-orbita"><i /><i /><i /></div>
          <div className="market-emblema"><small>TEEDS</small><b>MA</b><span>MENTORIA</span></div>
          <span className="market-edicao">FOUNDERS EDITION · 01</span>
        </div>
      </section>

      <section className="market-vitrine">
        <header className="market-cabecalho">
          <div><span>Explore o ecossistema</span><h2>Produtos em destaque</h2></div>
          <nav aria-label="Categorias do marketplace">
            {CATEGORIAS.map((item) => (
              <button key={item} className={categoria === item ? 'on' : ''} onClick={() => setCategoria(item)}>{item}</button>
            ))}
          </nav>
        </header>

        <div className="market-grade">
          {visiveis.map((produto, indice) => (
            <article key={produto.id} className={`market-card ${produto.tom}`}>
              <button className="market-card-capa" onClick={() => setSelecionado(produto)} aria-label={`Conhecer ${produto.nome}`}>
                <img src={capaProduto(produto.imagem)} alt="" loading="lazy" />
                <span className="market-card-selo">{produto.selo}</span>
                <span className="market-card-desconto">{produto.desconto}</span>
                <span className="market-card-num">0{indice + 1}</span>
                <div className="market-card-identidade"><b>{produto.simbolo}</b><small>TEEDS ORIGINAL</small></div>
                <span className="market-card-tipo">{produto.categoria}</span>
              </button>
              <div className="market-card-corpo">
                <div><span>{produto.categoria}</span><h3>{produto.nome}</h3></div>
                <p>{produto.descricao}</p>
                <footer>
                  <span className="market-preco"><del>{produto.precoDe}</del><strong>{produto.preco}<small>{produto.periodo}</small></strong></span>
                  <button onClick={() => setSelecionado(produto)}>Ver detalhes <span>→</span></button>
                </footer>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="market-garantia">
        <div><i>◇</i><span><b>Ecossistema Teeds</b><small>Tudo integrado à sua plataforma</small></span></div>
        <div><i>◎</i><span><b>Experiência premium</b><small>Produtos selecionados e exclusivos</small></span></div>
        <div><i>↗</i><span><b>Evolução contínua</b><small>Novos recursos e coleções</small></span></div>
      </section>

      {selecionado && (
        <div className="market-modal-fundo" role="presentation" onMouseDown={() => setSelecionado(null)}>
          <section className={`market-modal ${selecionado.tom}`} role="dialog" aria-modal="true" aria-labelledby="market-modal-titulo" onMouseDown={(e) => e.stopPropagation()}>
            <button className="market-modal-fechar" onClick={() => setSelecionado(null)} aria-label="Fechar">×</button>
            <div className="market-modal-arte">
              <img src={capaProduto(selecionado.imagem)} alt="" />
              <span>{selecionado.selo}</span><b>{selecionado.simbolo}</b><small>TEEDS ORIGINAL</small>
            </div>
            <div className="market-modal-corpo">
              <span className="market-eyebrow">{selecionado.categoria}</span>
              <h2 id="market-modal-titulo">{selecionado.nome}</h2>
              <p>{selecionado.descricao}</p>
              <ul>{selecionado.itens.map((item) => <li key={item}>✓ <span>{item}</span></li>)}</ul>
              <div className="market-modal-compra">
                <span className="market-preco"><del>{selecionado.precoDe}</del><strong>{selecionado.preco}<small>{selecionado.periodo}</small></strong><em>{selecionado.desconto}</em></span>
                <button onClick={() => registrarInteresse(selecionado)}>Quero ser avisado</button>
              </div>
              <small className="market-aviso">Nenhuma cobrança será realizada. Avisaremos quando esta oferta estiver disponível.</small>
            </div>
          </section>
        </div>
      )}

      {interesse && (
        <div className="market-toast" role="status"><i>✓</i><span><b>Interesse registrado</b><small>Você verá a novidade aqui quando ela for lançada.</small></span><button onClick={() => setInteresse(null)}>×</button></div>
      )}
    </main>
  )
}
