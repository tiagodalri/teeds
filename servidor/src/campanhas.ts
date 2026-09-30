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
 * O TOM é de volta por cima, não de desculpa. A primeira versão abria falando
 * do tempo em que a plataforma ficou parada; o Tiago cortou, e com razão:
 * ninguém volta empolgado para um lugar que começa pedindo perdão. A notícia
 * aqui é boa, e o texto trata ela como boa.
 *
 * O que dá lastro à empolgação é a prova. Nenhum adjetivo que um fato possa
 * substituir: não "mais seguro", e sim o freio que para ANTES de furar o
 * limite; não "mais transparente", e sim o histórico que dá para rever
 * operação por operação. Cada frase é conferível dentro da plataforma, e quem
 * voltar vai conferir. Promessa de resultado, prazo inventado ou escassez
 * fabricada ganhariam o clique e perderiam a pessoa na primeira tela.
 *
 * O gratuito é reconhecimento, não desconto: desconto pede desconfiança
 * ("qual é a pegadinha?"), reconhecimento pede reciprocidade. E o convite
 * termina na conta de demonstração porque é o passo que não custa nada dar.
 */
export function emailDeVolta(marca: Marca): EmailPronto {
  return montarEmail(marca, 'convite', new URL('/', marca.redirectUri).href, {
    assunto: `A ${marca.prosa} está de volta — e o seu acesso é gratuito`,
    titulo: `A ${marca.prosa} está de volta`,
    espia: `Reconstruída por dentro. E, para quem já foi cliente da ${marca.prosa}, o acesso é gratuito.`,
    corpo:
      `E voltou maior.\n\n` +
      `Não é a mesma plataforma com cara nova: a ${marca.prosa} foi reconstruída ` +
      `por dentro, do motor à tela.\n\n` +
      `Cada robô foi refeito, regra por regra. O freio de perda agora respeita o ` +
      `limite que você define — ele para ANTES de furar, e não depois. E você ` +
      `vê cada operação nascer ao vivo, com o histórico inteiro para rever, ` +
      `operação por operação, quando quiser.\n\n` +
      `O que não muda é o que sempre foi seu: a conta na corretora. O dinheiro ` +
      `nunca passa por nós, nem por um segundo.\n\n` +
      `**E para quem já foi nosso cliente, o acesso é gratuito.** Sem prazo, sem ` +
      `teste de alguns dias, sem cartão. Você esteve aqui quando a ${marca.prosa} ` +
      `era menor — é justo que veja no que ela se tornou.\n\n` +
      `Sua conta continua ativa, neste mesmo e-mail. Entre hoje, ligue um robô na ` +
      `conta de demonstração e confira com os seus próprios olhos.\n\n` +
      `E o que vem pela frente a gente conta primeiro no canal oficial no ` +
      `Telegram. É de lá que sai cada aviso, antes de qualquer outro lugar.`,
    telegram: { url: marca.telegram, texto: 'Entrar no canal oficial' },
    botao: 'Entrar na minha conta',
    aviso:
      `Negociar envolve risco de perda: os robôs operam com a sua própria conta na ` +
      `corretora, e resultado passado não garante resultado futuro. Se você não ` +
      `quiser mais receber estes e-mails, é só responder dizendo isso.`,
  })
}
