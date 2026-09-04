import { useCallback, useEffect, useRef, useState } from 'react'
import type { TeedsSocket } from '../core/deriv/client'
import { type ConfigEstrategia, type EstadoMotor, type Estrategia } from '../core/deriv/engine'
import { ATIVO_DOS_ROBOS } from '../core/deriv/config'
import { ESTRATEGIAS_LOCAIS } from '../core/deriv/strategies'
import type { ActiveSymbol } from '../core/deriv/types'
import { RobotLive } from './RobotLive'
import { RobotSetup, lerPreparo } from './RobotSetup'
import type { Identidade } from '../core/deriv/branding'
import { Emblema } from './RobotCard'
import type { SessaoTeeds } from '../core/teeds/conta'
import { acompanharNoServidor, ligarNoServidor, pararNoServidor } from '../core/teeds/servidorRobos'

interface Props {
  socket: TeedsSocket | null
  isDemo: boolean
  moeda: string
  symbols: ActiveSymbol[]
  symbolPadrao: string | null
  identidade: Identidade
  /** Estado da conexao autenticada. */
  conexao?: string
  /** Fecha este bloco, inclusive quando ele e o ultimo da tela. */
  onRemover?: () => void
  /** Como este bloco se chama: "Robô 1", "Robô 2"... */
  titulo: string
  expandido?: boolean
  onExpandir?: () => void
  /** Avisa o pai que este bloco tem (ou deixou de ter) sessão, e qual. */
  onSessaoChange?: (ativa: boolean, sessaoId?: string | null) => void
  sessaoTeeds?: SessaoTeeds | null
  contaId?: string | null
  /**
   * Uma sessão que já está rodando no servidor — tipicamente ligada pelo
   * chat. O bloco não pergunta nada: ele entra direto no acompanhamento ao
   * vivo, com o mesmo painel de sempre. Era o que faltava para o robô
   * comandado por conversa não virar um cidadão de segunda classe na tela.
   */
  adotar?: { id: string; config: ConfigEstrategia; origem?: string }
}

const PADRAO: ConfigEstrategia = {
  valorInicial: 0.35,
  valorAoVencer: 0.35,
  fatorGale: 0.05,
  galeApos: 3,
  valorMaximo: 10,
  takeProfit: 5,
  stopLoss: 10,
  maxOperacoes: 100,
}

const din = (v: number, m = 'USD') =>
  `${m} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function LocalRobotPanel({
  socket, isDemo, moeda, symbols, symbolPadrao, identidade, conexao = 'open',
  onRemover, titulo, expandido = false, onExpandir, onSessaoChange, sessaoTeeds, contaId,
  adotar,
}: Props) {
  // O cartao escolhido na vitrine dita a estrategia deste bloco…
  const daVitrine = ESTRATEGIAS_LOCAIS.find((e) => e.id === identidade.id) ?? ESTRATEGIAS_LOCAIS[0]
  // …mas uma sessao em andamento (ou parada na cabine) fica presa a
  // estrategia com que foi ligada: trocar de cartao nao muda um robo vivo.
  const sessaoRef = useRef<{ estrategia: Estrategia; ident: Identidade } | null>(null)
  const [cfg, setCfg] = useState<ConfigEstrategia>(adotar?.config ?? PADRAO)
  // O robo opera sempre no ativo da casa — o que estiver escolhido no
  // grafico nao interfere. Ver ATIVO_DOS_ROBOS em core/deriv/config.
  const symbol = ATIVO_DOS_ROBOS
  void symbolPadrao
  const [estado, setEstado] = useState<EstadoMotor | null>(null)
  const [preparando, setPreparando] = useState(false)
  // A sessão vive no servidor; aqui ficam só o número dela e o jeito de
  // parar de olhar. Fechar esta aba não desliga robô nenhum — era o que
  // acontecia quando o motor morava dentro do navegador.
  const sessaoIdRef = useRef<string | null>(null)
  const pararDeOlharRef = useRef<(() => void) | null>(null)
  const [ligando, setLigando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const onSessaoChangeRef = useRef(onSessaoChange)
  onSessaoChangeRef.current = onSessaoChange
  const sessaoAtiva = estado !== null
  const estrategia = estado && sessaoRef.current ? sessaoRef.current.estrategia : daVitrine
  const ident = estado && sessaoRef.current ? sessaoRef.current.ident : identidade

  useEffect(() => () => { pararDeOlharRef.current?.() }, [])
  useEffect(() => {
    onSessaoChangeRef.current?.(sessaoAtiva, sessaoAtiva ? sessaoIdRef.current : null)
  }, [sessaoAtiva, estado?.rodando])
  useEffect(() => () => { onSessaoChangeRef.current?.(false, null) }, [])

  /*
   * Antes, trocar de conta desligava o robô: ele estava preso à conexão do
   * navegador, e essa conexão morria na troca. Agora o robô tem a conexão
   * dele, no servidor, na conta em que foi ligado. Trocar de conta aqui é
   * só trocar o que você está olhando — quem está operando segue operando,
   * na conta certa, e continua aparecendo em "Sessões recentes".
   */

  const nomeAtivo = symbols.find((s) => s.symbol === symbol)?.name ?? symbol
  const rodando = estado?.rodando ?? false
  /*
   * O espelho no banco saiu daqui. Quem grava cada operação é o servidor,
   * no mesmo instante em que ela fecha — inclusive com esta aba fechada.
   * Se a tela também gravasse, seriam dois lugares escrevendo a mesma
   * linha, e é assim que os números começam a divergir.
   */

  // a regra do contrato dita em uma frase, para a tela nao falar em codigo
  const b = estrategia.barreira ?? 5
  const regra = {
    DIGITOVER: `maior que ${b}`,
    DIGITUNDER: `menor que ${b}`,
    DIGITMATCH: `igual a ${b}`,
    DIGITDIFF: `diferente de ${b}`,
    DIGITEVEN: 'par',
    DIGITODD: 'ímpar',
  }[estrategia.contractType] ?? estrategia.contractType

  const ganhaCom = (d: number) => {
    switch (estrategia.contractType) {
      case 'DIGITOVER': return d > b
      case 'DIGITUNDER': return d < b
      case 'DIGITMATCH': return d === b
      case 'DIGITDIFF': return d !== b
      case 'DIGITEVEN': return d % 2 === 0
      case 'DIGITODD': return d % 2 === 1
      default: return false
    }
  }

  /**
   * Passa a olhar uma sessão do servidor.
   *
   * Um estado vazio não vira tela: a sessão nasce e só um instante depois
   * tem número para mostrar. Desenhar o painel com o vazio piscaria uma
   * cabine sem nada dentro.
   */
  const olhar = useCallback((id: string) => {
    if (!sessaoTeeds) return
    pararDeOlharRef.current?.()
    sessaoIdRef.current = id
    pararDeOlharRef.current = acompanharNoServidor(
      sessaoTeeds, id,
      (s) => { if (typeof s.estado?.rodando === 'boolean') setEstado(s.estado) },
      (msg) => setErro(msg),
    )
  }, [sessaoTeeds?.token]) // eslint-disable-line react-hooks/exhaustive-deps

  // sessão que já estava no ar quando esta tela abriu (a do chat, em geral)
  useEffect(() => {
    if (!adotar?.id || sessaoIdRef.current === adotar.id) return
    sessaoRef.current = { estrategia: daVitrine, ident: identidade }
    setCfg(adotar.config)
    olhar(adotar.id)
  }, [adotar?.id, olhar]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Liga o robô — no servidor, não aqui.
   *
   * Antes esta função criava um motor dentro do navegador. Ele operava de
   * verdade, mas morria com a aba e não deixava rastro no histórico: o robô
   * existia só enquanto alguém estivesse olhando. Agora o pedido vai para o
   * servidor, o mesmo que o chat usa — e o que a tela faz daqui em diante é
   * assistir.
   */
  async function ligar(config: ConfigEstrategia, ativo: string) {
    void ativo // o robô opera sempre no ativo da casa
    if (!sessaoTeeds || !contaId) {
      setErro('Entre na sua conta Teeds e conecte a Deriv para ligar o robô.')
      return
    }
    setPreparando(false)
    setCfg(config)
    setErro(null)
    setLigando(true)
    // a sessao nasce com o cartao escolhido AGORA na vitrine, e fica com ele
    sessaoRef.current = { estrategia: daVitrine, ident: identidade }
    try {
      const s = await ligarNoServidor(sessaoTeeds, { roboId: daVitrine.id, contaId, config })
      olhar(s.id)
      if (typeof s.estado?.rodando === 'boolean') setEstado(s.estado)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setLigando(false)
    }
  }

  /** Desliga a sessão lá no servidor. */
  function desligar() {
    const id = sessaoIdRef.current
    if (!id || !sessaoTeeds) return
    void pararNoServidor(sessaoTeeds, id).catch((e: Error) => setErro(e.message))
  }

  const parametros = [
    { rot: 'Ativo', valor: nomeAtivo.replace(' Index', '') },
    { rot: 'Entrada', valor: din(cfg.valorAoVencer, moeda) },
    {
      rot: 'Recuperação',
      valor: cfg.fatorGale === 0
        ? 'desligado'
        : 'automática Teeds',
    },
    { rot: 'Teto', valor: din(cfg.valorMaximo, moeda) },
    { rot: 'Para se ganhar', valor: din(cfg.takeProfit, moeda) },
    { rot: 'Para se perder', valor: din(cfg.stopLoss, moeda) },
  ]

  // ------------------------------------------------------------ sem sessão
  if (!estado) {
    const ultimo = lerPreparo()
    return (
      <>
        <div className="pronto pronto-compacto" style={{ ['--robo' as any]: identidade.cor, ['--robo-suave' as any]: identidade.corSuave }}>
          <header className="pc-topo">
            <span className="pc-emblema"><Emblema id={identidade} tamanho={46} /></span>
            <div><span className="rot">{titulo} · pronto para configurar</span><h3>{estrategia.nome}</h3><p>{identidade.chamada}</p></div>
            {onRemover && <button className="pc-fechar" onClick={onRemover} aria-label={`Fechar ${titulo}`} title="Fechar robô">×</button>}
          </header>

          <div className="pc-conteudo">
            <div className="pc-regra">
              <span className="rot">Como ele opera</span>
              <strong>Último dígito {regra}</strong>
              <small>{estrategia.descricao}</small>
            </div>
            <dl className="pc-metricas">
              <div><dt>Dígitos vencedores</dt><dd className="ps-digitos">{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(ganhaCom).map((d) => <i key={d}>{d}</i>)}</dd></div>
              <div><dt>Chance teórica</dt><dd>{identidade.chance}%</dd></div>
              <div><dt>Ritmo</dt><dd>1 tick</dd></div>
              <div><dt>Ativo</dt><dd>{nomeAtivo.replace(' Index', '')}</dd></div>
            </dl>
            <div className="pc-ultima">
              <span className="rot">Última configuração</span>
              <b>{din(ultimo.cfg?.valorAoVencer ?? cfg.valorAoVencer, moeda)} por entrada</b>
              <small>Freios automáticos de ganho e perda</small>
            </div>
            <button className="pronto-btn" disabled={!socket || ligando || !sessaoTeeds || !contaId}
              onClick={() => { setErro(null); setPreparando(true) }}>
              {ligando ? 'ligando no servidor…' : <>Configurar e ligar <span>→</span></>}
            </button>
            {erro && <p className="pc-erro">{erro}</p>}
            <p className="pc-nota">Os robôs operam no servidor da Teeds: seguem rodando com esta aba fechada.</p>
          </div>
        </div>

        {preparando && (
          <RobotSetup
            identidade={identidade}
            nomeEstrategia={daVitrine.nome}
            symbols={symbols}
            symbolInicial={symbol}
            configInicial={cfg}
            moeda={moeda}
            isDemo={isDemo}
            onCancelar={() => setPreparando(false)}
            onLigar={ligar}
          />
        )}
      </>
    )
  }

  // ------------------------------------------------------------ com sessão
  return (
    <div className={`cabine-caixa ${expandido ? 'expandido' : ''} ${rodando ? 'rodando' : 'parado'}`}
      style={{ ['--robo' as any]: ident.cor, ['--robo-suave' as any]: ident.corSuave }}>
      <RobotLive
        estado={estado}
        config={cfg}
        moeda={moeda}
        nomeEstrategia={estrategia.nome}
        ativo={nomeAtivo}
        titulo={titulo}
        regra={regra}
        cor={ident.cor}
        ganhaCom={ganhaCom}
        parametros={parametros}
        conexao={conexao}
        expandido={expandido}
        onExpandir={onExpandir}
        onDesligar={rodando ? desligar : undefined}
        onLigarDeNovo={!rodando ? () => setPreparando(true) : undefined}
        onRemover={onRemover ? () => {
          if (rodando && !window.confirm('Este robô está operando no servidor. Deseja desligar e fechar o bloco?')) return
          desligar()
          pararDeOlharRef.current?.()
          onRemover()
        } : undefined}
      />

      {preparando && (
        <RobotSetup
          identidade={identidade}
          nomeEstrategia={daVitrine.nome}
          symbols={symbols}
          symbolInicial={symbol}
          configInicial={cfg}
          moeda={moeda}
          isDemo={isDemo}
          onCancelar={() => setPreparando(false)}
          onLigar={ligar}
        />
      )}
    </div>
  )
}
