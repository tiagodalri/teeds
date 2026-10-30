import type { Pessoa } from '../../core/teeds/organizacao'

/* Peças pequenas que a central e a janela da tarefa usam (30/10/2026). */

export const dataLonga = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number)
  const t = new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}
export const dataCurta = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }
export const primeiroNome = (n: string) => (n.trim().split(/\s+/)[0] || n)
export const iniciais = (n: string) => { const p = n.trim().split(/\s+/).filter(Boolean); return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() }
const CORES_PESSOA = ['#B78D39', '#38BDF8', '#A78BFA', '#34D399', '#F472B6', '#FB923C']
export const corDaPessoa = (equipe: Pessoa[], id: string | null) => {
  const i = equipe.findIndex((p) => p.id === id)
  return i < 0 ? '#64748B' : CORES_PESSOA[i % CORES_PESSOA.length]
}
/** "Victor C." quando há dois com o mesmo primeiro nome. */
export const nomeCurto = (equipe: Pessoa[], p: Pessoa) =>
  equipe.filter((x) => primeiroNome(x.nome) === primeiroNome(p.nome)).length > 1
    ? `${primeiroNome(p.nome)} ${p.nome.trim().split(/\s+/).slice(-1)[0][0]}.`
    : primeiroNome(p.nome)

export function Avatar({ pessoa, cor, tamanho = 22 }: { pessoa: Pessoa | undefined; cor: string; tamanho?: number }) {
  return (
    <span className="og-avatar" style={{ width: tamanho, height: tamanho, background: pessoa ? cor : 'transparent', fontSize: tamanho * 0.42 }}
      title={pessoa ? pessoa.nome : 'Sem responsável'} data-vazio={pessoa ? undefined : ''}>
      {pessoa ? iniciais(pessoa.nome) : '?'}
    </span>
  )
}

/** Os responsáveis de uma tarefa, sobrepostos; passa de 3 vira "+n". */
export function PilhaDeAvatares({ ids, equipe, tamanho = 22 }: { ids: string[]; equipe: Pessoa[]; tamanho?: number }) {
  if (!ids.length) return <Avatar pessoa={undefined} cor="" tamanho={tamanho} />
  const mostrar = ids.slice(0, 3)
  const nomes = ids.map((id) => equipe.find((p) => p.id === id)?.nome).filter(Boolean).join(', ')
  return (
    <span className="og-pilha" title={nomes}>
      {mostrar.map((id) => <Avatar key={id} pessoa={equipe.find((p) => p.id === id)} cor={corDaPessoa(equipe, id)} tamanho={tamanho} />)}
      {ids.length > 3 && <span className="og-avatar og-pilha-mais" style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.4 }}>+{ids.length - 3}</span>}
    </span>
  )
}

export const tamanhoLegivel = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`

export const quandoFoi = (iso: string) => {
  const d = new Date(iso)
  const min = Math.round((Date.now() - d.getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const hoje = new Date()
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === hoje.toDateString()) return `hoje às ${hora}`
  if (d.toDateString() === new Date(Date.now() - 864e5).toDateString()) return `ontem às ${hora}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: d.getFullYear() === hoje.getFullYear() ? undefined : 'numeric' })} às ${hora}`
}
