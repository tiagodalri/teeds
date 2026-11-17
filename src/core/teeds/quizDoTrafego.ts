/**
 * O quiz da página de tráfego pago (/n/trafego, /v/trafego), 16/11/2026.
 *
 * Tiago: "quando o cara chegar do anúncio, ele vai cair no quiz (que vai mostrando vídeos no meio),
 * são 3 vídeos intervalados entre as perguntas; faça exatamente igual, apenas adaptando o visual".
 * O modelo é o quiz "Ganhe em Dólar" do Naor (sucessonotrade.com): 15 etapas, os vídeos na 9, na 12
 * e na 15, e o botão de cada vídeo só aparece num tempo certo do vídeo, como lá (o player da vturb
 * mostrava o botão dentro do vídeo: Continuar aos 4:10 e aos 1:55; Garantir minha vaga aos 5:00).
 * No fim, em vez do WhatsApp, a pessoa segue para a escolha do plano (o que já existia na /trafego).
 *
 * Os vídeos são de cada parceiro (é a história do "seu futuro sócio"). Parceiro sem vídeos aqui não
 * tem quiz: a /trafego dele abre direto nos planos, como antes.
 */
import { vitrine } from './parceiro'

export interface VideoDoQuiz {
  /** Conta da vturb (converteai) e o id do player. */
  conta: string
  id: string
  /** Em que segundo do vídeo o botão aparece (o mesmo tempo do botão dentro do player original). */
  botaoAos: number
}

const NAOR = 'd23e69b1-9de6-4831-8739-c71e897b42dc'

export const VIDEOS_DO_QUIZ: Partial<Record<string, readonly [VideoDoQuiz, VideoDoQuiz, VideoDoQuiz]>> = {
  n: [
    { conta: NAOR, id: '686cb8ef7a26e34823e55631', botaoAos: 250 },
    { conta: NAOR, id: '686cb9229ffc878a018e5319', botaoAos: 115 },
    { conta: NAOR, id: '687131d1f01862c337441acb', botaoAos: 300 },
  ],
}

/** Os vídeos do quiz de quem trouxe a visita, ou null quando esse parceiro ainda não tem quiz. */
export function videosDoQuiz(): readonly [VideoDoQuiz, VideoDoQuiz, VideoDoQuiz] | null {
  return VIDEOS_DO_QUIZ[vitrine()] ?? null
}

export type EtapaDoQuiz =
  | { tipo: 'pergunta'; pergunta: string; destaque?: string; opcoes: string[] }
  | { tipo: 'analise' }
  | { tipo: 'video'; titulo: string; video: 0 | 1 | 2 }
  | { tipo: 'processando' }
  | { tipo: 'aprovado' }

/** As 15 etapas, na ordem e com as palavras do quiz original. A barra de progresso também é a dele. */
export const ETAPAS_DO_QUIZ: Record<number, EtapaDoQuiz> = {
  1: { tipo: 'pergunta', pergunta: 'Qual é a sua idade?', opcoes: ['18-25 anos', '26-35 anos', '36-50 anos', 'Mais de 50 anos'] },
  2: { tipo: 'pergunta', pergunta: 'Você tem filhos?', opcoes: ['Sim', 'Não'] },
  3: { tipo: 'pergunta', pergunta: 'Atualmente você exerce alguma profissão?', opcoes: ['Sim, faço o que amo', 'Sim, mas não amo o que faço', 'Não estou trabalhando atualmente'] },
  4: { tipo: 'pergunta', pergunta: 'Qual seria o seu salário dos sonhos?', opcoes: ['De R$ 2.000 a R$ 10.000', 'De R$ 10.000 a R$ 30.000', 'Acima de R$ 30.000', 'O que eu ganho já é o suficiente.'] },
  5: { tipo: 'pergunta', pergunta: 'Já comprou algum curso online?', opcoes: ['Sim, só joguei meu dinheiro fora', 'Sim, ganhei dinheiro com o que aprendi', 'Sim, mas não coloquei em prática aquilo que aprendi', 'Não, nunca comprei cursos'] },
  6: { tipo: 'pergunta', pergunta: 'Se eu fizesse você %% e pagar só depois como se sentiria?', destaque: 'lucrar primeiro', opcoes: ['Me sentiria grato a ponto de compartilhar uma parte dos meus ganhos', 'Me sentiria grato, mas não aceito compartilhar meus lucros'] },
  7: { tipo: 'analise' },
  8: { tipo: 'pergunta', pergunta: 'Você conhece algo sobre o Mercado Financeiro?', opcoes: ['Sim, faço operações e tenho bons resultados.', 'Sim, já tentei fazer operações mas não lucrei.', 'Conheço mas sempre achei que precisaria de muito dinheiro para começar', 'Não conheço nada'] },
  9: { tipo: 'video', titulo: 'Conheça a história do seu futuro sócio!', video: 0 },
  10: { tipo: 'pergunta', pergunta: 'O que mais te interessa nesse projeto?', opcoes: ['Ganhar em dólar com pouco tempo por dia', 'Ser guiado por alguém que já lucra', 'Começar sem experiência no mercado', 'Transformar meu celular em fonte de renda'] },
  11: { tipo: 'pergunta', pergunta: 'O que você faria com um lucro de R$ 200 ou R$ 800 em apenas 1 dia?', opcoes: ['Reinvestiria tudo pra lucrar mais', 'Guardaria como reserva de emergência', 'Pagaria uma conta ou dívida urgente', 'Compraria algo que quero há tempos'] },
  12: { tipo: 'video', titulo: 'Veja como faço meus alunos ganharem dinheiro!', video: 1 },
  13: { tipo: 'pergunta', pergunta: 'Se for aceito, você promete seguir exatamente o que for ensinado sem inventar moda?', opcoes: ['Sim, eu vou seguir tudo à risca.', 'Vou tentar, mas posso adaptar ao meu jeito.', 'Se eu não concordar, posso mudar algumas coisas.', 'Não gosto de seguir regras, prefiro fazer do meu jeito.'] },
  14: { tipo: 'processando' },
  15: { tipo: 'aprovado' },
}

export const TOTAL_DO_QUIZ = 15
/** A barra de progresso do original: 7% por etapa, 98% no processando e 100% no aprovado. */
export const progressoDaEtapa = (n: number) => (n >= TOTAL_DO_QUIZ ? 100 : Math.min(98, n * 7))
