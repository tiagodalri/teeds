import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/app.css'
// o tema da marca vem por ultimo, para vencer o app.css (ver src/styles/tema.css)
import './styles/tema.css'
import { aplicarTema, temaGuardado } from './core/tema'

// o tema entra antes do primeiro quadro, para a tela nao piscar clara
aplicarTema(temaGuardado())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

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
async function conferirVersao() {
  try {
    // no meio de um login (Deriv devolve `code`, Supabase devolve no #) não se mexe
    if (/[?&](code|access_token)=/.test(location.search) || /(access_token|error)=/.test(location.hash)) return
    const propria = (document.querySelector('script[src*="assets/"]') as HTMLScriptElement | null)
      ?.src.match(/[?&]v=([a-z0-9]+)/)?.[1]
    if (!propria) return
    const r = await fetch(`${import.meta.env.BASE_URL}index.html?vivo=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return
    const atual = (await r.text()).match(/assets\/[a-z]+\.js\?v=([a-z0-9]+)/)?.[1]
    if (!atual || atual === propria) return
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
