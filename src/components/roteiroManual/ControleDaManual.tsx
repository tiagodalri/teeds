/**
 * O controle do roteiro da manual (16/11/2026): uma faixa discreta em cima da boleta (e da Multitela), só no
 * modo simulado e só para administradores; some com o olhinho dos itens de admin. Mostra em que operação do
 * roteiro a aula está, o placar, e deixa decidir na hora o resultado da próxima (Ganha, Perde ou Mercado).
 * A entrada da próxima operação do roteiro já vem na boleta.
 */
import { lazy, Suspense, useEffect, useState } from 'react'
import { dinheiroComSinal } from '../../core/dinheiro'
import { decidirProxima, proximaDoRoteiro, recomecarRoteiro, useRoteiroManual, type Resultado } from '../../core/teeds/roteiroManual'
import './roteiro-manual.css'

const RoteiroDaManual = lazy(() => import('./RoteiroDaManual').then((m) => ({ default: m.RoteiroDaManual })))

/** A operação do roteiro cuja entrada já foi para a boleta (remontar o controle não sobrescreve o valor digitado). */
let entradaJaAplicada: string | null = null

const NOMES: Record<Resultado, string> = { ganha: 'Ganha', perde: 'Perde', mercado: 'Mercado' }
const DICAS: Record<Resultado, string> = {
  ganha: 'A próxima operação ganha',
  perde: 'A próxima operação perde',
  mercado: 'O preço de verdade decide a próxima',
}

export function ControleDaManual({ aoDefinirEntrada, compacto = false }: {
  /** A entrada da próxima operação do roteiro vai para a boleta. */
  aoDefinirEntrada?: (valor: number) => void
  /** Na Multitela: numa linha só. */
  compacto?: boolean
}) {
  const r = useRoteiroManual()
  const [editando, setEditando] = useState(false)
  const prox = proximaDoRoteiro(r)
  const total = r.itens.length
  const temRoteiro = total > 0
  const acabou = temRoteiro && r.feitas >= total
  const fechadas = r.rodada.filter((f) => f.ganhou !== null)
  const ganhos = fechadas.filter((f) => f.ganhou).length
  const soma = Math.round(fechadas.reduce((s, f) => s + (f.lucro ?? 0), 0) * 100) / 100

  // a entrada da próxima do roteiro já vem na boleta (uma vez por operação)
  useEffect(() => {
    if (prox.indice === null || prox.entrada === null || prox.entrada <= 0) return
    const chave = `${r.itens.length}:${prox.indice}:${prox.entrada}`
    if (chave === entradaJaAplicada) return
    entradaJaAplicada = chave
    aoDefinirEntrada?.(prox.entrada)
  }, [prox.indice, prox.entrada]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`rmn-controle ${compacto ? 'compacto' : ''}`} role="region" aria-label="Roteiro da manual (só administradores veem)">
      <div className="rmn-topo">
        <i className="rmn-ponto" aria-hidden="true" />
        <b>{!temRoteiro ? 'Sem roteiro' : acabou ? `Roteiro concluído · ${total} de ${total}` : `Roteiro · operação ${r.feitas + 1} de ${total}`}</b>
        {fechadas.length > 0 && (
          <span className="rmn-placar" title="Desta rodada">
            {ganhos} {ganhos === 1 ? 'ganho' : 'ganhos'} · {fechadas.length - ganhos} {fechadas.length - ganhos === 1 ? 'perda' : 'perdas'} · <em className={soma < 0 ? 'cai' : 'sobe'}>{dinheiroComSinal(soma, 'USD')}</em>
          </span>
        )}
        <button type="button" className="rmn-link" onClick={() => setEditando(true)}>{temRoteiro ? 'Editar' : 'Montar roteiro'}</button>
      </div>
      <div className="rmn-proxima">
        <span>{acabou || !temRoteiro ? 'Próximas' : 'Próxima'}</span>
        <div className="rmn-seg" role="radiogroup" aria-label="Resultado da próxima operação">
          {(['ganha', 'perde', 'mercado'] as const).map((x) => (
            <button key={x} type="button" role="radio" aria-checked={prox.resultado === x} title={DICAS[x]}
              className={`${x} ${prox.resultado === x ? 'on' : ''}`} onClick={() => decidirProxima(x)}>{NOMES[x]}</button>
          ))}
        </div>
        {acabou && <button type="button" className="rmn-link" onClick={recomecarRoteiro}>Recomeçar</button>}
      </div>
      {editando && (
        <Suspense fallback={null}>
          <RoteiroDaManual aoFechar={() => setEditando(false)} />
        </Suspense>
      )}
    </div>
  )
}
