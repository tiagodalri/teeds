/**
 * O Consultor da Psicologia (28/11/2026, Tiago: "um chat dentro dessa aba... uma inteligência conectada com
 * TODOS os dados do negócio, tipo um consultor"). Conversa com a função psicologia-consultor: texto, áudio
 * gravado na hora, foto, vídeo e arquivo. A conversa fica guardada neste aparelho (localStorage).
 * Nome de aluno não vai para a I.A.: a função troca por código na ida e devolve o nome na volta.
 */
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import type { SessaoTeeds } from '../../../core/teeds/conta'
import { ErroDoConsultor, perguntarAoConsultor, type AnexoDoConsultor } from '../../../core/teeds/psicologia'
import { RespostaFormatada } from '../../assistente/RespostaFormatada'
import { imagemPronta, paraBase64, relogio, useGravador } from '../../assistente/midia'

interface Mensagem { id: string; de: 'eu' | 'ia'; texto: string; anexos?: Array<{ tipo: 'audio' | 'imagem' | 'video' | 'arquivo'; nome: string; segundos?: number }>; erro?: boolean; nova?: boolean; alunos?: string[] }
interface Pendente { id: string; tipo: 'imagem' | 'video' | 'arquivo'; nome: string; mime: string; blob: Blob; previa?: string }

const TETO = 9_500_000 // bytes somados dos anexos de uma mensagem
const SUGESTOES = [
  'O que eu devo fazer esta semana para aumentar os depósitos?',
  'Quais alunos estão em risco de sumir e o que eu digo para cada um?',
  'Qual aula mais antecede o primeiro depósito, e por quê?',
  'Compare os alunos do Naor com os do Victor.',
  'Quem são os alunos que mais geram markup e como eles se comportam?',
  'Quanto de markup fizemos por dia nos últimos 7 dias, e de onde veio?',
]
const chave = (marca: string) => `${marca}.psicologia.consultor`
const id = () => Math.random().toString(36).slice(2, 10)

function ler(marca: string): Mensagem[] {
  try {
    const l = JSON.parse(localStorage.getItem(chave(marca)) ?? '[]')
    return Array.isArray(l) ? l.filter((m) => m && typeof m.texto === 'string').slice(-80).map((m) => ({ ...m, nova: false })) : []
  } catch { return [] }
}

const IconeClipe = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5l-7.8 7.8a5 5 0 01-7.1-7.1l8.5-8.5a3.5 3.5 0 015 5l-8.5 8.4a2 2 0 01-2.8-2.8l7.8-7.8" /></svg>
const IconeMic = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3" /></svg>
const IconeEnviar = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" /></svg>
const IconeParar = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>

export function Consultor({ sessao, marca, parceiro, aoAbrirAluno }: { sessao: SessaoTeeds; marca: string; parceiro: string; aoAbrirAluno?: (id: string) => void }) {
  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao
  const [mensagens, setMensagens] = useState<Mensagem[]>(() => ler(marca))
  const [texto, setTexto] = useState('')
  const [pendentes, setPendentes] = useState<Pendente[]>([])
  const [pensando, setPensando] = useState(false)
  const [aviso, setAviso] = useState('')
  const fim = useRef<HTMLDivElement>(null)
  const caixa = useRef<HTMLTextAreaElement>(null)
  const arquivo = useRef<HTMLInputElement>(null)
  const gravador = useGravador(() => undefined)

  useEffect(() => {
    try { localStorage.setItem(chave(marca), JSON.stringify(mensagens.slice(-80).map(({ nova: _n, ...m }) => m))) } catch { /* só não lembra neste aparelho */ }
  }, [mensagens, marca])
  const descer = () => fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  useEffect(() => { descer() }, [mensagens.length, pensando])
  useEffect(() => () => { pendentes.forEach((p) => p.previa && URL.revokeObjectURL(p.previa)) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function enviar(pergunta: string, extras: AnexoDoConsultor[] = [], rotulos: Mensagem['anexos'] = []) {
    const limpa = pergunta.trim()
    if (pensando || (!limpa && !extras.length && !pendentes.length)) return
    setAviso('')
    const anexos: AnexoDoConsultor[] = [...extras]
    const mostra: NonNullable<Mensagem['anexos']> = [...(rotulos ?? [])]
    try {
      for (const p of pendentes) {
        anexos.push({ mime: p.mime, dados: await paraBase64(p.blob), nome: p.nome })
        mostra.push({ tipo: p.tipo, nome: p.nome })
      }
    } catch { setAviso('Não consegui ler um dos arquivos. Tente anexar de novo.'); return }
    const historico = mensagens.filter((m) => !m.erro && m.texto).slice(-16).map((m) => ({ de: m.de, texto: m.texto }))
    setMensagens((l) => [...l, { id: id(), de: 'eu', texto: limpa, anexos: mostra.length ? mostra : undefined }])
    setTexto(''); setPendentes([]); setPensando(true)
    try {
      const r = await perguntarAoConsultor(sessaoRef.current, marca, parceiro, limpa, historico, anexos)
      setMensagens((l) => [...l, { id: id(), de: 'ia', texto: r.resposta, nova: true, alunos: r.alunos_citados }])
    } catch (e) {
      setMensagens((l) => [...l, { id: id(), de: 'ia', texto: e instanceof ErroDoConsultor ? e.message : 'Não consegui falar com a I.A. agora. Confira a internet e tente de novo.', erro: true }])
    } finally { setPensando(false); requestAnimationFrame(() => caixa.current?.focus()) }
  }

  async function escolher(e: ChangeEvent<HTMLInputElement>) {
    const lista = [...(e.target.files ?? [])]
    e.target.value = ''
    const novos: Pendente[] = []
    for (const f of lista.slice(0, 6)) {
      try {
        if (f.type.startsWith('image/')) {
          const jpg = await imagemPronta(f)
          novos.push({ id: id(), tipo: 'imagem', nome: f.name, mime: 'image/jpeg', blob: jpg, previa: URL.createObjectURL(jpg) })
        } else if (f.type.startsWith('video/')) novos.push({ id: id(), tipo: 'video', nome: f.name, mime: f.type, blob: f })
        else if (f.type.startsWith('audio/')) novos.push({ id: id(), tipo: 'arquivo', nome: f.name, mime: f.type, blob: f })
        else if (f.type === 'application/pdf' || f.type.startsWith('text/') || /\.(csv|txt|md)$/i.test(f.name)) novos.push({ id: id(), tipo: 'arquivo', nome: f.name, mime: f.type || 'text/plain', blob: f })
        else setAviso('Esse tipo de arquivo eu ainda não leio. Mande foto, vídeo, áudio, PDF ou texto.')
      } catch { setAviso('Não consegui abrir esse arquivo.') }
    }
    const todos = [...pendentes, ...novos]
    if (todos.reduce((t, p) => t + p.blob.size, 0) > TETO) { setAviso('Os anexos passam de 9 MB juntos. Mande um arquivo menor ou um trecho do vídeo.'); novos.forEach((p) => p.previa && URL.revokeObjectURL(p.previa)); return }
    setPendentes(todos)
  }

  async function microfone() {
    if (!gravador.gravando) { setAviso(''); try { await gravador.comecar() } catch { setAviso('Não consegui usar o microfone. Libere o microfone para a plataforma nas configurações do aparelho.') } return }
    const g = await gravador.terminar()
    if (!g) { setAviso('O áudio ficou curto demais. Segure um pouco mais.'); return }
    void enviar(texto, [{ mime: g.mime, dados: await paraBase64(g.blob), nome: 'audio' }], [{ tipo: 'audio', nome: 'Áudio', segundos: g.duracao }])
  }

  const tecla = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && matchMedia('(pointer: fine)').matches) { e.preventDefault(); void enviar(texto) }
  }
  const limpar = () => { if (mensagens.length && confirm('Apagar esta conversa deste aparelho?')) setMensagens([]) }
  const vazio = !mensagens.length

  return (
    <section className={`psi-c${vazio ? ' vazio' : ''}`} aria-label="GF Brain">
      {vazio ? (
        <div className="psi-c-abre">
          <span className="psi-c-orbe" aria-hidden="true" />
          <span className="psi-rot">GF Brain</span>
          <h2>Pergunte qualquer coisa sobre o seu negócio.</h2>
          <p>Eu leio os dados da plataforma (alunos, aulas, depósitos, saques, operações, markup, acessos, lives) e consulto o banco quando preciso. Pode escrever, falar ou mandar um arquivo.</p>
          <div className="psi-c-sugestoes">
            {SUGESTOES.map((s) => <button type="button" key={s} onClick={() => void enviar(s)}>{s}</button>)}
          </div>
        </div>
      ) : (
        <div className="psi-c-conversa" role="log" aria-live="polite">
          <div className="psi-c-topo"><span>GF Brain · responde com os dados de agora</span><button type="button" onClick={limpar}>Nova conversa</button></div>
          {mensagens.map((m) => (
            <article key={m.id} className={`psi-c-msg ${m.de}${m.erro ? ' erro' : ''}`}>
              {m.de === 'ia' && <span className="psi-c-orbe p" aria-hidden="true" />}
              <div className="psi-c-balao">
                {m.anexos?.map((a, i) => <span className="psi-c-anexo" key={`${a.nome}${i}`}>{a.tipo === 'audio' ? `Áudio · ${relogio(a.segundos ?? 0)}` : a.nome}</span>)}
                {m.de === 'ia' ? <RespostaFormatada texto={m.texto} animar={!!m.nova} aoCrescer={descer} /> : m.texto ? <p>{m.texto}</p> : null}
                {m.de === 'ia' && !m.erro && !!m.alunos?.length && aoAbrirAluno && (
                  <div className="psi-c-acoes">{m.alunos.slice(0, 6).map((u, i) => <button type="button" key={u} onClick={() => aoAbrirAluno(u)}>Abrir a linha do tempo {m.alunos!.length > 1 ? i + 1 : ''}</button>)}</div>
                )}
              </div>
            </article>
          ))}
          {pensando && <article className="psi-c-msg ia"><span className="psi-c-orbe p vivo" aria-hidden="true" /><div className="psi-c-balao pensando"><i /><i /><i /><span>Consultando os dados…</span></div></article>}
          <div ref={fim} />
        </div>
      )}

      <div className="psi-c-barra">
        {aviso && <p className="psi-c-aviso" role="alert">{aviso}</p>}
        {!!pendentes.length && (
          <div className="psi-c-pendentes">
            {pendentes.map((p) => (
              <span key={p.id} className="psi-c-pend">{p.previa ? <img src={p.previa} alt="" /> : null}<b>{p.nome}</b>
                <button type="button" aria-label={`Tirar ${p.nome}`} onClick={() => { if (p.previa) URL.revokeObjectURL(p.previa); setPendentes((l) => l.filter((x) => x.id !== p.id)) }}>×</button></span>
            ))}
          </div>
        )}
        <div className={`psi-c-caixa${gravador.gravando ? ' gravando' : ''}`}>
          <input ref={arquivo} type="file" hidden multiple accept="image/*,video/*,audio/*,application/pdf,text/plain,text/csv,.csv,.txt,.md" onChange={(e) => void escolher(e)} />
          <button type="button" className="psi-c-b" aria-label="Anexar foto, vídeo ou arquivo" disabled={pensando || gravador.gravando} onClick={() => arquivo.current?.click()}><IconeClipe /></button>
          {gravador.gravando ? (
            <div className="psi-c-onda" aria-live="polite"><span>{relogio(gravador.segundos)}</span><div>{gravador.niveis.slice(-36).map((n, i) => <i key={i} style={{ height: `${Math.max(12, Math.min(100, n * 100))}%` }} />)}</div>
              <button type="button" className="psi-c-cancelar" onClick={() => gravador.cancelar()}>Cancelar</button></div>
          ) : (
            <textarea ref={caixa} value={texto} rows={1} placeholder="Pergunte sobre alunos, depósitos, aulas, lives…" aria-label="Sua pergunta" onChange={(e) => setTexto(e.target.value)} onKeyDown={tecla} disabled={pensando} />
          )}
          {gravador.suportado && (!texto.trim() && !pendentes.length || gravador.gravando) ? (
            <button type="button" className={`psi-c-b mic${gravador.gravando ? ' ativo' : ''}`} aria-label={gravador.gravando ? 'Parar e enviar o áudio' : 'Gravar áudio'} disabled={pensando} onClick={() => void microfone()}>{gravador.gravando ? <IconeParar /> : <IconeMic />}</button>
          ) : (
            <button type="button" className="psi-c-b enviar" aria-label="Enviar" disabled={pensando || (!texto.trim() && !pendentes.length)} onClick={() => void enviar(texto)}><IconeEnviar /></button>
          )}
        </div>
        <small className="psi-c-pe">Os nomes dos alunos não saem da plataforma: a I.A. recebe só códigos. Confira os números importantes no painel.</small>
      </div>
    </section>
  )
}
