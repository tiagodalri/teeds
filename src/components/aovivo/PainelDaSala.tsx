import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  alternarAparelho, aplicarModelo, apagarCena, cenaPorId, colocarNoAr, criarTela, desenharMiniatura, duplicarTela, enviarArquivo,
  fecharAviso, iniciarEstudio, liberarSom, microfoneMudo, moverCena, nivelDoCanal, saidaDoEstudio, situacaoDoAparelho, telaAoVivo, useEstudio,
  type Aparelho,
} from '../../core/live/estudio/motor'
import { MODELOS, infoDoModelo } from '../../core/live/estudio/modelo'
import type { CamposDoModelo, Cena, TipoDeModelo } from '../../core/live/estudio/tipos'
import { useSimulacao } from '../../core/live/simulacao'
import { usarEstudioNoTreino } from '../../core/live/treino'
import './painel-da-sala.css'

/**
 * O painel da sala de treino (18/11/2026, pedido do Tiago: "um layout só,
 * muito intuitivo", no lugar do estúdio estilo OBS). Em cima, exatamente o
 * que os alunos veem; embaixo, as telas prontas: um clique põe no ar, o lápis
 * troca o texto, a foto ou o vídeo. Câmera, tela e microfone valem para todas.
 */

const Icone = ({ d, tamanho = 16 }: { d: string; tamanho?: number }) => (
  <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
const ICONES = {
  lapis: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  mais: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  tela: 'M3 5h18v12H3zM8 21h8M12 17v4',
  camera: 'M3 7h12v10H3zM15 11l6-3v8l-6-3',
  microfone: 'M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM5 11a7 7 0 0014 0M12 18v3',
  riscar: 'M4 4l16 16',
  esq: 'M15 6l-6 6 6 6',
  dir: 'M9 6l6 6-6 6',
  copiar: 'M8 8h11v11H8zM5 16V5h11',
  lixo: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  enviar: 'M12 16V4M7 9l5-5 5 5M5 20h14',
}

/** As telas da abertura: o painel sempre começa por ela. */
export function telaDeAbertura(cenas: Cena[]): Cena | undefined {
  return cenas.find((c) => c.modelo?.tipo === 'abertura') ?? cenas[0]
}

/* --------------------------------------------------------------- o monitor */

function Monitor({ pronto }: { pronto: boolean }) {
  const caixa = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = caixa.current, tela = telaAoVivo()
    if (!el || !tela) return
    tela.className = 'ps-canvas'
    el.prepend(tela)
    return () => { tela.remove() }
  }, [pronto])
  return <div className="ps-monitor-area" ref={caixa} />
}

/* ------------------------------------------------------ miniaturas das telas */

const LARGURA_MINI = 320
function useMiniaturas(ids: string[]) {
  const telas = useRef(new Map<string, HTMLCanvasElement>())
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.hidden) return
      for (const id of ids) {
        const c = telas.current.get(id)
        const x = c?.getContext('2d')
        if (x) desenharMiniatura(id, x, LARGURA_MINI)
      }
    }, 600)
    return () => window.clearInterval(t)
  }, [ids.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  return (id: string) => (el: HTMLCanvasElement | null) => { if (el) telas.current.set(id, el); else telas.current.delete(id) }
}

/* ------------------------------------------------------------ os aparelhos */

function MedidorDoMic({ ligado }: { ligado: boolean }) {
  const [nivel, setNivel] = useState(-60)
  useEffect(() => {
    if (!ligado) { setNivel(-60); return }
    const t = window.setInterval(() => setNivel(nivelDoCanal('mic:padrao')), 90)
    return () => window.clearInterval(t)
  }, [ligado])
  const barras = 12
  const acesas = Math.round(((nivel + 60) / 60) * barras)
  return (
    <span className="ps-vu" aria-label={ligado ? `Volume do microfone: ${Math.round(nivel)} dB` : 'Microfone desligado'}>
      {Array.from({ length: barras }, (_, i) => <i key={i} className={i < acesas ? (i >= barras - 2 ? 'alto' : i >= barras - 4 ? 'medio' : 'ok') : ''} />)}
    </span>
  )
}

function Aparelhos() {
  const e = useEstudio()
  // a tela no ar leva o microfone? (Abertura, Intervalo e Encerramento nascem sem)
  const micNaTela = !!cenaPorId(e.config.programa, e.config)?.fontes.some((f) => f.tipo === 'microfone' && f.visivel)
  const item = (a: Aparelho, rotulo: string, icone: string) => {
    const s = situacaoDoAparelho(a)
    const mudo = a === 'microfone' && s === 'ok' && microfoneMudo()
    const on = s === 'ok' && !mudo
    const legenda = s === 'ligando' ? 'Ligando…' : s === 'erro' ? (e.errosDeCaptura[a === 'camera' ? 'camera:padrao' : a === 'tela' ? 'tela' : 'mic:padrao'] ?? 'Não ligou') : mudo ? 'Mudo' : on ? (a === 'tela' ? 'Compartilhando' : a === 'microfone' && !micNaTela ? 'Ligado · os alunos não ouvem nesta tela' : 'Ligado') : a === 'tela' ? 'Clique para escolher' : 'Desligado'
    return (
      <button type="button" className={`ps-aparelho ${on ? 'on' : ''} ${s === 'erro' ? 'erro' : ''}`} aria-pressed={on} onClick={() => alternarAparelho(a)} title={s === 'erro' ? legenda : undefined}>
        <span className="ps-aparelho-ico"><Icone d={icone} tamanho={18} />{!on && <span className="ps-risco"><Icone d={ICONES.riscar} tamanho={18} /></span>}</span>
        <span className="ps-aparelho-txt"><b>{rotulo}</b><small>{legenda}</small></span>
        <i className="ps-chave" aria-hidden />
      </button>
    )
  }
  const micOk = situacaoDoAparelho('microfone') === 'ok' && !microfoneMudo()
  return (
    <div className="ps-aparelhos" role="group" aria-label="Câmera, tela e microfone">
      {item('tela', 'Tela', ICONES.tela)}
      {item('camera', 'Câmera', ICONES.camera)}
      {item('microfone', 'Microfone', ICONES.microfone)}
      <div className="ps-volume"><span><b>Volume</b><small>{!micOk ? 'Microfone desligado' : micNaTela ? 'Do microfone' : 'Só você ouve nesta tela'}</small></span><MedidorDoMic ligado={micOk} /></div>
    </div>
  )
}

/* ------------------------------------------------------------- o editor */

const sim = (v: string | undefined) => v === 'sim'
const ACEITA = 'image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime'

function CampoDeMidia({ rotulo, dica, campos, prefixo, mudar, padrao }: {
  rotulo: string; dica: string; campos: CamposDoModelo; prefixo: 'fundo' | 'midia'
  mudar: (p: CamposDoModelo) => void; padrao?: CamposDoModelo
}) {
  const input = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const tem = !!(campos[prefixo] || campos[`${prefixo}Url`])
  const nome = campos[`${prefixo}Nome`]
  const ePadrao = !!padrao && campos[`${prefixo}Url`] === padrao[`${prefixo}Url`] && !campos[prefixo]
  const escolher = async (f: File | undefined) => {
    if (!f) return
    setErro(null)
    if (!/^(image|video)\//.test(f.type)) { setErro('Escolha uma imagem (PNG, JPG ou WebP) ou um vídeo (MP4 ou WebM).'); return }
    if (/gif$/i.test(f.type)) { setErro('GIF não anima aqui. Para animação, use um vídeo MP4 ou WebM.'); return }
    setEnviando(true)
    try {
      const id = await enviarArquivo(f)
      mudar({ [prefixo]: id, [`${prefixo}Url`]: '', [`${prefixo}Tipo`]: f.type.startsWith('video/') ? 'video' : 'imagem', [`${prefixo}Nome`]: f.name })
    } catch { setErro('Não consegui guardar o arquivo neste computador.') } finally { setEnviando(false) }
  }
  return (
    <div className="ps-campo">
      <span className="ps-rotulo">{rotulo}</span>
      <div className="ps-midia">
        <span className="ps-midia-nome">{tem ? <>{campos[`${prefixo}Tipo`] === 'video' ? 'Vídeo' : 'Imagem'}: <b>{ePadrao ? 'o padrão da plataforma' : nome}</b></> : <em>Nenhum arquivo</em>}</span>
        <button type="button" className="ps-botao" onClick={() => input.current?.click()} disabled={enviando}><Icone d={ICONES.enviar} />{enviando ? 'Guardando…' : tem ? 'Trocar' : 'Escolher'}</button>
        {tem && !ePadrao && padrao?.[`${prefixo}Url`] && <button type="button" className="ps-link" onClick={() => mudar({ [prefixo]: '', [`${prefixo}Url`]: padrao[`${prefixo}Url`] ?? '', [`${prefixo}Tipo`]: padrao[`${prefixo}Tipo`] ?? '', [`${prefixo}Nome`]: padrao[`${prefixo}Nome`] ?? '' })}>Voltar ao padrão</button>}
        {tem && <button type="button" className="ps-link" onClick={() => mudar({ [prefixo]: '', [`${prefixo}Url`]: '', [`${prefixo}Tipo`]: '', [`${prefixo}Nome`]: '' })}>Tirar</button>}
        <input ref={input} type="file" accept={ACEITA} hidden onChange={(ev) => { void escolher(ev.target.files?.[0]); ev.target.value = '' }} />
      </div>
      <small className="ps-dica">{dica}</small>
      {erro && <small className="ps-erro" role="alert">{erro}</small>}
    </div>
  )
}

function SimNao({ rotulo, dica, valor, mudar }: { rotulo: string; dica?: string; valor: boolean; mudar: (v: boolean) => void }) {
  return (
    <div className="ps-campo ps-campo-linha">
      <span><span className="ps-rotulo">{rotulo}</span>{dica && <small className="ps-dica">{dica}</small>}</span>
      <button type="button" role="switch" aria-checked={valor} className={`ps-interruptor ${valor ? 'on' : ''}`} onClick={() => mudar(!valor)}><i aria-hidden /><span>{valor ? 'Sim' : 'Não'}</span></button>
    </div>
  )
}

function Texto({ rotulo, valor, mudar, linhas = 1, max = 120, dica, placeholder }: { rotulo: string; valor: string; mudar: (v: string) => void; linhas?: number; max?: number; dica?: string; placeholder?: string }) {
  return (
    <label className="ps-campo">
      <span className="ps-rotulo">{rotulo}</span>
      {linhas > 1
        ? <textarea rows={linhas} maxLength={max} value={valor} placeholder={placeholder} onChange={(e) => mudar(e.target.value)} />
        : <input type="text" maxLength={max} value={valor} placeholder={placeholder} onChange={(e) => mudar(e.target.value)} />}
      {dica && <small className="ps-dica">{dica}</small>}
    </label>
  )
}

const CANTOS: Array<[string, string]> = [['sup-esq', 'Em cima, à esquerda'], ['sup-dir', 'Em cima, à direita'], ['inf-esq', 'Embaixo, à esquerda'], ['inf-dir', 'Embaixo, à direita']]

function EditorDaTela({ id, fechar }: { id: string; fechar: () => void }) {
  const e = useEstudio()
  const sala = useSimulacao()
  const cena = cenaPorId(id, e.config)
  const [nome, setNome] = useState(cena?.nome ?? '')
  const [campos, setCampos] = useState<CamposDoModelo>(cena?.modelo?.campos ?? {})
  const previa = useRef<HTMLCanvasElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const [confirmar, setConfirmar] = useState(false)
  // o valor mais novo de tudo (o envio de um arquivo termina depois e não pode desfazer o que foi digitado)
  const atual = useRef({ campos, nome })

  // aplica enquanto digita (um respiro para não remontar a cada letra)
  const aplicar = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { timer.current = undefined; aplicarModelo(id, atual.current.campos, atual.current.nome) }, 220)
  }
  /** Grava agora o que ainda estava esperando (ao fechar, ao pôr no ar, ao duplicar). */
  const gravarJa = () => {
    if (timer.current === undefined) return
    window.clearTimeout(timer.current); timer.current = undefined
    aplicarModelo(id, atual.current.campos, atual.current.nome)
  }
  const mudar = (p: CamposDoModelo) => { const c = { ...atual.current.campos, ...p }; atual.current = { ...atual.current, campos: c }; setCampos(c); aplicar() }
  const mudarNome = (n: string) => { atual.current = { ...atual.current, nome: n }; setNome(n); aplicar() }
  useEffect(() => () => gravarJa(), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = window.setInterval(() => { const x = previa.current?.getContext('2d'); if (x) desenharMiniatura(id, x, 640) }, 100)
    return () => window.clearInterval(t)
  }, [id])
  useEffect(() => {
    const f = (ev: KeyboardEvent) => { if (ev.key === 'Escape') fechar() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [fechar])

  if (!cena || !cena.modelo) return null
  const tipo = cena.modelo.tipo
  const info = infoDoModelo(tipo)
  const noAr = e.config.programa === id
  const podeApagar = e.config.cenas.length > 1 && !noAr

  return (
    <div className="ps-fundo" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) fechar() }}>
      <div className="ps-janela" role="dialog" aria-modal="true" aria-labelledby="ps-editor-titulo">
        <header className="ps-janela-topo">
          <div><h2 id="ps-editor-titulo">Editar tela</h2><small>Modelo: {info.nome}</small></div>
          <button type="button" className="ps-ico" aria-label="Fechar" onClick={fechar}><Icone d={ICONES.x} tamanho={18} /></button>
        </header>
        <div className="ps-janela-corpo">
          <div className="ps-editor-previa">
            <canvas ref={previa} width={640} height={360} />
            {noAr && <p className="ps-aviso-ar" role="status"><i aria-hidden />Esta tela está no ar{sala.ativa ? ': o que você mudar aparece na hora para os alunos.' : '.'}</p>}
            {!noAr && <button type="button" className="ps-botao ps-botao-ouro" onClick={() => { gravarJa(); colocarNoAr(id); fechar() }}>Colocar no ar</button>}
          </div>
          <div className="ps-editor-campos">
            <Texto rotulo="Nome da tela" valor={nome} max={40} dica="Só para você: aparece no cartão." mudar={mudarNome} />

            {(tipo === 'abertura' || tipo === 'intervalo' || tipo === 'encerramento') && <>
              <Texto rotulo="Título" valor={campos.titulo ?? ''} max={60} placeholder="LIVE INICIANDO" mudar={(v) => mudar({ titulo: v })} dica="O texto grande, em dourado. Deixe vazio para não mostrar." />
              <Texto rotulo="Linha de baixo" valor={campos.subtitulo ?? ''} max={60} placeholder="EM INSTANTES" mudar={(v) => mudar({ subtitulo: v })} />
              <CampoDeMidia rotulo="Fundo" prefixo="fundo" campos={campos} mudar={mudar} padrao={info.campos}
                dica="Uma imagem, ou um vídeo/animação (MP4 ou WebM). O vídeo repete sozinho e o som dele vai para os alunos." />
            </>}

            {tipo === 'aovivo' && <>
              <SimNao rotulo="Som do computador" dica="Leva junto o som da tela compartilhada (vídeo, gráfico com som). Vale na próxima vez que você compartilhar a tela." valor={sim(campos.somDaTela)} mudar={(v) => mudar({ somDaTela: v ? 'sim' : 'nao' })} />
              <SimNao rotulo="Você no canto" dica="A câmera aparece por cima da tela compartilhada." valor={sim(campos.camera)} mudar={(v) => mudar({ camera: v ? 'sim' : 'nao' })} />
              {sim(campos.camera) && (
                <div className="ps-campo">
                  <span className="ps-rotulo">Em qual canto</span>
                  <div className="ps-cantos" role="radiogroup" aria-label="Canto da câmera">
                    {CANTOS.map(([v, r]) => <button key={v} type="button" role="radio" aria-checked={campos.canto === v} aria-label={r} title={r} className={`c-${v} ${campos.canto === v ? 'on' : ''}`} onClick={() => mudar({ canto: v })}><i aria-hidden /></button>)}
                  </div>
                </div>
              )}
              <small className="ps-dica">A tela que vai aqui é a do botão <b>Tela</b>, embaixo do vídeo.</small>
            </>}

            {tipo === 'camera' && (
              <Texto rotulo="Legenda" valor={campos.legenda ?? ''} max={50} placeholder="Victor Cordeiro · GlobalFly" mudar={(v) => mudar({ legenda: v })} dica="Aparece embaixo, à esquerda. Deixe vazio para não mostrar." />
            )}

            {tipo === 'depoimento' && <>
              <CampoDeMidia rotulo="Foto ou vídeo do cliente" prefixo="midia" campos={campos} mudar={mudar} dica="Opcional. Sem foto, a frase fica no centro da tela." />
              <Texto rotulo="Frase do cliente" linhas={3} max={220} placeholder="Em 30 dias eu entendi o que fazia de errado…" valor={campos.frase ?? ''} mudar={(v) => mudar({ frase: v })} dica="Use as palavras do cliente, como ele disse." />
              <Texto rotulo="Nome" placeholder="Ana Souza" valor={campos.nome ?? ''} max={40} mudar={(v) => mudar({ nome: v })} />
              <Texto rotulo="Cidade" placeholder="Curitiba, PR" valor={campos.cidade ?? ''} max={40} mudar={(v) => mudar({ cidade: v })} />
            </>}

            {tipo === 'arte' && <>
              <CampoDeMidia rotulo="Sua arte" prefixo="midia" campos={campos} mudar={mudar} dica="Imagem, vídeo ou animação (MP4 ou WebM) na tela toda. O som do vídeo vai para os alunos." />
              {campos.midiaTipo === 'video' && <SimNao rotulo="Repetir o vídeo" valor={campos.repetir !== 'nao'} mudar={(v) => mudar({ repetir: v ? 'sim' : 'nao' })} />}
            </>}

            <SimNao rotulo="Microfone nesta tela" dica={sim(campos.mic) ? 'Os alunos ouvem você enquanto esta tela está no ar.' : 'Os alunos não ouvem você nesta tela.'} valor={sim(campos.mic)} mudar={(v) => mudar({ mic: v ? 'sim' : 'nao' })} />
          </div>
        </div>
        <footer className="ps-janela-rodape">
          <button type="button" className="ps-botao" onClick={() => { gravarJa(); duplicarTela(id); fechar() }}><Icone d={ICONES.copiar} />Duplicar</button>
          {confirmar
            ? <span className="ps-confirmar">Apagar esta tela? <button type="button" className="ps-botao perigo" onClick={() => { if (apagarCena(id)) fechar() }}>Apagar</button><button type="button" className="ps-link" onClick={() => setConfirmar(false)}>Cancelar</button></span>
            : <button type="button" className="ps-botao" onClick={() => setConfirmar(true)} disabled={!podeApagar} title={noAr ? 'Coloque outra tela no ar antes de apagar esta' : undefined}><Icone d={ICONES.lixo} />Apagar</button>}
          <span className="ps-espaco" />
          <small className="ps-dica">As mudanças já estão salvas neste computador.</small>
          <button type="button" className="ps-botao ps-botao-forte" onClick={fechar}>Pronto</button>
        </footer>
      </div>
    </div>
  )
}

function NovaTela({ escolher, fechar }: { escolher: (t: TipoDeModelo) => void; fechar: () => void }) {
  useEffect(() => {
    const f = (ev: KeyboardEvent) => { if (ev.key === 'Escape') fechar() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [fechar])
  return (
    <div className="ps-fundo" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) fechar() }}>
      <div className="ps-janela ps-janela-estreita" role="dialog" aria-modal="true" aria-labelledby="ps-nova-titulo">
        <header className="ps-janela-topo">
          <div><h2 id="ps-nova-titulo">Nova tela</h2><small>Escolha um modelo. Depois é só trocar o texto, a foto ou o vídeo.</small></div>
          <button type="button" className="ps-ico" aria-label="Fechar" onClick={fechar}><Icone d={ICONES.x} tamanho={18} /></button>
        </header>
        <div className="ps-modelos">
          {MODELOS.map((m) => (
            <button key={m.tipo} type="button" className="ps-modelo" onClick={() => escolher(m.tipo)}>
              <b>{m.nome}</b><small>{m.dica}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- o painel */

export function PainelDaSala() {
  const e = useEstudio()
  const sala = useSimulacao()
  const [editando, setEditando] = useState<string | null>(null)
  const [novaAberta, setNovaAberta] = useState(false)

  // abre o motor (uma vez) e passa a imagem e o som dele para a transmissão
  useEffect(() => {
    let vivo = true
    void iniciarEstudio().then(() => { const s = saidaDoEstudio(); if (vivo && s) void usarEstudioNoTreino(s) })
    return () => { vivo = false }
  }, [])

  const cenas = e.pronto ? e.config.cenas : []
  const ref = useMiniaturas(cenas.map((c) => c.id))

  // atalhos: 1 a 9 põem a tela no ar (fora de campos de texto e de janelas)
  useEffect(() => {
    const f = (ev: KeyboardEvent) => {
      if (editando || novaAberta || ev.metaKey || ev.ctrlKey || ev.altKey || ev.repeat) return
      const alvo = ev.target as HTMLElement | null
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return
      // outra janela aberta (a dos roteiros da I.A., por exemplo): os números não trocam a tela no ar
      if (document.querySelector('[aria-modal="true"]')) return
      const n = Number(ev.key)
      if (n >= 1 && n <= 9 && cenas[n - 1]) { ev.preventDefault(); colocarNoAr(cenas[n - 1].id) }
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [cenas, editando, novaAberta])

  if (!e.pronto) return <section className="ps ps-carregando" aria-busy="true"><p>Abrindo as telas…</p></section>

  const noAr = cenaPorId(e.config.programa)
  const abertura = telaDeAbertura(cenas)
  const aoVivo = cenas.find((c) => c.modelo?.tipo === 'aovivo')
  const naAbertura = !!abertura && e.config.programa === abertura.id
  const entrando = e.transicao?.para
  // a tela no ar depende da tela compartilhada ou da câmera, e ela está desligada?
  const precisa = (c: Cena | undefined): Aparelho | null => {
    const tipos = new Set((c?.fontes ?? []).filter((f) => f.visivel).map((f) => f.tipo))
    if (tipos.has('tela') && situacaoDoAparelho('tela') !== 'ok') return 'tela'
    if (tipos.has('camera') && situacaoDoAparelho('camera') !== 'ok') return 'camera'
    return null
  }
  const falta = precisa(noAr)

  return (
    <section className="ps" aria-label="Telas da transmissão" onPointerDown={() => { if (e.somBloqueado) void liberarSom() }}>
      {e.aviso && <div className="ps-faixa-aviso" role="status"><span>{e.aviso}</span><button type="button" aria-label="Fechar aviso" onClick={fecharAviso}><Icone d={ICONES.x} /></button></div>}
      {!sala.ativa
        ? <p className="ps-guia"><i aria-hidden />Ao começar, os alunos veem primeiro a tela <b>{abertura?.nome ?? 'de abertura'}</b>. Quando estiver pronto, clique em <b>{aoVivo?.nome ?? 'Ao vivo'}</b>.</p>
        : naAbertura && aoVivo
          ? <p className="ps-guia"><i aria-hidden />Os alunos estão vendo <b>{abertura!.nome}</b>. Quando estiver pronto: <button type="button" className="ps-guia-botao" onClick={() => colocarNoAr(aoVivo.id)}>Ir para {aoVivo.nome}</button></p>
          : null}
      {falta && (
        <p className="ps-guia ps-guia-alerta" role="alert"><i aria-hidden />A tela <b>{noAr?.nome}</b> usa {falta === 'tela' ? 'a tela compartilhada' : 'a câmera'}, que está desligada{sala.ativa ? ': os alunos estão vendo preto.' : '.'}
          <button type="button" className="ps-guia-botao" onClick={() => alternarAparelho(falta)}>{falta === 'tela' ? 'Compartilhar a tela' : 'Ligar a câmera'}</button></p>
      )}

      <figure className={`ps-monitor ${sala.ativa ? 'no-ar' : ''}`}>
        <Monitor pronto={e.pronto} />
        <span className="ps-selo"><i aria-hidden />{sala.ativa ? 'No ar' : 'Prévia'} · {noAr?.nome}</span>
        <span className="ps-etiqueta">{sala.ativa ? 'O que os alunos estão vendo' : 'O que os alunos vão ver'}</span>
        {e.somBloqueado && <button type="button" className="ps-som" onClick={() => void liberarSom()}>Clique para liberar o som</button>}
      </figure>

      <div className="ps-telas-topo">
        <h3>Telas</h3>
        <small>Um clique coloca no ar · o lápis troca texto, foto ou vídeo · teclas 1 a 9</small>
        <button type="button" className="ps-botao ps-nova" onClick={() => setNovaAberta(true)}><Icone d={ICONES.mais} tamanho={14} />Nova tela</button>
      </div>
      <ol className="ps-telas">
        {cenas.map((c, i) => {
          const esta = e.config.programa === c.id
          const vem = entrando === c.id
          return (
            <li key={c.id} className={`ps-tela ${esta ? 'no-ar' : ''} ${vem ? 'entrando' : ''}`}>
              <button type="button" className="ps-tela-botao" onClick={() => colocarNoAr(c.id)} aria-label={`${esta ? 'No ar: ' : 'Colocar no ar: '}${c.nome}`} aria-current={esta ? 'true' : undefined}>
                <span className="ps-mini">
                  <canvas ref={ref(c.id)} width={LARGURA_MINI} height={LARGURA_MINI * 9 / 16} aria-hidden />
                  {i < 9 && <span className="ps-tecla" aria-hidden>{i + 1}</span>}
                  {precisa(c) && <em className="ps-mini-falta">{precisa(c) === 'tela' ? 'Tela desligada' : 'Câmera desligada'}</em>}
                </span>
                <span className="ps-tela-nome"><b>{c.nome}</b><small>{esta ? (sala.ativa ? 'No ar agora' : 'Na prévia') : vem ? 'Entrando…' : !sala.ativa && c.id === abertura?.id ? 'Abre a live' : c.modelo ? infoDoModelo(c.modelo.tipo).dica : 'Tela'}</small></span>
              </button>
              {esta && <span className="ps-tag">{sala.ativa ? 'No ar' : 'Prévia'}</span>}
              <div className="ps-tela-acoes">
                {i > 0 && <button type="button" className="ps-ico" aria-label={`Mover ${c.nome} para a esquerda`} title="Mover para a esquerda" onClick={() => moverCena(c.id, -1)}><Icone d={ICONES.esq} tamanho={14} /></button>}
                {i < cenas.length - 1 && <button type="button" className="ps-ico" aria-label={`Mover ${c.nome} para a direita`} title="Mover para a direita" onClick={() => moverCena(c.id, 1)}><Icone d={ICONES.dir} tamanho={14} /></button>}
                {c.modelo && <button type="button" className="ps-ico ps-lapis" aria-label={`Editar ${c.nome}`} title="Editar" onClick={() => setEditando(c.id)}><Icone d={ICONES.lapis} tamanho={14} /></button>}
              </div>
            </li>
          )
        })}
      </ol>

      <Aparelhos />

      {editando && <EditorDaTela id={editando} fechar={() => setEditando(null)} />}
      {novaAberta && <NovaTela fechar={() => setNovaAberta(false)} escolher={(t) => { const id = criarTela(t); setNovaAberta(false); setEditando(id) }} />}
    </section>
  )
}
