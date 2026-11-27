/**
 * Administração › Leads › Super Live (27/11/2026, Tiago: "onde eu acompanho a qtd de leads aguardando a live? onde vejo
 * esses detalhes? quero trackear certinho de onde veio cada cadastro. story, manychat, telegram, tudo certinho").
 * Quem se inscreveu pelas páginas da Super Live, quantos esperam a live (cadastro novo, bloqueado até a liberação),
 * quantos já eram clientes (nada mudou para eles), separado por parceiro (/v e /n) e por link de origem, pessoa a pessoa.
 * Os números vêm de teeds_superlive_painel (mesma regra dos leads: o admin do parceiro só vê o dele).
 * Os links prontos (?o=sl-…) são os da Central de rastreio: cada canal tem o seu, e a contagem sai sozinha.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { SUPABASE } from '../../core/teeds/config'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { meuPapel } from '../../core/teeds/parceiroEmFoco'
import { celulaCsv, diaDeHoje, telefoneCsv } from '../../core/planilha'
import './painel-superlive.css'

type Situacao = 'aguardando' | 'ja_cliente' | 'liberado'
interface Pessoa { nome: string; email: string; telefone: string; parceiro: string; situacao: Situacao; entrou: boolean; email_enviado: boolean; canal: string; link: string | null; link_nome: string | null; campanha: string | null; conteudo: string | null; quando: string }
interface Painel {
  inicio: string | null; liberado_em: string | null; total: number; aguardando: number; ja_clientes: number; liberados: number; entraram: number; hoje: number
  por_parceiro: Array<{ parceiro: string; inscritos: number; aguardando: number; ja_clientes: number }>
  por_origem: Array<{ link: string | null; nome: string | null; canal: string; parceiro: string; inscritos: number; aguardando: number }>
  pessoas: Pessoa[]
}

const PARCEIRO: Record<string, string> = { v: 'Victor', n: 'Naor', '': 'GlobalFly (sem parceiro)' }
const CANAL: Record<string, string> = {
  stories: 'Stories', 'bio-instagram': 'Bio do Instagram', instagram: 'Instagram', manychat: 'ManyChat', telegram: 'Telegram',
  whatsapp: 'WhatsApp', 'anuncio-meta': 'Anúncio (Meta)', facebook: 'Facebook', google: 'Google', youtube: 'YouTube', tiktok: 'TikTok',
  email: 'E-mail', site: 'Site da GlobalFly', 'outro-site': 'Outro site', direto: 'Direto (sem link marcado)',
}
const SITUACAO: Record<Situacao, string> = { aguardando: 'Aguardando a live', ja_cliente: 'Já era cliente', liberado: 'Liberado' }
const canalDe = (c: string) => CANAL[c] ?? c
/** De onde veio, em uma linha: o nome do link da Central, senão o canal. */
const origemDe = (o: { link: string | null; link_nome?: string | null; nome?: string | null; canal: string }) =>
  (o.link_nome ?? o.nome)?.replace(/^Super Live · /, '') || (o.link ? `Link ${o.link}` : canalDe(o.canal))

const LINKS: Array<{ parceiro: 'v' | 'n'; codigo: string; canal: string }> = (['v', 'n'] as const).flatMap((p) =>
  [['stories', 'Stories'], ['bio', 'Bio do Instagram'], ['direct', 'Direct do Instagram'], ['manychat', 'ManyChat'], ['telegram', 'Telegram'], ['comunidade', 'Comunidade do WhatsApp'], ['whatsapp', 'WhatsApp direto']]
    .map(([c, rot]) => ({ parceiro: p, codigo: `sl-${p === 'v' ? 'victor' : 'naor'}-${c}`, canal: rot })))
const urlDoLink = (p: string, codigo: string) => `https://globalflytrade.com/${p}/superlive/?o=${codigo}`

function falta(inicio: string | null, agora: number): string {
  if (!inicio) return ''
  const ms = Date.parse(inicio) - agora
  if (ms <= 0) return 'A Super Live já começou'
  const d = Math.floor(ms / 86_400_000), h = Math.floor(ms / 3_600_000) % 24, m = Math.floor(ms / 60_000) % 60
  return `Faltam ${d ? `${d} ${d === 1 ? 'dia' : 'dias'} e ` : ''}${h} h ${String(m).padStart(2, '0')} min`
}
const quando = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function PainelSuperLive({ sessao, marca }: { sessao: SessaoTeeds; marca: string }) {
  const [d, setD] = useState<Painel | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [filtro, setFiltro] = useState<Situacao | ''>('')
  const [parceiro, setParceiro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [verLinks, setVerLinks] = useState(false)
  const [copiado, setCopiado] = useState('')
  const [podeVer, setPodeVer] = useState<string[] | null>(null)
  const [agora, setAgora] = useState(Date.now())

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_superlive_painel`, {
        method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_marca: marca }),
      })
      if (!r.ok) throw new Error('Não foi possível carregar a Super Live agora.')
      setD(await r.json()); setErro('')
    } catch (x) { setErro((x as Error).message) } finally { setCarregando(false) }
  }, [sessao, marca])

  useEffect(() => { void carregar(); const t = setInterval(() => void carregar(), 60_000); return () => clearInterval(t) }, [carregar])
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 30_000); return () => clearInterval(t) }, [])
  useEffect(() => { meuPapel(sessao, marca).then((p) => setPodeVer(p.geral ? ['v', 'n'] : p.ve)).catch(() => setPodeVer([])) }, [sessao, marca])

  const pessoas = useMemo(() => (d?.pessoas ?? []).filter((p) =>
    (!filtro || p.situacao === filtro) && (parceiro === null || p.parceiro === parceiro)
    && `${p.nome} ${p.email} ${p.telefone} ${origemDe(p)} ${p.campanha ?? ''}`.toLowerCase().includes(busca.toLowerCase())), [d, filtro, parceiro, busca])
  const maiorOrigem = Math.max(1, ...(d?.por_origem ?? []).map((o) => o.inscritos))

  const copiar = async (u: string) => {
    try { await navigator.clipboard.writeText(u); setCopiado(u); setTimeout(() => setCopiado(''), 1800) } catch { /* o endereço continua visível para copiar à mão */ }
  }
  const csv = () => {
    const s = 'Nome;E-mail;Telefone;Parceiro;Situação;Entrou na plataforma;Veio de;Canal;Link;Campanha;Inscrição\n' + pessoas.map((p) => [
      celulaCsv(p.nome), celulaCsv(p.email), telefoneCsv(p.telefone),
      ...[PARCEIRO[p.parceiro] ?? p.parceiro, SITUACAO[p.situacao], p.entrou ? 'Sim' : 'Não', origemDe(p), canalDe(p.canal), p.link ?? '', p.campanha ?? '', new Date(p.quando).toLocaleString('pt-BR')].map(celulaCsv),
    ].join(';')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + s])); a.download = `super-live-${diaDeHoje()}.csv`; a.click()
  }

  if (erro && !d) return <section className="slv"><p className="slv-erro">{erro} <button type="button" onClick={() => void carregar()}>Tentar de novo</button></p></section>
  if (!d) return <section className="slv"><p className="slv-vazio">Carregando a Super Live…</p></section>
  const liberado = !!d.liberado_em
  const links = LINKS.filter((l) => podeVer?.includes(l.parceiro))

  return <section className="slv" aria-labelledby="slv-titulo">
    <header className="slv-topo">
      <div>
        <span className="slv-rot"><i className="slv-rec" aria-hidden="true" />Super Live · domingo, 29/11, às 20h</span>
        <h3 id="slv-titulo">Inscritos da Super Live</h3>
        <p className="slv-sub">{liberado ? <>Acessos liberados em <b>{quando(d.liberado_em!)}</b>. Quem se inscreve agora já entra liberado.</> : <>{falta(d.inicio, agora)}. Para liberar todo mundo: <b>Administração › Clientes › Liberar os novos inscritos</b>.</>}</p>
      </div>
      <div className="slv-acoes">
        <button type="button" onClick={() => setVerLinks((x) => !x)} aria-expanded={verLinks}>{verLinks ? 'Fechar links' : 'Links por canal'}</button>
        <button type="button" onClick={() => void carregar()} disabled={carregando}>{carregando ? 'Atualizando…' : 'Atualizar'}</button>
      </div>
    </header>

    <div className="slv-kpis">
      <article><span>Inscritos</span><b>{d.total}</b><small>{d.hoje} hoje</small></article>
      <article className="slv-espera"><span>Aguardando a live</span><b>{d.aguardando}</b><small>{d.entraram} já entraram na plataforma</small></article>
      <article><span>Já eram clientes</span><b>{d.ja_clientes}</b><small>o acesso deles não mudou</small></article>
      <article><span>Liberados</span><b>{d.liberados}</b><small>{liberado ? 'depois da live' : 'pelo botão de liberar'}</small></article>
    </div>

    {verLinks && <div className="slv-links">
      <p>Use um link para cada lugar onde divulgar. Cada cadastro fica marcado com o link de onde veio, e a contagem aparece em <b>De onde vieram</b>.</p>
      {(['v', 'n'] as const).filter((p) => podeVer?.includes(p)).map((p) => <div key={p} className="slv-links-grupo">
        <h4>Página do {PARCEIRO[p]} <small>globalflytrade.com/{p}/superlive</small></h4>
        {links.filter((l) => l.parceiro === p).map((l) => { const u = urlDoLink(p, l.codigo); return <div key={l.codigo} className="slv-link">
          <span><b>{l.canal}</b><code>{u.replace('https://', '')}</code></span>
          <button type="button" onClick={() => void copiar(u)}>{copiado === u ? 'Copiado' : 'Copiar'}</button>
        </div> })}
      </div>)}
    </div>}

    <div className="slv-grade">
      <div className="slv-bloco">
        <h4>Por parceiro</h4>
        {d.por_parceiro.length === 0 ? <p className="slv-vazio">Ainda ninguém se inscreveu.</p> : d.por_parceiro.map((p) => <button type="button" key={p.parceiro} className={`slv-parc${parceiro === p.parceiro ? ' on' : ''}`} aria-pressed={parceiro === p.parceiro} onClick={() => setParceiro(parceiro === p.parceiro ? null : p.parceiro)}>
          <span><b>{PARCEIRO[p.parceiro] ?? p.parceiro}</b><small>{p.aguardando} aguardando · {p.ja_clientes} já clientes</small></span><strong>{p.inscritos}</strong>
        </button>)}
      </div>
      <div className="slv-bloco">
        <h4>De onde vieram</h4>
        {d.por_origem.length === 0 ? <p className="slv-vazio">Os canais aparecem com os primeiros inscritos.</p> : d.por_origem.map((o, i) => <div key={i} className="slv-orig">
          <span><b>{origemDe(o)}</b><small>{PARCEIRO[o.parceiro] ?? o.parceiro} · {o.aguardando} aguardando</small></span>
          <i aria-hidden="true"><em style={{ width: `${Math.round(o.inscritos / maiorOrigem * 100)}%` }} /></i><strong>{o.inscritos}</strong>
        </div>)}
      </div>
    </div>

    <div className="slv-filtros">
      <div className="slv-chips" role="group" aria-label="Situação">
        {([['', 'Todos', d.total], ['aguardando', 'Aguardando', d.aguardando], ['ja_cliente', 'Já clientes', d.ja_clientes], ['liberado', 'Liberados', d.liberados]] as Array<[Situacao | '', string, number]>).map(([id, t, n]) =>
          <button key={id} type="button" className={filtro === id ? 'on' : ''} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{t} <b>{n}</b></button>)}
      </div>
      <input value={busca} onChange={(x) => setBusca(x.target.value)} placeholder="Buscar nome, e-mail, telefone ou origem" aria-label="Buscar inscrito" />
      <button type="button" className="slv-csv" onClick={csv} disabled={!pessoas.length}>Exportar CSV</button>
    </div>
    <div className="slv-tabela">
      <div className="cab"><span>Inscrito</span><span>Parceiro</span><span>Veio de</span><span>Situação</span><span>Inscrição</span></div>
      {pessoas.map((p) => <div key={p.email}>
        <span><b>{p.nome}</b><small>{p.email} · {p.telefone}</small></span>
        <span><b>{PARCEIRO[p.parceiro] ?? p.parceiro}</b></span>
        <span><b>{origemDe(p)}</b><small>{[canalDe(p.canal), p.campanha && p.campanha !== 'superlive-29-11' ? p.campanha : ''].filter(Boolean).join(' · ')}</small></span>
        <span><em className={`slv-sit slv-${p.situacao}`}>{SITUACAO[p.situacao]}</em><small>{p.situacao === 'aguardando' ? (p.entrou ? 'Já entrou na plataforma' : p.email_enviado ? 'E-mail enviado' : 'E-mail a caminho') : ''}</small></span>
        <span><b>{quando(p.quando)}</b></span>
      </div>)}
      {pessoas.length === 0 && <p className="slv-vazio">Nenhum inscrito nesse filtro.</p>}
    </div>
  </section>
}
