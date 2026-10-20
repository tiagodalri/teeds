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
  ['João', ['Joãozinho', 'Jão']], ['Pedro', ['Pedrinho', 'Pedrão']], ['Lucas', ['Luquinhas']], ['Gabriel', ['Biel', 'Gabi']],
  ['Matheus', ['Theus', 'Math']], ['Rafael', ['Rafa', 'Rafinha']], ['Guilherme', ['Gui']], ['Leonardo', ['Léo']],
  ['Gustavo', ['Guto', 'Gus']], ['Felipe', ['Lipe', 'Felipinho']], ['Eduardo', ['Dudu', 'Edu']], ['Vitor', ['Vitinho']],
  ['Thiago', ['Thiaguinho']], ['Rodrigo', ['Digão', 'Rodriguinho']], ['Marcos', ['Marcão', 'Marquinhos']], ['Paulo', ['Paulinho', 'Paulão']],
  ['José', ['Zé', 'Zezinho']], ['Antônio', ['Toninho', 'Tonho']], ['Francisco', ['Chico', 'Chicão']], ['Ricardo', ['Ricardinho', 'Rick']],
  ['Daniel', ['Dani', 'Danielzinho']], ['Henrique', ['Rique']], ['Caio', []], ['Diego', ['Dieguinho']], ['Bruno', ['Bruninho']],
  ['André', ['Dedé']], ['Fábio', ['Fabinho']], ['Carlos', ['Carlão', 'Carlinhos']], ['Luiz', ['Luizinho']], ['Wellington', ['Well']],
  ['Wesley', ['Wes']], ['Anderson', ['Dinho']], ['Renan', []], ['Igor', []], ['Murilo', ['Muca']], ['Samuel', ['Samu']],
  ['Kaique', ['Kaká']], ['Otávio', ['Tavinho']], ['Sérgio', ['Serginho']], ['Roberto', ['Beto', 'Robertão']], ['Júnior', ['Juninho']],
  ['Leandro', ['Lê']], ['Danilo', ['Dan']], ['Vinícius', ['Vini']], ['Arthur', ['Tuca']], ['Nathan', []], ['Emerson', []],
  ['Cleiton', []], ['Jefferson', ['Jeff']], ['Alexandre', ['Alê', 'Xandão']], ['Marcelo', ['Celo', 'Marcelinho']], ['Valter', []],
  ['Rogério', []], ['Fernando', ['Nando']], ['Ítalo', []], ['Hugo', []], ['Davi', []], ['Enzo', []], ['Cauã', []],
]
const ELAS: Array<[string, string[]]> = [
  ['Ana', ['Aninha']], ['Maria', ['Mari']], ['Juliana', ['Ju', 'Juh']], ['Fernanda', ['Fê', 'Nanda']], ['Beatriz', ['Bia']],
  ['Mariana', ['Mari', 'Mah']], ['Larissa', ['Lari']], ['Carolina', ['Carol']], ['Camila', ['Cami', 'Mila']], ['Amanda', ['Mandinha']],
  ['Isabela', ['Isa', 'Bela']], ['Natália', ['Nati']], ['Patrícia', ['Pati', 'Pat']], ['Gabriela', ['Gabi']], ['Letícia', ['Lelê', 'Lety']],
  ['Bruna', ['Bru']], ['Aline', ['Li']], ['Jéssica', ['Jé']], ['Tatiane', ['Tati']], ['Priscila', ['Pri']], ['Vanessa', ['Van', 'Nessa']],
  ['Sabrina', ['Sabri']], ['Débora', ['Debinha']], ['Kelly', []], ['Simone', ['Si']], ['Rosângela', ['Rô']], ['Cida', []],
  ['Sueli', []], ['Talita', ['Tali']], ['Yasmin', ['Yas']], ['Luana', ['Lu']], ['Raquel', ['Quel']], ['Daniela', ['Dani']],
  ['Eduarda', ['Duda']], ['Heloísa', ['Helô']], ['Giovana', ['Gi']], ['Thaís', ['Tha']], ['Bianca', ['Bia']], ['Michele', ['Mi']],
  ['Adriana', ['Dri']], ['Cristina', ['Cris']], ['Sandra', []], ['Elaine', ['Lane']], ['Kátia', []], ['Mônica', []], ['Paula', ['Paulinha']],
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
  const [nome, apelidos] = sorteio(ele ? ELES : ELAS)
  const sobrenome = sorteio(SOBRENOMES)
  const r = Math.random()
  if (r < 0.2) return nome
  if (r < 0.37) return `${nome} ${sobrenome}`
  if (r < 0.47) return `${nome} ${sobrenome[0]}${chance(0.6) ? '.' : ''}`
  if (r < 0.65 && apelidos.length) return sorteio(apelidos)
  if (r < 0.71) return sorteio(NOMES_COMPOSTOS.filter((n) => /^(Maria|Ana)/.test(n) !== ele))
  if (r < 0.86) {
    // @ de usuário: minúsculo, sem acento, às vezes com número ou "trader"
    const base = semAcento((chance(0.5) && apelidos.length ? sorteio(apelidos) : nome).toLowerCase())
    const sep = sorteio(['', '.', '_'])
    const fim = sorteio([semAcento(sobrenome.toLowerCase()), String(Math.floor(Math.random() * 99) + 1), `${Math.floor(Math.random() * 30) + 80}`, 'trader', 'oficial', semAcento(sobrenome.toLowerCase()).slice(0, 4)])
    return `${base}${sep}${fim}`
  }
  if (r < 0.9) return ele ? `${nome} ${sorteio(['Jr', 'Júnior', 'Neto', 'Filho'])}` : `${nome} ${sobrenome}`
  if (r < 0.93) return `${ele ? 'Tio' : 'Dona'} ${nome}`
  if (r < 0.96) return `${nome} ${sobrenome}`.toUpperCase()
  return `${nome} ${sorteio(['🇧🇷', '🚀', '💰', '✌️', '🙏'])}`
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
  return escrever(base, p, cat !== 'stop' && cat !== 'pergunta')
}

/** Resposta a alguém do chat. */
export function respostaA(nome: string, categoriaDela: Categoria, p: Pessoa, ela = false): string {
  const lista = categoriaDela === 'pergunta' ? RESPOSTAS.pergunta : categoriaDela === 'saudacao' ? RESPOSTAS.saudacao : RESPOSTAS.geral
  const frase = sorteio(lista).replace('bem-vindo', ela ? 'bem-vinda' : 'bem-vindo')
  return `@${nome} ${escrever(frase, { ...p, emoji: p.emoji / 2 })}`
}

/** Só emoji, quando a sala comemora junto. */
export const soEmoji = () => sorteio(['🔥🔥🔥', '👏👏👏', '🚀🚀', '🙌🙌', '💰💰', '👏👏', '🔥🔥', '💯', '🔥', '👊'])
