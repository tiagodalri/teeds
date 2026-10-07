/**
 * O desktop não muda um pixel com a revisão de celular.
 *
 * Toda a revisão de celular (ondas 1 e 2, 06–07/10/2026) mora em
 * `src/styles/mobile-polish.css`. A promessa feita ao Tiago foi "no desktop
 * não vai alterar nada" — e esta prova é o que segura a promessa quando
 * alguém acrescentar uma regra ali com pressa: NENHUMA regra desse arquivo
 * pode existir fora de um bloco `@media` com `max-width` (ou de movimento
 * reduzido, que também é escolha do aparelho). Uma regra solta valeria no
 * desktop, calada.
 *
 * E o piso da onda 2, medido a 375px: os alvos de toque das telas que o
 * cliente usa têm de pedir 44px, e nenhum texto de cliente pode ficar
 * abaixo de 11px.
 *
 *   npm run celular
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let passou = 0, falhou = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  const ok = JSON.stringify(deu) === JSON.stringify(esperado)
  ok ? passou++ : falhou++
  console.log(`${ok ? '  ok  ' : ' FALHA'}  ${nome}${ok ? '' : `\n        esperava ${JSON.stringify(esperado)}, deu ${JSON.stringify(deu)}`}`)
}

const RAIZ = join(import.meta.dirname, '../..')
const css = readFileSync(join(RAIZ, 'src/styles/mobile-polish.css'), 'utf8')
const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '')

console.log('\nCELULAR · O DESKTOP NÃO MUDA\n')

/* -------------------------- nada fora de um @media do aparelho */

// Caminha pelo arquivo contando chaves. Fora de qualquer bloco, só pode haver
// `@media (...) {` — qualquer outra abertura de bloco é regra solta.
let nivel = 0, soltas: string[] = [], mediasRuins: string[] = []
const re = /@media[^{]*\{|\{|\}/g
let m: RegExpExecArray | null
while ((m = re.exec(semComentarios))) {
  const t = m[0]
  if (t === '}') { nivel--; continue }
  if (t.startsWith('@media')) {
    if (nivel === 0 && !/max-width|prefers-reduced-motion/.test(t)) mediasRuins.push(t.trim())
    nivel++; continue
  }
  if (nivel === 0) {
    const inicio = semComentarios.lastIndexOf('\n', m.index) + 1
    soltas.push(semComentarios.slice(inicio, m.index).trim())
  }
  nivel++
}
/*
  HERANÇA: sete regras do player de aulas já viviam fora de @media antes da
  revisão de celular (play grande, tela cheia, erro em tela cheia). Elas valem
  no desktop hoje, e embrulhá-las num @media seria MUDAR o desktop — o
  contrário da promessa. Ficam listadas aqui para que a prova acuse qualquer
  regra solta NOVA, sem acusar o que já existia.
*/
const HERANCA = new Set([
  '.cine-player .cine-play-grande', '.cine-player .cine-play-grande svg',
  '.aulas .aula-play', '.aulas .aula-play::before', '.cine-erro-cheia',
  '.cine-player:fullscreen', '.cine-player:fullscreen video',
])
conferir('nenhuma regra NOVA fora de um @media', soltas.filter((s) => !HERANCA.has(s)), [])
conferir('e a herança continua exatamente a mesma (nem mais, nem menos)',
  soltas.filter((s) => HERANCA.has(s)).length, HERANCA.size)
conferir('todo @media de topo é do aparelho (max-width ou movimento reduzido)', mediasRuins, [])
conferir('as chaves fecham (arquivo íntegro)', nivel, 0)

/* ---------------------------------------- o piso da onda 2, a 375px */

const onda2 = semComentarios.slice(semComentarios.lastIndexOf('@media (max-width: 760px)'))
for (const [nome, seletor] of [
  ['Conectar Deriv do cabeçalho', '.topbar .btn-deriv { height: 44px; }'],
  ['botão de tema', '.topbar .tema-btn { width: 44px; height: 44px; }'],
  ['avatar', '.topbar .avatar-botao { height: 44px; }'],
  ['timeframes do gráfico', '.layout-operar .controls .segmented button { min-height: 44px; min-width: 44px; }'],
  ['indicadores', '.indicadores button { min-height: 44px; font-size: 12px;'],
  ['ferramentas do gráfico', '.chart-ferramentas button { width: 44px; height: 44px; }'],
  ['Subir/Descer · Dígitos', '.modo-troca button { min-height: 44px; }'],
  ['valores rápidos', '.trade-atalhos button { min-height: 44px; }'],
  ['barra de posições', '.pos-flutuante-topo { min-height: 44px; }'],
  ['ticks/seg/min', '.segmented.mini button { min-height: 44px; min-width: 44px; font-size: 12px; }'],
  ['tipos de dígito', '.dig-tipos button { min-height: 44px; }'],
  ['teclado 0–9 em cinco colunas', '.dig-escolha, .dig-ticks { grid-template-columns: repeat(5, 1fr);'],
  ['teclado 0–9 com 44px', '.dig-escolha button, .dig-ticks button { min-height: 44px; }'],
  ['botão de comprar no modo Dígitos', '.btn-dig { min-height: 44px; }'],
  ['"Ampliar dígitos" da cabine', '.tv-analise-legenda button { min-height: 44px; }'],
  ['fechar do preparo', '.robot-launch .robot-launch-top .robot-launch-close { width: 44px; height: 44px; }'],
  ['"Editar" da revisão do preparo', '.robot-launch dd button { min-width: 44px; min-height: 44px; }'],
  ['busca de robô', '.robot-picker-list input { min-height: 44px; }'],
  ['campos numéricos do preparo', '.robot-launch-number input { min-height: 44px; }'],
  ['fechar do acesso restrito', '.beta-fechar { width: 44px; height: 44px; }'],
  ['fechar de Minha conta', '.qz-fechar { min-width: 44px; min-height: 44px;'],
  ['botões de Minha conta', '.perfil-btn { min-height: 44px; }'],
] as Array<[string, string]>) {
  conferir(`alvo de toque: ${nome}`, onda2.includes(seletor), true)
}
for (const [nome, seletor] of [
  ['"Indicadores"', '.indicadores > span { font-size: 11px; }'],
  ['fita de dígitos', '.fita-d { font-size: 11px; }'],
  ['rótulos da cabine', '.tv-abas span, .tv-analise-rot { font-size: 11px; }'],
  ['selo "acesso restrito"', '.beta-selo { font-size: 11px;'],
  ['rótulo do código', '.beta-modal label { font-size: 11px; }'],
  ['nota do acesso restrito', '.beta-nota { font-size: 11px; }'],
] as Array<[string, string]>) {
  conferir(`texto no piso de 11px: ${nome}`, onda2.includes(seletor), true)
}

// Nenhum texto de cliente pode ser rebaixado abaixo do piso por este arquivo.
const abaixoDoPiso = [...semComentarios.matchAll(/font-size:\s*([\d.]+)px/g)]
  .map((x) => parseFloat(x[1])).filter((v) => v < 10)
conferir('o próprio arquivo não escreve fonte abaixo de 10px', abaixoDoPiso, [])

console.log(`\n${passou} certos, ${falhou} errados`)
process.exit(falhou ? 1 : 0)
