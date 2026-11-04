/**
 * A aba Instagram de Anúncios (04/11/2026, Tiago: "consegue construir esse caminho já dentro da plataforma,
 * pra ficar pronto pra vincular lá?"). Três momentos, na ordem em que acontecem:
 *   1. o aplicativo da Meta (uma vez, o administrador geral cola o ID e a chave secreta);
 *   2. o parceiro conecta com o PRÓPRIO login: a tela gera um link de 48 h e a mensagem pronta para
 *      mandar a ele (o Naor não é admin geral e não vê esta aba; o botão daqui abriria o Facebook de quem
 *      está no computador);
 *   3. conectado: a conta, os números do período, os stories no ar e os últimos posts.
 */
import { useCallback, useEffect, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import type { ApiInstagram, EstadoDoInstagram, MetricasDoInstagram, MidiaDoInstagram } from '../../core/teeds/instagram'
import './instagram.css'

const int = (v: number | null | undefined) => v == null ? '—' : v.toLocaleString('pt-BR')
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const copiar = async (texto: string) => { try { await navigator.clipboard.writeText(texto); return true } catch { return false } }

export function InstagramDoParceiro({ sessao, api, parceiro, nomeDoParceiro }: { sessao: SessaoTeeds; api: ApiInstagram; parceiro: string; nomeDoParceiro: string }) {
  const [estado, setEstado] = useState<EstadoDoInstagram | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const ler = useCallback(() => api.estado(sessao, parceiro).then((e) => { setEstado(e); setErro(null) }).catch((e) => setErro((e as Error).message)), [api, sessao, parceiro])
  useEffect(() => { setEstado(null); void ler() }, [ler])
  // a janela do login avisa quando termina; e quem mandou o link ao parceiro vê a conexão chegar ao voltar à aba
  useEffect(() => {
    const aoAvisar = (e: MessageEvent) => { if (e.data && typeof e.data === 'object' && 'gfInstagram' in e.data) void ler() }
    const aoVoltar = () => { if (!document.hidden) void ler() }
    window.addEventListener('message', aoAvisar); window.addEventListener('focus', aoVoltar)
    return () => { window.removeEventListener('message', aoAvisar); window.removeEventListener('focus', aoVoltar) }
  }, [ler])

  if (erro && !estado) return <p className="aa-erro">{erro}</p>
  if (!estado) return <p className="aa-vazio">Conferindo o Instagram…</p>
  if (!estado.app.configurado) return <ConfigurarApp sessao={sessao} api={api} parceiro={parceiro} volta={estado.app.volta} aoSalvar={ler} nomeDoParceiro={nomeDoParceiro} />
  if (!estado.conexao && estado.candidatos.length) return <EscolherConta sessao={sessao} api={api} parceiro={parceiro} estado={estado} aoEscolher={ler} />
  if (!estado.conexao) return <Conectar sessao={sessao} api={api} parceiro={parceiro} nomeDoParceiro={nomeDoParceiro} aoAtualizar={ler} />
  return <Conectado sessao={sessao} api={api} parceiro={parceiro} estado={estado} nomeDoParceiro={nomeDoParceiro} aoMudar={ler} />
}

/* ------------------------------------------------------------ 1. o aplicativo */

function ConfigurarApp({ sessao, api, parceiro, volta, aoSalvar, nomeDoParceiro }: { sessao: SessaoTeeds; api: ApiInstagram; parceiro: string; volta: string; aoSalvar: () => void; nomeDoParceiro: string }) {
  const [appId, setAppId] = useState('')
  const [segredo, setSegredo] = useState('')
  const [indo, setIndo] = useState<{ ok?: boolean; erro?: string; salvando?: boolean }>({})
  const [copiado, setCopiado] = useState(false)
  const salvar = async () => {
    setIndo({ salvando: true })
    try { await api.salvarApp(sessao, parceiro, appId.trim(), segredo.trim()); setIndo({ ok: true }); setSegredo(''); aoSalvar() }
    catch (e) { setIndo({ erro: (e as Error).message }) }
  }
  return (
    <section className="aa-cartao ig-passos">
      <header><div><span className="rot">Instagram · passo 1 de 2 · só uma vez</span><h3>Ligar o aplicativo da Meta</h3>
        <p>É o "crachá" da plataforma na Meta: é ele que pede ao {nomeDoParceiro} a permissão de ler o Instagram. Leva uns 10 minutos, e depois não precisa mais.</p></div></header>
      <ol className="ig-lista">
        <li><b>Abra developers.facebook.com</b> e entre com o seu Facebook. Em <i>Meus apps</i>, clique em <i>Criar app</i>, escolha o tipo <b>Empresa</b> e dê o nome <b>GlobalFly Trade</b>.</li>
        <li>No app, em <i>Adicionar produtos</i>, adicione o <b>Login do Facebook para Empresas</b>.</li>
        <li>Em <i>Login do Facebook para Empresas › Configurações</i>, no campo <b>URIs de redirecionamento do OAuth válidos</b>, cole este endereço e salve:
          <span className="ig-copiar"><code>{volta}</code><button type="button" onClick={async () => { setCopiado(await copiar(volta)); setTimeout(() => setCopiado(false), 1800) }}>{copiado ? 'Copiado' : 'Copiar'}</button></span></li>
        <li>Em <i>Configurações do app › Básico</i>, copie o <b>ID do aplicativo</b> e a <b>Chave secreta do aplicativo</b> (botão <i>Mostrar</i>) e cole aqui embaixo.</li>
        <li>Em <i>Funções do app › Funções</i>, adicione o {nomeDoParceiro} como <b>Testador</b>. Ele aceita o convite pelo Facebook dele. Enquanto a Meta não aprova o app, só quem está nessa lista consegue conectar.</li>
      </ol>
      <form className="ig-form" autoComplete="off" onSubmit={(e) => { e.preventDefault(); void salvar() }}>
        <label><span>ID do aplicativo</span><input name="meta-app-id" inputMode="numeric" value={appId} onChange={(e) => setAppId(e.target.value.replace(/\D/g, ''))} placeholder="Só números, ex.: 1234567890123456" autoComplete="off" data-lpignore="true" data-1p-ignore spellCheck={false} /></label>
        <label><span>Chave secreta do aplicativo</span><input name="meta-app-secret" type="text" className="ig-segredo" value={segredo} onChange={(e) => setSegredo(e.target.value.trim())} placeholder="32 letras e números" autoComplete="off" data-lpignore="true" data-1p-ignore spellCheck={false} /></label>
        <button type="submit" className="aa-atualizar aa-subir" disabled={indo.salvando || !appId.trim() || !segredo.trim()}>{indo.salvando ? 'Conferindo com a Meta…' : 'Salvar e conferir'}</button>
      </form>
      {indo.erro && <p className="aa-erro" role="alert">{indo.erro}</p>}
      <p className="aa-nota">A chave secreta fica só no servidor: depois de salva, nem esta tela mostra de novo.</p>
    </section>
  )
}

/* ------------------------------------------------------------ 2. conectar */

function Conectar({ sessao, api, parceiro, nomeDoParceiro, aoAtualizar }: { sessao: SessaoTeeds; api: ApiInstagram; parceiro: string; nomeDoParceiro: string; aoAtualizar: () => void }) {
  const [link, setLink] = useState<string | null>(null)
  const [estado, setEstado] = useState<{ indo?: boolean; erro?: string; copiou?: 'msg' | 'link' | null }>({})
  const primeiro = nomeDoParceiro.split(' ')[0] || 'parceiro'
  const gerar = async () => {
    setEstado({ indo: true })
    try { const u = await api.inicio(sessao, parceiro, true); setLink(u); setEstado({}); return u } catch (e) { setEstado({ erro: (e as Error).message }); return null }
  }
  const mensagem = (u: string) => `${primeiro}, para ligar o seu Instagram na plataforma da GlobalFly:

1. Confira se o Instagram está ligado à página do Facebook dos seus anúncios
No Instagram: toque na sua foto (embaixo, à direita) › Editar perfil › desça até "Página". Se aparecer o nome da página, está certo. Se estiver vazio, toque ali e escolha a página dos seus anúncios.

2. Libere o acesso às mensagens
No seu perfil: ☰ (em cima, à direita) › digite "ferramentas conectadas" na busca › deixe "Permitir acesso às mensagens" ligado.

3. Abra este link, entre com o SEU Facebook e aceite tudo (marque a página e o Instagram):
${u}

O link vale por 48 horas. Quando terminar, aparece "Instagram conectado".`
  const copiarMensagem = async () => { const u = link ?? await gerar(); if (u && await copiar(mensagem(u))) setEstado({ copiou: 'msg' }) }
  const copiarLink = async () => { const u = link ?? await gerar(); if (u && await copiar(u)) setEstado({ copiou: 'link' }) }
  const abrirAqui = async () => {
    setEstado({ indo: true })
    try {
      const u = await api.inicio(sessao, parceiro, false)
      const w = window.open(u, 'gf-instagram', 'width=560,height=720')
      if (!w) location.href = u
      setEstado({})
    } catch (e) { setEstado({ erro: (e as Error).message }) }
  }
  return (
    <section className="aa-cartao ig-passos">
      <header><div><span className="rot">Instagram · passo 2 de 2</span><h3>Conectar o Instagram do {primeiro}</h3>
        <p>O {primeiro} conecta com o próprio login, no celular dele: ninguém passa senha. Mande a mensagem abaixo para ele pelo WhatsApp; quando ele terminar, esta tela muda sozinha.</p></div></header>
      <div className="ig-acoes">
        <button type="button" className="aa-atualizar aa-subir" onClick={() => void copiarMensagem()} disabled={estado.indo}>{estado.copiou === 'msg' ? 'Mensagem copiada' : estado.indo ? 'Gerando o link…' : `Copiar a mensagem para o ${primeiro}`}</button>
        <button type="button" className="aa-atualizar" onClick={() => void copiarLink()} disabled={estado.indo}>{estado.copiou === 'link' ? 'Link copiado' : 'Copiar só o link'}</button>
        <button type="button" className="aa-atualizar" onClick={aoAtualizar}>Ele já conectou</button>
      </div>
      {estado.erro && <p className="aa-erro" role="alert">{estado.erro}</p>}
      <ol className="ig-lista">
        <li><b>Instagram ligado à página do Facebook.</b> No Instagram: toque na foto do perfil › <i>Editar perfil</i> › desça até <i>Página</i>. Se aparecer o nome da página dos anúncios, está certo; se estiver vazio, toque ali e escolha a página.</li>
        <li><b>Acesso às mensagens liberado.</b> No perfil: ☰ › busque <i>ferramentas conectadas</i> › deixe <i>Permitir acesso às mensagens</i> ligado.</li>
        <li><b>Abrir o link e aceitar tudo.</b> Entra com o Facebook dele, marca a página e o Instagram, e confirma. O link vale 48 horas.</li>
      </ol>
      <p className="aa-nota">O {primeiro} está do seu lado? <button type="button" className="ig-link" onClick={() => void abrirAqui()} disabled={estado.indo}>Conectar neste computador</button> (abre o login da Meta aqui: tem que entrar com o Facebook dele, não com o seu).</p>
    </section>
  )
}

function EscolherConta({ sessao, api, parceiro, estado, aoEscolher }: { sessao: SessaoTeeds; api: ApiInstagram; parceiro: string; estado: EstadoDoInstagram; aoEscolher: () => void }) {
  const [indo, setIndo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  return (
    <section className="aa-cartao ig-passos">
      <header><div><span className="rot">Instagram</span><h3>Qual Instagram vale?</h3><p>O login alcança mais de um Instagram. Escolha o que é da divulgação.</p></div></header>
      <div className="ig-candidatos">
        {estado.candidatos.map((c) => (
          <button key={c.id} type="button" onClick={async () => { setIndo(c.id); try { await api.escolher(sessao, parceiro, c.id); aoEscolher() } catch (e) { setErro((e as Error).message); setIndo(null) } }} disabled={!!indo}>
            {c.foto ? <img src={c.foto} alt="" /> : <span className="ig-foto-vazia" />}
            <span><b>@{c.usuario}</b><small>{int(c.seguidores)} seguidores · página {c.pagina}</small></span>
            <em>{indo === c.id ? 'Ligando…' : 'Usar esta'}</em>
          </button>
        ))}
      </div>
      {erro && <p className="aa-erro">{erro}</p>}
    </section>
  )
}

/* ------------------------------------------------------------ 3. conectado */

const PERIODOS_IG = [{ dias: 1, nome: 'Hoje' }, { dias: 7, nome: '7 dias' }, { dias: 30, nome: '30 dias' }] as const

function Conectado({ sessao, api, parceiro, estado, nomeDoParceiro, aoMudar }: { sessao: SessaoTeeds; api: ApiInstagram; parceiro: string; estado: EstadoDoInstagram; nomeDoParceiro: string; aoMudar: () => void }) {
  const c = estado.conexao!
  const [dias, setDias] = useState(7)
  const [m, setM] = useState<MetricasDoInstagram | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [lendo, setLendo] = useState(false)
  const [saindo, setSaindo] = useState(false)
  const ler = useCallback(() => {
    setLendo(true)
    return api.metricas(sessao, parceiro, dias).then((x) => { setM(x); setErro(null) }).catch((e) => setErro((e as Error).message)).finally(() => setLendo(false))
  }, [api, sessao, parceiro, dias])
  useEffect(() => { void ler() }, [ler])
  // as métricas da Meta mudam devagar: a cada 5 min, e só com a aba visível
  useEffect(() => { const t = window.setInterval(() => { if (!document.hidden) void ler() }, 300_000); return () => window.clearInterval(t) }, [ler])
  const perfil = m?.perfil
  const novos = m ? m.conta.seguidoresPorDia.reduce((s, x) => s + x.novos, 0) : null
  const k = m?.conta
  return (
    <>
      <section className="aa-cartao ig-perfil">
        {(perfil?.foto ?? c.foto) ? <img src={perfil?.foto ?? c.foto!} alt="" /> : <span className="ig-foto-vazia" />}
        <div><span className="rot">Instagram do {nomeDoParceiro.split(' ')[0]}</span><b>@{perfil?.usuario ?? c.usuario}</b>
          <small>{int(perfil?.seguidores ?? c.seguidores)} seguidores · {int(perfil?.posts ?? c.posts)} posts · página {c.pagina} · conectado em {quando(c.conectadoEm)}</small></div>
        {c.valida === false && <span className="aa-status erro">A conexão caiu: conecte de novo</span>}
        <div className="ig-acoes">
          <div className="aa-periodo" role="tablist" aria-label="Período">{PERIODOS_IG.map((p) => <button key={p.dias} type="button" role="tab" aria-selected={dias === p.dias} className={dias === p.dias ? 'on' : ''} onClick={() => setDias(p.dias)}>{p.nome}</button>)}</div>
          <button type="button" className="aa-atualizar" onClick={() => void ler()} disabled={lendo}>{lendo ? 'Lendo…' : 'Atualizar'}</button>
          <button type="button" className="aa-atualizar ig-sair" disabled={saindo} onClick={async () => { if (!confirm(`Desconectar o Instagram @${c.usuario} da plataforma?`)) return; setSaindo(true); try { await api.desconectar(sessao, parceiro); aoMudar() } finally { setSaindo(false) } }}>Desconectar</button>
        </div>
      </section>

      {erro && <p className="aa-erro">{erro}</p>}
      {!m && !erro && <p className="aa-vazio">Lendo o Instagram na Meta…</p>}
      {m && k && (
        <>
          <div className="aa-kpis ig-kpis">
            <div><small>Visualizações</small><b>{int(k.views)}</b><span>conteúdo visto no período</span></div>
            <div><small>Alcance</small><b>{int(k.reach)}</b><span>contas diferentes</span></div>
            <div><small>Visitas ao perfil</small><b>{int(k.profile_views)}</b><span>{k.website_clicks != null ? `${int(k.website_clicks)} cliques no link da bio` : 'cliques na bio indisponíveis'}</span></div>
            <div><small>Contas engajadas</small><b>{int(k.accounts_engaged)}</b><span>{int(k.total_interactions)} interações</span></div>
            <div><small>Seguidores novos</small><b>{novos == null || !m.conta.seguidoresPorDia.length ? '—' : `+${int(novos)}`}</b><span>{int(m.perfil.seguidores)} no total</span></div>
            <div><small>Salvos e compartilhados</small><b>{int((k.saves ?? 0) + (k.shares ?? 0))}</b><span>{int(k.saves)} salvos · {int(k.shares)} compart.</span></div>
          </div>

          <section className="aa-cartao">
            <header><div><span className="rot">No ar agora · somem em 24 h</span><h3>Stories ({m.stories.length})</h3>
              <p>A Meta só entrega os números do story enquanto ele está no ar. Daqui em diante a plataforma vai guardando cada um.</p></div></header>
            {m.stories.length ? <Grade itens={m.stories} story /> : <p className="aa-vazio">Nenhum story no ar agora.</p>}
          </section>

          <section className="aa-cartao">
            <header><div><span className="rot">Últimos {m.posts.length}</span><h3>Posts e reels</h3></div><small className="aa-mudo">lido às {quando(m.lidoEm)}</small></header>
            {m.posts.length ? <Grade itens={m.posts} /> : <p className="aa-vazio">Nenhum post ainda.</p>}
          </section>
          <p className="aa-nota">Os números vêm da Meta e chegam com atraso de alguns minutos a algumas horas. Quem viu cada story e a lista de seguidores a Meta não entrega para nenhuma ferramenta.</p>
        </>
      )}
    </>
  )
}

function Grade({ itens, story = false }: { itens: MidiaDoInstagram[]; story?: boolean }) {
  return (
    <div className={`ig-grade ${story ? 'story' : ''}`}>
      {itens.map((x) => (
        <a key={x.id} className="ig-item" href={x.link ?? undefined} target="_blank" rel="noreferrer">
          <span className="ig-capa">{x.imagem ? <img src={x.imagem} alt="" loading="lazy" /> : null}<em>{x.tipo === 'reel' ? 'Reel' : x.tipo === 'carrossel' ? 'Carrossel' : x.tipo === 'story' ? 'Story' : x.tipo === 'video' ? 'Vídeo' : 'Foto'}</em></span>
          <span className="ig-num"><b>{int(x.views)}</b> visualizações</span>
          <span className="ig-det">{story
            ? <>{int(x.alcance)} alcance · {int(x.respostas)} respostas · {int(x.compartilhamentos)} compart.</>
            : <>{int(x.curtidas)} curtidas · {int(x.comentarios)} coment. · {int(x.salvos)} salvos{x.tempoMedio != null ? ` · ${x.tempoMedio.toLocaleString('pt-BR')} s assistidos` : ''}</>}</span>
          <small>{quando(x.quando)}{x.legenda ? ` · ${x.legenda.slice(0, 70)}${x.legenda.length > 70 ? '…' : ''}` : ''}</small>
        </a>
      ))}
    </div>
  )
}
