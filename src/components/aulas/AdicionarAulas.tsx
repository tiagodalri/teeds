import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { playerDoVideo } from '../../core/teeds/aulas'
import type { GradeAulas } from '../../core/teeds/gradeAulas'
import { IconeFechar } from '../IconeFechar'
import './adicionar-aulas.css'

/**
 * Adicionar várias aulas de uma vez (16/11/2026, Tiago: "subir aulas, cursos, módulos
 * com facilidade"). Cola-se uma lista: um link por linha (YouTube, Vimeo ou MP4), um
 * título por linha, ou os dois ("Título | link"). O título de cada vídeo do YouTube e
 * do Vimeo vem sozinho; dá para corrigir antes de criar. As aulas entram no assunto
 * escolhido (ou num módulo novo) e ficam no rascunho, como tudo no editor. Prefixo adl- (era aa-, que é o do painel de Anúncios: a janela limitava a altura do painel, 17/11/2026).
 */

export interface AulaNova { titulo: string; video: string }
export type Destino = { assunto: string } | { novoModulo: string }

interface Linha { chave: string; titulo: string; video: string; buscando: boolean; tituloDaLinha: boolean }

const URL_RE = /https?:\/\/\S+/i
const titulos = new Map<string, string | null>()

async function tituloDoVideo(url: string): Promise<string | null> {
  if (titulos.has(url)) return titulos.get(url)!
  const p = playerDoVideo(url)
  let fonte: string | null = null
  if (p?.tipo === 'youtube' && p.id) fonte = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${p.id}`)}`
  else if (p?.tipo === 'vimeo') fonte = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`
  let t: string | null = null
  if (fonte) {
    try { const r = await fetch(fonte, { signal: AbortSignal.timeout(6000) }); if (r.ok) t = ((await r.json()) as { title?: string }).title?.trim() || null }
    catch { return null /* sem rede ou demorou: não guarda, tenta de novo na próxima */ }
  } else if (p?.tipo === 'mp4') {
    t = decodeURIComponent(url.split('?')[0].split('/').pop() ?? '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim() || null
  }
  titulos.set(url, t)
  return t
}

function lerLista(texto: string): Array<{ titulo: string; video: string }> {
  return texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const u = l.match(URL_RE)?.[0] ?? ''
    // sem o link, sem separadores nas pontas e sem a numeração da lista ("5 - ")
    const titulo = (u ? l.replace(u, '') : l).replace(/^[\s|\-–—:;,]+|[\s|\-–—:;,]+$/g, '').replace(/^\d{1,3}\s*[-.)–—:]\s+/, '').trim()
    return { titulo, video: u.replace(/[),.;]+$/, '') }
  })
}

export function AdicionarAulas({ grade, curso, destinoInicial, aoCriar, aoFechar }: {
  grade: GradeAulas; curso: string; destinoInicial?: string
  aoCriar: (aulas: AulaNova[], destino: Destino, visiveis: boolean) => void; aoFechar: () => void
}) {
  const modulos = grade.modulos.filter((m) => m.curso === curso)
  const [texto, setTexto] = useState('')
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [editados, setEditados] = useState<Record<string, string>>({})
  const [destino, setDestino] = useState(destinoInicial ?? modulos[0]?.assuntos[modulos[0].assuntos.length - 1]?.id ?? '__novo')
  const [nomeDoModulo, setNomeDoModulo] = useState('')
  const [visiveis, setVisiveis] = useState(true)
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { area.current?.focus() }, [])
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc) }, [aoFechar])

  useEffect(() => {
    let vivo = true
    const vistas = new Map<string, number>()
    const lidas = lerLista(texto).map((x) => { const base = x.video || x.titulo; const n = (vistas.get(base) ?? 0) + 1; vistas.set(base, n); return { ...x, base: `${base}#${n}` } }).map((x) => ({ chave: x.base, titulo: x.titulo, video: x.video, tituloDaLinha: !!x.titulo, buscando: !x.titulo && !!x.video && !titulos.has(x.video) }))
    setLinhas(lidas.map((l) => (!l.titulo && l.video && titulos.has(l.video) ? { ...l, titulo: titulos.get(l.video) ?? '' } : l)))
    const faltam = lidas.filter((l) => l.buscando)
    const t = setTimeout(() => {
      for (const l of faltam) void tituloDoVideo(l.video).then((achado) => {
        if (vivo) setLinhas((ls) => ls.map((x) => (x.chave === l.chave ? { ...x, titulo: x.titulo || achado || '', buscando: false } : x)))
      })
    }, 350)
    return () => { vivo = false; clearTimeout(t) }
  }, [texto])

  const prontas = useMemo(() => linhas.map((l, i) => ({ ...l, titulo: (editados[l.chave] ?? l.titulo).trim() || `Aula ${i + 1}` })), [linhas, editados])
  const ruins = linhas.filter((l) => { const p = l.video ? playerDoVideo(l.video) : null; return !!l.video && !(p?.tipo === 'vimeo' || p?.tipo === 'mp4' || (p?.tipo === 'youtube' && p.id)) })
  const novo = destino === '__novo'
  const podeCriar = prontas.length > 0 && !linhas.some((l) => l.buscando) && (!novo || nomeDoModulo.trim().length > 0)
  const criar = () => {
    if (!podeCriar) return
    aoCriar(prontas.map((l) => ({ titulo: l.titulo, video: l.video })), novo ? { novoModulo: nomeDoModulo.trim() } : { assunto: destino }, visiveis)
  }

  return createPortal(
    <div className="adl-fundo" onMouseDown={aoFechar}>
      <section className="adl" role="dialog" aria-modal="true" aria-label="Adicionar aulas" onMouseDown={(e) => e.stopPropagation()}>
        <header className="adl-cab">
          <div><b>Adicionar aulas</b><small>Cole a lista: um link por linha, um título por linha, ou os dois (Título | link).</small></div>
          <button type="button" className="adl-x" onClick={aoFechar} aria-label="Fechar"><IconeFechar /></button>
        </header>
        <div className="adl-corpo">
          <label className="adl-cola">
            <span>Links ou títulos</span>
            <textarea ref={area} value={texto} onChange={(e) => setTexto(e.target.value)} spellCheck={false} rows={10}
              placeholder={'https://youtu.be/…\nhttps://youtu.be/…\nComo sacar da corretora | https://youtu.be/…\nAula sem vídeo ainda'}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); criar() } }} />
            <small>YouTube (não listado), Vimeo ou MP4. O título do vídeo vem sozinho. Linha sem link vira aula sem vídeo, que aparece como "Em breve".</small>
          </label>
          <div className="adl-lista" aria-live="polite">
            <span>{prontas.length ? `${prontas.length} ${prontas.length === 1 ? 'aula' : 'aulas'}` : 'Prévia'}</span>
            {!prontas.length && <p className="adl-vazio">As aulas aparecem aqui conforme você cola.</p>}
            <ol>
              {prontas.map((l, i) => {
                const p = playerDoVideo(l.video)
                const thumb = p?.tipo === 'youtube' && p.id ? `https://i.ytimg.com/vi/${p.id}/mqdefault.jpg` : null
                return (
                  <li key={l.chave}>
                    <span className="adl-thumb">{thumb ? <img src={thumb} alt="" loading="lazy" /> : <i>{String(i + 1).padStart(2, '0')}</i>}</span>
                    <span className="adl-item">
                      {linhas[i]?.buscando ? <em className="adl-buscando">Buscando o título…</em>
                        : <input value={editados[l.chave] ?? linhas[i]?.titulo ?? ''} placeholder={`Aula ${i + 1}`} aria-label={`Título da aula ${i + 1}`} onChange={(e) => setEditados((x) => ({ ...x, [l.chave]: e.target.value }))} />}
                      <small>{!l.video ? 'Sem vídeo: "Em breve"' : p?.tipo === 'vimeo' ? 'Vimeo' : p?.tipo === 'mp4' ? 'MP4' : p?.tipo === 'youtube' && p.id ? 'YouTube' : 'Link (confira se toca)'}</small>
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
        <footer className="adl-rodape">
          <div className="adl-destino">
            <label><span>Colocar em</span>
              <select value={destino} onChange={(e) => setDestino(e.target.value)}>
                {modulos.map((m) => <optgroup key={m.id} label={m.titulo || 'Módulo sem nome'}>{m.assuntos.map((s) => <option key={s.id} value={s.id}>{s.titulo ? `${m.titulo} › ${s.titulo}` : m.titulo || 'Módulo sem nome'}</option>)}</optgroup>)}
                <option value="__novo">Um módulo novo…</option>
              </select>
            </label>
            {novo && <label><span>Nome do módulo</span><input value={nomeDoModulo} onChange={(e) => setNomeDoModulo(e.target.value)} placeholder="Ex.: Estratégias avançadas" maxLength={80} autoFocus /></label>}
            <label className="adl-chave"><input type="checkbox" checked={visiveis} onChange={(e) => setVisiveis(e.target.checked)} /><span>Visíveis para os alunos ao publicar</span></label>
          </div>
          {ruins.length > 0 && <small className="adl-aviso">{ruins.length} {ruins.length === 1 ? 'link não parece' : 'links não parecem'} YouTube, Vimeo ou MP4: confira na prévia depois de criar.</small>}
          <div className="adl-botoes">
            <button type="button" className="admin-secundario" onClick={aoFechar}>Cancelar</button>
            <button type="button" className="admin-primary" disabled={!podeCriar} onClick={criar}>{prontas.length > 1 ? `Criar ${prontas.length} aulas` : 'Criar aula'}</button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
