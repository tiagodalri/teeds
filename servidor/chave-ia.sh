#!/usr/bin/env bash
#
# Guarda a chave da Anthropic no servidor, sem mostrar nada na tela.
#
# Esta chave e a que paga o chat. Se ela vazar, quem pegou gasta na conta do
# Tiago ate alguem perceber. Por isso ela mora so aqui: entra por este
# script, fica num arquivo com permissao 600, e nunca aparece no navegador
# nem no repositorio.
#
# Como o chave.sh, este NAO reescreve o .env inteiro: troca so a linha dela.
# Perder o DERIV_TOKEN obrigaria a refazer o "Conectar Deriv".
#
set -euo pipefail
cd "$(dirname "$0")"

printf 'Cole a chave da Anthropic (sk-ant-...) e tecle Enter.\n'
printf 'Nada vai aparecer na tela enquanto voce cola — e proposital.\n\n'
read -rsp 'chave: ' CHAVE
printf '\n\n'

if [ -z "${CHAVE}" ]; then
  printf 'Nada foi colado. O .env nao foi tocado.\n'; exit 1
fi
case "${CHAVE}" in
  sk-ant-*) : ;;
  bash*|node*|cd\ *|git*|npm*)
    printf 'Isso parece um comando, nao uma chave.\n'
    printf 'Acontece quando algo sobrescreve a area de transferencia entre copiar e colar.\n'
    exit 1 ;;
  *)
    printf 'A chave da Anthropic comeca com sk-ant- — o que foi colado nao comeca.\n'
    exit 1 ;;
esac

touch .env; chmod 600 .env
grep -v '^ANTHROPIC_API_KEY=' .env 2>/dev/null > .env.novo || true
printf 'ANTHROPIC_API_KEY=%s\n' "${CHAVE}" >> .env.novo
mv .env.novo .env
chmod 600 .env
unset CHAVE

printf 'Guardada. O .env agora tem:\n'
sed 's/=.*/= (guardado)/' .env | sed 's/^/  /'
printf '\nReinicie o servidor para ele enxergar a chave:\n'
printf '  systemctl restart teeds-login\n'
