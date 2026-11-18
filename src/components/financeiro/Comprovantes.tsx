/*
  Comprovantes do lançamento: cartões com miniatura da 1ª página (PDF) ou da imagem, e prévia
  dentro do próprio financeiro (sem abrir outra aba), com Baixar e Abrir em nova aba.
*/
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { abrirPdf, desenharPagina } from './pdf'

export interface ItemComprovante {
  chave: string
  nome: string
  tipo: string
  tamanho: number
  novo: boolean
  /** Endereço para ver/baixar (link assinado do armazenamento ou do arquivo escolhido agora). */
  url: () => Promise<string>
}

const tamanho = (b: number) => b > 1e6 ? `${(b / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1e3))} kB`
const ehPdf = (i: ItemComprovante) => i.tipo === 'application/pdf' || /\.pdf$/i.test(i.nome)
const ehImagem = (i: ItemComprovante) => i.tipo.startsWith('image/') && !/hei[cf]/i.test(i.tipo) && !/\.hei[cf]$/i.test(i.nome)
const rotulo = (i: ItemComprovante) => ehPdf(i) ? 'PDF' : i.tipo.startsWith('image/') || /\.hei[cf]$/i.test(i.nome) ? 'Imagem' : 'Arquivo'
/** Link assinado do armazenamento: `download=` faz o navegador baixar com o nome certo. */
const paraBaixar = (u: string, nome: string) => /^https?:/.test(u) ? `${u}${u.includes('?') ? '&' : '?'}download=${encodeURIComponent(nome)}` : u
const bytes = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error('falhou'); return r.arrayBuffer() })

function IconeDoc() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
}

/** Miniatura: 1ª página do PDF ou a própria imagem. */
function Miniatura({ item }: { item: ItemComprovante }) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const [img, setImg] = useState<string | null>(null)
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'sem'>('carregando')
  useEffect(() => {
    let vivo = true
    const fim = (e: 'pronto' | 'sem') => { if (vivo) setEstado(e) }
    if (ehPdf(item)) {
      abrirPdf(item.chave, () => item.url().then(bytes))
        .then((doc) => canvas.current ? desenharPagina(doc, 1, canvas.current, 240) : undefined)
        .then(() => fim('pronto'), () => fim('sem'))
    } else if (ehImagem(item)) {
      item.url().then((u) => { if (vivo) setImg(u) }, () => fim('sem'))
    } else fim('sem')
    return () => { vivo = false }
  }, [item.chave]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className={`fin-comp-mini ${estado}`}>
      {ehPdf(item) && <canvas ref={canvas} aria-hidden="true" />}
      {img && <img src={img} alt="" onLoad={() => setEstado('pronto')} onError={() => setEstado('sem')} />}
      {estado !== 'pronto' && <span className="fin-comp-mini-icone"><IconeDoc /></span>}
      <span className="fin-comp-tipo">{rotulo(item)}</span>
    </span>
  )
}

export function Comprovantes({ itens, aoTirar, aoAnexar, aoErro }: {
  itens: ItemComprovante[]
  aoTirar?: (chave: string) => void
  aoAnexar?: () => void
  aoErro: (m: string) => void
}) {
  const [aberto, setAberto] = useState<number | null>(null)
  return (
    <>
      <div className="fin-comps">
        {itens.map((it, i) => (
          <div key={it.chave} className={`fin-comp${it.novo ? ' novo' : ''}`}>
            <button type="button" className="fin-comp-abrir" onClick={() => setAberto(i)} aria-label={`Ver ${it.nome}`}>
              <Miniatura item={it} />
              <span className="fin-comp-info">
                <b title={it.nome}>{it.nome}</b>
                <small>{rotulo(it)} · {tamanho(it.tamanho)}</small>
                {it.novo && <em>Sobe ao salvar</em>}
              </span>
            </button>
            {aoTirar && <button type="button" className="fin-comp-tirar" aria-label={`Tirar ${it.nome}`} title="Tirar" onClick={() => aoTirar(it.chave)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>}
          </div>
        ))}
        {aoAnexar && <button type="button" className="fin-comp-anexar" onClick={aoAnexar}>
          <span className="fin-comp-anexar-icone"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></span>
          <b>Anexar comprovante</b>
          <small>PDF ou imagem, até 10 MB</small>
        </button>}
      </div>
      {aberto !== null && itens[aberto] && <Previa itens={itens} indice={aberto} aoMudar={setAberto} aoFechar={() => setAberto(null)} aoErro={aoErro} />}
    </>
  )
}

/** Prévia em tela cheia, por cima do editor. Esc fecha só a prévia; setas trocam de comprovante. */
function Previa({ itens, indice, aoMudar, aoFechar, aoErro }: {
  itens: ItemComprovante[]; indice: number; aoMudar: (i: number) => void; aoFechar: () => void; aoErro: (m: string) => void
}) {
  const it = itens[indice]
  const [url, setUrl] = useState<string | null>(null)
  const [paginas, setPaginas] = useState(0)
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'sem'>('carregando')
  const corpo = useRef<HTMLDivElement | null>(null)
  const telas = useRef<(HTMLCanvasElement | null)[]>([])
  const fechar = useRef<HTMLButtonElement | null>(null)
  const total = itens.length
  const ir = useCallback((d: number) => { if (total > 1) aoMudar((indice + d + total) % total) }, [indice, total, aoMudar])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); aoFechar() }
      else if (e.key === 'ArrowRight') { e.stopImmediatePropagation(); ir(1) }
      else if (e.key === 'ArrowLeft') { e.stopImmediatePropagation(); ir(-1) }
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [ir, aoFechar])
  useEffect(() => { fechar.current?.focus({ preventScroll: true }) }, [])

  // endereço e número de páginas
  useEffect(() => {
    let vivo = true
    setUrl(null); setPaginas(0); setEstado('carregando'); telas.current = []
    corpo.current?.scrollTo({ top: 0 })
    it.url().then((u) => {
      if (!vivo) return
      setUrl(u)
      if (ehPdf(it)) abrirPdf(it.chave, () => bytes(u)).then((d) => { if (vivo) setPaginas(Math.min(d.numPages, 40)) }, () => { if (vivo) setEstado('sem') })
      else if (!ehImagem(it)) setEstado('sem')
    }, (e) => { if (vivo) { setEstado('sem'); aoErro((e as Error).message || 'Não foi possível abrir o comprovante.') } })
    return () => { vivo = false }
  }, [it.chave]) // eslint-disable-line react-hooks/exhaustive-deps

  // desenha as páginas na largura da área de leitura
  useEffect(() => {
    if (!paginas) return
    let vivo = true
    const c = corpo.current
    const folga = c ? parseFloat(getComputedStyle(c).paddingLeft) + parseFloat(getComputedStyle(c).paddingRight) : 32
    const largura = Math.min((c?.clientWidth ?? 800) - folga, 860)
    abrirPdf(it.chave, () => (url ? bytes(url) : Promise.reject(new Error('sem endereço'))))
      .then(async (d) => {
        for (let n = 1; n <= paginas && vivo; n++) {
          const c = telas.current[n - 1]
          if (c) await desenharPagina(d, n, c, largura)
          if (n === 1 && vivo) setEstado('pronto') // a 1ª página já dá para ler; as outras chegam em seguida
        }
      }, () => { if (vivo) setEstado('sem') })
    return () => { vivo = false }
  }, [paginas, it.chave]) // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div className="fin fin-previa-fundo" role="dialog" aria-modal="true" aria-label={`Comprovante: ${it.nome}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar() }}>
      <div className={`fin-previa${total > 1 ? ' com-setas' : ''}`}>
        <header>
          <span className="fin-previa-tipo">{rotulo(it)}</span>
          <div className="fin-previa-titulo">
            <b title={it.nome}>{it.nome}</b>
            <small>{tamanho(it.tamanho)}{paginas > 1 ? ` · ${paginas} páginas` : ''}{total > 1 ? ` · ${indice + 1} de ${total}` : ''}{it.novo ? ' · Sobe ao salvar' : ''}</small>
          </div>
          <div className="fin-previa-acoes">
            {url && <a className="fin-btn fin-btn-sm" href={paraBaixar(url, it.nome)} download={it.nome}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg><span>Baixar</span></a>}
            {url && <a className="fin-btn fin-btn-sm fin-previa-nova" href={url} target="_blank" rel="noreferrer">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg><span>Abrir em nova aba</span></a>}
            <button ref={fechar} type="button" className="fin-fechar" onClick={aoFechar} aria-label="Fechar">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </header>
        <div ref={corpo} className={`fin-previa-corpo ${estado}`}>
          {ehPdf(it) && Array.from({ length: paginas }, (_, i) => <canvas key={`${it.chave}-${i}`} ref={(c) => { telas.current[i] = c }} className="fin-previa-pagina" aria-label={`Página ${i + 1}`} />)}
          {ehImagem(it) && url && <img className="fin-previa-img" src={url} alt={it.nome} onLoad={() => setEstado('pronto')} onError={() => setEstado('sem')} />}
          {estado === 'carregando' && <div className="fin-previa-aviso"><span className="fin-previa-gira" aria-hidden="true" />Abrindo o comprovante…</div>}
          {estado === 'sem' && <div className="fin-previa-aviso">
            <IconeDoc />
            <p>Não dá para mostrar este arquivo aqui.</p>
            {url && <a className="fin-btn" href={url} target="_blank" rel="noreferrer">Abrir em nova aba</a>}
          </div>}
        </div>
        {total > 1 && <>
          <button type="button" className="fin-previa-seta esq" onClick={() => ir(-1)} aria-label="Comprovante anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
          <button type="button" className="fin-previa-seta dir" onClick={() => ir(1)} aria-label="Próximo comprovante"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></button>
        </>}
      </div>
    </div>,
    document.body,
  )
}
