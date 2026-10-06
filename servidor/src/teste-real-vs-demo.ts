/**
 * Dinheiro de verdade e dinheiro de demonstração nunca se somam.
 *
 * A tela "Resultados por cliente" tinha uma caixinha "Incluir contas de
 * demonstração", MARCADA por padrão, e somava os dois mundos na mesma cifra.
 * O resultado medido em 06/10/2026, nos 30 dias:
 *
 *      operações     685 reais   contra   31.741 de demonstração
 *      comissão      US$ 25,38   contra   US$ 23.522,07
 *
 * A tela anunciava "Comissão calculada: US$ 23.547,45". Dos quais US$ 25,38
 * existiam. Não era um filtro mal escolhido: é uma conta errada, porque US$ 1
 * de demonstração não vale US$ 1.
 *
 * O conserto foi estrutural, e é isso que estas provas seguram:
 *
 *  - a consulta devolve `real` e `demo` em campos separados, e NÃO existe um
 *    campo somado — sem ele, o erro não volta por descuido;
 *  - a tela abre em CONTA REAL, não em "tudo misturado";
 *  - nenhuma soma de dinheiro cruza os dois lados (contagem de operações pode,
 *    dinheiro não).
 *
 *   npm run realdemo
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
/* Sem comentários: o próprio comentário que explica o defeito cita o nome do
   campo antigo, e a prova acusaria a explicação como se fosse o código. */
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const clientes = leia('src/core/teeds/clientes.ts')
const tela = leia('src/components/RelatorioClientes.tsx')
const sql = leia('supabase/migracoes/20261006200000_teeds_relatorio_clientes_por_conta.sql')

console.log('\nREAL vs DEMO · OS DOIS MUNDOS NÃO SE SOMAM\n')

/* ------------------------------------------- a forma do dado já separa */

conferir('a linha do cliente tem os dois lados',
  /real: MedidasDaConta; demo: MedidasDaConta/.test(clientes), true)

// Os nomes do modelo antigo não podem reaparecer: eram justamente os campos
// que traziam real e demo já somados.
for (const campo of ['comissaoCalculada', 'operacoes:', 'resultado:'] as const) {
  const dentro = clientes.slice(clientes.indexOf('export interface LinhaClientePorConta'))
    .slice(0, clientes.slice(clientes.indexOf('export interface LinhaClientePorConta')).indexOf('}') + 1)
  conferir(`\`${campo}\` não voltou como campo somado na linha`, dentro.includes(campo), false)
}

/* ------------------------------------------------ o banco separa na raiz */

conferir('a função do banco devolve comissão separada',
  /comissao_real numeric, comissao_demo numeric/.test(sql), true)
conferir('e resultado separado', /resultado_real numeric, resultado_demo numeric/.test(sql), true)
// Um `sum()` sem `filter` seria uma coluna somada entrando de novo.
const somasSemFiltro = (sql.match(/sum\([a-z.]+\)(?!\s*filter)/g) ?? [])
  .filter((s) => !s.includes('--'))
conferir('nenhuma soma do banco mistura os dois lados', somasSemFiltro, [])
// A ordem decide quem sobrevive ao corte de 1000 linhas do PostgREST: tem de
// ser por dinheiro de verdade.
conferir('a lista é ordenada pela comissão real primeiro',
  /order by coalesce\(d\.comissao_real, 0\) desc/.test(sql), true)

/* ---------------------------------------------------- a tela não mistura */

conferir('a tela abre em conta real', /useState<Conta>\('real'\)/.test(tela), true)
conferir('e oferece as três escolhas explícitas',
  /\['real', 'Conta real'\], \['demo', 'Demonstração'\], \['ambas', 'Lado a lado'\]/.test(tela), true)
conferir('a caixinha "incluir demonstração" não existe mais',
  /comDemo|Incluir contas de demonstra/.test(semComentarios(tela)), false)

// A regra de ouro: nenhuma conta de DINHEIRO atravessa os dois lados.
// Contar operações dos dois lados é legítimo; somar reais, não.
const somasProibidas = ['comissao', 'resultado', 'entradas', 'pagamentos']
  .flatMap((campo) => tela.match(new RegExp(`real\\.${campo}\\s*\\+\\s*[a-z.]*demo\\.${campo}`, 'g')) ?? [])
conferir('nenhuma soma de dinheiro cruza real com demo', somasProibidas, [])

// O valor de demonstração sempre sai marcado — é a tarja que impede a leitura
// errada quando os dois aparecem juntos.
conferir('o valor de demonstração sai sempre rotulado',
  /rc-demo-val/.test(tela), true)
const css = leia('src/styles/app.css')
conferir('e a tarja escreve "demo" por CSS',
  /\.rc-demo-val::before\{content:'demo '/.test(css), true)

console.log(`\n${passou} certos, ${falhou} errados`)
process.exit(falhou ? 1 : 0)
