/**
 * A página pública dos termos (27/10/2026): globalflytrade.com/termos/.
 *
 * Quem ainda não entrou (a página de cadastro, o anúncio, o advogado) precisa
 * ler os termos sem login. O build da marca gera esta página a partir dos
 * mesmos .md que a plataforma mostra no aceite (src/termos/<marca>/), então os
 * dois textos nunca divergem. Cada documento ganha uma âncora: /termos/#politica-de-privacidade.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const neg = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')

function md(texto: string): string {
  const ls = texto.split('\n'), out: string[] = []
  let i = 0
  while (i < ls.length) {
    const l = ls[i].trimEnd()
    if (!l.trim() || l.startsWith('# ')) { i++; continue }
    if (l.startsWith('## ')) { out.push(`<h3>${neg(l.slice(3))}</h3>`); i++; continue }
    if (l.startsWith('- ')) {
      const it: string[] = []
      while (i < ls.length && ls[i].startsWith('- ')) { it.push(`<li>${neg(ls[i].slice(2))}</li>`); i++ }
      out.push(`<ul>${it.join('')}</ul>`); continue
    }
    if (l.startsWith('|')) {
      const rows: string[][] = []
      while (i < ls.length && ls[i].startsWith('|')) {
        const c = ls[i].split('|').slice(1, -1).map((x) => x.trim())
        if (!c.every((x) => /^-+$/.test(x))) rows.push(c)
        i++
      }
      const [cab, ...corpo] = rows
      out.push(`<div class="tabela"><table><tr>${cab.map((x) => `<th>${neg(x)}</th>`).join('')}</tr>${corpo.map((r) => `<tr>${r.map((x) => `<td>${neg(x)}</td>`).join('')}</tr>`).join('')}</table></div>`)
      continue
    }
    const par: string[] = []
    while (i < ls.length && ls[i].trim() && !/^(#|- |\|)/.test(ls[i])) { par.push(ls[i].trim()); i++ }
    out.push(`<p>${neg(par.join(' '))}</p>`)
  }
  return out.join('')
}

export function paginaDosTermos(pasta: string, nomeDaMarca: string, dataDaVersao: string): string {
  const docs = readdirSync(pasta).filter((f) => f.endsWith('.md')).sort().map((f) => {
    const texto = readFileSync(join(pasta, f), 'utf8')
    return { id: f.replace(/^\d+-/, '').replace(/\.md$/, ''), titulo: texto.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? f, texto }
  })
  const indice = docs.map((d) => `<a href="#${d.id}">${esc(d.titulo)}</a>`).join('')
  const corpo = docs.map((d) => `<section id="${d.id}"><h2>${esc(d.titulo)}</h2>${md(d.texto)}</section>`).join('')
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Termos e políticas · ${esc(nomeDaMarca)}</title><meta name="robots" content="index,follow"><meta name="theme-color" content="#051528">
<style>
:root{--azul:#051528;--ouro:#B78D39;--marfim:#F3F0E9;--tinta:#051528;--suave:#4E6582;--linha:#E0DBD0}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:76px}
body{margin:0;background:var(--marfim);color:var(--tinta);font:16px/1.65 "Helvetica Neue",Helvetica,Arial,sans-serif}
header{position:sticky;top:0;z-index:2;background:var(--azul);color:var(--marfim);padding:14px max(16px,env(safe-area-inset-left))}
header .in{max-width:860px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px}
header b{letter-spacing:.2em;font-size:13px}header span{font-size:12px;color:#9CB1C7}
main{max-width:860px;margin:0 auto;padding:28px 16px 64px}
h1{font-size:clamp(28px,6vw,40px);line-height:1.1;letter-spacing:-.02em;margin:0 0 6px}
.sub{color:var(--suave);margin:0 0 20px}
nav{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 28px}
nav a{padding:7px 12px;border:1px solid var(--linha);border-radius:99px;background:#fff;color:var(--tinta);text-decoration:none;font-size:13.5px}
nav a:hover{border-color:var(--ouro)}
section{background:#fff;border:1px solid var(--linha);border-radius:16px;padding:24px clamp(16px,4vw,32px);margin:0 0 18px}
h2{font-size:22px;margin:0 0 12px;padding-bottom:10px;border-bottom:2px solid var(--ouro)}
h3{font-size:16px;margin:22px 0 6px}p{margin:0 0 12px}ul{margin:0 0 12px;padding-left:22px}li{margin-bottom:4px}
.tabela{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px;margin:4px 0 14px}
th,td{text-align:left;padding:8px;border-bottom:1px solid var(--linha);vertical-align:top}th{font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--suave)}
.versao{color:var(--suave);font-size:13px;text-align:center}
</style></head><body>
<header><div class="in"><b>${esc(nomeDaMarca.toUpperCase())}</b><span>Termos e políticas</span></div></header>
<main><h1>Termos e políticas</h1><p class="sub">Os combinados para usar a ${esc(nomeDaMarca)}. São os mesmos textos que você aceita no primeiro acesso à plataforma.</p>
<nav>${indice}</nav>${corpo}<p class="versao">Versão de ${esc(dataDaVersao)}.</p></main>
</body></html>`
}
