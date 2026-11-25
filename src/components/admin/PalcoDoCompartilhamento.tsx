import { useEffect, useMemo, useRef, useState } from 'react'
import type { Linha, Painel } from './CompartilhamentoDeReceita'
import type { AjusteSimulado } from '../../core/teeds/compartilhamentoSimulado'
import { useMenuAdminOculto } from '../../core/menuDeAdmin'
import { AjusteDoPalcoSimulado } from './AjusteDoPalcoSimulado'
import './palco-compartilhamento.css'
import { GF_NOME } from '../../marca'

/**
 * Palco do Compartilhamento de receita (16/11/2026, Tiago: "painel interativo pra eu mostrar o lucro dos
 * clientes e tudo mais... imersivo"). Fica no topo da tela, sempre escuro (azul GF + ouro), com:
 *  - o lucro somado dos clientes no mês (contador animado) e o que isso dá em reais;
 *  - o anel de quantos clientes fecharam no lucro e os números de apoio;
 *  - o pódio dos maiores lucros + a lista até o 10º;
 *  - o mapa de resultados de TODOS os clientes (barra acima do zero = lucro, abaixo = prejuízo), com foco
 *    por passar o mouse ou tocar;
 *  - o lucro por plano e o quanto cada plano compartilha;
 *  - Tela cheia e Ocultar nomes (para mostrar em live ou reunião sem expor o cliente).
 * Prefixo CSS cpo-. Os números saem do mesmo painel da tabela embaixo (nada novo no banco).
 */

const CHAVE_OCULTAR = 'gf.compartilhamento.ocultar'
const CHAVE_AJUSTE_ABERTO = 'gf.compartilhamento.simulado.aberto'
const PLANOS = ['gold', 'black', 'prestige'] as const
const NOME_PLANO: Record<string, string> = { gold: 'Gold', black: 'Black', prestige: 'Prestige', silver: 'Silver' }
const nomePlano = (s: string) => NOME_PLANO[s] ?? (s ? s[0].toUpperCase() + s.slice(1) : '—')
const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dolares = (v: number, casas = 2) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`
const comSinal = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${dolares(Math.abs(v))}`
const inteiro = (n: number) => n.toLocaleString('pt-BR')
const planoDa = (l: Linha) => l.fatura?.subplano ?? l.subplano

/** "Marcos Vinícius Andrade" → "Marcos A." quando os nomes estão ocultos. */
function nomeDe(l: Linha, ocultar: boolean) {
  const n = (l.nome || l.email || 'Cliente').trim()
  if (!ocultar) return n
  const p = n.split(/\s+/).filter(Boolean)
  if (n.includes('@')) return `${n[0].toUpperCase()}•••`
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0].toUpperCase()}.` : `${p[0]}`
}
const inicial = (l: Linha) => (l.nome || l.email || '?')[0].toUpperCase()

/** Conta do valor anterior até o novo em ~0,9 s (sem animação para quem pediu menos movimento). */
function useContador(alvo: number, ms = 900) {
  const [v, setV] = useState(0)
  const de = useRef(0)
  useEffect(() => {
    const calmo = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (calmo) { de.current = alvo; setV(alvo); return }
    const inicio = performance.now(), origem = de.current
    let q = 0
    const passo = (t: number) => {
      const k = Math.min(1, (t - inicio) / ms), e = 1 - Math.pow(1 - k, 3)
      const atual = origem + (alvo - origem) * e
      de.current = atual; setV(atual)
      if (k < 1) q = requestAnimationFrame(passo)
    }
    q = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(q)
  }, [alvo, ms])
  return v
}

export function PalcoDoCompartilhamento({ painel, linhas, cotacao, nomeMes, receber, cobrar, onVer, onFicha, simulacao, planilha }: {
  painel: Painel; linhas: Linha[]; cotacao: number; nomeMes: string
  /** o "A receber" do mês (mesma conta do cartão de baixo) */
  receber: number; cobrar: number
  /** abre a conta/fatura do cliente (só quando há valor a compartilhar ou fatura) */
  onVer: (l: Linha) => void
  onFicha?: (userId: string) => void
  /** modo simulado ligado (só admin): os termômetros que regulam a base simulada */
  simulacao?: { ajuste: AjusteSimulado; mudar: (a: AjusteSimulado) => void; recorte?: string }
  /** Baixar planilha Excel (18/11/2026); estado = 'Montando…' ou a mensagem de erro */
  planilha?: { baixar: () => void; estado: string | null }
}) {
  const palco = useRef<HTMLElement>(null)
  const adminOculto = useMenuAdminOculto()
  // os termômetros abrem sozinhos na 1ª vez; depois ficam como o admin deixou
  const [ajusteAberto, setAjusteAberto] = useState(() => { try { return localStorage.getItem(CHAVE_AJUSTE_ABERTO) !== '0' } catch { return true } })
  useEffect(() => { try { localStorage.setItem(CHAVE_AJUSTE_ABERTO, ajusteAberto ? '1' : '0') } catch { /* opcional */ } }, [ajusteAberto])
  const mostrarAjuste = !!simulacao && !adminOculto
  const [ocultar, setOcultar] = useState(() => { try { return localStorage.getItem(CHAVE_OCULTAR) === '1' } catch { return false } })
  const [cheia, setCheia] = useState(false)
  const [foco, setFoco] = useState<string | null>(null)
  useEffect(() => { try { localStorage.setItem(CHAVE_OCULTAR, ocultar ? '1' : '0') } catch { /* opcional */ } }, [ocultar])
  useEffect(() => {
    const f = () => setCheia(document.fullscreenElement === palco.current)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])
  const alternarTela = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.()
    else void palco.current?.requestFullscreen?.().catch(() => setCheia((c) => !c))
  }
  // reserva para navegador sem Fullscreen API (iPhone): ocupa a janela por CSS
  useEffect(() => {
    if (!cheia || document.fullscreenElement) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setCheia(false) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [cheia])

  const n = useMemo(() => {
    const ord = [...linhas].sort((a, b) => b.resultado - a.resultado)
    const lucro = ord.filter((l) => l.resultado > 0), perda = ord.filter((l) => l.resultado < 0)
    const soma = (l: Linha[], f: (x: Linha) => number) => l.reduce((s, x) => s + f(x), 0)
    const ops = soma(linhas, (l) => l.operacoes), ganhas = soma(linhas, (l) => l.ganhas)
    const planos = PLANOS.map((p) => {
      const daqui = linhas.filter((l) => planoDa(l) === p), noLucro = daqui.filter((l) => l.resultado > 0)
      return { p, total: daqui.length, noLucro: noLucro.length, lucro: soma(noLucro, (l) => l.resultado), compartilha: soma(noLucro, (l) => l.fatura?.valor_usd ?? l.valor_usd), pct: painel.percentuais[p] ?? 0 }
    })
    return {
      ord, lucro, perda, ops, ganhas,
      lucroUsd: soma(lucro, (l) => l.resultado), perdaUsd: soma(perda, (l) => l.resultado), liquido: soma(linhas, (l) => l.resultado),
      // a régua das barrinhas do ranking é o maior LUCRO (com o maior prejuízo, de US$ 900, os lucros viravam um ponto)
      maior: Math.max(0.01, ...lucro.map((l) => l.resultado)), planos,
      maiorPlano: Math.max(1, ...planos.map((p) => p.lucro)),
    }
  }, [linhas, painel.percentuais])

  const lucroAnimado = useContador(n.lucroUsd)
  const receberAnimado = useContador(receber)
  const fatia = linhas.length ? n.lucro.length / linhas.length : 0
  const fatiaAnimada = useContador(fatia * 100, 1100)
  const focado = foco ? linhas.find((l) => l.user_id === foco) ?? null : null
  const podeVer = (l: Linha) => !!(l.fatura || l.cancelada || l.valor_usd > 0)
  const abrir = (l: Linha) => { if (podeVer(l)) onVer(l); else onFicha?.(l.user_id) }

  // escala do mapa (16/11/2026, 2ª versão): com a base real (197 clientes, lucros de até US$ 25 e prejuízos de até
  // US$ 900) a régua reta achatava os lucros numa linha invisível. A altura agora segue a raiz do valor, a mesma
  // régua dos dois lados do zero: a ordem e o sinal ficam exatos, e o valor de cada um aparece ao passar o mouse.
  const raiz = (v: number) => Math.sqrt(Math.abs(v))
  const maxPos = Math.max(0, ...n.ord.map((l) => (l.resultado > 0 ? raiz(l.resultado) : 0)))
  const maxNeg = Math.max(0, ...n.ord.map((l) => (l.resultado < 0 ? raiz(l.resultado) : 0)))
  const faixa = Math.max(0.0001, maxPos + maxNeg)
  const zero = maxPos / faixa
  // muitos clientes: as colunas dividem a largura (sem largura mínima, para nunca passar do cartão)
  const vaoMapa = n.ord.length > 160 ? 0 : n.ord.length > 60 ? 1 : 2
  const historico = painel.meses.filter((m) => m.faturas > 0).slice(0, 6).reverse()
  const maiorMes = Math.max(1, ...historico.map((m) => m.valor_brl))
  const R = 54, C = 2 * Math.PI * R

  if (!linhas.length) return null
  return <section ref={palco} className={`cpo ${cheia ? 'cheia' : ''}`} aria-label={`Resultado dos clientes em ${nomeMes}`}>
    <div className="cpo-brilho" aria-hidden />
    <header className="cpo-topo">
      <div>
        <span className="cpo-rot"><i className={painel.fechado ? '' : 'vivo'} />{painel.fechado ? `${nomeMes} fechado` : `${nomeMes} · ao vivo`}</span>
        <h2>O resultado dos clientes {GF_NOME}</h2>
      </div>
      <div className="cpo-controles">
        {planilha && <button type="button" className="cpo-planilha" onClick={planilha.baixar} disabled={!!planilha.estado?.endsWith('…')} title="Baixar a planilha Excel do mês">
          <svg viewBox="0 0 24 24" aria-hidden><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="m9.5 12.5 5 5M14.5 12.5l-5 5" /></svg>
          {planilha.estado?.endsWith('…') ? 'Montando…' : 'Baixar planilha'}</button>}
        {mostrarAjuste && <button type="button" className={`cpo-sim-botao ${ajusteAberto ? 'on' : ''}`} aria-pressed={ajusteAberto} aria-expanded={ajusteAberto}
          onClick={() => setAjusteAberto((a) => !a)} title="Regular os números da simulação">
          <svg viewBox="0 0 24 24" aria-hidden><path d="M9 3h6M10 3v5.5L4.8 18a2 2 0 0 0 1.8 3h10.8a2 2 0 0 0 1.8-3L14 8.5V3" /><path d="M7.5 14h9" /></svg>
          {ajusteAberto ? 'Fechar ajuste' : 'Ajustar simulação'}</button>}
        <button type="button" className={ocultar ? 'on' : ''} aria-pressed={ocultar} onClick={() => setOcultar((o) => !o)}>
          <svg viewBox="0 0 24 24" aria-hidden>{ocultar
            ? <><path d="M3 3l18 18" /><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3.2 4.3M6.6 6.6C4.4 8 2.8 10.1 2 12c1 2.5 5 7 10 7a9.6 9.6 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>
            : <><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12Z" /><circle cx="12" cy="12" r="3" /></>}</svg>
          {ocultar ? 'Nomes ocultos' : 'Ocultar nomes'}</button>
        <button type="button" onClick={alternarTela} aria-pressed={cheia}>
          <svg viewBox="0 0 24 24" aria-hidden>{cheia
            ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
            : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}</svg>
          {cheia ? 'Sair da tela cheia' : 'Tela cheia'}</button>
      </div>
    </header>
    {planilha?.estado && !planilha.estado.endsWith('…') && <p className="cpo-aviso" role="alert">{planilha.estado}</p>}

    {mostrarAjuste && ajusteAberto && <AjusteDoPalcoSimulado ajuste={simulacao!.ajuste} mudar={simulacao!.mudar} recorte={simulacao!.recorte ?? 'Todos os parceiros'}
      resumo={{ depositoMedio: linhas.length ? linhas.reduce((t, l) => t + (l.deposito_inicial ?? 0), 0) / linhas.length : 0, lucro: n.lucroUsd, receber }} />}

    <div className="cpo-heroi">
      <div className="cpo-numero">
        <span>Lucro dos clientes no mês</span>
        <strong>{dolares(lucroAnimado)}</strong>
        <small>{cotacao ? <>≈ <b>{reais(lucroAnimado * cotacao)}</b> no bolso de {inteiro(n.lucro.length)} {n.lucro.length === 1 ? 'cliente' : 'clientes'}</> : `${inteiro(n.lucro.length)} clientes no lucro`}</small>
      </div>
      <div className="cpo-anel" role="img" aria-label={`${Math.round(fatia * 100)}% dos clientes no lucro`}>
        <svg viewBox="0 0 132 132">
          <circle cx="66" cy="66" r={R} className="trilho" />
          <circle cx="66" cy="66" r={R} className="valor" strokeDasharray={`${C * fatiaAnimada / 100} ${C}`} />
        </svg>
        <div><b>{Math.round(fatiaAnimada)}%</b><small>no lucro</small></div>
      </div>
      <p className="cpo-anel-txt"><b>{inteiro(n.lucro.length)} de {inteiro(linhas.length)}</b> clientes {painel.fechado ? 'fecharam o mês no lucro' : 'estão no lucro neste mês'}</p>
      <dl className="cpo-apoio">
        <div><dt>Clientes em conta real</dt><dd>{inteiro(linhas.length)}<small>{inteiro(n.lucro.length)} no lucro · {inteiro(n.perda.length)} no prejuízo</small></dd></div>
        <div><dt>Operações no mês</dt><dd>{inteiro(n.ops)}<small>{n.ops ? `${Math.round(n.ganhas / n.ops * 100)}% ganhas` : '—'}</small></dd></div>
        <div><dt>Resultado somado</dt><dd className={n.liquido >= 0 ? 'cpo-pos' : 'cpo-neg'}>{comSinal(n.liquido)}<small>Lucros menos prejuízos</small></dd></div>
        <div className="ouro"><dt>{painel.fechado ? 'Compartilhamento a receber' : 'Compartilhamento previsto'}</dt><dd>{reais(receberAnimado)}<small>{inteiro(cobrar)} {cobrar === 1 ? 'cliente paga' : 'clientes pagam'} · só quem lucrou</small></dd></div>
      </dl>
    </div>

    <div className="cpo-grade">
      <article className="cpo-bloco cpo-podio-bloco">
        <header><h3>Maiores lucros</h3><small>{nomeMes}</small></header>
        <ol className="cpo-podio">
          {[1, 0, 2].map((i) => {
            const l = n.lucro[i]
            if (!l) return <li key={i} className={`lugar-${i + 1} vazio`} />
            return <li key={l.user_id} className={`lugar-${i + 1}`}>
              <button type="button" onClick={() => abrir(l)} title={podeVer(l) ? 'Ver a conta do cliente' : 'Abrir a ficha do cliente'}>
                <span className="cpo-avatar">{l.foto_url && !ocultar ? <img src={l.foto_url} alt="" loading="lazy" /> : inicial(l)}<em>{i + 1}º</em></span>
                <b>{nomeDe(l, ocultar)}</b>
                <strong>{comSinal(l.resultado)}</strong>
                <i className={`cpo-selo ${planoDa(l)}`}>{nomePlano(planoDa(l))}</i>
              </button>
              <div className="cpo-degrau" aria-hidden>{i + 1}</div>
            </li>
          })}
        </ol>
        {n.lucro.length > 3 && <ol className="cpo-ranking" start={4}>
          {n.lucro.slice(3, 10).map((l, i) => <li key={l.user_id}>
            <button type="button" onClick={() => abrir(l)} onMouseEnter={() => setFoco(l.user_id)}>
              <span className="cpo-lugar">{i + 4}º</span>
              <b>{nomeDe(l, ocultar)}</b>
              <span className="barra"><i style={{ width: `${Math.max(3, l.resultado / n.maior * 100)}%` }} /></span>
              <strong>{comSinal(l.resultado)}</strong>
            </button>
          </li>)}
        </ol>}
      </article>

      <article className="cpo-bloco cpo-mapa-bloco">
        <header><h3>Todos os clientes, do maior lucro ao maior prejuízo</h3><small>Passe o mouse ou toque numa barra para ver o valor</small></header>
        <div className={`cpo-mapa${vaoMapa < 2 ? ' densa' : ''}`} style={{ ['--zero' as string]: `${zero * 100}%`, ['--n' as string]: String(Math.max(1, n.ord.length)), ['--vao' as string]: `${vaoMapa}px` }}>
          <span className="cpo-zero" aria-hidden><i>US$ 0</i></span>
          {n.ord.map((l, i) => {
            const alt = raiz(l.resultado) / faixa * 100
            return <button key={l.user_id} type="button" className={`cpo-col ${l.resultado >= 0 ? 'sobe' : 'desce'} ${foco === l.user_id ? 'foco' : ''}`}
              style={{ ['--alt' as string]: `${Math.max(alt, 0.6)}%`, ['--atraso' as string]: `${Math.min(i * 12, 700)}ms` }}
              aria-label={`${nomeDe(l, ocultar)}: ${comSinal(l.resultado)}`}
              onMouseEnter={() => setFoco(l.user_id)} onFocus={() => setFoco(l.user_id)} onClick={() => setFoco(l.user_id)}><i /></button>
          })}
        </div>
        <div className={`cpo-focado ${focado ? '' : 'vazio'}`} aria-live="polite">
          {focado ? <>
            <span className="cpo-avatar mini">{focado.foto_url && !ocultar ? <img src={focado.foto_url} alt="" /> : inicial(focado)}</span>
            <span className="quem"><b>{nomeDe(focado, ocultar)}</b><small>{nomePlano(planoDa(focado))} · {inteiro(focado.operacoes)} operações{focado.operacoes ? ` · ${Math.round(focado.ganhas / focado.operacoes * 100)}% ganhas` : ''}</small></span>
            <strong className={focado.resultado >= 0 ? 'cpo-pos' : 'cpo-neg'}>{comSinal(focado.resultado)}</strong>
            <button type="button" onClick={() => abrir(focado)}>{podeVer(focado) ? 'Ver a conta' : 'Abrir ficha'}</button>
          </> : <>
            <span className="legenda"><i className="sobe" />Lucro <b>{comSinal(n.lucroUsd)}</b></span>
            <span className="legenda"><i className="desce" />Prejuízo <b>{comSinal(n.perdaUsd)}</b></span>
          </>}
        </div>
      </article>

      <article className="cpo-bloco cpo-planos-bloco">
        <header><h3>Lucro por plano</h3><small>Quanto cada plano compartilha</small></header>
        <ul className="cpo-planos">
          {n.planos.map((p) => <li key={p.p}>
            <i className={`cpo-selo ${p.p}`}>{nomePlano(p.p)}</i>
            <span className="txt"><b>{dolares(p.lucro)}</b><small>{inteiro(p.noLucro)} de {inteiro(p.total)} no lucro</small></span>
            <span className="barra" aria-hidden><i className={p.p} style={{ width: `${p.lucro / n.maiorPlano * 100}%` }}><em style={{ width: `${p.pct * 100}%` }} /></i></span>
            <span className="comp">{p.pct > 0 ? <><b>{dolares(p.compartilha)}</b><small>{Math.round(p.pct * 100)}% do lucro</small></> : <><b>Isento</b><small>Não compartilha</small></>}</span>
          </li>)}
        </ul>
        <p className="cpo-nota"><i aria-hidden /> A parte escura de cada barra é o compartilhamento; o resto fica com o cliente.</p>
        {historico.length > 1 && <div className="cpo-historico">
          <h4>Faturado por mês</h4>
          <div className="cols">{historico.map((m) => <div key={m.mes} title={`${reais(m.valor_brl)} faturado · ${reais(m.recebido_brl)} recebido`}>
            <span className="col" style={{ height: `${Math.max(4, m.valor_brl / maiorMes * 100)}%` }}><i style={{ height: `${m.valor_brl ? m.recebido_brl / m.valor_brl * 100 : 0}%` }} /></span>
            <small>{new Date(`${m.mes.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '')}</small>
          </div>)}</div>
          <p className="cpo-nota"><i className="rec" aria-hidden /> Recebido <i className="fat" aria-hidden /> Faturado</p>
        </div>}
      </article>
    </div>
  </section>
}
