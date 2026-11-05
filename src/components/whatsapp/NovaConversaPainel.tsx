/**
 * Nova conversa (05/11/2026), como no WhatsApp: o painel que desliza por cima da lista.
 * Um campo só: digita o número (com DDD) e aparece "Conversar com +55 …"; digita um nome
 * ou e-mail e aparecem os clientes e leads da plataforma que têm telefone (o admin de
 * parceiro só vê os do parceiro dele). Tiago: "onde eu digito o número e consigo chamar
 * um contato".
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { telefoneBonito, type WhatsAppApi, type PessoaDaPlataforma } from '../../core/teeds/whatsapp'
import { haQuanto } from './textoWpp'

export interface EscolhaDeContato { numero: string; nome: string; contatoId: string | null }

/** Só dígitos, com o 55 na frente quando é um número do Brasil (DDD + 8 ou 9 dígitos). */
export function numeroCompleto(valor: string): string | null {
  let d = valor.replace(/\D/g, '')
  if (d.startsWith('0')) d = d.replace(/^0+/, '')
  if (d.length === 10 || d.length === 11) d = '55' + d
  if (d.length < 12 || d.length > 15) return null
  if (d.startsWith('55') && !(d.length === 12 || d.length === 13)) return null
  return d
}

export function NovaConversaPainel({ api, onFechar, onEscolher }: { api: WhatsAppApi; onFechar: () => void; onEscolher: (e: EscolhaDeContato) => void }) {
  const [q, setQ] = useState('')
  const [nome, setNome] = useState('')
  const [pessoas, setPessoas] = useState<PessoaDaPlataforma[] | null>(null)
  const [sel, setSel] = useState(0)
  const campo = useRef<HTMLInputElement>(null)
  const numero = numeroCompleto(q)
  const soNumeros = /^[\d\s()+-]+$/.test(q.trim()) && q.replace(/\D/g, '').length >= 3

  useEffect(() => { campo.current?.focus() }, [])
  useEffect(() => {
    let vivo = true
    const t = setTimeout(() => { void api.buscarPessoas(q).then((l) => { if (vivo) { setPessoas(l); setSel(0) } }) }, q ? 220 : 0)
    return () => { vivo = false; clearTimeout(t) }
  }, [api, q])

  const opcoes = useMemo(() => {
    const l: Array<{ chave: string; escolha: EscolhaDeContato; pessoa?: PessoaDaPlataforma }> = []
    const jaNaLista = pessoas?.some((p) => numeroCompleto(p.telefone) === numero)
    if (numero && !jaNaLista) l.push({ chave: 'numero', escolha: { numero, nome: nome.trim(), contatoId: null } })
    for (const p of pessoas ?? []) {
      const n = numeroCompleto(p.telefone)
      if (n) l.push({ chave: `${p.origem}-${p.id}`, pessoa: p, escolha: { numero: n, nome: p.nome ?? '', contatoId: p.contatoId } })
    }
    return l
  }, [pessoas, numero, nome])

  const clientes = opcoes.filter((o) => o.pessoa?.origem === 'cliente')
  const leads = opcoes.filter((o) => o.pessoa?.origem === 'lead')
  const indice = (chave: string) => opcoes.findIndex((o) => o.chave === chave)

  return <section className="wz-nova" aria-label="Nova conversa"
    onKeyDown={(e) => {
      if (e.key === 'Escape') { e.preventDefault(); onFechar() }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(opcoes.length - 1, s + 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
      if (e.key === 'Enter' && opcoes[sel] && (e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).name === 'busca') { e.preventDefault(); onEscolher(opcoes[sel].escolha) }
    }}>
    <header><button className="wz-icone-btn" onClick={onFechar} aria-label="Voltar"><Seta /></button><b>Nova conversa</b></header>
    <label className="wz-busca wz-nova-busca">
      <Lupa />
      <input ref={campo} name="busca" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, e-mail ou número com DDD" aria-label="Nome, e-mail ou número" inputMode={soNumeros ? 'tel' : 'text'} autoComplete="off" />
    </label>
    <div className="wz-nova-rolagem">
      {numero && opcoes[0]?.chave === 'numero' && <div className="wz-nova-numero">
        <button className={`wz-nova-item ${sel === 0 ? 'on' : ''}`} onMouseEnter={() => setSel(0)} onClick={() => onEscolher(opcoes[0].escolha)}>
          <span className="wz-nova-icone verde"><Balao /></span>
          <span className="wz-nova-meio"><b>Conversar com {telefoneBonito(numero)}</b><small>Abre a conversa com este número. O primeiro contato é um modelo aprovado.</small></span>
        </button>
        <label className="wz-nova-nome"><span>Nome (opcional)</span><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como a pessoa se chama" /></label>
      </div>}
      {!numero && soNumeros && <p className="wz-nova-dica">Continue digitando: DDD + número, por exemplo (47) 99999-8888.</p>}

      {pessoas === null && <div className="wz-carregando pequeno"><i />Procurando na plataforma…</div>}
      {clientes.length > 0 && <Grupo titulo={q ? 'Clientes da plataforma' : 'Clientes que entraram por último'}>{clientes.map((o) => <Item key={o.chave} o={o} on={indice(o.chave) === sel} onMouseEnter={() => setSel(indice(o.chave))} onClick={() => onEscolher(o.escolha)} />)}</Grupo>}
      {leads.length > 0 && <Grupo titulo={q ? 'Leads (sem conta ainda)' : 'Leads recentes'}>{leads.map((o) => <Item key={o.chave} o={o} on={indice(o.chave) === sel} onMouseEnter={() => setSel(indice(o.chave))} onClick={() => onEscolher(o.escolha)} />)}</Grupo>}
      {pessoas !== null && !clientes.length && !leads.length && q.trim() && !numero && <div className="wz-vazio-lista"><b>Ninguém encontrado</b><small>Confira o nome ou o e-mail. Para falar com alguém que não está na plataforma, digite o número com DDD.</small></div>}
      <p className="wz-nova-rodape">Pela regra do WhatsApp, quem não falou com vocês nas últimas 24 horas recebe primeiro um modelo aprovado. Depois que a pessoa responder, a conversa fica livre.</p>
    </div>
  </section>
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <div className="wz-nova-grupo"><span>{titulo}</span>{children}</div>
}

function Item({ o, on, onClick, onMouseEnter }: { o: { escolha: EscolhaDeContato; pessoa?: PessoaDaPlataforma }; on: boolean; onClick: () => void; onMouseEnter: () => void }) {
  const p = o.pessoa!
  const nome = p.nome?.trim() || telefoneBonito(o.escolha.numero)
  const iniciais = nome.split(/\s+/).filter((x) => /\p{L}/u.test(x)).slice(0, 2).map((x) => x[0].toUpperCase()).join('') || '#'
  return <button className={`wz-nova-item ${on ? 'on' : ''}`} onClick={onClick} onMouseEnter={onMouseEnter}>
    <span className="wz-avatar">{iniciais}</span>
    <span className="wz-nova-meio">
      <b>{nome}{p.contatoId && <em className="wz-nova-ja">Já conversou</em>}</b>
      <small>{telefoneBonito(o.escolha.numero)}{p.email ? ` · ${p.email}` : ''}</small>
      <span className="wz-nova-selos">
        {p.origem === 'cliente' ? <i className={`sub ${p.subplano ?? 'gold'}`}>{(p.subplano ?? 'gold').replace(/^./, (x) => x.toUpperCase())}</i> : <i className="lead">Lead</i>}
        {p.parceiro && <i>/{p.parceiro}</i>}
        {p.criadoEm && <i>Cadastro {haQuanto(p.criadoEm)}</i>}
      </span>
    </span>
  </button>
}

const Seta = () => <svg viewBox="0 0 24 24" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
const Lupa = () => <svg viewBox="0 0 24 24" aria-hidden><path d="M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM15.5 15.5 20 20" /></svg>
const Balao = () => <svg viewBox="0 0 24 24" aria-hidden><path d="M4.2 19.8l1.2-3.9A8.2 8.2 0 1 1 8.4 18.7z" /></svg>
