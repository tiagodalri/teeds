import { MARCA } from '../../marca'
import { nomeDaEstrategia } from '../deriv/branding'
import type { Modulo } from './aulas'

/* Pedido de 16/10/2026: a vitrine da GlobalFly já aparece, com as capas.
   Aula sem vídeo mostra "Em breve" e abre os detalhes; nenhum vídeo de
   demonstração de outra marca entra aqui. */
export const SALA_EM_BREVE = false
export const DEMONSTRACAO_EM_AULA_SEM_VIDEO = false

/**
 * O treinamento da GlobalFly Trade (16/10/2026).
 *
 * A ordem combinada com o Tiago: visão geral da plataforma, conta na Deriv,
 * primeiro depósito, primeiro saque, uma aula por robô e, por fim, o
 * gerenciamento operacional. Os títulos podem ser trocados pelo painel de
 * aulas (admin) sem mexer aqui; as capas ficam em public/aulas-globalfly/,
 * com o mesmo nome do id de cada aula.
 *
 * Os robôs saem de MARCA.robos: trocou a vitrine, as aulas acompanham.
 */
const DESCRICAO_DO_ROBO: Record<string, string> = {
  goreme: 'Como ele decide a entrada, quando recupera e como configurar meta e limite antes de ligar.',
  superior5: 'A leitura dos dígitos altos, a configuração passo a passo e o que acompanhar na cabine.',
  ag2: 'A estratégia dos dígitos baixos, a configuração passo a passo e o que acompanhar na cabine.',
  firstblock: 'A lógica da primeira metade dos dígitos, a configuração e os pontos de atenção.',
  secondblock: 'A lógica da segunda metade dos dígitos, a configuração e os pontos de atenção.',
  thepalm: 'Como ele se adapta ao mercado, a configuração e o que observar durante a sessão.',
}

export const MODULOS: Modulo[] = [
  {
    id: 'comeco',
    titulo: 'Comece por aqui',
    chamada: 'Da plataforma aberta ao primeiro saque.',
    cor: '#B78D39',
    aulas: [
      {
        id: 'visao-geral',
        titulo: `Visão geral da ${MARCA.prosa}`,
        descricao: 'O que significa cada aba e cada botão da plataforma, e como navegar por ela.',
        video: '', duracao: '',
      },
      {
        id: 'conta-deriv',
        titulo: 'Abrindo sua conta na Deriv',
        descricao: 'O cadastro na corretora, passo a passo, e como conectar a conta à plataforma.',
        video: '', duracao: '',
      },
      {
        id: 'primeiro-deposito',
        titulo: 'Fazendo seu primeiro depósito',
        descricao: 'Como colocar dinheiro na sua conta da corretora, com as opções disponíveis no Brasil.',
        video: '', duracao: '',
      },
      {
        id: 'primeiro-saque',
        titulo: 'Fazendo seu primeiro saque',
        descricao: 'Como tirar o seu dinheiro da corretora: o caminho, os prazos e os limites.',
        video: '', duracao: '',
      },
    ],
  },
  {
    id: 'robos',
    titulo: 'Os robôs',
    chamada: 'Uma aula para cada estratégia da plataforma.',
    cor: '#9CB1C7',
    aulas: MARCA.robos.map((id) => ({
      id: `robo-${(MARCA.nomesDosRobos?.[id] ?? id).replace(/^GlobalFly\s+/i, '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}`,
      titulo: nomeDaEstrategia(id),
      descricao: DESCRICAO_DO_ROBO[id] ?? 'Como a estratégia funciona, a configuração passo a passo e o que acompanhar.',
      video: '', duracao: '',
    })),
  },
  {
    id: 'gestao',
    titulo: 'Gestão',
    chamada: 'O que separa uma sessão boa de um mês consistente.',
    cor: '#29445F',
    aulas: [
      {
        id: 'gerenciamento',
        titulo: 'Gerenciamento operacional',
        descricao: 'Como definir meta, limite de perda e tamanho da entrada, e como montar o seu plano de gestão.',
        video: '', duracao: '',
      },
    ],
  },
]
