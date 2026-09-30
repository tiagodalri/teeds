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
import { linkDeDescadastro } from './descadastro'
import type { Marca } from '../../src/marca/marcas'

/**
 * O convite de volta para quem já foi cliente.
 *
 * Pedido do Tiago em 30/09/2026, para a base da Teeds. A mensagem tem duas
 * pernas: o acesso volta a ser gratuito para quem já foi cliente, e os
 * detalhes estão no canal do Telegram. O canal é o ÚNICO botão: o convite
 * para voltar à plataforma vai ser feito por lá, com calma, e um segundo
 * botão aqui só dividiria a atenção.
 *
 * O TEXTO É DO TIAGO, palavra por palavra. Ele escreveu e pediu assim. Duas
 * versões minhas foram recusadas antes: a primeira abria falando do tempo em
 * que a plataforma ficou parada, e ninguém volta empolgado para um lugar que
 * começa pedindo perdão. Quem for mexer aqui um dia: não "melhore" sozinho —
 * pergunte.
 *
 * Uma coisa que fica registrada: o texto afirma que os robôs foram "por muito
 * tempo os mais lucrativos do mercado" e estão "significativamente mais
 * assertivos". São afirmações de desempenho, e vão para uma lista grande. O
 * aviso de risco no rodapé existe justamente para acompanhá-las. Decisão do
 * Tiago, comunicada e reafirmada.
 */
export function emailDeVolta(marca: Marca, paraOEmail: string): EmailPronto {
  return montarEmail(marca, 'convite', new URL('/', marca.redirectUri).href, {
    assunto: `${marca.prosa} - Os melhores robôs voltaram`,
    titulo: `A ${marca.prosa} está de volta - Maior, melhor e mais forte!`,
    espia: `Os robôs estão de volta, revisados e atualizados. E para quem já foi cliente da ${marca.prosa}, o acesso é gratuito.`,
    corpo:
      `Estamos voltando para o mercado com novidades! Os mesmos robôs de ` +
      `operação, que por muito tempo foram os mais lucrativos do mercado, agora ` +
      `estão de volta! Todos atualizados, revisados, melhorados e ` +
      `significativamente mais assertivos!\n\n` +
      `O que não muda é o que sempre foi seu: a conta na corretora. O dinheiro ` +
      `nunca passa por nós, nem por um segundo.\n\n` +
      `**E para quem já foi nosso cliente, o acesso é gratuito.** Sem prazo, sem ` +
      `teste de alguns dias, sem cartão. Você esteve aqui quando a ${marca.prosa} ` +
      `era menor, e é justo que veja no que ela se tornou.\n\n` +
      `Entre agora no nosso canal oficial do Telegram para ter acesso às ` +
      `informações sobre a reativação do seu acesso. Todas as comunicações serão ` +
      `feitas por lá e é importante que você não perca nenhum detalhe!`,
    telegram: { url: marca.telegram, texto: 'Entrar no canal oficial' },
    descadastrar: linkDeDescadastro(marca.id, paraOEmail),
    // Sem botão da plataforma e sem tarja de recado (Tiago, 30/09/2026).
    // O convite tem um destino só, o canal: dois botões dividiriam a atenção
    // em vez de somar, e o convite para a plataforma vai ser feito por lá.
    // O risco já é avisado no rodapé de toda mensagem; repetir vira ruído.
  })
}
