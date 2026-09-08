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

# Reiniciar mata todo robo que estiver operando. Entao antes de reiniciar
# pergunta ao banco se ha sessao rodando — e se houver, para aqui. Quem tiver
# certeza de que pode derrubar (manutencao combinada) passa FORCAR=1.
if [ "${FORCAR:-0}" != "1" ] && [ -f "$AQUI/.env" ]; then
  SB_URL="$(grep -E '^SUPABASE_URL=' "$AQUI/.env" | cut -d= -f2-)"
  SB_KEY="$(grep -E '^(SUPABASE_SECRET|SUPABASE_SERVICE_ROLE_KEY)=' "$AQUI/.env" | head -1 | cut -d= -f2-)"
  # Aceita .env com ou sem aspas, sem depender de uma expressão de shell
  # difícil de transportar entre o Bash do Mac e o Bash do servidor.
  SB_URL="${SB_URL%\"}"; SB_URL="${SB_URL#\"}"
  SB_URL="${SB_URL%\'}"; SB_URL="${SB_URL#\'}"
  SB_KEY="${SB_KEY%\"}"; SB_KEY="${SB_KEY#\"}"
  SB_KEY="${SB_KEY%\'}"; SB_KEY="${SB_KEY#\'}"
  if [ -n "$SB_URL" ] && [ -n "$SB_KEY" ]; then
    # `grep` devolve erro quando encontra zero linhas; com `pipefail`, isso
    # abortava justamente no caso seguro (nenhum robô rodando). O awk conta
    # zero sem transformar ausência de sessão em falha do publicador.
    RODANDO="$(curl -s "$SB_URL/rest/v1/sessoes_robos?situacao=eq.rodando&select=id" -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" | awk -F'"id"' '{ total += NF - 1 } END { print total + 0 }')"
    if [ "${RODANDO:-0}" -gt 0 ]; then
      echo "!! Ha $RODANDO robo(s) operando agora. Reiniciar derrubaria todos."
      echo "   O codigo novo ja esta baixado e montado; reinicie quando nao houver sessao:"
      echo "     systemctl restart teeds-login"
      echo "   Ou, se for manutencao combinada:  FORCAR=1 bash $AQUI/atualizar.sh"
      exit 2
    fi
  fi
fi
echo "== 3/3 reiniciando =="
# Um robô que estivesse operando morre aqui junto com o processo. A rede de
# segurança está em limparSessoesOrfas(): ao subir, o servidor marca como
# interrompida toda sessão que ficou "rodando" — senão a tela do cliente
# mostraria para sempre um robô que não existe mais.
systemctl restart teeds-login
sleep 2
systemctl is-active teeds-login
journalctl -u teeds-login -n 8 --no-pager
