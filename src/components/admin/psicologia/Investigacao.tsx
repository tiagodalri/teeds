/**
 * Central investigativa da Psicologia (28/11/2026, Tiago: "valor médio de depósito, tempo de vida útil, giro,
 * markup, estratégias, redepósito, fatores em comum de quem depositou mais de uma vez ou valores maiores e de
 * quem mais gerou markup... uma central investigativa"). Lê teeds_psicologia_investigacao.
 * Cada dossiê compara um grupo com o resto dos depositantes e ordena os fatores pela diferença.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../../core/teeds/conta'
import { lerInvestigacao, type GrupoDaInvestigacao, type Investigacao as Dados } from '../../../core/teeds/psicologia'
import { decimal, inteiro, pc, pct, tempoCurto, usd } from './sacadas'

type Dossie = 'redeposito' | 'deposito_alto' | 'top_markup'
const DOSSIES: Array<{ id: Dossie; nome: string; quem: (d: Dados) => string; resto: string }> = [
  { id: 'redeposito', nome: 'Quem deposita de novo', quem: () => 'Depositaram duas vezes ou mais', resto: 'Depositaram uma vez só' },
  { id: 'deposito_alto', nome: 'Quem deposita alto', quem: (d) => `Os 20% que mais depositaram (${usd(d.cortes.deposito_alto)} ou mais)`, resto: 'Os outros depositantes' },
  { id: 'top_markup', nome: 'Quem mais gera markup', quem: (d) => `Os 20% que mais geraram markup (${usd(d.cortes.top_markup, 2)} ou mais)`, resto: 'Os outros que operaram' },
]

function Fatores({ g }: { g: GrupoDaInvestigacao }) {
  const lista = useMemo(() => (g.fatores ?? [])
    .filter((f) => f.g_n >= 10 && f.r_n >= 10 && f.g_sim + f.r_sim >= 8)
    .map((f) => ({ ...f, a: pct(f.g_sim, f.g_n), b: pct(f.r_sim, f.r_n) }))
    .map((f) => ({ ...f, dif: f.a - f.b }))
    .sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif)), [g])
  const [tudo, setTudo] = useState(false)
  const mostra = tudo ? lista : lista.slice(0, 8)
  if (!lista.length) return <p className="psi-vazio">Ainda não há alunos suficientes neste grupo para comparar.</p>
  return (
    <div className="psi-fatores">
      {mostra.map((f) => (
        <div className={`psi-fator${f.dif < 0 ? ' menos' : ''}`} key={f.fator}>
          <span><b>{f.fator}</b><small>{inteiro(f.g_sim)} de {inteiro(f.g_n)} no grupo · {inteiro(f.r_sim)} de {inteiro(f.r_n)} no resto</small></span>
          <div className="psi-fator-barras" role="img" aria-label={`No grupo ${Math.round(f.a)}%, no resto ${Math.round(f.b)}%`}>
            <i className="g"><u style={{ width: `${Math.max(1.5, f.a)}%` }} /></i><i className="r"><u style={{ width: `${Math.max(1.5, f.b)}%` }} /></i>
          </div>
          <strong>{Math.round(f.a)}%<small>contra {Math.round(f.b)}%</small></strong>
          <em>{f.dif >= 0 ? '+' : '−'}{Math.abs(Math.round(f.dif))} pontos</em>
        </div>
      ))}
      {lista.length > 8 && <button type="button" className="psi-mais" onClick={() => setTudo((v) => !v)}>{tudo ? 'Mostrar só os mais fortes' : `Ver os ${lista.length} fatores`}</button>}
    </div>
  )
}

export function Investigacao({ sessao, marca, parceiro, pedido }: { sessao: SessaoTeeds; marca: string; parceiro: string; pedido: number }) {
  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao
  const [d, setD] = useState<Dados | null>(null)
  const [falhou, setFalhou] = useState(false)
  const [dossie, setDossie] = useState<Dossie>('redeposito')
  useEffect(() => {
    let vivo = true
    setFalhou(false)
    lerInvestigacao(sessaoRef.current, marca, parceiro).then((x) => { if (vivo) setD(x) }).catch(() => { if (vivo) setFalhou(true) })
    return () => { vivo = false }
  }, [marca, parceiro, pedido])

  if (falhou && !d) return null
  if (!d) return <section className="psi-secao" id="psi-investigacao"><div className="psi-esqueleto baixo" /></section>
  const n = d.numeros
  if (!n || !n.depositantes) return null
  const rd = d.redeposito, cc = d.concentracao
  const sv = (d.sobrevivencia ?? []).filter((s) => s.base >= 20)
  const est = (d.estrategias ?? []).filter((e) => e.operacoes >= 50)
  const maxMk = Math.max(1, ...est.map((e) => e.markup ?? 0))
  const g = d.grupos?.[dossie]
  const info = DOSSIES.find((x) => x.id === dossie)!
  const tiles: Array<{ r: string; v: string; s: string }> = [
    { r: 'Depósito médio', v: usd(n.deposito_medio, 2), s: `${inteiro(n.depositos)} depósitos de ${inteiro(n.depositantes)} alunos` },
    { r: 'Por depositante', v: usd(n.por_depositante_medio, 2), s: `Metade deposita até ${usd(n.por_depositante_mediano, 2)} no total` },
    { r: 'Depositam de novo', v: pc(n.redepositaram, n.depositantes), s: `${decimal(n.depositos_por_pessoa)} depósitos por pessoa, em média` },
    { r: 'Giro do dinheiro', v: `${decimal(n.giro)}×`, s: `${usd(n.volume)} operados sobre ${usd(n.depositado)} depositados` },
    { r: 'Markup por depositante', v: usd(n.markup_por_depositante, 2), s: `${decimal(n.markup_sobre_deposito)}% do que é depositado vira markup` },
    { r: 'Markup por dia de operação', v: usd(n.markup_por_dia_ativo, 2), s: `${decimal(n.markup_sobre_volume)}% de cada dólar operado` },
    { r: 'Vida útil do aluno', v: n.vida_mediana_dias != null ? tempoCurto(n.vida_mediana_dias * 1440) : '–', s: `Da 1ª à última operação. Operam em ${decimal(n.dias_operando_mediana ?? 0)} dias diferentes` },
    { r: 'Quem parou durou', v: n.vida_de_quem_parou != null ? tempoCurto(Math.max(n.vida_de_quem_parou, 0.02) * 1440) : '–', s: `${inteiro(n.pararam)} pararam há mais de 7 dias; deixaram ${usd(n.markup_de_quem_parou, 2)} de markup cada` },
  ]

  return (
    <section className="psi-secao" id="psi-investigacao">
      <header><span className="psi-rot">Central investigativa</span><h3>O dinheiro e quem faz ele girar</h3>
        <p>Quanto entra, quanto gira, quanto fica e por quanto tempo. Depois, o que têm em comum os alunos que mais importam.</p></header>

      <div className="psi-tiles">
        {tiles.map((t) => <article key={t.r}><small>{t.r}</small><strong>{t.v}</strong><span>{t.s}</span></article>)}
      </div>

      <div className="psi-dupla">
        {sv.length >= 2 && (
          <div className="psi-bloco">
            <h4>Quantos continuam operando <small>depois de N dias da primeira operação em conta real</small></h4>
            <div className="psi-sobrev">
              {sv.map((s) => (
                <div key={s.dias}><b>{pc(s.seguem, s.base)}</b><i><u style={{ height: `${pct(s.seguem, s.base)}%` }} /></i><span>{s.dias === 1 ? '1 dia' : `${s.dias} dias`}</span><small>{inteiro(s.seguem)} de {inteiro(s.base)}</small></div>
              ))}
            </div>
            <p className="psi-pe">Só entra na conta quem já teve tempo de chegar àquele dia. {sv.length ? <>Depois de {sv[sv.length - 1].dias} dias, <b>{pc(sv[sv.length - 1].seguem, sv[sv.length - 1].base)}</b> seguem operando.</> : null}</p>
          </div>
        )}
        <div className="psi-bloco">
          <h4>O segundo depósito <small>{inteiro(rd.total)} depósitos feitos depois do primeiro</small></h4>
          <div className="psi-mini">
            <span><small>Tempo entre um depósito e o seguinte</small><b>{rd.h_entre_depositos != null ? tempoCurto(rd.h_entre_depositos * 60) : '–'}</b></span>
            <span><small>Feitos em até 1 hora do anterior</small><b>{pc(rd.em_1h, rd.total)}</b></span>
            <span><small>Feitos em até 24 horas</small><b>{pc(rd.em_24h, rd.total)}</b></span>
            <span><small>Valor típico do 1º, do 2º e dos seguintes</small><b>{usd(rd.valor_1 ?? 0, 2)} · {usd(rd.valor_2 ?? 0, 2)} · {usd(rd.valor_3mais ?? 0, 2)}</b></span>
          </div>
          <p className="psi-pe">No 2º depósito, <b>{inteiro(rd.segundo_maior)}</b> colocaram mais do que no 1º, <b>{inteiro(rd.segundo_menor)}</b> colocaram menos e {inteiro(rd.segundo_igual)} repetiram o valor.</p>
          {cc.geradores >= 20 && <p className="psi-pe">Concentração: os <b>10 alunos</b> que mais geram markup respondem por <b>{decimal(cc.top10)}%</b> dele; os 20% do topo, por <b>{decimal(cc.top20pct)}%</b>.</p>}
        </div>
      </div>

      {est.length > 0 && (
        <div className="psi-bloco">
          <h4>Estratégia por estratégia <small>conta real, desde o começo</small></h4>
          <div className="psi-estrategias">
            {est.map((e) => (
              <div key={e.nome}>
                <span><b>{e.nome}</b><small>{inteiro(e.alunos)} alunos · {inteiro(e.operacoes)} operações · {pc(e.ganhas, e.operacoes)} de acerto</small></span>
                <i><u style={{ width: `${Math.max(1.5, ((e.markup ?? 0) / maxMk) * 100)}%` }} /></i>
                <strong>{usd(e.markup ?? 0)}<small>de markup</small></strong>
                <em>{usd(e.volume)} operados · resultado dos alunos <b className={e.resultado < 0 ? 'psi-neg' : 'psi-pos'}>{usd(e.resultado)}</b></em>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="psi-bloco psi-dossie">
        <h4>O que eles têm em comum <small>cada grupo contra o resto, do fator mais diferente para o menos</small></h4>
        <div className="psi-chips" role="group" aria-label="Grupo investigado">
          {DOSSIES.map((x) => <button type="button" key={x.id} aria-pressed={dossie === x.id} onClick={() => setDossie(x.id)}>{x.nome}</button>)}
        </div>
        {g?.dentro && g?.fora ? (
          <>
            <div className="psi-versus">
              <article className="g"><small>{info.quem(d)}</small><strong>{inteiro(g.dentro.n)} alunos</strong>
                <span>{usd(g.dentro.markup_total)} de markup · {usd(g.dentro.dep_total)} depositados</span>
                <em>Típico: {decimal(g.dentro.aulas ?? 0)} aulas concluídas · 1º depósito de {usd(g.dentro.dep1 ?? 0, 2)} · {decimal(g.dentro.dias_ate_dep ?? 0)} dias até depositar · opera em {decimal(g.dentro.dias_operando ?? 0)} dias</em></article>
              <article><small>{info.resto}</small><strong>{inteiro(g.fora.n)} alunos</strong>
                <span>{usd(g.fora.markup_total)} de markup · {usd(g.fora.dep_total)} depositados</span>
                <em>Típico: {decimal(g.fora.aulas ?? 0)} aulas concluídas · 1º depósito de {usd(g.fora.dep1 ?? 0, 2)} · {decimal(g.fora.dias_ate_dep ?? 0)} dias até depositar · opera em {decimal(g.fora.dias_operando ?? 0)} dias</em></article>
            </div>
            <div className="psi-legenda"><span><i className="forte" />No grupo</span><span><i className="f" />No resto</span></div>
            <Fatores g={g} />
            <p className="psi-pe">Fator em comum não é causa: mostra o que aparece junto. Grupos pequenos mudam bastante de uma semana para a outra.</p>
          </>
        ) : <p className="psi-vazio">Ainda não há alunos suficientes para este dossiê.</p>}
      </div>
    </section>
  )
}
