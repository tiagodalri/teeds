#!/bin/bash
# no servidor: um degrau de robôs (Deriv falsa + harness + medidor), depois resume
N=$1; D=${2:-90}; cd /root/carga
TELAS=$N node deriv-falsa.mjs > /dev/null 2>&1 & F=$!
sleep 1
NODE_TLS_REJECT_UNAUTHORIZED=0 ROBOS=$N DURACAO=$D node carga-robos.mjs > robos-$N.log 2>&1 & H=$!
sleep 1; ./medir-robos.sh > medidas-robos-$N.csv 2>/dev/null &
wait $H; sleep 1; kill $F 2>/dev/null
grep RESUMO robos-$N.log
# últimos 60 s (todos ligados)
tail -n 30 medidas-robos-$N.csv | awk -F, '{t+=$2;r+=$3;f+=$4;s+=$5;if($2>mx)mx=$2;if(mn==""||$6<mn)mn=$6;if($7>rs)rs=$7;n++} END {printf "CPU total %d%% (pico %d%%) · robôs %d%% · Deriv falsa %d%% · servidor real %d%% · memória livre mín %d MB · robôs usam %d MB\n", t/n, mx, r/n, f/n, s/n, mn, rs}'
