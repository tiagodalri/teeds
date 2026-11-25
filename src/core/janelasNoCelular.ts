/**
 * Janelas no celular com cara de app (25/11/2026, prints do Tiago no app instalado no iPhone: a janela
 * "O que o meu plano inclui" começava por baixo da hora e da bateria, e o "X" rolava junto com o
 * conteúdo e sumia: "eu clico e não consigo apertar um xzinho, tenho que fechar o app e abrir de novo").
 *
 * São mais de 70 janelas, cada uma com o próprio CSS. Em vez de remendar uma por uma, esta vigia vale
 * para todas, só no celular:
 *  1. Faixa da hora: janela (fundo fixo que cobre a tela) com botão ou texto embaixo da hora e da
 *     bateria ganha esse espaço a mais no alto; a caixa de dentro que rola passa a caber no que sobra.
 *  2. "X" sempre ao alcance: se o botão de fechar da janela saiu da tela (rolou para cima, ficou por
 *     baixo da hora ou fora da largura), aparece um "X" fixo no canto de cima, abaixo da hora, que
 *     aperta o botão de verdade. Voltou a aparecer o da janela, o fixo some.
 * Janela sem botão de fechar (cadastro, termos para aceitar) não ganha "X": nada muda nela.
 */

const SELETOR_CLASSES = ['fundo', 'modal', 'overlay', 'backdrop', 'janela', 'cheia', 'folha'].map((c) => `[class*="${c}"]`).join(',')

const TEXTO_DE_FECHAR = /^(×|✕|✖|x|fechar)$/i
const ROTULO_DE_FECHAR = /^(fechar|sair da|voltar para|voltar$|close)/i

let faixaDaHora = 0
let faixaDeBaixo = 0
let botaoFixo: HTMLButtonElement | null = null
let alvoDoFixo: HTMLElement | null = null

function medirFaixas() {
  const medir = (variavel: string) => {
    const sonda = document.createElement('div')
    sonda.style.cssText = `position:fixed;left:0;top:0;width:0;padding:0;border:0;box-sizing:content-box;visibility:hidden;pointer-events:none;height:var(${variavel},0px)`
    document.body.appendChild(sonda)
    const altura = sonda.getBoundingClientRect().height
    sonda.remove()
    return altura
  }
  faixaDaHora = medir('--sat')
  faixaDeBaixo = medir('--sab')
}

function visivel(el: Element): boolean {
  const cs = getComputedStyle(el)
  if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

/** O fundo fixo que cobre a tela (a janela), subindo a partir de um candidato. */
function fundoDe(el: Element): HTMLElement | null {
  let atual: Element | null = el
  while (atual && atual !== document.body) {
    if (atual instanceof HTMLElement && getComputedStyle(atual).position === 'fixed') {
      const r = atual.getBoundingClientRect()
      const cobre = r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.85 && r.top <= 4
      return cobre ? atual : null
    }
    atual = atual.parentElement
  }
  return null
}

function janelasAbertas(): HTMLElement[] {
  const achadas = new Set<HTMLElement>()
  const vistos = new Set<Element>()
  const olhar = (el: Element) => {
    if (vistos.has(el)) return
    vistos.add(el)
    if (el.id === 'x-da-janela') return
    const f = fundoDe(el)
    if (f && !achadas.has(f) && visivel(f) && !f.classList.contains('workspace-shade')) achadas.add(f)
  }
  // janelas por portal (filhas diretas da página) e as marcadas como diálogo: sobe até o fundo fixo
  for (const el of Array.from(document.body.children)) olhar(el)
  for (const el of Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]'))) olhar(el)
  // as outras pelo nome da classe: só quando elas mesmas são o fundo fixo (não sobe, para ser leve)
  for (const el of Array.from(document.querySelectorAll(SELETOR_CLASSES))) {
    if (vistos.has(el) || getComputedStyle(el).position !== 'fixed') continue
    olhar(el)
  }
  return [...achadas]
}

function botaoDeFechar(janela: HTMLElement): HTMLElement | null {
  const botoes = Array.from(janela.querySelectorAll<HTMLElement>('button, [role="button"], a[aria-label]'))
  let melhor: HTMLElement | null = null
  let melhorTopo = Infinity
  for (const b of botoes) {
    if (b.id === 'x-da-janela') continue
    const rotulo = (b.getAttribute('aria-label') ?? b.getAttribute('title') ?? '').trim()
    const texto = (b.textContent ?? '').trim()
    const ehFechar = rotulo
      ? ROTULO_DE_FECHAR.test(rotulo) && !/bloco|pesquisa/i.test(rotulo)
      : TEXTO_DE_FECHAR.test(texto) || (!texto && !!b.querySelector('.icone-fechar'))
    if (!ehFechar) continue
    if (getComputedStyle(b).display === 'none') continue
    // o fundo inteiro feito de botão ("toque fora para fechar") não conta: só o "X" de verdade
    const caixa = b.getBoundingClientRect()
    if (caixa.width > 160 || caixa.height > 120) continue
    // o de cima vence (o "X" do cabeçalho, não o "Fechar" do rodapé)
    const topo = b.getBoundingClientRect().top
    if (topo < melhorTopo) { melhor = b; melhorTopo = topo }
  }
  return melhor
}

/** O botão pode ser apertado agora: dentro da tela, abaixo da hora e sem nada por cima. */
function aoAlcance(b: HTMLElement): boolean {
  if (!visivel(b)) return false
  const r = b.getBoundingClientRect()
  const x = r.left + r.width / 2
  const y = r.top + r.height / 2
  if (x < 4 || x > innerWidth - 4 || y < faixaDaHora + 4 || y > innerHeight - faixaDeBaixo - 4) return false
  const noPonto = document.elementFromPoint(x, y)
  return !!noPonto && (noPonto === b || b.contains(noPonto))
}

/** Há botão ou texto embaixo da hora e da bateria? (só o que se vê: o que rolou e foi cortado não conta) */
function algoEmbaixoDaHora(janela: HTMLElement): boolean {
  if (faixaDaHora < 8) return false
  for (const y of [faixaDaHora / 2, faixaDaHora - 6]) for (let i = 1; i < 10; i++) {
    const noPonto = document.elementFromPoint((innerWidth * i) / 10, y)
    if (!noPonto || noPonto === janela || !janela.contains(noPonto)) continue
    const peca = noPonto.closest('button, a, input, select, textarea, [role="button"], h1, h2, h3, h4, p, label')
    if (peca && janela.contains(peca)) return true
    // texto solto: só conta se a letra mesmo está na faixa (um cabeçalho que já desconta a hora tem o
    // fundo ali, mas o texto dele fica abaixo)
    for (const n of Array.from(noPonto.childNodes)) {
      if (n.nodeType !== 3 || !(n.textContent ?? '').trim()) continue
      const trecho = document.createRange()
      trecho.selectNodeContents(n)
      const r = trecho.getBoundingClientRect()
      if (r.top <= y && r.bottom >= y) return true
    }
  }
  return false
}

function abrirEspacoDaHora(janela: HTMLElement) {
  if (janela.dataset.faixaDaHora === '1') return
  if (!algoEmbaixoDaHora(janela)) return
  const cs = getComputedStyle(janela)
  const topo = parseFloat(cs.paddingTop) || 0
  janela.dataset.faixaDaHora = '1'
  janela.style.setProperty('padding-top', `calc(${topo}px + var(--sat, 0px))`)
  janela.style.setProperty('box-sizing', 'border-box')
  // a caixa que rola por dentro (centralizada) cabe no espaço que sobrou, sem passar por baixo da hora
  for (const filho of Array.from(janela.children) as HTMLElement[]) {
    const fcs = getComputedStyle(filho)
    if (fcs.position === 'fixed' || fcs.position === 'absolute') continue
    // a caixa que já rola por dentro, ou a que passou do pé com o espaço a mais: cabe no que sobrou e rola
    const passou = filho.getBoundingClientRect().bottom > janela.getBoundingClientRect().bottom - (parseFloat(cs.paddingBottom) || 0) + 1
    if (/(auto|scroll)/.test(fcs.overflowY) || passou) {
      filho.dataset.faixaDaHora = '1'
      filho.style.setProperty('max-height', '100%')
      if (passou && !/(auto|scroll|hidden)/.test(fcs.overflowY)) filho.style.setProperty('overflow-y', 'auto')
    }
  }
}

function mostrarFixo(alvo: HTMLElement | null) {
  alvoDoFixo = alvo
  if (!alvo) { if (botaoFixo) botaoFixo.hidden = true; return }
  if (!botaoFixo) {
    botaoFixo = document.createElement('button')
    botaoFixo.id = 'x-da-janela'
    botaoFixo.type = 'button'
    botaoFixo.setAttribute('aria-label', 'Fechar')
    botaoFixo.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>'
    botaoFixo.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation()
      alvoDoFixo?.click()
      agendar()
    })
    document.body.appendChild(botaoFixo)
  }
  botaoFixo.hidden = false
}

let quadro = 0
let ultimo = 0
function agendar() {
  if (quadro) return
  const espera = Math.max(0, 180 - (performance.now() - ultimo))
  quadro = window.setTimeout(conferir, espera)
}

function conferir() {
  quadro = 0
  ultimo = performance.now()
  if (!matchMedia('(max-width: 900px)').matches) { mostrarFixo(null); return }
  const janelas = janelasAbertas()
  if (!janelas.length) { mostrarFixo(null); return }
  for (const j of janelas) abrirEspacoDaHora(j)
  // a janela de cima decide o "X" fixo: a de dentro (janela aberta por cima de outra), depois a de
  // maior camada, depois a última na página
  const internas = janelas.filter((f) => !janelas.some((o) => o !== f && f.contains(o)))
  const deCima = internas.reduce((a, b) => {
    const za = Number(getComputedStyle(a).zIndex) || 0
    const zb = Number(getComputedStyle(b).zIndex) || 0
    if (zb !== za) return zb > za ? b : a
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? b : a
  })
  const fechar = botaoDeFechar(deCima)
  mostrarFixo(fechar && !aoAlcance(fechar) ? fechar : null)
}

export function ligarJanelasNoCelular(): void {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return
  const iniciar = () => {
    medirFaixas()
    new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true })
    window.addEventListener('scroll', agendar, { capture: true, passive: true })
    window.addEventListener('resize', () => { medirFaixas(); agendar() }, { passive: true })
    agendar()
  }
  if (document.body) iniciar()
  else document.addEventListener('DOMContentLoaded', iniciar, { once: true })
}
