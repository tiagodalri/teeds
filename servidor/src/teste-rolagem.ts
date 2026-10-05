/**
 * A tela nao pode travar a rolagem e cortar informacao.
 *
 * O que aconteceu em 05/10/2026, nas "Sessoes encerradas" do monitoramento: a
 * lista aparecia recortada na altura da janela e nao havia como rolar para ver
 * o resto. Nao era CSS malfeito num lugar; era uma armadilha de especificacao
 * que pega qualquer painel novo que seja grid:
 *
 *   1. `.ger` e' um item flex com `flex: 1` dentro de `.app` (altura 100%),
 *      portanto tem altura DEFINIDA — 697px numa janela de 860.
 *   2. Quando o painel tambem e' grid, as linhas `auto` do grid crescem no
 *      maximo ate a SOBRA dessa altura, nao ate o conteudo.
 *   3. Os cartoes (`.admin-card`) usam `overflow: hidden` para respeitar o raio
 *      da borda. Isso zera a altura minima automatica deles: a linha nao
 *      empurra de volta, o cartao e' comprimido e o excedente e' recortado.
 *   4. E ai o proprio `.ger` ve `scrollHeight == clientHeight` e NAO cria barra
 *      de rolagem. A informacao fica inalcancavel.
 *
 * Um cartao de 2579px virou 522px. Nenhum teste de unidade pega isso, porque o
 * defeito so existe depois que o navegador resolve o layout. Entao esta prova
 * monta a casca de verdade (o CSS montado em `docs/assets/teeds.css`, o mesmo
 * que vai para o ar), com a estrutura real das telas, e MEDE no Chrome:
 *
 *   - o painel rola quando o conteudo passa da janela;
 *   - nenhum cartao esconde conteudo;
 *   - a ultima linha da lista e' alcancavel rolando.
 *
 * Alem da medida, um exame do CSS: se amanha alguem criar um painel `.ger` que
 * seja grid, ele ja nasce coberto pela regra `.ger { grid-auto-rows: ... }` — e
 * se alguem tirar essa regra, esta prova cai.
 *
 *   npm run rolagem
 *
 * Precisa do Chrome. Em maquina sem navegador, `SEM_NAVEGADOR=1` pula a medida
 * (o exame do CSS continua valendo).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

let passou = 0, falhou = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  const ok = JSON.stringify(deu) === JSON.stringify(esperado)
  ok ? passou++ : falhou++
  console.log(`${ok ? '  ok  ' : ' FALHA'}  ${nome}${ok ? '' : `\n        esperava ${JSON.stringify(esperado)}, deu ${JSON.stringify(deu)}`}`)
}

const RAIZ = resolve(import.meta.dirname, '../..')
const CSS_MONTADO = join(RAIZ, 'docs/assets/teeds.css')
const CSS_FONTE = join(RAIZ, 'src/styles/app.css')

/* ------------------------------------------------- o exame do CSS de fonte */

console.log('\nROLAGEM · A REGRA QUE DESTRAVA OS PAINEIS GRID\n')

const fonte = readFileSync(CSS_FONTE, 'utf8')
const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, '')

// A regra tem de existir e tem de valer para `.ger` inteiro, nao para uma tela
// so — e' justamente o que impede o defeito de voltar numa tela nova.
const temARegra = /\.ger\s*\{[^}]*grid-auto-rows\s*:\s*max-content/.test(semComentarios)
conferir('`.ger` declara grid-auto-rows: max-content', temARegra, true)

// Ninguem pode desfazer isso depois para um painel especifico.
const desfazem = [...semComentarios.matchAll(/([^{}]*\.ger[^{}]*)\{([^}]*)\}/g)]
  .filter(([, sel, corpo]) => /grid-auto-rows/.test(corpo) && !/max-content|min-content/.test(corpo))
  .map(([, sel]) => sel.trim())
conferir('nenhuma regra devolve o teto de altura para um painel .ger', desfazem, [])

// Todo painel que e' raiz de tela (`className="ger X"`) e que seja grid precisa
// estar coberto. Como a regra vale para `.ger` inteiro, a conferencia aqui e'
// so para apontar o dedo se alguem trocar a regra por uma lista de telas.
const raizes = new Set<string>()
for (const arq of ['src/components/MonitoramentoPanel.tsx', 'src/components/InsightsPanel.tsx', 'src/components/AulasPanel.tsx', 'src/components/RobotPanel.tsx', 'src/App.tsx']) {
  const caminho = join(RAIZ, arq)
  if (!existsSync(caminho)) continue
  for (const [, classes] of readFileSync(caminho, 'utf8').matchAll(/className="ger ([a-z0-9 -]+)"/g)) {
    for (const c of classes.trim().split(/\s+/)) raizes.add(c)
  }
}
conferir('as raizes de tela foram encontradas no codigo', raizes.size > 0, true)

const gradeSemCobertura = [...raizes].filter((c) => {
  const regra = new RegExp(`(^|,|\\})\\s*\\.${c}\\s*\\{[^}]*display\\s*:\\s*grid`, 'm')
  return regra.test(semComentarios) && !temARegra
})
conferir('nenhum painel grid ficou sem a protecao', gradeSemCobertura, [])

/* ----------------------------------------------------- a medida no Chrome */

const acharChrome = (): string | null => {
  if (process.env.NAVEGADOR) return process.env.NAVEGADOR
  const tentativas = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ]
  return tentativas.find(existsSync) ?? null
}

/* A casca de verdade: o mesmo encadeamento de `.app` > `.ger` que o App.tsx
   monta, com um cartao alto o suficiente para passar da janela. Se o CSS
   montado estiver certo, isto rola; se a armadilha voltar, nao rola. */
const pagina = (painel: 'monitoramento' | 'insights') => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="teeds.css"></head><body><div id="root"><div class="app workspace-app">
<aside class="workspace-sidebar"><nav id="workspace-navigation"></nav></aside>
<header class="topbar"><div class="workspace-heading"><strong>Painel</strong><span>sub</span></div></header>
<div class="ger ${painel}" id="GER">
  <header class="mon-topo"><div><span class="rot">Teeds</span><h2>Titulo da tela</h2><p>Uma linha de apoio.</p></div></header>
  <section class="admin-card full" id="CARD">
    <header><div><span class="rot">Ultimos 30 dias</span><h3>Lista</h3></div><small>60 itens</small></header>
    <div class="ins-tabela" id="TAB"><div class="cab"><span>A</span><span>B</span><span>C</span></div></div>
  </section>
</div></div></div><div id="SAIDA"></div><script>
/* Tudo sincrono de proposito. O Chrome novo nao garante que o --dump-dom saia
   depois de um requestAnimationFrame, e a medida se perdia em silencio. Ler
   offsetHeight forca o layout aqui mesmo, e a resposta vai para dentro do
   DOM — que e' exatamente o que o --dump-dom devolve. */
var tab = document.getElementById('TAB');
for (var i = 0; i < 60; i++) {
  var d = document.createElement('div'); d.className = 'ins-linha'; d.id = 'L' + i;
  d.innerHTML = '<span>linha ' + i + '</span><span>meio</span><span>fim</span>';
  tab.appendChild(d);
}
var g = document.getElementById('GER'), c = document.getElementById('CARD');
var u = document.getElementById('L59');
void document.body.offsetHeight;
g.scrollTop = 999999;
void g.scrollTop;
document.getElementById('SAIDA').textContent = JSON.stringify({
  janela: window.innerHeight,
  painelRola: g.scrollHeight > g.clientHeight + 1,
  cartaoEsconde: c.scrollHeight > c.clientHeight + 1,
  ultimaLinhaAlcancavel: u.getBoundingClientRect().bottom <= g.getBoundingClientRect().bottom + 1,
  alturaDoCartao: Math.round(c.clientHeight), conteudoDoCartao: c.scrollHeight
});
</script></body></html>`

interface Medida {
  janela: number; painelRola: boolean; cartaoEsconde: boolean
  ultimaLinhaAlcancavel: boolean; alturaDoCartao: number; conteudoDoCartao: number
}

function medir(chrome: string, pasta: string, painel: 'monitoramento' | 'insights'): Medida {
  const arq = join(pasta, `${painel}.html`)
  writeFileSync(arq, pagina(painel))
  const saida = execFileSync(chrome, [
    '--headless', '--disable-gpu', '--no-sandbox', '--window-size=1512,860',
    '--virtual-time-budget=5000', '--dump-dom', `file://${arq}`,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })
  const m = saida.match(/<div id="SAIDA">([^<]*)<\/div>/)
  if (!m?.[1]) throw new Error('o navegador nao devolveu a medida (a pagina nao executou)')
  return JSON.parse(m[1]) as Medida
}

const chrome = acharChrome()
if (!chrome || !existsSync(CSS_MONTADO)) {
  const motivo = !chrome ? 'Chrome nao encontrado' : `falta ${CSS_MONTADO} (rode npm run build antes)`
  if (process.env.SEM_NAVEGADOR === '1') {
    console.log(`\n  (medida no navegador pulada: ${motivo})`)
  } else {
    console.log(`\n  FALHA  nao foi possivel medir no navegador: ${motivo}`)
    console.log('         aponte outro navegador em NAVEGADOR=/caminho/do/chrome')
    console.log('         ou rode com SEM_NAVEGADOR=1 para ficar so no exame do CSS')
    falhou++
  }
} else {
  const pasta = mkdtempSync(join(tmpdir(), 'teeds-rolagem-'))
  writeFileSync(join(pasta, 'teeds.css'), readFileSync(CSS_MONTADO))

  for (const painel of ['monitoramento', 'insights'] as const) {
    console.log(`\nROLAGEM · ${painel.toUpperCase()} MEDIDO NO NAVEGADOR (1512x860)\n`)
    const m = medir(chrome, pasta, painel)
    conferir(`${painel}: o painel rola quando o conteudo passa da janela`, m.painelRola, true)
    conferir(`${painel}: nenhum cartao esconde conteudo`, m.cartaoEsconde, false)
    conferir(`${painel}: a ultima linha e' alcancavel rolando`, m.ultimaLinhaAlcancavel, true)
    // O sintoma exato do defeito: cartao menor que o conteudo dele.
    conferir(`${painel}: o cartao tem a altura do conteudo`, m.alturaDoCartao >= m.conteudoDoCartao, true)
    console.log(`        (cartao ${m.alturaDoCartao}px para ${m.conteudoDoCartao}px de conteudo, janela ${m.janela}px)`)
  }
}

console.log(`\n${passou} certos, ${falhou} errados`)
process.exit(falhou ? 1 : 0)
