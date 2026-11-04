import { useEffect, useState } from 'react'
import type { GradeAulas } from '../../core/teeds/gradeAulas'
import { AulasPanel } from '../AulasPanel'

/**
 * A prévia da sala de aula (04/11/2026): o painel abre a plataforma num
 * quadro (`?previa=aulas`) e entrega a grade em edição por aqui. É a sala de
 * verdade, com os mesmos cartões, o player e o layout do celular quando o
 * quadro está estreito. Nada é gravado: nem progresso, nem aula assistida no banco.
 */
interface DadosDaPrevia { grade: GradeAulas; plano: string | null; aulaId?: string | null }
type JanelaComPrevia = Window & { __previaAulas?: DadosDaPrevia }

export const EH_PREVIA_DAS_AULAS = typeof location !== 'undefined' && new URLSearchParams(location.search).get('previa') === 'aulas' && window.parent !== window

function ler(): DadosDaPrevia | null {
  try { return (window.parent as JanelaComPrevia).__previaAulas ?? null } catch { return null }
}

export default function PreviaDasAulas() {
  const [dados, setDados] = useState<DadosDaPrevia | null>(ler)
  useEffect(() => {
    const ouvir = (e: MessageEvent) => { if (e.origin === location.origin && e.data?.tipo === 'previa-aulas') setDados(ler()) }
    window.addEventListener('message', ouvir)
    return () => window.removeEventListener('message', ouvir)
  }, [])
  if (!dados) return <div className="ger"><div className="adm-vazio">Abrindo a prévia…</div></div>
  return (
    <div className="app workspace-app previa-das-aulas">
      <main className="workspace-main">
        <AulasPanel key={JSON.stringify(dados.plano)} previa={dados.grade} plano={dados.plano} admin={false} nome={null} />
      </main>
    </div>
  )
}
