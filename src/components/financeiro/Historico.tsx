/* Histórico: quem criou, editou, pagou e apagou cada lançamento, com o antes e o depois. */
import { useEffect, useState } from 'react'
import { ROTULO_TIPO, dataCurta, reais, type DadosFin, type FinApi, type Historico as Registro, type Lancamento, type Pessoa } from '../../core/teeds/financeiro'
import { Avatar, Vazio } from './ui'

const VERBO: Record<Registro['acao'], string> = { criou: 'lançou', editou: 'editou', pagou: 'marcou como pago', reabriu: 'reabriu', apagou: 'apagou' }
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const CAMPOS: Array<[keyof Lancamento, string]> = [['descricao', 'Descrição'], ['valor', 'Valor'], ['tipo', 'Tipo'], ['vencimento', 'Data'], ['pago_em', 'Pago em'], ['categoria_id', 'Categoria'], ['conta_id', 'Conta'], ['socio_id', 'Sócio'], ['contraparte', 'Fornecedor ou cliente'], ['forma', 'Forma'], ['observacoes', 'Observações']]

export function Historico({ api, dados }: { api: FinApi; dados: DadosFin }) {
  const [lista, setLista] = useState<Registro[] | null>(null)
  const [pessoas, setPessoas] = useState<Map<string, Pessoa>>(new Map())
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    api.historico(300).then(async (h) => {
      if (!vivo) return
      setLista(h)
      const ids = [...new Set(h.map((x) => x.por).filter((x): x is string => !!x))]
      const p = await api.pessoas(ids).catch(() => [])
      if (vivo) setPessoas(new Map(p.map((x) => [x.user_id, x])))
    }).catch((x) => { if (vivo) setErro((x as Error).message) })
    return () => { vivo = false }
  }, [api])

  const nomeDe = (campo: keyof Lancamento, v: unknown): string => {
    if (v == null || v === '') return 'vazio'
    if (campo === 'valor') return reais(Number(v))
    if (campo === 'vencimento' || campo === 'pago_em') return dataCurta(String(v))
    if (campo === 'tipo') return ROTULO_TIPO[v as Lancamento['tipo']] ?? String(v)
    if (campo === 'categoria_id') return dados.categorias.find((c) => c.id === v)?.nome ?? 'categoria apagada'
    if (campo === 'conta_id') return dados.contas.find((c) => c.id === v)?.nome ?? 'conta apagada'
    if (campo === 'socio_id') return dados.socios.find((c) => c.id === v)?.nome ?? 'sócio'
    return String(v)
  }
  const mudancas = (r: Registro) => r.acao !== 'editou' || !r.antes || !r.depois ? [] : CAMPOS.filter(([c]) => String(r.antes![c] ?? '') !== String(r.depois![c] ?? '') && !(c === 'valor' && Number(r.antes![c]) === Number(r.depois![c])))

  // uma série (todo mês ou parcelado) vira uma linha só: "lançou X em 12 vezes"
  const blocos = (lista ?? []).reduce<Array<{ r: Registro; n: number; total: number }>>((acc, r) => {
    const g = (r.depois ?? r.antes)?.grupo
    const ult = acc[acc.length - 1]
    const gUlt = ult ? (ult.r.depois ?? ult.r.antes)?.grupo : null
    if (ult && g && g === gUlt && ult.r.acao === r.acao && ult.r.por === r.por && Math.abs(Date.parse(ult.r.em) - Date.parse(r.em)) < 120_000) {
      ult.n++; ult.total += Number((r.depois ?? r.antes)?.valor ?? 0); return acc
    }
    acc.push({ r, n: 1, total: Number((r.depois ?? r.antes)?.valor ?? 0) }); return acc
  }, [])
  const semParcela = (t: string) => t.replace(/\s*\(\d+\/\d+\)$/, '')

  if (erro) return <section className="fin-cartao"><p className="fin-erro fin-pad">{erro}</p></section>
  return <section className="fin-cartao">
    <header><div><span className="fin-rot">Últimas 300 mudanças</span><h3>Histórico</h3></div></header>
    {!lista ? <p className="fin-cartao-vazio">Carregando…</p> : lista.length ? <ol className="fin-historico">
      {blocos.map(({ r, n, total }) => {
        const l = r.depois ?? r.antes
        const p = r.por ? pessoas.get(r.por) : null
        const m = mudancas(r)
        return <li key={r.id} className={r.acao}>
          <Avatar nome={p?.nome ?? '?'} tamanho={32} />
          <div>
            <p><b>{p?.nome ?? 'Alguém'}</b> {VERBO[r.acao]} <b>{n > 1 ? semParcela(l?.descricao ?? '') : l?.descricao ?? 'um lançamento'}</b>
              {n > 1 ? <> · {n} {l?.parcelas ? 'parcelas' : 'meses'} somando {reais(total)}</> : l?.valor != null && r.acao !== 'editou' ? <> · {reais(Number(l.valor))}</> : null}</p>
            {m.length > 0 && <ul>{m.map(([c, rot]) => <li key={c}><span>{rot}</span> {nomeDe(c, r.antes![c])} <i aria-hidden="true">→</i> {nomeDe(c, r.depois![c])}</li>)}</ul>}
            <small>{quando(r.em)}</small>
          </div>
        </li>
      })}
    </ol> : <Vazio titulo="Nada ainda" texto="Cada lançamento criado, editado, pago ou apagado aparece aqui, com quem fez e quando." />}
  </section>
}
