/**
 * E-mails de campanha: os que não nascem de um ato da pessoa.
 *
 * Os outros e-mails da casa respondem a alguma coisa — alguém se cadastrou,
 * alguém foi aprovado, alguém pediu uma senha nova. Estes não: partem daqui,
 * para uma lista. Por isso ficam separados do carteiro, que é automático, e
 * por isso cada um diz no comentário para quem foi escrito e quando.
 *
 * O texto mora aqui e a prévia (`npm run emails`) monta o MESMO texto. Nada
 * de uma segunda versão para o mockup: o que estiver errado no arquivo de
 * prévia está errado na caixa de entrada.
 */
import { montarEmail, type EmailPronto } from './emails'
import type { Marca } from '../../src/marca/marcas'

/**
 * O convite de volta para quem já foi cliente.
 *
 * Pedido do Tiago em 30/09/2026, para a base da Teeds. A mensagem tem duas
 * pernas: o acesso volta a ser gratuito para quem já foi cliente, e os
 * detalhes estão no canal do Telegram. O botão do canal vem primeiro de
 * propósito — é lá que a conversa continua, e o e-mail não tenta explicar
 * tudo sozinho.
 *
 * A COPY parte de um fato incômodo: esta pessoa entrou um dia e a plataforma
 * ficou em silêncio. Ela não está neutra — está desconfiada. Por isso o texto
 * começa nomeando a ausência, em vez de fingir que ela não existiu. Entusiasmo
 * aqui faria o contrário do que se quer: confirmaria a suspeita.
 *
 * Daí a regra do texto: nenhum adjetivo que uma prova possa substituir. Não
 * "mais seguro", e sim o freio que para ANTES de furar o limite. Não "mais
 * transparente", e sim o histórico que dá para rever operação por operação.
 * Cada frase aqui é conferível dentro da plataforma — e quem volta vai
 * conferir. Prometer resultado, inventar prazo ou fabricar escassez seria
 * ganhar o clique e perder a pessoa na primeira tela.
 *
 * O gratuito é apresentado como reconhecimento, não como desconto: desconto
 * pede desconfiança ("qual é a pegadinha?"), reconhecimento pede reciprocidade.
 * E o convite termina na conta de demonstração porque o maior obstáculo de
 * quem já se decepcionou não é o preço — é o risco de se decepcionar de novo.
 */
export function emailDeVolta(marca: Marca): EmailPronto {
  return montarEmail(marca, 'convite', new URL('/', marca.redirectUri).href, {
    assunto: `A ${marca.prosa} voltou — e a sua conta continua aqui`,
    titulo: `A ${marca.prosa} voltou`,
    espia: 'Reconstruída por dentro. E, para quem já foi cliente, o acesso é gratuito.',
    corpo:
      `Você entrou na ${marca.prosa} antes de ela ficar em silêncio. A gente não ` +
      `esqueceu disso.\n\n` +
      `Nesse tempo a plataforma foi reconstruída por dentro — não é a mesma com ` +
      `cara nova. Cada robô foi revisto, regra por regra. O freio de perda agora ` +
      `para ANTES de furar o limite que você definiu, e não depois. E você ` +
      `acompanha cada entrada ao vivo, com o histórico inteiro para rever ` +
      `operação por operação, quando quiser.\n\n` +
      `O que não mudou é o principal: a conta na corretora é sua. O dinheiro ` +
      `nunca passa por nós, nem por um segundo.\n\n` +
      `**Para quem já foi nosso cliente, o acesso é gratuito.** Não é promoção ` +
      `com prazo, não é teste de alguns dias, e não pedimos cartão. Quem esteve ` +
      `aqui quando a plataforma era menor não vai pagar para ver no que ela se ` +
      `tornou.\n\n` +
      `Sua conta continua no mesmo e-mail em que você está lendo isto. Você pode ` +
      `entrar hoje, ligar um robô na conta de demonstração e conferir tudo o que ` +
      `está escrito aqui — sem arriscar um centavo.\n\n` +
      `O que mudou, o que vem pela frente e como voltar a operar: estamos ` +
      `contando primeiro no nosso canal oficial no Telegram. É de lá que sai ` +
      `cada aviso, antes de qualquer outro lugar.`,
    telegram: { url: marca.telegram, texto: 'Entrar no canal oficial' },
    botao: 'Entrar na minha conta',
    aviso:
      `Negociar envolve risco de perda: os robôs operam com a sua própria conta na ` +
      `corretora, e resultado passado não garante resultado futuro. Se você não ` +
      `quiser mais receber estes e-mails, é só responder dizendo isso.`,
  })
}
