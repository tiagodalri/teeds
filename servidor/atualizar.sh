#!/usr/bin/env bash
#
# Traz a versão nova do GitHub e coloca no ar.
#
# Existe pelo mesmo motivo do instalar.sh: o console web da DigitalOcean
# embaralha comando longo. Aqui tudo vira uma linha só, de qualquer pasta:
#
#   bash /root/teeds/servidor/atualizar.sh
#
# O `git pull` roda com a pasta do repositório descoberta a partir deste
# arquivo — não da pasta em que a pessoa está. Um `cd` esquecido não pode
# ser a diferença entre atualizar e não atualizar.
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$AQUI/.." && pwd)"

echo "== 1/3 baixando do GitHub =="
git -C "$REPO" fetch --quiet origin
git -C "$REPO" reset --hard --quiet origin/main
git -C "$REPO" log --oneline -1

echo "== 2/3 montando =="
cd "$AQUI"
npm install --no-audit --no-fund --silent
npm run build 2>&1 | tail -2

echo "== 3/3 reiniciando =="
# Um robô que estivesse operando morre aqui junto com o processo. A rede de
# segurança está em limparSessoesOrfas(): ao subir, o servidor marca como
# interrompida toda sessão que ficou "rodando" — senão a tela do cliente
# mostraria para sempre um robô que não existe mais.
systemctl restart teeds-login
sleep 2
systemctl is-active teeds-login
journalctl -u teeds-login -n 8 --no-pager
