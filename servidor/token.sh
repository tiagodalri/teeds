#!/usr/bin/env bash
#
# Recebe o token da Deriv sem mostrar nada na tela.
#
# O console web da DigitalOcean ecoa tudo que se digita, e um token colado
# direto na linha de comando fica visivel no historico da sessao — foi assim
# que a senha do servidor vazou em 04/09. Aqui o `read -s` nao imprime nada:
# voce cola, tecla Enter, e o valor vai direto para o .env com permissao 600.
#
set -euo pipefail
cd "$(dirname "$0")"

printf 'Cole o token da Deriv e tecle Enter.\n'
printf 'Nada vai aparecer na tela enquanto voce cola — e proposital.\n\n'
read -rsp 'token: ' TOKEN
printf '\n\n'

if [ -z "${TOKEN}" ]; then
  printf 'Nada foi colado. O .env nao foi tocado.\n'
  exit 1
fi

printf 'DERIV_TOKEN=%s\n' "${TOKEN}" > .env
chmod 600 .env
unset TOKEN

printf 'Guardado em %s/.env\n' "$(pwd)"
printf 'Tamanho: %s caracteres · so o root le esse arquivo.\n' "$(( $(wc -c < .env) - 13 ))"
