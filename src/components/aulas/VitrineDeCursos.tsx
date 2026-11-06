import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { CursoNaSala } from '../../core/teeds/gradeAulas'
import { MARCA } from '../../marca'
import { IconeFechar } from '../IconeFechar'
import './vitrine-de-cursos.css'

/*
  A vitrine dos cursos (06/11/2026): a porta da sala quando há mais de um
  curso. Primeiro os cursos da pessoa, depois os que ela pode liberar.
  Curso trancado abre uma janela com o que ele ensina e, se for vendido à
  parte, o botão para o checkout da Cakto.
*/

export function CapaDoCurso({ curso, grande = false }: { curso: Pick<CursoNaSala, 'titulo' | 'capa' | 'cor'>; grande?: boolean }) {
  if (curso.capa) return <img className="vc-capa-img" src={curso.capa} alt="" loading="lazy" />
  // sem imagem: a capa desenhada, na cor do curso
  return (
    <span className={`vc-capa-desenho ${grande ? 'grande' : ''}`} style={{ ['--vc' as string]: curso.cor }} aria-hidden="true">
      <i className="vc-capa-luz" />
      <b>{curso.titulo || 'Curso'}</b>
      <small>{MARCA.prosa}</small>
    </span>
  )
}

const IconeCadeado = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 018 0v3" />
  </svg>
)

function CartaoDoCurso({ curso, feitas, aoAbrir }: { curso: CursoNaSala; feitas: number; aoAbrir: () => void }) {
  const fracao = curso.aulas ? feitas / curso.aulas : 0
  return (
    <button type="button" className={`vc-cartao ${curso.liberado ? '' : 'trancado'}`} style={{ ['--vc' as string]: curso.cor }} onClick={aoAbrir}
      aria-label={`${curso.titulo}${curso.liberado ? '' : `, trancado: ${curso.motivo}`}`}>
      <span className="vc-capa">
        <CapaDoCurso curso={curso} />
        {curso.selo && <em className="vc-selo">{curso.selo}</em>}
        {!curso.liberado && <span className="vc-tranca" aria-hidden="true"><IconeCadeado /></span>}
        <span className="vc-sombra" aria-hidden="true" />
        <span className="vc-texto">
          <b>{curso.titulo}</b>
          <small>{curso.modulos.length} {curso.modulos.length === 1 ? 'módulo' : 'módulos'} · {curso.aulas} {curso.aulas === 1 ? 'aula' : 'aulas'}</small>
          {!curso.liberado && <small className="vc-motivo">{curso.motivo}</small>}
          {curso.liberado && (
            <span className="vc-progresso" aria-label={`${feitas} de ${curso.aulas} aulas concluídas`}>
              <i><u style={{ width: `${Math.round(fracao * 100)}%` }} /></i>
              <small>{feitas ? `${Math.round(fracao * 100)}% concluído` : 'Comece agora'}</small>
            </span>
          )}
        </span>
      </span>
      {curso.descricao && <span className="vc-descricao">{curso.descricao}</span>}
    </button>
  )
}

export function VitrineDeCursos({ cursos, vistas, nome, aoAbrir, aoVerTrancado }: {
  cursos: CursoNaSala[]; vistas: Set<string>; nome?: string | null
  aoAbrir: (id: string) => void; aoVerTrancado: (id: string) => void
}) {
  const feitasDe = (c: CursoNaSala) => c.modulos.reduce((n, m) => n + m.aulas.filter((a) => vistas.has(a.id)).length, 0)
  const meus = cursos.filter((c) => c.liberado), outros = cursos.filter((c) => !c.liberado)
  const concluidas = meus.reduce((n, c) => n + feitasDe(c), 0)
  const total = meus.reduce((n, c) => n + c.aulas, 0)
  return (
    <section className="vc" aria-labelledby="vc-titulo">
      <header className="vc-topo">
        <div>
          <span className="vc-rot">Área de membros</span>
          <h2 id="vc-titulo">{nome ? `Seus cursos, ${nome.split(' ')[0]}` : 'Seus cursos'}</h2>
          <p>{meus.length} {meus.length === 1 ? 'curso liberado' : 'cursos liberados'}{total ? ` · ${concluidas} de ${total} aulas concluídas` : ''}</p>
        </div>
      </header>
      {meus.length > 0 && <div className="vc-grade">{meus.map((c) => <CartaoDoCurso key={c.id} curso={c} feitas={feitasDe(c)} aoAbrir={() => aoAbrir(c.id)} />)}</div>}
      {outros.length > 0 && (
        <>
          <h3 className="vc-subtitulo">Para liberar <small>{outros.length} {outros.length === 1 ? 'curso' : 'cursos'}</small></h3>
          <div className="vc-grade">{outros.map((c) => <CartaoDoCurso key={c.id} curso={c} feitas={0} aoAbrir={() => aoVerTrancado(c.id)} />)}</div>
        </>
      )}
    </section>
  )
}

/** A janela do curso trancado: o que ele ensina e como liberar. */
export function JanelaDoCursoTrancado({ curso, aoFechar, aoVerConteudo }: { curso: CursoNaSala; aoFechar: () => void; aoVerConteudo: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal(); const d = ref.current; return () => d?.close() }, [])
  const janela = (
    <dialog ref={ref} className="vc-janela" aria-label={curso.titulo} onCancel={(e) => { e.preventDefault(); aoFechar() }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar() }} style={{ ['--vc' as string]: curso.cor }}>
      <div className="vc-janela-caixa">
        <button type="button" className="vc-janela-fechar" onClick={aoFechar} aria-label="Fechar"><IconeFechar /></button>
        <div className="vc-janela-capa"><CapaDoCurso curso={curso} grande /></div>
        <div className="vc-janela-corpo">
          <span className="vc-janela-tranca"><IconeCadeado />{curso.motivo}</span>
          <h2>{curso.titulo}</h2>
          {(curso.sobre || curso.descricao) && <p>{curso.sobre || curso.descricao}</p>}
          <ul className="vc-janela-numeros">
            <li><b>{curso.modulos.length}</b> {curso.modulos.length === 1 ? 'módulo' : 'módulos'}</li>
            <li><b>{curso.aulas}</b> {curso.aulas === 1 ? 'aula' : 'aulas'}</li>
          </ul>
          <ol className="vc-janela-modulos">
            {curso.modulos.slice(0, 6).map((m, i) => <li key={m.id}><i>{String(i + 1).padStart(2, '0')}</i><span><b>{m.titulo}</b><small>{m.aulas.length} {m.aulas.length === 1 ? 'aula' : 'aulas'}</small></span></li>)}
            {curso.modulos.length > 6 && <li className="mais">e mais {curso.modulos.length - 6} módulos</li>}
          </ol>
          <div className="vc-janela-acoes">
            {curso.checkout && <a className="vc-comprar" href={curso.checkout} target="_blank" rel="noopener noreferrer">Liberar meu acesso</a>}
            <button type="button" className="vc-ver" onClick={aoVerConteudo}>Ver o conteúdo do curso</button>
          </div>
          {curso.checkout && <small className="vc-janela-nota">Use no pagamento o mesmo e-mail da sua conta {MARCA.prosa}: o curso abre aqui sozinho assim que o pagamento for aprovado.</small>}
        </div>
      </div>
    </dialog>
  )
  return createPortal(janela, document.body)
}
