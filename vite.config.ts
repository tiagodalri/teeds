import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { MARCAS, marcaPorId } from './src/marca/marcas'

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
export default defineConfig({
  base: MARCA.base,
  plugins: [
    cascaPorMarca(),
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
            .replaceAll('%THEME%', MARCA.id === 'omni' ? '#081525' : '#090a0d')
            .replaceAll('%NOME%', MARCA.nome === 'TEEDS' ? 'Teeds' : MARCA.nome),
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
          rmSync(join(SAIDA, `pwa-${outra.id}`), { recursive: true, force: true })
        }
        // O logotipo completo da Teeds so faz sentido no site da Teeds.
        if (MARCA.id !== 'teeds') {
          rmSync(join(SAIDA, 'teeds-completo.png'), { force: true })
          // As capas editoriais novas sao exclusivas da sala de aula Teeds.
          // A OMNI conserva as capas anteriores e nem recebe estes arquivos.
          rmSync(join(SAIDA, 'aulas-teeds'), { recursive: true, force: true })
        }
        // O CNAME e o que diz ao GitHub Pages qual dominio serve esta pasta.
        // Sai da tabela de marcas, nao de um arquivo escrito a mao: dominio
        // trocado num lugar so.
        writeFileSync(join(SAIDA, 'CNAME'), new URL(MARCA.redirectUri).hostname + '\n')

        const pwaDir = `pwa-${MARCA.id}`
        const fundo = MARCA.id === 'omni' ? '#081525' : '#090a0d'
        const nome = MARCA.nome === 'TEEDS' ? 'Teeds Trading Platform' : 'OMNI Trading Platform'
        const curto = MARCA.nome === 'TEEDS' ? 'Teeds' : 'OMNI'
        writeFileSync(join(SAIDA, 'manifest.webmanifest'), JSON.stringify({
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
        }, null, 2) + '\n')

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
          `if(r.mode==='navigate'){e.respondWith(fetch(r).then(x=>{if(x.ok)caches.open(CACHE).then(c=>c.put('./index.html',x.clone()));return x}).catch(()=>caches.match('./index.html')));return}`,
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
