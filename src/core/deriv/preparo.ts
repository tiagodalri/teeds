/**
 * O preparo de uma sessão: as perguntas da tela e a configuração que sai delas.
 *
 * ESTA LÓGICA NÃO MORA MAIS DENTRO DO COMPONENTE, e o motivo é prático. Em
 * 05/10/2026 um teste do servidor passou a importar `configurarPreparo` do
 * `RobotSetup.tsx` — o caminho certo a testar, já que é a função que a tela
 * chama no play. Só que importar um `.tsx` arrasta o React junto, e o
 * servidor não tem React instalado: o `npm run build` dele quebrou, e com
 * ele o `atualizar.sh`. O erro só apareceu no deploy seguinte, porque na
 * máquina de desenvolvimento o React resolve pela pasta da raiz.
 *
 * Então o que é lógica pura fica aqui, onde os dois lados alcançam sem
 * carregar uma biblioteca de interface: a tela importa para desenhar, o
 * teste do servidor importa para provar que o modo escolhido chega ao motor.
 */
import type { ConfigEstrategia } from './engine'
import { NOME_DO_MODO, recuperacaoDoRobo, temModos, type Modo } from './strategies'
import type { ParametrosDoRobo } from './parametros'

/** As perguntas do preparo, na ordem em que a tela faz. */
export const ETAPAS_PREPARO = [
  { key: 'valorAoVencer', titulo: 'Qual o valor de cada entrada?', ajuda: 'É a entrada base. A recuperação do modelo pode aumentar as entradas seguintes.', min: .35, max: 10_000, atalhos: [.35, 1, 2, 5] },
  { key: 'takeProfit', titulo: 'Qual é a meta de ganho?', ajuda: 'O robô para quando o resultado da sessão atingir esta meta. Zero desativa este limite.', min: 0, max: 10_000, atalhos: [5, 10, 25, 50] },
  { key: 'stopLoss', titulo: 'Qual é o limite de perda?', ajuda: 'O motor também verifica a próxima entrada: pode parar antes do limite para não ultrapassá-lo. Zero desativa este freio.', min: 0, max: 10_000, atalhos: [5, 10, 25, 50] },
  { key: 'maxOperacoes', titulo: 'Quantas operações no máximo?', ajuda: 'A sessão termina ao atingir essa quantidade ou um dos limites anteriores. Zero deixa a quantidade sem limite.', min: 0, max: 5_000, atalhos: [0, 50, 100, 200] },
] as const

export function valorDePreparo(texto: string, min: number, max: number, inteiro = false): number | null {
  if (!texto.trim() || !/^\d+(?:[.,]\d{0,2})?$/.test(texto.trim())) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) && n >= min && n <= max && (!inteiro || Number.isInteger(n)) ? n : null
}

/** Os dois botões do passo de modo. */
export const OPCOES_DE_MODO: Array<{ id: Modo; nome: string; frase: string }> = [
  { id: 'conservador', nome: `Modo ${NOME_DO_MODO.conservador}`, frase: 'Recuperação de sempre: a sequência fecha recuperando as perdas.' },
  { id: 'agressivo', nome: `Modo ${NOME_DO_MODO.agressivo}`, frase: 'Recuperação maior: quanto mais fundo a sequência for, mais lucro ela devolve ao fechar.' },
]

/**
 * `parametros` são os publicados pelo painel para este robô (quando o
 * catálogo já carregou): a recuperação e o passo Modo saem deles. Não vão
 * dentro da config — o servidor é quem grava os vigentes por cima.
 */
export function configurarPreparo(inicial: ConfigEstrategia, valores: Record<string, string>, modeloId: string, modo: Modo = 'conservador', parametros?: ParametrosDoRobo): ConfigEstrategia | null {
  if (!ETAPAS_PREPARO.every(e => valorDePreparo(valores[e.key] ?? '', e.min, e.max, e.key === 'maxOperacoes') !== null)) return null
  // O modo já aparado: robô que não oferece o agressivo cai para o conservador
  // aqui, antes de virar número.
  const escolhido: Modo = temModos(modeloId, parametros) ? modo : 'conservador'
  const rec = recuperacaoDoRobo(modeloId, escolhido, parametros)
  const cfg = { ...inicial, ...Object.fromEntries(ETAPAS_PREPARO.map(e => [e.key, valorDePreparo(valores[e.key], e.min, e.max, e.key === 'maxOperacoes')!])) } as ConfigEstrategia
  /*
    `modo` vai junto, e não é enfeite: é a única coisa daqui que sobrevive ao
    servidor. Por segurança, `aplicarVigente` descarta a recuperação que o
    navegador mandou e recalcula tudo pelo painel — e, para saber em qual modo
    recalcular, lê `p.modo ?? p.config?.modo ?? 'conservador'`. A tela não
    mandava nenhum dos dois, então toda sessão ligada por aqui caía no
    conservador: a pessoa escolhia Agressivo, a tela mostrava Agressivo (ela lê
    a config local, que está certa) e o motor subia a escada conservadora.
    Flagrado em 05/10/2026 com dois Göreme lado a lado — escadas idênticas,
    0,57 e 0,87 nos dois, quando a agressiva seria 1,09 e 1,66.
  */
  return { ...cfg, valorInicial: cfg.valorAoVencer, valorMaximo: 0, fatorGale: rec.margem, lucroSobrePrejuizo: rec.sobrePrejuizo, galeApos: rec.galeApos, modo: escolhido }
}
