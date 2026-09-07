#!/usr/bin/env bash
#
# O e-mail de acesso, do zero ao "falta so o DNS", num comando so.
#
#   bash /root/teeds/servidor/configurar-email.sh
#
# Faz, em ordem: guarda a chave do Resend, cadastra os dois dominios das
# marcas e imprime os registros de DNS que faltam por na Hostinger.
#
# Existe porque a alternativa era o Tiago rodar tres comandos em ordem e
# lembrar de reiniciar o servidor no meio. Passo esquecido no meio de uma
# configuracao nao da erro — da comportamento estranho semanas depois.
#
# A chave e digitada AQUI, no servidor, e nunca sai daqui: nao passa pelo
# navegador, pela conversa com a IA nem pelo repositorio.
set -euo pipefail
cd "$(dirname "$0")"

printf '\n== 1/3 a chave do Resend ==\n\n'
printf 'Cole a chave (re_...) e tecle Enter.\n'
printf 'Nada aparece na tela enquanto voce cola — e proposital.\n\n'
read -rsp 'chave: ' CHAVE
printf '\n'

if [ -z "${CHAVE}" ]; then
  printf '\nNada foi colado. O .env nao foi tocado.\n'; exit 1
fi
case "${CHAVE}" in
  re_*) : ;;
  bash*|node*|cd\ *|git*|npm*)
    printf '\nIsso parece um comando, nao uma chave. Acontece quando algo\n'
    printf 'sobrescreve a area de transferencia entre copiar e colar.\n'; exit 1 ;;
  *)
    printf '\nA chave do Resend comeca com re_ — o que foi colado nao comeca.\n'; exit 1 ;;
esac

touch .env; chmod 600 .env
grep -v '^RESEND_CHAVE=' .env 2>/dev/null > .env.novo || true
printf 'RESEND_CHAVE=%s\n' "${CHAVE}" >> .env.novo
mv .env.novo .env
chmod 600 .env
unset CHAVE
printf 'guardada.\n'

printf '\n== 2/3 reiniciando o servidor ==\n'
systemctl restart teeds-login
sleep 2
systemctl is-active teeds-login

printf '\n== 3/3 cadastrando os dominios no Resend ==\n'
node dominios-email.mjs
