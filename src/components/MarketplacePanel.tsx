import { useMemo, useState } from 'react'

type Categoria = 'Todos' | 'Robôs' | 'Mentorias' | 'Sinais' | 'Ferramentas'

type Produto = {
  id: string
  categoria: Exclude<Categoria, 'Todos'>
  nome: string
  descricao: string
  preco: string
  periodo?: string
  selo: string
  simbolo: string
  tom: 'ouro' | 'verde' | 'rubi' | 'azul' | 'violeta'
  itens: string[]
  destaque?: boolean
}

const PRODUTOS: Produto[] = [
  {
    id: 'quantum-pro', categoria: 'Robôs', nome: 'Quantum Pro',
    descricao: 'Automação premium com leitura adaptativa, proteção de sessão e parâmetros exclusivos.',
    preco: 'Em breve', selo: 'Robô premium', simbolo: 'QP', tom: 'ouro', destaque: true,
    itens: ['Estratégias exclusivas', 'Painel de risco avançado', 'Atualizações incluídas'],
  },
  {
    id: 'mesa-elite', categoria: 'Mentorias', nome: 'Mesa Elite',
    descricao: 'Acompanhamento próximo para transformar leitura, disciplina e execução em um processo claro.',
    preco: 'Lista de espera', selo: 'Vagas limitadas', simbolo: 'ME', tom: 'violeta',
    itens: ['Encontros ao vivo', 'Plano operacional pessoal', 'Análise de desempenho'],
  },
  {
    id: 'sala-prime', categoria: 'Sinais', nome: 'Sala Prime',
    descricao: 'Contexto de mercado, oportunidades selecionadas e acompanhamento durante as sessões.',
    preco: 'Em breve', periodo: '/ mês', selo: 'Ao vivo', simbolo: 'SP', tom: 'verde',
    itens: ['Alertas em tempo real', 'Leitura comentada', 'Resumo diário'],
  },
  {
    id: 'first-block-pro', categoria: 'Robôs', nome: 'First Block Pro',
    descricao: 'Uma evolução do First Block com controles adicionais e gestão refinada de recuperação.',
    preco: 'Em breve', selo: 'Nova geração', simbolo: '01', tom: 'azul',
    itens: ['Faixa de 0 a 4', 'Gestão inteligente', 'Relatórios completos'],
  },
  {
    id: 'second-block-pro', categoria: 'Robôs', nome: 'Second Block Pro',
    descricao: 'Estratégia dedicada à faixa superior, com proteção dinâmica e leitura contínua.',
    preco: 'Em breve', selo: 'Nova geração', simbolo: '02', tom: 'rubi',
    itens: ['Faixa de 5 a 9', 'Proteção dinâmica', 'Sessões configuráveis'],
  },
  {
    id: 'risk-lab', categoria: 'Ferramentas', nome: 'Risk Lab',
    descricao: 'Planejador profissional de banca, cenários e limites para decisões mais consistentes.',
    preco: 'Em breve', selo: 'Ferramenta', simbolo: 'RL', tom: 'ouro',
    itens: ['Simulação de cenários', 'Mapa de exposição', 'Plano exportável'],
  },
]

const CATEGORIAS: Categoria[] = ['Todos', 'Robôs', 'Mentorias', 'Sinais', 'Ferramentas']

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
            <span><i /> Novidades chegando em breve</span>
          </div>
        </div>
        <div className="market-hero-produto" aria-hidden="true">
          <div className="market-orbita"><i /><i /><i /></div>
          <div className="market-emblema"><small>TEEDS</small><b>QP</b><span>QUANTUM PRO</span></div>
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
                <span className="market-card-num">0{indice + 1}</span>
                <div className="market-card-arte"><i /><b>{produto.simbolo}</b><small>TEEDS ORIGINAL</small></div>
                <span className="market-card-tipo">{produto.categoria}</span>
              </button>
              <div className="market-card-corpo">
                <div><span>{produto.categoria}</span><h3>{produto.nome}</h3></div>
                <p>{produto.descricao}</p>
                <footer>
                  <strong>{produto.preco}<small>{produto.periodo}</small></strong>
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
                <strong>{selecionado.preco}<small>{selecionado.periodo}</small></strong>
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
