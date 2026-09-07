#!/usr/bin/env bash
#
# Guarda os dois segredos do envio de e-mail, sem mostrar nada na tela.
#
#   RESEND_CHAVE          — paga e autoriza o envio. Se vazar, alguem manda
#                           e-mail em nome das suas marcas.
#   GANCHO_EMAIL_SEGREDO  — e o que prova que o aviso veio mesmo do Supabase.
#                           Se vazar, qualquer um manda o servidor disparar
#                           e-mail com o seu remetente.
#
# Os dois moram so aqui: entram por este script, ficam num arquivo com
# permissao 600, e nunca aparecem no navegador nem no repositorio.
#
# Como o chave-ia.sh, este NAO reescreve o .env inteiro: troca so as linhas
# desses dois. Perder o DERIV_TOKEN obrigaria a refazer o "Conectar Deriv".
#
# Pode rodar so para um dos dois: e so teclar Enter no que voce ainda nao tem.
set -euo pipefail
cd "$(dirname "$0")"

trocar() { # nome_da_variavel valor
  grep -v "^$1=" .env 2>/dev/null > .env.novo || true
  printf '%s=%s\n' "$1" "$2" >> .env.novo
  mv .env.novo .env
  chmod 600 .env
}

touch .env; chmod 600 .env
MEXEU=0

printf 'Nada aparece na tela enquanto voce cola — e proposital.\n\n'

printf '1) Chave do Resend (re_...). Enter para pular.\n'
read -rsp '   chave: ' CHAVE
printf '\n'
if [ -n "${CHAVE}" ]; then
  case "${CHAVE}" in
    re_*) trocar RESEND_CHAVE "${CHAVE}"; MEXEU=1; printf '   guardada.\n' ;;
    bash*|node*|cd\ *|git*|npm*)
      printf '   Isso parece um comando, nao uma chave. Acontece quando algo\n'
      printf '   sobrescreve a area de transferencia entre copiar e colar.\n'; exit 1 ;;
    *)
      printf '   A chave do Resend comeca com re_ — o que foi colado nao comeca.\n'; exit 1 ;;
  esac
else
  printf '   pulada.\n'
fi
unset CHAVE

printf '\n2) Segredo do gancho do Supabase (v1,whsec_...). Enter para pular.\n'
read -rsp '   segredo: ' SEGREDO
printf '\n'
if [ -n "${SEGREDO}" ]; then
  case "${SEGREDO}" in
    v1,whsec_*|whsec_*) trocar GANCHO_EMAIL_SEGREDO "${SEGREDO}"; MEXEU=1; printf '   guardado.\n' ;;
    *)
      printf '   O segredo do gancho comeca com v1,whsec_ — o que foi colado nao comeca.\n'; exit 1 ;;
  esac
else
  printf '   pulado.\n'
fi
unset SEGREDO

if [ "${MEXEU}" = "0" ]; then
  printf '\nNada foi colado. O .env nao foi tocado.\n'; exit 0
fi

printf '\nO .env agora tem:\n'
sed 's/=.*/= (guardado)/' .env | sed 's/^/  /'
printf '\nReinicie o servidor para ele enxergar:\n'
printf '  systemctl restart teeds-login\n'
