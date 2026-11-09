/**
 * O vídeo de boas-vindas (GlobalFly, 08/11/2026).
 *
 * Pedido do Tiago, na grade das aulas do Victor: "Pop-Up automático de início
 * no primeiro acesso". Na primeira vez que a pessoa entra, abre sozinha a
 * primeira aula do "Comece aqui" (Introdução à GlobalFly Trade), antes do
 * tour guiado. Toca no player da plataforma, então conta para o controle de
 * quem assistiu igual à sala de aula.
 *
 * O vídeo é sempre a primeira aula com vídeo da grade publicada: trocou a
 * aula no painel, troca aqui. Fechou, não volta (vale por conta, neste
 * aparelho; e quem já abriu a aula pela sala também não vê de novo).
 *
 * 08/11/2026, noite (áudios do Victor): o vídeo é obrigatório. Começa sozinho,
 * sem pular nem adiantar, e não há como sair até o fim: o X só aparece quando
 * o vídeo termina (ou se ele não abrir, para ninguém ficar preso). Na janela,
 * só "Boas-vindas, fulano" e o vídeo. Fechou no X, segue o passo a passo.
 * Recarregar a página antes do fim traz o vídeo de novo.
 */
import { useEffect, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { marcarVista, playerDoVideo, type Aula } from '../../core/teeds/aulas'
import { gradePublicadaEmCache, modulosParaSala, type GradeAulas } from '../../core/teeds/gradeAulas'
import { registrarAula } from '../../core/teeds/insights'
import { PlayerAula } from '../PlayerAula'
import './boas-vindas-video.css'

const FIM = 'Pronto! Feche no X para ver o seu passo a passo.'
export const chaveDoVideoDeBoasVindas = (usuarioId: string) => `globalfly.boasvindas.video.${usuarioId}`

export function BoasVindasEmVideo({ sessao, nome, plano, admin, aoFechar, aoSemVideo, grade }: {
  sessao: SessaoTeeds | null
  nome: string
  plano: string | null
  admin: boolean | null
  /** irParaAulas = a pessoa pediu para ver as outras aulas */
  aoFechar: (irParaAulas: boolean) => void
  /** Não há vídeo para mostrar (ou o banco não respondeu): some sem marcar como visto. */
  aoSemVideo?: () => void
  /** Laboratório: a grade vem pronta (e nada vai para o banco). */
  grade?: GradeAulas
}) {
  const [aula, setAula] = useState<(Aula & { cor: string; proprio?: boolean }) | null | undefined>(undefined)
  const conta = useRef({ acumulado: 0, ultimo: -1, duracao: 0, concluida: false })
  // o X só existe depois do fim do vídeo (ou se o vídeo não abriu)
  const [podeFechar, setPodeFechar] = useState(false)
  const botaoX = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (podeFechar) botaoX.current?.focus() }, [podeFechar])

  useEffect(() => {
    let vivo = true
    void (grade ? Promise.resolve(grade) : gradePublicadaEmCache(sessao)).then((g) => {
      if (!vivo) return
      if (!g) { setAula(null); return }
      const modulos = modulosParaSala(g, { plano, admin })
      // um vídeo próprio do pop-up, escolhido no painel (08/11/2026)
      if (g.boasVindas?.video) {
        setAula({ id: 'boas-vindas', titulo: 'Vídeo de boas-vindas', descricao: '', video: g.boasVindas.video, duracao: '', cor: modulos[0]?.cor ?? 'var(--primary)', proprio: true })
        return
      }
      for (const m of modulos) {
        const a = m.aulas.find((x) => x.video && !x.bloqueio)
        if (a) { setAula({ ...a, cor: m.cor }); return }
      }
      setAula(null)
    }).catch(() => { if (vivo) setAula(null) })
    return () => { vivo = false }
  }, [sessao, plano, admin, grade])

  // sem vídeo publicado: não há o que mostrar (e não marca como visto)
  useEffect(() => { if (aula === null) (aoSemVideo ?? (() => aoFechar(false)))() }, [aula]) // eslint-disable-line react-hooks/exhaustive-deps

  // abriu: conta como aberta no controle de quem assistiu
  useEffect(() => { if (aula) void registrarAula(sessao, aula.id, { abriu: true }) }, [aula?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = (posicao: number, concluida = false) => {
    const t = conta.current
    if (!aula || (t.acumulado <= 0 && !concluida)) return
    const segundos = Math.round(t.acumulado); t.acumulado = 0
    void registrarAula(sessao, aula.id, { segundos, posicao, concluida, duracao: t.duracao })
  }
  const aoAvancar = (fracao: number, segundos: number) => {
    const t = conta.current
    const delta = t.ultimo >= 0 ? segundos - t.ultimo : 0
    if (delta > 0 && delta < 2.5) t.acumulado += delta
    t.ultimo = segundos
    if (fracao > 0.02 && !t.duracao) t.duracao = Math.round(segundos / fracao)
    if (t.acumulado >= 20) enviar(fracao)
    if (fracao >= 0.9 && !t.concluida) {
      t.concluida = true; enviar(fracao, true)
      // a aula do curso vista no pop-up já conta como assistida na sala
      if (aula && !aula.proprio) marcarVista(aula.id, true)
    }
  }
  const fechar = () => { if (!podeFechar) return; enviar(0); aoFechar(false) }

  // Esc fecha, mas só depois do fim do vídeo
  useEffect(() => {
    // com o vídeo em tela cheia, o Esc só sai da tela cheia
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement && !document.querySelector('.cheia-falsa')) fechar() }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }) // sempre a versão atual de fechar

  if (!aula) return null
  const player = playerDoVideo(aula.video)
  const primeiro = nome.trim().split(/\s+/)[0]

  return (
    <div className="bvv-fundo" role="dialog" aria-modal="true" aria-labelledby="bvv-titulo">
      <div className="bvv-janela" style={{ ['--aula' as string]: aula.cor }}>
        {podeFechar && <button ref={botaoX} type="button" className="bvv-x bvv-x-pronto" onClick={fechar} aria-label="Fechar e ver o passo a passo">×</button>}
        <header className="bvv-cab">
          <h2 id="bvv-titulo">{primeiro ? `Boas-vindas, ${primeiro}!` : 'Boas-vindas!'}</h2>
        </header>
        <div className="bvv-video cine-video">
          {player?.tipo === 'youtube' && player.id ? (
            <PlayerAula src="" youtube={player.id} titulo={aula.titulo} aoAvancar={aoAvancar} proxima={null} textoDoFim={FIM} obrigatorio aoTerminar={() => setPodeFechar(true)} aoErro={() => setPodeFechar(true)} />
          ) : player?.tipo === 'mp4' ? (
            <PlayerAula src={player.src} titulo={aula.titulo} aoAvancar={aoAvancar} proxima={null} textoDoFim={FIM} obrigatorio aoTerminar={() => setPodeFechar(true)} aoErro={() => setPodeFechar(true)} />
          ) : player ? (
            <iframe src={player.src} title={aula.titulo} allowFullScreen allow="autoplay; encrypted-media; picture-in-picture" onLoad={() => setPodeFechar(true)} />
          ) : null}
        </div>
      </div>
    </div>
  )
}
