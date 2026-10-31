import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as PE, type ReactNode } from 'react'
import {
  abrirMonitorFlutuante, adicionarFonte, ajustarCanal, ajustarStinger, apagarCena, apagarFonte, atualizarFonte, canaisDoMixer, canalDe,
  cenaEmEdicao, cenaPorId, criarCena, desligarCaptura, duplicarCena, enviarStinger, escolherCena, escolherSaidaDoFone, fecharAviso,
  iniciarEstudio, liberarSom, ligarCaptura, ligarModoEstudio, listarAparelhos, moverCena, moverFonte, mudarTransicao, nivelDoCanal,
  olharPrevia, podeEscolherSaida, renomearCena, saidaDoEstudio, selecionar, tamanhoNatural, telaAoVivo, telaDaPrevia, testarStinger,
  tirarStinger, transformar, transicionar, trocarAparelho, trocarArquivo, useEstudio, type EstadoDoEstudio,
} from '../../../core/live/estudio/motor'
import { ALTURA, LARGURA, NOME_DO_TIPO, chaveDaCaptura, type Fonte, type Monitoramento, type TipoDeFonte } from '../../../core/live/estudio/tipos'
import { usarEstudioNoTreino } from '../../../core/live/treino'
import './estudio.css'

/**
 * O estúdio da Central ao vivo (31/10/2026, escopo do Victor Dias): o OBS
 * dentro da plataforma. Em cima, a prévia e o ao vivo (modo estúdio); embaixo
 * os cinco painéis: Cenas, Fontes, Mixer de áudio, Transições e Controles.
 * A imagem e o som do "Ao vivo" são o que o "Começar transmissão" envia.
 */

const ICONE: Record<TipoDeFonte | 'stinger', string> = {
  tela: 'M3 5h18v12H3zM8 21h8M12 17v4',
  camera: 'M3 7h12v10H3zM15 11l6-3v8l-6-3',
  microfone: 'M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM5 11a7 7 0 0014 0M12 18v3',
  video: 'M4 5h16v14H4zM10 9l5 3-5 3z',
  musica: 'M9 18V6l11-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z',
  imagem: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  texto: 'M5 6h14M12 6v13M9 19h6',
  cor: 'M12 3a9 9 0 100 18c1.5 0 2-1 2-2s-1-1.5-1-2.5S14 15 15 15h2a4 4 0 004-4c0-4.5-4-8-9-8z',
  stinger: 'M2 16l20-6-20-6 4 6zM6 10h8',
}
const Icone = ({ nome, tam = 16 }: { nome: string; tam?: number }) => (
  <svg viewBox="0 0 24 24" width={tam} height={tam} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONE[nome as TipoDeFonte] ?? nome} />
  </svg>
)
const ACAO: Record<string, string> = {
  mais: 'M12 5v14M5 12h14', lixeira: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', subir: 'M12 19V5M6 11l6-6 6 6', descer: 'M12 5v14M6 13l6 6 6-6',
  copiar: 'M8 8h12v12H8zM4 16V4h12', engrenagem: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19 12l2-1-1-3-2 .3-1.4-1.4.3-2-3-1-1 2h-2l-1-2-3 1 .3 2L5.6 7.3 3.6 7l-1 3 2 1v2l-2 1 1 3 2-.3 1.4 1.4-.3 2 3 1 1-2h2l1 2 3-1-.3-2 1.4-1.4 2 .3 1-3-2-1z',
  olho: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z', olhoFechado: 'M3 3l18 18M10.6 6.1A10 10 0 0112 6c6 0 10 6 10 6a17 17 0 01-3 3.5M6.3 7.6C3.6 9.4 2 12 2 12s4 6 10 6a9 9 0 004.4-1.1',
  cadeado: 'M6 11h12v9H6zM8 11V7a4 4 0 018 0v4', aberto: 'M6 11h12v9H6zM8 11V7a4 4 0 017.5-2',
  som: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 010 6', mudo: 'M4 9h4l5-4v14l-5-4H4zM17 9l4 6M21 9l-4 6',
  flutuante: 'M3 5h18v14H3zM12 12h7v5h-7z',
}
const Botao = ({ acao, rotulo, onClick, disabled, ativo }: { acao: string; rotulo: string; onClick: () => void; disabled?: boolean; ativo?: boolean }) => (
  <button type="button" className={`es-ico ${ativo ? 'on' : ''}`} aria-label={rotulo} title={rotulo} disabled={disabled} onClick={onClick}>
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ACAO[acao]} /></svg>
  </button>
)

const MONITOR: Array<[Monitoramento, string]> = [['alunos', 'Só alunos'], ['fone', 'Só meu fone'], ['ambos', 'Fone e alunos']]
const dB = (v: number) => (v <= 0.0001 ? '−∞' : `${(20 * Math.log10(v)).toFixed(1).replace('.', ',')} dB`)
const semVisual = (f: Fonte) => f.tipo === 'microfone' || f.tipo === 'musica'

/* ================================================================ monitor */

type Alca = 'n' | 's' | 'l' | 'o' | 'nl' | 'no' | 'sl' | 'so'
const ALCAS: Alca[] = ['no', 'n', 'nl', 'l', 'sl', 's', 'so', 'o']

/**
 * Um monitor (Prévia ou Ao vivo). O editável mostra a seleção com as alças:
 * arrastar move, as alças mudam o tamanho (nos cantos mantém a proporção; com
 * Shift, livre) e com Alt as alças recortam, como no OBS.
 */
function Monitor({ qual, editavel, e }: { qual: 'previa' | 'aovivo'; editavel: boolean; e: EstadoDoEstudio }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(0)
  useLayoutEffect(() => {
    const el = caixa.current
    const tela = qual === 'aovivo' ? telaAoVivo() : telaDaPrevia()
    if (!el || !tela) return
    el.prepend(tela)
    if (qual === 'previa') olharPrevia(true)
    const ro = new ResizeObserver(() => setLargura(el.clientWidth))
    ro.observe(el)
    return () => { ro.disconnect(); if (qual === 'previa') olharPrevia(false); tela.remove() }
  }, [qual, e.pronto])

  const cena = cenaEmEdicao(e.config)
  const sel = editavel ? cena?.fontes.find((f) => f.id === e.selecionada && !semVisual(f)) : undefined
  const k = largura / LARGURA
  const arrasto = useRef<{ modo: 'mover' | Alca; alt: boolean; x0: number; y0: number; f: Fonte; n: { w: number; h: number } } | null>(null)

  const ponto = (ev: PE) => {
    const r = caixa.current!.getBoundingClientRect()
    return { x: (ev.clientX - r.left) / r.width * LARGURA, y: (ev.clientY - r.top) / r.height * ALTURA }
  }
  const baixar = (ev: PE<HTMLDivElement>) => {
    if (!editavel || !cena) return
    void liberarSom()
    const p = ponto(ev)
    const alca = (ev.target as HTMLElement).dataset.alca as Alca | undefined
    if (alca && sel && !sel.bloqueada) {
      arrasto.current = { modo: alca, alt: ev.altKey, x0: p.x, y0: p.y, f: sel, n: tamanhoNatural(sel) }
      ev.currentTarget.setPointerCapture(ev.pointerId)
      return
    }
    const alvo = cena.fontes.find((f) => f.visivel && !semVisual(f) && p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h && !(f.bloqueada && f.tipo === 'cor'))
      ?? cena.fontes.find((f) => f.visivel && !semVisual(f) && p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h)
    selecionar(alvo?.id ?? null)
    if (alvo && !alvo.bloqueada) {
      arrasto.current = { modo: 'mover', alt: false, x0: p.x, y0: p.y, f: alvo, n: tamanhoNatural(alvo) }
      ev.currentTarget.setPointerCapture(ev.pointerId)
    }
  }
  const mover = (ev: PE<HTMLDivElement>) => {
    const a = arrasto.current
    if (!a) return
    const p = ponto(ev)
    const dx = p.x - a.x0, dy = p.y - a.y0
    const f = a.f
    const IMA = 14
    const ima = (v: number, alvos: number[]) => { for (const t of alvos) if (Math.abs(v - t) < IMA) return t; return v }
    if (a.modo === 'mover') {
      let x = f.x + dx, y = f.y + dy
      x = ima(x, [0, LARGURA - f.w, (LARGURA - f.w) / 2]); y = ima(y, [0, ALTURA - f.h, (ALTURA - f.h) / 2])
      atualizarFonte(f.id, { x: Math.round(x), y: Math.round(y) })
      return
    }
    const m = a.modo
    // recorte (Alt): tira da imagem o pedaço do lado puxado, sem mudar a escala
    if (a.alt && a.n.w && a.n.h && f.tipo !== 'cor') {
      const ex = f.w / Math.max(1, a.n.w - f.recorte.esq - f.recorte.dir), ey = f.h / Math.max(1, a.n.h - f.recorte.topo - f.recorte.baixo)
      const r = { ...f.recorte }
      let { x, y, w, h } = f
      if (m.includes('o')) { const c = Math.max(-f.recorte.esq, Math.min(dx / ex, a.n.w - f.recorte.esq - f.recorte.dir - 8)); r.esq = Math.round(f.recorte.esq + c); x = f.x + c * ex; w = f.w - c * ex }
      if (m.includes('l') && !m.includes('o')) { const c = Math.max(-f.recorte.dir, Math.min(-dx / ex, a.n.w - f.recorte.esq - f.recorte.dir - 8)); r.dir = Math.round(f.recorte.dir + c); w = f.w - c * ex }
      if (m.includes('n')) { const c = Math.max(-f.recorte.topo, Math.min(dy / ey, a.n.h - f.recorte.topo - f.recorte.baixo - 8)); r.topo = Math.round(f.recorte.topo + c); y = f.y + c * ey; h = f.h - c * ey }
      if (m.includes('s')) { const c = Math.max(-f.recorte.baixo, Math.min(-dy / ey, a.n.h - f.recorte.topo - f.recorte.baixo - 8)); r.baixo = Math.round(f.recorte.baixo + c); h = f.h - c * ey }
      atualizarFonte(f.id, { recorte: r, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) })
      return
    }
    let x = f.x, y = f.y, w = f.w, h = f.h
    if (m.includes('l') && m !== 'o') w = Math.max(16, f.w + dx)
    if (m.includes('o')) { w = Math.max(16, f.w - dx); x = f.x + f.w - w }
    if (m.includes('s')) h = Math.max(16, f.h + dy)
    if (m.includes('n')) { h = Math.max(16, f.h - dy); y = f.y + f.h - h }
    // nos cantos, a proporção fica (Shift solta)
    if (m.length === 2 && !ev.shiftKey && f.h > 0) {
      const prop = f.w / f.h
      if (Math.abs(w - f.w) / f.w > Math.abs(h - f.h) / f.h) { const nh = w / prop; if (m.includes('n')) y = f.y + f.h - nh; h = nh }
      else { const nw = h * prop; if (m.includes('o')) x = f.x + f.w - nw; w = nw }
    }
    atualizarFonte(f.id, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) })
  }
  const soltar = () => { arrasto.current = null }
  const teclado = (ev: React.KeyboardEvent) => {
    if (!sel || sel.bloqueada) return
    const passo = ev.shiftKey ? 10 : 1
    const d = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[ev.key]
    if (!d) return
    ev.preventDefault()
    atualizarFonte(sel.id, { x: sel.x + d[0], y: sel.y + d[1] })
  }

  return (
    <div ref={caixa} className={`es-monitor ${editavel ? 'editavel' : ''}`} tabIndex={editavel ? 0 : -1} onKeyDown={teclado}
      aria-label={qual === 'aovivo' ? 'Ao vivo: o que os alunos recebem' : 'Prévia'}>
      {editavel && (
        <div className="es-camada" onPointerDown={baixar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
          {sel && k > 0 && (
            <div className={`es-selecao ${sel.bloqueada ? 'travada' : ''}`} style={{ left: sel.x * k, top: sel.y * k, width: sel.w * k, height: sel.h * k }}>
              <span className="es-selecao-nome">{sel.nome}{sel.bloqueada && ' · travada'}</span>
              {!sel.bloqueada && ALCAS.map((a) => <i key={a} data-alca={a} className={`es-alca a-${a}`} />)}
            </div>
          )}
        </div>
      )}
      {qual === 'aovivo' && e.transicao && <span className="es-em-transicao">Transição</span>}
    </div>
  )
}

/* ================================================================ docas */

function Doca({ titulo, filhos, rodape, className = '' }: { titulo: string; filhos: ReactNode; rodape?: ReactNode; className?: string }) {
  return (
    <section className={`es-doca ${className}`} aria-label={titulo}>
      <h4>{titulo}</h4>
      <div className="es-doca-corpo">{filhos}</div>
      {rodape && <div className="es-doca-rodape">{rodape}</div>}
    </section>
  )
}

function DocaCenas({ e }: { e: EstadoDoEstudio }) {
  const c = e.config
  const [nomeando, setNomeando] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [nova, setNova] = useState(false)
  const emEdicao = cenaEmEdicao(c)?.id
  const confirmarNome = () => { if (nomeando === 'nova') criarCena(texto); else if (nomeando) renomearCena(nomeando, texto); setNomeando(null); setNova(false) }
  return (
    <Doca titulo="Cenas" className="es-cenas" filhos={
      <ul role="listbox" aria-label="Cenas">
        {c.cenas.map((cena) => (
          <li key={cena.id} role="option" aria-selected={cena.id === emEdicao} className={cena.id === emEdicao ? 'on' : ''}
            onClick={() => escolherCena(cena.id)} onDoubleClick={() => { setNomeando(cena.id); setTexto(cena.nome) }}>
            {nomeando === cena.id
              ? <input autoFocus value={texto} maxLength={40} aria-label="Nome da cena" onClick={(ev) => ev.stopPropagation()} onChange={(ev) => setTexto(ev.target.value)}
                onBlur={confirmarNome} onKeyDown={(ev) => { if (ev.key === 'Enter') confirmarNome(); if (ev.key === 'Escape') setNomeando(null) }} />
              : <span>{cena.nome}</span>}
            {cena.id === c.programa && <em className="es-tag vivo">No ar</em>}
            {c.modoEstudio && cena.id === c.previa && cena.id !== c.programa && <em className="es-tag previa">Prévia</em>}
          </li>
        ))}
        {nova && (
          <li className="on">
            <input autoFocus value={texto} maxLength={40} placeholder="Nome da cena" aria-label="Nome da nova cena" onChange={(ev) => setTexto(ev.target.value)}
              onBlur={confirmarNome} onKeyDown={(ev) => { if (ev.key === 'Enter') confirmarNome(); if (ev.key === 'Escape') { setNova(false); setNomeando(null) } }} />
          </li>
        )}
      </ul>
    } rodape={<>
      <Botao acao="mais" rotulo="Criar cena" onClick={() => { setNova(true); setNomeando('nova'); setTexto(`Cena ${c.cenas.length + 1}`) }} />
      <Botao acao="copiar" rotulo="Duplicar cena" disabled={!emEdicao} onClick={() => emEdicao && duplicarCena(emEdicao)} />
      <Botao acao="lixeira" rotulo="Excluir cena" disabled={!emEdicao || emEdicao === c.programa || c.cenas.length <= 1} onClick={() => {
        const cena = emEdicao ? cenaPorId(emEdicao) : undefined
        if (cena && window.confirm(`Excluir a cena "${cena.nome}"?`)) apagarCena(cena.id)
      }} />
      <Botao acao="subir" rotulo="Subir cena" disabled={!emEdicao} onClick={() => emEdicao && moverCena(emEdicao, -1)} />
      <Botao acao="descer" rotulo="Descer cena" disabled={!emEdicao} onClick={() => emEdicao && moverCena(emEdicao, 1)} />
    </>} />
  )
}

const TIPOS_NOVOS: TipoDeFonte[] = ['tela', 'camera', 'microfone', 'video', 'musica', 'imagem', 'texto', 'cor']
const ACEITA: Partial<Record<TipoDeFonte, string>> = { video: 'video/*', musica: 'audio/*', imagem: 'image/*' }

function SituacaoDaFonte({ f, e }: { f: Fonte; e: EstadoDoEstudio }) {
  const chave = chaveDaCaptura(f)
  if (!chave) return null
  const s = e.capturas[chave] ?? 'desligada'
  if (s === 'ok') return null
  if (s === 'ligando') return <small className="es-fonte-estado">Ligando…</small>
  return (
    <button type="button" className={`es-ligar ${s === 'erro' ? 'erro' : ''}`} title={e.errosDeCaptura[chave]} onClick={(ev) => { ev.stopPropagation(); void ligarCaptura(f) }}>
      {s === 'erro' ? 'Tentar de novo' : f.tipo === 'tela' ? 'Escolher' : 'Ligar'}
    </button>
  )
}

function DocaFontes({ e, abrirPropriedades }: { e: EstadoDoEstudio; abrirPropriedades: () => void }) {
  const cena = cenaEmEdicao(e.config)
  const [menu, setMenu] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)
  const [tipoDoArquivo, setTipoDoArquivo] = useState<TipoDeFonte>('video')
  const sel = cena?.fontes.find((f) => f.id === e.selecionada)
  const novo = (t: TipoDeFonte) => {
    setMenu(false)
    if (ACEITA[t]) { setTipoDoArquivo(t); window.setTimeout(() => arquivo.current?.click(), 0); return }
    void adicionarFonte(t).then((id) => { if (id && (t === 'texto' || t === 'cor')) abrirPropriedades() })
  }
  return (
    <Doca titulo="Fontes" className="es-fontes" filhos={<>
      {!cena?.fontes.length && <p className="es-vazio">Cena vazia. Adicione uma fonte no botão de mais.</p>}
      <ul aria-label="Fontes da cena">
        {cena?.fontes.map((f) => (
          <li key={f.id} className={`${f.id === e.selecionada ? 'on' : ''} ${f.visivel ? '' : 'oculta'}`} onClick={() => selecionar(f.id)} onDoubleClick={abrirPropriedades}>
            <span className="es-fonte-ico"><Icone nome={f.tipo} /></span>
            <span className="es-fonte-nome" title={f.nome}>{f.nome}</span>
            <SituacaoDaFonte f={f} e={e} />
            <Botao acao={f.visivel ? 'olho' : 'olhoFechado'} rotulo={f.visivel ? 'Ocultar' : 'Mostrar'} onClick={() => atualizarFonte(f.id, { visivel: !f.visivel })} />
            <Botao acao={f.bloqueada ? 'cadeado' : 'aberto'} rotulo={f.bloqueada ? 'Destravar' : 'Travar'} ativo={f.bloqueada} onClick={() => atualizarFonte(f.id, { bloqueada: !f.bloqueada })} />
          </li>
        ))}
      </ul>
      {menu && (
        <div className="es-menu" role="menu">
          {TIPOS_NOVOS.map((t) => <button key={t} type="button" role="menuitem" onClick={() => novo(t)}><Icone nome={t} />{NOME_DO_TIPO[t]}</button>)}
        </div>
      )}
      <input ref={arquivo} type="file" hidden accept={ACEITA[tipoDoArquivo]} onChange={(ev) => {
        const a = ev.target.files?.[0]; ev.target.value = ''
        if (a) void adicionarFonte(tipoDoArquivo, {}, a)
      }} />
    </>} rodape={<>
      <Botao acao="mais" rotulo="Adicionar fonte" ativo={menu} onClick={() => setMenu(!menu)} />
      <Botao acao="lixeira" rotulo="Excluir fonte" disabled={!sel} onClick={() => { if (sel && window.confirm(`Excluir "${sel.nome}" desta cena?`)) apagarFonte(sel.id) }} />
      <Botao acao="engrenagem" rotulo="Propriedades" disabled={!sel} onClick={abrirPropriedades} />
      <Botao acao="subir" rotulo="Trazer para cima" disabled={!sel} onClick={() => sel && moverFonte(sel.id, 'cima')} />
      <Botao acao="descer" rotulo="Mandar para baixo" disabled={!sel} onClick={() => sel && moverFonte(sel.id, 'baixo')} />
    </>} />
  )
}

function Medidor({ chave }: { chave: string }) {
  const barra = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let id = 0
    const pintar = () => {
      const v = nivelDoCanal(chave)
      if (barra.current) barra.current.style.setProperty('--nivel', `${Math.max(0, (v + 60) / 60) * 100}%`)
      id = requestAnimationFrame(pintar)
    }
    id = requestAnimationFrame(pintar)
    return () => cancelAnimationFrame(id)
  }, [chave])
  return <div ref={barra} className="es-medidor" aria-hidden="true"><i /></div>
}

function DocaMixer({ e }: { e: EstadoDoEstudio }) {
  const linhas = canaisDoMixer(e.config)
  return (
    <Doca titulo="Mixer de áudio" className="es-mixer" filhos={<>
      {e.somBloqueado && <button type="button" className="es-liberar" onClick={() => void liberarSom()}>Clique para ligar o som do estúdio</button>}
      {linhas.length === 0 && <p className="es-vazio">Sem som nas cenas. Adicione um microfone, um vídeo ou uma música.</p>}
      {linhas.map((l) => {
        const cfg = l.chave === 'stinger' ? { volume: e.config.stinger.volume, mudo: e.config.stinger.mudo, monitor: e.config.stinger.monitor } : canalDe(l.chave)
        const mudar = (p: Partial<typeof cfg>) => (l.chave === 'stinger' ? ajustarStinger(p) : ajustarCanal(l.chave, p))
        return (
          <div key={l.chave} className={`es-canal ${cfg.mudo ? 'mudo' : ''}`}>
            <div className="es-canal-topo">
              <span className="es-canal-nome" title={l.nome}><Icone nome={l.tipo} tam={14} />{l.nome}{l.noAr && <em className="es-tag vivo">No ar</em>}{!l.ligado && <em className="es-tag">Desligado</em>}</span>
              <span className="es-db">{cfg.mudo ? 'Mudo' : dB(cfg.volume)}</span>
            </div>
            <Medidor chave={l.chave} />
            <div className="es-canal-controles">
              <Botao acao={cfg.mudo ? 'mudo' : 'som'} rotulo={cfg.mudo ? 'Tirar do mudo' : 'Silenciar'} ativo={cfg.mudo} onClick={() => mudar({ mudo: !cfg.mudo })} />
              <input type="range" min={0} max={1} step={0.01} value={cfg.volume} aria-label={`Volume de ${l.nome}`} onChange={(ev) => mudar({ volume: Number(ev.target.value) })} />
              <select value={cfg.monitor} aria-label={`Para onde vai o som de ${l.nome}`} onChange={(ev) => mudar({ monitor: ev.target.value as Monitoramento })}>
                {MONITOR.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select>
            </div>
          </div>
        )
      })}
    </>} />
  )
}

function DocaTransicoes({ e }: { e: EstadoDoEstudio }) {
  const c = e.config, s = c.stinger
  const arquivo = useRef<HTMLInputElement>(null)
  const temStinger = !!(s.arquivo || s.url)
  const info = e.stinger.info
  return (
    <Doca titulo="Transições de cena" className="es-transicoes" filhos={<>
      <label className="es-campo"><span>Transição</span>
        <select value={c.transicao} onChange={(ev) => mudarTransicao({ transicao: ev.target.value as typeof c.transicao })}>
          <option value="corte">Corte</option>
          <option value="esmaecer">Esmaecer</option>
          <option value="stinger" disabled={!temStinger}>Stinger{temStinger ? '' : ' (envie o vídeo)'}</option>
        </select>
      </label>
      {c.transicao === 'esmaecer' && (
        <label className="es-campo"><span>Duração</span>
          <span className="es-com-unidade"><input type="number" min={50} max={5000} step={50} value={c.duracaoMs} onChange={(ev) => mudarTransicao({ duracaoMs: Math.max(50, Number(ev.target.value) || 300) })} /><small>ms</small></span>
        </label>
      )}
      <div className="es-stinger">
        <div className="es-stinger-arquivo">
          <Icone nome="stinger" />
          <span>
            <b>{s.nomeDoArquivo ?? 'Stinger: vídeo do avião'}</b>
            <small>{e.stinger.situacao === 'sem-arquivo' ? 'Nenhum arquivo enviado' : e.stinger.situacao === 'carregando' ? 'Carregando…' : e.stinger.situacao === 'erro' ? e.stinger.erro : info ? `${info.largura}×${info.altura} · ${info.duracao.toFixed(1).replace('.', ',')} s${info.transparente === false && s.layout !== 'so-mascara' ? ' · sem transparência' : info.transparente ? ' · com transparência' : ''}` : ''}</small>
          </span>
          <button type="button" className="es-botao" onClick={() => arquivo.current?.click()}>{temStinger ? 'Trocar' : 'Enviar arquivo'}</button>
          <input ref={arquivo} type="file" hidden accept="video/*,.webm,.mov,.mp4" onChange={(ev) => { const a = ev.target.files?.[0]; ev.target.value = ''; if (a) void enviarStinger(a) }} />
        </div>
        {temStinger && <>
          {info?.transparente === false && (s.layout === 'lado-a-lado' || s.layout === 'empilhado') && (
            <p className="es-nota">Este arquivo não tem transparência: o avião vai cobrir a tela inteira por cima da máscara. Para o avião passar por cima das cenas, exporte o stinger em WebM com transparência.</p>
          )}
          <label className="es-campo"><span>Track Matte</span>
            <select value={s.layout} onChange={(ev) => ajustarStinger({ layout: ev.target.value as typeof s.layout })}>
              <option value="lado-a-lado">Mesmo arquivo, lado a lado (stinger à esquerda, máscara à direita)</option>
              <option value="empilhado">Mesmo arquivo, empilhado (stinger em cima, máscara embaixo)</option>
              <option value="so-mascara">Só a máscara (sem o stinger por cima)</option>
              <option value="sem-mascara">Sem máscara (vídeo com transparência)</option>
            </select>
          </label>
          {s.layout !== 'sem-mascara' && (
            <label className="es-check"><input type="checkbox" checked={s.inverter} onChange={(ev) => ajustarStinger({ inverter: ev.target.checked })} />Inverter a máscara</label>
          )}
          <label className="es-campo"><span>{s.layout === 'sem-mascara' ? 'Ponto da transição' : 'Ponto da transição do áudio'}</span>
            <span className="es-com-unidade"><select value="tempo" aria-label="Tipo do ponto" onChange={() => undefined}><option value="tempo">Tempo</option></select>
              <input type="number" min={0} max={Math.round((info?.duracao ?? 10) * 1000)} step={50} value={s.pontoMs} aria-label="Ponto em milissegundos" onChange={(ev) => ajustarStinger({ pontoMs: Math.max(0, Number(ev.target.value) || 0) })} /><small>ms</small></span>
          </label>
          <label className="es-campo"><span>Áudio entre as cenas</span>
            <select value={s.fadeAudio} onChange={(ev) => ajustarStinger({ fadeAudio: ev.target.value as typeof s.fadeAudio })}>
              <option value="cruzado">Crossfade</option>
              <option value="saida-entrada">Fade-out e depois fade-in</option>
            </select>
          </label>
          <p className="es-nota">Decodificação por hardware: automática. O navegador usa a placa de vídeo sempre que ela está disponível. O volume e o monitoramento do stinger ficam no mixer.</p>
          <div className="es-linha">
            <button type="button" className="es-botao" disabled={e.stinger.situacao !== 'pronto' || !!e.transicao || e.testando} onClick={testarStinger}>{e.testando ? 'Testando…' : 'Testar na prévia'}</button>
            <button type="button" className="es-link" onClick={() => { if (window.confirm('Tirar o stinger? A transição volta a ser o esmaecer.')) tirarStinger() }}>Tirar o stinger</button>
          </div>
        </>}
      </div>
    </>} />
  )
}

function DocaControles({ e }: { e: EstadoDoEstudio }) {
  const c = e.config
  const [saidas, setSaidas] = useState<MediaDeviceInfo[]>([])
  useEffect(() => { if (podeEscolherSaida()) void listarAparelhos('audiooutput').then(setSaidas) }, [])
  const [semPip, setSemPip] = useState(false)
  return (
    <Doca titulo="Controles" className="es-controles" filhos={<>
      <button type="button" className={`es-chave ${c.modoEstudio ? 'on' : ''}`} aria-pressed={c.modoEstudio} onClick={() => ligarModoEstudio(!c.modoEstudio)}>Modo estúdio</button>
      {c.modoEstudio && (
        <label className="es-check"><input type="checkbox" checked={c.ouvirPrevia} onChange={(ev) => mudarTransicao({ ouvirPrevia: ev.target.checked })} />Ouvir a prévia no meu fone</label>
      )}
      {saidas.length > 0 && (
        <label className="es-campo"><span>Saída do meu fone</span>
          <select value={c.saidaDoFone} onChange={(ev) => void escolherSaidaDoFone(ev.target.value)}>
            <option value="">Padrão do computador</option>
            {saidas.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Saída ${i + 1}`}</option>)}
          </select>
        </label>
      )}
      <button type="button" className="es-botao" onClick={() => void abrirMonitorFlutuante().then((ok) => setSemPip(!ok))}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={ACAO.flutuante} /></svg>Monitor flutuante
      </button>
      {semPip && <p className="es-nota">Este navegador não abre a janela flutuante. Use o Chrome no computador.</p>}
      <p className="es-nota">Vai operar em outra janela? O monitor flutuante mostra o que os alunos recebem por cima de tudo.</p>
    </>} />
  )
}

/* ============================================================ propriedades */

function Propriedades({ f, e, fechar }: { f: Fonte; e: EstadoDoEstudio; fechar: () => void }) {
  const [aparelhos, setAparelhos] = useState<MediaDeviceInfo[]>([])
  const arquivo = useRef<HTMLInputElement>(null)
  const chave = chaveDaCaptura(f)
  const ligada = chave ? e.capturas[chave] === 'ok' : false
  useEffect(() => {
    if (f.tipo === 'camera' || f.tipo === 'microfone') void listarAparelhos(f.tipo === 'camera' ? 'videoinput' : 'audioinput').then(setAparelhos)
  }, [f.tipo, ligada])
  useEffect(() => { const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') fechar() }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc) }, [fechar])
  const num = (rotulo: string, valor: number, mudar: (v: number) => void, id: string) => (
    <label className="es-num" htmlFor={id}><span>{rotulo}</span><input id={id} type="number" value={Math.round(valor)} onChange={(ev) => mudar(Number(ev.target.value) || 0)} /></label>
  )
  const t = f.texto
  return (
    <div className="es-fundo-janela" onPointerDown={(ev) => { if (ev.target === ev.currentTarget) fechar() }}>
      <div className="es-janela" role="dialog" aria-modal="true" aria-labelledby="es-prop-titulo">
        <header>
          <span className="es-fonte-ico"><Icone nome={f.tipo} /></span>
          <h3 id="es-prop-titulo">Propriedades de "{f.nome}"</h3>
          <button type="button" className="es-fechar" aria-label="Fechar" onClick={fechar}>×</button>
        </header>
        <div className="es-janela-corpo">
          <label className="es-campo"><span>Nome</span><input value={f.nome} maxLength={40} onChange={(ev) => atualizarFonte(f.id, { nome: ev.target.value })} /></label>

          {f.tipo === 'tela' && <>
            <label className="es-check"><input type="checkbox" checked={!!f.audioDaTela} onChange={(ev) => atualizarFonte(f.id, { audioDaTela: ev.target.checked })} />Levar o som do computador</label>
            <p className="es-nota">No Windows, marque "Compartilhar áudio do sistema" ao escolher a tela. No Mac, o Chrome leva o som só quando você compartilha uma aba.</p>
            <div className="es-linha">
              <button type="button" className="es-botao" onClick={() => { desligarCaptura('tela'); void ligarCaptura(f) }}>{ligada ? 'Trocar a tela' : 'Escolher a tela'}</button>
              {ligada && <button type="button" className="es-link" onClick={() => desligarCaptura('tela')}>Parar de compartilhar</button>}
            </div>
          </>}

          {(f.tipo === 'camera' || f.tipo === 'microfone') && <>
            <label className="es-campo"><span>{f.tipo === 'camera' ? 'Câmera' : 'Microfone'}</span>
              <select value={f.dispositivo ?? ''} onChange={(ev) => trocarAparelho(f, ev.target.value)}>
                <option value="">Padrão do computador</option>
                {aparelhos.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `${f.tipo === 'camera' ? 'Câmera' : 'Microfone'} ${i + 1}`}</option>)}
              </select>
            </label>
            {f.tipo === 'microfone' && <p className="es-nota">O mesmo microfone em várias cenas é um canal só no mixer: a voz não dobra na troca de cena.</p>}
            <div className="es-linha">
              {ligada ? <button type="button" className="es-link" onClick={() => chave && desligarCaptura(chave)}>Desligar</button>
                : <button type="button" className="es-botao" onClick={() => void ligarCaptura(f)}>Ligar</button>}
            </div>
          </>}

          {(f.tipo === 'video' || f.tipo === 'musica' || f.tipo === 'imagem') && <>
            <div className="es-stinger-arquivo">
              <Icone nome={f.tipo} />
              <span><b>{f.nomeDoArquivo ?? 'Sem arquivo'}</b><small>{f.url ? 'Arquivo da plataforma' : 'Guardado neste computador'}</small></span>
              <button type="button" className="es-botao" onClick={() => arquivo.current?.click()}>Trocar arquivo</button>
              <input ref={arquivo} type="file" hidden accept={ACEITA[f.tipo]} onChange={(ev) => { const a = ev.target.files?.[0]; ev.target.value = ''; if (a) void trocarArquivo(f, a) }} />
            </div>
            {f.tipo !== 'imagem' && <>
              <label className="es-check"><input type="checkbox" checked={!!f.repetir} onChange={(ev) => atualizarFonte(f.id, { repetir: ev.target.checked })} />Repetir sem parar (loop)</label>
              <label className="es-check"><input type="checkbox" checked={!!f.reiniciar} onChange={(ev) => atualizarFonte(f.id, { reiniciar: ev.target.checked })} />Começar do início quando a cena entra no ar</label>
            </>}
          </>}

          {f.tipo === 'texto' && t && <>
            <label className="es-campo"><span>Texto</span><textarea rows={3} value={t.conteudo} onChange={(ev) => atualizarFonte(f.id, { texto: { ...t, conteudo: ev.target.value } })} /></label>
            <div className="es-grade-2">
              <label className="es-campo"><span>Tamanho</span><input type="number" min={8} max={600} value={t.tamanho} onChange={(ev) => atualizarFonte(f.id, { texto: { ...t, tamanho: Math.max(8, Number(ev.target.value) || 8) } })} /></label>
              <label className="es-campo"><span>Cor</span><input type="color" value={t.cor} onChange={(ev) => atualizarFonte(f.id, { texto: { ...t, cor: ev.target.value } })} /></label>
              <label className="es-campo"><span>Fonte</span>
                <select value={t.fonte} onChange={(ev) => atualizarFonte(f.id, { texto: { ...t, fonte: ev.target.value as typeof t.fonte } })}>
                  <option value="marca">Da plataforma</option><option value="serifa">Com serifa</option><option value="mono">Monoespaçada</option>
                </select>
              </label>
              <label className="es-campo"><span>Alinhamento</span>
                <select value={t.alinhamento} onChange={(ev) => atualizarFonte(f.id, { texto: { ...t, alinhamento: ev.target.value as typeof t.alinhamento } })}>
                  <option value="esquerda">Esquerda</option><option value="centro">Centro</option><option value="direita">Direita</option>
                </select>
              </label>
              <label className="es-campo"><span>Espaço entre letras</span><input type="number" min={-10} max={60} value={t.espacamento} onChange={(ev) => atualizarFonte(f.id, { texto: { ...t, espacamento: Number(ev.target.value) || 0 } })} /></label>
            </div>
            <label className="es-check"><input type="checkbox" checked={t.negrito} onChange={(ev) => atualizarFonte(f.id, { texto: { ...t, negrito: ev.target.checked } })} />Negrito</label>
            <label className="es-check"><input type="checkbox" checked={t.caixaAlta} onChange={(ev) => atualizarFonte(f.id, { texto: { ...t, caixaAlta: ev.target.checked } })} />Tudo em maiúsculas</label>
          </>}

          {f.tipo === 'cor' && (
            <label className="es-campo"><span>Cor</span><input type="color" value={f.cor ?? '#000000'} onChange={(ev) => atualizarFonte(f.id, { cor: ev.target.value })} /></label>
          )}

          {!semVisual(f) && <>
            <h5>Posição e tamanho <small>na tela de 1920 × 1080</small></h5>
            <div className="es-grade-4">
              {num('X', f.x, (v) => atualizarFonte(f.id, { x: v }), 'es-x')}
              {num('Y', f.y, (v) => atualizarFonte(f.id, { y: v }), 'es-y')}
              {num('Largura', f.w, (v) => atualizarFonte(f.id, { w: Math.max(1, v) }), 'es-w')}
              {num('Altura', f.h, (v) => atualizarFonte(f.id, { h: Math.max(1, v) }), 'es-h')}
            </div>
            {f.tipo !== 'cor' && <>
              <h5>Recorte <small>em pixels da imagem; ou arraste as alças com Alt</small></h5>
              <div className="es-grade-4">
                {num('Esquerda', f.recorte.esq, (v) => atualizarFonte(f.id, { recorte: { ...f.recorte, esq: Math.max(0, v) } }), 'es-re')}
                {num('Topo', f.recorte.topo, (v) => atualizarFonte(f.id, { recorte: { ...f.recorte, topo: Math.max(0, v) } }), 'es-rt')}
                {num('Direita', f.recorte.dir, (v) => atualizarFonte(f.id, { recorte: { ...f.recorte, dir: Math.max(0, v) } }), 'es-rd')}
                {num('Embaixo', f.recorte.baixo, (v) => atualizarFonte(f.id, { recorte: { ...f.recorte, baixo: Math.max(0, v) } }), 'es-rb')}
              </div>
            </>}
            <div className="es-linha es-transformar">
              <button type="button" className="es-botao" onClick={() => transformar(f.id, 'ajustar')}>Ajustar à tela</button>
              <button type="button" className="es-botao" onClick={() => transformar(f.id, 'esticar')}>Esticar à tela</button>
              <button type="button" className="es-botao" onClick={() => transformar(f.id, 'centralizar')}>Centralizar</button>
              {f.tipo !== 'cor' && <button type="button" className="es-botao" onClick={() => transformar(f.id, 'original')}>Tamanho original</button>}
              {f.tipo !== 'cor' && <button type="button" className="es-botao" onClick={() => transformar(f.id, 'sem-recorte')}>Tirar o recorte</button>}
              {f.tipo !== 'cor' && f.tipo !== 'texto' && <button type="button" className={`es-botao ${f.espelhar ? 'on' : ''}`} aria-pressed={!!f.espelhar} onClick={() => transformar(f.id, 'espelhar')}>Espelhar</button>}
            </div>
          </>}
        </div>
        <footer><button type="button" className="es-botao principal" onClick={fechar}>Pronto</button></footer>
      </div>
    </div>
  )
}

/* ================================================================ estúdio */

export default function Estudio({ app = false }: { app?: boolean }) {
  const e = useEstudio()
  const [prop, setProp] = useState(false)
  // abre o estúdio e passa a imagem e o som dele para a transmissão
  useEffect(() => {
    let vivo = true
    void iniciarEstudio().then(() => { const s = saidaDoEstudio(); if (vivo && s) void usarEstudioNoTreino(s) })
    return () => { vivo = false }
  }, [])
  if (!e.pronto) return <section className="es es-carregando" aria-busy="true"><p>Abrindo o estúdio…</p></section>

  const c = e.config
  const cena = cenaEmEdicao(c)
  const sel = cena?.fontes.find((f) => f.id === e.selecionada)
  const noAr = cenaPorId(c.programa)
  const previa = cenaPorId(c.previa)
  const nomeDaTransicao = c.transicao === 'stinger' && e.stinger.situacao === 'pronto' ? 'Stinger' : c.transicao === 'corte' ? 'Corte' : `Esmaecer (${c.duracaoMs} ms)`

  return (
    <section className={`es ${app ? 'es-app' : ''}`} aria-label="Estúdio" onPointerDown={() => { if (e.somBloqueado) void liberarSom() }}>
      {e.aviso && <div className="es-aviso" role="status"><span>{e.aviso}</span><button type="button" aria-label="Fechar aviso" onClick={fecharAviso}>×</button></div>}
      <div className={`es-palcos ${c.modoEstudio ? 'duplo' : 'unico'}`}>
        {c.modoEstudio && (
          <figure className="es-palco">
            <figcaption><b>Prévia:</b> {previa?.nome}</figcaption>
            <div className="es-palco-area"><Monitor qual="previa" editavel e={e} /></div>
          </figure>
        )}
        {c.modoEstudio && (
          <div className="es-meio">
            <button type="button" className="es-transicionar" disabled={!!e.transicao || c.previa === c.programa} onClick={() => transicionar()}>
              Transicionar<small>{c.previa === c.programa ? 'A prévia já está no ar' : nomeDaTransicao}</small>
            </button>
          </div>
        )}
        <figure className="es-palco">
          <figcaption><b className="es-vivo"><i aria-hidden />Ao vivo:</b> {noAr?.nome}<span className="es-figura-dica">O que os alunos recebem</span></figcaption>
          <div className="es-palco-area"><Monitor qual="aovivo" editavel={!c.modoEstudio} e={e} /></div>
        </figure>
      </div>

      <div className="es-barra-fonte">
        <span>{sel ? <><Icone nome={sel.tipo} /> {sel.nome}</> : 'Nenhuma fonte selecionada'}</span>
        <button type="button" className="es-botao" disabled={!sel} onClick={() => setProp(true)}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={ACAO.engrenagem} /></svg>Propriedades
        </button>
        <small className="es-dica-edicao">Arraste para mover. Alças: tamanho (Shift solta a proporção, Alt recorta). Setas: ajuste fino.</small>
      </div>

      <div className="es-docas">
        <DocaCenas e={e} />
        <DocaFontes e={e} abrirPropriedades={() => setProp(true)} />
        <DocaMixer e={e} />
        <DocaTransicoes e={e} />
        <DocaControles e={e} />
      </div>
      {prop && sel && <Propriedades f={sel} e={e} fechar={() => setProp(false)} />}
    </section>
  )
}
