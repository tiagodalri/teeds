import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { marcaPorId } from './src/marca/marcas'

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

// A pasta do projeto fica num volume que nao permite remover arquivos,
// entao usamos nomes fixos (sobrescreve em vez de recriar) e desligamos a
// limpeza da pasta de saida. O cache do navegador e resolvido por uma
// versao anexada no index.html a cada build (ver scripts/versao.mjs).
export default defineConfig({
  base: MARCA.base,
  plugins: [
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
