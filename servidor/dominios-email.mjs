/**
 * Registra os dominios das marcas no Resend e mostra o que por no DNS.
 *
 *   cd /root/teeds/servidor && node dominios-email.mjs
 *
 * Roda no servidor de proposito: a chave do Resend mora la, e assim ela nao
 * precisa passar por mais lugar nenhum.
 *
 * Rodar de novo nao duplica nada — se o dominio ja existir, ele so mostra os
 * registros outra vez e diz como esta a verificacao.
 *
 * Sobre a regiao: sa-east-1 e Sao Paulo. Nao e detalhe — e-mail que sai
 * daqui chega antes e tem menos chance de ser barrado por provedor
 * brasileiro do que um que atravessa o Atlantico duas vezes.
 */
import { readFileSync } from 'node:fs'

const REGIAO = 'sa-east-1'
const DOMINIOS = [
  { marca: 'Teeds', dominio: 'teedscompany.com' },
  { marca: 'OMNI', dominio: 'omnifinanc.com' },
]

const env = {}
for (const linha of readFileSync(new URL('.env', import.meta.url), 'utf8').split('\n')) {
  const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const chave = env.RESEND_CHAVE
if (!chave) {
  console.error('Falta a RESEND_CHAVE no .env. Rode ./segredos-email.sh primeiro.')
  process.exit(1)
}

const api = async (caminho, opcoes = {}) => {
  const r = await fetch(`https://api.resend.com${caminho}`, {
    ...opcoes,
    headers: { authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
  })
  const corpo = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, corpo }
}

const existentes = await api('/domains')
if (!existentes.ok) {
  console.error(`O Resend recusou a chave (${existentes.status}).`)
  console.error(JSON.stringify(existentes.corpo).slice(0, 300))
  process.exit(1)
}
const jaTem = new Map((existentes.corpo?.data ?? []).map((d) => [d.name, d]))

for (const { marca, dominio } of DOMINIOS) {
  let ficha = jaTem.get(dominio)

  if (!ficha) {
    const criado = await api('/domains', {
      method: 'POST',
      body: JSON.stringify({ name: dominio, region: REGIAO }),
    })
    if (!criado.ok) {
      console.error(`\n✕ ${marca} (${dominio}): nao consegui registrar — ${criado.status}`)
      console.error('  ' + JSON.stringify(criado.corpo).slice(0, 300))
      continue
    }
    ficha = criado.corpo
  }

  // A listagem nao traz os registros; a ficha individual traz.
  const detalhe = await api(`/domains/${ficha.id}`)
  const d = detalhe.ok ? detalhe.corpo : ficha
  const registros = d.records ?? []

  console.log(`\n${'='.repeat(70)}`)
  console.log(`${marca} · ${dominio} · situacao: ${d.status ?? '?'}`)
  console.log('='.repeat(70))
  if (!registros.length) {
    console.log('(sem registros para mostrar — o dominio pode ja estar verificado)')
    continue
  }
  for (const r of registros) {
    console.log('')
    console.log(`  Tipo   : ${r.type}`)
    console.log(`  Nome   : ${r.name === dominio ? '@' : String(r.name).replace(`.${dominio}`, '')}`)
    console.log(`  Valor  : ${r.value}`)
    if (r.priority != null) console.log(`  Prior. : ${r.priority}`)
    console.log(`  TTL    : 14400`)
  }
}

console.log(`\n${'='.repeat(70)}`)
console.log('Ponha esses registros no DNS de cada dominio, na Hostinger.')
console.log('Depois rode este script de novo: a situacao vira "verified".')
