import { useEffect, useState, type CSSProperties } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { definirModoDoTreino, entrarNoTreino, modoForaDoTreino, sairDoTreino, simularTreino, useTreino, type ModoDoTreino } from '../../core/live/treino'
import { MARCA } from '../../marca'
import { ICONE_PALCO, abrirPorCima, podeAbrirPorCima, useLargo, useTeatro } from './AoVivo'
import PlayerDoTreino, { ChatDoTreino, PalcoDoTreino } from './PlayerDoTreino'
import './aovivo.css'

/**
 * O GF Member assiste a transmissão da sala de treino como se fosse aluno
 * (19/10/2026): a imagem, o chat e o tamanho da sala. O selo "Simulação"
 * fica sempre na imagem e o número leva "simulado": quem assiste sabe o que
 * está vendo. 20/10/2026: o aviso de simulação sai do cabeçalho (fica só no
 * selo da imagem); o cabeçalho é "Transmissão exclusiva para GF Members" e
 * o membro vê só o público simulado, o apresentador e as próprias mensagens.
 * Também 20/10/2026: tela cheia, e ao sair da página o ensaio continua no
 * player (flutuante, miniatura, ao lado do gráfico ou só o áudio), igual à
 * live (PlayerDoTreino.tsx).
 */

export function AssistirTreino({ sessao, conectar = true }: { sessao: SessaoTeeds | null; conectar?: boolean }) {
  const t = useTreino()
  const largo = useLargo()
  const [cheia, alternarCheia] = useTeatro()
  const [chatNoTeatro, setChatNoTeatro] = useState(true)

  // Entra ao abrir a página. Sair dela NÃO derruba (20/10/2026): o ensaio
  // segue no player flutuante, na miniatura ou só no áudio.
  useEffect(() => {
    if (!conectar || !sessao) return
    if (t.fase === 'fora' || t.fase === 'erro') void entrarNoTreino(sessao)
  }, [sessao?.usuario.id, conectar]) // eslint-disable-line react-hooks/exhaustive-deps

  const temImagem = !!t.tela || !!t.camera
  const status = t.fase === 'conectando' || t.fase === 'reconectando' ? { cls: 'conectando', txt: t.fase === 'conectando' ? 'Conectando' : 'Reconectando' }
    : t.fase === 'erro' || (t.fase === 'fora' && conectar) ? { cls: 'fora', txt: 'Fora do ar' }
      : t.sim.ativa ? { cls: 'vivo', txt: 'Ao vivo' }
        : t.encerrada ? { cls: 'fora', txt: 'Encerrada' }
        : t.presente ? { cls: 'sala', txt: 'Apresentador na sala', curto: 'Na sala' }
          : { cls: 'fora', txt: 'Aguardando início', curto: 'Em breve' }
  const primeiro = (t.quemApresenta || '').trim().split(/\s+/)[0]
  const modoFora = modoForaDoTreino()

  return (
    <div className="tr-assistir av-aluno">
      <header className="tr-cabeca" style={MARCA.id === 'globalfly' ? { '--tr-marca': `url(${import.meta.env.BASE_URL}globalfly-gf-escuro.png)` } as CSSProperties : undefined}>
        {MARCA.id === 'globalfly' && <img className="tr-cabeca-selo" src={`${import.meta.env.BASE_URL}globalfly-gf-escuro.png`} alt="" aria-hidden />}
        <div className="tr-cabeca-texto">
          <span className="tr-cabeca-sobre">Sala de treino</span>
          <h1>Transmissão exclusiva para <em>GF Members</em></h1>
          <p>{t.presente && primeiro ? <>Com <b>{primeiro}</b>. Você está entre os membros convidados.</> : 'Fique nesta tela: a transmissão começa assim que o apresentador entrar.'}</p>
        </div>
        <span className={`tr-status ${status.cls}`} role="status"><i aria-hidden /><span className="tr-status-longo">{status.txt}</span>{'curto' in status && <span className="tr-status-curto" aria-hidden>{status.curto}</span>}</span>
      </header>

      {t.fase === 'erro' && <p className="av-erro" role="alert">{t.erro}</p>}

      {t.fase !== 'fora' && (
        <div className="av-modos tr-modos" role="group" aria-label="Como continuar assistindo ao sair desta tela">
          <span>Ao sair desta tela, continuar:</span>
          {largo && <button className={modoFora === 'lado' ? 'on' : ''} onClick={() => definirModoDoTreino('lado', true)}>Ao lado do gráfico</button>}
          <button className={modoFora === 'flutuante' ? 'on' : ''} onClick={() => definirModoDoTreino('flutuante', true)}>{largo ? 'Em janela flutuante' : 'Em miniatura'}</button>
          <button className={modoFora === 'pilula' ? 'on' : ''} onClick={() => definirModoDoTreino('pilula', true)}>Só o áudio</button>
        </div>
      )}

      <div className={`av-palco-e-chat ${cheia ? 'av-teatro' : ''} ${cheia && !chatNoTeatro ? 'sem-chat' : ''}`}>
        <PalcoDoTreino filhos={<BotoesDoTreino cheia={cheia} alternar={alternarCheia} chat={chatNoTeatro} setChat={setChatNoTeatro} />} />
        <div className="av-lado-aluno"><ChatDoTreino /></div>
      </div>

      <div className="av-rodape-aluno">
        {podeAbrirPorCima() && temImagem && (
          <button className="av-botao-secundario av-por-cima" onClick={() => void abrirPorCima(document.querySelector('.tr-assistir .av-palco-e-chat'))}>
            Assistir por cima de outros apps
          </button>
        )}
        {t.fase === 'fora' && conectar && sessao
          ? <button className="av-botao-secundario" onClick={() => void entrarNoTreino(sessao)}>Entrar de novo na transmissão</button>
          : <button className="av-link" onClick={() => void sairDoTreino()}>Sair da transmissão</button>}
      </div>
    </div>
  )
}

/** Sobre a imagem: tela cheia e, nela, mostrar ou esconder o chat. */
function BotoesDoTreino({ cheia, alternar, chat, setChat }: { cheia: boolean; alternar: (v: boolean) => void; chat: boolean; setChat: (v: boolean) => void }) {
  const t = useTreino()
  // no canto oposto ao rosto do apresentador, para nunca cobrir ninguém
  const canto = t.tela && t.camera ? t.canto : 'inf-esq'
  return (
    <div className={`av-botoes-palco ${canto === 'inf-dir' ? 'pos-sup-dir' : 'pos-inf-dir'}`}>
      {cheia && (
        <button onClick={() => setChat(!chat)} aria-pressed={chat} aria-label={chat ? 'Esconder o chat' : 'Mostrar o chat'} title={chat ? 'Esconder o chat' : 'Mostrar o chat'}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d={ICONE_PALCO.chat} /></svg>
        </button>
      )}
      <button onClick={() => alternar(!cheia)} aria-label={cheia ? 'Sair da tela cheia' : 'Tela cheia'} title={cheia ? 'Sair da tela cheia' : 'Tela cheia'}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={cheia ? ICONE_PALCO.sairCheia : ICONE_PALCO.cheia} /></svg>
      </button>
    </div>
  )
}

/** ?tela=treino-membro no laboratório: a visão do membro com imagem e chat de exemplo. */
export function LabAssistirTreino({ fora }: { fora?: ModoDoTreino } = {}) {
  useEffect(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720
    const c = canvas.getContext('2d')!
    let q = 0
    const desenhar = () => {
      c.fillStyle = '#0b1726'; c.fillRect(0, 0, 1280, 720)
      for (let i = 0; i < 40; i++) { const b = 360 + Math.sin((i + q / 6) / 4) * 120; c.fillStyle = Math.sin(i * 7.3 + q / 9) > 0 ? '#16C784' : '#EA3943'; c.fillRect(60 + i * 29, b - 40, 16, 80) }
      q++
    }
    desenhar(); const t = window.setInterval(desenhar, 66)
    void import('livekit-client').then(({ LocalVideoTrack }) => {
      const agora = Date.now()
      const m = (min: number, nome: string, texto: string, extra: Partial<{ apresentador: boolean; membro: boolean; minha: boolean }> = {}) =>
        ({ id: `${nome}${min}`, nome, texto, apresentador: false, entrada: false, hora: agora - min * 60000, ...extra })
      simularTreino({
        fase: 'conectada', presente: true, quemApresenta: 'Tiago Dalri', apresentador: false, canto: 'inf-dir',
        tela: new LocalVideoTrack(canvas.captureStream(15).getVideoTracks()[0]),
        sim: { ativa: true, publico: 712, momento: 'meta', pausada: false, chatAberto: true },
        mensagens: [m(6, 'Ana', 'boa noite pessoal'), m(5, 'Tiago', 'Meta da sessão: 5%. Limite de perda: 3%.', { apresentador: true }),
          m(4, 'Bruno', 'bora!!! meta no bolso'), m(3, 'Carla', 'Como faço para definir o limite de perda?', { membro: true, minha: true }),
          m(2, 'Diego', 'disciplina demais'), m(1, 'Elaine', 'parabéns pela gestão')],
      })
    })
    return () => window.clearInterval(t)
  }, [])
  // ?tela=treino-player&modo=flutuante|lado|pilula: o player fora da página, sobre uma tela qualquer
  if (fora) {
    return (
      <div className="workspace-app" style={{ minHeight: 'calc(100vh / var(--escala-pagina, 1))', padding: 24 }}>
        <p style={{ color: 'var(--muted)' }}>Uma tela qualquer da plataforma (o gráfico, as aulas…). O ensaio segue no player.</p>
        <LabPlayer modo={fora} />
      </div>
    )
  }
  return <div className="ger av-pagina"><AssistirTreino sessao={null} conectar={false} /></div>
}
function LabPlayer({ modo }: { modo: ModoDoTreino }) {
  useEffect(() => { const id = window.setTimeout(() => definirModoDoTreino(modo, false), 400); return () => window.clearTimeout(id) }, [modo])
  return <PlayerDoTreino naPagina={false} abrirPagina={() => undefined} />
}
