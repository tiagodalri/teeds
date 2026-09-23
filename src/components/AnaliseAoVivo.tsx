import { useMemo } from 'react'
import type { ConfigEstrategia, EstadoMotor } from '../core/deriv/engine'
import { ESTRATEGIAS_LOCAIS } from '../core/deriv/strategies'

/**
 * O quadro de cima da cabine: a leitura do mercado, o contrato e a fita.
 *
 * Desenho aprovado pelo Tiago em 22/09/2026 (mockup "v4 enxuta"): enquanto
 * o robô espera, a tela mostrava zeros e "aguardando sinal" — parecia
 * parado. Agora ela mostra a análise que o motor já faz a cada preço.
 *
 * Três regras que vieram das rodadas de mockup:
 *  - Nada some nem troca de lugar. A leitura e o contrato ficam lado a
 *    lado o tempo todo; só números e cores mudam. (Trocar o quadro inteiro
 *    entre "analisando" e "operando" não dava tempo de ler.)
 *  - A fita dos dígitos é fixa na tela, sem clique.
 *  - Tudo vem do estado real do motor. Nenhuma animação finge trabalho.
 *
 * Só lê o `EstadoMotor` — o mesmo que a tela já recebe do servidor. Não
 * pede nada novo ao servidor e não decide nada.
 */

interface Props {
  estado: EstadoMotor
  estrategiaId?: string
  /** "Teeds - AG7", "OMNI Bull"… */
  nomeEstrategia: string
  moeda: string
  ganhaCom: (d: number) => boolean
  /** Abre o painel grande de dígitos (janelas de 25 a 1000). */
  onDigitos?: () => void
  digitosAberto?: boolean
  /** A config da sessão (congelada): o medidor lê dela o loss virtual que o robô está usando. */
  config?: ConfigEstrategia
}

const num = (v: number) =>
  Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const assinado = (v: number) => `${v >= 0 ? '+' : '−'}${num(v)}`
const relogio = (ms: number) =>
  new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const JANELA_PADRAO = 25

/**
 * Onde está, na fita, o dígito que decidiu a última operação.
 *
 * O motor zera `ticksAnalisados` ao liquidar e soma um a cada preço novo
 * enquanto não há contrato — então o dígito de saída fica a
 * `ticksAnalisados` posições do fim. O preço e a liquidação chegam por
 * canais diferentes e podem inverter a ordem por um tick, por isso confere
 * o dígito e aceita o vizinho. Sem certeza, não marca nada.
 */
function posicaoDoDecisivo(estado: EstadoMotor, fita: number[]): number | null {
  const ultima = estado.historico[0]
  if (!ultima || ultima.digitoSaida === null || estado.emOperacao) return null
  const alvo = fita.length - 1 - estado.ticksAnalisados
  for (const i of [alvo, alvo + 1, alvo - 1]) {
    if (i >= 0 && i < fita.length && fita[i] === ultima.digitoSaida) return i
  }
  return null
}

export function AnaliseAoVivo({ estado, estrategiaId, nomeEstrategia, moeda, ganhaCom, onDigitos, digitosAberto = false, config }: Props) {
  const estrategia = useMemo(() => ESTRATEGIAS_LOCAIS.find((e) => e.id === estrategiaId), [estrategiaId])
  const medidor = estrategia?.medidor?.({ digitos: estado.digitos, config }) ?? null
  const tamanho = medidor?.tipo === 'percentual' ? medidor.janela : JANELA_PADRAO
  const fita = estado.digitos.slice(-tamanho)
  const decisivo = posicaoDoDecisivo(estado, fita)
  const emCurso = estado.emCurso
  const ultima = estado.historico[0]
  const ultimoDigito = estado.digitos[estado.digitos.length - 1]

  // ------------------------------------------------ a leitura, em uma frase
  const frase: { texto: string; tom?: 'forte' | 'fraco' } = !estado.rodando
    ? { texto: estado.emOperacao ? 'Desligado — concluindo o contrato em andamento.' : 'Sessão encerrada.' }
    : emCurso
      ? { texto: 'Contrato aberto — o próximo dígito decide.' }
      : estado.emOperacao
        ? { texto: 'Enviando a entrada para a Deriv…' }
        : ultima && estado.ticksAnalisados === 0
          ? ultima.ganhou
            ? { texto: `Positiva no dígito ${ultima.digitoSaida ?? '—'}. Voltando a ler o mercado.`, tom: 'forte' }
            : { texto: `Negativa no dígito ${ultima.digitoSaida ?? '—'}. Próxima entrada: ${moeda} ${num(estado.valorAtual)}.`, tom: 'fraco' }
          : ultimoDigito === undefined
            ? { texto: 'Lendo o histórico recente do mercado…' }
            : { texto: `Saiu ${ultimoDigito}. ${ganhaCom(ultimoDigito) ? 'Dígito em que o robô opera.' : 'O robô continua lendo.'}` }

  // ------------------------------------------------ a condição de entrada
  const amostrando = medidor?.tipo === 'percentual' && medidor.amostra < medidor.janela
  const liberada = medidor ? medidor.valor >= medidor.alvo && !amostrando : false
  const status = !estado.rodando
    ? null
    : emCurso || estado.emOperacao
      ? { texto: 'Em operação', classe: 'ok' }
      : !medidor
        ? null
        : amostrando
          ? { texto: `Montando a amostra — ${(medidor as { amostra: number }).amostra} de ${tamanho}`, classe: '' }
          : liberada
            ? { texto: 'Condição atingida', classe: 'ok' }
            : medidor.valor >= medidor.alvo - (medidor.tipo === 'percentual' ? 8 : 1)
              ? { texto: 'Perto da condição', classe: 'perto' }
              : { texto: medidor.tipo === 'percentual' ? `Abaixo de ${medidor.alvo}% — aguardando` : 'Aguardando a condição', classe: '' }

  // ------------------------------------------------ o contrato
  // -1 nada ainda · 0 enviando · 1 em andamento · 2 concluído (o último)
  const passo = emCurso ? 1 : estado.emOperacao ? 0 : ultima ? 2 : -1
  const concluido = passo === 2 ? (ultima!.ganhou ? 'ganhou' : 'perdeu') : ''
  const linhaContrato = emCurso
    ? { esq: `Comprado às ${relogio(emCurso.comprouEm)}`, dir: `${moeda} ${num(emCurso.valor)}`, classe: '' }
    : estado.emOperacao
      ? { esq: 'Enviando a ordem', dir: `${moeda} ${num(estado.valorAtual)}`, classe: '' }
      : ultima
        ? { esq: `Última · saiu o ${ultima.digitoSaida ?? '—'}`, dir: assinado(ultima.lucro), classe: ultima.ganhou ? 'up' : 'down' }
        : { esq: estado.rodando ? 'Aguardando a condição' : 'Nenhuma operação', dir: '—', classe: '' }

  return (
    <section className={`tv-analise ${estado.rodando ? '' : 'parada'}`} aria-label="Análise ao vivo">
      <div className="tv-analise-cima">
        <div className="tv-analise-leitura">
          {medidor ? (
            <>
              <div className="tv-analise-numero">
                <b className="num">
                  {medidor.tipo === 'percentual'
                    ? `${amostrando ? Math.round((medidor.amostra / medidor.janela) * 100) : medidor.valor}%`
                    : `${medidor.valor} de ${medidor.alvo}`}
                </b>
                <span>
                  {medidor.tipo === 'percentual'
                    ? amostrando ? 'da amostra de dígitos montada' : <>{medidor.rotulo} · entra a partir de <strong>{medidor.alvo}%</strong></>
                    : medidor.rotulo}
                </span>
                {status && <em className={`tv-analise-status ${status.classe}`}>{status.texto}</em>}
              </div>
              {medidor.tipo === 'percentual' ? (
                <div className="tv-analise-regua" aria-hidden="true">
                  <i className={liberada ? 'ok' : ''} style={{ width: `${Math.min(100, ((amostrando ? 0 : medidor.valor) / medidor.maximo) * 100)}%` }} />
                  <u style={{ left: `${(medidor.alvo / medidor.maximo) * 100}%` }} />
                </div>
              ) : (
                <div className="tv-analise-degraus" aria-hidden="true">
                  {Array.from({ length: medidor.alvo }, (_, i) => <i key={i} className={i < medidor.valor ? (liberada ? 'ok' : 'on') : ''} />)}
                </div>
              )}
            </>
          ) : (
            <div className="tv-analise-numero">
              <b className="tv-analise-texto">{estado.condicao?.rotulo ?? (estado.rodando ? estado.aguardando : 'Sessão encerrada')}</b>
              {status && <em className={`tv-analise-status ${status.classe}`}>{status.texto}</em>}
            </div>
          )}
          <p className={`tv-analise-frase ${frase.tom ?? ''}`}>{frase.texto}</p>
        </div>

        <div className={`tv-analise-contrato ${concluido}`}>
          <span className="tv-analise-rot">Contrato</span>
          <ol aria-label="Etapas do contrato">
            {['Entrada', 'Em andamento', 'Concluído'].map((etapa, i) => (
              <li key={etapa} className={i < passo || (i === 2 && passo === 2) ? 'feito' : i === passo ? 'atual' : ''}
                aria-current={i === passo ? 'step' : undefined}><i aria-hidden="true" />{etapa}</li>
            ))}
          </ol>
          <div className="tv-analise-ultima"><span>{linhaContrato.esq}</span><b className={`num ${linhaContrato.classe}`}>{linhaContrato.dir}</b></div>
        </div>
      </div>

      <div className="tv-analise-fita" style={{ ['--n' as string]: tamanho }}>
        {Array.from({ length: tamanho }, (_, i) => {
          const d = fita[i - (tamanho - fita.length)]
          if (d === undefined) return <span key={`v${i}`} className="vazio" />
          const marca = decisivo === i - (tamanho - fita.length) ? (ultima!.ganhou ? ' decidiu up' : ' decidiu down') : ''
          // Só a última casa troca de chave a cada preço: é ela que entra animada.
          return <span key={i === tamanho - 1 ? `agora-${fita.join('')}` : `c${i}`} className={`${ganhaCom(d) ? 'paga' : ''}${marca}${i === tamanho - 1 ? ' agora' : ''}`}>{d}</span>
        })}
      </div>
      <div className="tv-analise-legenda">
        <span>Os {tamanho} últimos dígitos do mercado — em verde, os que o {nomeEstrategia} opera</span>
        {onDigitos && <button type="button" aria-expanded={digitosAberto} onClick={onDigitos}>{digitosAberto ? 'Fechar dígitos' : 'Ampliar dígitos'}</button>}
      </div>
    </section>
  )
}
