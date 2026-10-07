/**
 * Auditor de celular — cole no console do navegador com a tela a 375px.
 *
 *   1. abra a tela (produção, dev ou laboratorio.html) com o viewport de celular
 *   2. cole este arquivo inteiro no console e dê Enter
 *   3. leia `auditar()`
 *
 * Foi com isto que as ondas 2 e 3 da revisão de celular (07/10/2026) foram
 * medidas, tela a tela. Ele percorre o DOM e acusa quatro coisas, e só elas:
 *
 *  - alvo de toque com menos de 44px em qualquer direção (botões, links,
 *    campos, abas);
 *  - texto visível abaixo de 11px;
 *  - texto cortado (nowrap + overflow escondido sem reticências);
 *  - elemento saindo da tela pela direita fora de uma área de rolagem.
 *
 * Não corrige nada: mede. A correção mora em `src/styles/mobile-polish.css`,
 * sempre dentro de @media (max-width), e a prova `teste-celular.ts` garante
 * que o desktop não muda.
 */
window.auditar = function () {
  const W = innerWidth
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0' }
  const nome = (e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '')
  const cadeia = (el) => { const p = []; let e = el; for (let i = 0; i < 3 && e && e !== document.body; i++) { p.unshift(nome(e)); e = e.parentElement } return p.join(' > ') }
  const txt = (el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)
  const out = { largura: W, rolaLateral: document.documentElement.scrollWidth > W + 1, alvos: [], textos: [], cortados: [], fora: [] }
  for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab]')) {
    if (!vis(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width < 43.5 || r.height < 43.5) out.alvos.push(`${cadeia(el)} (${Math.round(r.width)}x${Math.round(r.height)}) ${txt(el)}`)
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const vistos = new Set()
  while (walker.nextNode()) {
    const n = walker.currentNode
    if (!n.textContent.trim()) continue
    const el = n.parentElement
    if (!el || vistos.has(el) || !vis(el)) continue
    vistos.add(el)
    const fs = parseFloat(getComputedStyle(el).fontSize)
    if (fs < 11) out.textos.push(`${cadeia(el)} | ${txt(el)} ${fs.toFixed(1)}px`)
  }
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue
    const cs = getComputedStyle(el)
    if (cs.overflowX !== 'visible' && cs.whiteSpace === 'nowrap' && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== 'ellipsis' && el.children.length === 0) {
      out.cortados.push(`${cadeia(el)} | ${txt(el)} sobra ${el.scrollWidth - el.clientWidth}`)
    }
    const r = el.getBoundingClientRect()
    if (r.right > W + 2 && r.left < W && cs.position !== 'fixed') {
      let p = el.parentElement, dentro = false
      while (p) { const c = getComputedStyle(p); if (/(auto|scroll)/.test(c.overflowX)) { dentro = true; break } p = p.parentElement }
      if (!dentro) out.fora.push(`${cadeia(el)} sobra ${Math.round(r.right - W)}`)
    }
  }
  for (const k of ['alvos', 'textos', 'cortados', 'fora']) out[k] = [...new Set(out[k])]
  out.resumo = { alvos: out.alvos.length, textos: out.textos.length, cortados: out.cortados.length, fora: out.fora.length }
  return out
}
console.log('auditor pronto: rode auditar()')
