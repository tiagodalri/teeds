import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * O texto do assistente, arrumado para ler (19/11/2026, Tiago: "tudo bugado sem layout").
 *
 * A I.A. devolve texto cru, e o Gemini quebra linha no meio da frase
 * ("não há percentual recomendado\n, pois…"). Antes a tela mostrava as quebras
 * como vinham (white-space: pre-wrap) e cada resposta parecia um bilhete torto.
 * Aqui a frase quebrada volta a ser uma linha só, cada frase solta vira
 * parágrafo, linhas que começam com "-", "•" ou "1." viram lista, e **assim**
 * vira negrito. Nada de HTML vindo de fora: tudo é montado como elemento.
 */

const ITEM = /^\s*(?:[-•*–]|\d+[.)])\s+/
const PONTUACAO_NO_INICIO = /^[,.;:!?)\]]/
const FIM_DE_FRASE = /[.!?:…)"”»]$/

/** Junta as frases que a I.A. quebrou no meio e tira as linhas vazias repetidas. */
export function arrumarQuebras(texto: string): string {
  const saida: string[] = []
  for (const bruta of texto.replace(/\r/g, '').split('\n')) {
    const linha = bruta.trim()
    const anterior = saida.length ? saida[saida.length - 1] : ''
    const continua = linha && anterior && !ITEM.test(linha) &&
      (PONTUACAO_NO_INICIO.test(linha) || /^[a-zà-ú]/.test(linha) || (!FIM_DE_FRASE.test(anterior) && !ITEM.test(anterior)))
    if (continua) saida[saida.length - 1] = PONTUACAO_NO_INICIO.test(linha) ? anterior + linha : `${anterior} ${linha}`
    else saida.push(linha)
  }
  return saida.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** **negrito** — o que sobrar de um par aberto (no meio da animação) some em vez de aparecer o asterisco. */
function emLinha(texto: string): ReactNode[] {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g)
  return partes.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') && p.length > 4
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : <Fragment key={i}>{p.replace(/\*\*/g, '')}</Fragment>)
}

type Bloco = { tipo: 'p'; texto: string } | { tipo: 'ul' | 'ol'; itens: string[] }

function blocos(texto: string): Bloco[] {
  const lista: Bloco[] = []
  for (const linha of texto.split('\n')) {
    if (!linha.trim()) continue
    if (ITEM.test(linha)) {
      const ordenada = /^\s*\d+[.)]/.test(linha)
      const item = linha.replace(ITEM, '')
      const ultimo = lista[lista.length - 1]
      if (ultimo && ultimo.tipo === (ordenada ? 'ol' : 'ul')) (ultimo as { itens: string[] }).itens.push(item)
      else lista.push({ tipo: ordenada ? 'ol' : 'ul', itens: [item] })
    } else lista.push({ tipo: 'p', texto: linha })
  }
  return lista
}

export function TextoFormatado({ texto }: { texto: string }) {
  return (
    <>
      {blocos(texto).map((b, i) => b.tipo === 'p'
        ? <p key={i}>{emLinha(b.texto)}</p>
        : b.tipo === 'ul'
          ? <ul key={i}>{b.itens.map((t, k) => <li key={k}>{emLinha(t)}</li>)}</ul>
          : <ol key={i}>{b.itens.map((t, k) => <li key={k}>{emLinha(t)}</li>)}</ol>)}
    </>
  )
}

const semMovimento = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A resposta nova aparece palavra por palavra, como quem escreve — rápido
 * (no máximo 1,2 s, qualquer que seja o tamanho), só para a resposta não
 * "cair" inteira de uma vez. As que já estavam na tela aparecem prontas.
 */
export function RespostaFormatada({ texto, animar, aoCrescer, aoTerminar }: {
  texto: string; animar: boolean; aoCrescer?: () => void; aoTerminar?: () => void
}) {
  const limpo = arrumarQuebras(texto)
  const palavras = useRef(limpo.split(/(\s+)/))
  palavras.current = limpo.split(/(\s+)/)
  const total = palavras.current.length
  const [n, setN] = useState(animar && !semMovimento() ? 0 : total)

  useEffect(() => {
    if (n >= total) return
    const duracao = Math.min(1200, Math.max(380, total * 14))
    const inicio = performance.now()
    let quadro = 0
    const passo = (agora: number) => {
      const fatia = Math.min(1, (agora - inicio) / duracao)
      // começa um pouco mais devagar e acelera no fim (lê melhor que linear)
      const visiveis = Math.ceil(total * (fatia * fatia * (3 - 2 * fatia)))
      setN(visiveis)
      aoCrescer?.()
      if (fatia < 1) quadro = requestAnimationFrame(passo)
      else aoTerminar?.()
    }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visivel = n >= total ? limpo : palavras.current.slice(0, n).join('')
  return <div className={`as-texto${n < total ? ' escrevendo' : ''}`}><TextoFormatado texto={visivel} /></div>
}
