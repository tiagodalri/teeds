/**
 * Estúdio da simulação (12/11/2026, Tiago: "quando eu preencher os parâmetros — I.A., modo, quantidade
 * de operações, resultado, maior sequência de perda, % de acerto, tempo médio — antes de dar o play eu
 * quero ver um preview exatamente com o mesmo layout da operação real, para conferir. Painel imersivo,
 * intuitivo, fácil de entender, objetivo").
 *
 * Tela cheia: os parâmetros à esquerda; à direita a cabine de verdade (CabineDaSessao) parada no
 * momento escolhido da linha do tempo, ou a tabela das operações. Embaixo, o que vai acontecer contra o
 * que foi pedido e o play. Tudo é calculado com as contas do motor (core/teeds/sessaoSimulada.ts).
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MARCA } from '../../marca'
import { dinheiro, dinheiroComSinal } from '../../core/dinheiro'
import { NomeDoRobo } from '../NomeDoRobo'
import { useCatalogoCompleto } from '../../core/teeds/catalogoRobos'
import { NOME_DO_MODO, temModos } from '../../core/deriv/strategies'
import {
  definirRegrasDaSessao, ensaioAte, estrategiaDa, IAS_DA_SESSAO, nomeDaIa, parametrosDa, previaDoRoteiro, roteirosProntos,
  sugerirTrecho, tempoDaSessao, digitosQueGanham, escadaDoRoteiro, pagamentoPorDolar,
  type Fim, type Momento, type PontoDePartida, type Roteiro, type Trecho,
} from '../../core/teeds/sessaoSimulada'
import { CabineDaSessao } from './CabineDaSessao'
import { pontoDePartida } from './PalcoDaSessao'
import '../relatorios/relatorios.css'
import './sessao-simulada.css'
import './estudio.css'

const IA = MARCA.vocabularioIA ? 'I.A.' : 'robô'
const usd = (x: number) => dinheiro(x, 'USD')
const SALDOS = [10, 20, 50, 100, 500, 2000]
const MOMENTOS: Array<{ id: Momento; nome: string }> = [{ id: 'comeco', nome: 'Começo' }, { id: 'meio', nome: 'Meio' }, { id: 'fim', nome: 'Fim' }]
const FINS: Array<{ id: Fim; nome: string; sub: string }> = [
  { id: 'meta', nome: 'Bate a meta', sub: 'Para sozinha no ganho' },
  { id: 'stop', nome: 'Bate o stop', sub: 'Para sozinha no limite' },
  { id: 'desligou', nome: 'Desligada', sub: 'A pessoa para antes' },
]
const duracaoEmTexto = (s: number) => s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`
const ler = (t: string) => {
  const limpo = t.trim().replace(/\s|US\$|\$|%/g, '')
  if (!limpo) return null
  const x = Number(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo)
  return Number.isFinite(x) ? x : null
}
const mostrar = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? '' : String(x).replace('.', ','))

/** O ícone laranja do topo da aba das I.A. no modo simulado (abre o estúdio direto). */
export function BotaoSessaoSimulada({ ativo, aoAbrir }: { ativo: boolean; aoAbrir: () => void }) {
  return (
    <button type="button" className={`rsim-abrir ssim-abrir ${ativo ? 'on' : ''}`} onClick={aoAbrir}
      aria-label={ativo ? 'Editar a sessão no estúdio' : 'Abrir o estúdio da simulação'} title={ativo ? 'Editar a sessão no estúdio' : 'Abrir o estúdio da simulação'}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16" /><path d="M10 8.5v7l5.5-3.5z" /></svg>
    </button>
  )
}

/* ------------------------------------------------------------- campos */

function Campo({ rotulo, dica, children, aviso }: { rotulo: ReactNode; dica?: ReactNode; children: ReactNode; aviso?: ReactNode }) {
  return (
    <div className="est-campo">
      <span className="est-rotulo">{rotulo}</span>
      {children}
      {aviso}
      {dica && <small className="est-dica">{dica}</small>}
    </div>
  )
}

/** Número com − e +; o texto só vira número quando é um número (o "0," no meio da digitação não estraga nada). */
function Numero({ id, valor, aoMudar, passo = 1, min = 0, max = 1e7, prefixo, sufixo, vazio, largo = false }: {
  id: string; valor: number | null; aoMudar: (x: number | null) => void; passo?: number; min?: number; max?: number
  prefixo?: string; sufixo?: string; vazio?: string; largo?: boolean
}) {
  const [texto, setTexto] = useState(mostrar(valor))
  useEffect(() => { if (ler(texto) !== valor) setTexto(mostrar(valor)) }, [valor]) // eslint-disable-line react-hooks/exhaustive-deps
  const limitar = (x: number) => Math.min(max, Math.max(min, Math.round(x * 100) / 100))
  return (
    <div className={`est-numero ${largo ? 'largo' : ''}`}>
      <button type="button" aria-label="Diminuir" onClick={() => aoMudar(limitar((valor ?? min) - passo))}>−</button>
      <label>
        {prefixo && <em>{prefixo}</em>}
        <input id={id} inputMode="decimal" value={texto} placeholder={vazio} onChange={(e) => {
          setTexto(e.target.value)
          const x = ler(e.target.value)
          if (x !== null) aoMudar(limitar(x))
          else if (vazio !== undefined && !e.target.value.trim()) aoMudar(null)
        }} onBlur={() => setTexto(mostrar(valor))} />
        {sufixo && <em>{sufixo}</em>}
      </label>
      <button type="button" aria-label="Aumentar" onClick={() => aoMudar(limitar((valor ?? min) + passo))}>+</button>
    </div>
  )
}

function Segmentos<T extends string>({ valor, opcoes, aoMudar, rotulo }: { valor: T; opcoes: Array<{ id: T; nome: ReactNode; sub?: string }>; aoMudar: (v: T) => void; rotulo: string }) {
  return (
    <div className={`est-seg ${opcoes.some((o) => o.sub) ? 'com-sub' : ''}`} role="radiogroup" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={valor === o.id} className={valor === o.id ? 'on' : ''} onClick={() => aoMudar(o.id)}>
          <b>{o.nome}</b>{o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  )
}

/* ============================================================ estúdio */

type Dif = ReturnType<typeof previaDoRoteiro>['diferencas'][number]

export function EstudioDaSessao({ inicial, aoDarPlay, aoFechar }: { inicial: Roteiro; aoDarPlay: (r: Roteiro) => void; aoFechar: () => void }) {
  const versao = definirRegrasDaSessao(useCatalogoCompleto())
  const [r, setR] = useState<Roteiro>(inicial)
  const [aba, setAba] = useState<'cabine' | 'operacoes'>('cabine')
  const [opVista, setOpVista] = useState<number | null>(null)
  const [partida, setPartida] = useState<PontoDePartida>({ preco: 61234.5678, casas: 4 })
  const t0 = useRef(Math.floor(Date.now() / 1000) * 1000)
  useEffect(() => { let vivo = true; void pontoDePartida().then((p) => { if (vivo) setPartida(p) }); return () => { vivo = false } }, [])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', esc)
    document.body.classList.add('rel-painel-aberto', 'est-aberto')
    return () => { window.removeEventListener('keydown', esc); document.body.classList.remove('rel-painel-aberto', 'est-aberto') }
  }, [aoFechar])

  /*
    Os números "naturais": operações, sequência e resultado que a I.A. faria sozinha até o fim pedido
    (a sessão inteira fica guardada, então o play repete exatamente a prévia). Mudar a I.A., a conta,
    a estratégia, os limites, o fim ou o acerto refaz os naturais; mexer num número à mão vira pedido
    e o gerador fecha com ele (o que não der aparece com o "Usar").
  */
  const naturalizar = (x: Roteiro, aPartir = 0, semente = x.semente): Roteiro => {
    let atual: Roteiro = { ...x, fita: undefined }
    for (let k = aPartir; k < atual.trechos.length; k++) {
      const sug = sugerirTrecho(atual, k, atual.trechos[k].fim, semente)
      if (!sug) continue
      atual = { ...atual, trechos: atual.trechos.map((t, i) => (i === k ? { ...t, ...sug, resultado: t.fim === 'desligou' ? sug.resultado : t.resultado } : t)) }
    }
    return atual
  }
  const mudar = (p: Partial<Roteiro>) => setR((x) => naturalizar({ ...x, ...p }))
  const mudarTrecho = (k: number, p: Partial<Trecho>, refazer: boolean) => setR((x) => {
    const y = { ...x, fita: undefined, trechos: x.trechos.map((t, i) => (i === k ? { ...t, ...p } : t)) }
    return refazer ? naturalizar(y, k) : y
  })
  const sortear = () => setR((x) => naturalizar({ ...x, semente: x.semente + 1 }, 0, x.semente + 1))

  const rd = useDeferredValue(r)
  const previa = useMemo(() => previaDoRoteiro(rd), [rd, versao]) // eslint-disable-line react-hooks/exhaustive-deps
  const tempo = useMemo(() => tempoDaSessao(rd, previa.resultados, partida), [rd, previa, partida])
  const natural = useMemo(() => (rd.ritmo ? tempoDaSessao({ ...rd, ritmo: null }, previa.resultados, partida) : tempo), [rd, previa, partida, tempo])
  const escada = useMemo(() => escadaDoRoteiro(rd, 7).filter((v) => v > 0), [rd.ia, rd.entrada, rd.modo, rd.lossVirtual, versao]) // eslint-disable-line react-hooks/exhaustive-deps
  const ops = previa.corrida.ops
  const total = ops.length
  const n = Math.min(opVista ?? total, total)
  const foto = useMemo(() => {
    const e = ensaioAte(rd, previa.resultados, partida, t0.current, n)
    return { estado: e.foto(), trecho: e.trecho }
  }, [rd, previa, partida, n])
  useEffect(() => { setOpVista(null) }, [previa])

  const est = estrategiaDa(r.ia)
  const params = parametrosDa(r.ia)
  const comModos = temModos(r.ia, params)
  const lvPadrao = params.entrada.lossVirtual ?? 0
  const lvEfetivo = r.lossVirtual ?? lvPadrao
  const ganha = digitosQueGanham(est.contractType, est.barreira)
  const pagaPct = Math.round((pagamentoPorDolar(est.contractType, est.barreira) - 1) * 100)
  const difs = previa.diferencas
  const difDe = (k: number, campo: Dif['campo']) => difs.find((d) => d.trecho === k && d.campo === campo)
  const fimDe = (k: number) => previa.corrida.trechos[k]
  const prontos = useMemo(roteirosProntos, [])
  const temDepois = r.trechos.length > 1
  const conferido = difs.length === 0 && !previa.corrida.naoReligou && total > 0
  const ganhas = ops.filter((o) => o.ganhou).length
  const opSel = n > 0 ? ops[n - 1] : null

  const trocarResultado = (i: number) => {
    const fita = r.trechos.map((_, k) => ops.map((o, j) => ({ o, j })).filter(({ o }) => o.trecho === k).map(({ o, j }) => (j === i ? !o.ganhou : o.ganhou)))
    setR((x) => ({ ...x, fita }))
  }
  const play = () => aoDarPlay({ ...r, fita: r.fita ?? previa.resultados })

  const avisoDe = (d?: Dif) => d && (
    <div className="est-aviso" role="status">
      <span>Pedido {d.pedido} · <b>vai sair {d.saiu}</b></span>
      {d.usar && <button type="button" onClick={() => mudarTrecho(d.trecho, d.usar!, false)}>Usar {d.saiu}</button>}
    </div>
  )

  const camposDoTrecho = (k: number) => {
    const t = r.trechos[k]
    const fim = fimDe(k)
    return (
      <>
        <div className="est-duas">
          <Campo rotulo={k ? 'Nova meta de ganho' : 'Meta de ganho'} dica={k ? 'Da sessão inteira, contando o que já foi feito.' : '0 = sem meta'}>
            <Numero id={`est-meta-${k}`} valor={t.meta} prefixo="US$" passo={1} aoMudar={(x) => mudarTrecho(k, { meta: x ?? 0 }, true)} />
          </Campo>
          <Campo rotulo={k ? 'Novo limite de perda' : 'Limite de perda'} dica={k ? 'Da sessão inteira.' : '0 = sem limite'}>
            <Numero id={`est-stop-${k}`} valor={t.stop} prefixo="US$" passo={1} aoMudar={(x) => mudarTrecho(k, { stop: x ?? 0 }, true)} />
          </Campo>
        </div>
        <Campo rotulo="Como a sessão termina" aviso={difDe(k, 'fim') && <div className="est-aviso" role="status"><span>{difDe(k, 'fim')!.saiu}</span></div>}>
          <Segmentos rotulo="Como termina" valor={t.fim} opcoes={FINS} aoMudar={(fim) => mudarTrecho(k, { fim }, true)} />
        </Campo>
        {t.fim === 'desligou' && (
          <Campo rotulo="Resultado quando desliga" dica={t.resultado < 0 ? 'No negativo, a pessoa desliga no meio de uma sequência de perdas, antes de a recuperação fechar.' : 'O resultado da sessão no momento em que a pessoa desliga.'} aviso={avisoDe(difDe(k, 'resultado'))}>
            <div className="est-sinal">
              <Segmentos rotulo="Ganho ou perda" valor={t.resultado < 0 ? 'perda' : 'ganho'} opcoes={[{ id: 'ganho', nome: 'Ganho' }, { id: 'perda', nome: 'Perda' }]}
                aoMudar={(v) => mudarTrecho(k, { resultado: v === 'perda' ? -Math.abs(t.resultado || 1) : Math.abs(t.resultado) }, false)} />
              <Numero id={`est-res-${k}`} valor={Math.abs(t.resultado)} prefixo="US$" passo={0.5} aoMudar={(x) => mudarTrecho(k, { resultado: t.resultado < 0 ? -(x ?? 0) : x ?? 0 }, false)} />
            </div>
          </Campo>
        )}
        <div className="est-duas">
          <Campo rotulo="Operações" aviso={avisoDe(difDe(k, 'operacoes'))}>
            <Numero id={`est-ops-${k}`} valor={t.operacoes} min={1} max={3000} aoMudar={(x) => mudarTrecho(k, { operacoes: Math.round(x ?? 1) }, false)} />
          </Campo>
          <Campo rotulo="% de acerto" dica={t.acerto === null || t.acerto === undefined ? `Livre: a ${IA} acerta ${fim ? Math.round((ops.filter((o) => o.trecho === k && o.ganhou).length / Math.max(1, fim.operacoes)) * 100) : 0}%` : 'Operações ganhas sobre o total.'} aviso={avisoDe(difDe(k, 'acerto'))}>
            <Numero id={`est-acerto-${k}`} valor={t.acerto ?? null} vazio="Livre" sufixo={t.acerto === null || t.acerto === undefined ? undefined : '%'} min={0} max={100} passo={5}
              aoMudar={(x) => mudarTrecho(k, { acerto: x === null ? null : Math.round(x) }, true)} />
          </Campo>
        </div>
        <Campo rotulo={t.fim === 'stop' ? 'Maior sequência de perdas (a que leva ao stop costuma ser ela)' : 'Maior sequência de perdas'} aviso={avisoDe(difDe(k, 'sequencia'))}>
          <div className="est-sinal">
            <Numero id={`est-seq-${k}`} valor={t.sequencia} max={38} aoMudar={(x) => mudarTrecho(k, { sequencia: Math.round(x ?? 0) }, false)} />
            {t.fim !== 'stop' && <Segmentos rotulo="Quando veio" valor={t.momento} opcoes={MOMENTOS} aoMudar={(momento) => mudarTrecho(k, { momento }, false)} />}
          </div>
        </Campo>
      </>
    )
  }

  return (
    <div className="est ssim-raiz" role="dialog" aria-modal="true" aria-label="Estúdio da simulação">
      <header className="est-topo">
        <div className="est-marca"><i aria-hidden="true" /><div><b>Estúdio da simulação</b><small>Configure, confira a prévia e dê o play</small></div></div>
        <div className="est-ias" role="radiogroup" aria-label={`Qual ${IA}`}>
          {IAS_DA_SESSAO.map((id) => (
            <button key={id} type="button" role="radio" aria-checked={r.ia === id} className={r.ia === id ? 'on' : ''} onClick={() => mudar({ ia: id, modo: 'conservador', lossVirtual: null, ritmo: null })}>
              <NomeDoRobo nome={nomeDaIa(id)} id={id} />
            </button>
          ))}
        </div>
        <div className="est-topo-acoes">
          <select className="est-prontos" aria-label="Começar de um cenário pronto" value="" onChange={(e) => {
            const m = prontos.find((x) => x.id === e.target.value)
            if (m) setR(naturalizar({ ...m.roteiro, id: r.id, saldo: r.saldo, conta: r.conta }))
          }}>
            <option value="">Cenários prontos…</option>
            {prontos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
          <button type="button" className="est-fechar" onClick={aoFechar} aria-label="Fechar o estúdio">×</button>
        </div>
      </header>

      <div className="est-corpo">
        <aside className="est-painel" aria-label="Parâmetros">
          <section className="est-bloco">
            <h3><span>1</span>Conta</h3>
            <Campo rotulo="Saldo antes do play">
              <div className="est-chips">
                {SALDOS.map((v) => <button key={v} type="button" className={r.saldo === v ? 'on' : ''} onClick={() => mudar({ saldo: v })}>US$ {v.toLocaleString('pt-BR')}</button>)}
              </div>
              <Numero id="est-saldo" valor={r.saldo} prefixo="US$" passo={10} largo aoMudar={(x) => mudar({ saldo: x ?? 0 })} />
            </Campo>
            <Campo rotulo="A conta aparece como">
              <Segmentos rotulo="Conta" valor={r.conta} opcoes={[{ id: 'real', nome: 'Real' }, { id: 'demo', nome: 'Demo' }]} aoMudar={(conta) => setR((x) => ({ ...x, conta }))} />
            </Campo>
          </section>

          <section className="est-bloco">
            <h3><span>2</span>Estratégia da <NomeDoRobo nome={nomeDaIa(r.ia)} id={r.ia} emTexto /></h3>
            <p className="est-sobre">{r.ia === 'goreme' ? 'Ganha de 0 a 8 (paga ~6%) e recupera nos dígitos 7, 8 e 9.' : `Ganha com ${ganha.length >= 6 ? `${ganha[0]} a ${ganha[ganha.length - 1]}` : ganha.join(', ')} · paga cerca de ${pagaPct}%.`} {lvEfetivo > 0 ? `Entra depois de ${lvEfetivo} dígitos que teriam perdido.` : 'Entra direto, uma operação atrás da outra.'}</p>
            {comModos && (
              <Campo rotulo="Modo da recuperação">
                <Segmentos rotulo="Modo" valor={r.modo ?? 'conservador'} opcoes={[{ id: 'conservador', nome: NOME_DO_MODO.conservador }, { id: 'agressivo', nome: NOME_DO_MODO.agressivo }]} aoMudar={(modo) => mudar({ modo })} />
              </Campo>
            )}
            <div className="est-duas">
              <Campo rotulo="Entrada">
                <Numero id="est-entrada" valor={r.entrada} prefixo="US$" passo={0.05} min={0.35} max={10000} aoMudar={(x) => mudar({ entrada: Math.max(0.35, x ?? 0.35) })} />
              </Campo>
              <Campo rotulo="Valor máximo por entrada" dica="Vazio = sem máximo">
                <Numero id="est-max" valor={r.valorMaximo || null} vazio="—" prefixo={r.valorMaximo ? 'US$' : undefined} passo={1} aoMudar={(x) => mudar({ valorMaximo: x ?? 0 })} />
              </Campo>
            </div>
            {est.lossVirtualAjustavel && (
              <Campo rotulo="Loss virtual" dica="Dígitos seguidos que teriam perdido antes de entrar. 0 = entra direto.">
                <select className="est-select" value={r.lossVirtual ?? ''} onChange={(e) => mudar({ lossVirtual: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">Padrão do painel ({lvPadrao})</option>
                  {Array.from({ length: 13 }, (_, i) => <option key={i} value={i}>{i === 0 ? 'Sem loss virtual' : `${i} ${i === 1 ? 'dígito' : 'dígitos'}`}</option>)}
                </select>
              </Campo>
            )}
            <div className="est-escada" aria-label="Escada de recuperação">
              {escada.map((v, k) => <span key={k}><small>{k === 0 ? 'Entrada' : `R${k}`}</small><b>{usd(v)}</b></span>)}
            </div>
          </section>

          <section className="est-bloco">
            <h3><span>3</span>Resultado da sessão</h3>
            {camposDoTrecho(0)}
            <Campo rotulo="Tempo médio por operação" dica={lvEfetivo > 0
              ? `Natural: cerca de ${Math.round(natural.porOperacao)} s, com o mercado de verdade. Definido, a análise da ${IA} confirma a entrada nesse compasso (o preço anda de 2 em 2 s, como o ativo).`
              : `A ${nomeDaIa(r.ia)} entra direto: cada operação leva cerca de 4 s (2 ticks do ativo). Para outro ritmo, ligue o loss virtual.`}>
              {lvEfetivo > 0 ? (
                <div className="est-sinal">
                  <Segmentos rotulo="Ritmo" valor={r.ritmo ? 'definir' : 'natural'} opcoes={[{ id: 'natural', nome: 'Natural' }, { id: 'definir', nome: 'Definir' }]}
                    aoMudar={(v) => setR((x) => ({ ...x, ritmo: v === 'natural' ? null : Math.max(6, Math.round(natural.porOperacao)) }))} />
                  {r.ritmo ? <Numero id="est-ritmo" valor={r.ritmo} sufixo="s" min={5} max={600} aoMudar={(x) => setR((y) => ({ ...y, ritmo: Math.max(5, Math.round(x ?? 5)) }))} /> : <span className="est-fixo">≈ {Math.round(natural.porOperacao)} s</span>}
                </div>
              ) : <span className="est-fixo">≈ 4 s por operação</span>}
            </Campo>
            <button type="button" className="est-natural" onClick={sortear}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v6h6M20 20v-6h-6" /><path d="M20 10a8 8 0 0 0-14.3-4.3L4 8m16 8-1.7 2.3A8 8 0 0 1 4 14" /></svg>
              Sortear outra sessão natural
            </button>
          </section>

          <section className="est-bloco">
            <h3><span>4</span>Depois que parar</h3>
            <Segmentos rotulo="Depois" valor={temDepois ? 'religou' : 'parou'} opcoes={[{ id: 'parou', nome: 'Respeitou e parou', sub: 'A sessão termina aí' }, { id: 'religou', nome: 'Religou', sub: 'Mudou o limite e continuou' }]}
              aoMudar={(v) => setR((x) => v === 'parou' ? { ...x, fita: undefined, trechos: x.trechos.slice(0, 1) } : x.trechos.length > 1 ? x : naturalizar({
                ...x, trechos: [x.trechos[0], { meta: Math.round(Math.max(x.trechos[0].meta, 10) * 3), stop: x.trechos[0].stop || 50, fim: 'stop', resultado: 0, operacoes: 40, sequencia: 9, momento: 'fim', acerto: null }],
              }, 1))} />
            {temDepois && camposDoTrecho(1)}
            {previa.corrida.naoReligou && <div className="est-aviso" role="status"><span>{previa.corrida.naoReligou}</span></div>}
          </section>
        </aside>

        <main className="est-previa" aria-label="Prévia">
          <div className="est-previa-topo">
            <div>
              <b>Prévia</b>
              <small>{aba === 'cabine' ? 'Exatamente como vai aparecer na tela, no momento escolhido abaixo' : 'Cada operação, na ordem em que vai acontecer'}</small>
            </div>
            <Segmentos rotulo="Ver" valor={aba} opcoes={[{ id: 'cabine', nome: 'Cabine' }, { id: 'operacoes', nome: 'Operações' }]} aoMudar={setAba} />
          </div>

          <div className="est-linha">
            <div className="est-linha-topo">
              <span>{n === 0 ? 'Antes da 1ª operação' : n === total ? `Fim · ${total} operações` : `Depois da operação ${n} de ${total}`}</span>
              {opSel && (
                <span className={`est-op ${opSel.ganhou ? 'g' : 'p'}`}>
                  Op. {n}: entrada {usd(opSel.valor)}{opSel.degrau > 0 ? ` (R${opSel.degrau})` : ''} · {opSel.ganhou ? 'ganhou' : 'perdeu'} {dinheiroComSinal(opSel.lucro, 'USD')} · sessão {dinheiroComSinal(opSel.resultado, 'USD')}
                  <button type="button" onClick={() => trocarResultado(n - 1)}>Trocar para {opSel.ganhou ? 'perdeu' : 'ganhou'}</button>
                </span>
              )}
            </div>
            <input type="range" min={0} max={total} value={n} onChange={(e) => setOpVista(Number(e.target.value))} aria-label="Momento da sessão" />
            <div className="est-fita" aria-label="As operações (toque para ver)">
              {ops.map((o, i) => (
                <button key={i} type="button" className={`${o.ganhou ? 'g' : 'p'} ${o.degrau > 0 ? 'rec' : ''} ${i + 1 === n ? 'sel' : ''} ${i > 0 && ops[i - 1].trecho !== o.trecho ? 'religou' : ''}`}
                  onClick={() => setOpVista(i + 1)} aria-label={`Operação ${i + 1}, ${o.ganhou ? 'ganhou' : 'perdeu'}`} />
              ))}
            </div>
            <div className="est-legenda"><span><i className="g" />Ganhou</span><span><i className="p" />Perdeu</span><span><i className="rec" />Na recuperação</span>{r.fita && <button type="button" onClick={() => setR((x) => ({ ...x, fita: undefined }))}>Desfazer as trocas</button>}</div>
          </div>

          {aba === 'cabine' ? (
            <div className="est-palco robot-workspace">
              <div className="rob-workspace-board modo-lista ssim-quadro">
                <div className="rob-board-slot aberta">
                  <CabineDaSessao roteiro={rd} estado={foto.estado} trecho={foto.trecho} inicio={t0.current} />
                </div>
              </div>
            </div>
          ) : (
            <div className="est-tabela ssim-tabela">
              <div className="ssim-tabela-rolo">
                <table>
                  <thead><tr><th>#</th><th>Entrada</th><th>Resultado</th><th>Sessão</th><th>Saldo</th></tr></thead>
                  <tbody>
                    <tr className="ssim-linha-info"><td colSpan={5}>Saldo antes do play: <b>{usd(r.saldo)}</b></td></tr>
                    {ops.map((o, i) => {
                      const fimAqui = i === ops.length - 1 || ops[i + 1].trecho !== o.trecho
                      const f = fimAqui ? fimDe(o.trecho) : null
                      return [
                        <tr key={i} className={`${o.ganhou ? 'g' : 'p'} ${i + 1 === n ? 'sel' : ''}`} onClick={() => setOpVista(i + 1)}>
                          <td>{i + 1}</td>
                          <td>{usd(o.valor)}{o.degrau > 0 && <em>R{o.degrau}</em>}</td>
                          <td className={o.ganhou ? 'sobe' : 'cai'}>{dinheiroComSinal(o.lucro, 'USD')}</td>
                          <td className={o.resultado < 0 ? 'cai' : 'sobe'}>{dinheiroComSinal(o.resultado, 'USD')}</td>
                          <td>{usd(o.saldo)}</td>
                        </tr>,
                        f && <tr key={`f${i}`} className="ssim-linha-info"><td colSpan={5}>{f.tipo === 'meta' ? 'Bateu a meta' : f.tipo === 'stop' ? 'Bateu o limite de perda' : f.tipo === 'saldo' ? 'Parou: saldo insuficiente' : 'Desligou'} · sessão {dinheiroComSinal(f.resultado, 'USD')}{o.trecho + 1 < r.trechos.length ? ' · religou com novos limites' : ''}</td></tr>,
                      ]
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      <footer className="est-rodape">
        <dl className="est-kpis">
          <div><dt>Resultado</dt><dd className={previa.resultado < 0 ? 'cai' : 'sobe'}>{dinheiroComSinal(previa.resultado, 'USD')}</dd></div>
          <div><dt>Operações</dt><dd>{total}</dd></div>
          <div><dt>Acerto</dt><dd>{total ? Math.round((ganhas / total) * 100) : 0}%</dd></div>
          <div><dt>Maior sequência</dt><dd>{previa.maiorSequencia.n}</dd></div>
          <div><dt>Maior entrada</dt><dd>{usd(previa.maiorEntrada)}</dd></div>
          <div><dt>Saldo no fim</dt><dd>{usd(previa.saldoFinal)}</dd></div>
          <div><dt>Duração</dt><dd>{duracaoEmTexto(tempo.segundos)} <small>· {Math.round(tempo.porOperacao)} s/op</small></dd></div>
        </dl>
        <div className={`est-status ${conferido ? 'ok' : 'atencao'}`} role="status">
          {conferido ? <><i aria-hidden="true">✓</i>Tudo confere com o pedido</> : <><i aria-hidden="true">!</i>{difs.length + (previa.corrida.naoReligou ? 1 : 0)} {difs.length + (previa.corrida.naoReligou ? 1 : 0) === 1 ? 'ponto' : 'pontos'} diferente{difs.length + (previa.corrida.naoReligou ? 1 : 0) === 1 ? '' : 's'} do pedido</>}
        </div>
        <div className="est-acoes">
          <button type="button" className="est-cancelar" onClick={aoFechar}>Cancelar</button>
          <button type="button" className="est-play" disabled={!total} onClick={play}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" /></svg>Dar o play
          </button>
        </div>
      </footer>
    </div>
  )
}
