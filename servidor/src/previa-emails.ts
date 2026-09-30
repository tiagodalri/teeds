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
import { emailDeCadastro, emailDeAprovacao } from './aprovacao-leads'

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

  /*
    Os dois do fluxo de cadastro (30/09/2026). Não são modelos genéricos: o
    texto vem das MESMAS funções que o carteiro usa para enviar de verdade,
    para a prévia nunca virar uma segunda versão do texto.
  */
  const exemplo = 'maria.souza@email.com'
  for (const [nome, pronto] of [
    ['cadastro', emailDeCadastro(marca, exemplo)],
    ['aprovado', emailDeAprovacao(marca, exemplo, true)],
    ['aprovado-com-senha-propria', emailDeAprovacao(marca, exemplo, false)],
  ] as const) {
    writeFileSync(join(PASTA, `${marca.id}-${nome}.html`), pronto.html)
    indice.push(`${marca.nome.padEnd(6)} ${nome.padEnd(14)} ${pronto.assunto}`)
  }
}

/*
  A página de conferência: os mesmos e-mails, as duas marcas lado a lado.
  Existia um `lado-a-lado.html` escrito à mão que ninguém regerava — e um
  mockup que não acompanha o código vira mentira. Agora sai daqui.
*/
const FLUXO: Array<{ arquivo: string; nome: string; quando: string }> = [
  { arquivo: 'cadastro', nome: '1 · Cadastro recebido', quando: 'Sai na hora em que a pessoa se cadastra, com a senha provisória.' },
  { arquivo: 'aprovado', nome: '2 · Cadastro aprovado', quando: 'Sai quando o admin aprova. Esta é a versão de quem ainda não trocou a senha.' },
  { arquivo: 'aprovado-com-senha-propria', nome: '2b · Aprovado, senha já trocada', quando: 'A mesma aprovação, para quem já tinha conta e senha própria. Nenhuma senha é repetida.' },
  { arquivo: 'senha', nome: '3 · Redefinir a senha', quando: 'O link pedido pelo perfil, ou pelo “esqueci a senha”.' },
]
const marcas = Object.values(MARCAS)
const painel = (f: typeof FLUXO[number]) => `
  <section>
    <h2>${f.nome}</h2>
    <p>${f.quando}</p>
    <div class="par">
      ${marcas.map((m) => `<figure><figcaption>${m.nome}</figcaption><iframe src="${m.id}-${f.arquivo}.html" title="${m.nome} — ${f.nome}"></iframe></figure>`).join('')}
    </div>
  </section>`

writeFileSync(join(PASTA, 'lado-a-lado.html'), `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>E-mails do cadastro</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; padding:32px 20px 64px; background:#f4f1ec; color:#1a2233;
         font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
  header { max-width:1120px; margin:0 auto 34px; }
  header h1 { margin:0 0 6px; font-size:26px; letter-spacing:-.02em; }
  header p { margin:0; max-width:70ch; color:#5b6678; }
  section { max-width:1120px; margin:0 auto 42px; }
  section h2 { margin:0 0 4px; font-size:17px; }
  section > p { margin:0 0 14px; max-width:78ch; font-size:13.5px; color:#5b6678; }
  .par { display:grid; grid-template-columns:repeat(auto-fit,minmax(330px,1fr)); gap:18px; }
  figure { margin:0; }
  figcaption { margin-bottom:7px; font-size:10px; font-weight:700; letter-spacing:.12em;
               text-transform:uppercase; color:#7a8699; }
  iframe { width:100%; height:760px; border:1px solid #ddd6cc; border-radius:14px; background:#fff; }
</style></head><body>
<header>
  <h1>Os e-mails do cadastro</h1>
  <p>Gerados pelo mesmo código que envia de verdade (<code>npm run emails</code>). O que estiver
     errado aqui está errado na caixa de entrada do cliente. Endereço de exemplo:
     maria.souza@email.com.</p>
</header>
${FLUXO.map(painel).join('')}
</body></html>`)

console.log(indice.join('\n'))
console.log(`\n${indice.length} arquivos em previa-emails/ · abra lado-a-lado.html`)
