#!/usr/bin/env bash
#
# 50 e-mails da campanha por hora, ate a base terminar.
#
# Regra do Tiago (02/10/2026): dispara de hora em hora, PAUSA das 5h as 11h
# da manha e retoma depois. O servidor roda em UTC e o Brasil e UTC-3, entao
# a pausa aqui e das 08h as 14h UTC. A conta de converter fica neste arquivo
# e nao no cron: linha de cron nao aceita comentario no meio.
#
# Sai sem fazer nada quando esta na janela de pausa. O cron chama sempre; quem
# decide se e hora de mandar e este script, porque e aqui que da para explicar.
set -euo pipefail

HORA_UTC=$(date -u +%H)
HORA_BR=$(TZ=America/Sao_Paulo date +%H)

if [ "$HORA_UTC" -ge 8 ] && [ "$HORA_UTC" -lt 14 ]; then
  echo "[$(date -u +%FT%TZ)] pausa noturna do Brasil (${HORA_BR}h em Sao Paulo) — nada enviado"
  exit 0
fi

cd /root/teeds/servidor
echo "[$(date -u +%FT%TZ)] ${HORA_BR}h em Sao Paulo — enviando 50"
node dist/campanha-envio.mjs teeds 50 enviar todos
