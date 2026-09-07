#!/usr/bin/env bash
#
# Traz o historico de estrutura do banco para dentro do repositorio.
#
#   ./scripts/exportar-banco.sh
#
# Toda mudanca de estrutura (tabela nova, permissao, correcao) fica guardada
# so dentro do Supabase. Este script tira uma copia fiel dela e grava em
# supabase/migracoes/, para o backup viajar junto com o codigo no GitHub.
#
# A chave do banco NUNCA passa por aqui: quem le o .env e o proprio servidor,
# que roda o export la dentro e devolve so os arquivos .sql.
#
# Rode depois de qualquer mudanca no banco, e faca commit do que mudar.
set -euo pipefail

SERVIDOR="root@198.211.96.238"
CHAVE="$HOME/.ssh/teeds_servidor"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINO="$AQUI/supabase/migracoes"

echo "→ pedindo o historico ao servidor…"
ssh -i "$CHAVE" "$SERVIDOR" 'bash -s' <<'REMOTO'
set -euo pipefail
cat > /tmp/exportar-migracoes.mjs <<'JS'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const env = {}
for (const linha of readFileSync('/root/teeds/servidor/.env', 'utf8').split('\n')) {
  const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const url = (env.SUPABASE_URL || '').replace(/\/+$/, '')
const chave = env.SUPABASE_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !chave) { console.error('faltou SUPABASE_URL ou a chave no .env'); process.exit(1) }

const r = await fetch(url + '/rest/v1/rpc/teeds_exportar_migracoes', {
  method: 'POST',
  headers: { apikey: chave, authorization: 'Bearer ' + chave, 'content-type': 'application/json' },
  body: '{}',
})
if (!r.ok) { console.error('o banco recusou:', r.status, (await r.text()).slice(0, 300)); process.exit(1) }

const linhas = await r.json()
rmSync('/tmp/migracoes', { recursive: true, force: true })
mkdirSync('/tmp/migracoes', { recursive: true })
for (const l of linhas) {
  writeFileSync(join('/tmp/migracoes', `${l.version}_${l.name}.sql`), l.sql.replace(/\s*$/, '') + '\n')
}
console.log(`   ${linhas.length} arquivos prontos no servidor`)
JS
node /tmp/exportar-migracoes.mjs
REMOTO

echo "→ trazendo os arquivos…"
mkdir -p "$DESTINO"
rm -f "$DESTINO"/*.sql
scp -q -i "$CHAVE" "$SERVIDOR:/tmp/migracoes/*.sql" "$DESTINO/"
ssh -i "$CHAVE" "$SERVIDOR" 'rm -rf /tmp/migracoes /tmp/exportar-migracoes.mjs'

echo "→ pronto: $(ls -1 "$DESTINO"/*.sql | wc -l | tr -d ' ') arquivos em supabase/migracoes/"
echo "  agora faca commit do que mudou."
