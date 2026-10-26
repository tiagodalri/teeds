/**
 * GlobalFly: a palavra "robô" não aparece na tela (26/10/2026, Tiago: "evite
 * sempre a palavra Robôs, vamos trocar tudo por I.A."). O menu já tinha virado
 * "I.A." em 19/10; agora vale para todo texto, inclusive o que vem do banco
 * (nomes de produto, avisos, aulas).
 *
 * As telas são as mesmas das outras marcas, então a troca é feita no texto já
 * desenhado, com a concordância: robô é masculino e I.A. é feminina ("o robô
 * ligado" vira "a I.A. ligada", "seus robôs" vira "suas I.A."). I.A. não muda
 * no plural ("as I.A.").
 *
 * Puro em `paraIA` (dá para testar sem tela); `ligarVocabularioIA` cuida da página.
 */

const ROBO = '[Rr]ob[ôo]s?|ROB[ÔO]S?'
// o que vem antes de robô e muda de gênero (singular | plural)
const ANTES: Array<[string, string, string, string]> = [
  // [masculino singular, feminino singular, masculino plural, feminino plural]
  ['o', 'a', 'os', 'as'], ['do', 'da', 'dos', 'das'], ['no', 'na', 'nos', 'nas'], ['ao', 'à', 'aos', 'às'],
  ['pelo', 'pela', 'pelos', 'pelas'], ['um', 'uma', 'uns', 'umas'], ['dum', 'duma', 'duns', 'dumas'], ['num', 'numa', 'nuns', 'numas'],
  ['seu', 'sua', 'seus', 'suas'], ['meu', 'minha', 'meus', 'minhas'], ['teu', 'tua', 'teus', 'tuas'], ['nosso', 'nossa', 'nossos', 'nossas'],
  ['este', 'esta', 'estes', 'estas'], ['esse', 'essa', 'esses', 'essas'], ['aquele', 'aquela', 'aqueles', 'aquelas'],
  ['deste', 'desta', 'destes', 'destas'], ['desse', 'dessa', 'desses', 'dessas'], ['neste', 'nesta', 'nestes', 'nestas'], ['nesse', 'nessa', 'nesses', 'nessas'],
  ['novo', 'nova', 'novos', 'novas'], ['outro', 'outra', 'outros', 'outras'], ['primeiro', 'primeira', 'primeiros', 'primeiras'],
  ['mesmo', 'mesma', 'mesmos', 'mesmas'], ['próprio', 'própria', 'próprios', 'próprias'], ['nenhum', 'nenhuma', 'nenhuns', 'nenhumas'],
  ['algum', 'alguma', 'alguns', 'algumas'], ['todo', 'toda', 'todos', 'todas'], ['quantos', 'quantas', 'quantos', 'quantas'],
  ['vários', 'várias', 'vários', 'várias'], ['poucos', 'poucas', 'poucos', 'poucas'], ['muitos', 'muitas', 'muitos', 'muitas'],
]
// o que vem depois de robô e concorda com ele
const DEPOIS = [
  'ligado', 'desligado', 'parado', 'pausado', 'pronto', 'escolhido', 'selecionado', 'conectado', 'publicado', 'criado', 'salvo',
  'configurado', 'ativo', 'inativo', 'liberado', 'bloqueado', 'novo', 'próprio', 'certo', 'preferido', 'favorito', 'usado', 'comprado',
  'contratado', 'incluído', 'encerrado', 'finalizado', 'iniciado', 'montado', 'testado', 'simulado', 'guardado', 'apagado', 'removido',
  'adicionado', 'desativado', 'ativado', 'exclusivo', 'automático', 'treinado', 'sozinho', 'feito', 'mostrado', 'pago', 'liberado',
  'encontrado', 'simultâneo', 'disponível', 'nenhum', 'seu', 'meu', 'preparado', 'programado', 'reiniciado', 'religado', 'interrompido',
]

const mapaAntes = new Map<string, string>()
for (const [ms, fs, mp, fp] of ANTES) { mapaAntes.set(ms, fs); mapaAntes.set(mp, fp) }
const palavrasAntes = [...mapaAntes.keys()].sort((a, b) => b.length - a.length).join('|')
const palavrasDepois = [...new Set(DEPOIS)].sort((a, b) => b.length - a.length).join('|')
const L = 'A-Za-zÀ-ÖØ-öø-ÿ'

// "todos os robôs" e "todas as" vêm primeiro: o determinante dobra
const reTodos = new RegExp(`(?<![${L}])(todos|Todos|TODOS)(\\s+)(os|OS)(\\s+)(${ROBO})(?![${L}])`, 'g')
const reAntes = new RegExp(`(?<![${L}])(${palavrasAntes})(\\s+)(${ROBO})(?![${L}])`, 'gi')
const AUXILIARES = 'a|não|já|foi|foram|for|forem|está|estão|estiver|estava|é|são|será|serão|fica|ficou|ficam|ficar|continua|continuam|segue|seguem|volta|voltam|vai|vão|operar|opera|para|parou|ainda|agora|sempre|ser|estar|ficará'
const reDepois = new RegExp(`(I\\.A\\.)((?:\\s+(?:${AUXILIARES})){0,3}\\s+)((?:${palavrasDepois})s?)(?![${L}])`, 'gi')
// dois determinantes seguidos: "seu primeiro robô" vira "seu primeira I.A." na 1ª passada; aqui o primeiro concorda
const femininos = [...new Set(ANTES.flatMap(([, fs, , fp]) => [fs, fp]))].sort((a, b) => b.length - a.length).join('|')
const reDupla = new RegExp(`(?<![${L}])(${palavrasAntes})(\\s+)(${femininos})(\\s+)(I\\.A\\.)`, 'gi')
const reSolto = new RegExp(`(?<![${L}])(${ROBO})(?![${L}])`, 'g')
const temRobo = /rob[ôo]/i

const comCaixa = (modelo: string, palavra: string) =>
  modelo === modelo.toUpperCase() && modelo !== modelo.toLowerCase() ? palavra.toUpperCase()
    : modelo[0] === modelo[0].toUpperCase() && modelo[0] !== modelo[0].toLowerCase() ? palavra[0].toUpperCase() + palavra.slice(1) : palavra
const feminino = (p: string) => {
  const base = p.toLowerCase()
  if (base === 'nenhum') return comCaixa(p, 'nenhuma')
  if (base === 'seu' || base === 'meu') return comCaixa(p, base === 'seu' ? 'sua' : 'minha')
  if (base === 'seus' || base === 'meus') return comCaixa(p, base === 'seus' ? 'suas' : 'minhas')
  if (base.endsWith('os')) return comCaixa(p, base.slice(0, -2) + 'as')
  if (base.endsWith('o')) return comCaixa(p, base.slice(0, -1) + 'a')
  return p
}

/** O texto com "robô" trocado por "I.A.", já com a concordância. */
export function paraIA(texto: string): string {
  if (!temRobo.test(texto)) return texto
  let t = texto.replace(reTodos, (_, todos, e1, _os, e2) => `${comCaixa(todos, 'todas')}${e1}${comCaixa(_os, 'as')}${e2}I.A.`)
  t = t.replace(reAntes, (m, antes: string, espaco: string) => {
    const f = mapaAntes.get(antes.toLowerCase())
    return f ? `${comCaixa(antes, f)}${espaco}I.A.` : m
  })
  t = t.replace(reSolto, 'I.A.')
  t = t.replace(reDupla, (m, antes: string, e1: string, fem: string, e2: string) => {
    const f = mapaAntes.get(antes.toLowerCase())
    return f ? `${comCaixa(antes, f)}${e1}${fem}${e2}I.A.` : m
  })
  // a I.A. "ligado" → "ligada" (só nas palavras da lista, logo depois de I.A.)
  t = t.replace(reDepois, (_, ia, meio, adj: string) => `${ia}${meio}${feminino(adj)}`)
  // "I.A.." no fim de frase: o ponto da sigla já fecha a frase
  return t.replace(/I\.A\.\./g, 'I.A.')
}

/* ------------------------------------------------------------------ a página */

const ATRIBUTOS = ['title', 'aria-label', 'placeholder', 'alt', 'aria-description']
const PULAR = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'NOSCRIPT'])

function pulaNo(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (PULAR.has(e.tagName) || (e as HTMLElement).isContentEditable || e.hasAttribute('data-sem-vocabulario')) return true
  }
  return false
}

function trocarTexto(n: Text) {
  const v = n.nodeValue
  if (!v || !temRobo.test(v) || pulaNo(n.parentElement)) return
  const novo = paraIA(v)
  if (novo !== v) n.nodeValue = novo
}
function trocarAtributos(el: Element) {
  for (const a of ATRIBUTOS) {
    const v = el.getAttribute(a)
    if (v && temRobo.test(v)) { const novo = paraIA(v); if (novo !== v) el.setAttribute(a, novo) }
  }
}
function varrer(raiz: Node) {
  if (raiz.nodeType === Node.TEXT_NODE) return trocarTexto(raiz as Text)
  if (raiz.nodeType !== Node.ELEMENT_NODE) return
  const el = raiz as Element
  if (PULAR.has(el.tagName)) return
  trocarAtributos(el)
  const andar = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  for (let n = andar.nextNode(); n; n = andar.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) trocarTexto(n as Text)
    else trocarAtributos(n as Element)
  }
}

/** Liga a troca na página inteira e no título da aba. Chamado uma vez, só na GlobalFly. */
export function ligarVocabularioIA() {
  const titulo = () => { if (temRobo.test(document.title)) document.title = paraIA(document.title) }
  const observador = new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      if (m.type === 'characterData') trocarTexto(m.target as Text)
      else if (m.type === 'attributes') { if (!pulaNo(m.target as Element)) trocarAtributos(m.target as Element) }
      else m.addedNodes.forEach(varrer)
    }
    titulo()
  })
  const comecar = () => {
    varrer(document.body); titulo()
    observador.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS })
    const cabeca = document.querySelector('title')
    if (cabeca) new MutationObserver(titulo).observe(cabeca, { childList: true, characterData: true, subtree: true })
  }
  if (document.body) comecar(); else document.addEventListener('DOMContentLoaded', comecar, { once: true })
}
