#!/usr/bin/env bash
# Teste de carga no banco, antes x depois do rádio (13–14/11/2026). Roda no servidor, sozinho:
#   nohup setsid bash /root/carga-banco/noite-radio.sh > /root/carga-banco/noite.log 2>&1 < /dev/null &
# 1. espera o reinício do servidor com o rádio (reinicio-livre.sh) terminar;
# 2. espera uma janela SEM nenhum robô de cliente (duas leituras, 30 s);
# 3. rodada A: as 3 tabelas do espelho NA releitura do Realtime (como era);
# 4. rodada B: FORA da releitura (como fica com o rádio);
# 5. estado final: fora, SÓ se existir /root/carga-banco/radio-ok (rádio conferido numa tela de verdade);
#    senão volta para dentro, como estava.
# Desiste às 07:00 de Brasília (10:00 UTC) se não achar janela.
cd /root/carga-banco
set -a; . /root/teeds/servidor/.env; . ./carga.env; set +a   # carga.env: TESTE_USER e SUPABASE_ANON
K="${SUPABASE_SECRET:-$SUPABASE_SERVICE_ROLE_KEY}"
rpc() { curl -s -m 30 -X POST "$SUPABASE_URL/rest/v1/rpc/$1" -H "apikey: $K" -H "Authorization: Bearer $K" -H 'Content-Type: application/json' --data "$2"; }
rodando() {
  local r; r="$(curl -s -m 15 "$SUPABASE_URL/rest/v1/sessoes_robos?situacao=eq.rodando&select=id" -H "apikey: $K" -H "Authorization: Bearer $K")" || { echo erro; return; }
  case "$r" in \[*) echo "$r" | awk -F'"id"' '{ t += NF - 1 } END { print t + 0 }';; *) echo erro;; esac
}
livre() { [ "$(rodando)" = 0 ] && sleep 30 && [ "$(rodando)" = 0 ]; }
limite=$(date -u -d 'tomorrow 10:00' +%s); [ "$(date -u +%H)" -lt 10 ] && limite=$(date -u -d 'today 10:00' +%s)
log() { echo "$(date -u +%FT%TZ) $*"; }

while pgrep -f reinicio-livre.sh >/dev/null; do sleep 60; done
log "servidor: $(systemctl is-active teeds-login) desde $(systemctl show teeds-login -p ActiveEnterTimestamp --value)"
until livre; do
  [ "$(date +%s)" -gt "$limite" ] && { log "sem janela livre até 07:00 de Brasília: desisti, nada testado"; exit 0; }
  sleep 120
done
log "janela livre: começando"
TELAS=60 node deriv-falsa.mjs > falsa.log 2>&1 & F=$!
sleep 2
rodada() {  # nome, ligar(true/false)
  log "releitura do espelho: $(rpc teeds_carga_releitura_do_espelho "{\"p_ligar\":$2}")"
  sleep 20
  TESTE_USER="$TESTE_USER" ROBOS=50 PLAYS=50 TELAS=20 AQUECER=90 RODADA="$1" node carga-banco.mjs 2>&1 | grep -v '^\s*$'
  sleep 30
}
rodada A-releitura-ligada true
rodada B-releitura-desligada false
kill $F 2>/dev/null
if [ -f radio-ok ]; then log "rádio conferido: a releitura do espelho FICA desligada"
else log "rádio ainda não conferido numa tela: religando a releitura ($(rpc teeds_carga_releitura_do_espelho '{"p_ligar":true}'))"; fi
log "fim"
