import { ResponsiveImage } from './ResponsiveImage'
import { useEffect, useMemo, useState } from 'react'
import { listarProdutos } from '../core/teeds/clientes'
import type { SessaoTeeds } from '../core/teeds/conta'
import { MARCA } from '../marca'
import { IconeFechar } from './IconeFechar'

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
  /** Página de vendas no modal (só os produtos à venda precisam dela). */
  vendas?: {
    gancho: string
    promessa: string
    numeros: Array<{ valor: string; rotulo: string }>
    beneficios: Array<{ titulo: string; texto: string }>
    passos: Array<{ titulo: string; texto: string }>
    paraQuem: string[]
    objecao: { pergunta: string; resposta: string }
    chamada: string
    garantias: string[]
  }
}

const PRODUTOS: Produto[] = [
  {
    id: 'simulador-treino', categoria: 'Ferramentas', nome: 'Simulador de Treinamento',
    descricao: 'US$ 10.000 fictícios para treinar, errar, acertar e se aperfeiçoar na mesma plataforma em que você opera de verdade. Zerou? Reabastece, sem limite.',
    precoDe: 'R$ 1.200', preco: 'R$ 497', desconto: '59% OFF', imagem: 'simulador-treino.jpg', selo: 'Treino sem risco', simbolo: 'ST', tom: 'azul', destaque: true,
    itens: ['US$ 10.000 fictícios, reabastecimento ilimitado', 'A mesma plataforma, os mesmos ativos, o mesmo gráfico', 'Histórico de cada operação para revisar o que fez'],
    vendas: {
      gancho: 'Erre quanto precisar. Acerte quando for de verdade.',
      promessa: 'Quem opera sem treinar aprende com o próprio dinheiro. O Simulador coloca US$ 10.000 fictícios na sua mão, na mesma tela em que você opera de verdade, para você praticar a estratégia, sentir a pressão da decisão e corrigir o que precisa corrigir antes que custe algo.',
      numeros: [
        { valor: 'US$ 10.000', rotulo: 'de saldo fictício para começar' },
        { valor: 'Ilimitado', rotulo: 'reabastecimento quando chegar a zero' },
        { valor: 'Zero', rotulo: 'risco ao capital real' },
      ],
      beneficios: [
        { titulo: 'Treine como se fosse real', texto: 'Mesmos ativos, mesmo gráfico, mesmos dígitos e mesmos botões. O que você aprende aqui vale lá.' },
        { titulo: 'Erre sem pagar por isso', texto: 'Cada erro no simulador é uma lição de graça. Na conta real, a mesma lição tem preço.' },
        { titulo: 'Repita até virar hábito', texto: 'Zerou o saldo? Reabastece e continua. Sem limite de tentativas, sem esperar, sem custo extra.' },
        { titulo: 'Veja a própria evolução', texto: 'Cada operação fica registrada: entrada, saída, resultado. Você enxerga o padrão dos seus acertos e dos seus erros.' },
        { titulo: 'Teste antes de subir a entrada', texto: 'Vai mudar de estratégia, de ativo ou de valor? Prove a ideia no simulador primeiro.' },
        { titulo: 'Disciplina que dá resultado', texto: 'Quem pratica decide mais rápido e com menos emoção. É isso que separa quem cresce de quem só tenta.' },
      ],
      passos: [
        { titulo: 'Ative', texto: 'O simulador aparece na sua plataforma, com o saldo fictício pronto.' },
        { titulo: 'Treine', texto: 'Opere, erre, acerte, reabasteça, repita. O quanto quiser.' },
        { titulo: 'Opere de verdade', texto: 'Quando estiver consistente, leva a mesma rotina para a conta real.' },
      ],
      paraQuem: [
        'Está começando e quer sentir o mercado sem arriscar nada',
        'Já opera e quer testar uma estratégia nova antes de usar dinheiro',
        'Perde por ansiedade e precisa treinar a decisão até ela ficar fria',
        'Quer aumentar o resultado com método, não com sorte',
      ],
      objecao: {
        pergunta: 'Já tem conta demo na corretora. Por que o Simulador?',
        resposta: 'A demo não tem ritmo de treino: sem reabastecimento controlado, sem o histórico organizado dentro da sua plataforma e sem a rotina de quem está treinando de propósito. O Simulador foi feito para você praticar com intenção, na mesma tela em que vai operar de verdade.',
      },
      chamada: 'Quero meu Simulador',
      garantias: ['Sem cobrança automática por aqui', 'A equipe conclui a compra com você', 'Acesso dentro da sua plataforma'],
    },
  },
  {
    id: 'mentoria-alavancagem', categoria: 'Mentorias', nome: 'Mentoria de Alavancagem',
    descricao: 'Acompanhamento premium para estruturar crescimento, proteger capital e executar um plano de evolução consistente.',
    precoDe: 'R$ 1.497', preco: 'R$ 997', desconto: '33% OFF', imagem: 'mentoria-alavancagem.jpg', selo: 'Vagas limitadas', simbolo: 'MA', tom: 'ouro',
    itens: ['Encontros estratégicos ao vivo', 'Plano individual de evolução', 'Acompanhamento de performance'],
  },
  {
    id: 'gerenciamento-estrategico', categoria: 'Mentorias', nome: 'Gerenciamento Estratégico',
    descricao: 'Método prático para transformar banca, metas e limites em um plano operacional claro e sustentável.',
    precoDe: 'R$ 797', preco: 'R$ 497', desconto: '38% OFF', imagem: 'gerenciamento-estrategico.jpg', selo: `Método ${MARCA.prosa}`, simbolo: 'GE', tom: 'violeta',
    itens: ['Plano de banca personalizado', 'Definição de meta e proteção', 'Rotina de revisão de resultados'],
  },
  {
    id: 'robos-exclusivos', categoria: 'Robôs', nome: 'Acesso a Robôs Exclusivos',
    descricao: `Escolha automações premium com estratégias distintas e gestão integrada ao ecossistema ${MARCA.prosa}.`,
    precoDe: 'R$ 297', preco: 'R$ 197', desconto: '34% OFF', imagem: 'robos-exclusivos.jpg', periodo: 'por robô', selo: 'Coleção premium', simbolo: 'RX', tom: 'verde',
    itens: ['Um robô premium à escolha', 'Atualizações da estratégia', 'Painel completo de acompanhamento'],
  },
  {
    id: 'teeds-atlas', categoria: 'Robôs', nome: `${MARCA.prosa} Atlas`,
    descricao: 'Robô premium com motor adaptativo e proteção inteligente para navegar diferentes condições de mercado.',
    precoDe: 'R$ 997', preco: 'R$ 697', desconto: '30% OFF', imagem: 'robo-atlas.jpg', selo: 'Robô premium', simbolo: 'TA', tom: 'azul',
    itens: ['Motor adaptativo exclusivo', 'Proteção inteligente de sessão', 'Atualizações premium incluídas'],
  },
  {
    id: 'indicadores-manuais', categoria: 'Ferramentas', nome: 'Indicadores para Operações Manuais',
    descricao: 'Pacote visual de indicadores para apoiar leitura de tendência, força e zonas importantes no gráfico.',
    precoDe: 'R$ 797', preco: 'R$ 497', desconto: '38% OFF', imagem: 'indicadores-manuais.jpg', selo: 'Pack profissional', simbolo: 'IM', tom: 'rubi',
    itens: ['Indicadores selecionados', 'Configurações recomendadas', 'Guia prático de utilização'],
  },
]

const CATEGORIAS: Categoria[] = ['Todos', 'Robôs', 'Mentorias', 'Ferramentas']

/**
 * Por enquanto (15/09/2026, a pedido do Tiago) só o Simulador de Treinamento
 * está à venda. Os outros produtos aparecem com a tarja "Esgotado" e não
 * abrem. O disponível vem sempre primeiro na vitrine e em evidência.
 */
const DISPONIVEIS = new Set<string>(['simulador-treino'])
const disponivel = (produto: Pick<Produto, 'id'>) => DISPONIVEIS.has(produto.id)
const ordemDaVitrine = (lista: Produto[]) => [...lista].sort((a, b) => {
  const da = disponivel(a) ? 0 : 1, db = disponivel(b) ? 0 : 1
  if (da !== db) return da - db
  return PRODUTOS.findIndex((p) => p.id === a.id) - PRODUTOS.findIndex((p) => p.id === b.id)
})
const capaProduto = (arquivo: string) => `${import.meta.env.BASE_URL}marketplace/${MARCA.id === 'teeds' && arquivo === 'simulador-treino.jpg' ? 'simulador-treino-v2.jpeg' : arquivo}`

const categoriaBanco = (valor: string): Produto['categoria'] => valor === 'robo' ? 'Robôs' : valor === 'mentoria' ? 'Mentorias' : 'Ferramentas'
const precoBR = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export function MarketplacePanel({ sessao }: { sessao?: SessaoTeeds | null }) {
  const [categoria, setCategoria] = useState<Categoria>('Todos')
  const [selecionado, setSelecionado] = useState<Produto | null>(null)
  const [interesse, setInteresse] = useState<string | null>(null)
  const [catalogo, setCatalogo] = useState<Produto[]>(() => ordemDaVitrine(PRODUTOS))
  useEffect(() => {
    if (!sessao) return
    listarProdutos(sessao).then((itens) => {
      const ativos = itens.filter((p) => p.ativo).map((p, indice) => {
        const base = PRODUTOS.find((x) => x.id === p.id)
        const valor = p.precoCentavos ?? 0
        return {
          ...(base ?? {
            id: p.id, descricao: `Produto exclusivo integrado ao ecossistema ${MARCA.prosa}.`, imagem: 'robo-atlas.jpg',
            selo: `${MARCA.prosa} Original`, simbolo: p.nome.split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase(),
            tom: (['ouro','verde','rubi','azul','violeta'] as const)[indice % 5], itens: ['Acesso integrado à plataforma', 'Conteúdo e atualizações exclusivas'],
          }),
          id: p.id, nome: p.nome, categoria: categoriaBanco(p.categoria), preco: precoBR(valor),
          // O banco só guarda o preço de venda. Quando ele bate com o catálogo local, o
          // "de" e o desconto vêm de lá (ex.: Simulador de R$ 1.200 por R$ 497); senão,
          // estimam-se a partir do preço.
          ...(base && base.preco === precoBR(valor)
            ? { precoDe: base.precoDe, desconto: base.desconto }
            : { precoDe: precoBR(Math.ceil(valor * 1.45 / 100) * 100), desconto: '31% OFF' }),
        } as Produto
      })
      if (ativos.length) setCatalogo(ordemDaVitrine(ativos))
    }).catch(() => {})
  }, [sessao?.usuario.id])
  const destaque = catalogo.find((produto) => disponivel(produto)) ?? catalogo.find((produto) => produto.destaque) ?? catalogo[0]
  const abrir = (produto: Produto) => { if (disponivel(produto)) setSelecionado(produto) }
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
          <span className="market-eyebrow">{MARCA.prosa} Marketplace</span>
          <h1>O próximo nível da sua <em>operação.</em></h1>
          <p>Robôs premium, acompanhamento especializado e ferramentas criadas para evoluir cada etapa da sua jornada.</p>
          <div className="market-hero-acoes">
            <button onClick={() => destaque && abrir(destaque)}>Conhecer o Simulador</button>
            <span><i /> Único produto disponível agora</span>
          </div>
        </div>
        <div className="market-hero-produto" aria-hidden="true">
          <div className="market-orbita"><i /><i /><i /></div>
          <div className="market-emblema"><small>{MARCA.nome}</small><b>ST</b><span>SIMULADOR</span></div>
          <span className="market-edicao">DISPONÍVEL AGORA · 01</span>
        </div>
      </section>

      <section className="market-vitrine">
        <header className="market-cabecalho">
          <div><span>Explore o ecossistema</span><h2>Produtos em destaque</h2></div>
          <nav aria-label="Categorias do marketplace">
            {CATEGORIAS.map((item) => (
              <button key={item} aria-pressed={categoria === item} className={categoria === item ? 'on' : ''} onClick={() => setCategoria(item)}>{item}</button>
            ))}
          </nav>
        </header>

        <div className="market-grade">
          {visiveis.length === 0 && <p role="status">Nenhum produto nesta categoria. <button onClick={() => setCategoria('Todos')}>Ver todos os produtos</button></p>}
          {visiveis.map((produto, indice) => { const aberto = disponivel(produto); return (
            <article key={produto.id} className={`market-card ${produto.tom} ${aberto ? 'disponivel' : 'esgotado'}`} aria-label={aberto ? undefined : `${produto.nome} — esgotado`}>
              <button className={`market-card-capa ${MARCA.id === 'teeds' && produto.imagem === 'simulador-treino.jpg' ? 'market-card-capa-simulador' : ''}`} onClick={() => abrir(produto)} disabled={!aberto} aria-disabled={!aberto}
                aria-label={aberto ? `Conhecer ${produto.nome}` : `${produto.nome}: esgotado no momento`}>
                <ResponsiveImage src={capaProduto(produto.imagem)} alt="" loading="lazy" />
                {!aberto && <span className="market-card-tarja" aria-hidden="true">Esgotado</span>}
                {!aberto && <span className="market-card-selo">{produto.selo}</span>}
                {aberto && <span className="market-card-desconto">{produto.desconto}</span>}
                <span className="market-card-num">0{indice + 1}</span>
                <div className="market-card-identidade"><b>{produto.simbolo}</b><small>{MARCA.nome} ORIGINAL</small></div>
                <span className="market-card-tipo">{produto.categoria}</span>
              </button>
              <div className="market-card-corpo">
                <div>
                  <div className="market-card-meta">
                    <span>{produto.categoria}</span>
                    {aberto && <small className="market-disponibilidade">Disponível agora</small>}
                  </div>
                  <h3>{produto.nome}</h3>
                </div>
                <p>{produto.descricao}</p>
                <footer>
                  <span className="market-preco"><del>{produto.precoDe}</del><strong>{produto.preco}<small>{produto.periodo}</small></strong></span>
                  {aberto
                    ? <button onClick={() => abrir(produto)}>Ver detalhes <span>→</span></button>
                    : <span className="market-card-indisponivel" role="status">Esgotado no momento</span>}
                </footer>
              </div>
            </article>
          ) })}
        </div>
      </section>

      <section className="market-garantia">
        <div><i>◇</i><span><b>Ecossistema {MARCA.prosa}</b><small>Tudo integrado à sua plataforma</small></span></div>
        <div><i>◎</i><span><b>Experiência premium</b><small>Produtos selecionados e exclusivos</small></span></div>
        <div><i>↗</i><span><b>Evolução contínua</b><small>Novos recursos e coleções</small></span></div>
      </section>

      {selecionado && (
        <div className="market-modal-fundo" role="presentation" onMouseDown={() => setSelecionado(null)}>
          <section className={`market-modal ${selecionado.tom}`} role="dialog" aria-modal="true" aria-labelledby="market-modal-titulo" onMouseDown={(e) => e.stopPropagation()}>
            <button className="market-modal-fechar" onClick={() => setSelecionado(null)} aria-label="Fechar"><IconeFechar /></button>
            <div className="market-modal-arte">
              <ResponsiveImage src={capaProduto(selecionado.imagem)} alt="" />
              <span>{selecionado.selo}</span><b>{selecionado.simbolo}</b><small>{MARCA.nome} ORIGINAL</small>
            </div>
            <div className={`market-modal-corpo ${selecionado.vendas ? 'com-vendas' : ''}`}>
              <span className="market-eyebrow">{selecionado.categoria}{selecionado.vendas ? ` · ${selecionado.selo}` : ''}</span>
              <h2 id="market-modal-titulo">{selecionado.nome}</h2>
              {selecionado.vendas ? (
                <div className="market-vendas">
                  <p className="market-vendas-gancho">{selecionado.vendas.gancho}</p>
                  <p className="market-vendas-promessa">{selecionado.vendas.promessa}</p>
                  <div className="market-vendas-numeros">
                    {selecionado.vendas.numeros.map((n) => <div key={n.rotulo}><b>{n.valor}</b><span>{n.rotulo}</span></div>)}
                  </div>
                  <h3>O que muda quando você treina</h3>
                  <ul className="market-vendas-beneficios">
                    {selecionado.vendas.beneficios.map((b) => <li key={b.titulo}><i aria-hidden="true">✓</i><span><b>{b.titulo}</b>{b.texto}</span></li>)}
                  </ul>
                  <h3>Como funciona</h3>
                  <ol className="market-vendas-passos">
                    {selecionado.vendas.passos.map((p, i) => <li key={p.titulo}><i>{i + 1}</i><span><b>{p.titulo}</b>{p.texto}</span></li>)}
                  </ol>
                  <h3>É para você se</h3>
                  <ul className="market-vendas-quem">
                    {selecionado.vendas.paraQuem.map((q) => <li key={q}>{q}</li>)}
                  </ul>
                  <div className="market-vendas-objecao">
                    <b>{selecionado.vendas.objecao.pergunta}</b>
                    <p>{selecionado.vendas.objecao.resposta}</p>
                  </div>
                  <div className="market-vendas-oferta">
                    <div className="market-vendas-preco">
                      <span>De <del>{selecionado.precoDe}</del> por</span>
                      <strong>{selecionado.preco}<small>{selecionado.periodo}</small></strong>
                      <em>{selecionado.desconto} · pagamento único</em>
                    </div>
                    <div className="market-vendas-cta">
                      <button onClick={() => registrarInteresse(selecionado)}>{selecionado.vendas.chamada} <span>→</span></button>
                      <small>Único produto disponível agora. A promoção vale enquanto estiver publicada.</small>
                    </div>
                  </div>
                  <ul className="market-vendas-garantias">
                    {selecionado.vendas.garantias.map((g) => <li key={g}><i aria-hidden="true">◇</i>{g}</li>)}
                  </ul>
                  <small className="market-aviso">Nenhuma cobrança é feita por aqui. Ao confirmar, a equipe {MARCA.prosa} recebe seu pedido e entra em contato para concluir a compra.</small>
                </div>
              ) : (
                <>
                  <p>{selecionado.descricao}</p>
                  <ul>{selecionado.itens.map((item) => <li key={item}>✓ <span>{item}</span></li>)}</ul>
                  <div className="market-modal-compra">
                    <span className="market-preco"><del>{selecionado.precoDe}</del><strong>{selecionado.preco}<small>{selecionado.periodo}</small></strong><em>{selecionado.desconto}</em></span>
                    <button onClick={() => registrarInteresse(selecionado)}>Quero comprar</button>
                  </div>
                  <small className="market-aviso">Nenhuma cobrança é feita por aqui. Ao confirmar, a equipe {MARCA.prosa} recebe seu pedido e entra em contato para concluir a compra.</small>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {interesse && (
        <div className="market-toast" role="status"><i>✓</i><span><b>Pedido registrado</b><small>A equipe {MARCA.prosa} entra em contato para concluir a compra.</small></span><button onClick={() => setInteresse(null)}><IconeFechar /></button></div>
      )}
    </main>
  )
}
