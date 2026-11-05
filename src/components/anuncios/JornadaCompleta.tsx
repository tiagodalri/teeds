/**
 * A home da aba Anúncios (04/11/2026). Tiago: "fulano assistiu o anúncio, clicou no link, foi marcado pelo
 * pixel, se cadastrou, assistiu a live, efetivou acesso, abriu conta na Deriv, depositou (quando e quanto?
 * primeiro depósito?), gerou markup (quanto)... uma linha ampla de indicadores que fazem sentido total pra
 * nós... sem excesso de gráficos: talvez um gráfico e uma tabela de linhas e colunas com todos os
 * detalhamentos... me surpreenda" e "tudo isso precisa andar em conjunto" (anúncios e central de rastreio).
 *
 * Do anúncio ao dinheiro: a frase do período, os números que importam, a trilha inteira (um gráfico só),
 * as conclusões (só com amostra que sustente) e a tabela por anúncio ou por canal. A tabela pessoa a pessoa
 * fica na aba Pessoas (TabelaDaJornada). Dados: teeds_jornada_completa (banco) + o painel da Meta.
 * Dinheiro da Deriv é em US$; o investimento é em R$. A comparação usa a cotação do dia (AwesomeAPI).
 */
import { Fragment, memo, useEffect, useMemo, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import type { Anuncio, Metricas } from '../../core/teeds/anuncios'
import { jornadaCompleta, nomeDoCanal, type PessoaDaJornada } from '../../core/teeds/central'
import './jornada.css'

const int = (v: number) => Math.round(v).toLocaleString('pt-BR')
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
/** O dinheiro da conta de anúncios, na moeda dela (a do Naor é real). */
const naMoeda = (v: number, moeda: string) => { try { return v.toLocaleString('pt-BR', { style: 'currency', currency: moeda || 'BRL' }) } catch { return brl(v) } }
const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pc = (v: number, c = 1) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })}%`
const razao = (a: number, b: number) => (b > 0 ? a / b : 0)
const dataCurta = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—')
const horas = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} dias`)
const mediana = (l: number[]) => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** A cotação do dólar de agora (para pôr o markup em US$ ao lado do investimento em R$). */
function useCotacao(): number | null {
  const [v, setV] = useState<number | null>(null)
  useEffect(() => {
    let vivo = true
    fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL').then((r) => r.json()).then((d) => { const x = Number(d?.USDBRL?.bid); if (vivo && x > 0) setV(x) }).catch(() => { /* sem cotação: só não converte */ })
    return () => { vivo = false }
  }, [])
  return v
}

/** Os passos da jornada, do cadastro em diante (o que cada pessoa fez). */
export const PASSOS: Array<{ id: string; nome: string; dica: string; fez: (p: PessoaDaJornada) => boolean }> = [
  { id: 'cad', nome: 'Se cadastraram', dica: 'Enviaram o formulário', fez: () => true },
  { id: 'que', nome: 'Responderam o questionário', dica: 'Completaram a inscrição', fez: (p) => !!p.questionario_em },
  { id: 'com', nome: 'Entraram na comunidade', dica: 'Clicaram no grupo do WhatsApp (contado desde 04/11)', fez: (p) => !!p.comunidade },
  { id: 'not', nome: 'Ligaram as notificações', dica: 'Avisos da live no celular', fez: (p) => p.notificacoes },
  { id: 'pla', nome: 'Entraram na plataforma', dica: 'Fizeram login pelo menos uma vez', fez: (p) => p.acessos > 0 || !!p.primeiro_acesso },
  { id: 'der', nome: 'Conectaram conta real', dica: 'Conta real da corretora ligada à plataforma', fez: (p) => !!p.deriv_real_em },
  { id: 'ia', nome: 'Ligaram uma I.A.', dica: 'Pelo menos uma sessão (demo ou real)', fez: (p) => p.sessoes_ia > 0 },
  { id: 'dep', nome: 'Depositaram', dica: 'Depósito na conta real', fez: (p) => p.depositado > 0 },
  { id: 'ope', nome: 'Operaram com dinheiro real', dica: 'I.A. ou manual na conta real', fez: (p) => p.operacoes_reais > 0 },
  { id: 'mkp', nome: 'Geraram markup', dica: 'Markup estimado (3% do pagamento)', fez: (p) => p.markup > 0 },
  { id: 'liv', nome: 'Assistiram à live', dica: 'Presença na live de 09/11', fez: (p) => p.minutos_live > 0 },
  { id: 'gfm', nome: 'Viraram GF Member', dica: 'Acesso liberado', fez: (p) => p.status_acesso === 'ativo' },
]

interface Soma {
  cadastros: number; questionario: number; plataforma: number; derivReal: number; depositantes: number; depositado: number; sacado: number
  markup: number; operaram: number; live: number; membros: number
}
const somar = (l: PessoaDaJornada[]): Soma => ({
  cadastros: l.length, questionario: l.filter((p) => p.questionario_em).length, plataforma: l.filter(PASSOS[4].fez).length,
  derivReal: l.filter((p) => p.deriv_real_em).length, depositantes: l.filter((p) => p.depositado > 0).length,
  depositado: l.reduce((s, p) => s + Number(p.depositado || 0), 0), sacado: l.reduce((s, p) => s + Number(p.sacado || 0), 0),
  markup: l.reduce((s, p) => s + Number(p.markup || 0), 0), operaram: l.filter((p) => p.operacoes_reais > 0).length,
  live: l.filter((p) => p.minutos_live > 0).length, membros: l.filter((p) => p.status_acesso === 'ativo').length,
})

/** Carrega a jornada do período (atualiza a cada minuto). */
export function useJornada(sessao: SessaoTeeds, parceiro: string, de: string, ate: string, buscar: typeof jornadaCompleta = jornadaCompleta, ligado = true) {
  const [dados, setDados] = useState<{ pessoas: PessoaDaJornada[]; total: number; chave: string } | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const chave = `${parceiro}|${de}|${ate}`
  useEffect(() => {
    if (!ligado) return
    let vivo = true; setFalha(null)
    // uma falha de atualização não apaga o que já está na tela: vira aviso
    const puxar = () => buscar(sessao, parceiro, de, ate).then((j) => { if (vivo) { setDados({ pessoas: j.pessoas, total: j.total, chave }); setFalha(null) } }).catch((e) => vivo && setFalha((e as Error).message))
    void puxar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') void puxar() }, 60000)
    return () => { vivo = false; clearInterval(t) }
  }, [chave, ligado, sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps
  // dados de outro parceiro ou período não aparecem enquanto os novos chegam
  const atuais = dados && dados.chave === chave ? dados : null
  return { pessoas: atuais?.pessoas ?? null, total: atuais?.total ?? 0, falha }
}

/** O que os números dizem: só com amostra que sustente a conclusão (Tiago: nada de "lógica rasa"). */
function conclusoes(l: PessoaDaJornada[], gasto: number, cotacao: number | null, porGrupo: Array<{ nome: string; pessoas: PessoaDaJornada[]; gasto: number | null }>) {
  const saida: Array<{ tipo: 'ok' | 'atencao' | 'info'; texto: string }> = []
  const s = somar(l)
  if (s.cadastros < 20) return [{ tipo: 'info' as const, texto: 'Ainda há poucos cadastros no período para tirar conclusões. Elas aparecem aqui sozinhas quando houver amostra.' }]
  // o maior vazamento, só na cadeia em que um passo depende do anterior (cadastro → plataforma → conta real →
  // depósito → operou), contando quem fez o passo DENTRE quem fez o anterior, e com base de 20+
  const CADEIA = ['cad', 'pla', 'der', 'dep', 'ope'].map((id) => PASSOS.find((p) => p.id === id)!)
  const n = CADEIA.map((p, i) => ({ p, n: l.filter((x) => CADEIA.slice(0, i + 1).every((q) => q.fez(x))).length }))
  let pior: { de: string; para: string; perda: number; taxa: number } | null = null
  for (let i = 1; i < n.length; i++) {
    if (n[i - 1].n < 20) continue
    const taxa = razao(n[i].n, n[i - 1].n), perda = n[i - 1].n - n[i].n
    if (!pior || perda > pior.perda) pior = { de: n[i - 1].p.nome, para: n[i].p.nome, perda, taxa }
  }
  if (pior && pior.taxa < 0.6) saida.push({ tipo: 'atencao', texto: `O maior vazamento está entre "${pior.de.toLowerCase()}" e "${pior.para.toLowerCase()}": ${int(pior.perda)} pessoas param aí (só ${pc(pior.taxa * 100, 0)} seguem). É o ponto que mais rende atacar.` })
  // tempo até o primeiro depósito e o ticket do primeiro depósito
  const dep = l.filter((p) => p.deposito1_em)
  if (dep.length >= 3) {
    const t = mediana(dep.map((p) => (+new Date(p.deposito1_em!) - +new Date(p.cadastro_em)) / 36e5).filter((h) => h >= 0))
    const v = mediana(dep.map((p) => Number(p.deposito1_valor || 0)))
    if (t != null && v != null) saida.push({ tipo: 'info', texto: `Quem deposita leva, em geral, ${horas(t)} entre o cadastro e o primeiro depósito, e o primeiro depósito típico é de ${usd(v)}. Use essa janela para os lembretes.` })
  }
  // ex-cliente x novo: quem deposita mais
  const ex = l.filter((p) => p.ex_cliente === true), novo = l.filter((p) => p.ex_cliente === false)
  const depEx = ex.filter((p) => p.depositado > 0).length, depNovo = novo.filter((p) => p.depositado > 0).length
  // 30+ em cada grupo e 5+ depositantes somando os dois: com menos, a diferença é sorte
  if (ex.length >= 30 && novo.length >= 30 && depEx + depNovo >= 5) {
    const a = razao(depEx, ex.length), b = razao(depNovo, novo.length)
    if (Math.max(a, b) >= Math.min(a, b) * 1.5 && Math.abs(a - b) >= 0.03) saida.push({ tipo: 'ok', texto: `${a > b ? 'Quem já foi cliente' : 'Quem nunca foi cliente'} deposita mais: ${pc(Math.max(a, b) * 100)} contra ${pc(Math.min(a, b) * 100)} (${int(ex.length)} ex-clientes, ${int(novo.length)} novos).` })
  }
  // a fonte que traz dinheiro: só grupos com 10+ cadastros, e só se houver depósito em pelo menos dois
  // fonte que traz dinheiro: grupos de verdade (sem os baldes "sem origem"/"sem nome"), 30+ cadastros cada,
  // e o vencedor com 3+ depositantes
  const comBase = porGrupo.filter((g) => g.pessoas.length >= 30 && !/sem nome|sem origem|sem marcação/i.test(g.nome))
  const deps = (g: typeof comBase[number]) => g.pessoas.filter((p) => p.depositado > 0).length
  if (comBase.length >= 2) {
    const taxa = (g: typeof comBase[number]) => razao(deps(g), g.pessoas.length)
    const ord = [...comBase].sort((a, b) => taxa(b) - taxa(a))
    if (deps(ord[0]) >= 3 && taxa(ord[0]) >= taxa(ord[ord.length - 1]) * 1.3) saida.push({ tipo: 'ok', texto: `${ord[0].nome} traz quem deposita: ${pc(taxa(ord[0]) * 100)} dos cadastros dele depositaram (${ord[ord.length - 1].nome}: ${pc(taxa(ord[ord.length - 1]) * 100)}).` })
  }
  // retorno: markup (US$) sobre o investimento (R$), com a cotação de agora
  if (gasto >= 100 && cotacao && s.markup > 0) {
    const r = (s.markup * cotacao) / gasto
    saida.push({ tipo: r >= 1 ? 'ok' : 'info', texto: `Até agora, cada R$ 1,00 investido voltou ${brl(r)} em markup estimado (${usd(s.markup)} com o dólar a ${brl(cotacao)}). O número cresce enquanto essas pessoas operam.` })
  }
  // quem entrou e não conectou a conta real
  const entrou = l.filter(PASSOS[4].fez), semReal = entrou.filter((p) => !p.deriv_real_em)
  if (entrou.length >= 20 && razao(semReal.length, entrou.length) >= 0.5) saida.push({ tipo: 'atencao', texto: `${int(semReal.length)} de ${int(entrou.length)} pessoas que entraram na plataforma ainda não conectaram a conta real. Uma mensagem com o passo a passo para esse grupo é o atalho mais curto até o depósito.` })
  if (!saida.length) saida.push({ tipo: 'info', texto: 'Nada fora do normal neste período.' })
  return saida
}

export const DoAnuncioAoDinheiro = memo(function DoAnuncioAoDinheiro({ pessoas, total, falha, gasto, moeda, meta, anuncios, origem, parceiro, aPessoas }: {
  pessoas: PessoaDaJornada[] | null; total: number; falha: string | null; gasto: number; moeda: string; meta: Metricas | null; anuncios: Anuncio[]
  origem: 'todos' | 'anuncios'; parceiro: string; aPessoas: (filtro: string) => void
}) {
  const cotacao = useCotacao()
  const [porEscolhido, setPor] = useState<'anuncio' | 'canal'>(() => { try { return localStorage.getItem('aa-jornada-por') === 'canal' ? 'canal' : 'anuncio' } catch { return 'anuncio' } })
  useEffect(() => { try { localStorage.setItem('aa-jornada-por', porEscolhido) } catch { /* só não lembra */ } }, [porEscolhido])
  // no "só os de anúncio" todo mundo é do mesmo canal: a tabela é por anúncio
  const por = origem === 'anuncios' ? 'anuncio' : porEscolhido
  const grupo = useMemo(() => (pessoas ?? []).filter((p) => origem === 'todos' || p.canal === 'anuncio-meta'), [pessoas, origem])
  const s = somar(grupo)
  // por anúncio: juntando os anúncios do mesmo criativo e público ("GF | NB3 | Quente")
  const porAnuncio = useMemo(() => {
    const nomes = new Map(anuncios.map((a) => [a.id, a]))
    // meta: os cadastros da Meta do grupo (os do Gerenciador); pessoas: os que a plataforma acompanha
    const m = new Map<string, { nome: string; miniatura: string | null; gasto: number; meta: number | null; pessoas: PessoaDaJornada[] }>()
    for (const a of anuncios) { const k = a.nome.replace(/^GF \| /, ''); const x = m.get(k) ?? { nome: k, miniatura: a.criativo.miniatura, gasto: 0, meta: 0, pessoas: [] }; x.gasto += a.m.gasto; x.meta = (x.meta ?? 0) + a.m.cadastros; m.set(k, x) }
    for (const p of (pessoas ?? []).filter((x) => x.canal === 'anuncio-meta')) {
      const a = p.anuncio ? nomes.get(p.anuncio) : undefined
      const k = a ? a.nome.replace(/^GF \| /, '') : 'Anúncio sem nome (fora do período ou sem marcação)'
      const x = m.get(k) ?? { nome: k, miniatura: a?.criativo.miniatura ?? null, gasto: 0, meta: null, pessoas: [] }; x.pessoas.push(p); m.set(k, x)
    }
    return [...m.values()].filter((x) => x.gasto > 0 || x.pessoas.length).sort((a, b) => (b.meta ?? 0) - (a.meta ?? 0) || b.pessoas.length - a.pessoas.length || b.gasto - a.gasto)
  }, [anuncios, pessoas])
  const porCanal = useMemo(() => {
    const m = new Map<string, PessoaDaJornada[]>()
    for (const p of pessoas ?? []) m.set(p.canal, [...(m.get(p.canal) ?? []), p])
    return [...m.entries()].map(([c, l]) => ({ nome: nomeDoCanal(c), miniatura: null, gasto: c === 'anuncio-meta' ? gasto : null, meta: c === 'anuncio-meta' && meta ? meta.cadastros : null, pessoas: l })).sort((a, b) => b.pessoas.length - a.pessoas.length)
  }, [pessoas, gasto, meta])
  const leitura = useMemo(() => conclusoes(grupo, origem === 'anuncios' ? gasto : 0, cotacao, por === 'anuncio' ? porAnuncio : porCanal), [grupo, origem, gasto, cotacao, por, porAnuncio, porCanal])
  const dinheiro = (v: number) => naMoeda(v, moeda)
  if (!pessoas) return falha ? <p className="aa-erro">{falha}</p> : <p className="aa-vazio">Montando a jornada de cada cadastro…</p>

  const soAnuncio = origem === 'anuncios'
  // 04/11/2026, Tiago: "os números da plataforma precisam bater com os da Meta". No só anúncio, o cadastro e o custo
  // por cadastro são os da Meta (os do Gerenciador); daqui em diante a jornada é de quem a plataforma acompanha pessoa a pessoa
  const cadMeta = soAnuncio && meta ? meta.cadastros : null
  const acomp = cadMeta != null && cadMeta !== s.cadastros
  const custoCad = soAnuncio ? (cadMeta ? gasto / cadMeta : s.cadastros && !meta ? gasto / s.cadastros : null) : null
  const custoDep = soAnuncio && s.depositantes ? gasto / s.depositantes : null
  const dep = grupo.filter((p) => p.deposito1_em)
  const ticket = mediana(dep.map((p) => Number(p.deposito1_valor || 0)))
  const ateDeposito = mediana(dep.map((p) => (+new Date(p.deposito1_em!) - +new Date(p.cadastro_em)) / 36e5).filter((h) => h >= 0))
  const retorno = soAnuncio && cotacao && gasto >= 100 && (moeda || 'BRL') === 'BRL' && s.markup > 0 ? (s.markup * cotacao) / gasto : null
  // a trilha: no "só anúncio", começa nas etapas da Meta (mesmo grupo de pessoas); no "todos", começa no cadastro
  const trilha: Array<{ nome: string; dica: string; n: number; meta?: boolean; filtro?: string }> = [
    ...(soAnuncio && meta ? [
      { nome: 'Viram o anúncio', dica: meta.alcance ? `Pessoas diferentes (Meta) · ${int(meta.impressoes)} vezes na tela` : 'Impressões (Meta)', n: meta.alcance || meta.impressoes, meta: true },
      { nome: 'Clicaram no link', dica: 'Cliques no link (Meta)', n: meta.cliquesLink, meta: true },
      { nome: 'Chegaram na página', dica: 'A página abriu (Meta)', n: meta.lpv, meta: true },
      { nome: 'Se cadastraram', dica: 'Cadastros da Meta, como no Gerenciador', n: meta.cadastros, meta: true },
    ] : []),
    // 05/11/2026, noite ("não temos que ter 2 números diferentes para o mesmo indicador"): no só anúncio o cadastro
    // é o da Meta (acima); a contagem própria da plataforma não aparece como um segundo número de cadastro
    ...PASSOS.filter((p) => !(soAnuncio && meta && p.id === 'cad')).map((p) => ({ nome: p.nome, dica: p.dica, n: grupo.filter(p.fez).length, filtro: p.id })),
  ]
  // duas escalas: as etapas da Meta (milhares de impressões) apagariam as da plataforma numa escala só
  const topoMeta = Math.max(1, ...trilha.filter((t) => t.meta).map((t) => t.n)), topoBanco = Math.max(1, ...trilha.filter((t) => !t.meta).map((t) => t.n))
  const lista = por === 'anuncio' ? porAnuncio : porCanal
  return (
    <>
      <section className="aa-cartao jc-frase">
        <span className="rot">Do anúncio ao dinheiro · {soAnuncio ? 'só quem veio de anúncio' : `todo o /${parceiro}`}</span>
        <p>
          {soAnuncio && gasto > 0 ? <><b>{dinheiro(gasto)}</b> investidos trouxeram </> : null}
          <b>{int(cadMeta ?? s.cadastros)} cadastros</b>{custoCad ? <> ({dinheiro(custoCad)} cada{cadMeta != null ? ', como no Gerenciador' : ''})</> : null}.
          {' '}<b>{int(s.plataforma)}</b> entraram na plataforma, <b>{int(s.derivReal)}</b> conectaram a conta real e <b>{int(s.depositantes)}</b> depositaram <b>{usd(s.depositado)}</b>
          {s.markup > 0 ? <>, gerando cerca de <b>{usd(s.markup)}</b> de markup{retorno != null ? <> ({brl(retorno)} para cada R$ 1,00 investido)</> : null}</> : null}.
        </p>
      </section>

      {falha && <p className="aa-erro">Não consegui atualizar agora ({falha}). Os números abaixo são da última leitura.</p>}
      {total > pessoas.length && <p className="aa-erro">O período tem {int(total)} cadastros e a tela trouxe os {int(pessoas.length)} mais recentes: escolha um período menor para ver todos.</p>}
      <div className="aa-kpis jc-kpis">
        <div><small>Cadastros</small><b>{int(cadMeta ?? s.cadastros)}</b><span>{custoCad ? `${dinheiro(custoCad)} cada` : `${pc(razao(s.questionario, s.cadastros) * 100, 0)} completaram`}</span></div>
        <div><small>Entraram na plataforma</small><b>{int(s.plataforma)}</b><span>{acomp ? 'vindos pelo link dos anúncios' : `${pc(razao(s.plataforma, s.cadastros) * 100, 0)} dos cadastros`}</span></div>
        <div><small>Conta real conectada</small><b>{int(s.derivReal)}</b><span>{pc(razao(s.derivReal, s.plataforma) * 100, 0)} de quem entrou</span></div>
        <div className="destaque"><small>Depositaram</small><b>{int(s.depositantes)}</b><span>{custoDep ? `${dinheiro(custoDep)} por depositante` : acomp ? 'vindos pelo link dos anúncios' : `${pc(razao(s.depositantes, s.cadastros) * 100)} dos cadastros`}</span></div>
        <div className="destaque"><small>Depositado</small><b>{usd(s.depositado)}</b><span>{ticket != null ? `1º depósito típico ${usd(ticket)}` : 'sem depósitos ainda'}{ateDeposito != null && dep.length >= 3 ? ` · em ${horas(ateDeposito)}` : ''}</span></div>
        <div className="destaque"><small>Markup estimado</small><b>{usd(s.markup)}</b><span>{retorno != null ? `${brl(retorno)} por R$ 1 investido` : (cadMeta ?? s.cadastros) ? `${usd(s.markup / (cadMeta ?? s.cadastros))} por cadastro` : '—'}</span></div>
      </div>


      <section className="aa-cartao">
        <header>
          <div><span className="rot">A trilha inteira</span><h3>Onde as pessoas seguem e onde param</h3></div>
          {cotacao && <span className="aa-mudo">Dólar a {brl(cotacao)}</span>}
        </header>
        <ol className="jc-trilha">
          {trilha.map((t, i) => {
            const ant = trilha[i - 1]
            // Meta → Meta: quantos seguiram da etapa anterior. Da plataforma: % dos cadastros (as etapas da
            // plataforma não são uma fila: dá para ligar a I.A. sem ligar as notificações, por exemplo)
            const passa = t.meta ? (ant?.meta && ant.n >= 10 ? razao(t.n, ant.n) * 100 : null) : (t.filtro !== 'cad' && !acomp && s.cadastros >= 10 ? razao(t.n, s.cadastros) * 100 : null)
            return (
              <li key={t.nome} className={t.meta ? 'meta' : ''}>
                <button type="button" disabled={!t.filtro} onClick={() => t.filtro && aPessoas(t.filtro)} title={t.filtro ? 'Ver quem são' : undefined}>
                  <span className="jc-nome"><b>{t.nome}</b><small>{t.dica}</small></span>
                  <span className="jc-barra"><i style={{ width: `${Math.max(t.n ? 1.5 : 0, (t.n / (t.meta ? topoMeta : topoBanco)) * 100)}%` }} /></span>
                  <strong>{int(t.n)}</strong>
                  <em>{passa != null ? pc(passa, 0) : ''}</em>
                </button>
              </li>
            )
          })}
        </ol>
        <p className="aa-nota">{soAnuncio && meta ? 'Nas etapas da Meta (até os cadastros, como no Gerenciador), a % é quantos seguiram da etapa anterior. ' : ''}{acomp ? 'Da plataforma em diante, contam as pessoas que chegaram pelo link dos anúncios.' : 'Da plataforma em diante, a % é sobre os cadastros.'} Clique numa etapa para ver quem são. Comunidade conta desde 04/11.</p>
      </section>

      <section className="aa-cartao jc-leitura">
        <header><div><span className="rot">Inteligência</span><h3>O que os números dizem</h3></div></header>
        <ul>{leitura.map((x, i) => <li key={i} className={x.tipo}><i aria-hidden="true" />{x.texto}</li>)}</ul>
      </section>

      <section className="aa-cartao">
        <header>
          <div><span className="rot">Quem traz resultado</span><h3>{por === 'anuncio' ? 'Cada anúncio, do clique ao markup' : 'Cada canal, do clique ao markup'}</h3></div>
          {!soAnuncio && <div className="aa-troca" role="group" aria-label="Agrupar por">
            <button type="button" className={por === 'anuncio' ? 'on' : ''} onClick={() => setPor('anuncio')}>Por anúncio</button>
            <button type="button" className={por === 'canal' ? 'on' : ''} onClick={() => setPor('canal')}>Por canal</button>
          </div>}
        </header>
        {!lista.length ? <p className="aa-vazio">Nada neste período.</p> : (
          <div className="aa-tabela">
            <table className="jc-tabela">
              <thead><tr>
                <th>{por === 'anuncio' ? 'Anúncio' : 'Canal'}</th><th className="num">Investido</th><th className="num">Cadastros</th><th className="num">Custo/cad.</th>
                <th className="num">Questionário</th><th className="num">Plataforma</th><th className="num">Conta real</th><th className="num">Depositaram</th>
                <th className="num">Custo/depos.</th><th className="num">Depositado</th><th className="num">Markup</th><th className="num">Live</th>
              </tr></thead>
              <tbody>
                {lista.map((g) => {
                  const x = somar(g.pessoas)
                  // o cadastro e o custo por cadastro do anúncio são os do Gerenciador; o resto é de quem a plataforma acompanha
                  const cad = g.meta ?? x.cadastros
                  return (
                    <tr key={g.nome} tabIndex={-1}>
                      <td><span className="jc-quem">{g.miniatura ? <img src={g.miniatura} alt="" /> : null}<b>{g.nome}</b></span></td>
                      <td className="num">{g.gasto != null ? dinheiro(g.gasto) : '—'}</td>
                      <td className="num"><b>{int(cad)}</b></td>
                      <td className="num">{g.gasto && cad ? dinheiro(g.gasto / cad) : '—'}</td>
                      <td className="num">{x.cadastros ? pc(razao(x.questionario, x.cadastros) * 100, 0) : '—'}</td>
                      <td className="num">{int(x.plataforma)}</td>
                      <td className="num">{int(x.derivReal)}</td>
                      <td className="num"><b>{int(x.depositantes)}</b></td>
                      <td className="num">{g.gasto && x.depositantes ? dinheiro(g.gasto / x.depositantes) : '—'}</td>
                      <td className="num">{x.depositado ? usd(x.depositado) : '—'}</td>
                      <td className="num">{x.markup ? usd(x.markup) : '—'}</td>
                      <td className="num">{int(x.live)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="aa-nota">Investido, cadastros e custo por cadastro são da Meta, como no Gerenciador. Do questionário em diante são de quem a plataforma acompanha pessoa a pessoa (ligados ao anúncio pela marcação do link). Depósitos são da corretora (US$, contas reais, só depois do cadastro). O markup é estimado pelo servidor (3% do pagamento de cada operação real).</p>
      </section>
    </>
  )
})

/** A tabela pessoa a pessoa da aba Pessoas: cada cadastro e tudo o que fez depois. */
export const TabelaDaJornada = memo(function TabelaDaJornada({ pessoas, falha, filtroInicial, origem, nomeDoAnuncio, abrir }: {
  pessoas: PessoaDaJornada[] | null; falha: string | null; filtroInicial: string | null; origem: 'todos' | 'anuncios'
  nomeDoAnuncio: Map<string, Anuncio>; abrir: (visitante: string) => void
}) {
  const [busca, setBusca] = useState('')
  const [passo, setPasso] = useState<string>(filtroInicial ?? '')
  // começa no mesmo grupo da tela (a escolha "Só os de anúncio" lá em cima)
  const [so, setSo] = useState<'todos' | 'anuncio'>(origem === 'anuncios' ? 'anuncio' : 'todos')
  useEffect(() => { setSo(origem === 'anuncios' ? 'anuncio' : 'todos') }, [origem])
  const [ordem, setOrdem] = useState<'cadastro' | 'depositado' | 'markup' | 'acessos'>('cadastro')
  const [aberta, setAberta] = useState<string | null>(null)
  useEffect(() => { setPasso(filtroInicial ?? '') }, [filtroInicial])
  const vistos = useMemo(() => {
    const q = busca.trim().toLowerCase(), f = PASSOS.find((p) => p.id === passo)
    return (pessoas ?? []).filter((p) => (so === 'todos' || p.canal === 'anuncio-meta') && (!f || f.fez(p))
      && (!q || p.nome.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.telefone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '###')))
      .sort((a, b) => ordem === 'cadastro' ? +new Date(b.cadastro_em) - +new Date(a.cadastro_em) : ordem === 'depositado' ? b.depositado - a.depositado : ordem === 'markup' ? b.markup - a.markup : b.acessos - a.acessos)
  }, [pessoas, busca, passo, so, ordem])
  const csv = () => {
    const col = ['Nome', 'E-mail', 'Telefone', 'Cadastro', 'Canal', 'Anúncio', 'Questionário', 'Comunidade', 'Notificações', 'E-mails', 'Acessos', 'Live (min)', 'Conta real', '1º depósito', '1º depósito (US$)', 'Depositado (US$)', 'Sacado (US$)', 'Operações reais', 'Markup estimado (US$)', 'Situação']
    const num = (v: number | null | undefined, c = 2) => (v == null ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c, useGrouping: false }))
    const linhas = vistos.map((p) => [p.nome, p.email, p.telefone, new Date(p.cadastro_em).toLocaleString('pt-BR'), nomeDoCanal(p.canal), p.anuncio ? nomeDoAnuncio.get(p.anuncio)?.nome ?? p.anuncio : '',
      p.questionario_em ? 'sim' : 'não', p.comunidade ? 'sim' : '', p.notificacoes ? 'sim' : 'não', p.emails, p.acessos, p.minutos_live, p.deriv_real_em ? dataCurta(p.deriv_real_em) : '',
      p.deposito1_em ? new Date(p.deposito1_em).toLocaleString('pt-BR') : '', num(p.deposito1_valor), num(p.depositado), num(p.sacado), p.operacoes_reais, num(p.markup, 4), p.cliente_antes ? `${p.status_acesso ?? ''} (recadastro)` : p.status_acesso ?? ''])
    const texto = [col, ...linhas].map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' })); a.download = `jornada-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  }
  if (!pessoas) return falha ? <p className="aa-erro">{falha}</p> : <p className="aa-vazio">Montando a jornada de cada cadastro…</p>
  const sim = (v: unknown) => (v ? <i className="jc-sim" aria-label="sim">✓</i> : <i className="jc-nao" aria-label="não">·</i>)
  return (
    <section className="aa-cartao">
      <header>
        <div><span className="rot">Pessoa a pessoa</span><h3>{int(vistos.length)} {vistos.length === 1 ? 'cadastro' : 'cadastros'}{passo ? ` · ${PASSOS.find((p) => p.id === passo)?.nome.toLowerCase()}` : ''}</h3></div>
        <button type="button" className="aa-atualizar" onClick={csv}>Baixar planilha</button>
      </header>
      <div className="jc-filtros">
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail ou WhatsApp" aria-label="Buscar" />
        <select value={passo} onChange={(e) => setPasso(e.target.value)} aria-label="Quem fez">
          <option value="">Todos os cadastros</option>
          {PASSOS.slice(1).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)} aria-label="Ordenar">
          <option value="cadastro">Mais recentes</option><option value="depositado">Mais depositado</option><option value="markup">Mais markup</option><option value="acessos">Mais acessos</option>
        </select>
        <div className="aa-troca" role="group" aria-label="Origem">
          <button type="button" className={so === 'todos' ? 'on' : ''} onClick={() => setSo('todos')}>Todos</button>
          <button type="button" className={so === 'anuncio' ? 'on' : ''} onClick={() => setSo('anuncio')}>Só de anúncio</button>
        </div>
      </div>
      {!vistos.length ? <p className="aa-vazio">Ninguém com esse filtro no período.</p> : (
        <div className="aa-tabela">
          <table className="jc-tabela jc-pessoas">
            <thead><tr>
              <th>Pessoa</th><th>Veio por</th><th>Cadastro</th><th>Quest.</th><th>Comun.</th><th>Notif.</th><th className="num">E-mails</th>
              <th className="num">Acessos</th><th className="num">Live</th><th>Conta real</th><th>1º depósito</th><th className="num">Depositado</th><th className="num">Markup</th>
            </tr></thead>
            <tbody>
              {vistos.slice(0, 500).map((p) => {
                const ad = p.anuncio ? nomeDoAnuncio.get(p.anuncio) : undefined
                return (
                  <Fragment key={p.id}>
                    <tr onClick={() => setAberta(aberta === p.id ? null : p.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setAberta(aberta === p.id ? null : p.id) }}>
                      <td><span className="jc-pessoa"><b>{p.nome}{p.cliente_antes && <em className="jc-selo" title="Já tinha conta antes deste cadastro: só conta o que fez depois">recadastro</em>}</b><small>{p.email}</small></span></td>
                      <td><span className={`cr-canal c-${p.canal}`}><i aria-hidden="true" />{nomeDoCanal(p.canal)}{ad && <small>{ad.nome.replace(/^GF \| /, '')}</small>}</span></td>
                      <td>{dataCurta(p.cadastro_em)}</td>
                      <td>{sim(p.questionario_em)}</td><td>{sim(p.comunidade)}</td><td>{sim(p.notificacoes)}</td>
                      <td className="num">{p.emails || '—'}</td><td className="num">{p.acessos || '—'}</td><td className="num">{p.minutos_live ? `${p.minutos_live} min` : '—'}</td>
                      <td>{p.deriv_real_em ? dataCurta(p.deriv_real_em) : '—'}</td>
                      <td>{p.deposito1_em ? `${dataCurta(p.deposito1_em)} · ${usd(Number(p.deposito1_valor || 0))}` : '—'}</td>
                      <td className="num">{p.depositado ? <b>{usd(p.depositado)}</b> : '—'}</td>
                      <td className="num">{p.markup ? usd(p.markup) : '—'}</td>
                    </tr>
                    {aberta === p.id && (
                      <tr className="jc-detalhe"><td colSpan={13}>
                        <dl>
                          <div><dt>WhatsApp</dt><dd>{p.telefone}</dd></div>
                          <div><dt>Cadastro</dt><dd>{new Date(p.cadastro_em).toLocaleString('pt-BR')}</dd></div>
                          <div><dt>Questionário</dt><dd>{p.questionario_em ? (p.ex_cliente ? 'Já foi cliente' : 'Nunca foi cliente') : 'Não respondeu'}</dd></div>
                          <div><dt>Na plataforma</dt><dd>{p.acessos ? `${int(p.acessos)} acessos · ${Math.round(p.segundos_na_plataforma / 60)} min · último ${dataCurta(p.visto_em)}` : 'Não entrou'}</dd></div>
                          <div><dt>Conta demo</dt><dd>{p.deriv_demo_em ? `conectada ${dataCurta(p.deriv_demo_em)}` : '—'}</dd></div>
                          <div><dt>Conta real</dt><dd>{p.deriv_real_em ? `conectada ${dataCurta(p.deriv_real_em)} · saldo ${usd(Number(p.saldo_real || 0))}` : 'Não conectou'}</dd></div>
                          <div><dt>Depósitos</dt><dd>{p.depositos ? `${p.depositos} · total ${usd(p.depositado)}${p.sacado ? ` · sacou ${usd(p.sacado)}` : ''}` : 'Nenhum'}</dd></div>
                          <div><dt>Até o 1º depósito</dt><dd>{p.deposito1_em ? horas(Math.max(0, (+new Date(p.deposito1_em) - +new Date(p.cadastro_em)) / 36e5)) : '—'}</dd></div>
                          <div><dt>I.A.</dt><dd>{p.sessoes_ia ? `${int(p.sessoes_ia)} sessões (${int(p.sessoes_ia_reais)} na real)` : 'Não ligou'}</dd></div>
                          <div><dt>Operações reais</dt><dd>{p.operacoes_reais ? `${int(p.operacoes_reais)} · resultado ${usd(Number(p.resultado_real || 0))}` : '—'}</dd></div>
                          <div><dt>Markup estimado</dt><dd>{usd(Number(p.markup || 0))}</dd></div>
                          <div><dt>Situação</dt><dd>{p.status_acesso === 'ativo' ? 'GF Member' : p.status_acesso ?? '—'}{p.categoria ? ` · ${p.categoria}` : ''}</dd></div>
                        </dl>
                        {p.visitante && <button type="button" className="aa-atualizar" onClick={() => abrir(p.visitante!)}>Ver cada passo nas páginas</button>}
                      </td></tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {vistos.length > 500 && <p className="aa-nota">Mostrando os 500 primeiros. A planilha leva todos.</p>}
      <p className="aa-nota">Tudo a partir do cadastro: quem já tinha conta (recadastro) só conta o que fez depois. Depósitos e markup em dólar, das contas reais; o markup é estimado (3% do pagamento).</p>
    </section>
  )
})
