/**
 * As janelas da central do WhatsApp (05/11/2026): mandar modelo aprovado, nova
 * conversa, respostas prontas e a conexão com a Meta.
 */
import { useEffect, useState, type ReactNode } from 'react'
import {
  nomeDoContato, primeiroNome, variaveisDe, trocarVariaveis, LIMITE_LEGIVEL, QUALIDADE_LEGIVEL, CATEGORIA_LEGIVEL, SITUACAO_MODELO,
  type WhatsAppApi, type EstadoWpp, type ContatoWpp, type RespostaPronta, type ModeloWpp, type Parceiro,
} from '../../core/teeds/whatsapp'
import { formatar, horaCurta, haQuanto } from './textoWpp'

/* ================================================================ modelos */
export function EscolherModelo({ api, estado, contato, modelos, onModelos, onFechar, onEnviar }: {
  api: WhatsAppApi; estado: EstadoWpp; contato: ContatoWpp; modelos: ModeloWpp[]; onModelos: (l: ModeloWpp[]) => void
  onFechar: () => void; onEnviar: (m: ModeloWpp, vars: { cabecalho: string[]; corpo: string[] }, texto: string) => void
}) {
  const ordenados = [...modelos].sort((a, b) => Number(b.situacao === 'APPROVED') - Number(a.situacao === 'APPROVED') || a.nome.localeCompare(b.nome))
  const [esc, setEsc] = useState<ModeloWpp | null>(ordenados.find((m) => m.situacao === 'APPROVED') ?? null)
  const [cab, setCab] = useState<string[]>([])
  const [corpo, setCorpo] = useState<string[]>([])
  const [atualizando, setAtualizando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const parte = (t: string) => esc?.componentes.find((c) => c.type === t)
  useEffect(() => {
    const nome = primeiroNome(contato)
    setCab(Array.from({ length: variaveisDe(parte('HEADER')?.text) }, () => ''))
    setCorpo(Array.from({ length: variaveisDe(parte('BODY')?.text) }, (_, i) => (i === 0 ? nome : '')))
  }, [esc?.nome, esc?.idioma]) // eslint-disable-line react-hooks/exhaustive-deps
  const faltando = [...cab, ...corpo].some((v) => !v.trim())
  const textoFinal = [parte('HEADER')?.text ? `*${trocarVariaveis(parte('HEADER')!.text!, cab)}*` : '', parte('BODY')?.text ? trocarVariaveis(parte('BODY')!.text!, corpo) : '', parte('FOOTER')?.text ? `_${parte('FOOTER')!.text}_` : ''].filter(Boolean).join('\n\n')

  async function atualizar() {
    setAtualizando(true); setErro(null)
    try { await api.atualizar(); onModelos(await api.modelos()) } catch (e) { setErro((e as Error).message) } finally { setAtualizando(false) }
  }

  return <Janela titulo="Mandar modelo aprovado" subtitulo={`Para ${nomeDoContato(contato)}. O modelo abre a conversa; quando o cliente responder, você escreve livremente por 24 horas.`} onFechar={onFechar} largo>
    <div className="wz-modelos">
      <div className="wz-modelos-lista">
        <div className="wz-modelos-topo"><b>Modelos</b>{estado.conectado && <button className="wz-link" onClick={() => void atualizar()} disabled={atualizando}>{atualizando ? 'Atualizando…' : 'Atualizar modelos'}</button>}</div>
        {!ordenados.length && <div className="wz-vazio-lista"><b>Nenhum modelo ainda</b><small>Crie os modelos no Gerenciador do WhatsApp (Modelos de mensagem). A Meta costuma aprovar em minutos. Depois toque em "Atualizar modelos".</small><a className="wz-link" href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noreferrer">Abrir o Gerenciador ↗</a></div>}
        {ordenados.map((m) => {
          const ok = m.situacao === 'APPROVED'
          return <button key={`${m.nome}-${m.idioma}`} className={`wz-modelo ${esc?.nome === m.nome && esc.idioma === m.idioma ? 'on' : ''}`} disabled={!ok} onClick={() => setEsc(m)}>
            <b>{m.nome.replace(/_/g, ' ')}</b>
            <span><i className={ok ? 'ok' : 'espera'}>{SITUACAO_MODELO[m.situacao ?? ''] ?? m.situacao}</i>{m.categoria && <i>{CATEGORIA_LEGIVEL[m.categoria] ?? m.categoria}</i>}<i>{m.idioma.replace('_', '-')}</i></span>
            <small>{m.componentes.find((c) => c.type === 'BODY')?.text}</small>
          </button>
        })}
      </div>
      <div className="wz-modelos-previa">
        {esc ? <>
          {(cab.length > 0 || corpo.length > 0) && <div className="wz-vars">
            {cab.map((v, i) => <label key={`c${i}`}><span>Título · {`{{${i + 1}}}`}</span><input value={v} onChange={(e) => setCab((l) => l.map((x, k) => (k === i ? e.target.value : x)))} /></label>)}
            {corpo.map((v, i) => <label key={`b${i}`}><span>{i === 0 ? 'Nome do cliente' : 'Texto'} · {`{{${i + 1}}}`}</span><input value={v} onChange={(e) => setCorpo((l) => l.map((x, k) => (k === i ? e.target.value : x)))} placeholder={i === 0 ? 'Ex.: Marcos' : 'Preencha'} /></label>)}
          </div>}
          <span className="wz-rot">Como chega no celular</span>
          <div className="wz-previa-celular"><div className="wz-balao modelo previa">
            {parte('HEADER')?.text && <p className="wz-previa-titulo">{trocarVariaveis(parte('HEADER')!.text!, cab)}</p>}
            {parte('BODY')?.text && <p>{formatar(trocarVariaveis(parte('BODY')!.text!, corpo))}</p>}
            {parte('FOOTER')?.text && <p className="wz-previa-rodape">{parte('FOOTER')!.text}</p>}
            <span className="wz-pe"><time>{horaCurta(new Date().toISOString())}</time></span>
          </div>
          {parte('BUTTONS')?.buttons?.map((b) => <span key={b.text} className="wz-previa-botao">{b.type === 'URL' ? '↗ ' : ''}{b.text}</span>)}</div>
          {esc.categoria === 'MARKETING' && <p className="wz-aviso-mini">Modelo de divulgação: a Meta cobra mais caro e só pode ir para quem aceitou receber.</p>}
          {erro && <p className="wz-compor-erro">{erro}</p>}
          <footer className="wz-janela-pe"><button className="wz-btn" onClick={onFechar}>Cancelar</button><button className="wz-btn ouro" disabled={faltando} onClick={() => onEnviar(esc, { cabecalho: cab, corpo }, textoFinal)}>{faltando ? 'Preencha os campos' : 'Enviar modelo'}</button></footer>
        </> : <div className="wz-vazio-lista"><b>Escolha um modelo aprovado</b><small>Só os aprovados pela Meta podem ser enviados.</small></div>}
      </div>
    </div>
  </Janela>
}

/* ================================================================ janelas */
export function NovaConversa({ api, onFechar, onCriada }: { api: WhatsAppApi; onFechar: () => void; onCriada: (id: string) => void }) {
  const [numero, setNumero] = useState('')
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [indo, setIndo] = useState(false)
  async function criar() {
    setIndo(true); setErro(null)
    try { onCriada(await api.novo(numero, nome)) } catch (e) { setErro((e as Error).message) } finally { setIndo(false) }
  }
  return <Janela titulo="Nova conversa" subtitulo="Para falar primeiro com alguém, o WhatsApp pede um modelo aprovado. Depois que a pessoa responder, a conversa fica livre." onFechar={onFechar}>
    <div className="wz-form">
      <label><span>WhatsApp com DDD</span><input autoFocus inputMode="tel" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="(47) 99999-8888" /></label>
      <label><span>Nome (opcional)</span><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como a pessoa se chama" /></label>
      {erro && <p className="wz-compor-erro">{erro}</p>}
    </div>
    <footer className="wz-janela-pe"><button className="wz-btn" onClick={onFechar}>Cancelar</button><button className="wz-btn ouro" disabled={numero.replace(/\D/g, '').length < 10 || indo} onClick={() => void criar()}>{indo ? 'Abrindo…' : 'Abrir conversa'}</button></footer>
  </Janela>
}

export function GerirRespostas({ api, respostas, onFechar, onMudou }: { api: WhatsAppApi; respostas: RespostaPronta[]; onFechar: () => void; onMudou: () => void }) {
  const [edit, setEdit] = useState<(Omit<RespostaPronta, 'id'> & { id?: string }) | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  async function salvar() {
    if (!edit) return
    if (!/^[a-z0-9-]{2,20}$/i.test(edit.atalho.replace(/^\//, ''))) { setErro('O atalho usa letras e números, sem espaço (ex.: live).'); return }
    if (!edit.titulo.trim() || !edit.texto.trim()) { setErro('Preencha o título e o texto.'); return }
    try { await api.salvarResposta(edit); setEdit(null); setErro(null); onMudou() } catch (e) { setErro((e as Error).message) }
  }
  return <Janela titulo="Respostas prontas" subtitulo='Na conversa, digite "/" e o atalho para colar o texto. Vale para toda a equipe.' onFechar={onFechar} largo>
    {edit ? <div className="wz-form">
      <div className="wz-form-linha"><label><span>Atalho</span><input value={edit.atalho} onChange={(e) => setEdit({ ...edit, atalho: e.target.value })} placeholder="Ex.: live" /></label>
        <label className="cresce"><span>Título</span><input value={edit.titulo} onChange={(e) => setEdit({ ...edit, titulo: e.target.value })} placeholder="Live de 09/11" /></label></div>
      <label><span>Texto</span><textarea rows={5} value={edit.texto} onChange={(e) => setEdit({ ...edit, texto: e.target.value })} /></label>
      {erro && <p className="wz-compor-erro">{erro}</p>}
      <footer className="wz-janela-pe"><button className="wz-btn" onClick={() => { setEdit(null); setErro(null) }}>Voltar</button><button className="wz-btn ouro" onClick={() => void salvar()}>Salvar</button></footer>
    </div> : <>
      <div className="wz-respostas">
        {respostas.map((r) => <article key={r.id}><div><b>/{r.atalho}</b><span>{r.titulo}</span><small>{r.texto}</small></div>
          <div className="wz-respostas-acoes"><button className="wz-link" onClick={() => setEdit(r)}>Editar</button><button className="wz-link perigo" onClick={() => { if (confirm(`Apagar a resposta /${r.atalho}?`)) void api.apagarResposta(r.id).then(onMudou) }}>Apagar</button></div></article>)}
        {!respostas.length && <div className="wz-vazio-lista"><b>Nenhuma resposta pronta</b><small>Crie as respostas que a equipe mais repete.</small></div>}
      </div>
      <footer className="wz-janela-pe"><button className="wz-btn ouro" onClick={() => setEdit({ atalho: '', titulo: '', texto: '' })}>Nova resposta</button></footer>
    </>}
  </Janela>
}

export function Conexao({ api, estado, onFechar, onMudou }: { api: WhatsAppApi; estado: EstadoWpp; onFechar: () => void; onMudou: () => void }) {
  const c = estado.conta
  const [d, setD] = useState({ phoneNumberId: c?.phoneNumberId ?? '', wabaId: c?.wabaId ?? '', appId: c?.appId ?? '', token: '', appSecret: '', parceiro: c?.parceiro ?? estado.dono ?? 'n' })
  const [parceiros, setParceiros] = useState<Parceiro[]>([])
  const [indo, setIndo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [trocar, setTrocar] = useState(!estado.conectado)
  useEffect(() => { if (estado.podeConectar === 'geral') void api.parceiros().then(setParceiros) }, [api, estado.podeConectar])
  const copiar = (t: string, qual: string) => { void navigator.clipboard?.writeText(t); setCopiado(qual); setTimeout(() => setCopiado(null), 1800) }
  const completo = /^\d{8,}$/.test(d.phoneNumberId) && /^\d{8,}$/.test(d.wabaId) && d.token.trim().length >= 50 && /^[a-f0-9]{24,64}$/i.test(d.appSecret.trim())

  async function conectar() {
    setIndo(true); setErro(null); setOk(null)
    try {
      const r = await api.conectar({ ...d, parceiro: estado.podeConectar === 'geral' ? d.parceiro || null : null })
      setOk(`Conectado: ${r.nome ?? ''} ${r.numero ?? ''}. ${r.modelos ? `${r.modelos} modelo${r.modelos > 1 ? 's' : ''} encontrado${r.modelos > 1 ? 's' : ''}.` : 'Nenhum modelo aprovado ainda.'}${r.aviso ? ` ${r.aviso}` : ''}`)
      setD((x) => ({ ...x, token: '', appSecret: '' }))
      onMudou()
    } catch (e) { setErro((e as Error).message) } finally { setIndo(false) }
  }
  async function desconectar() {
    if (!confirm('Desconectar o WhatsApp? As conversas ficam guardadas, mas nada mais chega nem sai até conectar de novo.')) return
    setIndo(true); setErro(null)
    try { await api.desconectar(); onMudou(); onFechar() } catch (e) { setErro((e as Error).message) } finally { setIndo(false) }
  }

  return <Janela titulo={estado.conectado ? 'Conexão do WhatsApp oficial' : 'Conectar o WhatsApp oficial'} subtitulo="A API oficial da Meta, direto da conta do WhatsApp Business. A chave fica guardada no servidor e não aparece mais na tela." onFechar={onFechar} largo>
    <div className="wz-conexao">
      {estado.conectado && c && <section className="wz-conexao-status">
        <div><span className="wz-rot">Conectado</span><b>{c.nomeVerificado} <span className="wz-num">{c.numero}</span></b>
          <small>{c.qualidade && QUALIDADE_LEGIVEL[c.qualidade]?.rotulo}{c.limite && ` · ${LIMITE_LEGIVEL[c.limite] ?? c.limite}`}{c.parceiro && ` · do parceiro /${c.parceiro}`}</small>
          <small>{c.ultimoAvisoEm ? `Último aviso da Meta ${haQuanto(c.ultimoAvisoEm)}.` : 'A Meta ainda não mandou nenhum aviso para cá. Confira o webhook (passo 1) e mande um "oi" para o número para testar.'}</small></div>
        <div className="wz-conexao-acoes"><button className="wz-btn" onClick={() => void api.atualizar().then(onMudou).catch((e) => setErro((e as Error).message))}>Atualizar</button><button className="wz-btn" onClick={() => setTrocar((v) => !v)}>{trocar ? 'Fechar' : 'Trocar a chave'}</button><button className="wz-link perigo" onClick={() => void desconectar()} disabled={indo}>Desconectar</button></div>
      </section>}

      <ol className="wz-passos">
        <li><b>Receber as mensagens (webhook)</b>
          <small>No aplicativo da Meta: <i>WhatsApp › Configuração › Webhook › Editar</i>. Cole o endereço e a senha abaixo, confirme e assine o campo <b>messages</b>.</small>
          {estado.webhook ? <div className="wz-copiar">
            <label><span>URL de retorno</span><code>{estado.webhook.url}</code><button className="wz-link" onClick={() => copiar(estado.webhook!.url, 'url')}>{copiado === 'url' ? 'Copiado ✓' : 'Copiar'}</button></label>
            <label><span>Token de verificação</span><code>{estado.webhook.senha}</code><button className="wz-link" onClick={() => copiar(estado.webhook!.senha, 'senha')}>{copiado === 'senha' ? 'Copiado ✓' : 'Copiar'}</button></label>
          </div> : <small className="wz-aviso-mini">Só quem pode conectar vê esses dados.</small>}
        </li>
        {trocar && <li><b>Os dados do número</b>
          <small>Ficam no Gerenciador do WhatsApp e no painel do aplicativo da Meta. A chave é a de um <i>usuário do sistema</i>, com validade "Nunca" e as permissões <b>whatsapp_business_messaging</b> e <b>whatsapp_business_management</b>.</small>
          <div className="wz-form">
            <div className="wz-form-linha">
              <label><span>ID do número de telefone</span><input inputMode="numeric" name="wz-phone-number-id" autoComplete="off" data-1p-ignore data-lpignore="true" value={d.phoneNumberId} onChange={(e) => setD({ ...d, phoneNumberId: e.target.value.replace(/\D/g, '') })} placeholder="Só números" /></label>
              <label><span>ID da conta do WhatsApp Business</span><input inputMode="numeric" name="wz-waba-id" autoComplete="off" data-1p-ignore data-lpignore="true" value={d.wabaId} onChange={(e) => setD({ ...d, wabaId: e.target.value.replace(/\D/g, '') })} placeholder="Só números" /></label>
            </div>
            <div className="wz-form-linha">
              <label><span>ID do aplicativo (opcional)</span><input inputMode="numeric" name="wz-app-id" autoComplete="off" data-1p-ignore data-lpignore="true" value={d.appId} onChange={(e) => setD({ ...d, appId: e.target.value.replace(/\D/g, '') })} placeholder="Confere o segredo" /></label>
              {estado.podeConectar === 'geral' && <label><span>De quem é o número</span><select value={d.parceiro ?? ''} onChange={(e) => setD({ ...d, parceiro: e.target.value })}>
                <option value="">Da equipe geral</option>
                {(parceiros.length ? parceiros : [{ codigo: 'n', nome: 'Naor' }]).map((p) => <option key={p.codigo} value={p.codigo}>{p.nome} (/{p.codigo})</option>)}
              </select></label>}
            </div>
            <label><span>Chave de acesso permanente</span><input type="password" name="wz-meta-token" autoComplete="new-password" data-1p-ignore data-lpignore="true" value={d.token} onChange={(e) => setD({ ...d, token: e.target.value })} placeholder="Cole a chave do usuário do sistema" /></label>
            <label><span>Chave secreta do aplicativo</span><input type="password" name="wz-app-secret" autoComplete="new-password" data-1p-ignore data-lpignore="true" value={d.appSecret} onChange={(e) => setD({ ...d, appSecret: e.target.value })} placeholder="Configurações do app › Básico" /></label>
            {estado.podeConectar === 'geral' && <small className="wz-aviso-mini">Quem vê as conversas: você (admin geral) e os admins do parceiro dono do número.</small>}
          </div>
        </li>}
      </ol>
      {erro && <p className="wz-compor-erro" role="alert">{erro}</p>}
      {ok && <p className="wz-ok" role="status">{ok}</p>}
      {trocar && <footer className="wz-janela-pe"><button className="wz-btn" onClick={onFechar}>Fechar</button><button className="wz-btn ouro" disabled={!completo || indo} onClick={() => void conectar()}>{indo ? 'Conferindo com a Meta…' : 'Conectar e conferir com a Meta'}</button></footer>}
    </div>
  </Janela>
}

export function Janela({ titulo, subtitulo, onFechar, children, largo }: { titulo: string; subtitulo?: string; onFechar: () => void; children: ReactNode; largo?: boolean }) {
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f) }, [onFechar])
  return <div className="wz-fundo" role="dialog" aria-modal="true" aria-label={titulo} onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar() }}>
    <div className={`wz-janela-caixa ${largo ? 'largo' : ''}`}>
      <header><div><h3>{titulo}</h3>{subtitulo && <p>{subtitulo}</p>}</div><button className="wz-icone-btn" onClick={onFechar} aria-label="Fechar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button></header>
      <div className="wz-janela-corpo">{children}</div>
    </div>
  </div>
}

