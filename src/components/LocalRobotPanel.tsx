import { useCallback, useEffect, useRef, useState } from 'react'
import type { TeedsSocket } from '../core/deriv/client'
import { type ConfigEstrategia, type EstadoMotor, type Estrategia } from '../core/deriv/engine'
import { ATIVO_DOS_ROBOS } from '../core/deriv/config'
import { ESTRATEGIAS_LOCAIS, modoDaConfig, NOME_DO_MODO, temModos } from '../core/deriv/strategies'
import type { ActiveSymbol } from '../core/deriv/types'
import { RobotLive } from './RobotLive'
import { RobotSetup } from './RobotSetup'
import { LimiteAtingido, limiteJaAvisado, marcarLimiteAvisado, tipoDeLimite, type TipoDeLimite } from './LimiteAtingido'
import type { Identidade } from '../core/deriv/branding'
import type { SessaoTeeds } from '../core/teeds/conta'
import { acompanharNoServidor, ligarNoServidor, pararNoServidor, procurarSessaoRecemLigada } from '../core/teeds/servidorRobos'
import { RobotCartao, RobotLinha } from './RobotResumo'
import { resumoDeEstudo, type DadosEstudo } from '../core/teeds/estudoDoDono'
import { MARCA } from '../marca'

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
  /** Botão "Dígitos" do cabeçalho: abre o painel flutuante do ativo. */
  onDigitos?: () => void
  digitosAberto?: boolean
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
  solicitarPreparo?: boolean
  onFecharPreparo?: () => void
  /** Coluna de markup nas últimas operações (só para o dono da plataforma). */
  mostrarMarkup?: boolean
  /** Identifica este bloco no centro de estudo do Modo CEO. */
  idEstudo?: string
  /** Manda os números desta sessão para o centro de estudo (Modo CEO). */
  onEstudo?: (id: string, dados: DadosEstudo | null) => void
  /**
   * Como este bloco aparece na tela de Robôs:
   * - 'aberta': a linha da lista com a cabine completa embaixo (só uma por vez);
   * - 'linha': só a linha da lista;
   * - 'cartao': o cartão do mosaico.
   */
  apresentacao?: 'aberta' | 'linha' | 'cartao'
  /** Clique na linha (abre/fecha a cabine) ou em "Abrir na lista" no cartão. */
  onAbrir?: () => void
}

const PADRAO: ConfigEstrategia = {
  valorInicial: 0.35,
  valorAoVencer: 0.35,
  fatorGale: 0.05,
  galeApos: 3,
  valorMaximo: 0,
  takeProfit: 5,
  stopLoss: 10,
  maxOperacoes: 0,
}

const din = (v: number, m = 'USD') =>
  `${m} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function LocalRobotPanel({
  socket, isDemo, moeda, symbols, symbolPadrao, identidade, conexao = 'open',
  onRemover, titulo, expandido = false, onExpandir, onSessaoChange, sessaoTeeds, contaId,
  adotar, solicitarPreparo = false, onFecharPreparo, onDigitos, digitosAberto = false,
  mostrarMarkup = false, apresentacao = 'aberta', onAbrir, idEstudo, onEstudo,
}: Props) {
  // Desde quando esta tela acompanha a sessão. Para uma sessão adotada do
  // servidor é o momento em que ela apareceu aqui, não o da abertura lá.
  const inicioRef = useRef<number | null>(null)
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
  const [contaDaSessao, setContaDaSessao] = useState<{ contaId: string; demo: boolean; moeda: string } | null>(null)
  const [preparando, setPreparando] = useState(false)
  // A sessão vive no servidor; aqui ficam só o número dela e o jeito de
  // parar de olhar. Fechar esta aba não desliga robô nenhum — era o que
  // acontecia quando o motor morava dentro do navegador.
  const sessaoIdRef = useRef<string | null>(null)
  const pararDeOlharRef = useRef<(() => void) | null>(null)
  const [ligando, setLigando] = useState(false)
  const envioPendente = useRef(false)
  const [idDaSessao, setIdDaSessao] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const onSessaoChangeRef = useRef(onSessaoChange)
  onSessaoChangeRef.current = onSessaoChange
  const sessaoAtiva = estado !== null || idDaSessao !== null
  const estrategia = sessaoAtiva && sessaoRef.current ? sessaoRef.current.estrategia : daVitrine
  const ident = sessaoAtiva && sessaoRef.current ? sessaoRef.current.ident : identidade

  useEffect(() => () => { pararDeOlharRef.current?.() }, [])
  useEffect(() => {
    onSessaoChangeRef.current?.(sessaoAtiva, sessaoAtiva ? sessaoIdRef.current : null)
  }, [sessaoAtiva, estado?.rodando, idDaSessao])
  useEffect(() => () => { onSessaoChangeRef.current?.(false, null) }, [])

  /*
   * Modo CEO: o centro de estudo desta tela soma os números de todas as
   * sessões abertas. Quem tem os números é cada bloco, então cada bloco os
   * entrega ao pai a cada mudança de estado — e avisa quando sai de cena.
   */
  const onEstudoRef = useRef(onEstudo)
  onEstudoRef.current = onEstudo
  useEffect(() => {
    if (!idEstudo) return
    if (!estado) { onEstudoRef.current?.(idEstudo, null); return }
    onEstudoRef.current?.(idEstudo, resumoDeEstudo(estado, {
      id: idEstudo,
      nome: ident.nome,
      cor: ident.cor,
      numero: titulo ?? '',
      modo: temModos(ident.id, cfg.parametros) ? NOME_DO_MODO[modoDaConfig(ident.id, cfg.fatorGale, cfg.lucroSobrePrejuizo, cfg)] : null,
      demo: contaDaSessao?.demo ?? null,
    }))
  }, [estado, idEstudo, ident.id, ident.nome, ident.cor, titulo, cfg.fatorGale, cfg.lucroSobrePrejuizo, cfg.modo, cfg.parametros, contaDaSessao?.demo])
  useEffect(() => () => { if (idEstudo) onEstudoRef.current?.(idEstudo, null) }, [idEstudo])

  /*
   * Meta ou stop: o aviso no meio da tela. Vale quando a sessão para enquanto
   * se assiste e também quando ela já chega parada por limite — o robô bateu
   * a meta com a pessoa fora, e ela fica sabendo ao voltar. Uma vez por sessão.
   */
  const [limite, setLimite] = useState<TipoDeLimite | null>(null)
  const antesDoLimite = useRef<{ id: string | null; rodando: boolean | null }>({ id: null, rodando: null })
  useEffect(() => {
    if (!estado || !idDaSessao) return
    const antes = antesDoLimite.current
    antesDoLimite.current = { id: idDaSessao, rodando: estado.rodando }
    if (estado.rodando) return
    const tipo = tipoDeLimite(estado.motivoParada)
    if (!tipo || limiteJaAvisado(idDaSessao)) return
    const parouAgora = antes.id === idDaSessao && antes.rodando === true
    const chegouParada = antes.id !== idDaSessao
    if (parouAgora || chegouParada) { marcarLimiteAvisado(idDaSessao); setLimite(tipo) }
  }, [estado?.rodando, estado?.motivoParada, idDaSessao]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (sessaoIdRef.current !== id) inicioRef.current = Date.now()
    sessaoIdRef.current = id
    setIdDaSessao(id)
    pararDeOlharRef.current = acompanharNoServidor(
      sessaoTeeds, id,
      (s) => {
        if (typeof s.estado?.rodando === 'boolean') {
          setEstado(s.estado)
          setContaDaSessao({ contaId: s.contaId, demo: s.demo, moeda: s.moeda })
        }
      },
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
  async function ligar(config: ConfigEstrategia, ativo: string, modelo = ident) {
    void ativo
    if (envioPendente.current) return
    if (!sessaoTeeds || !contaId) {
      setErro(`Entre na sua conta ${MARCA.prosa} e conecte a Deriv para ligar o robô.`)
      return
    }
    const escolhida = ESTRATEGIAS_LOCAIS.find(e => e.id === modelo.id)
    if (!escolhida) { setErro('Modelo indisponível. Escolha outro robô.'); return }
    envioPendente.current = true
    setErro(null)
    setLigando(true)
    try {
      const continuarId = sessaoIdRef.current && sessaoRef.current?.estrategia.id === escolhida.id ? sessaoIdRef.current : undefined
      const s = await ligarNoServidor(sessaoTeeds, { roboId: escolhida.id, contaId: continuarId ? (contaDaSessao?.contaId ?? contaId) : contaId, config, ...(continuarId ? { continuarId } : {}) })
      // Commit the new identity/config only after the server accepts it.
      sessaoRef.current = { estrategia: escolhida, ident: modelo }
      setCfg(config)
      setContaDaSessao({ contaId: s.contaId, demo: s.demo, moeda: s.moeda })
      olhar(s.id)
      onSessaoChangeRef.current?.(true, s.id)
      if (typeof s.estado?.rodando === 'boolean') setEstado(s.estado)
      setPreparando(false)
      onFecharPreparo?.()
    } catch (e) {
      /*
        O pedido falhou — mas o robô pode ter ligado assim mesmo: a resposta
        pode ter se perdido no caminho depois de o servidor criar a sessão.
        Antes de mostrar erro, a tela pergunta ao servidor o que existe para
        esta conta e este robô; se achar, adota em vez de acusar falha.
      */
      const adotada = await procurarSessaoRecemLigada(sessaoTeeds, escolhida.id, contaId)
      if (adotada) {
        sessaoRef.current = { estrategia: escolhida, ident: modelo }
        setCfg(config)
        setContaDaSessao({ contaId: adotada.contaId, demo: adotada.demo, moeda: adotada.moeda })
        olhar(adotada.id)
        onSessaoChangeRef.current?.(true, adotada.id)
        setEstado(adotada.estado)
        setPreparando(false)
        onFecharPreparo?.()
      } else {
        setErro((e as Error).message)
      }
    } finally {
      envioPendente.current = false
      setLigando(false)
    }
  }

  /**
   * Desliga a sessão lá no servidor.
   *
   * O botão vira "Desligando…" no clique, e o estado que o servidor devolve
   * na própria resposta já é aplicado — sem esperar a próxima consulta do
   * acompanhamento. Depois a consulta reinicia, para trazer o contrato que
   * porventura estivesse aberto assim que ele liquidar.
   */
  const [desligando, setDesligando] = useState(false)
  function desligar() {
    const id = sessaoIdRef.current
    if (!id || !sessaoTeeds || desligando) return
    setDesligando(true)
    pararNoServidor(sessaoTeeds, id)
      .then((s) => {
        if (sessaoIdRef.current !== id) return
        if (typeof s.estado?.rodando === 'boolean') setEstado(s.estado)
        olhar(id)
      })
      .catch((e: Error) => setErro(e.message))
      .finally(() => setDesligando(false))
  }

  const moedaDosParametros = contaDaSessao?.moeda ?? moeda
  const parametros = [
    { rot: 'Ativo', valor: nomeAtivo.replace(' Index', '') },
    { rot: 'Entrada', valor: din(cfg.valorAoVencer, moedaDosParametros) },
    {
      rot: 'Recuperação',
      valor: cfg.fatorGale === 0
        ? 'desligado'
        : temModos(ident.id, cfg.parametros) ? `modo ${NOME_DO_MODO[modoDaConfig(ident.id, cfg.fatorGale, cfg.lucroSobrePrejuizo, cfg)].toLowerCase()}` : `automática ${MARCA.prosa}`,
    },
    { rot: 'Teto', valor: cfg.valorMaximo > 0 ? din(cfg.valorMaximo, moedaDosParametros) : 'sem teto' },
    { rot: 'Para se ganhar', valor: din(cfg.takeProfit, moedaDosParametros) },
    { rot: 'Para se perder', valor: din(cfg.stopLoss, moedaDosParametros) },
  ]

  const preparo = (preparando || solicitarPreparo) && <RobotSetup
    key={`${contaId}:${isDemo}:${moeda}`}
    identidade={ident}
    nomeEstrategia={ident.nome}
    symbols={symbols}
    symbolInicial={symbol}
    configInicial={cfg}
    moeda={moeda}
    isDemo={contaDaSessao?.demo ?? isDemo}
    contaId={contaDaSessao?.contaId ?? contaId}
    escolherModelo={solicitarPreparo}
    ligando={ligando}
    erro={erro}
    onCancelar={() => { if (envioPendente.current) return; setPreparando(false); setErro(null); onFecharPreparo?.() }}
    onLigar={ligar}
  />

  // Draft panels are invisible; the dialog is portaled above the whole app.
  if (!estado) return <>{(adotar || idDaSessao) && <div className="robot-session-loading" role="status">
    <b>{ident.nome}</b><span>{erro ?? 'Conectando ao acompanhamento da sessão…'}</span>
  </div>}{preparo}</>

  // ------------------------------------------------------------ com sessão
  const modo = temModos(ident.id, cfg.parametros) ? NOME_DO_MODO[modoDaConfig(ident.id, cfg.fatorGale, cfg.lucroSobrePrejuizo, cfg)].toLowerCase() : null
  const aoRemover = onRemover ? () => {
    if (rodando && !window.confirm('Este robô está operando no servidor. Deseja desligar e fechar o bloco?')) return
    desligar()
    pararDeOlharRef.current?.()
    onRemover()
  } : undefined
  const resumo = {
    estado, config: cfg, moeda: contaDaSessao?.moeda ?? moeda, nome: ident.nome, cor: ident.cor, numero: titulo,
    inicio: inicioRef.current, demo: contaDaSessao?.demo ?? null, modo, conexao, ceo: mostrarMarkup,
    onDesligar: rodando ? desligar : undefined, desligando,
    onLigarDeNovo: !rodando ? () => { setErro(null); setPreparando(true) } : undefined,
    onRemover: aoRemover,
  }
  // O aviso de meta ou stop aparece em qualquer apresentação — inclusive
  // com a cabine de outro robô aberta. Fecha só no X. (Decisão de 16/09.)
  const aviso = limite && <LimiteAtingido
    tipo={limite} estado={estado} config={cfg} nome={`${titulo} · ${ident.nome}`} cor={ident.cor}
    moeda={contaDaSessao?.moeda ?? moeda} demo={contaDaSessao?.demo ?? null}
    onFechar={() => setLimite(null)}
    onLigarDeNovo={() => { setLimite(null); setErro(null); setPreparando(true) }}
  />
  if (apresentacao === 'linha') return (
    <div className={`cabine-caixa linha ${rodando ? 'rodando' : 'parado'}`} style={{ ['--robo' as any]: ident.cor, ['--robo-suave' as any]: ident.corSuave }}>
      <RobotLinha {...resumo} aberta={false} onAbrir={() => onAbrir?.()} />
      {preparo}{aviso}
    </div>
  )
  if (apresentacao === 'cartao') return (
    <div className={`cabine-caixa cartao ${rodando ? 'rodando' : 'parado'}`} style={{ ['--robo' as any]: ident.cor, ['--robo-suave' as any]: ident.corSuave }}>
      <RobotCartao {...resumo} onAbrirNaLista={() => onAbrir?.()} />
      {preparo}{aviso}
    </div>
  )
  return (
    <div className={`cabine-caixa aberta ${expandido ? 'expandido' : ''} ${rodando ? 'rodando' : 'parado'}`}
      style={{ ['--robo' as any]: ident.cor, ['--robo-suave' as any]: ident.corSuave }}>
      <RobotLinha {...resumo} aberta onAbrir={() => onAbrir?.()} />
      <RobotLive
        estado={estado}
        config={cfg}
        moeda={contaDaSessao?.moeda ?? moeda}
        contaDaSessao={contaDaSessao}
        estrategiaId={estrategia.id}
        nomeEstrategia={ident.nome}
        ativo={nomeAtivo}
        titulo={titulo}
        regra={regra}
        cor={ident.cor}
        ganhaCom={ganhaCom}
        parametros={parametros}
        conexao={conexao}
        expandido={expandido}
        onExpandir={onExpandir}
        onDigitos={onDigitos}
        digitosAberto={digitosAberto}
        mostrarMarkup={mostrarMarkup}
        onDesligar={rodando ? desligar : undefined}
        desligando={desligando}
        onLigarDeNovo={!rodando ? () => { setErro(null); setPreparando(true) } : undefined}
        onRemover={aoRemover}
      />

      {preparo}
      {aviso}
    </div>
  )
}
