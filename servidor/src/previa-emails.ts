/**
 * Gera os e-mails em arquivo, para olhar antes de mandar para alguém.
 *
 *   cd servidor && npm run emails
 *
 * Escreve dez arquivos em previa-emails/ — cinco tipos, duas marcas — com
 * um link falso no lugar do verdadeiro. É a forma barata de conferir o que
 * o cliente vai receber sem precisar criar conta nem gastar envio.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MARCAS } from '../../src/marca/marcas'
import { montarEmail, type TipoDeEmail } from './emails'

const TIPOS: TipoDeEmail[] = ['confirmar', 'magico', 'senha', 'convite', 'trocar-email']
const PASTA = join(process.cwd(), '..', 'previa-emails')

mkdirSync(PASTA, { recursive: true })

const indice: string[] = []
for (const marca of Object.values(MARCAS)) {
  for (const tipo of TIPOS) {
    const falso = `${marca.redirectUri}#exemplo-de-link-de-confirmacao`
    const { assunto, html } = montarEmail(marca, tipo, falso)
    const arquivo = `${marca.id}-${tipo}.html`
    writeFileSync(join(PASTA, arquivo), html)
    indice.push(`${marca.nome.padEnd(6)} ${tipo.padEnd(14)} ${assunto}`)
  }
}

console.log(indice.join('\n'))
console.log(`\n${indice.length} arquivos em previa-emails/`)
