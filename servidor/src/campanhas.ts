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
 * Fala com quem JÁ conhece a plataforma. Então não explica o que ela é, não
 * promete resultado e não inventa urgência: diz o que mudou, quanto custa e
 * onde ficam os detalhes.
 */
export function emailDeVolta(marca: Marca): EmailPronto {
  return montarEmail(marca, 'convite', new URL('/', marca.redirectUri).href, {
    assunto: `Sua conta na ${marca.prosa} está aberta de novo — e agora é gratuita`,
    titulo: 'Sua conta está aberta de novo',
    espia: `Acesso gratuito e liberado para quem já foi cliente da ${marca.prosa}.`,
    corpo:
      `Você já foi cliente da ${marca.prosa}, e é por isso que este e-mail chegou até você.\n\n` +
      `A plataforma voltou, reconstruída: os robôs foram revisados um a um, o ` +
      `acompanhamento das operações é ao vivo e a sua conta na corretora continua ` +
      `sendo sua — o dinheiro nunca passa por nós.\n\n` +
      `E a parte que mais importa: **para quem já foi nosso cliente, o acesso é ` +
      `gratuito. Não é promoção com prazo, não é teste de alguns dias, e não ` +
      `pedimos cartão.** Sua conta já está esperando por você.\n\n` +
      `Os detalhes — o que mudou, como voltar a operar e o que vem pela frente — ` +
      `estão sendo publicados no nosso canal oficial no Telegram. É por lá que ` +
      `avisamos tudo primeiro.`,
    telegram: { url: marca.telegram, texto: 'Entrar no canal oficial' },
    botao: 'Acessar minha conta',
    aviso:
      `Negociar envolve risco de perda: os robôs operam com a sua própria conta na ` +
      `corretora, e resultado passado não garante resultado futuro. Se você não ` +
      `quiser mais receber estes e-mails, é só responder dizendo isso.`,
  })
}
