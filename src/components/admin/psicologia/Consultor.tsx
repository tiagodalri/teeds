/**
 * GF Brain (28/11/2026, Tiago: "um chat dentro dessa aba... uma inteligência conectada com TODOS os dados do
 * negócio, tipo um consultor" e depois "vá além... sugestões incríveis, um gerador de perguntas com I.A., uma aula").
 * Conversa com a função psicologia-consultor: texto, áudio gravado na hora, foto, vídeo e arquivo.
 *
 * Além do chat: rituais de um toque (raio-X, plano da semana, aula), biblioteca de perguntas por tema, gerador
 * de perguntas feito pela própria I.A. em cima dos dados, lentes (o papel que a I.A. assume) e, depois de cada
 * resposta, os próximos passos sugeridos por ela. A conversa fica guardada neste aparelho (localStorage).
 * Nome de aluno não vai para a I.A.: a função troca por código na ida e devolve o nome na volta.
 */
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import type { SessaoTeeds } from '../../../core/teeds/conta'
import { ErroDoConsultor, perguntarAoConsultor, type AnexoDoConsultor } from '../../../core/teeds/psicologia'
import { RespostaFormatada } from '../../assistente/RespostaFormatada'
import { imagemPronta, paraBase64, relogio, useGravador } from '../../assistente/midia'

interface Mensagem { id: string; de: 'eu' | 'ia'; texto: string; anexos?: Array<{ tipo: 'audio' | 'imagem' | 'video' | 'arquivo'; nome: string; segundos?: number }>; erro?: boolean; nova?: boolean; alunos?: string[]; proximas?: string[]; consultas?: number }
interface Pendente { id: string; tipo: 'imagem' | 'video' | 'arquivo'; nome: string; mime: string; blob: Blob; previa?: string }
interface Gerada { tema: string; pergunta: string; porque: string }

const TETO = 9_500_000 // bytes somados dos anexos de uma mensagem
const chave = (marca: string) => `${marca}.psicologia.consultor`
const id = () => Math.random().toString(36).slice(2, 10)

/* ------------------------------------------------------------------ lentes: o papel que a I.A. assume */
type Lente = 'consultor' | 'diabo' | 'financeiro' | 'crescimento' | 'detetive' | 'professor'
const LENTES: Array<{ id: Lente; nome: string; frase: string; papel: string }> = [
  { id: 'consultor', nome: 'Consultor', frase: 'Direto: o número, a leitura e o que fazer.', papel: '' },
  { id: 'diabo', nome: 'Advogado do diabo', frase: 'Desconfia de tudo e mostra onde a conclusão pode estar errada.', papel: 'Responda como advogado do diabo: questione a conclusão mais óbvia, mostre o que os dados NÃO provam, aponte amostras pequenas e explicações alternativas, e diga o que eu precisaria medir para ter certeza.' },
  { id: 'financeiro', nome: 'Financeiro', frase: 'Tudo em dinheiro: receita, custo de oportunidade, concentração.', papel: 'Responda como diretor financeiro: traduza tudo em dinheiro (markup, depósito, concentração de receita, risco), diga quanto cada coisa vale por mês e onde está o maior risco para a receita.' },
  { id: 'crescimento', nome: 'Crescimento', frase: 'Alavancas e testes para a próxima semana.', papel: 'Responda como líder de crescimento: aponte as alavancas com maior efeito, proponha de 2 a 3 testes simples para os próximos 7 dias, com o que medir e o que seria um bom resultado.' },
  { id: 'detetive', nome: 'Detetive', frase: 'Procura o padrão escondido e o que foge do normal.', papel: 'Responda como detetive: procure o que foge do padrão, as coincidências que se repetem, os alunos fora da curva e o que aconteceu logo antes de cada mudança. Consulte o banco se precisar e mostre as pistas uma a uma.' },
  { id: 'professor', nome: 'Professor', frase: 'Explica o conceito por trás do número, do zero.', papel: 'Responda como professor: explique o conceito por trás, do zero e com um exemplo tirado dos meus próprios números, e termine com como eu uso isso no dia a dia.' },
]

/* ------------------------------------------------------------------ rituais: um toque, uma entrega grande */
const RITUAIS: Array<{ nome: string; frase: string; pedido: string }> = [
  { nome: 'Raio-X de hoje', frase: 'O que mudou, o que preocupa e o que comemorar.',
    pedido: 'Faça o raio-X do negócio hoje. Consulte o banco para os últimos 7 dias e compare com os 7 anteriores: cadastros, depósitos, saques, markup (I.A. e manual), alunos operando. Diga em três blocos curtos: o que melhorou, o que piorou, e a única coisa que eu não posso ignorar hoje.' },
  { nome: 'Plano da semana', frase: 'Cinco ações em ordem, com quem chamar e o que medir.',
    pedido: 'Monte o plano de ação desta semana: 5 ações em ordem de impacto no depósito e no markup. Para cada uma: o que fazer, para quais alunos (cite até 3 de exemplo), o número que mostra se funcionou e o resultado esperado. Use os perfis de comportamento e os dossiês.' },
  { nome: 'Dinheiro na mesa', frase: 'Onde está o markup que estamos deixando de fazer.',
    pedido: 'Onde estamos deixando dinheiro na mesa? Estime, com as contas na tela, quanto de markup por mês estamos perdendo em cada ponto: alunos que estudam e não depositam, que depositam e não operam, que somem depois de perder, e depósitos parados em conta. Ordene do maior para o menor.' },
  { nome: 'Aula: meu negócio', frase: 'Uma aula de 5 minutos sobre como este negócio ganha dinheiro.',
    pedido: 'Me dê uma aula de 5 minutos sobre como este negócio ganha dinheiro, usando só os meus números: de onde vem o markup, quem gera, quanto tempo um aluno dura, quanto vale um aluno do cadastro ao último dia, e quais são as 3 alavancas que mais mexem no resultado. Linguagem simples, com exemplo de aluno real.' },
  { nome: 'Alunos para chamar agora', frase: 'A lista de quem vale uma mensagem hoje, e o que dizer.',
    pedido: 'Quais são os 8 alunos que mais valem uma mensagem pessoal hoje? Misture: quem tem saldo parado, quem sumiu depois de perder e já gerou bastante markup, e quem estuda muito e ainda não depositou. Para cada um, diga em uma linha o porquê e a frase de abertura da conversa.' },
  { nome: 'O que eu não estou vendo', frase: 'Três coisas contra a intuição escondidas nos dados.',
    pedido: 'Me surpreenda: encontre 3 coisas contra a intuição nos dados, que eu provavelmente não estou vendo. Consulte o banco, cruze o que normalmente não se cruza (horário, cidade, dispositivo, tempo de tela, ordem das aulas, tamanho da entrada) e mostre o número de cada achado e o que ele muda na minha decisão.' },
]

/* ------------------------------------------------------------------ biblioteca de perguntas */
const BIBLIOTECA: Array<{ tema: string; perguntas: string[] }> = [
  { tema: 'Receita', perguntas: [
    'Quanto de markup fizemos por dia nos últimos 14 dias, separado entre I.A. e manual?',
    'Qual é o valor de um aluno do cadastro ao último dia, e quanto tempo leva para ele gerar metade disso?',
    'Se os 10 alunos que mais geram markup parassem amanhã, quanto da receita cairia? Quem são eles?',
    'Qual I.A. gera mais markup por dólar operado, e qual gera mais por aluno?',
    'Qual é o melhor e o pior horário do dia em markup por pessoa operando?',
  ] },
  { tema: 'Depósitos', perguntas: [
    'O que acontece nas 24 horas antes do primeiro depósito? Qual é a sequência mais comum?',
    'Quem deposita pela segunda vez: o que eles fizeram de diferente entre o 1º e o 2º depósito?',
    'Quanto dinheiro está parado em contas reais sem operar há mais de 3 dias?',
    'Qual faixa de primeiro depósito traz o aluno que dura mais e gera mais markup?',
    'Quantos depósitos são feitos logo depois de uma perda, e o que acontece com esse dinheiro?',
  ] },
  { tema: 'Retenção', perguntas: [
    'Em que dia de vida o aluno mais abandona, e o que ele fez no último dia?',
    'Dos que pararam, quantos pararam ganhando e quantos pararam perdendo?',
    'Quem voltou depois de mais de 7 dias sumido? O que trouxe essa pessoa de volta?',
    'Qual é a diferença entre quem dura 2 dias e quem dura 14, na primeira semana?',
    'Quais alunos estão hoje no mesmo caminho de quem sumiu?',
  ] },
  { tema: 'Comportamento', perguntas: [
    'Quais alunos mais religam a I.A. no impulso, e quanto isso já custou a cada um?',
    'Quem bate a meta e para de verdade? O resultado deles é diferente?',
    'O tamanho da entrada sobe depois de uma perda? Em quanto, e com quem?',
    'Quem opera de madrugada perde mais? Mostre os números.',
    'Existe um limite de perda e uma meta que aparecem mais entre quem está no positivo?',
  ] },
  { tema: 'Aulas', perguntas: [
    'Qual é a ordem de aulas mais comum entre quem depositou, e onde a maioria trava?',
    'Qual aula é mais revista, e o que os alunos fazem logo depois de rever?',
    'Quem concluiu a trilha inteira se comporta diferente na operação?',
    'Qual aula tem a maior queda de audiência no meio?',
    'A série I.A. na Prática mudou o uso das I.A.? Compare antes e depois.',
  ] },
  { tema: 'Lives e avisos', perguntas: [
    'Qual live trouxe mais depósito por minuto no ar, e o que ela tinha de diferente?',
    'Quem assiste live opera mais, deposita mais ou perde menos?',
    'Qual é o melhor horário para avisar no celular, olhando quando os alunos abrem a plataforma?',
    'Quantas pessoas abrem a plataforma em até 1 hora depois de cada aviso?',
  ] },
  { tema: 'Parceiros', perguntas: [
    'Compare os alunos do Naor com os do Victor: depósito, markup, duração e comportamento.',
    'De qual parceiro vêm os alunos que mais duram, e por quê?',
    'Qual parceiro tem mais alunos parados entre o cadastro e a primeira aula?',
  ] },
  { tema: 'Risco', perguntas: [
    'Quais sinais aparecem nos 2 dias antes de um aluno zerar a conta?',
    'Quantos alunos estão com resultado muito negativo e ainda ativos? Quem precisa de cuidado?',
    'Quanto da nossa receita depende de comportamento de impulso dos alunos?',
    'O que acontece com o markup se o aluno operar de forma mais disciplinada?',
  ] },
]

const PEDIDO_DO_GERADOR = (sobre: string) => `Aja como estrategista-chefe. Olhe os dados${sobre ? ` com foco em: ${sobre}` : ''} e gere 9 perguntas estratégicas que eu deveria estar fazendo e ainda não fiz: específicas para ESTE negócio (cite números ou padrões reais que motivam cada uma), de temas variados, incluindo pelo menos 3 contra a intuição. Não responda às perguntas.
Formato OBRIGATÓRIO: exatamente uma por linha, sem numeração, sem negrito e sem texto antes ou depois, assim:
TEMA | pergunta | por que importa (uma frase com o número que motivou)`
const PEDIDO_DE_PROXIMAS = '\n\n(Instrução de formato: depois da resposta, pule uma linha e escreva uma última linha começando com "PRÓXIMAS:" seguida de 3 perguntas curtas de aprofundamento, separadas por " | ". Só essa linha, sem negrito.)'

function separarProximas(texto: string): { texto: string; proximas: string[] } {
  const m = texto.match(/\n?\**\s*PR[ÓO]XIMAS\s*:?\**\s*:?(.*)$/is)
  if (!m) return { texto, proximas: [] }
  const proximas = m[1].split(/\s*\|\s*|\n+/).map((p) => p.replace(/^[-•\d.)\s*]+/, '').replace(/\*+/g, '').trim()).filter((p) => p.length > 8 && p.length < 220).slice(0, 3)
  return { texto: texto.slice(0, m.index).trim(), proximas }
}
function lerGeradas(texto: string): Gerada[] {
  return texto.split('\n').map((l) => l.replace(/^[-•\d.)\s*]+/, '').replace(/\*+/g, '').split('|').map((p) => p.trim()))
    .filter((p) => p.length >= 2 && p[1].length > 12).map((p) => ({ tema: p[0].slice(0, 28), pergunta: p[1], porque: p[2] ?? '' })).slice(0, 12)
}

function ler(marca: string): Mensagem[] {
  try {
    const l = JSON.parse(localStorage.getItem(chave(marca)) ?? '[]')
    return Array.isArray(l) ? l.filter((m) => m && typeof m.texto === 'string').slice(-80).map((m) => ({ ...m, nova: false })) : []
  } catch { return [] }
}

const IconeClipe = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5l-7.8 7.8a5 5 0 01-7.1-7.1l8.5-8.5a3.5 3.5 0 015 5l-8.5 8.4a2 2 0 01-2.8-2.8l7.8-7.8" /></svg>
const IconeMic = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3" /></svg>
const IconeEnviar = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" /></svg>
const IconeParar = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>
const IconeFaisca = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>

export function Consultor({ sessao, marca, parceiro, aoAbrirAluno }: { sessao: SessaoTeeds; marca: string; parceiro: string; aoAbrirAluno?: (id: string) => void }) {
  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao
  const [mensagens, setMensagens] = useState<Mensagem[]>(() => ler(marca))
  const [texto, setTexto] = useState('')
  const [pendentes, setPendentes] = useState<Pendente[]>([])
  const [pensando, setPensando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [lente, setLente] = useState<Lente>('consultor')
  const [tema, setTema] = useState(BIBLIOTECA[0].tema)
  const [sobre, setSobre] = useState('')
  const [geradas, setGeradas] = useState<Gerada[]>([])
  const [gerando, setGerando] = useState(false)
  const [painel, setPainel] = useState(false) // a central de perguntas aberta por cima da conversa
  const fim = useRef<HTMLDivElement>(null)
  const caixa = useRef<HTMLTextAreaElement>(null)
  const arquivo = useRef<HTMLInputElement>(null)
  const gravador = useGravador(() => undefined)

  useEffect(() => {
    try { localStorage.setItem(chave(marca), JSON.stringify(mensagens.slice(-80).map(({ nova: _n, ...m }) => m))) } catch { /* só não lembra neste aparelho */ }
  }, [mensagens, marca])
  const descer = () => fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  useEffect(() => { descer() }, [mensagens.length, pensando])
  useEffect(() => () => { pendentes.forEach((p) => p.previa && URL.revokeObjectURL(p.previa)) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** `mostrar` é o que aparece no balão; `pedido` é o que vai para a I.A. (o ritual inteiro, por exemplo). */
  async function enviar(mostrar: string, opcoes: { pedido?: string; extras?: AnexoDoConsultor[]; rotulos?: Mensagem['anexos'] } = {}) {
    const visivel = mostrar.trim(), extras = opcoes.extras ?? []
    if (pensando || gerando || (!visivel && !extras.length && !pendentes.length)) return
    setAviso(''); setPainel(false)
    const anexos: AnexoDoConsultor[] = [...extras]
    const mostra: NonNullable<Mensagem['anexos']> = [...(opcoes.rotulos ?? [])]
    try {
      for (const p of pendentes) {
        anexos.push({ mime: p.mime, dados: await paraBase64(p.blob), nome: p.nome })
        mostra.push({ tipo: p.tipo, nome: p.nome })
      }
    } catch { setAviso('Não consegui ler um dos arquivos. Tente anexar de novo.'); return }
    const historico = mensagens.filter((m) => !m.erro && m.texto).slice(-12).map((m) => ({ de: m.de, texto: m.texto }))
    const papel = LENTES.find((l) => l.id === lente)?.papel ?? ''
    const base = (opcoes.pedido ?? visivel).trim()
    const pergunta = `${papel ? `${papel}\n\n` : ''}${base || 'Responda ao que eu disse ou mandei no anexo.'}${PEDIDO_DE_PROXIMAS}`
    setMensagens((l) => [...l, { id: id(), de: 'eu', texto: visivel, anexos: mostra.length ? mostra : undefined }])
    setTexto(''); setPendentes([]); setPensando(true)
    try {
      const r = await perguntarAoConsultor(sessaoRef.current, marca, parceiro, pergunta, historico, anexos)
      const s = separarProximas(r.resposta)
      setMensagens((l) => [...l, { id: id(), de: 'ia', texto: s.texto, nova: true, alunos: r.alunos_citados, proximas: s.proximas, consultas: r.consultas }])
    } catch (e) {
      setMensagens((l) => [...l, { id: id(), de: 'ia', texto: e instanceof ErroDoConsultor ? e.message : 'Não consegui falar com a I.A. agora. Confira a internet e tente de novo.', erro: true }])
    } finally { setPensando(false); requestAnimationFrame(() => caixa.current?.focus()) }
  }

  async function gerar() {
    if (gerando || pensando) return
    setGerando(true); setAviso('')
    try {
      const r = await perguntarAoConsultor(sessaoRef.current, marca, parceiro, PEDIDO_DO_GERADOR(sobre.trim().slice(0, 200)), [], [])
      const l = lerGeradas(r.resposta)
      if (l.length) setGeradas(l)
      else setAviso('A I.A. não devolveu as perguntas no formato certo. Toque em Gerar de novo.')
    } catch (e) { setAviso(e instanceof ErroDoConsultor ? e.message : 'Não consegui gerar as perguntas agora. Tente de novo.') } finally { setGerando(false) }
  }

  async function escolher(e: ChangeEvent<HTMLInputElement>) {
    const lista = [...(e.target.files ?? [])]
    e.target.value = ''
    const novos: Pendente[] = []
    for (const f of lista.slice(0, 6)) {
      try {
        if (f.type.startsWith('image/')) {
          const jpg = await imagemPronta(f)
          novos.push({ id: id(), tipo: 'imagem', nome: f.name, mime: 'image/jpeg', blob: jpg, previa: URL.createObjectURL(jpg) })
        } else if (f.type.startsWith('video/')) novos.push({ id: id(), tipo: 'video', nome: f.name, mime: f.type, blob: f })
        else if (f.type.startsWith('audio/')) novos.push({ id: id(), tipo: 'arquivo', nome: f.name, mime: f.type, blob: f })
        else if (f.type === 'application/pdf' || f.type.startsWith('text/') || /\.(csv|txt|md)$/i.test(f.name)) novos.push({ id: id(), tipo: 'arquivo', nome: f.name, mime: f.type || 'text/plain', blob: f })
        else setAviso('Esse tipo de arquivo eu ainda não leio. Mande foto, vídeo, áudio, PDF ou texto.')
      } catch { setAviso('Não consegui abrir esse arquivo.') }
    }
    const todos = [...pendentes, ...novos]
    if (todos.reduce((t, p) => t + p.blob.size, 0) > TETO) { setAviso('Os anexos passam de 9 MB juntos. Mande um arquivo menor ou um trecho do vídeo.'); novos.forEach((p) => p.previa && URL.revokeObjectURL(p.previa)); return }
    setPendentes(todos)
  }

  async function microfone() {
    if (!gravador.gravando) { setAviso(''); try { await gravador.comecar() } catch { setAviso('Não consegui usar o microfone. Libere o microfone para a plataforma nas configurações do aparelho.') } return }
    const g = await gravador.terminar()
    if (!g) { setAviso('O áudio ficou curto demais. Segure um pouco mais.'); return }
    void enviar(texto, { extras: [{ mime: g.mime, dados: await paraBase64(g.blob), nome: 'audio' }], rotulos: [{ tipo: 'audio', nome: 'Áudio', segundos: g.duracao }] })
  }

  const tecla = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && matchMedia('(pointer: fine)').matches) { e.preventDefault(); void enviar(texto) }
  }
  const limpar = () => { if (mensagens.length && confirm('Apagar esta conversa deste aparelho?')) setMensagens([]) }
  const copiar = (t: string) => { void navigator.clipboard?.writeText(t).then(() => setAviso('Resposta copiada.')).catch(() => undefined) }
  const vazio = !mensagens.length
  const daBiblioteca = BIBLIOTECA.find((b) => b.tema === tema) ?? BIBLIOTECA[0]
  const ocupado = pensando || gerando

  const central = (
    <div className="psi-c-central">
      <section>
        <h3>Rituais <small>um toque, uma entrega completa</small></h3>
        <div className="psi-c-rituais">
          {RITUAIS.map((r) => <button type="button" key={r.nome} disabled={ocupado} onClick={() => void enviar(r.nome, { pedido: r.pedido })}><b>{r.nome}</b><span>{r.frase}</span></button>)}
        </div>
      </section>

      <section className="psi-c-gerador">
        <h3><IconeFaisca />Gerador de perguntas <small>a I.A. lê os seus dados e devolve as perguntas que você ainda não fez</small></h3>
        <div className="psi-c-gerar">
          <input type="text" value={sobre} maxLength={200} onChange={(e) => setSobre(e.target.value)} placeholder="Sobre o quê? (opcional: depósitos, retenção, Naor, lives…)" aria-label="Tema das perguntas" onKeyDown={(e) => { if (e.key === 'Enter') void gerar() }} />
          <button type="button" disabled={ocupado} onClick={() => void gerar()}>{gerando ? 'Gerando…' : geradas.length ? 'Gerar de novo' : 'Gerar perguntas'}</button>
        </div>
        {gerando && <p className="psi-c-gerando"><i /><i /><i />Lendo os dados e pensando nas perguntas (uns 20 segundos)…</p>}
        {!!geradas.length && !gerando && (
          <div className="psi-c-geradas">
            {geradas.map((g) => <button type="button" key={g.pergunta} disabled={ocupado} onClick={() => void enviar(g.pergunta)}><small>{g.tema}</small><b>{g.pergunta}</b>{g.porque ? <span>{g.porque}</span> : null}</button>)}
          </div>
        )}
      </section>

      <section>
        <h3>Biblioteca de perguntas <small>{BIBLIOTECA.reduce((t, b) => t + b.perguntas.length, 0)} perguntas prontas, por tema</small></h3>
        <div className="psi-chips" role="group" aria-label="Tema">
          {BIBLIOTECA.map((b) => <button type="button" key={b.tema} aria-pressed={tema === b.tema} onClick={() => setTema(b.tema)}>{b.tema}</button>)}
        </div>
        <div className="psi-c-biblioteca">
          {daBiblioteca.perguntas.map((p) => <button type="button" key={p} disabled={ocupado} onClick={() => void enviar(p)}>{p}</button>)}
        </div>
      </section>
    </div>
  )

  return (
    <section className={`psi-c${vazio ? ' vazio' : ''}`} aria-label="GF Brain">
      {vazio ? (
        <div className="psi-c-abre">
          <span className="psi-c-orbe" aria-hidden="true" />
          <span className="psi-rot">GF Brain</span>
          <h2>Pergunte qualquer coisa sobre o seu negócio.</h2>
          <p>Eu leio os dados da plataforma (alunos, aulas, depósitos, saques, operações, markup, acessos, lives) e consulto o banco quando preciso. Escreva, fale, mande um arquivo ou comece por um ritual.</p>
          {central}
        </div>
      ) : (
        <div className="psi-c-conversa" role="log" aria-live="polite">
          <div className="psi-c-topo"><span>GF Brain · responde com os dados de agora</span><span><button type="button" aria-pressed={painel} onClick={() => setPainel((v) => !v)}>{painel ? 'Voltar à conversa' : 'Ideias de perguntas'}</button><button type="button" onClick={limpar}>Nova conversa</button></span></div>
          {painel ? central : (
            <>
              {mensagens.map((m, i) => (
                <article key={m.id} className={`psi-c-msg ${m.de}${m.erro ? ' erro' : ''}`}>
                  {m.de === 'ia' && <span className="psi-c-orbe p" aria-hidden="true" />}
                  <div className="psi-c-balao">
                    {m.anexos?.map((a, k) => <span className="psi-c-anexo" key={`${a.nome}${k}`}>{a.tipo === 'audio' ? `Áudio · ${relogio(a.segundos ?? 0)}` : a.nome}</span>)}
                    {m.de === 'ia' ? <RespostaFormatada texto={m.texto} animar={!!m.nova} aoCrescer={descer} /> : m.texto ? <p>{m.texto}</p> : null}
                    {m.de === 'ia' && !m.erro && (
                      <div className="psi-c-acoes">
                        {!!m.consultas && <span className="psi-c-selo">{m.consultas === 1 ? 'Consultou o banco 1 vez' : `Consultou o banco ${m.consultas} vezes`}</span>}
                        {aoAbrirAluno && m.alunos?.slice(0, 5).map((u, k) => <button type="button" key={u} onClick={() => aoAbrirAluno(u)}>Linha do tempo {m.alunos!.length > 1 ? k + 1 : ''}</button>)}
                        <button type="button" onClick={() => copiar(m.texto)}>Copiar</button>
                      </div>
                    )}
                    {m.de === 'ia' && !m.erro && i === mensagens.length - 1 && !!m.proximas?.length && !pensando && (
                      <div className="psi-c-proximas"><small>Próximo passo</small>{m.proximas.map((p) => <button type="button" key={p} onClick={() => void enviar(p)}>{p}</button>)}</div>
                    )}
                  </div>
                </article>
              ))}
              {pensando && <article className="psi-c-msg ia"><span className="psi-c-orbe p vivo" aria-hidden="true" /><div className="psi-c-balao pensando"><i /><i /><i /><span>Consultando os dados…</span></div></article>}
            </>
          )}
          <div ref={fim} />
        </div>
      )}

      <div className="psi-c-barra">
        {aviso && <p className="psi-c-aviso" role="status">{aviso}</p>}
        <div className="psi-c-lentes" role="group" aria-label="Lente da resposta">
          <small>Lente</small>
          {LENTES.map((l) => <button type="button" key={l.id} aria-pressed={lente === l.id} title={l.frase} onClick={() => setLente(l.id)}>{l.nome}</button>)}
        </div>
        {!!pendentes.length && (
          <div className="psi-c-pendentes">
            {pendentes.map((p) => (
              <span key={p.id} className="psi-c-pend">{p.previa ? <img src={p.previa} alt="" /> : null}<b>{p.nome}</b>
                <button type="button" aria-label={`Tirar ${p.nome}`} onClick={() => { if (p.previa) URL.revokeObjectURL(p.previa); setPendentes((l) => l.filter((x) => x.id !== p.id)) }}>×</button></span>
            ))}
          </div>
        )}
        <div className={`psi-c-caixa${gravador.gravando ? ' gravando' : ''}`}>
          <input ref={arquivo} type="file" hidden multiple accept="image/*,video/*,audio/*,application/pdf,text/plain,text/csv,.csv,.txt,.md" onChange={(e) => void escolher(e)} />
          <button type="button" className="psi-c-b" aria-label="Anexar foto, vídeo ou arquivo" disabled={ocupado || gravador.gravando} onClick={() => arquivo.current?.click()}><IconeClipe /></button>
          {gravador.gravando ? (
            <div className="psi-c-onda" aria-live="polite"><span>{relogio(gravador.segundos)}</span><div>{gravador.niveis.slice(-36).map((n, i) => <i key={i} style={{ height: `${Math.max(12, Math.min(100, n * 100))}%` }} />)}</div>
              <button type="button" className="psi-c-cancelar" onClick={() => gravador.cancelar()}>Cancelar</button></div>
          ) : (
            <textarea ref={caixa} value={texto} rows={1} placeholder={`Pergunte ao GF Brain (lente: ${LENTES.find((l) => l.id === lente)?.nome})`} aria-label="Sua pergunta" onChange={(e) => setTexto(e.target.value)} onKeyDown={tecla} disabled={pensando} />
          )}
          {gravador.suportado && (!texto.trim() && !pendentes.length || gravador.gravando) ? (
            <button type="button" className={`psi-c-b mic${gravador.gravando ? ' ativo' : ''}`} aria-label={gravador.gravando ? 'Parar e enviar o áudio' : 'Gravar áudio'} disabled={ocupado} onClick={() => void microfone()}>{gravador.gravando ? <IconeParar /> : <IconeMic />}</button>
          ) : (
            <button type="button" className="psi-c-b enviar" aria-label="Enviar" disabled={ocupado || (!texto.trim() && !pendentes.length)} onClick={() => void enviar(texto)}><IconeEnviar /></button>
          )}
        </div>
        <small className="psi-c-pe">Os nomes dos alunos não saem da plataforma: a I.A. recebe só códigos. Confira os números importantes no painel.</small>
      </div>
    </section>
  )
}
