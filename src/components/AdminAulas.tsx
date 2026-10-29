import { useEffect, useRef, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { MODULOS, playerDoVideo, todasAsAulas, type AulaNumerada } from '../core/teeds/aulas'
import {
  apagarArquivo, apagarMaterial, controleDasAulas, duracaoDoArquivo, duracaoLegivel, ehArquivoNosso, enviarArquivoDaAula, enviarMaterial,
  fracaoAssistida, LIMITE_MATERIAL_MB, listarVideosDasAulas, removerVideoDaAula, salvarVideoDaAula, tamanhoLegivel, type AssistiuAula, type VideoDaAula,
} from '../core/teeds/aulasVideos'
import type { LinkDaAula, Material } from '../core/teeds/aulas'
import { MARCA } from '../marca'
import { DEMONSTRACAO_EM_AULA_SEM_VIDEO } from '../core/teeds/modulosAulas'
import { IconeFechar } from './IconeFechar'
import { Icone } from './Icone'

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
/** O que o aluno vê numa aula sem vídeo próprio — a mesma regra de todasAsAulas (aulas.ts). */
const SEM_VIDEO = DEMONSTRACAO_EM_AULA_SEM_VIDEO ? 'a aula abre com o vídeo demonstrativo' : 'a aula aparece como “em breve”'
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

interface Form {
  video: string
  duracao: string
  titulo: string
  descricao: string
  publicado: boolean
  /** O caminho do arquivo no bucket, se o vídeo atual (ou o recém-enviado) veio de upload. */
  arquivo: string | null
  materiais: Material[]
  links: LinkDaAula[]
}

/** `marca`: a plataforma em foco no painel (o seletor do master), não a do site aberto. */
export function AdminAulas({ sessao, marca = MARCA.id }: { sessao: SessaoTeeds; marca?: string }) {
  const [videos, setVideos] = useState<Record<string, VideoDaAula>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [aberta, setAberta] = useState<AulaNumerada | null>(null)
  const [form, setForm] = useState<Form>({ video: '', duracao: '', titulo: '', descricao: '', publicado: true, arquivo: null, materiais: [], links: [] })
  const [salvando, setSalvando] = useState(false)
  const [envio, setEnvio] = useState<{ nome: string; fracao: number; cancelar: () => void } | null>(null)
  const [arquivoAntigo, setArquivoAntigo] = useState<string | null>(null)
  const entradaArquivo = useRef<HTMLInputElement>(null)
  const entradaMaterial = useRef<HTMLInputElement>(null)
  const [enviandoMaterial, setEnviandoMaterial] = useState(false)
  /** Os materiais que estavam salvos ao abrir: o que sair da lista é apagado do bucket ao salvar. */
  const [materiaisAntigos, setMateriaisAntigos] = useState<Material[]>([])
  // quem assistiu cada aula (aulas_progresso), para o controle do admin
  const [controle, setControle] = useState<AssistiuAula[]>([])
  const [abaModal, setAbaModal] = useState<'conteudo' | 'alunos'>('conteudo')
  const [busca, setBusca] = useState('')

  const catalogo = todasAsAulas()
  const carregar = async () => {
    setCarregando(true)
    try {
      setVideos(await listarVideosDasAulas(sessao, marca))
      setControle(await controleDasAulas(sessao, marca).catch(() => []))
    }
    catch (e) { setErro((e as Error).message) }
    finally { setCarregando(false) }
  }
  useEffect(() => { void carregar() }, [sessao.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const publicadas = catalogo.filter((a) => videos[a.id]?.publicado && videos[a.id]?.video).length

  const abrir = (a: AulaNumerada) => {
    const v = videos[a.id]
    setAberta(a); setErro(null); setSucesso(null); setEnvio(null)
    setArquivoAntigo(v?.arquivo ?? null)
    setForm({ video: v?.video ?? '', duracao: v?.duracao ?? '', titulo: v?.titulo ?? '', descricao: v?.descricao ?? '', publicado: v?.publicado ?? true, arquivo: v?.arquivo ?? null, materiais: v?.materiais ?? [], links: v?.links ?? [] })
    setMateriaisAntigos(v?.materiais ?? []); setAbaModal('conteudo')
  }
  const fechar = () => { if (envio) envio.cancelar(); setAberta(null); setEnvio(null) }

  const escolherArquivo = async (arquivo: File | undefined) => {
    if (!arquivo || !aberta) return
    if (!/^video\//.test(arquivo.type)) { setErro('Escolha um arquivo de vídeo (MP4 é o mais seguro para todos os navegadores).'); return }
    if (arquivo.size > LIMITE_MB * 1024 * 1024) { setErro(`O arquivo tem ${(arquivo.size / 1048576).toFixed(0)} MB; o limite é ${LIMITE_MB} MB. Exporte com bitrate menor ou cole um link.`); return }
    setErro(null); setSucesso(null)
    const segundos = await duracaoDoArquivo(arquivo)
    const { promessa, cancelar } = enviarArquivoDaAula(sessao, aberta.id, arquivo, (f) => setEnvio((e) => e ? { ...e, fracao: f } : e), marca)
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
    if (!form.video.trim() && !form.materiais.length && !form.links.length) { setErro('Envie o vídeo, um material ou um link antes de salvar.'); return }
    const links = form.links.map((l) => ({ nome: l.nome.trim(), url: l.url.trim() })).filter((l) => l.nome || l.url)
    if (links.some((l) => !l.nome || !/^https?:\/\//i.test(l.url))) { setErro('Cada link precisa de um nome e de um endereço começando com https://'); return }
    setSalvando(true); setErro(null)
    try {
      // Se o vídeo agora é um link (ou outro arquivo), o arquivo enviado antes vira lixo no bucket.
      const arquivoAtual = ehArquivoNosso(form.video) ? form.arquivo : null
      await salvarVideoDaAula(sessao, { aulaId: aberta.id, video: form.video, duracao: form.duracao, titulo: form.titulo, descricao: form.descricao, publicado: form.publicado, arquivo: arquivoAtual, materiais: form.materiais, links }, marca)
      // material tirado da lista: o arquivo sai do bucket
      for (const m of materiaisAntigos) if (m.arquivo && !form.materiais.some((x) => x.arquivo === m.arquivo)) await apagarMaterial(sessao, m.arquivo).catch(() => undefined)
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
    // Remover apaga a linha inteira da aula: vídeo, título, descrição, links e os arquivos dos materiais.
    if (!window.confirm(`Remover o vídeo de "${aberta.titulo}"? Também apaga os materiais, os links e o título e a descrição personalizados desta aula, e ${SEM_VIDEO}. Não dá para desfazer.`)) return
    setSalvando(true); setErro(null)
    try {
      await removerVideoDaAula(sessao, aberta.id, arquivoAntigo, marca)
      for (const m of materiaisAntigos) if (m.arquivo) await apagarMaterial(sessao, m.arquivo).catch(() => undefined)
      setAberta(null); setSucesso('Vídeo removido.'); await carregar()
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }

  const previa = playerDoVideo(form.video)

  const adicionarMaterial = async (arquivo: File | undefined) => {
    if (!arquivo || !aberta) return
    if (arquivo.size > LIMITE_MATERIAL_MB * 1048576) { setErro(`O arquivo tem ${(arquivo.size / 1048576).toFixed(0)} MB; o limite de cada material é ${LIMITE_MATERIAL_MB} MB.`); return }
    setErro(null); setEnviandoMaterial(true)
    try {
      const m = await enviarMaterial(sessao, aberta.id, arquivo, marca)
      setForm((f) => ({ ...f, materiais: [...f.materiais, m] }))
      setSucesso('Material enviado. Ajuste o nome do botão, se quiser, e clique em Salvar.')
    } catch (e) { setErro((e as Error).message) } finally {
      setEnviandoMaterial(false)
      if (entradaMaterial.current) entradaMaterial.current.value = ''
    }
  }

  /* quem assistiu: por aula e na busca por aluno */
  const pct = (f: number) => `${Math.round(f * 100)}%`
  const daAula = (id: string) => controle.filter((c) => c.aulaId === id)
  const resumoDaAula = (id: string) => { const l = daAula(id); return { alunos: l.length, concluiram: l.filter((c) => c.concluida).length } }
  const tituloDaAula = (id: string) => catalogo.find((a) => a.id === id)?.titulo ?? id
  const termo = busca.trim().toLowerCase()
  const achados = termo.length >= 2 ? controle.filter((c) => c.nome.toLowerCase().includes(termo) || c.email.toLowerCase().includes(termo)) : []
  const linhaAluno = (c: AssistiuAula, mostrarAula: boolean) => (
    <tr key={`${c.userId}-${c.aulaId}`}>
      <td>{mostrarAula ? <><b>{tituloDaAula(c.aulaId)}</b><small>{c.nome}</small></> : <><b>{c.nome}</b><small>{c.email}</small></>}</td>
      <td>{c.plano || '—'}</td>
      <td className="num">{c.aberturas}×</td>
      <td className="num"><span className="adm-barra-assistida"><i style={{ width: pct(fracaoAssistida(c)) }} /></span>{c.duracaoSeg ? pct(fracaoAssistida(c)) : '—'}<small>{duracaoLegivel(c.segundos)}{c.duracaoSeg ? ` de ${duracaoLegivel(c.duracaoSeg)}` : ''}</small></td>
      <td className="num">{pct(c.posicaoMax)}</td>
      <td>{c.concluida ? <em className="adm-status ativo">Concluiu</em> : <em className="adm-status suspenso">Não concluiu</em>}</td>
      <td className="num">{quando(c.ultimaVez)}</td>
    </tr>
  )
  const cabecalhoAlunos = (primeira: string) => (
    <thead><tr><th>{primeira}</th><th>Plano</th><th>Abriu</th><th>Assistiu de fato</th><th>Chegou até</th><th>Situação</th><th>Última vez</th></tr></thead>
  )

  return (
    <div className="admin-aulas">
      {erro && !aberta && <div className="ger-erro">{erro}<button onClick={() => setErro(null)}><IconeFechar /></button></div>}
      {sucesso && !aberta && <div className="admin-sucesso"><span><Icone nome="certo" />{sucesso}</span><button onClick={() => setSucesso(null)}><IconeFechar /></button></div>}

      <div className="adm-kpis">
        <article><span>Aulas no catálogo</span><strong>{catalogo.length}</strong><small>{MODULOS.length} módulos</small></article>
        <article className="ok"><span>Com vídeo publicado</span><strong>{publicadas}</strong><small>{catalogo.length - publicadas} ainda em demonstração</small></article>
        <article><span>Alunos que assistiram</span><strong>{new Set(controle.map((c) => c.userId)).size}</strong><small>{controle.filter((c) => c.concluida).length} aulas concluídas no total</small></article>
      </div>

      <section className="admin-card full admin-aulas-busca">
        <header><div><span className="rot">Quem assistiu</span><h3>Procure um aluno</h3></div><small>Segundos assistidos contam só com o vídeo tocando: avançar o vídeo não conta.</small></header>
        <input value={busca} placeholder="Nome ou e-mail do aluno" onChange={(e) => setBusca(e.target.value)} />
        {termo.length >= 2 && (achados.length
          ? <div className="adm-tabela-aulas"><table>{cabecalhoAlunos('Aula')}<tbody>{achados.map((c) => linhaAluno(c, true))}</tbody></table></div>
          : <p className="adm-vazio">Ninguém com esse nome ou e-mail abriu uma aula ainda.</p>)}
      </section>

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
                    <small>{status === 'demo' ? `Sem vídeo próprio: ${SEM_VIDEO}.` : `${origem(v!.video)} · ${v!.duracao || 'duração não informada'} · atualizado em ${quando(v!.atualizadoEm)}`}</small>
                  </span>
                  <span className="adm-aula-chips">
                    {(() => { const r = resumoDaAula(a.id); return r.alunos ? <em className="adm-aula-alunos">{r.alunos} {r.alunos === 1 ? 'aluno' : 'alunos'} · {r.concluiram} concluíram</em> : null })()}
                    {(v?.materiais.length ?? 0) > 0 && <em className="adm-aula-alunos">{v!.materiais.length} {v!.materiais.length === 1 ? 'material' : 'materiais'}</em>}
                    <em className={`adm-status ${status === 'publicada' ? 'ativo' : status === 'oculta' ? 'suspenso' : 'expirado'}`}>{status === 'publicada' ? 'Publicada' : status === 'oculta' ? 'Não publicada' : 'Demonstração'}</em>
                  </span>
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
            {sucesso && <div className="admin-sucesso"><span><Icone nome="certo" />{sucesso}</span><button onClick={() => setSucesso(null)}><IconeFechar /></button></div>}

            <div className="adm-abas-modal" role="tablist">
              <button role="tab" aria-selected={abaModal === 'conteudo'} className={abaModal === 'conteudo' ? 'on' : ''} onClick={() => setAbaModal('conteudo')}>Vídeo e materiais</button>
              <button role="tab" aria-selected={abaModal === 'alunos'} className={abaModal === 'alunos' ? 'on' : ''} onClick={() => setAbaModal('alunos')}>Quem assistiu <b>{daAula(aberta.id).length}</b></button>
            </div>

            {abaModal === 'alunos' ? (
              daAula(aberta.id).length
                ? <div className="adm-tabela-aulas"><table>{cabecalhoAlunos('Aluno')}<tbody>{daAula(aberta.id).map((c) => linhaAluno(c, false))}</tbody></table></div>
                : <p className="adm-vazio">Ninguém abriu esta aula ainda.</p>
            ) : (
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

              <div className="admin-aula-materiais">
                <span className="rot">Materiais para baixar</span>
                {form.materiais.map((m, i) => (
                  <div key={m.url} className="admin-aula-material">
                    <i>{(m.tipo || 'ARQ').slice(0, 4)}</i>
                    <input value={m.nome} aria-label="Nome do botão" onChange={(e) => setForm((f) => ({ ...f, materiais: f.materiais.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)) }))} />
                    <small>{tamanhoLegivel(m.tamanho)}</small>
                    <button type="button" onClick={() => setForm((f) => ({ ...f, materiais: f.materiais.filter((_, j) => j !== i) }))} aria-label={`Tirar ${m.nome}`}><IconeFechar /></button>
                  </div>
                ))}
                <input ref={entradaMaterial} type="file" hidden accept=".pdf,.epub,.zip,.xlsx,.xls,.csv,.docx,.doc,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.txt"
                  onChange={(e) => void adicionarMaterial(e.target.files?.[0])} />
                <button type="button" className="admin-secundario" disabled={enviandoMaterial} onClick={() => entradaMaterial.current?.click()}>{enviandoMaterial ? 'Enviando…' : '+ Adicionar arquivo'}</button>
                <small>PDF, e-book, planilha, documento, apresentação, imagem ou ZIP, até {LIMITE_MATERIAL_MB} MB cada. O nome aqui é o que aparece no botão para o aluno.</small>
              </div>

              <div className="admin-aula-materiais">
                <span className="rot">Links relacionados</span>
                <small>Abrir conta, depositar e a comunidade já aparecem em todas as aulas. Aqui entram os links extras desta aula.</small>
                {form.links.map((l, i) => (
                  <div key={i} className="admin-aula-material admin-aula-link">
                    <input value={l.nome} placeholder="Nome do botão" aria-label="Nome do botão" onChange={(e) => setForm((f) => ({ ...f, links: f.links.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)) }))} />
                    <input value={l.url} placeholder="https://…" aria-label="Endereço" onChange={(e) => setForm((f) => ({ ...f, links: f.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) }))} />
                    <button type="button" onClick={() => setForm((f) => ({ ...f, links: f.links.filter((_, j) => j !== i) }))} aria-label="Tirar o link"><IconeFechar /></button>
                  </div>
                ))}
                <button type="button" className="admin-secundario" onClick={() => setForm((f) => ({ ...f, links: [...f.links, { nome: '', url: '' }] }))}>+ Adicionar link</button>
              </div>
            </div>
            )}

            <footer>
              {videos[aberta.id] ? <button type="button" className="adm-cancelar" onClick={() => void remover()} disabled={salvando || !!envio}>Remover vídeo e materiais</button> : <span>Sem vídeo próprio, {SEM_VIDEO}.</span>}
              <button onClick={() => void salvar()} disabled={salvando || !!envio || enviandoMaterial}>{salvando ? 'Salvando…' : form.publicado ? 'Salvar e publicar' : 'Salvar sem publicar'}</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
