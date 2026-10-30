import type { ReactNode } from 'react'

/*
  Texto com formatação simples para a descrição das tarefas (30/10/2026).
  É o mesmo jeito do WhatsApp e do Notion: **negrito**, _itálico_, `código`,
  [texto](https://link), "- " para lista, "1. " para lista numerada, "### "
  para subtítulo e "> " para destaque. Links soltos viram clicáveis.
  Monta elementos do React (nada de HTML cru), então não há como injetar código.
*/

const LINK_OK = /^(https?:\/\/|mailto:)/i

function inline(texto: string, chave: string): ReactNode[] {
  const saida: ReactNode[] = []
  // ordem importa: link com texto, código, negrito, itálico, link solto
  const re = /\[([^\]\n]+)\]\(([^)\s]+)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|(^|[\s(])[_*]([^_*\n]+)[_*](?=$|[\s.,;:!?)])|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g
  let ultimo = 0
  let m: RegExpExecArray | null
  let n = 0
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) saida.push(texto.slice(ultimo, m.index))
    const k = `${chave}-${n++}`
    if (m[1] !== undefined) saida.push(LINK_OK.test(m[2]) ? <a key={k} href={m[2]} target="_blank" rel="noopener noreferrer">{m[1]}</a> : m[0])
    else if (m[3] !== undefined) saida.push(<code key={k}>{m[3]}</code>)
    else if (m[4] !== undefined) saida.push(<strong key={k}>{inline(m[4], k)}</strong>)
    else if (m[6] !== undefined) { if (m[5]) saida.push(m[5]); saida.push(<em key={k}>{inline(m[6], k)}</em>) }
    else if (m[7] !== undefined) saida.push(<a key={k} href={m[7]} target="_blank" rel="noopener noreferrer">{m[7].replace(/^https?:\/\/(www\.)?/, '')}</a>)
    ultimo = re.lastIndex
  }
  if (ultimo < texto.length) saida.push(texto.slice(ultimo))
  return saida
}

export function TextoRico({ texto }: { texto: string }) {
  const linhas = texto.replace(/\r/g, '').split('\n')
  const blocos: ReactNode[] = []
  let i = 0
  while (i < linhas.length) {
    const l = linhas[i]
    const k = `b${i}`
    if (!l.trim()) { i++; continue }
    if (/^\s*[-*•]\s+/.test(l)) {
      const itens: string[] = []
      while (i < linhas.length && /^\s*[-*•]\s+/.test(linhas[i])) itens.push(linhas[i++].replace(/^\s*[-*•]\s+/, ''))
      blocos.push(<ul key={k}>{itens.map((t, j) => <li key={j}>{inline(t, `${k}-${j}`)}</li>)}</ul>)
      continue
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      const itens: string[] = []
      while (i < linhas.length && /^\s*\d+[.)]\s+/.test(linhas[i])) itens.push(linhas[i++].replace(/^\s*\d+[.)]\s+/, ''))
      blocos.push(<ol key={k}>{itens.map((t, j) => <li key={j}>{inline(t, `${k}-${j}`)}</li>)}</ol>)
      continue
    }
    if (/^#{1,6}\s+/.test(l)) { blocos.push(<h5 key={k}>{inline(l.replace(/^#{1,6}\s+/, ''), k)}</h5>); i++; continue }
    if (/^>\s?/.test(l)) {
      const partes: string[] = []
      while (i < linhas.length && /^>\s?/.test(linhas[i])) partes.push(linhas[i++].replace(/^>\s?/, ''))
      blocos.push(<blockquote key={k}>{partes.map((t, j) => <p key={j}>{inline(t, `${k}-${j}`)}</p>)}</blockquote>)
      continue
    }
    // parágrafo: linhas seguidas até a próxima em branco ou bloco especial
    const partes: string[] = []
    while (i < linhas.length && linhas[i].trim() && !/^\s*([-*•]|\d+[.)]|#{1,6}|>)\s/.test(linhas[i])) partes.push(linhas[i++])
    if (!partes.length) { partes.push(linhas[i++]) }
    blocos.push(<p key={k}>{partes.flatMap((t, j) => (j ? [<br key={`br${j}`} />, ...inline(t, `${k}-${j}`)] : inline(t, `${k}-${j}`)))}</p>)
  }
  return <div className="ot-rico">{blocos}</div>
}
