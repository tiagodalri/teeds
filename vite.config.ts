import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { MARCAS, marcaPorId } from './src/marca/marcas'
import { paletaDaMarca, type Paleta } from './scripts/paleta-da-marca'

/**
 * Qual marca este build monta.
 *
 *   npm run build              → Teeds, em docs/
 *   MARCA=omni npm run build   → OMNI,  em docs-omni/
 *
 * Um código, dois sites. Conserto feito uma vez vale para os dois.
 */
const MARCA = marcaPorId(process.env.MARCA)
const SAIDA = MARCA.id === 'teeds' ? 'docs' : `docs-${MARCA.id}`

const RAIZ = resolve(__dirname)
const SRC = join(RAIZ, 'src')
const CASCA = join(SRC, 'casca')

/**
 * A casca por marca.
 *
 * Todo arquivo de tela mora em src/. Se existir uma copia dele em
 * src/casca/<marca>/<mesmo caminho>, o build DAQUELA marca usa a copia e o
 * das outras nem fica sabendo. E o que permite "muda a tela inicial da OMNI"
 * sem encostar na Teeds: copia o arquivo para a pasta da OMNI e altera so la.
 *
 * O motor (src/core, servidor, banco) tambem passaria por aqui se alguem
 * copiasse — nao faca isso. Casca e tela; motor e um so. Ver src/casca/LEIA-ME.md.
 *
 * `@padrao/...` e a saida de emergencia: dentro de uma copia, importa o
 * arquivo compartilhado original, ignorando a propria copia. Serve para
 * "e a tela padrao, mais um detalhe".
 */
const EXTENSOES = ['', '.tsx', '.ts', '.css', '/index.tsx', '/index.ts']
function arquivoExistente(base: string): string | null {
  for (const ext of EXTENSOES) {
    const f = base + ext
    if (existsSync(f) && statSync(f).isFile()) return f
  }
  return null
}
function cascaPorMarca() {
  const pastaDaMarca = join(CASCA, MARCA.id)
  return {
    name: 'teeds:casca-por-marca',
    enforce: 'pre' as const,
    resolveId(origem: string, importador: string | undefined) {
      if (origem.startsWith('@padrao/')) return arquivoExistente(join(SRC, origem.slice('@padrao/'.length)))
      if (!importador || !origem.startsWith('.')) return null

      // Quem importa? Se for uma copia dentro da casca, finge que esta no
      // lugar do original — assim os imports relativos da copia continuam
      // valendo sem precisar reescrever nenhum.
      let deOnde = importador.split('?')[0]
      const dentroDaCasca = relative(pastaDaMarca, deOnde)
      if (!dentroDaCasca.startsWith('..') && !dentroDaCasca.startsWith('/')) deOnde = join(SRC, dentroDaCasca)

      const alvo = resolve(dirname(deOnde), origem)
      const rel = relative(SRC, alvo)
      if (rel.startsWith('..') || rel.startsWith('casca/') || rel.startsWith('casca')) return null

      const copia = arquivoExistente(join(pastaDaMarca, rel))
      if (copia) return copia
      // Sem copia: se o importador era uma copia, aponta para o original
      // compartilhado explicitamente (o Vite nao acharia a partir da casca).
      if (deOnde !== importador.split('?')[0]) return arquivoExistente(alvo)
      return null
    },
  }
}

// A pasta do projeto fica num volume que nao permite remover arquivos,
// entao usamos nomes fixos (sobrescreve em vez de recriar) e desligamos a
// limpeza da pasta de saida. O cache do navegador e resolvido por uma
// versao anexada no index.html a cada build (ver scripts/versao.mjs).
/* Cor de fundo do app instalado e nome curto na tela inicial, por marca.
   Antes eram ternarios de duas marcas: a GlobalFly sairia instalada como
   "OMNI" (16/10/2026). */
const FUNDO_DA_MARCA: Record<string, string> = { teeds: '#090a0d', omni: '#081525', globalfly: '#051528' }
/* Paleta do manual da GlobalFly (Brand Book v1.0): toda cor herdada da base
   vira a família equivalente — vermelho → Alerta, quentes → Ouro GF,
   verdes → Positivo, frios → Aço/Ardósia. Ver scripts/paleta-da-marca.ts. */
const PALETAS: Record<string, Paleta> = {
  globalfly: {
    manter: ['#051528', '#B78D39', '#9CB1C7', '#F3F0E9', '#29445F',
      // verde e vermelho vivos (21/10/2026, pedido do Tiago): escuro/painel azul, claro e velas
      '#1FD17F', '#FF5A64', '#0A9F5F', '#E5303C', '#16C784', '#EA3943',
      // marinho vivo das superfícies (19/10/2026)
      '#020B1D', '#020E24', '#041029', '#0A1C40', '#0F234D', '#203765', '#576B94', '#96AFD4', '#1E3D6E',
      // a Deriv é marca de terceiro: o vermelho dela não se mexe
      '#ff444f', '#ff5a63',
      // o vermelho do "ao vivo" (20/10/2026, pedido do Tiago: mais vivo que o Alerta)
      '#E5383B'],
    // 21/10/2026: vermelho e verde vivos, sem o tom exato (antes #C95F5F e #2F8F72,
    // que apagavam até o gráfico); cada cor herdada mantém a luz e ganha a saturação
    vermelho: { h: 356, s: 0.82 },
    quente: { h: 40, s: 0.53, exata: [183 / 255, 141 / 255, 57 / 255] }, // Ouro GF #B78D39
    verde: { h: 151, s: 0.74 },
    frio: { h: 218, s: 0.55 },
    neutroEscuro: 220,
    neutroClaro: 43,
    // marinho vivo (19/10/2026): #020E24, #0A1C40, #0F234D, #203765, #576B94
    superficies: [[0.075, 0.88], [0.145, 0.72], [0.18, 0.68], [0.26, 0.52], [0.46, 0.26]],
  },
}
/* Telas de abertura do iPhone/iPad: só a marca que gerou a pasta
   (scripts/pwa-globalfly.mjs) recebe os <link>. Sem elas o iOS abre o app
   instalado numa tela branca. */
function telasDeAbertura(): string {
  const lista = join(__dirname, 'public', `pwa-${MARCA.id}`, 'splash', 'telas.json')
  if (!existsSync(lista)) return ''
  const telas = JSON.parse(readFileSync(lista, 'utf8')) as [number, number, number][]
  // iPad (167 e 152) usa o ícone do tamanho dele: ampliar o de 180 borra.
  const extras = [167, 152].filter((t) => existsSync(join(__dirname, 'public', `pwa-${MARCA.id}`, `icon-${t}.png`)))
    .map((t) => `    <link rel="apple-touch-icon" sizes="${t}x${t}" href="${MARCA.base}pwa-${MARCA.id}/icon-${t}.png" />\n`).join('')
  return extras + telas.map(([w, h, e]) =>
    `    <link rel="apple-touch-startup-image" media="screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${e}) and (orientation: portrait)" href="${MARCA.base}pwa-${MARCA.id}/splash/${w * e}x${h * e}.png" />\n`,
  ).join('') + '  '
}
/* A abertura do app instalado (marcas com `appNativo`), 19/10/2026.
   O iPhone mostra a tela de abertura (a imagem acima) só até a página
   nascer; depois vinha um vazio azul até o React montar. Agora a página
   nasce com a MESMA imagem, no mesmo lugar, e ela se dissolve quando o app
   está pronto (main.tsx). Só no app instalado: no navegador não aparece.
   A barrinha dourada só surge se o carregamento passar de 0,7 s. */
function aberturaDoApp(): string {
  const img = join(__dirname, 'public', `pwa-${MARCA.id}`, 'abertura.png')
  if (!MARCA.appNativo || !existsSync(img)) return ''
  const fundo = FUNDO_DA_MARCA[MARCA.id] ?? '#090a0d'
  return `<div id="app-abertura" aria-hidden="true"><img src="${MARCA.base}pwa-${MARCA.id}/abertura.png" alt="" /><i></i></div>
    <style>
      #app-abertura{position:fixed;inset:0;z-index:2147483000;display:none;place-items:center;background:${fundo};transition:opacity .5s cubic-bezier(.4,0,.2,1),visibility .5s}
      @media (display-mode: standalone){#app-abertura{display:grid}html{background:${fundo}}}
      #app-abertura img{width:58vw;height:auto;transition:transform .5s cubic-bezier(.4,0,.2,1)}
      @media (min-width:700px){#app-abertura img{width:36vw}}
      #app-abertura i{position:absolute;left:50%;bottom:calc(72px + env(safe-area-inset-bottom));width:48px;height:2px;margin-left:-24px;border-radius:2px;background:rgba(183,141,57,.22);overflow:hidden;opacity:0;animation:abre-surge .3s .7s forwards}
      #app-abertura i::after{content:'';position:absolute;top:0;bottom:0;width:40%;background:#B78D39;animation:abre-corre 1.1s ease-in-out infinite}
      #app-abertura.saindo{opacity:0;visibility:hidden}
      #app-abertura.saindo img{transform:scale(1.04)}
      @keyframes abre-surge{to{opacity:1}}
      @keyframes abre-corre{from{transform:translateX(-100%)}to{transform:translateX(250%)}}
      @media (prefers-reduced-motion:reduce){#app-abertura,#app-abertura img{transition:none}#app-abertura i::after{animation:none}}
    </style>`
}
/* Legenda das telas que o Android mostra antes de instalar (pwa-<marca>/telas/).
   Só telas sem resultado de operação: nada de sessão de exemplo com ganho. */
const ROTULO_DA_TELA: Record<string, string> = { entrar: 'Entrar na plataforma', robos: 'Escolha o seu robô e inicie as operações', 'sala-de-aula': 'Sala de aula com o treinamento completo' }
const NOME_CURTO: Record<string, string> = { teeds: 'Teeds', omni: 'OMNI', globalfly: 'GlobalFly' }

export default defineConfig({
  base: MARCA.base,
  plugins: [
    cascaPorMarca(),
    paletaDaMarca(PALETAS[MARCA.id]),
    react(),
    {
      // O nome e o emblema entram no index.html na hora do build. O titulo da
      // aba e o icone tambem sao marca — se ficassem fixos, a OMNI abriria
      // com o touro da Teeds no favicon.
      name: 'teeds:marca-no-html',
      // 'pre' porque o Vite tenta resolver o href de cada <link> como
      // arquivo: se ele vir o marcador antes da troca, quebra o build.
      transformIndexHtml: {
        order: 'pre' as const,
        handler: (html: string) =>
          html
            .replaceAll('%BASE%', MARCA.base)
            .replaceAll('%EMBLEMA%', MARCA.emblema)
            .replaceAll('%MARCA%', MARCA.id)
            .replaceAll('%THEME%', FUNDO_DA_MARCA[MARCA.id] ?? '#090a0d')
            .replaceAll('%NOME%', NOME_CURTO[MARCA.id] ?? MARCA.nome)
            .replace('%ABERTURA%', aberturaDoApp())
            .replace('</head>', `${telasDeAbertura()}</head>`),
      },
    },
    {
      // A pasta public/ e copiada inteira, entao o emblema da Teeds ia parar
      // dentro do site da OMNI. Ninguem ve na tela — mas quem digitar o
      // endereco do arquivo ve, e a regra e nao ter marca alheia la dentro.
      name: 'teeds:so-o-emblema-desta-marca',
      closeBundle: () => {
        // A landing de captacao e a mesma estrutura nas duas marcas; ela
        // identifica a marca pelo dominio e fica disponivel em /cadastro/.
        // Copiar no build evita manter duas versoes que poderiam divergir.
        const destinoCaptura = join(SAIDA, 'cadastro')
        rmSync(destinoCaptura, { recursive: true, force: true })
        cpSync(join(RAIZ, 'captura'), destinoCaptura, { recursive: true })
        rmSync(join(destinoCaptura, 'LEIA-ME.md'), { force: true })
        // O GitHub Pages e alguns navegadores guardaram o primeiro 404 dos
        // recursos externos e exibiram apenas HTML cru. A landing e pequena:
        // embutir CSS e JS no próprio documento elimina essa dependência e
        // garante uma única resposta completa, inclusive no primeiro acesso.
        const htmlCaptura = readFileSync(join(destinoCaptura, 'index.html'), 'utf8')
          .replace('<link rel="stylesheet" href="./landing.css?v=202609091" />', `<style>${readFileSync(join(destinoCaptura, 'landing.css'), 'utf8')}</style>`)
          .replace('<script src="./landing.js?v=202609091"></script>', `<script>${readFileSync(join(destinoCaptura, 'landing.js'), 'utf8')}</script>`)
        writeFileSync(join(destinoCaptura, 'index.html'), htmlCaptura)
        rmSync(join(destinoCaptura, 'landing.css'), { force: true })
        rmSync(join(destinoCaptura, 'landing.js'), { force: true })
        for (const outra of Object.values(MARCAS)) {
          if (outra.id === MARCA.id) continue
          rmSync(join(SAIDA, outra.emblema), { force: true })
          // Toda peca de marca na raiz com o prefixo da outra (assinatura,
          // monograma claro da GlobalFly...) fica so no site dela.
          for (const arquivo of readdirSync(SAIDA)) if (arquivo.startsWith(`${outra.id}-`) && /\.(png|svg|webp|jpg)$/.test(arquivo)) rmSync(join(SAIDA, arquivo), { force: true })
          rmSync(join(SAIDA, `pwa-${outra.id}`), { recursive: true, force: true })
          // Capas de aula exclusivas de uma marca (aulas-globalfly/...).
          if (outra.id !== 'teeds') rmSync(join(SAIDA, `aulas-${outra.id}`), { recursive: true, force: true })
          // Fundos de câmera da live (fundos-globalfly/...): só no site da marca.
          rmSync(join(SAIDA, `fundos-${outra.id}`), { recursive: true, force: true })
          // Fotos da vitrine de robôs (robos-globalfly/...): só no site da marca.
          rmSync(join(SAIDA, `robos-${outra.id}`), { recursive: true, force: true })
          // As telas da landing sao capturadas por marca: as da outra nao entram neste site.
          const telas = join(destinoCaptura, 'plataforma')
          if (existsSync(telas)) for (const arquivo of readdirSync(telas)) if (arquivo.startsWith(`${outra.id}-`)) rmSync(join(telas, arquivo), { force: true })
        }
        // O logotipo completo da Teeds so faz sentido no site da Teeds.
        if (MARCA.id !== 'teeds') {
          rmSync(join(SAIDA, 'teeds-completo.png'), { force: true })
          // As capas editoriais novas sao exclusivas da sala de aula Teeds.
          // A OMNI conserva as capas anteriores e nem recebe estes arquivos.
          rmSync(join(SAIDA, 'aulas-teeds'), { recursive: true, force: true })
        }
        // A GlobalFly tem as proprias capas (aulas-globalfly/): as da OMNI nao vao.
        if (MARCA.id === 'globalfly') rmSync(join(SAIDA, 'aulas-especialista'), { recursive: true, force: true })
        // O CNAME e o que diz ao GitHub Pages qual dominio serve esta pasta.
        // Sai da tabela de marcas, nao de um arquivo escrito a mao: dominio
        // trocado num lugar so.
        writeFileSync(join(SAIDA, 'CNAME'), new URL(MARCA.redirectUri).hostname + '\n')

        const pwaDir = `pwa-${MARCA.id}`
        const fundo = FUNDO_DA_MARCA[MARCA.id] ?? '#090a0d'
        const curto = NOME_CURTO[MARCA.id] ?? MARCA.prosa
        const nome = MARCA.id === 'globalfly' ? 'GlobalFly Trade' : `${curto} Trading Platform`
        const base = {
          id: '/', name: nome, short_name: curto,
          description: `${MARCA.prosa} — operações manuais, robôs e acompanhamento em um só lugar.`,
          lang: 'pt-BR', dir: 'ltr', start_url: '/', scope: '/', display: 'standalone',
          display_override: ['standalone', 'minimal-ui'],
          orientation: 'any', background_color: fundo, theme_color: fundo,
          categories: ['finance', 'business', 'education'],
          icons: [
            { src: `${pwaDir}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: `${pwaDir}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        }
        // App com cara de nativo (GlobalFly, `appNativo`): ícone mascarável
        // próprio, monocromático, atalhos no ícone e as telas que a loja do
        // Android mostra antes de instalar.
        const pasta = join(__dirname, 'public', pwaDir)
        const telas = existsSync(join(pasta, 'telas')) ? readdirSync(join(pasta, 'telas')).filter((f) => f.endsWith('.png')).sort() : []
        const manifesto = !MARCA.appNativo ? base : {
          ...base,
          description: `${MARCA.prosa}: robôs de operação, gestão de risco e acompanhamento ao vivo, na sua própria conta da corretora.`,
          start_url: '/?origem=app',
          launch_handler: { client_mode: ['navigate-existing', 'auto'] },
          prefer_related_applications: false,
          icons: [
            { src: `${pwaDir}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: `${pwaDir}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: `${pwaDir}/icon-maskable-192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: `${pwaDir}/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: `${pwaDir}/icon-monocromatico-512.png`, sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
          ],
          shortcuts: [
            { name: 'Robôs', short_name: 'Robôs', description: 'Ligar e acompanhar os robôs', url: '/?tela=robos', icons: [{ src: `${pwaDir}/atalhos/robos.png`, sizes: '192x192', type: 'image/png' }] },
            { name: 'Operar', short_name: 'Operar', description: 'Operação manual', url: '/?tela=operar', icons: [{ src: `${pwaDir}/atalhos/operar.png`, sizes: '192x192', type: 'image/png' }] },
            { name: 'Aulas', short_name: 'Aulas', description: 'O treinamento da plataforma', url: '/?tela=aulas', icons: [{ src: `${pwaDir}/atalhos/aulas.png`, sizes: '192x192', type: 'image/png' }] },
          ],
          screenshots: telas.map((f) => {
            const [, w, h] = f.match(/(\d+)x(\d+)/) ?? []
            return { src: `${pwaDir}/telas/${f}`, sizes: `${w}x${h}`, type: 'image/png', form_factor: Number(w) > Number(h) ? 'wide' : 'narrow', label: ROTULO_DA_TELA[f.replace(/-\d+x\d+\.png$/, '').replace(/^\d+-/, '')] ?? MARCA.prosa }
          }),
        }
        writeFileSync(join(SAIDA, 'manifest.webmanifest'), JSON.stringify(manifesto, null, 2) + '\n')

        const essenciais = readdirSync(join(SAIDA, 'assets'))
          .filter((arquivo) => /\.(?:js|css)$/.test(arquivo))
          .map((arquivo) => `./assets/${arquivo}`)
        const assinatura = createHash('sha256')
          .update(essenciais.map((f) => readFileSync(join(SAIDA, f.slice(2)))).join(''))
          .digest('hex').slice(0, 12)
        const preCache = ['./', './index.html', './manifest.webmanifest', `./${pwaDir}/icon-192.png`, `./${pwaDir}/icon-512.png`, ...essenciais]
        // O service worker. As referências a assets ganham "?v=" em scripts/versao.mjs,
        // igual ao index.html: a chave do cache muda a cada publicação e o app instalado
        // nunca fica preso a um JS velho. Regras (ver docs em scripts/versao.mjs):
        //  - navegação e JSON: rede primeiro, cache só sem rede;
        //  - assets versionados (?v=): cache primeiro (são imutáveis por versão);
        //  - imagens e fontes do próprio site: cache, atualizando por trás;
        //  - pedidos com cache 'no-store' (a checagem de versão) nunca passam pelo cache.
        writeFileSync(join(SAIDA, 'sw.js'), [
          `const CACHE='${MARCA.id}-${assinatura}';`,
          `const SHELL=${JSON.stringify(preCache)};`,
          `self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}));self.skipWaiting()});`,
          `self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));`,
          `self.addEventListener('fetch',e=>{const r=e.request;const u=new URL(r.url);if(r.method!=='GET'||u.origin!==self.location.origin||r.cache==='no-store'||u.searchParams.has('vivo'))return;`,
          // Só a RAIZ vira o app guardado para uso sem rede (09/10/2026). Antes
          // qualquer navegação era gravada como './index.html': abrir /cadastro
          // (a landing) ou /cadastre-se (o encaminhamento) trocava o app guardado
          // por outra página. Sem rede, qualquer endereço continua caindo no app.
          `if(r.mode==='navigate'){const raiz=u.pathname===new URL('./',self.location).pathname;e.respondWith(fetch(r).then(x=>{if(x.ok&&raiz)caches.open(CACHE).then(c=>c.put('./index.html',x.clone()));return x}).catch(()=>caches.match('./index.html')));return}`,
          `if(/\\/assets\\/.+\\.(?:js|css)$/.test(u.pathname)&&u.searchParams.has('v')){e.respondWith(caches.match(r).then(h=>h||fetch(r).then(x=>{if(x.ok)caches.open(CACHE).then(c=>c.put(r,x.clone()));return x})));return}`,
          `if(r.destination==='image'||r.destination==='font'){e.respondWith(caches.match(r).then(h=>{const n=fetch(r).then(x=>{if(x.ok)caches.open(CACHE).then(c=>c.put(r,x.clone()));return x}).catch(()=>h);return h||n}));return}`,
          `e.respondWith(fetch(r).then(x=>{if(x.ok&&!/\\.json$/.test(u.pathname))caches.open(CACHE).then(c=>c.put(r,x.clone()));return x}).catch(()=>caches.match(r)))});`,
          '',
        ].join('\n'))
      },
    },
  ],
  define: {
    // Chega ao app como import.meta.env.VITE_MARCA (ver src/marca/index.ts).
    'import.meta.env.VITE_MARCA': JSON.stringify(MARCA.id),
  },
  server: { port: 5180, open: true },
  build: {
    outDir: SAIDA,
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: `assets/${MARCA.id}.js`,
        chunkFileNames: 'assets/[name].js',
        assetFileNames: `assets/${MARCA.id}.[ext]`,
      },
    },
  },
})
