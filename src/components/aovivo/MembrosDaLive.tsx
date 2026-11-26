import { useEffect, useRef, useState } from 'react'
import { SUPABASE } from '../../core/teeds/config'
import { sessaoGuardada } from '../../core/teeds/conta'
import { MARCA } from '../../marca'
import { useTreino } from '../../core/live/treino'
import type { ContatoWpp, WhatsAppApi } from '../../core/teeds/whatsapp'
import type { FichaDoContato } from '../../core/teeds/fichaDoCliente'
import { FichaDoCliente } from '../assessor/FichaDoCliente'
import './membros-da-live.css'

/**
 * Os membros de verdade na live, com a ficha de cada um (26/11/2026, pedido do Tiago):
 * foto, nome, membro desde quando, saldo da conta real, o markup de sempre e o markup
 * gerado NESTA live, que vai somando a cada operação (a lista pergunta de 4 em 4 s).
 * Só a equipe vê (teeds_fichas_da_live confere no banco).
 */

interface Ficha {
  id: string; nome: string | null; foto: string | null; desde: string | null; plano: string | null
  cidade: string; uf: string; saldo: number | null; moeda: string
  markupTotal: number; markupLive: number; opsLive: number; ultimaOp: string | null
}

const dinheiro = (v: number, moeda = 'USD') => v.toLocaleString('pt-BR', { style: 'currency', currency: moeda || 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
function haQuanto(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
/** Há quanto tempo é membro ("4 meses", "1 ano"), para a dica ao passar o mouse. */
function tempoDeCasa(iso: string | null): string {
  if (!iso) return ''
  const meses = Math.floor((Date.now() - new Date(iso).getTime()) / (30.44 * 864e5))
  return meses < 1 ? 'Entrou este mês' : meses < 12 ? `Há ${meses} ${meses === 1 ? 'mês' : 'meses'}` : `Há ${Math.floor(meses / 12)} ${Math.floor(meses / 12) === 1 ? 'ano' : 'anos'}`
}

/** Só para o laboratório: fichas de exemplo, sem banco. */
let fichasDoLab: Ficha[] | null = null
export function simularFichas(l: Ficha[] | null): void { fichasDoLab = l }
export type { Ficha }

async function lerFichas(ids: string[], desde: number): Promise<Ficha[]> {
  if (fichasDoLab) return fichasDoLab
  const s = sessaoGuardada()
  if (!s || !ids.length) return []
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_fichas_da_live`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: MARCA.id, p_ids: ids, p_desde: new Date(desde || Date.now()).toISOString() }),
  })
  if (!r.ok) throw new Error(`fichas ${r.status}`)
  const lista = (await r.json()) as Array<Record<string, unknown>>
  const n = (v: unknown) => Number(v ?? 0) || 0
  return (lista ?? []).map((l) => ({
    id: String(l.id), nome: (l.nome as string) ?? null, foto: (l.foto as string) ?? null, desde: (l.desde as string) ?? null, plano: (l.plano as string) ?? null,
    cidade: String(l.cidade ?? ''), uf: String(l.uf ?? ''), saldo: l.saldo === null || l.saldo === undefined ? null : n(l.saldo), moeda: String(l.moeda ?? 'USD'),
    markupTotal: n(l.markup_total), markupLive: n(l.markup_live), opsLive: n(l.ops_live), ultimaOp: (l.ultima_op as string) ?? null,
  }))
}

/** A ficha completa de um membro (o mesmo formato da lateral do WhatsApp do Assessor), montada no banco. */
async function lerFichaCompleta(userId: string): Promise<FichaDoContato> {
  // laboratório: a ficha de exemplo do Assessor
  if (fichasDoLab) { const { assessorDeExemplo } = await import('../../core/teeds/assessorChat'); return assessorDeExemplo().fichaCompleta!(`lab-${userId}2`) }
  const s = sessaoGuardada()
  if (!s) return { ficha: null, fotoWhatsapp: null, talvez: [] }
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_ficha_do_membro`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: MARCA.id, p_user: userId }),
  })
  if (!r.ok) throw new Error(`ficha ${r.status}`)
  return { ficha: await r.json(), fotoWhatsapp: null, talvez: [] }
}
/** A ficha da lateral do Assessor pede um "contato" e uma "api": aqui os dois saem da conta do membro. */
const API_DA_FICHA = { fichaCompleta: (id: string) => lerFichaCompleta(id) } as unknown as WhatsAppApi
const contatoDo = (id: string, nome: string, telefone: string): ContatoWpp => ({
  id, waId: telefone, nome, userId: id, leadId: null, ultimaEm: null, ultimaTexto: null, ultimaDirecao: null, ultimaEntradaEm: null,
  naoLidas: 0, responsavel: null, situacao: 'aberta', etiquetas: [], criadoEm: new Date().toISOString(), fixada: false,
})

/** A lista que se atualiza sozinha enquanto está aberta. */
function useFichas(aberta: boolean): { fichas: Map<string, Ficha>; erro: boolean; lendo: boolean } {
  const t = useTreino()
  const [fichas, setFichas] = useState<Map<string, Ficha>>(new Map())
  const [erro, setErro] = useState(false)
  const [lendo, setLendo] = useState(true)
  const ids = useRef<string[]>([])
  ids.current = t.membrosNaSala.map((m) => m.id)
  const desde = useRef(0)
  desde.current = t.inicioDaLive
  const chave = ids.current.slice().sort().join('|')
  useEffect(() => {
    if (!aberta) return
    let vivo = true
    let timer = 0
    const ler = async () => {
      try {
        const lista = await lerFichas(ids.current, desde.current)
        if (!vivo) return
        setFichas(new Map(lista.map((f) => [f.id, f])))
        setErro(false)
      } catch { if (vivo) setErro(true) } finally { if (vivo) setLendo(false) }
      if (vivo) timer = window.setTimeout(() => void ler(), document.hidden ? 15000 : 4000)
    }
    void ler()
    return () => { vivo = false; window.clearTimeout(timer) }
  }, [aberta, chave, t.inicioDaLive])
  return { fichas, erro, lendo }
}

function Cartao({ nome, f, noAr, abrir }: { nome: string; f: Ficha | undefined; noAr: boolean; abrir: () => void }) {
  const [subiu, setSubiu] = useState(false)
  const antes = useRef(f?.markupLive ?? 0)
  useEffect(() => {
    const agora = f?.markupLive ?? 0
    if (agora > antes.current + 1e-9) { setSubiu(true); const t = window.setTimeout(() => setSubiu(false), 1600); antes.current = agora; return () => window.clearTimeout(t) }
    antes.current = agora
  }, [f?.markupLive])
  const exibido = f?.nome?.trim() || nome
  const operando = !!f?.ultimaOp && Date.now() - Date.parse(f.ultimaOp) < 3 * 60_000
  const lugar = [f?.cidade, f?.uf].filter(Boolean).join(' · ')
  return (
    <li className={`ml-cartao ${subiu ? 'subiu' : ''}`} role="button" tabIndex={0} onClick={abrir}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir() } }} aria-label={`Abrir a ficha de ${exibido}`}>
      <div className="ml-topo">
        <span className="ml-foto">{f?.foto ? <img src={f.foto} alt="" loading="lazy" /> : <span aria-hidden>{iniciais(exibido)}</span>}<i className="ml-online" title="Na live agora" aria-hidden /></span>
        <span className="ml-quem">
          <b>{exibido}</b>
          <small>{lugar || 'Na live agora'}{operando && <em className="ml-operando"><i aria-hidden />Operando</em>}</small>
        </span>
        <span className={`ml-live ${f && f.markupLive > 0 ? 'tem' : ''}`} title="Markup gerado por esta pessoa desde o começo da live">
          <small>Nesta live</small>
          <b className="cv-num">{f ? dinheiro(f.markupLive) : '—'}</b>
          {f && noAr && <span>{f.opsLive} {f.opsLive === 1 ? 'operação' : 'operações'}</span>}
        </span>
      </div>
      <dl className="ml-dados">
        <div><dt>Saldo</dt><dd className="cv-num">{f ? (f.saldo === null ? 'Sem conta real' : dinheiro(f.saldo, f.moeda)) : '…'}</dd></div>
        <div><dt>Markup total</dt><dd className="cv-num">{f ? dinheiro(f.markupTotal) : '…'}</dd></div>
        <div title={f ? tempoDeCasa(f.desde) : undefined}><dt>Membro desde</dt><dd>{f ? haQuanto(f.desde) : '…'}</dd></div>
      </dl>
    </li>
  )
}

/** A gaveta com a lista (abre por cima do painel, do lado direito). */
export function MembrosDaLive({ fechar }: { fechar: () => void }) {
  const t = useTreino()
  const { fichas, erro, lendo } = useFichas(true)
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<'live' | 'saldo' | 'total' | 'nome'>('live')
  // a ficha completa de um membro (clique no cartão)
  const [aberta, setAberta] = useState<string | null>(null)
  const abertaRef = useRef<string | null>(null)
  abertaRef.current = aberta
  useEffect(() => {
    const esc = (ev: KeyboardEvent) => { if (ev.key !== 'Escape') return; if (abertaRef.current) setAberta(null); else fechar() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [fechar])
  const noAr = t.inicioDaLive > 0
  const termo = busca.trim().toLowerCase()
  const lista = t.membrosNaSala
    .map((m) => ({ m, f: fichas.get(m.id) }))
    .filter(({ m, f }) => !termo || (f?.nome ?? m.nome).toLowerCase().includes(termo))
    .sort((a, b) => {
      const fa = a.f, fb = b.f
      if (ordem === 'nome') return (fa?.nome ?? a.m.nome).localeCompare(fb?.nome ?? b.m.nome, 'pt-BR')
      const v = (f: Ficha | undefined) => (!f ? -1 : ordem === 'live' ? f.markupLive : ordem === 'saldo' ? (f.saldo ?? -1) : f.markupTotal)
      return v(fb) - v(fa)
    })
  const totalLive = [...fichas.values()].reduce((s, f) => s + f.markupLive, 0)
  const operando = [...fichas.values()].filter((f) => f.ultimaOp && Date.now() - Date.parse(f.ultimaOp) < 3 * 60_000).length
  return (
    <div className="ml-fundo" onPointerDown={(e) => { if (e.target === e.currentTarget) fechar() }}>
      {aberta ? <FichaAberta id={aberta} nome={t.membrosNaSala.find((m) => m.id === aberta)?.nome ?? ''} f={fichas.get(aberta)} noAr={noAr} voltar={() => setAberta(null)} fechar={fechar} />
      : <aside className="ml-gaveta" role="dialog" aria-modal="true" aria-label="Membros na live">
        <header className="ml-cabeca">
          <div>
            <h2>Membros na live</h2>
            <p>Membros reais, sem o público simulado. Atualiza sozinho.</p>
          </div>
          <button type="button" className="ml-fechar" onClick={fechar} aria-label="Fechar">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <div className="ml-resumo" role="group" aria-label="Resumo">
          <div><small>Online agora</small><b className="cv-num">{t.membrosNaSala.length}</b></div>
          <div><small>Operando</small><b className="cv-num">{operando}</b></div>
          <div className="ouro"><small>Markup nesta live</small><b className="cv-num">{dinheiro(totalLive)}</b></div>
        </div>
        <div className="ml-filtros">
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pelo nome" aria-label="Buscar pelo nome" />
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)} aria-label="Ordenar">
            <option value="live">Mais markup na live</option>
            <option value="saldo">Maior saldo</option>
            <option value="total">Mais markup total</option>
            <option value="nome">Nome (A a Z)</option>
          </select>
        </div>
        {erro && <p className="ml-aviso" role="alert">Não consegui atualizar as fichas agora. Tentando de novo…</p>}
        {t.membrosNaSala.length === 0
          ? <p className="ml-vazio">Nenhum membro na sala agora. Quando alguém entrar, a ficha aparece aqui.</p>
          : <ul className="ml-lista" aria-busy={lendo}>{lista.map(({ m, f }) => <Cartao key={m.id} nome={m.nome} f={f} noAr={noAr} abrir={() => setAberta(m.id)} />)}</ul>}
      </aside>}
    </div>
  )
}

/** A ficha completa, no mesmo visual da lateral do WhatsApp do Assessor, com o que ele fez NESTA live em cima. */
function FichaAberta({ id, nome, f, noAr, voltar, fechar }: { id: string; nome: string; f: Ficha | undefined; noAr: boolean; voltar: () => void; fechar: () => void }) {
  const t = useTreino()
  const naSala = t.membrosNaSala.some((m) => m.id === id)
  const contato = contatoDo(id, f?.nome?.trim() || nome, '')
  const operando = !!f?.ultimaOp && Date.now() - Date.parse(f.ultimaOp) < 3 * 60_000
  // confere antes se a ficha existe (sem ela, a lateral do Assessor falaria de "número não confirmado")
  const [existe, setExiste] = useState<boolean | null>(null)
  useEffect(() => {
    let vivo = true
    setExiste(null)
    void lerFichaCompleta(id).then((d) => vivo && setExiste(!!d.ficha)).catch(() => vivo && setExiste(false))
    return () => { vivo = false }
  }, [id])
  return (
    <aside className="ml-gaveta ml-gaveta-ficha" role="dialog" aria-modal="true" aria-label={`Ficha de ${contato.nome}`}>
      <header className="ml-cabeca ml-cabeca-ficha">
        <button type="button" className="ml-voltar" onClick={voltar}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          Membros na live
        </button>
        <button type="button" className="ml-fechar" onClick={fechar} aria-label="Fechar">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      <section className={`ml-nesta-live ${f && f.markupLive > 0 ? 'tem' : ''}`} aria-label="Nesta live">
        <div className="ml-nesta-topo">
          <span className={`ml-estado ${naSala ? 'on' : ''}`}><i aria-hidden />{naSala ? 'Na live agora' : 'Saiu da live'}</span>
          {operando && <span className="ml-operando"><i aria-hidden />Operando agora</span>}
        </div>
        <div className="ml-nesta-numeros">
          <div className="ouro"><small>Markup nesta live</small><b className="cv-num">{f ? dinheiro(f.markupLive) : '…'}</b><span>{f && noAr ? `${f.opsLive} ${f.opsLive === 1 ? 'operação real' : 'operações reais'}` : 'conta real'}</span></div>
          <div><small>Saldo real</small><b className="cv-num">{f ? (f.saldo === null ? '—' : dinheiro(f.saldo, f.moeda)) : '…'}</b><span>agora</span></div>
        </div>
      </section>
      <div className="ml-ficha-rolagem">
        {existe === false
          ? <p className="ml-vazio">Não consegui abrir a ficha completa desta pessoa agora. Ela pode não estar no seu escopo de clientes, ou a conexão falhou. Tente de novo em instantes.</p>
          : existe === null ? <div className="ml-carregando" aria-busy="true"><i /><i /><i /></div>
            : <FichaDoCliente api={API_DA_FICHA} contato={contato} />}
      </div>
    </aside>
  )
}
