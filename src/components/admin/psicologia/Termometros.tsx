/**
 * Termômetros, radar e simulador da Psicologia (28/11/2026, Tiago: "efeitos 3D, imersão, mais dados, mais
 * interpretações, mais possibilidades, termômetros").
 *
 *  - Índice GF: uma nota de 0 a 100 que resume a saúde do funil (média ponderada dos termômetros);
 *  - Termômetros: cada um mede uma passagem do aluno (estudar, depositar, operar, voltar, ficar) e diz se
 *    está frio, morno ou quente, com a leitura escrita;
 *  - Radar: os alertas que os próprios números levantam, do mais urgente para o menos;
 *  - Simulador: "e se": mexe em três alavancas e mostra quanto de markup isso daria com as médias de hoje.
 *
 * Tudo sai dos dados que a tela já lê (teeds_psicologia + teeds_psicologia_investigacao). O 3D é só CSS e segue o
 * ponteiro no computador; no celular os cartões ficam parados (sem ponteiro) e quem pede menos movimento não vê.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import type { Investigacao, Psicologia } from '../../../core/teeds/psicologia'
import { decimal, inteiro, pct, usd } from './sacadas'

/** O cartão que inclina seguindo o ponteiro (só onde há ponteiro fino). */
export function Inclina({ className = '', children, style }: { className?: string; children: ReactNode; style?: CSSProperties }) {
  const el = useRef<HTMLDivElement>(null)
  const mover = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || !el.current) return
    const r = el.current.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5
    el.current.style.setProperty('--ry', `${(x * 9).toFixed(2)}deg`)
    el.current.style.setProperty('--rx', `${(-y * 9).toFixed(2)}deg`)
    el.current.style.setProperty('--bx', `${((x + 0.5) * 100).toFixed(1)}%`)
    el.current.style.setProperty('--by', `${((y + 0.5) * 100).toFixed(1)}%`)
  }
  const sair = () => { el.current?.style.setProperty('--rx', '0deg'); el.current?.style.setProperty('--ry', '0deg') }
  return <div ref={el} className={`psi-3d ${className}`} style={style} onPointerMove={mover} onPointerLeave={sair}>{children}</div>
}

interface Medida { id: string; nome: string; valor: number; texto: string; base: string; frio: number; quente: number; peso: number; leitura: (n: 'frio' | 'morno' | 'quente') => string }
const nivel = (m: Medida) => (m.valor >= m.quente ? 'quente' : m.valor >= m.frio ? 'morno' : 'frio') as 'frio' | 'morno' | 'quente'
/** 0 a 100 dentro da própria régua: o "quente" vale 80. */
const nota = (m: Medida) => Math.max(0, Math.min(100, m.valor >= m.quente ? 80 + ((m.valor - m.quente) / Math.max(1, 100 - m.quente)) * 20 : m.valor >= m.frio ? 45 + ((m.valor - m.frio) / Math.max(1, m.quente - m.frio)) * 35 : (m.valor / Math.max(1, m.frio)) * 45))
const ROTULO = { frio: 'Frio', morno: 'Morno', quente: 'Quente' }

function Ponteiro({ m }: { m: Medida }) {
  const n = nivel(m), v = Math.max(0, Math.min(100, m.valor))
  const arco = Math.PI * 80
  return (
    <Inclina className={`psi-termo ${n}`}>
      <small>{m.nome}</small>
      <svg viewBox="0 0 200 116" role="img" aria-label={`${m.nome}: ${Math.round(m.valor)}%, ${ROTULO[n]}`}>
        <path d="M20 106 A80 80 0 0 1 180 106" className="trilho" />
        <path d="M20 106 A80 80 0 0 1 180 106" className="arco" strokeDasharray={`${(v / 100) * arco} ${arco}`} />
        <g className="agulha" style={{ transform: `rotate(${-90 + (v / 100) * 180}deg)` }}><path d="M100 106 L100 38" /><circle cx="100" cy="106" r="7" /></g>
        <line x1={100 + 88 * Math.cos(Math.PI * (1 - m.frio / 100))} y1={106 - 88 * Math.sin(Math.PI * (1 - m.frio / 100))} x2={100 + 72 * Math.cos(Math.PI * (1 - m.frio / 100))} y2={106 - 72 * Math.sin(Math.PI * (1 - m.frio / 100))} className="marca" />
        <line x1={100 + 88 * Math.cos(Math.PI * (1 - m.quente / 100))} y1={106 - 88 * Math.sin(Math.PI * (1 - m.quente / 100))} x2={100 + 72 * Math.cos(Math.PI * (1 - m.quente / 100))} y2={106 - 72 * Math.sin(Math.PI * (1 - m.quente / 100))} className="marca" />
      </svg>
      <strong>{m.texto}<em>{ROTULO[n]}</em></strong>
      <p>{m.leitura(n)}</p>
      <span>{m.base}</span>
    </Inclina>
  )
}

function medidas(p: Psicologia, inv: Investigacao | null): Medida[] {
  const b = p.base, n = inv?.numeros
  const stop = (p.sessoes.fins ?? []).find((f) => f.fim === 'stop'), meta = (p.sessoes.fins ?? []).find((f) => f.fim === 'meta')
  const s7 = (inv?.sobrevivencia ?? []).find((s) => s.dias === 7 && s.base >= 20)
  const l: Medida[] = []
  if (b.alunos >= 20) l.push({ id: 'estudo', nome: 'Estudo', valor: pct(b.com_aula, b.alunos), texto: `${Math.round(pct(b.com_aula, b.alunos))}%`, base: `${inteiro(b.com_aula)} de ${inteiro(b.alunos)} alunos abriram aula`, frio: 40, quente: 70, peso: 2,
    leitura: (x) => (x === 'quente' ? 'A maioria começa a estudar: a porta de entrada funciona.' : x === 'morno' ? 'Metade dos alunos nunca abriu uma aula. O primeiro passo ainda trava muita gente.' : 'A maioria para no cadastro. Antes de qualquer coisa, é a primeira aula que precisa acontecer.') })
  if (b.com_aula >= 20) l.push({ id: 'deposito', nome: 'Depósito', valor: pct(b.depositaram, b.com_aula), texto: `${Math.round(pct(b.depositaram, b.com_aula))}%`, base: `${inteiro(b.depositaram)} depositaram, de ${inteiro(b.com_aula)} que estudaram`, frio: 25, quente: 50, peso: 3,
    leitura: (x) => (x === 'quente' ? 'Quem estuda deposita: metade ou mais chega ao dinheiro.' : x === 'morno' ? 'De quem estuda, uma parte boa deposita, mas ainda sobra muita gente aquecida sem depositar.' : 'Pouca gente que estuda chega ao depósito. O empurrão final está faltando.') })
  if (b.depositaram >= 20) l.push({ id: 'ativacao', nome: 'Ativação', valor: pct(b.operaram, b.depositaram), texto: `${Math.round(pct(b.operaram, b.depositaram))}%`, base: `${inteiro(b.operaram)} operaram, de ${inteiro(b.depositaram)} que depositaram`, frio: 70, quente: 90, peso: 2,
    leitura: (x) => (x === 'quente' ? 'Quase todo mundo que deposita opera: o dinheiro não fica parado.' : x === 'morno' ? 'Uma parte deposita e não opera. É dinheiro esperando ajuda no primeiro passo.' : 'Muito depósito parado: o aluno coloca dinheiro e trava antes de operar.') })
  if (n && n.depositantes >= 20) l.push({ id: 'redeposito', nome: 'Redepósito', valor: pct(n.redepositaram, n.depositantes), texto: `${Math.round(pct(n.redepositaram, n.depositantes))}%`, base: `${inteiro(n.redepositaram)} de ${inteiro(n.depositantes)} depositaram de novo`, frio: 25, quente: 45, peso: 3,
    leitura: (x) => (x === 'quente' ? 'Quase metade volta a depositar. A plataforma segura o interesse depois do primeiro dinheiro.' : x === 'morno' ? 'Uma boa parte volta a depositar, e a janela é curta: a maioria dos redepósitos vem em 24 horas.' : 'Poucos depositam uma segunda vez. O primeiro depósito está sendo o único.') })
  if (s7) l.push({ id: 'permanencia', nome: 'Permanência', valor: pct(s7.seguem, s7.base), texto: `${Math.round(pct(s7.seguem, s7.base))}%`, base: `${inteiro(s7.seguem)} de ${inteiro(s7.base)} seguem operando depois de 7 dias`, frio: 35, quente: 60, peso: 3,
    leitura: (x) => (x === 'quente' ? 'A maioria ainda opera uma semana depois. O aluno fica.' : x === 'morno' ? 'Metade ainda opera depois de uma semana. A outra metade já foi embora.' : 'A maioria some na primeira semana. É aqui que a receita futura está escapando.') })
  if (stop && stop.n >= 30) l.push({ id: 'disciplina', nome: 'Disciplina', valor: 100 - pct(stop.volta2, stop.n), texto: `${Math.round(100 - pct(stop.volta2, stop.n))}%`, base: `Em ${inteiro(stop.n - stop.volta2)} de ${inteiro(stop.n)} limites de perda o aluno parou`, frio: 50, quente: 75, peso: 2,
    leitura: (x) => (x === 'quente' ? 'O limite de perda é respeitado: o aluno para quando bate.' : x === 'morno' ? 'Em quase metade das vezes o aluno religa em menos de 2 minutos depois do limite de perda.' : 'O limite de perda virou pausa de segundos: a maioria religa no calor.') })
  if (meta && meta.n >= 30) l.push({ id: 'meta', nome: 'Respeito à meta', valor: 100 - pct(meta.volta10, meta.n), texto: `${Math.round(100 - pct(meta.volta10, meta.n))}%`, base: `Em ${inteiro(meta.n - meta.volta10)} de ${inteiro(meta.n)} metas batidas o aluno encerrou`, frio: 40, quente: 65, peso: 1,
    leitura: (x) => (x === 'quente' ? 'Bateu a meta, parou: a meta funciona como linha de chegada.' : x === 'morno' ? 'Parte dos alunos continua depois da meta e devolve o que ganhou.' : 'A meta virou degrau: a maioria continua operando depois de bater.') })
  if (b.operaram >= 20) l.push({ id: 'saude', nome: 'Alunos no positivo', valor: pct(b.lucrando, b.operaram), texto: `${Math.round(pct(b.lucrando, b.operaram))}%`, base: `${inteiro(b.lucrando)} de ${inteiro(b.operaram)} que operaram estão no positivo`, frio: 20, quente: 40, peso: 2,
    leitura: (x) => (x === 'quente' ? 'Boa parte dos alunos está no positivo: isso sustenta a permanência.' : x === 'morno' ? 'Uma parte dos alunos está no positivo. É o número que decide quem fica.' : 'Quase ninguém está no positivo. É o maior risco para a permanência e para a reputação.') })
  return l
}

function alertas(p: Psicologia, inv: Investigacao | null): Array<{ grau: 'alto' | 'medio' | 'bom'; titulo: string; texto: string }> {
  const l: Array<{ grau: 'alto' | 'medio' | 'bom'; titulo: string; texto: string; ordem: number }> = []
  const n = inv?.numeros, perfis = Object.fromEntries((p.perfis ?? []).map((x) => [x.perfil, x]))
  const su = p.sumico, dp = p.depositos, cc = inv?.concentracao
  if (su.negativo_sumiu >= 10) l.push({ grau: 'alto', ordem: su.markup_dos_sumidos, titulo: `${inteiro(su.negativo_sumiu)} alunos sumiram depois de perder`, texto: `Já tinham gerado ${usd(su.markup_dos_sumidos)} de markup e têm ${usd(su.saldo_parado)} parados na conta.` })
  if (perfis.depositou_parado?.pessoas >= 5) l.push({ grau: 'alto', ordem: perfis.depositou_parado.dep_total, titulo: `${inteiro(perfis.depositou_parado.pessoas)} depositaram e nunca operaram`, texto: `${usd(perfis.depositou_parado.dep_total)} depositados sem uma operação em conta real.` })
  if (cc && cc.geradores >= 20 && cc.top10 >= 30) l.push({ grau: 'alto', ordem: 900, titulo: `10 alunos fazem ${decimal(cc.top10)}% do markup`, texto: 'A receita depende de pouca gente: vale conhecer cada um deles pelo nome.' })
  if (dp.no_calor >= 15) l.push({ grau: 'medio', ordem: dp.no_calor_valor / 4, titulo: `${inteiro(dp.no_calor)} depósitos feitos no calor da perda`, texto: `${usd(dp.no_calor_valor)} colocados em até 1 hora depois de perder; ${Math.round(pct(dp.no_calor_perdeu, dp.no_calor))}% perderam de novo em 24 horas.` })
  if (perfis.estuda_nao_deposita?.pessoas >= 5) l.push({ grau: 'bom', ordem: 400, titulo: `${inteiro(perfis.estuda_nao_deposita.pessoas)} alunos aquecidos sem depósito`, texto: 'Concluíram 3 aulas ou mais e ainda não depositaram: é o público mais pronto para o empurrão.' })
  if (n && n.saldo_parado > 0 && n.pararam >= 10) l.push({ grau: 'medio', ordem: n.saldo_parado / 6, titulo: `${inteiro(n.pararam)} depositantes pararam de operar`, texto: `Duraram ${decimal(n.vida_de_quem_parou ?? 0)} dias e deixaram ${usd(n.markup_de_quem_parou, 2)} de markup cada. Há ${usd(n.saldo_parado)} em saldo nas contas reais.` })
  if (p.gerenciamento.nao >= 20) l.push({ grau: 'medio', ordem: 300, titulo: `${inteiro(p.gerenciamento.nao)} operam sem a aula de gerenciamento`, texto: `Eles religam no calor em ${Math.round(pct(p.gerenciamento.nao_revanches, p.gerenciamento.nao_perdas))}% das perdas; quem fez a aula, em ${Math.round(pct(p.gerenciamento.viu_revanches, p.gerenciamento.viu_perdas))}%.` })
  return l.sort((a, b) => (a.grau === b.grau ? b.ordem - a.ordem : a.grau === 'alto' ? -1 : b.grau === 'alto' ? 1 : a.grau === 'medio' ? -1 : 1)).slice(0, 6)
}

function Simulador({ p, inv }: { p: Psicologia; inv: Investigacao }) {
  const n = inv.numeros!
  const perfis = Object.fromEntries((p.perfis ?? []).map((x) => [x.perfil, x]))
  const aquecidos = (perfis.estuda_nao_deposita?.pessoas ?? 0) + (perfis.so_no_treino?.pessoas ?? 0)
  const sumidos = perfis.sumiu_na_perda?.pessoas ?? 0
  const [a, setA] = useState(20), [b, setB] = useState(20), [c, setC] = useState(2)
  const taxa = n.markup_sobre_deposito / 100
  const novos = Math.round((aquecidos * a) / 100), depNovo = novos * n.por_depositante_medio, mkA = depNovo * taxa
  const voltam = Math.round((sumidos * b) / 100), mkB = voltam * n.markup_por_dia_ativo * Math.max(1, n.dias_operando_mediana ?? 1)
  const mkC = n.ativos_7d * c * n.markup_por_dia_ativo
  const total = mkA + mkB + mkC
  const Barra = ({ rotulo, valor, set, max, passo, sufixo, leitura, ganho }: { rotulo: string; valor: number; set: (v: number) => void; max: number; passo: number; sufixo: string; leitura: string; ganho: number }) => (
    <label className="psi-sim-linha">
      <span><b>{rotulo}</b><small>{leitura}</small></span>
      <input type="range" min={0} max={max} step={passo} value={valor} onChange={(e) => set(Number(e.target.value))} style={{ '--p': `${(valor / max) * 100}%` } as CSSProperties} aria-label={rotulo} />
      <em>{valor}{sufixo}</em>
      <strong>+{usd(ganho)}</strong>
    </label>
  )
  if (!aquecidos && !sumidos && !n.ativos_7d) return null
  return (
    <div className="psi-bloco psi-sim">
      <h4>E se… <small>mexa nas alavancas e veja quanto de markup isso daria, com as médias de hoje</small></h4>
      <div className="psi-sim-corpo">
        <div className="psi-sim-linhas">
          <Barra rotulo="Converter os aquecidos" valor={a} set={setA} max={100} passo={5} sufixo="%" ganho={mkA}
            leitura={`${inteiro(novos)} de ${inteiro(aquecidos)} que estudam ou treinam e não depositaram passam a depositar ${usd(n.por_depositante_medio)} cada.`} />
          <Barra rotulo="Trazer de volta quem sumiu" valor={b} set={setB} max={100} passo={5} sufixo="%" ganho={mkB}
            leitura={`${inteiro(voltam)} de ${inteiro(sumidos)} voltam e operam os ${decimal(n.dias_operando_mediana ?? 1)} dias típicos.`} />
          <Barra rotulo="Cada aluno ativo operar mais dias" valor={c} set={setC} max={10} passo={1} sufixo={c === 1 ? ' dia' : ' dias'} ganho={mkC}
            leitura={`${inteiro(n.ativos_7d)} alunos ativos operam ${c} ${c === 1 ? 'dia' : 'dias'} a mais, a ${usd(n.markup_por_dia_ativo, 2)} de markup por dia.`} />
        </div>
        <Inclina className="psi-sim-total">
          <small>Markup a mais</small>
          <strong>+{usd(total)}</strong>
          <span>{n.markup > 0 ? <>equivale a <b>{Math.round(pct(total, n.markup))}%</b> de todo o markup feito até hoje ({usd(n.markup)})</> : null}</span>
        </Inclina>
      </div>
      <p className="psi-pe">Conta simples com as médias de hoje, para comparar alavancas entre si. Não é previsão nem promessa: aluno novo não se comporta igual à média.</p>
    </div>
  )
}

export function Termometros({ p, inv }: { p: Psicologia; inv: Investigacao | null }) {
  const lista = useMemo(() => medidas(p, inv), [p, inv])
  const avisos = useMemo(() => alertas(p, inv), [p, inv])
  const indice = useMemo(() => { const peso = lista.reduce((t, m) => t + m.peso, 0); return peso ? Math.round(lista.reduce((t, m) => t + nota(m) * m.peso, 0) / peso) : 0 }, [lista])
  const [mostrado, setMostrado] = useState(0)
  useEffect(() => {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) { setMostrado(indice); return }
    let quadro = 0
    const t0 = performance.now()
    const passo = (t: number) => { const k = Math.min(1, (t - t0) / 1100); setMostrado(Math.round(indice * (1 - Math.pow(1 - k, 3)))); if (k < 1) quadro = requestAnimationFrame(passo) }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [indice])
  if (lista.length < 3) return null
  const pior = [...lista].sort((x, y) => nota(x) - nota(y))[0], melhor = [...lista].sort((x, y) => nota(y) - nota(x))[0]
  const faixa = indice >= 70 ? 'quente' : indice >= 45 ? 'morno' : 'frio'
  const c = 2 * Math.PI * 88
  return (
    <section className="psi-secao" id="psi-termometros">
      <header><span className="psi-rot">Termômetros</span><h3>A temperatura do negócio</h3><p>Cada termômetro mede uma passagem do aluno. As marcas na régua separam frio, morno e quente.</p></header>
      <div className="psi-indice-linha">
        <Inclina className={`psi-indice ${faixa}`}>
          <div className="psi-indice-anel">
            <svg viewBox="0 0 200 200" aria-hidden="true">
              <circle cx="100" cy="100" r="88" className="trilho" />
              <circle cx="100" cy="100" r="88" className="arco" strokeDasharray={`${(indice / 100) * c} ${c}`} transform="rotate(-90 100 100)" />
            </svg>
            <span className="psi-indice-orbita" aria-hidden="true" /><span className="psi-indice-orbita b" aria-hidden="true" />
            <strong>{mostrado}</strong>
          </div>
          <div className="psi-indice-texto">
            <small>Índice GF</small>
            <b>{faixa === 'quente' ? 'Negócio aquecido' : faixa === 'morno' ? 'Negócio morno' : 'Negócio frio'}</b>
            <p>Média dos {lista.length} termômetros, de 0 a 100. O ponto mais forte hoje é <b>{melhor.nome}</b> ({melhor.texto}); o que mais puxa a nota para baixo é <b>{pior.nome}</b> ({pior.texto}).</p>
          </div>
        </Inclina>
        {avisos.length > 0 && (
          <div className="psi-radar">
            <h4>Radar <small>o que os números estão avisando</small></h4>
            {avisos.map((x) => <div key={x.titulo} className={`psi-alerta ${x.grau}`}><i aria-hidden="true" /><span><b>{x.titulo}</b><small>{x.texto}</small></span></div>)}
          </div>
        )}
      </div>
      <div className="psi-termos">{lista.map((m) => <Ponteiro m={m} key={m.id} />)}</div>
      {inv?.numeros && inv.numeros.depositantes >= 20 && <Simulador p={p} inv={inv} />}
    </section>
  )
}
