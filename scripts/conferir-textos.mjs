#!/usr/bin/env node
/**
 * A trava dos textos (29/10/2026, depois da revisão de UX da plataforma
 * inteira). Roda antes de cada publicação (scripts/conferir-separacao.sh) e
 * barra os erros que a revisão achou espalhados e que voltam fácil:
 *
 *  - palavras proibidas para operações: aposta, apostar, sorte, chute, jogar,
 *    "no jogo" (regra da casa: operação não é jogo);
 *  - promessa da I.A.: "a I.A. aprende / prevê / acerta / garante";
 *  - texto da tela começando em minúscula: botão, placeholder e os estados
 *    "carregando…", "salvando…" (regra da casa: primeira letra maiúscula);
 *  - erro cru na tela: {erro.message} / {e.message} direto no JSX (aparece
 *    em inglês, "Failed to fetch");
 *  - o título que vira minúscula na tela: `.toLowerCase()` dentro de chaves no JSX.
 *
 * Comentários não contam. Uma linha pode ser liberada de propósito com o
 * marcador `texto-ok` no fim (dizendo por quê).
 *
 *   node scripts/conferir-textos.mjs          → lista e sai com 1 se houver problema
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const RAIZ = new URL('..', import.meta.url).pathname
const PASTAS = ['src', 'captura', 'captura-globalfly', 'supabase/functions', 'servidor/src']
const EXTENSOES = /\.(tsx?|html|js|mjs)$/
// laboratório (dados de mentira), testes e o próprio vocabulário ficam de fora
const FORA = /(^|\/)(node_modules|dist|docs[^/]*)\/|\/Lab[A-Z][^/]*\.tsx$|laboratorio\.tsx$|\/teste[-.][^/]*$|vocabularioIA\.ts$|conferir-textos\.mjs$/

function arquivos(dir, lista = []) {
  let itens = []
  try { itens = readdirSync(dir) } catch { return lista }
  for (const nome of itens) {
    const caminho = join(dir, nome)
    const rel = relative(RAIZ, caminho)
    if (FORA.test(rel + (statSync(caminho).isDirectory() ? '/' : ''))) continue
    if (statSync(caminho).isDirectory()) arquivos(caminho, lista)
    else if (EXTENSOES.test(nome)) lista.push(caminho)
  }
  return lista
}

/** Tira os comentários mantendo as quebras de linha (para o número da linha bater). */
function semComentarios(texto, html) {
  const branco = (m) => m.replace(/[^\n]/g, ' ')
  let t = texto.replace(/\/\*[\s\S]*?\*\//g, branco).replace(/\{\/\*[\s\S]*?\*\/\}/g, branco)
  if (html) t = t.replace(/<!--[\s\S]*?-->/g, branco)
  // comentário de linha: // fora de string (aproximação: não depois de ':' como em https://)
  return t.split('\n').map((l) => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n')
}

const MINUSCULA = '[a-zàáâãéêíóôõúç]'
const REGRAS = [
  { nome: 'palavra proibida (operação não é jogo)', re: /\b(apost[ae]r?|apostas|apostou|sorte|chute|jogar|jogada|no jogo)\b/i, so: 'texto' },
  { nome: 'promessa da I.A.', re: /\b(I\.A\.?|IA|robô|rob[ôo]s)\s+(aprende|prevê|preve|acerta|garante)\b/i, so: 'texto' },
  // o texto que fecha o botão: ">fechar</button>" (o "=>" das funções não conta como fim de tag)
  { nome: 'botão começando em minúscula', re: new RegExp(`(?<![=])>\\s*${MINUSCULA}[^<{>]+</button>`), so: 'tsx' },
  // e-mail e endereço de exemplo ficam em minúscula de propósito (voce@email.com, https://…)
  { nome: 'placeholder começando em minúscula', re: new RegExp(`placeholder=["'](?![^"']*[@/])${MINUSCULA}`), so: 'tsx' },
  { nome: 'estado em minúscula ("carregando…")', re: new RegExp(`['"\`>]${MINUSCULA}[^'"\`<>{}/]{2,40}…['"\`<]`), so: 'tsx' },
  { nome: 'erro cru na tela (.message no JSX)', re: /\{\s*[\w.?]*\b(e|err|erro|error)\??\.message\s*\}/, so: 'tsx' },
  { nome: 'texto da tela em minúscula (.toLowerCase() no JSX)', re: /\{[^}]*\.titulo\.toLowerCase\(\)[^}]*\}/, so: 'tsx' },
]

const achados = []
for (const pasta of PASTAS) {
  for (const arq of arquivos(join(RAIZ, pasta))) {
    const rel = relative(RAIZ, arq)
    const html = arq.endsWith('.html')
    const tsx = arq.endsWith('.tsx')
    const original = readFileSync(arq, 'utf8')
    const crus = original.split('\n')
    const linhas = semComentarios(original, html).split('\n')
    linhas.forEach((linha, i) => {
      // o marcador mora num comentário: confere na linha original
      if (/texto-ok/.test(crus[i] ?? '')) return
      for (const r of REGRAS) {
        if (r.so === 'tsx' && !tsx) continue
        // palavras e promessas: só dentro de texto (string, JSX ou HTML), não em nome de variável
        if (r.so === 'texto' && !/['"`>]/.test(linha)) continue
        if (r.re.test(linha)) achados.push(`${rel}:${i + 1} — ${r.nome}\n    ${linha.trim().slice(0, 160)}`)
      }
    })
  }
}

if (achados.length) {
  console.error(`\n✗ Textos com problema (${achados.length}). Corrija ou marque a linha com "texto-ok" dizendo por quê:\n`)
  for (const a of achados) console.error('  ' + a)
  console.error('')
  process.exit(1)
}
console.log('✓ Textos conferidos (palavras, promessas, maiúsculas, erros crus).')
