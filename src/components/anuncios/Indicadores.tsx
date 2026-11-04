/**
 * Indicadores da aba Anúncios (02/11/2026, Tiago: "indicadores de custo, por view, por clique,
 * por inscrição... relatórios e indicadores, filtros inteligentes e personalizados").
 *
 * - Custos: quanto custa cada passo do funil, com a comparação com o período anterior.
 * - Métricas de anúncio: a mesma lista serve às colunas da tabela, à ordenação, aos filtros
 *   personalizados e à planilha do relatório.
 * - Filtros inteligentes: atalhos que olham para a média do período (campeões, gastando sem
 *   cadastro, público cansado...). Os personalizados e as colunas escolhidas ficam guardados
 *   neste aparelho.
 * - Alertas: o que merece atenção agora, em frases curtas, com o que fazer.
 * - Relatório: o resumo para o WhatsApp, a planilha e a versão para imprimir ou salvar em PDF.
 */
import { useEffect, useMemo, useState } from 'react'
import type { Anuncio, FunilDoBanco, Metricas } from '../../core/teeds/anuncios'

export const brl = (v: number, casas = 2) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas })
export const int = (v: number) => Math.round(v).toLocaleString('pt-BR')
export const dec = (v: number, c = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })
export const pc = (v: number, c = 2) => `${dec(v, c)}%`
const div = (a: number, b: number) => (b > 0 ? a / b : null)

type Real = FunilDoBanco['porAnuncio'][number] | undefined
export interface Linha { a: Anuncio; real: Real }
type Formato = 'brl' | 'int' | 'pct' | 'dec'
export interface Metrica { id: string; nome: string; curto: string; formato: Formato; menorMelhor?: boolean; dica?: string; valor: (l: Linha) => number | null }

/** Todas as métricas de um anúncio. `null` = não se aplica (sem base para a conta). */
export const METRICAS: Metrica[] = [
  { id: 'gasto', nome: 'Investido', curto: 'Investido', formato: 'brl', valor: ({ a }) => a.m.gasto },
  { id: 'impressoes', nome: 'Impressões', curto: 'Impressões', formato: 'int', valor: ({ a }) => a.m.impressoes },
  { id: 'alcance', nome: 'Alcance', curto: 'Alcance', formato: 'int', valor: ({ a }) => a.m.alcance },
  { id: 'frequencia', nome: 'Frequência', curto: 'Freq.', formato: 'dec', dica: 'Quantas vezes, em média, cada pessoa viu o anúncio', valor: ({ a }) => a.m.frequencia || null },
  { id: 'cpm', nome: 'Custo por mil impressões', curto: 'CPM', formato: 'brl', menorMelhor: true, valor: ({ a }) => a.m.cpm || null },
  { id: 'custoAlcance', nome: 'Custo por pessoa alcançada', curto: 'R$/pessoa', formato: 'brl', menorMelhor: true, valor: ({ a }) => div(a.m.gasto, a.m.alcance) },
  { id: 'video3s', nome: 'Views do vídeo (3 s)', curto: 'Views', formato: 'int', valor: ({ a }) => (a.criativo.tipo === 'video' ? a.m.video3s : null) },
  { id: 'custoView', nome: 'Custo por view (3 s)', curto: 'R$/view', formato: 'brl', menorMelhor: true, valor: ({ a }) => (a.criativo.tipo === 'video' ? div(a.m.gasto, a.m.video3s) : null) },
  { id: 'custoThruplay', nome: 'Custo por ThruPlay', curto: 'R$/ThruPlay', formato: 'brl', menorMelhor: true, dica: 'Vídeo assistido até o fim ou por 15 s', valor: ({ a }) => (a.criativo.tipo === 'video' ? div(a.m.gasto, a.m.thruplay) : null) },
  { id: 'gancho', nome: 'Gancho (3 s ÷ impressões)', curto: 'Gancho', formato: 'pct', dica: 'Quantos param para ver 3 segundos a cada 100 impressões', valor: ({ a }) => (a.criativo.tipo === 'video' ? (div(a.m.video3s, a.m.impressoes) ?? 0) * 100 : null) },
  { id: 'retencao', nome: 'Retenção (ThruPlay ÷ 3 s)', curto: 'Retenção', formato: 'pct', valor: ({ a }) => (a.criativo.tipo === 'video' ? (div(a.m.thruplay, a.m.video3s) ?? 0) * 100 : null) },
  { id: 'cliques', nome: 'Cliques (todos)', curto: 'Cliques', formato: 'int', valor: ({ a }) => a.m.cliques },
  { id: 'custoClique', nome: 'Custo por clique (todos)', curto: 'R$/clique', formato: 'brl', menorMelhor: true, valor: ({ a }) => div(a.m.gasto, a.m.cliques) },
  { id: 'cliquesLink', nome: 'Cliques no link', curto: 'Cliq. link', formato: 'int', valor: ({ a }) => a.m.cliquesLink },
  { id: 'ctrLink', nome: 'CTR no link', curto: 'CTR', formato: 'pct', dica: 'Cliques no link a cada 100 impressões', valor: ({ a }) => a.m.ctrLink },
  { id: 'cpcLink', nome: 'Custo por clique no link', curto: 'CPC', formato: 'brl', menorMelhor: true, valor: ({ a }) => a.m.cpcLink || null },
  { id: 'lpv', nome: 'Chegaram na página', curto: 'Na página', formato: 'int', valor: ({ a }) => a.m.lpv },
  { id: 'carregou', nome: 'Clique que virou visita', curto: 'Carregou', formato: 'pct', dica: 'Chegaram na página ÷ cliques no link', valor: ({ a }) => (a.m.cliquesLink ? (a.m.lpv / a.m.cliquesLink) * 100 : null) },
  { id: 'custoLpv', nome: 'Custo por visita na página', curto: 'R$/visita', formato: 'brl', menorMelhor: true, valor: ({ a }) => div(a.m.gasto, a.m.lpv) },
  { id: 'cadMeta', nome: 'Cadastros (Meta)', curto: 'Cad. Meta', formato: 'int', valor: ({ a }) => a.m.cadastros },
  { id: 'custoCadMeta', nome: 'Custo por cadastro (Meta)', curto: 'R$/cad. Meta', formato: 'brl', menorMelhor: true, valor: ({ a }) => div(a.m.gasto, a.m.cadastros) },
  { id: 'cadReal', nome: 'Cadastros reais', curto: 'Cad. reais', formato: 'int', dica: 'Chegaram na plataforma por este anúncio', valor: ({ real }) => real?.cadastros ?? 0 },
  { id: 'custoCadReal', nome: 'Custo por cadastro real', curto: 'R$/cad.', formato: 'brl', menorMelhor: true, valor: ({ a, real }) => div(a.m.gasto, real?.cadastros ?? 0) },
  { id: 'conversaoPagina', nome: 'Página → cadastro', curto: 'Conv. pág.', formato: 'pct', dica: 'Cadastros reais ÷ quem chegou na página', valor: ({ a, real }) => (a.m.lpv ? ((real?.cadastros ?? 0) / a.m.lpv) * 100 : null) },
  { id: 'questionario', nome: 'Inscrições completas', curto: 'Inscrições', formato: 'int', valor: ({ real }) => real?.questionario ?? 0 },
  { id: 'custoInscricao', nome: 'Custo por inscrição completa', curto: 'R$/inscr.', formato: 'brl', menorMelhor: true, valor: ({ a, real }) => div(a.m.gasto, real?.questionario ?? 0) },
  { id: 'notificacoes', nome: 'Notificações ativadas', curto: 'Notif.', formato: 'int', valor: ({ real }) => real?.notificacoes ?? 0 },
  { id: 'live', nome: 'Assistiram à live', curto: 'Na live', formato: 'int', valor: ({ real }) => real?.live ?? 0 },
  { id: 'custoLive', nome: 'Custo por presença na live', curto: 'R$/live', formato: 'brl', menorMelhor: true, valor: ({ a, real }) => div(a.m.gasto, real?.live ?? 0) },
  { id: 'liberados', nome: 'GF Member', curto: 'GF Member', formato: 'int', valor: ({ real }) => real?.liberados ?? 0 },
  { id: 'custoGfm', nome: 'Custo por GF Member', curto: 'R$/GF Member', formato: 'brl', menorMelhor: true, valor: ({ a, real }) => div(a.m.gasto, real?.liberados ?? 0) },
]
export const METRICA = new Map(METRICAS.map((m) => [m.id, m]))
export const COLUNAS_PADRAO = ['gasto', 'impressoes', 'ctrLink', 'cpcLink', 'cpm', 'custoView', 'lpv', 'custoLpv', 'cadReal', 'custoCadReal', 'custoInscricao', 'liberados', 'gancho', 'retencao']
export const formatar = (f: Formato, v: number | null) => (v == null || !Number.isFinite(v) ? '—' : f === 'brl' ? brl(v) : f === 'int' ? int(v) : f === 'pct' ? pc(v, v < 10 ? 2 : 1) : dec(v))

/** Uma linha que soma várias (para o total da tabela): as taxas são refeitas a partir das somas. */
export function somarLinhas(linhas: Linha[]): Linha {
  const m = {} as Record<string, number>
  for (const l of linhas) for (const [k, v] of Object.entries(l.a.m)) m[k] = (m[k] ?? 0) + v
  const t = m as unknown as Metricas
  t.ctrLink = t.impressoes ? (t.cliquesLink / t.impressoes) * 100 : 0
  t.ctr = t.impressoes ? (t.cliques / t.impressoes) * 100 : 0
  t.cpcLink = t.cliquesLink ? t.gasto / t.cliquesLink : 0
  t.cpm = t.impressoes ? (t.gasto / t.impressoes) * 1000 : 0
  t.frequencia = 0
  const real = { id: '', cadastros: 0, questionario: 0, notificacoes: 0, live: 0, liberados: 0 }
  for (const l of linhas) if (l.real) for (const k of ['cadastros', 'questionario', 'notificacoes', 'live', 'liberados'] as const) real[k] += l.real[k]
  const base = linhas[0].a
  return { a: { ...base, m: t, criativo: { ...base.criativo, tipo: linhas.some((l) => l.a.criativo.tipo === 'video') ? 'video' : 'imagem' } }, real }
}

/* ------------------------------------------------------------------ custos do funil */

export interface Base { meta: Metricas | null; banco: FunilDoBanco['total'] | null; comecou: number | null }
const variacao = (agora: number | null, antes: number | null) => (agora == null || antes == null || antes === 0 ? null : ((agora - antes) / antes) * 100)

export function Custos({ atual, anterior, origem }: { atual: Base; anterior: Base | null; origem: 'todos' | 'anuncios' }) {
  const g = (b: Base | null) => b?.meta?.gasto ?? 0
  const itens: Array<{ nome: string; v: (b: Base) => number | null; base: (b: Base) => string; nota?: string }> = [
    { nome: 'Custo por mil impressões', v: (b) => b.meta?.cpm || null, base: (b) => `${int(b.meta?.impressoes ?? 0)} impressões` },
    { nome: 'Custo por pessoa alcançada', v: (b) => div(g(b), b.meta?.alcance ?? 0), base: (b) => `${int(b.meta?.alcance ?? 0)} pessoas` },
    { nome: 'Custo por view do vídeo', v: (b) => div(g(b), b.meta?.video3s ?? 0), base: (b) => `${int(b.meta?.video3s ?? 0)} views de 3 s` },
    { nome: 'Custo por ThruPlay', v: (b) => div(g(b), b.meta?.thruplay ?? 0), base: (b) => `${int(b.meta?.thruplay ?? 0)} até o fim ou 15 s` },
    { nome: 'Custo por clique', v: (b) => div(g(b), b.meta?.cliques ?? 0), base: (b) => `${int(b.meta?.cliques ?? 0)} cliques (todos)` },
    { nome: 'Custo por clique no link', v: (b) => b.meta?.cpcLink || null, base: (b) => `${int(b.meta?.cliquesLink ?? 0)} cliques no link` },
    { nome: 'Custo por visita na página', v: (b) => div(g(b), b.meta?.lpv ?? 0), base: (b) => `${int(b.meta?.lpv ?? 0)} visitas` },
    { nome: 'Custo por quem começou o cadastro', v: (b) => div(g(b), b.comecou ?? 0), base: (b) => `${int(b.comecou ?? 0)} começaram`, nota: origem === 'anuncios' ? 'só quem veio de anúncio' : 'inclui quem chegou sem anúncio' },
    { nome: 'Custo por cadastro', v: (b) => div(g(b), b.banco?.cadastros ?? 0), base: (b) => `${int(b.banco?.cadastros ?? 0)} cadastros reais` },
    { nome: 'Custo por cadastro (Meta)', v: (b) => div(g(b), b.meta?.cadastros ?? 0), base: (b) => `${int(b.meta?.cadastros ?? 0)} que o pixel contou` },
    { nome: 'Custo por inscrição completa', v: (b) => div(g(b), b.banco?.questionario ?? 0), base: (b) => `${int(b.banco?.questionario ?? 0)} com o questionário` },
    { nome: 'Custo por notificação ativada', v: (b) => div(g(b), b.banco?.notificacoes ?? 0), base: (b) => `${int(b.banco?.notificacoes ?? 0)} ativaram` },
    { nome: 'Custo por presença na live', v: (b) => div(g(b), b.banco?.live ?? 0), base: (b) => `${int(b.banco?.live ?? 0)} assistiram` },
    { nome: 'Custo por GF Member', v: (b) => div(g(b), b.banco?.liberados ?? 0), base: (b) => `${int(b.banco?.liberados ?? 0)} liberados` },
  ]
  return (
    <>
      {origem === 'todos' && <p className="aa-nota">Os custos de cadastro em diante dividem o investimento por todos os cadastros do /n. Para ver só o que veio de anúncio, escolha “Só os de anúncio” lá em cima.</p>}
      <div className="aa-custos">
        {itens.map((it) => {
          // comparar só quando os dois períodos têm investimento de verdade (R$ 30+); com base minúscula a seta mente
          const v = it.v(atual), d = anterior && g(atual) >= 30 && g(anterior) >= 30 ? variacao(v, it.v(anterior)) : null
          return (
            <div key={it.nome} className={v == null ? 'vazio' : ''}>
              <small>{it.nome}</small>
              <b>{v == null ? '—' : brl(v)}</b>
              <span>{it.base(atual)}{it.nota ? ` · ${it.nota}` : ''}</span>
              {d != null && Math.abs(d) >= 0.5 && <em className={d < 0 ? 'bom' : 'ruim'} title="Comparado com o período anterior, do mesmo tamanho">{d < 0 ? '↓' : '↑'} {dec(Math.abs(d), Math.abs(d) < 10 ? 1 : 0)}%</em>}
            </div>
          )
        })}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ filtros */

export interface Regra { metrica: string; op: '>' | '<' | '='; valor: number }
export interface FiltroSalvo { nome: string; regras: Regra[]; atalhos: string[] }
interface Contexto { custoCad: number | null; cpc: number | null; convPagina: number | null }

export const ATALHOS: Array<{ id: string; nome: string; dica: string; passa: (l: Linha, c: Contexto) => boolean }> = [
  { id: 'no-ar', nome: 'No ar', dica: 'Só os que estão entregando', passa: ({ a }) => a.status === 'ACTIVE' },
  { id: 'campeoes', nome: 'Campeões', dica: 'Custo por cadastro 20% abaixo da média, com 3 ou mais cadastros', passa: (l, c) => { const v = METRICA.get('custoCadReal')!.valor(l); return v != null && c.custoCad != null && v <= c.custoCad * 0.8 && (l.real?.cadastros ?? 0) >= 3 } },
  { id: 'sem-cadastro', nome: 'Gastando sem cadastro', dica: 'Já gastou 1,5 vez o custo médio por cadastro e não trouxe nenhum', passa: (l, c) => (l.real?.cadastros ?? 0) === 0 && marcado(l) && l.a.m.gasto >= Math.max(30, (c.custoCad ?? 20) * 1.5) },
  { id: 'caros', nome: 'Cadastro caro', dica: 'Custo por cadastro 30% acima da média', passa: (l, c) => { const v = METRICA.get('custoCadReal')!.valor(l); return marcado(l) && (l.real?.cadastros ?? 0) >= 3 && v != null && c.custoCad != null && v >= c.custoCad * 1.3 } },
  { id: 'fadiga', nome: 'Público cansado', dica: 'Frequência acima de 2,5', passa: ({ a }) => a.m.frequencia >= 2.5 },
  { id: 'gancho-fraco', nome: 'Gancho fraco', dica: 'Vídeo em que menos de 20% param para ver 3 s', passa: (l) => { const v = METRICA.get('gancho')!.valor(l); return v != null && l.a.m.impressoes >= 500 && v < 20 } },
  { id: 'clique-caro', nome: 'Clique caro', dica: 'CPC 40% acima da média', passa: ({ a }, c) => c.cpc != null && a.m.cpcLink > 0 && a.m.cpcLink >= c.cpc * 1.4 },
  { id: 'pagina-fraca', nome: 'Página não converte', dica: 'Chega gente na página, mas o cadastro fica abaixo da metade da média', passa: (l, c) => { const v = METRICA.get('conversaoPagina')!.valor(l); return marcado(l) && l.a.m.lpv >= 30 && v != null && c.convPagina != null && v < c.convPagina / 2 } },
  { id: 'sem-marcacao', nome: 'Sem marcação', dica: 'O link não tem utm_content={{ad.id}}: os cadastros dele não aparecem como reais', passa: ({ a }) => a.criativo.marcacoes != null && !/utm_content=\{\{ad\.id\}\}/.test(a.criativo.marcacoes) },
]

/** O anúncio leva a marcação utm_content={{ad.id}}: só assim os cadastros dele são ligados a ele. */
export const marcado = (l: Linha) => l.a.criativo.marcacoes == null || /utm_content=\{\{ad\.id\}\}/.test(l.a.criativo.marcacoes)
export function contexto(linhas: Linha[]): Contexto {
  // o custo médio por cadastro só com os anúncios marcados (os sem marcação têm gasto e nenhum cadastro ligado)
  const m = linhas.filter(marcado)
  const gasto = m.reduce((s, l) => s + l.a.m.gasto, 0), cad = m.reduce((s, l) => s + (l.real?.cadastros ?? 0), 0)
  const cliques = linhas.reduce((s, l) => s + l.a.m.cliquesLink, 0), lpv = m.reduce((s, l) => s + l.a.m.lpv, 0)
  const gastoTodos = linhas.reduce((s, l) => s + l.a.m.gasto, 0)
  return { custoCad: cad >= 3 ? div(gasto, cad) : null, cpc: div(gastoTodos, cliques), convPagina: lpv >= 50 ? (cad / lpv) * 100 : null }
}

export function aplicar(linhas: Linha[], busca: string, atalhos: string[], regras: Regra[]): Linha[] {
  const c = contexto(linhas), q = busca.trim().toLowerCase()
  return linhas.filter((l) =>
    (!q || l.a.nome.toLowerCase().includes(q) || l.a.criativo.titulo.toLowerCase().includes(q) || l.a.id.includes(q))
    && atalhos.every((id) => ATALHOS.find((x) => x.id === id)?.passa(l, c) ?? true)
    && regras.every((r) => { const v = METRICA.get(r.metrica)?.valor(l); if (v == null) return false; return r.op === '>' ? v > r.valor : r.op === '<' ? v < r.valor : Math.abs(v - r.valor) < 1e-9 }))
}

const ler = <T,>(chave: string, padrao: T): T => { try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) as T : padrao } catch { return padrao } }
const gravar = (chave: string, v: unknown) => { try { localStorage.setItem(chave, JSON.stringify(v)) } catch { /* sem espaço: segue sem guardar */ } }
const CHAVE_FILTROS = 'gf.anuncios.filtros', CHAVE_COLUNAS = 'gf.anuncios.colunas'

/** Colunas escolhidas (guardadas neste aparelho). */
export function useColunas(): [string[], (c: string[]) => void] {
  const [c, setC] = useState<string[]>(() => ler(CHAVE_COLUNAS, COLUNAS_PADRAO).filter((id) => METRICA.has(id)))
  return [c, (n) => { setC(n); gravar(CHAVE_COLUNAS, n) }]
}

export function Filtros({ linhas, busca, setBusca, atalhos, setAtalhos, regras, setRegras, colunas, setColunas }: {
  linhas: Linha[]; busca: string; setBusca: (v: string) => void; atalhos: string[]; setAtalhos: (v: string[]) => void
  regras: Regra[]; setRegras: (v: Regra[]) => void; colunas: string[]; setColunas: (v: string[]) => void
}) {
  const [salvos, setSalvos] = useState<FiltroSalvo[]>(() => ler(CHAVE_FILTROS, []))
  const [painel, setPainel] = useState<'' | 'regras' | 'colunas'>('')
  const [nome, setNome] = useState('')
  const c = useMemo(() => contexto(linhas), [linhas])
  const contagem = useMemo(() => new Map(ATALHOS.map((x) => [x.id, linhas.filter((l) => x.passa(l, c)).length])), [linhas, c])
  const salvar = () => {
    if (!nome.trim() || (!regras.length && !atalhos.length)) return
    const novos = [...salvos.filter((s) => s.nome !== nome.trim()), { nome: nome.trim(), regras, atalhos }]
    setSalvos(novos); gravar(CHAVE_FILTROS, novos); setNome('')
  }
  const apagar = (n: string) => { const novos = salvos.filter((s) => s.nome !== n); setSalvos(novos); gravar(CHAVE_FILTROS, novos) }
  const ativo = atalhos.length > 0 || regras.length > 0 || busca.trim() !== ''
  return (
    <div className="aa-filtros">
      <div className="aa-filtros-linha">
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar anúncio pelo nome, título ou número" aria-label="Buscar anúncio" />
        <button type="button" className={painel === 'regras' ? 'on' : ''} onClick={() => setPainel(painel === 'regras' ? '' : 'regras')}>Filtro personalizado{regras.length ? ` (${regras.length})` : ''}</button>
        <button type="button" className={painel === 'colunas' ? 'on' : ''} onClick={() => setPainel(painel === 'colunas' ? '' : 'colunas')}>Colunas ({colunas.length})</button>
        {ativo && <button type="button" className="aa-limpar" onClick={() => { setBusca(''); setAtalhos([]); setRegras([]) }}>Limpar filtros</button>}
      </div>
      <div className="aa-atalhos" role="group" aria-label="Filtros inteligentes">
        {ATALHOS.map((x) => {
          const on = atalhos.includes(x.id), n = contagem.get(x.id) ?? 0
          return <button key={x.id} type="button" title={x.dica} className={`${on ? 'on' : ''} ${n === 0 && !on ? 'zero' : ''}`} onClick={() => setAtalhos(on ? atalhos.filter((a) => a !== x.id) : [...atalhos, x.id])}>{x.nome}<i>{n}</i></button>
        })}
        {salvos.map((s) => (
          <span key={s.nome} className="aa-salvo">
            <button type="button" onClick={() => { setRegras(s.regras); setAtalhos(s.atalhos) }} title="Aplicar este filtro">★ {s.nome}</button>
            <button type="button" aria-label={`Apagar o filtro ${s.nome}`} onClick={() => apagar(s.nome)}>×</button>
          </span>
        ))}
      </div>
      {painel === 'regras' && (
        <div className="aa-regras">
          {regras.map((r, i) => {
            const m = METRICA.get(r.metrica)!
            return (
              <div key={i} className="aa-regra">
                <select value={r.metrica} onChange={(e) => setRegras(regras.map((x, k) => (k === i ? { ...x, metrica: e.target.value } : x)))} aria-label="Métrica">
                  {METRICAS.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
                <select value={r.op} onChange={(e) => setRegras(regras.map((x, k) => (k === i ? { ...x, op: e.target.value as Regra['op'] } : x)))} aria-label="Condição">
                  <option value=">">maior que</option><option value="<">menor que</option><option value="=">igual a</option>
                </select>
                <label className="aa-valor"><span>{m.formato === 'brl' ? 'R$' : m.formato === 'pct' ? '%' : ''}</span>
                  <input type="number" inputMode="decimal" step="any" value={Number.isFinite(r.valor) ? r.valor : ''} onChange={(e) => setRegras(regras.map((x, k) => (k === i ? { ...x, valor: parseFloat(e.target.value.replace(',', '.')) } : x)))} aria-label="Valor" />
                </label>
                <button type="button" aria-label="Tirar esta condição" onClick={() => setRegras(regras.filter((_, k) => k !== i))}>×</button>
              </div>
            )
          })}
          <div className="aa-regras-acoes">
            <button type="button" onClick={() => setRegras([...regras, { metrica: 'custoCadReal', op: '<', valor: 5 }])}>+ Condição</button>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome para guardar este filtro" aria-label="Nome do filtro" />
            <button type="button" className="principal" disabled={!nome.trim() || (!regras.length && !atalhos.length)} onClick={salvar}>Guardar filtro</button>
          </div>
          <p className="aa-nota">Junte quantas condições quiser (valem todas ao mesmo tempo) e os atalhos acima. Os filtros guardados ficam neste aparelho.</p>
        </div>
      )}
      {painel === 'colunas' && (
        <div className="aa-colunas">
          {METRICAS.map((m) => (
            <label key={m.id}><input type="checkbox" checked={colunas.includes(m.id)} onChange={(e) => setColunas(e.target.checked ? METRICAS.map((x) => x.id).filter((id) => id === m.id || colunas.includes(id)) : colunas.filter((id) => id !== m.id))} />{m.nome}</label>
          ))}
          <button type="button" onClick={() => setColunas(COLUNAS_PADRAO)}>Voltar ao padrão</button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ alertas */

export interface Alerta { tipo: 'bom' | 'atencao' | 'critico'; titulo: string; texto: string }
export function alertas(linhas: Linha[], total: Metricas | null, banco: FunilDoBanco['total'] | null, anterior: { meta: Metricas | null; banco: FunilDoBanco['total'] | null } | null, deAnuncio?: { agora: number; antes: number | null } | null): Alerta[] {
  const lista: Alerta[] = []
  const c = contexto(linhas)
  if (total && total.cliquesLink >= 50 && total.lpv / total.cliquesLink < 0.6)
    lista.push({ tipo: 'critico', titulo: 'Muita gente clica e não chega na página', texto: `Só ${pc((total.lpv / total.cliquesLink) * 100, 0)} dos cliques viraram visita. Costuma ser página lenta no celular ou clique sem querer. Vale testar a velocidade da página no 4G.` })
  // 04/11/2026 (Tiago: "lógica rasa"): conversão só com os cadastros QUE VIERAM dos anúncios (ligados pela marcação),
  // divididos pelas visitas que os mesmos anúncios levaram, e com amostra que sustente a conclusão
  const lpvMarcados = linhas.filter(marcado).reduce((s, l) => s + l.a.m.lpv, 0), cadMarcados = linhas.filter(marcado).reduce((s, l) => s + (l.real?.cadastros ?? 0), 0)
  if (lpvMarcados >= 150 && cadMarcados / lpvMarcados < 0.08)
    lista.push({ tipo: 'atencao', titulo: 'A página está convertendo pouco', texto: `${pc((cadMarcados / lpvMarcados) * 100, 1)} de quem chega pelos anúncios se cadastra (${int(cadMarcados)} de ${int(lpvMarcados)} visitas). Abaixo de 8% a promessa do anúncio e a da página costumam estar desencontradas.` })
  if (banco && banco.cadastros >= 20 && banco.questionario / banco.cadastros < 0.6)
    lista.push({ tipo: 'atencao', titulo: 'Muitos param no questionário', texto: `${pc((banco.questionario / banco.cadastros) * 100, 0)} completam a inscrição depois do cadastro.` })
  if (total && total.frequencia >= 2.5 && total.impressoes >= 3000)
    lista.push({ tipo: 'atencao', titulo: 'O público está vendo o anúncio muitas vezes', texto: `Frequência ${dec(total.frequencia)}. Hora de trazer criativos novos ou abrir o público.` })
  // comparar só quando os DOIS períodos têm gasto e cadastros de verdade: com o anterior zerado não há base
  // (antes saía "R$ 0,91 contra R$ 0,00 (+∞%)")
  // e sempre com os cadastros QUE VIERAM de anúncio (um post orgânico não pode baratear o anúncio)
  if (anterior?.meta && total && deAnuncio && deAnuncio.antes != null && total.gasto >= 30 && anterior.meta.gasto >= 30 && deAnuncio.agora >= 5 && deAnuncio.antes >= 5) {
    const agora = div(total.gasto, deAnuncio.agora), antes = div(anterior.meta.gasto, deAnuncio.antes)
    if (agora != null && antes != null && antes > 0 && agora > antes * 1.25) lista.push({ tipo: 'critico', titulo: 'O cadastro ficou mais caro', texto: `${brl(agora)} agora contra ${brl(antes)} no período anterior (+${dec(((agora - antes) / antes) * 100, 0)}%).` })
    if (agora != null && antes != null && antes > 0 && agora < antes * 0.85) lista.push({ tipo: 'bom', titulo: 'O cadastro ficou mais barato', texto: `${brl(agora)} agora contra ${brl(antes)} no período anterior (−${dec(((antes - agora) / antes) * 100, 0)}%).` })
  }
  for (const l of linhas) {
    const custo = METRICA.get('custoCadReal')!.valor(l)
    // sem a marcação no link não dá para saber se trouxe cadastro: aí o aviso é o de "Sem marcação", não este
    if ((l.real?.cadastros ?? 0) === 0 && marcado(l) && l.a.m.gasto >= Math.max(30, (c.custoCad ?? 20) * 1.5) && l.a.status === 'ACTIVE')
      lista.push({ tipo: 'critico', titulo: `Gastando sem cadastro: ${l.a.nome}`, texto: `${brl(l.a.m.gasto)} investidos e nenhum cadastro. Considere pausar.` })
    else if (custo != null && c.custoCad != null && custo <= c.custoCad * 0.7 && (l.real?.cadastros ?? 0) >= 5 && linhas.filter((x) => (x.real?.cadastros ?? 0) > 0).length >= 2)
      lista.push({ tipo: 'bom', titulo: `Campeão: ${l.a.nome}`, texto: `${brl(custo)} por cadastro, ${pc((1 - custo / c.custoCad) * 100, 0)} abaixo da média. Bom candidato para receber mais verba.` })
    if (l.a.status === 'ACTIVE' && l.a.criativo.marcacoes != null && !/utm_content=\{\{ad\.id\}\}/.test(l.a.criativo.marcacoes))
      lista.push({ tipo: 'atencao', titulo: `Sem marcação: ${l.a.nome}`, texto: 'O link não tem utm_content={{ad.id}}, então os cadastros dele não são ligados a ele aqui.' })
  }
  const peso = { critico: 0, atencao: 1, bom: 2 }
  return lista.sort((a, b) => peso[a.tipo] - peso[b.tipo]).slice(0, 12)
}

export function Alertas({ lista }: { lista: Alerta[] }) {
  if (!lista.length) return <p className="aa-vazio">Nada fora do normal neste período.</p>
  return (
    <ul className="aa-alertas">
      {lista.map((a, i) => <li key={i} className={a.tipo}><b>{a.titulo}</b><span>{a.texto}</span></li>)}
    </ul>
  )
}

/* ------------------------------------------------------------------ melhores horários */

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export function Horarios({ dados, origem }: { dados: { porHora: Array<{ hora: number; cadastros: number; deAnuncio: number }>; porSemana: Array<{ dia: number; cadastros: number; deAnuncio: number }> } | null; origem: 'todos' | 'anuncios' }) {
  if (!dados) return <p className="aa-vazio">Carregando…</p>
  const v = (x: { cadastros: number; deAnuncio: number }) => (origem === 'anuncios' ? x.deAnuncio : x.cadastros)
  const horas = Array.from({ length: 24 }, (_, h) => v(dados.porHora.find((x) => x.hora === h) ?? { cadastros: 0, deAnuncio: 0 }))
  const dias = Array.from({ length: 7 }, (_, d) => v(dados.porSemana.find((x) => x.dia === d) ?? { cadastros: 0, deAnuncio: 0 }))
  const maxH = Math.max(1, ...horas), maxD = Math.max(1, ...dias)
  const melhor = horas.indexOf(Math.max(...horas)), total = horas.reduce((a, b) => a + b, 0)
  if (!total) return <p className="aa-vazio">Sem cadastros neste período.</p>
  return (
    <div className="aa-horarios">
      <div>
        <h4>Por hora do dia</h4>
        <div className="aa-horas" role="img" aria-label={`Cadastros por hora; o pico é às ${melhor}h`}>
          {horas.map((n, h) => <span key={h} title={`${h}h: ${int(n)} cadastro${n === 1 ? '' : 's'}`} className={h === melhor ? 'pico' : ''}><i style={{ height: `${(n / maxH) * 100}%` }} />{h % 3 === 0 && <small>{h}h</small>}</span>)}
        </div>
        <p className="aa-nota">O pico é às {melhor}h ({int(horas[melhor])} de {int(total)} cadastros).</p>
      </div>
      <div>
        <h4>Por dia da semana</h4>
        <ul className="aa-semana">
          {dias.map((n, d) => <li key={d}><span>{SEMANA[d]}</span><i style={{ width: `${(n / maxD) * 100}%` }} /><b>{int(n)}</b></li>)}
        </ul>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ relatório */

export function Relatorio({ fechar, periodo, total, banco, linhas, colunas, lista, comecou, origem = 'todos' }: {
  fechar: () => void; periodo: string; total: Metricas | null; banco: FunilDoBanco['total'] | null; linhas: Linha[]; colunas: string[]; lista: Alerta[]; comecou: number | null; origem?: 'todos' | 'anuncios'
}) {
  const [copiado, setCopiado] = useState(false)
  useEffect(() => {
    document.body.classList.add('aa-com-relatorio')
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    window.addEventListener('keydown', esc)
    return () => { document.body.classList.remove('aa-com-relatorio'); window.removeEventListener('keydown', esc) }
  }, [fechar])
  const g = total?.gasto ?? 0
  const custoDe = (n: number | undefined | null) => (n ? brl(g / n) : '—')
  const ordenados = [...linhas].filter((l) => (l.real?.cadastros ?? 0) > 0).sort((a, b) => (METRICA.get('custoCadReal')!.valor(a) ?? 1e9) - (METRICA.get('custoCadReal')!.valor(b) ?? 1e9))
  const linhasDoTexto = [
    `*Relatório de anúncios · GlobalFly /n*`, `Período: ${periodo}`, '',
    `Investido: ${brl(g)}`, `Impressões: ${int(total?.impressoes ?? 0)} · alcance ${int(total?.alcance ?? 0)}`,
    `Cliques no link: ${int(total?.cliquesLink ?? 0)} (CTR ${pc(total?.ctrLink ?? 0)}) · CPC ${brl(total?.cpcLink ?? 0)}`,
    `Chegaram na página: ${int(total?.lpv ?? 0)} · ${custoDe(total?.lpv)} cada`,
    `Começaram o cadastro: ${int(comecou ?? 0)}`,
    `Cadastros: ${int(banco?.cadastros ?? 0)} · ${custoDe(banco?.cadastros)} cada`,
    `Inscrições completas: ${int(banco?.questionario ?? 0)} · ${custoDe(banco?.questionario)} cada`,
    `Notificações ativadas: ${int(banco?.notificacoes ?? 0)}`,
    `Assistiram à live: ${int(banco?.live ?? 0)} · GF Member: ${int(banco?.liberados ?? 0)}`,
    ...(ordenados.length ? ['', '*Melhores anúncios (custo por cadastro)*', ...ordenados.slice(0, 3).map((l, i) => `${i + 1}. ${l.a.nome}: ${formatar('brl', METRICA.get('custoCadReal')!.valor(l))} · ${int(l.real?.cadastros ?? 0)} cadastros`)] : []),
    ...(lista.length ? ['', '*Pontos de atenção*', ...lista.filter((a) => a.tipo !== 'bom').slice(0, 5).map((a) => `• ${a.titulo}`)] : []),
  ]
  const texto = linhasDoTexto.join('\n')
  const copiar = () => { void navigator.clipboard?.writeText(texto).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800) }) }
  const planilha = () => {
    const cols = ['Anúncio', 'Número', 'Status', ...METRICAS.map((m) => m.nome)]
    const cel = (v: string) => `"${v.replace(/"/g, '""')}"`
    const num = (m: Metrica, l: Linha) => { const v = m.valor(l); return v == null || !Number.isFinite(v) ? '' : String(Math.round(v * 100) / 100).replace('.', ',') }
    const corpo = linhas.map((l) => [cel(l.a.nome), cel(l.a.id), cel(l.a.status), ...METRICAS.map((m) => num(m, l))].join(';'))
    const blob = new Blob([`﻿${cols.map(cel).join(';')}\n${corpo.join('\n')}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `anuncios-globalfly-${periodo.replace(/[^0-9a-z]+/gi, '-')}.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  return (
    <div className="aa-gaveta-fundo aa-rel-fundo" onMouseDown={fechar}>
      <section className="aa-relatorio" role="dialog" aria-modal="true" aria-labelledby="aa-rel-titulo" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <div><span className="rot">GlobalFly · /n</span><h3 id="aa-rel-titulo">Relatório de anúncios</h3><small>{periodo}</small></div>
          <div className="aa-rel-acoes">
            <button type="button" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar para o WhatsApp'}</button>
            <button type="button" onClick={planilha}>Baixar planilha</button>
            <button type="button" className="principal" onClick={() => window.print()}>Imprimir ou salvar PDF</button>
            <button type="button" className="aa-fechar" onClick={fechar} aria-label="Fechar">×</button>
          </div>
        </header>
        <div className="aa-rel-corpo">
          <div className="aa-kpis mini">
            <div><small>Investido</small><b>{brl(g)}</b></div>
            <div><small>Cadastros</small><b>{int(banco?.cadastros ?? 0)}</b></div>
            <div><small>Custo por cadastro</small><b>{custoDe(banco?.cadastros)}</b></div>
            <div><small>Inscrições completas</small><b>{int(banco?.questionario ?? 0)}</b></div>
            <div><small>Custo por inscrição</small><b>{custoDe(banco?.questionario)}</b></div>
            <div><small>GF Member</small><b>{int(banco?.liberados ?? 0)}</b></div>
          </div>
          <h4>Funil e custos</h4>
          <table className="aa-rel-tabela">
            <thead><tr><th>Etapa</th><th className="num">Pessoas</th><th className="num">Custo por pessoa</th><th className="num">Passaram da anterior</th></tr></thead>
            <tbody>
              {([['Impressões', total?.impressoes], ['Cliques no link', total?.cliquesLink], ['Chegaram na página', total?.lpv], ['Começaram o cadastro', comecou], ['Cadastros', banco?.cadastros], ['Inscrições completas', banco?.questionario], ['Notificações ativadas', banco?.notificacoes], ['Assistiram à live', banco?.live], ['GF Member', banco?.liberados]] as Array<[string, number | null | undefined]>).map(([nome, n], i, arr) => (
                <tr key={nome}><td>{nome}</td><td className="num">{int(n ?? 0)}</td><td className="num">{nome === 'Impressões' ? `${brl(total?.cpm ?? 0)} / mil` : i >= 3 && origem !== 'anuncios' ? '—' : custoDe(n)}</td><td className="num">{i && arr[i - 1][1] && !(i === 3 && origem !== 'anuncios') ? pc(((n ?? 0) / (arr[i - 1][1] ?? 1)) * 100, 1) : '—'}</td></tr>
              ))}
            </tbody>
          </table>
          <h4>Anúncios ({linhas.length})</h4>
          <div className="aa-tabela">
            <table>
              <thead><tr><th>Anúncio</th>{colunas.map((id) => <th key={id} className="num">{METRICA.get(id)!.curto}</th>)}</tr></thead>
              <tbody>{linhas.map((l) => <tr key={l.a.id}><td>{l.a.nome}</td>{colunas.map((id) => { const m = METRICA.get(id)!; return <td key={id} className="num">{formatar(m.formato, m.valor(l))}</td> })}</tr>)}</tbody>
            </table>
          </div>
          {lista.length > 0 && <><h4>Alertas</h4><Alertas lista={lista} /></>}
          <p className="aa-nota">Gerado em {new Date().toLocaleString('pt-BR')} pela Administração da GlobalFly. Números da Meta e da plataforma.</p>
        </div>
      </section>
    </div>
  )
}
