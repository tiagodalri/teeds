import { useEffect, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { apagarBloco, gerarMensagens, listarBlocos, salvarBloco, type BlocoDoChat, type DadosDoBloco } from '../../core/live/blocos'
import { mudarVelocidade, pararBloco, tocarBloco, useSimulacao, type Velocidade } from '../../core/live/simulacao'
import './blocos-do-chat.css'

/**
 * Central ao vivo › Simulação › Blocos de mensagens (09/11/2026, pedido do Tiago, com a outra
 * plataforma que eles usam como referência): cada bloco é um tema ("Bom dia", "Quem é aluno?")
 * com a descrição para a I.A. e as mensagens aprovadas. Gera, revisa, aprova; elas ficam em
 * stand-by e vão para o chat simulado no play, na velocidade escolhida.
 */

const VELOCIDADES: Array<[Velocidade, string]> = [['lenta', 'Lenta'], ['normal', 'Normal'], ['rapida', 'Rápida']]
const QUANTIDADES = [10, 20, 30, 50]
const vazio: DadosDoBloco = { nome: '', descricao: '', exemplos: '', quantidade: 30, mensagens: [], revisar: [] }

const Icone = ({ d, tamanho = 16 }: { d: string; tamanho?: number }) => (
  <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
const ICONES = {
  lapis: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  lixo: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  mais: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  ok: 'M5 12.5l4.5 4.5L19 7.5',
  brilho: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  girar: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
}

export function BlocosDoChat({ sessao }: { sessao: SessaoTeeds | null }) {
  const sim = useSimulacao()
  const [blocos, setBlocos] = useState<BlocoDoChat[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState<BlocoDoChat | 'novo' | null>(null)

  useEffect(() => {
    if (!sessao) return
    listarBlocos(sessao).then(setBlocos).catch((e: Error) => { setBlocos([]); setErro(e.message) })
  }, [sessao?.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const apagar = async (b: BlocoDoChat) => {
    if (!sessao || !window.confirm(`Apagar o bloco "${b.nome || 'Sem nome'}" e as ${b.mensagens.length} mensagens dele?`)) return
    try {
      if (sim.bloco?.id === b.id) pararBloco()
      await apagarBloco(sessao, b.id)
      setBlocos((l) => (l ?? []).filter((x) => x.id !== b.id))
    } catch (e) { setErro((e as Error).message) }
  }
  const salvo = (b: BlocoDoChat) => {
    setBlocos((l) => { const lista = l ?? []; return lista.some((x) => x.id === b.id) ? lista.map((x) => (x.id === b.id ? b : x)) : [...lista, b] })
    setEditando(null)
  }

  const total = (blocos ?? []).reduce((t, b) => t + b.mensagens.length, 0)
  const tocando = sim.bloco

  return (
    <section className="cv-card bc">
      <h4>Blocos de mensagens {blocos && blocos.length > 0 && <small className="cv-num" title={`${total} mensagens aprovadas`}>{blocos.length} {blocos.length === 1 ? 'bloco' : 'blocos'}</small>}</h4>
      <span className="tr-legenda">Prepare e aprove as mensagens antes. Na hora certa, dê o play e elas entram no chat.</span>

      <span className="tr-rotulo">Velocidade</span>
      <div className="tr-seg" role="radiogroup" aria-label="Velocidade do bloco">
        {VELOCIDADES.map(([v, r]) => <button key={v} role="radio" aria-checked={sim.velocidade === v} className={sim.velocidade === v ? 'on' : ''} onClick={() => mudarVelocidade(v)}>{r}</button>)}
      </div>

      {tocando && (
        <div className="bc-tocando" role="status">
          <div className="bc-tocando-texto">
            <small>{sim.pausada || !sim.chatAberto ? 'Esperando o chat' : 'No chat agora'}</small>
            <b>{tocando.nome || 'Sem nome'}</b>
            <span className="cv-num">{tocando.enviadas} de {tocando.total}</span>
          </div>
          <button type="button" className="bc-parar" onClick={pararBloco}>Parar</button>
          <i className="bc-barra" style={{ width: `${(tocando.enviadas / Math.max(1, tocando.total)) * 100}%` }} aria-hidden />
        </div>
      )}

      {!sessao ? <span className="tr-legenda">Entre na sua conta para usar os blocos.</span>
        : blocos === null ? <span className="tr-legenda">Carregando os blocos…</span>
          : blocos.length === 0 ? <div className="bc-vazio">Nenhum bloco ainda. Crie o primeiro: dê um tema, descreva as mensagens e gere com a I.A.</div>
            : (
              <ul className="bc-lista">
                {blocos.map((b) => {
                  const esta = tocando?.id === b.id
                  return (
                    <li key={b.id} className={esta ? 'tocando' : ''}>
                      <button type="button" className={`bc-play ${esta ? 'on' : ''}`} disabled={!esta && (!sim.ativa || !b.mensagens.length)}
                        aria-label={esta ? `Parar o bloco ${b.nome}` : `Dar o play no bloco ${b.nome}`}
                        title={esta ? 'Parar' : !sim.ativa ? 'O play fica liberado quando a transmissão começar' : !b.mensagens.length ? 'Aprove mensagens para dar o play' : 'Mandar para o chat'}
                        onClick={() => (esta ? pararBloco() : tocarBloco(b.id, b.nome, b.mensagens))}>
                        {esta ? <i className="bc-quadrado" aria-hidden /> : <i className="bc-triangulo" aria-hidden />}
                      </button>
                      <button type="button" className="bc-nome" onClick={() => setEditando(b)}>
                        <b>{b.nome || 'Sem nome'}</b>
                        <small><span className="cv-num">{b.mensagens.length}</span> {b.mensagens.length === 1 ? 'mensagem' : 'mensagens'}{b.revisar.length > 0 && <em> · {b.revisar.length} para revisar</em>}</small>
                      </button>
                      <button type="button" className="bc-ico" aria-label={`Editar o bloco ${b.nome}`} title="Editar" onClick={() => setEditando(b)}><Icone d={ICONES.lapis} /></button>
                      <button type="button" className="bc-ico perigo" aria-label={`Apagar o bloco ${b.nome}`} title="Apagar" onClick={() => void apagar(b)}><Icone d={ICONES.lixo} /></button>
                    </li>
                  )
                })}
              </ul>
            )}

      {erro && <p className="av-erro" role="alert">{erro}</p>}
      {sessao && <button type="button" className="bc-novo" onClick={() => setEditando('novo')}><Icone d={ICONES.mais} />Novo bloco</button>}
      {sessao && !sim.ativa && blocos && blocos.length > 0 && <span className="tr-legenda">O play fica liberado quando a transmissão começar.</span>}

      {editando && sessao && (
        <EditorDoBloco sessao={sessao} bloco={editando === 'novo' ? null : editando} ordem={(blocos ?? []).length}
          aoFechar={() => setEditando(null)} aoSalvar={salvo} />
      )}
    </section>
  )
}

function EditorDoBloco({ sessao, bloco, ordem, aoFechar, aoSalvar }: {
  sessao: SessaoTeeds; bloco: BlocoDoChat | null; ordem: number; aoFechar: () => void; aoSalvar: (b: BlocoDoChat) => void
}) {
  const inicial = useRef<DadosDoBloco>(bloco ? { nome: bloco.nome, descricao: bloco.descricao, exemplos: bloco.exemplos, quantidade: bloco.quantidade, mensagens: bloco.mensagens, revisar: bloco.revisar } : vazio)
  const [d, setD] = useState<DadosDoBloco>(inicial.current)
  const [gerando, setGerando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [focarNova, setFocarNova] = useState(false)
  const nomeRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLOListElement>(null)
  const mudar = (p: Partial<DadosDoBloco>) => setD((x) => ({ ...x, ...p }))
  const sujo = JSON.stringify(d) !== JSON.stringify(inicial.current)

  useEffect(() => { if (!bloco) nomeRef.current?.focus() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!focarNova) return
    listaRef.current?.querySelector('input')?.focus(); setFocarNova(false)
  }, [focarNova])

  const fechar = () => { if (!sujo || window.confirm('Sair sem salvar as mudanças deste bloco?')) aoFechar() }
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !gerando && !salvando) fechar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  const gerar = async () => {
    if (!d.nome.trim() && !d.descricao.trim()) { setErro('Dê um nome ao bloco ou descreva o tipo de mensagem.'); return }
    setGerando(true); setErro(null)
    try {
      const novas = await gerarMensagens(sessao, { nome: d.nome, descricao: d.descricao, exemplos: d.exemplos, quantidade: d.quantidade, evitar: [...d.mensagens, ...d.revisar] })
      setD((x) => ({ ...x, revisar: [...x.revisar, ...novas] }))
    } catch (e) { setErro((e as Error).message) } finally { setGerando(false) }
  }
  const aprovar = (i?: number) => setD((x) => i === undefined
    ? { ...x, mensagens: [...x.mensagens, ...x.revisar.map((m) => m.trim()).filter(Boolean)], revisar: [] }
    : { ...x, mensagens: x.revisar[i].trim() ? [...x.mensagens, x.revisar[i].trim()] : x.mensagens, revisar: x.revisar.filter((_, k) => k !== i) })
  const salvar = async () => {
    const limpo: DadosDoBloco = {
      ...d, nome: d.nome.trim(), descricao: d.descricao.trim(), exemplos: d.exemplos.trim(),
      mensagens: d.mensagens.map((m) => m.trim()).filter(Boolean), revisar: d.revisar.map((m) => m.trim()).filter(Boolean),
    }
    if (!limpo.nome) { setErro('Dê um nome ao bloco.'); nomeRef.current?.focus(); return }
    setSalvando(true); setErro(null)
    try { aoSalvar(await salvarBloco(sessao, limpo, bloco?.id, ordem)) } catch (e) { setErro((e as Error).message); setSalvando(false) }
  }

  return (
    <div className="bc-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget && !gerando && !salvando) fechar() }}>
      <div className="bc-janela" role="dialog" aria-modal="true" aria-labelledby="bc-titulo">
        <header className="bc-janela-topo">
          <h3 id="bc-titulo">{bloco ? 'Editar bloco' : 'Novo bloco'}</h3>
          <button type="button" className="bc-ico" aria-label="Fechar" onClick={fechar} disabled={gerando || salvando}><Icone d={ICONES.x} tamanho={18} /></button>
        </header>

        <div className="bc-janela-corpo">
          <section className="bc-sec">
            <h5>1. Identificação</h5>
            <label htmlFor="bc-nome">Nome do bloco</label>
            <input id="bc-nome" ref={nomeRef} value={d.nome} maxLength={120} placeholder="Ex.: Bom dia" onChange={(e) => mudar({ nome: e.target.value })} />
          </section>

          <section className="bc-sec">
            <h5>2. Configuração da I.A.</h5>
            <label htmlFor="bc-desc">Descreva o tipo de mensagem</label>
            <textarea id="bc-desc" rows={4} value={d.descricao} maxLength={2000} onChange={(e) => mudar({ descricao: e.target.value })}
              placeholder="Ex.: pessoas dando bom dia e dizendo de onde estão assistindo, cada uma de um jeito, umas com letra maiúscula, outras tudo minúsculo, sem exclamação em todas" />
            <label htmlFor="bc-ex">Exemplos <small>(opcional)</small></label>
            <textarea id="bc-ex" rows={3} value={d.exemplos} maxLength={4000} onChange={(e) => mudar({ exemplos: e.target.value })}
              placeholder={'Cole aqui exemplos reais do tom que você quer.\nEx.: bom diaa de BH\nBom dia pessoal, primeira vez aqui'} />
            <span className="bc-rotulo" id="bc-qtd">Quantas mensagens gerar</span>
            <div className="bc-quantidade" role="group" aria-labelledby="bc-qtd">
              <div className="tr-prontos">
                {QUANTIDADES.map((n) => <button key={n} type="button" className={d.quantidade === n ? 'on' : ''} onClick={() => mudar({ quantidade: n })}>{n}</button>)}
              </div>
              <input type="number" min={1} max={100} value={d.quantidade} aria-label="Quantidade de mensagens"
                onChange={(e) => { const n = Math.round(Number(e.target.value)); if (n > 0) mudar({ quantidade: Math.min(100, n) }) }} />
            </div>
            <div className="bc-gerar">
              <button type="button" className="bc-botao-ia" onClick={() => void gerar()} disabled={gerando}>
                {gerando ? <><i className="bc-girando" aria-hidden />Gerando {d.quantidade}…</> : <><Icone d={ICONES.brilho} tamanho={17} />Gerar {d.quantidade} com I.A.</>}
              </button>
              <button type="button" className="bc-botao-primario" onClick={() => { mudar({ mensagens: ['', ...d.mensagens] }); setFocarNova(true) }}>
                <Icone d={ICONES.mais} tamanho={17} />Adicionar manual
              </button>
            </div>
            {erro && <p className="av-erro" role="alert">{erro}</p>}
          </section>

          {d.revisar.length > 0 && (
            <section className="bc-sec bc-revisar">
              <div className="bc-sec-topo">
                <h5>Para revisar <span className="cv-num">{d.revisar.length}</span></h5>
                <button type="button" className="bc-botao-leve" onClick={() => mudar({ revisar: [] })}>Descartar todas</button>
                <button type="button" className="bc-botao-ok" onClick={() => aprovar()}><Icone d={ICONES.ok} />Aprovar todas</button>
              </div>
              <span className="tr-legenda">Edite o que quiser, descarte o que não serve e aprove. Só as aprovadas vão para o chat.</span>
              <ol className="bc-msgs">
                {d.revisar.map((m, i) => (
                  <li key={`r${i}`}>
                    <input value={m} maxLength={300} aria-label={`Mensagem para revisar ${i + 1}`} onChange={(e) => mudar({ revisar: d.revisar.map((x, k) => (k === i ? e.target.value : x)) })} />
                    <button type="button" className="bc-ico ok" aria-label="Aprovar esta" title="Aprovar esta" onClick={() => aprovar(i)}><Icone d={ICONES.ok} /></button>
                    <button type="button" className="bc-ico" aria-label="Descartar esta" title="Descartar" onClick={() => mudar({ revisar: d.revisar.filter((_, k) => k !== i) })}><Icone d={ICONES.x} /></button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="bc-sec">
            <div className="bc-sec-topo">
              <h5>3. Mensagens do bloco</h5>
              <button type="button" className="bc-botao-leve" onClick={() => void gerar()} disabled={gerando}><Icone d={ICONES.girar} />Gerar mais</button>
            </div>
            <span className="bc-contagem">{d.mensagens.length} {d.mensagens.length === 1 ? 'mensagem aprovada' : 'mensagens aprovadas'}</span>
            {d.mensagens.length === 0
              ? <div className="bc-vazio">Gere com a I.A. e aprove, ou adicione à mão. É isso que o play manda para o chat.</div>
              : (
                <ol className="bc-msgs" ref={listaRef}>
                  {d.mensagens.map((m, i) => (
                    <li key={`m${i}`}>
                      <input value={m} maxLength={300} aria-label={`Mensagem ${i + 1}`} placeholder="Escreva a mensagem" onChange={(e) => mudar({ mensagens: d.mensagens.map((x, k) => (k === i ? e.target.value : x)) })} />
                      <button type="button" className="bc-ico" aria-label="Tirar esta mensagem" title="Tirar" onClick={() => mudar({ mensagens: d.mensagens.filter((_, k) => k !== i) })}><Icone d={ICONES.x} /></button>
                    </li>
                  ))}
                </ol>
              )}
          </section>
        </div>

        <footer className="bc-janela-pe">
          {d.revisar.length > 0 && <span className="tr-legenda">{d.revisar.length} ainda para revisar (ficam guardadas, mas não vão no play).</span>}
          <button type="button" className="bc-botao-leve" onClick={fechar} disabled={salvando}>Cancelar</button>
          <button type="button" className="bc-botao-primario" onClick={() => void salvar()} disabled={salvando || gerando}>{salvando ? 'Salvando…' : 'Salvar bloco'}</button>
        </footer>
      </div>
    </div>
  )
}
