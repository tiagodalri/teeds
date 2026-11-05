/**
 * "Mídia, links e docs" (05/11/2026), como no WhatsApp: a galeria que abre nos
 * Dados do contato (abas Mídia, Docs e Links, por mês) e o visualizador em tela
 * cheia (setas, miniaturas embaixo, baixar, mostrar na conversa).
 * Tiago: "que vc clica no contato, aparece um modal com as midias, links, etc".
 */
import { useEffect, useMemo, useState } from 'react'
import { nomeDoContato, type WhatsAppApi, type ContatoWpp, type MensagemWpp, type MidiaWpp } from '../../core/teeds/whatsapp'
import { dataEHora, dataCurta, tamanho, horaCurta } from './textoWpp'

/** O endereço que a tela consegue abrir (o arquivo vem do bucket privado; no exemplo, já é um endereço). */
export function useUrlMidia(api: WhatsAppApi, midia: MidiaWpp | null | undefined): { url: string | null; falhou: boolean } {
  const direto = midia?.exemplo && midia.exemplo !== 'audio' ? midia.exemplo : null
  const [url, setUrl] = useState<string | null>(direto)
  const [falhou, setFalhou] = useState(!!midia?.falhou)
  useEffect(() => {
    if (direto) { setUrl(direto); return }
    if (!midia?.caminho) return
    let vivo = true
    api.abrirArquivo(midia).then((u) => vivo && setUrl(u)).catch(() => vivo && setFalhou(true))
    return () => { vivo = false }
  }, [api, midia, direto])
  return { url, falhou }
}

/** Agrupa por mês, do mais novo para o mais velho ("Este mês", "Outubro de 2026"). */
function porMes(itens: MensagemWpp[]): Array<{ rotulo: string; itens: MensagemWpp[] }> {
  const hoje = new Date()
  const saida: Array<{ rotulo: string; itens: MensagemWpp[] }> = []
  for (const m of itens) {
    const d = new Date(m.criadoEm)
    const rotulo = d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear() ? 'Este mês'
      : d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, (x) => x.toUpperCase())
    if (saida[saida.length - 1]?.rotulo !== rotulo) saida.push({ rotulo, itens: [] })
    saida[saida.length - 1].itens.push(m)
  }
  return saida
}

const dominio = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }
const linksDe = (texto: string | null) => [...(texto ?? '').matchAll(/https?:\/\/[^\s]+/g)].map((x) => x[0])

/* ---------------------------------------------------------------- miniatura */
export function Miniatura({ m, api, onClick, grande }: { m: MensagemWpp; api: WhatsAppApi; onClick?: () => void; grande?: boolean }) {
  const { url } = useUrlMidia(api, m.midia)
  return <button className={`wz-mini ${grande ? 'grande' : ''}`} onClick={onClick} aria-label={m.tipo === 'video' ? 'Abrir vídeo' : 'Abrir foto'} title={dataEHora(m.criadoEm)}>
    {url ? (m.tipo === 'video' ? <video src={url} muted preload="metadata" /> : <img src={url} alt="" loading="lazy" />) : <IconeFoto />}
    {m.tipo === 'video' && <span className="wz-mini-video"><IconePlay /></span>}
  </button>
}

/* ---------------------------------------------------------------- galeria */
export function GaleriaDoContato({ api, contato, abaInicial, midias, docs, links, carregando, onVoltar, onAbrir, onMostrar }: {
  api: WhatsAppApi; contato: ContatoWpp; abaInicial: 'midia' | 'docs' | 'links'
  midias: MensagemWpp[]; docs: MensagemWpp[]; links: MensagemWpp[]; carregando: boolean
  onVoltar: () => void; onAbrir: (m: MensagemWpp) => void; onMostrar: (m: MensagemWpp) => void
}) {
  const [aba, setAba] = useState(abaInicial)
  return <section className="wz-galeria-painel" aria-label="Mídia, links e docs">
    <header><button className="wz-icone-btn" onClick={onVoltar} aria-label="Voltar"><IconeVoltar /></button><b>Mídia, links e docs</b><small>{nomeDoContato(contato)}</small></header>
    <div className="wz-galeria-abas" role="tablist">
      {([['midia', 'Mídia', midias.length], ['docs', 'Docs', docs.length], ['links', 'Links', links.length]] as const).map(([id, nome, n]) =>
        <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? 'on' : ''} onClick={() => setAba(id)}>{nome}{n > 0 && <b>{n}</b>}</button>)}
    </div>
    <div className="wz-galeria-rolagem">
      {carregando && <div className="wz-carregando pequeno"><i />Juntando os arquivos da conversa…</div>}
      {!carregando && aba === 'midia' && (midias.length ? porMes(midias).map((g) => <div key={g.rotulo} className="wz-galeria-mes">
        <span>{g.rotulo}</span>
        <div className="wz-galeria-grade">{g.itens.map((m) => <Miniatura key={m.id} m={m} api={api} onClick={() => onAbrir(m)} />)}</div>
      </div>) : <Vazio texto="Nenhuma foto ou vídeo nesta conversa ainda." />)}
      {!carregando && aba === 'docs' && (docs.length ? porMes(docs).map((g) => <div key={g.rotulo} className="wz-galeria-mes">
        <span>{g.rotulo}</span>
        <div className="wz-galeria-docs">{g.itens.map((m) => <Documento key={m.id} m={m} api={api} onMostrar={() => onMostrar(m)} />)}</div>
      </div>) : <Vazio texto="Nenhum arquivo nesta conversa ainda." />)}
      {!carregando && aba === 'links' && (links.length ? porMes(links).map((g) => <div key={g.rotulo} className="wz-galeria-mes">
        <span>{g.rotulo}</span>
        <div className="wz-galeria-links">{g.itens.flatMap((m) => linksDe(m.texto).map((u, i) => <article key={`${m.id}-${i}`}>
          <span className="wz-link-icone"><IconeLink /></span>
          <div>
            <a href={u} target="_blank" rel="noreferrer noopener"><b>{dominio(u)}</b><small>{u.replace(/^https?:\/\//, '')}</small></a>
            <p>{(m.texto ?? '').replace(u, '').trim().slice(0, 140) || (m.direcao === 'saida' ? 'Enviado pela equipe' : 'Enviado pelo cliente')}</p>
            <footer><time>{dataEHora(m.criadoEm)}</time><button onClick={() => onMostrar(m)}>Mostrar na conversa</button></footer>
          </div>
        </article>))}</div>
      </div>) : <Vazio texto="Nenhum link nesta conversa ainda." />)}
    </div>
  </section>
}

function Documento({ m, api, onMostrar }: { m: MensagemWpp; api: WhatsAppApi; onMostrar: () => void }) {
  const { url } = useUrlMidia(api, m.midia)
  const nome = m.midia?.nome ?? (m.tipo === 'audio' ? 'Áudio' : 'Arquivo')
  const ext = m.tipo === 'audio' ? 'ÁUDIO' : (nome.split('.').pop() ?? 'doc').slice(0, 4).toUpperCase()
  return <article className="wz-galeria-doc">
    <span className={`wz-doc-icone ${ext === 'PDF' ? 'pdf' : ''} ${m.tipo === 'audio' ? 'audio' : ''}`}>{ext}</span>
    <div><b>{nome}</b><small>{[m.midia?.tamanho ? tamanho(m.midia.tamanho) : null, dataCurta(m.criadoEm), m.direcao === 'saida' ? 'Enviado' : 'Recebido'].filter(Boolean).join(' · ')}</small></div>
    <button className="wz-icone-btn" onClick={onMostrar} title="Mostrar na conversa" aria-label="Mostrar na conversa"><IconeBalao /></button>
    {url ? <a className="wz-icone-btn" href={url} download={nome} target="_blank" rel="noreferrer" title="Baixar" aria-label="Baixar"><IconeBaixar /></a> : <span className="wz-icone-btn" aria-hidden />}
  </article>
}

function Vazio({ texto }: { texto: string }) {
  return <div className="wz-galeria-vazia"><IconeFoto /><small>{texto}</small></div>
}

/* ---------------------------------------------------------------- visualizador */
export function Visualizador({ api, contato, itens, inicial, nomeDe, onFechar, onMostrar }: {
  api: WhatsAppApi; contato: ContatoWpp; itens: MensagemWpp[]; inicial: string
  nomeDe: (id: string | null) => string | null; onFechar: () => void; onMostrar: (m: MensagemWpp) => void
}) {
  // na conversa a ordem é do mais velho para o mais novo; o visualizador anda do mesmo jeito
  const lista = useMemo(() => [...itens].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)), [itens])
  const [i, setI] = useState(() => Math.max(0, lista.findIndex((m) => m.id === inicial)))
  const atual = lista[i]
  const { url, falhou } = useUrlMidia(api, atual?.midia)
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar()
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
      if (e.key === 'ArrowRight') setI((x) => Math.min(lista.length - 1, x + 1))
    }
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f)
  }, [lista.length, onFechar])
  useEffect(() => { document.querySelector('.wz-visor-tira .on')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }) }, [i])
  if (!atual) return null
  const quem = atual.direcao === 'entrada' ? nomeDoContato(contato) : (nomeDe(atual.autor) ?? 'Equipe')
  return <div className="wz-visor" role="dialog" aria-modal="true" aria-label="Mídia">
    <header>
      <div className="wz-visor-quem"><span className="wz-visor-avatar">{quem.slice(0, 1).toUpperCase()}</span><span><b>{atual.direcao === 'entrada' || quem === 'Você' ? quem : `${quem} · equipe`}</b><small>{dataEHora(atual.criadoEm)} · {i + 1} de {lista.length}</small></span></div>
      <div className="wz-visor-acoes">
        <button onClick={() => onMostrar(atual)} title="Mostrar na conversa" aria-label="Mostrar na conversa"><IconeBalao /></button>
        {url && <a href={url} download={atual.midia?.nome ?? 'arquivo'} target="_blank" rel="noreferrer" title="Baixar" aria-label="Baixar"><IconeBaixar /></a>}
        <button onClick={onFechar} title="Fechar" aria-label="Fechar"><IconeX /></button>
      </div>
    </header>
    <div className="wz-visor-palco" onClick={(e) => { if (e.target === e.currentTarget) onFechar() }}>
      <button className="wz-visor-seta esq" disabled={i === 0} onClick={() => setI((x) => Math.max(0, x - 1))} aria-label="Anterior"><IconeSeta lado="esq" /></button>
      <figure>
        {url ? (atual.tipo === 'video' ? <video key={url} src={url} controls autoPlay /> : <img key={url} src={url} alt={atual.midia?.nome ?? 'Foto'} />)
          : <div className="wz-visor-espera">{falhou ? 'Não consegui abrir este arquivo.' : 'Abrindo…'}</div>}
        {atual.texto && <figcaption>{atual.texto}</figcaption>}
      </figure>
      <button className="wz-visor-seta dir" disabled={i === lista.length - 1} onClick={() => setI((x) => Math.min(lista.length - 1, x + 1))} aria-label="Próxima"><IconeSeta lado="dir" /></button>
    </div>
    {lista.length > 1 && <div className="wz-visor-tira">{lista.map((m, k) => <span key={m.id} className={k === i ? 'on' : ''}><Miniatura m={m} api={api} onClick={() => setI(k)} /></span>)}</div>}
  </div>
}

/** A faixa de miniaturas dos Dados do contato (as mais novas primeiro, como no aplicativo). */
export function FaixaDeMidias({ api, midias, docs, links, onAbrirGaleria, onAbrir }: {
  api: WhatsAppApi; midias: MensagemWpp[]; docs: MensagemWpp[]; links: MensagemWpp[]
  onAbrirGaleria: (aba: 'midia' | 'docs' | 'links') => void; onAbrir: (m: MensagemWpp) => void
}) {
  const total = midias.length + docs.length + links.reduce((s, m) => s + linksDe(m.texto).length, 0)
  return <section className="wz-dados-bloco wz-faixa-midias">
    <button className="wz-faixa-midias-topo" onClick={() => onAbrirGaleria(midias.length ? 'midia' : docs.length ? 'docs' : 'links')}>
      <span>Mídia, links e docs</span><span className="wz-faixa-midias-n">{total}<IconeSeta lado="dir" /></span>
    </button>
    {midias.length > 0
      ? <div className="wz-faixa-midias-tira">{midias.slice(0, 3).map((m) => <Miniatura key={m.id} m={m} api={api} onClick={() => onAbrir(m)} grande />)}
          {midias.length > 3 && <button className="wz-mini grande mais" onClick={() => onAbrirGaleria('midia')}>+{midias.length - 3}</button>}</div>
      : <small className="wz-dados-dica">{total ? 'Sem fotos ainda; veja os arquivos e links.' : 'Nada trocado ainda. As fotos, arquivos e links desta conversa aparecem aqui.'}</small>}
    {(docs.length > 0 || links.length > 0) && <div className="wz-faixa-midias-atalhos">
      {docs.length > 0 && <button onClick={() => onAbrirGaleria('docs')}><IconeDoc /><span>{docs.length} arquivo{docs.length > 1 ? 's' : ''}</span></button>}
      {links.length > 0 && <button onClick={() => onAbrirGaleria('links')}><IconeLink /><span>{links.length} link{links.length > 1 ? 's' : ''}</span></button>}
    </div>}
  </section>
}

/** As notas internas daquele cliente, das mais novas para as mais velhas. */
export function NotasDoContato({ notas, nomeDe, onMostrar }: { notas: MensagemWpp[]; nomeDe: (id: string | null) => string | null; onMostrar: (m: MensagemWpp) => void }) {
  const [todas, setTodas] = useState(false)
  if (!notas.length) return null
  const vistas = todas ? notas : notas.slice(0, 2)
  return <section className="wz-dados-bloco">
    <span className="wz-dados-titulo">Notas da equipe <b className="wz-n">{notas.length}</b></span>
    <div className="wz-notas-lista">{vistas.map((m) => <button key={m.id} onClick={() => onMostrar(m)} title="Mostrar na conversa">
      <p>{m.texto}</p><small>{nomeDe(m.autor) ?? 'Equipe'} · {dataCurta(m.criadoEm)} {horaCurta(m.criadoEm)}</small>
    </button>)}</div>
    {notas.length > 2 && <button className="wz-link" onClick={() => setTodas((v) => !v)}>{todas ? 'Mostrar menos' : `Ver todas as ${notas.length}`}</button>}
  </section>
}

/* ícones */
const sv = (d: string, cheio = false) => function Ic() { return <svg viewBox="0 0 24 24" className={cheio ? 'cheio' : undefined} aria-hidden><path d={d} /></svg> }
const IconeFoto = sv('M4 6h16v12H4zM8.5 10.5a1.5 1.5 0 1 0 0-.01M20 15l-4.5-4.5L7 18')
const IconePlay = sv('M8 5.5v13l10.5-6.5z', true)
const IconeVoltar = sv('M15 5l-7 7 7 7')
const IconeX = sv('M6 6l12 12M18 6L6 18')
const IconeBaixar = sv('M12 4v11M7 10.5l5 5 5-5M5 20h14')
const IconeBalao = sv('M4 5h16v11H9l-5 4z')
const IconeLink = sv('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2')
const IconeDoc = sv('M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 16.5h6')
function IconeSeta({ lado }: { lado: 'esq' | 'dir' }) { return <svg viewBox="0 0 24 24" aria-hidden><path d={lado === 'esq' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} /></svg> }
