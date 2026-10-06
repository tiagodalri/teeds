/**
 * A pergunta tem de ir para a marca certa.
 *
 * O painel da master tem um seletor de plataforma, e um punhado de consultas o
 * segue de propósito — a Gestão de clientes muda de marca junto com ele. Mas
 * há telas que NÃO são do seletor: o monitoramento lê as sessões sempre de
 * `MARCA.id`, a marca do site, porque é a cabine daquela plataforma.
 *
 * Misturar as duas coisas foi o defeito de 06/10/2026: bastava deixar o seletor
 * em OMNI na Administração e abrir o monitoramento. As sessões vinham da Teeds
 * (certo), mas os nomes eram procurados entre os clientes da OMNI (errado) — e
 * como `user_id` de Teeds não existe na OMNI, a tela inteira virava "Sem nome".
 * O dado estava lá o tempo todo; a pergunta é que ia para a marca errada.
 *
 * O que estas provas seguram:
 *
 *  - `clientesPorId` COM marca ignora o seletor, sempre;
 *  - `clientesPorId` SEM marca continua seguindo o seletor, que é o que as
 *    telas do painel esperam — consertar um lado quebrando o outro não é
 *    conserto;
 *  - o monitoramento passa a marca, e por isso não depende do seletor.
 *
 *   npm run escopo
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
const leia = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

console.log('\nESCOPO DE MARCA · A PERGUNTA VAI PARA A MARCA CERTA\n')

/* ------------------------------------------------- a consulta aceita marca */

const clientes = leia('src/core/teeds/clientes.ts')

// A assinatura precisa aceitar a marca; sem isso quem chama não tem como fixar.
conferir('clientesPorId aceita uma marca explícita',
  /export async function clientesPorId\([^)]*marca\?: string\)/.test(clientes), true)

// E tem de usá-la: aceitar o parâmetro e ignorar seria pior que não ter.
const corpo = clientes.slice(clientes.indexOf('export async function clientesPorId'))
  .slice(0, 900)
conferir('e usa a marca no lugar do filtro do seletor',
  /marca \? `marca=eq\.\$\{marca\}` : filtroMarca\(\)/.test(corpo), true)

/* ---------------------------------------- o monitoramento não usa o seletor */

const monitorPainel = leia('src/components/MonitoramentoPanel.tsx')
const monitorCore = leia('src/core/teeds/monitoramento.ts')

// O par que precisa combinar: sessões e nomes na MESMA marca. Hoje os dois
// saem da variável `marca` do painel — o seletor. Antes as sessões vinham de
// `MARCA.id` e os nomes do seletor, e era isso que apagava os nomes.
conferir('o monitoramento busca os nomes no mesmo escopo das sessões',
  /clientesPorId\(sessao, novos, naRede \? undefined : marcaFoco\)/.test(monitorPainel), true)
conferir('e as sessões encerradas na mesma variável',
  /listarEncerradas\(sessao, undefined, undefined, aborto\.signal, marca\)/.test(monitorPainel), true)
conferir('e as cabines ao vivo também',
  /listarEspelhos\(sessao, horas, undefined, marca\)/.test(monitorPainel), true)

// O filtro do realtime é de igualdade, então a Rede vira uma assinatura por
// marca em cada tabela. Escutar menos marcas do que a tela mostra faria os
// cartões de uma plataforma congelarem sem ninguém perceber.
conferir('o tempo real abre uma assinatura por marca',
  /tabelas: marcas\.flatMap\(\(m\) => \[/.test(monitorPainel), true)
conferir('e as três tabelas escutam a marca do laço',
  (monitorPainel.match(/filtro: `marca=eq\.\$\{m\}`/g) ?? []).length, 3)

// Na Rede as consultas pedem as duas marcas, e cada cartão diz de onde veio.
conferir('a Rede consulta a lista de marcas',
  /const marca: string\[\] \| string = naRede \? marcas : marcaFoco/.test(monitorPainel), true)
conferir('o cartão mostra a plataforma quando está na Rede',
  /mostrarMarca=\{naRede\}/.test(monitorPainel), true)
conferir('e a tag sai com a marca da própria sessão',
  /mon-selo plataforma \$\{s\.marca\}/.test(monitorPainel), true)
// O registro de auditoria é de UMA marca: na Rede não pode virar lista.
conferir('a auditoria grava uma marca só',
  /const marcaDoRegistro = naRede \? MARCA\.id : marcaFoco/.test(monitorPainel), true)

// O núcleo não pode voltar a fixar a marca: ela é parâmetro.
conferir('as consultas do núcleo usam a marca recebida',
  /marca=eq\.\$\{MARCA\.id\}/.test(monitorCore), false)
conferir('e aceitam uma marca ou várias',
  /marca=in\.\(\$\{l\.join\(','\)\}\)/.test(monitorCore), true)
// A sessão encerrada precisa dizer de qual marca é, senão a tag não tem fonte.
conferir('a sessão encerrada carrega a marca',
  /sessoes_robos\?select=id,sessao_ref,marca,user_id/.test(monitorCore), true)
conferir('e o núcleo não chama nada que siga o seletor sozinho',
  /filtroMarca|marcasEmFoco|marcaAdmin\(\)|vendoARede/.test(monitorCore), false)

/* ---------------------------- trocar de marca não pode deixar sobra na tela */

/*
  TERCEIRO DEFEITO DA MESMA FAMÍLIA, 06/10/2026.

  Com o seletor em OMNI, o monitoramento mostrava sessões da TEEDS. A marca
  estava sendo usada dentro de `garantirClientes`, `receber`, `carregarTudo` e
  do efeito de replay, mas não aparecia em NENHUMA lista de dependências: as
  funções continuavam com a marca antiga presa na closure, e os caches em `ref`
  (clientes já pedidos, fotos já pedidas) sobreviviam à troca.

  O painel de Administração já tinha aprendido isso em 30/09, quando os
  depósitos da OMNI apareceram na Teeds, e resolveu com `key`: a tela renasce e
  não sobra estado nenhum. Aqui vale a mesma receita, e as duas travas juntas —
  `key` para não sobrar estado, dependências certas para a consulta nova sair
  com a marca certa.
*/
const app = leia('src/App.tsx')
conferir('o monitoramento renasce quando a marca muda',
  /<MonitoramentoPanel key=\{marcaEmFoco\}/.test(app), true)
conferir('os Insights também',
  /<InsightsPanel key=\{marcaEmFoco\}/.test(app), true)

// A marca TEM de estar nas dependências de tudo que a usa, senão a função
// continua com a marca antiga mesmo depois da troca.
for (const [nome, re_] of [
  ['busca de clientes', /\}, \[sessao, naRede, marcaFoco\]\)/],
  ['recebimento de mensagens', /\}, \[sessao, marca, garantirClientes\]\)/],
  ['carga completa', /\}, \[sessao, marca, periodo, receber, garantirClientes, falhar\]\)/],
  ['replay e auditoria', /\}, \[aba, sessao, marca, garantirClientes, falhar\]\)/],
] as Array<[string, RegExp]>) {
  conferir(`a marca está nas dependências: ${nome}`, re_.test(monitorPainel), true)
}

/* ------------------------------------------- o foco é um só, nas três telas */

const foco = leia('src/core/teeds/marcaEmFoco.ts')
conferir('o foco de marca é compartilhado por um store externo',
  /useSyncExternalStore\(assinar, marcaAdmin/.test(foco), true)

const insights = leia('src/components/InsightsPanel.tsx')
conferir('os Insights mostram o seletor', /SeletorDePlataforma/.test(insights), true)
conferir('e recarregam quando a marca muda',
  /\[sessao\.usuario\.id, periodo, marcaFoco\]/.test(insights), true)
conferir('o monitoramento mostra o seletor', /SeletorDePlataforma/.test(monitorPainel), true)

const painelFoco = leia('src/components/AdminPanel.tsx')
conferir('e a Administração usa o mesmo foco, não uma cópia',
  /const \[marcaFoco, trocarMarcaFoco\] = useMarcaEmFoco\(\)/.test(painelFoco), true)

/* --------------------------------- o painel continua seguindo o seletor */

const painel = leia('src/components/AdminPanel.tsx')
// A Gestão de clientes TEM de mudar junto com o seletor: ali a chamada é sem
// marca, de propósito.
conferir('o painel segue chamando sem marca (acompanha o seletor)',
  /clientesPorId\(sessao, sete\.map\(\(\[id\]\) => id\)\)/.test(painel), true)

/* ---------------------------- a aprovação, que foi o defeito da mesma família */

const pendentes = leia('src/components/AdminPendentes.tsx')
conferir('a aprovação recebe a marca por prop', /marca:string/.test(pendentes), true)
conferir('e manda a marca na chamada', /marca=\$\{encodeURIComponent\(marca\)\}/.test(pendentes), true)
conferir('a aprovação refaz a busca quando a marca muda',
  /\},\[sessao\.token,marca,status,pagina,versao,revisao\]\)/.test(pendentes), true)

console.log(`\n${passou} certos, ${falhou} errados`)
process.exit(falhou ? 1 : 0)
