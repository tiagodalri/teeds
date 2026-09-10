/** Regressões de apresentação: sem navegador, credenciais ou chamadas de rede.
 * Executar na raiz: node scripts/teste-robot-workspace.mjs
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporario = await mkdtemp(join(tmpdir(), 'teeds-robot-regression-'))
let aprovados = 0

function teste(nome, executar) {
  executar()
  aprovados += 1
  console.log(`✓ ${nome}`)
}

const historico = Array.from({ length: 12 }, (_, indice) => ({
  n: 512 - indice,
  contractId: 9000 - indice,
  quando: 1_783_000_000_000 - indice * 1000,
  valor: 0.35,
  lucro: 1,
  ganhou: true,
  entrada: 6492.12,
  saida: 6492.14,
  digitoEntrada: 2,
  digitoSaida: 4,
  esperou: 1,
  contractType: 'DIGITOVER',
  barreira: 3,
}))

const estado = {
  rodando: true,
  emOperacao: false,
  operacoes: 512,
  vitorias: 300,
  derrotas: 212,
  perdasSeguidas: 0,
  resultado: 53.39,
  movimentado: 400,
  valorAtual: 0.35,
  aguardando: 'Procurando entrada',
  motivoParada: null,
  registros: [],
  digitos: [1, 2, 4],
  curva: [0, 21, 53.39],
  condicao: null,
  ultimoLucro: 1,
  historico,
  emCurso: null,
  ticksAnalisados: 25,
  latenciaMedia: null,
  falha: null,
}

const config = {
  valorInicial: 0.35,
  valorAoVencer: 0.35,
  fatorGale: 0.05,
  galeApos: 3,
  valorMaximo: 20,
  takeProfit: 100,
  stopLoss: 100,
  maxOperacoes: 0,
}

const sessao = (id, alteracoes = {}) => ({
  id,
  roboId: 'ag2',
  roboNome: 'Robô de teste',
  contaId: 'DOT90001234',
  demo: true,
  moeda: 'USD',
  origem: 'navegador',
  config,
  erro: null,
  estado,
  ...alteracoes,
})

try {
  // Todo o React fica no mesmo bundle: nenhum hook duplicado por resolução
  // de dependência. A marca é definida no build, como no aplicativo real.
  for (const marca of ['teeds', 'omni']) {
    const saida = join(temporario, `${marca}.mjs`)
    await build({
      stdin: {
        contents: `export { resumirSessoes, RobotOverview } from './src/components/RobotOverview.tsx';
          export { RobotLive } from './src/components/RobotLive.tsx';
          export { RobotCatalog } from './src/components/RobotCatalog.tsx';
          export { WorkspaceNav } from './src/components/WorkspaceNav.tsx';
          export { createElement } from 'react';
          export { renderToStaticMarkup } from 'react-dom/server';`,
        resolveDir: raiz,
        loader: 'tsx',
      },
      outfile: saida,
      bundle: true,
      platform: 'node',
      format: 'esm',
      jsx: 'automatic',
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/', VITE_MARCA: marca }) },
      banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
      logLevel: 'silent',
    })
    const { resumirSessoes, RobotOverview, RobotLive, RobotCatalog, WorkspaceNav, createElement, renderToStaticMarkup } = await import(pathToFileURL(saida).href)
    const verificar = (nome, executar) => teste(`${marca}: ${nome}`, executar)
    const render = (componente, props) => renderToStaticMarkup(createElement(componente, props))
    verificar('catálogo mostra somente os modelos da marca e uma seleção', () => {
      const html = render(RobotCatalog, { selected: 'ag2', onSelect() {}, onCompare() {} })
      assert.equal((html.match(/class="robot-model-heading"/g) ?? []).length, marca === 'teeds' ? 7 : 4)
      assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1)
      assert.equal(html.includes('The Palm'), marca === 'teeds')
      assert.ok(!html.includes('% de chance'))
    })
    verificar('catálogo não permite preparar mais painéis quando estão ocupados', () => {
      const html = render(RobotCatalog, { selected: 'ag2', onSelect() {}, onCompare() {}, indisponivel: true })
      assert.equal((html.match(/disabled=""/g) ?? []).length, marca === 'teeds' ? 7 : 4)
      assert.ok(html.includes('Todos os painéis estão ocupados'))
    })
    verificar('menu sem Operações e Administração exclusiva para ADM', () => {
      const cliente = render(WorkspaceNav, { page: 'robos', admin: false, onNavigate() {} })
      const admin = render(WorkspaceNav, { page: 'robos', admin: true, onNavigate() {} })
      assert.ok(!cliente.includes('Operações') && !admin.includes('Operações'))
      assert.ok(!cliente.includes('Administração') && admin.includes('Administração'))
    })
    const linhas = (html) => [...(html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((item) => item[1])
    const props = {
      estado,
      config,
      moeda: 'USD',
      estrategiaId: 'ag2',
      nomeEstrategia: 'Robô de teste',
      ativo: 'Volatility 75 (1s)',
      titulo: 'Robô 1',
      regra: 'menor que 3',
      ganhaCom: (digito) => digito < 3,
      contaDaSessao: { contaId: 'DOT90001234', demo: true, moeda: 'USD' },
      onExpandir: () => {},
    }

    verificar('resumo vazio não inventa saldo', () => {
      assert.deepEqual(resumirSessoes([]), [])
      const html = render(RobotOverview, { sessoes: [] })
      assert.match(html, /Nenhuma sessão em execução/)
      assert.doesNotMatch(html, /0,00/)
    })
    verificar('conta, ambiente e moeda nunca são somados entre si', () => {
      const grupos = resumirSessoes([
        sessao('a'),
        sessao('b', { contaId: 'DOT90005678' }),
        sessao('c', { demo: false }),
        sessao('d', { moeda: 'EUR' }),
      ])
      assert.equal(grupos.length, 4)
      assert.ok(grupos.every(grupo => grupo.ativos === 1 && grupo.resultado === 53.39 && grupo.operacoes === 512))
    })
    verificar('IDs duplicados não dobram resultados e a última versão prevalece', () => {
      const grupos = resumirSessoes([sessao('a'), sessao('a', { estado: { ...estado, resultado: 8 } }), sessao('b')])
      assert.equal(grupos.length, 1)
      assert.equal(grupos[0].ativos, 2)
      assert.equal(grupos[0].resultado, 61.39)
      assert.equal(grupos[0].operacoes, 1024)
    })
    verificar('sessões paradas são excluídas inclusive após duplicata ativa', () => {
      assert.deepEqual(resumirSessoes([sessao('a'), sessao('a', { estado: { ...estado, rodando: false } })]), [])
    })
    verificar('totais ausentes não aparecem como zero ou soma parcial', () => {
      const grupos = resumirSessoes([sessao('a'), sessao('b', { estado: { rodando: true } })])
      assert.equal(grupos[0].ativos, 2)
      assert.equal(grupos[0].resultado, null)
      assert.equal(grupos[0].operacoes, null)
      const html = render(RobotOverview, { sessoes: [sessao('b', { estado: { rodando: true } })] })
      assert.match(html, /Indisponível/)
      assert.doesNotMatch(html, /0,00/)
    })
    verificar('resumo usa totais oficiais mesmo com histórico truncado', () => {
      const [grupo] = resumirSessoes([sessao('a')])
      assert.equal(grupo.resultado, 53.39)
      assert.equal(grupo.operacoes, 512)
      assert.notEqual(grupo.resultado, historico.reduce((soma, operacao) => soma + operacao.lucro, 0))
    })

    const compacto = render(RobotLive, props)
    verificar('cartão mostra cinco operações e acesso ao histórico', () => {
      assert.equal(linhas(compacto).length, 5)
      assert.match(compacto, /Últimas operações/)
      assert.match(compacto, /Ver histórico \(12\)/)
      assert.match(compacto, />Focar<\/button>/)
    })
    verificar('modo foco mostra todo o histórico disponível', () => {
      const foco = render(RobotLive, { ...props, expandido: true })
      assert.equal(linhas(foco).length, 12)
      assert.match(foco, /Histórico disponível/)
      assert.match(foco, />Ver todos<\/button>/)
    })
    verificar('conta e resultado são identificados sem expor conta inteira', () => {
      assert.match(compacto, /tv-account-label demo[^>]*>DEMO · conta …1234/)
      assert.doesNotMatch(compacto, /DOT90001234/)
      assert.match(compacto, /tv-resultado-resumo[\s\S]*?<b class="up">\+53,39 <small>USD/)
      const realNegativo = render(RobotLive, { ...props, estado: { ...estado, resultado: -19.65 }, contaDaSessao: { contaId: 'CR12345678', demo: false, moeda: 'USD' } })
      assert.match(realNegativo, /tv-account-label real[^>]*>REAL · conta …5678/)
      assert.match(realNegativo, /tv-resultado-resumo[\s\S]*?<b class="down">−19,65/)
      assert.doesNotMatch(realNegativo, /CR12345678/)
    })
    verificar('acumulado recente coincide com resultado total após truncamento', () => {
      assert.match(linhas(compacto)[0], /data-label="Acumulado" class="up">\+53,39/)
      assert.match(linhas(compacto)[1], /data-label="Acumulado" class="up">\+52,39/)
      const negativo = render(RobotLive, { ...props, estado: { ...estado, resultado: -19.65 } })
      assert.match(linhas(negativo)[0], /data-label="Acumulado" class="down">−19,65/)
    })
    verificar('sessão sem histórico não cria linhas fictícias', () => {
      const html = render(RobotLive, { ...props, estado: { ...estado, operacoes: 0, resultado: 0, historico: [], curva: [] } })
      assert.equal(linhas(html).length, 0)
      assert.match(html, /Nenhuma ainda/)
    })
  }
  console.log(`\n${aprovados} verificações aprovadas. Nenhum servidor acessado.`)
} finally {
  await rm(temporario, { recursive: true, force: true })
}
