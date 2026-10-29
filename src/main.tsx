import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/app.css'
// o tema da marca vem por ultimo, para vencer o app.css (ver src/styles/tema.css)
import './styles/tema.css'
import './styles/ux-refinements.css'
import './styles/mobile-polish.css'
// o padrão de página (largura, margens) vem por último: vale sobre o resto
import './styles/pagina.css'
import { aplicarTema, temaGuardado } from './core/tema'
import { MARCA } from './marca'
import { registrarVisita } from './core/teeds/visitas'
import { appDaVitrine, lerParceiroDoLink, vitrine } from './core/teeds/parceiro'
import { usarAppDaDeriv } from './core/deriv/auth'
import { haTrocaEmAndamento } from './core/trocaEmAndamento'
// Guarda o pedido de instalação do Chrome assim que ele chega (ver o arquivo).
import './core/appNativo'
import { ligarEscala } from './core/escala'
import { ligarVocabularioIA } from './marca/vocabularioIA'
import { JANELA, ligarJanelaSolta } from './core/janelaSolta'

/*
  Os arquivos publicados têm nome fixo. Se uma aba antiga abre uma tela
  separada (lazy) depois de uma publicação, chega o arquivo novo, que traz o
  app novo junto: seriam duas cópias do React na mesma página. A segunda cópia
  não sobe: a página recarrega já na versão nova (revisão de 21/10/2026).
*/
const pagina = window as unknown as { __appNoAr?: boolean }
if (pagina.__appNoAr) {
  // uma vez a cada 30 s, com marca nova no endereço (fura o cache do CDN, que
  // ainda pode entregar a página velha): nunca vira laço de recarga
  const chave = 'app.recarregou-por-copia'
  let pode = false
  try { pode = Date.now() - Number(sessionStorage.getItem(chave) ?? 0) > 30_000; if (pode) sessionStorage.setItem(chave, String(Date.now())) } catch { /* sem armazenamento: não recarrega */ }
  if (pode) { const u = new URL(location.href); u.searchParams.set('v', Date.now().toString(36)); location.replace(u.toString()) }
  throw new Error('Versão nova publicada: a página recarrega na versão nova.')
}
pagina.__appNoAr = true
// Falha ao baixar uma tela separada (publicação no meio, rede caiu e voltou): recarrega uma vez.
window.addEventListener('vite:preloadError', (e) => {
  const chave = 'app.recarregou-por-tela'
  try {
    if (Date.now() - Number(sessionStorage.getItem(chave) ?? 0) < 30_000) return
    sessionStorage.setItem(chave, String(Date.now()))
  } catch { return }
  e.preventDefault()
  location.reload()
})

// Convite para instalar e aviso de sem conexão: só nas marcas com app nativo.
const RecursosDeApp = MARCA.appNativo ? lazy(() => import('./components/RecursosDeApp')) : null
// O voo do login até o início: atravessa a troca de telas, então mora na raiz.
const Decolagem = MARCA.decolagem ? lazy(() => import('./components/entrada/Decolagem').then((m) => ({ default: m.Decolagem }))) : null

// o tema entra antes do primeiro quadro, para a tela nao piscar clara
document.documentElement.dataset.marca = MARCA.id
// App instalado na tela inicial (PWA): o CSS desenha o topo por trás da hora
// e da bateria do iPhone (ver "app instalado" no tema da marca).
if (matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true) {
  document.documentElement.classList.add('app-instalado')
}
aplicarTema(temaGuardado())
// no computador a página nasce em 90% (ver core/escala.ts)
ligarEscala()
if (MARCA.vocabularioIA) ligarVocabularioIA()

// Quem abriu o site, e por qual caminho chegou. Fora do React de propósito:
// vale para TODA visita, inclusive a de quem nunca faz login, e o StrictMode
// monta os componentes duas vezes em desenvolvimento — aqui contaria dobrado.
// O link de parceiro (/n, /v) é lido antes: a visita limpa as marcações da barra.
if (MARCA.parceiros?.length) {
  lerParceiroDoLink()
  // o parceiro vale pela URL: no /n a Deriv conecta e opera pelo app do Naor (27/10/2026)
  usarAppDaDeriv(appDaVitrine())
  // instalar o app daqui instala o app do parceiro: abre sempre no /n (ver vite.config.ts)
  const v = vitrine()
  const manifesto = document.querySelector('link[rel="manifest"]')
  const href = manifesto?.getAttribute('href') ?? ''
  if (v && /manifest\.webmanifest/.test(href)) manifesto!.setAttribute('href', href.replace('manifest.webmanifest', `manifest-${v}.webmanifest`))
}
// a janela solta (cabine ou manual fora da plataforma) não é uma visita nova
if (JANELA) {
  ligarJanelaSolta()
  // o tema trocado na janela principal vale aqui na hora
  window.addEventListener('storage', (e) => { if (e.key === `${MARCA.id}.tema`) aplicarTema(temaGuardado()) })
} else registrarVisita()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    {RecursosDeApp && !JANELA && <Suspense fallback={null}><RecursosDeApp /></Suspense>}
    {Decolagem && !JANELA && <Suspense fallback={null}><Decolagem /></Suspense>}
  </React.StrictMode>,
)

// A abertura do app instalado (index.html, `%ABERTURA%`) se dissolve assim que
// o primeiro quadro da plataforma está na tela: dois quadros depois do render,
// para a troca nunca mostrar um vazio no meio.
// Se a aba nascer em segundo plano o navegador não desenha quadros: a saída
// por tempo garante que a abertura nunca fica presa na tela.
const abertura = document.getElementById('app-abertura')
if (abertura) {
  const sair = () => {
    if (abertura.classList.contains('saindo')) return
    abertura.classList.add('saindo')
    window.setTimeout(() => abertura.remove(), 650)
  }
  requestAnimationFrame(() => requestAnimationFrame(sair))
  window.setTimeout(sair, 600)
}

/**
 * O app confere sozinho se existe versão mais nova.
 *
 * O GitHub Pages guarda o index.html por até 10 minutos em cada ponto da
 * rede dele. Quem abre o site logo depois de uma publicação pode receber a
 * página antiga — que, por sua vez, pede os arquivos antigos. Aconteceu em
 * 07/09: o Tiago viu robôs com nome velho numa aba anônima sete minutos
 * depois de publicar, enquanto de outro ponto da rede a versão nova já
 * chegava. Não dá para mandar a CDN esquecer; dá para o app perguntar.
 *
 * Como: pede o index.html com um número único no endereço (a CDN não tem
 * isso guardado, então vai buscar o de verdade), lê a versão que está lá e,
 * se for diferente da que está rodando, recarrega uma vez com essa versão
 * no endereço — o que também força a rede a entregar a página nova. Uma vez
 * só por versão, para nunca virar um laço.
 */
async function conferirVersao(soAvisar = false) {
  try {
    // no meio de um login (Deriv devolve `code`, Supabase devolve no #) não se mexe
    if (/[?&](code|access_token|confirmar)=/.test(location.search) || /(access_token|error)=/.test(location.hash)) return
    // a URL já foi limpa, mas a troca do código (vale uma vez) ainda está no ar
    if (haTrocaEmAndamento()) return
    const propria = (document.querySelector('script[src*="assets/"]') as HTMLScriptElement | null)
      ?.src.match(/[?&]v=([a-z0-9]+)/)?.[1]
    if (!propria) return
    const r = await fetch(`${import.meta.env.BASE_URL}index.html?vivo=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return
    const atual = (await r.text()).match(/assets\/[a-z]+\.js\?v=([a-z0-9]+)/)?.[1]
    if (!atual || atual === propria) return
    // com a tela à mostra e a pessoa trabalhando, não recarrega sozinho: avisa
    if (soAvisar) { avisarVersaoNova(atual); return }
    const chave = 'app.recarregou-para'
    if (sessionStorage.getItem(chave) === atual) return
    sessionStorage.setItem(chave, atual)
    const u = new URL(location.href)
    u.searchParams.set('v', atual)
    location.replace(u.toString())
  } catch {
    /* sem rede ou bloqueado: segue com a versão que tem */
  }
}
window.setTimeout(() => { void conferirVersao() }, 1500)

/*
 * O app instalado quase nunca "abre de novo": o iPhone e o Android só o tiram
 * do segundo plano, e a página antiga continua ali. Então a conferência roda
 * também quando o app volta para a tela depois de um tempo fora (20/10/2026,
 * Tiago: "atualizar sozinho quando abrir da próxima vez, sem reinstalar").
 * O service worker também é conferido, para baixar a versão nova junto.
 */
let foraDesde = 0
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { foraDesde = Date.now(); return }
  if (!foraDesde || Date.now() - foraDesde < 20_000) return
  foraDesde = 0
  void navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => undefined)
  void conferirVersao()
})
window.addEventListener('pageshow', (e) => { if (e.persisted) void conferirVersao() })

/*
 * Aba aberta o dia inteiro, sempre à mostra (28/10/2026: o computador do
 * Victor seguia na versão da manhã às 14h37, sem a correção do resumo das
 * sessões). A cada 10 minutos o app pergunta de novo; achando versão nova,
 * mostra um aviso com "Atualizar" em vez de recarregar no meio do uso. As
 * sessões rodam no servidor: atualizar a página não as interrompe.
 */
let avisadaPara = ''
function avisarVersaoNova(versao: string) {
  if (avisadaPara === versao || document.getElementById('aviso-versao')) return
  avisadaPara = versao
  const aviso = document.createElement('div')
  aviso.id = 'aviso-versao'
  aviso.setAttribute('role', 'status')
  aviso.innerHTML = '<span><b>Versão nova disponível.</b> O que está em andamento continua normalmente.</span>'
    + '<button type="button" data-atualizar>Atualizar agora</button><button type="button" data-depois>Depois</button>'
  aviso.querySelector('[data-atualizar]')!.addEventListener('click', () => {
    const u = new URL(location.href); u.searchParams.set('v', versao); location.replace(u.toString())
  })
  aviso.querySelector('[data-depois]')!.addEventListener('click', () => aviso.remove())
  document.body.appendChild(aviso)
}
window.setInterval(() => { if (document.visibilityState === 'visible') void conferirVersao(true) }, 10 * 60_000)

// O PWA usa a mesma aplicacao publicada. A troca do service worker acontece
// em segundo plano e nunca recarrega uma operacao em andamento.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch((erro) => console.warn('[pwa] service worker indisponivel:', erro))
  }, { once: true })
}
