/**
 * A escada como planilha (23/09/2026).
 *
 * O admin dita cada degrau; os números calculados ao lado (entrada,
 * pagamento, lucro, perda acumulada, cobre?, markup) NÃO têm conta própria:
 * vêm de `escadaDoRobo` com esta mesma tabela dentro dos parâmetros, então
 * batem centavo a centavo com o que o motor vai fazer. O degrau 1 da tabela
 * é a entrada DEPOIS da 1ª perda (o motor já incrementou perdasSeguidas
 * quando pede o próximo valor) — por isso a linha i mostra `escada[i + 1]`.
 *
 * Os limites são os mesmos de `validar()`: 1..30 degraus, multiplicador
 * 1..50, valor fixo 0,35..10.000. O componente não aparara o que o admin
 * digita — a validação ao vivo aponta — mas as ações automáticas
 * (fórmula, progressão, colar) já entregam dentro da faixa.
 */
import { useEffect, useMemo, useState } from 'react'
import { escadaDoRobo, type Degrau } from '../core/deriv/escada'
import type { DegrauTabela, DepoisDoUltimo, EscadaConfigurada, ParametrosDoRobo } from '../core/deriv/parametros'
import type { Modo } from '../core/deriv/strategies'

export const LIMITES_DA_TABELA = {
  degraus: { min: 1, max: 30 },
  multiplicador: { min: 1, max: 50 },
  valor: { min: 0.35, max: 10000 },
} as const

export interface PropsEscadaEditavel {
  id: string
  parametros: ParametrosDoRobo
  /** A entrada base de referência escolhida no placar. */
  base: number
  modo: Modo
  onChange: (escada: EscadaConfigurada) => void
}

const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const usd4 = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
const duasCasas = (v: number) => Math.round(v * 100) / 100
const aparar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * Campo numérico que aceita vírgula e não briga com quem está digitando:
 * guarda o texto enquanto tem foco e só devolve o número quando ele é
 * válido. Sem foco, segue o valor de fora.
 */
export function CampoNumero({ valor, onChange, passo = 1, min, max, rotulo, invalido = false, className = '' }: {
  valor: number
  onChange: (n: number) => void
  passo?: number
  min?: number
  max?: number
  rotulo: string
  invalido?: boolean
  className?: string
}) {
  const formatar = (n: number) => String(n).replace('.', ',')
  const [texto, setTexto] = useState(formatar(valor))
  const [foco, setFoco] = useState(false)
  useEffect(() => { if (!foco) setTexto(formatar(valor)) }, [valor, foco])
  return (
    <input
      className={`ac-input ${invalido ? 'invalido' : ''} ${className}`}
      inputMode="decimal"
      aria-label={rotulo}
      value={texto}
      min={min}
      max={max}
      step={passo}
      onFocus={() => setFoco(true)}
      onBlur={() => { setFoco(false); setTexto(formatar(valor)) }}
      onChange={(e) => {
        const v = e.target.value
        setTexto(v)
        const n = Number(v.trim().replace(',', '.'))
        if (v.trim() !== '' && Number.isFinite(n)) onChange(n)
      }}
    />
  )
}

/** Números de uma coluna colada do Excel/planilha: uma linha por degrau, vírgula ou ponto. */
export function multiplicadoresDoTexto(texto: string): number[] {
  return texto
    .split(/[\n;\t]+/)
    .map((s) => s.trim().replace(/[×x]/gi, '').replace(',', '.'))
    .filter((s) => s !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, LIMITES_DA_TABELA.degraus.max)
}

export function EscadaEditavel({ id, parametros, base, modo, onChange }: PropsEscadaEditavel) {
  const escada = parametros.recuperacao.escada
  const degraus: DegrauTabela[] = escada.tipo === 'tabela' ? escada.degraus : []
  const depoisDoUltimo: DepoisDoUltimo = escada.tipo === 'tabela' ? escada.depoisDoUltimo : 'formula'
  const [colando, setColando] = useState(false)
  const [textoColado, setTextoColado] = useState('')

  const comEstaTabela = (lista: DegrauTabela[]): ParametrosDoRobo => ({
    ...parametros,
    recuperacao: { ...parametros.recuperacao, escada: { tipo: 'tabela', degraus: lista, depoisDoUltimo } },
  })
  const emitir = (lista: DegrauTabela[]) => onChange({ tipo: 'tabela', degraus: lista, depoisDoUltimo })

  // As duas escadas calculadas: com a base de referência e com o piso de US$ 0,35.
  const calculada = useMemo(() => {
    try {
      const p = comEstaTabela(degraus)
      return { ref: escadaDoRobo(id, base, degraus.length + 1, modo, p), piso: escadaDoRobo(id, 0.35, degraus.length + 1, modo, p) }
    } catch { return { ref: [] as Degrau[], piso: [] as Degrau[] } }
  }, [id, base, modo, parametros, degraus]) // eslint-disable-line react-hooks/exhaustive-deps

  const trocarRegra = (i: number, regra: 'multiplicador' | 'valor') => {
    const atual = degraus[i]
    const refDegrau = calculada.ref[i + 1]
    const novo: DegrauTabela = regra === 'valor'
      ? { valor: duasCasas(aparar(refDegrau?.valor ?? ('valor' in atual ? atual.valor : base), LIMITES_DA_TABELA.valor.min, LIMITES_DA_TABELA.valor.max)) }
      : { multiplicador: duasCasas(aparar((refDegrau?.valor ?? base) / base, LIMITES_DA_TABELA.multiplicador.min, LIMITES_DA_TABELA.multiplicador.max)) }
    emitir(degraus.map((d, k) => (k === i ? novo : d)))
  }
  const trocarNumero = (i: number, n: number) => emitir(degraus.map((d, k) => (k === i ? ('valor' in d ? { valor: n } : { multiplicador: n }) : d)))
  const remover = (i: number) => emitir(degraus.filter((_, k) => k !== i))
  const adicionar = () => {
    if (degraus.length >= LIMITES_DA_TABELA.degraus.max) return
    const ultimo = degraus[degraus.length - 1]
    emitir([...degraus, ultimo ? { ...ultimo } : { multiplicador: 2 }])
  }
  const duplicarUltimo = () => { if (degraus.length && degraus.length < LIMITES_DA_TABELA.degraus.max) emitir([...degraus, { ...degraus[degraus.length - 1] }]) }

  /** Copia a escada que a fórmula calcula hoje (8 degraus) como ponto de partida. */
  const preencherComFormula = () => {
    const pFormula: ParametrosDoRobo = { ...parametros, recuperacao: { ...parametros.recuperacao, escada: { tipo: 'formula' } } }
    const lista = escadaDoRobo(id, base, 9, modo, pFormula)
      .slice(1)
      .filter((d) => !d.esgotada)
      .map((d) => ({ multiplicador: duasCasas(aparar(d.valor / base, LIMITES_DA_TABELA.multiplicador.min, LIMITES_DA_TABELA.multiplicador.max)) }))
    if (lista.length) emitir(lista)
  }

  /** Progressão ×k: multiplicadores compostos (k, k², k³…) absolutos sobre a base. */
  const progressao = () => {
    const resposta = window.prompt('Multiplicar por quanto a cada degrau? (ex.: 2 = dobra a cada perda)', '2')
    if (resposta === null) return
    const k = Number(resposta.replace(',', '.'))
    if (!Number.isFinite(k) || k < 1) { window.alert('Use um número maior ou igual a 1.') ; return }
    const quantos = degraus.length || 8
    const lista: DegrauTabela[] = []
    for (let i = 1; i <= quantos; i++) {
      const m = duasCasas(Math.pow(k, i))
      if (m > LIMITES_DA_TABELA.multiplicador.max) break
      lista.push({ multiplicador: m })
    }
    if (lista.length) emitir(lista)
  }

  const aplicarColado = () => {
    const numeros = multiplicadoresDoTexto(textoColado)
    if (!numeros.length) { window.alert('Não achei números na coluna colada.') ; return }
    emitir(numeros.map((n) => ({ multiplicador: duasCasas(aparar(n, LIMITES_DA_TABELA.multiplicador.min, LIMITES_DA_TABELA.multiplicador.max)) })))
    setColando(false)
    setTextoColado('')
  }

  const foraDaFaixa = (d: DegrauTabela) => 'valor' in d
    ? d.valor < LIMITES_DA_TABELA.valor.min || d.valor > LIMITES_DA_TABELA.valor.max
    : d.multiplicador < LIMITES_DA_TABELA.multiplicador.min || d.multiplicador > LIMITES_DA_TABELA.multiplicador.max

  return (
    <div className="go-planilha ac-planilha">
      <div className="ac-planilha-acoes">
        <button type="button" className="ac-btn mini" onClick={adicionar} disabled={degraus.length >= LIMITES_DA_TABELA.degraus.max}>+ degrau</button>
        <button type="button" className="ac-btn mini" onClick={duplicarUltimo} disabled={!degraus.length || degraus.length >= LIMITES_DA_TABELA.degraus.max}>Duplicar último</button>
        <button type="button" className="ac-btn mini" onClick={preencherComFormula} title="Copia a escada que a fórmula calcula hoje, como ponto de partida">Preencher com a fórmula</button>
        <button type="button" className="ac-btn mini" onClick={progressao} title="Gera multiplicadores compostos: k, k², k³…">Progressão ×k</button>
        <button type="button" className="ac-btn mini" onClick={() => setColando((v) => !v)}>{colando ? 'Fechar' : 'Colar do Excel'}</button>
      </div>
      {colando && (
        <div className="ac-planilha-colar">
          <textarea
            aria-label="Coluna de multiplicadores colada de uma planilha"
            placeholder={'Uma coluna de números, um por linha:\n2\n4\n8,5'}
            value={textoColado}
            onChange={(e) => setTextoColado(e.target.value)}
          />
          <div className="ac-planilha-acoes" style={{ padding: 0 }}>
            <button type="button" className="ac-btn mini primario" onClick={aplicarColado}>Usar estes números como multiplicadores</button>
            <span className="ac-nota" style={{ margin: 0 }}>Cada número vira "× da base" — escala com a entrada do cliente.</span>
          </div>
        </div>
      )}
      <div className="ac-planilha-scroll">
        <div className="go-tabela-cab">
          <span>Degrau</span><span>Regra</span><span>Número</span><span>Com base {usd(0.35)}</span><span>Com base {usd(base)}</span>
          <span>Pagamento</span><span>Lucro se acertar</span><span>Perda acumulada</span><span>Cobre?</span><span>Markup</span><span />
        </div>
        <div className="go-tabela-corpo">
          {!degraus.length && <div className="ac-vazio" style={{ gridColumn: '1 / -1', minWidth: 0 }}>Sem degraus ainda. Use "Preencher com a fórmula" para começar pela escada de hoje.</div>}
          {degraus.map((d, i) => {
            const ref = calculada.ref[i + 1]
            const piso = calculada.piso[i + 1]
            const cobre = ref ? ref.cobre : true
            return (
              <div key={i} className={cobre ? '' : 'nao-cobre'}>
                <span className="ac-planilha-degrau"><b>{i + 1}</b><small>após {i + 1} {i === 0 ? 'perda' : 'perdas'}</small></span>
                <span>
                  <select className="ac-select" aria-label={`Regra do degrau ${i + 1}`} value={'valor' in d ? 'valor' : 'multiplicador'} onChange={(e) => trocarRegra(i, e.target.value as 'multiplicador' | 'valor')}>
                    <option value="multiplicador">× da base</option>
                    <option value="valor">USD fixo</option>
                  </select>
                </span>
                <span>
                  <CampoNumero
                    rotulo={`Número do degrau ${i + 1}`}
                    valor={'valor' in d ? d.valor : d.multiplicador}
                    passo={'valor' in d ? 0.05 : 0.1}
                    invalido={foraDaFaixa(d)}
                    onChange={(n) => trocarNumero(i, n)}
                  />
                </span>
                <b className="pouco">{piso ? usd(piso.valor) : '—'}</b>
                <b>{ref ? usd(ref.valor) : '—'}</b>
                <b className="pouco">{ref ? usd(ref.pagamento) : '—'}</b>
                <b>{ref ? usd(ref.lucro) : '—'}</b>
                <b className="pouco">{ref ? usd(ref.perdido) : '—'}</b>
                {ref ? <em className={cobre ? 'sim' : 'nao'} title={cobre ? 'Ganhar aqui cobre tudo o que foi perdido antes' : 'Ganhar aqui não cobre o prejuízo acumulado'}>{cobre ? '✓ cobre' : '✕ não cobre'}</em> : <span />}
                <b className="pouco">{ref ? usd4(ref.markup) : '—'}</b>
                <button type="button" className="ac-planilha-remover" aria-label={`Remover o degrau ${i + 1}`} onClick={() => remover(i)} disabled={degraus.length <= LIMITES_DA_TABELA.degraus.min}>✕</button>
              </div>
            )
          })}
        </div>
      </div>
      <p className="ac-nota" style={{ padding: '8px 10px 0' }}>
        Multiplicador é sobre a entrada base do cliente (escala com ele). USD fixo vale igual para todos. Limites: {LIMITES_DA_TABELA.degraus.min} a {LIMITES_DA_TABELA.degraus.max} degraus · multiplicador {LIMITES_DA_TABELA.multiplicador.min} a {LIMITES_DA_TABELA.multiplicador.max} · valor {usd(LIMITES_DA_TABELA.valor.min)} a {usd(LIMITES_DA_TABELA.valor.max)}.
      </p>
    </div>
  )
}
