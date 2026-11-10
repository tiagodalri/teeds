/**
 * A Visão geral da Administração (10/11/2026, Tiago: "estou achando esse dash da visão geral MUITO CRU...
 * temos métricas demais... markup, saldo em conta real de clientes, pessoas operando ao vivo em conta REAL e
 * só uma tag pequena com quantas em conta demo... as x pessoas que estão operando em conta real somam um total
 * de saldo de xxx... quero um dash foda, imersivo").
 *
 * Um cockpit, de cima para baixo:
 *  1. Agora: quantas pessoas estão operando em conta real neste momento e a banca que elas somam (o demo vai
 *     numa etiqueta pequena), quantas estão na plataforma e a fatia da banca dos clientes que está em operação.
 *  2. Dinheiro: a banca de todos os clientes em conta real (com as faixas), o markup (hoje, 7 e 30 dias, o
 *     ritmo do mês e os 30 dias em barras) e o que aconteceu hoje em conta real.
 *  3. Movimento: depósitos contra saques, o funil da base e as maiores bancas.
 * Uma leitura só no banco (teeds_painel_visao_geral, 38 ms), no escopo de cada admin, a cada 15 s.
 * O markup sai da contagem interna única (teeds_markup_dias, 10/11/2026), a mesma da aba Comissões:
 * cada contrato registrado, só conta real, dia de Brasília, equipe fora, parceiro do topo.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { SUPABASE } from '../../core/teeds/config'
import { dinheiro } from '../../core/dinheiro'
import { MARCA } from '../../marca'
import { haQuantoTempo } from '../../core/teeds/markupInterno'
import './visao-geral.css'

interface Painel {
  agora: { na_plataforma: number; operando_real: number; operando_demo: number; banca_operando_real: number; ias_real: number; ias_demo: number; manuais_real: number }
  banca: { total: number; clientes_com_saldo: number; contas_reais: number; maior: number; faixas: Array<{ rotulo: string; clientes: number; soma: number }>
    top: Array<{ user_id: string; nome: string | null; foto_url: string | null; parceiro: string | null; saldo: number; operando: boolean; online: boolean }> }
  markup: { hoje: number; d7: number; d30: number; mes: number; ultima_em?: string | null; serie: Array<{ dia: string; markup: number; operacoes: number }> }
  hoje: { operacoes: number; volume: number; resultado: number; operaram: number }
  funil: { cadastrados: number; ativos: number; conectaram: number; conta_real: number; com_saldo: number; operaram_real: number; ativos_24h: number }
  dinheiro: { depositos_7d: number; saques_7d: number; depositos_30d: number; saques_30d: number; depositantes_30d: number }
  alertas: { expirados: number; vencem_7d: number }
}

export async function lerPainel(sessao: SessaoTeeds, marca: string, parceiro: string): Promise<Painel> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_painel_visao_geral`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: marca, p_parceiro: parceiro || null }),
  })
  if (!r.ok) throw new Error('Não foi possível ler os números agora.')
  return r.json()
}

const usd = (v: number) => dinheiro(Number(v) || 0, 'USD')
const usdCurto = (v: number) => {
  const a = Math.abs(Number(v) || 0)
  if (a >= 10_000) return `US$ ${(a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return usd(a)
}
const comSinal = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${usd(Math.abs(v))}`
const int = (n: number) => (Number(n) || 0).toLocaleString('pt-BR')
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)
const pessoas = (n: number) => `${int(n)} ${n === 1 ? 'pessoa' : 'pessoas'}`
const iniciais = (nome: string | null) => (nome ?? '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase() || '?'
/** AAAA-MM-DD → dd/mm. */
const diaMes = (dia?: string) => (dia ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}` : '—')
const PARCEIRO: Record<string, string> = { n: 'Naor', v: 'Victor', d: 'Douglas' }

/** O número que sobe até o valor quando muda (a 1ª leitura e cada atualização). */
function Contador({ valor, formato }: { valor: number; formato: (v: number) => string }) {
  const [mostrado, setMostrado] = useState(valor)
  const de = useRef(valor)
  useEffect(() => {
    const ini = de.current, fim = Number(valor) || 0
    if (ini === fim || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setMostrado(fim); de.current = fim; return }
    let quadro = 0
    const t0 = performance.now(), dur = 900
    const passo = (t: number) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3)
      setMostrado(ini + (fim - ini) * e)
      if (k < 1) quadro = requestAnimationFrame(passo); else de.current = fim
    }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [valor])
  return <>{formato(mostrado)}</>
}

function haQuanto(ms: number, agora: number) {
  const s = Math.round((agora - ms) / 1000)
  return s < 10 ? 'agora' : s < 60 ? `há ${s} s` : `há ${Math.round(s / 60)} min`
}

export function VisaoGeralPainel({ sessao, marca, parceiro, aoIr }: {
  sessao: SessaoTeeds
  marca: string
  /** O parceiro em foco no topo ('' = todos, 'direto' = sem parceiro). */
  parceiro: string
  aoIr: (destino: 'monitoramento' | 'clientes' | 'comissoes' | 'movimentacoes' | 'inteligencia') => void
}) {
  const [p, setP] = useState<Painel | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [lidoEm, setLidoEm] = useState(0)
  const [agora, setAgora] = useState(Date.now())
  const [diaFoco, setDiaFoco] = useState<number | null>(null)
  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao

  useEffect(() => {
    let vivo = true
    let t = 0
    setP(null)
    const ler = () => {
      window.clearTimeout(t)
      void lerPainel(sessaoRef.current, marca, parceiro)
        .then((d) => { if (vivo) { setP(d); setErro(null); setLidoEm(Date.now()) } })
        .catch((e) => { if (vivo) setErro((e as Error).message) })
        .finally(() => { if (vivo) t = window.setTimeout(ler, document.visibilityState === 'hidden' ? 120_000 : 15_000) })
    }
    ler()
    return () => { vivo = false; window.clearTimeout(t) }
  }, [marca, parceiro])
  useEffect(() => { const t = window.setInterval(() => setAgora(Date.now()), 5000); return () => window.clearInterval(t) }, [])

  const ritmo = useMemo(() => {
    if (!p) return null
    const hoje = new Date(), dia = hoje.getDate(), dias = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()
    return dia > 0 ? (Number(p.markup.mes) / dia) * dias : null
  }, [p])

  if (!p) {
    return (
      <section className="vg vg-carregando" aria-busy="true">
        {erro ? <p className="vg-erro" role="alert">{erro}</p> : <><i /><i /><i /></>}
      </section>
    )
  }

  const a = p.agora
  const mesAtual = new Date().toLocaleDateString('pt-BR', { month: 'long' }).replace(/^./, (c) => c.toUpperCase())
  const emOperacaoPct = pct(Number(a.banca_operando_real), Number(p.banca.total))
  const serie = p.markup.serie
  const maxSerie = Math.max(...serie.map((d) => Number(d.markup)), 0.0001)
  const focoDia = diaFoco != null ? serie[diaFoco] : null
  const maxFaixa = Math.max(...p.banca.faixas.map((f) => f.clientes), 1)
  const entrou = Number(p.dinheiro.depositos_7d), saiu = Number(p.dinheiro.saques_7d), liquido = entrou - saiu
  const maxFluxo = Math.max(entrou, saiu, 1)
  const ia = MARCA.vocabularioIA ? 'I.A.' : 'robôs'
  const f = p.funil
  const etapas: Array<{ rotulo: string; n: number; dica: string }> = [
    { rotulo: 'Cadastrados', n: f.cadastrados, dica: 'Toda a base' },
    { rotulo: 'Com acesso', n: f.ativos, dica: 'Liberados para usar' },
    { rotulo: 'Ligaram a corretora', n: f.conectaram, dica: 'Conta demo ou real conectada' },
    { rotulo: 'Têm conta real', n: f.conta_real, dica: 'Conta real conectada' },
    { rotulo: 'Com saldo real', n: f.com_saldo, dica: 'Dinheiro na conta real' },
    { rotulo: 'Operaram em real', n: f.operaram_real, dica: 'Nos últimos 30 dias' },
  ]

  return (
    <section className="vg">
      {/* ------------------------------------------------ 1. agora */}
      <button type="button" className={`vg-agora${a.operando_real ? ' com-real' : ''}`} onClick={() => aoIr('monitoramento')} title="Abrir o Monitoramento ao vivo">
        <span className="vg-agora-grade" aria-hidden="true" />
        <div className="vg-agora-txt">
          <span className="vg-vivo"><i aria-hidden="true" />Ao vivo · {lidoEm ? `lido ${haQuanto(lidoEm, agora)}` : 'lendo'}</span>
          {a.operando_real > 0 ? (
            <h2><b><Contador valor={a.operando_real} formato={(v) => pessoas(Math.round(v))} /></b> operando em conta real agora,
              {' '}somando <em><Contador valor={Number(a.banca_operando_real)} formato={usd} /></em> de banca.</h2>
          ) : (
            <h2>Ninguém operando em conta real neste minuto. <span>Hoje, <b>{pessoas(p.hoje.operaram)}</b> já operaram em real.</span></h2>
          )}
          <div className="vg-etiquetas">
            <span className="vg-tag demo"><i aria-hidden="true" />{int(a.operando_demo)} em conta demo</span>
            <span className="vg-tag"><i aria-hidden="true" className="on" />{int(a.na_plataforma)} na plataforma agora</span>
            {a.operando_real > 0 && <span className="vg-tag">{int(a.ias_real)} {ia} em real · {int(a.manuais_real)} manuais</span>}
            <span className="vg-tag">{int(f.ativos_24h)} entraram nas últimas 24 h</span>
          </div>
        </div>
        <div className="vg-anel" aria-label={`${emOperacaoPct}% da banca dos clientes em operação agora`}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="50" className="vg-anel-fundo" />
            <circle cx="60" cy="60" r="50" className="vg-anel-valor" style={{ strokeDasharray: `${(emOperacaoPct / 100) * 314.16} 314.16` }} />
          </svg>
          <span><b><Contador valor={emOperacaoPct} formato={(v) => `${Math.round(v)}%`} /></b><small>da banca dos clientes em operação</small></span>
        </div>
        <span className="vg-ir" aria-hidden="true">Monitoramento ›</span>
      </button>

      {/* ------------------------------------------------ 2. dinheiro */}
      <div className="vg-trio">
        <button type="button" className="vg-card vg-banca" onClick={() => aoIr('clientes')}>
          <span className="vg-rot">Dinheiro dos clientes em conta real</span>
          <strong className="vg-grande"><Contador valor={Number(p.banca.total)} formato={usd} /></strong>
          <small>em <b>{pessoas(p.banca.clientes_com_saldo)}</b> com saldo · maior banca <b>{usd(p.banca.maior)}</b></small>
          <div className="vg-faixas" role="img" aria-label="Clientes por faixa de banca">
            {p.banca.faixas.map((x) => (
              <div key={x.rotulo} className="vg-faixa">
                <span>{x.rotulo}</span>
                <i><u style={{ width: `${(x.clientes / maxFaixa) * 100}%` }} /></i>
                <b>{int(x.clientes)}</b>
              </div>
            ))}
          </div>
        </button>

        <button type="button" className="vg-card vg-markup" onClick={() => aoIr('comissoes')}>
          <span className="vg-rot">Markup em conta real</span>
          <strong className="vg-grande ouro"><Contador valor={Number(p.markup.hoje)} formato={usd} /></strong>
          <small>hoje ({diaMes(serie[serie.length - 1]?.dia)}) · <b>{usd(p.markup.d7)}</b> em 7 dias · <b>{usd(p.markup.d30)}</b> em 30 dias ({diaMes(serie[0]?.dia)} a {diaMes(serie[serie.length - 1]?.dia)})</small>
          <div className="vg-barras" onMouseLeave={() => setDiaFoco(null)} role="img" aria-label="Markup de cada dia, últimos 30 dias">
            {serie.map((d, i) => (
              <span key={d.dia} className={i === serie.length - 1 ? 'hoje' : ''} onMouseEnter={() => setDiaFoco(i)}
                style={{ height: `${Math.max(Number(d.markup) > 0 ? 6 : 2, (Number(d.markup) / maxSerie) * 100)}%` }} />
            ))}
          </div>
          <small className="vg-barras-leg">{focoDia
            ? <>{new Date(`${focoDia.dia}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}: <b>{usd(focoDia.markup)}</b> · {int(focoDia.operacoes)} operações</>
            : <>{mesAtual} até hoje: <b>{usd(p.markup.mes)}</b> · ritmo do mês <b>{ritmo != null ? usd(ritmo) : '—'}</b></>}</small>
          <small className="vg-barras-leg">Horário de Brasília · I.A. e manual · última operação {p.markup.ultima_em ? haQuantoTempo(Date.parse(p.markup.ultima_em), agora) : '—'}</small>
        </button>

        <div className="vg-card vg-hoje">
          <span className="vg-rot">Hoje em conta real</span>
          <strong className="vg-grande"><Contador valor={p.hoje.operacoes} formato={(v) => int(Math.round(v))} /> <span>operações</span></strong>
          <dl>
            <div><dt>Movimentado</dt><dd>{usd(p.hoje.volume)}</dd></div>
            <div><dt>Pessoas que operaram</dt><dd>{int(p.hoje.operaram)}</dd></div>
            <div><dt>Resultado dos clientes</dt><dd className={Number(p.hoje.resultado) >= 0 ? 'sobe' : 'cai'}>{comSinal(Number(p.hoje.resultado))}</dd></div>
            <div><dt>Markup por operação</dt><dd>{p.hoje.operacoes ? usd(Number(p.markup.hoje) / p.hoje.operacoes) : '—'}</dd></div>
          </dl>
        </div>
      </div>

      {/* ------------------------------------------------ 3. movimento */}
      <div className="vg-duo">
        <button type="button" className="vg-card vg-fluxo" onClick={() => aoIr('movimentacoes')}>
          <span className="vg-rot">Dinheiro entrando · 7 dias</span>
          <strong className={`vg-grande ${liquido >= 0 ? 'sobe' : 'cai'}`}><Contador valor={liquido} formato={comSinal} /></strong>
          <small>líquido nas contas reais · <b>{pessoas(p.dinheiro.depositantes_30d)}</b> depositaram em 30 dias</small>
          <div className="vg-fluxo-barras">
            <div><span>Depósitos</span><i><u className="sobe" style={{ width: `${(entrou / maxFluxo) * 100}%` }} /></i><b>{usd(entrou)}</b></div>
            <div><span>Saques</span><i><u className="cai" style={{ width: `${(saiu / maxFluxo) * 100}%` }} /></i><b>{usd(saiu)}</b></div>
          </div>
          <small className="vg-pe">30 dias: {usd(p.dinheiro.depositos_30d)} entraram · {usd(p.dinheiro.saques_30d)} saíram</small>
          <div className="vg-mini">
            <div><span>Depósito médio · 30 dias</span><b>{p.dinheiro.depositantes_30d ? usd(Number(p.dinheiro.depositos_30d) / p.dinheiro.depositantes_30d) : '—'}</b><small>por pessoa que depositou</small></div>
            <div><span>Banca média</span><b>{p.banca.clientes_com_saldo ? usd(Number(p.banca.total) / p.banca.clientes_com_saldo) : '—'}</b><small>de quem tem saldo real</small></div>
          </div>
        </button>

        <div className="vg-card vg-top">
          <span className="vg-rot">Maiores bancas em conta real</span>
          {p.banca.top.length ? (
            <ol>
              {p.banca.top.map((c, i) => (
                <li key={c.user_id}>
                  <span className="vg-pos">{i + 1}</span>
                  <span className={`vg-av${c.online ? ' online' : ''}`} aria-hidden="true">{c.foto_url ? <img src={c.foto_url} alt="" loading="lazy" /> : iniciais(c.nome)}</span>
                  <span className="vg-top-nome"><b>{c.nome || 'Cliente'}</b><small>{c.parceiro ? PARCEIRO[c.parceiro] ?? `/${c.parceiro}` : 'Direto'}{c.operando ? ' · operando agora' : c.online ? ' · online' : ''}</small></span>
                  <strong>{usdCurto(c.saldo)}</strong>
                </li>
              ))}
            </ol>
          ) : <p className="vg-vazio">Nenhum cliente com saldo em conta real ainda.</p>}
        </div>
      </div>

      <div className="vg-card vg-funil">
        <div className="vg-funil-cab">
          <span className="vg-rot">Da base ao dinheiro operando</span>
          {(p.alertas.expirados > 0 || p.alertas.vencem_7d > 0) && (
            <button type="button" className="vg-alerta" onClick={() => aoIr('clientes')}>{int(p.alertas.expirados)} expirados · {int(p.alertas.vencem_7d)} vencem em 7 dias</button>
          )}
        </div>
        <ol className="vg-etapas">
          {etapas.map((e, i) => (
            <li key={e.rotulo} style={{ ['--larg' as string]: `${Math.max(4, pct(e.n, f.cadastrados || 1))}%` }}>
              <span className="vg-etapa-n"><Contador valor={e.n} formato={(v) => int(Math.round(v))} /></span>
              <span className="vg-etapa-rot">{e.rotulo}<small>{e.dica}</small></span>
              <i className="vg-etapa-barra" aria-hidden="true"><u /></i>
              {i > 0 && <em className="vg-etapa-pct">{pct(e.n, etapas[i - 1].n)}% da etapa anterior</em>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
