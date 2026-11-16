/**
 * Montar o roteiro da manual (16/11/2026): as operações da aula, uma por linha, com o resultado (Ganha,
 * Perde ou Mercado) e a entrada; ou "Montar pelo resultado" (quantas operações, entrada e o resultado da aula).
 * A prévia mostra o resultado e o saldo operação por operação, estimados com o pagamento por acerto (o de
 * verdade depende do contrato escolhido na hora: o da Deriv). Salvo neste navegador até trocar ou apagar.
 */
import { useEffect, useMemo, useState } from 'react'
import { dinheiro, dinheiroComSinal } from '../../core/dinheiro'
import { useModoSimulado } from '../../core/teeds/modoSimulado'
import {
  apagarRoteiro, montarPeloResultado, previaDoRoteiro, salvarRoteiro, useRoteiroManual, type ItemDoRoteiro, type Resultado,
} from '../../core/teeds/roteiroManual'

const ciclo: Record<Resultado, Resultado> = { ganha: 'perde', perde: 'mercado', mercado: 'ganha' }
const NOMES: Record<Resultado, string> = { ganha: 'Ganha', perde: 'Perde', mercado: 'Mercado' }
const ler = (t: string) => Number(String(t).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))

export function RoteiroDaManual({ aoFechar }: { aoFechar: () => void }) {
  const salvo = useRoteiroManual()
  const sim = useModoSimulado()
  const saldo = sim?.saldo ?? 0
  const [pagamentoTxt, setPagamentoTxt] = useState(String(Math.round(salvo.pagamento * 100)))
  const pagamento = Math.min(5, Math.max(0.01, (ler(pagamentoTxt) || 95) / 100))
  const [itens, setItens] = useState<ItemDoRoteiro[]>(() => salvo.itens.length ? salvo.itens : montarPeloResultado(8, 10, 40, 0.95).itens)
  // montar pelo resultado
  const [nTxt, setNTxt] = useState(String(itens.length || 8))
  const [entradaTxt, setEntradaTxt] = useState(String(itens[0]?.entrada ?? 10).replace('.', ','))
  const [alvoTxt, setAlvoTxt] = useState('40')
  const [semente, setSemente] = useState(Date.now())
  const previa = useMemo(() => previaDoRoteiro(itens, pagamento, saldo), [itens, pagamento, saldo])
  const final = previa.length ? previa[previa.length - 1].acumulado : 0
  const ganham = itens.filter((i) => i.resultado === 'ganha').length
  const perdem = itens.filter((i) => i.resultado === 'perde').length
  const mercado = itens.length - ganham - perdem
  // a operação que pede mais do que o saldo simulado daquele momento
  const semSaldo = previa.findIndex((p, i) => saldo + (i ? previa[i - 1].acumulado : 0) < p.entrada)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', esc)
    document.body.classList.add('est-aberto')
    return () => { window.removeEventListener('keydown', esc); document.body.classList.remove('est-aberto') }
  }, [aoFechar])

  const montar = (novaSemente = semente) => {
    const n = Math.round(ler(nTxt)), e = ler(entradaTxt), alvo = ler(alvoTxt)
    if (!(n >= 1) || !(e >= 0.35) || !Number.isFinite(alvo)) return
    setItens(montarPeloResultado(n, e, alvo, pagamento, novaSemente).itens)
  }
  const mudar = (i: number, p: Partial<ItemDoRoteiro>) => setItens((l) => l.map((x, k) => (k === i ? { ...x, ...p } : x)))
  const salvar = () => { salvarRoteiro(itens.filter((i) => i.entrada >= 0.35), pagamento); aoFechar() }

  return (
    <div className="rmn-fundo" role="dialog" aria-modal="true" aria-label="Roteiro da manual" onClick={(e) => { if (e.target === e.currentTarget) aoFechar() }}>
      <div className="rmn-janela">
        <header className="rmn-cab">
          <div>
            <span className="rmn-selo"><i aria-hidden="true" />Modo simulado · só administradores</span>
            <h2>Roteiro da manual</h2>
            <p>O resultado de cada operação da aula. Na hora de comprar, você escolhe o ativo e o contrato como sempre: a operação segue o roteiro, com o preço de verdade na tela (nos dígitos muda só o último dígito do tick de saída; no Comprar/Vender, o preço se desvia um pouco durante o contrato e volta a colar no real depois).</p>
          </div>
          <button type="button" className="rmn-fechar" onClick={aoFechar} aria-label="Fechar">×</button>
        </header>

        <section className="rmn-montar" aria-label="Montar pelo resultado">
          <h3>Montar pelo resultado</h3>
          <div className="rmn-campos">
            <label><span>Operações</span><input inputMode="numeric" value={nTxt} onChange={(e) => setNTxt(e.target.value)} /></label>
            <label><span>Entrada (US$)</span><input inputMode="decimal" value={entradaTxt} onChange={(e) => setEntradaTxt(e.target.value)} /></label>
            <label><span>Resultado da aula (US$)</span><input inputMode="decimal" value={alvoTxt} onChange={(e) => setAlvoTxt(e.target.value)} /></label>
            <label><span>Pagamento por acerto (%)</span><input inputMode="decimal" value={pagamentoTxt} onChange={(e) => setPagamentoTxt(e.target.value)} /></label>
            <button type="button" className="rmn-botao" onClick={() => montar()}>Montar</button>
            <button type="button" className="rmn-link" onClick={() => { const s = Date.now(); setSemente(s); montar(s) }} title="Mesmo resultado, outra ordem das perdas">Outra ordem</button>
          </div>
          <small>O pagamento real é o da Deriv no contrato que você escolher (Comprar/Vender paga perto de 95%; nos dígitos varia com a barreira). A prévia usa este número.</small>
        </section>

        <section className="rmn-lista" aria-label="As operações">
          <div className="rmn-lista-topo">
            <h3>As operações</h3>
            <div className="rmn-acoes">
              <button type="button" className="rmn-link" onClick={() => setItens((l) => l.map((x) => ({ ...x, entrada: l[0]?.entrada ?? x.entrada })))}>Mesma entrada em todas</button>
              <button type="button" className="rmn-link" onClick={() => setItens((l) => [...l, { resultado: 'ganha', entrada: l[l.length - 1]?.entrada ?? 10 }])}>+ Operação</button>
            </div>
          </div>
          <div className="rmn-tabela-rolo">
            <table className="rmn-tabela">
              <thead><tr><th>#</th><th>Resultado</th><th>Entrada</th><th>Na operação</th><th>Na aula</th><th>Saldo</th><th /></tr></thead>
              <tbody>
                <tr className="rmn-info"><td colSpan={7}>Saldo antes da 1ª operação: <b>{dinheiro(saldo, 'USD')}</b></td></tr>
                {previa.map((p, i) => (
                  <tr key={i} className={`${p.resultado} ${salvo.itens.length && i < salvo.feitas ? 'feita' : ''}`}>
                    <td>{i + 1}</td>
                    <td>
                      <button type="button" className={`rmn-chip ${p.resultado}`} onClick={() => mudar(i, { resultado: ciclo[p.resultado] })}
                        aria-label={`Operação ${i + 1}: ${NOMES[p.resultado]} (toque para trocar)`}>{NOMES[p.resultado]}</button>
                    </td>
                    <td><input className="rmn-entrada" inputMode="decimal" defaultValue={String(p.entrada).replace('.', ',')} key={`${i}-${p.entrada}`}
                      onBlur={(e) => { const v = ler(e.target.value); if (v >= 0.35) mudar(i, { entrada: Math.round(v * 100) / 100 }); else e.target.value = String(p.entrada).replace('.', ',') }}
                      aria-label={`Entrada da operação ${i + 1}`} /></td>
                    <td className={p.lucro === null ? 'neutro' : p.lucro < 0 ? 'cai' : 'sobe'}>{p.lucro === null ? 'o mercado decide' : dinheiroComSinal(p.lucro, 'USD')}</td>
                    <td className={p.acumulado < 0 ? 'cai' : 'sobe'}>{dinheiroComSinal(p.acumulado, 'USD')}</td>
                    <td>{dinheiro(p.saldo, 'USD')}</td>
                    <td><button type="button" className="rmn-tirar" onClick={() => setItens((l) => l.filter((_, k) => k !== i))} aria-label={`Tirar a operação ${i + 1}`}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="rmn-rodape">
          <div className="rmn-resumo">
            <span><b>{itens.length}</b> {itens.length === 1 ? 'operação' : 'operações'} · <b className="sobe">{ganham}</b> {ganham === 1 ? 'ganha' : 'ganham'} · <b className="cai">{perdem}</b> {perdem === 1 ? 'perde' : 'perdem'}{mercado ? <> · <b>{mercado}</b> pelo mercado</> : null}</span>
            <span>Resultado estimado <b className={final < 0 ? 'cai' : 'sobe'}>{dinheiroComSinal(final, 'USD')}</b>{mercado ? ' (sem as do mercado)' : ''} · saldo no fim <b>{dinheiro(saldo + final, 'USD')}</b></span>
            {semSaldo >= 0 && <span className="rmn-alerta">A operação {semSaldo + 1} pede mais do que o saldo simulado daquele momento: aumente o saldo no topo ou diminua as entradas.</span>}
            {salvo.itens.length > 0 && salvo.feitas > 0 && <span className="rmn-nota">Salvar recomeça o roteiro do início (já foram {salvo.feitas} de {salvo.itens.length}).</span>}
          </div>
          <div className="rmn-botoes">
            {salvo.itens.length > 0 && <button type="button" className="rmn-link perigo" onClick={() => { apagarRoteiro(); aoFechar() }}>Apagar roteiro</button>}
            <button type="button" className="rmn-link" onClick={aoFechar}>Cancelar</button>
            <button type="button" className="rmn-botao forte" disabled={!itens.length} onClick={salvar}>Salvar e usar</button>
          </div>
        </footer>
      </div>
    </div>
  )
}
