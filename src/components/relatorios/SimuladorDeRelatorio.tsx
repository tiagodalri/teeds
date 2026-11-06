/**
 * Relatório simulado (06/11/2026): o editor do cenário, a faixa com a tag
 * "Relatório simulado" e o botão que abre o modo. Só administradores da marca
 * chegam aqui; as contas ficam em core/teeds/relatorioSimulado.ts.
 */
import { useEffect, useRef, useState } from 'react'
import { MARCA } from '../../marca'
import { dinheiroComSinal } from '../../core/dinheiro'
import {
  CENARIO_EM_BRANCO, CENARIOS_PRONTOS, FORMAS, IAS_DO_SIMULADOR, iaDoSimulador,
  type Cenario, type LinhaDeIa, type OperacaoAvulsa,
} from '../../core/teeds/relatorioSimulado'

const IA = MARCA.vocabularioIA ? 'I.A.' : 'robô'

/** O botão pequeno do topo da página. */
export function BotaoSimular({ ativo, aoAbrir, className = '' }: { ativo: boolean; aoAbrir: () => void; className?: string }) {
  return (
    <button type="button" className={`rsim-abrir ${ativo ? 'on' : ''} ${className}`} onClick={aoAbrir} title="Montar um relatório simulado para as aulas (só administradores)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6" /></svg>
      {ativo ? 'Editar simulação' : 'Simular relatório'}
    </button>
  )
}

/** A faixa que fica presa no topo do relatório durante toda a simulação. */
export function FaixaSimulada({ nome, aoEditar, aoSair }: { nome: string; aoEditar: () => void; aoSair: () => void }) {
  // quando a faixa sai da tela (rolou para baixo), uma tag fica fixa no canto: a simulação nunca fica sem aviso
  const ref = useRef<HTMLDivElement>(null)
  const [fora, setFora] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver !== 'function') return
    const o = new IntersectionObserver(([e]) => setFora(!e.isIntersecting), { threshold: 0, rootMargin: '-60px 0px 0px 0px' })
    o.observe(el)
    return () => o.disconnect()
  }, [])
  return (
    <>
    {fora && <span className="rsim-tag rsim-tag-flutuante" role="status"><i aria-hidden="true" />Relatório simulado</span>}
    <div ref={ref} className="rsim-faixa" role="status" aria-label={`Relatório simulado: ${nome}`}>
      <div className="rsim-faixa-txt">
        <b>{nome}</b>
        <small>Números preenchidos pela equipe para a aula. Não são operações reais.</small>
      </div>
      <div className="rsim-faixa-acoes">
        <button type="button" className="rel-btn" onClick={aoEditar}>Editar cenário</button>
        <button type="button" className="rel-btn" onClick={aoSair}>Sair da simulação</button>
      </div>
      <span className="rsim-tag" aria-hidden="true"><i />Relatório simulado</span>
    </div>
    </>
  )
}

/* ------------------------------------------------------- campos de número */

const ler = (t: string) => {
  const limpo = t.trim().replace(/\s|US\$|\$|%/g, '')
  if (!limpo) return null
  const x = Number(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo)
  return Number.isFinite(x) ? x : null
}
const mostrar = (x: number) => (Number.isFinite(x) ? String(x).replace('.', ',') : '')

function Numero({ id, rotulo, valor, aoMudar, min = 0, max, sufixo }: { id: string; rotulo: string; valor: number; aoMudar: (x: number) => void; min?: number; max?: number; sufixo?: string }) {
  const [texto, setTexto] = useState(mostrar(valor))
  useEffect(() => { if (ler(texto) !== valor) setTexto(mostrar(valor)) }, [valor]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="rsim-campo">
      <span>{rotulo}</span>
      <span className="rsim-entrada">
        <input id={id} inputMode="decimal" value={texto} onChange={(e) => {
          setTexto(e.target.value)
          const x = ler(e.target.value)
          if (x != null) aoMudar(Math.min(max ?? Infinity, Math.max(min, x)))
        }} onBlur={() => setTexto(mostrar(valor))} />
        {sufixo && <em>{sufixo}</em>}
      </span>
    </label>
  )
}

/** Ganho ou perda + o valor: no celular o teclado numérico não tem o sinal de menos. */
function Resultado({ id, valor, aoMudar, rotulo = 'Resultado' }: { id: string; valor: number; aoMudar: (x: number) => void; rotulo?: string }) {
  const perda = valor < 0
  return (
    <div className="rsim-resultado">
      <div className="rel-seg cheio" role="group" aria-label={rotulo}>
        <button type="button" className={!perda ? 'on ganho' : ''} onClick={() => aoMudar(Math.abs(valor))}>Ganho</button>
        <button type="button" className={perda ? 'on perda' : ''} onClick={() => aoMudar(-Math.abs(valor) || -1)}>Perda</button>
      </div>
      <Numero id={id} rotulo={`${rotulo} (US$)`} valor={Math.abs(valor)} aoMudar={(x) => aoMudar(perda ? -x : x)} />
    </div>
  )
}

/* ================================================================ editor */

export function EditorDoCenario({ inicial, aoMostrar, aoFechar }: { inicial: Cenario; aoMostrar: (c: Cenario) => void; aoFechar: () => void }) {
  const [c, setC] = useState<Cenario>(inicial)
  const [pronto, setPronto] = useState<string | null>(null)
  const mudar = (p: Partial<Cenario>) => setC((x) => ({ ...x, ...p }))
  const mudarIa = (i: number, p: Partial<LinhaDeIa>) => setC((x) => ({ ...x, ias: x.ias.map((l, k) => (k === i ? { ...l, ...p } : l)) }))
  const mudarAvulsa = (i: number, p: Partial<OperacaoAvulsa>) => setC((x) => ({ ...x, avulsas: x.avulsas.map((l, k) => (k === i ? { ...l, ...p } : l)) }))
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', esc)
    document.body.classList.add('rel-painel-aberto')
    return () => { window.removeEventListener('keydown', esc); document.body.classList.remove('rel-painel-aberto') }
  }, [aoFechar])

  const livres = IAS_DO_SIMULADOR.filter((x) => !c.ias.some((l) => l.ia === x.id))
  const total = c.ias.reduce((s, l) => s + l.resultado, 0)
  const ops = c.ias.reduce((s, l) => s + Math.round(l.operacoes), 0)
  const dias = Array.from({ length: c.dias }, (_, i) => i)
  const nomeDoDia = (d: number) => (d === 0 ? 'Hoje' : d === 1 ? 'Ontem' : `${d} dias atrás`)
  const falha = !c.ias.length ? `Inclua pelo menos uma ${IA}.` : !ops ? 'Preencha o número de operações.' : ''

  return (
    <div className="rel-painel-fundo" onMouseDown={aoFechar}>
      <section className="rel-painel rsim-painel" role="dialog" aria-modal="true" aria-label="Montar o relatório simulado" onMouseDown={(e) => e.stopPropagation()}>
        <header><b>Relatório simulado</b><button type="button" onClick={aoFechar} aria-label="Fechar">×</button></header>
        <div className="rel-painel-corpo">
          <p className="rsim-aviso">Só os administradores veem. Nada é gravado, nada entra na cobrança, e a tela mostra a tag <b>Relatório simulado</b> o tempo todo.</p>

          <fieldset>
            <legend>Cenários prontos <small>Toque para começar dele</small></legend>
            <div className="rel-fichas">
              {CENARIOS_PRONTOS.map((p) => (
                <button key={p.id} type="button" className={`rsim-pronto ${p.tom} ${pronto === p.id ? 'on' : ''}`} onClick={() => { setC(structuredClone(p.cenario)); setPronto(p.id) }}>
                  <i aria-hidden="true" />{p.cenario.nome}
                </button>
              ))}
              <button type="button" className={`rsim-pronto ${pronto === 'branco' ? 'on' : ''}`} onClick={() => { setC(structuredClone(CENARIO_EM_BRANCO)); setPronto('branco') }}>Em branco</button>
            </div>
          </fieldset>

          <fieldset>
            <legend>O cenário</legend>
            <label className="rsim-campo"><span>Nome que aparece na faixa</span>
              <span className="rsim-entrada"><input id="rsim-nome" value={c.nome} maxLength={60} onChange={(e) => mudar({ nome: e.target.value })} /></span>
            </label>
            <div className="rsim-campo"><span>Período</span>
              <div className="rel-seg cheio">
                {([[1, 'Só hoje'], [7, '7 dias'], [30, '30 dias']] as const).map(([d, nome]) => (
                  <button key={d} type="button" className={c.dias === d ? 'on' : ''} onClick={() => mudar({ dias: d, avulsas: c.avulsas.map((a) => ({ ...a, dia: Math.min(a.dia, d - 1) })) })}>{nome}</button>
                ))}
              </div>
            </div>
            <div className="rsim-campo"><span>Como o resultado andou</span>
              <div className="rsim-formas">
                {FORMAS.map((f) => (
                  <button key={f.id} type="button" className={c.forma === f.id ? 'on' : ''} onClick={() => mudar({ forma: f.id })} aria-pressed={c.forma === f.id}>
                    <b>{f.nome}</b><small>{f.descricao}</small>
                  </button>
                ))}
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>Resultado por {IA} <small>{ops.toLocaleString('pt-BR')} operações · <em className={total < 0 ? 'cai' : 'sobe'}>{dinheiroComSinal(total, 'USD')}</em></small></legend>
            {c.ias.map((l, i) => (
              <div className="rsim-cartao" key={`${l.ia}-${i}`}>
                <div className="rsim-cartao-topo">
                  <select id={`rsim-ia-${i}`} aria-label={IA} value={l.ia} onChange={(e) => {
                    const nova = e.target.value
                    setC((x) => ({ ...x, ias: x.ias.map((y, k) => (k === i ? { ...y, ia: nova } : y)), avulsas: x.avulsas.map((a) => (a.ia === l.ia ? { ...a, ia: nova } : a)) }))
                  }}>
                    {[iaDoSimulador(l.ia), ...livres].map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                  </select>
                  <button type="button" className="rsim-tirar" aria-label={`Tirar ${iaDoSimulador(l.ia).nome}`} onClick={() => setC((x) => ({ ...x, ias: x.ias.filter((_, k) => k !== i), avulsas: x.avulsas.filter((a) => a.ia !== l.ia) }))}>×</button>
                </div>
                <div className="rsim-tres">
                  <Numero id={`rsim-ops-${i}`} rotulo="Operações" valor={l.operacoes} max={5000} aoMudar={(x) => mudarIa(i, { operacoes: Math.round(x) })} />
                  <Numero id={`rsim-acerto-${i}`} rotulo="Acerto" sufixo="%" valor={l.acerto} max={100} aoMudar={(x) => mudarIa(i, { acerto: x })} />
                  <Numero id={`rsim-entrada-${i}`} rotulo="Entrada (US$)" valor={l.entrada} max={10000} aoMudar={(x) => mudarIa(i, { entrada: x })} />
                </div>
                <Resultado id={`rsim-res-${i}`} valor={l.resultado} aoMudar={(x) => mudarIa(i, { resultado: x })} />
              </div>
            ))}
            {livres.length > 0 && <button type="button" className="rsim-mais" onClick={() => mudar({ ias: [...c.ias, { ia: livres[0].id, operacoes: 20, acerto: 60, resultado: 5, entrada: 1 }] })}>+ Incluir {IA}</button>}
          </fieldset>

          <fieldset>
            <legend>Operações específicas <small>{c.avulsas.length ? `${c.avulsas.length} escrita${c.avulsas.length > 1 ? 's' : ''}` : 'Opcional'}</small></legend>
            <p className="rel-nota">Para mostrar uma operação exata na lista, como a entrada alta depois do stop. Ela conta dentro do total da {IA} escolhida, que continua o que você preencheu acima.</p>
            {c.avulsas.map((a, i) => (
              <div className="rsim-cartao" key={i}>
                <div className="rsim-tres rsim-avulsa-topo">
                  <label className="rsim-campo"><span>Dia</span><span className="rsim-entrada">
                    <select id={`rsim-av-dia-${i}`} value={a.dia} onChange={(e) => mudarAvulsa(i, { dia: Number(e.target.value) })}>{dias.map((d) => <option key={d} value={d}>{nomeDoDia(d)}</option>)}</select>
                  </span></label>
                  <label className="rsim-campo"><span>Hora</span><span className="rsim-entrada"><input id={`rsim-av-hora-${i}`} type="time" value={a.hora} onChange={(e) => mudarAvulsa(i, { hora: e.target.value })} /></span></label>
                  <label className="rsim-campo"><span>{MARCA.vocabularioIA ? 'I.A.' : 'Robô'}</span><span className="rsim-entrada">
                    <select id={`rsim-av-ia-${i}`} value={a.ia} onChange={(e) => mudarAvulsa(i, { ia: e.target.value })}>{c.ias.map((l) => <option key={l.ia} value={l.ia}>{iaDoSimulador(l.ia).nome}</option>)}</select>
                  </span></label>
                  <button type="button" className="rsim-tirar" aria-label="Tirar a operação" onClick={() => setC((x) => ({ ...x, avulsas: x.avulsas.filter((_, k) => k !== i) }))}>×</button>
                </div>
                <div className="rsim-duas">
                  <Numero id={`rsim-av-entrada-${i}`} rotulo="Entrada (US$)" valor={a.entrada} max={10000} aoMudar={(x) => mudarAvulsa(i, { entrada: x, resultado: a.resultado < 0 ? -x : a.resultado })} />
                  <Resultado id={`rsim-av-res-${i}`} valor={a.resultado} aoMudar={(x) => mudarAvulsa(i, { resultado: x, entrada: x < 0 ? Math.abs(x) : a.entrada })} />
                </div>
              </div>
            ))}
            {c.ias.length > 0 && <button type="button" className="rsim-mais" onClick={() => {
              const h = new Date(Date.now() - 20 * 60e3)
              mudar({ avulsas: [...c.avulsas, { dia: 0, hora: `${String(h.getHours()).padStart(2, '0')}:${String(h.getMinutes()).padStart(2, '0')}`, ia: c.ias[0].ia, entrada: 10, resultado: -10 }] })
            }}>+ Escrever uma operação</button>}
          </fieldset>

          <fieldset>
            <legend>Na corretora</legend>
            <div className="rsim-tres">
              <Numero id="rsim-saldo" rotulo="Saldo (US$)" valor={c.saldo} max={1e7} aoMudar={(x) => mudar({ saldo: x })} />
              <Numero id="rsim-depositos" rotulo="Depósitos" valor={c.depositos} max={1e7} aoMudar={(x) => mudar({ depositos: x })} />
              <Numero id="rsim-saques" rotulo="Saques" valor={c.saques} max={1e7} aoMudar={(x) => mudar({ saques: x })} />
            </div>
          </fieldset>
        </div>
        <footer>
          <button type="button" className="rel-btn" onClick={aoFechar}>Cancelar</button>
          <button type="button" className="rel-btn ouro" disabled={!!falha} title={falha || undefined} onClick={() => aoMostrar({ ...c, nome: c.nome.trim() || 'Cenário simulado' })}>{falha || 'Mostrar o relatório'}</button>
        </footer>
      </section>
    </div>
  )
}
