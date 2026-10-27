import type { TradingAccount } from './account'
import { emailReal, marcaDaConta } from '../teeds/emailDaConta'

/**
 * Logins que operam SOMENTE em conta demo: as contas reais somem do seletor
 * e o servidor recusa (403) operacao real. Sem aviso na tela — em 10/09/2026
 * o Tiago pediu a restricao para o teeds@gmail.com (segundo login dele),
 * mas sem a frase "Este acesso opera somente em conta demo".
 *
 * Em 13/09/2026 entrou o omni@gmail.com: o mesmo tipo de acesso, do lado da
 * OMNI. A lista e por e-mail e vale nas duas marcas — nao ha nada a dizer
 * aqui sobre qual plataforma cada um usa.
 *
 * Para restringir outro acesso, basta por o e-mail aqui e reimplantar o
 * servidor (que importa este mesmo arquivo).
 */
const EMAILS_SOMENTE_DEMO: readonly string[] = ['teeds@gmail.com', 'omni@gmail.com']

/**
 * O mesmo acesso, mas só numa marca (22/10/2026). Na GlobalFly, o Tiago pediu
 * para os logins dele e dos dois Victor: lá a conta virtual aparece como
 * "Real" e o servidor recusa operação real. Na Teeds e na OMNI esses mesmos
 * e-mails continuam normais (cada marca tem a sua conta desde 20/10/2026).
 * O e-mail vai sempre sem a etiqueta +marca-.
 */
const SOMENTE_DEMO_NA_MARCA: Readonly<Record<string, readonly string[]>> = {
  globalfly: [],
}

/**
 * Rótulos trocados (27/10/2026, Tiago, para exercícios internos; o público não
 * usa estes acessos e as lives vão sair de contas novas). Os mesmos três logins
 * da GlobalFly saem do somente-demo e passam a ter as duas contas:
 *   - a virtual continua aparecendo como "Real" (como desde 22/10);
 *   - a real entra embaixo, aparecendo como "Demo".
 * Só as telas do próprio cliente trocam a etiqueta (seletor, início, perfil,
 * mini-cabine). A lógica segue a conta de verdade: operação na real é real
 * (registro, servidor, limite nunca menor que a entrada, confirmação antes de
 * ligar) e as telas do admin mostram o tipo verdadeiro.
 */
const ROTULOS_TROCADOS_NA_MARCA: Readonly<Record<string, readonly string[]>> = {
  globalfly: ['avila.victor560@gmail.com', 'victooripardo@gmail.com', 'tiagodalri1@live.com'],
}
export const rotulosTrocados = (email?: string | null, marca?: string | null) => {
  if (!email) return false
  const daConta = (marca || marcaDaConta(email)).toLowerCase()
  return ROTULOS_TROCADOS_NA_MARCA[daConta]?.includes(emailReal(email).trim().toLowerCase()) ?? false
}
/** O tipo que a tela mostra: com os rótulos trocados, demo vira real e real vira demo. */
export const tipoNaTela = (tipo: TradingAccount['type'], trocados: boolean): TradingAccount['type'] =>
  trocados ? (tipo === 'demo' ? 'real' : 'demo') : tipo

/**
 * O Sinal GF (indicador do gráfico, 23/10/2026) fica liberado por enquanto só
 * para os mesmos três logins da GlobalFly: o Tiago e os dois Victor. Para
 * abrir para todo mundo, basta trocar `sinalGFLiberado` para devolver true.
 */
const PROVAM_O_SINAL: Readonly<Record<string, readonly string[]>> = {
  globalfly: ['avila.victor560@gmail.com', 'victooripardo@gmail.com', 'tiagodalri1@live.com'],
}
export const sinalGFLiberado = (email?: string | null, marca?: string | null) => {
  if (!email) return false
  const daConta = (marca || marcaDaConta(email)).toLowerCase()
  return PROVAM_O_SINAL[daConta]?.includes(emailReal(email).trim().toLowerCase()) ?? false
}

/**
 * `marca`: a marca da conta. Sem ela, vale a etiqueta do próprio e-mail
 * (ana+marca-globalfly@... é GlobalFly; sem etiqueta é Teeds).
 */
export const emailDeDemonstracao = (email?: string | null, marca?: string | null) => {
  if (!email) return false
  const real = emailReal(email).trim().toLowerCase()
  const daConta = (marca || marcaDaConta(email)).toLowerCase()
  return EMAILS_SOMENTE_DEMO.includes(real) || (SOMENTE_DEMO_NA_MARCA[daConta]?.includes(real) ?? false)
}

/**
 * A trava vale pelo e-mail, em qualquer marca.
 *
 * Ate 13/09/2026 ela tambem exigia "admin !== false" — um jeito de nao abrir
 * brecha enquanto a permissao de administrador ainda estava sendo conferida.
 * So que administrador e por marca: o teeds@gmail.com, admin da Teeds e
 * cliente comum da OMNI, ficava preso a demo na Teeds e solto na OMNI, com a
 * conta real a vista no seletor e operacao real liberada pelo servidor.
 * Trava de protecao nao pode depender de cargo.
 */
export const acessoSomenteDemo = (email?: string | null, marca?: string | null) => emailDeDemonstracao(email, marca)

export function contasPermitidas(contas: TradingAccount[], somenteDemo: boolean) {
  return somenteDemo ? contas.filter(c => c.type === 'demo') : contas
}

export function selecionarContaPermitida(contas: TradingAccount[], id: string | null) {
  return contas.find(c => c.accountId === id) ?? contas.find(c => c.type === 'demo') ?? contas[0] ?? null
}
