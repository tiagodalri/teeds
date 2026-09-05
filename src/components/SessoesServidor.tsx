import { useEffect, useMemo, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { RITMO_ROBOS } from '../core/teeds/config'
import {
  acompanharSessoes, operacoesDaSessao,
  type OperacaoServidor, type SessaoServidor,
} from '../core/teeds/sessoesServidor'

/**
 * Os robôs que estão rodando no servidor, vistos daqui.
 *
 * Um robô ligado pelo chat opera em Nova York, sem navegador nenhum aberto.
 * Sem esta tela, a pessoa só descobriria o que aconteceu perguntando no
 * chat de novo — e a Teeds pareceria não saber da própria operação.
 *
 * O bloco some quando não há nada acontecendo: uma tela que anuncia vazio
 * o tempo todo ensina a pessoa a ignorá-la.
 */

const din = (v: number, moeda = 'USD', sinal = false) =>
  `${sinal && v > 0 ? '+' : ''}${moeda} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const classe = (v: number) => (v > 0 ? 'positivo' : v < 0 ? 'negativo' : '')

const ORIGEM: Record<string, string> = {
  chat: 'ligado pelo chat',
  api: 'ligado pela API',
  navegador: 'ligado por aqui',
}

export function SessoesServidor({ sessao, escondidas = [] }: {
  sessao: SessaoTeeds
  /**
   * Sessões que já estão com painel ao vivo aberto na tela.
   *
   * Mostrar o mesmo robô duas vezes — cartão de resumo em cima, painel
   * completo embaixo — faz a pessoa contar duas operações onde há uma. O
   * cartão continua existindo para o que o painel não pega: sessões
   * encerradas, e as que estão no ar mas o servidor não respondeu agora.
   */
  escondidas?: string[]
}) {
  const [sessoes, setSessoes] = useState<SessaoServidor[]>([])
  const [aberta, setAberta] = useState<string | null>(null)
  const [verEncerradas, setVerEncerradas] = useState(false)
  const [extrato, setExtrato] = useState<OperacaoServidor[]>([])

  useEffect(() => acompanharSessoes(sessao, setSessoes), [sessao.token])

  // o extrato acompanha a sessão aberta enquanto ela estiver viva
  useEffect(() => {
    if (!aberta) { setExtrato([]); return }
    let vivo = true
    const puxar = async () => {
      try {
        const ops = await operacoesDaSessao(sessao, aberta)
        if (vivo) setExtrato(ops)
      } catch {
        // Consulta perdida não apaga o extrato que já está certo na tela.
      }
    }
    void puxar()
    const t = setInterval(puxar, RITMO_ROBOS)
    return () => { vivo = false; clearInterval(t) }
  }, [aberta, sessao.token])

  const oculta = useMemo(() => new Set(escondidas), [escondidas.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  const visiveis = useMemo(
    () => sessoes.filter((s) => !(s.sessaoRef && oculta.has(s.sessaoRef))),
    [sessoes, oculta],
  )
  const rodando = useMemo(() => visiveis.filter((s) => s.situacao === 'rodando'), [visiveis])
  const encerradas = useMemo(() => visiveis.filter((s) => s.situacao !== 'rodando').slice(0, 6), [visiveis])

  if (!visiveis.length) return null

  const cartao = (s: SessaoServidor) => {
    const viva = s.situacao === 'rodando'
    const acertoPct = s.operacoes ? Math.round((s.ganhas / s.operacoes) * 100) : 0
    return (
      <article key={s.id} className={`ss-cartao ${viva ? 'viva' : ''}`}>
        <header>
          <div>
            <b>{s.roboNome}</b>
            <small>
              {viva ? <em className="ss-pulso" /> : null}
              {viva ? 'rodando' : s.situacao === 'erro' ? 'parou com erro' : 'encerrada'}
              {' · '}{ORIGEM[s.origem] ?? s.origem}
              {' · '}{s.demo ? 'demonstração' : 'conta real'}
            </small>
          </div>
          <strong className={classe(s.resultado)}>{din(s.resultado, s.moeda, true)}</strong>
        </header>

        <div className="ss-numeros">
          <div><span>Operações</span><b>{s.operacoes}</b></div>
          <div><span>Acerto</span><b>{acertoPct}%</b></div>
          <div><span>Entrada agora</span><b>{din(s.entradaAtual, s.moeda)}</b></div>
          <div><span>Movimentado</span><b>{din(s.movimentado, s.moeda)}</b></div>
        </div>

        {/* Onde o resultado está entre os dois freios que a pessoa definiu. */}
        <div className="ss-trilho" title={`Stop ${din(-s.stopLoss, s.moeda)} · meta ${din(s.takeProfit, s.moeda)}`}>
          <span className="ss-marca stop">{din(-s.stopLoss, s.moeda)}</span>
          <i>
            <em
              className={classe(s.resultado)}
              style={{
                left: `${Math.min(100, Math.max(0, ((s.resultado + s.stopLoss) / (s.stopLoss + s.takeProfit)) * 100))}%`,
              }}
            />
          </i>
          <span className="ss-marca meta">{din(s.takeProfit, s.moeda)}</span>
        </div>

        {!viva && s.motivoDaParada && <p className="ss-motivo">Parou: {s.motivoDaParada}</p>}
        {s.erro && <p className="ss-motivo erro">{s.erro}</p>}

        <footer>
          <span>{s.contaId} · {s.ativo}</span>
          <button onClick={() => setAberta(aberta === s.id ? null : s.id)}>
            {aberta === s.id ? 'Fechar extrato' : 'Ver operações'}
          </button>
        </footer>

        {aberta === s.id && (
          <div className="ss-extrato">
            {!extrato.length ? (
              <p className="ss-vazio">{viva ? 'Esperando a primeira operação fechar…' : 'Nenhuma operação registrada.'}</p>
            ) : (
              <div className="ss-tabela">
                <div className="cab"><span>#</span><span>Hora</span><span>Entrada</span><span>Dígito</span><span>Resultado</span><span>Acumulado</span></div>
                {extrato.map((o) => (
                  <div key={o.contractId}>
                    <span>{o.seq ?? '—'}</span>
                    <span>{hora(o.executadaEm)}</span>
                    <span>{din(o.entrada, s.moeda)}</span>
                    <span className={o.ganhou ? 'positivo' : 'negativo'}>{o.digitoSaida ?? '—'}</span>
                    <span className={o.ganhou ? 'positivo' : 'negativo'}>{din(o.resultado, s.moeda, true)}</span>
                    <span className={classe(o.acumulado ?? 0)}>{o.acumulado === null ? '—' : din(o.acumulado, s.moeda, true)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </article>
    )
  }

  /*
    O que encerrou não disputa espaço com o que está operando.

    Antes as sessões encerradas vinham como uma parede de cartões grandes no
    fim da tela — e viravam entulho visual, ainda mais depois de uma tarde de
    testes. Mas jogar fora não dava: o motivo da parada ("limite de perda
    protegido") não existe em nenhum outro lugar da Teeds, e é a primeira
    pergunta de quem vê o robô desligado.

    Então elas viram uma linha só, com o essencial já escrito nela: qual robô
    parou por último, com quanto e por quê. Quem quiser o resto abre.
  */
  const ultima = encerradas[0]

  return (
    <section className={rodando.length ? 'ger-bloco ss-bloco' : 'ss-bloco ss-so-resumo'}>
      {rodando.length > 0 && (
        <>
          <div className="ss-cabecalho">
            <div>
              <span className="rot">No servidor</span>
              <h3>{rodando.length} robô{rodando.length > 1 ? 's' : ''} operando agora</h3>
            </div>
            <small>Estes robôs rodam mesmo com esta aba fechada.</small>
          </div>
          <div className="ss-lista">{rodando.map(cartao)}</div>
        </>
      )}

      {encerradas.length > 0 && (
        <div className={`ss-encerradas ${verEncerradas ? 'aberta' : ''}`}>
          <button type="button" className="ss-resumo" onClick={() => setVerEncerradas((v) => !v)}>
            <b className="ss-resumo-n">{encerradas.length}</b>
            <span className="ss-resumo-txt">
              {encerradas.length > 1 ? 'sessões encerradas' : 'sessão encerrada'}
              {ultima && (
                <>
                  {' · última: '}
                  <b>{ultima.roboNome}</b>{' '}
                  <b className={classe(ultima.resultado)}>{din(ultima.resultado, ultima.moeda, true)}</b>
                  {ultima.motivoDaParada ? ` · ${ultima.motivoDaParada}` : ''}
                </>
              )}
            </span>
            <span className="ss-resumo-acao">{verEncerradas ? 'ocultar' : 'ver'}</span>
          </button>
          {verEncerradas && <div className="ss-lista">{encerradas.map(cartao)}</div>}
        </div>
      )}
    </section>
  )
}
