/**
 * Administração › WhatsApp (05/11/2026). O WhatsApp oficial do Naor dentro do ADM.
 *
 * Tiago: "quero layout semelhante ao do whatsapp oficial mas claro que com as
 * funções extras que teremos nesse crm de atendimento". Então: a cara do WhatsApp
 * Web (lista, papel de parede, balões com ponta, tique azul, emojis, "+" de anexos,
 * microfone, busca na conversa, dados do contato com mídia) e, por cima, o que um
 * atendimento precisa: responsável, resolver, etiquetas, notas internas, respostas
 * prontas, modelos aprovados, a regra das 24 horas e a ficha do cliente na plataforma.
 *
 * Antes de conectar o número, a central abre com conversas de EXEMPLO (marcadas).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import {
  whatsappDoBanco, whatsappDeExemplo, janela, textoDaJanela, telefoneBonito, nomeDoContato, conferirArquivo,
  LIMITE_LEGIVEL, QUALIDADE_LEGIVEL, POR_PAGINA,
  type WhatsAppApi, type EstadoWpp, type ContatoWpp, type MensagemWpp, type RespostaPronta, type ModeloWpp, type FichaWpp,
  type PessoaDaEquipe, type MidiaWpp, type ArquivosDoContato,
} from '../../core/teeds/whatsapp'
import { EscolherModelo, NovaConversa, GerirRespostas, Conexao } from './JanelasWpp'
import { GaleriaDoContato, Visualizador, FaixaDeMidias, NotasDoContato } from './MidiasDoContato'
import { formatar, soEmoji, rotuloDoTipo, horaCurta, dataCurta, dataEHora, tamanho, duracao, horaOuDia, diaDaMensagem, haQuanto, corDaEtiqueta, EMOJIS, REACOES } from './textoWpp'
import './central-whatsapp.css'

type Filtro = 'todas' | 'nao-lidas' | 'minhas' | 'sem-dono' | 'resolvidas'

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
      <span className="wz-faixa-icone"><I.whats /></span>
      <div><b>{c?.situacao === 'erro' ? 'O WhatsApp oficial desconectou' : 'Falta conectar o WhatsApp oficial'}</b>
        <small>{c?.situacao === 'erro' && c.erro ? c.erro : 'As conversas abaixo são de exemplo, para você ver como funciona. Nada é enviado.'}</small></div>
      {estado.podeConectar ? <button className="wz-btn ouro" onClick={onAbrir}>Conectar o WhatsApp</button> : <small className="wz-faixa-quem">Quem conecta é o administrador geral ou o dono do número.</small>}
    </div>
  }
  const q = c?.qualidade ? QUALIDADE_LEGIVEL[c.qualidade] : null
  return <div className="wz-faixa ok">
    <span className="wz-faixa-icone"><I.whats /></span>
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
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [etiquetaFiltro, setEtiquetaFiltro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [equipe, setEquipe] = useState<PessoaDaEquipe[]>([])
  const [respostas, setRespostas] = useState<RespostaPronta[]>([])
  const [modelos, setModelos] = useState<ModeloWpp[]>([])
  const [aoVivo, setAoVivo] = useState(false)
  const [dadosAbertos, setDadosAbertos] = useState(() => (typeof window !== 'undefined' ? window.innerWidth > 1320 : true))
  const [novaConversa, setNovaConversa] = useState(false)
  const [gerirRespostas, setGerirRespostas] = useState(false)
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({})
  const [naoLidasAoAbrir, setNaoLidasAoAbrir] = useState<Record<string, number>>({})
  const [visor, setVisor] = useState<{ itens: MensagemWpp[]; inicial: string } | null>(null)
  const [irPara, setIrPara] = useState<{ id: string; vez: number } | null>(null)
  const mostrarNaConversa = (m: MensagemWpp) => { setVisor(null); if (typeof window !== 'undefined' && window.innerWidth <= 1320) setDadosAbertos(false); setIrPara({ id: m.id, vez: Date.now() }) }
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
          return i >= 0 ? lista.map((c) => (c.id === m.item.id ? m.item : c)) : [m.item, ...lista]
        })
        if (m.item.id === abertoRef.current && m.item.naoLidas > 0 && document.visibilityState === 'visible') void api.ler(m.item.id)
      } else {
        setMsgs((t) => {
          const l = t[m.item.contatoId]
          if (!l) return t
          const i = l.findIndex((x) => x.id === m.item.id)
          let nova = i >= 0 ? l.map((x) => (x.id === m.item.id ? m.item : x)) : [...l, m.item]
          if (i < 0 && m.item.direcao !== 'entrada') nova = nova.filter((x) => !(x.enviando && x.texto === m.item.texto && x.direcao === m.item.direcao))
          return { ...t, [m.item.contatoId]: nova }
        })
      }
    }, setAoVivo)
    const relogio = setInterval(() => setRelogio((n) => n + 1), 60_000)
    return () => { vivo = false; parar(); clearInterval(relogio) }
  }, [api])

  // a contagem na aba do navegador, como o WhatsApp Web faz
  const totalNaoLidas = (contatos ?? []).reduce((s, c) => s + (c.naoLidas > 0 ? 1 : 0), 0)
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '')
    document.title = totalNaoLidas ? `(${totalNaoLidas}) ${base}` : base
    return () => { document.title = document.title.replace(/^\(\d+\)\s*/, '') }
  }, [totalNaoLidas])

  const abrir = useCallback(async (id: string) => {
    setAberto(id)
    const c = contatos?.find((x) => x.id === id)
    setNaoLidasAoAbrir((t) => ({ ...t, [id]: c?.naoLidas ?? 0 }))
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

  const enviar = useCallback(async (id: string, provisoria: Partial<MensagemWpp>, fazer: () => Promise<unknown>) => {
    const tmp: MensagemWpp = { id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, contatoId: id, wamid: null, direcao: 'saida', tipo: 'texto', texto: null, midia: null, modelo: null, citando: null, reacao: null, reacaoEquipe: null, status: 'pendente', erro: null, autor: api.euId, criadoEm: new Date().toISOString(), enviando: true, ...provisoria }
    setMsgs((t) => ({ ...t, [id]: [...(t[id] ?? []), tmp] }))
    try {
      await fazer()
      setMsgs((t) => ({ ...t, [id]: (t[id] ?? []).filter((x) => x.id !== tmp.id) }))
      if (!api.exemplo) await recarregar(id)
    } catch (e) {
      setMsgs((t) => ({ ...t, [id]: (t[id] ?? []).map((x) => (x.id === tmp.id ? { ...x, enviando: false, falhouAqui: (e as Error).message, status: 'falhou' } : x)) }))
    }
  }, [api, recarregar])

  const todasEtiquetas = useMemo(() => [...new Set((contatos ?? []).flatMap((c) => c.etiquetas))].sort(), [contatos])
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase(), qd = q.replace(/\D/g, '')
    return (contatos ?? []).filter((c) => {
      if (q && !(nomeDoContato(c).toLowerCase().includes(q) || (qd.length >= 3 && c.waId.includes(qd)) || c.etiquetas.some((e) => e.toLowerCase().includes(q)) || (c.ultimaTexto ?? '').toLowerCase().includes(q))) return false
      if (etiquetaFiltro && !c.etiquetas.includes(etiquetaFiltro)) return false
      if (filtro === 'todas') return c.situacao === 'aberta'
      if (filtro === 'nao-lidas') return c.naoLidas > 0
      if (filtro === 'minhas') return c.responsavel === api.euId && c.situacao === 'aberta'
      if (filtro === 'sem-dono') return !c.responsavel && c.situacao === 'aberta'
      return c.situacao === 'resolvida'
    }).sort((a, b) => Number(b.fixada) - Number(a.fixada) || (b.ultimaEm ?? b.criadoEm).localeCompare(a.ultimaEm ?? a.criadoEm))
  }, [contatos, busca, filtro, etiquetaFiltro, api.euId])
  const contagem = useMemo(() => {
    const l = contatos ?? []
    return {
      todas: l.filter((c) => c.situacao === 'aberta').length, 'nao-lidas': l.filter((c) => c.naoLidas > 0).length,
      minhas: l.filter((c) => c.responsavel === api.euId && c.situacao === 'aberta').length, 'sem-dono': l.filter((c) => !c.responsavel && c.situacao === 'aberta').length,
      resolvidas: l.filter((c) => c.situacao === 'resolvida').length,
    }
  }, [contatos, api.euId])

  const contato = contatos?.find((c) => c.id === aberto) ?? null
  const nomeDe = (id: string | null) => (id ? (id === api.euId ? 'Você' : equipe.find((p) => p.id === id)?.nome ?? 'Equipe') : null)
  const mudar = (id: string, c: Parameters<WhatsAppApi['mudarContato']>[1]) => {
    setContatos((l) => (l ?? []).map((x) => (x.id === id ? { ...x, ...c } : x)))
    void api.mudarContato(id, c)
  }

  return <div className={`wz-mesa ${aberto ? 'com-conversa' : ''} ${dadosAbertos && contato ? 'com-dados' : ''}`}>
    <aside className="wz-lista" aria-label="Conversas">
      <header className="wz-lista-topo">
        <h2>Conversas{api.exemplo && <span className="wz-selo-exemplo">Exemplo</span>}</h2>
        <div className="wz-lista-acoes">
          {!api.exemplo && <span className={`wz-vivo ${aoVivo ? 'on' : ''}`} title={aoVivo ? 'Recebendo ao vivo' : 'Reconectando…'}><i /></span>}
          <button className="wz-icone-btn" onClick={() => setGerirRespostas(true)} title="Respostas prontas" aria-label="Respostas prontas"><I.raio /></button>
          <button className="wz-icone-btn" onClick={() => setNovaConversa(true)} title="Nova conversa" aria-label="Nova conversa"><I.nova /></button>
        </div>
      </header>
      <label className="wz-busca"><I.lupa /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar ou começar uma nova conversa" aria-label="Pesquisar conversa" />{busca && <button onClick={() => setBusca('')} aria-label="Limpar busca"><I.x /></button>}</label>
      <div className="wz-filtros" role="tablist" aria-label="Filtrar conversas">
        {([['todas', 'Abertas'], ['nao-lidas', 'Não lidas'], ['minhas', 'Minhas'], ['sem-dono', 'Sem dono'], ['resolvidas', 'Resolvidas']] as const).map(([id, nome]) =>
          <button key={id} role="tab" aria-selected={filtro === id} className={filtro === id ? 'on' : ''} onClick={() => setFiltro(id)}>{nome}{contagem[id] > 0 && id !== 'resolvidas' && <b>{contagem[id]}</b>}</button>)}
      </div>
      {todasEtiquetas.length > 0 && <div className="wz-filtro-etiquetas">
        {todasEtiquetas.map((e) => <button key={e} className={etiquetaFiltro === e ? 'on' : ''} style={{ ['--cor' as string]: corDaEtiqueta(e) }} onClick={() => setEtiquetaFiltro((x) => (x === e ? null : e))}><i />{e}</button>)}
      </div>}
      <div className="wz-itens">
        {contatos === null && <ListaCarregando />}
        {contatos !== null && !lista.length && <div className="wz-vazio-lista">
          {busca || etiquetaFiltro ? <><b>Nada encontrado</b><small>Confira o nome, o número ou a etiqueta.</small>{busca.replace(/\D/g, '').length >= 10 && <button className="wz-btn" onClick={() => setNovaConversa(true)}>Conversar com {busca}</button>}</>
            : filtro === 'nao-lidas' ? <><b>Tudo lido ✓</b><small>Nenhuma conversa esperando resposta.</small></>
            : filtro === 'minhas' ? <><b>Nenhuma conversa sua</b><small>Assuma uma conversa no topo dela para ela aparecer aqui.</small></>
            : filtro === 'sem-dono' ? <><b>Todas têm responsável</b><small>Nenhuma conversa aberta sem dono.</small></>
            : filtro === 'resolvidas' ? <><b>Nenhuma resolvida</b><small>Quando terminar um atendimento, toque em "Resolver".</small></>
            : <><b>Nenhuma conversa ainda</b><small>Quando alguém mandar mensagem para o número, ela aparece aqui na hora.</small></>}
        </div>}
        {lista.map((c) => <ItemDaLista key={c.id} c={c} ativo={c.id === aberto} rascunho={c.id !== aberto ? rascunhos[c.id] : undefined} nomeDe={nomeDe} onAbrir={() => void abrir(c.id)} onMudar={(x) => mudar(c.id, x)} />)}
      </div>
    </aside>

    <main className="wz-centro">
      {contato
        ? <Conversa key={contato.id} api={api} estado={estado} contato={contato} mensagens={msgs[contato.id] ?? null} temMais={!tudo[contato.id]}
            equipe={equipe} respostas={respostas} modelos={modelos} nomeDe={nomeDe} naoLidasAoAbrir={naoLidasAoAbrir[contato.id] ?? 0}
            rascunho={rascunhos[contato.id] ?? ''} onRascunho={(t) => setRascunhos((r) => ({ ...r, [contato.id]: t }))}
            irPara={irPara} onAbrirMidia={(m, itens) => setVisor({ itens, inicial: m.id })}
            onVoltar={() => setAberto(null)} onDados={() => setDadosAbertos((v) => !v)} dadosAbertos={dadosAbertos} onMudar={(x) => mudar(contato.id, x)}
            onMaisAntigas={() => void maisAntigas(contato.id)} onEnviar={(p, f) => void enviar(contato.id, p, f)}
            onNota={async (t) => { const m = await api.nota(contato.id, t); setMsgs((x) => ({ ...x, [contato.id]: (x[contato.id] ?? []).some((y) => y.id === m.id) ? x[contato.id] : [...(x[contato.id] ?? []), m] })) }}
            onReagir={(m, emoji) => {
              setMsgs((t) => ({ ...t, [contato.id]: (t[contato.id] ?? []).map((x) => (x.id === m.id ? { ...x, reacaoEquipe: emoji || null } : x)) }))
              void api.reagir(contato.id, m.wamid!, emoji).catch(() => setMsgs((t) => ({ ...t, [contato.id]: (t[contato.id] ?? []).map((x) => (x.id === m.id ? { ...x, reacaoEquipe: m.reacaoEquipe } : x)) })))
            }}
            onModelosMudaram={setModelos} onRespostas={() => setGerirRespostas(true)} onRepetir={(m) => {
              setMsgs((t) => ({ ...t, [contato.id]: (t[contato.id] ?? []).filter((x) => x.id !== m.id) }))
              if (m.tipo === 'texto' && m.texto) void enviar(contato.id, { texto: m.texto, citando: m.citando }, () => api.enviarTexto(contato.id, m.texto!, m.citando))
            }} />
        : <BoasVindas exemplo={api.exemplo} />}
    </main>

    {contato && dadosAbertos && <DadosDoContato key={contato.id} api={api} contato={contato} equipe={equipe} mensagens={msgs[contato.id] ?? []} nomeDe={nomeDe}
      onFechar={() => setDadosAbertos(false)} onMudar={(x) => mudar(contato.id, x)} onAbrirMidia={(m, itens) => setVisor({ itens, inicial: m.id })} onMostrar={mostrarNaConversa} />}
    {contato && visor && <Visualizador api={api} contato={contato} itens={visor.itens} inicial={visor.inicial} nomeDe={nomeDe} onFechar={() => setVisor(null)} onMostrar={mostrarNaConversa} />}

    {novaConversa && <NovaConversa api={api} onFechar={() => setNovaConversa(false)} onCriada={(id) => { setNovaConversa(false); setFiltro('todas'); setBusca(''); void api.contatos().then(setContatos).then(() => void abrir(id)) }} />}
    {gerirRespostas && <GerirRespostas api={api} respostas={respostas} onFechar={() => setGerirRespostas(false)} onMudou={() => void api.respostas().then(setRespostas)} />}
  </div>
}

function BoasVindas({ exemplo }: { exemplo: boolean }) {
  return <div className="wz-sem-conversa">
    <div className="wz-sem-conversa-arte" aria-hidden><span className="a" /><span className="b" /><I.whats /></div>
    <h3>{exemplo ? 'Veja como fica o atendimento' : 'GlobalFly no WhatsApp'}</h3>
    <p>{exemplo ? 'Abra uma conversa de exemplo à esquerda: responda, mande foto, grave um áudio, use uma resposta pronta (/) ou um modelo. Quando o número estiver conectado, as conversas de verdade aparecem aqui.' : 'Responda por aqui e o cliente recebe no WhatsApp dele, do número oficial. Toda a equipe vê a mesma conversa, ao vivo.'}</p>
    <ul><li><kbd>Enter</kbd> envia · <kbd>Shift</kbd> + <kbd>Enter</kbd> pula linha</li><li><kbd>/</kbd> abre as respostas prontas</li><li>Arraste uma foto ou um PDF para dentro da conversa</li></ul>
    <small className="wz-cadeado"><I.cadeado /> Conversas guardadas na plataforma. Só a equipe autorizada vê.</small>
  </div>
}

function ItemDaLista({ c, ativo, rascunho, nomeDe, onAbrir, onMudar }: {
  c: ContatoWpp; ativo: boolean; rascunho?: string; nomeDe: (id: string | null) => string | null
  onAbrir: () => void; onMudar: (c: Parameters<WhatsAppApi['mudarContato']>[1]) => void
}) {
  const [menu, setMenu] = useState(false)
  const j = janela(c)
  return <div className={`wz-item ${ativo ? 'on' : ''} ${c.naoLidas ? 'nao-lida' : ''}`} onMouseLeave={() => setMenu(false)}>
    <button className="wz-item-corpo" onClick={onAbrir}>
      <Avatar nome={nomeDoContato(c)} />
      <span className="wz-item-meio">
        <span className="wz-item-topo"><b>{nomeDoContato(c)}</b><time>{c.ultimaEm ? horaOuDia(c.ultimaEm) : ''}</time></span>
        <span className="wz-item-baixo">
          <span className="wz-item-ultima">
            {rascunho?.trim() ? <><em className="wz-rascunho">Rascunho:</em> {rascunho}</>
              : <>{c.ultimaDirecao === 'saida' && <Tique status="lida" pequeno />}{c.ultimaTexto ?? 'Sem mensagens ainda'}</>}
          </span>
          <span className="wz-item-icones">
            {c.fixada && <I.alfinete title="Fixada" />}
            {c.naoLidas > 0 && <em className="wz-nao-lidas" aria-label={`${c.naoLidas} não lidas`}>{c.naoLidas}</em>}
          </span>
        </span>
        {(c.etiquetas.length > 0 || c.responsavel || (!j.aberta && c.situacao === 'aberta')) && <span className="wz-item-selos">
          {!j.aberta && c.situacao === 'aberta' && <i className="fechada" title="Janela de 24 horas fechada: só modelo aprovado"><I.relogio />Só modelo</i>}
          {c.responsavel && <i className="dono"><I.pessoa />{nomeDe(c.responsavel)}</i>}
          {c.etiquetas.slice(0, 2).map((e) => <i key={e} className="etq" style={{ ['--cor' as string]: corDaEtiqueta(e) }}>{e}</i>)}
          {c.etiquetas.length > 2 && <i>+{c.etiquetas.length - 2}</i>}
        </span>}
      </span>
    </button>
    <button className={`wz-item-seta ${menu ? 'on' : ''}`} onClick={() => setMenu((v) => !v)} aria-label="Opções da conversa" aria-expanded={menu}><I.seta /></button>
    {menu && <div className="wz-menu wz-menu-item" role="menu">
      <button role="menuitem" onClick={() => { onMudar({ fixada: !c.fixada }); setMenu(false) }}><I.alfinete />{c.fixada ? 'Desafixar' : 'Fixar conversa'}</button>
      <button role="menuitem" onClick={() => { onMudar({ naoLidas: c.naoLidas ? 0 : 1 }); setMenu(false) }}><I.balao />{c.naoLidas ? 'Marcar como lida' : 'Marcar como não lida'}</button>
      <button role="menuitem" onClick={() => { onMudar({ situacao: c.situacao === 'aberta' ? 'resolvida' : 'aberta' }); setMenu(false) }}><I.certo />{c.situacao === 'aberta' ? 'Resolver' : 'Reabrir'}</button>
    </div>}
  </div>
}

/* ================================================================ conversa */
function Conversa(p: {
  api: WhatsAppApi; estado: EstadoWpp; contato: ContatoWpp; mensagens: MensagemWpp[] | null; temMais: boolean
  equipe: PessoaDaEquipe[]; respostas: RespostaPronta[]; modelos: ModeloWpp[]; nomeDe: (id: string | null) => string | null
  naoLidasAoAbrir: number; rascunho: string; onRascunho: (t: string) => void
  irPara: { id: string; vez: number } | null; onAbrirMidia: (m: MensagemWpp, itens: MensagemWpp[]) => void
  onVoltar: () => void; onDados: () => void; dadosAbertos: boolean; onMudar: (c: Parameters<WhatsAppApi['mudarContato']>[1]) => void
  onMaisAntigas: () => void; onEnviar: (provisoria: Partial<MensagemWpp>, fazer: () => Promise<unknown>) => void
  onNota: (texto: string) => Promise<void>; onReagir: (m: MensagemWpp, emoji: string) => void
  onModelosMudaram: (l: ModeloWpp[]) => void; onRespostas: () => void; onRepetir: (m: MensagemWpp) => void
}) {
  const { api, contato, mensagens } = p
  const [citando, setCitando] = useState<MensagemWpp | null>(null)
  const [escolhendoModelo, setEscolhendoModelo] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [soltou, setSoltou] = useState<File | null>(null)
  const [novasEmbaixo, setNovasEmbaixo] = useState(0)
  const [buscando, setBuscando] = useState(false)
  const [termo, setTermo] = useState('')
  const [achado, setAchado] = useState(0)
  const [menuTopo, setMenuTopo] = useState(false)
  const rolagem = useRef<HTMLDivElement>(null)
  const noFim = useRef(true)
  const qtd = useRef(0)
  const j = janela(contato)

  useEffect(() => {
    const el = rolagem.current
    if (!el || !mensagens) return
    const cresceu = mensagens.length > qtd.current
    const primeira = qtd.current === 0
    qtd.current = mensagens.length
    if (primeira) {
      // abre na primeira não lida, como o WhatsApp; senão, no fim
      requestAnimationFrame(() => {
        const marco = el.querySelector('.wz-marco-nao-lidas') as HTMLElement | null
        if (marco) el.scrollTop = marco.offsetTop - 80
        else el.scrollTop = el.scrollHeight
      })
    } else if (cresceu && noFim.current) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; setNovasEmbaixo(0) })
    else if (cresceu) setNovasEmbaixo((n) => n + 1)
  }, [mensagens])

  const porWamid = useMemo(() => new Map((mensagens ?? []).filter((m) => m.wamid).map((m) => [m.wamid!, m])), [mensagens])
  // o marco "N mensagens não lidas" fica onde estava quando a conversa abriu
  const marco = useRef<string | null | undefined>(undefined)
  if (marco.current === undefined && mensagens) {
    const entradas = mensagens.filter((m) => m.direcao === 'entrada')
    marco.current = p.naoLidasAoAbrir ? entradas[Math.max(0, entradas.length - p.naoLidasAoAbrir)]?.id ?? null : null
  }
  const idPrimeiraNaoLida = marco.current ?? null
  const blocos = useMemo(() => {
    const saida: Array<{ dia: string; itens: MensagemWpp[] }> = []
    for (const m of mensagens ?? []) {
      const dia = diaDaMensagem(m.criadoEm)
      if (saida[saida.length - 1]?.dia !== dia) saida.push({ dia, itens: [] })
      saida[saida.length - 1].itens.push(m)
    }
    return saida
  }, [mensagens])

  // "Mostrar na conversa" (da galeria ou do visualizador): rola até a mensagem e ela pisca;
  // se ainda não estiver carregada, busca as mais antigas até achar
  useEffect(() => {
    if (!p.irPara || !mensagens) return
    const el = rolagem.current?.querySelector(`[data-msg="${p.irPara.id}"]`) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.classList.remove('wz-piscar'); void el.offsetWidth; el.classList.add('wz-piscar')
    } else if (p.temMais && mensagens.length >= POR_PAGINA) p.onMaisAntigas()
  }, [p.irPara?.vez, mensagens]) // eslint-disable-line react-hooks/exhaustive-deps

  // busca dentro da conversa
  const achados = useMemo(() => {
    const t = termo.trim().toLowerCase()
    if (t.length < 2) return [] as string[]
    return (mensagens ?? []).filter((m) => (m.texto ?? '').toLowerCase().includes(t) || (m.midia?.nome ?? '').toLowerCase().includes(t)).map((m) => m.id)
  }, [termo, mensagens])
  useEffect(() => { setAchado(achados.length ? achados.length - 1 : 0) }, [achados.length])
  useEffect(() => {
    const id = achados[achado]
    if (!id) return
    rolagem.current?.querySelector(`[data-msg="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [achado, achados])

  return <section className={`wz-conversa ${arrastando ? 'arrastando' : ''}`}
    onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastando(true) } }}
    onDragLeave={(e) => { if (e.currentTarget === e.target) setArrastando(false) }}
    onDrop={(e) => { e.preventDefault(); setArrastando(false); const f = e.dataTransfer.files?.[0]; if (f) setSoltou(f) }}>
    <header className="wz-conversa-topo">
      <button className="wz-voltar" onClick={p.onVoltar} aria-label="Voltar para as conversas"><I.voltar /></button>
      <button className="wz-conversa-quem" onClick={p.onDados} title="Dados do contato">
        <Avatar nome={nomeDoContato(contato)} />
        <span>
          <b>{nomeDoContato(contato)}</b>
          <small><span className="wz-tel">{telefoneBonito(contato.waId)}</span><span className={`wz-janela ${j.aberta ? 'aberta' : 'fechada'}`}><i />{j.aberta ? <>Janela aberta · {textoDaJanela(j.restaMs)}</> : <>Janela de 24 h fechada</>}</span></small>
        </span>
      </button>
      <div className="wz-conversa-acoes">
        <label className="wz-dono" title="Quem cuida desta conversa">
          <I.pessoa />
          <select value={contato.responsavel ?? ''} onChange={(e) => p.onMudar({ responsavel: e.target.value || null })} aria-label="Responsável pela conversa">
            <option value="">Sem responsável</option>
            {p.equipe.map((x) => <option key={x.id} value={x.id}>{x.id === api.euId ? 'Você' : x.nome}</option>)}
          </select>
        </label>
        {contato.situacao === 'aberta'
          ? <button className="wz-btn resolver" onClick={() => p.onMudar({ situacao: 'resolvida' })}><I.certo /><span className="wz-btn-texto">Resolver</span></button>
          : <button className="wz-btn" onClick={() => p.onMudar({ situacao: 'aberta' })}><span className="wz-btn-texto">Reabrir</span></button>}
        <button className={`wz-icone-btn ${buscando ? 'on' : ''}`} onClick={() => { setBuscando((v) => !v); setTermo('') }} title="Pesquisar na conversa" aria-label="Pesquisar na conversa"><I.lupa /></button>
        <span className="wz-menu-ancora">
          <button className={`wz-icone-btn ${menuTopo ? 'on' : ''}`} onClick={() => setMenuTopo((v) => !v)} aria-label="Mais opções" aria-expanded={menuTopo}><I.mais /></button>
          {menuTopo && <div className="wz-menu" role="menu" onMouseLeave={() => setMenuTopo(false)}>
            <button role="menuitem" onClick={() => { p.onDados(); setMenuTopo(false) }}><I.pessoa />Dados do contato</button>
            <button role="menuitem" onClick={() => { p.onMudar({ fixada: !contato.fixada }); setMenuTopo(false) }}><I.alfinete />{contato.fixada ? 'Desafixar conversa' : 'Fixar conversa'}</button>
            <button role="menuitem" onClick={() => { p.onMudar({ naoLidas: 1 }); setMenuTopo(false); p.onVoltar() }}><I.balao />Marcar como não lida</button>
            <button role="menuitem" onClick={() => { setEscolhendoModelo(true); setMenuTopo(false) }}><I.modelo />Mandar modelo aprovado</button>
            <button role="menuitem" onClick={() => { void navigator.clipboard?.writeText(telefoneBonito(contato.waId)); setMenuTopo(false) }}><I.copiar />Copiar número</button>
          </div>}
        </span>
      </div>
    </header>
    {buscando && <div className="wz-busca-conversa">
      <I.lupa />
      <input autoFocus value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Pesquisar nesta conversa" aria-label="Pesquisar nesta conversa"
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setAchado((a) => (e.shiftKey ? Math.min(achados.length - 1, a + 1) : Math.max(0, a - 1))) } if (e.key === 'Escape') { setBuscando(false); setTermo('') } }} />
      <small>{termo.trim().length >= 2 ? (achados.length ? `${achados.length - achado} de ${achados.length}` : 'Nada encontrado') : ''}</small>
      <button className="wz-icone-btn" disabled={!achados.length} onClick={() => setAchado((a) => Math.max(0, a - 1))} aria-label="Anterior"><I.cima /></button>
      <button className="wz-icone-btn" disabled={!achados.length} onClick={() => setAchado((a) => Math.min(achados.length - 1, a + 1))} aria-label="Próximo"><I.baixo /></button>
      <button className="wz-icone-btn" onClick={() => { setBuscando(false); setTermo('') }} aria-label="Fechar pesquisa"><I.x /></button>
    </div>}

    <div className="wz-mensagens" ref={rolagem} onScroll={(e) => {
      const el = e.currentTarget
      noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      if (noFim.current && novasEmbaixo) setNovasEmbaixo(0)
      if (el.scrollTop < 40 && p.temMais && mensagens && mensagens.length >= POR_PAGINA) p.onMaisAntigas()
    }}>
      <div className="wz-mensagens-trilho">
        {mensagens === null && <div className="wz-carregando pequeno"><i />Carregando a conversa…</div>}
        {mensagens && p.temMais && mensagens.length >= POR_PAGINA && <button className="wz-mais" onClick={p.onMaisAntigas}>Ver mensagens anteriores</button>}
        {mensagens && <div className="wz-aviso-cripto"><I.cadeado />As mensagens chegam pelo WhatsApp oficial da Meta e ficam guardadas na plataforma. Só a equipe autorizada vê esta conversa.</div>}
        {mensagens && !mensagens.length && <div className="wz-conversa-vazia">
          <b>Conversa nova</b><small>{j.aberta ? 'Escreva a primeira mensagem.' : 'Para falar primeiro com alguém, o WhatsApp pede um modelo aprovado. Quando a pessoa responder, a conversa fica livre por 24 horas.'}</small>
        </div>}
        {blocos.map((b) => <div key={b.dia} className="wz-dia">
          <span className="wz-dia-rotulo">{b.dia}</span>
          {b.itens.map((m, i) => <div key={m.id} data-msg={m.id} className={achados[achado] === m.id ? 'wz-achado' : undefined}>
            {m.id === idPrimeiraNaoLida && <div className="wz-marco-nao-lidas">{p.naoLidasAoAbrir} mensage{p.naoLidasAoAbrir > 1 ? 'ns' : 'm'} não lida{p.naoLidasAoAbrir > 1 ? 's' : ''}</div>}
            <Balao m={m} anterior={b.itens[i - 1]} citada={m.citando ? porWamid.get(m.citando) ?? null : null} termo={buscando ? termo.trim() : ''}
              contato={contato} api={api} janelaAberta={j.aberta} nomeDe={p.nomeDe} onCitar={() => setCitando(m)} onRepetir={() => p.onRepetir(m)}
              onAmpliar={() => p.onAbrirMidia(m, (mensagens ?? []).filter((x) => (x.tipo === 'imagem' || x.tipo === 'video' || x.tipo === 'figurinha') && x.midia && !x.enviando))}
              onReagir={(emoji) => p.onReagir(m, emoji)} onIrPara={(w) => rolagem.current?.querySelector(`[data-msg="${porWamid.get(w)?.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })} />
          </div>)}
        </div>)}
      </div>
    </div>
    {novasEmbaixo > 0 && <button className="wz-descer" onClick={() => { const el = rolagem.current; if (el) el.scrollTop = el.scrollHeight; setNovasEmbaixo(0) }} aria-label="Ir para as mensagens novas"><b>{novasEmbaixo}</b><I.baixo /></button>}
    {arrastando && <div className="wz-soltar"><span><I.clipe /></span><b>Solte para anexar</b><small>Foto, vídeo, áudio ou PDF</small></div>}

    <Compositor key={contato.id} contato={contato} janelaAberta={j.aberta} respostas={p.respostas} citando={citando} arquivoSolto={soltou}
      rascunho={p.rascunho} onRascunho={p.onRascunho} onRespostas={p.onRespostas}
      onSoltouUsado={() => setSoltou(null)} onTirarCitacao={() => setCitando(null)} onModelo={() => setEscolhendoModelo(true)}
      onTexto={(t) => { const c = citando; setCitando(null); p.onEnviar({ texto: t, citando: c?.wamid ?? null }, () => api.enviarTexto(contato.id, t, c?.wamid ?? null)) }}
      onArquivo={(f, legenda) => {
        const c = citando; setCitando(null)
        const tipo = f.type.startsWith('image/') ? 'imagem' : f.type.startsWith('audio/') ? 'audio' : f.type.startsWith('video/') ? 'video' : 'documento'
        p.onEnviar({ tipo, texto: legenda || null, midia: { exemplo: tipo === 'imagem' || tipo === 'audio' ? URL.createObjectURL(f) : undefined, nome: f.name, mime: f.type, tamanho: f.size, voz: f.name.startsWith('audio-gravado') } }, () => api.enviarArquivo(contato.id, f, legenda, c?.wamid ?? null))
      }}
      onNota={p.onNota} />

    {escolhendoModelo && <EscolherModelo api={api} estado={p.estado} contato={contato} modelos={p.modelos} onModelos={p.onModelosMudaram} onFechar={() => setEscolhendoModelo(false)}
      onEnviar={(m, vars, texto) => { setEscolhendoModelo(false); p.onEnviar({ tipo: 'modelo', texto, modelo: { nome: m.nome, idioma: m.idioma } }, () => api.enviarModelo(contato.id, m, vars)) }} />}
  </section>
}

/* ================================================================ balão */
function Balao({ m, anterior, citada, termo, contato, api, janelaAberta, nomeDe, onCitar, onAmpliar, onRepetir, onReagir, onIrPara }: {
  m: MensagemWpp; anterior?: MensagemWpp; citada: MensagemWpp | null; termo: string; contato: ContatoWpp; api: WhatsAppApi; janelaAberta: boolean
  nomeDe: (id: string | null) => string | null; onCitar: () => void; onAmpliar: (url: string) => void; onRepetir: () => void
  onReagir: (emoji: string) => void; onIrPara: (wamid: string) => void
}) {
  const [menu, setMenu] = useState(false)
  const emSequencia = !!anterior && anterior.direcao === m.direcao && anterior.direcao !== 'nota' && new Date(m.criadoEm).getTime() - new Date(anterior.criadoEm).getTime() < 5 * 60_000
  if (m.direcao === 'nota') {
    return <div className="wz-nota"><span className="wz-nota-rot"><I.nota />Nota interna de {nomeDe(m.autor) ?? 'Equipe'} · o cliente não vê</span>
      <p>{formatar(m.texto ?? '', termo)}</p><time title={dataEHora(m.criadoEm)}>{horaCurta(m.criadoEm)}</time></div>
  }
  const sai = m.direcao === 'saida'
  const grande = m.tipo === 'texto' && soEmoji(m.texto)
  const midiaCheia = (m.tipo === 'imagem' || m.tipo === 'video' || m.tipo === 'figurinha') && !m.texto
  const quemCitada = citada ? (citada.direcao === 'entrada' ? nomeDoContato(contato) : 'Você') : null
  const reacoes = [m.reacao, m.reacaoEquipe].filter(Boolean) as string[]
  const podeReagir = !sai && !!m.wamid && janelaAberta
  return <div className={`wz-linha ${sai ? 'sai' : 'entra'} ${emSequencia ? 'seguida' : 'cauda'} ${reacoes.length ? 'com-reacao' : ''}`} onMouseLeave={() => setMenu(false)}>
    <div className={`wz-balao ${m.tipo} ${grande ? 'emoji' : ''} ${midiaCheia ? 'midia-cheia' : ''} ${m.falhouAqui || m.status === 'falhou' ? 'falhou' : ''}`}>
      {sai && m.autor && !emSequencia && <span className="wz-autor">{nomeDe(m.autor)}</span>}
      {m.tipo === 'modelo' && <span className="wz-modelo-rot"><I.modelo />Modelo · {m.modelo?.nome?.replace(/_/g, ' ')}</span>}
      {citada && <button className="wz-citada" onClick={() => citada.wamid && onIrPara(citada.wamid)}><b>{quemCitada}</b><span>{citada.texto || rotuloDoTipo(citada.tipo)}</span></button>}
      {m.midia && <Midia m={m} api={api} onAmpliar={onAmpliar} />}
      {m.texto && <p className={grande ? 'grande' : ''}>{formatar(m.texto, termo)}<span className="wz-espaco-pe" aria-hidden /></p>}
      <span className={`wz-pe ${midiaCheia ? 'sobre' : ''}`} title={dataEHora(m.criadoEm)}><time>{horaCurta(m.criadoEm)}</time>{sai && <Tique status={m.enviando ? 'pendente' : m.status} />}</span>
      {!m.enviando && !m.falhouAqui && <button className={`wz-balao-seta ${menu ? 'on' : ''}`} onClick={() => setMenu((v) => !v)} aria-label="Opções da mensagem" aria-expanded={menu}><I.seta /></button>}
      {menu && <div className={`wz-menu wz-menu-msg ${sai ? 'esq' : 'dir'}`} role="menu">
        {podeReagir && <div className="wz-reagir" role="group" aria-label="Reagir">{REACOES.map((e) => <button key={e} className={m.reacaoEquipe === e ? 'on' : ''} onClick={() => { onReagir(m.reacaoEquipe === e ? '' : e); setMenu(false) }} aria-label={`Reagir com ${e}`}>{e}</button>)}</div>}
        {m.wamid && <button role="menuitem" onClick={() => { onCitar(); setMenu(false) }}><I.responder />Responder</button>}
        {m.texto && <button role="menuitem" onClick={() => { void navigator.clipboard?.writeText(m.texto ?? ''); setMenu(false) }}><I.copiar />Copiar texto</button>}
        <div className="wz-menu-info"><small>{sai ? `Enviada por ${nomeDe(m.autor) ?? 'Equipe'}` : `Recebida`} · {dataEHora(m.criadoEm)}</small>{sai && <small>{({ pendente: 'Enviando…', enviada: 'Enviada', entregue: 'Entregue', lida: 'Lida pelo cliente', falhou: 'Não enviada', recebida: '' } as Record<string, string>)[m.status]}</small>}</div>
      </div>}
    </div>
    {reacoes.length > 0 && <span className="wz-reacao" title={[m.reacao && 'Reação do cliente', m.reacaoEquipe && 'Reação da equipe'].filter(Boolean).join(' · ')}>{reacoes.join('')}</span>}
    {(m.falhouAqui || (m.status === 'falhou' && m.erro)) && <div className="wz-falha"><I.alerta /><span>{m.falhouAqui ?? m.erro}</span>{m.falhouAqui && m.tipo === 'texto' && <button onClick={onRepetir}>Tentar de novo</button>}</div>}
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
    return <div className="wz-foto-espera"><I.foto />{falhou ? 'Não consegui abrir a foto' : pronto ? 'Abrindo a foto…' : 'Recebendo a foto…'}</div>
  }
  if (m.tipo === 'audio') return <Audio url={url} exemplo={midia.exemplo === 'audio'} duracaoExemplo={midia.duracao} falhou={falhou} voz={midia.voz !== false} sai={m.direcao === 'saida'} />
  if (m.tipo === 'video') {
    if (url) return <span className="wz-video-caixa"><video className="wz-video" controls preload="metadata" src={url} /><button className="wz-video-ampliar" onClick={() => onAmpliar(url)} aria-label="Abrir em tela cheia" title="Abrir em tela cheia"><I.ampliar /></button></span>
    return <div className="wz-foto-espera"><I.foto />{falhou ? 'Não consegui abrir o vídeo' : 'Recebendo o vídeo…'}</div>
  }
  const ext = (midia.nome?.split('.').pop() ?? 'doc').slice(0, 4).toUpperCase()
  return <a className={`wz-doc ${url ? '' : 'espera'}`} href={url ?? undefined} download={midia.nome ?? 'arquivo'} target="_blank" rel="noreferrer" onClick={(e) => { if (!url) e.preventDefault() }}>
    <span className={`wz-doc-icone ${ext === 'PDF' ? 'pdf' : ''}`}>{ext}</span>
    <span><b>{midia.nome ?? 'Arquivo'}</b><small>{ext}{midia.tamanho ? ` · ${tamanho(midia.tamanho)}` : ''}{falhou ? ' · não consegui abrir' : ''}</small></span>
    {url && <span className="wz-doc-baixar" aria-hidden><I.baixar /></span>}
  </a>
}

/** O áudio no jeito do WhatsApp: play, onda, tempo e velocidade 1x / 1,5x / 2x. */
function Audio({ url, exemplo, duracaoExemplo, falhou, voz, sai }: { url: string | null; exemplo: boolean; duracaoExemplo?: number; falhou: boolean; voz: boolean; sai: boolean }) {
  const el = useRef<HTMLAudioElement>(null)
  const [tocando, setTocando] = useState(false)
  const [pos, setPos] = useState(0)
  const [total, setTotal] = useState(duracaoExemplo ?? 0)
  const [vel, setVel] = useState(1)
  const barras = useMemo(() => Array.from({ length: 34 }, (_, i) => 22 + Math.abs(Math.sin(i * 1.7 + (url?.length ?? 3))) * 78), [url])
  const andamento = total ? pos / total : 0
  if (!url && !exemplo) return <div className="wz-audio espera"><I.mic />{falhou ? 'Não consegui abrir o áudio' : 'Recebendo o áudio…'}</div>
  const tocar = () => {
    const a = el.current
    if (!a) { setTocando((v) => !v); return }
    if (a.paused) void a.play(); else a.pause()
  }
  return <div className={`wz-audio ${sai ? 'sai' : ''}`}>
    {url && <audio ref={el} src={url} preload="metadata" onLoadedMetadata={(e) => setTotal(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
      onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)} onPlay={() => setTocando(true)} onPause={() => setTocando(false)} onEnded={() => { setTocando(false); setPos(0) }} />}
    {voz && <span className="wz-audio-foto" aria-hidden><I.mic /></span>}
    <button className="wz-audio-play" onClick={tocar} aria-label={tocando ? 'Pausar' : 'Tocar'} disabled={exemplo} title={exemplo ? 'Áudio de exemplo' : undefined}>{tocando ? <I.pausa /> : <I.play />}</button>
    <span className="wz-onda" onClick={(e) => { const a = el.current; if (!a || !total) return; const r = e.currentTarget.getBoundingClientRect(); a.currentTime = ((e.clientX - r.left) / r.width) * total }}>
      {barras.map((h, i) => <i key={i} className={i / barras.length < andamento ? 'on' : ''} style={{ height: `${h}%` }} />)}
    </span>
    <small>{duracao(tocando || pos ? pos : total)}</small>
    {url && <button className="wz-audio-vel" onClick={() => { const v = vel === 1 ? 1.5 : vel === 1.5 ? 2 : 1; setVel(v); if (el.current) el.current.playbackRate = v }} aria-label="Velocidade">{String(vel).replace('.', ',')}x</button>}
  </div>
}

/* ================================================================ compositor */
function Compositor({ contato, janelaAberta, respostas, citando, arquivoSolto, rascunho, onRascunho, onRespostas, onSoltouUsado, onTirarCitacao, onModelo, onTexto, onArquivo, onNota }: {
  contato: ContatoWpp; janelaAberta: boolean; respostas: RespostaPronta[]; citando: MensagemWpp | null; arquivoSolto: File | null
  rascunho: string; onRascunho: (t: string) => void; onRespostas: () => void
  onSoltouUsado: () => void; onTirarCitacao: () => void; onModelo: () => void
  onTexto: (t: string) => void; onArquivo: (f: File, legenda: string) => void; onNota: (t: string) => Promise<void>
}) {
  const [texto, setTextoInterno] = useState(rascunho)
  const setTexto = (t: string) => { setTextoInterno(t); onRascunho(t) }
  const [nota, setNota] = useState(!janelaAberta)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sel, setSel] = useState(0)
  const [painel, setPainel] = useState<'emoji' | 'mais' | null>(null)
  const [mostrarTravada, setMostrarTravada] = useState(!janelaAberta)
  const [gravando, setGravando] = useState<{ inicio: number; rec: MediaRecorder; partes: Blob[]; mime: string } | null>(null)
  const [, setTique] = useState(0)
  const campo = useRef<HTMLTextAreaElement>(null)
  const seletor = useRef<HTMLInputElement>(null)
  const seletorFoto = useRef<HTMLInputElement>(null)

  useEffect(() => { if (arquivoSolto) { escolher(arquivoSolto); onSoltouUsado() } }, [arquivoSolto]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = campo.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 148)}px` }, [texto])
  useEffect(() => { if (citando) { setNota(false); campo.current?.focus() } }, [citando])
  useEffect(() => { if (!janelaAberta) setNota(true); else setMostrarTravada(false) }, [janelaAberta])
  useEffect(() => { if (!gravando) return; const t = setInterval(() => setTique((n) => n + 1), 250); return () => clearInterval(t) }, [gravando])
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa) }, [previa])

  const atalho = /^\/(\S*)$/.exec(texto)?.[1]
  const sugestoes = atalho !== undefined && !nota ? respostas.filter((r) => r.atalho.startsWith(atalho.toLowerCase()) || r.titulo.toLowerCase().includes(atalho.toLowerCase())).slice(0, 6) : []
  const mimeDeVoz = useMemo(() => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null
    // o WhatsApp só aceita áudio em OGG (Opus) ou MP4/AAC; webm não passa
    return ['audio/ogg;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac'].find((t) => MediaRecorder.isTypeSupported(t)) ?? null
  }, [])

  function escolher(f: File) {
    if (!janelaAberta) { setErro('Com a janela de 24 horas fechada, só dá para mandar modelo aprovado.'); return }
    const e = conferirArquivo(f)
    setErro(e)
    if (!e) { setArquivo(f); setNota(false); setPrevia(f.type.startsWith('image/') ? URL.createObjectURL(f) : null); setPainel(null); campo.current?.focus() }
  }
  async function mandar() {
    const t = texto.trim()
    if (nota) { if (!t) return; setTexto(''); await onNota(t).catch((e) => setErro((e as Error).message)); return }
    if (arquivo) { onArquivo(arquivo, t); setArquivo(null); setPrevia(null); setTexto(''); return }
    if (!t) return
    onTexto(t); setTexto('')
  }
  async function gravar() {
    if (!mimeDeVoz) return
    setErro(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream, { mimeType: mimeDeVoz })
      const partes: Blob[] = []
      rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data) }
      rec.start(250)
      setGravando({ inicio: Date.now(), rec, partes, mime: mimeDeVoz })
    } catch { setErro('Não consegui usar o microfone. Libere o microfone para este site no navegador.') }
  }
  function pararGravacao(enviar: boolean) {
    const g = gravando
    if (!g) return
    g.rec.onstop = () => {
      g.rec.stream.getTracks().forEach((t) => t.stop())
      if (!enviar || Date.now() - g.inicio < 800) return
      const tipo = g.mime.split(';')[0]
      const ext = tipo === 'audio/ogg' ? 'ogg' : 'm4a'
      onArquivo(new File([new Blob(g.partes, { type: g.mime })], `audio-gravado-${Date.now()}.${ext}`, { type: tipo }), '')
    }
    g.rec.stop()
    setGravando(null)
  }

  if (!janelaAberta && mostrarTravada) {
    const esperando = contato.ultimaDirecao === 'saida'
    return <footer className="wz-compor travado">
      <div className="wz-travado">
        <span className="wz-travado-icone">{esperando ? <I.relogio /> : <I.cadeado />}</span>
        {esperando
          ? <div><b>Mensagem enviada · esperando o cliente responder</b><small>Assim que ele responder, a conversa fica livre por 24 horas e você escreve normalmente. Até lá, só outro modelo aprovado.</small></div>
          : <div><b>{contato.ultimaEntradaEm ? 'Faz mais de 24 horas que o cliente não responde' : 'Este cliente ainda não mandou mensagem'}</b><small>Pela regra do WhatsApp, para falar com ele agora só dá para mandar um modelo aprovado. Quando ele responder, a conversa fica livre de novo.</small></div>}
        <div className="wz-travado-acoes"><button className={`wz-btn ${esperando ? '' : 'ouro'}`} onClick={onModelo}>{esperando ? 'Outro modelo' : 'Escolher modelo'}</button><button className="wz-btn" onClick={() => { setMostrarTravada(false); setNota(true); setTimeout(() => campo.current?.focus(), 0) }}>Escrever nota interna</button></div>
      </div>
    </footer>
  }

  if (gravando) {
    const s = (Date.now() - gravando.inicio) / 1000
    return <footer className="wz-compor gravando">
      <button className="wz-icone-btn perigo" onClick={() => pararGravacao(false)} aria-label="Descartar o áudio" title="Descartar"><I.lixo /></button>
      <span className="wz-gravando"><i />{duracao(s)}<span className="wz-gravando-onda">{Array.from({ length: 28 }, (_, i) => <em key={i} style={{ animationDelay: `${(i % 7) * 0.09}s` }} />)}</span></span>
      <button className="wz-enviar" onClick={() => pararGravacao(true)} aria-label="Enviar o áudio" title="Enviar"><I.enviar /></button>
    </footer>
  }

  return <footer className={`wz-compor ${nota ? 'nota' : ''}`}>
    {nota && <div className="wz-modo-nota"><I.nota /><b>Nota interna</b><span>só a equipe vê, o cliente não recebe</span>{janelaAberta && <button onClick={() => setNota(false)}>Voltar a mensagem</button>}</div>}
    {citando && !nota && <div className="wz-citando"><div><b>{citando.direcao === 'entrada' ? nomeDoContato(contato) : 'Você'}</b><span>{citando.texto || rotuloDoTipo(citando.tipo)}</span></div><button onClick={onTirarCitacao} aria-label="Tirar a citação"><I.x /></button></div>}
    {arquivo && <div className="wz-anexo">
      {previa ? <img src={previa} alt="" /> : <span className="wz-doc-icone">{(arquivo.name.split('.').pop() ?? '').slice(0, 4).toUpperCase()}</span>}
      <div><b>{arquivo.name}</b><small>{tamanho(arquivo.size)} · escreva uma legenda, se quiser</small></div>
      <button onClick={() => { setArquivo(null); setPrevia(null) }} aria-label="Tirar o anexo"><I.x /></button>
    </div>}
    {erro && <div className="wz-compor-erro" role="alert"><I.alerta />{erro}<button onClick={() => setErro(null)} aria-label="Fechar aviso"><I.x /></button></div>}
    {sugestoes.length > 0 && <div className="wz-sugestoes" role="listbox" aria-label="Respostas prontas">
      <div className="wz-sugestoes-topo"><span>Respostas prontas</span><button onClick={onRespostas}>Gerenciar</button></div>
      {sugestoes.map((r, i) => <button key={r.id} role="option" aria-selected={i === sel} className={i === sel ? 'on' : ''} onMouseEnter={() => setSel(i)} onClick={() => { setTexto(r.texto); setSel(0); campo.current?.focus() }}><b>/{r.atalho}</b><span>{r.titulo}</span><small>{r.texto}</small></button>)}
    </div>}
    {painel === 'emoji' && <div className="wz-emojis" role="dialog" aria-label="Emojis">
      {EMOJIS.map((g) => <div key={g.nome}><span>{g.nome}</span><div>{g.lista.map((e) => <button key={e} onClick={() => { const el = campo.current; const a = el?.selectionStart ?? texto.length, b = el?.selectionEnd ?? texto.length; setTexto(texto.slice(0, a) + e + texto.slice(b)); requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + e.length, a + e.length) }) }}>{e}</button>)}</div></div>)}
    </div>}
    {painel === 'mais' && <div className="wz-menu wz-menu-mais" role="menu">
      <button role="menuitem" disabled={!janelaAberta} onClick={() => seletorFoto.current?.click()}><span className="roxo"><I.foto /></span>Fotos e vídeos</button>
      <button role="menuitem" disabled={!janelaAberta} onClick={() => seletor.current?.click()}><span className="azul"><I.doc /></span>Documento</button>
      <button role="menuitem" onClick={() => { setPainel(null); setTexto('/'); campo.current?.focus() }}><span className="verde"><I.raio /></span>Resposta pronta</button>
      <button role="menuitem" onClick={() => { setPainel(null); onModelo() }}><span className="ouro"><I.modelo /></span>Modelo aprovado</button>
      <button role="menuitem" onClick={() => { setPainel(null); setNota(true); campo.current?.focus() }}><span className="amarelo"><I.nota /></span>Nota interna</button>
    </div>}
    <div className="wz-compor-linha">
      <button className={`wz-icone-btn ${painel === 'emoji' ? 'on' : ''}`} onClick={() => setPainel((v) => (v === 'emoji' ? null : 'emoji'))} aria-label="Emojis" title="Emojis"><I.emoji /></button>
      <button className={`wz-icone-btn mais ${painel === 'mais' ? 'on' : ''}`} onClick={() => setPainel((v) => (v === 'mais' ? null : 'mais'))} aria-label="Anexar e mais" title="Anexar e mais"><I.nova /></button>
      <input ref={seletor} type="file" hidden accept="application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,audio/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) escolher(f); e.target.value = '' }} />
      <input ref={seletorFoto} type="file" hidden accept="image/*,video/mp4,video/3gpp" onChange={(e) => { const f = e.target.files?.[0]; if (f) escolher(f); e.target.value = '' }} />
      <textarea ref={campo} rows={1} value={texto} onChange={(e) => { setTexto(e.target.value); setSel(0) }} onFocus={() => setPainel((v) => (v === 'mais' ? null : v))}
        placeholder={nota ? 'Escreva a nota para a equipe' : arquivo ? 'Legenda (opcional)' : 'Digite uma mensagem'}
        aria-label={nota ? 'Nota interna' : 'Mensagem'}
        onPaste={(e) => { const f = e.clipboardData.files?.[0]; if (f && !nota) { e.preventDefault(); escolher(f) } }}
        onKeyDown={(e) => {
          if (sugestoes.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % sugestoes.length); return }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s - 1 + sugestoes.length) % sugestoes.length); return }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); setTexto(sugestoes[sel].texto); setSel(0); return }
            if (e.key === 'Escape') { setTexto(''); return }
          }
          if (e.key === 'Escape') setPainel(null)
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void mandar() }
        }} />
      {texto.trim() || arquivo || nota || !mimeDeVoz || !janelaAberta
        ? <button className={`wz-enviar ${nota ? 'nota' : ''}`} onClick={() => void mandar()} disabled={!texto.trim() && !arquivo} aria-label={nota ? 'Salvar nota' : 'Enviar'} title={nota ? 'Salvar nota' : 'Enviar'}><I.enviar /></button>
        : <button className="wz-enviar mic" onClick={() => void gravar()} aria-label="Gravar áudio" title="Gravar áudio"><I.mic /></button>}
    </div>
  </footer>
}

/* ================================================================ dados do contato */
function DadosDoContato({ api, contato, equipe, mensagens, nomeDe, onFechar, onMudar, onAbrirMidia, onMostrar }: {
  api: WhatsAppApi; contato: ContatoWpp; equipe: PessoaDaEquipe[]; mensagens: MensagemWpp[]; nomeDe: (id: string | null) => string | null
  onFechar: () => void; onMudar: (c: Parameters<WhatsAppApi['mudarContato']>[1]) => void
  onAbrirMidia: (m: MensagemWpp, itens: MensagemWpp[]) => void; onMostrar: (m: MensagemWpp) => void
}) {
  const [ficha, setFicha] = useState<FichaWpp | null | undefined>(undefined)
  const [arquivos, setArquivos] = useState<ArquivosDoContato | null>(null)
  const [galeria, setGaleria] = useState<'midia' | 'docs' | 'links' | null>(null)
  const [etiqueta, setEtiqueta] = useState('')
  useEffect(() => { let vivo = true; void api.ficha(contato.id).then((f) => vivo && setFicha(f)).catch(() => vivo && setFicha(null)); return () => { vivo = false } }, [api, contato.id, contato.userId, contato.leadId])
  // os arquivos vêm do banco (a conversa inteira, não só o que está carregado na tela) e
  // atualizam quando chega mensagem nova
  const qtd = mensagens.filter((m) => !m.enviando).length
  useEffect(() => { let vivo = true; void api.arquivos(contato.id).then((a) => vivo && setArquivos(a)).catch(() => vivo && setArquivos({ midias: [], docs: [], links: [], notas: [] })); return () => { vivo = false } }, [api, contato.id, qtd])
  const k = ficha?.cliente, l = ficha?.lead
  const j = janela(contato)
  const addEtiqueta = () => {
    const t = etiqueta.trim().replace(/\s+/g, ' ')
    if (!t || contato.etiquetas.includes(t)) { setEtiqueta(''); return }
    onMudar({ etiquetas: [...contato.etiquetas, t].slice(0, 8) }); setEtiqueta('')
  }
  const midias = arquivos?.midias ?? [], docs = arquivos?.docs ?? [], links = arquivos?.links ?? [], notas = arquivos?.notas ?? []
  return <aside className="wz-dados" aria-label="Dados do contato">
    <header><button className="wz-icone-btn" onClick={onFechar} aria-label="Fechar"><I.x /></button><b>Dados do contato</b></header>
    <div className="wz-dados-rolagem">
      <section className="wz-dados-quem">
        <Avatar nome={nomeDoContato(contato)} grande />
        <b>{k?.nome || l?.nome || nomeDoContato(contato)}</b>
        <span>{telefoneBonito(contato.waId)}</span>
        {contato.nome && (k?.nome || l?.nome) && contato.nome !== (k?.nome || l?.nome) && <small>No WhatsApp: ~{contato.nome}</small>}
        <div className="wz-dados-atalhos">
          <button onClick={() => void navigator.clipboard?.writeText(telefoneBonito(contato.waId))}><I.copiar /><span>Copiar</span></button>
          <button onClick={() => onMudar({ fixada: !contato.fixada })} className={contato.fixada ? 'on' : ''}><I.alfinete /><span>{contato.fixada ? 'Fixada' : 'Fixar'}</span></button>
          <button onClick={() => onMudar({ situacao: contato.situacao === 'aberta' ? 'resolvida' : 'aberta' })}><I.certo /><span>{contato.situacao === 'aberta' ? 'Resolver' : 'Reabrir'}</span></button>
        </div>
      </section>

      {arquivos === null
        ? <section className="wz-dados-bloco"><span className="wz-dados-titulo">Mídia, links e docs</span><div className="wz-faixa-midias-tira">{[0, 1, 2].map((i) => <span key={i} className="wz-mini grande esqueleto" />)}</div></section>
        : <FaixaDeMidias api={api} midias={midias} docs={docs} links={links} onAbrirGaleria={setGaleria} onAbrir={(m) => onAbrirMidia(m, midias)} />}

      <section className="wz-dados-bloco">
        <span className="wz-dados-titulo">Na plataforma</span>
        {ficha === undefined && <div className="wz-carregando pequeno"><i />Procurando o cadastro…</div>}
        {k && <dl>
          <div><dt>Subplano</dt><dd><span className={`wz-subplano ${k.subplano ?? 'gold'}`}>{(k.subplano ?? 'gold').replace(/^./, (x) => x.toUpperCase())}</span></dd></div>
          {k.parceiro && <div><dt>Veio de</dt><dd>/{k.parceiro}</dd></div>}
          {k.email && <div><dt>E-mail</dt><dd className="quebra">{k.email}</dd></div>}
          {k.status && <div><dt>Acesso</dt><dd>{k.status.replace(/^./, (x) => x.toUpperCase())}</dd></div>}
          {k.criadoEm && <div><dt>Cadastro</dt><dd>{dataCurta(k.criadoEm)}</dd></div>}
          {k.vistoEm && <div><dt>Último acesso</dt><dd>{haQuanto(k.vistoEm)}</dd></div>}
          {(k.cidade || k.uf) && <div><dt>Cidade</dt><dd>{[k.cidade, k.uf].filter(Boolean).join(' · ')}</dd></div>}
        </dl>}
        {!k && l && <dl>
          <div><dt>Situação</dt><dd>Lead, sem conta ainda</dd></div>
          {l.parceiro && <div><dt>Veio de</dt><dd>/{l.parceiro}</dd></div>}
          {l.temperatura && <div><dt>Temperatura</dt><dd>{l.temperatura.replace(/^./, (x) => x.toUpperCase())}</dd></div>}
          {l.campanha && <div><dt>Campanha</dt><dd className="quebra">{l.campanha}</dd></div>}
          <div><dt>Aceitou receber</dt><dd className={l.consentiu ? 'ok' : 'alerta'}>{l.consentiu ? 'Sim' : 'Não informado'}</dd></div>
          {l.criadoEm && <div><dt>Cadastro</dt><dd>{dataCurta(l.criadoEm)}</dd></div>}
        </dl>}
        {ficha !== undefined && !k && !l && <small className="wz-dados-dica">Não achamos um cadastro nem um lead com este número. Pode ser alguém que ainda não se cadastrou, ou que usou outro telefone.</small>}
        {k?.email && <button className="wz-link" onClick={() => void navigator.clipboard?.writeText(k.email!)}>Copiar e-mail</button>}
      </section>

      <section className="wz-dados-bloco">
        <span className="wz-dados-titulo">Atendimento</span>
        <dl>
          <div><dt>Janela</dt><dd className={j.aberta ? 'ok' : 'alerta'}>{j.aberta ? textoDaJanela(j.restaMs).replace(/^./, (x) => x.toUpperCase()) : 'Fechada · só modelo'}</dd></div>
          <div><dt>Responsável</dt><dd>
            <select className="wz-select-mini" value={contato.responsavel ?? ''} onChange={(e) => onMudar({ responsavel: e.target.value || null })} aria-label="Responsável">
              <option value="">Ninguém</option>{equipe.map((x) => <option key={x.id} value={x.id}>{x.id === api.euId ? 'Você' : x.nome}</option>)}
            </select></dd></div>
          <div><dt>Situação</dt><dd>{contato.situacao === 'aberta' ? 'Em atendimento' : 'Resolvida'}</dd></div>
          <div><dt>Primeiro contato</dt><dd>{dataCurta(contato.criadoEm)}</dd></div>
        </dl>
        <span className="wz-dados-titulo">Etiquetas</span>
        <div className="wz-etiquetas">
          {contato.etiquetas.map((e) => <span key={e} style={{ ['--cor' as string]: corDaEtiqueta(e) }}><i />{e}<button onClick={() => onMudar({ etiquetas: contato.etiquetas.filter((x) => x !== e) })} aria-label={`Tirar ${e}`}><I.x /></button></span>)}
          <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEtiqueta() } }} onBlur={addEtiqueta} placeholder="+ Etiqueta" aria-label="Nova etiqueta" maxLength={24} />
        </div>
      </section>

      <NotasDoContato notas={notas} nomeDe={nomeDe} onMostrar={onMostrar} />

      <section className="wz-dados-bloco wz-dados-rodape">
        <div><I.cadeado /><span><b>Conversa protegida</b><small>As mensagens chegam pelo WhatsApp oficial da Meta. Só o administrador geral e o dono do número veem esta conversa.</small></span></div>
      </section>
    </div>
    {galeria && <GaleriaDoContato api={api} contato={contato} abaInicial={galeria} midias={midias} docs={docs} links={links} carregando={arquivos === null}
      onVoltar={() => setGaleria(null)} onAbrir={(m) => onAbrirMidia(m, midias)} onMostrar={onMostrar} />}
  </aside>
}

/* ================================================================ peças */
const TONS = ['#00A884', '#53BDEB', '#B78D39', '#9C6B9E', '#C2724F', '#5B7FA6', '#3E8E7E']
function Avatar({ nome, grande }: { nome: string; grande?: boolean }) {
  let h = 0; for (const ch of nome) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const iniciais = nome.replace(/^\+/, '').split(/\s+/).filter((p) => /\p{L}/u.test(p)).slice(0, 2).map((p) => p[0].toUpperCase()).join('')
  return <span className={`wz-avatar ${grande ? 'grande' : ''}`} style={{ ['--tom' as string]: TONS[h % TONS.length] }} aria-hidden>{iniciais || <I.pessoa />}</span>
}
function Tique({ status, pequeno }: { status: MensagemWpp['status']; pequeno?: boolean }) {
  const cls = `wz-tique ${status} ${pequeno ? 'pequeno' : ''}`
  if (status === 'pendente') return <svg className={cls} viewBox="0 0 16 16" aria-label="Enviando"><path d="M8 4.5v3.7l2.2 1.4M8 1.8a6.2 6.2 0 1 1 0 12.4A6.2 6.2 0 0 1 8 1.8z" /></svg>
  if (status === 'falhou') return <svg className={cls} viewBox="0 0 16 16" aria-label="Não enviada"><path d="M8 4.8v4M8 11.2v.2M8 1.8a6.2 6.2 0 1 1 0 12.4A6.2 6.2 0 0 1 8 1.8z" /></svg>
  if (status === 'enviada') return <svg className={cls} viewBox="0 0 16 16" aria-label="Enviada"><path d="M3 8.6l2.8 2.7L13 4.4" /></svg>
  return <svg className={cls} viewBox="0 0 18 16" aria-label={status === 'lida' ? 'Lida' : 'Entregue'}><path d="M1.6 8.6l2.8 2.7L11.6 4.4M7.6 11.3L15 4.4" /></svg>
}
function ListaCarregando() { return <>{Array.from({ length: 7 }, (_, i) => <div key={i} className="wz-item esqueleto"><span className="wz-item-corpo"><span className="wz-avatar" /><span className="wz-item-meio"><i /><i /></span></span></div>)}</> }

/** Os ícones de traço da central (24x24). */
const icone = (d: string, cheio = false) => function Ic({ title }: { title?: string }) {
  return <svg viewBox="0 0 24 24" className={cheio ? 'cheio' : undefined} aria-hidden={!title} role={title ? 'img' : undefined}>{title && <title>{title}</title>}<path d={d} /></svg>
}
const I = {
  whats: icone('M4.2 19.8l1.2-3.9A8.2 8.2 0 1 1 8.4 18.7zM9.2 8.4c.2-.5.9-.6 1.2-.1l.8 1.4c.2.3.1.7-.2.9l-.5.4c.5 1.1 1.3 1.9 2.4 2.4l.4-.5c.2-.3.6-.4.9-.2l1.4.8c.5.3.4 1-.1 1.2-2.9 1.3-7.6-3.4-6.3-6.3z'),
  lupa: icone('M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM15.5 15.5 20 20'),
  nova: icone('M12 5v14M5 12h14'),
  raio: icone('M13 3L5 13.5h6L10 21l8-10.5h-6z'),
  x: icone('M6 6l12 12M18 6L6 18'),
  seta: icone('M7 10l5 5 5-5'),
  voltar: icone('M15 5l-7 7 7 7'),
  mais: icone('M12 5.5v.01M12 12v.01M12 18.5v.01'),
  pessoa: icone('M12 12a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2zM5 20a7 7 0 0 1 14 0'),
  certo: icone('M5 12.5l4.2 4.2L19 7'),
  alfinete: icone('M14.5 4l5.5 5.5-2.2.6-3.4 3.4.3 3.6-1.5 1.5-3.4-3.4L5 20l-1-1 4.8-4.8-3.4-3.4 1.5-1.5 3.6.3 3.4-3.4z'),
  balao: icone('M4 5h16v11H9l-5 4z'),
  relogio: icone('M12 7v5l3 2M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z'),
  cadeado: icone('M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z'),
  modelo: icone('M5 4h14v16H5zM8.5 8.5h7M8.5 12h7M8.5 15.5h4'),
  copiar: icone('M9 9h10v11H9zM5 15V4h10'),
  responder: icone('M9 7L4 12l5 5M4 12h10a6 6 0 0 1 6 6'),
  nota: icone('M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4 7.2 18.9l.9-5.4L4.2 9.7l5.4-.8z'),
  alerta: icone('M12 8v5M12 16.5v.5M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z'),
  foto: icone('M4 6h16v12H4zM8.5 10.5a1.5 1.5 0 1 0 0-.01M20 15l-4.5-4.5L7 18'),
  doc: icone('M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 16.5h6'),
  clipe: icone('M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.2-8.2a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4'),
  emoji: icone('M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM8.5 14.5c.9 1.3 2.1 2 3.5 2s2.6-.7 3.5-2M9 9.5v.5M15 9.5v.5'),
  mic: icone('M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3'),
  enviar: icone('M4 12l16-8-6 16-2.5-6.5z'),
  play: icone('M8 5.5v13l10.5-6.5z', true),
  pausa: icone('M8 5.5h3v13H8zM13 5.5h3v13h-3z', true),
  lixo: icone('M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13M10 11v5M14 11v5'),
  cima: icone('M7 14l5-5 5 5'),
  baixo: icone('M7 10l5 5 5-5'),
  baixar: icone('M12 4v11M7 10.5l5 5 5-5M5 20h14'),
  ampliar: icone('M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7'),
}
