import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, rmSync, statSync } from 'node:fs'
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
            .replaceAll('%NOME%', MARCA.nome === 'TEEDS' ? 'Teeds' : MARCA.nome),
      },
    },
    {
      // A pasta public/ e copiada inteira, entao o emblema da Teeds ia parar
      // dentro do site da OMNI. Ninguem ve na tela — mas quem digitar o
      // endereco do arquivo ve, e a regra e nao ter marca alheia la dentro.
      name: 'teeds:so-o-emblema-desta-marca',
      closeBundle: () => {
        for (const outra of Object.values(MARCAS)) {
          if (outra.id === MARCA.id) continue
          rmSync(join(SAIDA, outra.emblema), { force: true })
        }
        // O logotipo completo da Teeds so faz sentido no site da Teeds.
        if (MARCA.id !== 'teeds') rmSync(join(SAIDA, 'teeds-completo.png'), { force: true })
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
