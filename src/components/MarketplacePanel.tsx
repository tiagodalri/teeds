import { useMemo, useState } from 'react'

type Categoria = 'Todos' | 'Robôs' | 'Mentorias' | 'Ferramentas'

type Produto = {
  id: string
  categoria: Exclude<Categoria, 'Todos'>
  nome: string
  descricao: string
  preco: string
  precoDe: string
  desconto: string
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
    precoDe: 'R$ 1.497', preco: 'R$ 997', desconto: '33% OFF', selo: 'Vagas limitadas', simbolo: 'MA', tom: 'ouro', destaque: true,
    itens: ['Encontros estratégicos ao vivo', 'Plano individual de evolução', 'Acompanhamento de performance'],
  },
  {
    id: 'gerenciamento-estrategico', categoria: 'Mentorias', nome: 'Gerenciamento Estratégico',
    descricao: 'Método prático para transformar banca, metas e limites em um plano operacional claro e sustentável.',
    precoDe: 'R$ 797', preco: 'R$ 497', desconto: '38% OFF', selo: 'Método Teeds', simbolo: 'GE', tom: 'violeta',
    itens: ['Plano de banca personalizado', 'Definição de meta e proteção', 'Rotina de revisão de resultados'],
  },
  {
    id: 'robos-exclusivos', categoria: 'Robôs', nome: 'Acesso a Robôs Exclusivos',
    descricao: 'Escolha automações premium com estratégias distintas e gestão integrada ao ecossistema Teeds.',
    precoDe: 'R$ 297', preco: 'R$ 197', desconto: '34% OFF', periodo: 'por robô', selo: 'Coleção premium', simbolo: 'RX', tom: 'verde',
    itens: ['Um robô premium à escolha', 'Atualizações da estratégia', 'Painel completo de acompanhamento'],
  },
  {
    id: 'simulador-treino', categoria: 'Ferramentas', nome: 'Simulador de Treinamento',
    descricao: 'Ambiente seguro para praticar estratégias e decisões usando dinheiro fictício antes de operar.',
    precoDe: 'R$ 597', preco: 'R$ 397', desconto: '34% OFF', selo: 'Treino sem risco', simbolo: 'ST', tom: 'azul',
    itens: ['Saldo totalmente fictício', 'Cenários próximos do mercado', 'Relatório de evolução'],
  },
  {
    id: 'indicadores-manuais', categoria: 'Ferramentas', nome: 'Indicadores para Operações Manuais',
    descricao: 'Pacote visual de indicadores para apoiar leitura de tendência, força e zonas importantes no gráfico.',
    precoDe: 'R$ 797', preco: 'R$ 497', desconto: '38% OFF', selo: 'Pack profissional', simbolo: 'IM', tom: 'rubi',
    itens: ['Indicadores selecionados', 'Configurações recomendadas', 'Guia prático de utilização'],
  },
]

const CATEGORIAS: Categoria[] = ['Todos', 'Robôs', 'Mentorias', 'Ferramentas']

export function MarketplacePanel() {
  const [categoria, setCategoria] = useState<Categoria>('Todos')
  const [selecionado, setSelecionado] = useState<Produto | null>(null)
  const [interesse, setInteresse] = useState<string | null>(null)
  const destaque = PRODUTOS.find((produto) => produto.destaque)!
  const visiveis = useMemo(() => categoria === 'Todos'
    ? PRODUTOS
    : PRODUTOS.filter((produto) => produto.categoria === categoria), [categoria])

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
            <button onClick={() => setSelecionado(destaque)}>Conhecer lançamento</button>
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
                <span className="market-card-selo">{produto.selo}</span>
                <span className="market-card-desconto">{produto.desconto}</span>
                <span className="market-card-num">0{indice + 1}</span>
                <div className="market-card-arte"><i /><b>{produto.simbolo}</b><small>TEEDS ORIGINAL</small></div>
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
            <div className="market-modal-arte"><span>{selecionado.selo}</span><b>{selecionado.simbolo}</b><small>TEEDS ORIGINAL</small></div>
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
