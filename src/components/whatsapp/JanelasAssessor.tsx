import { useEffect, useMemo, useRef, useState } from 'react'
import { nomeDoContato, telefoneBonito, type ContatoWpp, type MensagemWpp, type WhatsAppApi } from '../../core/teeds/whatsapp'
import { Janela } from './JanelasWpp'

/*
  As janelas do chat do Assessor que vêm da Z-API (25/11/2026, Tiago: "encaminhar… postar status… tudo que tiver"):
  encaminhar uma mensagem para até 5 conversas, editar um texto que saiu pelo Assessor e publicar um status.
*/

/** Encaminhar: escolhe até 5 conversas (as que já existem; para alguém novo, comece a conversa antes). */
export function JanelaEncaminhar({ api, origem, mensagem, contatos, onFechar, onFeito }: {
  api: WhatsAppApi; origem: ContatoWpp; mensagem: MensagemWpp; contatos: ContatoWpp[]; onFechar: () => void; onFeito: (n: number) => void
}) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string[]>([])
  const [indo, setIndo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase(), d = t.replace(/\D/g, '')
    return contatos.filter((c) => c.id !== origem.id && (!t || nomeDoContato(c).toLowerCase().includes(t) || (d.length >= 3 && c.waId.includes(d)))).slice(0, 60)
  }, [contatos, q, origem.id])
  const alternar = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 5 ? s : [...s, id]))
  async function enviar() {
    if (!api.encaminhar || !sel.length) return
    setIndo(true); setErro(null)
    try { onFeito(await api.encaminhar(origem.id, mensagem, sel)) } catch (e) { setErro((e as Error).message) } finally { setIndo(false) }
  }
  const previa = mensagem.texto?.slice(0, 140) || ({ imagem: '📷 Foto', audio: '🎤 Áudio', video: '🎥 Vídeo', documento: '📄 Documento', figurinha: 'Figurinha' } as Record<string, string>)[mensagem.tipo] || 'Mensagem'
  return <Janela titulo="Encaminhar mensagem" subtitulo="Até 5 conversas. A mensagem chega marcada como encaminhada." onFechar={onFechar}>
    <div className="wza-previa"><span>Encaminhando</span><p>{previa}</p></div>
    <label className="wz-busca wza-busca"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar conversa por nome ou número" aria-label="Procurar conversa" /></label>
    <ul className="wza-lista" role="listbox" aria-multiselectable="true">
      {lista.map((c) => <li key={c.id}><button role="option" aria-selected={sel.includes(c.id)} className={sel.includes(c.id) ? 'on' : ''} onClick={() => alternar(c.id)}>
        <i className="wza-marca" aria-hidden>{sel.includes(c.id) ? '✓' : ''}</i>
        <span><b>{nomeDoContato(c)}</b><small>{telefoneBonito(c.waId)}</small></span>
      </button></li>)}
      {!lista.length && <li className="wza-vazio">Nenhuma conversa com esse nome. Para alguém novo, comece a conversa antes.</li>}
    </ul>
    {erro && <p className="wz-erro" role="alert">{erro}</p>}
    <div className="wza-acoes"><small>{sel.length ? `${sel.length} selecionada${sel.length > 1 ? 's' : ''}` : 'Escolha para quem'}</small><button className="wz-btn verde" disabled={!sel.length || indo} onClick={() => void enviar()}>{indo ? 'Encaminhando…' : 'Encaminhar'}</button></div>
  </Janela>
}

/** Editar o texto de uma mensagem que saiu pelo Assessor (o cliente vê "editada"). */
export function JanelaEditar({ api, contato, mensagem, onFechar, onFeito }: { api: WhatsAppApi; contato: ContatoWpp; mensagem: MensagemWpp; onFechar: () => void; onFeito: (texto: string) => void }) {
  const [texto, setTexto] = useState(mensagem.texto ?? '')
  const [indo, setIndo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const el = campo.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } }, [])
  async function salvar() {
    const t = texto.trim()
    if (!t || t === mensagem.texto || !api.editar) return
    setIndo(true); setErro(null)
    try { await api.editar(contato.id, mensagem, t); onFeito(t) } catch (e) { setErro((e as Error).message) } finally { setIndo(false) }
  }
  return <Janela titulo="Editar mensagem" subtitulo="O WhatsApp troca o texto no celular do cliente e mostra que foi editada (até uns 15 minutos depois de enviar)." onFechar={onFechar}>
    <textarea ref={campo} className="wza-texto" rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void salvar() }} />
    {erro && <p className="wz-erro" role="alert">{erro}</p>}
    <div className="wza-acoes"><small>⌘/Ctrl + Enter salva</small><button className="wz-btn verde" disabled={indo || !texto.trim() || texto.trim() === mensagem.texto} onClick={() => void salvar()}>{indo ? 'Salvando…' : 'Salvar'}</button></div>
  </Janela>
}

const FUNDOS = ['#0B5D4B', '#1F3A68', '#6B2D5C', '#8A5A14', '#2B2B2E']

/** Publicar um status (story) no WhatsApp do Assessor: texto, foto ou vídeo (até 1,4 MB). */
export function JanelaStatus({ api, onFechar, onFeito }: { api: WhatsAppApi; onFechar: () => void; onFeito: () => void }) {
  const [tipo, setTipo] = useState<'texto' | 'imagem' | 'video'>('texto')
  const [texto, setTexto] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<string | null>(null)
  const [indo, setIndo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [fundo] = useState(() => FUNDOS[Math.floor(Math.random() * FUNDOS.length)])
  const seletor = useRef<HTMLInputElement>(null)
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa) }, [previa])
  function escolher(f: File | undefined) {
    if (!f) return
    const ok = tipo === 'imagem' ? f.type.startsWith('image/') : f.type.startsWith('video/')
    if (!ok) { setErro(tipo === 'imagem' ? 'Escolha uma foto.' : 'Escolha um vídeo.'); return }
    if (f.size > 1_400_000) { setErro('O arquivo passou de 1,4 MB. Escolha um menor.'); return }
    setErro(null); setArquivo(f); setPrevia(URL.createObjectURL(f))
  }
  async function publicar() {
    if (!api.postarStatus) return
    setIndo(true); setErro(null)
    try { await api.postarStatus({ tipo, texto, arquivo }); onFeito() } catch (e) { setErro((e as Error).message) } finally { setIndo(false) }
  }
  const pronto = tipo === 'texto' ? !!texto.trim() : !!arquivo
  return <Janela titulo="Postar status" subtitulo="Aparece por 24 horas para quem tem o número do Assessor salvo." onFechar={onFechar}>
    <div className="wza-abas" role="tablist">{([['texto', 'Texto'], ['imagem', 'Foto'], ['video', 'Vídeo']] as const).map(([id, nome]) =>
      <button key={id} role="tab" aria-selected={tipo === id} className={tipo === id ? 'on' : ''} onClick={() => { setTipo(id); setArquivo(null); setPrevia(null); setErro(null) }}>{nome}</button>)}</div>
    <div className="wza-celular">
      {tipo === 'texto'
        ? <div className="wza-status-texto" style={{ background: fundo }}><textarea autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite o status" maxLength={700} /></div>
        : previa
          ? (tipo === 'imagem' ? <img src={previa} alt="Prévia do status" /> : <video src={previa} controls muted />)
          : <button className="wza-escolher" onClick={() => seletor.current?.click()}>{tipo === 'imagem' ? 'Escolher foto' : 'Escolher vídeo'}<small>até 1,4 MB</small></button>}
      <input ref={seletor} type="file" hidden accept={tipo === 'imagem' ? 'image/*' : 'video/*'} onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = '' }} />
    </div>
    {tipo !== 'texto' && <input className="wza-legenda" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Legenda (opcional)" maxLength={700} />}
    {tipo !== 'texto' && previa && <button className="wz-btn" onClick={() => seletor.current?.click()}>Trocar {tipo === 'imagem' ? 'a foto' : 'o vídeo'}</button>}
    {erro && <p className="wz-erro" role="alert">{erro}</p>}
    <div className="wza-acoes"><small>O WhatsApp não deixa listar nem apagar status por aqui.</small><button className="wz-btn verde" disabled={!pronto || indo} onClick={() => void publicar()}>{indo ? 'Publicando…' : 'Publicar'}</button></div>
  </Janela>
}
