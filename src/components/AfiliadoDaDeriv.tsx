import { useEffect, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { AFILIADOS_DO_SERVIDOR, type ApiDeAfiliados, type CartaoDeAfiliado, type PainelDeAfiliados } from '../core/teeds/afiliados'
import './afiliado-da-deriv.css'

/*
  Admin > Parceiros > Afiliado na Deriv (09/11/2026). Tiago: "como faz pra
  trazermos essas métricas pra plataforma? segregado certinho victor/naor".

  A Deriv entrega os números da conta de afiliado de quem autorizou, sem abrir
  por cliente. Então cada parceiro liga a conta de afiliado DELE ao link dele, e
  cada cartão mostra só aquela conta. O admin geral vê todos e o Direto; o admin
  do parceiro, só o dele (o servidor confere).
*/

const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const int = (v: number) => v.toLocaleString('pt-BR')
const hora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às')

const SELO: Record<string, { classe: string; texto: string }> = {
  ok: { classe: 'ok', texto: 'Conectada' },
  'nao-e-afiliado': { classe: 'erro', texto: 'Não é conta de afiliado' },
  reconectar: { classe: 'falta', texto: 'Reconectar a Deriv' },
  erro: { classe: 'falta', texto: 'Deriv sem resposta' },
}

function Barras({ cartao }: { cartao: CartaoDeAfiliado }) {
  const dias = cartao.dias
  if (dias.length < 2) return null
  const valor = (d: CartaoDeAfiliado['dias'][number]) => d.comissaoPaga + d.comissaoPendente
  const maior = Math.max(...dias.map(valor), 0.01)
  return (
    <div className="afd-barras" role="img" aria-label={`Comissão por dia, de ${dias[0].dia} a ${dias[dias.length - 1].dia}`}>
      {dias.map((d) => (
        <i key={d.dia} style={{ height: `${Math.max(4, (valor(d) / maior) * 100)}%` }} data-zero={valor(d) === 0 || undefined}
          title={`${d.dia.split('-').reverse().join('/')}: ${usd(valor(d))} · ${int(d.cadastros)} cadastro(s) · ${int(d.primeiroDeposito)} 1º depósito`} />
      ))}
    </div>
  )
}

function Cartao({ c, podeLigar, ocupado, erro, onLigar, onDesligar }: {
  c: CartaoDeAfiliado; podeLigar: boolean; ocupado: boolean; erro: string | null; onLigar: () => void; onDesligar: () => void
}) {
  const primeiro = c.nome.split(' ')[0]
  const selo = c.conexao ? SELO[c.conexao.situacao] ?? SELO.erro : { classe: 'falta', texto: 'Falta ligar' }
  const t = c.total
  return (
    <article className={`afd-cartao${c.codigo ? '' : ' direto'}`}>
      <header>
        <b>{c.codigo ? c.nome : 'Direto (a conta da casa)'}</b>
        <span>{c.codigo && <small className="afd-codigo">/{c.codigo}</small>}<em className={`afd-selo ${selo.classe}`}>{selo.texto}</em></span>
      </header>

      {c.conexao ? (
        <>
          <div className="afd-comissao">
            <div><small>Comissão de afiliado paga</small><strong>{usd(t.comissaoPaga)}</strong></div>
            <div><small>A receber</small><b>{usd(t.comissaoPendente)}</b></div>
          </div>
          <dl className="afd-funil">
            <div><dt>Cadastros</dt><dd>{int(t.cadastros)}</dd></div>
            <div><dt>Contas reais</dt><dd>{int(t.contasReais)}</dd></div>
            <div><dt>1º depósito</dt><dd>{int(t.primeiroDeposito)}</dd></div>
            <div><dt>Operaram</dt><dd>{int(c.operaramNoPeriodo ?? t.operaram)}</dd></div>
          </dl>
          <Barras cartao={c} />
          {(t.subafiliadosAtivos > 0 || t.ganhoSubafiliados > 0) && <p className="afd-sub">Subafiliados: {int(t.subafiliadosAtivos)} ativo(s) · {usd(t.ganhoSubafiliados)}</p>}
          {c.conexao.situacao !== 'ok' && c.conexao.detalhe && <p className="afd-aviso">{c.conexao.detalhe}</p>}
          <footer>
            <span>Conta de {c.conexao.quem || 'afiliado'}{c.conexao.coletadoEm ? ` · lida em ${hora(c.conexao.coletadoEm)}` : ' · lendo o histórico…'}</span>
            {(c.conexao.souEu || podeLigar) && (
              <span className="afd-acoes">
                {c.conexao.situacao !== 'ok' && c.conexao.souEu && <button type="button" disabled={ocupado} onClick={onLigar}>{ocupado ? 'Conferindo…' : 'Tentar de novo'}</button>}
                <button type="button" disabled={ocupado} onClick={onDesligar}>Desligar</button>
              </span>
            )}
          </footer>
        </>
      ) : (
        <div className="afd-vazio">
          {podeLigar ? (
            <>
              <p>Ligue aqui a <b>sua</b> conta de afiliado da Deriv{c.codigo ? <> para os números do /{c.codigo} aparecerem</> : <> da casa</>}. Vale a Deriv que você já conectou nesta plataforma: ela precisa ser a dona do link de afiliado.</p>
              <button type="button" className="principal" disabled={ocupado} onClick={onLigar}>{ocupado ? 'Conferindo na Deriv…' : 'Ligar minha conta de afiliado'}</button>
            </>
          ) : (
            <p>Falta o {primeiro} entrar na plataforma e ligar a conta de afiliado dele em Parceiros. Só ele pode fazer isso, com a Deriv dele.</p>
          )}
        </div>
      )}
      {erro && <div className="afd-erro">{erro}</div>}
    </article>
  )
}

export function AfiliadoDaDeriv({ sessao, marca, de, ate, api = AFILIADOS_DO_SERVIDOR }: { sessao: SessaoTeeds; marca: string; de: string; ate: string; api?: ApiDeAfiliados }) {
  const [painel, setPainel] = useState<PainelDeAfiliados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [rodada, setRodada] = useState(0)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erroDoCartao, setErroDoCartao] = useState<Record<string, string>>({})
  const [atualizando, setAtualizando] = useState(false)

  useEffect(() => {
    let vivo = true
    setErro(null)
    api.painel(sessao, marca, de, ate).then((p) => vivo && setPainel(p)).catch((e) => vivo && setErro((e as Error).message))
    return () => { vivo = false }
  }, [sessao.token, marca, de, ate, rodada]) // eslint-disable-line react-hooks/exhaustive-deps

  // logo depois de ligar, o histórico chega aos poucos: relê sozinho por um minuto
  const lendo = painel?.cartoes.some((c) => c.conexao && !c.conexao.coletadoEm)
  useEffect(() => {
    if (!lendo) return
    const t = setTimeout(() => setRodada((n) => n + 1), 8000)
    return () => clearTimeout(t)
  }, [lendo, rodada])

  const agir = async (codigo: string, acao: 'ligar' | 'desligar') => {
    setOcupado(codigo); setErroDoCartao((x) => ({ ...x, [codigo]: '' }))
    try {
      if (acao === 'ligar') await api.vincular(sessao, marca, codigo)
      else await api.desvincular(sessao, marca, codigo)
      setRodada((n) => n + 1)
    } catch (e) { setErroDoCartao((x) => ({ ...x, [codigo]: (e as Error).message })) }
    finally { setOcupado(null) }
  }
  const atualizar = async () => {
    setAtualizando(true)
    try { await api.atualizar(sessao, marca); setRodada((n) => n + 1) } catch (e) { setErro((e as Error).message) } finally { setAtualizando(false) }
  }

  const podeLigar = (codigo: string) => !!painel && (painel.geral || painel.meuCodigo === codigo)
  const algumaLigada = painel?.cartoes.some((c) => c.conexao)

  return (
    <section className="afd">
      <header className="afd-topo">
        <div>
          <h3>Afiliado na Deriv</h3>
          <p>Os números da conta de afiliado de cada parceiro, direto da Deriv: cadastros pelo link, 1º depósito e a comissão de afiliado. É separado do markup acima.</p>
        </div>
        {algumaLigada && <button type="button" disabled={atualizando} onClick={() => void atualizar()}>{atualizando ? 'Lendo na Deriv…' : 'Atualizar agora'}</button>}
      </header>
      {erro && <div className="afd-erro">{erro} <button type="button" onClick={() => setRodada((n) => n + 1)}>Tentar de novo</button></div>}
      {!painel && !erro && <div className="afd-carregando">Carregando…</div>}
      {painel && (
        <div className="afd-cartoes">
          {painel.cartoes.map((c) => (
            <Cartao key={c.codigo || 'direto'} c={c} podeLigar={podeLigar(c.codigo)} ocupado={ocupado === c.codigo} erro={erroDoCartao[c.codigo] || null}
              onLigar={() => void agir(c.codigo, 'ligar')} onDesligar={() => void agir(c.codigo, 'desligar')} />
          ))}
        </div>
      )}
      <p className="afd-nota">A Deriv soma por conta de afiliado e não mostra o valor de cada cliente. Por isso cada parceiro precisa da própria conta de afiliado: se dois links usam a mesma conta, os números saem juntos. A conexão da Deriv vence em cerca de 30 dias; quando vencer, o cartão avisa e basta conectar a Deriv de novo. Os números são lidos a cada 3 horas.</p>
    </section>
  )
}
