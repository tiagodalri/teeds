/**
 * Inteligência do negócio, na Visão geral (16/11/2026, Tiago: "um pouco mais para baixo a gente pode ter
 * mais alguns indicadores, alguns gráficos para a gente enxergar um pouco melhor do negócio. Eu quero ter
 * uma comparação do markup que é gerado nas operações manuais e nas operações feitas com IA... lucro dos
 * clientes, prejuízo dos clientes, quanto foi o markup gerado, o valor de conta de cada um... quanto vale a
 * pena eu investir numa operação manual, numa operação automatizada... recomendações geradas pela IA...
 * quais foram as lives que renderam mais markup, qual foi o dia, o horário").
 *
 * De cima para baixo: a conclusão escrita, o frente a frente manual x I.A., as recomendações da I.A.,
 * o markup por dia e por horário, quem opera como, cada I.A. e cada tipo de contrato, a banca contra o
 * markup, os clientes no azul e no vermelho, quem mais gerou e as lives.
 *
 * Uma leitura só (teeds_painel_negocio), com a mesma contagem de markup do resto da tela. O período é o
 * do topo; Agora, Hoje e Ontem usam os últimos 30 dias (um dia só não forma comparação).
 * Cores: a I.A. é o ouro da tela (--vg-ouro) e a manual é o azul-céu da paleta (#5E8FC8), par conferido
 * para daltonismo nos dois temas; sempre com o nome escrito ao lado, nunca só a cor.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { dinheiro } from '../../core/dinheiro'
import { MARCA } from '../../marca'
import { lerNegocio, type LiveDoNegocio, type Negocio, type OrigemDoNegocio, type PerfilDoCliente } from '../../core/teeds/negocio'
import type { JanelaDoPeriodo } from './PeriodoDaVisaoGeral'
import { Usd } from './EmReais'
import { RecomendacoesDoNegocio } from './RecomendacoesDoNegocio'
import { SeloDoParceiro } from '../parceiros/SeloDoParceiro'
import './negocio.css'

const VAZIA: OrigemDoNegocio = { operacoes: 0, pessoas: 0, markup: 0, volume: 0, resultado: 0, ganhos: 0, perdas: 0, ganhas: 0, dias: 0, banca: 0,
  com_saldo: 0, lucrando: 0, perdendo: 0, lucro: 0, prejuizo: 0, depositos: 0, dias_media: 0, markup_mediano: 0 }
const PARCEIRO: Record<string, string> = { n: 'Naor', v: 'Victor', d: 'Douglas' }
const FAIXAS = ['Sem saldo agora', 'Até US$ 50', 'US$ 50 a 200', 'US$ 200 a 1 mil', 'US$ 1 mil a 5 mil', 'Mais de US$ 5 mil']
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const usd = (v: number) => dinheiro(Number(v) || 0, 'USD')
const comSinal = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${usd(Math.abs(v))}`
const int = (n: number) => Math.round(Number(n) || 0).toLocaleString('pt-BR')
const num = (v: number, casas = 1) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
const pctTxt = (v: number) => `${v > 0 && v < 10 ? num(v, 1) : Math.round(v)}%`
const div = (a: number, b: number) => (b > 0 ? a / b : 0)
const vezes = (v: number) => `${v >= 10 ? Math.round(v) : num(v, 1)}×`
const iniciais = (nome: string | null) => (nome ?? '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase() || '?'
const fmtDiaLive = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit' })
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
const duracao = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${Math.round(min % 60) ? ` ${String(Math.round(min % 60)).padStart(2, '0')}` : ''}` : `${Math.round(min)} min`)

type Lado = 'ia' | 'manual'

/** A fatia de cada lado numa barra só (com a folga de 2 px entre as duas cores). */
function Fatia({ ia, manual, alto }: { ia: number; manual: number; alto?: boolean }) {
  const total = ia + manual
  if (total <= 0) return <span className={`ngc-fatia vazia${alto ? ' alto' : ''}`} aria-hidden="true" />
  return (
    <span className={`ngc-fatia${alto ? ' alto' : ''}`} aria-hidden="true">
      {ia > 0 && <u className="ia" style={{ width: `${(ia / total) * 100}%` }} />}
      {manual > 0 && <u className="manual" style={{ width: `${(manual / total) * 100}%` }} />}
    </span>
  )
}

/** Uma linha do frente a frente: o valor da I.A., as duas barras saindo do meio e o valor da manual. */
function Duelo({ rotulo, dica, ia, manual, mostra, semVencedor }: {
  rotulo: string; dica?: string; ia: number; manual: number
  mostra: (v: number, lado: Lado) => ReactNode
  /** Linhas em que maior não é "melhor" (o resultado dos clientes, por exemplo). */
  semVencedor?: boolean
}) {
  const max = Math.max(Math.abs(ia), Math.abs(manual), 0.000001)
  const vence: Lado | null = semVencedor || ia === manual ? null : ia > manual ? 'ia' : 'manual'
  return (
    <div className="ngc-duelo" role="row">
      <span className={`ngc-duelo-valor ia${vence === 'ia' ? ' vence' : ''}`} role="cell">{mostra(ia, 'ia')}</span>
      <span className="ngc-duelo-barra ia" aria-hidden="true"><u style={{ width: `${(Math.abs(ia) / max) * 100}%` }} /></span>
      <span className="ngc-duelo-rot" role="rowheader">{rotulo}{dica && <small>{dica}</small>}</span>
      <span className="ngc-duelo-barra manual" aria-hidden="true"><u style={{ width: `${(Math.abs(manual) / max) * 100}%` }} /></span>
      <span className={`ngc-duelo-valor manual${vence === 'manual' ? ' vence' : ''}`} role="cell">{mostra(manual, 'manual')}</span>
    </div>
  )
}

/** Barras em pé empilhadas (I.A. embaixo, manual em cima) com a leitura da barra em foco logo abaixo. */
function Empilhado({ itens, titulo, legenda, marcas }: {
  itens: Array<{ chave: string; rotulo: string; eixo: string; ia: number; manual: number; nota?: string }>
  titulo: string
  /** O texto de quando nenhuma barra está em foco. */
  legenda: ReactNode
  /** De quantas em quantas barras o eixo escreve o rótulo. */
  marcas: number
}) {
  const [foco, setFoco] = useState<number | null>(null)
  const max = Math.max(...itens.map((x) => x.ia + x.manual), 0.000001)
  const f = foco != null ? itens[foco] : null
  return (
    <div className="ngc-emp">
      <div className="ngc-emp-barras" role="img" aria-label={titulo} onMouseLeave={() => setFoco(null)}>
        {itens.map((x, i) => {
          const total = x.ia + x.manual
          return (
            <button key={x.chave} type="button" className={foco === i ? 'ngc-foco' : ''} onMouseEnter={() => setFoco(i)} onFocus={() => setFoco(i)} onBlur={() => setFoco(null)}
              aria-label={`${x.rotulo}: ${usd(total)}`}>
              <span style={{ height: `${total > 0 ? Math.max(3, (total / max) * 100) : 0}%` }}>
                {x.manual > 0 && <u className="manual" style={{ flexGrow: x.manual }} />}
                {x.ia > 0 && <u className="ia" style={{ flexGrow: x.ia }} />}
              </span>
            </button>
          )
        })}
      </div>
      <div className="ngc-emp-eixo" aria-hidden="true">
        {itens.map((x, i) => <span key={x.chave}>{i % marcas === 0 ? x.eixo : ''}</span>)}
      </div>
      <small className="ngc-leg">{f
        ? <><b>{f.rotulo}</b>: {MARCA.vocabularioIA ? 'I.A.' : 'Robôs'} <b><Usd v={f.ia} /></b> · manual <b><Usd v={f.manual} /></b> · total <b><Usd v={f.ia + f.manual} /></b>{f.nota ? ` · ${f.nota}` : ''}</>
        : legenda}</small>
    </div>
  )
}

export function NegocioDaVisaoGeral({ sessao, marca, parceiro, janela }: { sessao: SessaoTeeds; marca: string; parceiro: string; janela: JanelaDoPeriodo | null }) {
  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao
  // um dia só não forma comparação: Agora, Hoje e Ontem usam os últimos 30 dias (como o "Quando o markup acontece")
  const usaJanela = janela != null && janela.ate - janela.de >= 48 * 3600_000
  const [ancora] = useState(() => Date.now())
  const de = usaJanela ? janela!.de : ancora - 30 * 86_400_000
  const ate = usaJanela ? janela!.ate : ancora
  const aoVivo = usaJanela ? janela!.aoVivo : true
  const rotulo = usaJanela ? janela!.curto : 'Últimos 30 dias'
  const periodo = usaJanela ? (janela!.aoVivo ? janela!.curto : `${janela!.de}-${janela!.ate}`) : '30d'
  const chave = `${marca}|${parceiro}|${usaJanela ? `${janela!.de}|${janela!.curto}` : '30d'}`

  const [lido, setLido] = useState<{ chave: string; dados: Negocio; fim: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ordemLives, setOrdemLives] = useState<'markup' | 'recentes' | 'hora'>('markup')
  const nomeIA = MARCA.vocabularioIA ? 'I.A.' : 'Robôs'
  const umaIA = MARCA.vocabularioIA ? 'I.A.' : 'robô'

  useEffect(() => {
    let vivo = true
    let t = 0
    const ler = () => {
      window.clearTimeout(t)
      const fim = aoVivo ? Date.now() : ate
      void lerNegocio(sessaoRef.current, marca, parceiro, de, fim)
        .then((d) => { if (vivo) { setLido({ chave, dados: d, fim }); setErro(null) } })
        .catch((e) => { if (vivo) setErro((e as Error).message) })
        // é uma leitura pesada (cruza tudo): com o período andando, de 5 em 5 minutos basta
        .finally(() => { if (vivo && aoVivo) t = window.setTimeout(ler, document.visibilityState === 'hidden' ? 900_000 : 300_000) })
    }
    ler()
    return () => { vivo = false; window.clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  const d = lido?.dados ?? null
  const lendo = lido?.chave !== chave

  const c = useMemo(() => {
    const ia = d?.origens.ia ?? VAZIA, man = d?.origens.manual ?? VAZIA
    const total = Number(ia.markup) + Number(man.markup)
    const lives = (d?.lives ?? []).map((l) => {
      const min = (Date.parse(l.fim) - Date.parse(l.inicio)) / 60_000
      return { ...l, min, porHora: div(Number(l.markup), min / 60), mult: Number(l.tipico) > 0 ? Number(l.markup) / Number(l.tipico) : null }
    })
    const lr = d?.lives_resumo
    const porHoraLive = div(Number(lr?.markup_live ?? 0), Number(lr?.horas_live ?? 0))
    const porHoraFora = div(Number(lr?.markup_fora ?? 0), Number(lr?.horas_fora ?? 0))
    return {
      ia, man, total, fatiaIA: div(Number(ia.markup), total) * 100,
      porOp: { ia: div(ia.markup, ia.operacoes), man: div(man.markup, man.operacoes) },
      lives, porHoraLive, porHoraFora,
      multLives: Number(lr?.tipico_live ?? 0) > 0 ? Number(lr!.markup_live) / Number(lr!.tipico_live) : null,
    }
  }, [d])

  const livesOrdenadas = useMemo(() => {
    const l = [...c.lives]
    if (ordemLives === 'markup') l.sort((a, b) => Number(b.markup) - Number(a.markup))
    else if (ordemLives === 'hora') l.sort((a, b) => b.porHora - a.porHora)
    else l.sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio))
    return l
  }, [c.lives, ordemLives])

  const cab = (
    <div className="ngc-cab">
      <div>
        <span className="vg-rot">Inteligência do negócio · {rotulo}</span>
        <h3>Manual x {nomeIA}: onde o markup nasce</h3>
      </div>
      <div className="ngc-legenda" aria-label="Cores">
        <span><i className="ia" />{nomeIA}</span>
        <span><i className="manual" />Manual</span>
      </div>
    </div>
  )

  if (!d) {
    return (
      <section className="vg-card ngc" aria-busy={!erro}>
        {cab}
        {erro ? <p className="vg-erro" role="alert">{erro}</p> : <div className="ngc-esq"><i className="vg-esq grande" /><i className="vg-esq" /><i className="vg-esq" /><i className="vg-esq" /></div>}
      </section>
    )
  }
  if (c.total <= 0 && !c.ia.operacoes && !c.man.operacoes) {
    return (
      <section className={`vg-card ngc${lendo ? ' vg-lendo' : ''}`}>
        {cab}
        <p className="vg-vazio">Nenhuma operação em conta real neste período: ainda não há o que comparar.</p>
      </section>
    )
  }

  const { ia, man } = c
  const maisPorOp: Lado = c.porOp.man >= c.porOp.ia ? 'manual' : 'ia'
  const razaoOp = div(Math.max(c.porOp.ia, c.porOp.man), Math.min(c.porOp.ia, c.porOp.man))
  const maiorFatia: Lado = c.fatiaIA >= 50 ? 'ia' : 'manual'
  const nome = (l: Lado) => (l === 'ia' ? `a ${umaIA}` : 'a manual')
  const Nome = (l: Lado) => (l === 'ia' ? `A ${umaIA}` : 'A manual')
  const perfil = (p: PerfilDoCliente) => (p === 'ia' ? `Só ${umaIA}` : p === 'manual' ? 'Só manual' : `${nomeIA} e manual`)
  const maxRot = Math.max(...d.rotulos.map((r) => Number(r.markup)), 0.000001)
  const maxFaixa = Math.max(...d.faixas.map((f) => Number(f.markup)), 0.000001)
  const cli = d.clientes
  const pessoasTotal = cli.lucrando.pessoas + cli.perdendo.pessoas + cli.zerados
  const melhorLive = c.lives.reduce<(typeof c.lives)[number] | null>((m, l) => (Number(l.markup) > Number(m?.markup ?? 0) ? l : m), null)
  const quandoLive = (l: LiveDoNegocio) => `${fmtDiaLive.format(Date.parse(l.inicio)).replace('.', '')}, ${l.estimada ? '≈ ' : ''}${fmtHora.format(Date.parse(l.inicio))} às ${fmtHora.format(Date.parse(l.fim))}`

  return (
    <section className={`vg-card ngc${lendo ? ' vg-lendo' : ''}`} aria-busy={lendo}>
      {cab}

      {/* ------------------------------------------------ a conclusão, escrita */}
      <p className="ngc-frase">
        <b>{Nome(maiorFatia)}</b> gerou <b>{pctTxt(maiorFatia === 'ia' ? c.fatiaIA : 100 - c.fatiaIA)}</b> do markup do período
        {' '}({usd(maiorFatia === 'ia' ? ia.markup : man.markup)} de {usd(c.total)}).
        {c.porOp.ia > 0 && c.porOp.man > 0 && razaoOp >= 1.15 && <>
          {' '}Cada operação d{nome(maisPorOp)} rende <b>{vezes(razaoOp)}</b> mais markup
          {' '}({usd(maisPorOp === 'manual' ? c.porOp.man : c.porOp.ia)} contra {usd(maisPorOp === 'manual' ? c.porOp.ia : c.porOp.man)})
          {maisPorOp !== maiorFatia && <>, mas {nome(maiorFatia)} faz <b>{vezes(div(maiorFatia === 'ia' ? ia.operacoes : man.operacoes, Math.max(1, maiorFatia === 'ia' ? man.operacoes : ia.operacoes)))}</b> mais operações</>}.
        </>}
        {c.multLives != null && c.lives.length > 0 && <> Em live, o markup por hora foi <b>{vezes(c.multLives)}</b> o do mesmo horário sem live.</>}
      </p>
      <Fatia ia={Number(ia.markup)} manual={Number(man.markup)} alto />

      {/* ------------------------------------------------ frente a frente */}
      <div className="ngc-bloco">
        <div className="ngc-duelo-topo" aria-hidden="true">
          <b className="ia"><i />{nomeIA}</b>
          <span>Frente a frente</span>
          <b className="manual">Manual<i /></b>
        </div>
        <div role="table" aria-label={`${nomeIA} e manual, frente a frente`}>
          <Duelo rotulo="Markup gerado" ia={Number(ia.markup)} manual={Number(man.markup)} mostra={(v) => <Usd v={v} />} />
          <Duelo rotulo="Operações" ia={ia.operacoes} manual={man.operacoes} mostra={(v) => int(v)} />
          <Duelo rotulo="Pessoas que operaram" dica="Quem usa os dois conta nos dois lados" ia={ia.pessoas} manual={man.pessoas} mostra={(v) => int(v)} />
          <Duelo rotulo="Movimentado" dica="Soma das entradas" ia={Number(ia.volume)} manual={Number(man.volume)} mostra={(v) => <Usd v={v} />} />
          <Duelo rotulo="Markup por operação" ia={c.porOp.ia} manual={c.porOp.man} mostra={(v) => <Usd v={v} />} />
          <Duelo rotulo="Markup por pessoa" ia={div(ia.markup, ia.pessoas)} manual={div(man.markup, man.pessoas)} mostra={(v) => <Usd v={v} />} />
          <Duelo rotulo="Markup a cada US$ 100 movimentados" ia={div(ia.markup, ia.volume) * 100} manual={div(man.markup, man.volume) * 100} mostra={(v) => <Usd v={v} />} />
          <Duelo rotulo="Entrada média por operação" ia={div(ia.volume, ia.operacoes)} manual={div(man.volume, man.operacoes)} mostra={(v) => <Usd v={v} />} />
          <Duelo rotulo="Dias ativos por pessoa" dica="Quantos dias a pessoa voltou a operar" ia={Number(ia.dias_media)} manual={Number(man.dias_media)} mostra={(v) => num(v, 1)} />
          <Duelo rotulo="Depósitos no período" dica="De quem operou assim" ia={Number(ia.depositos)} manual={Number(man.depositos)} mostra={(v) => <Usd v={v} />} />
          <Duelo rotulo="Banca hoje" dica="Saldo real de quem operou assim" ia={Number(ia.banca)} manual={Number(man.banca)} mostra={(v) => <Usd v={v} />} />
          <Duelo rotulo="Banca média por pessoa" ia={div(ia.banca, ia.pessoas)} manual={div(man.banca, man.pessoas)} mostra={(v) => <Usd v={v} />} />
          <Duelo rotulo="Operações com ganho" semVencedor ia={div(ia.ganhas, ia.operacoes) * 100} manual={div(man.ganhas, man.operacoes) * 100} mostra={(v) => pctTxt(v)} />
          <Duelo rotulo="Ganhos dos clientes" dica="Soma das operações com ganho" semVencedor ia={Number(ia.ganhos)} manual={Number(man.ganhos)} mostra={(v) => <Usd v={v} />} />
          <Duelo rotulo="Perdas dos clientes" dica="Soma das operações com perda" semVencedor ia={Math.abs(Number(ia.perdas))} manual={Math.abs(Number(man.perdas))} mostra={(v) => (v > 0 ? `−${usd(v)}` : usd(0))} />
          <Duelo rotulo="Resultado dos clientes" dica="Ganhos menos perdas" semVencedor ia={Number(ia.resultado)} manual={Number(man.resultado)}
            mostra={(v) => <span className={v >= 0 ? 'sobe' : 'cai'}><Usd v={v} formato={comSinal} /></span>} />
          <Duelo rotulo="Pessoas no lucro" dica="Terminaram o período no azul" semVencedor ia={ia.lucrando} manual={man.lucrando}
            mostra={(v, l) => <>{int(v)} <small>de {int(l === 'ia' ? ia.pessoas : man.pessoas)}</small></>} />
          <Duelo rotulo="Pessoas no prejuízo" semVencedor ia={ia.perdendo} manual={man.perdendo}
            mostra={(v, l) => <>{int(v)} <small>de {int(l === 'ia' ? ia.pessoas : man.pessoas)}</small></>} />
        </div>
      </div>

      {/* ------------------------------------------------ as recomendações da I.A. */}
      <RecomendacoesDoNegocio sessao={sessao} marca={marca} parceiro={parceiro} periodo={periodo} de={de} ate={lido?.fim ?? ate} rotulo={rotulo} />

      {/* ------------------------------------------------ por dia e por horário */}
      <div className="ngc-dois">
        <div className="ngc-bloco">
          <h4>Markup por dia <small>{nomeIA} embaixo, manual em cima</small></h4>
          <Empilhado titulo="Markup por dia, I.A. e manual" marcas={Math.max(1, Math.ceil(d.dias.length / 10))}
            itens={d.dias.map((x) => {
              const quando = new Date(`${x.dia}T12:00:00Z`)
              return { chave: x.dia, eixo: `${x.dia.slice(8, 10)}/${x.dia.slice(5, 7)}`, rotulo: `${x.dia.slice(8, 10)}/${x.dia.slice(5, 7)} (${DIAS_CURTOS[quando.getUTCDay()]})`,
                ia: Number(x.ia), manual: Number(x.manual), nota: `${int(x.ia_ops + x.manual_ops)} operações` }
            })}
            legenda={<>Passe o mouse numa barra para ver o dia · {int(d.dias.length)} {d.dias.length === 1 ? 'dia' : 'dias'} com operação em conta real</>} />
        </div>
        <div className="ngc-bloco">
          <h4>Markup por horário <small>Brasília · soma do período</small></h4>
          <Empilhado titulo="Markup por horário, I.A. e manual" marcas={3}
            itens={Array.from({ length: 24 }, (_, h) => {
              const x = d.horas.find((y) => y.hora === h)
              return { chave: String(h), eixo: `${h}h`, rotulo: `Das ${String(h).padStart(2, '0')}h às ${String((h + 1) % 24).padStart(2, '0')}h`, ia: Number(x?.ia ?? 0), manual: Number(x?.manual ?? 0) }
            })}
            legenda={(() => {
              const melhor = (l: Lado) => d.horas.reduce<{ hora: number; v: number } | null>((m, x) => (Number(x[l]) > (m?.v ?? 0) ? { hora: x.hora, v: Number(x[l]) } : m), null)
              const a = melhor('ia'), b = melhor('manual')
              return <>Melhor hora d{nome('ia')}: <b>{a ? `${a.hora}h` : '—'}</b> · da manual: <b>{b ? `${b.hora}h` : '—'}</b></>
            })()} />
        </div>
      </div>

      {/* ------------------------------------------------ quem opera como */}
      <div className="ngc-bloco">
        <h4>Quem opera como <small>cada pessoa num grupo só</small></h4>
        <div className="ngc-perfis">
          {(['duas', 'ia', 'manual'] as PerfilDoCliente[]).map((p) => {
            const x = d.perfis.find((y) => y.perfil === p)
            if (!x) return <div key={p} className="ngc-perfil vazio"><span>{perfil(p)}</span><b>Ninguém</b><small>no período</small></div>
            return (
              <div key={p} className="ngc-perfil">
                <span>{perfil(p)}</span>
                <b>{int(x.pessoas)} <small>{x.pessoas === 1 ? 'pessoa' : 'pessoas'}</small></b>
                <Fatia ia={Number(x.markup_ia)} manual={Number(x.markup_manual)} />
                <dl>
                  <div><dt>Markup</dt><dd><Usd v={x.markup} /></dd></div>
                  <div><dt>Markup por pessoa</dt><dd><Usd v={div(x.markup, x.pessoas)} /></dd></div>
                  <div><dt>Banca média hoje</dt><dd><Usd v={div(x.banca, x.pessoas)} /></dd></div>
                  <div><dt>Depósitos no período</dt><dd><Usd v={x.depositos} /></dd></div>
                  <div><dt>Dias ativos por pessoa</dt><dd>{num(x.dias_media, 1)}</dd></div>
                  <div><dt>No lucro · no prejuízo</dt><dd>{int(x.lucrando)} · {int(x.perdendo)}</dd></div>
                </dl>
              </div>
            )
          })}
        </div>
      </div>

      {/* ------------------------------------------------ cada I.A. e cada tipo de contrato */}
      <div className="ngc-bloco">
        <h4>{MARCA.vocabularioIA ? 'Cada I.A. e cada tipo de operação manual' : 'Cada robô e cada tipo de operação manual'} <small>do que mais gerou markup para o que menos gerou</small></h4>
        <div className="ngc-tabela" role="table">
          <div className="ngc-linha cabeca" role="row">
            <span role="columnheader">Estratégia</span><span role="columnheader" aria-hidden="true" /><span role="columnheader">Markup</span>
            <span role="columnheader">Operações</span><span role="columnheader">Pessoas</span><span role="columnheader">Por operação</span>
            <span role="columnheader">Com ganho</span><span role="columnheader">Resultado dos clientes</span>
          </div>
          {d.rotulos.map((r) => (
            <div key={`${r.origem}-${r.nome}`} className="ngc-linha" role="row">
              <span className="ngc-nome" role="rowheader"><i className={r.origem} />{r.nome}<small>{r.origem === 'ia' ? umaIA : 'Manual'}</small></span>
              <span className="ngc-trilho" aria-hidden="true"><u className={r.origem} style={{ width: `${Math.max(2, (Number(r.markup) / maxRot) * 100)}%` }} /></span>
              <span role="cell" data-rot="Markup"><b><Usd v={r.markup} /></b></span>
              <span role="cell" data-rot="Operações">{int(r.operacoes)}</span>
              <span role="cell" data-rot="Pessoas">{int(r.pessoas)}</span>
              <span role="cell" data-rot="Por operação"><Usd v={div(r.markup, r.operacoes)} /></span>
              <span role="cell" data-rot="Com ganho">{pctTxt(div(r.ganhas, r.operacoes) * 100)}</span>
              <span role="cell" data-rot="Resultado dos clientes" className={Number(r.resultado) >= 0 ? 'sobe' : 'cai'}><Usd v={Number(r.resultado)} formato={comSinal} /></span>
            </div>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------ banca x markup · clientes */}
      <div className="ngc-dois">
        <div className="ngc-bloco">
          <h4>Tamanho da conta x markup <small>pela banca real de hoje</small></h4>
          <ol className="ngc-faixas">
            {d.faixas.map((f) => (
              <li key={f.faixa}>
                <span className="ngc-faixa-nome">{FAIXAS[f.faixa] ?? 'Outra faixa'}<small>{int(f.pessoas)} {f.pessoas === 1 ? 'pessoa' : 'pessoas'}</small></span>
                <span className="ngc-faixa-barra" style={{ width: `${Math.max(3, (Number(f.markup) / maxFaixa) * 100)}%` }}><Fatia ia={Number(f.markup_ia)} manual={Number(f.markup_manual)} /></span>
                <span className="ngc-faixa-valor"><b><Usd v={f.markup} /></b><small>{usd(div(f.markup, f.pessoas))} por pessoa</small></span>
              </li>
            ))}
          </ol>
          <small className="ngc-leg">Quem aparece em "Sem saldo agora" operou no período e hoje está com a conta zerada.</small>
        </div>
        <div className="ngc-bloco">
          <h4>Lucro e prejuízo dos clientes <small>no período, somando tudo o que cada um operou</small></h4>
          <div className="ngc-clientes">
            <div>
              <span>No lucro</span>
              <b className="sobe">{int(cli.lucrando.pessoas)} <small>{pctTxt(div(cli.lucrando.pessoas, pessoasTotal) * 100)} das pessoas</small></b>
              <small>Ganharam <b><Usd v={cli.lucrando.resultado} /></b> e geraram <b><Usd v={cli.lucrando.markup} /></b> de markup</small>
            </div>
            <div>
              <span>No prejuízo</span>
              <b className="cai">{int(cli.perdendo.pessoas)} <small>{pctTxt(div(cli.perdendo.pessoas, pessoasTotal) * 100)} das pessoas</small></b>
              <small>Perderam <b>{usd(Math.abs(Number(cli.perdendo.resultado)))}</b> e geraram <b><Usd v={cli.perdendo.markup} /></b> de markup</small>
            </div>
            <div>
              <span>Voltaram 3 dias ou mais</span>
              <b>{int(cli.tres_dias_ou_mais)} <small>{pctTxt(div(cli.tres_dias_ou_mais, pessoasTotal) * 100)} das pessoas</small></b>
              <small>Geraram <b><Usd v={cli.markup_tres_dias} /></b>: {pctTxt(div(Number(cli.markup_tres_dias), c.total) * 100)} do markup</small>
            </div>
            <div>
              <span>Operaram um dia só</span>
              <b>{int(cli.um_dia_so)} <small>{pctTxt(div(cli.um_dia_so, pessoasTotal) * 100)} das pessoas</small></b>
              <small>{int(cli.sem_saldo)} {cli.sem_saldo === 1 ? 'pessoa está' : 'pessoas estão'} sem saldo hoje e geraram <b><Usd v={cli.markup_sem_saldo} /></b></small>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ quem mais gerou */}
      {d.top.length > 0 && (
        <div className="ngc-bloco">
          <h4>Quem mais gerou markup <small>com o jeito de operar, o resultado e a banca de cada um</small></h4>
          <ol className="ngc-top">
            {d.top.map((t, i) => (
              <li key={t.user_id}>
                <span className="ngc-pos">{i + 1}</span>
                <span className="ngc-av" aria-hidden="true">{t.foto_url ? <img src={t.foto_url} alt="" loading="lazy" /> : iniciais(t.nome)}</span>
                <span className="ngc-top-nome"><b>{t.nome || 'Cliente'}</b><small><SeloDoParceiro codigo={t.parceiro} nome={PARCEIRO[t.parceiro ?? '']} /> · {perfil(t.perfil)} · {int(t.operacoes)} op. em {int(t.dias)} {t.dias === 1 ? 'dia' : 'dias'}</small></span>
                <span className="ngc-top-fatia"><Fatia ia={Number(t.markup_ia)} manual={Number(t.markup_manual)} /></span>
                <span className="ngc-top-num" data-rot="Markup"><b><Usd v={t.markup} /></b></span>
                <span className={`ngc-top-num ${Number(t.resultado) >= 0 ? 'sobe' : 'cai'}`} data-rot="Resultado"><Usd v={Number(t.resultado)} formato={comSinal} /></span>
                <span className="ngc-top-num" data-rot="Banca hoje"><Usd v={t.saldo} /></span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ------------------------------------------------ as lives */}
      <div className="ngc-bloco ngc-lives">
        <div className="ngc-lives-cab">
          <h4>Lives: quais renderam mais <small>o markup em conta real durante cada transmissão</small></h4>
          {c.lives.length > 1 && (
            <div className="vgm-modo" role="group" aria-label="Ordem das lives">
              <button type="button" className={ordemLives === 'markup' ? 'ativo' : ''} aria-pressed={ordemLives === 'markup'} onClick={() => setOrdemLives('markup')}>Mais markup</button>
              <button type="button" className={ordemLives === 'hora' ? 'ativo' : ''} aria-pressed={ordemLives === 'hora'} onClick={() => setOrdemLives('hora')}>Por hora</button>
              <button type="button" className={ordemLives === 'recentes' ? 'ativo' : ''} aria-pressed={ordemLives === 'recentes'} onClick={() => setOrdemLives('recentes')}>Mais recentes</button>
            </div>
          )}
        </div>
        {c.lives.length === 0 ? (
          <p className="vg-vazio">Nenhuma live neste período. Cada transmissão iniciada em Administração › Transmissão ao vivo passa a aparecer aqui, com o markup que rendeu.</p>
        ) : <>
          <div className="ngc-lives-kpis">
            <div><span>Lives no período</span><b>{int(c.lives.length)}</b><small>{duracao(Number(d.lives_resumo.horas_live) * 60)} no ar</small></div>
            <div><span>Markup em live</span><b><Usd v={d.lives_resumo.markup_live} /></b><small>{pctTxt(div(Number(d.lives_resumo.markup_live), c.total) * 100)} do markup do período</small></div>
            <div><span>Por hora em live</span><b><Usd v={c.porHoraLive} /></b><small>Sem live: {usd(c.porHoraFora)} por hora</small></div>
            <div className={c.multLives != null && c.multLives >= 1.15 ? 'destaque' : ''}><span>Contra o mesmo horário sem live</span><b>{c.multLives != null ? vezes(c.multLives) : '—'}</b><small>O que as lives renderam a mais</small></div>
          </div>
          {melhorLive && Number(melhorLive.markup) > 0 && (
            <p className="ngc-frase menor">A live que mais rendeu foi a de <b>{quandoLive(melhorLive)}</b>: <b><Usd v={melhorLive.markup} /></b> em {duracao(melhorLive.min)}
              {melhorLive.mult != null && melhorLive.mult >= 1.15 ? <>, <b>{vezes(melhorLive.mult)}</b> o que aquele horário costuma render</> : null}.</p>
          )}
          <div className="ngc-tabela lives" role="table">
            <div className="ngc-linha cabeca" role="row">
              <span role="columnheader">Quando</span><span role="columnheader">Markup</span><span role="columnheader">Contra o típico</span>
              <span role="columnheader">Por hora</span><span role="columnheader">Operações</span><span role="columnheader">Pessoas operando</span>
              <span role="columnheader">Movimentado</span><span role="columnheader">Depósitos</span><span role="columnheader">Entraram</span>
            </div>
            {livesOrdenadas.map((l, i) => (
              <div key={l.inicio} className={`ngc-linha${ordemLives !== 'recentes' && i === 0 && Number(l.markup) > 0 ? ' melhor' : ''}`} role="row">
                <span className="ngc-nome" role="rowheader">{quandoLive(l)}
                  <small>{duracao(l.min)}{l.origem === 'lancamento' ? ' · live de lançamento' : l.origem === 'plataforma' ? ' · dentro da plataforma' : ''}{l.estimada ? ' · horário estimado' : ''}</small></span>
                <span role="cell" data-rot="Markup"><b>{Number(l.markup) > 0 ? <Usd v={l.markup} /> : '—'}</b>{Number(l.markup) > 0 && <Fatia ia={Number(l.markup_ia)} manual={Number(l.markup_manual)} />}</span>
                <span role="cell" data-rot="Contra o típico">{l.mult != null && Number(l.markup) > 0 ? <b className={l.mult >= 1.15 ? 'sobe' : ''}>{vezes(l.mult)}</b> : '—'}</span>
                <span role="cell" data-rot="Por hora">{Number(l.markup) > 0 ? <Usd v={l.porHora} /> : '—'}</span>
                <span role="cell" data-rot="Operações">{int(l.operacoes)}</span>
                <span role="cell" data-rot="Pessoas operando">{int(l.pessoas)}</span>
                <span role="cell" data-rot="Movimentado">{Number(l.volume) > 0 ? <Usd v={l.volume} /> : '—'}</span>
                <span role="cell" data-rot="Depósitos">{Number(l.depositos) > 0 ? <Usd v={l.depositos} /> : '—'}</span>
                <span role="cell" data-rot="Entraram">{l.entraram > 0 ? int(l.entraram) : '—'}</span>
              </div>
            ))}
          </div>
          <small className="ngc-leg">"Contra o típico" compara com o que o mesmo horário rende nos dias sem live. "Entraram" são as pessoas que clicaram no aviso da transmissão.
            {c.lives.some((l) => l.estimada) ? ' As lives com "≈" são de antes de o histórico existir: o horário foi reconstruído pelos cliques no aviso e é aproximado.' : ''}</small>
        </>}
      </div>

      <p className="ngc-pe">Só conta real · equipe fora · horário de Brasília · mesma contagem de markup do resto da tela{aoVivo ? ' · relido a cada 5 minutos' : ''}</p>
    </section>
  )
}
