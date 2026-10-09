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
 * começa pedindo perdão. Quem for mexer aqui um dia: não "melhore" sozinho,
 * pergunte.
 *
 * SEM PONTO DE EXCLAMAÇÃO, de propósito (Tiago, 30/09/2026). Fila de
 * exclamações é um dos sinais que os filtros de spam mais pesam, junto com
 * caixa alta: é o padrão do e-mail que promete demais. O texto diz a mesma
 * coisa com ponto final e chega na caixa de entrada. Sem travessão também,
 * que dá cara de texto escrito por máquina.
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
    titulo: `A ${marca.prosa} está de volta - Maior, melhor e mais forte.`,
    espia: `Os robôs estão de volta, revisados e atualizados. E para quem já foi cliente da ${marca.prosa}, o acesso é gratuito.`,
    corpo:
      `Estamos voltando para o mercado com novidades. Os mesmos robôs de ` +
      `operação, que por muito tempo foram os mais lucrativos do mercado, agora ` +
      `estão de volta. Todos atualizados, revisados, melhorados e ` +
      `significativamente mais assertivos.\n\n` +
      `O que não muda é o que sempre foi seu: a conta na corretora. O dinheiro ` +
      `nunca passa por nós, nem por um segundo.\n\n` +
      `**E para quem já foi nosso cliente, o acesso é gratuito.** Sem prazo, sem ` +
      `teste de alguns dias, sem cartão. Você esteve aqui quando a ${marca.prosa} ` +
      `era menor, e é justo que veja no que ela se tornou.\n\n` +
      `Entre agora no nosso canal oficial do Telegram para ter acesso às ` +
      `informações sobre a reativação do seu acesso. Todas as comunicações serão ` +
      `feitas por lá e é importante que você não perca nenhum detalhe.`,
    telegram: { url: marca.telegram, texto: 'Entrar no canal oficial' },
    descadastrar: linkDeDescadastro(marca.id, paraOEmail),
    // Sem botão da plataforma e sem tarja de recado (Tiago, 30/09/2026).
    // O convite tem um destino só, o canal: dois botões dividiriam a atenção
    // em vez de somar, e o convite para a plataforma vai ser feito por lá.
    // O risco já é avisado no rodapé de toda mensagem; repetir vira ruído.
  })
}

/**
 * Repescagem do cadastro (07/10/2026): para quem recebeu o convite, entrou no
 * canal, e ainda não se cadastrou na plataforma.
 *
 * Diferente do convite, este tem UM destino: o site. O link já vai direto
 * para a tela de entrada, e o texto ensina a fazer o cadastro ali mesmo,
 * passo a passo, porque a dúvida que mais chega no canal é "onde eu clico".
 * Sem botão do Telegram de propósito: quem está lendo isto já está no canal.
 *
 * Mesma regra do convite: sem exclamação, sem caixa alta, sem travessão.
 */
export function emailDeRepescagem(marca: Marca, paraOEmail: string): EmailPronto {
  const destino = new URL('/cadastre-se', marca.redirectUri)
  destino.searchParams.set('utm_source', 'email')
  destino.searchParams.set('utm_campaign', 'cadastro')
  return montarEmail(marca, 'convite', destino.href, {
    // Assunto escolhido pelo Tiago (07/10/2026): nome de pessoa abre mais que
    // nome de empresa, e para quem abriu ou clicou e não terminou é verdade.
    assunto: `Tiago Dal Ri aqui, da ${marca.prosa}.`,
    titulo: `O seu acesso à nova ${marca.prosa} ainda está esperando por você.`,
    espia: `Vi que você não terminou o cadastro. Te explico onde clicar, passo a passo.`,
    corpo:
      `A nova plataforma da ${marca.prosa} está no ar e os robôs já estão operando ` +
      `para quem entrou. Vimos que o seu cadastro ainda não chegou, e este e-mail ` +
      `é só para facilitar: o link abaixo leva direto para a tela de entrada.\n\n` +
      `**O cadastro é gratuito e leva menos de um minuto.** Se você já foi cliente ` +
      `da ${marca.prosa}, mesmo assim é preciso recadastrar para reativar o seu ` +
      `acesso. Se nunca foi, o caminho é o mesmo.\n\n` +
      `**Como fazer**\n\n` +
      `1. Toque no botão abaixo para abrir a tela de entrada.\n` +
      `2. Toque no botão dourado "Cadastre-se", logo abaixo de "Entrar".\n` +
      `3. Preencha o nome completo como está no documento, o e-mail que você abre todo dia e o telefone com DDD.\n` +
      `4. Toque em "Confirmar Cadastro".\n\n` +
      `Pronto. O cadastro entra na fila de aprovação, que normalmente é rápida.\n\n` +
      `**O que chega por e-mail**\n\n` +
      `Em menos de um minuto você recebe "Cadastro recebido", com o seu e-mail e ` +
      `uma senha provisória. Com ela você já consegue entrar, e vai ver um aviso ` +
      `de cadastro em análise. É normal, é só aguardar. Quando a equipe liberar, ` +
      `chega "Cadastro aprovado", e no primeiro acesso você cria a sua própria senha.\n\n` +
      `Se não encontrar as mensagens, olhe o spam e o lixo eletrônico. Encontrou ` +
      `por lá, marque como "não é spam" para as próximas chegarem direto.`,
    botao: 'Fazer meu cadastro',
    descadastrar: linkDeDescadastro(marca.id, paraOEmail),
  })
}

/**
 * Acesso gratuito (09/10/2026, rascunho para o Tiago aprovar): para os que
 * receberam dois ou três e-mails e não abriram nenhum.
 *
 * Diferente da repescagem: curto, um argumento só (o acesso é gratuito
 * porque a pessoa já foi cliente) e um passo só. Quem ignorou e-mails longos
 * não vai ler mais um longo. O passo a passo do cadastro sai daqui: a própria
 * tela de entrada já guia, e o e-mail só precisa levar a pessoa até ela.
 *
 * "Reservado", e não "liberado": a pessoa ainda precisa se cadastrar. Quem
 * abre achando que já pode entrar e descobre que não, marca como spam, e
 * esse grupo é o mais frio da base.
 */
export function emailDeAcessoGratuito(marca: Marca, paraOEmail: string): EmailPronto {
  const destino = new URL('/cadastre-se', marca.redirectUri)
  destino.searchParams.set('utm_source', 'email')
  destino.searchParams.set('utm_campaign', 'acesso-gratuito')
  return montarEmail(marca, 'convite', destino.href, {
    assunto: `Parabéns - Seu acesso gratuito foi reservado`,
    titulo: `Seu acesso gratuito à ${marca.prosa} foi reservado.`,
    espia: `Você já foi cliente, então o seu acesso à nova ${marca.prosa} é gratuito. Falta um minuto para ativar.`,
    corpo:
      `Você já foi cliente da ${marca.prosa}, e por isso o seu acesso à nova ` +
      `plataforma é gratuito. **Sem prazo, sem cartão, sem pegadinha.**\n\n` +
      // Números de 03 a 09/10/2026, todas as sessões encerradas da Teeds
      // (demo e real): 103 sessões, 15.695 operações, 74,9% positivas; o
      // segundo mais usado teve 3.978. Conferir antes de reaproveitar.
      `E você chega numa boa semana. O **Teeds Göreme** virou o grande destaque ` +
      `da plataforma: foi o robô mais usado dos últimos 7 dias, com mais de 15 mil ` +
      `operações, e 3 em cada 4 delas positivas.\n\n` +
      `Os robôs já estão operando para quem entrou. Para ativar o seu acesso, ` +
      `é só fazer o cadastro. Leva menos de um minuto:\n\n` +
      // Desde o /cadastre-se (09/10/2026) o botão abre DIRETO no formulário,
      // e o texto pode dizer isso sem rodeio: era onde as pessoas se perdiam.
      `1. Toque no botão abaixo. Ele já abre a página de cadastro.\n` +
      `2. Preencha seu nome completo, seu e-mail e seu telefone com DDD.\n` +
      `3. Toque em "Confirmar Cadastro".\n\n` +
      `Pronto. Em menos de um minuto chega no seu e-mail a sua senha provisória, ` +
      `e você já consegue entrar na plataforma.`,
    botao: 'Fazer meu cadastro gratuito',
    descadastrar: linkDeDescadastro(marca.id, paraOEmail),
  })
}
