/**
 * "Quem está online" (10/11/2026, Tiago no Monitoramento ao vivo: "clicar nesse card e ver quais clientes
 * estão online, de forma bem imersiva com ux/ui pensada").
 *
 * Abre por cima do Monitoramento, como uma gaveta da direita (no celular, a tela toda). Duas listas:
 *  - Na plataforma: quem está com o app aberto agora (a presença grava a cada minuto com a aba visível;
 *    vale quem apareceu nos últimos 3 min). Banco: teeds_quem_esta_online, no escopo de cada admin.
 *  - Operando: quem está com I.A. ligada ou operação manual aberta, mesmo com o app fechado (as I.A.
 *    rodam no servidor). Vem das sessões que o Monitoramento já acompanha ao vivo.
 * Cada pessoa mostra o plano, o aparelho, há quanto tempo apareceu, o tempo de uso hoje e a banca da
 * conta real; quem está operando mostra cada I.A. com o resultado, e o toque abre a cabine dela.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import type { ClienteRegistro } from '../../core/teeds/clientes'
import type { SessaoEspelho } from '../../core/teeds/espelho'
import { SUPABASE } from '../../core/teeds/config'
import { dinheiro } from '../../core/dinheiro'
import { MARCA } from '../../marca'
import { IconeFechar } from '../IconeFechar'
import './quem-esta-online.css'

interface IaNoAr { id: string; robo: string | null; demo: boolean; resultado: number | null; operacoes: number | null; desde: string; moeda: string | null }
export interface PessoaOnline {
  user_id: string; nome: string | null; email: string | null; foto_url: string | null
  plano_id: string | null; plano: string | null; categoria: string | null; parceiro: string | null
  visto_em: string; criado_em: string | null; acesso_expira_em: string | null; cidade: string | null; regiao: string | null
  dispositivo: string | null; segundos_hoje: number; acessos_hoje: number
  real: { saldo: number | null; moeda: string | null; conta: string } | null; tem_demo: boolean; ias: IaNoAr[]
}
type Aba = 'plataforma' | 'operando' | 'saldo'
type Ordem = 'recente' | 'banca' | 'tempo'

const ia = MARCA.vocabularioIA ? 'I.A.' : 'Robô'

export async function lerQuemEstaOnline(sessao: SessaoTeeds, marca: string, parceiro: string | null): Promise<PessoaOnline[]> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_quem_esta_online`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: marca, p_parceiro: parceiro || null, p_minutos: 3 }),
  })
  if (!r.ok) throw new Error('Não foi possível ler quem está online agora.')
  return (await r.json()) ?? []
}

const iniciais = (nome: string | null, email: string | null) => {
  const n = (nome ?? '').trim()
  if (n) return n.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  return (email ?? '?')[0].toUpperCase()
}
function haQuanto(iso: string | number, agora: number): string {
  const s = Math.max(0, Math.round((agora - (typeof iso === 'number' ? iso : Date.parse(iso))) / 1000))
  if (s < 45) return 'agora'
  if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`
  return `há ${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`
}
function duracao(segundos: number): string {
  const m = Math.round(segundos / 60)
  if (m < 1) return 'menos de 1 min'
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}
const comSinal = (v: number, moeda = 'USD') => `${v > 0 ? '+' : v < 0 ? '−' : ''}${dinheiro(Math.abs(v), moeda)}`
const APARELHO: Record<string, string> = { celular: 'Celular', computador: 'Computador', tablet: 'Tablet' }

function IconeAparelho({ tipo }: { tipo: string | null }) {
  return tipo === 'celular' || tipo === 'tablet'
    ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>
    : <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>
}

/** Quem está operando agora segundo o Monitoramento (sessões no ar e manuais abertas). */
export interface Operando { userId: string; sessoes: SessaoEspelho[]; manual: boolean }

export function QuemEstaOnline({ sessao, marcas, parceiro, operando, clientes, selo, aoAbrirSessao, aoFechar, abaInicial = 'plataforma' }: {
  sessao: SessaoTeeds
  marcas: string[]
  /** O parceiro em foco no topo ('' = todos, 'direto' = sem parceiro). */
  parceiro: string
  operando: Operando[]
  clientes: Map<string, ClienteRegistro>
  selo: (userId: string, parceiro?: string | null) => { texto: string; codigo: string } | null
  aoAbrirSessao: (sessaoId: string) => void
  aoFechar: () => void
  abaInicial?: Aba
}) {
  const [aba, setAba] = useState<Aba>(abaInicial)
  const [pessoas, setPessoas] = useState<PessoaOnline[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [lidoEm, setLidoEm] = useState(0)
  const [agora, setAgora] = useState(Date.now())
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('recente')
  const [aberta, setAberta] = useState<string | null>(null)
  const fechar = useRef<HTMLButtonElement>(null)
  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao

  // lê agora e de 20 em 20 s (com a aba do navegador à mostra)
  useEffect(() => {
    let vivo = true
    let t = 0
    const ler = () => {
      window.clearTimeout(t)
      void Promise.all(marcas.map((m) => lerQuemEstaOnline(sessaoRef.current, m, parceiro)))
        .then((listas) => { if (!vivo) return; setPessoas(listas.flat()); setErro(null); setLidoEm(Date.now()) })
        .catch((e) => { if (vivo) setErro((e as Error).message) })
        .finally(() => { if (vivo) t = window.setTimeout(ler, document.visibilityState === 'hidden' ? 60_000 : 20_000) })
    }
    ler()
    return () => { vivo = false; window.clearTimeout(t) }
  }, [marcas.join(','), parceiro]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = window.setInterval(() => setAgora(Date.now()), 5000); return () => window.clearInterval(t) }, [])

  // Esc fecha; o foco vai para o fechar ao abrir; a página de trás não rola
  useEffect(() => {
    fechar.current?.focus()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    document.addEventListener('keydown', tecla)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', tecla); document.body.style.overflow = antes }
  }, [aoFechar])

  const porId = useMemo(() => new Map((pessoas ?? []).map((p) => [p.user_id, p])), [pessoas])
  // só quem tem dinheiro na conta real (conta real zerada não conta: 10/11/2026)
  const comReal = (pessoas ?? []).filter((p) => Number(p.real?.saldo ?? 0) > 0).length
  const q = busca.trim().toLowerCase()
  const bate = (nome: string | null | undefined, email: string | null | undefined) => !q || `${nome ?? ''} ${email ?? ''}`.toLowerCase().includes(q)

  const listaPlataforma = useMemo(() => {
    const l = (pessoas ?? []).filter((p) => bate(p.nome, p.email))
    if (ordem === 'banca') l.sort((a, b) => (b.real?.saldo ?? -1) - (a.real?.saldo ?? -1))
    else if (ordem === 'tempo') l.sort((a, b) => b.segundos_hoje - a.segundos_hoje)
    return l
  }, [pessoas, q, ordem]) // eslint-disable-line react-hooks/exhaustive-deps
  // 10/11/2026 (Tiago): o 3º cartão também abre a lista — quem está na plataforma com saldo na conta real, maior banca primeiro
  const listaSaldo = useMemo(() => (pessoas ?? [])
    .filter((p) => Number(p.real?.saldo ?? 0) > 0 && bate(p.nome, p.email))
    .sort((a, b) => Number(b.real?.saldo ?? 0) - Number(a.real?.saldo ?? 0)), [pessoas, q]) // eslint-disable-line react-hooks/exhaustive-deps
  const listaOperando = useMemo(() => operando
    .filter((o) => bate(clientes.get(o.userId)?.nome ?? porId.get(o.userId)?.nome, clientes.get(o.userId)?.email ?? porId.get(o.userId)?.email))
    .sort((a, b) => Number(b.sessoes.some((s) => !s.demo)) - Number(a.sessoes.some((s) => !s.demo))), [operando, clientes, porId, q]) // eslint-disable-line react-hooks/exhaustive-deps

  // função de desenho (não componente): o relógio redesenha a cada 5 s sem recriar as linhas
  const pessoa = ({ id, p, sessoes, manual }: { id: string; p?: PessoaOnline; sessoes?: SessaoEspelho[]; manual?: boolean }) => {
    const c = clientes.get(id)
    const nome = p?.nome || c?.nome || p?.email || c?.email || 'Cliente'
    const email = p?.email || c?.email || ''
    const s = selo(id, p?.parceiro ?? c?.parceiro ?? undefined)
    const naPlataforma = !!p
    const iasDoBanco = p?.ias ?? []
    const expandida = aberta === id
    return (
      <li key={id} className={`qeo-pessoa${expandida ? ' aberta' : ''}`}>
        <button type="button" className="qeo-linha" onClick={() => setAberta(expandida ? null : id)} aria-expanded={expandida}>
          <span className={`qeo-avatar${naPlataforma ? ' online' : ''}`} aria-hidden="true">
            {p?.foto_url ? <img src={p.foto_url} alt="" loading="lazy" /> : <b>{iniciais(nome, email)}</b>}
            <i />
          </span>
          <span className="qeo-quem">
            <span className="qeo-nome"><b>{nome}</b>{s && <em className={`qeo-selo p-${s.codigo}`}>{s.texto}</em>}</span>
            <span className="qeo-meta">
              {p?.plano && <span className="qeo-chip">{p.plano}</span>}
              {p ? <span className="qeo-aparelho"><IconeAparelho tipo={p.dispositivo} />{APARELHO[p.dispositivo ?? ''] ?? 'Aparelho'}</span> : <span className="qeo-fora">App fechado</span>}
              {p && <span className="qeo-visto">{haQuanto(p.visto_em, agora)}</span>}
            </span>
          </span>
          <span className="qeo-banca">
            {p?.real?.saldo != null
              ? <><b className={Number(p.real.saldo) > 0 ? '' : 'qeo-zerada'}>{dinheiro(Number(p.real.saldo), p.real.moeda || 'USD')}</b><small>{Number(p.real.saldo) > 0 ? 'Conta real' : 'Conta real sem saldo'}</small></>
              : <small className="qeo-sem">{p ? (p.tem_demo ? 'Só conta demo' : 'Sem corretora') : ''}</small>}
          </span>
        </button>
        {/* o que está ligado agora: as I.A. do Monitoramento (ao vivo) ou, sem elas, as do banco */}
        {((sessoes && sessoes.length > 0) || iasDoBanco.length > 0 || manual) && (
          <div className="qeo-ias">
            {sessoes && sessoes.length > 0
              ? sessoes.map((x) => (
                <button key={x.sessaoId} type="button" className={`qeo-ia${x.demo ? '' : ' real'}`} onClick={() => aoAbrirSessao(x.sessaoId)} title="Abrir a cabine">
                  <i aria-hidden="true" /><b>{x.roboNome}</b><span>{x.demo ? 'Demo' : 'Real'}</span>
                  <span className={(x.estado.resultado ?? 0) >= 0 ? 'sobe' : 'cai'}>{comSinal(x.estado.resultado ?? 0, x.moeda)}</span>
                  <small>{haQuanto(x.criadaEm, agora).replace('há ', '')}</small><span className="qeo-abrir" aria-hidden="true">›</span>
                </button>
              ))
              : iasDoBanco.map((x) => (
                <button key={x.id} type="button" className={`qeo-ia${x.demo ? '' : ' real'}`} onClick={() => aoAbrirSessao(x.id)} title="Abrir a cabine">
                  <i aria-hidden="true" /><b>{x.robo || ia}</b><span>{x.demo ? 'Demo' : 'Real'}</span>
                  <span className={(x.resultado ?? 0) >= 0 ? 'sobe' : 'cai'}>{comSinal(Number(x.resultado ?? 0), x.moeda || 'USD')}</span>
                  <small>{haQuanto(x.desde, agora).replace('há ', '')}</small><span className="qeo-abrir" aria-hidden="true">›</span>
                </button>
              ))}
            {manual && <span className="qeo-ia manual"><i aria-hidden="true" /><b>Operação manual</b><span>Aberta agora</span></span>}
          </div>
        )}
        {expandida && (
          <dl className="qeo-detalhes">
            {email && <div><dt>E-mail</dt><dd>{email}</dd></div>}
            {p && <div><dt>Hoje</dt><dd>{duracao(p.segundos_hoje)} de uso · {p.acessos_hoje} {p.acessos_hoje === 1 ? 'acesso' : 'acessos'}</dd></div>}
            {(p?.cidade || p?.regiao) && <div><dt>De onde</dt><dd>{[p.cidade, p.regiao].filter(Boolean).join(' · ')}</dd></div>}
            {p?.real && <div><dt>Conta real</dt><dd>{p.real.conta}</dd></div>}
            {p?.criado_em && <div><dt>Cliente desde</dt><dd>{new Date(p.criado_em).toLocaleDateString('pt-BR')}</dd></div>}
            {p?.acesso_expira_em && <div><dt>Acesso até</dt><dd>{new Date(p.acesso_expira_em).toLocaleDateString('pt-BR')}</dd></div>}
          </dl>
        )}
      </li>
    )
  }

  const vazioPlataforma = pessoas !== null && !listaPlataforma.length
  return (
    <div className="qeo-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar() }}>
      <aside className="qeo" role="dialog" aria-modal="true" aria-labelledby="qeo-titulo">
        <header className="qeo-topo">
          <div>
            <span className="qeo-vivo"><i aria-hidden="true" />Ao vivo</span>
            <h2 id="qeo-titulo">Quem está online</h2>
            <p>{lidoEm ? `Atualiza sozinho · lido ${haQuanto(lidoEm, agora)}` : 'Lendo…'}</p>
          </div>
          <button ref={fechar} type="button" className="qeo-fechar" onClick={aoFechar} aria-label="Fechar"><IconeFechar /></button>
        </header>

        <div className="qeo-numeros">
          <button type="button" className={aba === 'plataforma' ? 'on' : ''} onClick={() => setAba('plataforma')}>
            <strong>{pessoas?.length ?? '—'}</strong><span>Na plataforma</span>
          </button>
          <button type="button" className={aba === 'operando' ? 'on' : ''} onClick={() => setAba('operando')}>
            <strong>{operando.length}</strong><span>Operando</span>
          </button>
          <button type="button" className={aba === 'saldo' ? 'on' : ''} onClick={() => setAba('saldo')}>
            <strong>{pessoas ? comReal : '—'}</strong><span>Com saldo real</span>
          </button>
        </div>

        <div className="qeo-filtros">
          <label className="qeo-busca"><span aria-hidden="true">⌕</span><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou e-mail" aria-label="Buscar nome ou e-mail" /></label>
          {aba === 'plataforma' && (
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">
              <option value="recente">Mais recentes</option><option value="banca">Maior banca</option><option value="tempo">Mais tempo hoje</option>
            </select>
          )}
        </div>

        {erro && <p className="qeo-erro" role="alert">{erro}</p>}
        <div className="qeo-corpo">
          {aba === 'plataforma' && (pessoas === null
            ? <div className="qeo-vazio"><b>Lendo quem está na plataforma…</b></div>
            : vazioPlataforma
              ? <div className="qeo-vazio"><b>{q ? 'Ninguém com esse nome ou e-mail.' : 'Ninguém na plataforma agora.'}</b><span>Conta quem está com o app aberto nos últimos 3 minutos.</span></div>
              : <ul>{listaPlataforma.map((p) => {
                  const o = operando.find((x) => x.userId === p.user_id)
                  return pessoa({ id: p.user_id, p, sessoes: o?.sessoes, manual: o?.manual })
                })}</ul>)}
          {aba === 'saldo' && (pessoas === null
            ? <div className="qeo-vazio"><b>Lendo quem está na plataforma…</b></div>
            : listaSaldo.length
              ? <ul>{listaSaldo.map((p) => {
                  const o = operando.find((x) => x.userId === p.user_id)
                  return pessoa({ id: p.user_id, p, sessoes: o?.sessoes, manual: o?.manual })
                })}</ul>
              : <div className="qeo-vazio"><b>{q ? 'Ninguém com esse nome ou e-mail.' : 'Ninguém com saldo na conta real agora.'}</b><span>Mostra quem está na plataforma com dinheiro na conta real, da maior banca para a menor.</span></div>)}
          {aba === 'operando' && (listaOperando.length
            ? <ul>{listaOperando.map((o) => pessoa({ id: o.userId, p: porId.get(o.userId), sessoes: o.sessoes, manual: o.manual }))}</ul>
            : <div className="qeo-vazio"><b>{q ? 'Ninguém com esse nome ou e-mail.' : `Ninguém operando agora.`}</b><span>Quando alguém ligar {MARCA.vocabularioIA ? 'uma I.A.' : 'um robô'} ou abrir uma operação manual, aparece aqui na hora.</span></div>)}
        </div>
        <footer className="qeo-pe">Na plataforma = app aberto nos últimos 3 minutos. Operando = {ia} ligada ou operação manual aberta, mesmo com o app fechado (cada pessoa conta uma vez). Com saldo real = conta real com dinheiro. A equipe não entra na conta.</footer>
      </aside>
    </div>
  )
}
