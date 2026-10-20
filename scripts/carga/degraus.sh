#!/bin/bash
# degraus de espectadores contra o LiveKit de produção, numa sala de teste
D=$(dirname "$0"); source "$D/chaves.env"
SSH="ssh -i $HOME/.ssh/teeds_servidor root@198.211.96.238"
for N in "$@"; do
  $SSH "nohup /root/medir.sh > /root/medidas-$N.csv 2>/dev/null & echo \$! > /root/medir.pid"
  "$D/lk" load-test --room teste-de-carga --video-publishers 1 --audio-publishers 1 --subscribers $N \
    --video-resolution high --num-per-second 15 --duration 75s --identity-prefix carga$N > "$D/lk-$N.txt" 2>&1
  $SSH 'kill $(cat /root/medir.pid) 2>/dev/null'
  # média dos últimos 40 s (todos já conectados)
  echo "== $N espectadores: $($SSH "tail -n 20 /root/medidas-$N.csv | awk -F, '{c+=\$2;m+=\$3;l+=\$4;s+=\$6;if(\$2>mx)mx=\$2;if(\$5<mn||mn==\"\")mn=\$5;n++} END {printf \"CPU total %d%% (pico %d%%) · motor %d%% · LiveKit %d%% · saída %d Mbps · memória livre mín %d MB\", c/n, mx, m/n, l/n, s/n, mn}'")"
  grep -iE "total|summary|packet|loss|latency|jitter|subscribed|connected|error" "$D/lk-$N.txt" | tail -8
  sleep 8
done
