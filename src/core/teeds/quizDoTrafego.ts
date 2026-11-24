/**
 * A página de tráfego pago de cada parceiro (/n/trafego, /v/trafego, /d/trafego), 16-17/11/2026.
 *
 * Nasceu como cópia da /cadastro (o mesmo cadastro com planos, marcado como 'trafego' para ser medido
 * à parte: entradaInicial.ts, pixelDoParceiro.ts, rastroDoCadastro.ts) e ganhou o quiz com a VSL na frente.
 *
 * Tiago: "quando o cara chegar do anúncio, ele vai cair no quiz (que vai mostrando vídeos no meio),
 * são 3 vídeos intervalados entre as perguntas; faça exatamente igual, apenas adaptando o visual".
 * O modelo é o quiz "Ganhe em Dólar" do Naor (sucessonotrade.com): 15 etapas, os vídeos na 9, na 12
 * e na 15, e o botão de cada vídeo só aparece num tempo certo do vídeo, como lá.
 *
 * SEPARADO POR PARCEIRO (17/11/2026, Tiago: "tem que ser bem separadinho o /v/trafego e o /n/trafego").
 * Tudo o que é de um parceiro mora no bloco dele em PAGINAS_DE_TRAFEGO, e só nele: o nome da abertura
 * ("seu futuro sócio"), os 3 vídeos e o WhatsApp do "Garantir minha vaga". Quem decide qual bloco vale
 * é o endereço (/n ou /v), lido uma vez quando a página abre; o quiz não troca de parceiro no meio.
 *  - `quiz: null`: o parceiro ainda não tem VSL; a /trafego dele abre direto nos planos, como a /cadastro.
 *  - `whatsapp: null`: o quiz termina na escolha do plano em vez do WhatsApp.
 * Perguntas, análise e aprovado (ETAPAS_DO_QUIZ, abaixo) são iguais para todos, porque falam em
 * primeira pessoa e servem a qualquer sócio.
 *
 * Para ligar o quiz de um parceiro: subir os 3 MP4 em aulas/globalfly/vsl-trafego/<nome>-<1|2|3>-v1.mp4,
 * as capas em public/aulas-globalfly/vsl/, e preencher `quiz` no bloco dele.
 */
import { vitrine } from './parceiro'
import { SUPABASE } from './config'

export interface VideoDoQuiz {
  /** O MP4 (720p, começa a tocar antes de baixar inteiro). */
  src: string
  /** A capa enquanto carrega (quadro do próprio vídeo, no site). */
  capa: string
  /** Em que segundo do vídeo o botão aparece. */
  botaoAos: number
  /** Duração em segundos (a barra usa antes de o vídeo dizer a dele). */
  duracao: number
}

export interface QuizDoParceiro {
  /** As 3 partes da VSL: etapa 9 (história), etapa 12 (resultados) e etapa 15 (aprovado). */
  videos: readonly [VideoDoQuiz, VideoDoQuiz, VideoDoQuiz]
  /** O WhatsApp do atendimento (DDI + DDD + número), ou null para o fim levar aos planos. */
  whatsapp: string | null
}

export interface PaginaDeTrafego {
  /** O código do endereço: /n, /v, /d. */
  codigo: string
  /** O nome na abertura do quiz, com a foto do parceiro ("Seu futuro sócio"). */
  nome: string
  /** O quiz com a VSL, ou null quando o parceiro ainda não tem (a /trafego abre nos planos). */
  quiz: QuizDoParceiro | null
  /**
   * VSL única, sem quiz (24/11/2026, Victor): só o vídeo e o botão verde no segundo em que ele chama,
   * que leva aos planos. Vale quando `quiz` é null. O `src` pode ser HLS (.m3u8): o vídeo inteiro em
   * pedaços de 6 s, porque o armazenamento aceita no máximo 50 MB por arquivo.
   */
  vsl?: VideoDoQuiz
}

const PASTA = `${SUPABASE.url}/storage/v1/object/public/aulas/globalfly/vsl-trafego`
// 18/11/2026 (Tiago): "essa é a msg que deve chegar no whats", sem o código do lead.
export const MENSAGEM_DO_WHATSAPP = 'Quero fazer parte da próxima live ao vivo Naor'

export const PAGINAS_DE_TRAFEGO: Record<string, PaginaDeTrafego> = {
  /* ---------------------------------------------------------------- /n/trafego · Naor Bezerra
   * VSL em 3 partes (17/11/2026, Tiago: "a vsl será dividida em 3 etapas"), no nosso player, no lugar
   * da vturb. O botão de cada parte aparece no segundo em que o Naor manda clicar:
   *  - parte 1 (história, "Você está chegando ao fim desse quiz"): 4:10;
   *  - parte 2 (as lives e os depoimentos): 2:37;
   *  - parte 3 (aprovado, a proposta dos 10%): 5:01, "vai aparecer um botão verde agora".
   * "Garantir minha vaga" abre o WhatsApp do atendimento do Naor (17/11/2026, Tiago: "deve levar pra esse
   * número de WhatsApp do Naor onde faremos o atendimento").
   * Trocar um vídeo: subir com outro nome (o -v1 no fim) para o navegador não guardar o antigo. */
  n: {
    codigo: 'n',
    nome: 'Naor Bezerra',
    quiz: {
      videos: [
        { src: `${PASTA}/naor-1-v1.mp4`, capa: '/aulas-globalfly/vsl/naor-1.webp', botaoAos: 250, duracao: 258 },
        { src: `${PASTA}/naor-2-v1.mp4`, capa: '/aulas-globalfly/vsl/naor-2.webp', botaoAos: 157, duracao: 166 },
        { src: `${PASTA}/naor-3-v1.mp4`, capa: '/aulas-globalfly/vsl/naor-3.webp', botaoAos: 301, duracao: 315 },
      ],
      // 18/11/2026 (Tiago): o novo número do atendimento, para onde todas as campanhas vão (era 5511994437461)
      whatsapp: '5511927067387',
    },
  },

  /* ---------------------------------------------------------------- /v/trafego · Victor Cordeiro
   * VSL única (24/11/2026, Tiago: "a do Victor vai ser diferente pq vai ser uma VSL única"): a VSL dele
   * de 9:33 refeita com 2026 e 10%, sem quiz. O botão verde aparece aos 8:28, quando ele diz "veja agora
   * se apareceu um botão verde aqui embaixo para você vir para o time", e leva aos planos ("eu vou
   * liberar todos os seus acessos"). Os vídeos do Naor NÃO servem aqui (são a história dele).
   * HLS (1080p e 720p): as playlists ficam no site (public/aulas-globalfly/vsl/victor-v1/, porque o
   * armazenamento só aceita vídeo) e apontam para os pedaços fMP4 em aulas/globalfly/vsl-trafego/victor-v1/.
   * Trocar: subir como victor-v2/ (playlists e pedaços) para o navegador não guardar o antigo. */
  v: {
    codigo: 'v',
    nome: 'Victor Cordeiro',
    quiz: null,
    vsl: { src: '/aulas-globalfly/vsl/victor-v1/index.m3u8', capa: '/aulas-globalfly/vsl/victor.webp', botaoAos: 508, duracao: 573 },
  },

  /* ---------------------------------------------------------------- /d/trafego · Douglas
   * Ainda sem VSL própria: abre direto nos planos. */
  d: {
    codigo: 'd',
    nome: 'Douglas',
    quiz: null,
  },
}

/** A página de tráfego do parceiro do endereço (/n, /v, /d), ou null quando o endereço não tem parceiro. */
export function paginaDeTrafego(): PaginaDeTrafego | null {
  return PAGINAS_DE_TRAFEGO[vitrine()] ?? null
}

/** A página de tráfego da visita, só quando ela tem quiz ou VSL única (senão, null: a página vai direto aos planos). */
export function paginaComQuiz(): PaginaDeTrafego | null {
  const p = paginaDeTrafego()
  return p?.quiz || p?.vsl ? p : null
}

/**
 * O código do lead na mensagem do WhatsApp (17/11/2026): as 6 primeiras letras do id do navegador, em
 * maiúsculas. No atendimento, o código leva à jornada da pessoa na central de rastreio (de que anúncio
 * veio, o que respondeu, quanto viu dos vídeos): o `quiz-concluiu` guarda o mesmo código.
 */
export const codigoDoLead = (visitante: string): string => visitante.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()

/** O link do WhatsApp da página com a mensagem pronta (e o código do lead, se houver), ou null quando o parceiro não tem número. */
export function linkDoWhatsapp(pagina: PaginaDeTrafego, codigo = ''): string | null {
  const numero = pagina.quiz?.whatsapp
  // 18/11/2026 (Tiago: "não precisa do código"): a mensagem vai limpa; o código segue só no rastreio (quiz-concluiu)
  void codigo
  const texto = MENSAGEM_DO_WHATSAPP
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : null
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
