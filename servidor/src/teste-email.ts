/**
 * Manda um e-mail de verdade, de cada marca, para conferir.
 *
 *   cd /root/teeds/servidor && node dist/teste-email.mjs voce@seuemail.com
 *
 * Existe porque "o painel diz verificado" não é prova de nada: o domínio
 * pode estar verificado e o e-mail ainda cair no lixo eletrônico, chegar com
 * o logotipo quebrado ou com o remetente errado. A única prova é abrir a
 * caixa de entrada e ver.
 *
 * Manda o e-mail de confirmação de cadastro — o mais importante dos cinco,
 * porque é o primeiro que qualquer cliente novo recebe. O link dentro dele é
 * falso de propósito: é um teste, não um cadastro.
 */
import { MARCAS } from '../../src/marca/marcas'
import { montarEmail } from './emails'
import { readFileSync } from 'node:fs'

const para = process.argv[2]
if (!para || !para.includes('@')) {
  console.error('Diga para qual e-mail mandar:  node dist/teste-email.mjs voce@seuemail.com')
  process.exit(1)
}

// O .env fica ao lado do servidor, não da pasta dist.
const env: Record<string, string> = {}
for (const linha of readFileSync('/root/teeds/servidor/.env', 'utf8').split('\n')) {
  const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const chave = env.RESEND_CHAVE
if (!chave) {
  console.error('Falta a RESEND_CHAVE no .env.')
  process.exit(1)
}

for (const marca of Object.values(MARCAS)) {
  const remetente = marca.email.remetente
  if (!remetente) {
    console.error(`✕ ${marca.prosa}: sem remetente configurado — nao mandei.`)
    continue
  }
  const { assunto, html, texto } = montarEmail(
    marca, 'confirmar', `${marca.redirectUri}#este-link-e-so-um-teste`,
  )
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: remetente, to: [para], subject: `[teste] ${assunto}`, html, text: texto }),
  })
  if (r.ok) {
    console.log(`✓ ${marca.prosa.padEnd(6)} enviado de ${remetente}`)
  } else {
    console.error(`✕ ${marca.prosa.padEnd(6)} recusado (${r.status}): ${(await r.text()).slice(0, 200)}`)
  }
}
