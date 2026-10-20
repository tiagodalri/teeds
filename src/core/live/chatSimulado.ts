/**
 * O público do chat simulado da sala de treino (20/10/2026, pedido do Tiago:
 * "precisa passar naturalidade, ficar perfeito").
 *
 * Cada pessoa da sala é uma persona: um nome do jeito que aparece em chat de
 * verdade (nome só, nome e sobrenome, inicial, apelido, @ de usuário) e um
 * jeito de escrever que ela mantém a live inteira. Quem escreve caprichado
 * escreve caprichado sempre; quem abrevia, abrevia sempre; quem erra
 * português, erra do seu jeito. Assim o chat mistura mensagens certas com
 * erradas, gírias, risadas e emojis como um chat real.
 *
 * Quem fala é sempre quem está na sala: quem entra passa a poder falar,
 * quem sai para de falar. As entradas e saídas acompanham o número de
 * pessoas na sala (simulacao.ts).
 *
 * Linguagem: nada de "aposta", "sorte", "chute" ou "jogar" para falar de
 * operar, e ninguém promete ganho (ver a memória da linguagem dos robôs).
 */

export type Estilo = 'caprichado' | 'normal' | 'rapido' | 'empolgado' | 'enrolado'
export interface Pessoa {
  nome: string
  /** Para concordar ("seja bem-vinda"). */
  ela: boolean
  estilo: Estilo
  risada: string
  /** Quanto essa pessoa fala (uns falam muito, a maioria pouco). */
  peso: number
  /** Chance de pôr emoji. */
  emoji: number
}

const sorteio = <T,>(lista: readonly T[]): T => lista[Math.floor(Math.random() * lista.length)]
const chance = (p: number) => Math.random() < p
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/* ------------------------------------------------------------------ nomes */

// [nome, apelidos possíveis]
const ELES: Array<[string, string[]]> = [
  ['João', ['Joãozinho']], ['Pedro', ['Pedrinho']], ['Lucas', []], ['Gabriel', ['Biel']],
  ['Matheus', ['Theus']], ['Rafael', ['Rafa']], ['Guilherme', ['Gui']], ['Leonardo', ['Léo']],
  ['Gustavo', ['Guto']], ['Felipe', ['Lipe']], ['Eduardo', ['Dudu', 'Edu']], ['Vitor', ['Vitinho']],
  ['Thiago', []], ['Rodrigo', []], ['Marcos', ['Marquinhos']], ['Paulo', ['Paulinho']],
  ['José', ['Zé']], ['Antônio', []], ['Francisco', []], ['Ricardo', ['Rick']],
  ['Daniel', ['Dani']], ['Henrique', []], ['Caio', []], ['Diego', []], ['Bruno', []],
  ['André', []], ['Fábio', []], ['Carlos', []], ['Luiz', []], ['Wellington', ['Well']],
  ['Wesley', []], ['Anderson', []], ['Renan', []], ['Igor', []], ['Murilo', []], ['Samuel', []],
  ['Kaique', []], ['Otávio', []], ['Sérgio', []], ['Roberto', []], ['Júnior', ['Juninho']],
  ['Leandro', []], ['Danilo', []], ['Vinícius', ['Vini']], ['Arthur', []], ['Nathan', []], ['Emerson', []],
  ['Cleiton', []], ['Jefferson', ['Jeff']], ['Alexandre', []], ['Marcelo', []], ['Valter', []],
  ['Rogério', []], ['Fernando', ['Nando']], ['Ítalo', []], ['Hugo', []], ['Davi', []], ['Enzo', []], ['Cauã', []],
]
const ELAS: Array<[string, string[]]> = [
  ['Ana', []], ['Maria', []], ['Juliana', ['Ju']], ['Fernanda', ['Fê', 'Nanda']], ['Beatriz', ['Bia']],
  ['Mariana', ['Mari']], ['Larissa', ['Lari']], ['Carolina', ['Carol']], ['Camila', ['Cami']], ['Amanda', []],
  ['Isabela', ['Isa']], ['Natália', ['Nati']], ['Patrícia', ['Pati']], ['Gabriela', ['Gabi']], ['Letícia', []],
  ['Bruna', []], ['Aline', []], ['Jéssica', []], ['Tatiane', ['Tati']], ['Priscila', ['Pri']], ['Vanessa', ['Van']],
  ['Sabrina', []], ['Débora', []], ['Kelly', []], ['Simone', []], ['Rosângela', []], ['Cida', []],
  ['Sueli', []], ['Talita', []], ['Yasmin', ['Yas']], ['Luana', ['Lu']], ['Raquel', []], ['Daniela', ['Dani']],
  ['Eduarda', ['Duda']], ['Heloísa', []], ['Giovana', ['Gi']], ['Thaís', []], ['Bianca', []], ['Michele', []],
  ['Adriana', []], ['Cristina', ['Cris']], ['Sandra', []], ['Elaine', []], ['Kátia', []], ['Mônica', []], ['Paula', []],
]
const SOBRENOMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Ferreira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Carvalho',
  'Araújo', 'Ribeiro', 'Gomes', 'Martins', 'Rocha', 'Barbosa', 'Moura', 'Cardoso', 'Teixeira', 'Mendes', 'Freitas', 'Pinto',
  'Batista', 'Moreira', 'Cavalcanti', 'Dias', 'Nunes', 'Lopes', 'Vieira', 'Monteiro', 'Correia', 'Machado', 'Campos', 'Reis',
  'Andrade', 'Fernandes', 'Castro', 'Melo', 'Ramos', 'Duarte', 'Farias', 'Brito', 'Prado', 'Siqueira', 'Tavares', 'Matos',
]
const NOMES_COMPOSTOS = ['João Pedro', 'João Vitor', 'Maria Eduarda', 'Ana Clara', 'Ana Paula', 'Luiz Fernando', 'Carlos Eduardo', 'Pedro Henrique', 'Maria Clara', 'José Carlos', 'Ana Júlia', 'João Paulo']

/** Um nome do jeito que aparece num chat de live (e se é ela). */
function umNome(): [string, boolean] {
  const ele = chance(0.5)
  return [nomeDe(ele), !ele]
}
function nomeDe(ele: boolean): string {
  // Padrão (pedido do Tiago, 20/10/2026): a maioria com o nome certo, alguns
  // com sobrenome, outros com o sobrenome abreviado ("Paulo S."), e uma parte
  // com apelido comum ou nome de usuário. Nada de "Tio", "Dona", nome em
  // maiúsculas ou com emoji.
  const [nome, apelidos] = sorteio(ele ? ELES : ELAS)
  const sobrenome = sorteio(SOBRENOMES)
  const r = Math.random()
  if (r < 0.36) return nome
  if (r < 0.56) return `${nome} ${sobrenome}`
  if (r < 0.72) return `${nome} ${sobrenome[0]}.`
  if (r < 0.77) return sorteio(NOMES_COMPOSTOS.filter((n) => /^(Maria|Ana)/.test(n) !== ele))
  if (r < 0.87 && apelidos.length) return sorteio(apelidos)
  if (r < 0.87) return nome
  // @ de usuário: minúsculo, sem acento, com sobrenome ou número
  const base = semAcento((apelidos.length && chance(0.3) ? sorteio(apelidos) : nome).toLowerCase())
  const fim = sorteio([semAcento(sobrenome.toLowerCase()), semAcento(sobrenome.toLowerCase()), String(Math.floor(Math.random() * 98) + 2), 'trader'])
  return `${base}${sorteio(['.', '_', ''])}${fim}`
}

const ESTILOS: Array<[Estilo, number]> = [['caprichado', 0.22], ['normal', 0.32], ['rapido', 0.2], ['empolgado', 0.16], ['enrolado', 0.1]]
function umEstilo(): Estilo {
  let r = Math.random()
  for (const [e, p] of ESTILOS) { if ((r -= p) < 0) return e }
  return 'normal'
}

export function novaPessoa(usados: Set<string>): Pessoa {
  let [nome, ela] = umNome()
  for (let i = 0; i < 8 && usados.has(nome); i++) [nome, ela] = umNome()
  if (usados.has(nome)) nome = `${nome} ${Math.floor(Math.random() * 90) + 10}`
  usados.add(nome)
  const estilo = umEstilo()
  return {
    nome, ela, estilo,
    risada: sorteio(estilo === 'caprichado' ? ['haha', 'hahaha', 'kkk'] : estilo === 'empolgado' ? ['KKKKKK', 'kkkkkkkk', 'KKKKKKKKK', 'kkkkkk'] : ['kkk', 'kkkk', 'kkkkk', 'rsrs', 'kkkkkk', 'hahaha']),
    // poucos falam muito, a maioria fala pouco
    peso: chance(0.12) ? 3 + Math.random() * 3 : 0.3 + Math.random(),
    emoji: estilo === 'empolgado' ? 0.35 : estilo === 'caprichado' ? 0.05 : 0.12,
  }
}

/* -------------------------------------------------------------- conteúdo */

export type Categoria = 'saudacao' | 'reacao' | 'giria' | 'pergunta' | 'mercado' | 'meta' | 'stop' | 'lateral'
type Ctx = { ap: string; robos: string[]; periodo: string }
/** Dois robôs diferentes (ninguém pergunta "o Raptor ou o Raptor?"). */
const doisRobos = (c: Ctx): [string, string] => {
  const a = sorteio(c.robos)
  const resto = c.robos.filter((x) => x !== a)
  return [a, resto.length ? sorteio(resto) : a]
}
type Modelo = (c: Ctx) => string

const CIDADES = ['SP', 'BH', 'Rio', 'Curitiba', 'Recife', 'Salvador', 'Fortaleza', 'Goiânia', 'Manaus', 'Porto Alegre', 'Floripa', 'Campinas', 'Brasília', 'Belém', 'Natal', 'Uberlândia', 'Londrina', 'Ribeirão Preto', 'interior de SP', 'Vitória', 'Cuiabá', 'João Pessoa']
const EMOJIS = ['🔥', '👏', '🚀', '💰', '🙌', '👊', '💯', '😍', '🤝', '💪', '👀', '😎']
/** O nome do apresentador do jeito que cada um chama. */
const chamar = (ap: string) => {
  const p = ap.split(/\s+/)[0] || ap
  const r = Math.random()
  if (r < 0.55) return p
  if (r < 0.7) return p.toLowerCase()
  if (r < 0.78) return `${p}ão`.replace(/oão$/, 'ão').replace(/aão$/, 'ão')
  if (r < 0.86) return p.toLowerCase() + 'ooo'
  if (r < 0.93) return 'professor'
  return 'mestre'
}

const MODELOS: Record<Categoria, Modelo[]> = {
  saudacao: [
    (c) => `${c.periodo} ${chamar(c.ap)}!`, (c) => `${c.periodo} pessoal`, (c) => `${c.periodo} galera`, (c) => `fala ${chamar(c.ap)}`,
    (c) => `${c.periodo} a todos`, () => 'presente!', () => 'cheguei agora, o que perdi?', (c) => `${c.periodo} família`,
    (c) => `salve ${chamar(c.ap)}`, () => 'opa, cheguei', (c) => `${c.periodo} de ${sorteio(CIDADES)}`, () => 'assistindo do trabalho kkk',
    () => 'primeira vez aqui na live', (c) => `${c.periodo}, primeira live que eu consigo pegar ao vivo`, () => 'boa, cheguei a tempo',
    (c) => `${c.periodo} ${chamar(c.ap)}, tmj`, () => `alguém de ${sorteio(CIDADES)}?`, () => `salve galera de ${sorteio(CIDADES)}`,
    () => 'consegui sair mais cedo pra pegar a live', (c) => `${c.periodo}!! vamos que vamos`, () => 'cheguei atrasado mas cheguei',
    (c) => `opa ${chamar(c.ap)}, ${c.periodo} pra você também`, () => 'tô no ônibus assistindo kkk', () => 'boa, começou!',
    (c) => `${c.periodo}, direto de ${sorteio(CIDADES)}`, () => 'cheguei! bora pra mais um dia',
  ],
  reacao: [
    () => 'que aula', () => 'muito bom', () => 'show demais', () => 'tô anotando tudo aqui', () => 'faz sentido', () => 'agora entendi',
    () => 'top', () => 'essa explicação foi ótima', () => 'gestão é tudo mesmo', () => 'disciplina acima de tudo', () => 'excelente',
    () => 'nunca tinha pensado assim', () => 'era isso que eu precisava ouvir', () => 'clareou muito agora', () => 'vou rever essa parte depois',
    () => 'conteúdo de qualidade', () => 'que didática', () => 'agora fez sentido o gerenciamento', () => 'muito bem explicado',
    () => 'salvei essa dica', () => 'isso vale ouro', () => 'concordo total', (c) => `obrigado por compartilhar ${chamar(c.ap)}`,
    () => 'faz toda diferença mesmo', () => 'simples e direto', () => 'aprendendo muito aqui', () => 'que legal ver na prática',
  ],
  giria: [
    () => 'aeeee porraaaa', () => 'nossa mano', () => 'que isso mano', () => 'brabo demais', () => 'oloco', () => 'slk',
    () => 'pqp que entrada', () => 'tá voando', () => 'vamoooo', () => 'rapaz...', () => 'eitaaa', () => 'mitou', () => 'insano',
    () => 'absurdo isso', () => 'que isso meu deus', () => 'tmj', () => 'é nóis', () => 'bora família', () => 'monstro',
    (c) => `${chamar(c.ap)} é brabo demais`, (c) => `${chamar(c.ap)} monstro`, () => 'caraca', () => 'caramba mano', () => 'top demais mano',
    () => 'sinistro', () => 'uai que isso', () => 'bah que massa', () => 'oxe que lindo', () => 'massa demais', () => 'show de bola',
    () => 'aí sim porra', () => 'nossa senhora', () => 'mano do céu', () => 'que pancada', () => 'vamo que vamo',
  ],
  pergunta: [
    (c) => { const [a, b] = doisRobos(c); return `qual robô vocês recomendam pra começar, o ${a} ou o ${b}?` }, (c) => `alguém aqui usa o ${sorteio(c.robos)}?`,
    (c) => { const [a, b] = doisRobos(c); return `qual a diferença do ${a} pro ${b}?` }, () => 'como faço pra definir o limite de perda?',
    () => 'quanto vocês colocam de entrada?', () => 'dá pra deixar o robô ligado e sair do computador?', () => 'o saque cai em quanto tempo?',
    () => 'qual o melhor horário pra operar?', () => 'posso usar conta demo primeiro?', () => 'como funciona o martingale no robô?',
    () => 'é melhor meta diária ou por sessão?', () => 'o que vocês fazem quando o mercado tá lateral?', () => 'tem aula sobre gerenciamento?',
    () => 'qual banca mínima pra começar?', () => 'vocês operam todo dia?', () => 'que horas costuma ter live?', () => 'essa live fica gravada?',
    () => 'como conecto minha conta da Deriv?', () => 'quanto tempo leva pra pegar o jeito?', () => 'dá pra operar pelo celular?',
    () => 'o stop vocês colocam em quanto?', () => 'precisa ficar olhando o tempo todo?', () => 'é melhor treinar na demo antes né?',
    () => 'qual meta vocês usam?', () => 'vale a pena aumentar a entrada depois que bate a meta?', (c) => `${chamar(c.ap)}, você opera quantas vezes por dia?`,
  ],
  mercado: [
    () => 'mercado tá mais calmo hoje né', () => 'esse ativo tá andando bem', () => 'olha esse movimento', () => 'deu uma acelerada agora',
    () => 'tá respeitando bem', () => 'paciência agora', () => 'tá devagar agora', () => 'olha esse candle', () => 'volatilidade subiu',
    () => 'mercado andando hoje', () => 'segura aí', () => 'paciência que a hora chega', () => 'deu uma travada', () => 'tá bonito o gráfico',
  ],
  meta: [
    (c) => `parabéns ${chamar(c.ap)}! meta batida`, () => 'bateu a meta e parou, isso é gestão', () => 'bora!!! meta no bolso',
    () => 'disciplina demais', () => 'é isso, meta batida, desliga e vai viver', () => 'que sessão', () => 'parabéns pela gestão',
    (c) => `${chamar(c.ap)} sempre falando: bateu, para`, () => 'bom demais ver assim', () => 'aeeee meta batida', () => 'bati a minha também!!',
    () => 'meta do dia ok aqui', () => 'gestão funcionando', () => 'parabéns, consistência é isso', () => 'que sessão limpa',
    () => 'meta no bolso e cabeça tranquila', () => 'aí sim porraaa', () => 'vamoooo',
    () => 'meta batida ✅', () => '✅ meta do dia', () => 'bati aqui também ✅✅', () => 'meta ✅ desliguei e fui',
    () => '✅ gestão em dia', () => 'meta concluída ✅', () => 'mais um dia de meta ✅', (c) => `✅ valeu ${chamar(c.ap)}`,
  ],
  stop: [
    () => 'faz parte, amanhã tem mais', () => 'stop é proteção', () => 'respeitou o limite, isso que importa', () => 'gestão salvando de novo',
    () => 'tranquilo, cabeça fria', () => 'quem respeita o stop fica no mercado', (c) => `valeu por mostrar o stop também ${chamar(c.ap)}`,
    () => 'o importante é não sair do plano', () => 'acontece, o importante é a gestão', () => 'stop respeitado, amanhã tem mais',
    () => 'isso que é profissional', () => 'melhor perder pouco do que tudo', () => 'cabeça fria, mano', () => 'mostrou que é real, tem dia de stop',
  ],
  lateral: [
    () => 'mercado de lado hoje', () => 'paciência é parte da estratégia', () => 'melhor esperar mesmo', () => 'sem pressa',
    () => 'aguardando a entrada certa', () => 'esses dias de lado testam a disciplina', () => 'hoje tá parado mesmo', () => 'melhor não forçar',
    () => 'dia de observar', () => 'nada de ansiedade', () => 'calma que o mercado anda',
  ],
}

/** Respostas a outra pessoa do chat ("@fulano ..."). */
const RESPOSTAS = {
  pergunta: ['boa pergunta, também quero saber', 'tem aula sobre isso na aba Aulas', 'acho que ele vai falar disso daqui a pouco', 'eu comecei pela demo, recomendo',
    'pergunta pro professor no final', 'também queria saber isso', 'ele explicou isso na live passada', 'eu também fiquei com essa dúvida'],
  saudacao: ['salve!', 'bem-vindo!', 'opa, tmj', 'seja bem-vindo', 'chegou na hora boa'],
  geral: ['verdade', 'isso aí', 'pensei a mesma coisa', 'concordo', 'exatamente', 'verdade kkk', '+1', 'boa', 'falou tudo', 'pois é', 'tmj'],
}

/* ------------------------------------------------------ jeito de escrever */

/** A palavra inteira, entendendo acentos (o \\b do JavaScript não entende "você"). */
const palavra = (w: string) => new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, 'giu')

const ABREVIACOES: Array<[RegExp, string[]]> = ([
  ['vocês', ['vcs', 'voces']], ['você', ['vc', 'voce']], ['também', ['tb', 'tbm', 'tambem']], ['porque', ['pq']],
  ['que', ['q', 'que']], ['muito', ['mt', 'mto', 'muitoo']], ['beleza', ['blz']], ['valeu', ['vlw']],
  ['está', ['ta', 'tá']], ['tá', ['ta']], ['para', ['pra']], ['não', ['nao', 'n']], ['hoje', ['hj']],
  ['mesmo', ['msm']], ['quando', ['qnd']], ['obrigado', ['obg', 'obrigadoo']], ['depois', ['dps']],
] as Array<[string, string[]]>).map(([w, o]) => [palavra(w), o])

// erros de português que se veem em todo chat
const ERROS: Array<[RegExp, string]> = ([
  ['com certeza', 'concerteza'], ['a gente', 'agente'], ['de repente', 'derrepente'], ['mas', 'mais'],
  ['nós', 'nois'], ['explicação', 'esplicação'], ['excelente', 'exelente'], ['disciplina', 'diciplina'],
  ['exatamente', 'esatamente'], ['vocês', 'voceis'], ['gerenciamento', 'gerenciameto'], ['entendi', 'entedi'],
  ['paciência', 'paciencia'], ['está', 'esta'], ['horário', 'horario'], ['faz sentido', 'fais sentido'],
  ['vamos', 'vamo'], ['consigo', 'cosigo'], ['mercado', 'mecado'], ['agora', 'agr'],
] as Array<[string, string]>).map(([w, t]) => [palavra(w), t])

/** Um erro de digitação: troca duas letras vizinhas, come uma ou dobra uma. */
function errarDigitando(s: string): string {
  const palavras = s.split(' ')
  const candidatas = palavras.map((p, i) => [p, i] as const).filter(([p]) => /^[a-zà-ú]{5,}$/i.test(p))
  if (!candidatas.length) return s
  const [p, i] = sorteio(candidatas)
  const k = 1 + Math.floor(Math.random() * (p.length - 2))
  const r = Math.random()
  palavras[i] = r < 0.45 ? p.slice(0, k) + p[k + 1] + p[k] + p.slice(k + 2) : r < 0.8 ? p.slice(0, k) + p.slice(k + 1) : p.slice(0, k) + p[k] + p.slice(k)
  return palavras.join(' ')
}

function abreviar(s: string, p: number): string {
  let t = s
  for (const [re, opcoes] of ABREVIACOES) if (chance(p)) t = t.replace(re, () => sorteio(opcoes))
  return t
}

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Escreve a frase do jeito desta pessoa. */
/** `podeRir` = false em stop e pergunta: sem risada e sem emoji. */
export function escrever(base: string, p: Pessoa, podeRir = true): string {
  let s = base
  const termina = /[!?.…]$/.test(s)
  switch (p.estilo) {
    case 'caprichado':
      s = maiuscula(s)
      if (!termina && chance(0.45)) s += s.includes('?') ? '' : sorteio(['.', '!', '.'])
      break
    case 'normal':
      if (chance(0.3)) s = maiuscula(s)
      if (chance(0.2)) s = semAcento(s)
      if (chance(0.12)) s = abreviar(s, 0.4)
      if (chance(0.05)) s = errarDigitando(s)
      break
    case 'rapido':
      s = semAcento(abreviar(s, 0.75)).toLowerCase()
      s = s.replace(/[.!]$/, '')
      if (chance(0.1)) s = errarDigitando(s)
      break
    case 'empolgado':
      if (chance(0.5)) s = semAcento(s)
      if (s.length < 28 && chance(0.3)) s = s.toUpperCase() // grito é curto
      if (chance(0.35)) s = s.replace(/([aeiou])([!?]*)$/i, (_m, v: string, f: string) => v.repeat(3 + Math.floor(Math.random() * 3)) + f)
      if (chance(0.35) && !/[!?]$/.test(s)) s += '!'.repeat(1 + Math.floor(Math.random() * 3))
      if (chance(0.2)) s = `${sorteio(['mano', 'cara', 'gente', 'velho'])} ${s}`
      break
    case 'enrolado':
      for (const [re, troca] of ERROS) if (chance(0.55)) s = s.replace(re, troca)
      if (chance(0.5)) s = semAcento(s)
      if (chance(0.3)) s = errarDigitando(s)
      if (chance(0.3)) s = s.replace(/\?$/, chance(0.5) ? '' : '??')
      if (chance(0.15)) s = maiuscula(s)
      break
  }
  if (podeRir && chance(p.estilo === 'empolgado' ? 0.22 : p.estilo === 'caprichado' ? 0.03 : 0.08)) s += ` ${p.risada}`
  if (podeRir && chance(p.emoji)) s += ` ${sorteio(EMOJIS).repeat(chance(0.4) ? 1 + Math.floor(Math.random() * 3) : 1)}`
  return s
}

/** Uma mensagem de uma categoria, já no jeito da pessoa. */
export function mensagemDe(categoria: Categoria, p: Pessoa, ctx: Ctx, evitar: string[]): string {
  // as gírias são de quem tem jeito pra isso; quem escreve caprichado reage com outra coisa
  const cat: Categoria = categoria === 'giria' && p.estilo === 'caprichado' ? 'reacao' : categoria
  let base = ''
  for (let i = 0; i < 8; i++) { base = sorteio(MODELOS[cat])(ctx); if (!evitar.includes(base)) break }
  evitar.push(base); if (evitar.length > 24) evitar.shift()
  // ninguém ri de stop nem de pergunta séria
  if (cat !== 'meta' || base.includes('✅')) return escrever(base, p, cat !== 'stop' && cat !== 'pergunta')
  // meta batida: o ✅ verde em parte das mensagens, cada uma de um jeito
  if (!chance(0.42)) return escrever(base, p)
  const texto = escrever(base, { ...p, emoji: 0 })
  const check = sorteio(['✅', '✅', '✅✅', '✅✅✅', '✅🔥', '✅💰', '✔️'])
  return chance(0.3) ? `${check} ${texto}` : `${texto} ${check}`
}

/** Resposta a alguém do chat. */
export function respostaA(nome: string, categoriaDela: Categoria, p: Pessoa, ela = false): string {
  const lista = categoriaDela === 'pergunta' ? RESPOSTAS.pergunta : categoriaDela === 'saudacao' ? RESPOSTAS.saudacao : RESPOSTAS.geral
  const frase = sorteio(lista).replace('bem-vindo', ela ? 'bem-vinda' : 'bem-vindo')
  return `@${nome} ${escrever(frase, { ...p, emoji: p.emoji / 2 })}`
}

/** Só emoji, quando a sala comemora junto (na meta, o ✅ entra na roda). */
export const soEmoji = (meta = false) => sorteio(meta
  ? ['✅', '✅✅', '✅✅✅', '✅🔥', '🔥🔥🔥', '👏👏👏', '✅👏', '💰💰', '✅', '🙌']
  : ['🔥🔥🔥', '👏👏👏', '🚀🚀', '🙌🙌', '💰💰', '👏👏', '🔥🔥', '💯', '🔥', '👊'])
