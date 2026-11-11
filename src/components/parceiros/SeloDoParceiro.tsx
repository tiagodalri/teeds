/**
 * O Selo do Parceiro (11/11/2026, Tiago: "um cardzinho padrão da GF com a fotinho deles... pra todos os lugares
 * que indiquem Victor ou Naor... como se fosse uma marca registrada"; depois: "pode tirar o /v /n, só o nome").
 *
 * A foto (a mesma do filtro do topo) num anel na cor do parceiro e o primeiro nome. Quem não tem foto
 * (Douglas) aparece com as iniciais; quem veio sem link de parceiro, "Direto", neutro, com a seta.
 * Um componente só para todo lugar que mostra o parceiro de um cliente: Monitoramento (cartão, cabine,
 * operações manuais, sessões encerradas), Depósitos e saques, Vendas, Acessos ao vivo, Compartilhamento de
 * receita, Visão geral e Notificações. Prévia aprovada: ~/Downloads/Aulas/previa-selo-do-parceiro.html.
 */
import { AvatarDoParceiro } from './FiltroDeParceiros'
import './selo-do-parceiro.css'

/** O primeiro nome de cada parceiro, para telas que só têm o código. */
const NOMES: Record<string, string> = { n: 'Naor', v: 'Victor', d: 'Douglas' }

export function SeloDoParceiro({ codigo, nome, tamanho = 'p', className = '' }: {
  /** 'n', 'v', 'd'…; vazio, null ou 'direto' = sem parceiro. */
  codigo: string | null | undefined
  /** O nome do parceiro (só o primeiro nome aparece). Sem nome, o código. */
  nome?: string | null
  /** p = listas e tabelas; m = cabeçalhos. */
  tamanho?: 'p' | 'm'
  className?: string
}) {
  const direto = !codigo || codigo === 'direto'
  const primeiro = direto ? 'Direto' : (nome || NOMES[codigo!] || codigo!).trim().split(/\s+/)[0]
  const px = tamanho === 'm' ? 24 : 18
  return (
    <em className={`psl ${tamanho} ${direto ? 'direto' : `c-${codigo}`} ${className}`.trim()}
      title={direto ? 'Veio sem link de parceiro' : `Cliente do ${nome || primeiro}`}>
      {direto
        ? <span className="psl-seta" aria-hidden="true"><svg viewBox="0 0 16 16" width="11" height="11"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        : <AvatarDoParceiro codigo={codigo!} nome={nome || primeiro} tamanho={px} />}
      <span className="psl-nome">{primeiro}</span>
    </em>
  )
}
