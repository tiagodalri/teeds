import { MARCA } from '../../marca'
import type { Aula, Modulo } from './aulas'

/* Pedido de 16/10/2026: a vitrine da GlobalFly já aparece, com as capas.
   23/10/2026 (Tiago): enquanto os vídeos certos não chegam, toda aula abre
   com um vídeo de exemplo em MP4 (o trailer aberto do Sintel, da Blender,
   sem marca nenhuma) e um material de exemplo, para ver o player, os
   downloads e o controle de quem assistiu funcionando. Quando o vídeo de
   verdade é publicado no painel, ele toma o lugar do exemplo. */
export const SALA_EM_BREVE = false
export const DEMONSTRACAO_EM_AULA_SEM_VIDEO = true
export const VIDEOS_DE_EXEMPLO: string[] = ['https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4']
export const MATERIAIS_DE_EXEMPLO: Array<{ nome: string; url: string; tipo?: string; tamanho?: number }> = [
  { nome: 'Material de apoio da aula (exemplo)', url: `${import.meta.env.BASE_URL}aulas-globalfly/material-de-exemplo.pdf`, tipo: 'PDF' },
]

/**
 * O treinamento da GlobalFly Trade: a grade final do Tiago (19/10/2026),
 * 3 módulos e 19 aulas, nesta ordem.
 *
 * Os vídeos entram pelo painel de aulas (admin), aula por aula, sem mexer
 * aqui: o painel grava por cima pelo `id`. Por isso o id nunca muda depois
 * que a aula tiver vídeo. As capas ficam em public/aulas-globalfly/, com o
 * mesmo nome do id (.jpg, .webp e -mobile.webp).
 */
const aula = (id: string, titulo: string, descricao: string): Aula => ({ id, titulo, descricao, video: '', duracao: '' })

export const MODULOS: Modulo[] = [
  {
    id: 'comeco',
    titulo: 'Comece aqui',
    chamada: 'Da conta aberta à primeira operação, com segurança.',
    cor: '#B78D39',
    aulas: [
      aula('introducao', `Introdução à ${MARCA.prosa}`, 'Quem está por trás da plataforma, o que você vai encontrar aqui e como aproveitar o treinamento do começo ao fim.'),
      aula('visao-geral', 'Conhecendo a Plataforma e suas funcionalidades', 'Cada aba, cada botão e cada tela: onde ficam os robôs, o gráfico, o histórico e as configurações.'),
      aula('conta-deriv', 'Abertura de conta', 'O cadastro na corretora passo a passo e como conectar a sua conta à plataforma.'),
      aula('primeiro-deposito', 'Como depositar?', 'As formas de colocar saldo na sua conta da corretora, com as opções disponíveis no Brasil.'),
      aula('saldo-demo-real', 'Saldo DEMO e saldo REAL', 'A diferença entre as duas contas, quando usar cada uma e como trocar entre elas sem erro.'),
      aula('documentos', 'Como enviar suas documentações?', 'Quais documentos a corretora pede, como enviar e o que fazer se a verificação não for aprovada de primeira.'),
      aula('autenticador', 'Ativando o autenticador de 2 passos', 'Uma camada a mais de proteção na sua conta: como ativar, qual aplicativo usar e como guardar os códigos.'),
      aula('deriv-confiavel', 'Corretora Deriv é confiável?', 'Há quanto tempo ela opera, como funciona a regulação e o que observar antes de depositar.'),
    ],
  },
  {
    id: 'estrategias',
    titulo: 'Estratégias de I.A. na prática',
    chamada: 'Uma aula para cada estratégia, e depois a operação de verdade.',
    cor: '#9CB1C7',
    aulas: [
      aula('o-que-sao-as-ias', 'O que são essas I.A. de operações e como funcionam?', 'O que cada estratégia automática faz por você, como decide a entrada e o que continua nas suas mãos.'),
      aula('robo-raptor', 'Como funciona a estratégia RAPTOR?', 'Os dígitos em que ela entra, como recupera uma perda e como configurar meta e limite antes de ligar.'),
      aula('robo-gulf', 'Como funciona a estratégia GULF?', 'A leitura dos dígitos altos, quando ela entra e o que acompanhar durante a sessão.'),
      aula('robo-falcon', 'Como funciona a estratégia FALCON?', 'Os dígitos de 0 a 5, a entrada direta, a recuperação e como configurar antes de ligar.'),
      aula('robo-legacy', 'Como funciona a estratégia LEGACY?', 'Os dígitos de 4 a 9, a entrada direta, a recuperação e como configurar antes de ligar.'),
      aula('robo-phenom', 'Como funciona a estratégia PHENOM?', 'A estratégia dos dígitos baixos, quando ela entra e o que acompanhar durante a sessão.'),
      aula('operando-na-pratica', 'Operando na prática', 'Uma sessão do começo ao fim: escolher a estratégia, definir valores, acompanhar e encerrar.'),
      aula('dicas', 'Dicas e orientações', 'Os cuidados que fazem diferença no dia a dia e os erros mais comuns de quem está começando.'),
    ],
  },
  {
    id: 'gestao',
    titulo: 'Gerenciamento e Emocional',
    chamada: 'O que separa uma sessão boa de um mês consistente.',
    cor: '#29445F',
    aulas: [
      aula('gerenciamento', 'O que é Gerenciamento de Risco?', 'Por que o tamanho da entrada, a meta e o limite de perda importam mais do que a estratégia escolhida.'),
      aula('gestao-na-pratica', 'Como fazer gestão na prática?', 'Como montar o seu plano: valor por entrada, meta do dia, limite de perda e quando parar.'),
      aula('planilha', 'Como usar a planilha de Gerenciamento?', 'O passo a passo da planilha: preencher a banca, acompanhar cada dia e ajustar o plano.'),
    ],
  },
]
