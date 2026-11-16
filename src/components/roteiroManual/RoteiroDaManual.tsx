/**
 * Montar o roteiro da manual (16/11/2026): as operações da aula, uma por linha, com o resultado (Ganha,
 * Perde ou Mercado) e a entrada; ou "Montar pelo resultado" (quantas operações, entrada e o resultado da aula).
 * A prévia mostra o resultado operação por operação, estimado com o pagamento por acerto (o de verdade é o
 * da Deriv no contrato escolhido na hora). Salvo neste navegador até trocar ou apagar.
 *
 * 16/11/2026 (Tiago: "ux/ui impossível, muito feia, não dá para ver nada"): a janela abria presa dentro da
 * coluna da boleta. Agora abre por cima da tela inteira (portal no body), em duas colunas no computador
 * (montar + resumo | operações) e numa coluna no celular, com os botões fixos embaixo.
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { dinheiro, dinheiroComSinal } from '../../core/dinheiro'
import { useModoSimulado } from '../../core/teeds/modoSimulado'
import {
  apagarRoteiro, montarPeloResultado, previaDoRoteiro, salvarRoteiro, useRoteiroManual, type ItemDoRoteiro, type Resultado,
} from '../../core/teeds/roteiroManual'

const NOMES: Record<Resultado, string> = { ganha: 'Ganha', perde: 'Perde', mercado: 'Mercado' }
// a mesma leitura da boleta: vírgula decimal; ponto é milhar só em "1.000" ou "12.500.000" ("0.350" é 0,35)
const ler = (t: string) => { const x = String(t).replace(/\s/g, ''); return Number(x.includes(',') || /^[1-9]\d{0,2}(\.\d{3})+$/.test(x) ? x.replace(/\./g, '').replace(',', '.') : x) }
const virgula = (v: number) => String(v).replace('.', ',')

export function RoteiroDaManual({ aoFechar }: { aoFechar: () => void }) {
  const salvo = useRoteiroManual()
  const sim = useModoSimulado()
  const saldo = sim?.saldo ?? 0
  const [pagamentoTxt, setPagamentoTxt] = useState(String(Math.round(salvo.pagamento * 100)))
  const pagamento = Math.min(5, Math.max(0.01, (ler(pagamentoTxt) || 95) / 100))
  const [itens, setItens] = useState<ItemDoRoteiro[]>(() => salvo.itens.length ? salvo.itens : montarPeloResultado(8, 10, 40, 0.95).itens)
  // montar pelo resultado
  const [nTxt, setNTxt] = useState(String(itens.length || 8))
  const [entradaTxt, setEntradaTxt] = useState(virgula(itens[0]?.entrada ?? 10))
  const [alvoTxt, setAlvoTxt] = useState('40')
  const [semente, setSemente] = useState(Date.now())
  const previa = useMemo(() => previaDoRoteiro(itens, pagamento, saldo), [itens, pagamento, saldo])
  const final = previa.length ? previa[previa.length - 1].acumulado : 0
  const ganham = itens.filter((i) => i.resultado === 'ganha').length
  const perdem = itens.filter((i) => i.resultado === 'perde').length
  const mercado = itens.length - ganham - perdem
  // a operação que pede mais do que o saldo simulado daquele momento
  const semSaldo = previa.findIndex((p, i) => saldo + (i ? previa[i - 1].acumulado : 0) < p.entrada)
  const emAndamento = salvo.itens.length > 0 && salvo.feitas > 0
  // o ✓ das já feitas só vale para o roteiro salvo, sem mexer (um rascunho novo começa do zero)
  const feitasAqui = emAndamento && itens === salvo.itens ? salvo.feitas : 0

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', esc)
    document.body.classList.add('est-aberto', 'rmn-aberto')
    return () => { window.removeEventListener('keydown', esc); document.body.classList.remove('est-aberto', 'rmn-aberto') }
  }, [aoFechar])

  const montar = (novaSemente = semente) => {
    const n = Math.round(ler(nTxt)), e = ler(entradaTxt), alvo = ler(alvoTxt)
    if (!(n >= 1) || !(e >= 0.35) || !Number.isFinite(alvo)) return
    setItens(montarPeloResultado(n, e, alvo, pagamento, novaSemente).itens)
  }
  const mudar = (i: number, p: Partial<ItemDoRoteiro>) => setItens((l) => l.map((x, k) => (k === i ? { ...x, ...p } : x)))
  const salvar = () => { salvarRoteiro(itens.filter((i) => i.entrada >= 0.35), pagamento); aoFechar() }

  return createPortal(
    <div className="rmn-fundo" role="dialog" aria-modal="true" aria-labelledby="rmn-titulo" onClick={(e) => { if (e.target === e.currentTarget) aoFechar() }}>
      <div className="rmn-janela">
        <header className="rmn-cab">
          <div className="rmn-cab-texto">
            <span className="rmn-selo"><i aria-hidden="true" />Modo simulado · só você vê</span>
            <h2 id="rmn-titulo">Roteiro da manual</h2>
            <p>O resultado de cada operação da aula. Você opera normalmente; o preço na tela segue o mercado real e se ajusta só o necessário.</p>
          </div>
          <button type="button" className="rmn-fechar" onClick={aoFechar} aria-label="Fechar">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>

        <div className="rmn-corpo">
          <aside className="rmn-lado">
            <section className="rmn-cartao" aria-labelledby="rmn-montar">
              <h3 id="rmn-montar">Montar pelo resultado</h3>
              <div className="rmn-grade">
                <label className="rmn-campo"><span>Operações</span><input inputMode="numeric" value={nTxt} onChange={(e) => setNTxt(e.target.value)} /></label>
                <label className="rmn-campo"><span>Entrada</span><div className="rmn-com-moeda"><em>US$</em><input inputMode="decimal" value={entradaTxt} onChange={(e) => setEntradaTxt(e.target.value)} /></div></label>
                <label className="rmn-campo"><span>Resultado da aula</span><div className="rmn-com-moeda"><em>US$</em><input inputMode="decimal" value={alvoTxt} onChange={(e) => setAlvoTxt(e.target.value)} /></div></label>
                <label className="rmn-campo"><span>Paga por acerto</span><div className="rmn-com-moeda depois"><input inputMode="decimal" value={pagamentoTxt} onChange={(e) => setPagamentoTxt(e.target.value)} /><em>%</em></div></label>
              </div>
              <div className="rmn-montar-acoes">
                <button type="button" className="rmn-botao" onClick={() => montar()}>Montar</button>
                <button type="button" className="rmn-texto" onClick={() => { const s = Date.now(); setSemente(s); montar(s) }} title="Mesmo resultado, outra ordem das perdas">Outra ordem</button>
              </div>
              <small>Comprar/Vender paga perto de 95%. Nos dígitos varia com a barreira.</small>
            </section>

            <section className="rmn-cartao rmn-resumo" aria-label="Resumo do roteiro">
              <span className="rmn-rotulo">Resultado da aula</span>
              <strong className={final < 0 ? 'cai' : 'sobe'}>{dinheiroComSinal(final, 'USD')}</strong>
              <div className="rmn-contagem">
                <span><b>{itens.length}</b> {itens.length === 1 ? 'operação' : 'operações'}</span>
                <span className="sobe"><b>{ganham}</b> {ganham === 1 ? 'ganha' : 'ganham'}</span>
                <span className="cai"><b>{perdem}</b> {perdem === 1 ? 'perde' : 'perdem'}</span>
                {mercado > 0 && <span><b>{mercado}</b> pelo mercado</span>}
              </div>
              <dl>
                <div><dt>Saldo antes</dt><dd>{dinheiro(saldo, 'USD')}</dd></div>
                <div><dt>Saldo no fim</dt><dd>{dinheiro(saldo + final, 'USD')}</dd></div>
              </dl>
              {mercado > 0 && <small>As operações pelo mercado ficam fora da conta.</small>}
              {semSaldo >= 0 && <p className="rmn-alerta">A operação {semSaldo + 1} pede mais do que o saldo simulado daquele momento. Aumente o saldo no topo ou diminua as entradas.</p>}
            </section>
          </aside>

          <section className="rmn-ops" aria-labelledby="rmn-ops-titulo">
            <div className="rmn-ops-topo">
              <h3 id="rmn-ops-titulo">As operações</h3>
              <div className="rmn-ops-acoes">
                <button type="button" className="rmn-texto" onClick={() => setItens((l) => l.map((x) => ({ ...x, entrada: l[0]?.entrada ?? x.entrada })))}>Mesma entrada em todas</button>
                <button type="button" className="rmn-texto" onClick={() => setItens((l) => [...l, { resultado: 'ganha', entrada: l[l.length - 1]?.entrada ?? 10 }])}>+ Operação</button>
              </div>
            </div>
            <div className="rmn-ops-cabeca" aria-hidden="true">
              <span>#</span><span>Resultado</span><span>Entrada</span><span>Na operação</span><span>Na aula</span><span />
            </div>
            <ol className="rmn-lista">
              {previa.map((p, i) => (
                <li key={i} className={`rmn-op ${i < feitasAqui ? 'feita' : ''}`}>
                  <span className="rmn-n" title={i < feitasAqui ? 'Já feita nesta rodada' : undefined}>{i < feitasAqui ? '✓' : i + 1}</span>
                  <div className="rmn-escolha" role="radiogroup" aria-label={`Resultado da operação ${i + 1}`}>
                    {(['ganha', 'perde', 'mercado'] as const).map((x) => (
                      <button key={x} type="button" role="radio" aria-checked={p.resultado === x} className={`${x} ${p.resultado === x ? 'on' : ''}`}
                        onClick={() => mudar(i, { resultado: x })}>{NOMES[x]}</button>
                    ))}
                  </div>
                  <div className="rmn-com-moeda pequeno">
                    <em>US$</em>
                    <input inputMode="decimal" defaultValue={virgula(p.entrada)} key={`${i}-${p.entrada}`} aria-label={`Entrada da operação ${i + 1}`}
                      onBlur={(e) => { const v = ler(e.target.value); if (v >= 0.35) mudar(i, { entrada: Math.round(v * 100) / 100 }); else e.target.value = virgula(p.entrada) }} />
                  </div>
                  <span className={`rmn-valor ${p.lucro === null ? 'neutro' : p.lucro < 0 ? 'cai' : 'sobe'}`}>{p.lucro === null ? 'Mercado' : dinheiroComSinal(p.lucro, 'USD')}</span>
                  <span className={`rmn-valor forte ${p.acumulado < 0 ? 'cai' : 'sobe'}`}>{dinheiroComSinal(p.acumulado, 'USD')}</span>
                  <button type="button" className="rmn-tirar" onClick={() => setItens((l) => l.filter((_, k) => k !== i))} aria-label={`Tirar a operação ${i + 1}`}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </li>
              ))}
            </ol>
            {!itens.length && <p className="rmn-vazio">Nenhuma operação. Use "Montar" ou "+ Operação".</p>}
          </section>
        </div>

        <footer className="rmn-rodape">
          {emAndamento && <span className="rmn-nota">Salvar recomeça do início (já foram {salvo.feitas} de {salvo.itens.length}).</span>}
          <div className="rmn-botoes">
            {salvo.itens.length > 0 && <button type="button" className="rmn-texto perigo" onClick={() => { apagarRoteiro(); aoFechar() }}>Apagar roteiro</button>}
            <button type="button" className="rmn-botao" onClick={aoFechar}>Cancelar</button>
            <button type="button" className="rmn-botao forte" disabled={!itens.length} onClick={salvar}>Salvar e usar</button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
