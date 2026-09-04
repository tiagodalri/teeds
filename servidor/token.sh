#!/usr/bin/env bash
#
# Recebe a credencial da Deriv sem mostrar nada na tela.
#
# O console web da DigitalOcean ecoa tudo que se digita, e um token colado
# direto na linha de comando fica visivel no historico da sessao — foi assim
# que a senha do servidor vazou em 04/09. Aqui o `read -s` nao imprime nada.
#
# Aceita as duas formas, porque digitar o caminho certo no console do
# navegador e facil de errar (aconteceu: "acessToken" com um c so):
#   - o token puro
#   - o JSON inteiro que a Teeds guarda em localStorage['teeds.auth'],
#     de onde este script extrai o accessToken sozinho
#
set -euo pipefail
cd "$(dirname "$0")"

printf 'Cole a credencial da Deriv e tecle Enter.\n'
printf 'Nada vai aparecer na tela enquanto voce cola — e proposital.\n\n'
read -rsp 'credencial: ' BRUTO
printf '\n\n'

if [ -z "${BRUTO}" ]; then
  printf 'Nada foi colado. O .env nao foi tocado.\n'
  exit 1
fi

# Se veio o JSON da Teeds, pega o accessToken de dentro dele.
TOKEN=$(printf '%s' "${BRUTO}" | node -e '
  let s = ""
  process.stdin.on("data", (d) => { s += d })
  process.stdin.on("end", () => {
    s = s.trim()
    if (s.startsWith("{")) {
      try { process.stdout.write(String(JSON.parse(s).accessToken || "")) }
      catch { process.stdout.write("") }
    } else {
      process.stdout.write(s)
    }
  })
')
unset BRUTO

if [ -z "${TOKEN}" ]; then
  printf 'Nao achei nenhuma credencial no que foi colado.\n'
  printf 'Se colou o JSON da Teeds, ele pode estar sem o accessToken (sessao expirada).\n'
  exit 1
fi

if [ "${TOKEN}" = "undefined" ]; then
  printf 'Veio a palavra "undefined" em vez da credencial.\n'
  printf 'Isso acontece quando o comando no navegador tem erro de digitacao.\n'
  exit 1
fi

printf 'DERIV_TOKEN=%s\n' "${TOKEN}" > .env
chmod 600 .env
printf 'Guardado em %s/.env\n' "$(pwd)"
printf 'Credencial de %s caracteres · so o root le esse arquivo.\n' "${#TOKEN}"
unset TOKEN
