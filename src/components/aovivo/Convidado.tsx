import { useEffect, useState } from 'react'
import { infoDoConvite, type Live } from '../../core/live/api'
import { entrarComoConvidado, useSala } from '../../core/live/sala'
import { Brand } from '../Brand'
import { Contagem, Cronometro, SalaConectada, Som, quando } from './AoVivo'
import { MARCA } from '../../marca'
import './aovivo.css'

/**
 * A porta de quem chegou pelo link e não tem conta (fase de testes,
 * 18/10/2026): vê o que é a live, diz como quer ser chamado e entra. Com o
 * link público ligado. Nada dele fica gravado. A sala de treino não abre
 * por aqui: só membros do plano, com conta (19/10/2026).
 *
 * Quando a chave "link público" é desligada no estúdio, esta tela só mostra
 * o caminho para entrar na conta.
 */

const CHAVE_NOME = `${MARCA.id}.aovivo.convidado.nome`
const nomeGuardado = () => { try { return localStorage.getItem(CHAVE_NOME) ?? '' } catch { return '' } }

export function Convidado({ codigo, aoEntrarNaConta }: { codigo: string | null; treino?: boolean; aoEntrarNaConta: () => void }) {
  const s = useSala()
  const [info, setInfo] = useState<{ live: Live; publico: boolean } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [nome, setNome] = useState(nomeGuardado)
  const [entrando, setEntrando] = useState(false)

  // A live pode começar enquanto a pessoa espera: confere de novo a cada 15 s.
  useEffect(() => {
    if (!codigo) return
    let vivo = true
    const ver = () => infoDoConvite(codigo).then((i) => { if (vivo) { setInfo(i); setErro(null) } }).catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : 'Não consegui abrir este convite.') })
    ver()
    const t = window.setInterval(() => { if (s.fase === 'fora') ver() }, 15000)
    return () => { vivo = false; window.clearInterval(t) }
  }, [codigo, s.fase])

  const entrar = async () => {
    const limpo = nome.replace(/\s+/g, ' ').trim()
    if (!limpo) { setErro('Diga como quer ser chamado no chat.'); return }
    try { localStorage.setItem(CHAVE_NOME, limpo) } catch { /* só agora */ }
    setEntrando(true); setErro(null)
    await entrarComoConvidado(codigo!, limpo)
    setEntrando(false)
  }

  // Só o link da sala de treino (sem live): é para membros, com conta.
  if (!codigo) {
    return (
      <div className="cv-pagina">
        <div className="cv-aurora" aria-hidden />
        <header className="cv-topo">
          <Brand tamanho={40} />
          <span className="cv-topo-rotulo">Sala de treino</span>
        </header>
        <main className="cv-caixa">
          <section className="cv-cartao">
            <span className="av-sobretitulo">Sala de treino da {MARCA.prosa}</span>
            <h1>Entre na sua conta para assistir o ensaio</h1>
            <p>A sala de treino é para os membros do plano de treino. Entre com a sua conta e você cai direto no ensaio.</p>
            <button className="av-botao-principal" onClick={aoEntrarNaConta}>Entrar na conta</button>
          </section>
          <footer className="cv-rodape">
            <span>Já tem conta na {MARCA.prosa}?</span>
            <button className="av-link" onClick={aoEntrarNaConta}>Entrar na minha conta</button>
          </footer>
        </main>
      </div>
    )
  }

  // Dentro da sala: a mesma tela do aluno (o som vai junto, já que aqui não há player global).
  if (s.fase !== 'fora' && s.live) {
    return (
      <div className="cv-pagina cv-sala">
        <Som faixas={s.audios} />
        <SalaConectada s={s} sessao={null} aoMudar={() => undefined} convidado />
      </div>
    )
  }

  const live = info?.live ?? null
  const publico = info?.publico ?? true
  const noAr = live?.status === 'ao_vivo'
  const encerrada = live?.status === 'encerrada'

  return (
    <div className="cv-pagina">
      <div className="cv-aurora" aria-hidden />
      <header className="cv-topo">
        <Brand tamanho={40} />
        <span className="cv-topo-rotulo">Transmissão ao vivo</span>
      </header>

      <main className="cv-caixa">
        {!info && !erro && <p className="av-vazio">Abrindo o convite…</p>}
        {erro && !info && <p className="av-erro" role="alert">{erro}</p>}

        {info && !publico && (
          <section className="cv-cartao">
            <span className="av-sobretitulo">Transmissão da {MARCA.prosa}</span>
            <h1>{live!.titulo}</h1>
            <p>Esta live é para quem tem conta na plataforma. Entre na sua conta para assistir.</p>
            <button className="av-botao-principal" onClick={aoEntrarNaConta}>Entrar na conta</button>
          </section>
        )}

        {info && publico && live && (
          <>
            <section className={`cv-cartao ${noAr ? 'no-ar' : ''}`}>
              <span className="av-sobretitulo">Você foi convidado</span>
              <h1>{live.titulo}</h1>
              {noAr && <span className="av-chip-vivo"><i aria-hidden />Ao vivo agora <Cronometro desde={live.iniciadaEm} /></span>}
              {!noAr && !encerrada && (
                <p className="cv-quando">{live.inicioPrevisto ? <>Começa {quando(live.inicioPrevisto)}, em <Contagem alvo={live.inicioPrevisto} /></> : 'A transmissão ainda não começou. Esta página se atualiza sozinha.'}</p>
              )}
              {encerrada && <p className="cv-quando">Esta transmissão já terminou. Obrigado pelo interesse.</p>}
              {live.descricao && <p>{live.descricao}</p>}
              {s.erro && <p className="av-recado" role="status">{s.erro}</p>}

              {!encerrada && (
                <form className="cv-form" onSubmit={(e) => { e.preventDefault(); void entrar() }}>
                  <label htmlFor="cv-nome">Como quer ser chamado no chat?</label>
                  <input id="cv-nome" value={nome} maxLength={30} autoComplete="given-name" placeholder="Seu primeiro nome"
                    onChange={(e) => { setNome(e.target.value); setErro(null) }} />
                  {erro && <p className="av-erro" role="alert">{erro}</p>}
                  <button type="submit" className="av-botao-principal" disabled={entrando || !noAr}>
                    {entrando ? 'Entrando…' : noAr ? 'Assistir agora' : 'Aguardando o início'}
                  </button>
                  <small className="cv-nota">Você assiste e conversa no chat. Suas mensagens aparecem ao vivo para todos, mas não ficam gravadas.</small>
                </form>
              )}
            </section>

          </>
        )}

        <footer className="cv-rodape">
          <span>Já é aluno da {MARCA.prosa}?</span>
          <button className="av-link" onClick={aoEntrarNaConta}>Entrar na minha conta</button>
        </footer>
      </main>
    </div>
  )
}
