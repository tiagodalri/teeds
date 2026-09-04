#!/usr/bin/env bash
#
# Guarda a chave secreta do Supabase sem mostrar nada na tela.
#
# Diferente do token.sh, este NAO reescreve o .env inteiro: ele troca (ou
# acrescenta) so a linha da chave. O DERIV_TOKEN que o login gravou continua
# onde esta — perder ele obrigaria a refazer o "Conectar Deriv".
#
set -euo pipefail
cd "$(dirname "$0")"

URL_PADRAO="https://wonxykovfvfnuhzpqsle.supabase.co"

printf 'Cole a chave secreta do Supabase (sb_secret_...) e tecle Enter.\n'
printf 'Nada vai aparecer na tela enquanto voce cola — e proposital.\n\n'
read -rsp 'chave: ' CHAVE
printf '\n\n'

if [ -z "${CHAVE}" ]; then
  printf 'Nada foi colado. O .env nao foi tocado.\n'; exit 1
fi
case "${CHAVE}" in
  sb_secret_*) : ;;
  bash*|node*|cd\ *|git*)
    printf 'Isso parece um comando, nao uma chave.\n'
    printf 'Acontece quando algo sobrescreve a area de transferencia entre copiar e colar.\n'
    exit 1 ;;
  *)
    printf 'A chave do Supabase comeca com sb_secret_ — o que foi colado nao comeca.\n'
    printf 'Se voce colou a chave publica (anon), ela nao serve: o servidor precisa escrever.\n'
    exit 1 ;;
esac

touch .env; chmod 600 .env
# tira as linhas antigas destas duas chaves, mantendo o resto do arquivo
grep -v '^SUPABASE_SECRET=' .env 2>/dev/null | grep -v '^SUPABASE_URL=' > .env.novo || true
printf 'SUPABASE_URL=%s\n' "${URL_PADRAO}" >> .env.novo
printf 'SUPABASE_SECRET=%s\n' "${CHAVE}" >> .env.novo
mv .env.novo .env
chmod 600 .env
unset CHAVE

printf 'Guardado. O .env agora tem:\n'
sed 's/=.*/= (guardado)/' .env | sed 's/^/  /'
printf '\nReinicie o servidor para ele enxergar a chave:\n'
printf '  systemctl restart teeds-login\n'
