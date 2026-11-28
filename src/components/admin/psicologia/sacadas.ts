/**
 * As sacadas da Psicologia do aluno: cada uma lê um cruzamento do banco e vira um cartão com uma frase em
 * português simples, o número que importa, o tamanho da amostra e o que dá para fazer com aquilo.
 * Regra da casa: amostra pequena não vira sacada (cada uma tem o seu mínimo) e tudo aqui é correlação.
 */
import type { PerfilDoAluno, Psicologia } from '../../../core/teeds/psicologia'

export type Tema = 'aulas' | 'perda' | 'ganho' | 'dinheiro' | 'relogio' | 'lives' | 'sinais'
export type Tom = 'ouro' | 'alerta' | 'bom' | 'neutro'
export interface Sacada {
  id: string; tema: Tema; tom: Tom
  /** quanto maior, mais para cima (as primeiras viram destaque) */
  forca: number
  titulo: string; numero: string; legenda: string; texto: string; acao: string; base: string
  /** comparação lado a lado, quando a sacada é "este grupo contra aquele" */
  duelo?: { a: { rotulo: string; pct: number }; b: { rotulo: string; pct: number } }
}

export const TEMAS: Array<{ id: Tema; nome: string; frase: string }> = [
  { id: 'aulas', nome: 'Aulas que viram dinheiro', frase: 'O que acontece depois que o aluno assiste a cada aula.' },
  { id: 'perda', nome: 'Depois da perda', frase: 'O que o aluno faz nos minutos seguintes a perder.' },
  { id: 'ganho', nome: 'Depois do ganho', frase: 'Parar na meta, passar da meta e sacar.' },
  { id: 'dinheiro', nome: 'Depósitos e saques', frase: 'Quando o dinheiro entra, quanto, e o que vem logo depois.' },
  { id: 'relogio', nome: 'Relógio do aluno', frase: 'A hora e o dia em que ele estuda, deposita e opera.' },
  { id: 'lives', nome: 'Lives e avisos', frase: 'O que muda quando tem live no ar e quando chega um aviso no celular.' },
  { id: 'sinais', nome: 'Sinais de compromisso', frase: 'Pequenos gestos que aparecem junto com o depósito.' },
]

export const PERFIS: Record<PerfilDoAluno, { nome: string; frase: string; fazer: string; tom: Tom }> = {
  revanche: { nome: 'Opera no impulso', frase: 'Perde e religa em menos de 2 minutos, ou aumenta a entrada logo depois de perder.', fazer: 'Mandar a aula de gerenciamento e falar de pausa depois do limite de perda.', tom: 'alerta' },
  sumiu_na_perda: { nome: 'Sumiu depois de perder', frase: 'O último dia de operação fechou no negativo e ele não abre a plataforma há mais de 7 dias.', fazer: 'Contato pessoal: acolher, mostrar o treino e convidar para a próxima live.', tom: 'alerta' },
  disciplinado: { nome: 'Respeita o limite', frase: 'Bate o limite de perda e para: quase nunca religa no calor.', fazer: 'Bons casos para depoimento e para mostrar nas lives.', tom: 'bom' },
  lucrando: { nome: 'No positivo', frase: 'Opera há 3 dias ou mais e está com resultado positivo.', fazer: 'Acompanhar de perto e entender o que ele faz de diferente.', tom: 'bom' },
  operando: { nome: 'Operando', frase: 'Opera em conta real, sem um padrão forte de impulso nem de disciplina ainda.', fazer: 'Levar para as aulas de gerenciamento antes que o padrão se forme.', tom: 'neutro' },
  depositou_parado: { nome: 'Depositou e travou', frase: 'Colocou dinheiro na conta e nunca fez uma operação em conta real.', fazer: 'O dinheiro está lá: ajudar no primeiro passo (transferir o saldo, ligar a I.A.).', tom: 'ouro' },
  estuda_nao_deposita: { nome: 'Estuda e não deposita', frase: 'Concluiu 3 aulas ou mais e ainda não fez o primeiro depósito.', fazer: 'Está aquecido: é o público certo para o empurrão do depósito.', tom: 'ouro' },
  so_no_treino: { nome: 'Só no treino', frase: 'Opera na conta de treino e nunca depositou.', fazer: 'Mostrar o caminho do primeiro depósito logo depois de um treino positivo.', tom: 'neutro' },
  curioso: { nome: 'Abriu e parou', frase: 'Abriu uma ou duas aulas e não seguiu.', fazer: 'Lembrar da próxima aula por aviso no celular ou e-mail.', tom: 'neutro' },
  parado_no_cadastro: { nome: 'Parado no cadastro', frase: 'Criou a conta e não abriu nenhuma aula.', fazer: 'Reativar: o primeiro passo é assistir à aula de boas-vindas.', tom: 'neutro' },
}

const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
export const inteiro = (n: number) => nf0.format(n)
export const decimal = (n: number) => nf1.format(n)
export const usd = (v: number, casas = 0) => `${v < 0 ? '−' : ''}US$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`
export const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0)
export const pc = (a: number, b: number) => `${nf0.format(pct(a, b))}%`
/** "1 operação", "3 operações" */
export const plural = (n: number, um: string, varios: string) => `${nf0.format(n)} ${n === 1 ? um : varios}`
const vezes = (a: number, b: number) => (b > 0 ? a / b : 0)
const vz = (x: number) => `${nf1.format(x)}×`
/** "3 min", "2 h 10", "5 dias" a partir de minutos */
export function tempoCurto(min: number): string {
  if (min < 1) return `${Math.max(1, Math.round(min * 60))} s`
  if (min < 90) return `${Math.round(min)} min`
  if (min < 48 * 60) return `${nf1.format(min / 60)} h`
  return `${nf1.format(min / 1440)} dias`
}
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const hora = (h: number) => `${h}h`
const Dia = (d: number) => DIAS[d].charAt(0).toUpperCase() + DIAS[d].slice(1)

export function montarSacadas(p: Psicologia): Sacada[] {
  const s: Sacada[] = []
  const pe = (x: Sacada) => { if (Number.isFinite(x.forca)) s.push(x) }
  const fins = Object.fromEntries((p.sessoes.fins ?? []).map((f) => [f.fim, f]))
  const estudo = p.estudo ?? []
  const aulas = p.aulas.lista ?? []

  /* ------------------------------------------------------------ aulas */
  const e0 = estudo.find((e) => e.ordem === 0), e3 = estudo.find((e) => e.ordem === 3)
  if (e0 && e3 && e3.pessoas >= 20 && e0.pessoas >= 20 && pct(e3.depositaram, e3.pessoas) > pct(e0.depositaram, e0.pessoas)) pe({
    id: 'estudo-deposito', tema: 'aulas', tom: 'ouro', forca: 100,
    titulo: 'Quem estuda, deposita', numero: pc(e3.depositaram, e3.pessoas), legenda: 'depositaram, entre quem concluiu 10 aulas ou mais',
    texto: `De quem concluiu 10 aulas ou mais, ${inteiro(e3.depositaram)} de ${inteiro(e3.pessoas)} depositaram. De quem não concluiu nenhuma, só ${inteiro(e0.depositaram)} de ${inteiro(e0.pessoas)}.`,
    acao: 'Aula concluída e depósito andam juntos. O esforço que mais promete é ajudar o aluno novo a terminar as primeiras aulas.',
    base: `${inteiro(e3.pessoas + e0.pessoas)} alunos comparados`,
    duelo: { a: { rotulo: '10 aulas ou mais', pct: pct(e3.depositaram, e3.pessoas) }, b: { rotulo: 'Nenhuma aula', pct: pct(e0.depositaram, e0.pessoas) } },
  })
  const rapida = [...aulas].filter((a) => a.sem_dep >= 20).sort((a, b) => vezes(b.d30m, b.sem_dep) - vezes(a.d30m, a.sem_dep))[0]
  if (rapida && rapida.d30m >= 5) pe({
    id: 'aula-gatilho', tema: 'aulas', tom: 'ouro', forca: 96,
    titulo: 'A aula que vira depósito na hora', numero: pc(rapida.d30m, rapida.sem_dep), legenda: 'fizeram o 1º depósito em até 30 minutos',
    texto: `De quem abriu «${rapida.titulo}» sem nunca ter depositado, ${inteiro(rapida.d30m)} de ${inteiro(rapida.sem_dep)} depositaram em até 30 minutos${rapida.min_mediano != null ? ` (tempo típico: ${tempoCurto(rapida.min_mediano)})` : ''}.`,
    acao: 'Essa aula está colada no momento do depósito. Vale deixá-la em destaque para quem ainda não depositou e usá-la nos avisos.',
    base: `${inteiro(rapida.sem_dep)} alunos sem depósito que abriram a aula`,
  })
  const gat = [...aulas].filter((a) => a.gatilho > 0).sort((a, b) => b.gatilho - a.gatilho)
  const totGat = gat.reduce((t, a) => t + a.gatilho, 0)
  if (gat.length >= 2 && totGat >= 20) pe({
    id: 'ultima-aula', tema: 'aulas', tom: 'neutro', forca: 70,
    titulo: 'A última aula antes do 1º depósito', numero: inteiro(gat[0].gatilho), legenda: `primeiros depósitos vieram logo depois de «${gat[0].titulo}»`,
    texto: `Olhando a última aula aberta nas 24 h antes do 1º depósito: «${gat[0].titulo}» aparece ${inteiro(gat[0].gatilho)} vezes, «${gat[1].titulo}» ${inteiro(gat[1].gatilho)}${gat[2] ? ` e «${gat[2].titulo}» ${inteiro(gat[2].gatilho)}` : ''}.`,
    acao: 'São as aulas que o aluno está vendo quando decide colocar dinheiro: o texto e o botão dessas aulas merecem capricho.',
    base: `${inteiro(totGat)} primeiros depósitos com aula nas 24 h anteriores`,
  })
  const c = p.aulas.conclusao
  if (c.concluiu >= 50 && c.largou >= 50 && pct(c.concluiu_dep, c.concluiu) > pct(c.largou_dep, c.largou)) pe({
    id: 'concluir', tema: 'aulas', tom: 'bom', forca: 60 + Math.abs(pct(c.concluiu_dep, c.concluiu) - pct(c.largou_dep, c.largou)),
    titulo: 'Quem assiste até o fim deposita mais', numero: pc(c.concluiu_dep, c.concluiu), legenda: 'depositaram em 7 dias quando a aula foi concluída',
    texto: `Quando a aula é assistida até o fim, ${pc(c.concluiu_dep, c.concluiu)} dos alunos sem depósito depositam nos 7 dias seguintes. Quando é largada no meio, ${pc(c.largou_dep, c.largou)}.`,
    acao: 'Aulas mais curtas e diretas no começo da trilha ajudam o aluno a concluir.',
    base: `${inteiro(c.concluiu + c.largou)} aulas abertas por quem ainda não tinha depositado`,
    duelo: { a: { rotulo: 'Concluiu a aula', pct: pct(c.concluiu_dep, c.concluiu) }, b: { rotulo: 'Largou no meio', pct: pct(c.largou_dep, c.largou) } },
  })
  const rb = [...(p.aulas.robos ?? [])].filter((r) => r.viram >= 20).sort((a, b) => b.ligaram - a.ligaram)[0]
  if (rb && rb.ligaram >= 10) pe({
    id: 'aula-ia', tema: 'aulas', tom: 'neutro', forca: 58,
    titulo: `Viu a aula da ${rb.nome}, ligou a ${rb.nome}`, numero: pc(rb.ligaram, rb.viram), legenda: 'ligaram essa I.A. nas 24 h seguintes à aula',
    texto: `Dos ${inteiro(rb.viram)} que abriram a aula da ${rb.nome}, ${inteiro(rb.ligaram)} ligaram a ${rb.nome} nas 24 h seguintes (${inteiro(rb.ligaram_real)} em conta real). ${inteiro(rb.ja_usavam)} já tinham usado antes: a aula também é procurada por quem já opera.`,
    acao: 'Aula de uma I.A. e uso dela aparecem juntos. Aula nova de I.A. é uma forma direta de apresentar uma estratégia.',
    base: `${inteiro(rb.viram)} alunos que abriram a aula`,
  })
  const g = p.gerenciamento
  if (g.viu_perdas >= 50 && g.nao_perdas >= 50 && pct(g.viu_revanches, g.viu_perdas) < pct(g.nao_revanches, g.nao_perdas)) pe({
    id: 'gerenciamento', tema: 'aulas', tom: 'bom', forca: 78,
    titulo: 'Quem fez a aula de gerenciamento religa menos', numero: pc(g.viu_revanches, g.viu_perdas), legenda: 'das perdas viram religada em 2 min, entre quem concluiu a aula',
    texto: `Quem concluiu a aula de gerenciamento ou a de meta diária religa a I.A. no calor em ${pc(g.viu_revanches, g.viu_perdas)} das perdas. Quem não concluiu, em ${pc(g.nao_revanches, g.nao_perdas)}. E zerou o saldo no meio de uma sessão: ${pc(g.viu_zerou, g.viu)} contra ${pc(g.nao_zerou, g.nao)}.`,
    acao: 'Essa aula merece ficar no começo da trilha, antes das aulas das I.A.',
    base: `${inteiro(g.viu + g.nao)} alunos com perda em conta real`,
    duelo: { a: { rotulo: 'Concluiu a aula', pct: pct(g.viu_revanches, g.viu_perdas) }, b: { rotulo: 'Não concluiu', pct: pct(g.nao_revanches, g.nao_perdas) } },
  })
  const j = p.jornada
  if (j.dep_com_aula + j.dep_sem_aula >= 20 && j.dep_sem_aula * 5 < j.dep_com_aula) pe({
    id: 'sem-aula', tema: 'aulas', tom: 'neutro', forca: 55,
    titulo: 'Quase ninguém deposita sem aula', numero: `${inteiro(j.dep_sem_aula)} de ${inteiro(j.dep_com_aula + j.dep_sem_aula)}`, legenda: 'depositaram sem abrir nenhuma aula antes',
    texto: `Só ${inteiro(j.dep_sem_aula)} dos ${inteiro(j.dep_com_aula + j.dep_sem_aula)} depositantes colocaram dinheiro sem ter aberto uma aula antes.${j.h_aula_dep != null ? ` Da primeira aula ao primeiro depósito passam, no meio do caminho, ${tempoCurto(j.h_aula_dep * 60)}.` : ''}`,
    acao: 'Quem não abre nenhuma aula quase nunca chega ao depósito: vale insistir na primeira aula.',
    base: `${inteiro(j.dep_com_aula + j.dep_sem_aula)} depositantes`,
  })

  /* ------------------------------------------------------------ depois da perda */
  const stop = fins.stop
  if (stop && stop.n >= 30) pe({
    id: 'religa', tema: 'perda', tom: 'alerta', forca: 95,
    titulo: 'Bateu o limite de perda e religou', numero: pc(stop.volta2, stop.n), legenda: 'das vezes, outra I.A. é ligada em menos de 2 minutos',
    texto: `Depois de bater o limite de perda, em ${pc(stop.volta2, stop.n)} das vezes o aluno liga uma I.A. de novo em menos de 2 minutos (${pc(stop.volta10, stop.n)} em até 10). Em ${pc(stop.trocou, stop.volta10)} dessas voltas ele troca de I.A., e as voltas somaram ${usd(stop.resultado_volta)}.`,
    acao: 'O limite de perda está sendo tratado como pausa de segundos. Uma trava de respiro depois do limite (ou um aviso na tela) mexe direto nesse número.',
    base: `${inteiro(stop.n)} sessões encerradas no limite de perda, de ${inteiro(stop.pessoas)} alunos`,
  })
  const ca = p.sessoes.calor
  if (ca.quente >= 50 && ca.frio >= 50 && pct(ca.quente_ganhou, ca.quente) < pct(ca.frio_ganhou, ca.frio)) pe({
    id: 'calor-frio', tema: 'perda', tom: 'alerta', forca: 74,
    titulo: 'No calor, acerta menos', numero: pc(ca.quente_ganhou, ca.quente), legenda: 'das sessões ligadas logo depois de perder fecham no positivo',
    texto: `Sessão ligada em até 2 minutos depois de uma perda fecha no positivo ${pc(ca.quente_ganhou, ca.quente)} das vezes. Sessão ligada de cabeça fria (mais de 30 minutos depois da anterior), ${pc(ca.frio_ganhou, ca.frio)}.`,
    acao: 'Dá para mostrar esse número ao próprio aluno: esperar meia hora rende mais do que religar.',
    base: `${inteiro(ca.quente)} sessões no calor e ${inteiro(ca.frio)} a frio`,
    duelo: { a: { rotulo: 'Ligada no calor', pct: pct(ca.quente_ganhou, ca.quente) }, b: { rotulo: 'Ligada a frio', pct: pct(ca.frio_ganhou, ca.frio) } },
  })
  const cd = p.sessoes.cadeias
  if (cd.n >= 10 && cd.positivas * 4 < cd.n) pe({
    id: 'cadeias', tema: 'perda', tom: 'alerta', forca: 80,
    titulo: 'Quando vira sequência, quase nunca volta', numero: pc(cd.positivas, cd.n), legenda: 'das sequências de 3 ou mais religadas terminam no positivo',
    texto: `${inteiro(cd.n)} vezes um aluno religou 3 ou mais sessões seguidas, cada uma em menos de 2 minutos depois de perder a anterior (a maior teve ${inteiro(cd.maior)}). Só ${inteiro(cd.positivas)} terminaram no positivo; juntas somaram ${usd(cd.resultado)}.`,
    acao: 'A terceira religada seguida é o ponto para a plataforma interromper: pausa obrigatória ou mensagem do assessor.',
    base: `${inteiro(cd.n)} sequências de ${inteiro(cd.pessoas)} alunos`,
  })
  const su = p.sumico
  if (su.negativo >= 20 && su.positivo >= 10 && pct(su.negativo_sumiu, su.negativo) > pct(su.positivo_sumiu, su.positivo)) pe({
    id: 'sumico', tema: 'perda', tom: 'alerta', forca: 90,
    titulo: 'Fechou o dia no negativo e sumiu', numero: pc(su.negativo_sumiu, su.negativo), legenda: 'não abrem a plataforma há mais de 7 dias',
    texto: `De quem teve o último dia de operação no negativo, ${inteiro(su.negativo_sumiu)} de ${inteiro(su.negativo)} não voltam há mais de 7 dias. De quem fechou o último dia no positivo, ${inteiro(su.positivo_sumiu)} de ${inteiro(su.positivo)}. Os que sumiram já tinham gerado ${usd(su.markup_dos_sumidos)} de markup e ainda têm ${usd(su.saldo_parado)} parados na conta.`,
    acao: 'O dia seguinte a uma perda é a hora do contato: mensagem pessoal, convite para a live e para o treino. A lista está no perfil «Sumiu depois de perder».',
    base: `${inteiro(su.negativo + su.positivo)} alunos que já operaram em conta real`,
    duelo: { a: { rotulo: 'Último dia negativo', pct: pct(su.negativo_sumiu, su.negativo) }, b: { rotulo: 'Último dia positivo', pct: pct(su.positivo_sumiu, su.positivo) } },
  })
  const dp = p.depositos
  if (dp.no_calor >= 15) pe({
    id: 'recarga', tema: 'perda', tom: 'alerta', forca: 84,
    titulo: 'Recarga no calor', numero: inteiro(dp.no_calor), legenda: `depósitos feitos em até 1 hora depois de perder (${usd(dp.no_calor_valor)})`,
    texto: `${inteiro(dp.no_calor_pessoas)} alunos depositaram de novo em até 1 hora depois de uma perda: ${inteiro(dp.no_calor)} depósitos, ${usd(dp.no_calor_valor)}. Nas 24 h seguintes, ${pc(dp.no_calor_perdeu, dp.no_calor)} desses depósitos terminaram em nova perda (${usd(dp.no_calor_depois)} somados). Nos depósitos feitos de cabeça fria, ${pc(dp.a_frio_perdeu, dp.a_frio)}.`,
    acao: 'É o dinheiro que entra mais rápido e o que mais machuca o aluno. Quem faz isso com frequência precisa de acompanhamento, não de incentivo.',
    base: `${inteiro(dp.total)} depósitos em conta real`,
    duelo: { a: { rotulo: 'Depósito no calor', pct: pct(dp.no_calor_perdeu, dp.no_calor) }, b: { rotulo: 'Depósito a frio', pct: pct(dp.a_frio_perdeu, dp.a_frio) } },
  })
  const zer = fins.zerou
  if (zer && stop && zer.n >= 20) pe({
    id: 'zerou', tema: 'perda', tom: 'neutro', forca: 52,
    titulo: 'Zerou o saldo no meio da sessão', numero: pc(zer.dep60, zer.n), legenda: 'depositam de novo em até 1 hora',
    texto: `${inteiro(zer.n)} sessões pararam porque o saldo acabou (${inteiro(zer.pessoas)} alunos). Em ${pc(zer.dep60, zer.n)} delas veio um depósito na hora seguinte; depois de um limite de perda comum, ${pc(stop.dep60, stop.n)}.`,
    acao: 'Quem zera está operando com entrada grande demais para o saldo: é caso para a aula de gerenciamento.',
    base: `${inteiro(zer.n)} sessões que zeraram o saldo`,
  })
  const m = p.manual
  if (m.apos_perda >= 100 && m.apos_ganho >= 100 && m.seg_apos_perda != null && m.seg_apos_ganho != null && m.seg_apos_perda < m.seg_apos_ganho) {
    pe({
      id: 'manual-pressa', tema: 'perda', tom: 'alerta', forca: 76,
      titulo: 'Na manual, perder dá pressa', numero: tempoCurto(m.seg_apos_perda / 60), legenda: 'até a próxima entrada depois de perder',
      texto: `Na operação manual, a entrada seguinte a uma perda vem em ${tempoCurto(m.seg_apos_perda / 60)}; depois de um ganho, em ${tempoCurto(m.seg_apos_ganho / 60)}. Em ${pc(m.rapida_apos_perda, m.apos_perda)} das perdas a nova entrada vem em menos de 15 segundos.`,
      acao: 'Menos de 15 segundos não dá tempo de olhar o gráfico: é reação, não leitura. Bom tema de live.',
      base: `${inteiro(m.apos_perda + m.apos_ganho)} operações manuais em conta real, de ${inteiro(m.pessoas)} alunos`,
    })
    pe({
      id: 'manual-dobra', tema: 'perda', tom: 'alerta', forca: 72,
      titulo: 'Perdeu e aumentou a entrada', numero: pc(m.dobrou_apos_perda, m.apos_perda), legenda: 'das perdas são seguidas de uma entrada 50% maior ou mais',
      texto: `Depois de perder na manual, em ${pc(m.dobrou_apos_perda, m.apos_perda)} das vezes a entrada seguinte é pelo menos 50% maior; depois de ganhar, em ${pc(m.dobrou_apos_ganho, m.apos_ganho)}. Essas entradas aumentadas acertaram ${pc(m.dobrou_ganhou, m.dobrou_apos_perda)} e somaram ${usd(m.dobrou_resultado)}.`,
      acao: 'É o aluno tentando recuperar na mão. Vale ensinar um teto de entrada por dia.',
      base: `${inteiro(m.apos_perda)} operações manuais feitas logo depois de uma perda`,
      duelo: { a: { rotulo: 'Depois de perder', pct: pct(m.dobrou_apos_perda, m.apos_perda) }, b: { rotulo: 'Depois de ganhar', pct: pct(m.dobrou_apos_ganho, m.apos_ganho) } },
    })
  }

  /* ------------------------------------------------------------ depois do ganho */
  const meta = fins.meta
  if (meta && meta.n >= 30) pe({
    id: 'passou-da-meta', tema: 'ganho', tom: 'ouro', forca: 92,
    titulo: 'Bateu a meta e continuou', numero: pc(meta.volta10, meta.n), legenda: 'das metas batidas são seguidas de outra sessão em até 10 minutos',
    texto: `A meta foi batida ${inteiro(meta.n)} vezes (${usd(meta.resultado)} no total). Em ${pc(meta.volta10, meta.n)} delas o aluno ligou outra sessão em até 10 minutos, e essas voltas somaram ${usd(meta.resultado_volta)}${meta.resultado > 0 && meta.resultado_volta < 0 ? `: devolveram ${pc(Math.min(-meta.resultado_volta, meta.resultado), meta.resultado)} do que a meta tinha trazido` : ''}.`,
    acao: 'A meta está funcionando como degrau, não como linha de chegada. Uma comemoração na tela e um «volte amanhã» ajudam a encerrar o dia.',
    base: `${inteiro(meta.n)} sessões encerradas na meta, de ${inteiro(meta.pessoas)} alunos`,
  })
  const li = p.sessoes.limites
  if (li.total >= 100 && li.stop_mediano != null && li.meta_mediana != null && li.stop_mediano > li.meta_mediana) pe({
    id: 'limites', tema: 'ganho', tom: 'neutro', forca: 62,
    titulo: 'Aceita perder mais do que quer ganhar', numero: pc(li.stop_maior_que_meta, li.total), legenda: 'das sessões têm limite de perda maior que o dobro da meta',
    texto: `A sessão típica é ligada com meta de ${usd(li.meta_mediana, 2)} e limite de perda de ${usd(li.stop_mediano, 2)}. Em ${pc(li.stop_maior_que_meta, li.total)} das sessões o limite de perda passa do dobro da meta.`,
    acao: 'É o desenho de quem tem medo de parar no prejuízo: precisa de muitos acertos para pagar um erro. Tema direto para a aula de gerenciamento.',
    base: `${inteiro(li.total)} sessões de I.A. em conta real`,
  })
  const sq = p.saques
  if (sq.sacaram >= 10 && sq.depositaram_depois * 2 >= sq.sacaram) pe({
    id: 'saque', tema: 'ganho', tom: 'bom', forca: 68,
    titulo: 'Quem saca, volta', numero: pc(sq.depositaram_depois, sq.sacaram), legenda: 'depositaram de novo depois do primeiro saque',
    texto: `${inteiro(sq.sacaram)} alunos já sacaram (${usd(sq.total)} no total). ${inteiro(sq.depositaram_depois)} deles depositaram de novo depois.${sq.h_dep_saque != null ? ` Do primeiro depósito ao primeiro saque passam ${tempoCurto(sq.h_dep_saque * 60)}.` : ''}`,
    acao: 'O saque não é a despedida: é a prova de que funciona. Vale comemorar o primeiro saque do aluno e usar como depoimento.',
    base: `${inteiro(sq.sacaram)} alunos que já sacaram`,
  })
  const b = p.base
  if (b.operaram >= 20 && b.lucrando * 3 < b.operaram) pe({
    id: 'positivo', tema: 'ganho', tom: 'alerta', forca: 66,
    titulo: 'Poucos estão no positivo', numero: `${inteiro(b.lucrando)} de ${inteiro(b.operaram)}`, legenda: 'alunos que operaram em conta real estão com resultado positivo',
    texto: `Somando tudo o que cada aluno operou em conta real, ${inteiro(b.lucrando)} estão no positivo e ${inteiro(b.perdendo)} no negativo. O resultado somado dos alunos é ${usd(b.resultado)}.`,
    acao: 'É o número que decide se o aluno fica. Os comportamentos de impulso desta tela são onde dá para mexer nele.',
    base: `${inteiro(b.operaram)} alunos que operaram em conta real`,
  })

  /* ------------------------------------------------------------ depósitos e saques */
  const fx = p.dep1_faixas ?? []
  const totDep = fx.reduce((t, f) => t + f.pessoas, 0), totMk = fx.reduce((t, f) => t + f.markup, 0)
  const alto = fx.find((f) => f.ordem === 4)
  if (alto && totDep >= 30 && totMk > 0) pe({
    id: 'primeiro-deposito', tema: 'dinheiro', tom: 'ouro', forca: 82,
    titulo: 'O tamanho do 1º depósito diz muito', numero: pc(alto.markup, totMk), legenda: 'do markup vem de quem começou com US$ 100 ou mais',
    texto: `Quem fez o primeiro depósito de US$ 100 ou mais é ${pc(alto.pessoas, totDep)} dos depositantes e gerou ${pc(alto.markup, totMk)} do markup.${j.dep1_mediano != null ? ` O primeiro depósito típico é de ${usd(j.dep1_mediano, 2)}.` : ''}`,
    acao: 'Vale tratar o 1º depósito alto como sinal para atendimento próximo.',
    base: `${inteiro(totDep)} alunos que depositaram`,
  })
  const rd = p.redeposito
  if (rd.uma_vez + rd.duas_ou_mais >= 30) pe({
    id: 'redeposito', tema: 'dinheiro', tom: 'ouro', forca: 79,
    titulo: 'O segundo depósito', numero: pc(rd.duas_ou_mais, rd.uma_vez + rd.duas_ou_mais), legenda: 'dos depositantes depositaram mais de uma vez',
    texto: `${inteiro(rd.duas_ou_mais)} alunos depositaram duas vezes ou mais (${inteiro(rd.cinco_ou_mais)} deles, cinco ou mais) e geraram ${pc(rd.markup_duas, rd.markup_duas + rd.markup_uma)} do markup.${rd.h_ate_segundo != null ? ` O segundo depósito vem ${tempoCurto(rd.h_ate_segundo * 60)} depois do primeiro; ${inteiro(rd.segundo_em_24h)} fizeram em menos de 24 h.` : ''}`,
    acao: 'A janela do segundo depósito é curta: o acompanhamento dos dois primeiros dias depois do 1º depósito é o que mais vale.',
    base: `${inteiro(rd.uma_vez + rd.duas_ou_mais)} alunos que depositaram`,
  })
  if (dp.total >= 50 && dp.min_ate_operar != null) pe({
    id: 'depois-do-deposito', tema: 'dinheiro', tom: 'alerta', forca: 75,
    titulo: 'O dia seguinte ao depósito', numero: pc(dp.devolve_tudo_24h, dp.total), legenda: 'dos depósitos são perdidos quase inteiros em 24 horas',
    texto: `Depois de depositar, a primeira operação vem em ${tempoCurto(dp.min_ate_operar)} (${pc(dp.opera_em_5, dp.total)} operam em menos de 5 minutos). Nas 24 h seguintes, ${inteiro(dp.perde_em_24h)} depósitos terminaram no negativo e ${inteiro(dp.ganha_em_24h)} no positivo; em ${inteiro(dp.devolve_tudo_24h)} o aluno perdeu 90% ou mais do que tinha acabado de colocar.`,
    acao: 'As primeiras 24 h depois do depósito decidem se o aluno continua. Entrada pequena e meta curta nesse primeiro dia protegem o aluno.',
    base: `${inteiro(dp.total)} depósitos em conta real`,
  })
  const dias = j.dia0 + j.dia1a3 + j.dia4a7 + j.dia8
  if (dias >= 30) {
    const partes = [{ n: j.dia0, r: 'no mesmo dia do cadastro' }, { n: j.dia1a3, r: 'entre o 1º e o 3º dia' }, { n: j.dia4a7, r: 'entre o 4º e o 7º dia' }, { n: j.dia8, r: 'do 8º dia em diante' }]
    const maior = [...partes].sort((x, y) => y.n - x.n)[0]
    pe({
      id: 'dias-ate-depositar', tema: 'dinheiro', tom: 'neutro', forca: 64,
      titulo: 'O depósito amadurece', numero: pc(maior.n, dias), legenda: `dos primeiros depósitos acontecem ${maior.r}`,
      texto: `${inteiro(j.dia0)} depositaram no mesmo dia do cadastro, ${inteiro(j.dia1a3)} entre o 1º e o 3º dia, ${inteiro(j.dia4a7)} entre o 4º e o 7º e ${inteiro(j.dia8)} depois disso.${j.h_ate_dep != null ? ` O tempo típico é de ${tempoCurto(j.h_ate_dep * 60)}.` : ''}`,
      acao: 'Não desistir do aluno na primeira semana: boa parte dos depósitos vem depois do 4º dia.',
      base: `${inteiro(dias)} primeiros depósitos`,
    })
  }
  const tr = p.treino
  if (tr.ganhou >= 20 && tr.perdeu >= 20 && pct(tr.ganhou_dep, tr.ganhou) > pct(tr.perdeu_dep, tr.perdeu)) pe({
    id: 'treino', tema: 'dinheiro', tom: 'bom', forca: 61,
    titulo: 'Ganhou no treino, depositou', numero: pc(tr.ganhou_dep, tr.ganhou), legenda: 'de quem fechou o treino no positivo depositou',
    texto: `De quem treinou e estava no positivo antes de depositar, ${pc(tr.ganhou_dep, tr.ganhou)} depositaram. De quem estava no negativo no treino, ${pc(tr.perdeu_dep, tr.perdeu)}. E ${inteiro(tr.direto_real)} depositaram sem treinar nenhuma vez.`,
    acao: 'Um treino guiado, que termine bem, é um bom empurrão para o primeiro depósito.',
    base: `${inteiro(tr.ganhou + tr.perdeu)} alunos que operaram no treino`,
    duelo: { a: { rotulo: 'Treino no positivo', pct: pct(tr.ganhou_dep, tr.ganhou) }, b: { rotulo: 'Treino no negativo', pct: pct(tr.perdeu_dep, tr.perdeu) } },
  })
  const ss = p.extras.sem_saldo
  if (ss.viram >= 20) pe({
    id: 'aviso-saldo', tema: 'dinheiro', tom: 'neutro', forca: 50,
    titulo: 'O aviso de conta sem saldo', numero: pc(ss.depositaram_24h, ss.viram), legenda: 'depositaram em 24 h depois de ver o aviso',
    texto: `${inteiro(ss.viram)} alunos viram o aviso de conta sem saldo. ${inteiro(ss.clicaram)} tocaram em Depositar, ${inteiro(ss.depositaram_24h)} depositaram em 24 h e ${inteiro(ss.depositaram_7d)} em 7 dias. ${inteiro(ss.insistiram)} fecharam o aviso 5 vezes ou mais sem depositar.`,
    acao: 'Quem fecha o aviso várias vezes quer usar a plataforma e está travado em alguma dúvida: é fila boa para o suporte chamar.',
    base: `${inteiro(ss.viram)} alunos que viram o aviso`,
  })
  const sp = p.extras.suporte
  if (sp.antes_do_deposito >= 15) pe({
    id: 'suporte', tema: 'dinheiro', tom: 'bom', forca: 73,
    titulo: 'Falou com o suporte, depositou', numero: pc(sp.depositou_24h, sp.antes_do_deposito), legenda: 'depositaram em 24 h depois de abrir a conversa',
    texto: `${inteiro(sp.antes_do_deposito)} alunos abriram conversa com o suporte antes de depositar. ${inteiro(sp.depositou_24h)} depositaram nas 24 h seguintes e ${inteiro(sp.depositou_7d)} em 7 dias.`,
    acao: 'Quem chama o suporte já está decidindo. Resposta rápida nessa conversa vale mais do que qualquer campanha.',
    base: `${inteiro(sp.antes_do_deposito)} alunos que falaram com o suporte antes de depositar`,
  })

  /* ------------------------------------------------------------ relógio */
  const hs = p.tempo.horas ?? []
  if (hs.length >= 12) {
    const hDep = [...hs].sort((x, y) => y.deps - x.deps)[0], hAula = [...hs].sort((x, y) => y.aulas - x.aulas)[0]
    const hOps = [...hs].sort((x, y) => y.ops - x.ops)[0], hPior = [...hs].sort((x, y) => x.resultado - y.resultado)[0]
    const totD = hs.reduce((t, h) => t + h.deps, 0)
    const noite = hs.filter((h) => h.hora >= 19 && h.hora <= 21).reduce((t, h) => t + h.deps, 0)
    if (totD >= 30) pe({
      id: 'hora-do-deposito', tema: 'relogio', tom: 'ouro', forca: 69,
      titulo: 'A hora do depósito', numero: hora(hDep.hora), legenda: `é a hora com mais depósitos (${inteiro(hDep.deps)}, ${usd(hDep.dep_valor)})`,
      texto: `O pico dos depósitos é às ${hora(hDep.hora)}; das 19h às 22h entram ${pc(noite, totD)} de todos os depósitos. O pico de estudo é às ${hora(hAula.hora)} (${inteiro(hAula.aulas)} aulas abertas) e o de operações às ${hora(hOps.hora)}.`,
      acao: 'Aviso no celular, live e atendimento rendem mais se chegarem um pouco antes desses horários.',
      base: `${inteiro(totD)} depósitos e ${inteiro(hs.reduce((t, h) => t + h.aulas, 0))} aulas abertas (hora de Brasília)`,
    })
    if (hPior.resultado < 0 && hPior.ops >= 500) pe({
      id: 'pior-hora', tema: 'relogio', tom: 'alerta', forca: 57,
      titulo: 'A hora em que mais perdem', numero: hora(hPior.hora), legenda: `resultado somado dos alunos: ${usd(hPior.resultado)}`,
      texto: `Às ${hora(hPior.hora)} os alunos somam ${usd(hPior.resultado)}, em ${inteiro(hPior.ops)} operações de ${inteiro(hPior.pessoas)} pessoas. É a hora com o pior resultado do dia.`,
      acao: 'Vale olhar o que acontece nesse horário (live, abertura de mercado, entrada maior) antes de recomendar que operem nele.',
      base: `${inteiro(hs.reduce((t, h) => t + h.ops, 0))} operações em conta real`,
    })
  }
  const sem = p.tempo.semana ?? []
  const totS = sem.reduce((t, d) => t + d.deps, 0)
  const dTop = [...sem].sort((x, y) => y.deps - x.deps)[0]
  const dFraco = [...sem].sort((x, y) => x.deps - y.deps)[0]
  if (dTop && totS >= 30) pe({
    id: 'dia-da-semana', tema: 'relogio', tom: 'neutro', forca: 54,
    titulo: 'O dia do depósito', numero: Dia(dTop.d), legenda: `${pc(dTop.deps, totS)} dos depósitos caem nesse dia`,
    texto: `${Dia(dTop.d)} concentra ${inteiro(dTop.deps)} depósitos (${usd(dTop.dep_valor)}) e ${inteiro(dTop.aulas)} aulas abertas. O dia mais fraco é ${DIAS[dFraco.d]}, com ${inteiro(dFraco.deps)}.`,
    acao: 'Como o histórico ainda é curto, uma semana de lançamento pesa nesse número: vale conferir de novo no mês que vem.',
    base: `${inteiro(totS)} depósitos em ${inteiro(sem.reduce((t, d) => t + d.dias, 0))} dias`,
  })
  const md = p.madrugada
  if (md.pessoas >= 10) pe({
    id: 'madrugada', tema: 'relogio', tom: 'alerta', forca: 51,
    titulo: 'Quem opera de madrugada', numero: inteiro(md.pessoas), legenda: 'alunos já operaram entre meia-noite e 6h',
    texto: `${inteiro(md.pessoas)} alunos já operaram de madrugada. ${inteiro(md.forte)} fazem ali 30% ou mais das operações deles, e somam ${usd(md.resultado_forte)}.`,
    acao: 'Madrugada costuma ser tentativa de recuperar o dia. Os nomes aparecem na lista de alunos, ordenando por madrugada.',
    base: `${inteiro(b.operaram)} alunos que operaram em conta real`,
  })

  /* ------------------------------------------------------------ lives e avisos */
  const lv = p.lives
  if (lv.lives >= 3 && lv.horas_live > 0 && lv.horas_fora > 0 && lv.dep_fora > 0) {
    const porHoraLive = lv.dep_live / lv.horas_live, porHoraFora = lv.dep_fora / lv.horas_fora
    if (porHoraLive > porHoraFora) pe({
      id: 'live-deposito', tema: 'lives', tom: 'ouro', forca: 86,
      titulo: 'Com live no ar, o depósito acelera', numero: vz(vezes(porHoraLive, porHoraFora)), legenda: 'mais depósitos por hora durante a live',
      texto: `Em ${inteiro(lv.horas_live)} horas de live entraram ${inteiro(lv.dep_live)} depósitos (${usd(lv.dep_live_valor)}): ${decimal(porHoraLive)} por hora. Fora de live, ${decimal(porHoraFora)} por hora.`,
      acao: 'Live e depósito andam juntos. O link de depósito visível durante a live aproveita esse momento.',
      base: `${inteiro(lv.lives)} lives e ${inteiro(lv.dep_live + lv.dep_fora)} depósitos desde a primeira`,
    })
    if (lv.perdas_live >= 50 && lv.perdas_fora >= 50 && pct(lv.rev_live, lv.perdas_live) < pct(lv.rev_fora, lv.perdas_fora)) pe({
      id: 'live-impulso', tema: 'lives', tom: 'bom', forca: 63,
      titulo: 'Na live, menos impulso', numero: pc(lv.rev_live, lv.perdas_live), legenda: 'das perdas viram religada em 2 min durante a live',
      texto: `Durante a live, ${pc(lv.rev_live, lv.perdas_live)} das perdas são seguidas de uma religada em menos de 2 minutos. Fora da live, ${pc(lv.rev_fora, lv.perdas_fora)}.`,
      acao: 'Quem opera acompanhado religa menos. Mais um motivo para convidar o aluno a operar junto com a live.',
      base: `${inteiro(lv.perdas_live + lv.perdas_fora)} sessões perdidas`,
      duelo: { a: { rotulo: 'Durante a live', pct: pct(lv.rev_live, lv.perdas_live) }, b: { rotulo: 'Fora da live', pct: pct(lv.rev_fora, lv.perdas_fora) } },
    })
  }
  const av = [...(p.extras.avisos ?? [])].filter((a) => a.pessoas >= 30).sort((x, y) => vezes(y.abriram, y.pessoas) - vezes(x.abriram, x.pessoas))[0]
  if (av) pe({
    id: 'aviso-celular', tema: 'lives', tom: 'neutro', forca: 56,
    titulo: 'O aviso no celular que mais trouxe gente', numero: pc(av.abriram, av.pessoas), legenda: 'abriram a plataforma em até 1 hora',
    texto: `«${av.titulo}» chegou a ${inteiro(av.pessoas)} alunos: ${inteiro(av.clicaram)} tocaram no aviso, ${inteiro(av.abriram)} abriram a plataforma na hora seguinte e ${inteiro(av.depositaram)} depositaram em 24 h.`,
    acao: 'Pouca gente toca no aviso, mas muita gente abre a plataforma depois de ver: o aviso funciona como lembrete.',
    base: `${inteiro((p.extras.avisos ?? []).length)} avisos enviados`,
  })

  /* ------------------------------------------------------------ sinais de compromisso */
  const si = p.sinais
  const sinais = [
    { n: 'colocou foto no perfil', a: si.foto_dep, b: si.foto, c: si.sem_foto_dep, d: si.sem_foto, r: 'Com foto', r2: 'Sem foto' },
    { n: 'ativou os avisos no celular', a: si.push_dep, b: si.push, c: si.sem_push_dep, d: si.sem_push, r: 'Com avisos', r2: 'Sem avisos' },
    { n: 'ativou a entrada por biometria', a: si.bio_dep, b: si.bio, c: si.sem_bio_dep, d: si.sem_bio, r: 'Com biometria', r2: 'Sem biometria' },
  ].filter((x) => x.b >= 20 && x.d >= 20 && pct(x.a, x.b) > pct(x.c, x.d))
  sinais.forEach((x, i) => pe({
    id: `sinal-${i}`, tema: 'sinais', tom: 'ouro', forca: 59 - i,
    titulo: `Quem ${x.n} deposita mais`, numero: pc(x.a, x.b), legenda: `depositaram, entre quem ${x.n}`,
    texto: `De quem ${x.n}, ${inteiro(x.a)} de ${inteiro(x.b)} depositaram. Dos outros, ${inteiro(x.c)} de ${inteiro(x.d)}.`,
    acao: 'Não é o gesto que faz depositar: é quem já está decidido que capricha no perfil. Serve como termômetro de quem está quente.',
    base: `${inteiro(x.b + x.d)} alunos`,
    duelo: { a: { rotulo: x.r, pct: pct(x.a, x.b) }, b: { rotulo: x.r2, pct: pct(x.c, x.d) } },
  }))
  const telas = Object.fromEntries((p.extras.telas ?? []).map((t) => [t.pagina, t]))
  const ta = telas.aulas
  if (ta && ta.pessoas_dep >= 20 && ta.pessoas_nao >= 20) pe({
    id: 'tempo-em-aulas', tema: 'sinais', tom: 'neutro', forca: 53,
    titulo: 'Tempo de aula de quem deposita', numero: tempoCurto(ta.seg_dep / ta.pessoas_dep / 60), legenda: 'na tela de aulas, por aluno que depositou',
    texto: `Quem depositou passou ${tempoCurto(ta.seg_dep / ta.pessoas_dep / 60)} na tela de aulas; quem não depositou, ${tempoCurto(ta.seg_nao / ta.pessoas_nao / 60)}.${telas.aovivo ? ` Na tela Ao vivo: ${inteiro(telas.aovivo.pessoas_dep)} depositantes passaram por lá, contra ${inteiro(telas.aovivo.pessoas_nao)} não depositantes.` : ''}`,
    acao: 'Tempo de aula é o melhor termômetro que existe antes do depósito.',
    base: `${inteiro(ta.pessoas_dep + ta.pessoas_nao)} alunos que abriram a tela de aulas`,
  })

  return s.sort((x, y) => y.forca - x.forca)
}
