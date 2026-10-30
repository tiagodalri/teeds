/**
 * Lançamento da GlobalFly (30/10/2026, Tiago e Naor): o cadastro vira a conta
 * e a live libera o acesso. Até o fim da live, quem ainda não foi liberado vê
 * a tela de Pré-acesso (contagem, avisos, app, agenda, comunidade) no lugar de
 * "cadastro em análise". Depois do fim, volta a tela de espera de sempre.
 */
import { MARCA } from '../../marca'

/** Segunda, 9/11/2026, 20h de Brasília (23h UTC). */
export const INICIO_DA_LIVE = Date.UTC(2026, 10, 9, 23, 0, 0)
/** Margem de 3 horas para a live terminar e a liberação acontecer. */
export const FIM_DA_LIVE = INICIO_DA_LIVE + 3 * 36e5

export const AGENDA_DA_LIVE = {
  google: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Live%20de%20lan%C3%A7amento%20da%20GlobalFly%20Trade&dates=20261109T230000Z/20261110T010000Z&details=Assista%20do%20in%C3%ADcio%20ao%20fim%20para%20liberar%20o%20seu%20acesso.%20A%20live%20passa%20dentro%20da%20GlobalFly%3A%20https%3A%2F%2Fglobalflytrade.com',
  // o mesmo arquivo da página de cadastro (captura-globalfly/live-globalfly.ics)
  arquivo: '/cadastro/live-globalfly.ics',
}

/** A tela de Pré-acesso vale só na GlobalFly e só até o fim da live. */
export function emPreAcesso(agora = Date.now()): boolean {
  return MARCA.id === 'globalfly' && agora < FIM_DA_LIVE
}
