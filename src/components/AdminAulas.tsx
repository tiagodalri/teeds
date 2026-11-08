import { useEffect, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { todasAsAulas } from '../core/teeds/aulas'
import { controleDasAulas, duracaoLegivel, fracaoAssistida, type AssistiuAula } from '../core/teeds/aulasVideos'
import { useModulosEmUso } from '../core/teeds/gradeAulas'
import { MARCA } from '../marca'
import { EditorDaGrade } from './aulas/EditorDaGrade'

/**
 * A aba "Aulas" do painel (04/11/2026): o editor da grade inteira
 * (aulas/EditorDaGrade.tsx) e, embaixo, a busca de quem assistiu o quê.
 * `marca`: a plataforma em foco no painel (o seletor do master), não a do site aberto.
 */
export function AdminAulas({ sessao, marca = MARCA.id }: { sessao: SessaoTeeds; marca?: string }) {
  return (
    <div className="admin-aulas">
      <EditorDaGrade sessao={sessao} marca={marca} />
      <BuscaDeAluno sessao={sessao} marca={marca} />
    </div>
  )
}

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function BuscaDeAluno({ sessao, marca }: { sessao: SessaoTeeds; marca: string }) {
  const [controle, setControle] = useState<AssistiuAula[]>([])
  const [busca, setBusca] = useState('')
  const modulos = useModulosEmUso(sessao, { admin: true })
  useEffect(() => { controleDasAulas(sessao, marca).then(setControle).catch(() => undefined) }, [sessao, marca])
  const catalogo = todasAsAulas({}, modulos)
  const tituloDaAula = (id: string) => catalogo.find((a) => a.id === id)?.titulo ?? (id === 'boas-vindas' ? 'Vídeo de boas-vindas (pop-up)' : id)
  const termo = busca.trim().toLowerCase()
  const achados = termo.length >= 2 ? controle.filter((c) => c.nome.toLowerCase().includes(termo) || c.email.toLowerCase().includes(termo)) : []
  const pct = (f: number) => `${Math.round(f * 100)}%`
  return (
    <section className="admin-card full admin-aulas-busca">
      <header><div><span className="rot">Quem assistiu</span><h3>Procure um aluno</h3></div><small>Segundos assistidos contam só com o vídeo tocando: avançar o vídeo não conta.</small></header>
      <input value={busca} placeholder="Nome ou e-mail do aluno" onChange={(e) => setBusca(e.target.value)} />
      {termo.length >= 2 && (achados.length
        ? <div className="adm-tabela-aulas"><table>
            <thead><tr><th>Aula</th><th>Plano</th><th>Abriu</th><th>Assistiu de fato</th><th>Chegou até</th><th>Situação</th><th>Última vez</th></tr></thead>
            <tbody>{achados.map((c) => (
              <tr key={`${c.userId}-${c.aulaId}`}>
                <td><b>{tituloDaAula(c.aulaId)}</b><small>{c.nome}</small></td>
                <td>{c.plano || '—'}</td>
                <td className="num">{c.aberturas}×</td>
                <td className="num"><span className="adm-barra-assistida"><i style={{ width: pct(fracaoAssistida(c)) }} /></span>{c.duracaoSeg ? pct(fracaoAssistida(c)) : '—'}<small>{duracaoLegivel(c.segundos)}{c.duracaoSeg ? ` de ${duracaoLegivel(c.duracaoSeg)}` : ''}</small></td>
                <td className="num">{pct(c.posicaoMax)}</td>
                <td>{c.concluida ? <em className="adm-status ativo">Concluiu</em> : <em className="adm-status suspenso">Não concluiu</em>}</td>
                <td className="num">{quando(c.ultimaVez)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        : <p className="adm-vazio">Ninguém com esse nome ou e-mail abriu uma aula ainda.</p>)}
    </section>
  )
}
