import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  alternarAparelho, aplicarModelo, apagarCena, cenaPorId, colocarNoAr, criarTela, desenharMiniatura, duplicarTela, enviarArquivo,
  estudioAgora, fecharAviso, iniciarEstudio, videoNoAr, liberarSom, microfoneMudo, moverCena, nivelDoCanal, saidaDoEstudio, situacaoDoAparelho, telaAoVivo, useEstudio,
  type Aparelho,
} from '../../core/live/estudio/motor'
import { MODELOS, VIDEOS_PRONTOS, infoDoModelo, quandoTerminar, type VideoPronto } from '../../core/live/estudio/modelo'
import type { CamposDoModelo, Cena, TipoDeModelo } from '../../core/live/estudio/tipos'
import { simulacaoAgora, useSimulacao } from '../../core/live/simulacao'
import { usarEstudioNoTreino } from '../../core/live/treino'
import { enviarArquivoDaLive, ligarSincroniaDasTelas, type EstadoDaNuvem } from '../../core/live/estudio/nuvem'
import { sessaoGuardada } from '../../core/teeds/conta'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { MARCA, GF_NOME } from '../../marca'
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
    const erro = s === 'erro' ? (e.errosDeCaptura[a === 'camera' ? 'camera:padrao' : a === 'tela' ? 'tela' : 'mic:padrao'] ?? 'Não ligou. Tente de novo.') : null
    const legenda = s === 'ligando' ? 'Ligando…' : erro ? `${erro} Clique para tentar de novo.` : mudo ? 'Mudo' : on
      ? (a === 'tela' ? 'Compartilhando' : a === 'microfone' && !micNaTela ? 'Ligado · alunos não ouvem nesta tela' : 'Ligado')
      : a === 'tela' ? 'Clique para escolher a tela' : 'Desligado'
    return (
      <button type="button" role="switch" aria-checked={on} className={`ps-aparelho ${on ? 'on' : ''} ${erro ? 'erro' : ''} ${s === 'ligando' ? 'ligando' : ''} ${a === 'microfone' && on && !micNaTela ? 'aviso' : ''}`}
        onClick={() => alternarAparelho(a)} title={erro ?? undefined}>
        <span className="ps-aparelho-ico"><Icone d={icone} tamanho={18} />{!on && <span className="ps-risco"><Icone d={ICONES.riscar} tamanho={18} /></span>}</span>
        <span className="ps-aparelho-txt"><b>{rotulo}</b><small>{legenda}</small>{a === 'microfone' && <span aria-hidden><MedidorDoMic ligado={on} /></span>}</span>
        <i className="ps-chave" aria-hidden />
      </button>
    )
  }
  return (
    <div className="ps-aparelhos" role="group" aria-label="Câmera, tela e microfone (valem para todas as telas)">
      {item('tela', 'Tela', ICONES.tela)}
      {item('camera', 'Câmera', ICONES.camera)}
      {item('microfone', 'Microfone', ICONES.microfone)}
    </div>
  )
}

/* ------------------------------------------------------------- o editor */

const sim = (v: string | undefined) => v === 'sim'
const tempo = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const ACEITA = 'image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime'

function CampoDeMidia({ rotulo, dica, campos, prefixo, mudar, padrao, sessao }: {
  rotulo: string; dica: string; campos: CamposDoModelo; prefixo: 'fundo' | 'midia'
  mudar: (p: CamposDoModelo) => void; padrao?: CamposDoModelo; sessao: SessaoTeeds | null
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
    const tipo = f.type.startsWith('video/') ? 'video' : 'imagem'
    try {
      // 23/11/2026: o arquivo vai para a nuvem (todo administrador vê); sem rede, fica só neste computador
      if (sessao) {
        try {
          const url = await enviarArquivoDaLive(sessao, f, f.name)
          mudar({ [prefixo]: '', [`${prefixo}Url`]: url, [`${prefixo}Tipo`]: tipo, [`${prefixo}Nome`]: f.name })
          return
        } catch (e) { setErro(`${(e as Error).message} Ficou guardado só neste computador.`) }
      }
      const id = await enviarArquivo(f)
      mudar({ [prefixo]: id, [`${prefixo}Url`]: '', [`${prefixo}Tipo`]: tipo, [`${prefixo}Nome`]: f.name })
    } catch { setErro('Não consegui guardar o arquivo.') } finally { setEnviando(false) }
  }
  return (
    <div className="ps-campo">
      <span className="ps-rotulo">{rotulo}</span>
      <div className="ps-midia">
        <span className="ps-midia-nome">{tem ? <>{campos[`${prefixo}Tipo`] === 'video' ? 'Vídeo' : 'Imagem'}: <b>{ePadrao ? 'o padrão da plataforma' : nome}</b></> : <em>Nenhum arquivo</em>}</span>
        <button type="button" className="ps-botao" onClick={() => input.current?.click()} disabled={enviando}><Icone d={ICONES.enviar} />{enviando ? 'Enviando…' : tem ? 'Trocar' : 'Escolher'}</button>
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

function EditorDaTela({ id, fechar, sessao }: { id: string; fechar: () => void; sessao: SessaoTeeds | null }) {
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
              <CampoDeMidia rotulo="Fundo" prefixo="fundo" campos={campos} mudar={mudar} padrao={info.campos} sessao={sessao}
                dica="Uma imagem, ou um vídeo/animação (MP4 ou WebM). O vídeo repete sozinho e o som dele vai para os alunos." />
            </>}

            {tipo === 'aovivo' && <>
              <SimNao rotulo="Você no canto" dica="A câmera aparece por cima da tela compartilhada." valor={sim(campos.camera)} mudar={(v) => mudar({ camera: v ? 'sim' : 'nao' })} />
              {sim(campos.camera) && (
                <div className="ps-campo">
                  <span className="ps-rotulo">Em qual canto</span>
                  <div className="ps-cantos" role="radiogroup" aria-label="Canto da câmera">
                    {CANTOS.map(([v, r]) => <button key={v} type="button" role="radio" aria-checked={campos.canto === v} aria-label={r} title={r} className={`c-${v} ${campos.canto === v ? 'on' : ''}`} onClick={() => mudar({ canto: v })}><i aria-hidden /></button>)}
                  </div>
                </div>
              )}
              <SimNao rotulo="Som do computador" dica="Leva junto o som da tela compartilhada (vídeo, gráfico com som). Vale na próxima vez que você compartilhar a tela." valor={sim(campos.somDaTela)} mudar={(v) => mudar({ somDaTela: v ? 'sim' : 'nao' })} />
              <small className="ps-dica">A tela que vai aqui é a do botão <b>Tela</b>, embaixo do vídeo.</small>
            </>}

            {tipo === 'camera' && (
              <Texto rotulo="Legenda" valor={campos.legenda ?? ''} max={50} placeholder={`Victor Cordeiro · ${GF_NOME}`} mudar={(v) => mudar({ legenda: v })} dica="Aparece embaixo, à esquerda. Deixe vazio para não mostrar." />
            )}

            {tipo === 'depoimento' && <>
              <CampoDeMidia rotulo="Foto ou vídeo do cliente" prefixo="midia" campos={campos} mudar={mudar} sessao={sessao} dica="Opcional. Sem foto, a frase fica no centro da tela." />
              <Texto rotulo="Frase do cliente" linhas={3} max={220} placeholder="Em 30 dias eu entendi o que fazia de errado…" valor={campos.frase ?? ''} mudar={(v) => mudar({ frase: v })} dica="Use as palavras do cliente, como ele disse." />
              <Texto rotulo="Nome" placeholder="Ana Souza" valor={campos.nome ?? ''} max={40} mudar={(v) => mudar({ nome: v })} />
              <Texto rotulo="Cidade" placeholder="Curitiba, PR" valor={campos.cidade ?? ''} max={40} mudar={(v) => mudar({ cidade: v })} />
            </>}

            {tipo === 'arte' && <>
              <CampoDeMidia rotulo="Sua arte" prefixo="midia" campos={campos} mudar={mudar} sessao={sessao} dica="Imagem, vídeo ou animação (MP4 ou WebM) na tela toda. O som do vídeo vai para os alunos." />
              {campos.midiaTipo === 'video' && (
                <div className="ps-campo">
                  <span className="ps-rotulo">Quando o vídeo terminar</span>
                  <div className="tr-seg" role="radiogroup" aria-label="Quando o vídeo terminar">
                    {([['voltar', 'Volta à tela de antes'], ['repetir', 'Repete'], ['parar', 'Para no fim']] as const).map(([v, r]) => (
                      <button key={v} type="button" role="radio" aria-checked={quandoTerminar(campos) === v} className={quandoTerminar(campos) === v ? 'on' : ''} onClick={() => mudar({ aoTerminar: v })}>{r}</button>
                    ))}
                  </div>
                  <small className="ps-dica">{quandoTerminar(campos) === 'voltar' ? 'Ao acabar, a live volta sozinha para a tela que estava antes (por exemplo, Ao vivo).' : quandoTerminar(campos) === 'repetir' ? 'O vídeo recomeça sem parar até você trocar de tela.' : 'O vídeo fica parado no último quadro até você trocar de tela.'}</small>
                </div>
              )}
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
          <small className="ps-dica">{sessao ? 'As mudanças vão sozinhas para a nuvem: toda a equipe vê as mesmas telas.' : 'As mudanças ficam salvas neste computador.'}</small>
          <button type="button" className="ps-botao ps-botao-forte" onClick={fechar}>Pronto</button>
        </footer>
      </div>
    </div>
  )
}

function NovaTela({ escolher, escolherVideo, fechar, jaTem }: { escolher: (t: TipoDeModelo) => void; escolherVideo: (v: VideoPronto) => void; fechar: () => void; jaTem: (url: string) => string | null }) {
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
        {VIDEOS_PRONTOS.length > 0 && (
          <div className="ps-videos-prontos">
            <h3>Vídeos da {MARCA.prosa} <small>Já vêm com a plataforma: um clique e viram uma tela</small></h3>
            <div className="ps-modelos ps-modelos-videos">
              {VIDEOS_PRONTOS.map((v) => {
                const existente = jaTem(v.url)
                return (
                  <button key={v.id} type="button" className="ps-modelo ps-modelo-video" onClick={() => escolherVideo(v)}>
                    <span className="ps-modelo-play" aria-hidden><Icone d="M8 5l11 7-11 7z" tamanho={14} /></span>
                    <span><b>{v.nome}</b><small>{existente ? `Já está nas telas: ${existente}` : v.dica}</small></span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- o painel */

/* ------------------------------------------- telas na nuvem (23/11/2026) */

/** Liga a sincronia das telas com a nuvem (a regra toda está em core/live/estudio/nuvem.ts). */
function useTelasNaNuvem(sessao: SessaoTeeds | null, pronto: boolean, pausar: boolean): EstadoDaNuvem {
  const [st, setSt] = useState<EstadoDaNuvem>({ fase: sessao ? 'abrindo' : 'local' })
  const pausarRef = useRef(pausar)
  pausarRef.current = pausar
  useEffect(() => {
    if (!sessao || !pronto) return
    return ligarSincroniaDasTelas({
      // o token mais novo (a sessão é renovada pelo app; a live pode passar de 1 h)
      sessao: () => sessaoGuardada() ?? sessao,
      pausar: () => pausarRef.current,
      telaNoAr: () => (simulacaoAgora().ativa ? estudioAgora().config.programa : null),
      avisar: setSt,
    })
  }, [sessao?.usuario.id, pronto]) // eslint-disable-line react-hooks/exhaustive-deps
  return st
}

export function PainelDaSala({ sessao = null }: { sessao?: SessaoTeeds | null }) {
  const e = useEstudio()
  const sala = useSimulacao()
  const [editando, setEditando] = useState<string | null>(null)
  const [novaAberta, setNovaAberta] = useState(false)
  const nuvem = useTelasNaNuvem(sessao, e.pronto, !!editando || novaAberta)
  // o vídeo da tela no ar: tempo e o que faz no fim (lido 4 vezes por segundo)
  const [videoAgora, setVideoAgora] = useState<ReturnType<typeof videoNoAr>>(null)
  useEffect(() => {
    const t = window.setInterval(() => setVideoAgora((antes) => { const v = videoNoAr(); return !v && !antes ? antes : v }), 250)
    return () => window.clearInterval(t)
  }, [])

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
      if (editando || novaAberta || ev.metaKey || ev.ctrlKey || ev.altKey) return
      const alvo = ev.target as HTMLElement | null
      // campos de digitar ficam de fora; a barra do público e as caixinhas não (o espaço segue trocando a tela)
      const deTexto = alvo instanceof HTMLInputElement ? !['range', 'checkbox', 'radio', 'button'].includes(alvo.type) : false
      if (alvo && (deTexto || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return
      // outra janela aberta (a dos roteiros da I.A., por exemplo): os números não trocam a tela no ar
      if (document.querySelector('[aria-modal="true"], .ps-pop')) return
      // barra de espaço: a próxima tela (o botão em foco não recebe o espaço)
      if (ev.code === 'Space') {
        ev.preventDefault()
        ;(document.activeElement as HTMLElement | null)?.blur?.()
        if (ev.repeat) return
        const i = cenas.findIndex((c) => c.id === estudioAgora().config.programa)
        const prox = cenas[i + 1]
        if (prox) colocarNoAr(prox.id)
        return
      }
      if (ev.repeat) return
      const n = Number(ev.key)
      if (n >= 1 && n <= 9 && cenas[n - 1]) { ev.preventDefault(); colocarNoAr(cenas[n - 1].id) }
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [cenas, editando, novaAberta])

  if (!e.pronto) return <section className="ps ps-carregando" aria-busy="true"><p>Abrindo as telas…</p></section>

  const noAr = cenaPorId(e.config.programa)
  const abertura = telaDeAbertura(cenas)
  const video = videoAgora
  const indice = cenas.findIndex((c) => c.id === e.config.programa)
  const proxima = indice >= 0 ? cenas[indice + 1] : cenas[0]
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
      {falta && (
        <p className="ps-guia ps-guia-alerta" role="alert"><i aria-hidden />A tela <b>{noAr?.nome}</b> usa {falta === 'tela' ? 'a tela compartilhada' : 'a câmera'}, que está desligada{sala.ativa ? ': os alunos estão vendo preto.' : '.'}
          <button type="button" className="ps-guia-botao" onClick={() => alternarAparelho(falta)}>{falta === 'tela' ? 'Compartilhar a tela' : 'Ligar a câmera'}</button></p>
      )}

      <figure className={`ps-monitor ${sala.ativa ? 'no-ar' : ''}`}>
        <Monitor pronto={e.pronto} />
        {entrando && <span key={entrando} className="ps-monitor-troca" aria-hidden style={{ animationDuration: `${e.config.duracaoMs}ms` }} />}
        <span className="ps-selo"><i aria-hidden />{sala.ativa ? 'No ar' : 'Prévia'} · {noAr?.nome}</span>
        {e.somBloqueado && <button type="button" className="ps-som" onClick={() => void liberarSom()}>Clique para liberar o som</button>}
      </figure>

      {/* o comando da live: o que está no ar e a próxima tela, num botão grande (ou na barra de espaço) */}
      <div className={`ps-comando ${sala.ativa ? 'vivo' : ''}`}>
        <div className="ps-comando-agora">
          <small>{sala.ativa ? 'No ar agora' : 'Na prévia'}</small>
          <b>{noAr?.nome}</b>
          {!sala.ativa && abertura && !video && <em>A live sempre abre em {abertura.nome}</em>}
          {video && (
            <span className="ps-video-tempo" role="status">
              <i style={{ width: `${Math.min(100, (video.atual / video.duracao) * 100)}%` }} aria-hidden />
              <small className="cv-num">{tempo(video.atual)} de {tempo(video.duracao)}</small>
              <small>{video.aoTerminar === 'voltar' ? `No fim, volta para ${video.volta ?? 'a tela de antes'}` : video.aoTerminar === 'repetir' ? 'Repete no fim' : 'Para no fim'}</small>
            </span>
          )}
        </div>
        <button type="button" className="ps-proxima" disabled={!proxima || !!entrando} onClick={() => proxima && colocarNoAr(proxima.id)}
          title={proxima ? `Pôr ${proxima.nome} no ar (barra de espaço)` : 'Esta é a última tela'}>
          <span><small>{proxima ? 'Próxima tela' : 'Última tela'}</small><b>{proxima ? proxima.nome : 'Fim da sequência'}</b></span>
          {proxima && <kbd>Espaço</kbd>}
          <Icone d="M8 5l11 7-11 7z" tamanho={18} />
        </button>
      </div>

      <div className="ps-telas-topo">
        <h3>Telas</h3>
        <span className={`ps-nuvem ${nuvem.fase}`} role="status" title={nuvem.fase === 'erro' ? nuvem.erro : undefined}>
          <i aria-hidden />
          {nuvem.fase === 'local' ? 'Salvas neste computador'
            : nuvem.fase === 'abrindo' ? 'Abrindo as telas da equipe…'
              : nuvem.fase === 'salvando' ? 'Salvando na nuvem…'
                : nuvem.fase === 'erro' ? 'Sem conexão com a nuvem: salvas só neste computador'
                  : `Na nuvem · a equipe toda vê as mesmas${nuvem.nome ? ` · última mudança: ${nuvem.nome.split(' ')[0]}` : ''}`}
        </span>
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
                  {!esta && !entrando && !precisa(c) && <span className="ps-mini-acao" aria-hidden><Icone d="M8 5l11 7-11 7z" tamanho={14} />{sala.ativa ? 'Colocar no ar' : 'Ver na prévia'}</span>}
                  {vem && <span className="ps-mini-entrando" aria-hidden style={{ animationDuration: `${e.config.duracaoMs}ms` }} />}
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

      {editando && <EditorDaTela id={editando} fechar={() => setEditando(null)} sessao={sessao} />}
      {novaAberta && <NovaTela fechar={() => setNovaAberta(false)} escolher={(t) => { const id = criarTela(t); setNovaAberta(false); setEditando(id) }}
        jaTem={(url) => cenas.find((c) => c.modelo?.campos.midiaUrl === url)?.nome ?? null}
        escolherVideo={(v) => {
          // o vídeo já está numa tela: só mostra ela; senão, cria a tela pronta
          const existente = cenas.find((c) => c.modelo?.campos.midiaUrl === v.url)
          setNovaAberta(false)
          if (existente) { setEditando(existente.id); return }
          criarTela('arte', v.nome, { midiaUrl: v.url, midiaTipo: 'video', midiaNome: v.nome, aoTerminar: v.aoTerminar, mic: 'nao' })
        }} />}
    </section>
  )
}
