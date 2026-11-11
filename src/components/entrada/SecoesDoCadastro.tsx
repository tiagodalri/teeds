/**
 * Seções do cadastro com planos (11/11/2026, reunião Tiago + Victor gravada):
 *  - "deixar o ao vivo mais evidente; está focando muito nas I.A., tem que falar da operação manual, das
 *    sessões ao vivo, das aulas (curso completo, as melhores estratégias) e da apostila";
 *  - "prints das aulas, a sensação de uma série da Netflix, com aulas profissionais";
 *  - "a animação da operação: use o layout real da plataforma" (CabineDeDemonstracao);
 *  - "o cartãozinho do plano mostra só a cor: quero o GF ali" (MiniCartao);
 *  - simulador: "o número aparece contando até mil quando a pessoa chega" e "a diferença no bolso em reais,
 *    com a cotação do dólar do dia".
 * As cores ficam no CSS da casca (cadastro-planos.css); aqui não há cor escrita.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buscarCotacoes, cotacoesGuardadas } from '../ferramentas/cambio'
import { capaDaAula, capaEspecial } from '../capasAulas'
import { porcentagem, type IdDoPlano, type PlanoDoCadastro } from '../../core/teeds/planosDoCadastro'
import { FAIXA, SESSOES, secoesComoFunciona, ligarComoFunciona } from '../../casca/globalfly/cadastro/comoFunciona'
import { ApostilaFolheando, CabineDaVitrine, TelaAoVivo, TelaManual } from './VitrinesAnimadas'
import { MODULOS } from '../../core/teeds/modulosAulas'

const brl = (n: number) => n.toLocaleString('pt-BR')
const reais = (n: number) => `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
const calma = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Mostra o elemento quando ele entra na tela (só para o que começa abaixo da dobra; sem script, tudo aparece). */
export function useRevelar(raiz: React.RefObject<HTMLElement>, dep?: unknown) {
  useEffect(() => {
    const el = raiz.current
    if (!el || calma() || !('IntersectionObserver' in window)) return
    const alvos = Array.from(el.querySelectorAll<HTMLElement>('.cpl-revela')).filter((a) => a.getBoundingClientRect().top > innerHeight)
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('cpl-visto'); io.unobserve(e.target) } }), { rootMargin: '0px 0px -8% 0px' })
    alvos.forEach((a, i) => { a.classList.add('cpl-oculto'); a.style.transitionDelay = `${(i % 4) * 80}ms`; io.observe(a) })
    return () => io.disconnect()
  }, [raiz, dep])
}

/** O cartão de membro em miniatura: degradê do plano, monograma GF e chip. */
export function MiniCartao({ id, grande }: { id: IdDoPlano; grande?: boolean }) {
  return (
    <span className={`cpl-mini cpl-mini-${id} ${grande ? 'cpl-mini-grande' : ''}`} aria-hidden="true">
      <i className="cpl-mini-mono" /><i className="cpl-mini-chip" />
    </span>
  )
}

/* ------------------------------------------------------------------ muito além das I.A. */
const AULAS_DA_VITRINE: Array<{ modulo: string; aulas: Array<[string, string]> }> = [
  { modulo: 'Comece aqui', aulas: [['introducao', 'Introdução à GlobalFly'], ['visao-geral', 'Conhecendo a plataforma'], ['conta-deriv', 'Abertura de conta'], ['primeiro-deposito', 'Como depositar?'], ['saldo-demo-real', 'Conta demo e conta real'], ['deriv-confiavel', 'A Deriv é confiável?']] },
  { modulo: 'Estratégias de I.A. na prática', aulas: [['o-que-sao-as-ias', 'O que são as I.A. de operações'], ['robo-raptor', 'A estratégia Raptor'], ['robo-gulf', 'A estratégia Gulf'], ['robo-falcon', 'A estratégia Falcon'], ['robo-legacy', 'A estratégia Legacy'], ['robo-phenom', 'A estratégia Phenom'], ['operando-na-pratica', 'Operando na prática']] },
  { modulo: 'Gerenciamento e emocional', aulas: [['gerenciamento', 'O que é gerenciamento de risco'], ['gestao-na-pratica', 'Gestão na prática'], ['day-trade', 'Day trade'], ['erros-de-iniciante', 'Erros de iniciante'], ['consistencia', 'Consistência'], ['ganhar-e-perder', 'Saber ganhar e perder']] },
]
const capa = (id: string) => (capaEspecial(id) ?? capaDaAula(id)).replace(/\.jpg$/, '-mobile.webp')

/** As aulas como numa plataforma de séries: uma fileira por módulo, capas profissionais, e a apostila. */
/** A descrição de cada aula, do mesmo cadastro de aulas da plataforma. */
const DESCRICAO: Record<string, string> = Object.fromEntries(MODULOS.flatMap((m) => m.aulas.map((a) => [a.id, a.descricao])))
type AulaAberta = { id: string; titulo: string; modulo: string; n: number; m: number }

/** A janela de uma aula: capa grande, o que ela ensina e o convite para criar a conta e assistir. */
function JanelaDaAula({ aula, aoFechar, aoQuerer }: { aula: AulaAberta; aoFechar: () => void; aoQuerer?: () => void }) {
  const fechar = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    fechar.current?.focus()
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    addEventListener('keydown', esc)
    const antes = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { removeEventListener('keydown', esc); document.body.style.overflow = antes }
  }, [aoFechar])
  return (
    <div className="cpl-janela" role="dialog" aria-modal="true" aria-label={aula.titulo} onClick={aoFechar}>
      <div className="cpl-janela-caixa" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cpl-janela-x" ref={fechar} onClick={aoFechar} aria-label="Fechar">×</button>
        <img src={capa(aula.id)} alt="" width="320" height="480" />
        <div className="cpl-janela-texto">
          <span className="cpl-olho">Módulo {aula.m} · Aula {aula.n}</span>
          <h3>{aula.titulo}</h3>
          <p className="cpl-janela-mod">{aula.modulo}</p>
          {DESCRICAO[aula.id] && <p>{DESCRICAO[aula.id]}</p>}
          <button type="button" className="cpl-btn cpl-btn-ouro" onClick={() => { aoFechar(); aoQuerer?.() }}>Criar minha conta e assistir <span className="cpl-seta" aria-hidden="true">→</span></button>
          <small>As aulas ficam dentro da plataforma, em todos os planos.</small>
        </div>
      </div>
    </div>
  )
}

function AulasEstiloSerie({ aoQuerer }: { aoQuerer?: () => void }) {
  const [aberta, setAberta] = useState<AulaAberta | null>(null)
  const fechar = useCallback(() => setAberta(null), [])
  return (
    <section className="cpl-aulas" id="cpl-aulas" aria-labelledby="cpl-t-aulas">
      <div className="cpl-cab-secao cpl-revela">
        <span className="cpl-olho">Curso completo dentro da plataforma</span>
        <h2 id="cpl-t-aulas">Aprenda do zero, como numa série</h2>
        <p>Aulas profissionais que ensinam como o mercado funciona, como cada I.A. opera e as estratégias de gerenciamento que fazem diferença no resultado. No seu ritmo, do celular ou do computador.</p>
      </div>
      {AULAS_DA_VITRINE.map((m, i) => (
        <div className="cpl-fileira cpl-revela" key={m.modulo}>
          <h3><span>Módulo {i + 1}</span>{m.modulo}</h3>
          <div className="cpl-fileira-rolo">
            {m.aulas.map(([id, titulo], j) => (
              <button type="button" className="cpl-poster" key={id} onClick={() => setAberta({ id, titulo, modulo: m.modulo, n: j + 1, m: i + 1 })} aria-label={`Ver a aula ${titulo}`}>
                <img src={capa(id)} alt="" width="320" height="480" loading="lazy" />
                <span className="cpl-poster-leg"><span>Aula {j + 1}</span>{titulo}</span>
                <i className="cpl-poster-play" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="cpl-apostila cpl-revela">
        <ApostilaFolheando />
        <div>
          <span className="cpl-olho">Apostila do aluno</span>
          <h3>Um guia para consultar sempre que precisar</h3>
          <p>Do primeiro acesso à sua primeira I.A. no ar: conta na corretora, a plataforma, as cinco I.A., gerenciamento, depósito e saque. Passo a passo, com as telas da plataforma.</p>
          <dl className="cpl-ap-numeros">
            <div><dt>46</dt><dd>páginas, do zero ao gerenciamento</dd></div>
            <div><dt>5</dt><dd>I.A. explicadas passo a passo</dd></div>
            <div><dt>PDF</dt><dd>para baixar dentro da plataforma</dd></div>
          </dl>
        </div>
      </div>
      {aberta && <JanelaDaAula aula={aberta} aoFechar={fechar} aoQuerer={aoQuerer} />}
    </section>
  )
}

/** "Muito além das I.A.": o que vem em todos os planos, com o ao vivo em destaque. */
function MuitoAlem() {
  return (
    <section className="cpl-alem" aria-labelledby="cpl-t-alem">
      <div className="cpl-cab-secao cpl-revela">
        <span className="cpl-olho">Em todos os planos</span>
        <h2 id="cpl-t-alem">Muito além das I.A.</h2>
        <p>Você não fica sozinho com uma estratégia automática. Tem sala ao vivo todos os dias, operação manual para quem gosta de decidir, curso completo e apostila.</p>
      </div>
      <div className="cpl-alem-grade">
        <article className="cpl-alem-card cpl-alem-live cpl-revela">
          <TelaAoVivo />
          <div><span className="cpl-alem-rot">Salas ao vivo</span><h3>Opere junto com a equipe, ao vivo, todos os dias</h3><p>Acompanhe as operações em tempo real, tire dúvidas e veja na prática como cada decisão é tomada.</p></div>
        </article>
        <article className="cpl-alem-card cpl-revela">
          <TelaManual />
          <div><span className="cpl-alem-rot">Operação manual</span><h3>Prefere decidir? Opere com as próprias mãos</h3><p>Gráfico ao vivo, Sobe ou Desce, e o resultado na hora. As I.A. e a operação manual na mesma conta.</p></div>
        </article>
        <a className="cpl-alem-card cpl-alem-aulas cpl-revela" href="#cpl-aulas">
          <div className="cpl-alem-posters" aria-hidden="true">
            {['robo-falcon', 'gerenciamento', 'introducao'].map((id) => <img key={id} src={capa(id)} alt="" width="320" height="480" loading="lazy" />)}
          </div>
          <div><span className="cpl-alem-rot">Aulas e apostila</span><h3>Um curso completo, do primeiro passo às melhores estratégias</h3><p>Aulas profissionais em módulos, para assistir no seu ritmo, e uma apostila para consultar sempre. <b>Ver as aulas →</b></p></div>
        </a>
      </div>
    </section>
  )
}

/** A cabine de verdade, com as abas das I.A. gravadas e o hangar. */
function CabineReal() {
  const b = import.meta.env.BASE_URL
  const [i, setI] = useState(0)
  const trocar = useCallback((n: number) => setI(n), [])
  const HANGAR = ['phenom', 'gulf', 'raptor', 'falcon', 'legacy']
  return (
    <section className="cpl-cabine-sec" aria-labelledby="cpl-t-cabine">
      <div className="cpl-cab-secao cpl-revela">
        <span className="cpl-olho">A cabine</span>
        <h2 id="cpl-t-cabine">Uma I.A. operando por você, em dólar</h2>
        <p>É a tela da plataforma, do jeito que você vai ver: você escolhe a I.A., a entrada, a meta e o limite de perda. Ela entra, sai, recupera e para sozinha quando bate a meta ou o limite.</p>
      </div>
      <div className="cpl-cabine-abas" role="tablist" aria-label="Escolha a sessão">
        {SESSOES.map((s, j) => (
          <button key={s.n} type="button" role="tab" aria-selected={j === i} onClick={() => setI(j)}>
            <img src={`${b}aulas-globalfly/robo-${s.f}-mobile.webp`} alt="" width="40" height="60" loading="lazy" />{s.n}
          </button>
        ))}
      </div>
      <div className="cpl-revela"><CabineDaVitrine escolhida={i} aoTrocar={trocar} /></div>
      <p className="cpl-cabine-nota">Reprise da sessão de {SESSOES[i].dia}, gravada na plataforma, operação por operação.</p>
      <div className="cpl-hangar" aria-label="As cinco I.A. da GlobalFly">
        {HANGAR.map((f) => {
          const j = SESSOES.findIndex((s) => s.f === f)
          return (
            <figure key={f} className={j === i ? 'cpl-on' : ''}>
              <img src={`${b}aulas-globalfly/robo-${f}-mobile.webp`} alt={`GF ${f[0].toUpperCase()}${f.slice(1)}`} width="640" height="960" loading="lazy" />
              {j >= 0 && <button type="button" onClick={() => setI(j)} aria-label={`Ver a sessão da GF ${f}`} />}
            </figure>
          )
        })}
      </div>
    </section>
  )
}

/** As seções da antiga /cadastro, com as novas no meio: o que é, muito além, aulas, por dentro, a cabine real e o que vem junto. */
export function ComoFunciona({ aoQuerer }: { aoQuerer?: () => void }) {
  const caixa = useRef<HTMLDivElement>(null)
  const base = import.meta.env.BASE_URL
  const partes = useMemo(() => {
    const h = secoesComoFunciona(base)
    const iReal = h.indexOf('<section class="lp-real"'), iCab = h.indexOf('<section class="lp-cabine-sec">'), iLib = h.indexOf('<section class="lp-libera-sec">')
    return { oque: h.slice(0, iReal), real: h.slice(iReal, iCab), libera: h.slice(iLib) }
  }, [base])
  useEffect(() => (caixa.current ? ligarComoFunciona(caixa.current, base) : undefined), [base])
  useRevelar(caixa)
  return (
    <div className="cpl-lp">
      <div dangerouslySetInnerHTML={{ __html: FAIXA }} />
      <div className="cpl-faixa">
        <div className="cpl-miolo cpl-lp-corpo" ref={caixa}>
          <div className="cpl-solto" dangerouslySetInnerHTML={{ __html: partes.oque }} />
          <MuitoAlem />
          <AulasEstiloSerie aoQuerer={aoQuerer} />
          <div className="cpl-solto" dangerouslySetInnerHTML={{ __html: partes.real }} />
          <CabineReal />
          <div className="cpl-solto" dangerouslySetInnerHTML={{ __html: partes.libera }} />
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ o simulador do compartilhamento */
const PADRAO = 1000
/** "Quanto do lucro fica com você": conta até US$ 1.000 quando chega na tela e mostra a diferença no bolso em reais. */
export function SimuladorDoLucro({ planos, aoMexer }: { planos: PlanoDoCadastro[]; aoMexer?: () => void }) {
  const [lucro, setLucro] = useState(0)
  const [mexeu, setMexeu] = useState(false)
  const [dolar, setDolar] = useState<number | null>(() => cotacoesGuardadas()?.emReais.USD ?? null)
  const caixa = useRef<HTMLDivElement>(null)
  const mexeuRef = useRef(false)
  useEffect(() => { let vivo = true; void buscarCotacoes().then((c) => { if (vivo) setDolar(c.emReais.USD) }).catch(() => { /* sem cotação: só não converte */ }); return () => { vivo = false } }, [])
  // a contagem: de 0 a 1.000 quando a seção entra na tela (uma vez; quem já mexeu não é atropelado)
  useEffect(() => {
    const el = caixa.current
    if (!el) return
    if (calma() || !('IntersectionObserver' in window)) { setLucro(PADRAO); return }
    let quadro = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now(), dur = 1600
      const passo = (t: number) => {
        const x = Math.min(1, (t - t0) / dur), suave = 1 - Math.pow(1 - x, 3)
        setLucro((atual) => (mexeuRef.current ? atual : Math.round((PADRAO * suave) / 10) * 10))
        if (x < 1 && !mexeuRef.current) quadro = requestAnimationFrame(passo)
      }
      quadro = requestAnimationFrame(passo)
    }, { threshold: 0.35 })
    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(quadro) }
  }, [])
  const gold = planos.find((p) => p.id === 'gold') ?? planos[0]
  return (
    <div className="cpl-conta" ref={caixa}>
      <div className="cpl-cx cpl-controle">
        <label htmlFor="cpl-lucro">Lucro do mês na conta real (exemplo)</label>
        <div className="cpl-lucro"><small>US$</small>{brl(lucro)}</div>
        <input type="range" id="cpl-lucro" min={0} max={5000} step={100} value={lucro}
          onChange={(e) => { mexeuRef.current = true; if (!mexeu) { setMexeu(true); aoMexer?.() } setLucro(+e.target.value) }}
          style={{ ['--p' as string]: `${(lucro / 5000) * 100}%` }} />
        <div className="cpl-marcas"><span>US$ 0</span><span>US$ 5.000</span></div>
        {dolar && <p className="cpl-dolar">Dólar hoje: <b>R$ {dolar.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></p>}
        <p className="cpl-aviso">Exemplo ilustrativo para comparar os planos. Não é previsão de resultado. Operar envolve risco de perda.</p>
      </div>
      <div className="cpl-cx cpl-barras">
        {planos.map((p) => {
          const fica = Math.round(lucro * (1 - p.compartilhamento))
          const aMais = lucro * (gold.compartilhamento - p.compartilhamento)
          return (
            <div key={p.id} className={`cpl-barra cpl-barra-${p.id}`}>
              <span className="cpl-barra-nome"><MiniCartao id={p.id} />{p.nome}</span>
              <div className="cpl-trilho"><div className="cpl-enche" style={{ width: `${lucro ? (1 - p.compartilhamento) * 100 : 0}%` }} /></div>
              <span className="cpl-val">US$ {brl(fica)}<small>{p.compartilhamento ? `compartilha ${porcentagem(p.compartilhamento)} · US$ ${brl(Math.round(lucro * p.compartilhamento))}` : 'fica tudo com você'}</small></span>
              {aMais > 0 && dolar ? <span className="cpl-bolso"><b>+{reais(aMais * dolar)}</b> no seu bolso <small>em relação ao Gold</small></span>
                : aMais > 0 ? <span className="cpl-bolso"><b>+US$ {brl(Math.round(aMais))}</b> no seu bolso <small>em relação ao Gold</small></span> : null}
            </div>
          )
        })}
        <p className="cpl-aviso">Quanto do lucro do mês fica com você em cada plano{dolar ? ', e a diferença em reais pela cotação de hoje' : ''}.</p>
      </div>
    </div>
  )
}
