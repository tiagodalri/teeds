import { useEffect, useRef, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { MODULOS, playerDoVideo, todasAsAulas, type AulaNumerada } from '../core/teeds/aulas'
import {
  apagarArquivo, duracaoDoArquivo, duracaoLegivel, ehArquivoNosso, enviarArquivoDaAula, listarVideosDasAulas,
  removerVideoDaAula, salvarVideoDaAula, type VideoDaAula,
} from '../core/teeds/aulasVideos'
import { MARCA } from '../marca'
import { IconeFechar } from './IconeFechar'

/**
 * A aba "Aulas" do painel: cada aula do catálogo com o vídeo que a marca
 * publicou — ou sem nenhum. O admin cola um link (YouTube, Vimeo, .mp4)
 * ou envia o arquivo daqui mesmo, vê a barra andar, confere a duração e
 * publica. Nada disso exige republicar o site.
 */

const LIMITE_MB = 1024
const origem = (v: string) => {
  const p = playerDoVideo(v)
  if (!p) return 'sem vídeo'
  if (ehArquivoNosso(v)) return 'arquivo enviado'
  return p.tipo === 'youtube' ? (/youtu/.test(v) ? 'YouTube' : 'link') : p.tipo === 'vimeo' ? 'Vimeo' : 'arquivo externo'
}
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

interface Form {
  video: string
  duracao: string
  titulo: string
  descricao: string
  publicado: boolean
  /** O caminho do arquivo no bucket, se o vídeo atual (ou o recém-enviado) veio de upload. */
  arquivo: string | null
}

export function AdminAulas({ sessao }: { sessao: SessaoTeeds }) {
  const [videos, setVideos] = useState<Record<string, VideoDaAula>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [aberta, setAberta] = useState<AulaNumerada | null>(null)
  const [form, setForm] = useState<Form>({ video: '', duracao: '', titulo: '', descricao: '', publicado: true, arquivo: null })
  const [salvando, setSalvando] = useState(false)
  const [envio, setEnvio] = useState<{ nome: string; fracao: number; cancelar: () => void } | null>(null)
  const [arquivoAntigo, setArquivoAntigo] = useState<string | null>(null)
  const entradaArquivo = useRef<HTMLInputElement>(null)

  const catalogo = todasAsAulas()
  const carregar = async () => {
    setCarregando(true)
    try { setVideos(await listarVideosDasAulas(sessao)) }
    catch (e) { setErro((e as Error).message) }
    finally { setCarregando(false) }
  }
  useEffect(() => { void carregar() }, [sessao.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const publicadas = catalogo.filter((a) => videos[a.id]?.publicado && videos[a.id]?.video).length

  const abrir = (a: AulaNumerada) => {
    const v = videos[a.id]
    setAberta(a); setErro(null); setSucesso(null); setEnvio(null)
    setArquivoAntigo(v?.arquivo ?? null)
    setForm({ video: v?.video ?? '', duracao: v?.duracao ?? '', titulo: v?.titulo ?? '', descricao: v?.descricao ?? '', publicado: v?.publicado ?? true, arquivo: v?.arquivo ?? null })
  }
  const fechar = () => { if (envio) envio.cancelar(); setAberta(null); setEnvio(null) }

  const escolherArquivo = async (arquivo: File | undefined) => {
    if (!arquivo || !aberta) return
    if (!/^video\//.test(arquivo.type)) { setErro('Escolha um arquivo de vídeo (MP4 é o mais seguro para todos os navegadores).'); return }
    if (arquivo.size > LIMITE_MB * 1024 * 1024) { setErro(`O arquivo tem ${(arquivo.size / 1048576).toFixed(0)} MB; o limite é ${LIMITE_MB} MB. Exporte com bitrate menor ou cole um link.`); return }
    setErro(null); setSucesso(null)
    const segundos = await duracaoDoArquivo(arquivo)
    const { promessa, cancelar } = enviarArquivoDaAula(sessao, aberta.id, arquivo, (f) => setEnvio((e) => e ? { ...e, fracao: f } : e))
    setEnvio({ nome: arquivo.name, fracao: 0, cancelar })
    try {
      const { caminho, url } = await promessa
      setForm((f) => ({ ...f, video: url, arquivo: caminho, duracao: f.duracao || (segundos ? duracaoLegivel(segundos) : '') }))
      setSucesso('Vídeo enviado. Confira a duração e clique em Salvar para publicar.')
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnvio(null)
      if (entradaArquivo.current) entradaArquivo.current.value = ''
    }
  }

  const salvar = async () => {
    if (!aberta) return
    if (!form.video.trim()) { setErro('Cole um link ou envie o arquivo do vídeo antes de salvar.'); return }
    setSalvando(true); setErro(null)
    try {
      // Se o vídeo agora é um link (ou outro arquivo), o arquivo enviado antes vira lixo no bucket.
      const arquivoAtual = ehArquivoNosso(form.video) ? form.arquivo : null
      await salvarVideoDaAula(sessao, { aulaId: aberta.id, video: form.video, duracao: form.duracao, titulo: form.titulo, descricao: form.descricao, publicado: form.publicado, arquivo: arquivoAtual })
      if (arquivoAntigo && arquivoAntigo !== arquivoAtual) {
        await apagarArquivo(sessao, arquivoAntigo).catch(() => { /* o registro já está certo; sobra no bucket não derruba a aula */ })
      }
      setAberta(null)
      setSucesso(`"${form.titulo.trim() || aberta.titulo}" ${form.publicado ? 'publicada' : 'salva sem publicar'}.`)
      await carregar()
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }

  const remover = async () => {
    if (!aberta) return
    if (!window.confirm(`Tirar o vídeo de "${aberta.titulo}"? A aula volta a aparecer como "em breve".`)) return
    setSalvando(true); setErro(null)
    try {
      await removerVideoDaAula(sessao, aberta.id, arquivoAntigo)
      setAberta(null); setSucesso('Vídeo removido.'); await carregar()
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }

  const previa = playerDoVideo(form.video)

  return (
    <div className="admin-aulas">
      {erro && !aberta && <div className="ger-erro">{erro}<button onClick={() => setErro(null)}><IconeFechar /></button></div>}
      {sucesso && !aberta && <div className="admin-sucesso">✓ {sucesso}<button onClick={() => setSucesso(null)}><IconeFechar /></button></div>}

      <div className="adm-kpis">
        <article><span>Aulas no catálogo</span><strong>{catalogo.length}</strong><small>{MODULOS.length} módulos</small></article>
        <article className="ok"><span>Com vídeo publicado</span><strong>{publicadas}</strong><small>{catalogo.length - publicadas} ainda em demonstração</small></article>
        <article><span>Onde ficam</span><strong>{MARCA.prosa}</strong><small>cada marca tem os próprios vídeos</small></article>
      </div>

      {MODULOS.map((m, mi) => (
        <section key={m.id} className="admin-card full admin-aulas-modulo" style={{ ['--aula' as string]: m.cor }}>
          <header><div><span className="rot">Módulo {String(mi + 1).padStart(2, '0')}</span><h3>{m.titulo}</h3></div><small>{m.chamada}</small></header>
          <div className="admin-aulas-lista">
            {catalogo.filter((a) => a.modulo.id === m.id).map((a) => {
              const v = videos[a.id]
              const status = v?.video && v.publicado ? 'publicada' : v?.video ? 'oculta' : 'demo'
              return (
                <button key={a.id} className="admin-aula" onClick={() => abrir(a)} disabled={carregando}>
                  <i>{String(a.numero).padStart(2, '0')}</i>
                  <span className="admin-aula-texto">
                    <b>{v?.titulo || a.titulo}</b>
                    <small>{status === 'demo' ? 'Sem vídeo próprio — a aula abre com o vídeo demonstrativo.' : `${origem(v!.video)} · ${v!.duracao || 'duração não informada'} · atualizado em ${quando(v!.atualizadoEm)}`}</small>
                  </span>
                  <em className={`adm-status ${status === 'publicada' ? 'ativo' : status === 'oculta' ? 'suspenso' : 'expirado'}`}>{status === 'publicada' ? 'Publicada' : status === 'oculta' ? 'Não publicada' : 'Demonstração'}</em>
                  <span className="adm-seta">›</span>
                </button>
              )
            })}
          </div>
        </section>
      ))}

      {aberta && (
        <div className="adm-modal-fundo" onMouseDown={fechar}>
          <section className="adm-modal admin-aula-editor" onMouseDown={(e) => e.stopPropagation()}>
            <header>
              <div><span className="rot">Aula {aberta.numero} · {aberta.modulo.titulo}</span><h3>{aberta.titulo}</h3></div>
              <button onClick={fechar} aria-label="Fechar"><IconeFechar /></button>
            </header>

            {erro && <div className="ger-erro">{erro}<button onClick={() => setErro(null)}><IconeFechar /></button></div>}
            {sucesso && <div className="admin-sucesso">✓ {sucesso}<button onClick={() => setSucesso(null)}><IconeFechar /></button></div>}

            <div className="admin-editor-form">
              <div className="admin-aula-envio">
                <span className="rot">Arquivo do vídeo</span>
                <input ref={entradaArquivo} type="file" accept="video/mp4,video/webm,video/quicktime,video/*" hidden
                  onChange={(e) => void escolherArquivo(e.target.files?.[0])} />
                {envio ? (
                  <div className="admin-aula-progresso">
                    <div><span>Enviando {envio.nome}</span><b>{Math.round(envio.fracao * 100)}%</b></div>
                    <i><u style={{ width: `${envio.fracao * 100}%` }} /></i>
                    <button type="button" onClick={envio.cancelar}>Cancelar envio</button>
                  </div>
                ) : (
                  <div className="admin-aula-solta" onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); void escolherArquivo(e.dataTransfer.files?.[0]) }}>
                    <button type="button" className="admin-primary" onClick={() => entradaArquivo.current?.click()}>Enviar vídeo do computador</button>
                    <small>MP4 (H.264 + AAC), até {LIMITE_MB} MB. Ou arraste o arquivo aqui.</small>
                  </div>
                )}
              </div>

              <label>
                <span>Ou cole um link (YouTube, Vimeo ou .mp4)</span>
                <input value={form.video} placeholder="https://…" onChange={(e) => setForm({ ...form, video: e.target.value })} />
              </label>

              {previa && (
                <div className="admin-aula-previa">
                  {previa.tipo === 'mp4'
                    ? <video src={previa.src} controls preload="metadata" playsInline
                        onLoadedMetadata={(e) => { const d = (e.target as HTMLVideoElement).duration; if (!form.duracao && Number.isFinite(d)) setForm((f) => ({ ...f, duracao: duracaoLegivel(d) })) }} />
                    : <iframe src={previa.src} title="Prévia" allowFullScreen allow="encrypted-media; picture-in-picture" />}
                </div>
              )}

              <div className="admin-aula-duas">
                <label><span>Duração (como aparece no cartão)</span><input value={form.duracao} placeholder="Ex.: 7 min" onChange={(e) => setForm({ ...form, duracao: e.target.value })} /></label>
                <label className="admin-check admin-aula-publicar"><input type="checkbox" checked={form.publicado} onChange={(e) => setForm({ ...form, publicado: e.target.checked })} /> Publicada para os alunos</label>
              </div>
              <label><span>Título (vazio = o do catálogo)</span><input value={form.titulo} placeholder={aberta.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></label>
              <label><span>Descrição (vazio = a do catálogo)</span><textarea value={form.descricao} placeholder={aberta.descricao} rows={3} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></label>
            </div>

            <footer>
              {videos[aberta.id] ? <button type="button" className="adm-cancelar" onClick={() => void remover()} disabled={salvando || !!envio}>Remover vídeo</button> : <span>A aula fica "em breve" até ter vídeo.</span>}
              <button onClick={() => void salvar()} disabled={salvando || !!envio}>{salvando ? 'Salvando…' : form.publicado ? 'Salvar e publicar' : 'Salvar sem publicar'}</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
