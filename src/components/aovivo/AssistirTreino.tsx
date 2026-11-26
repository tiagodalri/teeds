import { useEffect, useState, type CSSProperties } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { definirModoDoTreino, entrarNoTreino, esquecerTesteDoLink, modoForaDoTreino, sairDoTreino, simularTreino, testeDoLink, type ModoDoTreino } from '../../core/live/treino'
import { MARCA, FAMILIA_GF, GF_MEMBRO } from '../../marca'
import { ICONE_PALCO, abrirPorCima, podeAbrirPorCima, useLargo, useTeatro } from './AoVivo'
import PlayerDoTreino, { ChatDoTreino, ControleDeVolume, PalcoDoTreino, useTreinoNaTela } from './PlayerDoTreino'
import './aovivo.css'

/**
 * O GF Member assiste a transmissão da sala de treino como se fosse aluno
 * (19/10/2026): a imagem, o chat e o tamanho da sala. O selo "Simulação"
 * fica sempre na imagem e o número leva "simulado": quem assiste sabe o que
 * está vendo. 20/10/2026: o aviso de simulação sai do cabeçalho (fica só no
 * selo da imagem); o cabeçalho é "Transmissão exclusiva do GF Member" e
 * o membro vê só o público simulado, o apresentador e as próprias mensagens.
 * Também 20/10/2026: tela cheia, e ao sair da página o ensaio continua no
 * player (flutuante, miniatura, ao lado do gráfico ou só o áudio), igual à
 * live (PlayerDoTreino.tsx).
 */

export function AssistirTreino({ sessao, conectar = true, comoAluno = false }: { sessao: SessaoTeeds | null; conectar?: boolean; comoAluno?: boolean }) {
  const t = useTreinoNaTela()
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
  // 26/11/2026: com mais gente da equipe no palco, o cabeçalho diz todos ("Com Victor e Naor")
  const nomesDoPalco = t.palco.length > 1 ? t.palco.map((p) => p.nome.trim().split(/\s+/)[0]) : []
  const primeiro = nomesDoPalco.length ? `${nomesDoPalco.slice(0, -1).join(', ')} e ${nomesDoPalco[nomesDoPalco.length - 1]}` : (t.quemApresenta || '').trim().split(/\s+/)[0]
  const modoFora = modoForaDoTreino()
  // chegou pelo link de uma transmissão de teste (31/10/2026)
  const teste = !!testeDoLink()

  return (
    <div className="tr-assistir av-aluno">
      <header className="tr-cabeca" style={FAMILIA_GF ? { '--tr-marca': `url(${import.meta.env.BASE_URL}globalfly-gf-escuro.png)` } as CSSProperties : undefined}>
        {FAMILIA_GF && <img className="tr-cabeca-selo" src={`${import.meta.env.BASE_URL}globalfly-gf-escuro.png`} alt="" aria-hidden />}
        {teste ? (
          <div className="tr-cabeca-texto">
            <span className="tr-cabeca-sobre">Transmissão de teste</span>
            <h1>Só quem tem o link <em>vê esta transmissão</em></h1>
            <p>{t.presente && primeiro ? <>Com <b>{primeiro}</b>. Ninguém mais foi avisado.</> : 'Aguardando quem transmite começar o teste.'}</p>
          </div>
        ) : (
          <div className="tr-cabeca-texto">
            <span className="tr-cabeca-sobre">Sala de treino</span>
            <h1>Transmissão exclusiva do <em>{GF_MEMBRO}</em></h1>
            <p>{t.presente && primeiro ? <>Com <b>{primeiro}</b>. Você está entre os membros convidados.</> : 'Ainda não há transmissão agora. Quando a equipe abrir a sala, o menu Ao vivo ganha um ponto vermelho.'}</p>
          </div>
        )}
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

      {!comoAluno && <div className="av-rodape-aluno">
        {podeAbrirPorCima() && temImagem && (
          <button className="av-botao-secundario av-por-cima" onClick={() => void abrirPorCima(document.querySelector('.tr-assistir .av-palco-e-chat'))}>
            Assistir por cima de outros apps
          </button>
        )}
        {t.fase === 'fora' && conectar && sessao
          ? <button className="av-botao-secundario" onClick={() => void entrarNoTreino(sessao)}>Entrar de novo na transmissão</button>
          : <button className="av-link" onClick={() => { if (teste) esquecerTesteDoLink(); void sairDoTreino() }}>{teste ? 'Sair do teste' : 'Sair da transmissão'}</button>}
      </div>}
    </div>
  )
}

/** Sobre a imagem: tela cheia e, nela, mostrar ou esconder o chat. */
function BotoesDoTreino({ cheia, alternar, chat, setChat }: { cheia: boolean; alternar: (v: boolean) => void; chat: boolean; setChat: (v: boolean) => void }) {
  const t = useTreinoNaTela()
  // no canto oposto ao rosto do apresentador, para nunca cobrir ninguém
  const canto = t.tela && t.camera ? t.canto : 'inf-esq'
  return (
    <div className={`av-botoes-palco ${canto === 'inf-dir' ? 'pos-sup-dir' : 'pos-inf-dir'}`}>
      <ControleDeVolume className="tr-volume-palco" />
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
        ...palcoDoLab(),
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
/** ?palco=2|3|4|tela|fixado no laboratório: a live com vários administradores, com câmeras de exemplo. */
export function palcoDoLab() {
  const q = new URLSearchParams(location.search).get('palco')
  if (!q) return {}
  const camera = (cor: string, letra: string) => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 360
    const x = c.getContext('2d')!
    let k = 0
    window.setInterval(() => {
      const g = x.createLinearGradient(0, 0, 640, 360); g.addColorStop(0, cor); g.addColorStop(1, '#0b0f17')
      x.fillStyle = g; x.fillRect(0, 0, 640, 360)
      x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.arc(320, 150 + Math.sin(k++ / 8) * 4, 62, 0, Math.PI * 2); x.fill()
      x.fillRect(220, 230, 200, 130); x.fillStyle = '#0b0f17'; x.font = '700 54px system-ui'; x.textAlign = 'center'; x.fillText(letra, 320, 170)
    }, 66)
    return c.captureStream(15).getVideoTracks()[0]
  }
  const tela = () => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720
    const x = c.getContext('2d')!
    x.fillStyle = '#0b1726'; x.fillRect(0, 0, 1280, 720)
    for (let i = 0; i < 40; i++) { x.fillStyle = i % 3 ? '#16C784' : '#EA3943'; x.fillRect(60 + i * 29, 300 + Math.sin(i / 4) * 120, 16, 80) }
    return c.captureStream(5).getVideoTracks()[0]
  }
  const gente = [
    { id: 'v', nome: 'Victor Dias', cor: '#8A6726' }, { id: 'n', nome: 'Naor Bezerra', cor: '#1f4f7a' },
    { id: 'd', nome: 'Douglas Lima', cor: '#5a2d6b' }, { id: 't', nome: 'Tiago Dalri', cor: '#2b5d43' },
  ]
  const n = q === 'tela' || q === 'fixado' ? 2 : Math.max(1, Math.min(4, Number(q) || 2))
  const palco = gente.slice(0, n).map((p, i) => ({
    id: p.id, nome: p.nome, eu: false, dono: i === 0, mic: i !== 1, falando: i === 0,
    camera: q === '3' && i === 2 ? null : camera(p.cor, p.nome[0]), tela: q === 'tela' && i === 1 ? tela() : null,
  }))
  return { palco, grade: true, conversa: true, fixadoAqui: q === 'fixado' ? 'n:camera' : null, quemApresenta: 'Victor Dias' }
}

function LabPlayer({ modo }: { modo: ModoDoTreino }) {
  useEffect(() => { const id = window.setTimeout(() => definirModoDoTreino(modo, false), 400); return () => window.clearTimeout(id) }, [modo])
  return <PlayerDoTreino naPagina={false} abrirPagina={() => undefined} />
}
