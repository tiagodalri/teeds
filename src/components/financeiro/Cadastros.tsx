/* Cadastros: sócios (com o percentual de cada um), contas (onde o dinheiro fica) e categorias. */
import { useState, type ReactNode } from 'react'
import { reais, saldosDasContas, type Categoria, type Conta, type DadosFin, type FinApi, type Socio } from '../../core/teeds/financeiro'
import { Icone } from '../Icone'
import { Avatar, Campo, EscolherCor, Janela, PALETA, escreverValor, lerValor } from './ui'

const TIPOS_CONTA: Record<Conta['tipo'], string> = { banco: 'Conta bancária', caixa: 'Dinheiro em caixa', cartao: 'Cartão de crédito', plataforma: 'Plataforma (Cakto, Deriv…)', outro: 'Outra' }
/** "Nenhum lançamento", "1 lançamento", "12 lançamentos". */
const contagem = (n: number, um: string, varios: string, nenhum: string) => n === 0 ? nenhum : `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`
const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`

type Editando =
  | { o: 'socio'; v: Partial<Socio> }
  | { o: 'conta'; v: Partial<Conta> }
  | { o: 'categoria'; v: Partial<Categoria> }
  | null

export function Cadastros({ api, dados, podeEditar, souDono, aoMudar }: {
  api: FinApi; dados: DadosFin; podeEditar: boolean; souDono: boolean
  aoMudar: (mensagem: string) => void
}) {
  const [editando, setEditando] = useState<Editando>(null)
  const [verArquivados, setVerArquivados] = useState(false)
  const saldos = new Map(saldosDasContas(dados).map((s) => [s.conta.id, s.saldo]))
  const usos = (campo: 'categoria_id' | 'conta_id' | 'socio_id', id: string) => dados.lancamentos.filter((l) => l[campo] === id).length
  const somaPct = dados.socios.filter((s) => s.ativo).reduce((s, x) => s + x.percentual, 0)
  const ver = <T extends { ativo: boolean }>(l: T[]) => l.filter((x) => verArquivados || x.ativo)
  const arquivados = [...dados.socios, ...dados.contas, ...dados.categorias].filter((x) => !x.ativo).length

  const Linha = ({ cor, nome, sub, valor, arquivado, aoEditar }: { cor: string; nome: ReactNode; sub?: ReactNode; valor?: ReactNode; arquivado?: boolean; aoEditar?: () => void }) =>
    <li className={arquivado ? 'arquivado' : ''} style={{ ['--fin-cor' as string]: cor }}>
      <i className="fin-ponto" /><span><b>{nome}</b>{sub && <small>{sub}</small>}</span>
      {valor && <strong>{valor}</strong>}
      {aoEditar && <button type="button" className="fin-btn pequeno texto" onClick={aoEditar}>Editar</button>}
    </li>

  return <div className="fin-cadastros">
    {arquivados > 0 && <label className="fin-check fin-cadastros-arq"><input type="checkbox" checked={verArquivados} onChange={(e) => setVerArquivados(e.target.checked)} /><span>Mostrar arquivados ({arquivados})</span></label>}
    <div className="fin-grade-3">
      <section className="fin-cartao">
        <header><div><span className="fin-rot">Divisão do resultado</span><h3>Sócios</h3></div>
          {souDono && <button type="button" className="fin-btn pequeno" onClick={() => setEditando({ o: 'socio', v: { nome: '', percentual: Math.max(0, Math.round((100 - somaPct) * 100) / 100), cor: PALETA[(dados.socios.length + 4) % PALETA.length], ativo: true } })}><Icone nome="mais" />Sócio</button>}</header>
        <div className={`fin-soma ${Math.abs(somaPct - 100) < 0.005 ? 'ok' : 'falta'}`}>
          <span className="fin-soma-barra">{dados.socios.filter((s) => s.ativo).map((s) => <i key={s.id} style={{ width: `${Math.min(100, s.percentual)}%`, background: s.cor }} />)}</span>
          <small>{Math.abs(somaPct - 100) < 0.005 ? 'Os percentuais fecham 100%' : `Somam ${pct(somaPct)} · ${somaPct < 100 ? `faltam ${pct(100 - somaPct)}` : `passam ${pct(somaPct - 100)}`}`}</small>
        </div>
        <ul className="fin-cad-lista">
          {ver(dados.socios).map((s) => <li key={s.id} className={s.ativo ? '' : 'arquivado'}>
            <Avatar nome={s.nome} cor={s.cor} tamanho={32} /><span><b>{s.nome}</b><small>{s.ativo ? contagem(usos('socio_id', s.id), 'movimento', 'movimentos', 'Nenhum movimento') : 'Arquivado'}</small></span>
            <strong>{pct(s.percentual)}</strong>
            {souDono && <button type="button" className="fin-btn pequeno texto" onClick={() => setEditando({ o: 'socio', v: s })}>Editar</button>}
          </li>)}
          {!dados.socios.length && <li className="fin-cartao-vazio">{souDono ? 'Cadastre quem divide o resultado e o percentual de cada um.' : 'Nenhum sócio cadastrado. Só o dono do financeiro cadastra.'}</li>}
        </ul>
      </section>

      <section className="fin-cartao">
        <header><div><span className="fin-rot">Onde o dinheiro fica</span><h3>Contas</h3></div>
          {podeEditar && <button type="button" className="fin-btn pequeno" onClick={() => setEditando({ o: 'conta', v: { nome: '', tipo: 'banco', saldo_inicial: 0, cor: PALETA[(dados.contas.length + 9) % PALETA.length], ativo: true } })}><Icone nome="mais" />Conta</button>}</header>
        <ul className="fin-cad-lista">
          {ver(dados.contas).map((c) => <Linha key={c.id} cor={c.cor} nome={c.nome} sub={c.ativo ? TIPOS_CONTA[c.tipo] : 'Arquivada'} arquivado={!c.ativo}
            valor={<span className={(saldos.get(c.id) ?? 0) < 0 ? 'negativo' : ''}>{reais(saldos.get(c.id) ?? 0)}</span>} aoEditar={podeEditar ? () => setEditando({ o: 'conta', v: c }) : undefined} />)}
          {!dados.contas.length && <li className="fin-cartao-vazio">Nenhuma conta.</li>}
        </ul>
      </section>

      <section className="fin-cartao">
        <header><div><span className="fin-rot">Para organizar</span><h3>Categorias</h3></div>
          {podeEditar && <button type="button" className="fin-btn pequeno" onClick={() => setEditando({ o: 'categoria', v: { nome: '', tipo: 'saida', cor: PALETA[dados.categorias.length % PALETA.length], ativo: true } })}><Icone nome="mais" />Categoria</button>}</header>
        {(['saida', 'entrada'] as const).map((t) => <div key={t} className="fin-cad-grupo">
          <span className="fin-rot">{t === 'saida' ? 'Despesas' : 'Receitas'}</span>
          <ul className="fin-cad-lista compacta">
            {ver(dados.categorias.filter((c) => c.tipo === t)).map((c) => <Linha key={c.id} cor={c.cor} nome={c.nome} sub={c.ativo ? contagem(usos('categoria_id', c.id), 'lançamento', 'lançamentos', 'Nenhum lançamento') : 'Arquivada'} arquivado={!c.ativo}
              aoEditar={podeEditar ? () => setEditando({ o: 'categoria', v: c }) : undefined} />)}
          </ul>
        </div>)}
      </section>
    </div>

    {editando && <EditorCadastro api={api} editando={editando} usos={editando.v.id ? usos(editando.o === 'socio' ? 'socio_id' : editando.o === 'conta' ? 'conta_id' : 'categoria_id', editando.v.id) : 0}
      somaOutros={editando.o === 'socio' ? dados.socios.filter((s) => s.ativo && s.id !== editando.v.id).reduce((s, x) => s + x.percentual, 0) : 0}
      aoFechar={() => setEditando(null)} aoSalvar={(m) => { setEditando(null); aoMudar(m) }} />}
  </div>
}

function EditorCadastro({ api, editando, usos, somaOutros, aoFechar, aoSalvar }: {
  api: FinApi; editando: NonNullable<Editando>; usos: number; somaOutros: number; aoFechar: () => void; aoSalvar: (m: string) => void
}) {
  const v = editando.v
  const [nome, setNome] = useState(v.nome ?? '')
  const [cor, setCor] = useState(v.cor ?? PALETA[0])
  const [percentual, setPercentual] = useState(editando.o === 'socio' ? String((editando.v as Partial<Socio>).percentual ?? 0).replace('.', ',') : '')
  const [tipoConta, setTipoConta] = useState<Conta['tipo']>(editando.o === 'conta' ? (editando.v as Partial<Conta>).tipo ?? 'banco' : 'banco')
  const [saldoInicial, setSaldoInicial] = useState(editando.o === 'conta' ? escreverValor((editando.v as Partial<Conta>).saldo_inicial ?? 0) : '')
  const [tipoCat, setTipoCat] = useState<Categoria['tipo']>(editando.o === 'categoria' ? (editando.v as Partial<Categoria>).tipo ?? 'saida' : 'saida')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const novo = !v.id
  const nomeObjeto = editando.o === 'socio' ? 'sócio' : editando.o === 'conta' ? 'conta' : 'categoria'
  const feminino = editando.o !== 'socio'
  const pctNum = Number(percentual.replace(',', '.'))

  const salvar = async (ativo = v.ativo ?? true) => {
    if (!nome.trim()) { setErro('Escreva o nome.'); return }
    setSalvando(true); setErro(null)
    try {
      if (editando.o === 'socio') {
        if (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100) { setErro('O percentual vai de 0 a 100.'); setSalvando(false); return }
        await api.salvarSocio({ id: v.id, nome: nome.trim(), cor, percentual: Math.round(pctNum * 10000) / 10000, ativo })
      } else if (editando.o === 'conta') {
        await api.salvarConta({ id: v.id, nome: nome.trim(), cor, tipo: tipoConta, saldo_inicial: lerValor(saldoInicial) ?? 0, ativo })
      } else {
        await api.salvarCategoria({ id: v.id, nome: nome.trim(), cor, tipo: tipoCat, ativo })
      }
      aoSalvar(novo ? `${feminino ? 'Nova' : 'Novo'} ${nomeObjeto} ${feminino ? 'criada' : 'criado'}.` : ativo === (v.ativo ?? true) ? 'Alterações salvas.' : ativo ? `${nomeObjeto[0].toUpperCase()}${nomeObjeto.slice(1)} de volta.` : `${nomeObjeto[0].toUpperCase()}${nomeObjeto.slice(1)} ${feminino ? 'arquivada' : 'arquivado'}.`)
    } catch (x) { setErro((x as Error).message); setSalvando(false) }
  }

  return <Janela largura={460} aoFechar={aoFechar}
    titulo={novo ? `${feminino ? 'Nova' : 'Novo'} ${nomeObjeto}` : `Editar ${nomeObjeto}`}
    sub={!novo && usos ? `Usad${feminino ? 'a' : 'o'} em ${usos} ${usos === 1 ? 'lançamento' : 'lançamentos'}. Arquivar não apaga nada: some das listas de escolha e o histórico continua.` : undefined}
    rodape={<>{!novo && <button type="button" className="fin-btn texto" onClick={() => void salvar(!(v.ativo ?? true))} disabled={salvando}>{v.ativo === false ? 'Desarquivar' : 'Arquivar'}</button>}
      <span className="fin-rodape-espaco" />
      <button type="button" className="fin-btn" onClick={aoFechar} disabled={salvando}>Cancelar</button>
      <button type="button" className="fin-btn primario" onClick={() => void salvar()} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button></>}>
    <fieldset className="fin-form" disabled={salvando}>
      <div className="fin-form-grade">
        <Campo rotulo="Nome" largo><input data-foco value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60}
          placeholder={editando.o === 'socio' ? 'Ex.: Tiago Dal Ri' : editando.o === 'conta' ? 'Ex.: Conta PJ do Itaú' : 'Ex.: Anúncios'} /></Campo>
        {editando.o === 'socio' && <Campo rotulo="Percentual do resultado" largo
          dica={Number.isFinite(pctNum) ? `Com este, os sócios somam ${(somaOutros + pctNum).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%.` : undefined}>
          <span className="fin-input-sufixo"><input inputMode="decimal" value={percentual} onChange={(e) => setPercentual(e.target.value.replace(/[^\d,.]/g, ''))} /><em>%</em></span>
        </Campo>}
        {editando.o === 'conta' && <>
          <Campo rotulo="Tipo"><select value={tipoConta} onChange={(e) => setTipoConta(e.target.value as Conta['tipo'])}>
            {(Object.keys(TIPOS_CONTA) as Conta['tipo'][]).map((t) => <option key={t} value={t}>{TIPOS_CONTA[t]}</option>)}</select></Campo>
          <Campo rotulo="Saldo inicial" dica="O que já havia na conta antes do primeiro lançamento.">
            <span className="fin-input-valor"><em>R$</em><input inputMode="decimal" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} onBlur={() => setSaldoInicial(escreverValor(lerValor(saldoInicial) ?? 0))} /></span>
          </Campo>
        </>}
        {editando.o === 'categoria' && <Campo rotulo="Tipo" largo>
          <select value={tipoCat} onChange={(e) => setTipoCat(e.target.value as Categoria['tipo'])} disabled={!novo && usos > 0}>
            <option value="saida">Despesa</option><option value="entrada">Receita</option></select>
        </Campo>}
        <div className="fin-campo largo"><span className="fin-campo-rot">Cor</span><EscolherCor valor={cor} aoMudar={setCor} /></div>
      </div>
      {erro && <p className="fin-erro" role="alert">{erro}</p>}
    </fieldset>
  </Janela>
}
