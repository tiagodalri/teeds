/**
 * O pop-up da estreia do dia (27/11/2026).
 *
 * Pedido do Victor (repassado pelo Tiago): "enviar notificação no acesso de
 * cada um que vai subir aulas na prática com as I.A. Definir horário no
 * lembrete pra gerar aquela expectativa, fazendo eles assistirem."
 *
 * No dia de uma estreia da série (módulo com `serie` na grade), quem entra vê:
 *  - antes do horário: a arte da aula, "Hoje, às 19h", a contagem e o botão
 *    "Me avise às 19h" (liga as notificações neste aparelho);
 *  - depois: "No ar agora" e "Assistir agora" (abre a aula na sala).
 * Uma vez por fase, por pessoa, neste aparelho. A janela vira sozinha de
 * "antes" para "no ar" se estiver aberta na hora. Quem já assistiu não vê.
 * O App só monta isto sem live, sem tour, sem o vídeo de boas-vindas e sem
 * operação aberta.
 */
import { useEffect, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { aulasVistas, type Aula } from '../../core/teeds/aulas'
import { gradePublicadaEmCache, meusCursosEmCache, modulosParaSala, type GradeAulas } from '../../core/teeds/gradeAulas'
import { baixarLembrete, contagem, estreiaDeHoje, pedirAula, quandoEstreia, useAgora, type EstreiaDoDia as Estreia } from '../../core/teeds/estreias'
import { ativarNotificacoes, estadoDasNotificacoes, type EstadoDasNotificacoes } from '../../core/teeds/notificacoes'
import { bannerDaEstreia } from '../capasAulas'
import { MARCA } from '../../marca'
import { CapaDaAula } from './CapaDaAula'
import { Monograma } from '../marca/Monograma'
import './estreia-do-dia.css'

const chave = (uid: string, aula: string, fase: string) => `${MARCA.id}.estreia.${aula}.${fase}.${uid}`
const jaViu = (uid: string, aula: string, fase: string) => { try { return !!localStorage.getItem(chave(uid, aula, fase)) } catch { return false } }
const marcar = (uid: string, aula: string, fase: string) => { try { localStorage.setItem(chave(uid, aula, fase), new Date().toISOString()) } catch { /* só nesta visita */ } }

export function EstreiaDoDia({ sessao, plano, aoAssistir, grade, agoraFixo }: {
  sessao: SessaoTeeds | null
  plano: string | null
  /** Abrir a sala de aulas (a aula pedida abre sozinha lá). */
  aoAssistir: () => void
  /** Laboratório: grade pronta e hora fixa (nada é gravado como visto). */
  grade?: GradeAulas
  agoraFixo?: number
}) {
  const uid = sessao?.usuario.id ?? 'lab'
  const lab = !!grade
  const [estreia, setEstreia] = useState<Estreia | null>(null)
  const [aberta, setAberta] = useState(false)
  // reavalia a estreia: ao voltar para a aba, na hora da liberação e a cada 6 h (aba aberta desde ontem)
  const [rodada, setRodada] = useState(0)
  const fase = useRef<'antes' | 'no-ar' | null>(null)
  const relogio = useAgora(1000, aberta)
  const inicio = useRef(Date.now())
  const agora = agoraFixo !== undefined ? agoraFixo + (relogio - inicio.current) : relogio
  const [aviso, setAviso] = useState<EstadoDasNotificacoes | 'ligando' | 'ligou' | 'erro' | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const h = () => { if (document.visibilityState === 'visible') setRodada((n) => n + 1) }
    document.addEventListener('visibilitychange', h)
    return () => document.removeEventListener('visibilitychange', h)
  }, [])

  useEffect(() => {
    if (aberta || (lab && estreia)) return
    let vivo = true
    let proxima: ReturnType<typeof setTimeout> | undefined
    let abrir: ReturnType<typeof setTimeout> | undefined
    void Promise.all([grade ? Promise.resolve(grade) : gradePublicadaEmCache(sessao), grade ? Promise.resolve(new Set<string>()) : meusCursosEmCache(sessao)]).then(([g, meus]) => {
      if (!vivo || !g) return
      const t = agoraFixo ?? Date.now()
      const ctx = { plano, meusCursos: meus }
      const e = estreiaDeHoje(modulosParaSala(g, { ...ctx, agora: t }), t)
      if (!lab) proxima = setTimeout(() => setRodada((n) => n + 1), Math.min(e && e.fase === 'antes' ? e.liberaEm - t + 1500 : Infinity, 6 * 3600_000))
      if (!e) return
      // só anuncia a quem vai poder assistir na hora (plano e curso valem igual à sala)
      const naHora = modulosParaSala(g, { ...ctx, agora: e.liberaEm + 1000 }).flatMap((m) => m.aulas).find((a) => a.id === e.aula.id)
      if (!naHora || naHora.bloqueio) return
      if (!lab && (aulasVistas().has(e.aula.id) || jaViu(uid, e.aula.id, e.fase))) return
      // um respiro antes de abrir: o App ainda pode estar lendo o perfil (tour), as I.A. e a live; se um
      // deles fechar a vez, nada foi marcado como visto e a janela volta na próxima oportunidade
      abrir = setTimeout(() => { if (!vivo) return; fase.current = e.fase; setEstreia(e); setAberta(true) }, lab ? 300 : 2500)
    })
    if (aviso === null) void estadoDasNotificacoes().then((x) => { if (vivo) setAviso(x) }).catch(() => undefined)
    return () => { vivo = false; clearTimeout(proxima); clearTimeout(abrir) }
  }, [sessao?.usuario.id, rodada, aberta]) // eslint-disable-line react-hooks/exhaustive-deps

  // aberta antes das 19h e chegou a hora: vira "no ar"
  const noAr = !!estreia && (fase.current === 'no-ar' || agora >= estreia.liberaEm)
  // conta como visto depois de 2 s na tela (fase atual); fechou antes disso, também conta (ver fechar)
  useEffect(() => {
    if (!aberta || !estreia || lab) return
    const t = setTimeout(() => marcar(uid, estreia.aula.id, noAr ? 'no-ar' : 'antes'), 2000)
    return () => clearTimeout(t)
  }, [aberta, estreia, noAr, uid, lab])
  const fechar = () => {
    if (estreia && !lab) { marcar(uid, estreia.aula.id, noAr ? 'no-ar' : 'antes'); if (noAr) marcar(uid, estreia.aula.id, 'antes') }
    if (noAr) fase.current = 'no-ar'
    setAberta(false)
  }

  // Esc fecha
  useEffect(() => {
    if (!aberta) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  if (!estreia || !aberta) return null
  const { aula, modulo, episodio, total } = estreia
  const q = quandoEstreia(new Date(estreia.liberaEm).toISOString(), agora)
  const banner = bannerDaEstreia(aula.id)

  const avisar = async () => {
    if (!sessao) { setAviso('ligou'); return }
    setAviso('ligando'); setErro('')
    try { await ativarNotificacoes(sessao); setAviso('ligou') } catch (e) { setAviso('erro'); setErro((e as Error).message) }
  }
  const agenda = () => baixarLembrete({ id: aula.id, titulo: `${modulo.titulo} · EP ${episodio}: ${aula.titulo}`, quando: estreia.liberaEm })
  const assistir = () => { if (!lab) { marcar(uid, aula.id, 'no-ar'); marcar(uid, aula.id, 'antes') } pedirAula(aula.id); setAberta(false); aoAssistir() }

  return (
    <div className="edd-fundo" role="presentation" onClick={fechar}>
      <section className={`edd${noAr ? ' edd-noar' : ''}`} role="dialog" aria-modal="true" aria-labelledby="edd-titulo" onClick={(e) => e.stopPropagation()}
        style={{ ['--aula' as string]: modulo.cor }}>
        <button type="button" className="edd-x" onClick={fechar} aria-label="Fechar">×</button>
        <div className="edd-arte">
          {banner ? <img src={banner} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
            : <CapaDaAula aula={aula as Aula} cor={modulo.cor} numero={episodio} alt="" />}
          <span className="edd-selo">{noAr ? <><i aria-hidden="true" />No ar agora</> : <>Estreia hoje · {q.hora}</>}</span>
        </div>
        <div className="edd-corpo">
          <span className="edd-rot"><Monograma tamanho={18} /> {modulo.titulo} · EP {episodio} de {total}</span>
          <h2 id="edd-titulo">{aula.titulo}</h2>
          {aula.descricao && <p className="edd-desc">{aula.descricao}</p>}
          {!noAr ? (
            <div className="edd-relogio" role="timer">
              <small>Libera às {q.hora} em</small>
              <b>{contagem(estreia.liberaEm - agora)}</b>
            </div>
          ) : (
            <p className="edd-pronta">A aula já está liberada na sua área de Aulas. Assista agora, antes de operar.</p>
          )}
          <div className="edd-acoes">
            {noAr ? (
              <>
                <button type="button" className="edd-principal" onClick={assistir}>▶ Assistir agora</button>
                <button type="button" className="edd-depois" onClick={fechar}>Depois</button>
              </>
            ) : aviso === 'ligadas' || aviso === 'ligou' ? (
              <>
                <span className="edd-ok" role="status">✓ Combinado: você recebe o aviso às {q.hora}</span>
                <button type="button" className="edd-depois" onClick={agenda}>📅 Pôr na agenda</button>
              </>
            ) : aviso === 'desligadas' || aviso === 'ligando' || aviso === 'erro' ? (
              <>
                <button type="button" className="edd-principal" onClick={() => void avisar()} disabled={aviso === 'ligando'}>
                  {aviso === 'ligando' ? 'Ligando o aviso…' : `🔔 Me avise às ${q.hora}`}
                </button>
                <button type="button" className="edd-depois" onClick={agenda}>📅 Pôr na agenda</button>
              </>
            ) : (
              <>
                <button type="button" className="edd-principal" onClick={agenda}>📅 Pôr na agenda: hoje, {q.hora}</button>
                <button type="button" className="edd-depois" onClick={fechar}>Agora não</button>
                {aviso === 'instalar' && <small className="edd-dica">Para receber o aviso no iPhone, adicione o app à Tela de Início (Compartilhar › Adicionar à Tela de Início).</small>}
                {aviso === 'bloqueadas' && <small className="edd-dica">As notificações estão bloqueadas neste aparelho: libere nos ajustes para receber o aviso.</small>}
              </>
            )}
          </div>
          {erro && <small className="edd-erro" role="alert">{erro}</small>}
          <small className="edd-letra">Os valores são o objetivo da estratégia, não uma garantia: resultados variam e operar envolve risco de perda.</small>
        </div>
      </section>
    </div>
  )
}
