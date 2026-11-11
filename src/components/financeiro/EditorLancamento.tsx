/*
  Lançar ou editar: despesa, receita, aporte ou retirada de sócio. Num lançamento novo dá para repetir
  todo mês ou parcelar. Comprovantes (PDF ou imagem, até 10 MB) sobem junto.
*/
import { useMemo, useRef, useState } from 'react'
import {
  FORMAS, ROTULO_TIPO, dataCurta, ehEntrada, ehOperacional, hoje, reais, somarMeses,
  type Anexo, type DadosFin, type FinApi, type Lancamento, type NovoLancamento, type TipoLancamento,
} from '../../core/teeds/financeiro'
import { Campo, Interruptor, Janela, Segmentado, escreverValor, lerValor } from './ui'

export interface Rascunho { tipo?: TipoLancamento; socio_id?: string | null; valor?: number; descricao?: string }
type Repeticao = 'nao' | 'mensal' | 'parcelado'

const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, '$1-$2-$3-$4-$5'))
const tamanho = (b: number) => b > 1e6 ? `${(b / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1e3))} kB`

export function EditorLancamento({ api, dados, lancamento, rascunho, podeEditar, aoFechar, aoSalvar }: {
  api: FinApi; dados: DadosFin
  /** Editando um que já existe. */
  lancamento?: Lancamento | null
  /** Lançamento novo com alguns campos já escolhidos (Registrar retirada, Nova receita…). */
  rascunho?: Rascunho
  podeEditar: boolean
  aoFechar: () => void
  aoSalvar: (mensagem: string) => void
}) {
  const l = lancamento
  const [tipo, setTipo] = useState<TipoLancamento>(l?.tipo ?? rascunho?.tipo ?? 'despesa')
  const [valorTxt, setValorTxt] = useState(escreverValor(l?.valor ?? rascunho?.valor ?? null))
  const [descricao, setDescricao] = useState(l?.descricao ?? rascunho?.descricao ?? '')
  const [vencimento, setVencimento] = useState(l?.vencimento ?? hoje())
  const [pago, setPago] = useState(l ? !!l.pago_em : true)
  const [pagoEm, setPagoEm] = useState(l?.pago_em ?? hoje())
  const [categoria, setCategoria] = useState(l?.categoria_id ?? '')
  const contasAtivas = dados.contas.filter((c) => c.ativo || c.id === l?.conta_id)
  const [conta, setConta] = useState(l?.conta_id ?? contasAtivas[0]?.id ?? '')
  const [socio, setSocio] = useState<string>(l?.socio_id ?? rascunho?.socio_id ?? '')
  const [contraparte, setContraparte] = useState(l?.contraparte ?? '')
  const [forma, setForma] = useState(l?.forma ?? '')
  const [obs, setObs] = useState(l?.observacoes ?? '')
  const [repeticao, setRepeticao] = useState<Repeticao>('nao')
  const [vezes, setVezes] = useState(12)
  const [anexos, setAnexos] = useState<Anexo[]>(l?.anexos ?? [])
  const [novos, setNovos] = useState<File[]>([])
  const [removidos, setRemovidos] = useState<Anexo[]>([])
  const [alcance, setAlcance] = useState<'este' | 'proximos'>('este')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [confirmarApagar, setConfirmarApagar] = useState(false)
  const arquivo = useRef<HTMLInputElement | null>(null)
  const idNovo = useRef(novoId())

  const novo = !l
  const valor = lerValor(valorTxt)
  /** Lançamento novo já pago: a data que vale é a do pagamento (o vencimento fica igual). */
  const base = novo && pago ? pagoEm : vencimento
  const entrada = ehEntrada(tipo)
  const operacional = ehOperacional(tipo)
  const sociosAtivos = dados.socios.filter((s) => s.ativo || s.id === socio)
  const categorias = dados.categorias.filter((c) => c.tipo === (entrada ? 'entrada' : 'saida') && (c.ativo || c.id === categoria))
  const noBolso = operacional && !!socio
  const contrapartes = useMemo(() => [...new Set(dados.lancamentos.map((x) => x.contraparte).filter((x): x is string => !!x))].sort().slice(0, 300), [dados.lancamentos])
  const doGrupo = l?.grupo ? dados.lancamentos.filter((x) => x.grupo === l.grupo && x.vencimento >= l.vencimento) : []

  const trocarTipo = (t: TipoLancamento) => {
    setTipo(t)
    if (ehEntrada(t) !== entrada) setCategoria('')
    if (!ehOperacional(t) && !socio && sociosAtivos[0]) setSocio(sociosAtivos[0].id)
    if (ehOperacional(t) && !ehOperacional(tipo)) setSocio('')
  }

  // o que a repetição vai criar, para a pessoa ver antes de salvar
  const serie = useMemo(() => {
    if (!novo || repeticao === 'nao' || !valor) return null
    const n = Math.max(2, Math.min(60, vezes))
    const parcela = repeticao === 'parcelado' ? Math.floor(valor / n * 100) / 100 : valor
    const ultima = repeticao === 'parcelado' ? Math.round((valor - parcela * (n - 1)) * 100) / 100 : valor
    return { n, parcela, ultima, fim: somarMeses(base, n - 1) }
  }, [novo, repeticao, valor, vezes, base])

  const validar = (): string | null => {
    if (!valor || valor <= 0) return 'Informe o valor.'
    if (!descricao.trim()) return 'Escreva uma descrição.'
    if (!base) return 'Informe a data.'
    if (pago && !pagoEm) return 'Informe a data do pagamento.'
    if (!operacional && !socio) return 'Escolha o sócio.'
    return null
  }

  const salvar = async () => {
    const e = validar(); if (e) { setErro(e); return }
    setSalvando(true); setErro(null)
    try {
      const id = l?.id ?? idNovo.current
      const enviados: Anexo[] = []
      for (const f of novos) enviados.push(await api.enviarAnexo(id, f))
      const todosAnexos = [...anexos, ...enviados]
      const comum = {
        tipo, descricao: descricao.trim(),
        categoria_id: operacional ? categoria || null : null,
        conta_id: noBolso ? null : conta || null,
        socio_id: socio || null,
        contraparte: contraparte.trim() || null, forma: forma || null, observacoes: obs.trim() || null,
      }
      if (l) {
        const campos: Partial<NovoLancamento> = { ...comum, valor: valor!, vencimento: base, pago_em: pago ? pagoEm : null, anexos: todosAnexos }
        await api.atualizarLancamento(l.id, campos)
        // "este e os próximos": copia o que não é data, valor de parcela nem pagamento
        if (alcance === 'proximos' && l.grupo && doGrupo.length > 1) {
          // parcelado: cada parcela tem o próprio valor e o "(3/12)" na descrição, então esses dois ficam
          const { valor: _v, pago_em: _p, anexos: _a, vencimento: _d, descricao: _t, ...resto } = campos
          void _v; void _p; void _a; void _d; void _t
          await api.atualizarGrupo(l.grupo, l.vencimento, l.parcelas ? resto : { ...resto, descricao: descricao.trim(), valor: valor! })
        }
        for (const a of removidos) await api.apagarAnexo(a).catch(() => undefined)
        aoSalvar('Lançamento atualizado.')
      } else if (serie) {
        const grupo = novoId()
        const lista: NovoLancamento[] = Array.from({ length: serie.n }, (_, i) => {
          const dia = somarMeses(base, i)
          return {
            ...comum, id: i === 0 ? id : novoId(), marca: api.marca, valor: i === serie.n - 1 ? serie.ultima : serie.parcela,
            descricao: repeticao === 'parcelado' ? `${descricao.trim()} (${i + 1}/${serie.n})` : descricao.trim(),
            vencimento: dia, pago_em: i === 0 && pago ? pagoEm : null, anexos: i === 0 ? todosAnexos : [],
            grupo, parcela: i + 1, parcelas: repeticao === 'parcelado' ? serie.n : null, origem: null, origem_id: null,
          }
        })
        // todas as linhas com os mesmos campos (o banco recusa um lote misturado)
        await api.salvarLancamentos(lista)
        aoSalvar(`${serie.n} lançamentos criados.`)
      } else {
        await api.salvarLancamentos([{ ...comum, id, marca: api.marca, valor: valor!, vencimento: base, pago_em: pago ? pagoEm : null, anexos: todosAnexos, grupo: null, parcela: null, parcelas: null, origem: null, origem_id: null }])
        aoSalvar(`${ROTULO_TIPO[tipo]} lançada.`)
      }
    } catch (x) { setErro((x as Error).message) } finally { setSalvando(false) }
  }

  const apagar = async () => {
    if (!l) return
    setSalvando(true); setErro(null)
    try {
      const ids = alcance === 'proximos' && doGrupo.length > 1 ? doGrupo.map((x) => x.id) : [l.id]
      const todos = dados.lancamentos.filter((x) => ids.includes(x.id))
      await api.apagarLancamentos(ids)
      for (const x of todos) for (const a of x.anexos) await api.apagarAnexo(a).catch(() => undefined)
      aoSalvar(ids.length > 1 ? `${ids.length} lançamentos apagados.` : 'Lançamento apagado.')
    } catch (x) { setErro((x as Error).message); setSalvando(false) }
  }

  const abrirAnexo = async (a: Anexo) => {
    const janela = window.open('', '_blank')
    try { const url = await api.linkDoAnexo(a); if (janela) janela.location.href = url; else window.location.href = url }
    catch (x) { janela?.close(); setErro((x as Error).message) }
  }
  const escolherArquivos = (fs: FileList | null) => {
    if (!fs) return
    const ok: File[] = []
    for (const f of Array.from(fs)) {
      if (f.size > 10 * 1024 * 1024) { setErro(`"${f.name}" passa de 10 MB.`); continue }
      ok.push(f)
    }
    setNovos((n) => [...n, ...ok])
  }

  const tom = !operacional ? 'socio' : entrada ? 'entrada' : 'saida'
  const titulo = novo ? (tipo === 'despesa' ? 'Nova despesa' : tipo === 'receita' ? 'Nova receita' : tipo === 'aporte' ? 'Novo aporte de sócio' : 'Nova retirada de sócio') : 'Editar lançamento'
  const somenteLeitura = !podeEditar

  return (
    <Janela titulo={titulo} tom={tom} aoFechar={aoFechar}
      sub={l ? `${ROTULO_TIPO[l.tipo]}${l.parcelas ? ` · parcela ${l.parcela} de ${l.parcelas}` : l.grupo ? ' · repete todo mês' : ''}` : 'Preencha o que souber; o resto dá para completar depois.'}
      rodape={somenteLeitura ? <button type="button" className="fin-btn" onClick={aoFechar}>Fechar</button> : confirmarApagar
        ? <><span className="fin-rodape-pergunta">{alcance === 'proximos' && doGrupo.length > 1 ? `Apagar ${doGrupo.length} lançamentos?` : 'Apagar este lançamento?'} Não dá para desfazer.</span>
          <button type="button" className="fin-btn" onClick={() => setConfirmarApagar(false)} disabled={salvando}>Voltar</button>
          <button type="button" className="fin-btn perigo" onClick={() => void apagar()} disabled={salvando}>{salvando ? 'Apagando…' : 'Apagar'}</button></>
        : <>{l && <button type="button" className="fin-btn texto perigo" onClick={() => setConfirmarApagar(true)} disabled={salvando}>Apagar</button>}
          <span className="fin-rodape-espaco" />
          <button type="button" className="fin-btn" onClick={aoFechar} disabled={salvando}>Cancelar</button>
          <button type="button" className="fin-btn primario" onClick={() => void salvar()} disabled={salvando}>{salvando ? 'Salvando…' : serie ? `Criar ${serie.n} lançamentos` : 'Salvar'}</button></>}>
      <fieldset className="fin-form" disabled={somenteLeitura || salvando}>
        <Segmentado rotulo="Tipo" className="fin-seg-tipo" valor={tipo} aoMudar={trocarTipo} opcoes={[
          { id: 'despesa', nome: 'Despesa', tom: 'saida' }, { id: 'receita', nome: 'Receita', tom: 'entrada' },
          { id: 'retirada', nome: 'Retirada', tom: 'socio', dica: 'Dinheiro que um sócio tirou do projeto' }, { id: 'aporte', nome: 'Aporte', tom: 'socio', dica: 'Dinheiro que um sócio colocou no projeto' },
        ]} />

        <div className="fin-form-grade">
          <Campo rotulo="Valor" className="fin-campo-valor">
            <span className={`fin-input-valor ${entrada ? 'fin-entra' : 'fin-sai'}`}><em>R$</em>
              <input data-foco inputMode="decimal" placeholder="0,00" value={valorTxt} onChange={(e) => setValorTxt(e.target.value)}
                onBlur={() => { const v = lerValor(valorTxt); setValorTxt(escreverValor(v)) }} aria-label="Valor em reais" /></span>
          </Campo>
          <Campo rotulo="Descrição" largo>
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={150}
              placeholder={tipo === 'despesa' ? 'Ex.: Anúncios do Facebook' : tipo === 'receita' ? 'Ex.: Markup de novembro' : tipo === 'aporte' ? 'Ex.: Aporte para os anúncios' : 'Ex.: Distribuição de lucro de outubro'} />
          </Campo>

          <div className="fin-campo fin-campo-pago">
            <span className="fin-campo-rot">Situação</span>
            <Interruptor ligado={pago} aoMudar={(v) => { setPago(v); if (v && !pagoEm) setPagoEm(hoje()); if (!v && novo && pagoEm) setVencimento(pagoEm) }}
              rotulo={pago ? (entrada ? 'Já recebido' : 'Já pago') : (entrada ? 'A receber' : 'A pagar')} />
          </div>
          {pago
            ? <Campo rotulo={entrada ? 'Recebido em' : 'Pago em'}><input type="date" value={pagoEm} onChange={(e) => setPagoEm(e.target.value)} required /></Campo>
            : <Campo rotulo={entrada ? 'Data para receber' : 'Vencimento'}><input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} required /></Campo>}
          {/* editando um que já foi pago: o vencimento original continua à vista */}
          {pago && !novo && <Campo rotulo="Vencimento"><input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} required /></Campo>}

          {operacional && <Campo rotulo="Categoria">
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Sem categoria</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>}
          <Campo rotulo="Forma de pagamento" largo={!operacional || (pago && !novo)}>
            <select value={forma} onChange={(e) => setForma(e.target.value)}>
              <option value="">Não informada</option>
              {FORMAS.map((f) => <option key={f} value={f}>{f}</option>)}
              {forma && !(FORMAS as readonly string[]).includes(forma) && <option value={forma}>{forma}</option>}
            </select>
          </Campo>

          <div className="fin-campo largo">
            <span className="fin-campo-rot">{tipo === 'despesa' ? 'Quem pagou' : tipo === 'receita' ? 'Onde o dinheiro caiu' : tipo === 'aporte' ? 'Sócio que colocou' : 'Sócio que tirou'}</span>
            <div className="fin-escolha">
              {operacional && <button type="button" className={!socio ? 'on' : ''} onClick={() => setSocio('')}>
                <b>Conta do projeto</b><small>{tipo === 'despesa' ? 'Saiu do caixa do projeto' : 'Entrou no caixa do projeto'}</small></button>}
              {sociosAtivos.map((s) => <button key={s.id} type="button" className={socio === s.id ? 'on' : ''} onClick={() => setSocio(s.id)} style={{ ['--fin-cor' as string]: s.cor }}>
                <b><i className="fin-ponto" />{s.nome}</b><small>{tipo === 'despesa' ? 'Pagou do próprio bolso' : tipo === 'receita' ? 'Caiu na conta pessoal' : `${s.percentual.toLocaleString('pt-BR')}% do resultado`}</small></button>)}
              {!sociosAtivos.length && !operacional && <p className="fin-aviso-mini">Cadastre os sócios em Cadastros para lançar aportes e retiradas.</p>}
            </div>
            {noBolso && <small className="fin-campo-dica">Entra no resultado do projeto e no acerto entre os sócios, sem mexer no saldo das contas.</small>}
          </div>

          {!noBolso && <Campo rotulo={entrada ? 'Conta que recebeu' : 'Conta que pagou'} largo={!operacional}>
            <select value={conta} onChange={(e) => setConta(e.target.value)}>
              <option value="">Nenhuma conta</option>
              {contasAtivas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>}
          {operacional && <Campo rotulo={entrada ? 'Cliente ou origem' : 'Fornecedor'} largo={!!noBolso}>
            <input value={contraparte} onChange={(e) => setContraparte(e.target.value)} list="fin-contrapartes" maxLength={120} placeholder={entrada ? 'Ex.: Deriv' : 'Ex.: Meta Platforms'} />
            <datalist id="fin-contrapartes">{contrapartes.map((c) => <option key={c} value={c} />)}</datalist>
          </Campo>}

          {novo && <div className="fin-campo largo">
            <span className="fin-campo-rot">Repetição</span>
            <Segmentado rotulo="Repetição" valor={repeticao} aoMudar={setRepeticao} opcoes={[{ id: 'nao', nome: 'Não repete' }, { id: 'mensal', nome: 'Todo mês' }, { id: 'parcelado', nome: 'Parcelado' }]} />
            {repeticao !== 'nao' && <div className="fin-repetir">
              <label><span>{repeticao === 'parcelado' ? 'Parcelas' : 'Por quantos meses'}</span>
                <input type="number" min={2} max={60} value={vezes} onChange={(e) => setVezes(Math.max(2, Math.min(60, Number(e.target.value) || 2)))} /></label>
              {serie && <p>{repeticao === 'parcelado'
                ? <>{serie.n}x de <b>{reais(serie.parcela)}</b>{serie.ultima !== serie.parcela ? <> (a última de {reais(serie.ultima)})</> : null}, de {dataCurta(base)} a {dataCurta(serie.fim)}.</>
                : <>{serie.n} lançamentos de <b>{reais(serie.parcela)}</b>, de {dataCurta(base)} a {dataCurta(serie.fim)}.</>}
                {pago ? ' Só o primeiro entra como pago.' : ''}</p>}
            </div>}
          </div>}

          <Campo rotulo="Observações" largo>
            <textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={2000} placeholder="Opcional" />
          </Campo>

          <div className="fin-campo largo">
            <span className="fin-campo-rot">Comprovantes</span>
            <div className="fin-anexos">
              {anexos.map((a) => <span key={a.path} className="fin-anexo">
                <button type="button" onClick={() => void abrirAnexo(a)} title="Abrir">{a.tipo === 'application/pdf' ? 'PDF' : 'IMG'}<b>{a.nome}</b><small>{tamanho(a.tamanho)}</small></button>
                {!somenteLeitura && <button type="button" className="fin-anexo-tirar" aria-label={`Tirar ${a.nome}`} onClick={() => { setAnexos((x) => x.filter((y) => y !== a)); setRemovidos((x) => [...x, a]) }}>×</button>}
              </span>)}
              {novos.map((f, i) => <span key={`${f.name}-${i}`} className="fin-anexo novo">
                <button type="button" disabled>{f.type === 'application/pdf' ? 'PDF' : 'IMG'}<b>{f.name}</b><small>{tamanho(f.size)} · sobe ao salvar</small></button>
                <button type="button" className="fin-anexo-tirar" aria-label={`Tirar ${f.name}`} onClick={() => setNovos((x) => x.filter((_, j) => j !== i))}>×</button>
              </span>)}
              {!somenteLeitura && <button type="button" className="fin-anexar" onClick={() => arquivo.current?.click()}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Anexar comprovante</button>}
              <input ref={arquivo} type="file" hidden multiple accept="application/pdf,image/*,.heic,.heif" onChange={(e) => { escolherArquivos(e.target.files); e.target.value = '' }} />
            </div>
          </div>

          {l?.grupo && doGrupo.length > 1 && !somenteLeitura && <div className="fin-campo largo">
            <span className="fin-campo-rot">Aplicar a</span>
            <Segmentado rotulo="Aplicar a" valor={alcance} aoMudar={setAlcance} opcoes={[{ id: 'este', nome: 'Só este' }, { id: 'proximos', nome: `Este e os próximos (${doGrupo.length})` }]} />
            {alcance === 'proximos' && <small className="fin-campo-dica">{l.parcelas ? 'Categoria, conta, sócio, fornecedor e forma valem para todas as parcelas. Valor, descrição, datas e pagamentos de cada uma não mudam.' : 'Descrição, valor, categoria, conta, sócio, fornecedor e forma valem para todos. Datas e pagamentos de cada um não mudam.'}</small>}
          </div>}
        </div>
        {erro && <p className="fin-erro" role="alert">{erro}</p>}
      </fieldset>
    </Janela>
  )
}
