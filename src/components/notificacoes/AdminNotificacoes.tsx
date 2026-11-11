/**
 * Administração › Notificações (02/11/2026, Tiago: "no painel de ADM, um painel
 * pra disparar notificações? pra gente personalizar cada uma delas, assistir um
 * preview, selecionar pra quem será enviado").
 *
 * Escreve (título, mensagem e para onde o toque leva), vê como chega no celular,
 * escolhe o público com a contagem ao vivo de pessoas e aparelhos, manda um
 * teste para os próprios aparelhos e só então dispara. O envio é da função
 * `notificacoes` do Supabase; o histórico fica em push_disparos.
 */
import { useEffect, useMemo, useState } from 'react'
import { marcaPorId } from '../../marca/marcas'
import { SUPABASE } from '../../core/teeds/config'
import type { SessaoTeeds } from '../../core/teeds/conta'
import './painel-notificacoes.css'
import { SeloDoParceiro } from '../parceiros/SeloDoParceiro'

type Publico = 'todos' | 'aguardando' | 'membros' | 'ativos'
type Contagem = Record<Publico | 'eu', { pessoas: number; aparelhos: number }>
interface Disparo { id: string; criado_em: string; titulo: string; corpo: string; publico: string; parceiro: string | null; aparelhos: number | null; enviados: number | null; falhas: number | null; teste: boolean; pessoas?: number; recebidos?: number; abertos?: number; pessoas_abriram?: number }
interface Pessoa { pessoa: string | null; nome: string | null; email: string | null; parceiro: string | null; aparelhos: number; recebeu_em: string | null; abriu_em: string | null }

const PUBLICOS: Array<{ id: Publico; nome: string; quem: string }> = [
  { id: 'aguardando', nome: 'Aguardando live', quem: 'Inscritos que ainda esperam a live' },
  { id: 'membros', nome: 'GF Member', quem: 'Quem já tem a plataforma liberada' },
  { id: 'ativos', nome: 'Clientes ativos', quem: 'Todos com acesso liberado' },
  { id: 'todos', nome: 'Todos', quem: 'Toda a base com notificações ativadas' },
]
const PARCEIROS: Array<{ id: string; nome: string }> = [
  { id: '', nome: 'Todas as páginas' }, { id: 'n', nome: 'Naor (/n)' }, { id: 'v', nome: 'Victor (/v)' }, { id: 'd', nome: 'Douglas (/d)' }, { id: 'direto', nome: 'Direto' },
]
const DESTINOS: Array<{ id: string; nome: string }> = [
  { id: 'inicio', nome: 'Início da plataforma' }, { id: 'aovivo', nome: 'Ao vivo' }, { id: 'aulas', nome: 'Aulas' },
  { id: 'robos', nome: 'I.A.' }, { id: 'comunidade', nome: 'Comunidade do WhatsApp' }, { id: 'link', nome: 'Outro link' },
]
const EMOJIS = ['🔴', '⏰', '✈️', '🔔', '✅', '🎁', '📚', '🚀', '💬', '🔥', '📈', '⚡']
const MODELOS: Array<{ nome: string; titulo: string; corpo: string; destino: string }> = [
  { nome: 'Live no ar', titulo: '🔴 A live começou', corpo: 'Toque para assistir. A liberação do acesso acontece durante a live.', destino: 'inicio' },
  { nome: 'Falta 1 hora', titulo: '⏰ Falta 1 hora para a live', corpo: 'Às 20h, dentro da GlobalFly. Abra o app e deixe tudo pronto.', destino: 'inicio' },
  { nome: 'Comunidade', titulo: '💬 Novidade na comunidade', corpo: 'Tem aviso novo no grupo do WhatsApp. Toque para ver.', destino: 'comunidade' },
  { nome: 'Aula nova', titulo: '📚 Aula nova liberada', corpo: 'Uma aula nova acabou de entrar na plataforma. Toque para assistir.', destino: 'aulas' },
]
/* Este painel só abre com a GlobalFly em foco (AdminPanel): no site da Teeds, MARCA.id é 'teeds' e o
   disparo ia para a base errada (09/11/2026). */
const MARCA_DAS_NOTIFICACOES = 'globalfly'
const LIMITE_TITULO = 60
const LIMITE_CORPO = 180

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const nomeDoPublico = (p: string) => p === 'eu' ? 'Teste (meus aparelhos)' : PUBLICOS.find((x) => x.id === p)?.nome ?? p
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

/** soDoParceiro: o admin do parceiro com acesso total (05/11/2026) dispara só para os clientes do parceiro dele (o banco e a função conferem de novo). */
export function AdminNotificacoes({ sessao, soDoParceiro }: { sessao: SessaoTeeds; soDoParceiro?: string }) {
  const [titulo, setTitulo] = useState('🔴 A live começou')
  const [corpo, setCorpo] = useState('Toque para assistir. A liberação do acesso acontece durante a live.')
  const [destino, setDestino] = useState('inicio')
  const [link, setLink] = useState('')
  const [publico, setPublico] = useState<Publico>('aguardando')
  const [parceiro, setParceiro] = useState(soDoParceiro ?? '')
  const [contagem, setContagem] = useState<Contagem | null>(null)
  const [historico, setHistorico] = useState<Disparo[]>([])
  const [aparelho, setAparelho] = useState<'iphone' | 'android'>('iphone')
  const [ocupado, setOcupado] = useState<'teste' | 'envio' | null>(null)
  const [confirmar, setConfirmar] = useState(false)
  const [recado, setRecado] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [quem, setQuem] = useState<Pessoa[] | null>(null)

  async function verQuem(id: string) {
    if (aberto === id) { setAberto(null); return }
    setAberto(id); setQuem(null)
    try {
      const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_push_quem`, { method: 'POST', headers: cab, body: JSON.stringify({ p_disparo: id }) })
      setQuem(r.ok ? await r.json() : [])
    } catch { setQuem([]) }
  }

  const cab = { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' }

  async function lerContagem() {
    try {
      const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_push_publicos`, { method: 'POST', headers: cab, body: JSON.stringify({ p_marca: MARCA_DAS_NOTIFICACOES, p_parceiro: parceiro || null }) })
      if (r.ok) setContagem(await r.json())
    } catch { /* tenta de novo ao trocar o filtro */ }
  }
  async function lerHistorico() {
    try {
      // com os números do rastreio: quantos aparelhos mostraram a notificação e quantos tocaram nela
      const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_push_historico`, { method: 'POST', headers: cab, body: JSON.stringify({ p_marca: MARCA_DAS_NOTIFICACOES }) })
      if (r.ok) setHistorico(await r.json())
    } catch { /* o histórico é só consulta */ }
  }
  useEffect(() => { void lerContagem() }, [parceiro]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void lerHistorico() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const destinoFinal = destino === 'link' ? link.trim() : destino
  const linkInvalido = destino === 'link' && !/^https:\/\/\S+\.\S+/.test(link.trim())
  const pronto = titulo.trim().length > 0 && corpo.trim().length > 0 && !linkInvalido
  const alcance = contagem?.[publico]
  const meus = contagem?.eu.aparelhos ?? 0

  async function enviar(para: Publico | 'eu') {
    setOcupado(para === 'eu' ? 'teste' : 'envio'); setRecado(null)
    try {
      const r = await fetch(`${SUPABASE.url}/functions/v1/notificacoes`, {
        method: 'POST', headers: cab,
        body: JSON.stringify({ acao: 'disparo', marca: MARCA_DAS_NOTIFICACOES, titulo: titulo.trim(), corpo: corpo.trim(), destino: destinoFinal, publico: para, parceiro: parceiro || null }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.erro || 'Não foi possível enviar agora.')
      setRecado({ tipo: 'ok', texto: para === 'eu'
        ? (j.aparelhos ? `Teste enviado para ${plural(j.aparelhos, 'aparelho seu', 'aparelhos seus')}. Confira o celular.` : 'Você ainda não tem aparelho com notificações ativadas. Ative pelo menu do seu perfil, no celular.')
        : `Enviada para ${plural(j.enviados ?? 0, 'aparelho', 'aparelhos')}${j.falhas ? ` (${j.falhas} não ${j.falhas === 1 ? 'recebeu' : 'receberam'}: aparelho desativado ou sem permissão)` : ''}.` })
      setConfirmar(false)
      void lerHistorico(); void lerContagem()
    } catch (e) { setRecado({ tipo: 'erro', texto: (e as Error).message }) } finally { setOcupado(null) }
  }

  const agora = useMemo(() => new Date(), [])
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const dataLonga = ((d) => d.charAt(0).toUpperCase() + d.slice(1))(agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }))

  return (
    <div className="pn">
      <div className="pn-grade">
        <section className="admin-card pn-compor">
          <header><div><span className="rot">1 · Mensagem</span><h3>Escreva a notificação</h3></div></header>
          <div className="pn-corpo">
            <div className="pn-modelos" role="group" aria-label="Modelos prontos">
              {MODELOS.map((m) => (
                <button key={m.nome} type="button" onClick={() => { setTitulo(m.titulo); setCorpo(m.corpo); setDestino(m.destino); setConfirmar(false) }}>{m.nome}</button>
              ))}
            </div>
            <label className="pn-campo">
              <span>Título <em>{titulo.length}/{LIMITE_TITULO}</em></span>
              <input id="pn-titulo" value={titulo} maxLength={LIMITE_TITULO} onChange={(e) => { setTitulo(e.target.value); setConfirmar(false) }} placeholder="🔴 A live começou" />
            </label>
            <div className="pn-emojis" role="group" aria-label="Emoji no começo do título">
              {EMOJIS.map((e) => (
                <button key={e} type="button" title="Colocar no começo do título"
                  onClick={() => setTitulo((t) => `${e} ${t.replace(/^\p{Extended_Pictographic}️?\s*/u, '')}`.slice(0, LIMITE_TITULO))}>{e}</button>
              ))}
            </div>
            <label className="pn-campo">
              <span>Mensagem <em>{corpo.length}/{LIMITE_CORPO}</em></span>
              <textarea id="pn-corpo" value={corpo} maxLength={LIMITE_CORPO} rows={3} onChange={(e) => { setCorpo(e.target.value); setConfirmar(false) }} placeholder="O que a pessoa precisa saber, em uma ou duas frases." />
            </label>
            <label className="pn-campo">
              <span>Ao tocar, abre</span>
              <select id="pn-destino" value={destino} onChange={(e) => { setDestino(e.target.value); setConfirmar(false) }}>
                {DESTINOS.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </label>
            {destino === 'link' && (
              <label className="pn-campo">
                <span>Link</span>
                <input id="pn-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" aria-invalid={link.trim() !== '' && linkInvalido} />
              </label>
            )}
            <p className="pn-dica">Quem veio pelo /n ou pelo /v abre a plataforma e a comunidade do próprio parceiro.</p>
          </div>
        </section>

        <section className="admin-card pn-previa">
          <header>
            <div><span className="rot">2 · Prévia</span><h3>Como chega no celular</h3></div>
            <div className="pn-troca" role="group" aria-label="Aparelho da prévia">
              <button type="button" className={aparelho === 'iphone' ? 'on' : ''} onClick={() => setAparelho('iphone')}>iPhone</button>{/* texto-ok: iPhone é nome de marca, escrito assim */}
              <button type="button" className={aparelho === 'android' ? 'on' : ''} onClick={() => setAparelho('android')}>Android</button>
            </div>
          </header>
          <div className={`pn-cel pn-${aparelho}`} aria-hidden="true">
            <div className="pn-tela">
              {aparelho === 'iphone' ? (
                <div className="pn-relogio"><small>{dataLonga}</small><b>{hora}</b></div>
              ) : (
                <div className="pn-barra"><span>{hora}</span><span>{dataLonga}</span></div>
              )}
              <div className="pn-aviso">
                <div className="pn-aviso-topo">
                  <img src={`${import.meta.env.BASE_URL}pwa-globalfly/icon-192.png`} alt="" />
                  <span>{marcaPorId(MARCA_DAS_NOTIFICACOES).prosa.toUpperCase()}</span>
                  <i>agora</i>
                </div>
                <b>{titulo.trim() || 'Título da notificação'}</b>
                <p>{corpo.trim() || 'A mensagem aparece aqui.'}</p>
              </div>
            </div>
          </div>
          <p className="pn-dica">O celular usa o som de notificação do próprio aparelho. Títulos curtos aparecem inteiros na tela bloqueada.</p>
        </section>
      </div>

      <section className="admin-card pn-publico">
        <header>
          <div><span className="rot">3 · Público</span><h3>Para quem enviar</h3></div>
          {soDoParceiro
            ? <span className="pn-so-parceiro">Só os seus clientes ({PARCEIROS.find((p) => p.id === soDoParceiro)?.nome ?? `/${soDoParceiro}`})</span>
            : <select id="pn-parceiro" value={parceiro} onChange={(e) => { setParceiro(e.target.value); setConfirmar(false) }} aria-label="Página de origem">
              {PARCEIROS.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>}
        </header>
        <div className="pn-publicos" role="radiogroup" aria-label="Público">
          {PUBLICOS.map((p) => {
            const c = contagem?.[p.id]
            return (
              <button key={p.id} type="button" role="radio" aria-checked={publico === p.id} className={publico === p.id ? 'on' : ''}
                onClick={() => { setPublico(p.id); setConfirmar(false) }}>
                <b>{p.nome}</b>
                <small>{p.quem}</small>
                <span>{c ? <><strong>{c.pessoas.toLocaleString('pt-BR')}</strong> {c.pessoas === 1 ? 'pessoa' : 'pessoas'} · {plural(c.aparelhos, 'aparelho', 'aparelhos')}</> : 'Contando…'}</span>
              </button>
            )
          })}
        </div>
        <div className="pn-acoes">
          <button type="button" className="pn-teste" disabled={!pronto || ocupado !== null} onClick={() => void enviar('eu')}>
            {ocupado === 'teste' ? 'Enviando teste…' : `Enviar teste para mim${contagem ? ` (${plural(meus, 'aparelho', 'aparelhos')})` : ''}`}
          </button>
          {!confirmar ? (
            <button type="button" className="admin-primary" disabled={!pronto || ocupado !== null || !alcance?.aparelhos} onClick={() => setConfirmar(true)}>
              {alcance ? `Enviar para ${plural(alcance.pessoas, 'pessoa', 'pessoas')}` : 'Enviar'}
            </button>
          ) : (
            <span className="pn-confirma">
              <b>Enviar agora para {plural(alcance?.aparelhos ?? 0, 'aparelho', 'aparelhos')}? Não dá para desfazer.</b>
              <button type="button" className="admin-primary" disabled={ocupado !== null} onClick={() => void enviar(publico)}>{ocupado === 'envio' ? 'Enviando…' : 'Confirmar envio'}</button>
              <button type="button" className="pn-teste" onClick={() => setConfirmar(false)}>Cancelar</button>
            </span>
          )}
        </div>
        {recado && <p className={`pn-recado ${recado.tipo}`} role="status">{recado.texto}</p>}
      </section>

      <section className="admin-card pn-historico">
        <header><div><span className="rot">Histórico</span><h3>Últimas notificações enviadas</h3></div></header>
        {historico.length === 0 ? <p className="pn-vazio">Nenhuma notificação enviada pelo painel ainda.</p> : (
          <ul>
            {historico.map((d) => (
              <li key={d.id}>
                <div><b>{d.titulo}</b><span>{d.corpo}</span></div>
                <div className="pn-hist-dados">
                  <span>{nomeDoPublico(d.publico)}{d.parceiro ? ` · ${PARCEIROS.find((p) => p.id === d.parceiro)?.nome ?? d.parceiro}` : ''} · {quando(d.criado_em)}</span>
                  <span className="pn-numeros">
                    <em title="Aparelhos que o envio alcançou">{plural(d.enviados ?? 0, 'enviada', 'enviadas')}</em>
                    <em title="Apareceu na tela do aparelho">{plural(d.recebidos ?? 0, 'recebida', 'recebidas')}</em>
                    <em className="ouro" title="A pessoa tocou na notificação">{plural(d.abertos ?? 0, 'aberta', 'abertas')}{d.recebidos ? ` · ${Math.round(((d.abertos ?? 0) / d.recebidos) * 100)}%` : ''}</em>
                  </span>
                  <button type="button" className="pn-ver" onClick={() => void verQuem(d.id)} aria-expanded={aberto === d.id}>{aberto === d.id ? 'Fechar' : 'Ver quem recebeu'}</button>
                </div>
                {aberto === d.id && (
                  <div className="pn-quem">
                    {quem === null ? <p className="pn-vazio">Carregando…</p> : quem.length === 0 ? <p className="pn-vazio">Nenhum aparelho alcançado neste envio.</p> : (
                      <table>
                        <thead><tr><th>Pessoa</th><th>Recebeu</th><th>Abriu</th></tr></thead>
                        <tbody>
                          {quem.map((q, i) => (
                            <tr key={q.pessoa ?? i}>
                              <td><b>{q.nome || 'Sem nome'}{q.parceiro && <SeloDoParceiro codigo={q.parceiro} nome={PARCEIROS.find((p) => p.id === q.parceiro)?.nome} />}</b><small>{q.email}{q.aparelhos > 1 ? ` · ${q.aparelhos} aparelhos` : ''}</small></td>
                              <td>{q.recebeu_em ? quando(q.recebeu_em) : <span className="pn-nao">Ainda não</span>}</td>
                              <td>{q.abriu_em ? <span className="pn-sim">{quando(q.abriu_em)}</span> : <span className="pn-nao">Não</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
