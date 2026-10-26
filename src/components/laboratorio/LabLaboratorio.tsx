import { useMemo } from 'react'
import { LaboratorioIA } from './LaboratorioIA'
import { MODELOS } from '../../core/laboratorio/receita'
import type { LabApi, ReceitaGuardada } from '../../core/laboratorio/dados'

/** Laboratório: o Laboratório de IA com o banco em memória (?tela=laboratorio-ia). Ticks e cotações são reais (conexão pública da Deriv). */
export default function LabLaboratorio() {
  const api = useMemo<LabApi>(() => {
    let n = 0
    const lista: ReceitaGuardada[] = [
      { id: 'r1', nome: 'Altos com loss virtual', receita: MODELOS[0].receita, situacao: 'simulada', versao: 3, criadoPorNome: 'Victor Cordeiro', alteradoEm: new Date().toISOString(),
        simulacao: { quando: new Date().toISOString(), ticks: 10800, entradas: 2700, acerto: 0.31, resultado: 41.2, maiorSequencia: 9, quebrou: false, saldo: 500, base: 1 } },
    ]
    const espera = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150))
    return {
      listar: () => espera([...lista]),
      salvar: ({ id, receita, situacao, simulacao }) => {
        const atual = lista.find((x) => x.id === id)
        const g: ReceitaGuardada = atual
          ? { ...atual, nome: receita.nome, receita, situacao: situacao ?? atual.situacao, simulacao: simulacao === undefined ? atual.simulacao : simulacao, versao: atual.versao + 1, alteradoEm: new Date().toISOString() }
          : { id: `n${++n}`, nome: receita.nome, receita, situacao: situacao ?? 'rascunho', simulacao: simulacao ?? null, versao: 1, criadoPorNome: 'Tiago Dal Ri', alteradoEm: new Date().toISOString() }
        const i = lista.findIndex((x) => x.id === g.id); if (i >= 0) lista[i] = g; else lista.unshift(g)
        return espera(g)
      },
      apagar: (id) => { lista.splice(lista.findIndex((x) => x.id === id), 1); return espera(undefined) },
    }
  }, [])
  return <div className="workspace-app" style={{ minHeight: '100vh', background: 'var(--bg)' }}><LaboratorioIA api={api} /></div>
}
