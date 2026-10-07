#!/usr/bin/env bash
#
# Repescagem dos que nunca abriram: 200 a cada 30 minutos, sem pausa, até a
# fila acabar (Tiago, 07/10/2026, primeiro às 16h30 de Brasília).
#
#   cron:  0,30 * * * * /root/teeds/servidor/disparo-repescagem.sh
#
# A fila é um arquivo, um e-mail por linha. Cada rodada tira as 200 primeiras
# linhas e manda pelo carteiro de lista, que confere NA HORA quem pediu para
# sair, quem já se cadastrou e quem já recebeu esta campanha.
#
# FREIO: se uma rodada tiver mais de 20 falhas, o script desliga o próprio
# cron e para. Falha em massa quase sempre é limite da conta de envio ou
# chave revogada, e continuar só queimaria a fila (quem falha fica registrado
# como "já recebeu" e não seria tentado de novo).
#
# Quando a fila acaba, o script também tira a própria linha do cron.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
FILA="$AQUI/fila-repescagem.txt"
LOTE="$AQUI/.lote-repescagem.txt"
LINHA_CRON="disparo-repescagem.sh"
agora() { echo "[$(date -u +%FT%TZ) · $(TZ=America/Sao_Paulo date +%H:%M) SP]"; }
desligar() { crontab -l 2>/dev/null | grep -v "$LINHA_CRON" | crontab -; echo "$(agora) cron da repescagem DESLIGADO: $1"; }

exec 9>"$AQUI/.repescagem.lock"
flock -n 9 || { echo "$(agora) rodada anterior ainda em andamento, pulando"; exit 0; }

if [ ! -s "$FILA" ]; then desligar "fila vazia, campanha concluída"; exit 0; fi

head -n 200 "$FILA" > "$LOTE"
cd "$AQUI"
SAIDA="$(node dist/campanha-lista.mjs teeds enviar "@$LOTE" --modelo=repescagem 2>&1 || true)"
echo "$SAIDA" | grep -E "\[lista\]|✕" | sed "s/^/$(agora) /"

FALHAS="$(echo "$SAIDA" | sed -n 's/.*falhas \([0-9]*\).*/\1/p' | tail -1)"
if [ -z "$FALHAS" ]; then desligar "o carteiro não terminou (veja a saída acima)"; exit 1; fi
if [ "$FALHAS" -gt 20 ]; then desligar "$FALHAS falhas numa rodada só"; exit 1; fi

tail -n +201 "$FILA" > "$FILA.novo" && mv "$FILA.novo" "$FILA"
echo "$(agora) restam $(grep -c . "$FILA" || true) na fila"
