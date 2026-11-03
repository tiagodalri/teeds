/**
 * Lançamento da GlobalFly (03/11/2026, Tiago: "não utilizasse o nome da corretora nessa fase de
 * lançamento... a gente só vai anunciar que é a corretora Deriv para quem já tiver o acesso para a
 * plataforma").
 *
 * Enquanto a plataforma está trancada até a live, a página de trás (Início, topo) também não diz
 * o nome: "Deriv" vira "corretora" no texto desenhado e o logotipo some (CSS em
 * `html[data-corretora-discreta]`). Liberou o acesso, `desligar` devolve cada texto como era.
 * As telas do funil (PreAcesso, TrancaDoLancamento) já são escritas sem o nome; aqui é a rede
 * para o resto da plataforma que aparece por trás.
 *
 * Puro em `semNomeDaCorretora` (dá para testar sem tela).
 */

const L = 'A-Za-zÀ-ÖØ-öø-ÿ0-9'
// "conta Deriv" vira "conta da corretora"; o resto, "corretora" (com a caixa do original).
// Endereço (home.deriv.com) não é tocado: só a palavra solta, sem ponto colado.
const reConta = new RegExp(`(?<![${L}])(conta|Conta|CONTA)(\\s+)(Deriv|DERIV)(?![${L}]|\\.[a-z])`, 'g')
const reSolto = new RegExp(`(?<![${L}.\\/])(Deriv|DERIV)(?![${L}]|\\.[a-z])`, 'g')
const temDeriv = /Deriv|DERIV/

export function semNomeDaCorretora(texto: string): string {
  if (!temDeriv.test(texto)) return texto
  return texto
    .replace(reConta, (_, conta: string, espaco: string, d: string) => `${conta}${espaco}${d === 'DERIV' ? 'DA CORRETORA' : 'da corretora'}`)
    .replace(reSolto, (d: string, _g: string, offset: number, tudo: string) => {
      if (d === 'DERIV') return 'CORRETORA'
      // começo de frase: "Corretora"
      const antes = tudo.slice(0, offset).trimEnd()
      return !antes || /[.!?:]$/.test(antes) ? 'Corretora' : 'corretora'
    })
}

const ATRIBUTOS = ['title', 'aria-label', 'placeholder', 'alt']
const PULAR = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'NOSCRIPT'])

/** Liga na página inteira. Devolve a função que desliga e devolve os textos originais. */
export function ligarCorretoraDiscreta(): () => void {
  const originais = new Map<Text, { antes: string; depois: string }>()
  const atributos = new Map<Element, Map<string, { antes: string; depois: string }>>()
  const pula = (el: Element | null) => { for (let e = el; e; e = e.parentElement) if (PULAR.has(e.tagName) || (e as HTMLElement).isContentEditable) return true; return false }
  const texto = (n: Text) => {
    const v = n.nodeValue
    if (!v || !temDeriv.test(v) || pula(n.parentElement)) return
    const novo = semNomeDaCorretora(v)
    if (novo === v) return
    originais.set(n, { antes: v, depois: novo })
    n.nodeValue = novo
  }
  const attrs = (el: Element) => {
    for (const a of ATRIBUTOS) {
      const v = el.getAttribute(a)
      if (!v || !temDeriv.test(v)) continue
      const novo = semNomeDaCorretora(v)
      if (novo === v) continue
      if (!atributos.has(el)) atributos.set(el, new Map())
      atributos.get(el)!.set(a, { antes: v, depois: novo })
      el.setAttribute(a, novo)
    }
  }
  const varrer = (raiz: Node) => {
    if (raiz.nodeType === Node.TEXT_NODE) return texto(raiz as Text)
    if (raiz.nodeType !== Node.ELEMENT_NODE || PULAR.has((raiz as Element).tagName)) return
    attrs(raiz as Element)
    const andar = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
    for (let n = andar.nextNode(); n; n = andar.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) texto(n as Text); else attrs(n as Element)
    }
  }
  const observador = new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      if (m.type === 'characterData') texto(m.target as Text)
      else if (m.type === 'attributes') { if (!pula(m.target as Element)) attrs(m.target as Element) }
      else m.addedNodes.forEach(varrer)
    }
  })
  document.documentElement.setAttribute('data-corretora-discreta', '')
  varrer(document.body)
  observador.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS })
  return () => {
    observador.disconnect()
    document.documentElement.removeAttribute('data-corretora-discreta')
    // só volta o que ninguém mudou depois (o React pode ter escrito outro texto no mesmo lugar)
    for (const [n, { antes, depois }] of originais) if (n.isConnected && n.nodeValue === depois) n.nodeValue = antes
    for (const [el, mapa] of atributos) for (const [a, { antes, depois }] of mapa) if (el.isConnected && el.getAttribute(a) === depois) el.setAttribute(a, antes)
  }
}
