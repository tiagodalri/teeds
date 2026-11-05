/**
 * Administração › WhatsApp (05/11/2026). O WhatsApp oficial do Naor dentro do ADM,
 * no jeito do WhatsApp Web: conversas à esquerda, a conversa no meio, a ficha do
 * cliente à direita.
 *
 * Antes de conectar o número a central abre com conversas de EXEMPLO (marcadas),
 * para a equipe ver como funciona; conectar fica no botão do topo. Depois de
 * conectada, tudo é de verdade e chega ao vivo.
 *
 * A regra do WhatsApp oficial aparece na tela: passou de 24 horas sem mensagem do
 * cliente, a caixa de texto vira "escolher modelo aprovado".
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import {
  whatsappDoBanco, whatsappDeExemplo, janela, textoDaJanela, telefoneBonito, nomeDoContato, primeiroNome, variaveisDe, trocarVariaveis,
  conferirArquivo, LIMITE_LEGIVEL, QUALIDADE_LEGIVEL, CATEGORIA_LEGIVEL, SITUACAO_MODELO, POR_PAGINA,
  type WhatsAppApi, type EstadoWpp, type ContatoWpp, type MensagemWpp, type RespostaPronta, type ModeloWpp, type FichaWpp,
  type PessoaDaEquipe, type Parceiro, type MidiaWpp,
} from '../../core/teeds/whatsapp'
import './central-whatsapp.css'

type Filtro = 'abertas' | 'nao-lidas' | 'minhas' | 'resolvidas'

/* ================================================================ casca */
export function CentralWhatsApp({ sessao, marca, apiDeTeste }: { sessao: SessaoTeeds; marca: string; apiDeTeste?: WhatsAppApi }) {
  const real = useMemo(() => apiDeTeste ?? whatsappDoBanco(sessao, marca), [apiDeTeste, sessao, marca])
  const [estado, setEstado] = useState<EstadoWpp | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [conectando, setConectando] = useState(false)

  const carregar = useCallback(async () => {
    setErro(null)
    try { setEstado(await real.estado()) } catch (e) { setErro((e as Error).message) }
  }, [real])
  useEffect(() => { void carregar() }, [carregar])

  // conectado e com acesso: conversas de verdade; senão, o exemplo
  const api = useMemo(() => {
    if (!estado) return null
    if (estado.conectado && estado.podeVer && !real.exemplo) return real
    return whatsappDeExemplo(estado, sessao.usuario.id)
  }, [estado, real, sessao.usuario.id])

  if (erro) return <section className="wz-aviso-cartao"><h3>Não consegui abrir o WhatsApp</h3><p>{erro}</p><button className="wz-btn" onClick={() => void carregar()}>Tentar de novo</button></section>
  if (!estado || !api) return <div className="wz-carregando"><i />Abrindo o WhatsApp…</div>
  if (!estado.podeVer && !estado.podeConectar) {
    return <section className="wz-aviso-cartao"><span className="wz-rot">WhatsApp oficial</span><h3>Este número é de outro parceiro</h3>
      <p>O WhatsApp conectado nesta plataforma é {estado.dono ? <>do parceiro <b>/{estado.dono}</b></> : 'da equipe geral'}. As conversas ficam só com o dono do número e com o administrador geral.</p></section>
  }

  return <div className="wz">
    <FaixaDaConexao estado={estado} onAbrir={() => setConectando(true)} />
    <Mesa key={api.exemplo ? 'exemplo' : 'real'} api={api} estado={estado} />
    {conectando && <Conexao api={real} estado={estado} onFechar={() => setConectando(false)} onMudou={() => void carregar()} />}
  </div>
}

function FaixaDaConexao({ estado, onAbrir }: { estado: EstadoWpp; onAbrir: () => void }) {
  const c = estado.conta
  if (!estado.conectado) {
    return <div className={`wz-faixa ${c?.situacao === 'erro' ? 'perigo' : ''}`}>
      <span className="wz-faixa-icone"><IconeWpp /></span>
      <div><b>{c?.situacao === 'erro' ? 'O WhatsApp oficial desconectou' : 'Falta conectar o WhatsApp oficial'}</b>
        <small>{c?.situacao === 'erro' && c.erro ? c.erro : 'As conversas abaixo são de exemplo, para você ver como funciona. Nada é enviado.'}</small></div>
      {estado.podeConectar ? <button className="wz-btn ouro" onClick={onAbrir}>Conectar o WhatsApp</button> : <small className="wz-faixa-quem">Quem conecta é o administrador geral ou o dono do número.</small>}
    </div>
  }
  const q = c?.qualidade ? QUALIDADE_LEGIVEL[c.qualidade] : null
  return <div className="wz-faixa ok">
    <span className="wz-faixa-icone"><IconeWpp /></span>
    <div><b>{c?.nomeVerificado || 'WhatsApp oficial'} <span className="wz-num">{c?.numero}</span></b>
      <small>{q && <em className={`wz-ponto ${q.tom}`}>{q.rotulo}</em>}{c?.limite && <> · {LIMITE_LEGIVEL[c.limite] ?? c.limite}</>}{c?.ultimoAvisoEm ? <> · última mensagem da Meta {haQuanto(c.ultimoAvisoEm)}</> : <> · ainda sem aviso da Meta</>}</small></div>
    <button className="wz-btn" onClick={onAbrir}>Conexão</button>
  </div>
}

/* ================================================================ mesa */
function Mesa({ api, estado }: { api: WhatsAppApi; estado: EstadoWpp }) {
  const [contatos, setContatos] = useState<ContatoWpp[] | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Record<string, MensagemWpp[]>>({})
  const [tudo, setTudo] = useState<Record<string, boolean>>({})
  const [filtro, setFiltro] = useState<Filtro>('abertas')
  const [busca, setBusca] = useState('')
  const [equipe, setEquipe] = useState<PessoaDaEquipe[]>([])
  const [respostas, setRespostas] = useState<RespostaPronta[]>([])
  const [modelos, setModelos] = useState<ModeloWpp[]>([])
  const [aoVivo, setAoVivo] = useState(false)
  const [fichaAberta, setFichaAberta] = useState(() => (typeof window !== 'undefined' ? window.innerWidth > 1280 : true))
  const [novaConversa, setNovaConversa] = useState(false)
  const [gerirRespostas, setGerirRespostas] = useState(false)
  const [, setRelogio] = useState(0)
  const abertoRef = useRef<string | null>(null)
  abertoRef.current = aberto

  useEffect(() => {
    let vivo = true
    void api.contatos().then((l) => vivo && setContatos(l)).catch(() => vivo && setContatos([]))
    void api.equipe().then((l) => vivo && setEquipe(l))
    void api.respostas().then((l) => vivo && setRespostas(l))
    void api.modelos().then((l) => vivo && setModelos(l))
    const parar = api.acompanhar((m) => {
      if (m.tipo === 'contato') {
        setContatos((l) => {
          const lista = l ?? []
          const i = lista.findIndex((c) => c.id === m.item.id)
          const nova = i >= 0 ? lista.map((c) => (c.id === m.item.id ? m.item : c)) : [m.item, ...lista]
          return nova.sort((a, b) => (b.ultimaEm ?? b.criadoEm).localeCompare(a.ultimaEm ?? a.criadoEm))
        })
        // chegou mensagem na conversa aberta: já marca como lida
        if (m.item.id === abertoRef.current && m.item.naoLidas > 0 && document.visibilityState === 'visible') void api.ler(m.item.id)
      } else {
        setMsgs((t) => {
          const l = t[m.item.contatoId]
          if (!l) return t
          const i = l.findIndex((x) => x.id === m.item.id)
          let nova = i >= 0 ? l.map((x) => (x.id === m.item.id ? m.item : x)) : [...l, m.item]
          // a mensagem que acabou de sair chegou do banco: tira a provisória
          if (i < 0 && m.item.direcao !== 'entrada') nova = nova.filter((x) => !(x.enviando && x.texto === m.item.texto && x.direcao === m.item.direcao))
          return { ...t, [m.item.contatoId]: nova }
        })
      }
    }, setAoVivo)
    const relogio = setInterval(() => setRelogio((n) => n + 1), 60_000) // janelas e horários andam sozinhos
    return () => { vivo = false; parar(); clearInterval(relogio) }
  }, [api])

  const abrir = useCallback(async (id: string) => {
    setAberto(id)
    const c = contatos?.find((x) => x.id === id)
    if (c?.naoLidas) void api.ler(id)
    if (!msgs[id]) {
      const l = await api.mensagens(id).catch(() => [])
      setMsgs((t) => ({ ...t, [id]: l }))
      setTudo((t) => ({ ...t, [id]: l.length < POR_PAGINA }))
    }
  }, [api, contatos, msgs])

  const maisAntigas = useCallback(async (id: string) => {
    const l = msgs[id]
    if (!l?.length || tudo[id]) return
    const antes = await api.mensagens(id, l[0].criadoEm).catch(() => [])
    setMsgs((t) => ({ ...t, [id]: [...antes, ...(t[id] ?? [])] }))
    setTudo((t) => ({ ...t, [id]: antes.length < POR_PAGINA }))
  }, [api, msgs, tudo])

  const recarregar = useCallback(async (id: string) => {
    const l = await api.mensagens(id).catch(() => null)
    if (!l) return
    setMsgs((t) => {
      const antigas = (t[id] ?? []).filter((x) => !x.enviando && !l.some((y) => y.id === x.id) && x.criadoEm < (l[0]?.criadoEm ?? ''))
      const provisorias = (t[id] ?? []).filter((x) => x.enviando || x.falhouAqui)
      return { ...t, [id]: [...antigas, ...l, ...provisorias.filter((p) => !l.some((y) => y.direcao === p.direcao && y.texto === p.texto && Math.abs(new Date(y.criadoEm).getTime() - new Date(p.criadoEm).getTime()) < 120_000))] }
    })
  }, [api])

  /** Põe a mensagem na tela na hora; troca pela de verdade quando o banco confirma. */
  const enviar = useCallback(async (id: string, provisoria: Partial<MensagemWpp>, fazer: () => Promise<unknown>) => {
    const tmp: MensagemWpp = { id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, contatoId: id, wamid: null, direcao: 'saida', tipo: 'texto', texto: null, midia: null, modelo: null, citando: null, reacao: null, status: 'pendente', erro: null, autor: api.euId, criadoEm: new Date().toISOString(), enviando: true, ...provisoria }
    setMsgs((t) => ({ ...t, [id]: [...(t[id] ?? []), tmp] }))
    try {
      await fazer()
      setMsgs((t) => ({ ...t, [id]: (t[id] ?? []).filter((x) => x.id !== tmp.id) }))
      if (!api.exemplo) await recarregar(id)
    } catch (e) {
      setMsgs((t) => ({ ...t, [id]: (t[id] ?? []).map((x) => (x.id === tmp.id ? { ...x, enviando: false, falhouAqui: (e as Error).message, status: 'falhou' } : x)) }))
    }
  }, [api, recarregar])

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase(), qd = q.replace(/\D/g, '')
    return (contatos ?? []).filter((c) => {
      if (q && !(nomeDoContato(c).toLowerCase().includes(q) || (qd.length >= 3 && c.waId.includes(qd)) || c.etiquetas.some((e) => e.toLowerCase().includes(q)))) return false
      if (filtro === 'abertas') return c.situacao === 'aberta'
      if (filtro === 'nao-lidas') return c.naoLidas > 0
      if (filtro === 'minhas') return c.responsavel === api.euId && c.situacao === 'aberta'
      return c.situacao === 'resolvida'
    })
  }, [contatos, busca, filtro, api.euId])
  const contagem = useMemo(() => {
    const l = contatos ?? []
    return { abertas: l.filter((c) => c.situacao === 'aberta').length, 'nao-lidas': l.filter((c) => c.naoLidas > 0).length, minhas: l.filter((c) => c.responsavel === api.euId && c.situacao === 'aberta').length, resolvidas: l.filter((c) => c.situacao === 'resolvida').length }
  }, [contatos, api.euId])

  const contato = contatos?.find((c) => c.id === aberto) ?? null
  const nomeDe = (id: string | null) => (id ? (id === api.euId ? 'Você' : equipe.find((p) => p.id === id)?.nome ?? 'Equipe') : null)

  return <div className={`wz-mesa ${aberto ? 'com-conversa' : ''} ${fichaAberta && contato ? 'com-ficha' : ''}`}>
    <aside className="wz-lista" aria-label="Conversas">
      <header className="wz-lista-topo">
        <div><b>Conversas</b>{api.exemplo ? <span className="wz-selo-exemplo">Exemplo</span> : <span className={`wz-vivo ${aoVivo ? 'on' : ''}`} title={aoVivo ? 'Recebendo ao vivo' : 'Reconectando…'}><i />{aoVivo ? 'Ao vivo' : 'Reconectando'}</span>}</div>
        <div className="wz-lista-acoes">
          <button className="wz-icone-btn" onClick={() => setGerirRespostas(true)} title="Respostas prontas" aria-label="Respostas prontas"><svg viewBox="0 0 24 24"><path d="M5 5h14v10H9l-4 4zM9 9h6M9 12h4" /></svg></button>
          <button className="wz-icone-btn ouro" onClick={() => setNovaConversa(true)} title="Nova conversa" aria-label="Nova conversa"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></button>
        </div>
      </header>
      <label className="wz-busca"><svg viewBox="0 0 24 24"><path d="M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM16.5 16.5 20 20" /></svg><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, número ou etiqueta" aria-label="Buscar conversa" /></label>
      <div className="wz-filtros" role="tablist">
        {([['abertas', 'Abertas'], ['nao-lidas', 'Não lidas'], ['minhas', 'Minhas'], ['resolvidas', 'Resolvidas']] as const).map(([id, nome]) =>
          <button key={id} role="tab" aria-selected={filtro === id} className={filtro === id ? 'on' : ''} onClick={() => setFiltro(id)}>{nome}{contagem[id] > 0 && <b>{contagem[id]}</b>}</button>)}
      </div>
      <div className="wz-itens">
        {contatos === null && <ListaCarregando />}
        {contatos !== null && !lista.length && <div className="wz-vazio-lista">
          {busca ? <><b>Nada encontrado</b><small>Confira o nome ou o número.</small></>
            : filtro === 'nao-lidas' ? <><b>Tudo lido</b><small>Nenhuma conversa esperando resposta.</small></>
            : filtro === 'minhas' ? <><b>Nenhuma conversa sua</b><small>Assuma uma conversa no topo dela para ela aparecer aqui.</small></>
            : filtro === 'resolvidas' ? <><b>Nenhuma resolvida</b><small>Quando terminar um atendimento, toque em "Resolver".</small></>
            : <><b>Nenhuma conversa ainda</b><small>Quando alguém mandar mensagem para o número, ela aparece aqui na hora.</small></>}
        </div>}
        {lista.map((c) => {
          const j = janela(c)
          return <button key={c.id} className={`wz-item ${c.id === aberto ? 'on' : ''} ${c.naoLidas ? 'nao-lida' : ''}`} onClick={() => void abrir(c.id)}>
            <Avatar nome={nomeDoContato(c)} />
            <span className="wz-item-meio">
              <span className="wz-item-topo"><b>{nomeDoContato(c)}</b><time>{c.ultimaEm ? horaOuDia(c.ultimaEm) : ''}</time></span>
              <span className="wz-item-baixo">
                <span className="wz-item-ultima">{c.ultimaDirecao === 'saida' && <Tique status="lida" pequeno />}{c.ultimaTexto ?? 'Sem mensagens ainda'}</span>
                {c.naoLidas > 0 && <em className="wz-nao-lidas" aria-label={`${c.naoLidas} não lidas`}>{c.naoLidas}</em>}
              </span>
              {(c.etiquetas.length > 0 || c.responsavel || !j.aberta) && <span className="wz-item-selos">
                {!j.aberta && c.situacao === 'aberta' && <i className="fechada" title="Janela de 24 horas fechada: só modelo aprovado">Só modelo</i>}
                {c.responsavel && <i className="dono">{nomeDe(c.responsavel)}</i>}
                {c.etiquetas.slice(0, 2).map((e) => <i key={e}>{e}</i>)}
              </span>}
            </span>
          </button>
        })}
      </div>
    </aside>

    <main className="wz-centro">
      {contato
        ? <Conversa key={contato.id} api={api} estado={estado} contato={contato} mensagens={msgs[contato.id] ?? null} temMais={!tudo[contato.id]}
            equipe={equipe} respostas={respostas} modelos={modelos} nomeDe={nomeDe}
            onVoltar={() => setAberto(null)} onFicha={() => setFichaAberta((v) => !v)} fichaAberta={fichaAberta}
            onMaisAntigas={() => void maisAntigas(contato.id)} onEnviar={(p, f) => void enviar(contato.id, p, f)}
            onNota={async (t) => { const m = await api.nota(contato.id, t); setMsgs((x) => ({ ...x, [contato.id]: (x[contato.id] ?? []).some((y) => y.id === m.id) ? x[contato.id] : [...(x[contato.id] ?? []), m] })) }}
            onModelosMudaram={setModelos} onRepetir={(m) => {
              setMsgs((t) => ({ ...t, [contato.id]: (t[contato.id] ?? []).filter((x) => x.id !== m.id) }))
              if (m.tipo === 'texto' && m.texto) void enviar(contato.id, { texto: m.texto, citando: m.citando }, () => api.enviarTexto(contato.id, m.texto!, m.citando))
            }} />
        : <div className="wz-sem-conversa">
            <span className="wz-sem-conversa-icone"><IconeWpp /></span>
            <h3>{api.exemplo ? 'Veja como fica o atendimento' : 'Escolha uma conversa'}</h3>
            <p>{api.exemplo ? 'Abra uma das conversas de exemplo à esquerda: responda, mande foto, use uma resposta pronta ("/") ou um modelo. Quando o número estiver conectado, as conversas de verdade aparecem aqui.' : 'As mensagens chegam ao vivo. Responda por aqui e o cliente recebe no WhatsApp dele, do número oficial.'}</p>
            <ul><li><b>Enter</b> envia · <b>Shift + Enter</b> pula linha</li><li><b>/</b> abre as respostas prontas</li><li>Arraste uma foto ou um PDF para a conversa</li></ul>
          </div>}
    </main>

    {contato && fichaAberta && <Ficha key={contato.id} api={api} contato={contato} equipe={equipe} onFechar={() => setFichaAberta(false)} />}

    {novaConversa && <NovaConversa api={api} onFechar={() => setNovaConversa(false)} onCriada={(id) => { setNovaConversa(false); setFiltro('abertas'); void api.contatos().then(setContatos).then(() => void abrir(id)) }} />}
    {gerirRespostas && <GerirRespostas api={api} respostas={respostas} onFechar={() => setGerirRespostas(false)} onMudou={() => void api.respostas().then(setRespostas)} />}
  </div>
}

/* ================================================================ conversa */
function Conversa(p: {
  api: WhatsAppApi; estado: EstadoWpp; contato: ContatoWpp; mensagens: MensagemWpp[] | null; temMais: boolean
  equipe: PessoaDaEquipe[]; respostas: RespostaPronta[]; modelos: ModeloWpp[]; nomeDe: (id: string | null) => string | null
  onVoltar: () => void; onFicha: () => void; fichaAberta: boolean; onMaisAntigas: () => void
  onEnviar: (provisoria: Partial<MensagemWpp>, fazer: () => Promise<unknown>) => void
  onNota: (texto: string) => Promise<void>; onModelosMudaram: (l: ModeloWpp[]) => void; onRepetir: (m: MensagemWpp) => void
}) {
  const { api, contato, mensagens } = p
  const [citando, setCitando] = useState<MensagemWpp | null>(null)
  const [escolhendoModelo, setEscolhendoModelo] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [soltou, setSoltou] = useState<File | null>(null)
  const [ampliada, setAmpliada] = useState<string | null>(null)
  const [novasEmbaixo, setNovasEmbaixo] = useState(0)
  const rolagem = useRef<HTMLDivElement>(null)
  const noFim = useRef(true)
  const qtd = useRef(0)
  const j = janela(contato)

  // desce até o fim ao abrir e quando chega mensagem (se a pessoa já estava no fim)
  useEffect(() => {
    const el = rolagem.current
    if (!el || !mensagens) return
    const cresceu = mensagens.length > qtd.current
    const primeira = qtd.current === 0
    qtd.current = mensagens.length
    if (primeira || (cresceu && noFim.current)) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; setNovasEmbaixo(0) })
    else if (cresceu) setNovasEmbaixo((n) => n + 1)
  }, [mensagens])

  const porWamid = useMemo(() => new Map((mensagens ?? []).filter((m) => m.wamid).map((m) => [m.wamid!, m])), [mensagens])
  const blocos = useMemo(() => {
    const saida: Array<{ dia: string; itens: MensagemWpp[] }> = []
    for (const m of mensagens ?? []) {
      const dia = diaDaMensagem(m.criadoEm)
      if (saida[saida.length - 1]?.dia !== dia) saida.push({ dia, itens: [] })
      saida[saida.length - 1].itens.push(m)
    }
    return saida
  }, [mensagens])

  const mudar = (c: Parameters<WhatsAppApi['mudarContato']>[1]) => void api.mudarContato(contato.id, c)

  return <section className={`wz-conversa ${arrastando ? 'arrastando' : ''}`}
    onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastando(true) } }}
    onDragLeave={(e) => { if (e.currentTarget === e.target) setArrastando(false) }}
    onDrop={(e) => { e.preventDefault(); setArrastando(false); const f = e.dataTransfer.files?.[0]; if (f) setSoltou(f) }}>
    <header className="wz-conversa-topo">
      <button className="wz-voltar" onClick={p.onVoltar} aria-label="Voltar para as conversas"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
      <Avatar nome={nomeDoContato(contato)} />
      <div className="wz-conversa-quem">
        <b>{nomeDoContato(contato)}</b>
        <small><span className="wz-tel">{telefoneBonito(contato.waId)}</span><span className={`wz-janela ${j.aberta ? 'aberta' : 'fechada'}`} title="O WhatsApp só deixa responder livremente até 24 horas depois da última mensagem do cliente."><i />{j.aberta ? <>Janela aberta · {textoDaJanela(j.restaMs)}</> : <>Janela de 24 h fechada</>}</span></small>
      </div>
      <div className="wz-conversa-acoes">
        <label className="wz-dono" title="Quem cuida desta conversa">
          <select value={contato.responsavel ?? ''} onChange={(e) => mudar({ responsavel: e.target.value || null })} aria-label="Responsável pela conversa">
            <option value="">Sem responsável</option>
            {p.equipe.map((x) => <option key={x.id} value={x.id}>{x.id === api.euId ? 'Você' : x.nome}</option>)}
          </select>
        </label>
        {contato.situacao === 'aberta'
          ? <button className="wz-btn" onClick={() => mudar({ situacao: 'resolvida' })}><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" /></svg><span className="wz-btn-texto">Resolver</span></button>
          : <button className="wz-btn" onClick={() => mudar({ situacao: 'aberta' })}>Reabrir</button>}
        <button className={`wz-icone-btn ${p.fichaAberta ? 'on' : ''}`} onClick={p.onFicha} title="Ficha do cliente" aria-label="Ficha do cliente"><svg viewBox="0 0 24 24"><path d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20a7 7 0 0 1 14 0" /></svg></button>
      </div>
    </header>

    <div className="wz-mensagens" ref={rolagem} onScroll={(e) => {
      const el = e.currentTarget
      noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      if (noFim.current && novasEmbaixo) setNovasEmbaixo(0)
      if (el.scrollTop < 40 && p.temMais && mensagens && mensagens.length >= POR_PAGINA) p.onMaisAntigas()
    }}>
      {mensagens === null && <div className="wz-carregando pequeno"><i />Carregando a conversa…</div>}
      {mensagens && p.temMais && mensagens.length >= POR_PAGINA && <button className="wz-mais" onClick={p.onMaisAntigas}>Ver mensagens anteriores</button>}
      {mensagens && !mensagens.length && <div className="wz-conversa-vazia">
        <b>Conversa nova</b><small>{j.aberta ? 'Escreva a primeira mensagem.' : 'Para falar primeiro com alguém, o WhatsApp pede um modelo aprovado. Quando a pessoa responder, a conversa fica livre por 24 horas.'}</small>
      </div>}
      {blocos.map((b) => <div key={b.dia} className="wz-dia">
        <span className="wz-dia-rotulo">{b.dia}</span>
        {b.itens.map((m, i) => <Balao key={m.id} m={m} anterior={b.itens[i - 1]} citada={m.citando ? porWamid.get(m.citando) ?? null : null}
          contato={contato} api={api} nomeDe={p.nomeDe} onCitar={() => setCitando(m)} onAmpliar={setAmpliada} onRepetir={() => p.onRepetir(m)} />)}
      </div>)}
    </div>
    {novasEmbaixo > 0 && <button className="wz-descer" onClick={() => { const el = rolagem.current; if (el) el.scrollTop = el.scrollHeight; setNovasEmbaixo(0) }}>{novasEmbaixo} nova{novasEmbaixo > 1 ? 's' : ''} ↓</button>}
    {arrastando && <div className="wz-soltar"><b>Solte para anexar</b><small>Foto, vídeo, áudio ou PDF</small></div>}

    <Compositor key={contato.id} contato={contato} janelaAberta={j.aberta} respostas={p.respostas} citando={citando} arquivoSolto={soltou}
      onSoltouUsado={() => setSoltou(null)} onTirarCitacao={() => setCitando(null)} onModelo={() => setEscolhendoModelo(true)}
      onTexto={(t) => { const c = citando; setCitando(null); p.onEnviar({ texto: t, citando: c?.wamid ?? null }, () => api.enviarTexto(contato.id, t, c?.wamid ?? null)) }}
      onArquivo={(f, legenda) => {
        const c = citando; setCitando(null)
        const tipo = f.type.startsWith('image/') ? 'imagem' : f.type.startsWith('audio/') ? 'audio' : f.type.startsWith('video/') ? 'video' : 'documento'
        p.onEnviar({ tipo, texto: legenda || null, midia: { exemplo: tipo === 'imagem' ? URL.createObjectURL(f) : undefined, nome: f.name, mime: f.type, tamanho: f.size } }, () => api.enviarArquivo(contato.id, f, legenda, c?.wamid ?? null))
      }}
      onNota={p.onNota} />

    {escolhendoModelo && <EscolherModelo api={api} estado={p.estado} contato={contato} modelos={p.modelos} onModelos={p.onModelosMudaram} onFechar={() => setEscolhendoModelo(false)}
      onEnviar={(m, vars, texto) => { setEscolhendoModelo(false); p.onEnviar({ tipo: 'modelo', texto, modelo: { nome: m.nome, idioma: m.idioma } }, () => api.enviarModelo(contato.id, m, vars)) }} />}
    {ampliada && <div className="wz-lupa" role="dialog" aria-label="Foto ampliada" onClick={() => setAmpliada(null)}><img src={ampliada} alt="" /><button className="wz-lupa-fechar" aria-label="Fechar">×</button></div>}
  </section>
}

/* ================================================================ balão */
function Balao({ m, anterior, citada, contato, api, nomeDe, onCitar, onAmpliar, onRepetir }: {
  m: MensagemWpp; anterior?: MensagemWpp; citada: MensagemWpp | null; contato: ContatoWpp; api: WhatsAppApi
  nomeDe: (id: string | null) => string | null; onCitar: () => void; onAmpliar: (url: string) => void; onRepetir: () => void
}) {
  const emSequencia = anterior && anterior.direcao === m.direcao && new Date(m.criadoEm).getTime() - new Date(anterior.criadoEm).getTime() < 5 * 60_000
  if (m.direcao === 'nota') {
    return <div className="wz-nota"><span className="wz-nota-rot"><svg viewBox="0 0 24 24"><path d="M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4 7.2 18.9l.9-5.4L4.2 9.7l5.4-.8z" /></svg>Nota interna de {nomeDe(m.autor) ?? 'Equipe'} · o cliente não vê</span>
      <p>{formatar(m.texto ?? '')}</p><time>{horaCurta(m.criadoEm)}</time></div>
  }
  const sai = m.direcao === 'saida'
  const quemCitada = citada ? (citada.direcao === 'entrada' ? nomeDoContato(contato) : 'Você') : null
  return <div className={`wz-linha ${sai ? 'sai' : 'entra'} ${emSequencia ? 'seguida' : ''}`}>
    <div className={`wz-balao ${m.tipo} ${m.falhouAqui || m.status === 'falhou' ? 'falhou' : ''}`}>
      {sai && m.autor && !emSequencia && <span className="wz-autor">{nomeDe(m.autor)}</span>}
      {m.tipo === 'modelo' && <span className="wz-modelo-rot">Modelo · {m.modelo?.nome?.replace(/_/g, ' ')}</span>}
      {citada && <div className="wz-citada"><b>{quemCitada}</b><span>{citada.texto || rotuloDoTipo(citada.tipo)}</span></div>}
      {m.midia && <Midia m={m} api={api} onAmpliar={onAmpliar} />}
      {m.texto && <p>{formatar(m.texto)}</p>}
      <span className="wz-pe"><time>{horaCurta(m.criadoEm)}</time>{sai && <Tique status={m.enviando ? 'pendente' : m.status} />}</span>
      {m.reacao && <span className="wz-reacao" title="Reação do cliente">{m.reacao}</span>}
      {!m.enviando && !m.falhouAqui && <span className="wz-balao-acoes">
        {m.wamid && <button onClick={onCitar} title="Responder a esta mensagem" aria-label="Responder"><svg viewBox="0 0 24 24"><path d="M9 7L4 12l5 5M4 12h10a6 6 0 0 1 6 6" /></svg></button>}
        {m.texto && <button onClick={() => void navigator.clipboard?.writeText(m.texto ?? '')} title="Copiar texto" aria-label="Copiar"><svg viewBox="0 0 24 24"><path d="M9 9h10v11H9zM5 15V4h10" /></svg></button>}
      </span>}
    </div>
    {(m.falhouAqui || (m.status === 'falhou' && m.erro)) && <div className="wz-falha"><span>{m.falhouAqui ?? m.erro}</span>{m.falhouAqui && m.tipo === 'texto' && <button onClick={onRepetir}>Tentar de novo</button>}</div>}
  </div>
}

function Midia({ m, api, onAmpliar }: { m: MensagemWpp; api: WhatsAppApi; onAmpliar: (url: string) => void }) {
  const midia = m.midia as MidiaWpp
  const [url, setUrl] = useState<string | null>(midia.exemplo && midia.exemplo !== 'audio' ? midia.exemplo : null)
  const [falhou, setFalhou] = useState(!!midia.falhou)
  const pronto = !!midia.caminho || (!!midia.exemplo && midia.exemplo !== 'audio')
  useEffect(() => {
    if (url || !midia.caminho) return
    let vivo = true
    api.abrirArquivo(midia).then((u) => vivo && setUrl(u)).catch(() => vivo && setFalhou(true))
    return () => { vivo = false }
  }, [api, midia, url])

  if (m.tipo === 'imagem' || m.tipo === 'figurinha') {
    if (url) return <button className={`wz-foto ${m.tipo}`} onClick={() => onAmpliar(url)} aria-label="Ampliar foto"><img src={url} alt={midia.nome ?? 'Foto'} loading="lazy" /></button>
    return <div className="wz-foto-espera">{falhou ? 'Não consegui abrir a foto' : pronto ? 'Abrindo a foto…' : 'Recebendo a foto…'}</div>
  }
  if (m.tipo === 'audio') {
    if (midia.exemplo === 'audio') return <div className="wz-audio exemplo" title="Áudio de exemplo"><span className="wz-audio-play"><svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" /></svg></span><span className="wz-onda">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ height: `${25 + Math.abs(Math.sin(i * 1.7)) * 75}%` }} />)}</span><small>0:{String(midia.duracao ?? 12).padStart(2, '0')}</small></div>
    if (url) return <audio className="wz-audio-real" controls preload="metadata" src={url} />
    return <div className="wz-foto-espera">{falhou ? 'Não consegui abrir o áudio' : 'Recebendo o áudio…'}</div>
  }
  if (m.tipo === 'video') {
    if (url) return <video className="wz-video" controls preload="metadata" src={url} />
    return <div className="wz-foto-espera">{falhou ? 'Não consegui abrir o vídeo' : 'Recebendo o vídeo…'}</div>
  }
  return <a className={`wz-doc ${url ? '' : 'espera'}`} href={url ?? undefined} download={midia.nome ?? 'arquivo'} target="_blank" rel="noreferrer" onClick={(e) => { if (!url) e.preventDefault() }}>
    <span className="wz-doc-icone">{(midia.nome?.split('.').pop() ?? 'doc').slice(0, 4).toUpperCase()}</span>
    <span><b>{midia.nome ?? 'Arquivo'}</b><small>{midia.tamanho ? tamanho(midia.tamanho) : ''}{falhou ? ' · não consegui abrir' : url ? ' · Baixar' : ' · abrindo…'}</small></span>
  </a>
}

/* ================================================================ compositor */
function Compositor({ contato, janelaAberta, respostas, citando, arquivoSolto, onSoltouUsado, onTirarCitacao, onModelo, onTexto, onArquivo, onNota }: {
  contato: ContatoWpp; janelaAberta: boolean; respostas: RespostaPronta[]; citando: MensagemWpp | null; arquivoSolto: File | null
  onSoltouUsado: () => void; onTirarCitacao: () => void; onModelo: () => void
  onTexto: (t: string) => void; onArquivo: (f: File, legenda: string) => void; onNota: (t: string) => Promise<void>
}) {
  const [texto, setTexto] = useState('')
  const [modo, setModo] = useState<'mensagem' | 'nota'>(janelaAberta ? 'mensagem' : 'nota')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sel, setSel] = useState(0)
  const campo = useRef<HTMLTextAreaElement>(null)
  const seletor = useRef<HTMLInputElement>(null)
  const [mostrarTravada, setMostrarTravada] = useState(!janelaAberta)

  useEffect(() => { if (arquivoSolto) { escolher(arquivoSolto); onSoltouUsado() } }, [arquivoSolto]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = campo.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 148)}px` }, [texto])
  useEffect(() => { if (citando) campo.current?.focus() }, [citando])
  useEffect(() => { if (!janelaAberta) setModo('nota'); else setMostrarTravada(false) }, [janelaAberta])

  const atalho = /^\/(\S*)$/.exec(texto)?.[1]
  const sugestoes = atalho !== undefined ? respostas.filter((r) => r.atalho.startsWith(atalho.toLowerCase()) || r.titulo.toLowerCase().includes(atalho.toLowerCase())).slice(0, 6) : []

  function escolher(f: File) {
    if (!janelaAberta) { setErro('Com a janela de 24 horas fechada, só dá para mandar modelo aprovado.'); return }
    const e = conferirArquivo(f)
    setErro(e); if (!e) { setArquivo(f); setModo('mensagem'); campo.current?.focus() }
  }
  async function mandar() {
    const t = texto.trim()
    if (modo === 'nota') { if (!t) return; setTexto(''); await onNota(t).catch((e) => setErro((e as Error).message)); return }
    if (arquivo) { onArquivo(arquivo, t); setArquivo(null); setTexto(''); return }
    if (!t) return
    onTexto(t); setTexto('')
  }

  if (!janelaAberta && mostrarTravada) {
    return <footer className="wz-compor travado">
      <div className="wz-travado">
        <span className="wz-travado-icone"><svg viewBox="0 0 24 24"><path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z" /></svg></span>
        {contato.ultimaDirecao === 'saida'
          ? <div><b>Mensagem enviada · esperando o cliente responder</b>
              <small>Assim que ele responder, a conversa fica livre por 24 horas e você escreve normalmente. Até lá, só outro modelo aprovado.</small></div>
          : <div><b>{contato.ultimaEntradaEm ? 'Faz mais de 24 horas que o cliente não responde' : 'Este cliente ainda não mandou mensagem'}</b>
              <small>Pela regra do WhatsApp, para falar com ele agora só dá para mandar um modelo aprovado. Quando ele responder, a conversa fica livre de novo.</small></div>}
        <div className="wz-travado-acoes"><button className={`wz-btn ${contato.ultimaDirecao === 'saida' ? '' : 'ouro'}`} onClick={onModelo}>{contato.ultimaDirecao === 'saida' ? 'Outro modelo' : 'Escolher modelo'}</button><button className="wz-btn" onClick={() => { setMostrarTravada(false); setModo('nota'); setTimeout(() => campo.current?.focus(), 0) }}>Escrever nota interna</button></div>
      </div>
    </footer>
  }

  return <footer className={`wz-compor ${modo === 'nota' ? 'nota' : ''}`}>
    {citando && modo === 'mensagem' && <div className="wz-citando"><div><b>Respondendo a {citando.direcao === 'entrada' ? nomeDoContato(contato) : 'você'}</b><span>{citando.texto || rotuloDoTipo(citando.tipo)}</span></div><button onClick={onTirarCitacao} aria-label="Tirar a citação">×</button></div>}
    {arquivo && <div className="wz-anexo"><span className="wz-doc-icone">{arquivo.type.startsWith('image/') ? 'FOTO' : (arquivo.name.split('.').pop() ?? '').slice(0, 4).toUpperCase()}</span><div><b>{arquivo.name}</b><small>{tamanho(arquivo.size)} · escreva uma legenda, se quiser</small></div><button onClick={() => setArquivo(null)} aria-label="Tirar o anexo">×</button></div>}
    {erro && <div className="wz-compor-erro" role="alert">{erro}<button onClick={() => setErro(null)} aria-label="Fechar aviso">×</button></div>}
    {sugestoes.length > 0 && modo === 'mensagem' && <div className="wz-sugestoes" role="listbox" aria-label="Respostas prontas">
      {sugestoes.map((r, i) => <button key={r.id} role="option" aria-selected={i === sel} className={i === sel ? 'on' : ''} onMouseEnter={() => setSel(i)} onClick={() => { setTexto(r.texto); setSel(0); campo.current?.focus() }}><b>/{r.atalho}</b><span>{r.titulo}</span><small>{r.texto}</small></button>)}
    </div>}
    <div className="wz-compor-linha">
      <div className="wz-modo" role="radiogroup" aria-label="Tipo">
        <button role="radio" aria-checked={modo === 'mensagem'} className={modo === 'mensagem' ? 'on' : ''} disabled={!janelaAberta} onClick={() => setModo('mensagem')} title={janelaAberta ? 'Mensagem para o cliente' : 'Janela fechada: só modelo'}>Mensagem</button>
        <button role="radio" aria-checked={modo === 'nota'} className={modo === 'nota' ? 'on' : ''} onClick={() => setModo('nota')} title="Só a equipe vê">Nota</button>
      </div>
      {modo === 'mensagem' && <button className="wz-icone-btn" onClick={() => seletor.current?.click()} title="Anexar foto, vídeo, áudio ou arquivo" aria-label="Anexar"><svg viewBox="0 0 24 24"><path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.2-8.2a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4" /></svg></button>}
      <input ref={seletor} type="file" hidden accept="image/*,video/mp4,video/3gpp,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" onChange={(e) => { const f = e.target.files?.[0]; if (f) escolher(f); e.target.value = '' }} />
      <textarea ref={campo} rows={1} value={texto} onChange={(e) => { setTexto(e.target.value); setSel(0) }}
        placeholder={modo === 'nota' ? 'Nota interna: só a equipe vê' : arquivo ? 'Legenda (opcional)' : 'Escreva uma mensagem · / para respostas prontas'}
        aria-label={modo === 'nota' ? 'Nota interna' : 'Mensagem'}
        onPaste={(e) => { const f = e.clipboardData.files?.[0]; if (f && modo === 'mensagem') { e.preventDefault(); escolher(f) } }}
        onKeyDown={(e) => {
          if (sugestoes.length && modo === 'mensagem') {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % sugestoes.length); return }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s - 1 + sugestoes.length) % sugestoes.length); return }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); setTexto(sugestoes[sel].texto); setSel(0); return }
            if (e.key === 'Escape') { setTexto(''); return }
          }
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void mandar() }
        }} />
      {!janelaAberta && <button className="wz-btn ouro pequeno" onClick={onModelo}>Modelo</button>}
      <button className="wz-enviar" onClick={() => void mandar()} disabled={!texto.trim() && !arquivo} aria-label={modo === 'nota' ? 'Salvar nota' : 'Enviar'} title={modo === 'nota' ? 'Salvar nota' : 'Enviar'}>
        <svg viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2.5-6.5z" /></svg>
      </button>
    </div>
  </footer>
}

/* ================================================================ modelos */
function EscolherModelo({ api, estado, contato, modelos, onModelos, onFechar, onEnviar }: {
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

/* ================================================================ ficha */
function Ficha({ api, contato, equipe, onFechar }: { api: WhatsAppApi; contato: ContatoWpp; equipe: PessoaDaEquipe[]; onFechar: () => void }) {
  const [ficha, setFicha] = useState<FichaWpp | null | undefined>(undefined)
  const [etiqueta, setEtiqueta] = useState('')
  useEffect(() => { let vivo = true; void api.ficha(contato.id).then((f) => vivo && setFicha(f)).catch(() => vivo && setFicha(null)); return () => { vivo = false } }, [api, contato.id, contato.userId, contato.leadId])
  const k = ficha?.cliente, l = ficha?.lead
  const j = janela(contato)
  const addEtiqueta = () => {
    const t = etiqueta.trim().replace(/\s+/g, ' ')
    if (!t || contato.etiquetas.includes(t)) { setEtiqueta(''); return }
    void api.mudarContato(contato.id, { etiquetas: [...contato.etiquetas, t].slice(0, 8) }); setEtiqueta('')
  }
  return <aside className="wz-ficha" aria-label="Ficha do cliente">
    <header><span className="wz-rot">Ficha</span><button className="wz-icone-btn" onClick={onFechar} aria-label="Fechar ficha"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button></header>
    <div className="wz-ficha-quem"><Avatar nome={nomeDoContato(contato)} grande /><b>{k?.nome || l?.nome || nomeDoContato(contato)}</b><small>{telefoneBonito(contato.waId)}</small>
      {contato.nome && (k?.nome || l?.nome) && contato.nome !== (k?.nome || l?.nome) && <small className="wz-ficha-perfil">No WhatsApp: {contato.nome}</small>}</div>

    {ficha === undefined && <div className="wz-carregando pequeno"><i />Procurando o cadastro…</div>}
    {k && <section className="wz-ficha-bloco">
      <span className="wz-rot">Cliente da plataforma</span>
      <dl>
        <div><dt>Subplano</dt><dd><span className={`wz-subplano ${k.subplano ?? 'gold'}`}>{(k.subplano ?? 'gold').replace(/^./, (x) => x.toUpperCase())}</span></dd></div>
        {k.parceiro && <div><dt>Veio de</dt><dd>/{k.parceiro}</dd></div>}
        {k.email && <div><dt>E-mail</dt><dd className="quebra">{k.email}</dd></div>}
        {k.status && <div><dt>Acesso</dt><dd>{k.status.replace(/^./, (x) => x.toUpperCase())}</dd></div>}
        {k.criadoEm && <div><dt>Cadastro</dt><dd>{dataCurta(k.criadoEm)}</dd></div>}
        {k.vistoEm && <div><dt>Último acesso</dt><dd>{haQuanto(k.vistoEm)}</dd></div>}
        {(k.cidade || k.uf) && <div><dt>Cidade</dt><dd>{[k.cidade, k.uf].filter(Boolean).join(' · ')}</dd></div>}
      </dl>
      {k.email && <button className="wz-link" onClick={() => void navigator.clipboard?.writeText(k.email!)}>Copiar e-mail</button>}
    </section>}
    {!k && l && <section className="wz-ficha-bloco">
      <span className="wz-rot">Lead do cadastro</span>
      <dl>
        {l.parceiro && <div><dt>Veio de</dt><dd>/{l.parceiro}</dd></div>}
        {l.temperatura && <div><dt>Temperatura</dt><dd>{l.temperatura.replace(/^./, (x) => x.toUpperCase())}</dd></div>}
        {l.campanha && <div><dt>Campanha</dt><dd className="quebra">{l.campanha}</dd></div>}
        <div><dt>Aceitou receber</dt><dd className={l.consentiu ? 'ok' : 'alerta'}>{l.consentiu ? 'Sim' : 'Não informado'}</dd></div>
        {l.criadoEm && <div><dt>Cadastro</dt><dd>{dataCurta(l.criadoEm)}</dd></div>}
      </dl>
      <small className="wz-ficha-dica">Ainda não tem conta na plataforma.</small>
    </section>}
    {ficha !== undefined && !k && !l && <section className="wz-ficha-bloco"><span className="wz-rot">Cadastro</span><small className="wz-ficha-dica">Não achamos um cadastro nem um lead com este número. Pode ser alguém que ainda não se cadastrou, ou que usou outro telefone.</small></section>}

    <section className="wz-ficha-bloco">
      <span className="wz-rot">Atendimento</span>
      <dl>
        <div><dt>Janela</dt><dd className={j.aberta ? 'ok' : 'alerta'}>{j.aberta ? textoDaJanela(j.restaMs).replace(/^./, (x) => x.toUpperCase()) : 'Fechada · só modelo'}</dd></div>
        <div><dt>Responsável</dt><dd>{contato.responsavel ? (contato.responsavel === api.euId ? 'Você' : equipe.find((p) => p.id === contato.responsavel)?.nome ?? 'Equipe') : 'Ninguém'}</dd></div>
        <div><dt>Primeiro contato</dt><dd>{dataCurta(contato.criadoEm)}</dd></div>
      </dl>
      <span className="wz-rot">Etiquetas</span>
      <div className="wz-etiquetas">
        {contato.etiquetas.map((e) => <span key={e}>{e}<button onClick={() => void api.mudarContato(contato.id, { etiquetas: contato.etiquetas.filter((x) => x !== e) })} aria-label={`Tirar ${e}`}>×</button></span>)}
        <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEtiqueta() } }} onBlur={addEtiqueta} placeholder="+ Etiqueta" aria-label="Nova etiqueta" maxLength={24} />
      </div>
    </section>
  </aside>
}

/* ================================================================ janelas */
function NovaConversa({ api, onFechar, onCriada }: { api: WhatsAppApi; onFechar: () => void; onCriada: (id: string) => void }) {
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

function GerirRespostas({ api, respostas, onFechar, onMudou }: { api: WhatsAppApi; respostas: RespostaPronta[]; onFechar: () => void; onMudou: () => void }) {
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

function Conexao({ api, estado, onFechar, onMudou }: { api: WhatsAppApi; estado: EstadoWpp; onFechar: () => void; onMudou: () => void }) {
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

function Janela({ titulo, subtitulo, onFechar, children, largo }: { titulo: string; subtitulo?: string; onFechar: () => void; children: ReactNode; largo?: boolean }) {
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f) }, [onFechar])
  return <div className="wz-fundo" role="dialog" aria-modal="true" aria-label={titulo} onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar() }}>
    <div className={`wz-janela-caixa ${largo ? 'largo' : ''}`}>
      <header><div><h3>{titulo}</h3>{subtitulo && <p>{subtitulo}</p>}</div><button className="wz-icone-btn" onClick={onFechar} aria-label="Fechar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button></header>
      <div className="wz-janela-corpo">{children}</div>
    </div>
  </div>
}

/* ================================================================ peças */
const TONS = ['#B78D39', '#5B7FA6', '#3E8E7E', '#9C6B9E', '#C2724F', '#4F6179', '#8A7A3B']
function Avatar({ nome, grande }: { nome: string; grande?: boolean }) {
  let h = 0; for (const ch of nome) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const iniciais = nome.replace(/^\+/, '').split(/\s+/).filter((p) => /\p{L}/u.test(p)).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '#'
  return <span className={`wz-avatar ${grande ? 'grande' : ''}`} style={{ ['--tom' as string]: TONS[h % TONS.length] }} aria-hidden>{iniciais}</span>
}
function Tique({ status, pequeno }: { status: MensagemWpp['status']; pequeno?: boolean }) {
  const cls = `wz-tique ${status} ${pequeno ? 'pequeno' : ''}`
  if (status === 'pendente') return <svg className={cls} viewBox="0 0 24 24" aria-label="Enviando"><path d="M12 7v5l3 2M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z" /></svg>
  if (status === 'falhou') return <svg className={cls} viewBox="0 0 24 24" aria-label="Não enviada"><path d="M12 7v6M12 16.5v.5M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z" /></svg>
  if (status === 'enviada') return <svg className={cls} viewBox="0 0 24 24" aria-label="Enviada"><path d="M5 12.5l4 4L19 7" /></svg>
  return <svg className={cls} viewBox="0 0 24 24" aria-label={status === 'lida' ? 'Lida' : 'Entregue'}><path d="M2.5 12.5l4 4L16 7M10.5 16.5L21 6" /></svg>
}
function IconeWpp() { return <svg viewBox="0 0 24 24"><path d="M4.2 19.8l1.2-3.9A8.2 8.2 0 1 1 8.4 18.7zM9.2 8.4c.2-.5.9-.6 1.2-.1l.8 1.4c.2.3.1.7-.2.9l-.5.4c.5 1.1 1.3 1.9 2.4 2.4l.4-.5c.2-.3.6-.4.9-.2l1.4.8c.5.3.4 1-.1 1.2-2.9 1.3-7.6-3.4-6.3-6.3z" /></svg> }
function ListaCarregando() { return <>{Array.from({ length: 6 }, (_, i) => <div key={i} className="wz-item esqueleto"><span className="wz-avatar" /><span className="wz-item-meio"><i /><i /></span></div>)}</> }

/** *negrito*, _itálico_, ~riscado~ e links, como o WhatsApp mostra. */
function formatar(texto: string): ReactNode[] {
  const saida: ReactNode[] = []
  const partes = texto.split(/(https?:\/\/[^\s]+)/g)
  partes.forEach((p, i) => {
    if (/^https?:\/\//.test(p)) { saida.push(<a key={i} href={p} target="_blank" rel="noreferrer noopener">{p.length > 60 ? `${p.slice(0, 57)}…` : p}</a>); return }
    const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g
    let ultimo = 0, m: RegExpExecArray | null, k = 0
    while ((m = re.exec(p))) {
      if (m.index > ultimo) saida.push(p.slice(ultimo, m.index))
      const dentro = m[0].slice(1, -1)
      saida.push(m[0][0] === '*' ? <b key={`${i}-${k++}`}>{dentro}</b> : m[0][0] === '_' ? <em key={`${i}-${k++}`}>{dentro}</em> : <s key={`${i}-${k++}`}>{dentro}</s>)
      ultimo = m.index + m[0].length
    }
    if (ultimo < p.length) saida.push(p.slice(ultimo))
  })
  return saida
}

const rotuloDoTipo = (t: string) => ({ imagem: '📷 Foto', audio: '🎤 Áudio', video: '🎬 Vídeo', documento: '📄 Arquivo', figurinha: 'Figurinha', localizacao: '📍 Localização' } as Record<string, string>)[t] ?? 'Mensagem'
const horaCurta = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
const tamanho = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
function horaOuDia(iso: string): string {
  const d = new Date(iso), hoje = new Date()
  if (d.toDateString() === hoje.toDateString()) return horaCurta(iso)
  if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
function diaDaMensagem(iso: string): string {
  const d = new Date(iso), hoje = new Date()
  if (d.toDateString() === hoje.toDateString()) return 'Hoje'
  if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return 'Ontem'
  const r = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  return r.charAt(0).toUpperCase() + r.slice(1)
}
function haQuanto(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.round(s / 60)} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  const dd = Math.round(s / 86400)
  return `há ${dd} dia${dd > 1 ? 's' : ''}`
}
